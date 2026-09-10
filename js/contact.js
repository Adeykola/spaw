/**
 * contact.js
 * ----------------------------------------------------------------------
 * Drives contact.html — one form serving two jobs.
 *
 * Contact and booking used to be two pages asking for eighty per cent of
 * the same information. They are now one form with a mode switch: the
 * shared fields never move, and the booking-only block is revealed (and
 * only then required) when the visitor picks that door. Deep links to
 * contact.html#booking arrive with booking mode already selected.
 *
 * Submission goes through api.submitEnquiry (see data.js), which returns
 * a per-field error map so individual inputs can be marked rather than
 * only showing a banner. Reuses el/showError from app.js.
 * ----------------------------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  wireContactForm();
  wireYear();
});

function wireContactForm() {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const bookingFields = document.querySelector("[data-booking-fields]");
  const confirm = document.querySelector("[data-contact-confirm]");
  const banner = form.querySelector("[data-form-error]");
  const submitBtn = form.querySelector("button[type='submit']");
  const modeInputs = Array.from(form.querySelectorAll("[data-mode-input]"));
  const phoneReq = form.querySelector("[data-phone-req]");
  const messageLabel = form.querySelector("[data-message-label]");
  const messageHint = form.querySelector("[data-message-hint]");
  const responseNote = form.querySelector("[data-response-note]");

  const copy = {
    message: {
      submit: "Send enquiry",
      messageLabel: "Your message *",
      messageHint: "The more context you give, the faster the reply comes back.",
      response: "Most messages are answered within three working days.",
      confirmTitle: "Message received.",
      confirmBody: (e) => `Thank you, ${e.name}. Your note is with the team and a reply is on its way to ${e.email}.`,
    },
    booking: {
      submit: "Send booking request",
      messageLabel: "About the invitation *",
      messageHint: "Tell us about the room, the moment in the programme, and what you are believing for.",
      response: "Booking requests are answered within five working days.",
      confirmTitle: "Booking request received.",
      confirmBody: (e) => `Thank you, ${e.name}. The team is checking availability for ${formatEnquiryDate(e.eventDate)} and will reply to ${e.email}.`,
    },
  };

  function currentMode() {
    return modeInputs.find((i) => i.checked)?.value || "message";
  }

  function applyMode(mode) {
    const text = copy[mode];
    const isBooking = mode === "booking";

    if (bookingFields) bookingFields.hidden = !isBooking;
    form.dataset.mode = mode;

    // Required-ness follows the mode, so a plain message is never blocked
    // by fields that are not on screen.
    bookingFields?.querySelectorAll("input, select").forEach((input) => {
      if (input.type === "checkbox") return;
      const optional = input.name === "attendance" || input.name === "budget";
      input.toggleAttribute("required", isBooking && !optional);
    });

    if (phoneReq) phoneReq.hidden = !isBooking;
    document.querySelector("#c-phone")?.toggleAttribute("required", isBooking);

    if (submitBtn) submitBtn.textContent = text.submit;
    if (messageLabel) messageLabel.textContent = text.messageLabel;
    if (messageHint) messageHint.textContent = text.messageHint;
    if (responseNote) responseNote.textContent = text.response;
  }

  modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      applyMode(currentMode());
      clearErrors();
    });
  });

  // Deep link: contact.html#booking opens on the booking door.
  function syncFromHash() {
    if (window.location.hash !== "#booking") return;
    const bookingInput = modeInputs.find((i) => i.value === "booking");
    if (bookingInput && !bookingInput.checked) {
      bookingInput.checked = true;
      applyMode("booking");
    }
  }
  syncFromHash();
  window.addEventListener("hashchange", syncFromHash);

  applyMode(currentMode());

  /* ---- Errors ---- */
  function clearErrors() {
    banner.textContent = "";
    form.querySelectorAll("[data-field-error]").forEach((n) => (n.textContent = ""));
    form.querySelectorAll("[aria-invalid]").forEach((n) => n.removeAttribute("aria-invalid"));
  }

  function showFieldErrors(fields) {
    Object.entries(fields).forEach(([key, message]) => {
      const target = form.querySelector(`[data-field-error="${key}"]`);
      if (target) target.textContent = message;
      const input = form.querySelector(`[name="${key}"]`);
      if (input) input.setAttribute("aria-invalid", "true");
    });
    const first = form.querySelector("[aria-invalid='true']");
    if (first) {
      first.focus();
      first.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /* ---- Submit ---- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const mode = currentMode();
    const value = (selector) => form.querySelector(selector)?.value.trim() || "";
    const payload = {
      type: mode,
      name: value("#c-name"),
      email: value("#c-email"),
      phone: value("#c-phone"),
      subject: value("#c-subject"),
      message: value("#c-message"),
      joinNewsletter: form.querySelector("#c-newsletter")?.checked || false,
    };

    if (mode === "booking") {
      Object.assign(payload, {
        organisation: value("#c-org"),
        eventType: value("#c-event-type"),
        eventDate: value("#c-date"),
        city: value("#c-city"),
        attendance: value("#c-attendance"),
        budget: value("#c-budget"),
        needs: Array.from(form.querySelectorAll("[name='needs']:checked")).map((n) => n.value),
      });
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Sending…";

    try {
      const enquiry = await api.submitEnquiry(payload);

      // The newsletter opt-in is a separate subscription; a duplicate or
      // invalid address there must not fail an otherwise good enquiry.
      if (payload.joinNewsletter) {
        try { await api.subscribeNewsletter(payload.email); } catch (_) { /* already subscribed — fine */ }
      }

      const text = copy[mode];
      form.hidden = true;
      if (confirm) {
        confirm.hidden = false;
        confirm.querySelector("[data-confirm-title]").textContent = text.confirmTitle;
        confirm.querySelector("[data-confirm-body]").textContent = text.confirmBody(enquiry);
        confirm.querySelector("[data-confirm-id]").textContent = enquiry.id;
        confirm.scrollIntoView({ behavior: "smooth", block: "center" });
        confirm.querySelector("[data-contact-reset]")?.focus();
      }
    } catch (err) {
      banner.textContent = err.message || "Something went wrong sending that. Please try again.";
      if (err.fields) showFieldErrors(err.fields);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });

  document.querySelector("[data-contact-reset]")?.addEventListener("click", () => {
    form.reset();
    clearErrors();
    applyMode(currentMode());
    if (confirm) confirm.hidden = true;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.querySelector("#c-name")?.focus();
  });
}

function formatEnquiryDate(dateStr) {
  if (!dateStr) return "your date";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "your date";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
