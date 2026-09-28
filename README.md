# Dr AjokeSings — Platform Prototype

An editorial worship-artist platform: music catalogue, video library, ministry, the Symphony of Praise & Worship concert and Talent Quest, events with registration, a combined contact & booking desk, and an admin dashboard.

Zero build step. Open `index.html` in a browser and it runs.

## Running it

Pages link to each other without `.html` (`/music`, not `/music.html`), so serve the folder with something that maps `/music` to `music.html`:

```bash
npx serve .
```

Then visit the address it prints. When hosting, GitHub Pages and Netlify map clean URLs on their own, `vercel.json` switches it on for Vercel, and `.htaccess` does it on Apache (cPanel) hosting. Opening `index.html` straight from disk still works: with no server to do the mapping, `navigation.js` adds the `.html` back to links as they are clicked. (`python -m http.server` does not map clean URLs, so links 404 there.)

## The domain: dr-ajokesings.com

The site is built and served by **Vercel** from this GitHub repository (every push to `main` goes live, at `spaw-umber.vercel.app` until the domain is moved). `dr-ajokesings.com` is registered with **Truehost**, whose DNS (nameservers `ns1.cloudoon.com`…) points it at their cPanel server, `135.125.230.200`. That server shows the old "Spaw Concerts" page **and receives the domain's email**: the domain's MX record points at `dr-ajokesings.com` itself. So the order below matters, or mail to `@dr-ajokesings.com` stops arriving when the website moves.

1. **Keep the email where it is (first).** In Truehost's DNS for dr-ajokesings.com (Client area → Domains → Manage DNS, or cPanel → Zone Editor):
   - add an **A** record: name `mail`, value `135.125.230.200`;
   - change the **MX** record for `dr-ajokesings.com` to point to `mail.dr-ajokesings.com` (same priority, 0).
   - Leave the SPF **TXT** record as it is. Wait an hour, then send a test email to `hello@dr-ajokesings.com` to check it still arrives. (If the email app or phone signs in with the server name `dr-ajokesings.com`, change that to `mail.dr-ajokesings.com` too.)
2. **Add the domain in Vercel.** In the Vercel project (**spaw**) → **Settings → Domains**, add `dr-ajokesings.com` and `www.dr-ajokesings.com`, and choose to redirect `www` to `dr-ajokesings.com` (the redirect between the two is set here only, not in `vercel.json`, so the two can't send visitors back and forth). Vercel then shows the records it wants for **both** names, for example:
   - **A** record, name `@` (the bare domain): the address Vercel shows (such as `216.198.79.1` or `76.76.21.21`), replacing the old `135.125.230.200`;
   - **CNAME** record, name `www`: the name Vercel shows (such as `…vercel-dns-017.com`). **Delete the old `www` record first**: Truehost's default `www` points back at the old server, and while it's there, anyone sent to `www` gets the old server, where the site's CSS and scripts don't exist, so the page looks broken.
   Within an hour or so Vercel says *Valid configuration* for both names and issues the HTTPS certificates by itself.
3. **Supabase.** In **Authentication → URL Configuration**, set *Site URL* to `https://dr-ajokesings.com` and add `https://dr-ajokesings.com/admin` to *Redirect URLs* (keep the vercel.app ones while testing). And set up the emails the forms send: [`supabase/README.md`](supabase/README.md), "Emails" (Resend's DNS records go in the same Truehost DNS).
4. **Check.** `https://dr-ajokesings.com`, `https://www.dr-ajokesings.com` (should land on the first), an admin sign-in, a test registration (its ticket email), and a test email to the mailbox.

The old site on the cPanel server stays there, untouched, but no longer shows at the address. `robots.txt` / `sitemap.xml` name the domain for search engines.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Cinematic intro film, three-slide hero, featured song + album, catalogue, video, events, newsletter |
| `music.html` / `albums.html` / `song.html` | Catalogue with search and filters, album detail, song detail with lyrics |
| `media.html` | Her YouTube videos (live from the channel, category filters, embedded player) and event photo galleries (lightbox), on one page |
| `ministry.html` | Mission, pillars, the mentorship track, workshops, free resources |
| `symphony.html` | The Symphony concert and the Talent Quest (dates, tracks, prizes), with buttons to apply, to register for the concert and to volunteer |
| `spaw-apply.html` | The Talent Quest application (`/spaw-apply`), a page of its own; sent, it goes on to `spaw-apply-thank-you.html` |
| `register.html` | An event's registration form, one address per event (`/register?event=event-004`); sent, it goes on to `register-thank-you.html?event=…`, with the ticket to download and the calendar file |
| `spaw-volunteer.html` | Volunteer sign-up for SPAW (`/spaw-volunteer`): who they are, the teams and days they can serve, an emergency contact, and signing the volunteer terms by typing their full name; sent, it goes on to `spaw-volunteer-thank-you.html` |
| `spaw-volunteer-terms.html` | The Terms and Conditions for Volunteers (`/spaw-volunteer-terms`), with a print / save-as-PDF button |
| `events.html` | Full calendar, each event with its Register link (the Talent Quest with Apply instead) |
| `ticket.html` | The ticket page the ticket email links to: the designed ticket, ready to download |
| `about.html` | Story, timeline, principles, recognition |
| `contact.html` | Contact and booking as one form with two modes |
| `admin.html` | The admin: sign-in with roles; Pages and "Edit this page" for every word, link and picture; header, menus and footer; songs, albums, videos, galleries, events, Symphony, About lists, Ministry, artists, contact-page options and an announcement bar; drafts with preview, publishing and history; events with status, tickets, expected guests, sold out, and a registration form with their own questions; the inbox (enquiries, Talent Quest applicants with their entry playing in the admin, volunteers with the terms they signed, registrations, QR check-in, newsletter) with spreadsheet downloads; analytics (traffic, sources and campaigns, audience, pages, music and video, sign-ups step by step, site speed and errors); campaign links with QR codes; media library; people & roles; activity log. Works on a phone |

## Architecture

- **`js/data.js`** is the content layer and the seam to a real backend. Every read goes through an `api.*` method returning a Promise with simulated latency and real validation errors, so swapping `DB` for `fetch()` is mechanical rather than a rewrite. Anything visitors send (registrations, applications, enquiries, newsletter sign-ups) goes through `Backend.forms`: into the database when the site is live, into this browser's `localStorage` in demo mode.
- **Videos come from her YouTube channel.** `api._youtube()` in `data.js` asks the site's own `/api/youtube` ([`api/youtube.js`](api/youtube.js), which Vercel runs on its servers), caches the answer for 30 minutes, and merges it over the snapshot in `DB.videos`. New uploads therefore appear on the Media page and in the homepage video slot on their own, usually within the hour. `/api/youtube` uses the YouTube Data API when it has a key (see *Videos: the YouTube key* below) and otherwise the channel's public feed, which YouTube sometimes stops serving for days at a time (as in late September 2026). If both fail, the snapshot is shown. On a host without `/api` (or opened from disk) the browser reads the feed through the [rss2json](https://rss2json.com) relay instead. Videos play in an embedded player on a real host; opened from disk (`file://`), YouTube refuses embeds, so the links open YouTube instead.
- **`js/app.js`** carries the shared DOM helpers (`el`, `showLoading`, `showError`, `showEmpty`) used by every page script. Rendering is done with `createElement`/`textContent` — never `innerHTML` with data-derived strings.
- **Page scripts** (`music.js`, `media.js`, `events.js`, `talent.js`, `contact.js`, `about.js`, `hero.js`) each guard on their own hooks and no-op elsewhere, which is what lets one bundle load everywhere.
- **Every form has a page of its own, and so does its thank-you page** (their own addresses, for the analytics and for adverts to count). Event registration (`register.js`): every Register button (the Events page, the homepage's concert slide and its "See more" sheet, the Symphony page, the homepage's events) links to the event's page, `register?event=…`, which asks for a name, an email and a phone number with its country code, then the event's own questions, set in admin → Events → Registration form (ready-made: where people live, gender, age category; or any short answer, list, choice, tick box, number or date). The answers are kept with the registration, shown in the inbox and its spreadsheet, and counted in Analytics → Sign-ups. Once an event is sold out (ticked in the admin, or every place taken) or registration is closed, its buttons are disabled and say so, and so does its page; the number registered isn't shown on the site. Registered, the visitor goes on to `register-thank-you?event=…`: the designed ticket with its QR code, to download (`ticket.js`, also on `ticket.html`), a calendar file, and the WhatsApp channel. The Talent Quest takes applications, not registrations: it has no Register button, and its register page sends people to apply. The Talent Quest application is `spaw-apply` (thank-you: `spaw-apply-thank-you`), the volunteer sign-up `spaw-volunteer` (thank-you: `spaw-volunteer-thank-you`). A thank-you page's address carries no one's name or email (Google and Meta see addresses): what it shows is handed over in the browser tab (`FormDone` in `app.js`). Old links (`events?register=…`, `symphony#apply`) go to the new pages. `form-fields.js` holds the shared pieces (countries and dialling codes, Nigeria's states, gender, age categories).
- **Every form sends an email** (`supabase/functions/send-email`, through Resend): the ticket for a registration, and a reply suited to the Talent Quest application, a message, a booking request or a newsletter sign-up. Set up in `supabase/README.md`, "Emails"; demo mode sends none.
- **The Talent Quest calls for applicants.** While applications are open (admin → Symphony; they also close by themselves after the closing date), every Talent Quest apply button (`.btn-quest` in `main.css`) glows, has a light sweep across it and now and then wiggles, and `renderQuestCall()` in `app.js` puts a call to apply at the bottom of every page. The call steps aside for the homepage slider's controls and for the form itself, and a visitor can close it for the rest of their visit. Once applications close, the buttons stand still and point to the Quest's details. None of it moves under `prefers-reduced-motion`.
- **Progressive enhancement throughout.** GSAP and the QR library are both optional — if either CDN fails the page still works. The intro film, hero slideshow, and all scroll animation respect `prefers-reduced-motion`.
- **The logo** is her signature, traced from `assets/images/Dr. Ajokesings Logo.png` into `assets/images/logo.svg` (white, for dark backgrounds) and `logo-ink.svg` (for light ones). Each page carries the drawing once as `<symbol id="dj-logo">` and shows it with `<use>`; its entrance, three strands drawing together into the signature like rope, is CSS (`.sig` in `main.css`), held by `navigation.js` until the homepage intro clears and, in the footer, until it scrolls into view.
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

The inbox is where the website's forms land. Enquiries and applicants carry a status and team notes (applicants also a star rating, and their entry — a YouTube link — plays in the admin); registrations can be cancelled, restored, added by hand and checked in. *Event check-in* scans the QR code on a ticket with the phone's camera (the site has to be on https for that) or takes the ticket ID typed in. Every list downloads as a spreadsheet (CSV).

*Events* (in the sidebar's Events group) is where events are created and changed: kind of event, status (going ahead, postponed, cancelled), whether it shows on the site yet, dates and times (including events over several days), venue, address and map link, free or ticketed with prices and a ticket link, registration open or closed and a closing date, places, and **expected guests**, which isn't shown on the site: each event's panel, the Dashboard and the analytics follow registrations against it, with how many more are needed each day to get there.

The admin works on a phone: the sidebar folds into a bar with a Menu button, and check-in has big buttons for the door.

## Analytics

`js/track.js` counts visits on every public page, anonymously: no cookies, no names, no internet addresses stored. A browser gives itself a random name in its own storage; a visit ends after 30 minutes without activity. Nothing is counted when the browser asks not to be tracked (Do Not Track or Global Privacy Control), for automated visitors, or on browsers the team has signed in with (the Analytics screen has "Count my own visits" to undo that). Countries are estimated from the device's time zone; nothing is looked up.

What's counted: page views and time on each page (only while it's on screen), how far down people scroll, the homepage sections they reach, hero slides seen and tapped, buttons and phone-menu taps, where visitors came from (search, social, other sites, email, campaign links), device, browser, language, song plays and how much of each is heard, streaming-link taps by platform, video plays and "Watch on YouTube" taps, gallery opens, Music searches (including those that find nothing), every sign-up step (starting and sending a registration, application or booking; newsletter sign-ups), page speed and the errors visitors hit.

*Analytics* in the admin shows all of it for any period, compared with the period before, and every table downloads as a spreadsheet. *Campaign links* makes a tagged link for each post, broadcast or flyer (with a QR code to print), so visits through it, and the sign-ups they lead to, are counted under its campaign. Analytics start from the day the tracking goes live; in demo mode the screens mix made-up visits with the ones made in that browser, and say so.

### Google Analytics and the Meta Pixel

Separately from the above, and unlike it (both set cookies, so they ask first: see *Cookies* below), every public page carries the **Google tag** (`G-MWT8ZM5N43`, just after the `<meta name="viewport">`) and the **Meta Pixel** (`1354004723598509`, just before `</head>`), which counts a `PageView` on each page. `admin.html` has neither, so the team's own screens aren't counted and never load Meta's script beside people's details; nor does `videos.html`, which only forwards to Media.

The pixel's one other event is the standard **`Lead`**, sent by the thank-you page once a form has actually been saved (not when it's opened or sent with a mistake, and once, not again on a reload), through `api._lead()` in `js/data.js`:

| When | `content_category` | `content_name` | `eventID` |
| --- | --- | --- | --- |
| Someone registers for an event (the concert, or any other event) | `Event registration` | the event's name | the ticket ID (`REG-…`) |
| Someone applies to the Talent Quest | `Talent Quest application` | `SPAW Talent Quest` | the application ID (`SYM-…`) |

In Events Manager, a custom conversion on *Lead* filtered by `content_category` (or `content_name`) tells the two apart, for optimising one campaign on applications and another on concert registrations. The `eventID` is what Meta uses to count a lead once if the server ever reports it as well (Conversions API). Registrations made by hand in the admin aren't leads and aren't sent.

Each thank-you page has an address of its own, so Google Analytics can count them as conversions too (Admin → Events → create an event on `page_view` where `page_location` contains the address, then mark it as a key event), and Meta can make custom conversions from them:

| Thank-you page | After |
| --- | --- |
| `/register-thank-you?event=event-004` | registering for that event (each event its own; `/register-thank-you` alone for any) |
| `/spaw-apply-thank-you` | applying to the Talent Quest |
| `/spaw-volunteer-thank-you` | signing up to volunteer |

### Cookies

Google and Meta set cookies, so each page starts with theirs off, and [`js/consent.js`](js/consent.js) asks once, in a small panel at the bottom of the first page a visitor opens (after the homepage film): *Accept* or *Decline*, equally easy. The answer is remembered in the browser, and **Cookie settings**, beside *Admin* at the foot of every page, asks again.

- **Before an answer, and after Decline:** Google Analytics counts visits without cookies (Google's Consent Mode; its reports model what it can't see), and the Meta Pixel sends nothing. A registration or application made before answering is held, and reaches Meta if they then accept.
- **Accept:** both work as normal from then on, and Meta also gets what it held back on that page (the `PageView`, and a `Lead`).
- **Decline after accepting:** their cookies are removed.

This means Meta only sees the leads of people who accept. That's the cost of asking first, as Nigeria's data protection rules (and the UK's and EU's) expect of advertising cookies. The site's own counting (`js/track.js`) sets no cookies and doesn't ask.

## Videos: the YouTube key

Without a key the site reads her channel's public feed, which works most of the time; with one it uses the YouTube Data API, which doesn't go down with the feed. It's free (the site uses a few dozen of the 10,000 daily units). To add one, once:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (for example `dr-ajokesings`).
2. **APIs & Services → Library**: search for **YouTube Data API v3** and press **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Under *API restrictions*, restrict it to **YouTube Data API v3** and save. Leave *Application restrictions* at none: the key is used from Vercel's servers, never from a browser.
4. In Vercel, the **spaw** project → **Settings → Environment Variables**: add `YOUTUBE_API_KEY` with the key, for Production (and Preview if you like), then **Deployments → ⋯ → Redeploy** the latest one.
5. Check: `https://dr-ajokesings.com/api/youtube` should start `{"source":"api"`. (`"feed"` means it's reading the feed; an `error` says what's wrong.)

## Volunteers

`/spaw-volunteer` is the page to share for volunteers; the Symphony page links to it at the bottom. Volunteers give their details (phone with its country code, gender, age category, state and country, church), tick the teams they'd like to serve in and the days they can give, and name someone to call in an emergency. They sign the [Terms and Conditions for Volunteers](spaw-volunteer-terms.html) by ticking the box and typing their full name, which has to match the name they gave; the signature is kept with the date, the time and the version of the terms. One sign-up per email address.

- **Inbox → Volunteers** lists them, with filters by status, team and day, the full details and signature, buttons to email or WhatsApp them, notes, and a spreadsheet download. Statuses: New, Contacted, On the team, Not this time.
- **Content → Volunteering** switches sign-up on or off, sets the closing date, edits the teams, and holds the version of the terms. The days come from the Symphony dates (Content → Symphony), so they follow them.
- **Pages** edits the words of both pages. Changing the terms page's words? Change the version under Volunteering too, so each volunteer's record says which version they signed.
- Live, volunteers need [`supabase/setup-5.sql`](supabase/setup-5.sql) run once: until then the sign-up page can't send, and Inbox → Volunteers says so.

## Prototype boundaries

Media in `assets/` is placeholder and streaming links are stubs. Email alerts for new enquiries and applications aren't built yet.
