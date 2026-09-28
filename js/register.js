/**
 * register.js
 * ----------------------------------------------------------------------
 * Event registration. Every event has a registration page of its own,
 *   register?event=event-004
 * and every Register button on the site is a link to it:
 *   <a data-register-event="event-004">  its href becomes the event's
 *     page; "symphony-concert" means the event chosen for the concert in
 *     admin → Symphony
 *   <span data-register-status="…">  shows "Sold out" or "Registration
 *     closed" once the event stops taking registrations
 * Once an event is sold out or registration has closed, its buttons are
 * disabled and say why.
 *
 * register.html asks for a name, an email and (unless the event says not
 * to) a phone number with its country code, then the event's own
 * questions (admin → Events → Registration form). Sent, it goes on to the
 * event's thank-you page, register-thank-you?event=event-004: the ticket
 * (QR code, download, calendar file) or, for an event without tickets, a
 * confirmation. The Talent Quest takes applications, not registrations:
 * its page sends people to apply.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";
  const { make } = window.FormFields;
  const params = new URLSearchParams(location.search);

  const resolveId = (value) => {
    if (value === "symphony-concert") return (window.DB && DB.symphony && DB.symphony.concert && DB.symphony.concert.eventId) || "";
    return value || "";
  };
  const pageOf = (id) => `register?event=${encodeURIComponent(id)}`;
  const doneOf = (id) => `register-thank-you?event=${encodeURIComponent(id)}`;

  function dayText(e) {
    const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const days = e.endDate && e.endDate !== e.date ? `${day(e.date)} – ${day(e.endDate)}` : day(e.date);
    return e.time ? `${days} · ${e.time}${e.endTime ? `–${e.endTime}` : ""}` : `${days} · time to be announced`;
  }
  const placeText = (e) => [e.venue, e.address, e.city].filter(Boolean).join(", ");
  function admissionText(e) {
    if (e.admission === "ticketed") return e.price ? `Tickets: ${e.price}` : "Ticketed";
    if (e.admission === "free") return e.price || "Free entry";
    return e.price || "";
  }

  // The questions, in order: who they are, then the event's own.
  function questionsFor(e) {
    const phone = e.phone || "optional";
    const base = [
      { id: "name", label: "Full name", type: "text", required: true, autocomplete: "name" },
      { id: "email", label: "Email", type: "email", required: true, autocomplete: "email" },
      phone === "off" ? null : { id: "phone", label: "Phone", type: "phone", required: phone === "required" },
    ].filter(Boolean);
    const extra = (Array.isArray(e.formFields) ? e.formFields : []).filter((q) => q && q.id && q.label);
    return [...base, ...extra];
  }

  function calendarFile(event, id) {
    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    // No announced time yet: an all-day entry rather than an invented start.
    let when;
    if (event.time) {
      const start = new Date(`${event.date}T${event.time}:00`);
      const until = event.endTime ? new Date(`${event.endDate || event.date}T${event.endTime}:00`) : null;
      const end = until && until > start ? until : new Date(start.getTime() + 2 * 60 * 60 * 1000);
      when = [`DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`];
    } else {
      const dayAfter = new Date(`${event.endDate || event.date}T00:00:00Z`);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      const ymd = (s) => s.slice(0, 10).replace(/-/g, "");
      when = [`DTSTART;VALUE=DATE:${ymd(event.date)}`, `DTEND;VALUE=DATE:${ymd(dayAfter.toISOString())}`];
    }
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DrAjokeSings//Events//EN", "BEGIN:VEVENT",
      `UID:${id}@dr-ajokesings.com`, `DTSTAMP:${fmt(new Date())}`, ...when,
      `SUMMARY:${event.name}`, `LOCATION:${placeText(event)}`,
      `DESCRIPTION:${event.description || ""}`, "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
  }
  function saveCalendar(event, id) {
    const url = URL.createObjectURL(new Blob([calendarFile(event, id)], { type: "text/calendar" }));
    const a = make("a", { href: url, download: `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // The event at the top of its page (and its thank-you page).
  function showEvent(root, e) {
    const set = (sel, text) => { const n = root.querySelector(sel); if (n) { n.textContent = text; n.hidden = !text; } };
    set("[data-reg-name]", e.name);
    set("[data-reg-when]", dayText(e));
    set("[data-reg-where]", placeText(e));
    set("[data-reg-admission]", admissionText(e));
    set("[data-reg-desc]", e.description || "");
    const img = root.querySelector("[data-reg-image]");
    if (img && e.image) img.src = e.image;
  }

  /* ---- register?event=… ------------------------------------------------ */
  async function registerPage(root) {
    const form = root.querySelector("[data-register-form]");
    const fields = form.querySelector("[data-reg-fields]");
    const banner = form.querySelector("[data-form-error]");
    const submit = form.querySelector("button[type='submit']");
    const note = form.querySelector("[data-reg-note]");
    const other = root.querySelector("[data-reg-other]");
    const id = resolveId(String(params.get("event") || "").trim());

    // No event, or one that isn't on the site: the events taking registrations.
    const chooser = async (message) => {
      form.hidden = true;
      other.hidden = false;
      other.querySelector("[data-reg-other-note]").textContent = message;
      const list = other.querySelector("[data-reg-other-list]");
      try {
        const open = (await api.getAllEvents()).filter((e) => api.eventState(e).open && !api.isTalentQuest(e));
        list.replaceChildren(...open.map((e) => make("li", {}, [make("a", { href: pageOf(e.id), text: e.name }), make("span", { text: ` · ${dayText(e)}` })])));
        if (!open.length) list.replaceChildren(make("li", { text: "No events are taking registrations just now." }));
      } catch (_) { list.replaceChildren(); }
    };
    if (!id) { await chooser("Choose the event you'd like to register for."); return; }
    let e;
    try { e = await api.getEventById(id); } catch (_) { await chooser("That event isn't on the site any more. These are taking registrations:"); return; }

    showEvent(root, e);
    document.title = `Register: ${e.name} — Dr AjokeSings`;

    // The Talent Quest: apply, don't register.
    if (api.isTalentQuest(e)) {
      form.hidden = true;
      const box = root.querySelector("[data-reg-quest]");
      box.hidden = false;
      if (!api.applicationsOpen()) {
        const a = box.querySelector("a");
        a.classList.remove("btn-quest");
        a.href = "symphony#quest";
        a.textContent = "About the Talent Quest";
      }
      return;
    }

    if (window.Track) Track.event("register_open", { label: e.name, props: { id: e.id } });
    const rendered = questionsFor(e).map((q) => FormFields.render(q, { prefix: "reg" }));
    fields.replaceChildren(...rendered.map((r) => r.node));
    const withTicket = e.ticketRequired !== false;
    note.textContent = withTicket
      ? "You'll get your ticket straight away, with a QR code to show at the door."
      : "You'll get a confirmation straight away.";

    const state = api.eventState(e);
    if (!state.open) {
      submit.textContent = state.label;
      submit.disabled = true;
      banner.textContent = state.reason;
      rendered.forEach((r) => r.disable(true));
      return;
    }

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      banner.textContent = "";
      const problems = rendered.filter((r) => r.check());
      if (problems.length) {
        problems[0].focus();
        banner.textContent = problems.length === 1 ? "One answer needs another look." : `${problems.length} answers need another look.`;
        return;
      }
      const byId = (qid) => rendered.find((r) => r.question.id === qid);
      const attendee = {
        name: byId("name").read(),
        email: byId("email").read(),
        phone: byId("phone") ? byId("phone").read() : "",
        answers: FormFields.answersOf(rendered.filter((r) => !["name", "email", "phone"].includes(r.question.id))),
      };
      const label = submit.textContent;
      submit.disabled = true;
      submit.textContent = "Registering…";
      try {
        const reg = await api.registerForEvent(e.id, attendee);
        FormDone.go("registrations", e.id, { id: reg.id, name: reg.name, email: reg.email, eventId: e.id, eventName: e.name }, doneOf(e.id));
      } catch (err) {
        banner.textContent = err.message || "Something went wrong. Please try again.";
        submit.disabled = false;
        submit.textContent = label;
      }
    });
  }

  /* ---- register-thank-you?event=… -------------------------------------- */
  async function thankYouPage(root) {
    const eventId = String(params.get("event") || "").trim();
    const reg = FormDone.read("registrations", eventId);
    const $ = (sel) => root.querySelector(sel);
    let e = null;
    try { e = eventId ? await api.getEventById(eventId) : null; } catch (_) { e = null; }
    if (e) showEvent(root, e);
    const withTicket = !e || e.ticketRequired !== false;

    // Counted once, as it happens: the Meta Pixel's Lead.
    if (reg && FormDone.first("registrations", eventId)) api._lead("Event registration", reg.eventName || (e && e.name) || "", reg.id);

    $("[data-done-title]").textContent = reg && withTicket ? "You're registered. Here's your ticket." : "You're registered.";
    if (!reg) {
      // Opened some other way than straight after registering.
      $("[data-done-body]").textContent = "Thank you for registering. Your ticket, or your confirmation, is in your email.";
      $("[data-done-ticket]").hidden = true;
      $("[data-done-download]").hidden = true;
      $("[data-done-id]").hidden = true;
      $("[data-done-ticket-note]").hidden = true;
    } else {
      $("[data-done-body]").textContent = withTicket
        ? `See you there, ${reg.name}. Show the QR code at the door, or download your ticket to keep it on your phone.`
        : `See you there, ${reg.name}. Your place is confirmed.`;
      $("[data-done-id]").textContent = `${withTicket ? "Ticket ID" : "Reference"}: ${reg.id}`;
      const figure = $("[data-done-ticket]");
      const save = $("[data-done-download]");
      if (withTicket && window.Ticket) {
        const data = { id: reg.id, name: reg.name, event: e || { name: reg.eventName || "Your event" } };
        try {
          const img = figure.querySelector("img");
          img.src = (await Ticket.draw(data)).toDataURL("image/png");
          img.alt = `Ticket ${reg.id} for ${data.event.name}, ${reg.name}`;
          img.hidden = false;
          figure.querySelector("[data-done-ticket-status]").hidden = true;
          save.addEventListener("click", async () => {
            save.disabled = true;
            save.textContent = "Preparing your ticket…";
            try { await Ticket.download(data); } finally { save.disabled = false; save.textContent = "Download your ticket"; }
          });
        } catch (err) {
          console.error("[register] couldn't draw the ticket", err);
          figure.querySelector("[data-done-ticket-status]").textContent = `Your ticket ID is ${reg.id}. Show it at the door.`;
          save.hidden = true;
        }
      } else {
        figure.hidden = true;
        save.hidden = true;
        $("[data-done-ticket-note]").hidden = true;
      }
      FormDone.emailed("registrations", eventId).then((sent) => {
        if (!sent) return;
        const line = $("[data-done-emailed]");
        line.textContent = withTicket ? `We've also emailed your ticket to ${reg.email}.` : `We've emailed a confirmation to ${reg.email}.`;
        line.hidden = false;
      });
    }
    const cal = $("[data-done-calendar]");
    if (e) cal.addEventListener("click", () => saveCalendar(e, reg ? reg.id : e.id));
    else cal.hidden = true;
    const back = $("[data-done-event]");
    back.href = e ? `events?id=${encodeURIComponent(e.id)}` : "events";
  }

  /* ---- Register buttons ------------------------------------------------ */
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-register-event]");
    if (b && b.getAttribute("aria-disabled") === "true") e.preventDefault();
  });

  // Each button goes to its event's page; one for an event that has
  // stopped taking registrations is disabled and says why, with a line
  // underneath.
  async function markButtons() {
    const buttons = [...document.querySelectorAll("[data-register-event]")];
    const labels = [...document.querySelectorAll("[data-register-status]")];
    if (!buttons.length && !labels.length) return;
    try { await window.ContentReady; } catch (_) { /* the built-in events */ }
    buttons.forEach((b) => { const id = resolveId(b.dataset.registerEvent); if (id) b.setAttribute("href", pageOf(id)); });
    const ids = [...new Set([...buttons.map((b) => b.dataset.registerEvent), ...labels.map((l) => l.dataset.registerStatus)].map(resolveId).filter(Boolean))];
    for (const id of ids) {
      let e;
      try { e = await api.getEventById(id); } catch (_) { continue; } // not on the site: the links stay as they are
      const state = api.eventState(e);
      if (state.open) continue;
      buttons.filter((b) => resolveId(b.dataset.registerEvent) === id).forEach((b) => {
        b.setAttribute("aria-disabled", "true");
        b.removeAttribute("href");
        b.classList.add("is-disabled");
        b.textContent = state.label;
        const next = b.nextElementSibling;
        if (next && next.matches("[data-register-note]")) next.textContent = state.reason;
        else {
          const n = make("p", { class: "register-note", "data-register-note": "", text: state.reason });
          if (b.hasAttribute("data-hero-anim")) n.setAttribute("data-hero-anim", b.getAttribute("data-hero-anim"));
          b.after(n);
        }
      });
      labels.filter((l) => resolveId(l.dataset.registerStatus) === id).forEach((l) => { l.textContent = state.label; });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    markButtons();
    const page = document.querySelector("[data-register-page]");
    if (page) registerPage(page);
    const done = document.querySelector("[data-register-done]");
    if (done) thankYouPage(done);
    if ((page || done) && typeof wireYear === "function") wireYear();
  });
  window.EventRegister = { page: pageOf, refresh: markButtons };
})();
