/**
 * editor.js — "Edit this page"
 * ----------------------------------------------------------------------
 * Loaded by content.js only when an admin has signed in on this browser.
 * For Owners and Editors it adds a small dock with "Edit this page"; in
 * edit mode every word, link and picture that content.js found becomes
 * clickable:
 *
 *   words   click to type in place; Emphasis (the red italic), Bold and
 *           line breaks from the little panel or Ctrl+I / Ctrl+B /
 *           Shift+Enter; links also get their address.
 *   images  click to choose a new picture (shrunk before upload) and to
 *           describe it for visitors who can't see it.
 *   slides  "Slide background" swaps the current hero slide's picture.
 *   sections  each one can be hidden from visitors, or shown again.
 *   page    title, search description and share picture.
 *
 * Changes stay in this browser until "Save draft" (visitors still see the
 * live page), then go live with "Publish". Alt-click uses a link or button
 * as normal while editing. Team members only get the dock's Admin link.
 * ----------------------------------------------------------------------
 */
(async () => {
  "use strict";
  if (!window.Content || !window.Backend) return;
  const C = window.Content;
  const S = C.state;

  let session = null;
  try { session = await Backend.auth.getSession(); } catch (_) { /* offline, or signed out elsewhere */ }
  if (!session) return;

  const canEdit = Backend.can(session.role, "edit");
  const PAGE = S.page;
  const PAGE_LABEL = (C.PAGES.find((p) => p.page === PAGE) || { label: PAGE }).label;
  const KEY = { page: `page:${PAGE}`, global: "page:global" };
  const ADMIN_URL = `${Backend.root}admin`;
  const html = document.documentElement;

  /* ---- helpers -------------------------------------------------------- */
  function h(tag, props = {}, kids = []) {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => { if (c != null && c !== false) n.append(c); });
    return n;
  }
  const btn = (label, onclick, { title, cls = "", disabled = false } = {}) =>
    h("button", { type: "button", class: `edit-btn ${cls}`, title, disabled, onclick }, label);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  // Key order must not make two equal documents look different.
  const stable = (v) => {
    if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
    if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
    return JSON.stringify(v === undefined ? null : v);
  };
  const same = (a, b) => stable(a) === stable(b);
  function tidy(d) {
    const out = { fields: {}, hidden: {}, meta: {} };
    if (d && typeof d === "object") {
      Object.assign(out.fields, d.fields || {});
      Object.entries(d.hidden || {}).forEach(([k, v]) => { if (v) out.hidden[k] = true; });
      Object.entries(d.meta || {}).forEach(([k, v]) => { if (v) out.meta[k] = v; });
    }
    return out;
  }
  const docName = (f) => (f.scope === "global" ? "global" : "page");
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  function toast(message, kind = "") {
    const t = h("div", { class: `edit-ui edit-toast ${kind}`, role: "status", text: message });
    document.body.append(t);
    requestAnimationFrame(() => t.classList.add("is-in"));
    setTimeout(() => { t.classList.remove("is-in"); setTimeout(() => t.remove(), 300); }, kind === "is-error" ? 6000 : 3400);
  }

  function modal({ title, body, actions }) {
    return new Promise((resolve) => {
      const d = h("dialog", { class: "edit-ui edit-dialog" });
      const done = (value) => { d.close(); d.remove(); resolve(value); };
      d.append(
        h("h2", { text: title }),
        h("div", { class: "edit-dialog__body" }, body),
        h("div", { class: "edit-dialog__actions" }, actions.map(([label, value, cls]) => btn(label, () => done(value), { cls })))
      );
      d.addEventListener("cancel", (e) => { e.preventDefault(); done(actions[0][1]); });
      document.body.append(d);
      d.showModal();
    });
  }

  function labelForKey(key) {
    if (key === "page:global") return "Site-wide: header, menus and footer";
    if (key.startsWith("page:")) {
      const p = C.PAGES.find((x) => x.page === key.slice(5));
      return p ? `${p.label} page` : key.slice(5);
    }
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  /* ---- the dock ------------------------------------------------------ */
  let drafts = {};
  try { drafts = await Backend.content.getDrafts(); } catch (_) { /* team role, or offline */ }

  const dock = h("div", { class: "edit-ui edit-dock", role: "region", "aria-label": "Site admin" });
  function renderDock() {
    const n = Object.keys(drafts).length;
    // Long labels on wide screens, short ones on phones (editor.css).
    const label = (long, short) => [h("span", { class: "edit-dock__long", text: long }), h("span", { class: "edit-dock__short", text: short })];
    dock.replaceChildren(
      canEdit ? btn(label("Edit this page", "Edit"), startEditing, { cls: "edit-dock__main" }) : null,
      canEdit && (n || S.preview)
        ? btn(
          S.preview ? label("Showing drafts · show live", "Drafts ✓") : label(`${plural(n, "unpublished draft")} · preview`, "Drafts"),
          togglePreview,
          { title: S.preview ? "You're seeing unpublished drafts. Visitors see the live site." : "See the site with the drafts applied (only you see this)." }
        )
        : null,
      h("a", { class: "edit-btn edit-dock__link", href: ADMIN_URL }, canEdit ? "Admin" : `Admin (${Backend.ROLES[session.role]})`)
    );
  }
  function togglePreview() {
    try {
      if (S.preview) sessionStorage.removeItem("drajokesings:preview");
      else sessionStorage.setItem("drajokesings:preview", "drafts");
    } catch (_) {}
    location.reload();
  }
  renderDock();
  document.body.append(dock);
  if (!canEdit) return;

  /* ---- edit mode ----------------------------------------------------- */
  let work = null;          // { page: doc, global: doc } being edited
  let savedStable = "";     // what's saved (as a draft, or live)
  let active = null;        // words being typed in: { f, live, before, hrefInput }
  let panel = null;
  let panelFor = null;
  let bar = null;
  let heroBgButton = null;

  const publishedDoc = (w) => tidy(S.published[KEY[w]]);
  const draftDoc = (w) => (drafts[KEY[w]] && drafts[KEY[w]].data !== null ? tidy(drafts[KEY[w]].data) : null);
  const dirty = () => work && stable(work) !== savedStable;

  function currentContent() {
    return { ...C.mergedContent(), [KEY.page]: work.page, [KEY.global]: work.global };
  }

  function changeCount() {
    let n = 0;
    ["page", "global"].forEach((w) => {
      const a = work[w];
      const b = publishedDoc(w);
      new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]).forEach((k) => { if (!same(a.fields[k], b.fields[k])) n += 1; });
      new Set([...Object.keys(a.hidden), ...Object.keys(b.hidden)]).forEach((k) => { if (Boolean(a.hidden[k]) !== Boolean(b.hidden[k])) n += 1; });
      ["title", "description", "image"].forEach((k) => { if ((a.meta[k] || "") !== (b.meta[k] || "")) n += 1; });
    });
    return n;
  }

  function markFields() {
    S.fields.forEach((f) => {
      if (f.type === "heroImage") return; // edited from the "Slide background" button
      f.el.setAttribute("data-edit-field", f.key);
      const mine = work[docName(f)].fields[f.key];
      const live = publishedDoc(docName(f)).fields[f.key];
      if (!same(mine, live)) f.el.setAttribute("data-edit-state", "changed");
      else f.el.removeAttribute("data-edit-state");
    });
  }

  async function startEditing() {
    try { drafts = await Backend.content.getDrafts(); } catch (err) { toast(err.message, "is-error"); return; }
    work = { page: draftDoc("page") || publishedDoc("page"), global: draftDoc("global") || publishedDoc("global") };
    savedStable = stable(work);
    S.editing = true;
    html.classList.add("is-editing");
    document.dispatchEvent(new CustomEvent("editor:start"));
    const introEnter = document.querySelector("[data-intro]:not([hidden]) [data-intro-enter]");
    if (introEnter) introEnter.click();
    dock.hidden = true;

    C.applyContent(currentContent(), { collections: false });
    markFields();
    addSectionBars();
    addHeroBackgroundButton();
    buildBar();

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("scroll", placePanel, { passive: true });
    window.addEventListener("resize", placePanel);

    if (S.held.length) {
      toast(`${plural(S.held.length, "earlier edit")} on this page no longer ${S.held.length === 1 ? "matches" : "match"} its text and ${S.held.length === 1 ? "is" : "are"} held back. Review in Admin → Pages.`);
    }
  }

  function onClick(e) {
    if (e.target.closest(".edit-ui")) return;
    if (active && active.f.el.contains(e.target)) {
      // Clicking inside the words being typed: move the caret, nothing else.
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.altKey) return; // Alt-click: use the page as a visitor would
    if (active) finishWords();
    const target = e.target.closest("[data-edit-field]");
    if (!target) { closePanel(); return; }
    e.preventDefault();
    e.stopPropagation();
    const f = C.field(target.getAttribute("data-edit-field"));
    if (!f) return;
    if (f.type === "image") openImagePanel(f, f.el);
    else startWords(f, e.clientX, e.clientY);
  }

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveDraft();
    } else if (e.key === "Escape" && panel && !active) {
      closePanel();
    }
  }

  function onUnload(e) {
    if (active) finishWords();
    if (dirty()) { e.preventDefault(); e.returnValue = ""; }
  }

  /* ---- words --------------------------------------------------------- */
  function startWords(f, x, y) {
    const live = h("span", { class: "edit-live", contenteditable: "true", spellcheck: "true" });
    const middle = Array.from(f.el.childNodes).filter((n) => !f.parts.prefix.includes(n) && !f.parts.suffix.includes(n));
    live.append(...middle);
    const after = f.parts.suffix.find((n) => n.parentNode === f.el) || null;
    f.el.insertBefore(live, after);
    active = { f, live, before: live.innerHTML, hrefInput: null };
    live.addEventListener("keydown", onLiveKey);
    live.addEventListener("paste", onPaste);
    live.addEventListener("input", placePanel);
    live.focus({ preventScroll: true });
    placeCaret(live, x, y);
    openWordsPanel(f);
  }

  function placeCaret(live, x, y) {
    let range = null;
    if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y);
    else if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); }
    }
    const sel = window.getSelection();
    if (!range || !live.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(live);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function onLiveKey(e) {
    e.stopPropagation(); // arrow keys move the caret, not the slideshow
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) lineBreak(); else finishWords();
    } else if (e.key === "Escape") {
      e.preventDefault();
      finishWords({ cancel: true });
    } else if ((e.ctrlKey || e.metaKey) && /^[ib]$/i.test(e.key)) {
      e.preventDefault();
      document.execCommand(e.key.toLowerCase() === "i" ? "italic" : "bold");
    }
  }

  function onPaste(e) {
    e.preventDefault();
    const text = ((e.clipboardData || window.clipboardData).getData("text/plain") || "").replace(/\s+/g, " ");
    if (!document.execCommand("insertText", false, text)) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      r.deleteContents();
      const t = document.createTextNode(text);
      r.insertNode(t);
      r.setStartAfter(t);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  function lineBreak() {
    if (document.execCommand("insertLineBreak")) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    const br = document.createElement("br");
    r.insertNode(br);
    r.setStartAfter(br);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function finishWords({ cancel = false } = {}) {
    if (!active) return;
    const { f, live, before, hrefInput } = active;
    const typed = cancel ? before : live.innerHTML;
    const href = hrefInput ? hrefInput.value.trim() : null;
    live.replaceWith(...Array.from(live.childNodes));
    active = null;
    closePanel();

    const d = work[docName(f)];
    const clean = C.sanitizeRich(typed);
    let value = null;
    if (f.type === "link") {
      const safeHref = (href && C.safeUrl(href)) || f.originalHref;
      if (href && !C.safeUrl(href)) toast("That link address isn't allowed, so the original stays.", "is-error");
      const words = clean || f.originalHtml;
      if (words !== f.originalHtml || safeHref !== f.originalHref) value = { html: words, href: safeHref };
    } else if (clean && clean !== f.originalHtml) {
      value = clean;
    } else if (!clean && !cancel) {
      toast("Words can't be left empty, so the original is back. To remove a whole part, hide its section.");
    }
    if (value === null) delete d.fields[f.key];
    else d.fields[f.key] = { v: value, o: f.fp };
    f.applied = undefined; // the DOM was typed into: rebuild it from the clean value
    C.setField(f, value);
    markFields();
    updateBar();
  }

  function useOriginal(f) {
    if (active && active.f === f) finishWords({ cancel: true });
    delete work[docName(f)].fields[f.key];
    f.applied = undefined;
    C.setField(f, null);
    closePanel();
    markFields();
    updateBar();
  }

  function openWordsPanel(f) {
    const hasEdit = Boolean(work[docName(f)].fields[f.key]);
    const where = [f.kind, f.variant ? `${f.variant} layout` : "", f.scope === "global" ? "on every page" : ""].filter(Boolean).join(" · ");
    const hrefInput = f.type === "link"
      ? h("input", { type: "text", class: "edit-input", value: f.el.getAttribute("href") || "", "aria-label": "Link address", spellcheck: "false" })
      : null;
    if (active) active.hrefInput = hrefInput;
    panel = h("div", { class: "edit-ui edit-panel", role: "dialog", "aria-label": `Editing ${f.kind.toLowerCase()}` }, [
      h("p", { class: "edit-panel__label", text: where }),
      h("div", { class: "edit-panel__row" }, [
        btn("Emphasis", () => document.execCommand("italic"), { title: "The red italic used in headings (Ctrl+I)", cls: "edit-btn--em" }),
        btn("Bold", () => document.execCommand("bold"), { title: "Ctrl+B", cls: "edit-btn--b" }),
        btn("Line break", lineBreak, { title: "Shift+Enter" }),
      ]),
      hrefInput
        ? h("label", { class: "edit-field" }, [
          h("span", { text: "Link address" }),
          hrefInput,
          h("small", { text: "A page on this site (e.g. contact#booking) or a full web address." }),
        ])
        : null,
      h("div", { class: "edit-panel__actions" }, [
        hasEdit ? btn("Use original", () => useOriginal(f)) : null,
        btn("Cancel", () => finishWords({ cancel: true })),
        btn("Done", () => finishWords(), { cls: "is-primary", title: "Enter" }),
      ]),
    ]);
    // Buttons mustn't take the focus (and the selection) away from the words.
    panel.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
    showPanel(panel, f.el);
  }

  /* ---- pictures ------------------------------------------------------ */
  function currentImage(f) {
    const entry = work[docName(f)].fields[f.key];
    return entry ? entry.v : { src: f.originalSrc, alt: f.originalAlt };
  }

  function setImage(f, v) {
    const d = work[docName(f)];
    const src = v.src || f.originalSrc;
    const alt = v.alt == null ? f.originalAlt : v.alt;
    if (src === f.originalSrc && alt === f.originalAlt) delete d.fields[f.key];
    else d.fields[f.key] = { v: { src, alt }, o: f.fp };
    C.setField(f, d.fields[f.key] ? d.fields[f.key].v : null);
    markFields();
    updateBar();
  }

  function openImagePanel(f, anchor) {
    closePanel();
    const cur = currentImage(f);
    const thumb = h("img", { class: "edit-panel__thumb", src: C.resolveMedia(cur.src), alt: "" });
    const alt = h("textarea", { class: "edit-input", rows: "2" });
    alt.value = cur.alt || "";
    const status = h("p", { class: "edit-panel__status", role: "status" });
    const file = h("input", { type: "file", accept: "image/*", hidden: true });
    const choose = btn("Choose a new picture…", () => file.click(), { cls: "is-primary" });

    file.addEventListener("change", async () => {
      const picked = file.files && file.files[0];
      if (!picked) return;
      choose.disabled = true;
      status.textContent = "Preparing the picture…";
      try {
        const ready = await Backend.prepareImage(picked);
        status.textContent = `Uploading ${Math.max(1, Math.round(ready.size / 1024))} KB…`;
        const item = await Backend.media.upload(ready, picked.name);
        setImage(f, { src: item.url, alt: alt.value.trim() });
        thumb.src = C.resolveMedia(item.url);
        status.textContent = "Done. Now describe the picture for visitors who can't see it.";
        alt.focus();
      } catch (err) {
        status.textContent = err.message;
      } finally {
        choose.disabled = false;
        file.value = "";
      }
    });
    alt.addEventListener("input", () => setImage(f, { src: currentImage(f).src, alt: alt.value.trim() }));

    panel = h("div", { class: "edit-ui edit-panel", role: "dialog", "aria-label": `Editing ${f.kind.toLowerCase()}` }, [
      h("p", { class: "edit-panel__label", text: [f.kind, f.variant ? `${f.variant} layout` : "", f.scope === "global" ? "on every page" : ""].filter(Boolean).join(" · ") }),
      thumb,
      h("div", { class: "edit-panel__row" }, [choose, file]),
      status,
      h("label", { class: "edit-field" }, [
        h("span", { text: "Describe the picture" }),
        alt,
        h("small", { text: "Read aloud to blind visitors and shown if the picture can't load." }),
      ]),
      h("div", { class: "edit-panel__actions" }, [
        work[docName(f)].fields[f.key] ? btn("Use original", () => { setImage(f, { src: f.originalSrc, alt: f.originalAlt }); closePanel(); }) : null,
        btn("Done", closePanel, { cls: "is-primary" }),
      ]),
    ]);
    showPanel(panel, anchor);
  }

  function addHeroBackgroundButton() {
    const hero = document.querySelector("[data-hero-slider]");
    if (!hero) return;
    heroBgButton = btn("Slide background", () => {
      const slide = hero.querySelector(".hero-slide.is-active") || hero.querySelector("[data-hero-slide]");
      const f = S.fields.find((x) => x.type === "heroImage" && x.el === slide);
      if (f) openImagePanel(f, heroBgButton);
    }, { cls: "edit-ui edit-hero-bg", title: "Change the picture behind the slide on screen" });
    hero.append(heroBgButton);
  }

  /* ---- floating panel placement -------------------------------------- */
  function showPanel(p, anchor) {
    panelFor = anchor;
    document.body.append(p);
    placePanel();
  }
  function placePanel() {
    if (!panel || !panelFor) return;
    const r = panelFor.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const barH = bar ? bar.offsetHeight : 0;
    let top = r.bottom + 10;
    if (top + ph > window.innerHeight - barH - 10) top = Math.max(10, r.top - ph - 10);
    const left = Math.min(Math.max(10, r.left), window.innerWidth - pw - 10);
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }
  function closePanel() {
    if (panel) panel.remove();
    panel = null;
    panelFor = null;
  }

  /* ---- sections ------------------------------------------------------ */
  function addSectionBars() {
    S.sections.forEach((s) => {
      if (getComputedStyle(s.el).position === "static") {
        s.el.style.position = "relative";
        s.madeRelative = true;
      }
      s.bar = h("div", { class: "edit-ui edit-section-bar" });
      renderSectionBar(s);
      s.el.prepend(s.bar);
    });
  }
  function renderSectionBar(s) {
    if (!s.bar) return;
    const hidden = Boolean(work.page.hidden[s.key]);
    s.bar.classList.toggle("is-hidden", hidden);
    s.bar.replaceChildren(
      h("span", { text: hidden ? `Hidden from visitors · ${s.label}` : s.label }),
      btn(hidden ? "Show section" : "Hide section", () => {
        if (work.page.hidden[s.key]) delete work.page.hidden[s.key];
        else work.page.hidden[s.key] = true;
        C.applySections(work.page.hidden);
        renderSectionBar(s);
        updateBar();
      })
    );
  }

  /* ---- page settings -------------------------------------------------- */
  async function openPageSettings() {
    if (active) finishWords();
    closePanel();
    const m = work.page.meta;
    const title = h("input", { type: "text", class: "edit-input", value: m.title || "", placeholder: document.head.dataset.originalTitle || "" });
    const desc = h("textarea", { class: "edit-input", rows: "3" });
    desc.value = m.description || "";
    let image = m.image || "";
    const thumb = h("img", { class: "edit-panel__thumb", src: image ? C.resolveMedia(image) : "", alt: "", hidden: !image });
    const status = h("p", { class: "edit-panel__status" });
    const file = h("input", { type: "file", accept: "image/*", hidden: true });
    file.addEventListener("change", async () => {
      const picked = file.files && file.files[0];
      if (!picked) return;
      status.textContent = "Uploading…";
      try {
        const item = await Backend.media.upload(await Backend.prepareImage(picked, { maxEdge: 1200 }), picked.name);
        image = item.url;
        thumb.src = C.resolveMedia(image);
        thumb.hidden = false;
        status.textContent = "Ready. Save to use it.";
      } catch (err) { status.textContent = err.message; }
      file.value = "";
    });
    const ok = await modal({
      title: `${PAGE_LABEL}: page settings`,
      body: [
        h("label", { class: "edit-field" }, [h("span", { text: "Title in the browser tab and search results" }), title, h("small", { text: "Leave empty to keep the original." })]),
        h("label", { class: "edit-field" }, [h("span", { text: "Search description" }), desc, h("small", { text: "One or two sentences Google may show under the title." })]),
        h("div", { class: "edit-field" }, [
          h("span", { text: "Share picture" }),
          thumb,
          h("div", { class: "edit-panel__row" }, [btn("Choose picture…", () => file.click()), btn("Use original", () => { image = ""; thumb.hidden = true; }), file]),
          status,
          h("small", { text: "Shown when the page is shared, where the app reads it. WhatsApp and Facebook previews read the page's built-in picture." }),
        ]),
      ],
      actions: [["Cancel", false], ["Apply", true, "is-primary"]],
    });
    if (!ok) return;
    work.page.meta = {};
    if (title.value.trim()) work.page.meta.title = title.value.trim();
    if (desc.value.trim()) work.page.meta.description = desc.value.trim();
    if (image) work.page.meta.image = image;
    C.applyMeta(work.page.meta);
    updateBar();
  }

  /* ---- the editing bar ----------------------------------------------- */
  function buildBar() {
    bar = h("div", { class: "edit-ui edit-bar", role: "toolbar", "aria-label": "Page editor" });
    document.body.append(bar);
    updateBar();
  }
  function updateBar() {
    if (!bar) return;
    const n = changeCount();
    const unsaved = dirty();
    let status;
    if (unsaved) status = "Unsaved changes";
    else if (n) status = `${plural(n, "change")} saved as a draft, not live yet`;
    else status = "Matches the live site";
    bar.replaceChildren(
      h("div", { class: "edit-bar__info" }, [
        h("strong", { text: `Editing: ${PAGE_LABEL}` }),
        h("span", { class: unsaved ? "edit-bar__status is-unsaved" : "edit-bar__status", text: status }),
        h("small", { class: "edit-bar__hint", text: Backend.mode === "demo" ? "Demo mode: saved in this browser only · Click words or pictures to change them · Alt-click uses a link" : "Click words or pictures to change them · Alt-click uses a link or button" }),
      ]),
      h("div", { class: "edit-bar__actions" }, [
        btn("Page settings", openPageSettings),
        btn("Discard…", discardFlow, { disabled: !n && !unsaved }),
        btn("Save draft", () => saveDraft(), { disabled: !unsaved, title: "Ctrl+S" }),
        btn("Publish…", publishFlow, { cls: "is-primary" }),
        btn("Done", stopEditing),
      ])
    );
  }

  async function saveDraft({ quiet = false } = {}) {
    if (active) finishWords();
    try {
      for (const w of ["page", "global"]) {
        const key = KEY[w];
        if (same(work[w], publishedDoc(w))) {
          // Back to exactly what's live: no draft needed.
          if (drafts[key]) { await Backend.content.discardDraft(key); delete drafts[key]; }
        } else if (!drafts[key] || !same(drafts[key].data, work[w])) {
          await Backend.content.saveDraft(key, clone(work[w]));
          drafts[key] = { data: clone(work[w]) };
        }
      }
      savedStable = stable(work);
      updateBar();
      if (!quiet) toast("Saved as a draft. Visitors still see the live page.");
      return true;
    } catch (err) {
      toast(err.message, "is-error");
      return false;
    }
  }

  async function publishFlow() {
    if (active) finishWords();
    if (dirty() && !(await saveDraft({ quiet: true }))) return;
    let all;
    try { all = await Backend.content.getDrafts(); } catch (err) { toast(err.message, "is-error"); return; }
    const keys = Object.keys(all);
    if (!keys.length) { toast("Nothing to publish: everything matches the live site."); return; }
    const note = h("input", { type: "text", class: "edit-input", placeholder: "e.g. New concert date on the homepage" });
    const ok = await modal({
      title: "Publish now?",
      body: [
        h("p", { text: "Visitors will see these changes straight away:" }),
        h("ul", {}, keys.map((k) => h("li", { text: labelForKey(k) }))),
        h("label", { class: "edit-field" }, [h("span", { text: "Note for the history (optional)" }), note]),
      ],
      actions: [["Cancel", false], ["Publish", true, "is-primary"]],
    });
    if (!ok) return;
    try {
      await Backend.content.publish(note.value);
      S.published = await Backend.content.getPublished();
      if (Backend.mode === "live") Store.write("content:cache", S.published);
      drafts = {};
      S.drafts = {};
      savedStable = stable(work);
      markFields();
      updateBar();
      toast("Published. The changes are live.", "is-success");
    } catch (err) {
      toast(err.message, "is-error");
    }
  }

  async function discardFlow() {
    if (active) finishWords({ cancel: true });
    const ok = await modal({
      title: "Discard changes?",
      body: [h("p", { text: `${PAGE_LABEL}, and the header, menus and footer on every page, go back to what's live now. Unpublished drafts for them are deleted; this can't be undone.` })],
      actions: [["Keep editing", false], ["Discard", true, "is-danger"]],
    });
    if (!ok) return;
    try {
      for (const w of ["page", "global"]) {
        if (drafts[KEY[w]]) { await Backend.content.discardDraft(KEY[w]); delete drafts[KEY[w]]; }
      }
      work = { page: publishedDoc("page"), global: publishedDoc("global") };
      savedStable = stable(work);
      C.applyContent(currentContent(), { collections: false });
      markFields();
      S.sections.forEach(renderSectionBar);
      updateBar();
      toast("Back to the live version.");
    } catch (err) {
      toast(err.message, "is-error");
    }
  }

  async function stopEditing() {
    if (active) finishWords();
    if (dirty()) {
      const choice = await modal({
        title: "Keep these changes?",
        body: [h("p", { text: "Save them as a draft to publish later, or throw them away." })],
        actions: [["Keep editing", "stay"], ["Throw away", "drop", "is-danger"], ["Save draft", "save", "is-primary"]],
      });
      if (choice === "stay") return;
      if (choice === "save" && !(await saveDraft({ quiet: true }))) return;
    }
    teardown();
    try { drafts = await Backend.content.getDrafts(); } catch (_) {}
    // Leave the drafts on screen, if there are any, so what was just edited
    // doesn't seem to vanish.
    S.drafts = drafts;
    S.preview = Object.keys(drafts).length > 0;
    try {
      if (S.preview) sessionStorage.setItem("drajokesings:preview", "drafts");
      else sessionStorage.removeItem("drajokesings:preview");
    } catch (_) {}
    C.applyContent(C.mergedContent(), { collections: false });
    renderDock();
    dock.hidden = false;
  }

  function teardown() {
    closePanel();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("beforeunload", onUnload);
    window.removeEventListener("scroll", placePanel);
    window.removeEventListener("resize", placePanel);
    S.fields.forEach((f) => { f.el.removeAttribute("data-edit-field"); f.el.removeAttribute("data-edit-state"); });
    S.sections.forEach((s) => {
      if (s.bar) s.bar.remove();
      s.bar = null;
      if (s.madeRelative) { s.el.style.position = ""; s.madeRelative = false; }
    });
    if (heroBgButton) heroBgButton.remove();
    heroBgButton = null;
    if (bar) bar.remove();
    bar = null;
    S.editing = false;
    work = null;
    html.classList.remove("is-editing");
    document.dispatchEvent(new CustomEvent("editor:end"));
  }
})();
