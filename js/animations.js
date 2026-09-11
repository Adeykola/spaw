/**
 * animations.js
 * ----------------------------------------------------------------------
 * All GSAP/ScrollTrigger work lives here, kept deliberately sparse:
 * one orchestrated intro sequence, a handful of scroll reveals, and two
 * signature moments (the ministry mission pin + the horizontal
 * catalogue). Respects prefers-reduced-motion throughout.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (typeof gsap === "undefined") return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof ScrollTrigger !== "undefined") gsap.registerPlugin(ScrollTrigger);

  document.documentElement.classList.add("js-enabled");

  function initHeroSequence() {
    const hero = document.querySelector("[data-hero]");
    if (!hero) return;

    // The slideshow hero (see hero.js) owns its own entrance and runs on
    // CSS, so here we only add the scroll parallax and step aside.
    if (hero.hasAttribute("data-hero-slider")) {
      if (typeof ScrollTrigger !== "undefined" && !reducedMotion) {
        gsap.to("[data-hero-stage]", {
          yPercent: 8,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
        });
      }
      return;
    }

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from("[data-hero-img]", { scale: 1.18, duration: 1.8, ease: "power2.out" }, 0)
      .from("[data-hero-eyebrow]", { autoAlpha: 0, y: 16, duration: 0.7 }, 0.3)
      .from("[data-hero-title] .word", {
        autoAlpha: 0,
        yPercent: 110,
        duration: 0.9,
        stagger: 0.06,
      }, 0.4)
      .from("[data-hero-meta]", { autoAlpha: 0, x: 24, duration: 0.8 }, 0.9)
      .from("[data-hero-scroll]", { autoAlpha: 0, duration: 0.6 }, 1.2);

    // Runs this sequence after the intro finishes (or immediately if intro was skipped).
    const introRoot = document.querySelector("[data-intro]");
    if (introRoot && !introRoot.hidden) {
      document.addEventListener("intro:complete", () => tl.play(), { once: true });
      tl.pause();
    }

    if (typeof ScrollTrigger !== "undefined" && !reducedMotion) {
      gsap.to("[data-hero-img]", {
        yPercent: 12,
        ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
      });
    }
  }

  function splitWords(el) {
    const text = el.textContent.trim();
    el.innerHTML = "";
    text.split(" ").forEach((word, i, arr) => {
      const span = document.createElement("span");
      span.className = "word";
      span.style.display = "inline-block";
      span.style.overflow = "hidden";
      const inner = document.createElement("span");
      inner.style.display = "inline-block";
      inner.textContent = word + (i < arr.length - 1 ? "\u00A0" : "");
      span.appendChild(inner);
      el.appendChild(span);
    });
  }

  function initScrollReveals() {
    if (typeof ScrollTrigger === "undefined") {
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("revealed"));
      return;
    }
    document.querySelectorAll("[data-reveal]").forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: () => {
          gsap.to(el, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            clipPath: "inset(0 0 0% 0)",
            duration: 1,
            ease: "power3.out",
          });
          el.classList.add("revealed");
        },
      });
    });
  }

  function initMinistryPin() {
    const pin = document.querySelector("[data-ministry-pin]");
    if (!pin || typeof ScrollTrigger === "undefined" || reducedMotion) return;
    const lines = pin.querySelectorAll(".mask-line span");
    gsap.set(lines, { yPercent: 100 });

    ScrollTrigger.create({
      trigger: pin,
      start: "top top",
      end: "+=120%",
      pin: true,
      scrub: 0.5,
      refreshPriority: 1,
      onUpdate: (self) => {
        gsap.to(lines, {
          yPercent: 100 - self.progress * 100,
          stagger: 0.03,
          ease: "power1.out",
          overwrite: "auto",
          duration: 0.3,
        });
      },
    });
  }

  // The catalogue pins to the top of the screen and the page's vertical
  // scroll drives the row sideways until the last song is in view; then
  // the page carries on. The songs render asynchronously (app.js), so the
  // distance is a function re-measured on every refresh, and a refresh is
  // forced when they arrive — measuring once at start-up found an empty
  // row and never engaged. Reduced motion keeps the plain swipeable row.
  function initCatalogueScroll() {
    const track = document.querySelector("[data-catalogue-track]");
    const section = document.querySelector("[data-catalogue]");
    if (!track || !section || typeof ScrollTrigger === "undefined" || reducedMotion) return;

    section.classList.add("is-horizontal");
    const distance = () => Math.max(0, track.scrollWidth - track.clientWidth);

    gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
        // Refresh ahead of every trigger further down the page, so they
        // measure with this pin's extra scroll length already in place.
        refreshPriority: 2,
      },
    });

    document.addEventListener("catalogue:rendered", () => ScrollTrigger.refresh());
  }

  function initMarquee() {
    const marquee = document.querySelector("[data-marquee]");
    if (!marquee || reducedMotion) return;
    gsap.to(marquee, {
      xPercent: -50,
      repeat: -1,
      duration: 22,
      ease: "linear",
    });
  }

  // Build split-word targets before wiring the hero timeline.
  document.querySelectorAll("[data-split-words]").forEach(splitWords);

  initHeroSequence();
  initScrollReveals();
  initCatalogueScroll();
  initMinistryPin();
  initMarquee();

  // Content above the pins keeps arriving after start-up (the album
  // tracklist, web fonts, lazy images), and every change moves where the
  // pins should begin; on a phone it left the catalogue pinning ~400px
  // early. So re-measure whenever the page's height really changes. The
  // height is re-read after each refresh, so a refresh can't retrigger
  // itself.
  if (typeof ScrollTrigger !== "undefined" && "ResizeObserver" in window) {
    let settled = document.body.offsetHeight;
    let timer;
    ScrollTrigger.addEventListener("refresh", () => { settled = document.body.offsetHeight; });
    new ResizeObserver(() => {
      if (document.body.offsetHeight === settled) return;
      clearTimeout(timer);
      timer = setTimeout(() => ScrollTrigger.refresh(), 150);
    }).observe(document.body);
  }

  window.addEventListener("load", () => {
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh();
  });
})();
