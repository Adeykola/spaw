/**
 * consent.js
 * ----------------------------------------------------------------------
 * The cookie question. Google Analytics and the Meta Pixel (in each
 * page's <head>) start with their cookies off: the head sets Google's
 * consent to "denied" and revokes Meta's, unless this browser has already
 * said yes. This asks once, in a small panel at the bottom of the page,
 * and remembers the answer in localStorage ("drajokesings:cookies": "yes"
 * or "no"). "Cookie settings" in the footer asks again.
 *
 *   Yes  Google sets its cookies and counts as usual; Meta sends what it
 *        held back on this page (the PageView, a Lead) and carries on.
 *   No   Google counts without cookies (Consent Mode); Meta sends
 *        nothing. Their cookies from an earlier yes are cleared.
 *
 * The site's own visit counting (track.js) sets no cookies and isn't
 * part of this.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  const KEY = "drajokesings:cookies";
  const STATES = ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"];
  const consent = (value) => Object.fromEntries(STATES.map((k) => [k, value]));

  const read = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch (_) { /* storage blocked: asked again next page */ } };

  // Google's (_ga…) and Meta's (_fbp, _fbc) cookies, on this host and the
  // domain above it, where Google puts them.
  function clearCookies() {
    const host = location.hostname;
    const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
    document.cookie.split(";").map((c) => c.split("=")[0].trim())
      .filter((name) => /^(_ga|_gid|_gat|_gcl|_fbp|_fbc)/.test(name))
      .forEach((name) => domains.forEach((d) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ""}`;
      }));
  }

  function answer(value) {
    write(value);
    window.cookieConsent = value;
    const yes = value === "yes";
    if (typeof window.gtag === "function") window.gtag("consent", "update", consent(yes ? "granted" : "denied"));
    if (typeof window.fbq === "function") window.fbq("consent", yes ? "grant" : "revoke");
    if (!yes) clearCookies();
    close();
  }

  let panel = null;
  function close() {
    if (!panel) return;
    const p = panel;
    panel = null;
    p.classList.remove("is-shown");
    document.body.classList.remove("has-cookie-panel");
    setTimeout(() => p.remove(), 500);
  }

  function open() {
    if (panel) return;
    panel = document.createElement("section");
    panel.className = "cookie-panel";
    panel.setAttribute("aria-label", "Cookies");
    const text = document.createElement("p");
    text.className = "cookie-panel__text";
    text.textContent = "May we use cookies from Google and Meta? They count visits and show which of our adverts bring people here. None are set unless you say yes.";
    const actions = document.createElement("div");
    actions.className = "cookie-panel__actions";
    [["yes", "Accept", "btn btn-solid"], ["no", "Decline", "btn btn-ghost"]].forEach(([value, label, cls]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `${cls} cookie-panel__btn`;
      b.textContent = label;
      b.addEventListener("click", () => answer(value));
      actions.append(b);
    });
    panel.append(text, actions);
    document.body.append(panel);
    document.body.classList.add("has-cookie-panel");
    requestAnimationFrame(() => requestAnimationFrame(() => panel && panel.classList.add("is-shown")));
  }

  // "Cookie settings" beside Admin in the footer. Added once the admin's
  // published words are in (content.js), and kept out of "Edit this page".
  function footerLink() {
    const row = document.querySelector(".site-footer .footer-social");
    if (!row || row.querySelector("[data-cookie-settings]")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "footer-cookie-btn";
    b.setAttribute("data-cookie-settings", "");
    b.setAttribute("data-edit-skip", "");
    b.textContent = "Cookie settings";
    b.addEventListener("click", open);
    row.append(b);
  }
  Promise.resolve(window.ContentReady).then(footerLink, footerLink);

  if (read() === "yes" || read() === "no") return;
  // Not over the homepage's opening film: after it.
  const intro = document.querySelector("[data-intro]");
  if (intro && !intro.hidden) document.addEventListener("intro:complete", () => setTimeout(open, 600), { once: true });
  else setTimeout(open, 900);
})();
