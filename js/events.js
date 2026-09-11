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

async function renderEventsList() {
  const list = document.querySelector("[data-events-full-list]");
  if (!list) return;
  showLoading(list, "Loading events\u2026");

  try {
    const events = await api.getAllEvents();
    if (!events.length) { showEmpty(list, "No events scheduled right now — check back soon."); return; }

    list.replaceChildren(
      ...events.map((e) => {
        const pct = Math.min(100, Math.round((e.registered / e.capacity) * 100));
        const registerBtn = el("button", { class: "btn btn-solid", type: "button", text: "Register" });
        registerBtn.addEventListener("click", () => openRegisterModal(e));

        return el("article", { class: "event-full-row" }, [
          el("img", { class: "event-full-row__img", src: e.image, alt: "", loading: "lazy" }),
          el("div", {}, [
            el("p", { class: "event-full-row__date", text: `${formatFullDate(e.date, e.time)} \u00b7 ${e.time || "Time to be announced"}` }),
            el("h3", { class: "event-full-row__title display", text: e.name }),
            el("p", { class: "event-full-row__venue", text: `${e.venue}, ${e.city}` }),
            el("p", { class: "event-full-row__desc", text: e.description }),
            el("div", { class: "event-full-row__capacity" }, [
              el("span", { text: `${e.registered} of ${e.capacity} registered` }),
              el("div", { class: "capacity-bar" }, [el("div", { class: "capacity-bar__fill", style: `width:${pct}%` })]),
            ]),
          ]),
          registerBtn,
        ]);
      })
    );
  } catch (err) {
    console.error("[events] list failed", err);
    showError(list, "Couldn't load events.", renderEventsList);
  }
}

function openRegisterModal(event) {
  selectedEvent = event;
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
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    when = [`DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`];
  } else {
    const dayAfter = new Date(`${event.date}T00:00:00Z`);
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
    `LOCATION:${event.venue}, ${event.city}`,
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
