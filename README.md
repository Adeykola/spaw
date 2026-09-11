# Dr AjokeSings — Platform Prototype

An editorial worship-artist platform: music catalogue, video library, ministry, the Symphony of Praise & Worship concert and Talent Quest, events with registration, a combined contact & booking desk, and an admin dashboard.

Zero build step. Open `index.html` in a browser and it runs.

## Running it

Any static server works, or just open the file directly:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Cinematic intro film, three-slide hero, featured song + album, catalogue, video, events, newsletter |
| `music.html` / `albums.html` / `song.html` | Catalogue with search and filters, album detail, song detail with lyrics |
| `media.html` | Videos (category filters, modal player) and event photo galleries (lightbox), on one page |
| `ministry.html` | Mission, pillars, the mentorship track, workshops, free resources |
| `symphony.html` | The Symphony concert, the Talent Quest, and the application form |
| `events.html` | Full calendar, registration with QR code and `.ics` download |
| `about.html` | Story, timeline, principles, recognition |
| `contact.html` | Contact and booking as one form with two modes |
| `admin.html` | Login-gated dashboard: analytics, CRUD, registrations, enquiries, applicants, check-in |

## Architecture

- **`js/data.js`** is the content layer and the seam to a real backend. Every read goes through an `api.*` method returning a Promise with simulated latency and real validation errors, so swapping `DB` for `fetch()` is mechanical rather than a rewrite. Anything user-generated (registrations, applications, enquiries, newsletter) persists to `localStorage` through the `Store` wrapper.
- **`js/app.js`** carries the shared DOM helpers (`el`, `showLoading`, `showError`, `showEmpty`) used by every page script. Rendering is done with `createElement`/`textContent` — never `innerHTML` with data-derived strings.
- **Page scripts** (`music.js`, `media.js`, `events.js`, `talent.js`, `contact.js`, `hero.js`, `admin.js`, `analytics.js`) each guard on their own hooks and no-op elsewhere, which is what lets one bundle load everywhere.
- **Progressive enhancement throughout.** GSAP and the QR library are both optional — if either CDN fails the page still works. The intro film, hero slideshow, and all scroll animation respect `prefers-reduced-motion`.
- **Design system** lives in `css/main.css` as custom properties: warm near-black, warm white, one wine red used sparingly, a fluid type scale pairing Instrument Serif with Manrope.

## Admin

`admin.html`, prototype credentials `admin` / `symphony2026`. This is a demo gate to show the login → session → management journey, not production authentication.

## Prototype boundaries

Media in `assets/` is placeholder, streaming links are stubs, admin edits save to `localStorage` and do not yet feed the public pages, and the CRUD panels create and delete but do not update.
