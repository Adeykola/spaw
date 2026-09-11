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
        el("div", {}, [el("strong", { text: fmt(info.concert.date) }), el("span", { text: "The Concert" })])
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

    if (termsEl) termsEl.textContent = info.terms;
  } catch (err) {
    console.error("[talent] symphony info failed", err);
  }
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
      ["SPAW Concert", fmt(info.concert.date)],
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
 * Simulated upload fields (audio / video) — no backend, but a real
 * progress + success/error UI so the journey feels complete.
 * ------------------------------------------------------------------- */
function wireUploadFields() {
  document.querySelectorAll("[data-upload-field]").forEach((field) => {
    const input = field.querySelector("input[type='file']");
    const label = field.querySelector("[data-upload-filename]");
    const fill = field.querySelector("[data-upload-fill]");
    if (!input) return;

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;

      const maxMB = Number(field.dataset.maxMb || 50);
      if (file.size > maxMB * 1024 * 1024) {
        field.dataset.status = "error";
        if (label) label.textContent = `File too large — keep it under ${maxMB}MB.`;
        input.value = "";
        return;
      }

      field.dataset.status = "uploading";
      if (label) label.textContent = file.name;
      if (fill) fill.style.width = "0%";

      let pct = 0;
      const timer = setInterval(() => {
        pct += 8 + Math.random() * 12;
        if (pct >= 100) {
          pct = 100;
          clearInterval(timer);
          field.dataset.status = "done";
          if (label) label.textContent = `${file.name} \u2014 uploaded`;
        }
        if (fill) fill.style.width = `${pct}%`;
      }, 140);
    });
  });
}

/* ---------------------------------------------------------------------
 * Application form — validate -> submit -> success/error
 * ------------------------------------------------------------------- */
function wireApplicationForm() {
  const form = document.querySelector("[data-application-form]");
  if (!form) return;
  const banner = form.querySelector("[data-form-error]");
  const submitBtn = form.querySelector("button[type='submit']");
  const confirmScreen = document.querySelector("[data-confirm-screen]");

  const fields = {
    fullName: form.querySelector("#app-name"),
    email: form.querySelector("#app-email"),
    phone: form.querySelector("#app-phone"),
    location: form.querySelector("#app-location"),
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
    if (!fields.phone.value.trim()) { setFieldError("phone", "Enter a phone number."); valid = false; }
    if (!fields.location.value.trim()) { setFieldError("location", "Tell us your city and country."); valid = false; }
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

    const payload = {
      fullName: fields.fullName.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      location: fields.location.value.trim(),
      track: fields.track.value,
      bio: fields.bio.value.trim(),
      socialLink: fields.socialLink.value.trim(),
      projectLink: fields.projectLink.value.trim(),
      agreedToTerms: form.querySelector("#app-terms").checked,
    };

    try {
      const application = await api.submitTalentApplication(payload);
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
