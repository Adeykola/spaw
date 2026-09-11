/**
 * admin.js
 * ----------------------------------------------------------------------
 * Drives admin.html end to end: prototype login -> sidebar-routed panels
 * -> content management backed by localStorage (via Store from data.js).
 * Every collection panel (Music/Albums/Videos/Emerging/Events) shares one
 * small CRUD engine so the pattern stays consistent and easy to extend
 * when a real backend replaces Store.
 * ----------------------------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", async () => {
  wireLogin();
  const session = await api.getAdminSession();
  if (session) enterShell();
});

/* ---------------------------------------------------------------------
 * Auth gate
 * ------------------------------------------------------------------- */
function wireLogin() {
  const form = document.querySelector("[data-admin-login-form]");
  if (!form) return;
  const errorEl = form.querySelector("[data-login-error]");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector("button[type='submit']");
    const username = form.querySelector("#admin-username").value;
    const password = form.querySelector("#admin-password").value;
    errorEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in\u2026";

    try {
      await api.adminLogin(username, password);
      enterShell();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in";
    }
  });

  document.querySelector("[data-admin-logout]")?.addEventListener("click", () => {
    api.adminLogout();
    window.location.reload();
  });
}

function enterShell() {
  document.querySelector("[data-admin-login]")?.setAttribute("hidden", "");
  const shell = document.querySelector("[data-admin-shell]");
  if (shell) shell.hidden = false;
  wireSidebar();
  activatePanel("dashboard");
}

/* ---------------------------------------------------------------------
 * Sidebar routing
 * ------------------------------------------------------------------- */
function wireSidebar() {
  document.querySelectorAll("[data-panel-link]").forEach((btn) => {
    btn.addEventListener("click", () => activatePanel(btn.dataset.panelLink));
  });
}

const panelRenderers = {
  dashboard: () => window.renderAnalyticsDashboard?.(),
  music: () => renderCrudPanel(musicCrudConfig),
  albums: () => renderCrudPanel(albumsCrudConfig),
  videos: () => renderCrudPanel(videosCrudConfig),
  emerging: () => renderCrudPanel(emergingCrudConfig),
  events: () => renderCrudPanel(eventsCrudConfig),
  homepage: renderHomepagePanel,
  bio: renderBioPanel,
  ministry: renderMinistryAdminPanel,
  registrations: renderRegistrationsPanel,
  enquiries: renderEnquiriesPanel,
  talent: renderTalentPanel,
  checkin: wireCheckinPanel,
};

function activatePanel(name) {
  document.querySelectorAll("[data-panel-link]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.panelLink === name)));
  document.querySelectorAll(".admin-panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
  panelRenderers[name]?.();
}

/* ---------------------------------------------------------------------
 * Table builder
 * ------------------------------------------------------------------- */
function buildTable(columns, rows) {
  const thead = el("thead", {}, [el("tr", {}, columns.map((c) => el("th", { text: c })))]);
  const tbody = el("tbody", {}, rows.map((cells) => el("tr", {}, cells.map((c) => {
    const td = document.createElement("td");
    if (c instanceof Node) td.appendChild(c); else td.textContent = c;
    return td;
  }))));
  return el("div", { class: "admin-table-wrap" }, [el("table", { class: "admin-table" }, [thead, tbody])]);
}

/* ---------------------------------------------------------------------
 * Generic CRUD engine for simple content collections
 * ------------------------------------------------------------------- */
function getAdminCollection(key, seed) {
  let data = Store.read(`admin:${key}`, null);
  if (!data) { data = JSON.parse(JSON.stringify(seed)); Store.write(`admin:${key}`, data); }
  return data;
}

function renderCrudPanel(config) {
  const panel = document.querySelector(`[data-panel="${config.panelKey}"]`);
  if (!panel) return;
  const tableWrap = panel.querySelector("[data-crud-table]");
  const form = panel.querySelector("[data-crud-form]");
  let items = getAdminCollection(config.storageKey, config.seed());

  function draw() {
    if (!items.length) { showEmpty(tableWrap, "Nothing here yet — add the first one."); return; }
    const rows = items.map((item, idx) => {
      const delBtn = el("button", { class: "icon-btn", type: "button", text: "Remove" });
      delBtn.addEventListener("click", () => {
        items.splice(idx, 1);
        Store.write(`admin:${config.storageKey}`, items);
        draw();
      });
      return [...config.toRow(item), delBtn];
    });
    tableWrap.replaceChildren(buildTable(config.columns, rows));
  }
  draw();

  if (form && !form.dataset.wired) {
    form.dataset.wired = "true";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const newItem = { id: genId(config.storageKey.slice(0, 3).toUpperCase()) };
      let valid = true;
      config.fields.forEach((f) => {
        const input = form.querySelector(`[name="${f.key}"]`);
        if (!input) return;
        if (f.type === "checkbox") { newItem[f.key] = input.checked; return; }
        const value = f.type === "number" ? Number(input.value || 0) : input.value.trim();
        if (f.required && !value) valid = false;
        newItem[f.key] = value;
      });
      if (!valid) { form.querySelector("[data-crud-error]").textContent = "Please fill in all required fields."; return; }
      form.querySelector("[data-crud-error]").textContent = "";
      items.push(newItem);
      Store.write(`admin:${config.storageKey}`, items);
      form.reset();
      draw();
    });
  }
}

const musicCrudConfig = {
  panelKey: "music", storageKey: "tracks",
  seed: () => DB.tracks,
  columns: ["Title", "Album", "Duration", "Released", "Type", ""],
  toRow: (t) => [t.title, t.albumId || "Single", `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")}`, t.releaseDate, t.isSingle ? "Single" : "Album track"],
  fields: [
    { key: "title", type: "text", required: true },
    { key: "artist", type: "text" },
    { key: "duration", type: "number", required: true },
    { key: "releaseDate", type: "date", required: true },
    { key: "isSingle", type: "checkbox" },
  ],
};

const albumsCrudConfig = {
  panelKey: "albums", storageKey: "albums",
  seed: () => DB.albums,
  columns: ["Title", "Year", "Tracks", ""],
  toRow: (a) => [a.title, String(a.year), String((a.trackIds || []).length)],
  fields: [
    { key: "title", type: "text", required: true },
    { key: "year", type: "number", required: true },
    { key: "description", type: "text" },
  ],
};

// Seeded from the YouTube snapshot. The public pages read the channel
// itself (api._youtube), so this list is for reference, like the other
// prototype CRUD panels.
const videosCrudConfig = {
  panelKey: "videos", storageKey: "youtubeVideos",
  seed: () => DB.videos,
  columns: ["Title", "YouTube ID", "Published", ""],
  toRow: (v) => [v.title, v.youtubeId, v.published],
  fields: [
    { key: "title", type: "text", required: true },
    { key: "youtubeId", type: "text", required: true },
    { key: "published", type: "date", required: true },
  ],
};

const emergingCrudConfig = {
  panelKey: "emerging", storageKey: "emergingArtists",
  seed: () => DB.emergingArtists,
  columns: ["Name", "Role", ""],
  toRow: (a) => [a.name, a.role],
  fields: [
    { key: "name", type: "text", required: true },
    { key: "role", type: "text", required: true },
    { key: "bio", type: "text" },
  ],
};

const eventsCrudConfig = {
  panelKey: "events", storageKey: "adminEvents",
  seed: () => DB.events,
  columns: ["Name", "Venue", "Date", "Capacity", ""],
  toRow: (e) => [e.name, `${e.venue}, ${e.city}`, `${e.date} ${e.time || "(time TBA)"}`, `${e.registered}/${e.capacity}`],
  fields: [
    { key: "name", type: "text", required: true },
    { key: "venue", type: "text", required: true },
    { key: "city", type: "text", required: true },
    { key: "date", type: "date", required: true },
    { key: "time", type: "time", required: true },
    { key: "capacity", type: "number", required: true },
  ],
};

/* ---------------------------------------------------------------------
 * Homepage content (single-object form)
 * ------------------------------------------------------------------- */
function renderHomepagePanel() {
  const panel = document.querySelector('[data-panel="homepage"]');
  if (!panel) return;
  const form = panel.querySelector("[data-homepage-form]");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "true";

  const current = Store.read("admin:homepageContent", {
    heroEyebrow: "Worship Minister \u00b7 Recording Artist \u00b7 Lagos, Nigeria",
    heroTitle: "Worship, carried by voice.",
    nowPlayingSong: "Alagbara",
  });
  form.querySelector("#hp-eyebrow").value = current.heroEyebrow;
  form.querySelector("#hp-title").value = current.heroTitle;
  form.querySelector("#hp-song").value = current.nowPlayingSong;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const updated = {
      heroEyebrow: form.querySelector("#hp-eyebrow").value.trim(),
      heroTitle: form.querySelector("#hp-title").value.trim(),
      nowPlayingSong: form.querySelector("#hp-song").value.trim(),
    };
    Store.write("admin:homepageContent", updated);
    flashSaved(form);
  });
}

function renderBioPanel() {
  const panel = document.querySelector('[data-panel="bio"]');
  if (!panel) return;
  const form = panel.querySelector("[data-bio-form]");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "true";

  const artist = DB.artists[0];
  const current = Store.read("admin:bio", { bio: artist.bio, quote: artist.quote, stat1: artist.stats[0].value, stat2: artist.stats[1].value, stat3: artist.stats[2].value });
  form.querySelector("#bio-text").value = current.bio;
  form.querySelector("#bio-quote").value = current.quote;
  form.querySelector("#bio-stat1").value = current.stat1;
  form.querySelector("#bio-stat2").value = current.stat2;
  form.querySelector("#bio-stat3").value = current.stat3;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    Store.write("admin:bio", {
      bio: form.querySelector("#bio-text").value.trim(),
      quote: form.querySelector("#bio-quote").value.trim(),
      stat1: form.querySelector("#bio-stat1").value.trim(),
      stat2: form.querySelector("#bio-stat2").value.trim(),
      stat3: form.querySelector("#bio-stat3").value.trim(),
    });
    flashSaved(form);
  });
}

function renderMinistryAdminPanel() {
  const panel = document.querySelector('[data-panel="ministry"]');
  if (!panel) return;
  const form = panel.querySelector("[data-ministry-form]");
  const resourceForm = panel.querySelector("[data-resource-form]");
  const resourceTable = panel.querySelector("[data-resource-table]");

  const current = Store.read("admin:ministry", { missionStatement: DB.ministry.missionStatement, resources: DB.ministry.resources });

  if (form && !form.dataset.wired) {
    form.dataset.wired = "true";
    form.querySelector("#ministry-mission").value = current.missionStatement;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      current.missionStatement = form.querySelector("#ministry-mission").value.trim();
      Store.write("admin:ministry", current);
      flashSaved(form);
    });
  }

  function drawResources() {
    if (!resourceTable) return;
    if (!current.resources.length) { showEmpty(resourceTable, "No resources yet."); return; }
    const rows = current.resources.map((r, idx) => {
      const delBtn = el("button", { class: "icon-btn", type: "button", text: "Remove" });
      delBtn.addEventListener("click", () => { current.resources.splice(idx, 1); Store.write("admin:ministry", current); drawResources(); });
      return [r.title, r.type, r.size, delBtn];
    });
    resourceTable.replaceChildren(buildTable(["Title", "Type", "Size", ""], rows));
  }
  drawResources();

  if (resourceForm && !resourceForm.dataset.wired) {
    resourceForm.dataset.wired = "true";
    resourceForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = resourceForm.querySelector("#res-title").value.trim();
      const type = resourceForm.querySelector("#res-type").value.trim();
      const size = resourceForm.querySelector("#res-size").value.trim();
      if (!title) return;
      current.resources.push({ id: genId("RES"), title, type: type || "PDF", size: size || "\u2014" });
      Store.write("admin:ministry", current);
      resourceForm.reset();
      drawResources();
    });
  }
}

function flashSaved(form) {
  const note = form.querySelector("[data-save-note]");
  if (!note) return;
  note.textContent = "Saved.";
  note.setAttribute("data-state", "success");
  setTimeout(() => { note.textContent = ""; note.removeAttribute("data-state"); }, 2400);
}

/* ---------------------------------------------------------------------
 * Registrations
 * ------------------------------------------------------------------- */
async function renderRegistrationsPanel() {
  const panel = document.querySelector('[data-panel="registrations"]');
  if (!panel) return;
  const tableWrap = panel.querySelector("[data-registrations-table]");
  const searchInput = panel.querySelector("[data-registrations-search]");
  showLoading(tableWrap, "Loading registrations\u2026");

  try {
    const all = await api.getRegistrations();

    function draw(query = "") {
      const q = query.toLowerCase();
      const filtered = q ? all.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) : all;
      if (!filtered.length) { showEmpty(tableWrap, "No registrations match."); return; }
      const rows = filtered
        .sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt))
        .map((r) => [
          r.name, r.email, r.eventName,
          new Date(r.registeredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          el("span", { class: `status-pill ${r.checkedIn ? "status-pill--checked" : "status-pill--pending"}`, text: r.checkedIn ? "Checked in" : "Pending" }),
        ]);
      tableWrap.replaceChildren(buildTable(["Name", "Email", "Event", "Registered", "Status"], rows));
    }
    draw();
    searchInput?.addEventListener("input", (e) => draw(e.target.value));
  } catch (err) {
    console.error("[admin] registrations failed", err);
    showError(tableWrap, "Couldn't load registrations.", renderRegistrationsPanel);
  }
}

/* ---------------------------------------------------------------------
 * Contact & booking enquiries
 * Both modes of contact.html land in one collection; the filter pills
 * split them back apart without a second request.
 * ------------------------------------------------------------------- */
let enquiryFilter = "all";

async function renderEnquiriesPanel() {
  const panel = document.querySelector('[data-panel="enquiries"]');
  if (!panel) return;
  const tableWrap = panel.querySelector("[data-enquiries-table]");
  const detail = panel.querySelector("[data-enquiry-detail]");
  showLoading(tableWrap, "Loading enquiries…");

  const pills = panel.querySelectorAll("[data-enquiry-filter]");
  if (!panel.dataset.wired) {
    panel.dataset.wired = "true";
    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        enquiryFilter = pill.dataset.enquiryFilter;
        pills.forEach((p) => p.setAttribute("aria-pressed", String(p === pill)));
        renderEnquiriesPanel();
      });
    });
  }

  try {
    const all = await api.getEnquiries();
    const enquiries = enquiryFilter === "all" ? all : all.filter((e) => e.type === enquiryFilter);

    if (!enquiries.length) {
      showEmpty(tableWrap, enquiryFilter === "all"
        ? "Nothing has come through the contact page yet."
        : "No enquiries of that kind yet.");
      detail.replaceChildren(el("p", { class: "detail-panel__empty", text: "Select an enquiry to view it in full." }));
      return;
    }

    const sorted = [...enquiries].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const rows = sorted.map((e) => {
      const viewBtn = el("button", { class: "icon-btn", type: "button", text: "View" });
      viewBtn.addEventListener("click", () => showEnquiryDetail(e));
      return [
        e.name,
        e.subject,
        el("span", {
          class: `status-pill ${e.type === "booking" ? "status-pill--received" : "status-pill--pending"}`,
          text: e.type === "booking" ? "Booking" : "Message",
        }),
        e.type === "booking" && e.eventDate ? e.eventDate : "—",
        new Date(e.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        viewBtn,
      ];
    });
    tableWrap.replaceChildren(buildTable(["Name", "Subject", "Type", "Event date", "Received", ""], rows));

    function showEnquiryDetail(e) {
      const pairs = [
        ["Reference", e.id],
        ["Name", e.name],
        ["Email", e.email],
        ["Phone", e.phone || "—"],
        ["Subject", e.subject],
      ];

      if (e.type === "booking") {
        pairs.push(
          ["Organisation", e.organisation || "—"],
          ["Event type", e.eventType || "—"],
          ["Event date", e.eventDate || "—"],
          ["City & venue", e.city || "—"],
          ["Expected attendance", e.attendance || "—"],
          ["Honorarium", e.budget || "Prefer to discuss"],
          ["Asking for", (e.needs && e.needs.length) ? e.needs.join(", ") : "—"]
        );
      }

      pairs.push(
        ["Message", e.message],
        ["Mailing list", e.joinNewsletter ? "Opted in" : "No"],
        ["Received", new Date(e.submittedAt).toLocaleString("en-GB")]
      );

      const list = el("dl", {});
      pairs.forEach(([label, value]) => {
        list.appendChild(el("dt", { text: label }));
        list.appendChild(el("dd", { text: String(value) }));
      });

      const replyBtn = el("a", {
        class: "btn btn-line",
        href: `mailto:${e.email}?subject=${encodeURIComponent(`Re: ${e.subject} (${e.id})`)}`,
        text: "Reply by email",
      });

      detail.replaceChildren(list, el("div", { style: "margin-top: var(--space-m);" }, [replyBtn]));
    }

    showEnquiryDetail(sorted[0]);
  } catch (err) {
    console.error("[admin] enquiries failed", err);
    showError(tableWrap, "Couldn't load enquiries.", renderEnquiriesPanel);
  }
}

/* ---------------------------------------------------------------------
 * Talent applicants
 * ------------------------------------------------------------------- */
async function renderTalentPanel() {
  const panel = document.querySelector('[data-panel="talent"]');
  if (!panel) return;
  const tableWrap = panel.querySelector("[data-talent-table]");
  const detail = panel.querySelector("[data-talent-detail]");
  showLoading(tableWrap, "Loading applicants\u2026");

  try {
    const applications = await api.getTalentApplications();
    if (!applications.length) { showEmpty(tableWrap, "No Symphony applications yet."); return; }

    const rows = applications.map((a) => {
      const viewBtn = el("button", { class: "icon-btn", type: "button", text: "View" });
      viewBtn.addEventListener("click", () => showApplicantDetail(a));
      return [a.fullName, a.email, a.track, new Date(a.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), el("span", { class: "status-pill status-pill--received", text: a.status }), viewBtn];
    });
    tableWrap.replaceChildren(buildTable(["Name", "Email", "Track", "Submitted", "Status", ""], rows));

    function showApplicantDetail(a) {
      detail.replaceChildren(
        el("dl", {}, [
          el("dt", { text: "Full name" }), el("dd", { text: a.fullName }),
          el("dt", { text: "Contact" }), el("dd", { text: `${a.email} \u00b7 ${a.phone}` }),
          el("dt", { text: "Location" }), el("dd", { text: a.location }),
          el("dt", { text: "Track" }), el("dd", { text: a.track }),
          el("dt", { text: "Bio" }), el("dd", { text: a.bio }),
          el("dt", { text: "Social" }), el("dd", { text: a.socialLink || "\u2014" }),
          el("dt", { text: "Portfolio" }), el("dd", { text: a.projectLink || "\u2014" }),
          el("dt", { text: "Application ID" }), el("dd", { text: a.id }),
        ])
      );
    }
    if (applications[0]) showApplicantDetail(applications[0]);
  } catch (err) {
    console.error("[admin] talent panel failed", err);
    showError(tableWrap, "Couldn't load applicants.", renderTalentPanel);
  }
}

/* ---------------------------------------------------------------------
 * Check-in tool
 * ------------------------------------------------------------------- */
function wireCheckinPanel() {
  const panel = document.querySelector('[data-panel="checkin"]');
  if (!panel) return;
  const form = panel.querySelector("[data-checkin-form]");
  const input = panel.querySelector("#checkin-id");
  const result = panel.querySelector("[data-checkin-result]");
  const simulateBtn = panel.querySelector("[data-checkin-simulate]");
  if (form.dataset.wired) return;
  form.dataset.wired = "true";

  simulateBtn?.addEventListener("click", async () => {
    const regs = await api.getRegistrations();
    const pending = regs.filter((r) => !r.checkedIn);
    if (!pending.length) { input.value = ""; return; }
    input.value = pending[Math.floor(Math.random() * pending.length)].id;
    input.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = input.value.trim();
    if (!id) return;
    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying\u2026";

    try {
      const reg = await api.checkInRegistration(id);
      result.dataset.visible = "true";
      result.dataset.outcome = "success";
      result.replaceChildren(
        el("p", { text: `\u2713 ${reg.name} checked in for ${reg.eventName}.` }),
        el("p", { class: "field-hint", text: `Recorded at ${new Date(reg.checkedInAt).toLocaleTimeString()}` })
      );
      form.reset();
    } catch (err) {
      result.dataset.visible = "true";
      result.dataset.outcome = err.message.startsWith("Already") ? "warn" : "error";
      result.replaceChildren(el("p", { text: err.message }));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Verify & check in";
    }
  });
}
