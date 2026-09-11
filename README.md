# Dr AjokeSings — Platform Prototype

An editorial worship-artist platform: music catalogue, video library, ministry, the Symphony of Praise & Worship concert and Talent Quest, events with registration, a combined contact & booking desk, and an admin dashboard.

Zero build step. Open `index.html` in a browser and it runs.

## Running it

Pages link to each other without `.html` (`/music`, not `/music.html`), so serve the folder with something that maps `/music` to `music.html`:

```bash
npx serve .
```

Then visit the address it prints. When hosting, GitHub Pages and Netlify map clean URLs on their own, `vercel.json` switches it on for Vercel, and `.htaccess` does it on Apache (cPanel) hosting. Opening `index.html` straight from disk still works: with no server to do the mapping, `navigation.js` adds the `.html` back to links as they are clicked. (`python -m http.server` does not map clean URLs, so links 404 there.)

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Cinematic intro film, three-slide hero, featured song + album, catalogue, video, events, newsletter |
| `music.html` / `albums.html` / `song.html` | Catalogue with search and filters, album detail, song detail with lyrics |
| `media.html` | Her YouTube videos (live from the channel, category filters, embedded player) and event photo galleries (lightbox), on one page |
| `ministry.html` | Mission, pillars, the mentorship track, workshops, free resources |
| `symphony.html` | The Symphony concert, the Talent Quest, and the application form |
| `events.html` | Full calendar, registration with QR code and `.ics` download |
| `about.html` | Story, timeline, principles, recognition |
| `contact.html` | Contact and booking as one form with two modes |
| `admin.html` | Login-gated dashboard: analytics, CRUD, registrations, enquiries, applicants, check-in |

## Architecture

- **`js/data.js`** is the content layer and the seam to a real backend. Every read goes through an `api.*` method returning a Promise with simulated latency and real validation errors, so swapping `DB` for `fetch()` is mechanical rather than a rewrite. Anything user-generated (registrations, applications, enquiries, newsletter) persists to `localStorage` through the `Store` wrapper.
- **Videos come from her YouTube channel.** `api._youtube()` in `data.js` reads the channel's public feed through [rss2json](https://rss2json.com) (YouTube serves the feed without CORS headers, so a browser can't read it directly), caches it for 30 minutes, and merges it over the snapshot in `DB.videos`. New uploads therefore appear on the Media page and in the homepage video slot on their own, usually within the hour; if the relay is unreachable, the snapshot is shown. To drop the relay, replace `_fetchYouTubeFeed()` with the YouTube Data API or a small serverless function. Videos play in an embedded player on a real host; opened from disk (`file://`), YouTube refuses embeds, so the links open YouTube instead.
- **`js/app.js`** carries the shared DOM helpers (`el`, `showLoading`, `showError`, `showEmpty`) used by every page script. Rendering is done with `createElement`/`textContent` — never `innerHTML` with data-derived strings.
- **Page scripts** (`music.js`, `media.js`, `events.js`, `talent.js`, `contact.js`, `hero.js`, `admin.js`, `analytics.js`) each guard on their own hooks and no-op elsewhere, which is what lets one bundle load everywhere.
- **Progressive enhancement throughout.** GSAP and the QR library are both optional — if either CDN fails the page still works. The intro film, hero slideshow, and all scroll animation respect `prefers-reduced-motion`.
- **Design system** lives in `css/main.css` as custom properties: warm near-black, warm white, one wine red used sparingly, a fluid type scale pairing Instrument Serif with Manrope.

## Admin

`admin.html`, prototype credentials `admin` / `symphony2026`. This is a demo gate to show the login → session → management journey, not production authentication.

## Prototype boundaries

Media in `assets/` is placeholder, streaming links are stubs, admin edits save to `localStorage` and do not yet feed the public pages, and the CRUD panels create and delete but do not update.
