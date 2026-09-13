/**
 * config.js
 * ----------------------------------------------------------------------
 * Where the site keeps its content, submissions and admin logins.
 *
 * Left empty, the site runs in DEMO MODE: everything the admin changes is
 * kept in the browser it was made in (localStorage). Every admin screen
 * works, but nobody else sees the changes.
 *
 * Filled in, it runs LIVE on Supabase: see supabase/README.md. The public
 * key is meant to be published: the database's security rules, not this
 * key, decide what a visitor may read or write.
 * ----------------------------------------------------------------------
 */
window.SITE_CONFIG = {
  supabaseUrl: "",      // e.g. "https://abcdefghijklmnop.supabase.co"
  supabaseAnonKey: "",  // Project Settings → API: the anon / publishable key
};
