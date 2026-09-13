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
| `admin.html` | The admin: sign-in with roles; Pages and "Edit this page" for every word, link and picture; header, menus and footer; songs, albums, videos, galleries, events, Symphony, About lists, Ministry, artists, contact-page options and an announcement bar; drafts with preview, publishing and history; events with status, tickets and expected guests; the inbox (enquiries, Talent Quest applicants with their samples, registrations, QR check-in, newsletter) with spreadsheet downloads; analytics (traffic, sources and campaigns, audience, pages, music and video, sign-ups step by step, site speed and errors); campaign links with QR codes; media library; people & roles; activity log. Works on a phone |

## Architecture

- **`js/data.js`** is the content layer and the seam to a real backend. Every read goes through an `api.*` method returning a Promise with simulated latency and real validation errors, so swapping `DB` for `fetch()` is mechanical rather than a rewrite. Anything visitors send (registrations, applications, enquiries, newsletter sign-ups) goes through `Backend.forms`: into the database when the site is live, into this browser's `localStorage` in demo mode.
- **Videos come from her YouTube channel.** `api._youtube()` in `data.js` reads the channel's public feed through [rss2json](https://rss2json.com) (YouTube serves the feed without CORS headers, so a browser can't read it directly), caches it for 30 minutes, and merges it over the snapshot in `DB.videos`. New uploads therefore appear on the Media page and in the homepage video slot on their own, usually within the hour; if the relay is unreachable, the snapshot is shown. To drop the relay, replace `_fetchYouTubeFeed()` with the YouTube Data API or a small serverless function. Videos play in an embedded player on a real host; opened from disk (`file://`), YouTube refuses embeds, so the links open YouTube instead.
- **`js/app.js`** carries the shared DOM helpers (`el`, `showLoading`, `showError`, `showEmpty`) used by every page script. Rendering is done with `createElement`/`textContent` — never `innerHTML` with data-derived strings.
- **Page scripts** (`music.js`, `media.js`, `events.js`, `talent.js`, `contact.js`, `about.js`, `hero.js`) each guard on their own hooks and no-op elsewhere, which is what lets one bundle load everywhere.
- **Progressive enhancement throughout.** GSAP and the QR library are both optional — if either CDN fails the page still works. The intro film, hero slideshow, and all scroll animation respect `prefers-reduced-motion`.
- **Design system** lives in `css/main.css` as custom properties: warm near-black, warm white, one wine red used sparingly, a fluid type scale pairing Instrument Serif with Manrope.

- **`js/backend.js`** is the one place the site talks to storage, in one of two modes. With [`js/config.js`](js/config.js) empty it runs in *demo mode* (everything in this browser's `localStorage`); with a Supabase project named there it runs *live* (content, logins and uploads in Supabase, guarded by the database's rules). Every admin screen uses the same methods either way.
- **`js/content.js`** makes the public pages editable. The words stay in the HTML as the originals; on load it finds every editable word, link, picture and section, keys each one by page / section / position, and applies whatever has been published. Each edit remembers a fingerprint of the words it replaced, so if the code later changes those words the edit is held back for review instead of landing on the wrong line. Published collections (songs, events…) replace the matching part of `DB` before any page reads it.
- **`js/editor.js`** ("Edit this page") loads only for signed-in admins: click words or pictures on any page to change them, hide sections, set the page's title and share picture, then save a draft or publish.
- **The admin** is `admin-core.js` (sign-in, roles, the sidebar and shared toolkit), `admin-site.js` (Pages, Header/menus/footer, Publish & history, Media library), `admin-content.js` (the lists: songs, albums, videos, galleries, events, Symphony, About, Ministry, artists, the contact page's options, announcements), `admin-inbox.js` (enquiries, applicants, registrations, check-in, newsletter, and the dashboard's "Needs attention"), `admin-analytics.js` (Analytics, the dashboard's last 30 days, event progress against expected guests, Campaign links), `admin-team.js` (People & roles, Activity log) and `admin.js` (a table helper).
- **`js/track.js`** counts visits on every public page, anonymously: see *Analytics* below. **`js/analytics-core.js`** works out the analytics report in the browser for demo mode (with made-up visits mixed in); live, the database works out the same report (`analytics_report()` in `supabase/setup-3.sql`), and the two are tested against each other.

## Admin

`/admin`. Three roles: **Owner** (everything, including people), **Editor** (edits and publishes the site) and **Team** (inbox, applicants, registrations, check-in).

- **Demo mode** (no Supabase set in `js/config.js`): sign in with `admin` / `symphony2026`. Everything is kept in that browser only; visitors don't see it.
- **Live**: follow [`supabase/README.md`](supabase/README.md). The Owner is set in the setup script, adds everyone else under People & roles, and each person signs in with their own email and password.

Edits are drafts until published; *Preview* shows the site with drafts applied (only to a signed-in admin), and every publish is kept in *Publish & history*, where an earlier version can be brought back as drafts.

The inbox is where the website's forms land. Enquiries and applicants carry a status and team notes (applicants also a star rating, and their samples open from the admin); registrations can be cancelled, restored, added by hand and checked in. *Event check-in* scans the QR code on a ticket with the phone's camera (the site has to be on https for that) or takes the ticket ID typed in. Every list downloads as a spreadsheet (CSV).

*Events* (in the sidebar's Events group) is where events are created and changed: kind of event, status (going ahead, postponed, cancelled), whether it shows on the site yet, dates and times (including events over several days), venue, address and map link, free or ticketed with prices and a ticket link, registration open or closed and a closing date, places, and **expected guests**, which isn't shown on the site: each event's panel, the Dashboard and the analytics follow registrations against it, with how many more are needed each day to get there.

The admin works on a phone: the sidebar folds into a bar with a Menu button, and check-in has big buttons for the door.

## Analytics

`js/track.js` counts visits on every public page, anonymously: no cookies, no names, no internet addresses stored. A browser gives itself a random name in its own storage; a visit ends after 30 minutes without activity. Nothing is counted when the browser asks not to be tracked (Do Not Track or Global Privacy Control), for automated visitors, or on browsers the team has signed in with (the Analytics screen has "Count my own visits" to undo that). Countries are estimated from the device's time zone; nothing is looked up.

What's counted: page views and time on each page (only while it's on screen), how far down people scroll, the homepage sections they reach, hero slides seen and tapped, buttons and phone-menu taps, where visitors came from (search, social, other sites, email, campaign links), device, browser, language, song plays and how much of each is heard, streaming-link taps by platform, video plays and "Watch on YouTube" taps, gallery opens, Music searches (including those that find nothing), every sign-up step (starting and sending a registration, application or booking; newsletter sign-ups), page speed and the errors visitors hit.

*Analytics* in the admin shows all of it for any period, compared with the period before, and every table downloads as a spreadsheet. *Campaign links* makes a tagged link for each post, broadcast or flyer (with a QR code to print), so visits through it, and the sign-ups they lead to, are counted under its campaign. Analytics start from the day the tracking goes live; in demo mode the screens mix made-up visits with the ones made in that browser, and say so.

## Prototype boundaries

Media in `assets/` is placeholder and streaming links are stubs. Email alerts for new enquiries and applications aren't built yet.
