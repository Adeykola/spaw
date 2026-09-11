/**
 * music.js
 * ----------------------------------------------------------------------
 * Drives music.html: search + filter over the full catalogue, an
 * editorial track list, an albums preview strip, and the persistent
 * player queue. Reuses the DOM-safety helpers (el/showLoading/etc.)
 * declared in app.js, which is loaded on every page.
 * ----------------------------------------------------------------------
 */
let musicState = { query: "", filter: "all" };
let currentQueue = [];
const persistentPlayer = new PersistentPlayer();

document.addEventListener("DOMContentLoaded", () => {
  renderTrackList();
  renderAlbumsPreview();
  renderAlbumsGrid();
  renderSongDetail();
  wireFilterBar();
  wireYear();
});

function wireFilterBar() {
  const pills = document.querySelectorAll("[data-filter-pill]");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.setAttribute("aria-pressed", "false"));
      pill.setAttribute("aria-pressed", "true");
      musicState.filter = pill.dataset.filterPill;
      renderTrackList();
    });
  });

  const search = document.querySelector("[data-music-search]");
  if (!search) return;
  let debounceTimer;
  search.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const value = e.target.value;
    debounceTimer = setTimeout(() => {
      musicState.query = value;
      renderTrackList();
    }, 220);
  });
}

function playIconSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#icon-play");
  svg.appendChild(use);
  return svg;
}

async function renderTrackList() {
  const list = document.querySelector("[data-music-list]");
  if (!list) return;
  showLoading(list, "Loading songs\u2026");

  try {
    const tracks = await api.getAllTracks(musicState);
    currentQueue = tracks;

    if (!tracks.length) {
      showEmpty(list, musicState.query ? `No songs match "${musicState.query}".` : "No songs match that filter.");
      return;
    }

    list.replaceChildren(
      ...tracks.map((t, i) => {
        const playBtn = el("button", { class: "track-row__play", type: "button", "data-cursor-text": "PLAY", aria: { label: `Play ${t.title}` } }, [playIconSvg()]);
        playBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          persistentPlayer.playQueue(currentQueue, i);
        });

        return el("a", { class: "track-row", href: `song.html?id=${encodeURIComponent(t.id)}` }, [
          el("span", { class: "track-row__index", text: String(i + 1).padStart(2, "0") }),
          el("img", { class: "track-row__art", src: t.artwork, alt: "", loading: "lazy" }),
          el("div", {}, [
            el("p", { class: "track-row__title", text: t.title }),
            el("p", { class: "track-row__sub", text: t.releaseDate ? `${t.artist} \u2014 ${new Date(t.releaseDate).getFullYear()}` : t.artist }),
          ]),
          el("span", { class: "track-row__badge", text: t.isSingle ? "Single" : "Album" }),
          el("span", { class: "track-row__dur", text: formatDuration(t.duration) }),
          playBtn,
        ]);
      })
    );
  } catch (err) {
    console.error("[music] track list failed", err);
    showError(list, "Couldn't load the catalogue.", renderTrackList);
  }
}

/* ---------------------------------------------------------------------
 * Albums grid (albums.html)
 * ------------------------------------------------------------------- */
async function renderAlbumsGrid() {
  const grid = document.querySelector("[data-albums-grid]");
  if (!grid) return;
  showLoading(grid, "Loading albums\u2026");

  try {
    const albums = await api.getAllAlbums();
    if (!albums.length) { showEmpty(grid, "No albums yet \u2014 every release so far is a single."); return; }

    grid.replaceChildren(
      ...(await Promise.all(
        albums.map(async (a) => {
          const full = await api.getAlbumById(a.id);
          const bg = el("div", { class: "album-row__bg" }, [el("img", { src: full.banner || full.cover, alt: "", loading: "lazy" })]);

          const playBtn = el("button", { class: "btn btn-solid", type: "button" }, [document.createTextNode("Play album")]);
          playBtn.addEventListener("click", () => persistentPlayer.playQueue(full.tracks, 0));

          const tracklist = el("div", { class: "tracklist" },
            full.tracks.map((t, i) =>
              el("div", { class: "tracklist__row" }, [
                el("span", { class: "tracklist__num", text: String(i + 1).padStart(2, "0") }),
                el("span", { class: "tracklist__name", text: t.title }),
                el("span", { class: "tracklist__dur", text: formatDuration(t.duration) }),
              ])
            )
          );

          const content = el("div", { class: "album-row__content" }, [
            el("div", {}, [
              el("p", { class: "eyebrow" }, [document.createTextNode(String(full.year))]),
              el("h2", { class: "album-row__title display", text: full.title }),
              el("p", { class: "album-row__meta", text: full.description }),
              el("div", { style: "margin-top: var(--space-m); display:flex; gap: var(--space-m); align-items:center;" }, [
                playBtn,
                el("a", { href: `song.html?id=${encodeURIComponent(full.tracks[0]?.id || "")}`, class: "btn btn-line", text: "View first song" }),
              ]),
            ]),
            tracklist,
          ]);

          return el("article", { class: "album-row" }, [bg, content]);
        })
      ))
    );
  } catch (err) {
    console.error("[music] albums grid failed", err);
    showError(grid, "Couldn't load albums.", renderAlbumsGrid);
  }
}

/* ---------------------------------------------------------------------
 * Song detail (song.html)
 * ------------------------------------------------------------------- */
async function renderSongDetail() {
  const root = document.querySelector("[data-song-detail]");
  if (!root) return;
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    showError(root, "No song was specified.", () => (window.location.href = "music.html"));
    return;
  }
  showLoading(root, "Loading song\u2026");

  try {
    const track = await api.getTrackById(id);
    document.title = `${track.title} — Dr AjokeSings`;

    const wash = el("img", { class: "song-hero__wash", src: track.artwork, alt: "", "aria-hidden": "true" });
    const art = el("img", { class: "song-hero__art", src: track.artwork, alt: `${track.title} artwork` });

    const playBtn = el("button", { class: "btn btn-solid", type: "button" }, [document.createTextNode("Play song")]);
    playBtn.addEventListener("click", async () => {
      let queue = [track];
      let idx = 0;
      if (track.album) {
        queue = track.album.trackIds.map((tid) => DB.tracks.find((t) => t.id === tid)).filter(Boolean);
        idx = queue.findIndex((t) => t.id === track.id);
      } else {
        queue = DB.tracks.filter((t) => t.isSingle);
        idx = queue.findIndex((t) => t.id === track.id);
      }
      persistentPlayer.playQueue(queue, Math.max(idx, 0));
    });

    const facts = [
      track.album ? `From ${track.album.title}` : "Single",
      track.releaseDate ? new Date(track.releaseDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "",
      formatDuration(track.duration),
    ].filter(Boolean);
    const meta = el("div", { class: "song-hero__meta" }, [
      ...facts.map((text) => el("span", { text })),
      el("a", { href: "music.html", text: "\u2190 Back to all music" }),
    ]);

    const heroContent = el("div", {}, [
      el("p", { class: "eyebrow" }, [document.createTextNode(track.isSingle ? "Single" : "Album Track")]),
      el("h1", { class: "song-hero__title display", text: track.title }),
      meta,
      el("div", { style: "margin-top: var(--space-l);" }, [playBtn]),
    ]);

    root.replaceChildren(
      el("div", { class: "song-hero" }, [wash, el("div", { class: "wrap" }, [art, heroContent])])
    );

    // No story rather than an invented one; the lyrics column then stands alone.
    const descWrap = document.querySelector("[data-song-description]");
    if (descWrap) {
      descWrap.textContent = track.description || "";
      descWrap.parentElement.hidden = !track.description;
    }

    const lyricsWrap = document.querySelector("[data-song-lyrics]");
    if (lyricsWrap) {
      if (track.lyrics && track.lyrics.length) {
        lyricsWrap.replaceChildren(...track.lyrics.map((line) => el("p", { text: line || "\u00A0" })));
      } else {
        showEmpty(lyricsWrap, "Lyrics not available for this song yet.");
      }
    }

    const linksWrap = document.querySelector("[data-song-links]");
    if (linksWrap) {
      const links = Object.entries(track.links).filter(([, url]) => url);
      linksWrap.replaceChildren(...links.map(([platform, url]) => el("a", { href: url, text: platformLabel(platform), target: "_blank", rel: "noopener" })));
      linksWrap.closest("section").hidden = !links.length;
    }
  } catch (err) {
    console.error("[music] song detail failed", err);
    showError(root, err.message || "Couldn't load this song.", renderSongDetail);
  }
}

async function renderAlbumsPreview() {
  const wrap = document.querySelector("[data-albums-preview]");
  if (!wrap) return;
  showLoading(wrap, "Loading albums\u2026");

  try {
    const albums = await api.getAllAlbums();
    // Every release so far is a single: hide the albums strip, and the
    // All / Albums / Singles pills that would only ever show the same list.
    if (!albums.length) {
      wrap.closest("section").hidden = true;
      document.querySelector("[data-filter-pill]")?.closest(".filter-pills")?.setAttribute("hidden", "");
      return;
    }
    wrap.replaceChildren(
      ...albums.map((a) =>
        el("a", { class: "album-preview-card", href: `albums.html?id=${encodeURIComponent(a.id)}` }, [
          el("img", { src: a.cover, alt: `${a.title} cover`, loading: "lazy" }),
          el("div", {}, [
            el("h3", { class: "catalogue__track-title", text: a.title }),
            el("p", { class: "catalogue__track-sub", text: `${a.year} \u2014 ${a.trackCount} songs` }),
          ]),
        ])
      )
    );
  } catch (err) {
    console.error("[music] albums preview failed", err);
    showError(wrap, "Couldn't load albums.", renderAlbumsPreview);
  }
}
