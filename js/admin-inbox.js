/**
 * admin-inbox.js
 * ----------------------------------------------------------------------
 * The inbox: contact and booking enquiries, Talent Quest applicants,
 * event registrations, newsletter sign-ups, and check-in at the door (by
 * typing a ticket's ID or scanning its QR code with a camera). Each list
 * filters, searches and downloads as a spreadsheet (CSV). The dashboard
 * gets a "Needs attention" summary, and the sidebar counts what's new.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";
  const { h, toast, dialog, head, loading } = Admin;

  const LABELS = {
    enquiries: { new: "New", replied: "Replied", confirmed: "Confirmed", declined: "Declined", archived: "Archived" },
    applications: { received: "To review", shortlisted: "Shortlisted", invited: "Invited", selected: "Selected", "not-selected": "Not selected" },
    registrations: { registered: "Registered", cancelled: "Cancelled" },
  };
  const pill = (kind, status) => h("span", { class: `status-pill status-pill--${status}`, text: LABELS[kind][status] || status });
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const btn = (label, onclick, cls = "pe-small-btn") => h("button", { type: "button", class: cls, onclick }, label);
  const isOwner = () => Admin.session && Admin.session.role === "owner";

  /* ---- shared pieces ------------------------------------------------ */
  function downloadCsv(filename, columns, rows) {
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map(([label]) => esc(label)).join(","), ...rows.map((r) => columns.map(([, get]) => esc(get(r))).join(","))];
    // The byte-order mark makes Excel read the ₦ and accents correctly.
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  function table(columns, items, { onOpen, isCurrent } = {}) {
    const thead = h("thead", {}, [h("tr", {}, columns.map(([label]) => h("th", { text: label })))]);
    const tbody = h("tbody", {}, items.map((item) => {
      const tr = h("tr", { class: isCurrent && isCurrent(item) ? "is-current" : null, tabindex: onOpen ? "0" : null });
      columns.forEach(([, cell]) => {
        const v = cell(item);
        const td = h("td");
        if (v instanceof Node) td.append(v); else td.textContent = v == null ? "" : String(v);
        tr.append(td);
      });
      if (onOpen) {
        tr.addEventListener("click", (e) => { if (!e.target.closest("button, a, select, input")) onOpen(item); });
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter") onOpen(item); });
      }
      return tr;
    }));
    return h("div", { class: "admin-table-wrap" }, [h("table", { class: `admin-table${onOpen ? " is-clickable" : ""}` }, [thead, tbody])]);
  }

  const select = (pairs, value, label) => {
    const s = h("select", { class: "admin-select", "aria-label": label }, pairs.map(([v, text]) => h("option", { value: v, selected: v === value }, text)));
    return s;
  };
  const searchBox = (placeholder) => h("input", { type: "search", class: "admin-input inbox-search", placeholder, "aria-label": placeholder });

  function details(pairs) {
    const dl = h("dl");
    pairs.filter(([, v]) => v !== undefined).forEach(([label, value]) => {
      dl.append(h("dt", { text: label }));
      const dd = h("dd");
      if (value instanceof Node) dd.append(value); else dd.textContent = value == null || value === "" ? "—" : String(value);
      dl.append(dd);
    });
    return dl;
  }
  // A registration's answers to its event's own questions: one line each in
  // the details, and columns in the spreadsheet (state and country apart).
  const answerText = (v) => (window.FormFields ? FormFields.formatValue(v) : v && typeof v === "object" ? [v.state, v.country].filter(Boolean).join(", ") : String(v == null ? "" : v));
  const answerPairs = (r) => (Array.isArray(r.answers) ? r.answers : []).map((a) => [a.label || a.id, answerText(a.value)]);
  function answerColumns(rows) {
    const seen = new Map();
    rows.forEach((r) => (r.answers || []).forEach((a) => {
      const key = a.id || a.label;
      if (key && !seen.has(key)) seen.set(key, { label: a.label || key, place: a.type === "location" || (a.value && typeof a.value === "object") });
    }));
    const find = (r, key) => (r.answers || []).find((a) => (a.id || a.label) === key);
    // "State" and "Country", or with the question's wording if a form asks twice.
    const places = [...seen.values()].filter((x) => x.place).length;
    const title = (label, part) => (places > 1 ? `${label}: ${part.toLowerCase()}` : part);
    return [...seen.entries()].flatMap(([key, { label, place }]) => (place
      ? [[title(label, "State"), (r) => { const a = find(r, key); return a && a.value ? a.value.state : ""; }], [title(label, "Country"), (r) => { const a = find(r, key); return a && a.value ? a.value.country : ""; }]]
      : [[label, (r) => { const a = find(r, key); return a ? answerText(a.value) : ""; }]]));
  }
  const mailto = (email, subject) => h("a", { href: `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`, text: email });
  const tel = (phone) => (phone ? h("a", { href: `tel:${phone.replace(/[^\d+]/g, "")}`, text: phone }) : "—");
  const safeLink = (url) => {
    const href = Content.safeUrl(url);
    return href ? h("a", { href, target: "_blank", rel: "noopener", text: url }) : url || "—";
  };

  // A status select and a notes box that save straight away.
  function statusControl(kind, item, onSaved) {
    const s = select(Object.entries(LABELS[kind]), item.status, "Status");
    s.addEventListener("change", async () => {
      const prev = item.status;
      try {
        Object.assign(item, await Backend.forms.update(kind, kind === "subscribers" ? item.email : item.id, { status: s.value }));
        toast(`Marked as ${LABELS[kind][s.value].toLowerCase()}.`, "is-success");
        onSaved();
        refreshCounts();
      } catch (err) {
        s.value = prev;
        toast(err.message, "is-error");
      }
    });
    return s;
  }
  function noteControl(kind, item) {
    const ta = h("textarea", { class: "admin-input", rows: "3", placeholder: "Only the admin team sees this." });
    ta.value = item.note || "";
    const save = btn("Save note", async () => {
      try {
        Object.assign(item, await Backend.forms.update(kind, item.id, { note: ta.value.trim() }));
        toast("Note saved.", "is-success");
      } catch (err) { toast(err.message, "is-error"); }
    });
    return h("div", { class: "admin-field" }, [h("span", { text: "Notes" }), ta, h("div", { class: "pe-actions-row" }, [save])]);
  }
  function deleteControl(kind, item, label, after) {
    if (!isOwner()) return null;
    return btn("Delete", async () => {
      const ok = await dialog({
        title: `Delete ${label}?`,
        body: [h("p", { text: "It's removed for good, for everyone on the team." })],
        actions: [["Keep it", false], ["Delete", true, "is-danger"]],
      });
      if (!ok) return;
      try { await Backend.forms.remove(kind, kind === "subscribers" ? item.email : item.id); toast("Deleted."); after(); refreshCounts(); } catch (err) { toast(err.message, "is-error"); }
    }, "pe-small-btn is-danger");
  }

  async function loadOr(panel, title, fn) {
    panel.replaceChildren(title, loading());
    try { return await fn(); } catch (err) {
      panel.replaceChildren(title, h("p", { class: "admin-empty", text: err.message }));
      return null;
    }
  }

  // Events as the site shows them: published, or the built-in list.
  async function currentEvents() {
    let published = {};
    try { published = await Backend.content.getPublished(); } catch (_) { /* built-in */ }
    return Array.isArray(published.events) ? published.events : DB.events;
  }

  /* ---- sidebar counts ------------------------------------------------ */
  async function refreshCounts() {
    try {
      const [enquiries, applications] = await Promise.all([Backend.forms.list("enquiries"), Backend.forms.list("applications")]);
      Admin.setBadge("enquiries", enquiries.filter((e) => e.status === "new").length);
      Admin.setBadge("talent", applications.filter((a) => a.status === "received").length);
    } catch (_) { /* not set up yet, or offline */ }
  }
  Admin.onBadges(refreshCounts);

  /* ===================================================================
   * Contact & bookings
   * =================================================================== */
  Admin.register("enquiries", {
    async render(panel) {
      const title = head("Contact & bookings", "Everything sent through the contact page. Change a status as you go; notes are only for the team.");
      const all = await loadOr(panel, title, () => Backend.forms.list("enquiries"));
      if (!all) return;
      all.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      let openId = null;

      const type = select([["all", "Messages and bookings"], ["message", "Messages"], ["booking", "Bookings"]], "all", "Kind");
      const status = select([["open", "Still to handle"], ["all", "Every status"], ...Object.entries(LABELS.enquiries)], "open", "Status");
      const q = searchBox("Find a name, email or reference");
      const count = h("span", { class: "inbox-count" });
      const listHost = h("div");
      const detailHost = h("div", { class: "detail-panel" });

      const shown = () => all.filter((e) =>
        (type.value === "all" || e.type === type.value) &&
        (status.value === "all" || (status.value === "open" ? e.status === "new" || e.status === "replied" : e.status === status.value)) &&
        (!q.value.trim() || [e.name, e.email, e.subject, e.id, e.organisation, e.city].join(" ").toLowerCase().includes(q.value.trim().toLowerCase())));

      function drawList() {
        const items = shown();
        count.textContent = `${plural(items.length, "enquiry", "enquiries")}`;
        if (!items.length) {
          listHost.replaceChildren(h("p", { class: "admin-empty", text: all.length ? "Nothing matches these filters." : "Nothing has come through the contact page yet." }));
          return;
        }
        listHost.replaceChildren(table([
          ["Name", (e) => e.name],
          ["Subject", (e) => e.subject],
          ["Kind", (e) => (e.type !== "booking" ? "Message" : e.eventDate ? `Booking · ${day(e.eventDate)}` : "Booking")],
          ["Status", (e) => pill("enquiries", e.status)],
          ["Received", (e) => day(e.submittedAt)],
        ], items, { onOpen: (e) => { openId = e.id; drawList(); drawDetail(e); }, isCurrent: (e) => e.id === openId }));
      }

      function drawDetail(e) {
        if (!e) { detailHost.replaceChildren(h("p", { class: "detail-panel__empty", text: "Choose an enquiry to read it in full." })); return; }
        const subject = `Re: ${e.subject || "your enquiry"} (${e.id})`;
        const pairs = [
          ["Reference", e.id], ["From", e.name], ["Email", mailto(e.email, subject)], ["Phone", tel(e.phone)], ["Subject", e.subject],
        ];
        if (e.type === "booking") {
          pairs.push(
            ["Organisation", e.organisation], ["Kind of event", e.eventType], ["Event date", e.eventDate ? day(e.eventDate) : ""],
            ["City & venue", e.city], ["Expected attendance", e.attendance], ["Honorarium", e.budget || "Prefer to discuss"],
            ["Asking for", Array.isArray(e.needs) && e.needs.length ? e.needs.join(", ") : ""]
          );
        }
        pairs.push(["Message", e.message], ["Mailing list", e.joinNewsletter ? "Opted in" : "No"], ["Received", Admin.fmtDate(e.submittedAt)]);
        if (e.updatedBy) pairs.push(["Last changed", `${Admin.fmtDate(e.updatedAt)} by ${e.updatedBy}`]);
        detailHost.replaceChildren(
          h("p", { class: "admin-card__title", text: e.type === "booking" ? "Booking request" : "Message" }),
          h("div", { class: "admin-field" }, [h("span", { text: "Status" }), statusControl("enquiries", e, drawList)]),
          details(pairs),
          h("div", { class: "pe-actions-row inbox-actions" }, [
            h("a", { class: "btn btn-solid", href: `mailto:${e.email}?subject=${encodeURIComponent(subject)}` }, "Reply by email"),
            e.status === "new" ? btn("Mark as replied", async () => {
              try { Object.assign(e, await Backend.forms.update("enquiries", e.id, { status: "replied" })); drawList(); drawDetail(e); refreshCounts(); } catch (err) { toast(err.message, "is-error"); }
            }) : null,
            deleteControl("enquiries", e, "this enquiry", () => { all.splice(all.indexOf(e), 1); openId = null; drawList(); drawDetail(null); }),
          ].filter(Boolean)),
          noteControl("enquiries", e)
        );
      }

      const csv = btn("Download spreadsheet", () => downloadCsv(`enquiries-${stamp()}.csv`, [
        ["Reference", (e) => e.id], ["Received", (e) => e.submittedAt], ["Kind", (e) => e.type], ["Status", (e) => LABELS.enquiries[e.status]],
        ["Name", (e) => e.name], ["Email", (e) => e.email], ["Phone", (e) => e.phone], ["Subject", (e) => e.subject], ["Message", (e) => e.message],
        ["Organisation", (e) => e.organisation], ["Kind of event", (e) => e.eventType], ["Event date", (e) => e.eventDate], ["City & venue", (e) => e.city],
        ["Attendance", (e) => e.attendance], ["Honorarium", (e) => e.budget], ["Asking for", (e) => (e.needs || []).join("; ")],
        ["Mailing list", (e) => (e.joinNewsletter ? "yes" : "no")], ["Notes", (e) => e.note],
      ], shown()));

      [type, status].forEach((s) => s.addEventListener("change", drawList));
      q.addEventListener("input", drawList);
      panel.replaceChildren(title, h("div", { class: "inbox-bar" }, [type, status, q, count, csv]), h("div", { class: "admin-layout inbox-layout" }, [listHost, detailHost]));
      drawList();
      const first = shown()[0];
      if (first) { openId = first.id; drawList(); }
      drawDetail(first || null);
    },
  });

  /* ===================================================================
   * Talent applicants
   * =================================================================== */
  function stars(item, onSaved) {
    const wrap = h("div", { class: "inbox-stars", role: "group", "aria-label": "Rating" });
    const draw = () => wrap.replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
      const b = h("button", { type: "button", class: n <= (item.rating || 0) ? "is-on" : "", "aria-label": `${n} out of 5`, "aria-pressed": String(n === item.rating) }, "★");
      b.addEventListener("click", async () => {
        const next = item.rating === n ? 0 : n;
        try { Object.assign(item, await Backend.forms.update("applications", item.id, { rating: next })); draw(); onSaved(); } catch (err) { toast(err.message, "is-error"); }
      });
      return b;
    }));
    draw();
    return wrap;
  }
  const starText = (n) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "—");

  Admin.register("talent", {
    async render(panel) {
      const title = head("Talent applicants", "Everyone who has applied to the Symphony Talent Quest. Rate them, move them through the stages, and keep notes the applicant never sees.");
      const all = await loadOr(panel, title, () => Backend.forms.list("applications"));
      if (!all) return;
      all.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      let openId = null;

      const tracks = [...new Set(all.map((a) => a.track).filter(Boolean))];
      const status = select([["all", "Every stage"], ...Object.entries(LABELS.applications)], "all", "Stage");
      const track = select([["all", "Every track"], ...tracks.map((t) => [t, t])], "all", "Track");
      const q = searchBox("Find a name, email or city");
      const count = h("span", { class: "inbox-count" });
      const listHost = h("div");
      const detailHost = h("div", { class: "detail-panel" });

      const shown = () => all.filter((a) =>
        (status.value === "all" || a.status === status.value) &&
        (track.value === "all" || a.track === track.value) &&
        (!q.value.trim() || [a.fullName, a.email, a.location, a.id].join(" ").toLowerCase().includes(q.value.trim().toLowerCase())));

      function drawList() {
        const items = shown();
        count.textContent = plural(items.length, "applicant");
        if (!items.length) {
          listHost.replaceChildren(h("p", { class: "admin-empty", text: all.length ? "Nothing matches these filters." : "No Talent Quest applications yet." }));
          return;
        }
        listHost.replaceChildren(table([
          ["Name", (a) => a.fullName],
          ["Track", (a) => a.track],
          ["From", (a) => a.location],
          ["Rating", (a) => starText(a.rating)],
          ["Stage", (a) => pill("applications", a.status)],
          ["Applied", (a) => day(a.submittedAt)],
        ], items, { onOpen: (a) => { openId = a.id; drawList(); drawDetail(a); }, isCurrent: (a) => a.id === openId }));
      }

      function fileRow(f) {
        const label = `${f.kind === "video" ? "Video" : f.kind === "audio" ? "Audio" : "File"}: ${f.name}${f.size ? ` · ${(f.size / 1048576).toFixed(1)} MB` : ""}`;
        if (!f.path) return h("li", {}, [h("span", { text: label }), h("small", { text: " (demo mode keeps the name only)" })]);
        const open = btn("Open", async () => {
          try { window.open(await Backend.forms.fileUrl(f.path), "_blank", "noopener"); } catch (err) { toast(err.message, "is-error"); }
        });
        return h("li", {}, [h("span", { text: label }), " ", open]);
      }

      function drawDetail(a) {
        if (!a) { detailHost.replaceChildren(h("p", { class: "detail-panel__empty", text: "Choose an applicant to see everything they sent." })); return; }
        const files = Array.isArray(a.files) ? a.files : [];
        detailHost.replaceChildren(
          h("p", { class: "admin-card__title", text: a.fullName }),
          h("div", { class: "admin-field" }, [h("span", { text: "Stage" }), statusControl("applications", a, drawList)]),
          h("div", { class: "admin-field" }, [h("span", { text: "Your rating" }), stars(a, drawList)]),
          details([
            ["Application", a.id], ["Email", mailto(a.email, "Your Symphony Talent Quest application")], ["Phone", tel(a.phone)],
            ["From", a.location], ["Gender", a.gender], ["Age category", a.ageCategory], ["Track", a.track], ["About them", a.bio],
            ["Social", a.socialLink ? safeLink(a.socialLink) : ""], ["Best work", a.projectLink ? safeLink(a.projectLink) : ""],
            ["Samples", files.length ? h("ul", { class: "inbox-files" }, files.map(fileRow)) : "None sent"],
            ["Applied", Admin.fmtDate(a.submittedAt)],
          ]),
          h("div", { class: "pe-actions-row inbox-actions" }, [
            h("a", { class: "btn btn-solid", href: `mailto:${a.email}?subject=${encodeURIComponent("Your Symphony Talent Quest application")}` }, "Email them"),
            deleteControl("applications", a, "this application", () => { all.splice(all.indexOf(a), 1); openId = null; drawList(); drawDetail(null); }),
          ].filter(Boolean)),
          noteControl("applications", a)
        );
      }

      const csv = btn("Download spreadsheet", () => downloadCsv(`talent-applicants-${stamp()}.csv`, [
        ["Application", (a) => a.id], ["Applied", (a) => a.submittedAt], ["Stage", (a) => LABELS.applications[a.status]], ["Rating", (a) => a.rating || ""],
        ["Name", (a) => a.fullName], ["Email", (a) => a.email], ["Phone", (a) => a.phone],
        ["State", (a) => a.state], ["Country", (a) => a.country], ["From", (a) => a.location],
        ["Gender", (a) => a.gender], ["Age category", (a) => a.ageCategory], ["Track", (a) => a.track],
        ["About them", (a) => a.bio], ["Social", (a) => a.socialLink], ["Best work", (a) => a.projectLink],
        ["Samples", (a) => (a.files || []).map((f) => f.name).join("; ")], ["Notes", (a) => a.note],
      ], shown()));

      [status, track].forEach((s) => s.addEventListener("change", drawList));
      q.addEventListener("input", drawList);
      panel.replaceChildren(title, h("div", { class: "inbox-bar" }, [status, track, q, count, csv]), h("div", { class: "admin-layout inbox-layout" }, [listHost, detailHost]));
      drawList();
      const first = shown()[0];
      if (first) { openId = first.id; drawList(); }
      drawDetail(first || null);
    },
  });

  /* ===================================================================
   * Registrations
   * =================================================================== */
  Admin.register("registrations", {
    async render(panel, sub) {
      const title = head("Registrations", "Everyone registered for an event. Check people in, cancel or restore a place, or add someone by hand.");
      const loaded = await loadOr(panel, title, async () => Promise.all([Backend.forms.list("registrations"), currentEvents()]));
      if (!loaded) return;
      const [all, events] = loaded;
      all.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
      let openId = null;

      const known = new Map(events.map((e) => [e.id, e]));
      all.forEach((r) => { if (!known.has(r.eventId)) known.set(r.eventId, { id: r.eventId, name: r.eventName || r.eventId, capacity: null }); });
      const eventPairs = [...known.values()].sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).map((e) => [e.id, `${e.name}${e.date ? ` · ${day(e.date)}` : ""}`]);
      const eventSel = select([["all", "Every event"], ...eventPairs], known.has(sub) ? sub : "all", "Event");
      const status = select([["registered", "Registered"], ["cancelled", "Cancelled"], ["all", "Registered and cancelled"]], "registered", "Status");
      const arrival = select([["all", "Arrived or not"], ["in", "Checked in"], ["out", "Not checked in yet"]], "all", "Check-in");
      const q = searchBox("Find a name, email or ticket ID");
      const summary = h("div", { class: "inbox-summary" });
      const listHost = h("div");
      const detailHost = h("div", { class: "detail-panel" });

      const shown = () => all.filter((r) =>
        (eventSel.value === "all" || r.eventId === eventSel.value) &&
        (status.value === "all" || r.status === status.value) &&
        (arrival.value === "all" || (arrival.value === "in" ? r.checkedIn : !r.checkedIn)) &&
        (!q.value.trim() || [r.name, r.email, r.id, r.phone].join(" ").toLowerCase().includes(q.value.trim().toLowerCase())));

      function drawSummary() {
        const scope = all.filter((r) => (eventSel.value === "all" || r.eventId === eventSel.value) && r.status === "registered");
        const ev = known.get(eventSel.value);
        const cap = ev && ev.capacity ? Number(ev.capacity) : null;
        const cards = [
          ["Registered", String(scope.length)],
          ["Checked in", String(scope.filter((r) => r.checkedIn).length)],
          cap ? ["Places left", String(Math.max(0, cap - scope.length))] : null,
          cap ? ["Full", `${Math.min(100, Math.round((scope.length / cap) * 100))}%`] : null,
        ].filter(Boolean);
        summary.replaceChildren(...cards.map(([label, value]) => h("div", { class: "stat-card" }, [h("p", { class: "stat-card__label", text: label }), h("p", { class: "stat-card__value", text: value })])));
      }

      function drawList() {
        drawSummary();
        const items = shown();
        if (!items.length) {
          listHost.replaceChildren(h("p", { class: "admin-empty", text: all.length ? "Nothing matches these filters." : "No one has registered for an event yet." }));
          return;
        }
        listHost.replaceChildren(table([
          ["Name", (r) => r.name],
          ["Event", (r) => r.eventName],
          ["Status", (r) => (r.status === "cancelled" ? pill("registrations", "cancelled") : r.checkedIn ? h("span", { class: "status-pill status-pill--checked", text: "Checked in" }) : pill("registrations", "registered"))],
          ["", (r) => (r.status === "registered" && !r.checkedIn ? btn("Check in", () => checkIn(r)) : "")],
        ], items, { onOpen: (r) => { openId = r.id; drawList(); drawDetail(r); }, isCurrent: (r) => r.id === openId }));
      }

      async function checkIn(r) {
        try { Object.assign(r, await Backend.forms.checkIn(r.id)); toast(`${r.name} checked in.`, "is-success"); drawList(); if (openId === r.id) drawDetail(r); } catch (err) { toast(err.message, "is-error"); }
      }
      async function change(r, patch, message) {
        try { Object.assign(r, await Backend.forms.update("registrations", r.id, patch)); toast(message, "is-success"); drawList(); drawDetail(r); } catch (err) { toast(err.message, "is-error"); }
      }

      function drawDetail(r) {
        if (!r) { detailHost.replaceChildren(h("p", { class: "detail-panel__empty", text: "Choose someone to see their registration." })); return; }
        detailHost.replaceChildren(
          h("p", { class: "admin-card__title", text: r.name }),
          details([
            ["Ticket ID", r.id], ["Event", r.eventName], ["Email", mailto(r.email, r.eventName)], ["Phone", tel(r.phone)],
            ...answerPairs(r),
            ["Registered", Admin.fmtDate(r.registeredAt)], ["Through", r.source === "admin" ? "Added by the team" : "The website"],
            ["Status", r.status === "cancelled" ? "Cancelled" : r.checkedIn ? `Checked in at ${Admin.fmtDate(r.checkedInAt)}` : "Registered, not checked in yet"],
          ]),
          h("div", { class: "pe-actions-row inbox-actions" }, [
            r.status === "registered" && !r.checkedIn ? btn("Check in", () => checkIn(r), "btn btn-solid") : null,
            r.checkedIn ? btn("Undo check-in", () => change(r, { checkedIn: false, checkedInAt: null }, "Check-in undone.")) : null,
            r.status === "registered"
              ? btn("Cancel registration", () => change(r, { status: "cancelled" }, "Registration cancelled; the place is free again."), "pe-small-btn is-danger")
              : btn("Restore registration", () => change(r, { status: "registered" }, "Registration restored.")),
            deleteControl("registrations", r, "this registration", () => { all.splice(all.indexOf(r), 1); openId = null; drawList(); drawDetail(null); }),
          ].filter(Boolean)),
          noteControl("registrations", r)
        );
      }

      // Add someone by hand.
      const addEvent = select(eventPairs.filter(([id]) => events.some((e) => e.id === id)), eventSel.value !== "all" ? eventSel.value : (eventPairs[0] || [""])[0], "Event");
      const name = h("input", { type: "text", class: "admin-input", autocomplete: "off" });
      const email = h("input", { type: "email", class: "admin-input", autocomplete: "off" });
      const phone = h("input", { type: "tel", class: "admin-input", autocomplete: "off" });
      const addError = h("p", { class: "admin-auth__note", role: "alert" });
      const addForm = h("form", { class: "inbox-add", novalidate: true }, [
        h("label", { class: "admin-field" }, [h("span", { text: "Event" }), addEvent]),
        h("label", { class: "admin-field" }, [h("span", { text: "Name" }), name]),
        h("label", { class: "admin-field" }, [h("span", { text: "Email" }), email]),
        h("label", { class: "admin-field" }, [h("span", { text: "Phone (optional)" }), phone]),
        addError,
        h("button", { type: "submit", class: "btn btn-solid" }, "Register them"),
      ]);
      addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        addError.textContent = "";
        addError.dataset.kind = "";
        const ev = events.find((x) => x.id === addEvent.value);
        if (!ev) { addError.textContent = "Choose an event."; addError.dataset.kind = "error"; return; }
        if (!name.value.trim() || !Backend.isEmail(email.value)) { addError.textContent = "Add their name and a valid email."; addError.dataset.kind = "error"; return; }
        try {
          const reg = await Backend.forms.addRegistration(ev, { name: name.value.trim(), email: email.value.trim(), phone: phone.value.trim() });
          all.unshift({ status: "registered", checkedIn: false, source: "admin", note: "", ...reg, registeredAt: reg.registeredAt || new Date().toISOString() });
          const who = name.value.trim();
          toast(`${who} is registered. Ticket ${reg.id}.`, "is-success");
          // Their ticket (or confirmation) by email, as if they'd registered themselves.
          Backend.email.send("registrations", reg.id).then((r) => { if (r.sent) toast(`${ev.ticketRequired === false ? "Confirmation" : "Ticket"} emailed to ${who}.`); });
          addForm.reset();
          drawList();
        } catch (err) {
          addError.textContent = err.message;
          addError.dataset.kind = "error";
        }
      });

      const csv = btn("Download spreadsheet", () => {
        const rows = shown();
        downloadCsv(`registrations-${stamp()}.csv`, [
          ["Ticket ID", (r) => r.id], ["Event", (r) => r.eventName], ["Name", (r) => r.name], ["Email", (r) => r.email], ["Phone", (r) => r.phone],
          ...answerColumns(rows),
          ["Registered", (r) => r.registeredAt], ["Status", (r) => r.status], ["Checked in", (r) => (r.checkedIn ? r.checkedInAt : "")],
          ["Through", (r) => r.source], ["Notes", (r) => r.note],
        ], rows);
      });

      [eventSel, status, arrival].forEach((s) => s.addEventListener("change", drawList));
      q.addEventListener("input", drawList);
      panel.replaceChildren(
        title,
        h("div", { class: "inbox-bar" }, [eventSel, status, arrival, q, csv]),
        summary,
        h("div", { class: "admin-layout inbox-layout" }, [
          listHost,
          h("div", { class: "inbox-side" }, [detailHost, h("div", { class: "admin-card" }, [h("p", { class: "admin-card__title", text: "Register someone" }), addForm])]),
        ])
      );
      drawList();
      drawDetail(null);
    },
  });

  /* ===================================================================
   * Newsletter
   * =================================================================== */
  Admin.register("subscribers", {
    async render(panel) {
      const title = head("Newsletter", "Everyone who has joined the mailing list, from the newsletter box on every page and the contact form.");
      const all = await loadOr(panel, title, () => Backend.forms.list("subscribers"));
      if (!all) return;
      all.sort((a, b) => new Date(b.subscribedAt || 0) - new Date(a.subscribedAt || 0));
      const which = select([["on", "Subscribed"], ["off", "Unsubscribed"], ["all", "Everyone"]], "on", "Status");
      const q = searchBox("Find an email");
      const count = h("span", { class: "inbox-count" });
      const listHost = h("div");
      const shown = () => all.filter((s) => (which.value === "all" || (which.value === "on" ? !s.unsubscribedAt : Boolean(s.unsubscribedAt))) && (!q.value.trim() || s.email.includes(q.value.trim().toLowerCase())));

      async function toggle(s) {
        try {
          Object.assign(s, await Backend.forms.update("subscribers", s.email, { unsubscribedAt: s.unsubscribedAt ? null : new Date().toISOString() }));
          toast(s.unsubscribedAt ? "Taken off the list." : "Back on the list.", "is-success");
          draw();
        } catch (err) { toast(err.message, "is-error"); }
      }
      function draw() {
        const items = shown();
        count.textContent = plural(items.length, "address", "addresses");
        if (!items.length) { listHost.replaceChildren(h("p", { class: "admin-empty", text: all.length ? "Nothing matches." : "No one has joined the list yet." })); return; }
        listHost.replaceChildren(table([
          ["Email", (s) => s.email],
          ["Joined from", (s) => s.source || "—"],
          ["Joined", (s) => day(s.subscribedAt)],
          ["Status", (s) => (s.unsubscribedAt ? `Unsubscribed ${day(s.unsubscribedAt)}` : "Subscribed")],
          ["", (s) => h("div", { class: "pe-actions-row" }, [
            btn(s.unsubscribedAt ? "Resubscribe" : "Unsubscribe", () => toggle(s)),
            deleteControl("subscribers", s, s.email, () => { all.splice(all.indexOf(s), 1); draw(); }),
          ].filter(Boolean))],
        ], items));
      }
      const copy = btn("Copy the addresses", async () => {
        const emails = all.filter((s) => !s.unsubscribedAt).map((s) => s.email).join(", ");
        try { await navigator.clipboard.writeText(emails); toast("Copied: paste them into your email's Bcc box."); } catch (_) { toast(emails); }
      });
      const csv = btn("Download spreadsheet", () => downloadCsv(`newsletter-${stamp()}.csv`, [
        ["Email", (s) => s.email], ["Joined from", (s) => s.source], ["Joined", (s) => s.subscribedAt], ["Unsubscribed", (s) => s.unsubscribedAt],
      ], shown()));
      which.addEventListener("change", draw);
      q.addEventListener("input", draw);
      panel.replaceChildren(title, h("div", { class: "inbox-bar" }, [which, q, count, copy, csv]), listHost);
      draw();
    },
  });

  /* ===================================================================
   * Check-in at the door
   * Scanning uses the browser's own barcode reader where there is one
   * (Chrome on Android) and the jsQR library everywhere else. A camera
   * needs the site on https.
   * =================================================================== */
  let stopCamera = () => {};
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${Backend.root}js/vendor/jsqr.js`;
      s.onload = () => resolve(window.jsQR);
      s.onerror = () => reject(new Error("The QR reader couldn't load."));
      document.head.appendChild(s);
    });
  }

  Admin.register("checkin", {
    async render(panel) {
      stopCamera();
      const title = head("Event check-in", "Scan the QR code on someone's ticket, or type the ticket ID from their confirmation email.");
      const loaded = await loadOr(panel, title, async () => Promise.all([Backend.forms.list("registrations"), currentEvents()]));
      if (!loaded) return;
      const [regs, events] = loaded;
      const upcoming = [...events].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const soonest = upcoming.find((e) => new Date(`${e.date}T23:59:59`).getTime() >= Date.now()) || upcoming[upcoming.length - 1];
      const eventSel = select([["all", "Any event"], ...upcoming.map((e) => [e.id, `${e.name} · ${day(e.date)}`])], soonest ? soonest.id : "all", "Event");
      const counts = h("div", { class: "inbox-summary" });
      const input = h("input", { type: "text", class: "admin-input checkin-id", placeholder: "REG-XXXXXXXX", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", "aria-label": "Ticket ID" });
      const result = h("div", { class: "checkin-result", role: "status", "aria-live": "polite" });
      const recent = h("ul", { class: "checkin-recent" });
      const video = h("video", { class: "checkin-video", playsinline: true, muted: true, hidden: true });
      const scanBtn = btn("Scan a ticket", () => (scanning ? stopCamera() : startCamera()), "btn btn-ghost");
      let scanning = false;
      let busy = false;

      function drawCounts() {
        const scope = regs.filter((r) => r.status === "registered" && (eventSel.value === "all" || r.eventId === eventSel.value));
        const inside = scope.filter((r) => r.checkedIn).length;
        counts.replaceChildren(
          h("div", { class: "stat-card" }, [h("p", { class: "stat-card__label", text: "Checked in" }), h("p", { class: "stat-card__value", text: String(inside) })]),
          h("div", { class: "stat-card" }, [h("p", { class: "stat-card__label", text: "Still to arrive" }), h("p", { class: "stat-card__value", text: String(scope.length - inside) })])
        );
      }

      function show(outcome, lines) {
        result.dataset.visible = "true";
        result.dataset.outcome = outcome;
        result.replaceChildren(...lines.map((l, i) => h("p", { class: i ? "field-hint" : "checkin-result__main", text: l })));
      }

      async function checkIn(raw) {
        const id = String(raw || "").trim().toUpperCase();
        if (!id || busy) return;
        busy = true;
        try {
          const reg = regs.find((r) => r.id.toUpperCase() === id);
          if (reg && eventSel.value !== "all" && reg.eventId !== eventSel.value) {
            show("warn", [`${reg.name} is registered for ${reg.eventName}, not this event.`, "Choose “Any event” to check them in anyway."]);
            return;
          }
          const done = await Backend.forms.checkIn(id);
          if (reg) Object.assign(reg, done);
          show("success", [`✓ ${done.name} is checked in.`, `${done.eventName} · ${new Date(done.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`]);
          recent.prepend(h("li", { text: `${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · ${done.name} · ${done.eventName}` }));
          input.value = "";
          drawCounts();
          if (navigator.vibrate) navigator.vibrate(80);
        } catch (err) {
          show(/^already/i.test(err.message) ? "warn" : "error", [err.message]);
        } finally {
          busy = false;
        }
      }

      async function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { show("error", ["This browser can't use a camera here. Type the ticket ID instead."]); return; }
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        } catch (err) {
          show("error", [location.protocol === "https:" || location.hostname === "localhost" ? "The camera wasn't allowed. Check the browser's permission for this site." : "The camera only works when the site is opened over https."]);
          return;
        }
        video.srcObject = stream;
        video.hidden = false;
        await video.play().catch(() => {});
        scanning = true;
        scanBtn.textContent = "Stop scanning";
        let detector = null;
        if ("BarcodeDetector" in window) {
          try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (_) { detector = null; }
        }
        const reader = detector ? null : await loadJsQR().catch(() => null);
        const canvas = document.createElement("canvas");
        const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
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
              ctx2d.drawImage(video, 0, 0);
              const img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
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
        };
      }

      // Leaving this screen (or the page) turns the camera off.
      Admin.setGuard({ dirty: () => { stopCamera(); return false; }, confirm: async () => true });

      const form = h("form", { class: "checkin-form", novalidate: true }, [
        h("div", { class: "checkin-input-row" }, [input, h("button", { type: "submit", class: "btn btn-solid" }, "Check in"), scanBtn]),
      ]);
      form.addEventListener("submit", (e) => { e.preventDefault(); checkIn(input.value); });
      eventSel.addEventListener("change", drawCounts);
      panel.replaceChildren(
        title,
        h("div", { class: "inbox-bar" }, [eventSel]),
        counts,
        h("div", { class: "checkin-panel" }, [form, video, result, h("p", { class: "admin-card__title checkin-recent__title", text: "Checked in on this screen" }), recent])
      );
      drawCounts();
      input.focus();
    },
  });

  /* ===================================================================
   * Dashboard: what needs attention, above the analytics
   * =================================================================== */
  Admin.register("dashboard", {
    async render(panel) {
      const host = panel.querySelector("[data-attention]");
      if (host) {
        host.replaceChildren(loading("Checking the inbox…"));
        const card = (label, value, note, href) => h("a", { class: "attention-card", href }, [
          h("p", { class: "stat-card__label", text: label }),
          h("p", { class: "stat-card__value", text: value }),
          note ? h("p", { class: "stat-card__delta", text: note }) : null,
        ].filter(Boolean));
        try {
          const [enquiries, applications, regs, subscribers, events, drafts] = await Promise.all([
            Backend.forms.list("enquiries"), Backend.forms.list("applications"), Backend.forms.list("registrations"),
            Backend.forms.list("subscribers"), currentEvents(), Admin.can("edit") ? Backend.content.getDrafts() : Promise.resolve({}),
          ]);
          const fresh = enquiries.filter((e) => e.status === "new");
          const bookings = fresh.filter((e) => e.type === "booking").length;
          const toReview = applications.filter((a) => a.status === "received").length;
          const next = [...events].filter((e) => new Date(`${e.date}T23:59:59`).getTime() >= Date.now()).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
          const nextRegs = next ? regs.filter((r) => r.eventId === next.id && r.status === "registered") : [];
          const cards = [
            card("New enquiries", String(fresh.length), !fresh.length ? "Nothing waiting on a reply" : bookings ? `${plural(bookings, "booking request")} among them` : "Waiting on a reply", "#enquiries"),
            card("Applicants to review", String(toReview), `${plural(applications.length, "application")} in all`, "#talent"),
            next ? card("Next event", `${nextRegs.length}${next.capacity ? ` / ${next.capacity}` : ""}`, `${next.name} · ${day(next.date)}`, `#registrations/${next.id}`) : null,
            card("Newsletter", String(subscribers.filter((s) => !s.unsubscribedAt).length), "people on the list", "#subscribers"),
            Admin.can("edit") ? card("Waiting to be published", String(Object.keys(drafts).length), Object.keys(drafts).length ? "Drafts not live yet" : "Everything is live", "#publish") : null,
          ].filter(Boolean);
          host.replaceChildren(h("p", { class: "attention__title", text: "Needs attention" }), h("div", { class: "attention" }, cards));
        } catch (err) {
          host.replaceChildren(h("p", { class: "admin-empty", text: err.message }));
        }
      }
      if (window.renderAnalyticsDashboard) await window.renderAnalyticsDashboard();
    },
  });
})();
