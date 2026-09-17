/**
 * events.js
 * ----------------------------------------------------------------------
 * Drives events.html: the full event calendar, each with its Register
 * button. Registration itself (the form, the event's own questions, the
 * QR code and calendar file) is register.js, shared with the homepage.
 * An event that has stopped taking registrations (sold out, closed,
 * postponed…) keeps its button, disabled, with a line saying why.
 * ----------------------------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  renderEventsList();
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
  showLoading(list, "Loading events…");

  try {
    const events = await api.getAllEvents();
    if (!events.length) { showEmpty(list, "No events scheduled right now — check back soon."); return; }

    list.replaceChildren(
      ...events.map((e) => {
        // Open, or why not (sold out, closed, postponed, over…): api.eventState.
        const state = api.eventState(e);
        e.canRegister = state.open;
        // The Talent Quest leads with "Apply" while applications are open (app.js).
        const quest = questCallsFor(e);
        const registerBtn = el("button", {
          class: "btn btn-solid",
          type: "button",
          text: !state.open ? state.label : quest ? "Register to watch" : "Register",
          disabled: !state.open,
        });
        registerBtn.addEventListener("click", () => EventRegister.open(e, registerBtn));
        const actions = [registerBtn];
        if (!state.open && state.label !== "Event over") actions.push(el("p", { class: "event-full-row__closed", text: state.reason }));
        if (quest) actions.unshift(el("a", { class: "btn btn-solid btn-quest", href: "symphony#apply", text: "Apply to take part", "data-cta": "Talent Quest: apply (events page)" }));
        if (e.ticketUrl && e.status !== "cancelled") {
          actions.push(el("a", { class: "btn btn-line", href: e.ticketUrl, target: "_blank", rel: "noopener", text: "Get tickets", "data-cta": `Get tickets: ${e.name}` }));
        }

        const flags = [
          e.status === "cancelled" || e.status === "postponed"
            ? el("span", { class: `event-flag event-flag--${e.status}`, text: e.status === "cancelled" ? "Cancelled" : "Postponed" }) : null,
          state.label === "Sold out" ? el("span", { class: "event-flag event-flag--soldout", text: "Sold out" }) : null,
          e.category ? el("span", { class: "event-flag", text: e.category }) : null,
        ].filter(Boolean);
        const venue = el("p", { class: "event-full-row__venue", text: [e.venue, e.address, e.city].filter(Boolean).join(", ") });
        if (e.mapUrl) venue.append(" · ", el("a", { href: e.mapUrl, target: "_blank", rel: "noopener", text: "Map" }));
        const admission = admissionText(e);

        return el("article", { class: `event-full-row${e.status === "cancelled" ? " is-cancelled" : ""}` }, [
          el("img", { class: "event-full-row__img", src: e.image || "assets/images/ministry-hero.jpg", alt: "", loading: "lazy" }),
          el("div", {}, [
            el("p", { class: "event-full-row__date", text: `${formatEventDays(e)} · ${formatEventTimes(e)}` }),
            flags.length ? el("div", { class: "event-flags" }, flags) : null,
            el("h3", { class: "event-full-row__title display", text: e.name }),
            venue,
            admission ? el("p", { class: "event-full-row__admission", text: admission }) : null,
            el("p", { class: "event-full-row__desc", text: e.description }),
          ].filter(Boolean)),
          el("div", { class: "event-full-row__actions" }, actions),
        ]);
      })
    );

    // Arriving from a link to one event: events?id=… (the homepage
    // calendar) brings its row into view, and events?register=… (shared
    // registration links) opens its registration form as well.
    const params = new URLSearchParams(window.location.search);
    const wanted = events.findIndex((e) => e.id === (params.get("register") || params.get("id")));
    if (wanted !== -1) {
      list.children[wanted]?.scrollIntoView({ block: "center" });
      if (params.has("register") && events[wanted].canRegister) EventRegister.open(events[wanted]);
    }
  } catch (err) {
    console.error("[events] list failed", err);
    showError(list, "Couldn't load events.", renderEventsList);
  }
}
