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
  supabaseUrl: "https://vmcthkprnilpylkzkdbq.supabase.co", // the project's address, nothing after .co
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtY3Roa3BybmlscHlsa3prZGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyODY5NDEsImV4cCI6MjEwNDg2Mjk0MX0.AvNnzppFOqDUyuokQ41Ks2lI4NjMhM1BKF4TTx9GmjI",  // Project Settings → API: the anon / publishable key
};
