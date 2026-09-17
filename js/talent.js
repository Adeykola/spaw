/**
 * talent.js
 * ----------------------------------------------------------------------
 * Drives symphony.html: renders the Symphony info block, wires the
 * simulated file-upload widgets, and runs the full application journey
 * — client-side validation, a real (simulated) submit request through
 * api.submitTalentApplication, and a confirmation screen with a
 * generated application ID. Everything persists to localStorage via
 * data.js so admin.html can list real submissions.
 * ----------------------------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  renderSymphonyInfo();
  wireUploadFields();
  wireApplicationForm();
  wireYear();
});

async function renderSymphonyInfo() {
  const datesEl = document.querySelector("[data-symphony-dates]");
  const tracksEl = document.querySelector("[data-symphony-tracks]");
  const trackSelect = document.querySelector("[data-track-select]");
  const termsEl = document.querySelector("[data-symphony-terms]");
  if (!datesEl && !tracksEl && !termsEl) return;

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
 * Sample upload fields (audio / video). Choosing a file checks it and
 * keeps it on the field; it travels with the application when the form
 * is sent (live, into the private applications folder).
 * ------------------------------------------------------------------- */
function wireUploadFields() {
  document.querySelectorAll("[data-upload-field]").forEach((field) => {
    const input = field.querySelector("input[type='file']");
    const label = field.querySelector("[data-upload-filename]");
    const fill = field.querySelector("[data-upload-fill]");
    if (!input) return;
    const kind = (input.getAttribute("accept") || "").split("/")[0] || "file"; // "audio" or "video"

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      field.file = null;
      if (fill) fill.style.width = "0%";
      if (!file) { delete field.dataset.status; if (label) label.textContent = ""; return; }

      const maxMB = Number(field.dataset.maxMb || 50);
      if (file.size > maxMB * 1024 * 1024) {
        field.dataset.status = "error";
        if (label) label.textContent = `That file is ${Math.ceil(file.size / 1048576)} MB. Keep it under ${maxMB} MB.`;
        input.value = "";
        return;
      }
      if (kind !== "file" && file.type && !file.type.startsWith(`${kind}/`)) {
        field.dataset.status = "error";
        if (label) label.textContent = `That doesn't look like ${kind === "audio" ? "an audio" : "a video"} file.`;
        input.value = "";
        return;
      }

      file.kind = kind;
      field.file = file;
      field.dataset.status = "done";
      if (label) label.textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB. It's sent with your application.`;
      if (fill) fill.style.width = "100%";
    });
  });
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
  const confirmScreen = document.querySelector("[data-confirm-screen]");

  const fields = {
    fullName: form.querySelector("#app-name"),
    email: form.querySelector("#app-email"),
    track: form.querySelector("#app-track"),
    bio: form.querySelector("#app-bio"),
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
      socialLink: fields.socialLink.value.trim(),
      projectLink: fields.projectLink.value.trim(),
      agreedToTerms: form.querySelector("#app-terms").checked,
    };

    const files = Array.from(form.querySelectorAll("[data-upload-field]")).map((f) => f.file).filter(Boolean);
    if (files.length) submitBtn.textContent = files.length === 1 ? "Uploading your sample…" : "Uploading your samples…";

    try {
      const application = await api.submitTalentApplication(payload, files);
      form.hidden = true;
      if (confirmScreen) {
        confirmScreen.hidden = false;
        confirmScreen.querySelector("[data-confirm-id]").textContent = application.id;
        confirmScreen.querySelector("[data-confirm-email]").textContent = application.email;
        confirmScreen.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      banner.textContent = err.message || "Something went wrong submitting your application. Please try again.";
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}
