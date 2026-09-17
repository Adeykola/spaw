/**
 * send-email — the email each visitor gets after sending a form on the site.
 *
 *   POST { kind, id }   kind: "registrations" | "applications" | "enquiries" | "subscribers"
 *                       id: the reference the database gave it (the address, for subscribers)
 *   GET  ?qr=REG-…      a ticket's QR code as a PNG, for the ticket email
 *
 * The website calls it straight after the database has saved a form. It
 * reads the saved row itself (never what the browser says), sends each one
 * email at most (emailed_at), and only for something sent in the last few
 * hours, so it can't be used to write to anyone else or about anything old.
 *
 *   Event registration  its ticket: the QR code, the event's details and a
 *                       link to the ticket page to download it; or, for an
 *                       event set not to send tickets, a confirmation
 *   Talent Quest        "application received", what happens next, and the
 *                       travel disclaimer
 *   Contact / booking   "we've got your message / booking request"
 *   Newsletter          a welcome
 * Every one points to the WhatsApp channel.
 *
 * Settings (Supabase → Edge Functions → Secrets), see supabase/README.md:
 *   RESEND_API_KEY   from resend.com, with dr-ajokesings.com verified there
 *   MAIL_FROM        Dr AjokeSings <hello@dr-ajokesings.com>
 *   MAIL_REPLY_TO    hello@dr-ajokesings.com (optional)
 *   SITE_URL         https://dr-ajokesings.com
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 * Deploy with "Verify JWT" switched off, so email apps can load the QR code.
 */

const WHATSAPP = "https://whatsapp.com/channel/0029Vb65h9vDTkJvUfOFSx1e";
const DISCLAIMER = "Disclaimer: Contestants are responsible for their logistics to and from the event. DrAjokesings Productions Limited bears no responsibility for transportation or related costs.";
const KEY_OF: Record<string, string> = { registrations: "id", applications: "id", enquiries: "id", subscribers: "email" };
const SENT_AT: Record<string, string> = { registrations: "registered_at", applications: "submitted_at", enquiries: "submitted_at", subscribers: "subscribed_at" };
const MAX_AGE = 6 * 3600e3;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Row = Record<string, any>;
type Content = { events?: Row[]; symphony?: Row };
type Settings = { url: string; serviceKey: string; resendKey: string; from: string; replyTo: string; site: string; functionUrl: string };
type Email = { subject: string; html: string; text: string };
type Block = { html: string; text: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------------------------------------------------------------------------
 * Words
 * ------------------------------------------------------------------------- */
export function esc(s: unknown): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s ?? "").replace(/[&<>"']/g, (c) => map[c]);
}
const firstName = (n: unknown) => String(n || "").trim().split(/\s+/)[0] || "there";
const clean = (s: unknown, max = 300) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
function longDate(d: unknown): string {
  const s = String(d || "");
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return "";
  return new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// The event as published from the admin; the Symphony concert's own details
// when the events list hasn't been published yet.
export function findEvent(id: string, content: Content): Row | null {
  const list = Array.isArray(content.events) ? content.events : [];
  const found = list.find((e) => e && e.id === id);
  if (found) return found;
  const c = content.symphony && content.symphony.concert;
  if (c && c.eventId === id) {
    return { id, name: c.name, date: c.date, time: c.start || null, venue: c.venue, city: c.city, admission: "free", price: c.admission, ticketRequired: true };
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * The pieces every email is made of (HTML for email apps, and plain text)
 * ------------------------------------------------------------------------- */
const FONT = "Arial,Helvetica,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const para = (text: string): Block => ({
  html: `<p style="margin:0 0 16px;">${esc(text)}</p>`,
  text,
});
const small = (text: string): Block => ({
  html: `<p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#6b6459;">${esc(text)}</p>`,
  text,
});
const heading = (text: string): Block => ({
  html: `<p style="margin:28px 0 10px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#a9895a;">${esc(text)}</p>`,
  text: `\n${text.toUpperCase()}`,
});
function facts(rows: Array<[string, unknown]>): Block {
  const shown = rows.filter(([, v]) => clean(v));
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-top:1px solid #e6ddd0;">${shown.map(([k, v]) =>
      `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #e6ddd0;font-family:${FONT};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a9895a;vertical-align:top;width:34%;">${esc(k)}</td>` +
      `<td style="padding:10px 0;border-bottom:1px solid #e6ddd0;font-family:${FONT};font-size:15px;color:#0a0908;vertical-align:top;">${esc(clean(v))}</td></tr>`).join("")}</table>`,
    text: shown.map(([k, v]) => `${k}: ${clean(v)}`).join("\n"),
  };
}
function button(href: string, label: string, colour = "#a91d2c"): Block {
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:${colour};border-radius:2px;">` +
      `<a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(label)}</a></td></tr></table>`,
    text: `${label}: ${href}`,
  };
}
function quote(text: string): Block {
  const body = String(text || "").slice(0, 800);
  return {
    html: `<div style="margin:0 0 20px;padding:14px 18px;border-left:3px solid #a9895a;background:#faf7f2;font-size:14px;line-height:1.6;color:#3b3530;">${esc(body).replace(/\r?\n/g, "<br>")}</div>`,
    text: body.split(/\r?\n/).map((l) => `> ${l}`).join("\n"),
  };
}
function ticket(id: string, qrUrl: string): Block {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background:#0a0908;"><tr><td align="center" style="padding:28px 20px;">` +
      `<p style="margin:0 0 14px;font-family:${FONT};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#a9895a;">Admit one</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;padding:12px;">` +
      `<img src="${esc(qrUrl)}" width="200" height="200" alt="QR code for ticket ${esc(id)}" style="display:block;width:200px;height:200px;border:0;"></td></tr></table>` +
      `<p style="margin:16px 0 4px;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#948c81;">Ticket ID</p>` +
      `<p style="margin:0;font-family:${FONT};font-size:22px;font-weight:bold;letter-spacing:3px;color:#faf7f2;">${esc(id)}</p>` +
      `</td></tr></table>`,
    text: `YOUR TICKET\nTicket ID: ${id} (show it, or the QR code, at the door)`,
  };
}
function disclaimer(): Block {
  return {
    html: `<div style="margin:4px 0 20px;padding:14px 18px;border:1px solid #e6ddd0;font-size:13px;line-height:1.6;color:#3b3530;"><strong>Disclaimer:</strong> ${esc(DISCLAIMER.replace(/^Disclaimer:\s*/, ""))}</div>`,
    text: DISCLAIMER,
  };
}
function whatsapp(): Block {
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 4px;background:#eef8f1;border-left:4px solid #25d366;"><tr><td style="padding:18px 20px;">` +
      `<p style="margin:0 0 6px;font-family:${FONT};font-size:16px;font-weight:bold;color:#0a0908;">Join us on WhatsApp</p>` +
      `<p style="margin:0 0 14px;font-family:${FONT};font-size:14px;line-height:1.55;color:#3b3530;">Follow the Dr AjokeSings WhatsApp channel for reminders, updates and news before anyone else.</p>` +
      `<a href="${WHATSAPP}" style="display:inline-block;padding:11px 20px;background:#25d366;border-radius:2px;font-family:${FONT};font-size:14px;font-weight:bold;color:#0a0908;text-decoration:none;">Join the WhatsApp channel</a>` +
      `</td></tr></table>`,
    text: `\nJoin the Dr AjokeSings WhatsApp channel for reminders and updates: ${WHATSAPP}`,
  };
}

function layout(o: { subject: string; eyebrow: string; title: string; preheader: string; blocks: Block[]; site: string; why: string }): Email {
  const siteName = o.site.replace(/^https?:\/\//, "");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#efe8dd;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(o.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe8dd;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;">` +
    `<tr><td style="background:#0a0908;padding:26px 32px;">` +
    `<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:30px;line-height:1;color:#faf7f2;">Dr AjokeSings</p>` +
    `<p style="margin:10px 0 0;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a9895a;">${esc(o.eyebrow)}</p>` +
    `</td></tr>` +
    `<tr><td style="height:3px;line-height:3px;font-size:0;background:#a91d2c;">&nbsp;</td></tr>` +
    `<tr><td style="padding:32px;font-family:${FONT};font-size:16px;line-height:1.6;color:#0a0908;">` +
    `<h1 style="margin:0 0 18px;font-family:${SERIF};font-weight:normal;font-size:32px;line-height:1.15;color:#0a0908;">${esc(o.title)}</h1>` +
    o.blocks.map((b) => b.html).join("") +
    `</td></tr>` +
    `<tr><td style="background:#0a0908;padding:22px 32px;font-family:${FONT};font-size:12px;line-height:1.7;color:#948c81;">` +
    `Dr AjokeSings &middot; Lagos, Nigeria &middot; <a href="${esc(o.site)}" style="color:#a9895a;text-decoration:none;">${esc(siteName)}</a><br>${esc(o.why)}` +
    `</td></tr></table></td></tr></table></body></html>`;
  const text = [`DR AJOKESINGS — ${o.eyebrow.toUpperCase()}`, o.title, ...o.blocks.map((b) => b.text.trim()), `—\nDr AjokeSings · Lagos, Nigeria · ${o.site}\n${o.why}`].join("\n\n");
  return { subject: o.subject, html, text };
}

/* ---------------------------------------------------------------------------
 * The emails
 * ------------------------------------------------------------------------- */
export function compose(kind: string, row: Row, content: Content, env: Pick<Settings, "site" | "functionUrl">): Email {
  const site = env.site;
  const why = "You're getting this email because you sent a form on our website. Just reply if you have any questions.";

  if (kind === "registrations") {
    const e = findEvent(row.event_id, content) || { name: row.event_name || "our event" };
    const withTicket = e.ticketRequired !== false;
    const where = [e.venue, e.address, e.city].filter(Boolean).join(", ");
    const entry = e.admission === "ticketed" ? (e.price ? `Tickets: ${e.price}` : "Ticketed") : e.price || (e.admission === "free" ? "Free entry" : "");
    const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
    const ticketUrl = `${site}/ticket?${[q("id", row.id), q("e", row.event_id), q("n", row.name)].join("&")}`;
    const blocks: Block[] = [
      para(`Hi ${firstName(row.name)}, thank you for registering for ${e.name}. ${withTicket ? "Your ticket is below: show the QR code at the door and you'll be checked in." : "Your place is confirmed, and we look forward to seeing you there."}`),
    ];
    if (withTicket) blocks.push(ticket(row.id, `${env.functionUrl}?qr=${encodeURIComponent(row.id)}`), button(ticketUrl, "View and download your ticket"));
    blocks.push(
      heading("The event"),
      facts([
        ["Event", e.name], ["Date", longDate(e.date)], ["Time", e.date ? (e.time ? `${e.time}${e.endTime ? `–${e.endTime}` : ""}` : "To be announced") : ""],
        ["Venue", where], ["Entry", entry], ["Name", row.name], [withTicket ? "Ticket ID" : "Reference", row.id],
      ]),
    );
    if (withTicket) blocks.push(small("One ticket admits one person. Keep this email, or download your ticket to your phone, and have it ready at the door."));
    blocks.push(small("Can't make it after all? Reply to this email and we'll free your place for someone else."), whatsapp());
    return layout({
      subject: withTicket ? `Your ticket: ${e.name}` : `You're registered: ${e.name}`,
      eyebrow: withTicket ? "Your ticket" : "Registration confirmed",
      title: withTicket ? "Here's your ticket." : "You're registered.",
      preheader: `${e.name}${e.date ? ` · ${longDate(e.date)}` : ""}${withTicket ? ` · Ticket ${row.id}` : ""}`,
      blocks, site, why,
    });
  }

  if (kind === "applications") {
    const d = row.data || {};
    const s = content.symphony || {};
    const venue = s.concert && s.concert.venue ? `${s.concert.venue}${s.concert.city ? `, ${s.concert.city}` : ""}` : "";
    const files = Array.isArray(d.files) ? d.files.length : 0;
    const next = [
      s.applicationCloses ? `Applications close on ${longDate(s.applicationCloses)}.` : "",
      "The team reviews every application, and every applicant hears back, whichever way the answer goes.",
      s.questDate ? `The Talent Quest itself takes place on ${longDate(s.questDate)}${venue ? ` at ${venue}` : ""}.` : "",
    ].filter(Boolean).join(" ");
    return layout({
      subject: `Application received: SPAW Talent Quest (${row.id})`,
      eyebrow: "SPAW Talent Quest",
      title: "Your application is in.",
      preheader: `Thank you for applying. Your application ID is ${row.id}.`,
      blocks: [
        para(`Hi ${firstName(row.full_name)}, thank you for applying to the SPAW Talent Quest with Dr AjokeSings. Your application has arrived safely, and the team will go through everything you've sent.`),
        facts([
          ["Application ID", row.id], ["Track", row.track], ["Gender", d.gender], ["Age category", d.ageCategory],
          ["From", row.location], ["Samples", files ? `${files} file${files === 1 ? "" : "s"} received` : ""],
        ]),
        heading("What happens next"),
        para(next),
        button(`${site}/symphony#quest`, "Read about the Talent Quest"),
        disclaimer(),
        whatsapp(),
      ],
      site, why,
    });
  }

  if (kind === "enquiries") {
    const d = row.data || {};
    if (row.type === "booking") {
      return layout({
        subject: `Booking request received (${row.id})`,
        eyebrow: "Booking request",
        title: "We've got your booking request.",
        preheader: `Thank you for inviting Dr AjokeSings. Reference ${row.id}.`,
        blocks: [
          para(`Hi ${firstName(row.name)}, thank you for inviting Dr AjokeSings${d.organisation ? ` on behalf of ${clean(d.organisation, 120)}` : ""}. The team is checking her availability${d.eventDate ? ` for ${longDate(d.eventDate)}` : ""} and will reply to this address, usually within three working days.`),
          facts([
            ["Reference", row.id], ["Kind of event", d.eventType], ["Date", longDate(d.eventDate)], ["City & venue", d.city],
            ["Expected attendance", d.attendance], ["Subject", row.subject],
          ]),
          small("Anything to add or change? Just reply to this email."),
          whatsapp(),
        ],
        site, why,
      });
    }
    return layout({
      subject: `We've received your message (${row.id})`,
      eyebrow: "Message received",
      title: "Thank you for your message.",
      preheader: `Your message has reached the team. Reference ${row.id}.`,
      blocks: [
        para(`Hi ${firstName(row.name)}, your message has reached the team, and a reply is on its way to this address, usually within three working days.`),
        facts([["Reference", row.id], ["Subject", row.subject]]),
        quote(row.message || ""),
        whatsapp(),
      ],
      site, why,
    });
  }

  // Newsletter
  return layout({
    subject: "Welcome to the Dr AjokeSings mailing list",
    eyebrow: "Mailing list",
    title: "You're on the list.",
    preheader: "New songs, events and Symphony of Praise & Worship news, first.",
    blocks: [
      para("Thank you for signing up. You'll be among the first to hear about new songs, upcoming events, and the Symphony of Praise & Worship."),
      button(`${site}/music`, "Listen to the latest songs"),
      whatsapp(),
      small("Don't want these emails? Reply with “unsubscribe” and we'll take you off the list."),
    ],
    site,
    why: "You're getting this email because this address was added to the Dr AjokeSings mailing list on our website.",
  });
}

/* ---------------------------------------------------------------------------
 * The service
 * ------------------------------------------------------------------------- */
function settings(): Settings {
  const env = (k: string) => String((globalThis as any).Deno.env.get(k) || "").trim();
  const url = env("SUPABASE_URL").replace(/\/+$/, "");
  return {
    url,
    serviceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    resendKey: env("RESEND_API_KEY"),
    from: env("MAIL_FROM") || "Dr AjokeSings <hello@dr-ajokesings.com>",
    replyTo: env("MAIL_REPLY_TO"),
    site: (env("SITE_URL") || "https://dr-ajokesings.com").replace(/\/+$/, ""),
    functionUrl: `${url}/functions/v1/send-email`,
  };
}

function rest(env: Settings, path: string, init: RequestInit = {}) {
  return fetch(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

async function qrImage(id: string): Promise<Response> {
  if (!/^[A-Z]{3}-[A-Z0-9]{4,24}$/.test(id)) return json({ error: "Not found" }, 404);
  const mod: any = await import("npm:qrcode@1.5.4");
  const QRCode = mod.default || mod;
  const png = await QRCode.toBuffer(id, { width: 440, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0a0908ff", light: "#ffffffff" } });
  return new Response(png, { headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("qr")) return qrImage(String(url.searchParams.get("qr") || "").toUpperCase());
  if (req.method !== "POST") return json({ error: "Not found" }, 404);

  let body: Row;
  try { body = await req.json(); } catch (_) { return json({ sent: false, reason: "bad request" }, 400); }
  const kind = String(body.kind || "");
  const key = String(body.id || "").trim();
  if (!KEY_OF[kind] || !key || key.length > 200) return json({ sent: false, reason: "bad request" }, 400);

  const env = settings();
  if (!env.resendKey) return json({ sent: false, reason: "RESEND_API_KEY isn't set" });
  if (!env.serviceKey) return json({ sent: false, reason: "SUPABASE_SERVICE_ROLE_KEY isn't available" });

  const col = KEY_OF[kind];
  const match = `${col}=eq.${encodeURIComponent(kind === "subscribers" ? key.toLowerCase() : key)}`;
  const found = await rest(env, `${kind}?${match}&select=*&limit=1`);
  if (!found.ok) return json({ sent: false, reason: `lookup failed (${found.status})` }, 502);
  const row: Row | undefined = (await found.json())[0];
  if (!row) return json({ sent: false, reason: "not found" }, 404);
  if (row.emailed_at) return json({ sent: false, reason: "already sent" });
  const at = Date.parse(row[SENT_AT[kind]] || "");
  if (!at || Date.now() - at > MAX_AGE) return json({ sent: false, reason: "too old" });
  if (kind === "registrations" && row.status !== "registered") return json({ sent: false, reason: "not registered" });
  if (kind === "subscribers" && row.unsubscribed_at) return json({ sent: false, reason: "unsubscribed" });

  // Claim it first, so two calls at once send one email.
  const claim = await rest(env, `${kind}?${match}&emailed_at=is.null`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ emailed_at: new Date().toISOString() }),
  });
  if (!claim.ok || !(await claim.json()).length) return json({ sent: false, reason: "already sent" });

  const content: Content = {};
  try {
    const res = await rest(env, "content?key=in.(events,symphony)&select=key,data");
    if (res.ok) for (const r of await res.json()) (content as Row)[r.key] = r.data;
  } catch (_) { /* the email goes without the event's details */ }

  const email = compose(kind, row, content, env);
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.from, to: [row.email], subject: email.subject, html: email.html, text: email.text, ...(env.replyTo ? { reply_to: env.replyTo } : {}) }),
  });
  if (!sent.ok) {
    const reason = `email service said ${sent.status}: ${(await sent.text()).slice(0, 300)}`;
    await rest(env, `${kind}?${match}`, { method: "PATCH", body: JSON.stringify({ emailed_at: null }) });
    console.error(`[send-email] ${kind} ${key}: ${reason}`);
    return json({ sent: false, reason }, 502);
  }
  return json({ sent: true });
}

const runtime = (globalThis as any).Deno;
if (runtime && typeof runtime.serve === "function") runtime.serve(handle);
