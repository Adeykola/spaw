/**
 * talent.js
 * ----------------------------------------------------------------------
 * The Symphony pages. symphony.html: the concert and the Talent Quest
 * (dates, tracks, prizes, what a place gets you). spaw-apply.html: the
 * Talent Quest application, a page of its own — the questions everyone
 * answers, the YouTube link to their entry, the checks, and the submit
 * through api.submitTalentApplication, which goes on to
 * spaw-apply-thank-you.html with the application's reference. The team
 * watches the entries in the admin.
 * ----------------------------------------------------------------------
 */
// The form used to sit on the Symphony page (symphony#apply): links made
// then go to its own page now.
if (/(^|\/)symphony(\.html)?$/.test(location.pathname) && location.hash === "#apply") {
  location.replace((location.protocol === "file:" ? "spaw-apply.html" : "spaw-apply") + location.search);
}

document.addEventListener("DOMContentLoaded", () => {
  renderSymphonyInfo();
  wireApplicationForm();
  applicationThankYou();
  wireYear();
});

async function renderSymphonyInfo() {
  const datesEl = document.querySelector("[data-symphony-dates]");
  const tracksEl = document.querySelector("[data-symphony-tracks]");
  const trackSelect = document.querySelector("[data-track-select]");
  const termsEl = document.querySelector("[data-symphony-terms]");
  const prizesLine = document.querySelector("[data-apply-prizes]");
  if (!datesEl && !tracksEl && !termsEl && !prizesLine) return;

  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const fmtLong = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  try {
    const info = await api.getSymphonyInfo();

    const introEl = document.querySelector("[data-symphony-intro]");
    if (introEl) introEl.textContent = info.description;

    if (datesEl) {
      datesEl.replaceChildren(
        el("div", {}, [el("strong", { text: fmt(info.applicationCloses) }), el("span", { text: "Applications close" })]),
        el("div", {}, [el("strong", { text: fmt(info.questDate) }), el("span", { text: "Talent Quest" })]),
        el("div", {}, [el("strong", { text: fmt(info.concert.date) }), el("span", { text: "Global Concert" })])
      );
    }

    renderConcert(info.concert, fmtLong);
    renderQuest(info.quest, info, fmt);
    // The application page: the prizes in one line.
    if (prizesLine && info.quest && Array.isArray(info.quest.prizes) && info.quest.prizes.length) {
      prizesLine.textContent = info.quest.prizes.map((p) => `${p.place} ${p.amount}`).join(" · ");
    }

    if (tracksEl) {
      tracksEl.replaceChildren(...info.tracks.map((t) => el("span", { class: "filter-pill", style: "cursor:default;", text: t })));
    }

    if (trackSelect) {
      trackSelect.replaceChildren(
        el("option", { value: "", text: "Select a track" }),
        ...info.tracks.map((t) => el("option", { value: t, text: t }))
      );
    }
    if (appQuestions.age && Array.isArray(info.ageCategories) && info.ageCategories.length) appQuestions.age.setOptions(info.ageCategories);

    if (termsEl) termsEl.textContent = info.terms;
    if (!api.applicationsOpen()) showApplicationsClosed(info, fmt);
  } catch (err) {
    console.error("[talent] symphony info failed", err);
  }
}

// The admin can switch applications off, and they close by themselves after
// the closing date: the form then gives way to a note saying so.
function showApplicationsClosed(info, fmt) {
  const form = document.querySelector("[data-application-form]");
  if (!form || form.hidden) return;
  const pastDate = info.applicationCloses && new Date(`${info.applicationCloses}T23:59:59`).getTime() < Date.now();
  form.hidden = true;
  form.after(el("div", { class: "confirm-screen", "data-applications-closed": "" }, [
    el("h2", { class: "confirm-screen__title display", text: "Applications are closed." }),
    el("p", {
      class: "confirm-screen__body",
      text: pastDate
        ? `Applications for this Talent Quest closed on ${fmt(info.applicationCloses)}. The next one will be announced here.`
        : "Applications for the Talent Quest aren't open at the moment. The next round will be announced here.",
    }),
    el("div", { class: "confirm-screen__actions" }, [el("a", { class: "btn btn-line", href: "events", text: "See the event dates" })]),
  ]));
}

/* ---------------------------------------------------------------------
 * Part one — the concert
 * ------------------------------------------------------------------- */
function renderConcert(concert, fmtLong) {
  if (!concert) return;

  const nameEl = document.querySelector("[data-concert-name]");
  if (nameEl) nameEl.textContent = concert.name;

  const descEl = document.querySelector("[data-concert-desc]");
  if (descEl) descEl.textContent = concert.description;

  const factsEl = document.querySelector("[data-concert-facts]");
  if (factsEl) {
    const facts = [
      ["Date", fmtLong(concert.date)],
      ["Venue", `${concert.venue}, ${concert.city}`],
      ["Time", concert.doors ? `Doors ${concert.doors} — set begins ${concert.start}` : "To be announced"],
      ["Capacity", `${concert.capacity.toLocaleString()} seats`],
      ["Admission", concert.admission],
    ];
    const nodes = [];
    facts.forEach(([label, value]) => {
      nodes.push(el("div", {}, [el("dt", { text: label }), el("dd", { text: value })]));
    });
    factsEl.replaceChildren(...nodes);
  }

  const highlightsEl = document.querySelector("[data-concert-highlights]");
  if (highlightsEl) {
    highlightsEl.replaceChildren(
      ...concert.highlights.map((h, i) =>
        el("article", { class: "highlight-card" }, [
          el("span", { class: "highlight-card__num", text: String(i + 1).padStart(2, "0") }),
          el("h3", { class: "highlight-card__title display", text: h.title }),
          el("p", { class: "highlight-card__body", text: h.body }),
        ])
      )
    );
  }
}

/* ---------------------------------------------------------------------
 * Part two — the talent quest
 * ------------------------------------------------------------------- */
function renderQuest(quest, info, fmt) {
  if (!quest) return;

  const titleEl = document.querySelector("[data-quest-title]");
  if (titleEl) titleEl.textContent = quest.title;

  const taglineEl = document.querySelector("[data-quest-tagline]");
  if (taglineEl) taglineEl.textContent = quest.tagline;

  const leadEl = document.querySelector("[data-quest-lead]");
  if (leadEl) leadEl.textContent = quest.description;

  const datesEl = document.querySelector("[data-quest-dates]");
  if (datesEl) {
    const rows = [
      ["Applications open", fmt(info.applicationOpens)],
      ["Applications close", fmt(info.applicationCloses)],
      ["SPAW Talent Quest", fmt(info.questDate)],
      ["SPAW Global Concert", fmt(info.concert.date)],
    ];
    datesEl.replaceChildren(
      ...rows.map(([label, value]) =>
        el("div", { class: "quest-dates__row" }, [
          el("span", { text: label }),
          el("span", { class: "mono-index", text: value }),
        ])
      )
    );
  }

  // The prizes (admin → Symphony). The homepage slide carries the same
  // three, in its own HTML.
  const prizesEl = document.querySelector("[data-quest-prizes]");
  if (prizesEl && Array.isArray(quest.prizes) && quest.prizes.length) {
    prizesEl.replaceChildren(
      ...quest.prizes.map((p, i) =>
        el("article", { class: `prize-card${i === 0 ? " prize-card--first" : ""}` }, [
          el("p", { class: "prize-card__place", text: p.place }),
          el("p", { class: "prize-card__amount display", text: p.amount }),
          p.extra ? el("p", { class: "prize-card__extra", text: p.extra }) : null,
        ].filter(Boolean))
      )
    );
  }

  const benefitsEl = document.querySelector("[data-quest-benefits]");
  if (benefitsEl) {
    benefitsEl.replaceChildren(
      ...quest.benefits.map((b, i) =>
        el("article", { class: "benefit-card" }, [
          el("span", { class: "benefit-card__num mono-index", text: String(i + 1).padStart(2, "0") }),
          el("h3", { class: "benefit-card__title display", text: b.title }),
          el("p", { class: "benefit-card__body", text: b.body }),
        ])
      )
    );
  }
}

/* ---------------------------------------------------------------------
 * Application form — validate -> submit -> success/error
 * ------------------------------------------------------------------- */
// Phone (with its country code), gender, state and country, and age
// category, drawn into their places in the form (form-fields.js).
const appQuestions = {};

function wireApplicationForm() {
  const form = document.querySelector("[data-application-form]");
  if (!form) return;
  const banner = form.querySelector("[data-form-error]");

  const QUESTIONS = {
    phone: { id: "phone", label: "Phone", type: "phone", required: true, full: true },
    gender: { id: "gender", label: "Gender", type: "select", required: true, options: FormFields.GENDERS },
    location: { id: "location", label: "State and country", type: "location", required: true, full: true },
    age: { id: "age", label: "Age category", type: "select", required: true, options: (DB.symphony && DB.symphony.ageCategories) || FormFields.AGE_CATEGORIES },
  };
  form.querySelectorAll("[data-app-question]").forEach((slot) => {
    const q = QUESTIONS[slot.dataset.appQuestion];
    if (!q) return;
    appQuestions[q.id] = FormFields.render(q, { prefix: "app" });
    slot.replaceWith(appQuestions[q.id].node);
  });

  // The first thing typed or chosen counts as starting an application
  // (the analytics' step-by-step view: page, started, sent).
  const started = () => {
    form.removeEventListener("input", started);
    form.removeEventListener("change", started);
    if (window.Track) Track.event("apply_start", { label: "Talent Quest" });
  };
  form.addEventListener("input", started);
  form.addEventListener("change", started);
  const submitBtn = form.querySelector("button[type='submit']");

  const fields = {
    fullName: form.querySelector("#app-name"),
    email: form.querySelector("#app-email"),
    track: form.querySelector("#app-track"),
    bio: form.querySelector("#app-bio"),
    youtube: form.querySelector("#app-youtube"),
    socialLink: form.querySelector("#app-social"),
    projectLink: form.querySelector("#app-project"),
  };

  function clearFieldErrors() {
    form.querySelectorAll("[data-field-error]").forEach((e) => (e.textContent = ""));
  }

  function setFieldError(key, message) {
    const errEl = form.querySelector(`[data-field-error="${key}"]`);
    if (errEl) errEl.textContent = message;
  }

  function validate() {
    clearFieldErrors();
    let valid = true;
    if (!fields.fullName.value.trim()) { setFieldError("fullName", "Enter your full name."); valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim())) { setFieldError("email", "Enter a valid email address."); valid = false; }
    Object.values(appQuestions).forEach((q) => { if (q.check()) valid = false; });
    if (!fields.track.value) { setFieldError("track", "Choose a track."); valid = false; }
    if (!fields.bio.value.trim() || fields.bio.value.trim().length < 30) { setFieldError("bio", "Tell us a bit more — at least 30 characters."); valid = false; }
    if (!fields.youtube.value.trim()) { setFieldError("youtube", "Add the YouTube link to your entry."); valid = false; }
    else if (!FormFields.youtubeId(fields.youtube.value)) { setFieldError("youtube", "That doesn't look like a YouTube link. It should look like https://www.youtube.com/watch?v=…"); valid = false; }
    if (!form.querySelector("#app-terms").checked) { setFieldError("terms", "You need to agree to the terms to continue."); valid = false; }
    return valid;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    banner.textContent = "";
    if (!validate()) {
      form.querySelector(".field-error:not(:empty)")?.closest(".field")?.querySelector("input,textarea,select")?.focus();
      return;
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Submitting\u2026";

    const place = appQuestions.location.read();
    const payload = {
      fullName: fields.fullName.value.trim(),
      email: fields.email.value.trim(),
      phone: appQuestions.phone.read(),
      gender: appQuestions.gender.read(),
      ageCategory: appQuestions.age.read(),
      state: place.state,
      country: place.country,
      location: FormFields.formatValue(place),
      track: fields.track.value,
      bio: fields.bio.value.trim(),
      youtube: FormFields.youtubeWatch(fields.youtube.value),
      socialLink: fields.socialLink.value.trim(),
      projectLink: fields.projectLink.value.trim(),
      agreedToTerms: form.querySelector("#app-terms").checked,
    };

    try {
      const application = await api.submitTalentApplication(payload);
      FormDone.go("applications", "", { id: application.id, email: application.email, name: application.fullName }, "spaw-apply-thank-you");
    } catch (err) {
      banner.textContent = err.message || "Something went wrong submitting your application. Please try again.";
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

/* ---------------------------------------------------------------------
 * spaw-apply-thank-you: after applying
 * ------------------------------------------------------------------- */
function applicationThankYou() {
  const root = document.querySelector("[data-apply-done]");
  if (!root) return;
  const app = FormDone.read("applications");
  const idLine = root.querySelector("[data-done-id]");
  if (!app) {
    // Opened some other way than straight after applying.
    root.querySelector("[data-done-body]").textContent = "Thank you for applying to the SPAW Talent Quest. Every applicant hears back, whichever way the answer goes.";
    idLine.hidden = true;
    return;
  }
  // Counted once, as it happens: the Meta Pixel's Lead.
  if (FormDone.first("applications")) api._lead("Talent Quest application", "SPAW Talent Quest", app.id);
  root.querySelector("[data-done-email]").textContent = app.email;
  idLine.querySelector("span").textContent = app.id;
  FormDone.emailed("applications").then((sent) => {
    if (!sent) return;
    const line = root.querySelector("[data-done-emailed]");
    line.textContent = `We've emailed a confirmation to ${app.email}.`;
    line.hidden = false;
  });
}
