/**
 * admin-core.js
 * ----------------------------------------------------------------------
 * The admin's frame: signing in (plus first-time passwords and resets),
 * the sidebar, which only lists what the signed-in person's role allows,
 * hash routing (#pages/about survives a reload), and a small toolkit every
 * screen shares: a DOM helper, toasts, dialogs, dates and labels.
 *
 * Screens register themselves: Admin.register("pages", { render(panel,
 * sub) {…} }). A screen with unsaved work sets Admin.setGuard(...) and is
 * asked before the person moves away.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  const ALL = ["owner", "editor", "team"];
  const EDIT = ["owner", "editor"];
  const OWNER = ["owner"];

  const NAV = [
    { group: "Overview", items: [["dashboard", "Dashboard", ALL]] },
    {
      group: "Inbox",
      items: [
        ["enquiries", "Contact & bookings", ALL],
        ["talent", "Talent applicants", ALL],
        ["registrations", "Registrations", ALL],
        ["checkin", "Event check-in", ALL],
        ["subscribers", "Newsletter", ALL],
      ],
    },
    {
      group: "Website",
      items: [
        ["pages", "Pages", EDIT],
        ["site", "Header, menus & footer", EDIT],
        ["announcements", "Announcements", EDIT],
        ["publish", "Publish & history", EDIT],
        ["media", "Media library", EDIT],
      ],
    },
    {
      group: "Content",
      items: [
        ["music", "Songs", EDIT],
        ["albums", "Albums", EDIT],
        ["videos", "Videos", EDIT],
        ["galleries", "Photo galleries", EDIT],
        ["events", "Events", EDIT],
        ["symphony", "Symphony", EDIT],
        ["about", "About page lists", EDIT],
        ["ministry", "Ministry", EDIT],
        ["emerging", "Emerging artists", EDIT],
        ["contact-page", "Contact page", EDIT],
      ],
    },
    { group: "Team", items: [["people", "People & roles", OWNER], ["activity", "Activity log", EDIT]] },
  ];
  const ITEMS = NAV.flatMap((g) => g.items);

  const panels = {};
  let session = null;
  let current = "";
  let currentSub = "";
  let guard = null;

  /* ---- toolkit ------------------------------------------------------ */
  function h(tag, props = {}, kids = []) {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => { if (c != null && c !== false) n.append(c); });
    return n;
  }

  function toast(message, kind = "") {
    const wrap = document.querySelector("[data-toasts]");
    if (!wrap) return;
    const t = h("div", { class: `admin-toast ${kind}`, role: kind === "is-error" ? "alert" : "status", text: message });
    wrap.append(t);
    requestAnimationFrame(() => t.classList.add("is-in"));
    setTimeout(() => { t.classList.remove("is-in"); setTimeout(() => t.remove(), 300); }, kind === "is-error" ? 7000 : 3600);
  }

  // actions: [label, value, "is-primary" | "is-danger" | ""]; Escape picks the first.
  function dialog({ title, body = [], actions = [["Cancel", false], ["OK", true, "is-primary"]] }) {
    return new Promise((resolve) => {
      const d = h("dialog", { class: "admin-dialog" });
      const done = (value) => { d.close(); d.remove(); resolve(value); };
      d.append(
        h("h2", { class: "admin-dialog__title", text: title }),
        h("div", { class: "admin-dialog__body" }, body),
        h("div", { class: "admin-dialog__actions" }, actions.map(([label, value, cls = ""]) =>
          h("button", { type: "button", class: `btn ${cls === "is-primary" ? "btn-solid" : "btn-ghost"} ${cls}`, onclick: () => done(value) }, label)))
      );
      d.addEventListener("cancel", (e) => { e.preventDefault(); done(actions[0][1]); });
      document.body.append(d);
      d.showModal();
    });
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function timeAgo(iso) {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
    return fmtDate(iso);
  }

  const COLLECTION_NAMES = {
    tracks: "Songs", albums: "Albums", videos: "Videos", events: "Events", symphony: "Symphony",
    ministry: "Ministry", emergingArtists: "Emerging artists", galleries: "Photo galleries",
    announcements: "Announcements", siteSettings: "Site settings", artists: "Artist profile",
  };
  function labelForKey(key) {
    if (key === "page:global") return "Header, menus & footer";
    if (key.startsWith("page:")) {
      const p = Content.PAGES.find((x) => x.page === key.slice(5));
      return p ? `${p.label} page` : key.slice(5);
    }
    return COLLECTION_NAMES[key] || key;
  }

  function head(title, sub) {
    return h("div", { class: "admin-panel__head" }, [
      h("div", {}, [h("h1", { class: "admin-panel__title display", text: title }), sub ? h("p", { class: "admin-panel__sub", text: sub }) : null]),
    ]);
  }
  function loading(text = "Loading…") {
    return h("div", { class: "state-msg", "data-state": "loading" }, [h("span", { class: "spinner", "aria-hidden": "true" }), h("span", { text })]);
  }

  /* ---- signing in --------------------------------------------------- */
  const loginEl = () => document.querySelector("[data-admin-login]");
  const shellEl = () => document.querySelector("[data-admin-shell]");

  function showAuth(mode, message = "", kind = "ok") {
    shellEl().hidden = true;
    const login = loginEl();
    login.hidden = false;
    login.querySelectorAll("[data-auth-form]").forEach((f) => { f.hidden = f.dataset.authForm !== mode; });
    const form = login.querySelector(`[data-auth-form="${mode}"]`);
    const note = form.querySelector("[data-auth-note]");
    note.textContent = message;
    note.dataset.kind = message ? kind : "";
    const first = form.querySelector("input");
    if (first) first.focus();
  }

  function wireAuth() {
    const login = loginEl();
    login.querySelectorAll("[data-auth-switch]").forEach((b) => b.addEventListener("click", () => {
      const email = login.querySelector("form:not([hidden]) [name=email]");
      showAuth(b.dataset.authSwitch);
      const next = login.querySelector(`[data-auth-form="${b.dataset.authSwitch}"] [name=email]`);
      if (email && next && !next.value) next.value = email.value;
    }));

    const on = (mode, handler) => {
      const form = login.querySelector(`[data-auth-form="${mode}"]`);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const note = form.querySelector("[data-auth-note]");
        const submit = form.querySelector("button[type=submit]");
        const label = submit.textContent;
        note.textContent = "";
        note.dataset.kind = "";
        submit.disabled = true;
        submit.textContent = "One moment…";
        try {
          await handler(form, note);
        } catch (err) {
          note.textContent = err.message;
          note.dataset.kind = "error";
        } finally {
          submit.disabled = false;
          submit.textContent = label;
        }
      });
    };

    on("signin", async (form) => {
      if (!form.email.value.trim() || !form.password.value) throw new Error("Enter your email and password.");
      enter(await Backend.auth.signIn(form.email.value, form.password.value));
    });
    on("signup", async (form, note) => {
      if (form.password.value !== form.confirm.value) throw new Error("The two passwords don't match.");
      const result = await Backend.auth.signUp(form.email.value, form.password.value);
      if (result.needsConfirmation) {
        note.textContent = "Nearly there: open the confirmation email just sent to you, then come back and sign in.";
        note.dataset.kind = "ok";
      } else {
        showAuth("signin", "Password saved. Sign in with it now.");
        login.querySelector('[data-auth-form="signin"] [name=email]').value = form.email.value;
      }
    });
    on("reset", async (form, note) => {
      if (!form.email.value.trim()) throw new Error("Enter your email.");
      await Backend.auth.resetPassword(form.email.value);
      note.textContent = "If that email is on the admin list, a link to choose a new password is on its way.";
      note.dataset.kind = "ok";
    });
    on("recover", async (form) => {
      if (form.password.value !== form.confirm.value) throw new Error("The two passwords don't match.");
      await Backend.auth.updatePassword(form.password.value);
      history.replaceState(null, "", location.pathname);
      const s = await Backend.auth.getSession();
      if (s) enter(s);
      else showAuth("signin", "Password changed. Sign in with it now.");
    });

    document.querySelector("[data-admin-logout]").addEventListener("click", async () => {
      if (guard && guard.dirty() && !(await guard.confirm())) return;
      guard = null;
      await Backend.auth.signOut();
      history.replaceState(null, "", location.pathname);
      location.reload();
    });
  }

  function modeNotes() {
    const demo = Backend.mode === "demo";
    document.querySelector("[data-demo-hint]").hidden = !demo;
    const banner = document.querySelector("[data-mode-banner]");
    banner.hidden = !demo;
    if (demo) {
      banner.replaceChildren(
        h("strong", { text: "Demo mode. " }),
        "Changes are kept in this browser only and visitors don't see them. Connecting Supabase (see supabase/README.md) makes them live."
      );
    }
  }

  /* ---- the shell ---------------------------------------------------- */
  const allowed = (id) => {
    const item = ITEMS.find(([i]) => i === id);
    return Boolean(item && item[2].includes(session.role) && panels[id]);
  };
  const firstAllowed = () => (ITEMS.find(([id, , roles]) => roles.includes(session.role) && panels[id]) || ["dashboard"])[0];

  function buildNav() {
    const nav = document.querySelector("[data-admin-nav]");
    nav.replaceChildren();
    NAV.forEach(({ group, items }) => {
      const mine = items.filter(([id, , roles]) => roles.includes(session.role) && panels[id]);
      if (!mine.length) return;
      nav.append(h("p", { class: "admin-nav__group-label", text: group }));
      mine.forEach(([id, label]) => nav.append(
        h("a", { href: `#${id}`, "data-panel-link": id }, [h("span", { text: label }), h("span", { class: "admin-nav__badge", "data-badge": id, hidden: true })])
      ));
    });
  }

  function enter(s) {
    session = s;
    loginEl().hidden = true;
    shellEl().hidden = false;
    document.querySelector("[data-admin-me]").replaceChildren(
      h("strong", { text: s.name || s.email }),
      h("span", { text: `${Backend.ROLES[s.role] || s.role} · ${s.email}` })
    );
    buildNav();
    window.addEventListener("hashchange", route);
    window.addEventListener("beforeunload", (e) => {
      if (guard && guard.dirty()) { e.preventDefault(); e.returnValue = ""; }
    });
    route();
    refreshBadges();
  }

  let routing = false;
  async function route() {
    if (routing || !session) return;
    const [rawId, ...rest] = decodeURIComponent(location.hash.replace(/^#/, "")).split("/");
    const id = allowed(rawId) ? rawId : firstAllowed();
    const sub = rest.join("/");
    if ((id !== current || sub !== currentSub) && guard && guard.dirty()) {
      routing = true;
      const leave = await guard.confirm();
      routing = false;
      if (!leave) {
        history.replaceState(null, "", `#${current}${currentSub ? `/${currentSub}` : ""}`);
        return;
      }
    }
    guard = null;
    current = id;
    currentSub = sub;
    if (location.hash.replace(/^#/, "").split("/")[0] !== id) history.replaceState(null, "", `#${id}${sub ? `/${sub}` : ""}`);
    document.querySelectorAll("[data-panel-link]").forEach((a) => a.setAttribute("aria-current", String(a.dataset.panelLink === id)));
    document.querySelectorAll(".admin-panel").forEach((p) => { p.hidden = p.dataset.panel !== id; });
    const panel = document.querySelector(`.admin-panel[data-panel="${id}"]`);
    window.scrollTo(0, 0);
    try {
      await panels[id].render(panel, sub);
    } catch (err) {
      console.error(`[admin] ${id}`, err);
      toast(err.message || "Something went wrong on this screen.", "is-error");
    }
  }

  function setBadge(id, n) {
    const b = document.querySelector(`[data-badge="${id}"]`);
    if (!b) return;
    b.hidden = !n;
    b.textContent = n ? String(n) : "";
  }
  // Other screens add their own counts (the inbox's new enquiries…).
  const badgeSources = [];
  async function refreshBadges() {
    if (!session) return;
    if (Backend.can(session.role, "edit")) {
      try { setBadge("publish", Object.keys(await Backend.content.getDrafts()).length); } catch (_) { /* offline */ }
    }
    badgeSources.forEach((fn) => { try { fn(); } catch (_) { /* one count failing leaves the rest */ } });
  }

  function leaveDialog() {
    return dialog({
      title: "Leave without saving?",
      body: [h("p", { text: "Your changes on this screen haven't been saved as a draft yet." })],
      actions: [["Stay", false], ["Leave without saving", true, "is-danger"]],
    });
  }

  window.Admin = {
    register: (id, def) => { panels[id] = def; },
    h,
    toast,
    dialog,
    fmtDate,
    timeAgo,
    labelForKey,
    head,
    loading,
    leaveDialog,
    go: (hash) => { location.hash = hash; },
    get session() { return session; },
    can: (what) => Boolean(session) && Backend.can(session.role, what),
    setGuard: (g) => { guard = g; },
    refreshBadges,
    setBadge,
    onBadges: (fn) => { badgeSources.push(fn); },
  };

  document.addEventListener("DOMContentLoaded", async () => {
    modeNotes();
    wireAuth();
    // A password-reset link lands here with #…type=recovery.
    if (/type=recovery/.test(location.hash)) {
      Backend.auth.onRecovery(() => {});
      showAuth("recover");
      return;
    }
    Backend.auth.onRecovery(() => showAuth("recover"));
    let s = null;
    try { s = await Backend.auth.getSession(); } catch (err) { console.warn("[admin] session check failed:", err.message); }
    if (s) enter(s);
    else showAuth("signin");
  });
})();
