/**
 * backend.js
 * ----------------------------------------------------------------------
 * The one place the site talks to storage. Two interchangeable modes sit
 * behind the same methods:
 *
 *   demo — nothing set in config.js. Content, drafts, people, uploads and
 *          the activity log live in this browser's localStorage. Every
 *          admin screen works; nobody else sees the changes.
 *   live — config.js names a Supabase project. Content and uploads live
 *          there, admins sign in with real accounts, and the database's
 *          row-level security (supabase/setup.sql) decides who may do what.
 *
 * Public pages only call fetchPublished() and hasSessionHint(): a plain
 * fetch and a localStorage peek. The Supabase client library is loaded on
 * demand, by the admin and by "Edit this page".
 * ----------------------------------------------------------------------
 */
(() => {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  // A browser with drajokesings:forceDemo = "1" in its localStorage runs in
  // demo mode even when config.js names a project: for trying things out,
  // and for the automated tests, without touching the live site.
  let forceDemo = false;
  try { forceDemo = localStorage.getItem("drajokesings:forceDemo") === "1"; } catch (_) { /* storage blocked */ }
  const LIVE = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey) && !forceDemo;
  // The project's address, whether it was pasted with an API path or not.
  const SUPABASE_URL = String(cfg.supabaseUrl || "").trim().replace(/\/+$/, "").replace(/\/(rest|auth|storage)\/v1$/i, "");
  const AUTH_KEY = "drajokesings-auth";

  const now = () => new Date().toISOString();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const lower = (s) => String(s || "").trim().toLowerCase();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

  // The site's root folder (the one holding js/), so "js/vendor/…" and
  // "admin" resolve correctly from any page, including a GitHub Pages
  // project site that lives in a subfolder.
  const script = document.currentScript;
  const ROOT = script && script.src ? new URL("../", script.src).href : new URL("./", location.href).href;

  const ROLES = { owner: "Owner", editor: "Editor", team: "Team" };
  const ROLE_HELP = {
    owner: "Everything, including adding and removing people.",
    editor: "Edits and publishes the website, and sees the inbox.",
    team: "Inbox, applicants, registrations, check-in, the analytics and campaign links. Can't change the website.",
  };
  const can = (role, what) => {
    if (what === "edit") return role === "owner" || role === "editor";
    if (what === "people") return role === "owner";
    return Boolean(role);
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Couldn't load ${src}`));
      document.head.appendChild(s);
    });
  }

  function slugify(s) {
    return String(s || "file").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60) || "file";
  }

  /* -------------------------------------------------------------------
   * Images are shrunk in the browser before upload, so a phone photo of
   * several megabytes arrives as a few hundred kilobytes: lighter pages
   * on mobile data. PNGs with transparency stay PNG; everything else
   * becomes JPEG. SVG and GIF pass through untouched.
   * ----------------------------------------------------------------- */
  async function prepareImage(file, opts = {}) {
    const maxEdge = opts.maxEdge || (LIVE ? 2000 : 1400);
    const quality = opts.quality || (LIVE ? 0.82 : 0.72);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return file;
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch (_) { return file; }
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);

    let type = "image/jpeg";
    if (file.type === "image/png") {
      // Sample a small copy for any see-through pixel.
      const probe = document.createElement("canvas");
      probe.width = Math.min(64, w);
      probe.height = Math.min(64, h);
      const p = probe.getContext("2d");
      p.drawImage(canvas, 0, 0, probe.width, probe.height);
      const px = p.getImageData(0, 0, probe.width, probe.height).data;
      for (let i = 3; i < px.length; i += 4) { if (px[i] < 250) { type = "image/png"; break; } }
    }
    if (type === "image/jpeg") {
      // JPEG has no transparency: paint a white ground under the picture.
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    const blob = await new Promise((r) => canvas.toBlob(r, type, quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg");
    return new File([blob], name, { type });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.readAsDataURL(blob);
    });
  }

  /* ===================================================================
   * DEMO MODE — localStorage, through Store (data.js)
   * =================================================================== */
  const K = {
    published: "content:published",
    drafts: "content:drafts",
    versions: "content:versions",
    admins: "admins",
    session: "adminSession",
    activity: "activity",
    media: "media",
  };

  function localAdmins() {
    let list = Store.read(K.admins, null);
    if (!Array.isArray(list) || !list.some((a) => a.role === "owner")) {
      list = [{ email: "admin", name: "Demo owner", role: "owner", password: "symphony2026", addedAt: now(), addedBy: "demo" }];
      Store.write(K.admins, list);
    }
    return list;
  }
  const localSessionEmail = () => (Store.read(K.session, null) || {}).email || null;
  const localRole = () => {
    const email = localSessionEmail();
    const who = email && localAdmins().find((a) => a.email === email);
    return who ? who.role : null;
  };
  function requireRole(roles) {
    if (roles.includes(localRole())) return;
    throw new Error(roles.includes("editor") ? "Only Owners and Editors can do that." : "Only the Owner can do that.");
  }
  function localLog(action, target = "", detail = null) {
    const list = Store.read(K.activity, []);
    list.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: now(), actor: localSessionEmail() || "someone", action, target, detail });
    Store.write(K.activity, list.slice(0, 500));
  }
  function mustWrite(key, value) {
    if (!Store.write(key, value)) throw new Error("This browser's demo storage is full. Publish or discard changes, or delete something from the Media library.");
  }

  const demo = {
    auth: {
      async signIn(email, password) {
        await wait(300);
        const who = localAdmins().find((a) => a.email === lower(email));
        if (!who || !who.password || who.password !== password) throw new Error("That email and password don't match.");
        Store.write(K.session, { email: who.email, at: now() });
        localLog("sign-in", who.email);
        return { email: who.email, name: who.name, role: who.role };
      },
      async signUp(email, password) {
        await wait(300);
        const list = localAdmins();
        const who = list.find((a) => a.email === lower(email));
        if (!who) throw new Error("This email isn't on the admin list. Ask the site's Owner to add you.");
        if (who.password) throw new Error("This email already has a password. Sign in instead.");
        if (String(password).length < 8) throw new Error("Choose a password of at least 8 characters.");
        who.password = password;
        mustWrite(K.admins, list);
        return { needsConfirmation: false };
      },
      async signOut() { Store.remove(K.session); },
      async getSession() {
        const email = localSessionEmail();
        if (!email) return null;
        const who = localAdmins().find((a) => a.email === email);
        if (!who) { Store.remove(K.session); return null; }
        return { email: who.email, name: who.name, role: who.role };
      },
      async resetPassword() {
        throw new Error("Password-reset emails work once the site is connected to Supabase. In demo mode the Owner can set a new password on the People screen.");
      },
      async updatePassword(password) {
        if (String(password).length < 8) throw new Error("Choose a password of at least 8 characters.");
        const list = localAdmins();
        const who = list.find((a) => a.email === localSessionEmail());
        if (!who) throw new Error("Sign in first.");
        who.password = password;
        mustWrite(K.admins, list);
      },
      onRecovery() {},
    },

    content: {
      async getPublished() { return clone(Store.read(K.published, {})); },
      async getDrafts() { return clone(Store.read(K.drafts, {})); },
      async saveDraft(key, data) {
        requireRole(["owner", "editor"]);
        const drafts = Store.read(K.drafts, {});
        drafts[key] = { data: clone(data), updatedAt: now(), updatedBy: localSessionEmail() };
        mustWrite(K.drafts, drafts);
      },
      async discardDraft(key) {
        requireRole(["owner", "editor"]);
        const drafts = Store.read(K.drafts, {});
        if (!(key in drafts)) return;
        delete drafts[key];
        Store.write(K.drafts, drafts);
        localLog("discard", key);
      },
      async publish(note = "") {
        requireRole(["owner", "editor"]);
        const drafts = Store.read(K.drafts, {});
        const keys = Object.keys(drafts).sort();
        if (!keys.length) throw new Error("There is nothing to publish.");
        const published = Store.read(K.published, {});
        keys.forEach((k) => {
          if (drafts[k].data === null) delete published[k];
          else published[k] = drafts[k].data;
        });
        mustWrite(K.published, published);
        Store.write(K.drafts, {});
        const versions = Store.read(K.versions, []);
        const id = (versions[0] ? versions[0].id : 0) + 1;
        versions.unshift({ id, snapshot: clone(published), keys, note: String(note).trim() || null, publishedAt: now(), publishedBy: localSessionEmail() });
        // A snapshot per publish; the oldest fall away first if space runs short.
        let kept = versions.slice(0, 30);
        while (!Store.write(K.versions, kept) && kept.length > 1) kept = kept.slice(0, -1);
        localLog("publish", keys.join(", "), { version: id, note: String(note).trim() || null });
        return id;
      },
      async listVersions() {
        return Store.read(K.versions, []).map(({ snapshot, ...rest }) => rest);
      },
      async getVersion(id) {
        return clone(Store.read(K.versions, []).find((v) => v.id === id) || null);
      },
      async restoreVersion(id) {
        requireRole(["owner", "editor"]);
        const version = Store.read(K.versions, []).find((v) => v.id === id);
        if (!version) throw new Error("That version no longer exists.");
        const published = Store.read(K.published, {});
        const drafts = Store.read(K.drafts, {});
        let drafted = 0;
        new Set([...Object.keys(version.snapshot), ...Object.keys(published)]).forEach((k) => {
          const want = k in version.snapshot ? version.snapshot[k] : null;
          if (JSON.stringify(want) === JSON.stringify(k in published ? published[k] : null)) return;
          drafts[k] = { data: clone(want), updatedAt: now(), updatedBy: localSessionEmail() };
          drafted += 1;
        });
        mustWrite(K.drafts, drafts);
        localLog("restore", `version ${id}`, { drafted });
        return drafted;
      },
    },

    people: {
      async list() {
        return localAdmins().map(({ password, ...p }) => ({ ...p, hasPassword: Boolean(password) }));
      },
      async add({ name, email, role, password }) {
        requireRole(["owner"]);
        if (!isEmail(email)) throw new Error("Enter a valid email address.");
        if (!ROLES[role]) throw new Error("Choose a role.");
        const list = localAdmins();
        if (list.some((a) => a.email === lower(email))) throw new Error("That email is already on the list.");
        if (password && String(password).length < 8) throw new Error("A password needs at least 8 characters.");
        list.push({ email: lower(email), name: String(name || "").trim(), role, password: password || "", addedAt: now(), addedBy: localSessionEmail() });
        mustWrite(K.admins, list);
        localLog("people.insert", lower(email), { role, name: String(name || "").trim() });
      },
      async update(email, patch) {
        requireRole(["owner"]);
        const list = localAdmins();
        const who = list.find((a) => a.email === email);
        if (!who) throw new Error("That person is no longer on the list.");
        if (who.role === "owner" && patch.role && patch.role !== "owner" && list.filter((a) => a.role === "owner").length === 1) {
          throw new Error("The site needs at least one Owner.");
        }
        if (patch.password !== undefined && patch.password && String(patch.password).length < 8) throw new Error("A password needs at least 8 characters.");
        Object.assign(who, patch);
        mustWrite(K.admins, list);
        localLog("people.update", email, { role: who.role, name: who.name });
      },
      async remove(email) {
        requireRole(["owner"]);
        const list = localAdmins();
        const who = list.find((a) => a.email === email);
        if (!who) return;
        if (who.role === "owner" && list.filter((a) => a.role === "owner").length === 1) throw new Error("The site needs at least one Owner.");
        Store.write(K.admins, list.filter((a) => a.email !== email));
        localLog("people.delete", email, { role: who.role, name: who.name });
      },
    },

    activity: {
      async log(action, target, detail) { localLog(action, target, detail); },
      async list(limit = 300) { return Store.read(K.activity, []).slice(0, limit); },
    },

    media: {
      async upload(file, name = file.name) {
        requireRole(["owner", "editor"]);
        const dataUrl = await blobToDataUrl(file);
        const id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        mustWrite(`media:${id}`, dataUrl);
        const item = { path: id, url: `local-media:${id}`, name, type: file.type, size: file.size, addedAt: now(), addedBy: localSessionEmail() };
        const list = Store.read(K.media, []);
        list.unshift(item);
        mustWrite(K.media, list);
        localLog("media.upload", name);
        return item;
      },
      async list() { return Store.read(K.media, []); },
      async remove(path) {
        requireRole(["owner", "editor"]);
        const item = Store.read(K.media, []).find((m) => m.path === path);
        Store.remove(`media:${path}`);
        Store.write(K.media, Store.read(K.media, []).filter((m) => m.path !== path));
        localLog("media.delete", item ? item.name : path);
      },
    },
  };

  /* ===================================================================
   * LIVE MODE — Supabase
   * =================================================================== */
  // Newer Supabase projects issue "publishable" keys (sb_publishable_…),
  // which go in the apikey header only; older anon keys are JWTs, sent as
  // the bearer token as well.
  function publicHeaders() {
    const key = cfg.supabaseAnonKey;
    return /^sb_/.test(key) ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  }

  let clientPromise = null;
  function client() {
    if (!clientPromise) {
      clientPromise = (window.supabase ? Promise.resolve() : loadScript(`${ROOT}js/vendor/supabase.js`)).then(() =>
        window.supabase.createClient(SUPABASE_URL, cfg.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY },
        })
      );
    }
    return clientPromise;
  }

  function friendly(error) {
    const m = (error && (error.message || error.error_description)) || String(error);
    if (/invalid login credentials/i.test(m)) return new Error("That email and password don't match.");
    if (/email not confirmed/i.test(m)) return new Error("Confirm your email first: open the link Supabase sent you, then sign in.");
    if (/duplicate key|already exists/i.test(m)) return new Error("That already exists.");
    if (/row-level security|permission denied|violates row-level/i.test(m)) return new Error("Your role doesn't allow that.");
    if (/jwt expired|refresh token/i.test(m)) return new Error("Your session ran out. Sign in again.");
    if (/failed to fetch|networkerror/i.test(m)) return new Error("Couldn't reach Supabase. Check the connection and try again.");
    return new Error(m);
  }
  const must = ({ data, error }) => { if (error) throw friendly(error); return data; };

  const live = {
    auth: {
      async signIn(email, password) {
        const sb = await client();
        must(await sb.auth.signInWithPassword({ email: lower(email), password }));
        const session = await live.auth.getSession();
        if (!session) {
          await sb.auth.signOut();
          throw new Error("This email isn't on the admin list. Ask the site's Owner to add you.");
        }
        live.activity.log("sign-in", session.email);
        return session;
      },
      async signUp(email, password) {
        if (String(password).length < 8) throw new Error("Choose a password of at least 8 characters.");
        const sb = await client();
        const data = must(await sb.auth.signUp({ email: lower(email), password, options: { emailRedirectTo: `${ROOT}admin` } }));
        return { needsConfirmation: !data.session };
      },
      async signOut() { const sb = await client(); await sb.auth.signOut(); },
      async getSession() {
        const sb = await client();
        const { data } = await sb.auth.getSession();
        const email = data.session && data.session.user && data.session.user.email;
        if (!email) return null;
        const { data: row, error } = await sb.from("admins").select("email,name,role").eq("email", lower(email)).maybeSingle();
        return error || !row ? null : row;
      },
      async resetPassword(email) {
        const sb = await client();
        must(await sb.auth.resetPasswordForEmail(lower(email), { redirectTo: `${ROOT}admin` }));
      },
      async updatePassword(password) {
        if (String(password).length < 8) throw new Error("Choose a password of at least 8 characters.");
        const sb = await client();
        must(await sb.auth.updateUser({ password }));
      },
      async onRecovery(callback) {
        const sb = await client();
        sb.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") callback(); });
      },
    },

    content: {
      async getPublished() {
        const sb = await client();
        const rows = must(await sb.from("content").select("key,data"));
        return Object.fromEntries(rows.map((r) => [r.key, r.data]));
      },
      async getDrafts() {
        const sb = await client();
        const rows = must(await sb.from("content_drafts").select("key,data,updated_at,updated_by"));
        return Object.fromEntries(rows.map((r) => [r.key, { data: r.data, updatedAt: r.updated_at, updatedBy: r.updated_by }]));
      },
      async saveDraft(key, data) {
        const sb = await client();
        must(await sb.from("content_drafts").upsert({ key, data }));
      },
      async discardDraft(key) {
        const sb = await client();
        must(await sb.from("content_drafts").delete().eq("key", key));
        live.activity.log("discard", key);
      },
      async publish(note = "") {
        const sb = await client();
        return must(await sb.rpc("publish_content", { note: String(note || "") }));
      },
      async listVersions() {
        const sb = await client();
        const rows = must(await sb.from("content_versions").select("id,keys,note,published_at,published_by").order("id", { ascending: false }).limit(30));
        return rows.map((r) => ({ id: r.id, keys: r.keys || [], note: r.note, publishedAt: r.published_at, publishedBy: r.published_by }));
      },
      async getVersion(id) {
        const sb = await client();
        const r = must(await sb.from("content_versions").select("id,snapshot,keys,note,published_at,published_by").eq("id", id).maybeSingle());
        return r ? { id: r.id, snapshot: r.snapshot, keys: r.keys || [], note: r.note, publishedAt: r.published_at, publishedBy: r.published_by } : null;
      },
      async restoreVersion(id) {
        const sb = await client();
        return must(await sb.rpc("restore_version", { version_id: id }));
      },
    },

    people: {
      async list() {
        const sb = await client();
        const rows = must(await sb.from("admins").select("email,name,role,added_at,added_by").order("added_at"));
        return rows.map((r) => ({ email: r.email, name: r.name, role: r.role, addedAt: r.added_at, addedBy: r.added_by }));
      },
      async add({ name, email, role }) {
        if (!isEmail(email)) throw new Error("Enter a valid email address.");
        if (!ROLES[role]) throw new Error("Choose a role.");
        const sb = await client();
        const { error } = await sb.from("admins").insert({ email: lower(email), name: String(name || "").trim(), role });
        if (error && /duplicate key/i.test(error.message)) throw new Error("That email is already on the list.");
        if (error) throw friendly(error);
      },
      async update(email, patch) {
        const sb = await client();
        const row = {};
        if (patch.name !== undefined) row.name = String(patch.name).trim();
        if (patch.role !== undefined) row.role = patch.role;
        must(await sb.from("admins").update(row).eq("email", email));
      },
      async remove(email) {
        const sb = await client();
        must(await sb.from("admins").delete().eq("email", email));
      },
    },

    activity: {
      async log(action, target = "", detail = null) {
        try {
          const sb = await client();
          await sb.from("activity").insert({ action, target: String(target || ""), detail });
        } catch (_) { /* the log must never block the work it records */ }
      },
      async list(limit = 300) {
        const sb = await client();
        return must(await sb.from("activity").select("id,at,actor,action,target,detail").order("at", { ascending: false }).limit(limit));
      },
    },

    media: {
      async upload(file, name = file.name) {
        const sb = await client();
        const ext = (name.match(/\.([a-z0-9]{2,5})$/i) || [, (file.type.split("/")[1] || "bin")])[1].toLowerCase();
        const path = `library/${Date.now().toString(36)}-${slugify(name.replace(/\.[^.]+$/, ""))}.${ext}`;
        must(await sb.storage.from("media").upload(path, file, { contentType: file.type || undefined, cacheControl: "31536000", upsert: false }));
        const { data } = sb.storage.from("media").getPublicUrl(path);
        live.activity.log("media.upload", name);
        return { path, url: data.publicUrl, name, type: file.type, size: file.size, addedAt: now() };
      },
      async list() {
        const sb = await client();
        const rows = must(await sb.storage.from("media").list("library", { limit: 1000, sortBy: { column: "created_at", order: "desc" } }));
        return rows
          .filter((r) => r.id)
          .map((r) => {
            const path = `library/${r.name}`;
            return {
              path,
              url: sb.storage.from("media").getPublicUrl(path).data.publicUrl,
              name: r.name.replace(/^[a-z0-9]+-/, ""),
              type: (r.metadata && r.metadata.mimetype) || "",
              size: (r.metadata && r.metadata.size) || 0,
              addedAt: r.created_at,
            };
          });
      },
      async remove(path) {
        const sb = await client();
        must(await sb.storage.from("media").remove([path]));
        live.activity.log("media.delete", path);
      },
    },
  };

  /* -------------------------------------------------------------------
   * Public-page helpers (no client library needed)
   * ----------------------------------------------------------------- */
  async function fetchPublished() {
    if (!LIVE) return clone(Store.read(K.published, {}));
    const res = await fetch(`${SUPABASE_URL}/rest/v1/content?select=key,data`, { headers: publicHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`content request failed (${res.status})`);
    const rows = await res.json();
    return Object.fromEntries(rows.map((r) => [r.key, r.data]));
  }

  function hasSessionHint() {
    if (!LIVE) return Boolean(Store.read(K.session, null));
    try { return Boolean(localStorage.getItem(AUTH_KEY)); } catch (_) { return false; }
  }

  // Demo uploads are stored separately and referenced as local-media:<id>,
  // so content and version snapshots stay small.
  function resolveMediaUrl(src) {
    const m = /^local-media:([a-z0-9-]+)$/i.exec(String(src || ""));
    if (!m) return src;
    return Store.read(`media:${m[1]}`, "") || "";
  }

  /* ===================================================================
   * FORMS AND THE INBOX
   * What visitors send (enquiries, event registrations, Talent Quest
   * applications, newsletter sign-ups) and what the team does with it.
   * Live, visitors send it through database functions that check the
   * details and never let them read anything back (supabase/setup-2.sql);
   * the team reads and updates it signed in. Demo keeps it in this
   * browser, under the keys the site has always used.
   * =================================================================== */
  const STATUS = {
    enquiries: ["new", "replied", "confirmed", "declined", "archived"],
    applications: ["received", "shortlisted", "invited", "selected", "not-selected"],
    registrations: ["registered", "cancelled"],
  };
  const newRef = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const statusOf = (s, list) => {
    const v = String(s || "").toLowerCase().replace(/\s+/g, "-");
    return list.includes(v) ? v : list[0];
  };
  const FORM_KEYS = { enquiries: "enquiries", applications: "talentApplications", registrations: "registrations", subscribers: "newsletter" };
  // The answers to an event's own questions, kept to a sensible size (the
  // database trims them the same way, setup-4.sql).
  function cleanAnswers(list) {
    return (Array.isArray(list) ? list : []).filter((a) => a && a.id).slice(0, 40).map((a) => ({
      id: String(a.id).slice(0, 80),
      label: String(a.label || "").slice(0, 200),
      type: String(a.type || "text").slice(0, 20),
      value: a.value && typeof a.value === "object"
        ? { state: String(a.value.state || "").slice(0, 100), country: String(a.value.country || "").slice(0, 100) }
        : String(a.value == null ? "" : a.value).slice(0, 2000),
    }));
  }

  function fromDemo(kind, r) {
    if (kind === "subscribers") return typeof r === "string" ? { email: r, source: "", subscribedAt: null, unsubscribedAt: null } : { unsubscribedAt: null, ...r };
    if (kind === "enquiries") return { ...r, status: statusOf(r.status, STATUS.enquiries), note: r.note || "" };
    if (kind === "applications") return { ...r, status: statusOf(r.status, STATUS.applications), rating: r.rating || 0, note: r.note || "", files: r.files || [] };
    if (kind === "registrations") return { ...r, status: r.status || "registered", note: r.note || "", source: r.source || "website", answers: Array.isArray(r.answers) ? r.answers : [] };
    return r;
  }
  const demoKeyOf = (kind, r) => (kind === "subscribers" ? (typeof r === "string" ? r : r.email) : r.id);
  function logInboxChange(kind, before, after) {
    const label = after.name || after.fullName || after.email || "";
    if (kind === "registrations" && after.checkedIn && !before.checkedIn) localLog("registration.checkin", label, { event: after.eventName, id: after.id });
    if (before.status !== undefined && after.status !== before.status) localLog(`${kind}.status`, label, { status: after.status, id: after.id });
  }

  demo.forms = {
    async submitEnquiry(payload) {
      const list = Store.read(FORM_KEYS.enquiries, []);
      const enquiry = { id: newRef(payload.type === "booking" ? "BKG" : "MSG"), submittedAt: now(), status: "new", note: "", ...payload };
      list.push(enquiry);
      mustWrite(FORM_KEYS.enquiries, list);
      if (payload.joinNewsletter) { try { await demo.forms.subscribe(payload.email, "contact form"); } catch (_) { /* already on the list */ } }
      return enquiry;
    },
    async subscribe(email, source = "") {
      const list = Store.read(FORM_KEYS.subscribers, []).map((s) => fromDemo("subscribers", s));
      const mail = lower(email);
      const found = list.find((s) => s.email === mail);
      if (found && !found.unsubscribedAt) throw new Error("You're already on the list.");
      if (found) Object.assign(found, { unsubscribedAt: null, subscribedAt: now(), source });
      else list.push({ email: mail, source, subscribedAt: now(), unsubscribedAt: null });
      mustWrite(FORM_KEYS.subscribers, list);
      return { email: mail };
    },
    async registerForEvent(event, attendee, source = "website") {
      const list = Store.read(FORM_KEYS.registrations, []);
      const mail = lower(attendee.email);
      if (list.some((r) => r.eventId === event.id && lower(r.email) === mail && (r.status || "registered") === "registered")) {
        throw new Error("You're already registered for this event with that email.");
      }
      const reg = {
        id: newRef("REG"), eventId: event.id, eventName: event.name,
        name: String(attendee.name).trim(), email: String(attendee.email).trim(), phone: String(attendee.phone || "").trim(),
        answers: cleanAnswers(attendee.answers),
        status: "registered", checkedIn: false, checkedInAt: null, source, note: "", registeredAt: now(),
      };
      list.push(reg);
      mustWrite(FORM_KEYS.registrations, list);
      return reg;
    },
    async addRegistration(event, attendee) { return demo.forms.registerForEvent(event, attendee, "admin"); },
    async submitApplication(payload, files = []) {
      const list = Store.read(FORM_KEYS.applications, []);
      // A browser can't hold audio or video for the demo: the names are kept.
      const application = {
        id: newRef("SYM"), submittedAt: now(), status: "received", rating: 0, note: "", ...payload,
        files: files.map((f) => ({ name: f.name, size: f.size, type: f.type, kind: f.kind || "", path: null })),
      };
      list.push(application);
      mustWrite(FORM_KEYS.applications, list);
      return application;
    },
    async eventCounts() {
      const counts = {};
      Store.read(FORM_KEYS.registrations, []).forEach((r) => {
        if ((r.status || "registered") === "registered") counts[r.eventId] = (counts[r.eventId] || 0) + 1;
      });
      return counts;
    },
    async list(kind) {
      return Store.read(FORM_KEYS[kind], []).map((r) => fromDemo(kind, r));
    },
    async update(kind, id, patch) {
      const list = Store.read(FORM_KEYS[kind], []);
      const i = list.findIndex((r) => demoKeyOf(kind, r) === id);
      if (i === -1) throw new Error("That entry no longer exists.");
      const before = fromDemo(kind, list[i]);
      const after = { ...before, ...patch, updatedAt: now(), updatedBy: localSessionEmail() };
      list[i] = after;
      mustWrite(FORM_KEYS[kind], list);
      logInboxChange(kind, before, after);
      return after;
    },
    async remove(kind, id) {
      requireRole(["owner"]);
      const list = Store.read(FORM_KEYS[kind], []);
      Store.write(FORM_KEYS[kind], list.filter((r) => demoKeyOf(kind, r) !== id));
      localLog(`${kind}.delete`, id);
    },
    async checkIn(id) {
      const list = Store.read(FORM_KEYS.registrations, []);
      const reg = list.find((r) => String(r.id).toUpperCase() === String(id).trim().toUpperCase());
      if (!reg) throw new Error("No registration found with that ID.");
      if (reg.status === "cancelled") throw new Error("That registration was cancelled.");
      if (reg.checkedIn) throw new Error(`Already checked in at ${new Date(reg.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`);
      const before = { ...reg };
      reg.checkedIn = true;
      reg.checkedInAt = now();
      mustWrite(FORM_KEYS.registrations, list);
      logInboxChange("registrations", before, reg);
      return fromDemo("registrations", reg);
    },
    async fileUrl() { return null; },
  };

  // Calls a database function as a visitor (no sign-in, no client library).
  // quiet: the caller handles a function that's missing or older.
  async function rpc(name, args, { quiet = false } = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { ...publicHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    if (!res.ok) {
      const code = body && body.code;
      if (code === "PGRST202" || res.status === 404) {
        if (!quiet) console.error(`[backend] ${name}() isn't in the database, or is an older version: run the supabase/setup-*.sql files in Supabase.`);
        const err = new Error("Sorry, this can't be sent just now. Please try again later.");
        err.code = "PGRST202";
        throw err;
      }
      throw new Error((body && body.message) || `Request failed (${res.status}).`);
    }
    return body;
  }
  const answersMissing = () => console.error("[backend] Registration saved without the form's answers: run supabase/setup-4.sql in Supabase so they're kept.");

  // Talent Quest samples go straight into the private "applications" folder.
  async function uploadSample(file) {
    const ext = (file.name.match(/\.[a-z0-9]{2,5}$/i) || [""])[0].toLowerCase();
    const path = `incoming/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}/${slugify(file.name.replace(/\.[^.]+$/, ""))}${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/applications/${path}`, {
      method: "POST",
      headers: { ...publicHeaders(), "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
      body: file,
    });
    if (!res.ok) {
      let message = "";
      try { message = (await res.json()).message || ""; } catch (_) { /* no body */ }
      throw new Error(message ? `The file didn't upload: ${message}` : `The file didn't upload (${res.status}).`);
    }
    return { path, name: file.name, size: file.size, type: file.type, kind: file.kind || "" };
  }

  function fromRow(kind, r) {
    if (kind === "enquiries") {
      return { ...(r.data || {}), id: r.id, type: r.type, status: r.status, name: r.name, email: r.email, phone: r.phone || "", subject: r.subject || "", message: r.message || "", note: r.note || "", submittedAt: r.submitted_at, updatedAt: r.updated_at, updatedBy: r.updated_by };
    }
    if (kind === "applications") {
      const d = r.data || {};
      return { ...d, id: r.id, fullName: r.full_name, email: r.email, phone: r.phone || "", location: r.location || "", track: r.track || "", status: r.status, rating: r.rating || 0, note: r.note || "", files: d.files || [], submittedAt: r.submitted_at, updatedAt: r.updated_at, updatedBy: r.updated_by };
    }
    if (kind === "registrations") {
      return { id: r.id, eventId: r.event_id, eventName: r.event_name, name: r.name, email: r.email, phone: r.phone || "", answers: Array.isArray(r.answers) ? r.answers : [], status: r.status, checkedIn: r.checked_in, checkedInAt: r.checked_in_at, source: r.source, note: r.note || "", registeredAt: r.registered_at, updatedAt: r.updated_at };
    }
    if (kind === "subscribers") return { email: r.email, source: r.source || "", subscribedAt: r.subscribed_at, unsubscribedAt: r.unsubscribed_at };
    return r;
  }
  const ROW_FIELDS = { status: "status", note: "note", rating: "rating", checkedIn: "checked_in", checkedInAt: "checked_in_at", unsubscribedAt: "unsubscribed_at" };
  const ORDER = { enquiries: "submitted_at", applications: "submitted_at", registrations: "registered_at", subscribers: "subscribed_at" };

  live.forms = {
    async submitEnquiry(payload) {
      const r = await rpc("submit_enquiry", { payload });
      return { ...payload, id: r.id, submittedAt: r.submittedAt, status: "new" };
    },
    async subscribe(email, source = "") {
      const r = await rpc("subscribe", { p_email: email, p_source: source });
      if (r === "exists") throw new Error("You're already on the list.");
      return { email: lower(email) };
    },
    // Before setup-4.sql has run, the database's register_for_event doesn't
    // take answers: the registration still goes through, without them.
    async registerForEvent(event, attendee) {
      const args = { p_event_id: event.id, p_event_name: event.name, p_name: attendee.name, p_email: attendee.email, p_phone: attendee.phone || null };
      try {
        return await rpc("register_for_event", { ...args, p_answers: cleanAnswers(attendee.answers) }, { quiet: true });
      } catch (err) {
        if (err.code !== "PGRST202") throw err;
        answersMissing();
        return rpc("register_for_event", args);
      }
    },
    async addRegistration(event, attendee) {
      const sb = await client();
      const args = { p_event_id: event.id, p_event_name: event.name, p_name: attendee.name, p_email: attendee.email, p_phone: attendee.phone || null };
      const first = await sb.rpc("register_for_event", { ...args, p_answers: cleanAnswers(attendee.answers) });
      if (first.error && first.error.code === "PGRST202") { answersMissing(); return must(await sb.rpc("register_for_event", args)); }
      return must(first);
    },
    async submitApplication(payload, files = []) {
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadSample(f));
      const r = await rpc("submit_application", { payload: { ...payload, files: uploaded } });
      return { ...payload, id: r.id, submittedAt: r.submittedAt, files: uploaded };
    },
    async eventCounts() {
      const rows = await rpc("event_counts", {});
      return Object.fromEntries((rows || []).map((r) => [r.event_id, Number(r.registered)]));
    },
    async list(kind) {
      const sb = await client();
      const rows = must(await sb.from(kind).select("*").order(ORDER[kind], { ascending: false }).limit(5000));
      return rows.map((r) => fromRow(kind, r));
    },
    async update(kind, id, patch) {
      const row = {};
      Object.entries(patch).forEach(([k, v]) => { if (ROW_FIELDS[k]) row[ROW_FIELDS[k]] = v; });
      const sb = await client();
      const data = must(await sb.from(kind).update(row).eq(kind === "subscribers" ? "email" : "id", id).select().maybeSingle());
      if (!data) throw new Error("That entry no longer exists, or your role can't change it.");
      return fromRow(kind, data);
    },
    async remove(kind, id) {
      const sb = await client();
      must(await sb.from(kind).delete().eq(kind === "subscribers" ? "email" : "id", id));
    },
    async checkIn(id) {
      const sb = await client();
      return fromRow("registrations", must(await sb.rpc("check_in", { p_id: id })));
    },
    async fileUrl(path) {
      const sb = await client();
      const { data, error } = await sb.storage.from("applications").createSignedUrl(path, 3600);
      if (error) throw friendly(error);
      return data.signedUrl;
    },
  };

  /* ===================================================================
   * ANALYTICS
   * The public pages send what happens through track.js; the admin reads
   * the report. Live, the database keeps the visits and works the report
   * out (supabase/setup-3.sql). Demo keeps this browser's own visits and
   * mixes in made-up ones (analytics-core.js) so the screens have
   * something to show; the admin says so.
   * =================================================================== */
  const A_KEY = "analytics:events";
  const A_NAMES = new Set([
    "pageview", "engagement", "slide", "slide_tap", "cta", "menu", "outbound", "stream", "youtube",
    "play", "heard", "video", "gallery", "search", "register_open", "registered", "apply_start",
    "applied", "booking_start", "booking", "enquiry", "newsletter", "error",
  ]);
  const cut = (v, n) => (v == null || v === "" ? null : String(v).slice(0, n));
  const numeric = (v) => (v != null && /^-?\d{1,12}(\.\d{1,6})?$/.test(String(v)) ? Number(v) : null);
  const campaignFromRow = (r) => ({
    id: r.id, name: r.name, destination: r.destination || "", source: r.source, medium: r.medium || "",
    campaign: r.campaign, content: r.content || "", createdAt: r.created_at, createdBy: r.created_by || "",
  });
  let madeUp = null;

  demo.analytics = {
    madeUp: true,
    send(p) {
      const rows = Store.read(A_KEY, []);
      let id = rows.length ? rows[rows.length - 1].id : 1e9;
      const at = now();
      (p.events || []).slice(0, 50).forEach((e) => {
        if (!A_NAMES.has(e.n)) return;
        rows.push({
          id: ++id, at, sid: p.sid, vid: p.vid, isNew: Boolean(p.new),
          ref: cut(p.ref, 120), channel: cut(p.ch, 20), source: cut(p.src && String(p.src).toLowerCase(), 60),
          medium: cut(p.med && String(p.med).toLowerCase(), 60), campaign: cut(p.cmp && String(p.cmp).toLowerCase(), 80),
          device: cut(p.dev, 12), browser: cut(p.br, 30), os: cut(p.os, 20), lang: cut(p.lang, 20), country: cut(p.cty, 60),
          name: e.n, path: cut(e.p, 200), title: cut(e.t, 150), value: numeric(e.v), label: cut(e.l, 150),
          props: e.x && typeof e.x === "object" && JSON.stringify(e.x).length <= 1500 ? e.x : null,
        });
      });
      Store.write(A_KEY, rows.slice(-6000));
    },
    // This browser's visits, after 120 days of made-up ones.
    rows() {
      if (!window.AnalyticsCore) throw new Error("The analytics aren't loaded on this page.");
      if (!madeUp) {
        const titleOf = (v) => (window.api && api._videoFromYouTube ? api._videoFromYouTube(v).title : v.title);
        madeUp = AnalyticsCore.sample({
          days: 120, seed: 7, now: Date.now() - 60e3,
          catalog: { tracks: DB.tracks, videos: DB.videos.slice(0, 8).map((v) => ({ title: titleOf(v) })), events: DB.events, galleries: DB.galleries },
        });
      }
      return madeUp.concat(Store.read(A_KEY, []));
    },
    async report(from, to, light = false) {
      await wait(120);
      return AnalyticsCore.aggregate(demo.analytics.rows(), { from, to, light });
    },
    async live() { return AnalyticsCore.live(demo.analytics.rows()); },
    campaigns: {
      async list() { return clone(Store.read("campaignLinks", [])); },
      async save(link) {
        const list = Store.read("campaignLinks", []);
        const i = list.findIndex((l) => l.id === link.id);
        const row = { ...link, createdAt: link.createdAt || now(), createdBy: link.createdBy || localSessionEmail() || "" };
        if (i === -1) list.unshift(row); else list[i] = row;
        mustWrite("campaignLinks", list);
        return clone(row);
      },
      async remove(id) { Store.write("campaignLinks", Store.read("campaignLinks", []).filter((l) => l.id !== id)); },
    },
  };

  let trackingMissing = false; // the database hasn't had setup-3.sql yet
  live.analytics = {
    madeUp: false,
    send(p, { final = false } = {}) {
      if (trackingMissing) return Promise.resolve();
      return fetch(`${SUPABASE_URL}/rest/v1/rpc/track`, {
        method: "POST",
        headers: { ...publicHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ p }),
        keepalive: final,
      }).then((res) => { if (res.status === 404) trackingMissing = true; })
        .catch(() => { /* a lost count must never trouble the visitor */ });
    },
    async report(from, to, light = false) {
      const sb = await client();
      return must(await sb.rpc("analytics_report", { p_from: from, p_to: to, p_light: light }));
    },
    async live() {
      const sb = await client();
      return must(await sb.rpc("analytics_live"));
    },
    campaigns: {
      async list() {
        const sb = await client();
        return (must(await sb.from("campaign_links").select("*").order("created_at", { ascending: false })) || []).map(campaignFromRow);
      },
      async save(link) {
        const sb = await client();
        const row = {
          id: link.id, name: link.name, destination: link.destination || "", source: link.source,
          medium: link.medium || "", campaign: link.campaign, content: link.content || null,
        };
        return campaignFromRow(must(await sb.from("campaign_links").upsert(row).select().single()));
      },
      async remove(id) {
        const sb = await client();
        must(await sb.from("campaign_links").delete().eq("id", id));
      },
    },
  };

  /* ===================================================================
   * EMAILS
   * Straight after a form is saved, the site asks the send-email function
   * (supabase/functions/send-email) to write to the person: their ticket,
   * or a reply suited to the form. The function reads the saved form
   * itself and sends one email each. Demo mode sends nothing.
   * =================================================================== */
  const email = {
    async send(kind, id) {
      if (!LIVE || !id) return { sent: false, demo: !LIVE };
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: { ...publicHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id }),
        });
        const body = await res.json().catch(() => ({}));
        if (!body.sent && body.reason !== "already sent") console.warn(`[backend] No email for ${kind} ${id}: ${body.reason || `the send-email function answered ${res.status}`}. See supabase/README.md, "Emails".`);
        return { sent: Boolean(body.sent), reason: body.reason };
      } catch (err) {
        console.warn("[backend] The send-email function couldn't be reached. See supabase/README.md, \"Emails\".", err.message);
        return { sent: false };
      }
    },
  };

  const impl = LIVE ? live : demo;
  window.Backend = Object.freeze({
    mode: LIVE ? "live" : "demo",
    root: ROOT,
    ROLES,
    ROLE_HELP,
    STATUS,
    can,
    isEmail,
    fetchPublished,
    hasSessionHint,
    resolveMediaUrl,
    prepareImage,
    auth: impl.auth,
    content: impl.content,
    people: impl.people,
    activity: impl.activity,
    media: impl.media,
    forms: impl.forms,
    analytics: impl.analytics,
    email,
  });
})();
