/**
 * videos.js
 * ----------------------------------------------------------------------
 * Drives videos.html: category filter pills, an editorial video grid,
 * and an immersive modal player. Reuses el/showLoading/etc. from app.js.
 * ----------------------------------------------------------------------
 */
let videoState = { category: "all" };

document.addEventListener("DOMContentLoaded", () => {
  renderCategoryPills();
  renderVideoGrid();
  wireModal();
  wireYear();
});

async function renderCategoryPills() {
  const wrap = document.querySelector("[data-video-categories]");
  if (!wrap) return;
  try {
    const categories = await api.getVideoCategories();
    const allPill = wrap.querySelector('[data-cat="all"]');
    categories.forEach((cat) => {
      const pill = el("button", { class: "filter-pill", type: "button", "data-cat": cat, aria: { pressed: "false" }, text: cat });
      pill.addEventListener("click", () => selectCategory(cat));
      wrap.appendChild(pill);
    });
    allPill?.addEventListener("click", () => selectCategory("all"));
  } catch (err) {
    console.error("[videos] categories failed", err);
  }
}

function selectCategory(cat) {
  videoState.category = cat;
  document.querySelectorAll("[data-video-categories] [data-cat]").forEach((p) => {
    p.setAttribute("aria-pressed", String(p.dataset.cat === cat));
  });
  renderVideoGrid();
}

async function renderVideoGrid() {
  const grid = document.querySelector("[data-video-grid]");
  if (!grid) return;
  showLoading(grid, "Loading videos\u2026");

  try {
    const videos = await api.getAllVideos(videoState);
    if (!videos.length) { showEmpty(grid, "No videos in this category yet."); return; }

    grid.replaceChildren(
      ...videos.map((v) => {
        const card = el("article", { class: "video-card", "data-video-src": v.videoSrc, "data-cursor-text": "WATCH", role: "button", tabindex: "0", aria: { label: `Play ${v.title}` } }, [
          el("div", { class: "video-card__frame" }, [
            el("img", { src: v.thumbnail, alt: `${v.title} thumbnail`, loading: "lazy" }),
            el("span", { class: "video-card__dur", text: formatDuration(v.duration) }),
          ]),
          el("div", { class: "video-card__meta" }, [
            el("p", { class: "video-card__cat", text: v.category }),
            el("h3", { class: "video-card__title", text: v.title }),
          ]),
        ]);
        return card;
      })
    );
  } catch (err) {
    console.error("[videos] grid failed", err);
    showError(grid, "Couldn't load videos.", renderVideoGrid);
  }
}

function wireModal() {
  const modal = document.querySelector("[data-video-modal]");
  const grid = document.querySelector("[data-video-grid]");
  if (!modal || !grid) return;
  const modalVideo = modal.querySelector("video");
  const closeBtn = modal.querySelector("[data-video-close]");
  let lastFocused = null;

  function open(src) {
    lastFocused = document.activeElement;
    modalVideo.src = src || "";
    modal.classList.add("is-open");
    modal.removeAttribute("hidden");
    document.body.classList.add("no-scroll");
    const attempt = modalVideo.play();
    if (attempt?.catch) attempt.catch(() => {});
    closeBtn.focus();
  }
  function close() {
    modal.classList.remove("is-open");
    modalVideo.pause();
    modalVideo.removeAttribute("src");
    modalVideo.load();
    document.body.classList.remove("no-scroll");
    setTimeout(() => modal.setAttribute("hidden", ""), 300);
    lastFocused?.focus();
  }

  grid.addEventListener("click", (e) => {
    const card = e.target.closest("[data-video-src]");
    if (card) open(card.dataset.videoSrc);
  });
  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-video-src]");
    if (card) { e.preventDefault(); open(card.dataset.videoSrc); }
  });
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("is-open")) close(); });
}
