/**
 * media.js
 * ----------------------------------------------------------------------
 * Drives media.html — one page for everything you can watch or look at.
 *
 * "Watch" is the video library: category pills, an editorial grid and a
 * modal player, carried over unchanged from the old videos page.
 * "See" is the photography: one gallery per event, in the order the
 * night happened, opened in a lightbox with keyboard, swipe and focus
 * handling. A type switch at the top narrows the page to either one.
 * Reuses el/showLoading/showError/showEmpty/formatDuration from app.js.
 * ----------------------------------------------------------------------
 */
let videoState = { category: "all" };
let lightboxItems = []; // every photo on the page, flattened, in page order

document.addEventListener("DOMContentLoaded", () => {
  wireTypeSwitch();
  renderCategoryPills();
  renderVideoGrid();
  wireModal();
  renderGalleries();
  wireLightbox();
  wireYear();
});

/* ---------------------------------------------------------------------
 * Type switch — Everything / Videos / Photos
 * ------------------------------------------------------------------- */
function wireTypeSwitch() {
  const pills = Array.from(document.querySelectorAll("[data-media-type]"));
  const sections = Array.from(document.querySelectorAll("[data-media-section]"));
  if (!pills.length || !sections.length) return;

  function show(type) {
    pills.forEach((p) => p.setAttribute("aria-pressed", String(p.dataset.mediaType === type)));
    sections.forEach((s) => { s.hidden = type !== "all" && s.dataset.mediaSection !== type; });
  }

  pills.forEach((p) => p.addEventListener("click", () => show(p.dataset.mediaType)));

  // The hero's Watch / See links must never scroll to a section the switch
  // has hidden, so following one resets the page to Everything first. This
  // runs on the link itself, ahead of the site-wide smooth-scroll handler.
  document.querySelectorAll('a[href="#watch"], a[href="#see"]').forEach((a) => {
    a.addEventListener("click", () => show("all"));
  });
}

/* ---------------------------------------------------------------------
 * Watch — video library
 * ------------------------------------------------------------------- */
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
    console.error("[media] categories failed", err);
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
  showLoading(grid, "Loading videos…");

  try {
    const videos = await api.getAllVideos(videoState);
    if (!videos.length) { showEmpty(grid, "No videos in this category yet."); return; }

    grid.replaceChildren(
      ...videos.map((v) =>
        el("article", { class: "video-card", "data-video-src": v.videoSrc, "data-cursor-text": "WATCH", role: "button", tabindex: "0", aria: { label: `Play ${v.title}` } }, [
          el("div", { class: "video-card__frame" }, [
            el("img", { src: v.thumbnail, alt: `${v.title} thumbnail`, loading: "lazy" }),
            el("span", { class: "video-card__dur", text: formatDuration(v.duration) }),
          ]),
          el("div", { class: "video-card__meta" }, [
            el("p", { class: "video-card__cat", text: v.category }),
            el("h3", { class: "video-card__title", text: v.title }),
          ]),
        ])
      )
    );
  } catch (err) {
    console.error("[media] video grid failed", err);
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

/* ---------------------------------------------------------------------
 * See — photo galleries
 * ------------------------------------------------------------------- */
async function renderGalleries() {
  const wrap = document.querySelector("[data-gallery-list]");
  if (!wrap) return;
  showLoading(wrap, "Loading photographs…");

  try {
    const galleries = await api.getGalleries();
    if (!galleries.length) {
      showEmpty(wrap, "Photographs from the next event will be posted here.");
      return;
    }

    lightboxItems = [];
    wrap.replaceChildren(
      ...galleries.map((g) => {
        const cards = g.photos.map((p) => {
          const index = lightboxItems.push({ ...p, gallery: g.title, event: g.event, credit: g.credit }) - 1;
          return el("button", {
            class: "photo-card",
            type: "button",
            "data-photo-index": String(index),
            "data-cursor-text": "VIEW",
            aria: { label: `Open photograph: ${p.caption}` },
          }, [
            el("img", { src: p.src, alt: p.alt, loading: "lazy", decoding: "async" }),
            el("span", { class: "photo-card__caption", text: p.caption, aria: { hidden: "true" } }),
          ]);
        });

        return el("article", { class: "gallery" }, [
          el("header", { class: "gallery__head" }, [
            el("div", {}, [
              el("p", { class: "eyebrow", text: g.event }),
              el("h3", { class: "gallery__title display", text: g.title }),
            ]),
            el("p", { class: "gallery__meta", text: `${g.photos.length} photographs · ${g.credit}` }),
          ]),
          el("div", { class: "photo-grid" }, cards),
        ]);
      })
    );
  } catch (err) {
    console.error("[media] galleries failed", err);
    showError(wrap, "Couldn't load the photographs.", renderGalleries);
  }
}

function wireLightbox() {
  const box = document.querySelector("[data-lightbox]");
  const list = document.querySelector("[data-gallery-list]");
  if (!box || !list) return;

  const img = box.querySelector("[data-lightbox-img]");
  const caption = box.querySelector("[data-lightbox-caption]");
  const meta = box.querySelector("[data-lightbox-meta]");
  const count = box.querySelector("[data-lightbox-count]");
  const closeBtn = box.querySelector("[data-lightbox-close]");
  const prevBtn = box.querySelector("[data-lightbox-prev]");
  const nextBtn = box.querySelector("[data-lightbox-next]");
  let index = 0;
  let lastFocused = null;

  const wrapIndex = (i) => (i + lightboxItems.length) % lightboxItems.length;

  // Warm the neighbours so stepping through the set never waits on a load.
  function preload(i) {
    const item = lightboxItems[wrapIndex(i)];
    if (item) { const warm = new Image(); warm.src = item.src; }
  }

  function show(i) {
    if (!lightboxItems.length) return;
    index = wrapIndex(i);
    const item = lightboxItems[index];

    // Replay the fade on every change, not only the first open.
    box.classList.remove("is-swapping");
    void box.offsetWidth;
    box.classList.add("is-swapping");

    img.src = item.src;
    img.alt = item.alt;
    caption.textContent = item.caption;
    meta.textContent = `${item.event} · ${item.gallery} · Photograph: ${item.credit}`;
    count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(lightboxItems.length).padStart(2, "0")}`;
    preload(index + 1);
    preload(index - 1);
  }

  function open(i) {
    lastFocused = document.activeElement;
    show(i);
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add("is-open"));
    document.body.classList.add("no-scroll");
    closeBtn.focus();
  }

  function close() {
    box.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    setTimeout(() => { box.hidden = true; }, 300);
    lastFocused?.focus();
  }

  // Keep keyboard focus inside the open viewer.
  function trapFocus(e) {
    const focusables = [closeBtn, prevBtn, nextBtn];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  img.addEventListener("error", () => {
    caption.textContent = "This photograph couldn't be loaded.";
  });

  list.addEventListener("click", (e) => {
    const card = e.target.closest("[data-photo-index]");
    if (card) open(Number(card.dataset.photoIndex));
  });
  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", () => show(index - 1));
  nextBtn.addEventListener("click", () => show(index + 1));
  box.addEventListener("click", (e) => { if (e.target === box) close(); });

  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") show(index + 1);
    else if (e.key === "ArrowLeft") show(index - 1);
    else if (e.key === "Tab") trapFocus(e);
  });

  let touchX = null;
  box.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });
}
