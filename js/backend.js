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
  const LIVE = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const SUPABASE_URL = String(cfg.supabaseUrl || "").replace(/\/+$/, "");
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
    team: "Inbox, applicants, registrations and check-in. Can't change the website.",
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

  const impl = LIVE ? live : demo;
  window.Backend = Object.freeze({
    mode: LIVE ? "live" : "demo",
    root: ROOT,
    ROLES,
    ROLE_HELP,
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
  });
})();
