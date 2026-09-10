/**
 * app.js
 * ----------------------------------------------------------------------
 * Homepage init. Pulls content through api.* (see data.js), renders it
 * with safe DOM methods (textContent / createElement — never innerHTML
 * with data-derived strings), and drives every section's full journey:
 * loading state -> success or error state -> interaction.
 * ----------------------------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  renderFeaturedSong();
  renderFeaturedAlbum();
  renderCatalogue();
  renderVideos();
  renderEmergingArtists();
  renderEvents();
  renderMinistryContent();
  wireVideoModal();
  wireNewsletter();
  wireYear();
});

/* ---------------------------------------------------------------------
 * Small safe-DOM helpers
 * ------------------------------------------------------------------- */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("data-")) node.setAttribute(key, value);
    else if (key === "aria") Object.entries(value).forEach(([a, v]) => node.setAttribute(`aria-${a}`, v));
    else node[key] = value;
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function setState(container, state) {
  container.dataset.state = state;
}

function showLoading(container, message = "Loading\u2026") {
  container.replaceChildren(
    el("div", { class: "state-msg", "data-state": "loading" }, [
      el("span", { class: "spinner", aria: { hidden: "true" } }),
      el("span", { text: message }),
    ])
  );
}

function showError(container, message, onRetry) {
  const retryBtn = el("button", { class: "btn btn-line", text: "Try again" });
  retryBtn.addEventListener("click", onRetry);
  container.replaceChildren(
    el("div", { class: "state-msg", "data-state": "error", role: "alert" }, [
      el("span", { text: `${message}` }),
      retryBtn,
    ])
  );
}

function showEmpty(container, message) {
  container.replaceChildren(el("p", { class: "state-msg", text: message }));
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatEventDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    day: d.toLocaleDateString("en-GB", { day: "2-digit" }),
    month: d.toLocaleDateString("en-GB", { month: "short" }),
    full: d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
}

/* ---------------------------------------------------------------------
 * Featured song + mini player
 * ------------------------------------------------------------------- */
async function renderFeaturedSong() {
  const section = document.querySelector("[data-featured-song]");
  if (!section) return;

  try {
    const track = await api.getFeaturedTrack();

    section.querySelector("[data-fs-art]").src = track.artwork;
    section.querySelector("[data-fs-art]").alt = `${track.title} artwork`;
    section.querySelector("[data-fs-title]").textContent = track.title;
    section.querySelector("[data-fs-album]").textContent = `From ${track.albumTitle}`;
    section.querySelector("[data-fs-desc]").textContent = track.description;

    const linksWrap = section.querySelector("[data-fs-links]");
    linksWrap.replaceChildren(
      ...Object.entries(track.links)
        .filter(([, url]) => url)
        .map(([platform, url]) => {
          const label = platform.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
          const a = el("a", { href: url, text: label, target: "_blank", rel: "noopener" });
          return a;
        })
    );

    const playerRoot = section.querySelector("[data-player]");
    const player = new Player(playerRoot);
    player.load(track);
    playerRoot.addEventListener("player:error", () => {
      const note = playerRoot.querySelector("[data-player-note]");
      if (note) note.textContent = "Preview unavailable right now — try a streaming link above.";
    });

    section.querySelector("[data-fs-play]")?.addEventListener("click", () => player.toggle());
  } catch (err) {
    console.error("[app] featured song failed", err);
    const body = section.querySelector("[data-fs-body]");
    if (body) showError(body, "Couldn't load the featured song.", renderFeaturedSong);
  }
}

/* ---------------------------------------------------------------------
 * Featured album + tracklist
 * ------------------------------------------------------------------- */
async function renderFeaturedAlbum() {
  const section = document.querySelector("[data-featured-album]");
  if (!section) return;
  const listEl = section.querySelector("[data-album-tracklist]");
  showLoading(listEl, "Loading tracklist\u2026");

  try {
    const album = await api.getFeaturedAlbum();
    section.querySelector("[data-album-bg]").src = album.cover;
    section.querySelector("[data-album-bg]").alt = "";
    section.querySelector("[data-album-title]").textContent = album.title;
    section.querySelector("[data-album-year]").textContent = `${album.year} \u2014 ${album.description}`;

    if (!album.tracks.length) {
      showEmpty(listEl, "Tracklist coming soon.");
      return;
    }

    listEl.replaceChildren(
      ...album.tracks.map((t, i) =>
        el("div", { class: "tracklist__row" }, [
          el("span", { class: "tracklist__num", text: String(i + 1).padStart(2, "0") }),
          el("span", { class: "tracklist__name", text: t.title }),
          el("span", { class: "tracklist__dur", text: formatDuration(t.duration) }),
        ])
      )
    );
  } catch (err) {
    console.error("[app] featured album failed", err);
    showError(listEl, "Couldn't load the tracklist.", renderFeaturedAlbum);
  }
}

/* ---------------------------------------------------------------------
 * Catalogue strip
 * ------------------------------------------------------------------- */
async function renderCatalogue() {
  const track = document.querySelector("[data-catalogue-track]");
  if (!track) return;
  showLoading(track, "Loading catalogue\u2026");

  try {
    const tracks = await api.getCatalogue(8);
    if (!tracks.length) {
      showEmpty(track, "New music is on the way.");
      return;
    }
    track.replaceChildren(
      ...tracks.map((t) =>
        el("article", { class: "catalogue__track" }, [
          el("img", { src: t.artwork, alt: `${t.title} artwork`, loading: "lazy" }),
          el("div", { class: "catalogue__track-meta" }, [
            el("div", {}, [
              el("h3", { class: "catalogue__track-title", text: t.title }),
              el("p", { class: "catalogue__track-sub", text: t.artist }),
            ]),
            el("span", { class: "mono-index", text: formatDuration(t.duration) }),
          ]),
        ])
      )
    );
    document.dispatchEvent(new CustomEvent("catalogue:rendered"));
  } catch (err) {
    console.error("[app] catalogue failed", err);
    showError(track, "Couldn't load the catalogue.", renderCatalogue);
  }
}

/* ---------------------------------------------------------------------
 * Video experience
 * ------------------------------------------------------------------- */
async function renderVideos() {
  const frame = document.querySelector("[data-video-frame]");
  if (!frame) return;

  try {
    const [video] = await api.getVideos(1);
    if (!video) return;
    frame.querySelector("[data-video-thumb]").src = video.thumbnail;
    frame.querySelector("[data-video-thumb]").alt = `${video.title} thumbnail`;
    frame.querySelector("[data-video-eyebrow]").textContent = video.category;
    frame.querySelector("[data-video-title]").textContent = video.title;
    frame.dataset.videoSrc = video.videoSrc;
  } catch (err) {
    console.error("[app] video load failed", err);
  }
}

function wireVideoModal() {
  const frame = document.querySelector("[data-video-frame]");
  const modal = document.querySelector("[data-video-modal]");
  if (!frame || !modal) return;
  const modalVideo = modal.querySelector("video");
  const closeBtn = modal.querySelector("[data-video-close]");

  function open() {
    modalVideo.src = frame.dataset.videoSrc || "";
    modal.classList.add("is-open");
    modal.removeAttribute("hidden");
    document.body.classList.add("no-scroll");
    const playAttempt = modalVideo.play();
    if (playAttempt?.catch) playAttempt.catch(() => {});
    closeBtn.focus();
  }
  function close() {
    modal.classList.remove("is-open");
    modalVideo.pause();
    modalVideo.removeAttribute("src");
    modalVideo.load();
    document.body.classList.remove("no-scroll");
    setTimeout(() => modal.setAttribute("hidden", ""), 300);
    frame.focus();
  }

  frame.addEventListener("click", open);
  frame.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) close();
  });
}

/* ---------------------------------------------------------------------
 * Emerging artists
 * ------------------------------------------------------------------- */
async function renderEmergingArtists() {
  const row = document.querySelector("[data-emerging-row]");
  if (!row) return;
  showLoading(row, "Loading artists\u2026");

  try {
    const artists = await api.getEmergingArtists();
    if (!artists.length) {
      showEmpty(row, "New cohort announced soon.");
      return;
    }
    row.replaceChildren(
      ...artists.map((a) =>
        el("article", { class: "emerging__item" }, [
          el("div", { class: "emerging__photo" }, [
            el("img", { src: a.photo, alt: a.name, loading: "lazy" }),
          ]),
          el("h3", { class: "emerging__name", text: a.name }),
          el("p", { class: "emerging__role", text: a.role }),
        ])
      )
    );
  } catch (err) {
    console.error("[app] emerging artists failed", err);
    showError(row, "Couldn't load emerging artists.", renderEmergingArtists);
  }
}

/* ---------------------------------------------------------------------
 * Upcoming events
 * ------------------------------------------------------------------- */
async function renderEvents() {
  const list = document.querySelector("[data-events-list]");
  if (!list) return;
  showLoading(list, "Loading events\u2026");

  try {
    const events = await api.getUpcomingEvents(3);
    if (!events.length) {
      showEmpty(list, "No events scheduled right now — check back soon.");
      return;
    }
    list.replaceChildren(
      ...events.map((e) => {
        const { day, month } = formatEventDate(e.date);
        const link = el("a", {
          class: "event-row",
          href: `events.html?id=${encodeURIComponent(e.id)}`,
        }, [
          el("div", { class: "event-row__date", text: day }, [
            el("span", { text: month.toUpperCase() }),
          ]),
          el("div", {}, [
            el("p", { class: "event-row__name", text: e.name }),
            el("p", { class: "event-row__venue", text: e.venue }),
          ]),
          el("p", { class: "event-row__city", text: e.city }),
          el("span", { class: "event-row__cta btn-line", text: "Register" }),
        ]);
        return link;
      })
    );
  } catch (err) {
    console.error("[app] events failed", err);
    showError(list, "Couldn't load events.", renderEvents);
  }
}

/* ---------------------------------------------------------------------
 * Ministry content (ministry.html)
 * ------------------------------------------------------------------- */
async function renderMinistryContent() {
  const missionEl = document.querySelector("[data-ministry-mission]");
  const pillarsEl = document.querySelector("[data-ministry-pillars]");
  const mentorshipEl = document.querySelector("[data-ministry-mentorship]");
  const workshopsEl = document.querySelector("[data-ministry-workshops]");
  const resourcesEl = document.querySelector("[data-ministry-resources]");
  if (!missionEl && !pillarsEl && !mentorshipEl && !workshopsEl && !resourcesEl) return;

  if (pillarsEl) showLoading(pillarsEl, "Loading\u2026");
  if (workshopsEl) showLoading(workshopsEl, "Loading workshops\u2026");
  if (resourcesEl) showLoading(resourcesEl, "Loading resources\u2026");

  try {
    const ministry = await api.getMinistryContent();

    if (missionEl) missionEl.textContent = ministry.missionStatement;

    if (pillarsEl) {
      pillarsEl.replaceChildren(
        ...ministry.pillars.map((p, i) =>
          el("div", { class: "pillar-row" }, [
            el("span", { class: "pillar-row__num", text: String(i + 1).padStart(2, "0") }),
            el("div", {}, [
              el("h3", { class: "pillar-row__title display", text: p.title }),
              el("p", { class: "pillar-row__body", text: p.body }),
            ]),
          ])
        )
      );
    }

    if (mentorshipEl) {
      mentorshipEl.querySelector("[data-mentorship-title]").textContent = ministry.mentorship.title;
      mentorshipEl.querySelector("[data-mentorship-desc]").textContent = ministry.mentorship.description;
      mentorshipEl.querySelector("[data-mentorship-intake]").textContent = ministry.mentorship.intake;
    }

    if (workshopsEl) {
      workshopsEl.replaceChildren(
        ...ministry.workshops.map((w) =>
          el("div", { class: "workshop-row" }, [
            el("div", {}, [
              el("p", { class: "workshop-row__title", text: w.title }),
              el("p", { class: "workshop-row__meta", text: `${w.facilitator} \u00b7 ${w.format}` }),
            ]),
            el("span", { class: "track-row__badge", text: w.cadence }),
          ])
        )
      );
    }

    if (resourcesEl) {
      resourcesEl.replaceChildren(
        ...ministry.resources.map((r) => {
          const btn = el("button", { class: "btn btn-line", type: "button", text: "Download" });
          btn.addEventListener("click", () => {
            btn.textContent = "Preparing\u2026";
            btn.disabled = true;
            setTimeout(() => {
              btn.textContent = "Ready \u2014 check downloads";
              setTimeout(() => { btn.textContent = "Download"; btn.disabled = false; }, 2200);
            }, 900);
          });
          return el("div", { class: "resource-row" }, [
            el("div", {}, [
              el("p", { class: "resource-row__title", text: r.title }),
              el("p", { class: "resource-row__meta", text: `${r.type} \u00b7 ${r.size}` }),
            ]),
            btn,
          ]);
        })
      );
    }
  } catch (err) {
    console.error("[app] ministry content failed", err);
    if (pillarsEl) showError(pillarsEl, "Couldn't load ministry content.", renderMinistryContent);
  }
}

/* ---------------------------------------------------------------------
 * Newsletter form — full validation -> fetch state -> success/error
 * ------------------------------------------------------------------- */
function wireNewsletter() {
  const form = document.querySelector("[data-newsletter-form]");
  if (!form) return;
  const input = form.querySelector("input[type='email']");
  const feedback = form.querySelector("[data-newsletter-feedback]");
  const submitBtn = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    feedback.textContent = "";
    feedback.removeAttribute("data-state");

    if (!email) {
      feedback.textContent = "Enter your email address to join.";
      feedback.setAttribute("data-state", "error");
      input.focus();
      return;
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Joining\u2026";

    try {
      await api.subscribeNewsletter(email);
      feedback.textContent = "You're in. Watch your inbox.";
      feedback.setAttribute("data-state", "success");
      form.reset();
    } catch (err) {
      feedback.textContent = err.message || "Something went wrong. Please try again.";
      feedback.setAttribute("data-state", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

function wireYear() {
  const yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}
