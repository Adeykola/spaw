/**
 * player.js
 * ----------------------------------------------------------------------
 * Lightweight, reusable HTML5-audio player controller. The homepage uses
 * one instance on the featured-song mini player; music.html/song.html
 * will reuse the same Player class for the persistent bottom player.
 * No dependencies, real fetch/error states, safe DOM writes only.
 * ----------------------------------------------------------------------
 */
class Player {
  /**
   * @param {HTMLElement} root - container with [data-player] wiring hooks
   */
  constructor(root) {
    this.root = root;
    this.audio = new Audio();
    this.audio.preload = "metadata";

    this.els = {
      playBtn: root.querySelector("[data-player-play]"),
      bar: root.querySelector("[data-player-bar]"),
      fill: root.querySelector("[data-player-fill]"),
      current: root.querySelector("[data-player-current]"),
      duration: root.querySelector("[data-player-duration]"),
    };

    this._bindEvents();
  }

  load(track) {
    this.track = track;
    this.audio.src = track.audioSrc;
    this._setPlayIcon(false);
    // Blank rather than a misleading 0:00 when a song's length isn't known.
    if (this.els.duration) this.els.duration.textContent = track.duration ? this._format(track.duration) : "";
    if (this.els.fill) this.els.fill.style.width = "0%";
    if (this.els.current) this.els.current.textContent = "0:00";
  }

  toggle() {
    if (!this.track) return;
    if (this.audio.paused) this.play();
    else this.pause();
  }

  play() {
    const attempt = this.audio.play();
    if (attempt && attempt.catch) {
      attempt
        .then(() => this._setPlayIcon(true))
        .catch(() => {
          // Playback blocked or the placeholder asset is missing — fail
          // visibly rather than silently, without breaking the page.
          this._setPlayIcon(false);
          this.root.dispatchEvent(new CustomEvent("player:error"));
        });
    } else {
      this._setPlayIcon(true);
    }
  }

  pause() {
    this.audio.pause();
    this._setPlayIcon(false);
  }

  _setPlayIcon(isPlaying) {
    this.els.playBtn?.setAttribute("aria-pressed", String(isPlaying));
    this.els.playBtn?.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    const useEl = this.els.playBtn?.querySelector("use");
    if (useEl) useEl.setAttribute("href", isPlaying ? "#icon-pause" : "#icon-play");
  }

  _format(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  _bindEvents() {
    this.els.playBtn?.addEventListener("click", () => this.toggle());

    this.audio.addEventListener("timeupdate", () => {
      if (!this.audio.duration) return;
      const pct = (this.audio.currentTime / this.audio.duration) * 100;
      if (this.els.fill) this.els.fill.style.width = `${pct}%`;
      if (this.els.current) this.els.current.textContent = this._format(this.audio.currentTime);
    });

    this.audio.addEventListener("ended", () => this._setPlayIcon(false));

    this.audio.addEventListener("error", () => {
      this._setPlayIcon(false);
      this.root.dispatchEvent(new CustomEvent("player:error"));
    });

    this.els.bar?.addEventListener("click", (e) => {
      if (!this.audio.duration) return;
      const rect = this.els.bar.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      this.audio.currentTime = ratio * this.audio.duration;
    });

    // Keyboard scrub for accessibility (bar is a slider role in markup).
    this.els.bar?.addEventListener("keydown", (e) => {
      if (!this.audio.duration) return;
      const step = this.audio.duration * 0.05;
      if (e.key === "ArrowRight") this.audio.currentTime = Math.min(this.audio.currentTime + step, this.audio.duration);
      if (e.key === "ArrowLeft") this.audio.currentTime = Math.max(this.audio.currentTime - step, 0);
    });
  }
}

window.Player = Player;

/**
 * PersistentPlayer
 * ----------------------------------------------------------------------
 * The bottom-docked, cross-page player used on music.html, albums.html,
 * song.html and anywhere else a queue of tracks needs to keep playing
 * while the visitor keeps browsing. One instance per page; state (which
 * track, how far through it) intentionally does NOT persist across page
 * loads in this prototype — swapping to a real app shell/SPA later is
 * the natural place to add that.
 * ----------------------------------------------------------------------
 */
class PersistentPlayer {
  constructor() {
    this.root = document.querySelector("[data-persistent-player]");
    if (!this.root) return;

    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.volume = 0.8;
    this.queue = [];
    this.index = -1;

    this.els = {
      art: this.root.querySelector("[data-pp-art]"),
      title: this.root.querySelector("[data-pp-title]"),
      artist: this.root.querySelector("[data-pp-artist]"),
      play: this.root.querySelector("[data-pp-play]"),
      prev: this.root.querySelector("[data-pp-prev]"),
      next: this.root.querySelector("[data-pp-next]"),
      bar: this.root.querySelector("[data-pp-bar]"),
      fill: this.root.querySelector("[data-pp-fill]"),
      current: this.root.querySelector("[data-pp-current]"),
      duration: this.root.querySelector("[data-pp-duration]"),
      volume: this.root.querySelector("[data-pp-volume]"),
    };

    this._bind();
  }

  playQueue(tracks, startIndex = 0) {
    if (!this.root || !tracks.length) return;
    this.queue = tracks;
    this.index = startIndex;
    this._loadCurrent();
    this.play();
  }

  playSingle(track) {
    this.playQueue([track], 0);
  }

  _loadCurrent() {
    const track = this.queue[this.index];
    if (!track) return;
    this.audio.src = track.audioSrc;
    if (this.els.art) { this.els.art.src = track.artwork; this.els.art.alt = `${track.title} artwork`; }
    if (this.els.title) this.els.title.textContent = track.title;
    if (this.els.artist) this.els.artist.textContent = track.artist || "Dr AjokeSings";
    // Blank rather than a misleading 0:00 when a song's length isn't known.
    if (this.els.duration) this.els.duration.textContent = track.duration ? this._format(track.duration) : "";
    if (this.els.fill) this.els.fill.style.width = "0%";
    if (this.els.current) this.els.current.textContent = "0:00";
    this.root.classList.add("is-active");
    this.root.hidden = false;
    document.body.classList.add("has-persistent-player");
    document.dispatchEvent(new CustomEvent("player:trackchange", { detail: { track } }));
  }

  play() {
    const attempt = this.audio.play();
    if (attempt?.catch) {
      attempt.then(() => this._setPlayIcon(true)).catch(() => {
        this._setPlayIcon(false);
        document.dispatchEvent(new CustomEvent("player:error"));
      });
    } else {
      this._setPlayIcon(true);
    }
  }

  pause() {
    this.audio.pause();
    this._setPlayIcon(false);
  }

  toggle() {
    if (this.index === -1) return;
    this.audio.paused ? this.play() : this.pause();
  }

  next() {
    if (!this.queue.length) return;
    this.index = (this.index + 1) % this.queue.length;
    this._loadCurrent();
    this.play();
  }

  prev() {
    if (!this.queue.length) return;
    if (this.audio.currentTime > 4) {
      this.audio.currentTime = 0;
      return;
    }
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this._loadCurrent();
    this.play();
  }

  _setPlayIcon(isPlaying) {
    this.els.play?.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    const useEl = this.els.play?.querySelector("use");
    if (useEl) useEl.setAttribute("href", isPlaying ? "#icon-pause" : "#icon-play");
  }

  _format(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  _bind() {
    this.els.play?.addEventListener("click", () => this.toggle());
    this.els.next?.addEventListener("click", () => this.next());
    this.els.prev?.addEventListener("click", () => this.prev());

    this.audio.addEventListener("timeupdate", () => {
      if (!this.audio.duration) return;
      const pct = (this.audio.currentTime / this.audio.duration) * 100;
      if (this.els.fill) this.els.fill.style.width = `${pct}%`;
      if (this.els.current) this.els.current.textContent = this._format(this.audio.currentTime);
    });
    this.audio.addEventListener("ended", () => this.next());
    this.audio.addEventListener("error", () => {
      this._setPlayIcon(false);
      document.dispatchEvent(new CustomEvent("player:error"));
    });

    this.els.bar?.addEventListener("click", (e) => {
      if (!this.audio.duration) return;
      const rect = this.els.bar.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      this.audio.currentTime = ratio * this.audio.duration;
    });

    this.els.volume?.addEventListener("input", (e) => {
      this.audio.volume = Number(e.target.value);
    });
  }
}

window.PersistentPlayer = PersistentPlayer;
