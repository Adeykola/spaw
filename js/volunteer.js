/**
 * volunteer.js
 * ----------------------------------------------------------------------
 * Drives spaw-volunteer.html: the teams and days to choose from (admin →
 * Volunteering, and the Symphony dates), the questions everyone answers
 * (form-fields.js), signing the Terms and Conditions for Volunteers by
 * ticking the box and typing their full name, and the submit through
 * api.submitVolunteer, which goes on to spaw-volunteer-thank-you.html with
 * the reference. The team sees every volunteer in the admin (Inbox →
 * Volunteers).
 *
 * On spaw-volunteer-terms.html it only runs the print button.
 * ----------------------------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  wireVolunteerForm();
  volunteerThankYou();
  wirePrint();
  wireYear();
});

function wirePrint() {
  document.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));
}

// A group of tick boxes (the teams, the days) inside its fieldset.
function checkGroup(host, name, options) {
  host.replaceChildren(...options.map((o) =>
    el("label", { class: "checkbox-field" }, [el("input", { type: "checkbox", name, value: o }), el("span", { text: o })])));
}
const ticked = (form, name) => Array.from(form.querySelectorAll(`[name='${name}']:checked`)).map((i) => i.value);

async function wireVolunteerForm() {
  const form = document.querySelector("[data-volunteer-form]");
  if (!form) return;
  const banner = form.querySelector("[data-form-error]");
  const submitBtn = form.querySelector("button[type='submit']");

  // Phone (with its country code), gender, age category, state and country,
  // and the emergency contact's phone, drawn into their places.
  const questions = {};
  const QUESTIONS = {
    phone: { id: "phone", label: "Phone", type: "phone", required: true, full: true },
    gender: { id: "gender", label: "Gender", type: "select", required: true, options: FormFields.GENDERS },
    age: { id: "age", label: "Age category", type: "select", required: true, options: (DB.symphony && DB.symphony.ageCategories) || FormFields.AGE_CATEGORIES },
    location: { id: "location", label: "State and country", type: "location", required: true, full: true },
    emergencyPhone: { id: "emergencyPhone", label: "Their phone", type: "phone", required: true, full: true },
  };
  form.querySelectorAll("[data-vol-question]").forEach((slot) => {
    const q = QUESTIONS[slot.dataset.volQuestion];
    if (!q) return;
    questions[q.id] = FormFields.render(q, { prefix: "vol" });
    slot.replaceWith(questions[q.id].node);
  });

  const fields = {
    fullName: form.querySelector("#vol-name"),
    email: form.querySelector("#vol-email"),
    church: form.querySelector("#vol-church"),
    experience: form.querySelector("#vol-experience"),
    emergencyName: form.querySelector("#vol-emergency-name"),
    terms: form.querySelector("#vol-terms"),
    signature: form.querySelector("#vol-signature"),
  };
  const signedOn = form.querySelector("[data-signed-on]");
  if (signedOn) signedOn.textContent = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  try {
    const v = await api.getVolunteering();
    checkGroup(form.querySelector("[data-vol-teams]"), "teams", [...v.teams, "Wherever I'm needed"]);
    checkGroup(form.querySelector("[data-vol-days]"), "days", v.days);
    renderDates(v);
    if (questions.age && Array.isArray(v.ageCategories) && v.ageCategories.length) questions.age.setOptions(v.ageCategories);
    if (!api.volunteeringOpen()) showClosed(form, v);
  } catch (err) {
    console.error("[volunteer] settings failed", err);
  }

  const setError = (key, message) => {
    const e = form.querySelector(`[data-field-error="${key}"]`);
    if (e) e.textContent = message;
  };
  const same = (a, b) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

  function validate() {
    form.querySelectorAll(".field-error").forEach((e) => { e.textContent = ""; });
    let valid = true;
    if (!fields.fullName.value.trim()) { setError("fullName", "Enter your full name."); valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim())) { setError("email", "Enter a valid email address."); valid = false; }
    Object.values(questions).forEach((q) => { if (q.check()) valid = false; });
    if (!ticked(form, "teams").length) { setError("teams", "Choose at least one team."); valid = false; }
    if (!ticked(form, "days").length) { setError("days", "Choose at least one day."); valid = false; }
    if (!fields.emergencyName.value.trim()) { setError("emergencyName", "Who should we call in an emergency?"); valid = false; }
    if (!fields.terms.checked) { setError("terms", "You need to agree to the Terms and Conditions for Volunteers."); valid = false; }
    if (!fields.signature.value.trim()) { setError("signature", "Type your full name to sign."); valid = false; }
    else if (fields.fullName.value.trim() && !same(fields.signature.value, fields.fullName.value)) {
      setError("signature", "Type your full name exactly as you gave it above."); valid = false;
    }
    return valid;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    banner.textContent = "";
    if (!validate()) {
      const first = form.querySelector(".field-error:not(:empty)");
      const holder = first && (first.closest(".field, .check-group"));
      const input = holder && holder.querySelector("input, select, textarea");
      if (input) input.focus();
      return;
    }
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = "Sending…";

    const place = questions.location.read();
    const payload = {
      fullName: fields.fullName.value.trim().replace(/\s+/g, " "),
      email: fields.email.value.trim(),
      phone: questions.phone.read(),
      gender: questions.gender.read(),
      ageCategory: questions.age.read(),
      state: place.state,
      country: place.country,
      location: FormFields.formatValue(place),
      teams: ticked(form, "teams"),
      days: ticked(form, "days"),
      church: fields.church.value.trim(),
      experience: fields.experience.value.trim(),
      emergencyName: fields.emergencyName.value.trim(),
      emergencyPhone: questions.emergencyPhone.read(),
      agreedToTerms: fields.terms.checked,
      signature: fields.signature.value.trim().replace(/\s+/g, " "),
    };

    try {
      const volunteer = await api.submitVolunteer(payload);
      FormDone.go("volunteers", "", { id: volunteer.id, email: volunteer.email, name: volunteer.fullName }, "spaw-volunteer-thank-you");
    } catch (err) {
      banner.textContent = err.message || "Something went wrong sending your registration. Please try again.";
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  });
}

// The dates under the page's heading: the two SPAW days, and the last day
// to sign up.
function renderDates(v) {
  const host = document.querySelector("[data-vol-dates]");
  if (!host) return;
  const s = DB.symphony || {};
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  host.replaceChildren(...[
    [s.questDate, "SPAW Talent Quest"],
    [s.concert && s.concert.date, "SPAW Global Concert"],
    [api.volunteeringOpen() ? v.closes : "", "Sign up by"],
  ].filter(([d]) => d).map(([d, label]) => el("div", {}, [el("strong", { text: fmt(d) }), el("span", { text: label })])));
}

// Switched off in the admin, or past its closing date: the form gives way
// to a note saying so.
function showClosed(form, v) {
  const past = v.closes && new Date(`${v.closes}T23:59:59`).getTime() < Date.now();
  const when = past ? new Date(`${v.closes}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  form.hidden = true;
  form.after(el("div", { class: "confirm-screen", "data-volunteering-closed": "" }, [
    el("h2", { class: "confirm-screen__title display", text: "Volunteer registration is closed." }),
    el("p", {
      class: "confirm-screen__body",
      text: past
        ? `Volunteer registration for SPAW closed on ${when}. Thank you for wanting to serve: the next call will be announced here and on the WhatsApp channel.`
        : "Volunteer registration isn't open at the moment. The next call will be announced here and on the WhatsApp channel.",
    }),
    el("div", { class: "confirm-screen__actions" }, [el("a", { class: "btn btn-line", href: "symphony", text: "About SPAW" })]),
  ]));
}

// spaw-volunteer-thank-you: after signing up.
function volunteerThankYou() {
  const root = document.querySelector("[data-volunteer-done]");
  if (!root) return;
  const v = FormDone.read("volunteers");
  const idLine = root.querySelector("[data-done-id]");
  if (!v) {
    // Opened some other way than straight after signing up.
    root.querySelector("[data-done-body]").textContent = "Thank you for offering to serve at Symphony of Praise & Worship. The volunteer team will be in touch to confirm your place and your team.";
    idLine.hidden = true;
    return;
  }
  FormDone.first("volunteers");
  root.querySelector("[data-done-email]").textContent = v.email;
  idLine.querySelector("span").textContent = v.id;
  FormDone.emailed("volunteers").then((sent) => {
    if (!sent) return;
    const line = root.querySelector("[data-done-emailed]");
    line.textContent = `We've emailed a confirmation to ${v.email}.`;
    line.hidden = false;
  });
}
