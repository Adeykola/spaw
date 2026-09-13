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
3. Do the same with [`setup-2.sql`](setup-2.sql), then with [`setup-3.sql`](setup-3.sql). There's nothing to change in either.

`setup.sql` creates the tables for content, drafts, history, people and the activity log; the security rules that decide who can do what; and a public `media` folder for uploads. `setup-2.sql` adds the inbox: contact and booking enquiries, Talent Quest applications with a private folder for their audio and video samples, event registrations and check-in, and the newsletter list. `setup-3.sql` adds the analytics (anonymous visits and what happens in them, and the report the admin reads), campaign links, and event registration that follows an event's status and closing date. Running any of them again later is safe.

**Set up before a part existed?** Run the parts you haven't yet, in order. Until `setup-2.sql` has run, the website's forms can't save anything; until `setup-3.sql` has, visits aren't counted and the Analytics screen says so.

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
