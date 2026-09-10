/**
 * intro.js
 * ----------------------------------------------------------------------
 * Full-screen cinematic welcome video. Plays once per browser session,
 * degrades gracefully when autoplay is blocked, the connection is slow,
 * or the visitor has reduced-motion set. Never blocks access to the site.
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  const SESSION_KEY = "drajokesings:introSeen";
  const root = document.querySelector("[data-intro]");
  if (!root) return;

  const video = root.querySelector("[data-intro-video]");
  const progressBar = root.querySelector("[data-intro-progress]");
  const enterBtn = root.querySelector("[data-intro-enter]");
  const soundBtn = root.querySelector("[data-intro-sound]");
  const body = document.body;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = "connection" in navigator && navigator.connection && navigator.connection.saveData;

  // Skip entirely: returning visitor this session, reduced motion, or save-data mode.
  const alreadySeen = sessionStorage.getItem(SESSION_KEY) === "1";
  if (alreadySeen || prefersReducedMotion || saveData || !video) {
    dismiss({ animate: false });
    return;
  }

  body.classList.add("no-scroll");

  function markSeen() {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_) { /* private mode: non-fatal */ }
  }

  function dismiss({ animate = true } = {}) {
    markSeen();
    if (!root.isConnected || root.hidden) return;

    const finish = () => {
      root.hidden = true;
      body.classList.remove("no-scroll");
      document.dispatchEvent(new CustomEvent("intro:complete"));
    };

    if (!animate || typeof gsap === "undefined") {
      finish();
      return;
    }

    root.classList.add("is-leaving");
    gsap.to(root, {
      autoAlpha: 0,
      duration: 0.9,
      ease: "power2.inOut",
      onComplete: finish,
    });
  }

  // Progress bar tied to actual video playback time.
  video.addEventListener("timeupdate", () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (progressBar) progressBar.style.width = `${pct}%`;
  });

  video.addEventListener("ended", () => dismiss());

  // If the video fails to load (bad path, network error), don't strand the visitor.
  video.addEventListener("error", () => dismiss({ animate: false }));

  // Attempt autoplay; if blocked, show poster + a clear enter control (already visible).
  const playAttempt = video.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {
      // Autoplay blocked — poster + "Enter Experience" remains the primary path.
      root.setAttribute("data-autoplay-blocked", "true");
    });
  }

  // Safety net: never trap a visitor behind the intro for more than 12s.
  const safetyTimer = setTimeout(() => dismiss(), 12000);

  enterBtn?.addEventListener("click", () => {
    clearTimeout(safetyTimer);
    dismiss();
  });

  soundBtn?.addEventListener("click", () => {
    video.muted = !video.muted;
    soundBtn.setAttribute("aria-pressed", String(!video.muted));
    soundBtn.querySelector("[data-sound-label]").textContent = video.muted ? "Sound off" : "Sound on";
  });

  // Keyboard: Escape skips, same as clicking Enter.
  document.addEventListener("keydown", function escHandler(e) {
    if (root.hidden) {
      document.removeEventListener("keydown", escHandler);
      return;
    }
    if (e.key === "Escape") {
      clearTimeout(safetyTimer);
      dismiss();
    }
  });
})();
