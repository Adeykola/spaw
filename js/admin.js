/**
 * admin.js
 * ----------------------------------------------------------------------
 * The admin screens that came before the content system: the song,
 * album, video, event and artist lists, and the inbox screens
 * (registrations, enquiries, applicants, check-in). The lists still keep
 * their own copy in this browser; phase two of the admin moves them onto
 * the same drafts, publishing and database as the Pages screen.
 * admin-core.js signs people in and shows these screens; they register
 * themselves at the bottom of this file.
 * ----------------------------------------------------------------------
 */

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
  toRow: (t) => [t.title, t.albumId || "Single", t.duration ? `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")}` : "—", t.releaseDate || "—", t.isSingle ? "Single" : "Album track"],
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
 * Registrations
 * ------------------------------------------------------------------- */
async function renderRegistrationsPanel() {
  const panel = document.querySelector('[data-panel="registrations"]');
  if (!panel) return;
  const tableWrap = panel.querySelector("[data-registrations-table]");
  const searchInput = panel.querySelector("[data-registrations-search]");
  showLoading(tableWrap, "Loading registrations…");

  try {
    const all = await api.getRegistrations();

    const draw = (query = "") => {
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
    };
    draw(searchInput ? searchInput.value : "");
    if (searchInput) searchInput.oninput = (e) => draw(e.target.value);
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

    const showEnquiryDetail = (e) => {
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
    };

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
  showLoading(tableWrap, "Loading applicants…");

  try {
    const applications = await api.getTalentApplications();
    if (!applications.length) { showEmpty(tableWrap, "No Symphony applications yet."); return; }

    const showApplicantDetail = (a) => {
      detail.replaceChildren(
        el("dl", {}, [
          el("dt", { text: "Full name" }), el("dd", { text: a.fullName }),
          el("dt", { text: "Contact" }), el("dd", { text: `${a.email} · ${a.phone}` }),
          el("dt", { text: "Location" }), el("dd", { text: a.location }),
          el("dt", { text: "Track" }), el("dd", { text: a.track }),
          el("dt", { text: "Bio" }), el("dd", { text: a.bio }),
          el("dt", { text: "Social" }), el("dd", { text: a.socialLink || "—" }),
          el("dt", { text: "Portfolio" }), el("dd", { text: a.projectLink || "—" }),
          el("dt", { text: "Application ID" }), el("dd", { text: a.id }),
        ])
      );
    };

    const rows = applications.map((a) => {
      const viewBtn = el("button", { class: "icon-btn", type: "button", text: "View" });
      viewBtn.addEventListener("click", () => showApplicantDetail(a));
      return [a.fullName, a.email, a.track, new Date(a.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), el("span", { class: "status-pill status-pill--received", text: a.status }), viewBtn];
    });
    tableWrap.replaceChildren(buildTable(["Name", "Email", "Track", "Submitted", "Status", ""], rows));
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
    submitBtn.textContent = "Verifying…";

    try {
      const reg = await api.checkInRegistration(id);
      result.dataset.visible = "true";
      result.dataset.outcome = "success";
      result.replaceChildren(
        el("p", { text: `✓ ${reg.name} checked in for ${reg.eventName}.` }),
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

/* ---------------------------------------------------------------------
 * Hand the screens to the admin frame (admin-core.js)
 * ------------------------------------------------------------------- */
Admin.register("dashboard", { render: () => window.renderAnalyticsDashboard && window.renderAnalyticsDashboard() });
Admin.register("music", { render: () => renderCrudPanel(musicCrudConfig) });
Admin.register("albums", { render: () => renderCrudPanel(albumsCrudConfig) });
Admin.register("videos", { render: () => renderCrudPanel(videosCrudConfig) });
Admin.register("events", { render: () => renderCrudPanel(eventsCrudConfig) });
Admin.register("emerging", { render: () => renderCrudPanel(emergingCrudConfig) });
Admin.register("registrations", { render: renderRegistrationsPanel });
Admin.register("enquiries", { render: renderEnquiriesPanel });
Admin.register("talent", { render: renderTalentPanel });
Admin.register("checkin", { render: wireCheckinPanel });
