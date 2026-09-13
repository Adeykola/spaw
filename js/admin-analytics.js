/**
 * admin-analytics.js
 * ----------------------------------------------------------------------
 * The Analytics screen (Overview, Sources & campaigns, Audience, Pages,
 * Music & video, Sign-ups, Site health), the summary on the Dashboard,
 * how each event is doing against the guests expected, and Campaign
 * links (tagged links and flyer QR codes).
 *
 * Figures come from Backend.analytics.report(from, to): worked out by the
 * database when live (supabase/setup-3.sql), by analytics-core.js in demo
 * mode. Visits are counted by track.js on the public pages. Charts are
 * plain SVG.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";
  const { h, toast, dialog, head, loading } = Admin;
  const NS = "http://www.w3.org/2000/svg";
  const DAY = 86400e3;
  const LAGOS = 3600e3;

  /* ===================================================================
   * Numbers, dates and names
   * =================================================================== */
  const nf = new Intl.NumberFormat("en-GB");
  const fmt = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : nf.format(Math.round(n)));
  const pct = (a, b, digits = 1) => (b ? `${(Math.round((a / b) * 100 * 10 ** digits) / 10 ** digits).toLocaleString("en-GB")}%` : "—");
  const secs = (s) => {
    const v = Math.round(s || 0);
    return v < 60 ? `${v}s` : `${Math.floor(v / 60)}m ${String(v % 60).padStart(2, "0")}s`;
  };
  const speed = (v) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
  const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${Math.round(n) === 1 ? one : many}`;
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const lagosDay = (t) => new Date(t + LAGOS).toISOString().slice(0, 10);
  const lagosMidnight = (d) => Date.parse(`${d}T00:00:00+01:00`);
  const dayLabel = (d, opts = { day: "numeric", month: "short" }) => new Date(`${d}T12:00:00+01:00`).toLocaleDateString("en-GB", { ...opts, timeZone: "Africa/Lagos" });
  const plain = (s) => Content.normalize(typeof s === "string" && /</.test(s) ? Content.richFragment(s).textContent : s || "");
  const langName = (() => {
    let names = null;
    try { names = new Intl.DisplayNames(["en-GB"], { type: "language" }); } catch (_) { names = null; }
    return (code) => {
      if (!code || code === "unknown") return "Unknown";
      try { return names ? names.of(code) : code; } catch (_) { return code; }
    };
  })();

  const CHANNEL_HELP = {
    Direct: "Typed in, saved, or from apps that don't say",
    Search: "Google and other search engines",
    Social: "Instagram, WhatsApp, Facebook, YouTube, TikTok…",
    Campaign: "Your campaign links and flyer QR codes",
    Referral: "Links on other websites",
    Email: "Links in emails",
  };
  const SOURCE_NAMES = {
    direct: "Direct", google: "Google", bing: "Bing", duckduckgo: "DuckDuckGo", yahoo: "Yahoo", instagram: "Instagram",
    whatsapp: "WhatsApp", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", x: "X (Twitter)", linkedin: "LinkedIn",
    telegram: "Telegram", threads: "Threads", flyer: "Flyer or poster", newsletter: "Email / newsletter", sms: "Text message",
    radio: "Radio or TV", church: "Church announcement", other: "Somewhere else",
  };
  const sourceName = (k) => SOURCE_NAMES[k] || k;
  const PAGE_NAMES = {
    "/": "Home", "/music": "Music", "/albums": "Albums", "/media": "Media", "/ministry": "Ministry", "/symphony": "Symphony",
    "/events": "Events", "/about": "About", "/contact": "Contact & booking",
  };
  const pageName = (p, title) => PAGE_NAMES[p] || (title ? String(title).split(" — ")[0] : p || "—");
  const HOME_SECTIONS = ["Hero", "Story", "Featured song", "Featured album", "Catalogue", "Latest video", "Ministry", "Symphony", "Emerging artists", "Events", "Booking", "Newsletter"];
  const GOALS = [
    ["registered", "Event registrations"], ["applied", "Talent Quest applications"], ["booking", "Booking requests"],
    ["enquiry", "Messages"], ["newsletter", "Newsletter sign-ups"],
  ];

  function friendlyError(err) {
    const m = String((err && err.message) || err || "");
    if (/analytics_report|analytics_live|campaign_links|schema cache|does not exist/i.test(m)) {
      return "The analytics aren't set up in the database yet. Run supabase/setup-3.sql in Supabase (SQL Editor → New query → paste → Run), then open this screen again.";
    }
    return m || "The figures couldn't be loaded just now.";
  }

  async function currentEvents() {
    let pub = {};
    try { pub = await Backend.content.getPublished(); } catch (_) { pub = {}; }
    return Array.isArray(pub.events) ? pub.events : DB.events;
  }

  /* ===================================================================
   * Building blocks: cards, bars, tables, charts
   * =================================================================== */
  function svg(tag, attrs = {}, kids = []) {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => { if (v != null) n.setAttribute(k, v); });
    kids.forEach((k) => { if (k != null) n.append(k); });
    return n;
  }
  const niceMax = (v) => {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    const m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  };
  const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : v >= 1e4 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : nf.format(Math.round(v)));

  // Days along the bottom; the first series is solid, the others dashed.
  // targets draw a level line each (expected guests, places).
  function lineChart(days, series, { height = 220, targets = [], format = fmt } = {}) {
    const W = 720;
    const H = height;
    const L = 44;
    const R = 14;
    const T = 14;
    const B = 28;
    const n = days.length;
    const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values), ...targets.map((t) => t.value)));
    const step = n > 1 ? (W - L - R) / (n - 1) : 0;
    const x = (i) => (n > 1 ? L + i * step : (L + W - R) / 2);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const label = series.map((s) => s.label).join(" and ");
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "an-chart", role: "img", "aria-label": label });

    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4;
      root.append(
        svg("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "an-gridline" }),
        svg("text", { x: L - 8, y: y(v) + 4, class: "an-axis", "text-anchor": "end" }, [document.createTextNode(short(v))])
      );
    }
    const every = Math.max(1, Math.ceil(n / 6));
    days.forEach((d, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      if (i !== n - 1 && n - 1 - i < every / 2) return; // keep the last label clear of its neighbour
      root.append(svg("text", { x: x(i), y: H - 8, class: "an-axis", "text-anchor": n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle" }, [document.createTextNode(dayLabel(d))]));
    });
    targets.forEach((t) => {
      root.append(
        svg("line", { x1: L, x2: W - R, y1: y(t.value), y2: y(t.value), class: "an-target" }),
        svg("text", { x: W - R, y: y(t.value) - 5, class: "an-target-label", "text-anchor": "end" }, [document.createTextNode(`${t.label}: ${fmt(t.value)}`)])
      );
    });
    [...series].reverse().forEach((s, ri) => {
      const pts = s.values.map((v, i) => [x(i), y(v || 0)]);
      if (!pts.length) return;
      const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
      const main = ri === series.length - 1;
      if (main && s.area && pts.length > 1) root.append(svg("path", { d: `${d} L${x(pts.length - 1)},${y(0)} L${x(0)},${y(0)} Z`, class: "an-area" }));
      root.append(svg("path", { d, class: main ? "an-line" : "an-line an-line--prev" }));
      if (main && pts.length === 1) root.append(svg("circle", { cx: pts[0][0], cy: pts[0][1], r: 4, class: "an-dot" }));
    });
    days.forEach((d, i) => {
      const w = Math.max(6, step || W - L - R);
      const hit = svg("rect", { x: x(i) - w / 2, y: T, width: w, height: H - T - B, class: "an-hit" });
      hit.append(svg("title", {}, [document.createTextNode(`${dayLabel(d, { weekday: "short", day: "numeric", month: "short" })}: ${series.map((s) => `${s.label} ${format(s.values[i] || 0)}`).join(" · ")}`)]));
      root.append(hit);
    });
    const legend = series.length > 1 || targets.length
      ? h("div", { class: "an-legend" }, [
        ...series.map((s, i) => h("span", {}, [h("i", { class: i ? "is-prev" : "is-main" }), s.label])),
      ])
      : null;
    return h("div", { class: "an-chart-wrap" }, [root, legend]);
  }

  function bars(items, { value, label, note, total, empty = "Nothing in this period yet.", limit = 10, href } = {}) {
    if (!items || !items.length) return h("p", { class: "an-empty", text: empty });
    const top = items.slice(0, limit);
    const max = Math.max(1, ...top.map(value));
    return h("div", { class: "an-bars" }, top.map((it) => {
      const name = label(it);
      return h("div", { class: "an-bar" }, [
        href && href(it) ? h("a", { class: "an-bar__label", href: href(it), text: name, title: name }) : h("span", { class: "an-bar__label", text: name, title: name }),
        h("span", { class: "an-bar__value", text: `${fmt(value(it))}${total ? ` · ${pct(value(it), total, 0)}` : ""}` }),
        h("span", { class: "an-bar__track" }, [h("span", { class: "an-bar__fill", style: `width:${((value(it) / max) * 100).toFixed(1)}%` })]),
        note && note(it) ? h("span", { class: "an-bar__note", text: note(it) }) : null,
      ]);
    }));
  }

  // columns: [heading, cell(row) → text or node, "num" for figures]
  function table(columns, rows, { empty = "Nothing in this period yet.", limit, rowClass } = {}) {
    if (!rows || !rows.length) return h("p", { class: "an-empty", text: empty });
    const list = limit ? rows.slice(0, limit) : rows;
    return h("div", { class: "admin-table-wrap" }, [h("table", { class: "admin-table an-table" }, [
      h("thead", {}, [h("tr", {}, columns.map(([title, , cls]) => h("th", { class: cls, text: title })))]),
      h("tbody", {}, list.map((r) => h("tr", { class: rowClass ? rowClass(r) : null }, columns.map(([, cell, cls]) => {
        const v = cell(r);
        return h("td", { class: cls }, v instanceof Node ? [v] : [v == null ? "" : String(v)]);
      })))),
    ])]);
  }

  function card(title, body, { csv, sub, wide, id } = {}) {
    return h("section", { class: `an-card${wide ? " an-card--wide" : ""}`, id }, [
      h("div", { class: "an-card__head" }, [
        h("div", {}, [h("h2", { class: "an-card__title", text: title }), sub ? h("p", { class: "an-card__sub", text: sub }) : null]),
        csv || null,
      ]),
      body,
    ]);
  }
  const grid = (kids, cls = "") => h("div", { class: `an-grid ${cls}` }, kids);

  function kpi(label, value, { now, before, better = "up", note } = {}) {
    let delta = null;
    if (before != null && now != null) {
      if (!before && !now) delta = { text: "Same as the period before", trend: "" };
      else if (!before) delta = { text: "None the period before", trend: "" };
      else {
        const d = (now - before) / before;
        const up = d >= 0;
        delta = {
          text: `${up ? "▲" : "▼"} ${Math.abs(Math.round(d * 1000) / 10).toLocaleString("en-GB")}% on the period before`,
          trend: Math.abs(d) < 0.005 ? "" : up === (better === "up") ? "up" : "down",
        };
      }
    }
    return h("div", { class: "stat-card an-kpi" }, [
      h("p", { class: "stat-card__label", text: label }),
      h("p", { class: "stat-card__value", text: value }),
      delta ? h("p", { class: "stat-card__delta", "data-trend": delta.trend, text: delta.text }) : null,
      note ? h("p", { class: "stat-card__delta", text: note }) : null,
    ]);
  }

  function stack(parts) {
    const total = parts.reduce((a, [, v]) => a + v, 0);
    return h("div", {}, [
      h("div", { class: "an-stack", role: "img", "aria-label": parts.map(([l, v]) => `${l} ${pct(v, total, 0)}`).join(", ") },
        parts.map(([, v], i) => h("span", { class: `is-${i}`, style: `width:${total ? ((v / total) * 100).toFixed(1) : 0}%` }))),
      h("div", { class: "an-legend" }, parts.map(([l, v], i) => h("span", {}, [h("i", { class: `is-${i}` }), `${l}: ${fmt(v)} (${pct(v, total, 0)})`]))),
    ]);
  }

  // Steps: [label, count, note?]; each bar is a share of the first step.
  function funnel(steps) {
    const first = steps[0][1] || 0;
    return h("div", { class: "an-funnel" }, steps.map(([label, n, note], i) => {
      const prev = i ? steps[i - 1][1] : null;
      return h("div", { class: "an-step" }, [
        h("div", { class: "an-step__top" }, [h("span", { text: label }), h("strong", { text: fmt(n) })]),
        h("div", { class: "an-step__bar" }, [h("span", { class: "an-step__fill", style: `width:${first ? Math.min(100, (n / first) * 100).toFixed(1) : 0}%` })]),
        i ? h("span", { class: "an-step__drop", text: prev ? `${pct(n, prev, 0)} of the step before${n < prev ? ` · ${fmt(prev - n)} dropped out` : ""}` : "—" }) : null,
        note ? h("span", { class: "an-step__drop", text: note }) : null,
      ]);
    }));
  }

  function heatmap(hours) {
    if (!hours || !hours.length) return h("p", { class: "an-empty", text: "Nothing in this period yet." });
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const LONG = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
    const cells = Array.from({ length: 7 }, () => Array(24).fill(0));
    hours.forEach((x) => { if (x.dow >= 1 && x.dow <= 7 && x.hour >= 0 && x.hour < 24) cells[x.dow - 1][x.hour] += x.sessions; });
    const max = Math.max(1, ...cells.flat());
    let best = [0, 0];
    cells.forEach((row, d) => row.forEach((v, hr) => { if (v > cells[best[0]][best[1]]) best = [d, hr]; }));
    const hh = (n) => String(n % 24).padStart(2, "0");
    return h("div", {}, [
      h("div", { class: "an-heat-wrap" }, [h("div", { class: "an-heat", role: "table", "aria-label": "Visits by day and hour, Lagos time" }, [
        h("div", { class: "an-heat__row", role: "row" }, [h("span"), ...Array.from({ length: 24 }, (_, hr) => h("span", { class: "an-heat__hour", text: hr % 3 === 0 ? hh(hr) : "" }))]),
        ...cells.map((row, d) => h("div", { class: "an-heat__row", role: "row" }, [
          h("span", { class: "an-heat__day", text: DAYS[d] }),
          ...row.map((v, hr) => h("span", { class: "an-heat__cell", role: "cell", style: `--v:${(v / max).toFixed(3)}`, title: `${DAYS[d]} ${hh(hr)}:00–${hh(hr + 1)}:00 · ${plural(v, "visit")}` })),
        ])),
      ])]),
      h("p", { class: "an-card__sub", text: `Busiest: ${LONG[best[0]]}, ${hh(best[1])}:00–${hh(best[1] + 1)}:00 Lagos time.` }),
    ]);
  }

  function downloadCsv(name, columns, rows) {
    const cell = (v) => {
      if (typeof v === "number") return String(v);
      let s = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // so a spreadsheet never runs it as a formula
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const text = [columns.map(([t]) => cell(t)).join(","), ...rows.map((r) => columns.map(([, f]) => cell(f(r))).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const csvButton = (name, columns, rows) => h("button", { type: "button", class: "pe-small-btn", onclick: () => downloadCsv(`${name}-${lagosDay(Date.now())}.csv`, columns, rows) }, "Spreadsheet");

  /* ===================================================================
   * The period being looked at
   * =================================================================== */
  const RANGES = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"], ["month", "This month"], ["custom", "Choose dates…"]];
  const RANGE_KEY = "drajokesings:analyticsRange";
  let range = (() => {
    try { return JSON.parse(localStorage.getItem(RANGE_KEY)) || { key: "30" }; } catch (_) { return { key: "30" }; }
  })();
  const saveRange = () => { try { localStorage.setItem(RANGE_KEY, JSON.stringify(range)); } catch (_) { /* fine */ } };

  function bounds(r = range) {
    const today = lagosDay(Date.now());
    const to0 = lagosMidnight(today) + DAY; // the end of today, Lagos
    let from = to0 - 30 * DAY;
    let to = to0;
    if (/^\d+$/.test(r.key)) from = to0 - Number(r.key) * DAY;
    else if (r.key === "month") from = lagosMidnight(`${today.slice(0, 8)}01`);
    else if (r.key === "custom" && r.from && r.to && r.from <= r.to) { from = lagosMidnight(r.from); to = lagosMidnight(r.to) + DAY; }
    if (to - from > 400 * DAY) from = to - 400 * DAY;
    return { from, to, prevFrom: from - (to - from), prevTo: from };
  }
  const daysOf = (from, to) => { const out = []; for (let t = from; t < to; t += DAY) out.push(lagosDay(t)); return out; };
  function rangeText(b) {
    const a = lagosDay(b.from);
    const z = lagosDay(b.to - DAY);
    return a === z ? dayLabel(a, { day: "numeric", month: "long", year: "numeric" })
      : `${dayLabel(a, { day: "numeric", month: "short" })} – ${dayLabel(z, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  const series = (report, days, field) => {
    const m = new Map((report.daily || []).map((d) => [d.day, d[field]]));
    return days.map((d) => m.get(d) || 0);
  };

  const cache = new Map();
  function getReport(b) {
    const k = `${b.from}|${b.to}`;
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < 60e3) return hit.p;
    const iso = (t) => new Date(t).toISOString();
    const p = Promise.all([
      Backend.analytics.report(iso(b.from), iso(b.to), false),
      Backend.analytics.report(iso(b.prevFrom), iso(b.prevTo), true),
    ]).then(([cur, prev]) => ({ cur, prev, b }));
    cache.set(k, { at: Date.now(), p });
    p.catch(() => cache.delete(k));
    return p;
  }

  /* ===================================================================
   * Events: registrations against the guests expected
   * =================================================================== */
  function paceNote(e, count) {
    const target = Number(e.expectedGuests) || 0;
    const places = Number(e.capacity) || 0;
    const daysLeft = e.date ? Math.round((lagosMidnight(e.date) - lagosMidnight(lagosDay(Date.now()))) / DAY) : null;
    if (!target) {
      const tail = "Set “Expected guests” on the event to follow its progress.";
      return places ? `${pct(count, places, 0)} of the ${fmt(places)} places taken. ${tail}` : tail;
    }
    if (count >= target) return `The ${fmt(target)} expected guests have registered${places && count >= places ? ", and every place is taken" : ""}.`;
    if (daysLeft == null || daysLeft < 0) return `Finished ${fmt(target - count)} short of the ${fmt(target)} expected.`;
    if (daysLeft === 0) return `Today's the day: ${fmt(target - count)} short of the ${fmt(target)} expected.`;
    const perDay = Math.ceil((target - count) / daysLeft);
    return `${fmt(target - count)} more to reach ${fmt(target)}: about ${plural(perDay, "registration")} a day for the ${plural(daysLeft, "day")} left.`;
  }
  function progress(count, goal) {
    return h("div", { class: `an-progress${count >= goal ? " is-done" : ""}`, role: "img", "aria-label": `${fmt(count)} of ${fmt(goal)}` }, [
      h("span", { style: `width:${goal ? Math.min(100, (count / goal) * 100).toFixed(1) : 0}%` }),
    ]);
  }
  const stat = (label, value) => h("div", { class: "an-stat" }, [h("strong", { text: fmt(value) }), h("span", { text: label })]);

  // Registrations, fetched once for a little while: the Events editor
  // redraws an event's panel as its numbers are typed.
  let regsCache = null;
  function registrations() {
    if (!regsCache || Date.now() - regsCache.at > 30e3) {
      const p = Backend.forms.list("registrations");
      regsCache = { at: Date.now(), p };
      p.catch(() => { regsCache = null; });
    }
    return regsCache.p;
  }

  // The panel beside an event in the Events editor.
  function eventInsight(e) {
    const box = h("div", { class: "an-insight" }, [loading("Counting registrations…")]);
    registrations().then((regs) => {
      const mine = regs.filter((r) => r.eventId === e.id && r.status === "registered");
      const came = mine.filter((r) => r.checkedIn).length;
      const target = Number(e.expectedGuests) || 0;
      const places = Number(e.capacity) || 0;
      const regLink = new URL(`events?register=${encodeURIComponent(e.id)}`, Backend.root).href;
      box.replaceChildren(
        h("div", { class: "an-insight__stats" }, [
          stat("Registered", mine.length), stat("Checked in", came),
          target ? stat("Expected guests", target) : null, places ? stat("Places", places) : null,
        ].filter(Boolean)),
        target || places ? progress(mine.length, target || places) : null,
        h("p", { class: "pe-card__note", text: paceNote(e, mine.length) }),
        h("div", { class: "pe-actions-row" }, [
          h("a", { class: "pe-small-btn", href: `#registrations/${encodeURIComponent(e.id)}` }, "See registrations"),
          h("button", {
            type: "button", class: "pe-small-btn",
            onclick: () => navigator.clipboard.writeText(regLink).then(() => toast("Registration link copied."), () => toast(regLink)),
          }, "Copy the registration link"),
          h("a", { class: "pe-small-btn", href: `#campaigns/${encodeURIComponent(`events?register=${e.id}`)}` }, "Make a campaign link"),
        ])
      );
    }).catch((err) => box.replaceChildren(h("p", { class: "pe-card__note", text: friendlyError(err) })));
    return box;
  }

  function pacing(events, regs) {
    const today = lagosDay(Date.now());
    const upcoming = events
      .filter((e) => e.visible !== false && e.status !== "cancelled" && (e.endDate || e.date) >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 5);
    if (!upcoming.length) return h("p", { class: "an-empty", text: "No upcoming events. Add one under Events." });
    return h("div", { class: "an-pace" }, upcoming.map((e) => {
      const count = regs.filter((r) => r.eventId === e.id && r.status === "registered").length;
      const goal = Number(e.expectedGuests) || Number(e.capacity) || 0;
      return h("div", { class: "an-pace__row" }, [
        h("div", { class: "an-pace__top" }, [
          h("a", { href: `#events/${encodeURIComponent(e.id)}` }, [h("strong", { text: plain(e.name) }), ` · ${dayLabel(e.date, { weekday: "short", day: "numeric", month: "short" })}`]),
          h("span", { text: `${fmt(count)} registered${Number(e.expectedGuests) ? ` of ${fmt(e.expectedGuests)} expected` : Number(e.capacity) ? ` of ${fmt(e.capacity)} places` : ""}${e.status === "postponed" ? " · postponed" : ""}` }),
        ]),
        goal ? progress(count, goal) : null,
        h("p", { class: "an-card__sub", text: paceNote(e, count) }),
      ]);
    }));
  }

  function registrationsChart(e, regs) {
    const days = regs.filter((r) => r.eventId === e.id && r.status === "registered" && r.registeredAt)
      .map((r) => lagosDay(Date.parse(r.registeredAt))).sort();
    if (!days.length) return h("p", { class: "an-empty", text: "No registrations for this event yet." });
    const today = lagosDay(Date.now());
    const last = e.date && e.date < today ? e.date : today;
    let first = days[0] < last ? days[0] : last;
    if (lagosMidnight(last) - lagosMidnight(first) > 180 * DAY) first = lagosDay(lagosMidnight(last) - 180 * DAY);
    const axis = daysOf(lagosMidnight(first), lagosMidnight(last) + DAY);
    let running = days.filter((d) => d < first).length;
    const perDay = new Map();
    days.forEach((d) => perDay.set(d, (perDay.get(d) || 0) + 1));
    const values = axis.map((d) => (running += perDay.get(d) || 0));
    const targets = [];
    if (Number(e.expectedGuests)) targets.push({ value: Number(e.expectedGuests), label: "Expected" });
    if (Number(e.capacity) && Number(e.capacity) !== Number(e.expectedGuests)) targets.push({ value: Number(e.capacity), label: "Places" });
    return lineChart(axis, [{ label: "Registered so far", values, area: true }], { targets });
  }

  /* ===================================================================
   * The tabs
   * =================================================================== */
  const TABS = [
    ["overview", "Overview"], ["sources", "Sources & campaigns"], ["audience", "Audience"], ["pages", "Pages"],
    ["media", "Music & video"], ["signups", "Sign-ups"], ["health", "Site health"],
  ];

  function countMyVisits() {
    let on = false;
    try { on = localStorage.getItem("drajokesings:notrack") === "0"; } catch (_) { on = false; }
    const box = h("input", { type: "checkbox" });
    box.checked = on;
    box.addEventListener("change", () => {
      try { localStorage.setItem("drajokesings:notrack", box.checked ? "0" : "1"); } catch (_) { /* fine */ }
      toast(box.checked ? "Your visits to the site from this browser now count." : "Your visits from this browser are left out again.");
    });
    return h("label", { class: "pe-toggle an-mine" }, [
      h("span", {}, [h("strong", { text: "Count my own visits" }), h("small", { text: " Off at first, so the team's own clicking around doesn't swell the figures. For this browser only." })]),
      box,
    ]);
  }

  const TAB_RENDER = {
    async overview({ cur, prev, b }) {
      const t = cur.totals;
      const p = prev.totals;
      const avg = (x) => (x.sessions ? x.engagedSeconds / x.sessions : 0);
      const bounce = (x) => (x.sessions ? x.bounces / x.sessions : 0);
      const days = daysOf(b.from, b.to);
      const prevDays = daysOf(b.prevFrom, b.prevTo);
      const goals = cur.goals || {};
      return [
        h("div", { class: "an-kpis" }, [
          kpi("Visitors", fmt(t.visitors), { now: t.visitors, before: p.visitors, note: t.visitors ? `${pct(t.newVisitors, t.visitors, 0)} on their first visit` : "" }),
          kpi("Visits", fmt(t.sessions), { now: t.sessions, before: p.sessions }),
          kpi("Page views", fmt(t.pageviews), { now: t.pageviews, before: p.pageviews, note: t.sessions ? `${(t.pageviews / t.sessions).toFixed(1)} pages a visit` : "" }),
          kpi("Time per visit", secs(avg(t)), { now: avg(t), before: avg(p) }),
          kpi("Left after one page", pct(t.bounces, t.sessions, 0), { now: bounce(t), before: bounce(p), better: "down" }),
          kpi("Sign-ups", fmt(t.conversions), { now: t.conversions, before: p.conversions, note: t.sessions ? `${pct(t.convertingSessions, t.sessions)} of visits` : "" }),
        ]),
        card("Visitors each day", lineChart(days, [
          { label: "Visitors", values: series(cur, days, "visitors"), area: true },
          { label: "The period before", values: series(prev, prevDays, "visitors") },
        ]), { wide: true }),
        grid([
          card("Where visitors come from", bars(cur.channels, { value: (c) => c.sessions, label: (c) => c.key, total: t.sessions, note: (c) => CHANNEL_HELP[c.key] })),
          card("Most viewed pages", bars(cur.pages, { value: (x) => x.views, label: (x) => pageName(x.key, x.title) })),
        ]),
        card("Sign-ups", h("div", { class: "an-goals" }, GOALS.map(([k, label]) => h("a", { class: "an-goal", href: "#analytics/signups" }, [
          h("strong", { text: fmt(goals[k] || 0) }), h("span", { text: label }),
        ]))), { sub: "What visitors sent through the site in this period. The Sign-ups tab shows each one step by step." }),
        countMyVisits(),
      ];
    },

    async sources({ cur }) {
      const t = cur.totals;
      const channelCols = [
        ["Channel", (c) => c.key], ["Visits", (c) => fmt(c.sessions), "num"], ["Share", (c) => pct(c.sessions, t.sessions, 0), "num"],
        ["Visitors", (c) => fmt(c.visitors), "num"], ["Sign-ups", (c) => fmt(c.conversions), "num"], ["Visits that signed up", (c) => pct(c.converting, c.sessions), "num"],
      ];
      const sourceCols = [
        ["Source", (s) => sourceName(s.key)], ["Channel", (s) => s.channel], ["Visits", (s) => fmt(s.sessions), "num"],
        ["Visitors", (s) => fmt(s.visitors), "num"], ["Sign-ups", (s) => fmt(s.conversions), "num"],
      ];
      const campaignCols = [
        ["Campaign", (c) => c.key], ["Shared on", (c) => sourceName(c.source)], ["Visits", (c) => fmt(c.sessions), "num"],
        ["Visitors", (c) => fmt(c.visitors), "num"], ["Registrations", (c) => fmt(c.registered), "num"], ["Applications", (c) => fmt(c.applied), "num"],
        ["Bookings", (c) => fmt(c.bookings), "num"], ["Newsletter", (c) => fmt(c.signups), "num"], ["All sign-ups", (c) => fmt(c.conversions), "num"],
      ];
      const plainCols = (cols) => cols.map(([title, f]) => [title, (r) => f(r)]);
      return [
        card("Channels", table(channelCols, cur.channels), {
          csv: csvButton("channels", plainCols(channelCols), cur.channels),
          sub: "How visitors found the site. “Visits that signed up” is how many of those visits ended in a registration, application, booking, message or newsletter sign-up.",
        }),
        card("Campaigns", cur.campaigns.length
          ? table(campaignCols, cur.campaigns)
          : h("p", { class: "an-empty" }, ["No visits through campaign links in this period. ", h("a", { href: "#campaigns", text: "Make a campaign link" }), " for the next post, broadcast or flyer, and its visits show here."]), {
          csv: cur.campaigns.length ? csvButton("campaigns", plainCols(campaignCols), cur.campaigns) : null,
          sub: "Visits through your campaign links and QR codes, and what they led to.",
        }),
        grid([
          card("Sources", table(sourceCols, cur.sources, { limit: 25 }), { csv: csvButton("sources", plainCols(sourceCols), cur.sources) }),
          card("Websites that sent visitors", bars(cur.referrers, { value: (r) => r.sessions, label: (r) => r.key, total: t.sessions }), {
            csv: csvButton("referring-sites", [["Website", (r) => r.key], ["Visits", (r) => r.sessions]], cur.referrers),
          }),
        ]),
      ];
    },

    async audience({ cur }) {
      const t = cur.totals;
      const returning = Math.max(0, t.visitors - t.newVisitors);
      const list = (rows, label = (r) => r.key) => bars(rows, { value: (r) => r.sessions, label, total: t.sessions });
      return [
        grid([
          card("New and returning visitors", stack([["First visit", t.newVisitors], ["Came back", returning]]), { sub: "Returning visitors have been to the site before, on this device and browser." }),
          card("Devices", list(cur.devices, (d) => cap(d.key))),
        ]),
        grid([
          card("Countries", list(cur.countries), { sub: "Estimated from the time zone each device is set to; nothing is looked up." }),
          card("Languages", list(cur.languages, (l) => langName(l.key)), { sub: "The language each device is set to." }),
        ]),
        grid([card("Browsers and apps", list(cur.browsers)), card("Operating systems", list(cur.os))]),
        card("When people visit", heatmap(cur.hours), { wide: true, sub: "Visits by day and hour, Lagos time. Darker is busier: good times to post." }),
      ];
    },

    async pages({ cur }) {
      const t = cur.totals;
      const pageCell = (p) => h("span", {}, [h("strong", { text: pageName(p.key, p.title) }), h("span", { class: "an-path", text: p.key })]);
      const pageCols = [
        ["Page", pageCell], ["Views", (p) => fmt(p.views), "num"], ["Visitors", (p) => fmt(p.visitors), "num"],
        ["Time on page", (p) => (p.engaged ? secs(p.seconds / p.engaged) : "—"), "num"],
        ["Scrolled", (p) => (p.scroll == null ? "—" : `${Math.round(p.scroll)}%`), "num"],
        ["Visits started here", (p) => fmt(p.entries), "num"], ["Visits ended here", (p) => fmt(p.exits), "num"],
      ];
      const byOrder = (a, b) => {
        const ia = HOME_SECTIONS.indexOf(a.key);
        const ib = HOME_SECTIONS.indexOf(b.key);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      };
      const sections = [...(cur.sections || [])].sort(byOrder);
      const slideCols = [["Slide", (s) => s.key], ["Seen", (s) => fmt(s.views), "num"], ["Tapped", (s) => fmt(s.taps), "num"], ["Tap rate", (s) => pct(s.taps, s.views), "num"]];
      return [
        card("Pages", table(pageCols, cur.pages, { limit: 40 }), {
          wide: true,
          csv: csvButton("pages", [["Page", (p) => pageName(p.key, p.title)], ["Address", (p) => p.key], ["Views", (p) => p.views], ["Visitors", (p) => p.visitors],
            ["Seconds on page", (p) => (p.engaged ? Math.round(p.seconds / p.engaged) : "")], ["Scrolled %", (p) => (p.scroll == null ? "" : Math.round(p.scroll))],
            ["Visits started here", (p) => p.entries], ["Visits ended here", (p) => p.exits]], cur.pages),
          sub: "Time on page counts only while the page is on screen. “Scrolled” is how far down people get, on average.",
        }),
        grid([
          card("Where visits start", bars([...cur.pages].filter((p) => p.entries).sort((a, b) => b.entries - a.entries), { value: (p) => p.entries, label: (p) => pageName(p.key, p.title), total: t.sessions })),
          card("Where visits end", bars([...cur.pages].filter((p) => p.exits).sort((a, b) => b.exits - a.exits), { value: (p) => p.exits, label: (p) => pageName(p.key, p.title), total: t.sessions })),
        ]),
        grid([
          card("How far down the homepage people get", bars(sections, { value: (s) => s.reached, label: (s) => s.key, total: t.homeViews, limit: 20 }), {
            sub: `Each section, and the share of the ${plural(t.homeViews, "homepage view")} that reached it.`,
          }),
          card("Hero slides", table(slideCols, cur.slides), { sub: "Each slide counts once per homepage view; taps are on its buttons." }),
        ]),
        grid([
          card("Buttons tapped", bars(cur.ctas, { value: (c) => c.taps, label: (c) => c.key, limit: 15 }), {
            csv: csvButton("buttons", [["Button", (c) => c.key], ["Taps", (c) => c.taps]], cur.ctas),
            sub: "Register, Book Ministration, See more, Apply and the rest, across the site.",
          }),
          card("Phone menu", bars(cur.menu, { value: (m) => m.taps, label: (m) => m.key }), { sub: "Taps on each item of the phone menu." }),
        ]),
        card("Links to other websites", bars(cur.outbound, { value: (o) => o.taps, label: (o) => o.key }), { sub: "Taps on links that leave the site (streaming links are under Music & video)." }),
      ];
    },

    async media({ cur }) {
      const songCols = [
        ["Song", (s) => s.key], ["Plays", (s) => fmt(s.plays), "num"],
        ["Heard, on average", (s) => (s.heard == null ? "—" : `${Math.round(s.heard)}%`), "num"],
        ["Played to the end", (s) => (s.listens ? pct(s.completes, s.listens, 0) : "—"), "num"],
      ];
      const searchCols = [["Search", (s) => s.key], ["Times", (s) => fmt(s.searches), "num"], ["Found nothing", (s) => (s.empty ? fmt(s.empty) : ""), "num"]];
      return [
        card("Songs played on the site", table(songCols, cur.songs), {
          csv: csvButton("songs", [["Song", (s) => s.key], ["Plays", (s) => s.plays], ["Heard %", (s) => (s.heard == null ? "" : s.heard)], ["Played to the end", (s) => s.completes]], cur.songs),
          sub: "Plays in the site's own player. “Heard” is how far into the song people listened.",
        }),
        grid([
          card("Streaming links tapped", bars(cur.streams, { value: (s) => s.taps, label: (s) => s.key }), { sub: "Spotify, Apple Music, YouTube and the rest, from song pages and the homepage." }),
          card("Videos played", bars(cur.videos, { value: (v) => v.plays, label: (v) => v.key }), { sub: `Played on the site. ${plural(cur.totals.youtubeTaps, "tap")} on “Watch on YouTube”.` }),
        ]),
        grid([
          card("Photo galleries opened", bars(cur.galleries, { value: (g) => g.opens, label: (g) => g.key })),
          card("Searches on the Music page", table(searchCols, cur.searches, { limit: 20, rowClass: (s) => (s.empty ? "is-flagged" : null) }), {
            csv: csvButton("music-searches", [["Search", (s) => s.key], ["Times", (s) => s.searches], ["Found nothing", (s) => s.empty]], cur.searches),
            sub: "Highlighted: searches that found nothing, songs people look for and don't find.",
          }),
        ]),
      ];
    },

    async signups({ cur, b }) {
      const g = cur.goals || {};
      const f = cur.funnels || { talent: [0, 0, 0], events: [0, 0, 0], booking: [0, 0, 0] };
      const [regs, events] = await Promise.all([Backend.forms.list("registrations").catch(() => []), currentEvents()]);
      const madeNow = regs.filter((r) => { const at = Date.parse(r.registeredAt); return r.status === "registered" && at >= b.from && at < b.to; });
      const cameNow = madeNow.filter((r) => r.checkedIn).length;
      const evRows = events.filter((e) => e.visible !== false).map((e) => {
        const mine = regs.filter((r) => r.eventId === e.id && r.status === "registered");
        const a = (cur.eventRegistrations || []).find((x) => x.key === e.id) || {};
        return { e, all: mine.length, came: mine.filter((r) => r.checkedIn).length, opens: a.opens || 0, online: a.registered || 0 };
      }).sort((x, y) => String(y.e.date).localeCompare(String(x.e.date)));
      const evCols = [
        ["Event", (r) => h("span", {}, [h("strong", { text: plain(r.e.name) }), h("span", { class: "an-path", text: r.e.date ? dayLabel(r.e.date, { day: "numeric", month: "short", year: "numeric" }) : "" })])],
        ["Tapped Register", (r) => fmt(r.opens), "num"], ["Registered online", (r) => fmt(r.online), "num"],
        ["All registrations", (r) => fmt(r.all), "num"], ["Checked in", (r) => fmt(r.came), "num"],
        ["Expected guests", (r) => (Number(r.e.expectedGuests) ? fmt(r.e.expectedGuests) : "—"), "num"],
        ["Places", (r) => (Number(r.e.capacity) ? fmt(r.e.capacity) : "—"), "num"],
        ["Progress", (r) => { const goal = Number(r.e.expectedGuests) || Number(r.e.capacity); return goal ? progress(r.all, goal) : "—"; }],
      ];
      const today = lagosDay(Date.now());
      const pickable = [...events].filter((e) => e.visible !== false).sort((a, b2) => String(a.date).localeCompare(String(b2.date)));
      const soonest = pickable.find((e) => (e.endDate || e.date) >= today) || pickable[pickable.length - 1];
      const eventSel = h("select", { class: "admin-select", "aria-label": "Event" }, pickable.map((e) => h("option", { value: e.id, selected: soonest && e.id === soonest.id }, `${plain(e.name)} · ${dayLabel(e.date, { day: "numeric", month: "short", year: "numeric" })}`)));
      const chartHost = h("div");
      const drawChart = () => { const e = pickable.find((x) => x.id === eventSel.value); chartHost.replaceChildren(e ? registrationsChart(e, regs) : h("p", { class: "an-empty", text: "No events yet." })); };
      eventSel.addEventListener("change", drawChart);
      drawChart();

      return [
        h("div", { class: "an-kpis" }, GOALS.map(([k, label]) => kpi(label, fmt(g[k] || 0)))),
        grid([
          card("Event registration", h("div", {}, [
            funnel([["Visited the Events page", f.events[0]], ["Tapped Register", f.events[1]], ["Registered", f.events[2]]]),
            h("p", { class: "an-card__sub", text: `Of the ${plural(madeNow.length, "registration")} made in this period, ${fmt(cameNow)} ${cameNow === 1 ? "has" : "have"} been checked in at the door so far.` }),
          ])),
          card("Talent Quest", funnel([["Visited the Symphony page", f.talent[0]], ["Started the application", f.talent[1]], ["Sent it", f.talent[2]]])),
          card("Booking requests", funnel([["Visited the Contact page", f.booking[0]], ["Started a booking", f.booking[1]], ["Sent it", f.booking[2]]])),
        ], "an-grid--3"),
        card("Registrations for each event", table(evCols, evRows), {
          wide: true,
          csv: csvButton("events", [["Event", (r) => plain(r.e.name)], ["Date", (r) => r.e.date], ["Tapped Register (this period)", (r) => r.opens],
            ["Registered online (this period)", (r) => r.online], ["All registrations", (r) => r.all], ["Checked in", (r) => r.came],
            ["Expected guests", (r) => r.e.expectedGuests || ""], ["Places", (r) => r.e.capacity || ""]], evRows),
          sub: "“Tapped Register” and “Registered online” are for this period; the rest are every registration so far, from the inbox, including people the team added.",
        }),
        card("Registrations so far", h("div", {}, [h("div", { class: "an-card__tools" }, [eventSel]), chartHost]), { wide: true, sub: "Registrations day by day, against the guests expected and the places." }),
        grid([
          card("Newsletter sign-ups by page", bars(cur.newsletterBy, { value: (n) => n.signups, label: (n) => pageName(n.key) })),
          card("Sign-ups by channel", bars([...cur.channels].filter((c) => c.conversions).sort((a, b2) => b2.conversions - a.conversions), {
            value: (c) => c.conversions, label: (c) => c.key, note: (c) => `${pct(c.converting, c.sessions)} of its visits signed up`,
          })),
        ]),
      ];
    },

    async health({ cur }) {
      const rating = (lcp) => {
        if (lcp == null) return "—";
        const [text, cls] = lcp <= 2500 ? ["Good", "confirmed"] : lcp <= 4000 ? ["Needs work", "invited"] : ["Slow", "new"];
        return h("span", { class: `status-pill status-pill--${cls}`, text });
      };
      const perfCols = [
        ["Device", (d) => cap(d.key)], ["Page loads", (d) => fmt(d.loads), "num"], ["Typical load", (d) => speed(d.median), "num"],
        ["Slowest quarter", (d) => speed(d.p75), "num"], ["Main content shown", (d) => speed(d.lcp), "num"], ["Rating", (d) => rating(d.lcp)],
      ];
      return [
        card("How fast pages load", table(perfCols, cur.perf), {
          sub: "“Typical” is the middle of all loads, and a quarter of loads took longer than “Slowest quarter”. “Main content shown” is when the biggest thing on screen appeared: under 2.5 seconds is good.",
        }),
        card("Slowest pages", table([["Page", (p) => pageName(p.key)], ["Page loads", (p) => fmt(p.loads), "num"], ["Typical load", (p) => speed(p.median), "num"]], cur.slowPages, { limit: 10 })),
        card("Errors visitors hit", table([
          ["Error", (e) => e.key], ["Times", (e) => fmt(e.n), "num"], ["Pages", (e) => fmt(e.pages), "num"], ["Last seen", (e) => Admin.timeAgo(e.last)],
        ], cur.errors, { empty: "No errors reported in this period." }), {
          csv: cur.errors.length ? csvButton("errors", [["Error", (e) => e.key], ["Times", (e) => e.n], ["Pages", (e) => e.pages], ["Last seen", (e) => e.last]], cur.errors) : null,
          sub: "Problems in visitors' browsers, so they can be fixed. At most three are counted per page view.",
        }),
      ];
    },
  };

  function startLive(panel, pill) {
    let timer = null;
    const tick = async () => {
      if (panel.hidden || !pill.isConnected) { clearInterval(timer); return; }
      try {
        const l = await Backend.analytics.live();
        pill.replaceChildren(h("span", { class: "an-live__dot", "aria-hidden": "true" }), `${plural(l.visitors, "visitor")} on the site now`);
        pill.title = l.pages && l.pages.length ? `Reading now: ${l.pages.map((p) => `${pageName(p.key)} (${p.visitors})`).join(", ")}` : "Visitors in the last five minutes";
      } catch (_) {
        pill.replaceChildren();
      }
    };
    timer = setInterval(tick, 30000);
    tick();
  }

  Admin.register("analytics", {
    async render(panel, sub) {
      const tab = TABS.some(([id]) => id === sub) ? sub : "overview";
      const title = head("Analytics", "Visits, and what people do on the site: counted anonymously, with no cookies and no names. Days and hours are Lagos time.");
      const rangeSel = h("select", { class: "admin-select", "aria-label": "Period" }, RANGES.map(([k, l]) => h("option", { value: k, selected: range.key === k }, l)));
      const fromIn = h("input", { type: "date", class: "admin-input an-date", "aria-label": "From", value: range.from || null });
      const toIn = h("input", { type: "date", class: "admin-input an-date", "aria-label": "To", value: range.to || null });
      const custom = h("span", { class: "an-custom", hidden: range.key !== "custom" }, [fromIn, h("span", { text: "to" }), toIn]);
      const note = h("span", { class: "an-range-note" });
      const live = h("span", { class: "an-live", role: "status" });
      const tabs = h("nav", { class: "an-tabs", "aria-label": "Analytics sections" }, TABS.map(([id, label]) => h("a", { href: `#analytics/${id}`, "aria-current": String(id === tab) }, label)));
      const sample = Backend.analytics.madeUp
        ? h("p", { class: "an-notice" }, [h("strong", { text: "Sample figures. " }), "In demo mode these screens mix made-up visits with the ones made in this browser, so every part has something to show. Live, only real visits count."])
        : null;
      const body = h("div", { class: "an-body" }, [loading("Counting…")]);
      panel.replaceChildren(...[title, sample, h("div", { class: "an-toolbar" }, [h("div", { class: "an-range" }, [rangeSel, custom, note]), live]), tabs, body].filter(Boolean));

      const draw = async () => {
        const b = bounds();
        note.textContent = rangeText(b);
        body.replaceChildren(loading("Counting…"));
        try {
          const data = await getReport(b);
          if (!body.isConnected) return;
          body.replaceChildren(...(await TAB_RENDER[tab](data)).filter(Boolean));
        } catch (err) {
          body.replaceChildren(h("p", { class: "admin-empty", text: friendlyError(err) }));
        }
      };
      rangeSel.addEventListener("change", () => {
        range = { ...range, key: rangeSel.value };
        if (range.key === "custom" && !(range.from && range.to)) {
          const b = bounds({ key: "30" });
          range.from = lagosDay(b.from);
          range.to = lagosDay(b.to - DAY);
          fromIn.value = range.from;
          toIn.value = range.to;
        }
        custom.hidden = range.key !== "custom";
        saveRange();
        draw();
      });
      [fromIn, toIn].forEach((input) => input.addEventListener("change", () => {
        if (!fromIn.value || !toIn.value) return;
        if (fromIn.value > toIn.value) { toast("The first date is after the second.", "is-error"); return; }
        range = { key: "custom", from: fromIn.value, to: toIn.value };
        saveRange();
        draw();
      }));
      startLive(panel, live);
      await draw();
    },
  });

  // The Dashboard: the last 30 days at a glance, and the next events.
  window.renderAnalyticsDashboard = async () => {
    const host = document.querySelector("[data-dash-analytics]");
    if (!host) return;
    host.replaceChildren(loading("Counting visits…"));
    try {
      const b = bounds({ key: "30" });
      const [{ cur, prev }, regs, events] = await Promise.all([getReport(b), Backend.forms.list("registrations").catch(() => []), currentEvents()]);
      const t = cur.totals;
      const p = prev.totals;
      const avg = (x) => (x.sessions ? x.engagedSeconds / x.sessions : 0);
      const days = daysOf(b.from, b.to);
      host.replaceChildren(...[
        h("div", { class: "an-dash__head" }, [h("p", { class: "attention__title", text: "The last 30 days" }), h("a", { class: "btn-line", href: "#analytics", text: "All the analytics" })]),
        Backend.analytics.madeUp ? h("p", { class: "an-notice", text: "Sample figures: in demo mode the analytics mix made-up visits with this browser's own." }) : null,
        h("div", { class: "an-kpis" }, [
          kpi("Visitors", fmt(t.visitors), { now: t.visitors, before: p.visitors }),
          kpi("Visits", fmt(t.sessions), { now: t.sessions, before: p.sessions }),
          kpi("Time per visit", secs(avg(t)), { now: avg(t), before: avg(p) }),
          kpi("Sign-ups", fmt(t.conversions), { now: t.conversions, before: p.conversions }),
        ]),
        grid([
          card("Visitors each day", lineChart(days, [
            { label: "Visitors", values: series(cur, days, "visitors"), area: true },
            { label: "The 30 days before", values: series(prev, daysOf(b.prevFrom, b.prevTo), "visitors") },
          ], { height: 200 })),
          card("Where visitors come from", bars(cur.channels, { value: (c) => c.sessions, label: (c) => c.key, total: t.sessions, limit: 6 })),
        ]),
        card("Upcoming events", pacing(events, regs), { sub: "Registrations so far, against the guests expected (set on each event under Events)." }),
      ].filter(Boolean));
    } catch (err) {
      host.replaceChildren(h("p", { class: "admin-empty", text: friendlyError(err) }));
    }
  };

  /* ===================================================================
   * Campaign links
   * =================================================================== */
  const SHARE_ON = [
    ["instagram", "Instagram", "social"], ["whatsapp", "WhatsApp", "messaging"], ["facebook", "Facebook", "social"],
    ["youtube", "YouTube", "social"], ["tiktok", "TikTok", "social"], ["x", "X (Twitter)", "social"],
    ["newsletter", "Email / newsletter", "email"], ["flyer", "Flyer or poster (QR code)", "qr"], ["sms", "Text message", "messaging"],
    ["radio", "Radio or TV", "broadcast"], ["church", "Church announcement", "announcement"], ["other", "Somewhere else", "referral"],
  ];
  const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60);
  const uid = () => `cl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function linkFor(l) {
    const u = new URL(l.destination || "", Backend.root);
    u.searchParams.set("utm_source", l.source);
    if (l.medium) u.searchParams.set("utm_medium", l.medium);
    u.searchParams.set("utm_campaign", l.campaign);
    return u.href;
  }

  let qrLoading = null;
  function loadQr() {
    if (window.QRCode) return Promise.resolve();
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
        s.onload = resolve;
        s.onerror = () => { qrLoading = null; reject(new Error("The QR code maker couldn't load. Check the connection and try again.")); };
        document.head.append(s);
      });
    }
    return qrLoading;
  }
  async function drawQr(host, text) {
    host.replaceChildren(loading("Making the QR code…"));
    try {
      await loadQr();
      host.replaceChildren();
      new window.QRCode(host, { text, width: 600, height: 600, colorDark: "#0a0908", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M });
    } catch (err) {
      host.replaceChildren(h("p", { class: "an-empty", text: err.message }));
    }
  }
  function saveQr(host, name) {
    const canvas = host.querySelector("canvas");
    const src = canvas ? canvas.toDataURL("image/png") : (host.querySelector("img") || {}).src;
    if (!src) { toast("Make the QR code first."); return; }
    const a = h("a", { href: src, download: `${slug(name) || "campaign"}-qr-code.png` });
    document.body.append(a);
    a.click();
    a.remove();
  }
  const copy = (text, what = "Link") => navigator.clipboard.writeText(text).then(() => toast(`${what} copied.`), () => dialog({
    title: "Copy this link", body: [h("p", { class: "cl-link", text })], actions: [["Done", true, "is-primary"]],
  }));

  async function destinations() {
    let pub = {};
    try { pub = await Backend.content.getPublished(); } catch (_) { pub = {}; }
    const events = (Array.isArray(pub.events) ? pub.events : DB.events).filter((e) => e.visible !== false && e.status !== "cancelled");
    const tracks = Array.isArray(pub.tracks) ? pub.tracks : DB.tracks;
    return [
      ["Pages", [["", "Homepage"], ["events", "Events"], ["symphony", "Symphony"], ["symphony#apply", "Talent Quest application form"], ["music", "Music"],
        ["media", "Media (videos and photos)"], ["ministry", "Ministry"], ["about", "About"], ["contact", "Contact"], ["contact#booking", "Booking form"]]],
      ["Register for an event", events.map((e) => [`events?register=${e.id}`, `${plain(e.name)} · ${e.date ? dayLabel(e.date, { day: "numeric", month: "short" }) : ""}`])],
      ["A song", tracks.map((t) => [`song?id=${t.id}`, plain(t.title) || t.id])],
    ];
  }
  const destinationName = (groups, dest) => {
    for (const [, opts] of groups) { const hit = opts.find(([v]) => v === dest); if (hit) return hit[1]; }
    return dest || "Homepage";
  };

  Admin.register("campaigns", {
    async render(panel, sub) {
      const title = head("Campaign links", "A link for each post, broadcast or flyer. Visits through it are counted under its campaign in the analytics, with what they led to: registrations, applications, bookings.");
      panel.replaceChildren(title, loading());
      let groups;
      let links;
      try {
        [groups, links] = await Promise.all([destinations(), Backend.analytics.campaigns.list()]);
      } catch (err) {
        panel.replaceChildren(title, h("p", { class: "admin-empty", text: friendlyError(err) }));
        return;
      }

      // The new link
      const name = h("input", { type: "text", class: "admin-input", placeholder: "e.g. Concert flyer, Lagos churches" });
      const dest = h("select", { class: "admin-select" }, [
        ...groups.map(([label, opts]) => h("optgroup", { label }, opts.map(([v, l]) => h("option", { value: v }, l)))),
        h("option", { value: "__other" }, "Another page on the site…"),
      ]);
      const otherDest = h("input", { type: "text", class: "admin-input", placeholder: "e.g. song?id=track-001", hidden: true });
      const shareOn = h("select", { class: "admin-select" }, SHARE_ON.map(([v, l]) => h("option", { value: v }, l)));
      const known = [...new Set(links.map((l) => l.campaign))];
      const campaign = h("input", { type: "text", class: "admin-input", placeholder: "e.g. spaw-2026", list: "cl-campaigns", autocomplete: "off" });
      const datalist = h("datalist", { id: "cl-campaigns" }, known.map((c) => h("option", { value: c })));
      const out = h("p", { class: "cl-link", "aria-live": "polite" });
      const qr = h("div", { class: "cl-qr", "aria-label": "QR code for the link" });
      const preset = decodeURIComponent(sub || "");
      if (preset) {
        const has = groups.some(([, opts]) => opts.some(([v]) => v === preset));
        if (has) dest.value = preset;
        else { dest.value = "__other"; otherDest.hidden = false; otherDest.value = preset; }
      }

      const current = () => {
        const source = shareOn.value;
        return {
          id: uid(),
          name: name.value.trim(),
          destination: (dest.value === "__other" ? otherDest.value.trim() : dest.value).replace(/^\/+/, ""),
          source,
          medium: (SHARE_ON.find(([v]) => v === source) || [])[2] || "",
          campaign: slug(campaign.value),
        };
      };
      let qrTimer = null;
      const refresh = () => {
        const l = current();
        if (!l.campaign) {
          out.textContent = "Give it a campaign name to make the link.";
          qr.replaceChildren(h("p", { class: "cl-qr__empty", text: "The QR code appears here once the link has a campaign name." }));
          return;
        }
        out.textContent = linkFor(l);
        clearTimeout(qrTimer);
        qrTimer = setTimeout(() => drawQr(qr, linkFor(l)), 250);
      };
      [name, dest, otherDest, shareOn, campaign].forEach((el) => el.addEventListener("input", refresh));
      dest.addEventListener("change", () => { otherDest.hidden = dest.value !== "__other"; refresh(); });
      shareOn.addEventListener("change", refresh);

      const field = (label, control, help) => h("label", { class: "admin-field" }, [h("span", { text: label }), control, help ? h("small", { text: help }) : null]);
      const save = h("button", { type: "button", class: "btn btn-solid" }, "Save the link");
      save.addEventListener("click", async () => {
        const l = current();
        if (!l.name) { toast("Give the link a name, so the team knows what it's for.", "is-error"); name.focus(); return; }
        if (!l.campaign) { toast("Give it a campaign name.", "is-error"); campaign.focus(); return; }
        save.disabled = true;
        try {
          await Backend.analytics.campaigns.save(l);
          toast("Saved. Copy the link or download the QR code to share it.", "is-success");
          if (location.hash.replace(/^#/, "") === "campaigns") this.render(panel, "");
          else Admin.go("#campaigns");
        } catch (err) {
          toast(friendlyError(err), "is-error");
        } finally {
          save.disabled = false;
        }
      });

      const form = h("div", { class: "an-card" }, [
        h("div", { class: "an-card__head" }, [h("div", {}, [h("h2", { class: "an-card__title", text: "Make a link" })])]),
        h("div", { class: "cl-layout" }, [
          h("div", { class: "cl-form" }, [
            field("What it's for", name),
            field("Opens", h("div", { class: "cl-dest" }, [dest, otherDest])),
            field("Shared on", shareOn),
            field("Campaign", h("div", {}, [campaign, datalist]), "Use one name for every link in the same push (the concert, the Talent Quest), so they add up together."),
            h("div", { class: "cl-result" }, [
              h("span", { class: "an-card__sub", text: "The link" }),
              out,
              h("div", { class: "pe-actions-row" }, [
                h("button", { type: "button", class: "pe-small-btn", onclick: () => { const l = current(); if (l.campaign) copy(linkFor(l)); } }, "Copy the link"),
                h("button", { type: "button", class: "pe-small-btn", onclick: () => saveQr(qr, current().name || current().campaign) }, "Download the QR code"),
                save,
              ]),
            ]),
          ]),
          qr,
        ]),
      ]);

      // Saved links, with how each did over the last 90 days
      const listHost = h("div", {}, [loading("Counting visits through each link…")]);
      const listCard = h("section", { class: "an-card" }, [
        h("div", { class: "an-card__head" }, [h("div", {}, [
          h("h2", { class: "an-card__title", text: "Your campaign links" }),
          h("p", { class: "an-card__sub", text: "Visits and sign-ups over the last 90 days." }),
        ])]),
        listHost,
      ]);
      panel.replaceChildren(title, form, listCard);
      refresh();

      if (!links.length) {
        listHost.replaceChildren(h("p", { class: "an-empty", text: "No campaign links yet. Make one above for your next post or flyer." }));
        return;
      }
      let perf = [];
      try { perf = (await getReport(bounds({ key: "90" }))).cur.campaigns || []; } catch (_) { perf = []; }
      const statsFor = (l) => perf.filter((r) => r.key === l.campaign && r.source === l.source && r.medium === (l.medium || ""))
        .reduce((a, r) => ({ sessions: a.sessions + r.sessions, conversions: a.conversions + r.conversions }), { sessions: 0, conversions: 0 });
      listHost.replaceChildren(table([
        ["Link", (l) => h("span", {}, [h("strong", { text: l.name }), h("span", { class: "an-path", text: `${l.campaign} · ${sourceName(l.source)}` })])],
        ["Opens", (l) => destinationName(groups, l.destination)],
        ["Visits", (l) => fmt(statsFor(l).sessions), "num"],
        ["Sign-ups", (l) => fmt(statsFor(l).conversions), "num"],
        ["Made", (l) => (l.createdAt ? Admin.timeAgo(l.createdAt) : "")],
        ["", (l) => h("div", { class: "pe-actions-row" }, [
          h("button", { type: "button", class: "pe-small-btn", onclick: () => copy(linkFor(l)) }, "Copy"),
          h("button", {
            type: "button", class: "pe-small-btn",
            onclick: async () => {
              const host = h("div", { class: "cl-qr" });
              drawQr(host, linkFor(l));
              const ok = await dialog({ title: l.name, body: [host, h("p", { class: "cl-link", text: linkFor(l) })], actions: [["Close", false], ["Download the QR code", true, "is-primary"]] });
              if (ok) saveQr(host, l.name);
            },
          }, "QR code"),
          h("button", {
            type: "button", class: "pe-small-btn is-danger",
            onclick: async () => {
              const ok = await dialog({
                title: `Remove “${l.name}”?`,
                body: [h("p", { text: "The link keeps working for anyone who has it, and its visits stay in the analytics. It just leaves this list." })],
                actions: [["Keep it", false], ["Remove", true, "is-danger"]],
              });
              if (!ok) return;
              try { await Backend.analytics.campaigns.remove(l.id); toast("Removed."); this.render(panel, ""); } catch (err) { toast(friendlyError(err), "is-error"); }
            },
          }, "Remove"),
        ])],
      ], links));
    },
  });

  Object.assign(Admin, { eventInsight, campaignLink: linkFor });
})();
