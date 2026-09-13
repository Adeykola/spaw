/**
 * admin-site.js
 * ----------------------------------------------------------------------
 * The website screens:
 *   Pages                    every word, link and picture of each page,
 *                            which sections show, and search & sharing.
 *   Header, menus & footer   the same, for what every page shares.
 *   Publish & history        drafts waiting to go live, and every version
 *                            published so far, any of which can be
 *                            brought back.
 *   Media library            uploaded pictures and files.
 *
 * Pages reads each page's HTML file and finds its editable pieces with
 * content.js's collect(), exactly as the live page does, so the key an
 * edit is saved under is the key the page looks up.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";
  const { h, toast, dialog, head, loading } = Admin;
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => Content.stable(a) === Content.stable(b);
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  /* ---- reading a page's HTML ---------------------------------------- */
  const pageCache = new Map();
  async function loadPage(page) {
    if (pageCache.has(page)) return pageCache.get(page);
    const info = Content.PAGES.find((p) => p.page === page);
    if (location.protocol === "file:") throw new Error("Open the admin through the website's address, not as a file on this computer, to edit pages.");
    const res = await fetch(`${Backend.root}${info.file}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Couldn't read ${info.file} (${res.status}).`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const { fields, sections } = Content.collect(doc, { page });
    const q = (s) => doc.querySelector(s);
    const meta = {
      title: doc.title,
      description: (q('meta[name="description"]') || { content: "" }).content,
      image: (q('meta[property="og:image"]') || { content: "" }).content,
    };
    const entry = { info, fields, sections, meta };
    pageCache.set(page, entry);
    return entry;
  }

  async function loadStore() {
    const [published, drafts] = await Promise.all([Backend.content.getPublished(), Backend.content.getDrafts()]);
    return { published, drafts };
  }

  function countChanges(a, b) {
    const x = Content.tidy(a);
    const y = Content.tidy(b);
    let n = 0;
    new Set([...Object.keys(x.fields), ...Object.keys(y.fields)]).forEach((k) => { if (!same(x.fields[k], y.fields[k])) n += 1; });
    new Set([...Object.keys(x.hidden), ...Object.keys(y.hidden)]).forEach((k) => { if (Boolean(x.hidden[k]) !== Boolean(y.hidden[k])) n += 1; });
    ["title", "description", "image"].forEach((k) => { if ((x.meta[k] || "") !== (y.meta[k] || "")) n += 1; });
    return n;
  }

  const previewHref = (info) => `${Backend.root}${info.path}${info.path.includes("?") ? "&" : "?"}preview=drafts`;

  function pickFile(accept = "image/*") {
    return new Promise((resolve) => {
      const input = h("input", { type: "file", accept });
      input.addEventListener("change", () => resolve(input.files[0] || null), { once: true });
      input.addEventListener("cancel", () => resolve(null), { once: true });
      input.click();
    });
  }

  async function uploadPicture(file, status) {
    status.textContent = "Preparing…";
    const ready = await Backend.prepareImage(file);
    status.textContent = `Uploading ${Math.max(1, Math.round(ready.size / 1024))} KB…`;
    const item = await Backend.media.upload(ready, file.name);
    status.textContent = "";
    return item;
  }

  function plainPaste(e) {
    e.preventDefault();
    const text = ((e.clipboardData && e.clipboardData.getData("text/plain")) || "").replace(/\s+/g, " ");
    document.execCommand("insertText", false, text);
  }

  function richToText(html) {
    const d = document.createElement("div");
    d.appendChild(Content.richFragment(html));
    return d.textContent;
  }

  // Publishes every draft on the site, after saying which.
  async function publishAll() {
    let drafts;
    try { drafts = await Backend.content.getDrafts(); } catch (err) { toast(err.message, "is-error"); return false; }
    const keys = Object.keys(drafts).sort();
    if (!keys.length) { toast("Nothing to publish: the live site already matches."); return false; }
    const note = h("input", { type: "text", class: "admin-input", placeholder: "e.g. New concert date on the homepage" });
    const ok = await dialog({
      title: "Publish now?",
      body: [
        h("p", { text: "Visitors will see these straight away:" }),
        h("ul", { class: "admin-dialog__list" }, keys.map((k) => h("li", { text: Admin.labelForKey(k) }))),
        h("label", { class: "admin-field" }, [h("span", { text: "Note for the history (optional)" }), note]),
      ],
      actions: [["Cancel", false], ["Publish", true, "is-primary"]],
    });
    if (!ok) return false;
    try {
      await Backend.content.publish(note.value);
      toast("Published. The changes are live.", "is-success");
      Admin.refreshBadges();
      return true;
    } catch (err) {
      toast(err.message, "is-error");
      return false;
    }
  }

  /* ---- the field editor (Pages, and Header/menus/footer) ------------- */
  async function renderEditor(host, { scope, page = "index", onSaved = () => {} }) {
    host.replaceChildren(loading("Reading the page…"));
    const key = scope === "global" ? "page:global" : `page:${page}`;
    let source;
    let store;
    try {
      [source, store] = await Promise.all([loadPage(scope === "global" ? "index" : page), loadStore()]);
    } catch (err) {
      host.replaceChildren(h("p", { class: "admin-empty", text: err.message }));
      return;
    }

    const fields = source.fields.filter((f) => (scope === "global") === (f.scope === "global"));
    const sections = scope === "global" ? [] : source.sections;
    const livePub = () => Content.tidy(store.published[key]);
    const draft = store.drafts[key];
    let work = Content.tidy(draft && draft.data !== null ? draft.data : store.published[key]);
    let saved = Content.stable(work);
    const dirty = () => Content.stable(work) !== saved;
    Admin.setGuard({ dirty, confirm: Admin.leaveDialog });

    /* toolbar */
    const info = scope === "global" ? Content.PAGES[0] : source.info;
    const status = h("span", { class: "pe-status", role: "status" });
    const saveBtn = h("button", { type: "button", class: "btn btn-solid" }, "Save draft");
    const pubBtn = h("button", { type: "button", class: "btn btn-ghost" }, "Publish…");
    const preview = h("a", { class: "btn btn-ghost", href: previewHref(info), target: "_blank", rel: "noopener" }, "Preview ↗");
    const search = h("input", {
      type: "search",
      class: "admin-input pe-search",
      placeholder: scope === "global" ? "Find words in the header, menus or footer…" : "Find words on this page…",
      "aria-label": "Find words",
    });
    const fmt = (cmd, label, cls, title) => {
      const b = h("button", { type: "button", class: `pe-small-btn ${cls}`, title }, label);
      b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
      b.addEventListener("click", () => {
        const target = document.activeElement;
        if (!target || !target.classList.contains("pe-rich")) { toast("Select some words in a box first, then choose a style."); return; }
        document.execCommand(cmd);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      });
      return b;
    };
    const toolbar = h("div", { class: "pe-toolbar" }, [
      search,
      h("div", { class: "pe-format" }, [
        fmt("italic", "Emphasis", "is-em", "The red italic used in headings (Ctrl+I)"),
        fmt("bold", "Bold", "is-b", "Ctrl+B"),
      ]),
      status,
      h("div", { class: "pe-toolbar__actions" }, [preview, saveBtn, pubBtn]),
    ]);

    function refreshStatus() {
      const n = countChanges(work, livePub());
      const unsaved = dirty();
      status.textContent = unsaved ? "Unsaved changes" : n ? `${plural(n, "change")} saved as a draft, not live yet` : "Matches the live site";
      status.classList.toggle("is-unsaved", unsaved);
      saveBtn.disabled = !unsaved;
    }

    async function save({ quiet = false } = {}) {
      try {
        if (same(work, livePub())) {
          if (store.drafts[key]) { await Backend.content.discardDraft(key); delete store.drafts[key]; }
        } else {
          await Backend.content.saveDraft(key, clone(work));
          store.drafts[key] = { data: clone(work) };
        }
        saved = Content.stable(work);
        refreshStatus();
        Admin.refreshBadges();
        onSaved(store.drafts);
        if (!quiet) toast("Saved as a draft. Visitors still see the live site.");
        return true;
      } catch (err) {
        toast(err.message, "is-error");
        return false;
      }
    }

    async function publish() {
      if (dirty() && !(await save({ quiet: true }))) return;
      if (!(await publishAll())) return;
      store = await loadStore();
      work = Content.tidy(store.published[key]);
      saved = Content.stable(work);
      rows.forEach((r) => r.refresh());
      refreshStatus();
      onSaved(store.drafts);
    }

    saveBtn.addEventListener("click", () => save());
    pubBtn.addEventListener("click", publish);
    preview.addEventListener("click", async (e) => {
      if (!dirty()) return;
      e.preventDefault();
      if (await save({ quiet: true })) window.open(preview.href, "_blank", "noopener");
    });

    /* one row per field */
    const rows = [];
    function fieldRow(f) {
      const el = h("div", { class: "pe-row" });
      const chip = h("span", { class: "pe-chip" });
      const reset = h("button", { type: "button", class: "pe-reset", hidden: true }, "Use original");
      el.append(h("div", { class: "pe-row__head" }, [
        h("span", { class: "pe-kind", text: [f.kind, f.variant && `${f.variant} layout`].filter(Boolean).join(" · ") }),
        chip,
        reset,
      ]));
      const current = () => {
        const e = work.fields[f.key];
        return e && e.o === f.fp ? e.v : null;
      };
      const set = (v) => {
        if (v == null) delete work.fields[f.key];
        else work.fields[f.key] = { v, o: f.fp };
        mark();
        refreshStatus();
      };
      function mark() {
        const mine = work.fields[f.key];
        const changed = !same(mine, livePub().fields[f.key]);
        el.dataset.state = changed ? "changed" : mine ? "live" : "";
        chip.textContent = changed ? (mine ? "Changed" : "Back to original") : mine ? "Edited" : "";
        reset.hidden = !mine;
      }

      let text = () => f.excerpt;
      let fill = () => {};
      if (f.type === "words" || f.type === "link") {
        const input = h("div", { class: "pe-rich", contenteditable: "true", role: "textbox", "aria-multiline": "true", "aria-label": f.label, spellcheck: "true" });
        const href = f.type === "link" ? h("input", { type: "text", class: "admin-input pe-href", "aria-label": "Link address", spellcheck: "false" }) : null;
        fill = () => {
          const v = current();
          // Safe: sanitizeRich leaves only text, <em>, <strong> and <br>.
          input.innerHTML = Content.sanitizeRich(v == null ? f.originalHtml : (f.type === "link" ? v.html : v));
          if (href) href.value = v && v.href ? v.href : f.originalHref;
        };
        const commit = () => {
          const html = Content.sanitizeRich(input.innerHTML);
          if (f.type === "link") {
            const address = Content.safeUrl(href.value.trim()) || f.originalHref;
            const words = html || f.originalHtml;
            set(words !== f.originalHtml || address !== f.originalHref ? { html: words, href: address } : null);
          } else {
            set(html && html !== f.originalHtml ? html : null);
          }
        };
        input.addEventListener("input", commit);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); }
        });
        input.addEventListener("paste", plainPaste);
        // Emptied and left: show the original again (the saved value already is).
        input.addEventListener("blur", () => { if (!Content.sanitizeRich(input.innerHTML)) fill(); });
        if (href) href.addEventListener("input", commit);
        text = () => `${f.excerpt} ${input.textContent}`;
        el.append(input);
        if (href) el.append(h("label", { class: "admin-field pe-href-field" }, [h("span", { text: "Link address" }), href]));
      } else {
        const thumb = h("img", { class: "pe-thumb", alt: "" });
        const alt = h("textarea", { class: "admin-input", rows: "2", "aria-label": "Describe the picture" });
        const note = h("span", { class: "pe-image__status", role: "status" });
        const choose = h("button", { type: "button", class: "pe-small-btn" }, "Replace picture…");
        fill = () => {
          const v = current();
          thumb.src = Content.resolveMedia(v && v.src ? v.src : f.originalSrc);
          alt.value = v && typeof v.alt === "string" ? v.alt : f.originalAlt;
        };
        const commit = (src) => {
          const v = current();
          const nextSrc = src || (v && v.src) || f.originalSrc;
          const nextAlt = alt.value.trim();
          set(nextSrc === f.originalSrc && nextAlt === f.originalAlt ? null : { src: nextSrc, alt: nextAlt });
        };
        choose.addEventListener("click", async () => {
          const file = await pickFile();
          if (!file) return;
          choose.disabled = true;
          try {
            const item = await uploadPicture(file, note);
            thumb.src = Content.resolveMedia(item.url);
            commit(item.url);
            note.textContent = "Uploaded. Describe it below.";
          } catch (err) {
            note.textContent = err.message;
          } finally {
            choose.disabled = false;
          }
        });
        alt.addEventListener("input", () => commit());
        text = () => `${f.excerpt} ${alt.value}`;
        el.append(h("div", { class: "pe-image" }, [
          thumb,
          h("div", { class: "pe-image__side" }, [
            h("div", { class: "pe-actions-row" }, [choose, note]),
            h("label", { class: "admin-field" }, [h("span", { text: "Describe the picture" }), alt, h("small", { text: "Read aloud to blind visitors, and shown if the picture can't load." })]),
          ]),
        ]));
      }
      reset.addEventListener("click", () => { set(null); fill(); });
      fill();
      mark();
      const row = { el, text: () => text(), refresh: () => { fill(); mark(); } };
      rows.push(row);
      return row;
    }

    /* cards */
    const cards = [];
    if (scope === "global") {
      cards.push(h("div", { class: "pe-card pe-card--note" }, [
        h("p", { text: "Everything here is shared by all the pages. The Symphony page's own header button (“Apply Now”) is edited on that page." }),
      ]));
    }
    if (sections.length) {
      const card = h("div", { class: "pe-card" }, [
        h("p", { class: "pe-card__title", text: "Sections on this page" }),
        h("p", { class: "pe-card__note", text: "Untick a section to hide it from visitors. It stays here, ready to show again." }),
      ]);
      sections.forEach((s) => {
        const box = h("input", { type: "checkbox" });
        box.checked = !work.hidden[s.key];
        box.addEventListener("change", () => {
          if (box.checked) delete work.hidden[s.key]; else work.hidden[s.key] = true;
          refreshStatus();
        });
        card.append(h("label", { class: "pe-toggle" }, [h("span", { text: s.label }), box]));
      });
      cards.push(card);
    }
    if (scope !== "global") cards.push(metaCard());
    const heldCard = h("div", { class: "pe-card pe-card--held" });
    cards.push(heldCard);

    const groups = new Map();
    fields.forEach((f) => {
      if (!groups.has(f.groupLabel)) groups.set(f.groupLabel, []);
      groups.get(f.groupLabel).push(f);
    });
    groups.forEach((list, label) => {
      const card = h("div", { class: "pe-card" }, [h("p", { class: "pe-card__title", text: label })]);
      list.forEach((f) => card.append(fieldRow(f).el));
      cards.push(card);
    });

    function metaCard() {
      const card = h("div", { class: "pe-card" }, [h("p", { class: "pe-card__title", text: "Search & sharing" })]);
      const title = h("input", { type: "text", class: "admin-input", placeholder: source.meta.title });
      title.value = work.meta.title || "";
      const desc = h("textarea", { class: "admin-input", rows: "3", placeholder: source.meta.description });
      desc.value = work.meta.description || "";
      const thumb = h("img", { class: "pe-thumb", alt: "" });
      const note = h("span", { class: "pe-image__status", role: "status" });
      const showThumb = () => { thumb.src = Content.resolveMedia(work.meta.image || source.meta.image || ""); };
      const choose = h("button", { type: "button", class: "pe-small-btn" }, "Replace picture…");
      const useOriginal = h("button", { type: "button", class: "pe-small-btn" }, "Use original");
      choose.addEventListener("click", async () => {
        const file = await pickFile();
        if (!file) return;
        try {
          const item = await uploadPicture(file, note);
          work.meta.image = item.url;
          showThumb();
          refreshStatus();
        } catch (err) { note.textContent = err.message; }
      });
      useOriginal.addEventListener("click", () => { delete work.meta.image; showThumb(); refreshStatus(); });
      title.addEventListener("input", () => {
        if (title.value.trim()) work.meta.title = title.value.trim(); else delete work.meta.title;
        refreshStatus();
      });
      desc.addEventListener("input", () => {
        if (desc.value.trim()) work.meta.description = desc.value.trim(); else delete work.meta.description;
        refreshStatus();
      });
      showThumb();
      card.append(
        h("label", { class: "admin-field" }, [h("span", { text: "Title in the browser tab and search results" }), title, h("small", { text: "Leave it empty to keep the original, shown in grey." })]),
        h("label", { class: "admin-field" }, [h("span", { text: "Search description" }), desc, h("small", { text: "One or two sentences Google may show under the title." })]),
        h("div", { class: "admin-field" }, [
          h("span", { text: "Share picture" }),
          h("div", { class: "pe-image" }, [thumb, h("div", { class: "pe-image__side" }, [
            h("div", { class: "pe-actions-row" }, [choose, useOriginal, note]),
            h("small", { text: "Used where the sharing app reads it. WhatsApp and Facebook previews show the page's built-in picture." }),
          ])]),
        ])
      );
      return card;
    }

    function renderHeld() {
      const known = new Map(fields.map((f) => [f.key, f]));
      const held = Object.entries(work.fields).filter(([k, e]) => !known.has(k) || known.get(k).fp !== e.o);
      heldCard.hidden = !held.length;
      if (!held.length) return;
      const describe = (v) => {
        if (typeof v === "string") return richToText(v);
        if (v && v.html) return `${richToText(v.html)} → ${v.href}`;
        if (v && v.src) return `Picture: ${v.src}`;
        return "";
      };
      heldCard.replaceChildren(
        h("p", { class: "pe-card__title", text: `Held back (${held.length})` }),
        h("p", { class: "pe-card__note", text: "These edits were made to words that have since changed in the site's code, so they aren't shown. Copy anything you still need into the right box below, then remove them." }),
        ...held.map(([k, e]) => h("div", { class: "pe-row" }, [
          h("div", { class: "pe-row__head" }, [
            h("span", { class: "pe-kind", text: k.split("/").slice(1).join(" › ") }),
            h("button", { type: "button", class: "pe-reset", onclick: () => { delete work.fields[k]; renderHeld(); refreshStatus(); } }, "Remove"),
          ]),
          h("p", { class: "pe-held__text", text: describe(e.v) }),
        ]))
      );
    }

    host.replaceChildren(toolbar, ...cards);
    renderHeld();
    refreshStatus();

    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      rows.forEach((r) => { r.el.hidden = Boolean(q) && !r.text().toLowerCase().includes(q); });
      cards.forEach((c) => {
        const inCard = c.querySelectorAll(".pe-row");
        if (inCard.length && !c.classList.contains("pe-card--held")) c.hidden = Boolean(q) && Array.from(inCard).every((x) => x.hidden);
      });
    });
  }

  /* ---- Pages -------------------------------------------------------- */
  Admin.register("pages", {
    async render(panel, sub) {
      const page = Content.PAGES.some((p) => p.page === sub) ? sub : "index";
      const list = h("nav", { class: "pages-list", "aria-label": "Pages" });
      const host = h("div", { class: "pages-editor" });
      panel.replaceChildren(
        head("Pages", "Every word, link and picture on each page, and which sections show. Changes are saved as drafts and go live when you publish. You can also edit straight on the site: open a page and choose “Edit this page”."),
        h("div", { class: "pages-layout" }, [list, host])
      );
      const drawList = (drafts) => list.replaceChildren(...Content.PAGES.map((p) =>
        h("a", { href: `#pages/${p.page}`, "aria-current": String(p.page === page) }, [
          h("span", { text: p.label }),
          drafts && drafts[`page:${p.page}`] ? h("span", { class: "pages-list__dot", title: "Has an unpublished draft" }) : null,
        ])));
      drawList(null);
      Backend.content.getDrafts().then(drawList).catch(() => {});
      await renderEditor(host, { scope: "page", page, onSaved: drawList });
    },
  });

  Admin.register("site", {
    async render(panel) {
      const host = h("div", { class: "pages-editor" });
      panel.replaceChildren(head("Header, menus & footer", "Set once, shown on every page: the top menu, the header button, the phone menu and the footer."), host);
      await renderEditor(host, { scope: "global" });
    },
  });

  /* ---- Publish & history -------------------------------------------- */
  Admin.register("publish", {
    async render(panel) {
      const title = head("Publish & history", "What's waiting to go live, and every version published so far. Bringing back an earlier version turns it into drafts first, so you can check it before it goes live.");
      panel.replaceChildren(title, loading());
      let published;
      let drafts;
      let versions;
      try {
        [published, drafts, versions] = await Promise.all([Backend.content.getPublished(), Backend.content.getDrafts(), Backend.content.listVersions()]);
      } catch (err) {
        panel.replaceChildren(title, h("p", { class: "admin-empty", text: err.message }));
        return;
      }
      const rerender = () => this.render(panel);

      const pending = h("div", { class: "pe-card" }, [h("p", { class: "pe-card__title", text: "Waiting to be published" })]);
      const keys = Object.keys(drafts).sort((a, b) => Admin.labelForKey(a).localeCompare(Admin.labelForKey(b)));
      if (!keys.length) {
        pending.append(h("p", { class: "admin-empty", text: "Nothing is waiting. The live site matches the last publish." }));
      } else {
        const list = h("div", { class: "pub-list" });
        keys.forEach((k) => {
          const d = drafts[k];
          const isPage = k.startsWith("page:");
          const info = k === "page:global" ? Content.PAGES[0] : Content.PAGES.find((p) => `page:${p.page}` === k);
          const count = isPage ? countChanges(d.data, published[k]) : null;
          const discard = h("button", { type: "button", class: "pe-small-btn is-danger" }, "Discard");
          discard.addEventListener("click", async () => {
            const ok = await dialog({
              title: `Discard the draft for ${Admin.labelForKey(k)}?`,
              body: [h("p", { text: "Its unpublished changes are deleted. The live site isn't affected." })],
              actions: [["Keep it", false], ["Discard", true, "is-danger"]],
            });
            if (!ok) return;
            try { await Backend.content.discardDraft(k); toast("Draft discarded."); Admin.refreshBadges(); rerender(); } catch (err) { toast(err.message, "is-error"); }
          });
          list.append(h("div", { class: "pub-item" }, [
            h("div", {}, [
              h("p", { class: "pub-item__title", text: Admin.labelForKey(k) }),
              h("p", { class: "pub-item__meta", text: [count != null ? plural(count, "change") : "Changed", d.updatedBy ? `saved by ${d.updatedBy}` : "", d.updatedAt ? Admin.timeAgo(d.updatedAt) : ""].filter(Boolean).join(" · ") }),
            ]),
            h("div", { class: "pub-item__actions" }, [
              isPage ? h("a", { class: "pe-small-btn", href: k === "page:global" ? "#site" : `#pages/${k.slice(5)}` }, "Open") : null,
              info ? h("a", { class: "pe-small-btn", href: previewHref(info), target: "_blank", rel: "noopener" }, "Preview ↗") : null,
              discard,
            ]),
          ]));
        });
        const go = h("button", { type: "button", class: "btn btn-solid" }, "Publish everything");
        go.addEventListener("click", async () => { if (await publishAll()) rerender(); });
        pending.append(list, h("div", { class: "pub-go" }, [go]));
      }

      const history = h("div", { class: "pe-card" }, [h("p", { class: "pe-card__title", text: "History" })]);
      if (!versions.length) {
        history.append(h("p", { class: "admin-empty", text: "Nothing has been published from the admin yet." }));
      } else {
        const list = h("div", { class: "pub-list" });
        versions.forEach((v, i) => {
          const restore = h("button", { type: "button", class: "pe-small-btn" }, "Bring back…");
          restore.addEventListener("click", async () => {
            const ok = await dialog({
              title: `Bring back version ${v.id}?`,
              body: [h("p", { text: "Everything that differs from it becomes a draft, replacing any draft for the same page. Nothing changes for visitors until you publish." })],
              actions: [["Cancel", false], ["Bring it back as drafts", true, "is-primary"]],
            });
            if (!ok) return;
            try {
              const n = await Backend.content.restoreVersion(v.id);
              toast(n ? `${plural(n, "draft")} made from version ${v.id}. Check them, then publish.` : "That version matches the live site already.", "is-success");
              Admin.refreshBadges();
              rerender();
            } catch (err) { toast(err.message, "is-error"); }
          });
          list.append(h("div", { class: "pub-item" }, [
            h("div", {}, [
              h("p", { class: "pub-item__title", text: `Version ${v.id}${i === 0 ? " · live now" : ""}` }),
              h("p", { class: "pub-item__meta", text: [Admin.fmtDate(v.publishedAt), v.publishedBy, (v.keys || []).map(Admin.labelForKey).join(", ")].filter(Boolean).join(" · ") }),
              v.note ? h("p", { class: "pub-item__note", text: `“${v.note}”` }) : null,
            ]),
            h("div", { class: "pub-item__actions" }, [i === 0 ? null : restore]),
          ]));
        });
        history.append(list);
      }

      panel.replaceChildren(title, pending, history);
    },
  });

  /* ---- Media library ------------------------------------------------ */
  const sizeLabel = (n) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  function demoUsage() {
    let chars = 0;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        chars += k.length + (localStorage.getItem(k) || "").length;
      }
    } catch (_) { return null; }
    return chars;
  }

  Admin.register("media", {
    async render(panel) {
      const input = h("input", { type: "file", multiple: true, accept: "image/*,application/pdf,audio/*", hidden: true });
      const drop = h("div", { class: "media-drop" }, [
        h("p", { class: "media-drop__title", text: "Drop pictures or files here" }),
        h("button", { type: "button", class: "btn btn-solid", onclick: () => input.click() }, "Choose files…"),
        h("small", { text: "Pictures are made smaller before they upload, so pages stay quick on mobile data." }),
        input,
      ]);
      const progress = h("div", { class: "media-progress", role: "status" });
      const usage = h("p", { class: "media-usage" });
      const grid = h("div", { class: "media-grid" });
      panel.replaceChildren(head("Media library", "Pictures and files uploaded for the site. Pictures you upload while editing a page land here too."), drop, progress, usage, grid);

      const card = (m) => {
        const isImage = /^image\//.test(m.type) || /\.(jpe?g|png|webp|gif|svg)$/i.test(m.name);
        const copy = h("button", { type: "button", class: "pe-small-btn" }, "Copy link");
        copy.addEventListener("click", async () => {
          if (/^local-media:/.test(m.url)) { toast("Demo uploads only exist in this browser, so there's no link to share yet."); return; }
          try { await navigator.clipboard.writeText(m.url); toast("Link copied."); } catch (_) { toast(m.url); }
        });
        const del = h("button", { type: "button", class: "pe-small-btn is-danger" }, "Delete");
        del.addEventListener("click", async () => {
          const ok = await dialog({
            title: `Delete ${m.name}?`,
            body: [h("p", { text: "If a page still uses it, that spot will show a broken picture until it's replaced. This can't be undone." })],
            actions: [["Keep it", false], ["Delete", true, "is-danger"]],
          });
          if (!ok) return;
          try { await Backend.media.remove(m.path); toast("Deleted."); draw(); } catch (err) { toast(err.message, "is-error"); }
        });
        return h("div", { class: "media-card" }, [
          isImage
            ? h("img", { class: "media-card__thumb", src: Content.resolveMedia(m.url), alt: "", loading: "lazy" })
            : h("div", { class: "media-card__file", text: (m.name.split(".").pop() || "file").toUpperCase() }),
          h("div", { class: "media-card__body" }, [
            h("p", { class: "media-card__name", text: m.name }),
            h("p", { class: "pub-item__meta", text: [sizeLabel(m.size), m.addedAt ? Admin.timeAgo(m.addedAt) : ""].filter(Boolean).join(" · ") }),
            h("div", { class: "media-card__actions" }, [copy, del]),
          ]),
        ]);
      };

      async function draw() {
        grid.replaceChildren(loading());
        let items;
        try { items = await Backend.media.list(); } catch (err) { grid.replaceChildren(h("p", { class: "admin-empty", text: err.message })); return; }
        if (Backend.mode === "demo") {
          const used = demoUsage();
          usage.textContent = used == null ? "" : `Demo storage in this browser: about ${(used / 1024 / 1024).toFixed(1)} MB used of roughly 5 MB. Connected to Supabase, uploads go to online storage instead.`;
        }
        grid.replaceChildren(...(items.length ? items.map(card) : [h("p", { class: "admin-empty", text: "Nothing uploaded yet." })]));
      }

      async function uploadAll(files) {
        for (const file of files) {
          const line = h("p", { text: `${file.name}: preparing…` });
          progress.append(line);
          try {
            const ready = /^image\//.test(file.type) ? await Backend.prepareImage(file) : file;
            line.textContent = `${file.name}: uploading ${sizeLabel(ready.size)}…`;
            await Backend.media.upload(ready, file.name);
            line.textContent = `${file.name}: uploaded.`;
            setTimeout(() => line.remove(), 4000);
          } catch (err) {
            line.textContent = `${file.name}: ${err.message}`;
            line.classList.add("is-error");
          }
        }
        draw();
      }

      input.addEventListener("change", () => { uploadAll(Array.from(input.files)); input.value = ""; });
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        drop.classList.remove("is-over");
        if (e.dataTransfer && e.dataTransfer.files.length) uploadAll(Array.from(e.dataTransfer.files));
      });
      draw();
    },
  });

  // Shared with the content screens (admin-content.js).
  Object.assign(Admin, { publishAll, pickFile, uploadPicture, previewHref });
})();
