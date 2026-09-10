/**
 * analytics.js
 * ----------------------------------------------------------------------
 * Renders the admin Dashboard/Analytics panel. Charts are built as plain
 * SVG (no charting dependency) from api.getAnalyticsSnapshot(), which
 * mirrors the shape a real analytics endpoint would return — swapping
 * the data source later doesn't touch this rendering code.
 * ----------------------------------------------------------------------
 */
const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function lineChart(series, { width = 560, height = 160, color = "#a91d2c" } = {}) {
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Line chart" });
  const max = Math.max(...series.map((d) => d.value)) * 1.15;
  const min = Math.min(...series.map((d) => d.value)) * 0.85;
  const stepX = width / (series.length - 1);

  const points = series.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d.value - min) / (max - min)) * height;
    return [x, y];
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  svg.appendChild(svgEl("path", { d: areaPath, fill: color, opacity: "0.08", stroke: "none" }));
  svg.appendChild(svgEl("path", { d: linePath, fill: "none", stroke: color, "stroke-width": "2" }));

  points.forEach((p, i) => {
    if (i === points.length - 1) {
      svg.appendChild(svgEl("circle", { cx: p[0], cy: p[1], r: "3.5", fill: color }));
    }
  });

  return svg;
}

function barChart(series, { width = 320, height = 160, color = "#a91d2c" } = {}) {
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Bar chart" });
  const max = Math.max(...series.map((d) => d.value)) * 1.1;
  const gap = 4;
  const barW = width / series.length - gap;

  series.forEach((d, i) => {
    const h = (d.value / max) * height;
    const x = i * (barW + gap);
    svg.appendChild(svgEl("rect", {
      x: x.toFixed(1), y: (height - h).toFixed(1), width: barW.toFixed(1), height: h.toFixed(1),
      fill: color, opacity: i === series.length - 1 ? "1" : "0.55",
    }));
  });

  return svg;
}

function renderRankedList(container, items, valueKey, labelKey) {
  const max = Math.max(...items.map((i) => i[valueKey]));
  container.replaceChildren(
    ...items.map((item) =>
      el("div", { class: "chart-list__row" }, [
        el("span", { text: item[labelKey] }),
        el("span", { text: item[valueKey].toLocaleString() }),
        el("div", { class: "chart-list__bar" }, [
          el("span", { style: `width:${Math.round((item[valueKey] / max) * 100)}%` }),
        ]),
      ])
    )
  );
}

async function renderAnalyticsDashboard() {
  const root = document.querySelector("[data-panel='dashboard']");
  if (!root) return;

  const statsWrap = root.querySelector("[data-stat-cards]");
  const visitorsChart = root.querySelector("[data-chart-visitors]");
  const pageviewsChart = root.querySelector("[data-chart-pageviews]");
  const topSongsList = root.querySelector("[data-chart-topsongs]");
  const videoEngagementList = root.querySelector("[data-chart-videos]");
  const eventStatsWrap = root.querySelector("[data-chart-events]");

  try {
    const snap = await api.getAnalyticsSnapshot();
    const registrations = await api.getRegistrations();
    const applications = await api.getTalentApplications();
    const enquiries = await api.getEnquiries();
    const bookings = enquiries.filter((e) => e.type === "booking");

    const totalVisitors = snap.visitors.reduce((sum, d) => sum + d.value, 0);
    const totalViews = snap.pageViews.reduce((sum, d) => sum + d.value, 0);

    if (statsWrap) {
      statsWrap.replaceChildren(
        statCard("Visitors (14 days)", totalVisitors.toLocaleString(), "+12.4% vs prior period", "up"),
        statCard("Page views (14 days)", totalViews.toLocaleString(), "+8.1% vs prior period", "up"),
        statCard("Event registrations", registrations.length.toLocaleString(), `${DB.events.length} live events`, null),
        statCard("Talent applications", applications.length.toLocaleString(), "Symphony 2026 cohort", null),
        statCard("Contact & bookings", enquiries.length.toLocaleString(), `${bookings.length} booking request${bookings.length === 1 ? "" : "s"}`, null)
      );
    }

    if (visitorsChart) visitorsChart.replaceChildren(lineChart(snap.visitors));
    if (pageviewsChart) pageviewsChart.replaceChildren(barChart(snap.pageViews.slice(-7)));
    if (topSongsList) renderRankedList(topSongsList, snap.topSongs, "plays", "title");
    if (videoEngagementList) renderRankedList(videoEngagementList, snap.videoEngagement, "views", "title");

    if (eventStatsWrap) {
      eventStatsWrap.replaceChildren(
        ...snap.eventStats.map((e) => {
          const pct = Math.round((e.registered / e.capacity) * 100);
          return el("div", { class: "chart-list__row" }, [
            el("span", { text: e.name }),
            el("span", { text: `${e.registered}/${e.capacity}` }),
            el("div", { class: "chart-list__bar" }, [el("span", { style: `width:${pct}%` })]),
          ]);
        })
      );
    }
  } catch (err) {
    console.error("[analytics] dashboard failed", err);
    if (statsWrap) showError(statsWrap, "Couldn't load analytics.", renderAnalyticsDashboard);
  }
}

function statCard(label, value, delta, trend) {
  return el("div", { class: "stat-card" }, [
    el("p", { class: "stat-card__label", text: label }),
    el("p", { class: "stat-card__value", text: value }),
    el("p", { class: "stat-card__delta", text: delta, "data-trend": trend || "" }),
  ]);
}

window.renderAnalyticsDashboard = renderAnalyticsDashboard;
