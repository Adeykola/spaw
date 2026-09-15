/**
 * events.js
 * ----------------------------------------------------------------------
 * Drives events.html: renders the full event calendar, opens a
 * registration modal per event, and runs the complete registration
 * journey (validate -> submit -> success screen with a real QR code
 * encoding the registration ID, plus a downloadable .ics file).
 * ----------------------------------------------------------------------
 */
let selectedEvent = null;

document.addEventListener("DOMContentLoaded", () => {
  renderEventsList();
  wireRegisterModal();
  wireYear();
});

function formatFullDate(dateStr, time) {
  const d = new Date(`${dateStr}T${time || "00:00"}:00`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// One day, or the span of an event over several.
function formatEventDays(e) {
  const start = formatFullDate(e.date);
  return e.endDate && e.endDate !== e.date ? `${start} – ${formatFullDate(e.endDate)}` : start;
}

function formatEventTimes(e) {
  if (!e.time) return "Time to be announced";
  return e.endTime ? `${e.time}–${e.endTime}` : e.time;
}

function admissionText(e) {
  if (e.admission === "ticketed") return e.price ? `Tickets: ${e.price}` : "Ticketed";
  if (e.admission === "free") return e.price || "Free entry";
  return e.price || "";
}

async function renderEventsList() {
  const list = document.querySelector("[data-events-full-list]");
  if (!list) return;
  showLoading(list, "Loading events\u2026");

  try {
    const events = await api.getAllEvents();
    if (!events.length) { showEmpty(list, "No events scheduled right now — check back soon."); return; }

    list.replaceChildren(
      ...events.map((e) => {
        // Open, full, or why not (cancelled, postponed, over, closed): api.eventState.
        const state = api.eventState(e);
        const full = state.open && e.capacity && e.registered >= e.capacity;
        e.canRegister = state.open && !full;
        // The Talent Quest leads with "Apply" while applications are open (app.js).
        const quest = questCallsFor(e);
        const registerBtn = el("button", {
          class: "btn btn-solid",
          type: "button",
          text: !state.open ? state.label : full ? "Full" : quest ? "Register to watch" : "Register",
          disabled: !e.canRegister,
        });
        registerBtn.addEventListener("click", () => openRegisterModal(e));
        const actions = [registerBtn];
        if (quest) actions.unshift(el("a", { class: "btn btn-solid btn-quest", href: "symphony#apply", text: "Apply to take part", "data-cta": "Talent Quest: apply (events page)" }));
        if (e.ticketUrl && e.status !== "cancelled") {
          actions.push(el("a", { class: "btn btn-line", href: e.ticketUrl, target: "_blank", rel: "noopener", text: "Get tickets", "data-cta": `Get tickets: ${e.name}` }));
        }

        const pct = e.capacity ? Math.min(100, Math.round((e.registered / e.capacity) * 100)) : 0;
        const flags = [
          e.status === "cancelled" || e.status === "postponed"
            ? el("span", { class: `event-flag event-flag--${e.status}`, text: e.status === "cancelled" ? "Cancelled" : "Postponed" }) : null,
          e.category ? el("span", { class: "event-flag", text: e.category }) : null,
        ].filter(Boolean);
        const venue = el("p", { class: "event-full-row__venue", text: [e.venue, e.address, e.city].filter(Boolean).join(", ") });
        if (e.mapUrl) venue.append(" \u00b7 ", el("a", { href: e.mapUrl, target: "_blank", rel: "noopener", text: "Map" }));
        const admission = admissionText(e);

        return el("article", { class: `event-full-row${e.status === "cancelled" ? " is-cancelled" : ""}` }, [
          el("img", { class: "event-full-row__img", src: e.image || "assets/images/ministry-hero.jpg", alt: "", loading: "lazy" }),
          el("div", {}, [
            el("p", { class: "event-full-row__date", text: `${formatEventDays(e)} \u00b7 ${formatEventTimes(e)}` }),
            flags.length ? el("div", { class: "event-flags" }, flags) : null,
            el("h3", { class: "event-full-row__title display", text: e.name }),
            venue,
            admission ? el("p", { class: "event-full-row__admission", text: admission }) : null,
            el("p", { class: "event-full-row__desc", text: e.description }),
            e.capacity && state.open ? el("div", { class: "event-full-row__capacity" }, [
              el("span", { text: `${e.registered} of ${e.capacity} registered` }),
              el("div", { class: "capacity-bar" }, [el("div", { class: "capacity-bar__fill", style: `width:${pct}%` })]),
            ]) : null,
          ].filter(Boolean)),
          el("div", { class: "event-full-row__actions" }, actions),
        ]);
      })
    );

    // Arriving from a link to one event: events?id=… (the homepage
    // calendar) brings its row into view, and events?register=… (the
    // "Register here" buttons) opens its registration form as well.
    const params = new URLSearchParams(window.location.search);
    const wanted = events.findIndex((e) => e.id === (params.get("register") || params.get("id")));
    if (wanted !== -1) {
      list.children[wanted]?.scrollIntoView({ block: "center" });
      if (params.has("register") && events[wanted].canRegister) openRegisterModal(events[wanted]);
    }
  } catch (err) {
    console.error("[events] list failed", err);
    showError(list, "Couldn't load events.", renderEventsList);
  }
}

function openRegisterModal(event) {
  selectedEvent = event;
  if (window.Track) Track.event("register_open", { label: event.name, props: { id: event.id } });
  const modal = document.querySelector("[data-register-modal]");
  if (!modal) return;
  modal.querySelector("[data-register-event-name]").textContent = event.name;
  modal.querySelector("[data-register-event-meta]").textContent = `${formatFullDate(event.date, event.time)} \u00b7 ${event.venue}, ${event.city}`;
  modal.querySelector("[data-register-form]").hidden = false;
  modal.querySelector("[data-register-confirm]").hidden = true;
  modal.querySelector("[data-register-form]").reset();
  modal.querySelector("[data-register-error]").textContent = "";
  modal.removeAttribute("hidden");
  modal.classList.add("is-open");
  document.body.classList.add("no-scroll");
  modal.querySelector("#reg-name")?.focus();
}

function closeRegisterModal() {
  const modal = document.querySelector("[data-register-modal]");
  if (!modal) return;
  modal.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
  setTimeout(() => modal.setAttribute("hidden", ""), 250);
}

function buildIcs(event, registration) {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  // No announced time yet: file it as an all-day entry rather than invent
  // a start time the organisers haven't given.
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
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DrAjokeSings//Events//EN",
    "BEGIN:VEVENT",
    `UID:${registration.id}@dr-ajokesings.com`,
    `DTSTAMP:${fmt(new Date())}`,
    ...when,
    `SUMMARY:${event.name}`,
    `LOCATION:${[event.venue, event.address, event.city].filter(Boolean).join(", ")}`,
    `DESCRIPTION:${event.description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function wireRegisterModal() {
  const modal = document.querySelector("[data-register-modal]");
  if (!modal) return;
  const form = modal.querySelector("[data-register-form]");
  const errorEl = modal.querySelector("[data-register-error]");
  const closeBtn = modal.querySelector("[data-register-close]");

  closeBtn?.addEventListener("click", closeRegisterModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeRegisterModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("is-open")) closeRegisterModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedEvent) return;
    errorEl.textContent = "";

    const submitBtn = form.querySelector("button[type='submit']");
    const attendee = {
      name: form.querySelector("#reg-name").value.trim(),
      email: form.querySelector("#reg-email").value.trim(),
      phone: form.querySelector("#reg-phone").value.trim(),
    };

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Registering\u2026";

    try {
      const registration = await api.registerForEvent(selectedEvent.id, attendee);
      form.hidden = true;

      const confirm = modal.querySelector("[data-register-confirm]");
      confirm.hidden = false;
      confirm.querySelector("[data-reg-id]").textContent = registration.id;
      confirm.querySelector("[data-reg-name]").textContent = registration.name;

      const qrTarget = confirm.querySelector("[data-reg-qr]");
      qrTarget.replaceChildren();
      if (typeof QRCode !== "undefined") {
        new QRCode(qrTarget, {
          text: registration.id,
          width: 148,
          height: 148,
          colorDark: "#0a0908",
          colorLight: "#faf7f2",
        });
      } else {
        qrTarget.replaceChildren(el("p", { class: "state-msg", text: `QR unavailable offline — show ID ${registration.id} at check-in.` }));
      }

      const icsBtn = confirm.querySelector("[data-reg-ics]");
      icsBtn.onclick = () => {
        const ics = buildIcs(selectedEvent, registration);
        const blob = new Blob([ics], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedEvent.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong. Please try again.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}
