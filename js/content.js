/**
 * content.js
 * ----------------------------------------------------------------------
 * Makes the words, links, images and sections of every public page
 * editable from the admin, and loads what the admin has published.
 *
 * Page text stays written in the HTML: that is the original, what search
 * engines and no-JS visitors get, and what "Use original" returns to. On
 * load this script finds every editable piece of the page (collect()),
 * gives it a stable key (page / section / position) and applies whatever
 * has been published for that key. Each saved edit carries a fingerprint
 * of the words it replaced: if the page's own words at that spot have
 * since changed in the code, the edit is held back (the admin lists it
 * for review) rather than landing on the wrong line.
 *
 * Collections (songs, events, Symphony…) are published under their own
 * keys and replace the matching part of DB (data.js) before any page
 * script reads them: api.* waits on window.ContentReady.
 *
 * With an admin signed in, it also loads editor.js ("Edit this page").
 * On admin.html it only lends its tools (the Pages screen parses each
 * page with the same collect()) and applies nothing.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  const ROOT = (window.Backend && Backend.root) || new URL("./", location.href).href;

  /* ---- Which page is this? ---------------------------------------- */
  function pageName(href = location.href) {
    const rootPath = new URL(ROOT).pathname;
    let rel = new URL(href, location.href).pathname;
    rel = rel.startsWith(rootPath) ? rel.slice(rootPath.length) : rel.replace(/^.*\//, "");
    rel = rel.replace(/\/+$/, "").replace(/\.html$/, "");
    return rel.split("/").pop() || "index";
  }
  const PAGE = pageName();

  const PAGES = [
    { page: "index", label: "Home", file: "index.html", path: "./" },
    { page: "music", label: "Music", file: "music.html", path: "music" },
    { page: "albums", label: "Albums", file: "albums.html", path: "albums" },
    { page: "song", label: "Song page", file: "song.html", path: "song?id=track-001" },
    { page: "media", label: "Media", file: "media.html", path: "media" },
    { page: "ministry", label: "Ministry", file: "ministry.html", path: "ministry" },
    { page: "symphony", label: "Symphony", file: "symphony.html", path: "symphony" },
    { page: "events", label: "Events", file: "events.html", path: "events" },
    { page: "about", label: "About", file: "about.html", path: "about" },
    { page: "contact", label: "Contact & Booking", file: "contact.html", path: "contact" },
  ];

  /* ---- Small utilities -------------------------------------------- */
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim();
  function fingerprint(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  function slugify(s) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 48) || "part";
  }
  // JSON with sorted keys, so two equal documents always compare equal.
  function stable(v) {
    if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
    if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
    return JSON.stringify(v === undefined ? null : v);
  }
  // A page document in its full shape, with empty entries dropped.
  function tidy(d) {
    const out = { fields: {}, hidden: {}, meta: {} };
    if (d && typeof d === "object") {
      Object.assign(out.fields, clone(d.fields) || {});
      Object.entries(d.hidden || {}).forEach(([k, v]) => { if (v) out.hidden[k] = true; });
      Object.entries(d.meta || {}).forEach(([k, v]) => { if (v) out.meta[k] = v; });
    }
    return out;
  }

  /* ---- Sanitising --------------------------------------------------
   * Saved words may carry italics (the red italic words), bold and line
   * breaks, nothing else. They are parsed into an inert <template> (no
   * scripts run, nothing loads) and rebuilt node by node, so no markup
   * from storage ever reaches the page as-is. */
  function richFragment(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html == null ? "" : html);
    const out = document.createDocumentFragment();
    const copy = (from, to) => {
      from.childNodes.forEach((n) => {
        if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") return;
        if (tag === "BR") { to.appendChild(document.createElement("br")); return; }
        if (tag === "EM" || tag === "I") { const e = document.createElement("em"); copy(n, e); to.appendChild(e); return; }
        if (tag === "STRONG" || tag === "B") { const s = document.createElement("strong"); copy(n, s); to.appendChild(s); return; }
        copy(n, to); // anything else is unwrapped, keeping its words
      });
    };
    copy(tpl.content, out);
    return out;
  }
  function sanitizeRich(html) {
    const d = document.createElement("div");
    d.appendChild(richFragment(html));
    return d.innerHTML
      .replace(/[ \t\n\r\f]+/g, " ")
      .replace(/^(?:\s*<br>)+|(?:<br>\s*)+$/g, "")
      .trim();
  }
  function safeUrl(url, kind = "link") {
    const u = String(url || "").trim();
    if (!u) return "";
    if (kind === "image" && /^local-media:[a-z0-9-]+$/i.test(u)) return u;
    if (kind === "image" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u)) return u;
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ""; // javascript:, other data: and unknown schemes
    return u; // a page on this site, #anchor, ?query, assets/…
  }
  const resolveMedia = (src) => (window.Backend ? Backend.resolveMediaUrl(src) : src);

  /* ---- Finding the editable pieces ---------------------------------
   * An element is a piece of text when it holds words and, at most, plain
   * <em>, <strong> and <br>: exactly what an edit can produce, so an edit
   * can never strip styling the design depends on. Anything richer (a
   * styled <span>, say) makes it a container, and its parts are editable
   * one by one instead. Decorative children with no words (an icon, the
   * pulsing dot, a radio button) at its start or end are kept aside and
   * put back untouched. Elements carrying a script hook (any data-*
   * attribute not in PASSIVE_DATA) are left alone: a script fills them,
   * so their words come from the collections, not from this page. */
  const FORMATTING = new Set(["EM", "I", "STRONG", "B", "BR"]);
  const TEXT_HOLDERS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "DT", "DD", "BLOCKQUOTE", "FIGCAPTION", "A", "BUTTON", "LABEL", "SPAN", "DIV", "SMALL", "STRONG", "EM", "TD", "TH", "CAPTION", "LEGEND", "SUMMARY", "CITE", "Q", "TIME"]);
  const PASSIVE_DATA = new Set([
    "data-reveal", "data-magnetic", "data-hero-anim", "data-cursor-text", "data-split-words",
    "data-hero-more", "data-intro-enter", "data-reveal-delay",
  ]);
  const SKIP = ".sig, .brand, script, style, svg, noscript, template, .sr-only, .cursor, .cursor__label, [data-edit-skip], input, select, textarea, option, video, audio, iframe, canvas, .grain, .scroll-progress, .hero__rail-num, .mode-option__num";
  const ANCHORS = "section, nav, header, footer, dialog, [data-intro]";
  const GLOBAL_ROOTS = "header.site-header, nav.mobile-nav, footer.site-footer";
  const GLOBAL_LABELS = { header: "Header", primary: "Top menu", mobile: "Phone menu", footer: "Footer" };

  function isScripted(el) {
    for (const a of el.attributes) if (a.name.startsWith("data-") && !PASSIVE_DATA.has(a.name)) return true;
    return false;
  }
  const isDecorative = (n) => n.nodeType === 1 && n.tagName !== "BR" && !n.textContent.trim();
  const isBlank = (n) => (n.nodeType === 3 && !n.nodeValue.trim()) || n.nodeType === 8;
  function isFormatting(n) {
    return n.nodeType === 1 && FORMATTING.has(n.tagName) && n.attributes.length === 0 &&
      Array.from(n.childNodes).every((c) => c.nodeType === 3 || c.nodeType === 8 || isFormatting(c));
  }
  function textParts(el) {
    if (!TEXT_HOLDERS.has(el.tagName) || isScripted(el)) return null;
    const kids = Array.from(el.childNodes);
    let start = 0;
    let end = kids.length;
    while (start < end && (isDecorative(kids[start]) || isBlank(kids[start]))) start += 1;
    while (end > start && (isDecorative(kids[end - 1]) || isBlank(kids[end - 1]))) end -= 1;
    const middle = kids.slice(start, end);
    if (!middle.length || !middle.map((n) => n.textContent).join("").trim()) return null;
    for (const n of middle) {
      if (n.nodeType === 1 && !isFormatting(n)) return null;
    }
    return { prefix: kids.slice(0, start), middle, suffix: kids.slice(end) };
  }
  // The words as a reader sees them: a line break or a bold label next to
  // its value counts as a space.
  function readableText(nodes) {
    let out = "";
    const walk = (n) => {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      out += " ";
      n.childNodes.forEach(walk);
      out += " ";
    };
    nodes.forEach(walk);
    return normalize(out);
  }

  function anchorOf(el, root) {
    const a = el.closest(ANCHORS);
    return a && root.contains(a) ? a : root;
  }
  function anchorSlug(a) {
    if (a.matches("header.site-header")) return "header";
    if (a.matches("footer.site-footer")) return "footer";
    return slugify(a.getAttribute("aria-label") || a.id || a.tagName);
  }
  function labelOf(el, anchor, slug, scope) {
    if (scope === "global") return GLOBAL_LABELS[slug] || anchor.getAttribute("aria-label") || slug;
    const box = el.parentElement && el.parentElement.closest("article[aria-label], section[aria-label], nav[aria-label], dialog");
    if (box && box.tagName === "DIALOG") {
      const t = box.getAttribute("aria-labelledby") && box.ownerDocument.getElementById(box.getAttribute("aria-labelledby"));
      return `Panel: ${t ? readableText([t]) : box.id}`;
    }
    const sectionLabel = anchor.getAttribute("aria-label") || anchor.id || "Page";
    if (box && box !== anchor && box.tagName === "ARTICLE") return `${sectionLabel} › ${box.getAttribute("aria-label")}`;
    return sectionLabel;
  }
  function kindOf(el, type) {
    if (type === "image") return "Image";
    if (type === "heroImage") return "Slide background";
    const t = el.tagName;
    if (/^H[1-6]$/.test(t)) return "Heading";
    if (t === "P") return "Paragraph";
    if (t === "LI") return "List item";
    if (t === "A") return el.classList.contains("btn") || /register|more/.test(el.className) ? "Button" : "Link";
    if (t === "BUTTON") return "Button";
    if (t === "LABEL") return "Form label";
    if (t === "DT") return "Label";
    if (t === "DD") return "Detail";
    if (t === "BLOCKQUOTE") return "Quote";
    if (t === "FIGCAPTION") return "Caption";
    if (t === "SUMMARY") return "Question";
    return "Text";
  }
  const variantOf = (el) => (el.closest(".hero__phone, .hero-side") ? "phone" : el.closest(".hero__desk") ? "desktop" : "");

  function serialize(nodes) {
    const d = document.createElement("div");
    nodes.forEach((n) => d.appendChild(n.cloneNode(true)));
    return sanitizeRich(d.innerHTML);
  }

  function collect(doc = document, { page = PAGE } = {}) {
    const fields = [];
    const sections = [];
    const counters = new Map();

    doc.querySelectorAll(`[data-intro], ${GLOBAL_ROOTS}, main`).forEach((root) => {
      const scope = root.matches(GLOBAL_ROOTS) ? "global" : page;
      visit(root, root, scope);
    });

    doc.querySelectorAll("main > section").forEach((s) => {
      const label = s.getAttribute("aria-label") || s.id || "Section";
      sections.push({ key: `${page}/section/${slugify(label)}`, el: s, label, originallyHidden: s.hidden });
    });
    return { fields, sections };

    function visit(node, root, scope) {
      for (const el of Array.from(node.children)) {
        if (el.matches(SKIP)) continue;
        if (el.tagName === "IMG") {
          if (!isScripted(el) && el.getAttribute("src")) add(el, root, scope, "image");
          continue;
        }
        if (el.hasAttribute("data-hero-image")) add(el, root, scope, "heroImage");
        const parts = textParts(el);
        if (parts) { add(el, root, scope, el.tagName === "A" ? "link" : "words", parts); continue; }
        visit(el, root, scope);
      }
    }

    function add(el, root, scope, type, parts) {
      const anchor = anchorOf(el, root);
      const slug = anchorSlug(anchor);
      const base = `${scope}/${slug}`;
      const n = (counters.get(base) || 0) + 1;
      counters.set(base, n);
      // applied: "" means the page shows the original, so putting the
      // original back is a no-op and pages with no edits aren't rebuilt.
      const f = { key: `${base}/${n}`, scope, type, el, group: base, groupLabel: labelOf(el, anchor, slug, scope), variant: variantOf(el), kind: kindOf(el, type), applied: "" };

      if (type === "image") {
        f.originalSrc = el.getAttribute("src");
        f.originalAlt = el.getAttribute("alt") || "";
        f.fp = fingerprint(`img:${f.originalSrc}`);
        f.excerpt = f.originalAlt || f.originalSrc.split("/").pop();
      } else if (type === "heroImage") {
        f.originalSrc = el.getAttribute("data-hero-image");
        f.originalAlt = el.getAttribute("data-hero-image-alt") || "";
        f.fp = fingerprint(`hero:${f.originalSrc}`);
        f.excerpt = f.originalAlt || f.originalSrc.split("/").pop();
      } else {
        f.parts = parts;
        f.originalMiddle = parts.middle.map((m) => m.cloneNode(true));
        const first = parts.middle[0];
        const last = parts.middle[parts.middle.length - 1];
        f.lead = parts.prefix.length > 0 && first.nodeType === 3 && /^\s/.test(first.nodeValue);
        f.trail = parts.suffix.length > 0 && last.nodeType === 3 && /\s$/.test(last.nodeValue);
        f.originalHtml = serialize(parts.middle);
        f.originalText = readableText(parts.middle);
        f.fp = fingerprint(f.originalText);
        f.excerpt = f.originalText;
        if (type === "link") f.originalHref = el.getAttribute("href") || "";
      }
      f.label = `${f.kind}${f.variant ? ` (${f.variant})` : ""}: “${f.excerpt.length > 70 ? `${f.excerpt.slice(0, 68)}…` : f.excerpt}”`;
      fields.push(f);
    }
  }

  /* ---- Putting values on the page ---------------------------------- */
  // value: undefined/null puts the original back.
  function setField(f, value) {
    const sig = value == null ? "" : JSON.stringify(value);
    if (f.applied === sig) return;
    f.applied = sig;

    if (f.type === "image") {
      const src = value && value.src ? safeUrl(value.src, "image") : "";
      f.el.setAttribute("src", resolveMedia(src || f.originalSrc));
      f.el.setAttribute("alt", value && typeof value.alt === "string" ? value.alt : f.originalAlt);
      if (src) f.el.removeAttribute("srcset");
      return;
    }
    if (f.type === "heroImage") {
      const src = resolveMedia((value && value.src && safeUrl(value.src, "image")) || f.originalSrc);
      f.el.setAttribute("data-hero-image-alt", value && typeof value.alt === "string" ? value.alt : f.originalAlt);
      if (f.el.getAttribute("data-hero-image") !== src) {
        f.el.setAttribute("data-hero-image", src);
        const slats = f.el.querySelector("[data-hero-slats]");
        if (slats && slats.style.backgroundImage) slats.style.backgroundImage = `url("${src.replace(/"/g, "%22")}")`;
        f.el.dispatchEvent(new CustomEvent("content:hero-image", { bubbles: true }));
      }
      return;
    }

    const frag = document.createDocumentFragment();
    if (value == null) {
      f.originalMiddle.forEach((n) => frag.appendChild(n.cloneNode(true)));
    } else {
      const html = f.type === "link" ? value.html : value;
      if (f.lead) frag.appendChild(document.createTextNode(" "));
      frag.appendChild(richFragment(html == null ? f.originalHtml : html));
      if (f.trail) frag.appendChild(document.createTextNode(" "));
    }
    f.el.replaceChildren(...f.parts.prefix, frag, ...f.parts.suffix);
    if (f.type === "link") {
      const href = value && value.href ? safeUrl(value.href) : "";
      f.el.setAttribute("href", href || f.originalHref);
    }
  }

  const meta = {};
  function captureMeta() {
    const q = (sel) => document.querySelector(sel);
    meta.title = document.title;
    meta.description = (q('meta[name="description"]') || {}).content || "";
    meta.image = (q('meta[property="og:image"]') || {}).content || "";
  }
  function setMeta(name, value) {
    let tag = document.head.querySelector(name === "description" ? 'meta[name="description"]' : `meta[property="og:${name}"]`);
    if (!tag && !value) return;
    if (!tag) {
      tag = document.createElement("meta");
      if (name === "description") tag.name = "description"; else tag.setAttribute("property", `og:${name}`);
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", value);
  }
  function applyMeta(m = {}) {
    const title = normalize(m.title) || meta.title;
    document.title = title;
    setMeta("title", title);
    const description = normalize(m.description) || meta.description;
    setMeta("description", description);
    const og = document.head.querySelector('meta[property="og:description"]');
    if (og) og.setAttribute("content", description);
    const img = m.image ? resolveMedia(safeUrl(m.image, "image")) : meta.image;
    if (img) setMeta("image", img);
  }

  /* ---- Collections: published keys replace parts of DB ------------ */
  const DB_ORIGINAL = typeof DB !== "undefined" ? clone(DB) : null;
  function mergeCollections(content) {
    if (!DB_ORIGINAL) return;
    Object.keys(DB_ORIGINAL).forEach((k) => {
      DB[k] = content && content[k] != null ? clone(content[k]) : clone(DB_ORIGINAL[k]);
    });
  }

  /* ---- Applying a whole content set --------------------------------
   * content: { "page:index": {...}, "page:global": {...}, tracks: [...] }
   * Page documents look like
   *   { fields: { key: { v, o } }, hidden: { sectionKey: true }, meta: {...} }
   * where v is the value (HTML for words, {html, href} for links,
   * {src, alt} for images) and o the fingerprint of the original. */
  const state = {
    page: PAGE,
    fields: [],
    sections: [],
    published: {},
    drafts: null,
    preview: false,
    editing: false,
    held: [],
  };
  const byKey = new Map();

  function docFor(content, scope) {
    const d = content && content[scope === "global" ? "page:global" : `page:${PAGE}`];
    return d && typeof d === "object" ? d : {};
  }

  function applyContent(content, { collections = true } = {}) {
    const page = docFor(content, PAGE);
    const global = docFor(content, "global");
    state.held = [];
    state.fields.forEach((f) => {
      const d = f.scope === "global" ? global : page;
      const entry = d.fields && d.fields[f.key];
      if (entry && entry.o === f.fp) setField(f, entry.v);
      else {
        setField(f, null);
        if (entry) state.held.push(f.key);
      }
    });
    applySections(page.hidden || {});
    applyMeta(page.meta || {});
    if (collections) mergeCollections(content);
  }

  function applySections(hidden) {
    state.sections.forEach((s) => {
      const hide = Boolean(hidden[s.key]);
      if (state.editing) {
        s.el.hidden = s.originallyHidden;
        s.el.classList.toggle("is-edit-hidden", hide);
      } else {
        s.el.classList.remove("is-edit-hidden");
        s.el.hidden = hide || s.originallyHidden;
      }
    });
  }

  function mergedContent() {
    if (!state.preview || !state.drafts) return state.published;
    const out = { ...state.published };
    Object.entries(state.drafts).forEach(([k, d]) => {
      if (d.data === null) delete out[k];
      else out[k] = d.data;
    });
    return out;
  }

  /* ---- Exposed tools ------------------------------------------------ */
  window.Content = {
    PAGES,
    page: PAGE,
    pageName,
    collect,
    sanitizeRich,
    richFragment,
    safeUrl,
    fingerprint,
    normalize,
    stable,
    tidy,
    setField,
    applyContent,
    applySections,
    applyMeta,
    mergedContent,
    state,
    field: (key) => byKey.get(key),
    resolveMedia,
  };

  // Admin: tools only.
  if (!document.body || document.body.classList.contains("admin-body")) {
    window.ContentReady = Promise.resolve();
    return;
  }

  /* ---- Boot on a public page ---------------------------------------
   * This runs as a deferred script straight after data.js, so the page
   * is fully parsed but no other page script has touched it yet: what
   * collect() sees is exactly what the HTML file says, the same thing
   * the admin sees when it parses the file. */
  const found = collect(document);
  state.fields = found.fields;
  state.sections = found.sections;
  state.fields.forEach((f) => byKey.set(f.key, f));
  captureMeta();

  const CACHE = "content:cache";
  const live = window.Backend && Backend.mode === "live";
  const signedIn = window.Backend && Backend.hasSessionHint();
  const params = new URLSearchParams(location.search);
  try {
    if (signedIn && params.get("preview") === "drafts") sessionStorage.setItem("drajokesings:preview", "drafts");
    if (params.get("preview") === "live") sessionStorage.removeItem("drajokesings:preview");
  } catch (_) { /* storage blocked: no preview */ }
  let wantsPreview = false;
  try { wantsPreview = signedIn && sessionStorage.getItem("drajokesings:preview") === "drafts"; } catch (_) {}

  // 1. Whatever can be shown straight away, before any other page script
  //    runs: the demo store itself, or the copy of live content kept from
  //    the last visit.
  state.published = (live ? Store.read(CACHE, null) : Store.read("content:published", {})) || {};
  if (wantsPreview && !live) {
    state.drafts = Store.read("content:drafts", {});
    state.preview = true;
  }
  applyContent(mergedContent());

  // 2. Live: fetch what's published now. A first-time visitor has no copy
  //    yet, so the page waits (briefly, never more than 1.2s) rather than
  //    showing the built-in words and swapping them.
  const html = document.documentElement;
  if (live && !Store.read(CACHE, null)) {
    html.classList.add("is-content-loading");
    setTimeout(() => html.classList.remove("is-content-loading"), 1200);
  }
  const tasks = [];
  if (live) {
    tasks.push(
      Backend.fetchPublished()
        .then((fresh) => {
          Store.write(CACHE, fresh);
          if (stable(fresh) !== stable(state.published)) {
            state.published = fresh;
            applyContent(mergedContent());
          }
        })
        .catch((err) => console.warn("[content] showing the last known content:", err.message))
    );
    if (wantsPreview) {
      tasks.push(
        Backend.content.getDrafts()
          .then((drafts) => { state.drafts = drafts; state.preview = true; applyContent(mergedContent()); })
          .catch(() => {})
      );
    }
  }
  window.ContentReady = Promise.race([Promise.allSettled(tasks), new Promise((r) => setTimeout(r, 4000))]).then(() => {
    html.classList.remove("is-content-loading");
  });

  // 3. An admin is (or was) signed in on this browser: offer the editor.
  if (signedIn) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${ROOT}css/editor.css`;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = `${ROOT}js/editor.js`;
    js.defer = true;
    document.body.appendChild(js);
  }
})();
