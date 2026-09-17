/**
 * register.js
 * ----------------------------------------------------------------------
 * Event registration, wherever a Register button is: the Events page, the
 * homepage's concert slide and its "See more" sheet, the Symphony page.
 *
 *   EventRegister.open(eventOrId)  opens the form over the page
 *   <a data-register-event="event-004">  a button that opens it (its href
 *     stays as the way in without JavaScript); "symphony-concert" means the
 *     event chosen for the concert in admin → Symphony
 *   <span data-register-status="…">  shows "Sold out" or "Registration
 *     closed" once the event stops taking registrations
 *
 * The form asks for a name, an email and (unless the event says not to) a
 * phone number with its country code, then the event's own questions
 * (admin → Events → Registration form). Once an event is sold out or
 * registration has closed, its buttons are disabled and say so.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";
  const { make } = window.FormFields;

  let modal = null;
  let parts = null;
  let current = null;
  let rendered = [];
  let opener = null;

  const resolveId = (value) => {
    if (value === "symphony-concert") return (window.DB && DB.symphony && DB.symphony.concert && DB.symphony.concert.eventId) || "";
    return value || "";
  };

  function whenText(e) {
    const day = new Date(`${e.date}T${e.time || "00:00"}:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return [e.time ? `${day}, ${e.time}` : day, [e.venue, e.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  }

  function build() {
    if (modal) return;
    const close = make("button", { class: "reg-modal__close", type: "button", "aria-label": "Close", text: "×" });
    const name = make("p", { class: "eyebrow", id: "reg-modal-title" });
    const meta = make("p", { class: "field-hint reg-modal__meta" });
    const error = make("p", { class: "form-error-banner", role: "alert" });
    const fields = make("div", { class: "reg-modal__fields" });
    const submit = make("button", { type: "submit", class: "btn btn-solid reg-modal__submit", text: "Confirm registration" });
    const form = make("form", { novalidate: true }, [name, meta, error, fields, submit]);

    const regName = make("span");
    const qr = make("div", { class: "confirm-screen__qr" });
    const regId = make("span");
    const ics = make("button", { type: "button", class: "btn btn-line", text: "Add to calendar" });
    const done = make("button", { type: "button", class: "btn btn-line", text: "Done" });
    const confirm = make("div", { class: "reg-modal__confirm", hidden: true }, [
      make("div", { class: "confirm-screen__icon" }, [svgTick()]),
      make("h2", { class: "confirm-screen__title display", text: "You're registered." }),
      make("p", { class: "confirm-screen__body" }, ["See you there, ", regName, ". Show this QR code at check-in."]),
      qr,
      make("p", { class: "confirm-screen__id" }, ["ID: ", regId]),
      make("div", { class: "confirm-screen__actions" }, [ics, done]),
    ]);

    modal = make("div", { class: "video-modal reg-modal", "data-register-modal": "", hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "reg-modal-title" }, [
      make("div", { class: "reg-modal__panel section--light" }, [close, form, confirm]),
    ]);
    document.body.append(modal);
    parts = { form, name, meta, error, fields, submit, confirm, regName, qr, regId, ics };

    [close, done].forEach((b) => b.addEventListener("click", hide));
    modal.addEventListener("click", (e) => { if (e.target === modal) hide(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("is-open")) hide(); });
    form.addEventListener("submit", send);
  }

  function svgTick() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M5 12l5 5L19 7");
    path.setAttribute("stroke", "var(--red)");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    svg.append(path);
    return svg;
  }

  function show() {
    modal.hidden = false;
    // A frame later, so the fade-in runs.
    requestAnimationFrame(() => modal.classList.add("is-open"));
    document.body.classList.add("no-scroll");
    document.dispatchEvent(new CustomEvent("register:open"));
  }

  function hide() {
    if (!modal || !modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    setTimeout(() => { modal.hidden = true; }, 250);
    document.dispatchEvent(new CustomEvent("register:close"));
    if (opener && document.contains(opener) && typeof opener.focus === "function") opener.focus();
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

  async function open(target, from) {
    if (typeof api === "undefined") return;
    build();
    opener = from || document.activeElement;
    let e = target && typeof target === "object" ? target : null;

    parts.form.hidden = false;
    parts.confirm.hidden = true;
    parts.error.textContent = "";
    parts.fields.replaceChildren();
    parts.name.textContent = e ? e.name : "Loading the event…";
    parts.meta.textContent = e ? whenText(e) : "";
    parts.submit.disabled = true;
    show();

    if (!e) {
      try {
        e = await api.getEventById(resolveId(String(target)));
      } catch (err) {
        parts.name.textContent = "Registration";
        parts.error.textContent = err.message || "That event couldn't be found.";
        return;
      }
    }
    current = e;
    if (window.Track) Track.event("register_open", { label: e.name, props: { id: e.id } });
    parts.name.textContent = e.name;
    parts.meta.textContent = whenText(e);

    rendered = questionsFor(e).map((q) => FormFields.render(q, { prefix: "reg" }));
    parts.fields.replaceChildren(...rendered.map((r) => r.node));

    const state = api.eventState(e);
    parts.submit.textContent = state.open ? "Confirm registration" : state.label;
    parts.submit.disabled = !state.open;
    if (!state.open) {
      parts.error.textContent = state.reason;
      rendered.forEach((r) => r.disable(true));
      return;
    }
    // Not on a phone: the keyboard would cover the form as it opens.
    if (!window.matchMedia("(max-width: 700px)").matches) setTimeout(() => rendered[0] && rendered[0].focus(), 60);
  }

  async function send(ev) {
    ev.preventDefault();
    if (!current) return;
    parts.error.textContent = "";
    const problems = rendered.filter((r) => r.check());
    if (problems.length) {
      problems[0].focus();
      parts.error.textContent = problems.length === 1 ? "One answer needs another look." : `${problems.length} answers need another look.`;
      return;
    }
    const byId = (id) => rendered.find((r) => r.question.id === id);
    const attendee = {
      name: byId("name").read(),
      email: byId("email").read(),
      phone: byId("phone") ? byId("phone").read() : "",
      answers: FormFields.answersOf(rendered.filter((r) => !["name", "email", "phone"].includes(r.question.id))),
    };

    const label = parts.submit.textContent;
    parts.submit.disabled = true;
    parts.submit.textContent = "Registering…";
    try {
      const registration = await api.registerForEvent(current.id, attendee);
      confirmed(registration);
      markButtons();
    } catch (err) {
      parts.error.textContent = err.message || "Something went wrong. Please try again.";
    } finally {
      parts.submit.disabled = false;
      parts.submit.textContent = label;
    }
  }

  function confirmed(registration) {
    const e = current;
    parts.form.hidden = true;
    parts.confirm.hidden = false;
    parts.regName.textContent = registration.name;
    parts.regId.textContent = registration.id;
    parts.qr.replaceChildren();
    if (typeof QRCode !== "undefined") {
      new QRCode(parts.qr, { text: registration.id, width: 148, height: 148, colorDark: "#0a0908", colorLight: "#faf7f2" });
    } else {
      parts.qr.replaceChildren(make("p", { class: "state-msg", text: `Show ID ${registration.id} at check-in.` }));
    }
    parts.ics.onclick = () => {
      const url = URL.createObjectURL(new Blob([calendarFile(e, registration)], { type: "text/calendar" }));
      const a = make("a", { href: url, download: `${e.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics` });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };
    parts.confirm.querySelector("button").focus();
  }

  function calendarFile(event, registration) {
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
      `UID:${registration.id}@dr-ajokesings.com`, `DTSTAMP:${fmt(new Date())}`, ...when,
      `SUMMARY:${event.name}`, `LOCATION:${[event.venue, event.address, event.city].filter(Boolean).join(", ")}`,
      `DESCRIPTION:${event.description || ""}`, "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
  }

  /* ---- Register buttons ---------------------------------------------- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-register-event]");
    if (!b) return;
    if (b.getAttribute("aria-disabled") === "true") { e.preventDefault(); return; }
    const id = resolveId(b.dataset.registerEvent);
    if (!id || typeof api === "undefined") return; // the link still goes to the Events page
    e.preventDefault();
    // A "See more" sheet sits above everything else: it steps aside first.
    const sheet = b.closest("dialog[open]");
    if (sheet) sheet.close();
    open(id, b);
  });

  // Buttons for an event that has stopped taking registrations are disabled
  // and say why, with a line underneath.
  async function markButtons() {
    const buttons = [...document.querySelectorAll("[data-register-event]")];
    const labels = [...document.querySelectorAll("[data-register-status]")];
    if (!buttons.length && !labels.length) return;
    try { await window.ContentReady; } catch (_) { /* the built-in events */ }
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
          const note = make("p", { class: "register-note", "data-register-note": "", text: state.reason });
          if (b.hasAttribute("data-hero-anim")) note.setAttribute("data-hero-anim", b.getAttribute("data-hero-anim"));
          b.after(note);
        }
      });
      labels.filter((l) => resolveId(l.dataset.registerStatus) === id).forEach((l) => { l.textContent = state.label; });
    }
  }

  document.addEventListener("DOMContentLoaded", markButtons);
  window.EventRegister = { open, close: hide, refresh: markButtons };
})();
