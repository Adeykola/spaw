/**
 * ticket.js
 * ----------------------------------------------------------------------
 * A registration's ticket as a picture to keep on a phone: drawn on a
 * canvas in the site's colours (her signature, the event, when and where,
 * the name, and the QR code the door scans) with a tear-off stub, and
 * saved as a PNG.
 *
 *   Ticket.draw({ id, name, event })     → a canvas
 *   Ticket.download({ id, name, event }) saves "ticket-REG-….png"
 *
 * Used by the success screen after registering (register.js) and by the
 * ticket page the ticket email links to (ticket.html). The QR code needs
 * qrcode.min.js on the page; without it the ticket shows the ID alone.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";
  const W = 1080;
  const H = 1920;
  const M = 96;
  const C = { ink: "#0a0908", paper: "#faf7f2", red: "#a91d2c", gold: "#a9895a", gray: "#948c81" };
  const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
  const SANS = "Manrope, 'Segoe UI', Arial, sans-serif";
  const root = () => (window.Backend && Backend.root) || new URL("./", location.href).href;

  const loadImage = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  // The site's fonts, if they've arrived (a couple of seconds at most).
  async function fonts() {
    if (!document.fonts || !document.fonts.load) return;
    const wanted = [`96px ${SERIF}`, `italic 64px ${SERIF}`, `700 26px ${SANS}`, `500 34px ${SANS}`];
    try { await Promise.race([Promise.all(wanted.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]); } catch (_) { /* system fonts */ }
  }

  function qrCanvas(text, size) {
    if (typeof QRCode === "undefined") return null;
    const holder = document.createElement("div");
    new QRCode(holder, { text, width: size, height: size, colorDark: C.ink, colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
    return holder.querySelector("canvas");
  }

  function lines(ctx, text, max, limit) {
    const out = [];
    let line = "";
    String(text || "").split(/\s+/).filter(Boolean).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > max) { out.push(line); line = word; } else line = next;
    });
    if (line) out.push(line);
    if (out.length > limit) {
      const kept = out.slice(0, limit);
      let last = kept[limit - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
      kept[limit - 1] = `${last.trim()}…`;
      return kept;
    }
    return out;
  }

  // Letter-spaced capitals, where the browser can space canvas text.
  function label(ctx, text, x, y, { size = 24, color = C.gold, spacing = 5, align = "left" } = {}) {
    ctx.save();
    ctx.font = `700 ${size}px ${SANS}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(String(text).toUpperCase(), x, y);
    ctx.restore();
  }

  const longDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "");
  const dateText = (e) => (e.endDate && e.endDate !== e.date ? `${longDate(e.date)} – ${longDate(e.endDate)}` : longDate(e.date));
  const timeText = (e) => (!e.date ? "" : e.time ? (e.endTime ? `${e.time}–${e.endTime}` : e.time) : "To be announced");

  async function draw({ id, name, event } = {}) {
    await fonts();
    const e = event || {};
    // Drawn on a tall sheet first; the ticket is then cut to the height its
    // words need (a long event name or venue makes it taller, never cramped).
    const sheet = document.createElement("canvas");
    sheet.width = W;
    sheet.height = 2800;
    const ctx = sheet.getContext("2d");

    // The ground: near-black with a red stage light in the corner.
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, sheet.height);
    const glow = ctx.createRadialGradient(W * 0.9, 80, 10, W * 0.9, 80, 980);
    glow.addColorStop(0, "rgba(169, 29, 44, 0.55)");
    glow.addColorStop(1, "rgba(169, 29, 44, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, sheet.height);

    // Her signature, and "Admit one".
    const logo = await loadImage(new URL("assets/images/logo.svg", root()).href);
    if (logo) ctx.drawImage(logo, M, 118, 330, (330 * 922) / 2632);
    label(ctx, "Admit one", W - M, 186, { align: "right", spacing: 7 });

    ctx.fillStyle = C.red;
    ctx.fillRect(M, 300, 120, 4);
    label(ctx, "Event ticket", M, 364);

    // The event.
    let size = 92;
    ctx.fillStyle = C.paper;
    ctx.font = `${size}px ${SERIF}`;
    let title = lines(ctx, e.name || "Your event", W - 2 * M, 4);
    while (title.length > 3 && size > 64) {
      size -= 8;
      ctx.font = `${size}px ${SERIF}`;
      title = lines(ctx, e.name || "Your event", W - 2 * M, 3);
    }
    if (title.length > 3) title = lines(ctx, e.name || "Your event", W - 2 * M, 3);
    let y = 364 + 36 + size;
    title.slice(0, 3).forEach((l) => { ctx.fillText(l, M, y); y += size * 1.04; });
    y += 36;

    [["Date", dateText(e)], ["Time", timeText(e)], ["Venue", [e.venue, e.address, e.city].filter(Boolean).join(", ")]].forEach(([k, v]) => {
      if (!v) return;
      label(ctx, k, M, y, { size: 22, spacing: 4 });
      ctx.font = `500 34px ${SANS}`;
      ctx.fillStyle = C.paper;
      y += 48;
      lines(ctx, v, W - 2 * M, 2).forEach((l) => { ctx.fillText(l, M, y); y += 44; });
      y += 24;
    });

    // The tear-off line.
    const py = Math.max(y + 8, 1000);
    ctx.save();
    ctx.setLineDash([16, 14]);
    ctx.strokeStyle = "rgba(169, 137, 90, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(90, py);
    ctx.lineTo(W - 90, py);
    ctx.stroke();
    ctx.restore();

    // The stub: who, the QR code, the ticket ID.
    let sy = py + 92;
    label(ctx, "Name", W / 2, sy, { size: 22, spacing: 4, align: "center" });
    ctx.font = `italic 64px ${SERIF}`;
    ctx.fillStyle = C.paper;
    ctx.textAlign = "center";
    sy += 70;
    lines(ctx, name || "", W - 2 * M, 2).forEach((l) => { ctx.fillText(l, W / 2, sy); sy += 66; });
    sy += 10;

    const qs = 340;
    const pad = 24;
    const qr = id ? qrCanvas(String(id), qs) : null;
    if (qr) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect((W - qs) / 2 - pad, sy, qs + pad * 2, qs + pad * 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qr, (W - qs) / 2, sy + pad, qs, qs);
      sy += qs + pad * 2 + 76;
    } else {
      sy += 40;
    }
    label(ctx, "Ticket ID", W / 2, sy, { size: 22, spacing: 4, align: "center", color: C.gray });
    sy += 58;
    ctx.save();
    ctx.font = `700 46px ${SANS}`;
    ctx.fillStyle = C.paper;
    ctx.textAlign = "center";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
    ctx.fillText(String(id || ""), W / 2, sy);
    ctx.restore();
    sy += 52;
    ctx.font = `500 26px ${SANS}`;
    ctx.fillStyle = C.gray;
    ctx.textAlign = "center";
    ctx.fillText("Show this at the door · one ticket admits one person", W / 2, sy);

    // The ticket, cut to size: the gold frame, the web address, and the
    // tear-off notches cut out of the picture.
    const height = Math.max(H, Math.ceil(sy + 170));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = height;
    const out = canvas.getContext("2d");
    out.drawImage(sheet, 0, 0);
    out.strokeStyle = "rgba(169, 137, 90, 0.5)";
    out.lineWidth = 2;
    out.strokeRect(40, 40, W - 80, height - 80);
    label(out, "dr-ajokesings.com", W / 2, height - 84, { size: 22, spacing: 5, align: "center" });
    out.save();
    out.globalCompositeOperation = "destination-out";
    [0, W].forEach((x) => { out.beginPath(); out.arc(x, py, 46, 0, Math.PI * 2); out.fill(); });
    out.restore();
    return canvas;
  }

  async function download(data) {
    const canvas = await draw(data);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${String(data.id || "").replace(/[^\w-]/g, "") || "event"}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (window.Track) Track.event("cta", { label: "Download ticket" });
  }

  window.Ticket = { draw, download };
})();
