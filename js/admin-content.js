/**
 * admin-content.js
 * ----------------------------------------------------------------------
 * Every list and set of details the pages are drawn from, edited as
 * forms: songs, albums, videos, photo galleries, events, Symphony, the
 * About page's lists, Ministry, emerging artists, the contact page's FAQ
 * and form choices, and announcements.
 *
 * Each is saved as a draft under its own key (the same drafts, preview
 * and publishing as the Pages screen) and, once published, replaces the
 * built-in copy in data.js for every visitor. "Back to the original"
 * returns a collection to what the site shipped with.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";
  const { h, toast, dialog, head, loading } = Admin;
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => Content.stable(a) === Content.stable(b);
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  // What data.js ships with ("the original"). On the admin page DB is never
  // merged with published content, so this is the built-in copy.
  const BUILT_IN = clone(DB);
  const btn = (label, onclick, cls = "pe-small-btn", title) => h("button", { type: "button", class: cls, title, onclick }, label);
  const tidyText = (s) => Content.normalize(typeof s === "string" && /</.test(s) ? Content.richFragment(s).textContent : s);

  /* ===================================================================
   * What each screen edits
   * Field types: text, textarea, rich (em/strong/br; links optional),
   * number, date, time, check, select, image, file, lines (one per
   * line), duration (m:ss), group (an object's fields), list (repeating
   * items), tracks (songs picked in order).
   * =================================================================== */
  const LINK_FIELDS = [
    ["youtube", "YouTube"], ["spotify", "Spotify"], ["appleMusic", "Apple Music"], ["boomplay", "Boomplay"],
    ["audiomack", "Audiomack"], ["deezer", "Deezer"], ["amazonMusic", "Amazon Music"],
  ].map(([key, label]) => ({ key, label, type: "url", placeholder: "https://…" }));

  const needsTitle = (label, noun) => (work) => (work.some((x) => !tidyText(x[label])) ? [`Every ${noun} needs a ${label === "text" ? "message" : label}.`] : []);

  const SCREENS = [
    {
      id: "music", key: "tracks", title: "Songs", kind: "list", itemName: "song", idPrefix: "track", labelKey: "title", preview: "music",
      sub: "Every song on the site: the homepage catalogue and featured song, the Music page, and each song's own page. The order here is the homepage catalogue's order.",
      itemLabel: (t) => tidyText(t.title) || "Untitled song",
      itemMeta: (t) => [t.featured ? "★ Featured" : "", t.releaseDate ? day(t.releaseDate) : "No release date"].filter(Boolean).join(" · "),
      newItem: () => ({
        id: uid("track"), title: "", artist: "Dr AjokeSings", albumId: null, isSingle: true, featured: false, releaseDate: null,
        duration: null, lyrics: [], description: "", artwork: "", audioSrc: "",
        links: { youtube: null, spotify: null, appleMusic: null, boomplay: null, audiomack: null, deezer: null, amazonMusic: null },
      }),
      check: needsTitle("title", "song"),
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "artist", label: "Artist line", type: "text", help: "As it reads under the title, e.g. “Dr AjokeSings ft. Pelumi Deborah”." },
        {
          key: "featured", label: "Feature this song on the homepage", type: "check",
          help: "One song at a time: choosing this one un-features the others.",
          onChange: (item, ctx) => { if (item.featured) ctx.root().forEach((t) => { if (t !== item) t.featured = false; }); return "redraw"; },
        },
        { key: "releaseDate", label: "Release date", type: "date" },
        { key: "artwork", label: "Artwork", type: "image" },
        { key: "description", label: "The story behind it", type: "textarea", rows: 4 },
        { key: "audioSrc", label: "Preview audio", type: "file", accept: "audio/*", help: "What the site's player plays. MP3 works everywhere." },
        { key: "duration", label: "Length", type: "duration", help: "Minutes and seconds, e.g. 4:32." },
        {
          key: "albumId", label: "Album", type: "select",
          options: (ctx) => [{ value: "", label: "A single (no album)" }, ...ctx.get("albums").map((a) => ({ value: a.id, label: tidyText(a.title) || "Untitled album" }))],
          onChange: (item) => { item.isSingle = !item.albumId; },
        },
        { key: "lyrics", label: "Lyrics", type: "lines", rows: 10, keepBlank: true, help: "One line per line, and an empty line between verses." },
        { key: "links", label: "Where to listen", type: "group", fields: LINK_FIELDS },
      ],
    },
    {
      id: "albums", key: "albums", title: "Albums", kind: "list", itemName: "album", idPrefix: "album", labelKey: "title", preview: "albums",
      sub: "The album pages and the Music page's albums. The first album in the list is the one featured on the homepage.",
      itemLabel: (a) => tidyText(a.title) || "Untitled album",
      itemMeta: (a) => [a.year, plural((a.trackIds || []).length, "song")].filter(Boolean).join(" · "),
      newItem: () => ({ id: uid("album"), title: "", year: new Date().getFullYear(), cover: "", banner: "", description: "", trackIds: [] }),
      check: needsTitle("title", "album"),
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "year", label: "Year", type: "number" },
        { key: "cover", label: "Cover", type: "image" },
        { key: "banner", label: "Wide picture (optional)", type: "image", help: "Shown behind the album on its page. Without one, the cover is used." },
        { key: "description", label: "About the album", type: "textarea", rows: 3 },
        { key: "trackIds", label: "Songs, in order", type: "tracks" },
      ],
    },
    {
      id: "videos", key: "videos", title: "Videos", kind: "videos", preview: "media",
      sub: "Her YouTube uploads appear on their own. Here you can rename or re-file one, hide one, choose the one in the homepage video slot, or add an older video by its link.",
    },
    {
      id: "galleries", key: "galleries", title: "Photo galleries", kind: "list", itemName: "gallery", idPrefix: "gal", labelKey: "title", preview: "media",
      sub: "The photo sets on the Media page, each opening in the lightbox.",
      itemLabel: (g) => tidyText(g.title) || "Untitled gallery",
      itemMeta: (g) => [g.event, plural((g.photos || []).length, "photo")].filter(Boolean).join(" · "),
      newItem: () => ({ id: uid("gal"), event: "", title: "", credit: "", photos: [] }),
      check: needsTitle("title", "gallery"),
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "event", label: "Event", type: "text" },
        { key: "credit", label: "Photographer credit", type: "text" },
        {
          key: "photos", label: "Photographs", type: "list", itemName: "a photograph",
          itemLabel: (p) => tidyText(p.caption) || "Photograph",
          newItem: () => ({ id: uid("ph"), src: "", caption: "", alt: "" }),
          fields: [
            { key: "src", label: "Picture", type: "image" },
            { key: "caption", label: "Caption", type: "text" },
            { key: "alt", label: "Describe the picture", type: "textarea", rows: 2, help: "Read aloud to blind visitors." },
          ],
        },
      ],
    },
    {
      id: "events", key: "events", title: "Events", kind: "list", itemName: "event", idPrefix: "event", labelKey: "name", preview: "events",
      sub: "The calendar on the Events page and the homepage, and what people register for.",
      itemLabel: (e) => tidyText(e.name) || "Untitled event",
      itemMeta: (e) => [day(e.date), e.registrationOpen === false ? "Registration closed" : ""].filter(Boolean).join(" · "),
      newItem: () => ({ id: uid("event"), name: "", venue: "", city: "", date: today(), time: null, capacity: 100, registered: 0, description: "", image: "", ticketRequired: true, registrationOpen: true }),
      check: (work) => {
        if (work.some((e) => !tidyText(e.name))) return ["Every event needs a name."];
        if (work.some((e) => !e.date)) return ["Every event needs a date."];
        return [];
      },
      itemNote: () => "Registrations stay with the event while its name changes; deleting an event keeps its registrations in the inbox.",
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "date", label: "Date", type: "date" },
        { key: "time", label: "Start time", type: "time", help: "Leave empty and the site says “Time to be announced”." },
        { key: "venue", label: "Venue", type: "text" },
        { key: "city", label: "Area and city", type: "text" },
        { key: "capacity", label: "Places", type: "number", help: "Registration stops when this many have registered." },
        { key: "registrationOpen", label: "Registration open", type: "check", defaultOn: true, help: "Untick to stop new registrations; the event still shows." },
        { key: "description", label: "Description", type: "textarea", rows: 3 },
        { key: "image", label: "Picture", type: "image" },
      ],
    },
    {
      id: "symphony", key: "symphony", title: "Symphony", kind: "object", preview: "symphony",
      sub: "The Symphony page: the SPAW Global Concert, the Talent Quest, the dates and the application's terms.",
      fields: [
        { key: "title", label: "Name", type: "text" },
        { key: "tagline", label: "Tagline", type: "text" },
        { key: "description", label: "Introduction", type: "textarea", rows: 3 },
        { key: "applicationsOpen", label: "Accept Talent Quest applications", type: "check", defaultOn: true, help: "Applications also close by themselves after the closing date." },
        { key: "applicationOpens", label: "Applications open", type: "date" },
        { key: "applicationCloses", label: "Applications close", type: "date" },
        { key: "questDate", label: "Talent Quest date", type: "date" },
        { key: "tracks", label: "Tracks applicants choose from", type: "lines", rows: 4 },
        {
          key: "concert", label: "The SPAW Global Concert", type: "group", fields: [
            { key: "name", label: "Name", type: "text" },
            { key: "eventId", label: "Its event (for registration)", type: "select", options: (ctx) => [{ value: "", label: "None" }, ...ctx.get("events").map((e) => ({ value: e.id, label: `${tidyText(e.name) || "Untitled"} · ${day(e.date)}` }))] },
            { key: "date", label: "Date", type: "date" },
            { key: "doors", label: "Doors open", type: "time", help: "Leave the times empty while they're to be announced." },
            { key: "start", label: "Starts", type: "time" },
            { key: "venue", label: "Venue", type: "text" },
            { key: "city", label: "Area and city", type: "text" },
            { key: "capacity", label: "Seats", type: "number" },
            { key: "admission", label: "Admission", type: "text" },
            { key: "description", label: "About the concert", type: "textarea", rows: 4 },
            {
              key: "highlights", label: "Highlights", type: "list", itemName: "a highlight", itemLabel: (x) => tidyText(x.title),
              newItem: () => ({ title: "", body: "" }),
              fields: [{ key: "title", label: "Title", type: "text" }, { key: "body", label: "Text", type: "textarea", rows: 2 }],
            },
          ],
        },
        {
          key: "quest", label: "The Talent Quest", type: "group", fields: [
            { key: "title", label: "Name", type: "text" },
            { key: "tagline", label: "Tagline", type: "text" },
            { key: "description", label: "About the Quest", type: "textarea", rows: 4 },
            {
              key: "benefits", label: "What a place gets you", type: "list", itemName: "a benefit", itemLabel: (x) => tidyText(x.title),
              newItem: () => ({ title: "", body: "" }),
              fields: [{ key: "title", label: "Title", type: "text" }, { key: "body", label: "Text", type: "textarea", rows: 2 }],
            },
          ],
        },
        { key: "terms", label: "Terms applicants agree to", type: "textarea", rows: 3 },
      ],
    },
    {
      id: "about", key: "about", title: "About page lists", kind: "object", preview: "about",
      sub: "The timeline, what the work is built on, the photographs and recognition. The About page's other words are edited under Pages.",
      fields: [
        {
          key: "timeline", label: "Timeline", type: "list", itemName: "a year", itemLabel: (t) => [t.year, tidyText(t.title)].filter(Boolean).join(" · "),
          newItem: () => ({ year: String(new Date().getFullYear()), title: "", body: "", current: false, links: [] }),
          fields: [
            { key: "year", label: "Year", type: "text" },
            { key: "title", label: "Title", type: "rich" },
            { key: "body", label: "Text", type: "rich" },
            { key: "current", label: "Mark as now", type: "check", help: "Highlights the entry as the present." },
            {
              key: "links", label: "Buttons", type: "list", itemName: "a button", itemLabel: (l) => l.label,
              newItem: () => ({ label: "", href: "" }),
              fields: [{ key: "label", label: "Label", type: "text" }, { key: "href", label: "Goes to", type: "text", help: "A page on this site (e.g. symphony) or a full web address." }],
            },
          ],
        },
        {
          key: "principles", label: "What the work is built on", type: "list", itemName: "a principle", itemLabel: (p) => tidyText(p.title),
          newItem: () => ({ title: "", body: "" }),
          fields: [{ key: "title", label: "Title", type: "text" }, { key: "body", label: "Text", type: "textarea", rows: 3 }],
        },
        {
          key: "photos", label: "Photographs", type: "list", itemName: "a photograph", itemLabel: (p) => tidyText(p.caption),
          newItem: () => ({ src: "", alt: "", caption: "" }),
          fields: [
            { key: "src", label: "Picture", type: "image" },
            { key: "caption", label: "Caption", type: "rich" },
            { key: "alt", label: "Describe the picture", type: "textarea", rows: 2 },
          ],
        },
        {
          key: "recognition", label: "Recognition & appearances", type: "list", itemName: "an entry", itemLabel: (r) => [r.year, tidyText(r.title)].filter(Boolean).join(" · "),
          newItem: () => ({ year: String(new Date().getFullYear()), title: "", tag: "" }),
          fields: [{ key: "year", label: "Year", type: "text" }, { key: "title", label: "What", type: "rich" }, { key: "tag", label: "Kind", type: "text", help: "e.g. Award, Feature, Ministration." }],
        },
      ],
    },
    {
      id: "ministry", key: "ministry", title: "Ministry", kind: "object", preview: "ministry",
      sub: "The Ministry page: the mission, its pillars, the mentorship track, workshops and free resources.",
      fields: [
        { key: "missionStatement", label: "Mission", type: "textarea", rows: 3 },
        {
          key: "pillars", label: "Pillars", type: "list", itemName: "a pillar", itemLabel: (p) => tidyText(p.title),
          newItem: () => ({ title: "", body: "" }),
          fields: [{ key: "title", label: "Title", type: "text" }, { key: "body", label: "Text", type: "textarea", rows: 2 }],
        },
        {
          key: "mentorship", label: "The mentorship track", type: "group", fields: [
            { key: "title", label: "Name", type: "text" },
            { key: "description", label: "About it", type: "textarea", rows: 3 },
            { key: "intake", label: "Intake", type: "text" },
          ],
        },
        {
          key: "workshops", label: "Workshops", type: "list", itemName: "a workshop", itemLabel: (w) => tidyText(w.title),
          newItem: () => ({ id: uid("ws"), title: "", facilitator: "", format: "", cadence: "" }),
          fields: [
            { key: "title", label: "Title", type: "text" }, { key: "facilitator", label: "Led by", type: "text" },
            { key: "format", label: "Format", type: "text", help: "e.g. In-person, Lagos." }, { key: "cadence", label: "How often", type: "text" },
          ],
        },
        {
          key: "resources", label: "Free resources", type: "list", itemName: "a resource", itemLabel: (r) => tidyText(r.title),
          newItem: () => ({ id: uid("res"), title: "", type: "PDF", size: "", url: null }),
          fields: [
            { key: "title", label: "Title", type: "text" },
            {
              key: "url", label: "File", type: "file", accept: "*/*",
              help: "Without a file, the site offers to send it on request.",
              fill: (r, file) => {
                r.type = (file.name.split(".").pop() || "").toUpperCase();
                r.size = file.size < 1048576 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1048576).toFixed(1)} MB`;
              },
            },
            { key: "type", label: "Kind of file", type: "text", help: "Filled in when you upload." },
            { key: "size", label: "Size", type: "text" },
          ],
        },
      ],
    },
    {
      id: "emerging", key: "emergingArtists", title: "Emerging artists", kind: "list", itemName: "artist", idPrefix: "ea", labelKey: "name", preview: "symphony",
      sub: "The Talent Quest alumni shown on the homepage, the Symphony page and the Ministry page.",
      itemLabel: (a) => tidyText(a.name) || "Unnamed artist",
      itemMeta: (a) => a.role || "",
      newItem: () => ({ id: uid("ea"), name: "", role: "", photo: "", bio: "" }),
      check: needsTitle("name", "artist"),
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "role", label: "Role", type: "text", help: "e.g. Vocalist, Talent Quest 2025." },
        { key: "photo", label: "Photo", type: "image" },
        { key: "bio", label: "A line about them", type: "textarea", rows: 2 },
      ],
    },
    {
      id: "contact-page", key: "contact", title: "Contact page", kind: "object", preview: "contact",
      sub: "The questions and answers, and the choices the booking form offers. The page's other words are edited under Pages.",
      fields: [
        {
          key: "faq", label: "Questions and answers", type: "list", itemName: "a question", itemLabel: (q) => q.question,
          newItem: () => ({ question: "", answer: "" }),
          fields: [{ key: "question", label: "Question", type: "text" }, { key: "answer", label: "Answer", type: "rich", links: true }],
        },
        { key: "eventTypes", label: "Kinds of event", type: "lines", rows: 6, help: "One per line: the “Type of event” choices." },
        { key: "budgets", label: "Honorarium ranges", type: "lines", rows: 5, help: "One per line. “Prefer to discuss” is always offered first." },
        { key: "needs", label: "What they can ask for", type: "lines", rows: 5, help: "One per line: the tick boxes." },
      ],
    },
    {
      id: "announcements", key: "announcements", title: "Announcements", kind: "list", itemName: "announcement", idPrefix: "ann", labelKey: "text", preview: "index",
      sub: "A bar across the top of every page. The first one that's switched on and inside its dates shows; visitors can close it.",
      itemLabel: (a) => tidyText(a.text) || "New announcement",
      itemMeta: (a) => {
        const now = today();
        const on = a.active !== false && (!a.start || a.start <= now) && (!a.end || a.end >= now);
        return [on ? "Showing now" : a.active === false ? "Off" : a.start > now ? `From ${day(a.start)}` : "Ended", a.end ? `until ${day(a.end)}` : ""].filter(Boolean).join(" · ");
      },
      newItem: () => ({ id: uid("ann"), text: "", linkLabel: "", link: "", start: today(), end: null, active: true }),
      check: needsTitle("text", "announcement"),
      fields: [
        { key: "text", label: "Message", type: "text", help: "One short sentence." },
        { key: "linkLabel", label: "Link label", type: "text", placeholder: "Find out more" },
        { key: "link", label: "Link goes to", type: "text", help: "A page on this site (e.g. events?register=event-004) or a full web address. Optional." },
        { key: "start", label: "Show from", type: "date" },
        { key: "end", label: "Show until", type: "date", help: "Leave empty to keep it up until you switch it off." },
        { key: "active", label: "Switched on", type: "check", defaultOn: true },
      ],
    },
  ];

  /* ===================================================================
   * Drafts
   * =================================================================== */
  async function loadStore() {
    const [published, drafts] = await Promise.all([Backend.content.getPublished(), Backend.content.getDrafts()]);
    return { published, drafts };
  }
  function current(store, key) {
    const d = store.drafts[key];
    if (d) return d.data === null ? BUILT_IN[key] : d.data;
    return store.published[key] != null ? store.published[key] : BUILT_IN[key];
  }

  async function screen(panel, def, sub) {
    const title = head(def.title, def.sub);
    panel.replaceChildren(title, loading());
    let store;
    try { store = await loadStore(); } catch (err) { panel.replaceChildren(title, h("p", { class: "admin-empty", text: err.message })); return; }

    const key = def.key;
    const live = () => (store.published[key] != null ? store.published[key] : BUILT_IN[key]);
    let work = clone(current(store, key));
    let saved = Content.stable(work);
    const dirty = () => Content.stable(work) !== saved;
    Admin.setGuard({ dirty, confirm: Admin.leaveDialog });

    const status = h("span", { class: "pe-status", role: "status" });
    const saveBtn = h("button", { type: "button", class: "btn btn-solid" }, "Save draft");
    const pubBtn = h("button", { type: "button", class: "btn btn-ghost" }, "Publish…");
    const page = Content.PAGES.find((p) => p.page === def.preview) || Content.PAGES[0];
    const preview = h("a", { class: "btn btn-ghost", href: Admin.previewHref(page), target: "_blank", rel: "noopener" }, "Preview ↗");
    const original = btn("Back to the original…", null);
    const toolbar = h("div", { class: "pe-toolbar" }, [status, h("div", { class: "pe-toolbar__actions" }, [original, preview, saveBtn, pubBtn])]);

    function refresh() {
      const unsaved = dirty();
      status.textContent = unsaved ? "Unsaved changes"
        : !same(work, live()) ? "Saved as a draft, not live yet"
          : store.published[key] != null ? "Live, as edited here" : "Live: the site's original";
      status.classList.toggle("is-unsaved", unsaved);
      saveBtn.disabled = !unsaved;
      original.hidden = same(work, BUILT_IN[key]);
    }
    const ctx = {
      root: () => work,
      changed: refresh,
      get: (k) => (k === key ? work : current(store, k)) || [],
    };

    async function save({ quiet = false } = {}) {
      const problems = def.check ? def.check(work) : [];
      if (problems.length) { toast(problems[0], "is-error"); return false; }
      try {
        if (same(work, live())) {
          if (store.drafts[key]) { await Backend.content.discardDraft(key); delete store.drafts[key]; }
        } else if (same(work, BUILT_IN[key]) && store.published[key] != null) {
          await Backend.content.saveDraft(key, null); // publishing removes the edited copy
          store.drafts[key] = { data: null };
        } else {
          await Backend.content.saveDraft(key, clone(work));
          store.drafts[key] = { data: clone(work) };
        }
        saved = Content.stable(work);
        refresh();
        Admin.refreshBadges();
        if (!quiet) toast("Saved as a draft. Visitors still see the live site.");
        return true;
      } catch (err) {
        toast(err.message, "is-error");
        return false;
      }
    }
    saveBtn.addEventListener("click", () => save());
    pubBtn.addEventListener("click", async () => {
      if (dirty() && !(await save({ quiet: true }))) return;
      if (!(await Admin.publishAll())) return;
      store = await loadStore();
      saved = Content.stable(work);
      refresh();
    });
    preview.addEventListener("click", async (e) => {
      if (!dirty()) return;
      e.preventDefault();
      if (await save({ quiet: true })) window.open(preview.href, "_blank", "noopener");
    });
    original.addEventListener("click", async () => {
      const ok = await dialog({
        title: `Back to the original ${def.title.toLowerCase()}?`,
        body: [h("p", { text: "Everything here goes back to what the site shipped with. It's a draft until you publish, so visitors see no change yet." })],
        actions: [["Cancel", false], ["Go back to the original", true, "is-danger"]],
      });
      if (!ok) return;
      work = clone(BUILT_IN[key]);
      draw();
      refresh();
    });

    const body = h("div", { class: "ce-body" });
    function draw() {
      if (def.kind === "list") drawList(body, def, ctx, work, sub);
      else if (def.kind === "videos") drawVideos(body, ctx, work);
      else body.replaceChildren(h("div", { class: "pe-card ce-form" }, renderFields(def.fields, work, ctx)));
    }
    panel.replaceChildren(title, toolbar, body);
    draw();
    refresh();
  }

  /* ===================================================================
   * A list: items on the left, the chosen one's form on the right
   * =================================================================== */
  function drawList(body, def, ctx, items, sub) {
    let index = Math.max(0, items.findIndex((x) => x.id === sub));
    const search = h("input", { type: "search", class: "admin-input", placeholder: `Find a ${def.itemName}…`, "aria-label": `Find a ${def.itemName}` });
    const listEl = h("div", { class: "ce-items" });
    const detail = h("div", { class: "ce-detail pe-card" });

    function drawItems() {
      const q = search.value.trim().toLowerCase();
      if (!items.length) { listEl.replaceChildren(h("p", { class: "admin-empty", text: `No ${def.itemName}s yet.` })); return; }
      listEl.replaceChildren(...items.map((item, i) => {
        const label = def.itemLabel(item);
        if (q && !label.toLowerCase().includes(q)) return null;
        return h("button", { type: "button", class: "ce-itembtn", "aria-current": String(i === index), onclick: () => { index = i; drawItems(); drawDetail(); } }, [
          h("span", { class: "ce-itembtn__label", text: label }),
          def.itemMeta ? h("span", { class: "ce-itembtn__meta", text: def.itemMeta(item) }) : null,
        ]);
      }).filter(Boolean));
    }

    function move(d) {
      const j = index + d;
      if (j < 0 || j >= items.length) return;
      [items[index], items[j]] = [items[j], items[index]];
      index = j;
      drawItems();
      ctx.changed();
    }

    function drawDetail() {
      const item = items[index];
      if (!item) { detail.replaceChildren(h("p", { class: "admin-empty", text: `Choose a ${def.itemName} on the left, or add one.` })); return; }
      const heading = h("h2", { class: "ce-detail__title", text: def.itemLabel(item) });
      const itemCtx = {
        ...ctx,
        redraw: drawItems,
        changed: () => {
          heading.textContent = def.itemLabel(item);
          const cur = listEl.querySelector('[aria-current="true"]');
          if (cur) {
            cur.querySelector(".ce-itembtn__label").textContent = def.itemLabel(item);
            const meta = cur.querySelector(".ce-itembtn__meta");
            if (meta && def.itemMeta) meta.textContent = def.itemMeta(item);
          }
          ctx.changed();
        },
      };
      const duplicate = () => {
        const copy = clone(item);
        copy.id = uid(def.idPrefix || "item");
        if (def.labelKey && typeof copy[def.labelKey] === "string") copy[def.labelKey] = `${copy[def.labelKey]} (copy)`;
        if ("featured" in copy) copy.featured = false;
        items.splice(index + 1, 0, copy);
        index += 1;
        drawItems();
        drawDetail();
        ctx.changed();
      };
      const remove = async () => {
        const ok = await dialog({
          title: `Delete “${def.itemLabel(item)}”?`,
          body: [h("p", { text: "It comes off the site when you publish. Until then it's only a draft, and “Back to the original” or not saving brings it back." })],
          actions: [["Keep it", false], ["Delete", true, "is-danger"]],
        });
        if (!ok) return;
        items.splice(index, 1);
        index = Math.min(index, items.length - 1);
        drawItems();
        drawDetail();
        ctx.changed();
      };
      detail.replaceChildren(...[
        h("div", { class: "ce-detail__head" }, [
          heading,
          h("div", { class: "pe-actions-row" }, [
            btn("↑", () => move(-1), "pe-small-btn", "Move up the list"),
            btn("↓", () => move(1), "pe-small-btn", "Move down the list"),
            btn("Duplicate", duplicate),
            btn("Delete", remove, "pe-small-btn is-danger"),
          ]),
        ]),
        def.itemNote ? h("p", { class: "pe-card__note", text: def.itemNote(item) }) : null,
        ...renderFields(def.fields, item, itemCtx),
      ].filter(Boolean));
    }

    const add = btn(`Add ${/^[aeiou]/i.test(def.itemName) ? "an" : "a"} ${def.itemName}`, () => {
      items.unshift(def.newItem());
      index = 0;
      search.value = "";
      drawItems();
      drawDetail();
      ctx.changed();
      const first = detail.querySelector("input, textarea, [contenteditable]");
      if (first) first.focus();
    }, "btn btn-solid ce-add");
    search.addEventListener("input", drawItems);
    body.replaceChildren(h("div", { class: "ce-layout" }, [h("div", { class: "ce-master" }, [h("div", { class: "ce-master__top" }, [search, add]), listEl]), detail]));
    drawItems();
    drawDetail();
  }

  /* ===================================================================
   * Fields
   * =================================================================== */
  function renderFields(fields, obj, ctx) {
    return fields.map((f) => control(f, obj, ctx)).filter(Boolean);
  }

  function wrap(f, controlEl) {
    return h("div", { class: `admin-field ce-field ce-field--${f.type}` }, [
      h("span", { class: "ce-field__label", text: f.label }),
      controlEl,
      f.help ? h("small", { text: f.help }) : null,
    ].filter(Boolean));
  }

  function fmtButton(label, command, box, cls) {
    const b = h("button", { type: "button", class: `pe-small-btn ${cls}` }, label);
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
    b.addEventListener("click", () => {
      if (document.activeElement !== box) box.focus();
      document.execCommand(command);
      box.dispatchEvent(new Event("input"));
    });
    return b;
  }

  function linkButton(box) {
    const b = h("button", { type: "button", class: "pe-small-btn" }, "Link");
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", async () => {
      const sel = window.getSelection();
      const range = sel.rangeCount && box.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0).cloneRange() : null;
      if (!range || range.collapsed) { toast("Select the words to turn into a link first."); return; }
      const input = h("input", { type: "text", class: "admin-input", placeholder: "contact#booking or https://…" });
      const ok = await dialog({
        title: "Link to…",
        body: [h("label", { class: "admin-field" }, [h("span", { text: "A page on this site, or a full web address" }), input])],
        actions: [["Cancel", false], ["Add the link", true, "is-primary"]],
      });
      const href = ok && Content.safeUrl(input.value.trim());
      if (!href) { if (ok) toast("That address isn't allowed.", "is-error"); return; }
      box.focus();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("createLink", false, href);
      box.dispatchEvent(new Event("input"));
    });
    return b;
  }

  function control(f, obj, ctx) {
    const changed = () => {
      if (f.onChange && f.onChange(obj, ctx) === "redraw" && ctx.redraw) ctx.redraw();
      ctx.changed();
    };

    switch (f.type) {
      case "text":
      case "url":
      case "number":
      case "date":
      case "time": {
        const input = h("input", { type: f.type, class: "admin-input", placeholder: f.placeholder, spellcheck: f.type === "text" ? "true" : "false" });
        input.value = obj[f.key] == null ? "" : String(obj[f.key]);
        input.addEventListener("input", () => {
          const raw = input.value;
          if (f.type === "text") obj[f.key] = raw;
          else if (f.type === "number") obj[f.key] = raw.trim() === "" ? null : Number(raw);
          else obj[f.key] = raw.trim() === "" ? null : raw.trim();
          changed();
        });
        return wrap(f, input);
      }
      case "textarea": {
        const ta = h("textarea", { class: "admin-input", rows: String(f.rows || 3) });
        ta.value = obj[f.key] || "";
        ta.addEventListener("input", () => { obj[f.key] = ta.value; changed(); });
        return wrap(f, ta);
      }
      case "rich": {
        const opts = { links: Boolean(f.links) };
        const box = h("div", { class: "pe-rich", contenteditable: "true", role: "textbox", "aria-label": f.label, spellcheck: "true" });
        // Safe: sanitizeRich leaves only text, <em>, <strong>, <br> (and checked links).
        box.innerHTML = Content.sanitizeRich(obj[f.key] || "", opts);
        box.addEventListener("input", () => { obj[f.key] = Content.sanitizeRich(box.innerHTML, opts); changed(); });
        box.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); } });
        box.addEventListener("paste", (e) => {
          e.preventDefault();
          document.execCommand("insertText", false, ((e.clipboardData && e.clipboardData.getData("text/plain")) || "").replace(/\s+/g, " "));
        });
        const tools = h("div", { class: "pe-format" }, [
          fmtButton("Emphasis", "italic", box, "is-em"),
          fmtButton("Bold", "bold", box, "is-b"),
          f.links ? linkButton(box) : null,
        ].filter(Boolean));
        return wrap(f, h("div", { class: "ce-rich" }, [tools, box]));
      }
      case "check": {
        const input = h("input", { type: "checkbox" });
        input.checked = f.defaultOn ? obj[f.key] !== false : Boolean(obj[f.key]);
        input.addEventListener("change", () => { obj[f.key] = input.checked; changed(); });
        return h("label", { class: "pe-toggle ce-check" }, [
          h("span", {}, [h("strong", { text: f.label }), f.help ? h("small", { text: f.help }) : null].filter(Boolean)),
          input,
        ]);
      }
      case "select": {
        const options = typeof f.options === "function" ? f.options(ctx) : f.options;
        const now = obj[f.key] == null ? "" : String(obj[f.key]);
        const sel = h("select", { class: "admin-select" }, options.map((o) => h("option", { value: o.value, selected: now === String(o.value) }, o.label)));
        sel.addEventListener("change", () => { obj[f.key] = sel.value === "" ? null : sel.value; changed(); });
        return wrap(f, sel);
      }
      case "image":
      case "file":
        return mediaControl(f, obj, changed);
      case "lines": {
        const ta = h("textarea", { class: "admin-input", rows: String(f.rows || 5) });
        ta.value = (obj[f.key] || []).join("\n");
        ta.addEventListener("input", () => {
          let lines = ta.value.split("\n");
          if (f.keepBlank) {
            lines = lines.map((l) => l.replace(/\s+$/, ""));
            while (lines.length && !lines[lines.length - 1]) lines.pop();
          } else {
            lines = lines.map((l) => l.trim()).filter(Boolean);
          }
          obj[f.key] = lines;
          changed();
        });
        return wrap(f, ta);
      }
      case "duration": {
        const input = h("input", { type: "text", class: "admin-input ce-short", placeholder: "4:32", inputmode: "numeric" });
        const v = obj[f.key];
        input.value = Number.isFinite(v) && v > 0 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}` : "";
        input.addEventListener("input", () => {
          const m = /^(\d{1,3}):([0-5]\d)$/.exec(input.value.trim());
          obj[f.key] = m ? Number(m[1]) * 60 + Number(m[2]) : null;
          input.classList.toggle("is-invalid", Boolean(input.value.trim()) && !m);
          changed();
        });
        return wrap(f, input);
      }
      case "group": {
        const inner = obj[f.key] && typeof obj[f.key] === "object" ? obj[f.key] : (obj[f.key] = {});
        return h("fieldset", { class: "ce-group" }, [h("legend", { text: f.label }), ...renderFields(f.fields, inner, ctx)]);
      }
      case "list":
        return listControl(f, obj, ctx);
      case "tracks":
        return tracksControl(f, obj, ctx, changed);
      default:
        return null;
    }
  }

  function mediaControl(f, obj, changed) {
    const isImage = f.type === "image";
    const note = h("span", { class: "pe-image__status", role: "status" });
    const thumb = isImage ? h("img", { class: "pe-thumb", alt: "" }) : null;
    const fileLink = isImage ? null : h("a", { class: "ce-file", target: "_blank", rel: "noopener" });
    const upload = h("button", { type: "button", class: "pe-small-btn" }, isImage ? "Upload a picture…" : "Upload a file…");
    const remove = h("button", { type: "button", class: "pe-small-btn is-danger" }, "Remove");
    const show = () => {
      const v = obj[f.key];
      if (thumb) { thumb.hidden = !v; if (v) thumb.src = Content.resolveMedia(v); }
      if (fileLink) {
        fileLink.hidden = !v;
        if (v) {
          fileLink.href = Content.resolveMedia(v);
          fileLink.textContent = /^local-media:/.test(v) ? "The uploaded file" : decodeURIComponent(String(v).split("/").pop()).replace(/^[a-z0-9]+-/, "");
        }
      }
      remove.hidden = !v;
    };
    upload.addEventListener("click", async () => {
      const file = await Admin.pickFile(f.accept || (isImage ? "image/*" : "*/*"));
      if (!file) return;
      upload.disabled = true;
      try {
        const item = isImage ? await Admin.uploadPicture(file, note) : await Backend.media.upload(file, file.name);
        obj[f.key] = item.url;
        if (f.fill) f.fill(obj, file);
        note.textContent = "Uploaded.";
        show();
        changed();
      } catch (err) {
        note.textContent = err.message;
      } finally {
        upload.disabled = false;
      }
    });
    remove.addEventListener("click", () => { obj[f.key] = isImage ? "" : null; show(); changed(); });
    show();
    return wrap(f, h("div", { class: "pe-image" }, [thumb || fileLink, h("div", { class: "pe-image__side" }, [h("div", { class: "pe-actions-row" }, [upload, remove, note])])]));
  }

  function listControl(f, obj, ctx) {
    const arr = Array.isArray(obj[f.key]) ? obj[f.key] : (obj[f.key] = []);
    const box = h("div", { class: "ce-list" });
    const labelOf = (item, i) => `${i + 1}. ${f.itemLabel ? f.itemLabel(item) || "" : ""}`;
    const draw = () => {
      box.replaceChildren(
        ...arr.map((item, i) => {
          const label = h("strong", { class: "ce-item__label", text: labelOf(item, i) });
          const itemCtx = { ...ctx, redraw: draw, changed: () => { label.textContent = labelOf(item, i); ctx.changed(); } };
          return h("div", { class: "ce-item" }, [
            h("div", { class: "ce-item__head" }, [
              label,
              h("div", { class: "pe-actions-row" }, [
                btn("↑", () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; draw(); ctx.changed(); } }, "pe-small-btn", "Move up"),
                btn("↓", () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; draw(); ctx.changed(); } }, "pe-small-btn", "Move down"),
                btn("Remove", () => { arr.splice(i, 1); draw(); ctx.changed(); }, "pe-small-btn is-danger"),
              ]),
            ]),
            ...renderFields(f.fields, item, itemCtx),
          ]);
        }),
        btn(`Add ${f.itemName || "one"}`, () => { arr.push(f.newItem ? f.newItem() : {}); draw(); ctx.changed(); }, "pe-small-btn ce-list__add")
      );
    };
    draw();
    return h("fieldset", { class: "ce-group" }, [h("legend", { text: f.label }), f.help ? h("p", { class: "pe-card__note", text: f.help }) : null, box].filter(Boolean));
  }

  function tracksControl(f, obj, ctx, changed) {
    const ids = Array.isArray(obj[f.key]) ? obj[f.key] : (obj[f.key] = []);
    const tracks = ctx.get("tracks");
    const titleOf = (id) => tidyText((tracks.find((t) => t.id === id) || {}).title) || "(a song no longer on the site)";
    const box = h("div", { class: "ce-list" });
    const draw = () => {
      const pick = h("select", { class: "admin-select", "aria-label": "Add a song" }, [
        h("option", { value: "" }, "Add a song…"),
        ...tracks.filter((t) => !ids.includes(t.id)).map((t) => h("option", { value: t.id }, tidyText(t.title) || "Untitled song")),
      ]);
      pick.addEventListener("change", () => { if (!pick.value) return; ids.push(pick.value); draw(); changed(); });
      box.replaceChildren(
        ...ids.map((id, i) => h("div", { class: "ce-chip-row" }, [
          h("span", { text: `${i + 1}. ${titleOf(id)}` }),
          h("div", { class: "pe-actions-row" }, [
            btn("↑", () => { if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; draw(); changed(); } }),
            btn("↓", () => { if (i < ids.length - 1) { [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; draw(); changed(); } }),
            btn("Remove", () => { ids.splice(i, 1); draw(); changed(); }, "pe-small-btn is-danger"),
          ]),
        ])),
        pick
      );
    };
    draw();
    return wrap(f, box);
  }

  /* ===================================================================
   * Videos: her channel's uploads, with what the admin has changed
   * =================================================================== */
  const CATEGORIES = ["Music", "Live", "SPAW Global Concert", "Talent Quest"];
  function youtubeIdFrom(text) {
    const s = String(text || "").trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = /(?:v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})/.exec(s);
    return m ? m[1] : null;
  }

  async function drawVideos(body, ctx, work) {
    body.replaceChildren(loading("Reading her YouTube channel…"));
    let feed = [];
    try { feed = await api._fetchYouTubeFeed(); } catch (_) { /* offline: the saved list only */ }
    const saved = new Set(work.map((v) => v.youtubeId));
    const rows = [...work, ...feed.filter((f) => !saved.has(f.youtubeId)).map((f) => ({ ...f, fromFeed: true }))];
    rows.sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")));
    const inFeed = new Set(feed.map((f) => f.youtubeId));
    const featuredBoxes = [];

    // Changing a video that so far only came from the channel adds it to
    // the saved list, where the change can be kept.
    const keep = (v) => {
      if (v.fromFeed) { delete v.fromFeed; work.push(v); }
      return v;
    };

    const card = (v) => {
      const cleaned = api._videoFromYouTube({ ...v, customTitle: null, customCategory: null }).title;
      const thumb = h("img", { class: "ce-video__thumb", alt: "", loading: "lazy" });
      setYouTubeThumb(thumb, v.youtubeId);
      const title = h("input", { type: "text", class: "admin-input", placeholder: cleaned });
      title.value = v.customTitle || "";
      const category = h("select", { class: "admin-select" }, [
        h("option", { value: "" }, `Filed automatically (${api._videoCategory(cleaned)})`),
        ...CATEGORIES.map((c) => h("option", { value: c, selected: (v.customCategory || v.category || "") === c }, c)),
      ]);
      const hide = h("input", { type: "checkbox" });
      hide.checked = Boolean(v.hidden);
      const feature = h("input", { type: "checkbox" });
      feature.checked = Boolean(v.featured);
      featuredBoxes.push([feature, v]);

      title.addEventListener("input", () => { keep(v).customTitle = title.value.trim() || null; ctx.changed(); });
      category.addEventListener("change", () => { keep(v).customCategory = category.value || null; ctx.changed(); });
      hide.addEventListener("change", () => { keep(v).hidden = hide.checked; el.classList.toggle("is-hidden", hide.checked); ctx.changed(); });
      feature.addEventListener("change", () => {
        keep(v).featured = feature.checked;
        if (feature.checked) {
          featuredBoxes.forEach(([box, other]) => { if (other !== v) { box.checked = false; other.featured = false; } });
          work.forEach((other) => { if (other !== v) other.featured = false; });
        }
        ctx.changed();
      });

      const remove = !inFeed.has(v.youtubeId) && !v.fromFeed
        ? btn("Remove", async () => {
          const ok = await dialog({
            title: "Remove this video?",
            body: [h("p", { text: "It comes off the Media page when you publish (it stays on YouTube). To keep it but not show it, tick “Hide from the site” instead." })],
            actions: [["Keep it", false], ["Remove", true, "is-danger"]],
          });
          if (!ok) return;
          const i = work.indexOf(v);
          if (i !== -1) work.splice(i, 1);
          el.remove();
          ctx.changed();
        }, "pe-small-btn is-danger")
        : null;

      const el = h("div", { class: `ce-video pe-card${v.hidden ? " is-hidden" : ""}` }, [
        h("a", { class: "ce-video__media", href: `https://www.youtube.com/watch?v=${encodeURIComponent(v.youtubeId)}`, target: "_blank", rel: "noopener" }, [thumb]),
        h("div", { class: "ce-video__body" }, [
          h("p", { class: "pub-item__meta", text: [v.published ? day(v.published) : "", v.fromFeed || inFeed.has(v.youtubeId) ? "on her channel" : "added by link"].filter(Boolean).join(" · ") }),
          h("p", { class: "ce-video__title", text: cleaned }),
          h("div", { class: "admin-field" }, [h("span", { text: "Show it as" }), title]),
          h("div", { class: "admin-field" }, [h("span", { text: "Category" }), category]),
          h("label", { class: "pe-toggle" }, [h("span", { text: "Show in the homepage video slot" }), feature]),
          h("label", { class: "pe-toggle" }, [h("span", { text: "Hide from the site" }), hide]),
          remove ? h("div", { class: "pe-actions-row" }, [remove]) : null,
        ].filter(Boolean)),
      ]);
      return el;
    };

    const addByLink = btn("Add a video by its link…", async () => {
      const link = h("input", { type: "text", class: "admin-input", placeholder: "https://www.youtube.com/watch?v=…" });
      const name = h("input", { type: "text", class: "admin-input" });
      const date = h("input", { type: "date", class: "admin-input", value: today() });
      const ok = await dialog({
        title: "Add a video",
        body: [
          h("label", { class: "admin-field" }, [h("span", { text: "YouTube link" }), link]),
          h("label", { class: "admin-field" }, [h("span", { text: "Title" }), name]),
          h("label", { class: "admin-field" }, [h("span", { text: "Published on" }), date]),
        ],
        actions: [["Cancel", false], ["Add it", true, "is-primary"]],
      });
      if (!ok) return;
      const id = youtubeIdFrom(link.value);
      if (!id) { toast("That doesn't look like a YouTube link.", "is-error"); return; }
      if (rows.some((r) => r.youtubeId === id)) { toast("That video is already in the list."); return; }
      const v = { youtubeId: id, published: date.value || today(), title: name.value.trim() || "Video" };
      work.push(v);
      rows.unshift(v);
      grid.prepend(card(v));
      ctx.changed();
    }, "btn btn-solid");

    const grid = h("div", { class: "ce-videos" }, rows.map(card));
    body.replaceChildren(
      h("div", { class: "ce-videos__top" }, [
        addByLink,
        h("p", { class: "pe-card__note", text: feed.length ? `${plural(feed.length, "recent upload")} read from her channel just now.` : "Her channel couldn't be read just now, so only the saved list shows." }),
      ]),
      grid
    );
  }

  SCREENS.forEach((def) => Admin.register(def.id, { render: (panel, sub) => screen(panel, def, sub) }));
})();
