# Connecting the site to Supabase

Until this is done the admin runs in **demo mode**: every screen works, but changes stay in the browser they were made in and visitors never see them. Connected to Supabase, the admin edits the live site for everyone, people sign in with their own accounts, and uploads go to online storage.

Supabase's free plan is enough to start. Nothing here needs a server of your own: the website stays a set of files on any host.

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and choose **New project**.
2. Give it a name (for example `dr-ajokesings`), set a strong database password and keep it somewhere safe, and pick the region nearest most visitors.
3. Wait a minute or two while it's created.

## 2. Run the setup scripts

1. Open [`setup.sql`](setup.sql) and, at the very bottom, replace `owner@example.com` and `Owner name` with the email address and name of the site's Owner.
2. In Supabase, open **SQL Editor → New query**, paste the whole file, and press **Run**. It should finish with "Success. No rows returned".
3. Do the same with [`setup-2.sql`](setup-2.sql), then [`setup-3.sql`](setup-3.sql), then [`setup-4.sql`](setup-4.sql). There's nothing to change in any of them.

`setup.sql` creates the tables for content, drafts, history, people and the activity log; the security rules that decide who can do what; and a public `media` folder for uploads. `setup-2.sql` adds the inbox: contact and booking enquiries, Talent Quest applications with a private folder for their audio and video samples, event registrations and check-in, and the newsletter list. `setup-3.sql` adds the analytics (anonymous visits and what happens in them, and the report the admin reads) and campaign links. `setup-4.sql` adds event registration and the Talent Quest application as they are now: registration that follows an event's status, closing date and places (stopping once it's sold out) and keeps the answers to the event's own registration questions, and applications that keep gender, age category, state and country. Running any of them again later is safe.

**Set up before a part existed?** Run the parts you haven't yet, in order. Until `setup-2.sql` has run, the website's forms can't save anything; until `setup-3.sql` has, visits aren't counted and the Analytics screen says so; until `setup-4.sql` has, registrations are saved without the answers to the event's own questions, and applications without gender, age category, state and country.

## 3. Sign-in settings

In **Authentication**:

- **Sign In / Providers → Email**: leave *Confirm email* switched **on**. Admin roles are matched by email address, so an address has to be confirmed before it can sign in.
- **URL Configuration**: set *Site URL* to the website's address (for example `https://dr-ajokesings.com`), and add `https://dr-ajokesings.com/admin` under *Redirect URLs*. Confirmation and password-reset emails link back there.

Supabase's built-in email sender allows only a few messages an hour on the free plan. That is plenty for confirming a handful of admins; if it ever isn't, add your own email sender under **Authentication → Emails → SMTP**.

## 4. Point the website at the project

In **Project Settings → API** (or **API Keys**), copy:

- the **Project URL** (`https://….supabase.co`), and
- the **anon** or **publishable** key.

Put them into [`js/config.js`](../js/config.js):

```js
window.SITE_CONFIG = {
  supabaseUrl: "https://abcdefghijklmnop.supabase.co",
  supabaseAnonKey: "…",
};
```

That key is meant to be public: it only lets a visitor do what the security rules allow, which is reading published content. Never put the **service_role** or **secret** key in the website.

## 5. First sign-in

1. The Owner opens `/admin` on the website and chooses **First time here? Create your password**, using the email from step 2.
2. Supabase sends a confirmation email; open the link in it.
3. Back on `/admin`, sign in. **People & roles** is where the Owner adds everyone else by name, email and role; each of them does the same three steps.

## 6. Emails to the people who send a form

Everyone who sends a form on the site gets an email straight away, from `hello@dr-ajokesings.com`:

| Form | The email |
| --- | --- |
| Event registration | **Their ticket**: the QR code to show at the door, the event's date, time and venue, and a button to the ticket page, where the designed ticket downloads to their phone. For an event with **Send a ticket** unticked (admin → Events), a confirmation instead. |
| Talent Quest application | "Your application is in": their details, what happens next, and the travel disclaimer |
| Contact message | "Thank you for your message", with their reference |
| Booking request | "We've got your booking request", with the date and details they gave |
| Newsletter | A welcome |

Every email points to the WhatsApp channel. The team registering someone by hand (Inbox → Registrations) sends them their ticket too.

The emails are written and sent by a small program in Supabase, [`functions/send-email`](functions/send-email/index.ts), through [Resend](https://resend.com) (free for up to 3,000 emails a month). Setting it up, once:

1. **Resend.** Create an account at resend.com. Under **Domains**, add `dr-ajokesings.com`. Resend lists a few DNS records (a TXT record named `resend._domainkey`, and an MX and a TXT record for `send`). Add each of them in the domain's DNS at Truehost (Client area → Domains → dr-ajokesings.com → Manage DNS), exactly as Resend shows them, then press **Verify** in Resend. These records sit alongside the website's and the mailbox's records and change neither. Then, under **API Keys**, create a key with *Sending access* and copy it.
2. **The function.** In Supabase, open **Edge Functions → Deploy a new function → Via Editor**. Name it `send-email`, replace the example code with everything in [`functions/send-email/index.ts`](functions/send-email/index.ts), and press **Deploy**. Then open the function's **Details** and switch **Enforce JWT verification** (Verify JWT) **off**, and save: email apps have to be able to load the QR code image without signing in. (The function checks everything itself: it only writes about a form saved in the last few hours, once, to the address on that form.)
3. **Its settings.** In **Edge Functions → Secrets**, add:

   | Name | Value |
   | --- | --- |
   | `RESEND_API_KEY` | the key from step 1 |
   | `MAIL_FROM` | `Dr AjokeSings <hello@dr-ajokesings.com>` |
   | `MAIL_REPLY_TO` | `hello@dr-ajokesings.com` (where replies go) |
   | `SITE_URL` | `https://dr-ajokesings.com` |

4. **The database.** Run [`setup-4.sql`](setup-4.sql) (again, if it has run before): it adds the column that makes sure each form gets one email.
5. **Try it.** Register for an event on the website with your own address. The success screen says "We've also emailed your ticket to …" once it has gone. If no email comes, **Edge Functions → send-email → Logs** says why, and so does the browser's console.

Until this is set up the site works as before, without the emails. The ticket email's details (date, venue) come from the events as published from the admin; publish the events list once so every event's details are there (the SPAW Global Concert's come from the Symphony page's settings either way).

## Who can do what

| | Owner | Editor | Team |
| --- | :---: | :---: | :---: |
| Edit and publish the website, upload files | ✓ | ✓ | |
| See the inbox, applicants, registrations; check people in | ✓ | ✓ | ✓ |
| Change statuses, ratings and notes; register someone by hand | ✓ | ✓ | ✓ |
| See the analytics; make campaign links | ✓ | ✓ | ✓ |
| Delete enquiries, applicants, registrations, subscribers | ✓ | | |
| Add, change and remove people | ✓ | | |

The database enforces this on every request, whatever a browser sends. Visitors can only read what has been published. There is always at least one Owner: the last one can't be removed or demoted.

## What's in the database

| Table | Holds |
| --- | --- |
| `admins` | Who can sign in: email, name, role |
| `content` | What's live: one row per page (`page:index`, `page:global` for the header, menus and footer) and one per list (`tracks`, `events`, `videos`, `announcements`…) |
| `content_drafts` | Changes saved but not yet published |
| `content_versions` | A full copy of the live content at every publish, for bringing an earlier version back |
| `activity` | Sign-ins, publishing, uploads, changes to people, and inbox status changes and check-ins |
| `enquiries` | Contact messages and booking requests, with their status and the team's notes |
| `applications` | Talent Quest applications: details, samples, stage, rating, notes |
| `registrations` | Event registrations: ticket ID, check-in time, cancelled or not |
| `subscribers` | The newsletter list |
| storage bucket `media` | Uploaded pictures and files (public) |
| storage bucket `applications` | Talent Quest samples (private: only the admin team can open them) |
| `analytics_sessions` | One row per visit: a random visit and browser name, where it came from, device, browser, language, estimated country |
| `analytics_events` | What happened in each visit: page views, time and scroll, taps, plays, searches, sign-up steps, speed, errors |
| `campaign_links` | The campaign links and flyer QR codes the team has made |

Visitors never read the inbox or analytics tables. The forms send through database functions (`submit_enquiry`, `register_for_event`, `submit_application`, `subscribe`) that check the details first; registration also checks the event is shown, going ahead, open, not past its closing date, and has room. Visits arrive through `track()`, which keeps only the events it knows and drops a visit that sends far more than a person could; the admin reads them through `analytics_report()` and `analytics_live()`, which answer only people on the admin list. Visits older than 25 months are cleared away by themselves.
