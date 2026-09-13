/**
 * hero.js
 * ----------------------------------------------------------------------
 * The homepage hero slideshow.
 *
 * Signature transition — the "stage slat" shutter. Each slide's image is
 * rebuilt at runtime as N vertical slats, every slat holding its own
 * strip of the picture (an <img> sized to the full stage and offset, so
 * object-fit: cover is preserved and nothing distorts). On a change the
 * slats travel in one continuous direction: the outgoing set keeps
 * moving the way the incoming set arrived, alternating up/down like
 * theatre flats, with a per-slat delay that reads as a wipe. A gold
 * light-sweep crosses the frame on the same beat.
 *
 * All motion is CSS (class toggles + custom properties) so it survives a
 * failed GSAP CDN load. prefers-reduced-motion drops to a plain cross
 * fade and disables autoplay entirely.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  const root = document.querySelector("[data-hero-slider]");
  if (!root) return;

  const slides = Array.from(root.querySelectorAll("[data-hero-slide]"));
  if (!slides.length) return;

  const railItems = Array.from(root.querySelectorAll("[data-hero-rail] li"));
  const sweep = root.querySelector("[data-hero-sweep]");
  const liveRegion = root.querySelector("[data-hero-live]");
  const toggleBtn = root.querySelector("[data-hero-toggle]");
  const toggleLabel = root.querySelector("[data-hero-toggle-label]");

  // Claim the hero for JS straight away. Until this lands, CSS shows the
  // first slide statically from its own background image, so a blocked or
  // failed script leaves a readable hero rather than a black rectangle.
  root.classList.add("is-ready");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const AUTOPLAY_MS = 7000;
  const TRANSITION_MS = reducedMotion ? 400 : 1500;

  let index = 0;
  let timer = null;
  let busy = false;
  let paused = reducedMotion;      // reduced motion never auto-advances
  let pausedByPointer = false;
  let pausedBySheet = false;       // a SPAW "See more" sheet is open
  let started = false;

  /* -------------------------------------------------------------------
   * Slat construction — rebuilt on breakpoint change so the slat count
   * suits the viewport (a phone with seven slats reads as noise).
   * ----------------------------------------------------------------- */
  function slatCount() {
    const w = window.innerWidth;
    if (w <= 680) return 4;
    if (w <= 1024) return 5;
    return 7;
  }

  function buildSlats() {
    const n = slatCount();
    slides.forEach((slide) => {
      const holder = slide.querySelector("[data-hero-slats]");
      if (!holder) return;
      if (Number(holder.dataset.built) === n) return;

      holder.dataset.built = String(n);
      holder.style.setProperty("--n", String(n));

      const src = slide.dataset.heroImage;
      const focus = slide.dataset.heroFocus || "center";
      const frag = document.createDocumentFragment();

      for (let i = 0; i < n; i += 1) {
        const slat = document.createElement("div");
        slat.className = "hero-slat";
        slat.style.setProperty("--i", String(i));

        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        img.decoding = "async";
        // Only the first slide is above the fold on load; the rest wait.
        img.loading = slide === slides[0] ? "eager" : "lazy";
        img.style.objectPosition = focus;

        slat.appendChild(img);
        frag.appendChild(slat);
      }
      holder.replaceChildren(frag);
    });
  }

  /* -------------------------------------------------------------------
   * Rail progress — restarted by hand, because re-adding a class alone
   * will not replay a CSS animation that is already running.
   * ----------------------------------------------------------------- */
  function restartRail(item) {
    const fill = item ? item.querySelector(".hero__rail-fill") : null;
    if (!fill) return;
    fill.style.animation = "none";
    void fill.offsetWidth; // force reflow so the animation re-runs
    fill.style.animation = "";
  }

  function fireSweep() {
    if (!sweep || reducedMotion) return;
    sweep.classList.remove("is-firing");
    void sweep.offsetWidth;
    sweep.classList.add("is-firing");
  }

  // The SPAW slides hold a desktop and a phone headline; announce the one
  // actually on screen.
  function slideLabel(slide) {
    const titles = Array.from(slide.querySelectorAll(".hero__title, .hero__spaw"));
    const title = titles.find((t) => t.getClientRects().length) || titles[0];
    return title ? title.textContent.replace(/\s+/g, " ").trim() : "";
  }

  /* -------------------------------------------------------------------
   * Transition
   * ----------------------------------------------------------------- */
  function go(next, direction = 1) {
    const total = slides.length;
    const target = ((next % total) + total) % total;
    if (busy || target === index) return;

    busy = true;
    const outgoing = slides[index];
    const incoming = slides[target];

    // Direction flips which way every slat travels, so stepping back
    // feels like the same mechanism run in reverse, not a second effect.
    incoming.style.setProperty("--dir", String(direction));
    outgoing.style.setProperty("--dir", String(direction));

    // Park the incoming slats off-frame with transitions suppressed,
    // flush layout, then release them so they animate home.
    incoming.classList.add("is-preload");
    void incoming.offsetWidth;
    incoming.classList.remove("is-preload");

    incoming.classList.add("is-active", "is-entering");
    incoming.removeAttribute("aria-hidden");
    outgoing.classList.remove("is-active");
    outgoing.classList.add("is-leaving");
    outgoing.setAttribute("aria-hidden", "true");

    fireSweep();

    railItems.forEach((item, i) => {
      item.classList.toggle("is-current", i === target);
      const btn = item.querySelector("button");
      if (btn) btn.setAttribute("aria-current", String(i === target));
    });
    restartRail(railItems[target]);

    if (liveRegion) {
      liveRegion.textContent = `Slide ${target + 1} of ${total}: ${slideLabel(incoming)}`;
    }

    index = target;

    window.setTimeout(() => {
      outgoing.classList.remove("is-leaving");
      incoming.classList.remove("is-entering");
      busy = false;
    }, TRANSITION_MS);

    schedule();
  }

  const next = () => go(index + 1, 1);
  const prev = () => go(index - 1, -1);

  /* -------------------------------------------------------------------
   * Autoplay
   * ----------------------------------------------------------------- */
  function schedule() {
    window.clearTimeout(timer);
    if (paused || pausedByPointer || pausedBySheet || !started || slides.length < 2) return;
    timer = window.setTimeout(next, AUTOPLAY_MS);
  }

  function syncPausedClass() {
    root.classList.toggle("is-paused", paused || pausedByPointer || pausedBySheet);
  }

  function setPaused(value) {
    paused = value;
    syncPausedClass();
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-pressed", String(paused));
      toggleBtn.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
    }
    if (toggleLabel) toggleLabel.textContent = paused ? "Play" : "Pause";
    schedule();
  }

  function setPointerPause(value) {
    pausedByPointer = value;
    syncPausedClass();
    schedule();
  }

  /* -------------------------------------------------------------------
   * Wiring
   * ----------------------------------------------------------------- */
  buildSlats();
  slides.forEach((slide, i) => {
    slide.classList.toggle("is-active", i === 0);
    if (i !== 0) slide.setAttribute("aria-hidden", "true");
  });
  railItems.forEach((item, i) => {
    item.classList.toggle("is-current", i === 0);
    const btn = item.querySelector("button");
    if (btn) btn.setAttribute("aria-current", String(i === 0));
  });

  root.style.setProperty("--hero-dur", `${AUTOPLAY_MS}ms`);
  if (reducedMotion) root.classList.add("is-static");

  root.querySelector("[data-hero-next]")?.addEventListener("click", next);
  root.querySelector("[data-hero-prev]")?.addEventListener("click", prev);
  root.querySelectorAll("[data-hero-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = Number(btn.dataset.heroGoto);
      go(target, target > index ? 1 : -1);
    });
  });

  if (reducedMotion) {
    toggleBtn?.setAttribute("hidden", "");
  } else {
    toggleBtn?.addEventListener("click", () => setPaused(!paused));
  }

  // Hold the slide only while a mouse is on the controls, or while someone
  // is tabbing through the hero by keyboard. Not on any hover: the hero
  // fills the viewport, so on desktop the pointer almost always sits over
  // it and autoplay would never run. Not on plain focus either: a mouse
  // click focuses the button it hits, which would freeze autoplay after
  // the first click. The Pause button holds it for anyone who needs to.
  const isKeyboardFocus = (node) => {
    try { return node.matches(":focus-visible"); } catch { return true; }
  };
  const controls = root.querySelector("[data-hero-controls]");
  controls?.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") setPointerPause(true); });
  controls?.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") setPointerPause(false); });
  root.addEventListener("focusin", (e) => { if (isKeyboardFocus(e.target)) setPointerPause(true); });
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget)) setPointerPause(false);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(timer);
    else schedule();
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  });

  /* ---- Touch swipe ---- */
  let touchX = null;
  root.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const delta = e.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 60) (delta < 0 ? next : prev)();
    touchX = null;
  }, { passive: true });

  /* ---- "See more" sheets (SPAW slides, phones) ----
   * Each is a modal <dialog> kept outside the hero, so a swipe or an arrow
   * key inside an open sheet never reaches the slideshow, which holds while
   * one is open. Where <dialog> is unsupported the link is left alone and
   * goes to the Symphony page, which is where its href points. */
  const setSheetPause = (value) => {
    pausedBySheet = value;
    syncPausedClass();
    schedule();
  };
  root.querySelectorAll("[data-hero-more]").forEach((link) => {
    const sheet = document.getElementById(link.dataset.heroMore);
    if (!sheet || typeof sheet.showModal !== "function") return;
    link.setAttribute("aria-haspopup", "dialog");
    link.addEventListener("click", (e) => {
      e.preventDefault();
      setSheetPause(true);
      sheet.showModal();
    });
  });
  document.querySelectorAll("[data-hero-sheet]").forEach((sheet) => {
    // Slides back down before it closes; reduced motion just closes.
    const dismiss = () => {
      if (!sheet.open || sheet.classList.contains("is-closing")) return;
      if (reducedMotion) { sheet.close(); return; }
      sheet.classList.add("is-closing");
      window.setTimeout(() => sheet.close(), 280);
    };
    sheet.querySelector("[data-sheet-close]")?.addEventListener("click", dismiss);
    // A tap on the dimmed page behind lands on the <dialog> itself.
    sheet.addEventListener("click", (e) => { if (e.target === sheet) dismiss(); });
    sheet.addEventListener("cancel", (e) => { e.preventDefault(); dismiss(); });
    sheet.addEventListener("close", () => {
      sheet.classList.remove("is-closing");
      setSheetPause(false);
    });
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(buildSlats, 220);
  });

  // The admin can change a slide's background (content.js): rebuild that
  // slide's slats from the new picture.
  root.addEventListener("content:hero-image", (e) => {
    const holder = e.target.querySelector && e.target.querySelector("[data-hero-slats]");
    if (holder) delete holder.dataset.built;
    buildSlats();
  });

  // While the page is being edited ("Edit this page"), the slideshow
  // holds still; afterwards it goes back to whatever it was doing.
  let pausedBeforeEdit = null;
  document.addEventListener("editor:start", () => {
    if (pausedBeforeEdit === null) pausedBeforeEdit = paused;
    setPaused(true);
  });
  document.addEventListener("editor:end", () => {
    if (pausedBeforeEdit !== null) setPaused(pausedBeforeEdit);
    pausedBeforeEdit = null;
  });

  // The portraits beside the SPAW slides on phones are lazy images, so a
  // desktop never downloads them; a phone fetches them once the hero is
  // running, so each is ready before its slide comes round.
  function warmSidePhotos() {
    if (!window.matchMedia("(max-width: 680px)").matches) return;
    root.querySelectorAll(".hero-side img").forEach((img) => { new Image().src = img.src; });
  }

  /* -------------------------------------------------------------------
   * Start — held until the cinematic intro finishes, so the first
   * slide's copy animates onto a screen the visitor is actually looking
   * at rather than playing out behind the intro film.
   * ----------------------------------------------------------------- */
  function start() {
    if (started) return;
    started = true;
    root.classList.add("is-live");
    restartRail(railItems[0]);
    setPaused(paused);
    warmSidePhotos();
  }

  const intro = document.querySelector("[data-intro]");
  if (intro && !intro.hidden) {
    document.addEventListener("intro:complete", start, { once: true });
    // Belt and braces: if the intro never reports in, start anyway.
    window.setTimeout(start, 13000);
  } else {
    start();
  }
})();
