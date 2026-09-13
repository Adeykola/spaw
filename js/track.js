/**
 * track.js
 * ----------------------------------------------------------------------
 * Counts visits and what people do on the public pages, for the admin's
 * analytics. Anonymous: no cookies, no names, nothing that identifies a
 * person. This browser gives itself a random name (kept in its own
 * storage) and each visit another; a visit ends after 30 minutes without
 * activity, and a campaign link always starts a new one.
 *
 * Nothing is counted when the browser asks not to be tracked (Do Not
 * Track, Global Privacy Control), on the browsers the site's admins use,
 * or for automated visitors.
 *
 * Other scripts report what happens through
 *   Track.event(name, { label, value, props })
 * with the names listed in NAMES (supabase/setup-3.sql keeps the same
 * list). Sign-ups are sent at once; everything else goes in small
 * batches, and the rest when the page is left.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  const noop = () => {};
  window.Track = { enabled: false, event: noop };
  if (!window.Backend || !Backend.analytics) return;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* storage blocked: counted as a new browser each time */ } },
  };
  const ua = navigator.userAgent || "";
  const forced = store.get("drajokesings:trackTest") === "1";
  const optedOut = navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  const automated = navigator.webdriver === true || /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit/i.test(ua);
  // Admins' browsers stay out of the figures ("Count my visits" in the admin undoes it).
  const pref = store.get("drajokesings:notrack");
  const admin = pref === "1" || (pref !== "0" && Backend.hasSessionHint());
  if (!forced && (optedOut || automated || admin)) return;

  const GOALS = ["registered", "applied", "booking", "enquiry", "newsletter"];
  const NAMES = new Set([
    "pageview", "engagement", "slide", "slide_tap", "cta", "menu", "outbound", "stream", "youtube",
    "play", "heard", "video", "gallery", "search", "register_open", "registered", "apply_start",
    "applied", "booking_start", "booking", "enquiry", "newsletter", "error",
  ]);

  const rand = () => {
    const bytes = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
  };
  const clip = (s, n) => (s == null ? undefined : String(s).replace(/\s+/g, " ").trim().slice(0, n) || undefined);

  /* ---- where this page sits ----------------------------------------- */
  // Paths are counted from the site's root, so a site in a subfolder
  // (GitHub Pages) reads /events like any other; song and album pages
  // keep their ?id so each one counts on its own.
  function pagePath() {
    const here = location.href.split(/[?#]/)[0];
    let p = here.startsWith(Backend.root) ? here.slice(Backend.root.length) : location.pathname.replace(/^\//, "");
    p = p.replace(/\.html$/, "").replace(/(^|\/)index$/, "").replace(/\/$/, "");
    const id = new URLSearchParams(location.search).get("id");
    return (p === "song" || p === "albums") && id ? `/${p}?id=${id}` : `/${p}`;
  }
  const path = pagePath();

  /* ---- who, roughly ------------------------------------------------- */
  const tablet = /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const device = tablet ? "tablet" : /Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(ua) ? "mobile" : "desktop";
  const browser = /Instagram/i.test(ua) ? "Instagram"
    : /FBAN|FBAV|FB_IAB/i.test(ua) ? "Facebook"
      : /TikTok|BytedanceWebview|musical_ly/i.test(ua) ? "TikTok"
        : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
          : /OPR\/|Opera|OPT\/|OPiOS/i.test(ua) ? "Opera"
            : /Edg(e|A|iOS)?\//i.test(ua) ? "Edge"
              : /Firefox|FxiOS/i.test(ua) ? "Firefox"
                : /CriOS|Chrome\//i.test(ua) ? "Chrome"
                  : /Safari/i.test(ua) ? "Safari" : "Other";
  const os = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iOS"
    : /Android/i.test(ua) ? "Android"
      : /Windows/i.test(ua) ? "Windows"
        : /CrOS/i.test(ua) ? "ChromeOS"
          : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
            : /Linux/i.test(ua) ? "Linux" : "Other";

  // The country is estimated from the time zone the device is set to;
  // nothing is looked up. Several countries share some zones (Lagos time
  // covers much of West and Central Africa), so it is an estimate.
  const ZONES = {
    "Africa/Lagos": "Nigeria", "Africa/Accra": "Ghana", "Africa/Johannesburg": "South Africa", "Africa/Nairobi": "Kenya",
    "Africa/Kampala": "Uganda", "Africa/Dar_es_Salaam": "Tanzania", "Africa/Kigali": "Rwanda", "Africa/Cairo": "Egypt",
    "Africa/Casablanca": "Morocco", "Africa/Abidjan": "Côte d'Ivoire", "Africa/Douala": "Cameroon", "Africa/Porto-Novo": "Benin",
    "Africa/Lome": "Togo", "Africa/Harare": "Zimbabwe", "Africa/Lusaka": "Zambia", "Africa/Addis_Ababa": "Ethiopia",
    "Africa/Kinshasa": "DR Congo", "Africa/Luanda": "Angola", "Africa/Monrovia": "Liberia", "Africa/Freetown": "Sierra Leone",
    "Africa/Banjul": "Gambia", "Africa/Dakar": "Senegal", "Africa/Windhoek": "Namibia", "Africa/Gaborone": "Botswana",
    "Africa/Maputo": "Mozambique",
    "Europe/London": "United Kingdom", "Europe/Belfast": "United Kingdom", "Europe/Dublin": "Ireland", "Europe/Paris": "France",
    "Europe/Berlin": "Germany", "Europe/Amsterdam": "Netherlands", "Europe/Brussels": "Belgium", "Europe/Madrid": "Spain",
    "Europe/Rome": "Italy", "Europe/Lisbon": "Portugal", "Europe/Zurich": "Switzerland", "Europe/Vienna": "Austria",
    "Europe/Stockholm": "Sweden", "Europe/Oslo": "Norway", "Europe/Copenhagen": "Denmark", "Europe/Helsinki": "Finland",
    "Europe/Warsaw": "Poland", "Europe/Kiev": "Ukraine", "Europe/Kyiv": "Ukraine", "Europe/Moscow": "Russia",
    "Europe/Istanbul": "Türkiye", "Europe/Athens": "Greece",
    "America/New_York": "United States", "America/Chicago": "United States", "America/Denver": "United States",
    "America/Los_Angeles": "United States", "America/Phoenix": "United States", "America/Anchorage": "United States",
    "America/Detroit": "United States", "America/Indiana/Indianapolis": "United States", "Pacific/Honolulu": "United States",
    "America/Toronto": "Canada", "America/Vancouver": "Canada", "America/Edmonton": "Canada", "America/Winnipeg": "Canada",
    "America/Halifax": "Canada", "America/Regina": "Canada", "America/St_Johns": "Canada",
    "America/Sao_Paulo": "Brazil", "America/Mexico_City": "Mexico", "America/Bogota": "Colombia",
    "America/Argentina/Buenos_Aires": "Argentina", "America/Jamaica": "Jamaica", "America/Port_of_Spain": "Trinidad and Tobago",
    "America/Barbados": "Barbados",
    "Asia/Dubai": "United Arab Emirates", "Asia/Qatar": "Qatar", "Asia/Riyadh": "Saudi Arabia", "Asia/Kolkata": "India",
    "Asia/Calcutta": "India", "Asia/Shanghai": "China", "Asia/Hong_Kong": "Hong Kong", "Asia/Singapore": "Singapore",
    "Asia/Tokyo": "Japan", "Asia/Seoul": "South Korea", "Asia/Manila": "Philippines", "Asia/Jerusalem": "Israel",
    "Asia/Karachi": "Pakistan", "Asia/Kuala_Lumpur": "Malaysia", "Asia/Jakarta": "Indonesia",
    "Australia/Sydney": "Australia", "Australia/Melbourne": "Australia", "Australia/Brisbane": "Australia",
    "Australia/Perth": "Australia", "Australia/Adelaide": "Australia", "Pacific/Auckland": "New Zealand",
  };
  let zone = "";
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) { /* unknown */ }
  const country = ZONES[zone] || {
    Africa: "Elsewhere in Africa", Europe: "Elsewhere in Europe", America: "Elsewhere in the Americas", Asia: "Elsewhere in Asia",
    Australia: "Australia", Pacific: "Pacific islands", Atlantic: "Atlantic islands", Indian: "Indian Ocean islands",
  }[zone.split("/")[0]] || "Unknown";
  const lang = clip(navigator.language || "", 20) || "unknown";

  /* ---- where they came from ----------------------------------------- */
  const RULES = [
    [/(^|\.)mail\.|outlook\.(live|office)\.com$|android\.gm$|mail\.yahoo\./, "Email"],
    [/instagram/, "Social", "instagram"], [/facebook|(^|\.)fb\.(com|me)$/, "Social", "facebook"],
    [/whatsapp|(^|\.)wa\.me$/, "Social", "whatsapp"], [/youtube|(^|\.)youtu\.be$/, "Social", "youtube"],
    [/tiktok|musical\.ly/, "Social", "tiktok"], [/(^|\.)(twitter|x)\.com$|(^|\.)t\.co$/, "Social", "x"],
    [/linkedin|(^|\.)lnkd\.in$/, "Social", "linkedin"], [/telegram|(^|\.)t\.me$/, "Social", "telegram"],
    [/threads\.net$/, "Social", "threads"], [/snapchat/, "Social", "snapchat"], [/pinterest/, "Social", "pinterest"],
    [/google/, "Search", "google"], [/(^|\.)bing\.com$/, "Search", "bing"], [/duckduckgo/, "Search", "duckduckgo"],
    [/yahoo\./, "Search", "yahoo"], [/ecosia/, "Search", "ecosia"], [/yandex/, "Search", "yandex"],
    [/baidu/, "Search", "baidu"], [/search\.brave\.com$/, "Search", "brave"],
  ];
  function referrerHost() {
    try {
      const u = new URL(document.referrer);
      if (u.host === location.host) return null;
      return (u.hostname || u.host).replace(/^www\./, "").toLowerCase() || null;
    } catch (_) { return null; }
  }
  function origin() {
    const q = new URLSearchParams(location.search);
    const ref = referrerHost();
    const src = clip(q.get("utm_source"), 60);
    const cmp = clip(q.get("utm_campaign"), 80);
    if (src || cmp) return { ch: "Campaign", src: (src || "unknown").toLowerCase(), med: (clip(q.get("utm_medium"), 60) || "").toLowerCase() || null, cmp: (cmp || "").toLowerCase() || null, ref };
    if (!ref) {
      // In-app browsers often send no referrer; their name gives them away.
      if (browser === "Instagram") return { ch: "Social", src: "instagram", ref: null };
      if (browser === "Facebook") return { ch: "Social", src: "facebook", ref: null };
      if (browser === "TikTok") return { ch: "Social", src: "tiktok", ref: null };
      return { ch: "Direct", src: "direct", ref: null };
    }
    const rule = RULES.find(([re]) => re.test(ref));
    if (rule) return { ch: rule[1], src: rule[2] || ref, ref };
    return { ch: "Referral", src: ref, ref };
  }

  /* ---- this browser, this visit -------------------------------------- */
  let vid = store.get("drajokesings:vid");
  let firstVisit = false;
  if (!/^[a-z0-9]{8,40}$/.test(vid || "")) {
    vid = `v${rand()}`;
    store.set("drajokesings:vid", vid);
    firstVisit = true;
  }
  let visit = null;
  try { visit = JSON.parse(store.get("drajokesings:visit") || "null"); } catch (_) { visit = null; }
  const fromCampaign = /[?&]utm_(source|campaign)=/.test(location.search);
  if (!visit || !visit.sid || Date.now() - (visit.last || 0) > 30 * 60e3 || fromCampaign) {
    // "New" means this browser's first visit: the one in which it got its name.
    visit = { sid: `s${rand()}`, isNew: firstVisit, land: path, ...origin() };
  }
  const touch = () => { visit.last = Date.now(); store.set("drajokesings:visit", JSON.stringify(visit)); };
  touch();

  /* ---- sending -------------------------------------------------------- */
  const queue = [];
  let timer = null;
  const envelope = () => ({
    sid: visit.sid, vid, new: Boolean(visit.isNew), land: visit.land, ref: visit.ref || undefined, ch: visit.ch,
    src: visit.src, med: visit.med || undefined, cmp: visit.cmp || undefined,
    dev: device, br: browser, os, lang, cty: country,
  });
  function flush(final = false) {
    clearTimeout(timer);
    timer = null;
    while (queue.length) {
      const events = queue.splice(0, 40);
      try { Backend.analytics.send({ ...envelope(), events }, { final }); } catch (_) { /* counting must never break the page */ }
    }
  }
  function push(ev, now = false) {
    if (!NAMES.has(ev.n)) return;
    queue.push(ev);
    touch();
    if (now) flush();
    else if (!timer) timer = setTimeout(flush, 4000);
  }

  window.Track = {
    enabled: true,
    event(name, { label, value, props } = {}) {
      push({ n: name, p: path, l: clip(label, 150), v: value == null ? undefined : value, x: props || undefined }, GOALS.includes(name));
    },
  };

  /* ---- the page view, and how it went --------------------------------- */
  push({ n: "pageview", p: path, t: clip(document.title, 150) }, true);

  const pv = rand().slice(0, 10);
  let engagedMs = 0;
  let visibleSince = document.visibilityState === "visible" ? performance.now() : null;
  let maxScroll = 0;
  let load = null;
  let lcp = null;
  const sections = new Set();

  const measureScroll = () => {
    const doc = document.documentElement;
    const seen = ((window.scrollY || doc.scrollTop) + window.innerHeight) / Math.max(1, doc.scrollHeight);
    maxScroll = Math.max(maxScroll, Math.min(100, seen * 100));
  };
  let scrollQueued = false;
  addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; measureScroll(); });
  }, { passive: true });
  addEventListener("load", () => {
    measureScroll();
    setTimeout(() => {
      const nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      const ms = nav ? nav.loadEventEnd || nav.domContentLoadedEventEnd : 0;
      if (ms > 0) load = Math.round(ms);
    }, 0);
  });
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length) lcp = Math.round(entries[entries.length - 1].startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (_) { /* not supported: speed is still counted */ }

  // How far down the homepage people get: each section counts once it's
  // half on screen (or fills most of it).
  if (path === "/" && "IntersectionObserver" in window) {
    const watch = () => {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { sections.add(e.target.dataset.trackSection); io.unobserve(e.target); }
        });
      }, { threshold: [0.5] });
      document.querySelectorAll("[data-track-section]").forEach((el) => io.observe(el));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
    else watch();
  }

  // How the page view went so far. The report keeps the latest one per
  // page view, so it is sent at 15 and 60 seconds as well as on leaving:
  // a goodbye lost as the page closes then costs little.
  const engagedNow = () => engagedMs + (visibleSince != null ? performance.now() - visibleSince : 0);
  function report(leaving) {
    if (leaving && visibleSince != null) { engagedMs += performance.now() - visibleSince; visibleSince = null; }
    measureScroll();
    const props = { pv, scroll: Math.round(maxScroll) };
    if (load != null) props.load = load;
    if (lcp != null) props.lcp = lcp;
    if (path === "/" && sections.size) props.sections = [...sections].filter(Boolean);
    push({ n: "engagement", p: path, v: Math.min(1800, Math.round(engagedNow() / 1000)), x: props });
    flush(leaving);
  }
  const marks = [15, 60];
  const markTimer = setInterval(() => {
    if (!marks.length) { clearInterval(markTimer); return; }
    if (engagedNow() / 1000 >= marks[0]) { marks.shift(); report(false); }
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") report(true);
    else { visibleSince = performance.now(); touch(); }
  });
  addEventListener("pagehide", () => report(true));

  /* ---- taps ------------------------------------------------------------ */
  const text = (el) => clip(el.dataset.cta || el.getAttribute("aria-label") || el.textContent, 60);
  const areaOf = (el) => {
    const s = el.closest("[data-track-section]");
    if (s) return s.dataset.trackSection;
    if (el.closest("header, .site-header")) return "Header";
    if (el.closest("footer, .site-footer")) return "Footer";
    return undefined;
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("a[href], button");
    if (!el || el.closest(".edit-ui")) return;

    if (el.closest("[data-mobile-nav]") && el.tagName === "A") { push({ n: "menu", p: path, l: text(el) }); return; }
    const slide = el.closest("[data-hero-slide]");
    if (slide && slide.dataset.slideName) push({ n: "slide_tap", p: path, l: clip(slide.dataset.slideName, 80), x: { cta: text(el) } });
    if (el.matches("[data-video-yt]")) { push({ n: "youtube", p: path, l: "Watch on YouTube" }); return; }
    if (el.dataset.stream) { push({ n: "stream", p: path, l: clip(el.dataset.stream, 40), x: el.dataset.song ? { song: clip(el.dataset.song, 80) } : undefined }); return; }

    if (el.tagName === "A") {
      let u = null;
      try { u = new URL(el.href, location.href); } catch (_) { u = null; }
      if (u && /^https?:$/.test(u.protocol) && u.host !== location.host) {
        push({ n: "outbound", p: path, l: u.hostname.replace(/^www\./, "") });
        return;
      }
    }
    if (el.matches(".btn, .btn-solid, .btn-ghost, .btn-line, .event-row__cta, [data-hero-more], [data-cta]")) {
      push({ n: "cta", p: path, l: text(el), x: areaOf(el) ? { area: areaOf(el) } : undefined });
    }
  }, true);

  /* ---- errors visitors hit -------------------------------------------- */
  let errors = 0;
  const failed = (message, where) => {
    if (errors >= 3 || !message) return;
    errors += 1;
    push({ n: "error", p: path, l: clip(message, 150), x: where ? { at: clip(String(where).split("?")[0].split("/").pop(), 80) } : undefined });
  };
  addEventListener("error", (e) => { if (e instanceof ErrorEvent) failed(e.message, e.filename); });
  addEventListener("unhandledrejection", (e) => failed(e.reason && (e.reason.message || String(e.reason))));
})();
