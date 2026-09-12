/**
 * navigation.js
 * ----------------------------------------------------------------------
 * Header scroll state, mobile nav drawer, and the desktop custom cursor
 * (magnetic buttons + contextual labels like "PLAY" / "VIEW").
 * Cursor logic is inert on touch devices (see CSS: hover:none guard).
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  /* ---- Site-wide atmospherics ----
   * Injected rather than written into every page's markup: nine files
   * would otherwise carry two decorative divs each, and neither element
   * means anything without JS running.
   */
  const grain = document.createElement("div");
  grain.className = "grain";
  grain.setAttribute("aria-hidden", "true");
  document.body.appendChild(grain);

  const progress = document.createElement("div");
  progress.className = "scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.appendChild(progress);

  /* ---- Signature logo ----
   * The write-on itself is pure CSS (see .sig in main.css). This only
   * holds it: until the script face has actually loaded — otherwise the
   * fallback face gets "written" and then swaps mid-stroke — and, in the
   * homepage header, until the intro film has cleared, so the name is
   * signed on a screen the visitor can see. Footer signatures wait until
   * they scroll into view.
   */
  {
    const autoplaySigs = Array.from(document.querySelectorAll(".sig--autoplay"));
    const viewSigs = Array.from(document.querySelectorAll(".sig--on-view"));
    const allSigs = autoplaySigs.concat(viewSigs);

    if (allSigs.length) {
      allSigs.forEach((sig) => sig.classList.add("is-waiting"));
      viewSigs.forEach((sig) => sig.classList.add("is-signing"));

      const release = (sig) => sig.classList.remove("is-waiting");

      let fontReady = Promise.resolve();
      if (document.fonts && typeof document.fonts.load === "function") {
        // Read the family from the element so swapping --font-signature in
        // main.css never needs a matching change here.
        const family = getComputedStyle(allSigs[0]).fontFamily;
        const load = document.fonts.load(`1em ${family}`).catch(() => {});
        // Never hold the logo hostage to a slow font CDN.
        const timeout = new Promise((resolve) => window.setTimeout(resolve, 2500));
        fontReady = Promise.race([load, timeout]);
      }

      fontReady.then(() => {
        const intro = document.querySelector("[data-intro]");
        autoplaySigs.forEach((sig) => {
          const behindIntro = intro && !intro.hidden && !intro.contains(sig);
          if (behindIntro) {
            document.addEventListener("intro:complete", () => release(sig), { once: true });
          } else {
            release(sig);
          }
        });

        if (!viewSigs.length) return;
        if (!("IntersectionObserver" in window)) {
          viewSigs.forEach(release);
          return;
        }
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            release(entry.target);
            observer.unobserve(entry.target);
          });
        }, { threshold: 0.6 });
        viewSigs.forEach((sig) => observer.observe(sig));
      });
    }
  }

  /* ---- Header scroll state + read progress ---- */
  const header = document.querySelector("[data-site-header]");
  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      header?.classList.toggle("is-scrolled", window.scrollY > 12);
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
      progress.style.setProperty("--progress", String(Math.min(Math.max(ratio, 0), 1)));
      ticking = false;
    });
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  // Pages are linked without ".html" (clean URLs), but a visitor can still
  // land on /contact.html or /index.html, so paths are compared with those
  // endings, and any trailing slash, taken off.
  const pagePath = (p) => p.replace(/\.html$/, "").replace(/\/index$/, "/").replace(/(.)\/$/, "$1");

  /* ---- Mobile nav drawer ----
   * Slides in from the right, where the menu button sits (main.css). Each
   * item gets its place in the list as --i, which staggers them in one
   * after another, and the page you are on is marked, as the desktop nav
   * marks it, with aria-current. */
  const toggle = document.querySelector("[data-menu-toggle]");
  const mobileNav = document.querySelector("[data-mobile-nav]");
  if (toggle && mobileNav) {
    const here = pagePath(window.location.pathname);
    mobileNav.querySelectorAll(".mobile-nav__list li").forEach((li, i) => {
      li.style.setProperty("--i", String(i));
      const link = li.querySelector("a[href]");
      if (link && pagePath(new URL(link.getAttribute("href"), window.location.href).pathname) === here) {
        link.setAttribute("aria-current", "page");
      }
    });
    const closeMenu = () => {
      toggle.setAttribute("aria-expanded", "false");
      mobileNav.classList.remove("is-open");
      document.body.classList.remove("no-scroll");
    };
    const openMenu = () => {
      toggle.setAttribute("aria-expanded", "true");
      mobileNav.classList.add("is-open");
      document.body.classList.add("no-scroll");
      mobileNav.querySelector("a")?.focus();
    };
    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      isOpen ? closeMenu() : openMenu();
    });
    mobileNav.addEventListener("click", (e) => {
      if (e.target.matches("a")) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        closeMenu();
        toggle.focus();
      }
    });
  }

  /* ---- Smooth in-page scrolling ----
   * Anchor links (the Symphony "Apply Now" button, contact.html#booking,
   * and anything else pointing at an id on the current page) glide to
   * their target instead of jumping. The fixed header would otherwise
   * cover the first ~84px of any section, so the offset is applied by
   * hand rather than relying on scroll-margin in every stylesheet.
   * Focus is moved to the target as well, so keyboard and screen-reader
   * users end up where sighted users are looking.
   */
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function scrollToTarget(target, { animate = true } = {}) {
    const headerHeight = header ? header.offsetHeight : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 12;

    window.scrollTo({
      top: Math.max(top, 0),
      behavior: animate && !prefersReducedMotion ? "smooth" : "auto",
    });

    // Make the section focusable just long enough to receive focus, so we
    // don't leave a permanent tabindex on the page.
    const hadTabIndex = target.hasAttribute("tabindex");
    if (!hadTabIndex) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    if (!hadTabIndex) {
      target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    }
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href*="#"]');
    if (!link || link.target === "_blank") return;

    const url = new URL(link.href, window.location.href);
    // Only handle links pointing at this same document.
    if (pagePath(url.pathname) !== pagePath(window.location.pathname) || url.origin !== window.location.origin) return;
    if (!url.hash || url.hash === "#") return;

    const target = document.querySelector(url.hash);
    if (!target) return;

    e.preventDefault();
    scrollToTarget(target);
    history.pushState(null, "", url.hash);
  });

  /* ---- Opened straight from disk ----
   * Links carry no ".html"; a web host maps /music to music.html. A page
   * opened from disk (file://) has no host to do that, so there a clicked
   * link gets its ".html" back. Registered after the smooth-scroll handler,
   * so same-page links it has already taken are left alone. */
  if (window.location.protocol === "file:") {
    document.addEventListener("click", (e) => {
      const link = e.target.closest("a[href]");
      if (!link || e.defaultPrevented) return;
      const url = new URL(link.getAttribute("href"), window.location.href);
      if (url.protocol !== "file:" || /\.[a-z0-9]+$/i.test(url.pathname)) return;
      e.preventDefault();
      url.pathname += url.pathname.endsWith("/") ? "index.html" : ".html";
      if (link.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey) window.open(url.href, "_blank");
      else window.location.href = url.href;
    });
  }

  // Arriving with a hash already in the URL (contact.html#booking from
  // another page): let layout settle, then place the section correctly
  // under the fixed header.
  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) {
      window.addEventListener("load", () => {
        window.setTimeout(() => scrollToTarget(target, { animate: false }), 60);
      });
    }
  }

  /* ---- Custom cursor (desktop / fine pointer only) ---- */
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!supportsHover) return;

  const cursor = document.querySelector("[data-cursor]");
  const cursorLabel = document.querySelector("[data-cursor-label]");
  if (!cursor || !cursorLabel) return;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let cursorX = mouseX;
  let cursorY = mouseY;

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function raf() {
    // Light easing for a "trailing" feel without a full physics lib.
    cursorX += (mouseX - cursorX) * 0.22;
    cursorY += (mouseY - cursorY) * 0.22;
    cursor.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
    cursorLabel.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%) ${
      cursorLabel.classList.contains("is-active") ? "scale(1)" : "scale(0)"
    }`;
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  document.addEventListener("mouseover", (e) => {
    const target = e.target.closest("[data-cursor-text]");
    if (target) {
      cursorLabel.textContent = target.getAttribute("data-cursor-text");
      cursorLabel.classList.add("is-active");
      cursor.style.opacity = "0";
    }
  });

  document.addEventListener("mouseout", (e) => {
    const target = e.target.closest("[data-cursor-text]");
    if (target) {
      cursorLabel.classList.remove("is-active");
      cursor.style.opacity = "1";
    }
  });

  /* ---- Magnetic buttons ---- */
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      const relX = e.clientX - rect.left - rect.width / 2;
      const relY = e.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${relX * 0.25}px, ${relY * 0.3}px)`;
    });
    el.addEventListener("mouseleave", () => {
      el.style.transform = "translate(0, 0)";
    });
  });
})();
