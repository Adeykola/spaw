/**
 * checkin.js
 * ----------------------------------------------------------------------
 * The registration team's check-in (checkin.html; checkin-test.html, with
 * data-checkin-test on <body>, for the test events). A volunteer on the
 * Registration team picks the event, types the email they volunteered
 * with, and signs in with the one-time code emailed to it. They stay
 * signed in on this phone until the event's check-in window closes (admin
 * → Check-in access). Then: type or scan a ticket's ID, or find a guest by
 * name, email or phone, and check them in. The database checks the
 * sign-in on every call (Backend.checkin, supabase/setup-7.sql).
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  const root = document.querySelector("[data-checkin]");
  if (!root || !window.Backend) return;
  const TEST = document.body.hasAttribute("data-checkin-test");
  const KEY = `drajokesings:checkin:${TEST ? "test" : "live"}`;
  const ck = Backend.checkin;
  const $ = (sel) => root.querySelector(sel);

  function make(tag, attrs = {}, kids = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "onclick") n.addEventListener("click", v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    kids.filter((k) => k != null).forEach((k) => n.append(k));
    return n;
  }
  const time = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const when = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  // A database function that isn't there yet: setup-7.sql hasn't been run.
  const say = (err) => (err && err.code === "PGRST202"
    ? "Check-in isn't set up yet. Ask the site's admin to run supabase/setup-7.sql."
    : (err && err.message) || "Something went wrong. Try again.");

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { return null; } };
  const keep = (s) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (_) { /* this phone only */ } };

  function step(name) {
    root.querySelectorAll("[data-ck-step]").forEach((s) => { s.hidden = s.dataset.ckStep !== name; });
    $("[data-ck-loading]").hidden = true;
    const who = document.querySelector("[data-ck-who]");
    who.hidden = name !== "desk";
  }
  function error(stepName, message) {
    const e = root.querySelector(`[data-ck-step="${stepName}"] [data-ck-error]`);
    e.textContent = message || "";
  }

  /* ---------------- 1. Sign in ---------------- */
  let events = [];
  let pending = null; // { email, eventId }

  async function showSignIn() {
    step("email");
    const select = $("[data-ck-event]");
    const field = $("[data-ck-event-field]");
    const form = $("[data-ck-email-form]");
    const closed = $("[data-ck-closed]");
    try {
      events = await ck.events(TEST);
    } catch (err) {
      form.hidden = true;
      closed.hidden = false;
      closed.textContent = say(err);
      return;
    }
    const open = events.filter((e) => e.open);
    if (!open.length) {
      form.hidden = true;
      closed.hidden = false;
      closed.textContent = events.length
        ? `Check-in opens ${when(events[0].opensAt)} for ${events[0].name}. Come back then.`
        : "No event's check-in is open right now. The admin opens it for each event.";
      return;
    }
    form.hidden = false;
    closed.hidden = true;
    select.replaceChildren(...open.map((e) => make("option", { value: e.id, text: e.name })));
    // One event: its name instead of a list of one.
    field.hidden = open.length === 1;
    root.querySelectorAll(".ck-event-one").forEach((n) => n.remove());
    if (open.length === 1) field.insertAdjacentElement("afterend", make("p", { class: "ck-event-one", text: open[0].name }));
    $("#ck-email").focus();
  }

  async function sendCode(email, eventId) {
    const res = await ck.requestCode(email, eventId);
    pending = { email, eventId };
    // Live, the send-email function emails it; the demo shows it here.
    if (res && res.id && Backend.mode === "live") {
      const sent = await Backend.email.send("checkin_codes", res.id);
      if (!sent.sent) throw new Error("The code couldn't be emailed just now. Try again in a moment, or tell the admin (the send-email function may need deploying).");
    }
    const demo = $("[data-ck-demo-code]");
    demo.hidden = !(res && res.demoCode);
    if (res && res.demoCode) demo.textContent = `Demo mode: no email is sent. Your code is ${res.demoCode}.`;
  }

  $("[data-ck-email-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    error("email", "");
    const email = $("#ck-email").value.trim();
    const eventId = $("[data-ck-event]").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error("email", "Type the email you volunteered with."); return; }
    const btn = e.submitter || $("[data-ck-email-form] button");
    btn.disabled = true;
    try {
      await sendCode(email, eventId);
      $("[data-ck-sent-to]").textContent = email;
      step("code");
      $("#ck-code").value = "";
      $("#ck-code").focus();
    } catch (err) {
      error("email", say(err));
    } finally {
      btn.disabled = false;
    }
  });

  $("[data-ck-code-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    error("code", "");
    const code = $("#ck-code").value.replace(/\D/g, "");
    if (code.length !== 6) { error("code", "The code has 6 digits."); return; }
    const btn = e.submitter || $("[data-ck-code-form] button");
    btn.disabled = true;
    try {
      const res = await ck.verify(pending.email, pending.eventId, code);
      if (!res || !res.ok) { error("code", (res && res.error) || "That code didn't work."); return; }
      keep({ token: res.token, email: res.email, name: res.name, eventName: res.eventName, expiresAt: res.expiresAt });
      await showDesk();
    } catch (err) {
      error("code", say(err));
    } finally {
      btn.disabled = false;
    }
  });
  $("#ck-code").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    if (e.target.value.length === 6) $("[data-ck-code-form]").requestSubmit();
  });

  let resendAt = 0;
  $("[data-ck-resend]").addEventListener("click", async () => {
    if (!pending) return;
    if (Date.now() < resendAt) { error("code", "Give the first email a minute to arrive, then ask again."); return; }
    resendAt = Date.now() + 30e3;
    try {
      await sendCode(pending.email, pending.eventId);
      $("#ck-code").value = "";
      error("code", "A new code is on its way. Use the newest email.");
    } catch (err) {
      error("code", say(err));
    }
  });
  $("[data-ck-restart]").addEventListener("click", () => { pending = null; showSignIn(); });

  /* ---------------- 3. The desk ---------------- */
  let session = null;
  let busy = false;
  let stopCamera = () => {};

  function signOut(message) {
    stopCamera();
    if (session) ck.signOut(session.token).catch(() => null);
    session = null;
    keep(null);
    showSignIn().then(() => { if (message) error("email", message); });
  }
  // A call that finds the sign-in over sends them back to sign in.
  async function guarded(fn) {
    try { return await fn(); } catch (err) {
      if (/sign-in has ended/i.test(err.message || "")) { signOut(err.message); return null; }
      throw err;
    }
  }

  function drawCounts(checkedIn, registered) {
    if (typeof registered === "number") $("[data-ck-total]").textContent = String(registered);
    if (typeof checkedIn === "number") $("[data-ck-in]").textContent = String(checkedIn);
    const total = Number($("[data-ck-total]").textContent) || 0;
    const inside = Number($("[data-ck-in]").textContent) || 0;
    $("[data-ck-bar]").style.width = `${total ? Math.min(100, (inside / total) * 100) : 0}%`;
  }

  async function showDesk() {
    session = read();
    if (!session) return showSignIn();
    let me;
    try {
      me = await ck.whoami(session.token);
    } catch (err) {
      keep(null);
      session = null;
      await showSignIn();
      if (!/sign-in has ended/i.test(err.message || "")) error("email", say(err));
      return undefined;
    }
    step("desk");
    $("[data-ck-event-name]").textContent = me.eventName;
    $("[data-ck-until]").textContent = `Signed in as ${me.name || me.email} until ${when(me.expiresAt)}, when check-in closes.`;
    drawCounts(Number(me.checkedIn), Number(me.registered));
    const who = document.querySelector("[data-ck-who]");
    who.replaceChildren(make("span", { text: me.name || me.email }), make("button", { type: "button", class: "ck-link", text: "Sign out", onclick: () => signOut() }));
    $("#ck-ticket").focus();
    // Back to the sign-in when the window closes with the page open.
    const left = Date.parse(me.expiresAt) - Date.now();
    if (left > 0 && left < 2 ** 31) setTimeout(() => signOut("Check-in for this event has closed."), left);
    return undefined;
  }

  function show(outcome, main, detail) {
    const box = $("[data-ck-result]");
    box.dataset.outcome = outcome;
    box.replaceChildren(...[make("p", { class: "ck-result__main", text: main }), detail ? make("p", { class: "ck-result__detail", text: detail }) : null].filter(Boolean));
  }

  async function checkIn(raw) {
    const id = String(raw || "").trim().toUpperCase();
    if (!id || busy || !session) return;
    busy = true;
    try {
      const res = await guarded(() => ck.mark(session.token, id));
      if (!res) return;
      if (res.already) {
        show("warn", `${res.name} is already checked in.`, `At ${time(res.checkedInAt)}${res.checkedInBy ? ` by ${res.checkedInBy}` : ""}.`);
        if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
      } else {
        show("success", `✓ ${res.name} is checked in.`, `${res.id} · ${time(res.checkedInAt)}`);
        drawCounts(Number(res.checkedIn));
        const list = $("[data-ck-recent]");
        if (list.querySelector(".ck-muted")) list.replaceChildren();
        list.prepend(make("li", { text: `${time(res.checkedInAt)} · ${res.name} · ${res.id}` }));
        if (navigator.vibrate) navigator.vibrate(80);
      }
      $("#ck-ticket").value = "";
      runSearch();
    } catch (err) {
      show("error", say(err));
    } finally {
      busy = false;
    }
  }

  $("[data-ck-ticket-form]").addEventListener("submit", (e) => { e.preventDefault(); checkIn($("#ck-ticket").value); });

  // Finding someone without their ticket.
  let searchTimer = 0;
  let searchSeq = 0;
  async function runSearch() {
    const q = $("[data-ck-search]").value.trim();
    const list = $("[data-ck-results]");
    if (q.length < 2) { list.replaceChildren(); return; }
    const seq = ++searchSeq;
    try {
      const found = await guarded(() => ck.search(session.token, q));
      if (seq !== searchSeq || !found) return;
      list.replaceChildren(...(found.length ? found.map((r) => make("li", { class: `ck-guest${r.checkedIn ? " is-in" : ""}` }, [
        make("div", {}, [
          make("p", { class: "ck-guest__name", text: r.name }),
          make("p", { class: "ck-guest__meta", text: [r.id, r.email, r.phone].filter(Boolean).join(" · ") }),
        ]),
        r.status !== "registered"
          ? make("span", { class: "ck-guest__state", text: "Cancelled" })
          : r.checkedIn
            ? make("span", { class: "ck-guest__state", text: `In at ${time(r.checkedInAt)}` })
            : make("button", { type: "button", class: "btn btn-solid ck-guest__btn", text: "Check in", onclick: () => checkIn(r.id) }),
      ])) : [make("li", { class: "ck-muted", text: "No one by that name, email or phone for this event." })]));
    } catch (err) {
      list.replaceChildren(make("li", { class: "ck-error", text: say(err) }));
    }
  }
  $("[data-ck-search]").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); });

  // Scanning the QR code on a ticket.
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "js/vendor/jsqr.js";
      s.onload = () => resolve(window.jsQR);
      s.onerror = () => reject(new Error("The QR reader couldn't load."));
      document.head.appendChild(s);
    });
  }
  const scanBtn = $("[data-ck-scan]");
  const video = $("[data-ck-video]");
  let scanning = false;
  scanBtn.addEventListener("click", () => (scanning ? stopCamera() : startCamera()));
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { show("error", "This browser can't use the camera. Type the ticket ID instead."); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    } catch (_) {
      show("error", "The camera wasn't allowed. Allow it in the browser's settings for this site, or type the ticket ID.");
      return;
    }
    video.srcObject = stream;
    video.hidden = false;
    await video.play().catch(() => {});
    scanning = true;
    scanBtn.textContent = "Stop scanning";
    let detector = null;
    if ("BarcodeDetector" in window) { try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (_) { detector = null; } }
    const reader = detector ? null : await loadJsQR().catch(() => null);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let last = "";
    let lastAt = 0;
    const tick = async () => {
      if (!scanning) return;
      let code = null;
      try {
        if (detector) {
          const found = await detector.detect(video);
          code = found && found[0] ? found[0].rawValue : null;
        } else if (reader && video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = reader(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          code = found ? found.data : null;
        }
      } catch (_) { /* a frame that couldn't be read */ }
      // The same ticket held in view is read once, not every frame.
      if (code && (code !== last || Date.now() - lastAt > 4000)) {
        last = code;
        lastAt = Date.now();
        await checkIn(code);
      }
      setTimeout(tick, 250);
    };
    tick();
    stopCamera = () => {
      scanning = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      video.hidden = true;
      scanBtn.textContent = "Scan a ticket";
      stopCamera = () => {};
    };
  }
  window.addEventListener("pagehide", () => stopCamera());

  /* ---------------- Start ---------------- */
  if (TEST) $("[data-ck-test-note]").hidden = false;
  if (read()) showDesk(); else showSignIn();
})();
