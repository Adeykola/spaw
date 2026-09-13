-- ============================================================================
-- Dr AjokeSings: Supabase setup, part 1
-- Admin accounts and roles, the site's content (drafts, publishing,
-- history), the activity log, and uploads.
--
-- How to run it (full steps in supabase/README.md):
--   1. Change the Owner's email and name at the very bottom of this file.
--   2. Supabase → SQL Editor → New query → paste all of this → Run.
-- Running it again is safe: it only adds what is missing and refreshes the
-- rules.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Who may use the admin, and as what
-- ----------------------------------------------------------------------------
create table if not exists public.admins (
  email     text primary key check (email = lower(email)),
  name      text not null default '',
  role      text not null check (role in ('owner', 'editor', 'team')),
  added_by  text default lower(coalesce(auth.jwt() ->> 'email', '')),
  added_at  timestamptz not null default now()
);

-- The signed-in person's role, or null. Supabase only gives out a session
-- once the email address has been confirmed, so an address on this list
-- is one its owner really controls.
create or replace function public.admin_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.admins where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_admin(roles text[] default array['owner', 'editor', 'team'])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.admin_role() = any (roles), false);
$$;

-- There must always be at least one Owner.
create or replace function public.keep_an_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (select 1 from public.admins where role = 'owner' and email <> old.email) then
      raise exception 'The site needs at least one Owner.';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists admins_keep_an_owner on public.admins;
create trigger admins_keep_an_owner
  before update or delete on public.admins
  for each row execute function public.keep_an_owner();


-- ----------------------------------------------------------------------------
-- 2. The activity log
-- ----------------------------------------------------------------------------
create table if not exists public.activity (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  actor   text not null default lower(coalesce(auth.jwt() ->> 'email', 'system')),
  action  text not null,
  target  text,
  detail  jsonb
);
create index if not exists activity_at on public.activity (at desc);

-- Changes to people are written to the log by the database itself.
create or replace function public.log_people_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity (actor, action, target, detail)
  values (
    lower(coalesce(auth.jwt() ->> 'email', 'system')),
    'people.' || lower(tg_op),
    coalesce(new.email, old.email),
    jsonb_build_object('role', coalesce(new.role, old.role), 'name', coalesce(new.name, old.name))
  );
  return coalesce(new, old);
end $$;

drop trigger if exists admins_log on public.admins;
create trigger admins_log
  after insert or update or delete on public.admins
  for each row execute function public.log_people_change();


-- ----------------------------------------------------------------------------
-- 3. Content: what's live, what's waiting, and every version published
-- ----------------------------------------------------------------------------
-- One row per page ("page:index", "page:global" for the header, menus and
-- footer) and per collection ("tracks", "events"…). Visitors read it.
create table if not exists public.content (
  key         text primary key,
  data        jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Unpublished changes, same shape. Only Owners and Editors see these.
create table if not exists public.content_drafts (
  key         text primary key,
  data        jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- A full copy of the live content at every publish.
create table if not exists public.content_versions (
  id            bigint generated always as identity primary key,
  snapshot      jsonb not null,
  keys          text[] not null default '{}',
  note          text,
  published_at  timestamptz not null default now(),
  published_by  text
);

-- Drafts are stamped with who saved them, whatever the browser claims.
create or replace function public.stamp_draft()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := lower(coalesce(auth.jwt() ->> 'email', ''));
  return new;
end $$;

drop trigger if exists content_drafts_stamp on public.content_drafts;
create trigger content_drafts_stamp
  before insert or update on public.content_drafts
  for each row execute function public.stamp_draft();

-- Publish every draft at once: live content is updated, the drafts are
-- cleared, a version is kept, and the log notes it. A draft holding JSON
-- null means "back to the site's built-in content" and removes the key.
create or replace function public.publish_content(note text default '')
returns bigint language plpgsql security definer set search_path = public as $$
declare
  who     text := lower(coalesce(auth.jwt() ->> 'email', ''));
  changed text[];
  vid     bigint;
begin
  if not public.is_admin(array['owner', 'editor']) then
    raise exception 'Only Owners and Editors can publish.';
  end if;

  select array_agg(d.key order by d.key) into changed from public.content_drafts d;
  if changed is null then
    raise exception 'There is nothing to publish.';
  end if;

  delete from public.content c
    using public.content_drafts d
    where c.key = d.key and (d.data is null or d.data = 'null'::jsonb);

  insert into public.content (key, data, updated_at, updated_by)
    select d.key, d.data, now(), who
    from public.content_drafts d
    where d.data is not null and d.data <> 'null'::jsonb
  on conflict (key) do update
    set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  delete from public.content_drafts where true;

  insert into public.content_versions (snapshot, keys, note, published_by)
    select coalesce(jsonb_object_agg(c.key, c.data), '{}'::jsonb), changed, nullif(trim(publish_content.note), ''), who
    from public.content c
  returning id into vid;

  insert into public.activity (actor, action, target, detail)
  values (who, 'publish', array_to_string(changed, ', '),
          jsonb_build_object('version', vid, 'note', nullif(trim(publish_content.note), '')));

  return vid;
end $$;

-- Bring back an earlier version as drafts: every key where that version
-- differs from what's live becomes a draft, for checking before publishing.
create or replace function public.restore_version(version_id bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare
  who   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  snap  jsonb;
  k     text;
  want  jsonb;
  n     integer := 0;
begin
  if not public.is_admin(array['owner', 'editor']) then
    raise exception 'Only Owners and Editors can bring back a version.';
  end if;

  select v.snapshot into snap from public.content_versions v where v.id = restore_version.version_id;
  if snap is null then
    raise exception 'That version no longer exists.';
  end if;

  for k in
    select all_keys.key from (
      select jsonb_object_keys(snap) as key
      union
      select c.key from public.content c
    ) all_keys
  loop
    want := snap -> k;
    if want is distinct from (select c.data from public.content c where c.key = k) then
      insert into public.content_drafts (key, data)
      values (k, coalesce(want, 'null'::jsonb))
      on conflict (key) do update set data = excluded.data;
      n := n + 1;
    end if;
  end loop;

  insert into public.activity (actor, action, target, detail)
  values (who, 'restore', 'version ' || restore_version.version_id, jsonb_build_object('drafted', n));

  return n;
end $$;


-- ----------------------------------------------------------------------------
-- 4. The rules: who may read and change what
-- ----------------------------------------------------------------------------
alter table public.admins            enable row level security;
alter table public.activity          enable row level security;
alter table public.content           enable row level security;
alter table public.content_drafts    enable row level security;
alter table public.content_versions  enable row level security;

-- People: everyone on the admin team can see the list; only Owners change it.
drop policy if exists "the team sees who is on it" on public.admins;
create policy "the team sees who is on it" on public.admins
  for select to authenticated using (public.is_admin());
drop policy if exists "owners add people" on public.admins;
create policy "owners add people" on public.admins
  for insert to authenticated with check (public.is_admin(array['owner']));
drop policy if exists "owners change people" on public.admins;
create policy "owners change people" on public.admins
  for update to authenticated using (public.is_admin(array['owner'])) with check (public.is_admin(array['owner']));
drop policy if exists "owners remove people" on public.admins;
create policy "owners remove people" on public.admins
  for delete to authenticated using (public.is_admin(array['owner']));

-- Live content: anyone may read it. Nobody writes it directly; only
-- publish_content() does.
drop policy if exists "live content is public" on public.content;
create policy "live content is public" on public.content
  for select to anon, authenticated using (true);

-- Drafts and history: Owners and Editors.
drop policy if exists "editors read drafts" on public.content_drafts;
create policy "editors read drafts" on public.content_drafts
  for select to authenticated using (public.is_admin(array['owner', 'editor']));
drop policy if exists "editors save drafts" on public.content_drafts;
create policy "editors save drafts" on public.content_drafts
  for insert to authenticated with check (public.is_admin(array['owner', 'editor']));
drop policy if exists "editors update drafts" on public.content_drafts;
create policy "editors update drafts" on public.content_drafts
  for update to authenticated using (public.is_admin(array['owner', 'editor'])) with check (public.is_admin(array['owner', 'editor']));
drop policy if exists "editors discard drafts" on public.content_drafts;
create policy "editors discard drafts" on public.content_drafts
  for delete to authenticated using (public.is_admin(array['owner', 'editor']));

drop policy if exists "editors see the history" on public.content_versions;
create policy "editors see the history" on public.content_versions
  for select to authenticated using (public.is_admin(array['owner', 'editor']));

-- The log: the team reads it, and can only add entries in their own name.
drop policy if exists "the team reads the log" on public.activity;
create policy "the team reads the log" on public.activity
  for select to authenticated using (public.is_admin());
drop policy if exists "the team writes to the log as themselves" on public.activity;
create policy "the team writes to the log as themselves" on public.activity
  for insert to authenticated
  with check (public.is_admin() and actor = lower(coalesce(auth.jwt() ->> 'email', '')));


-- ----------------------------------------------------------------------------
-- 5. Uploads: a public "media" folder (50 MB a file) that Owners and
--    Editors fill from the admin. Anyone can view a file by its link.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists "the team lists uploads" on storage.objects;
create policy "the team lists uploads" on storage.objects
  for select to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "editors upload" on storage.objects;
create policy "editors upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin(array['owner', 'editor']));
drop policy if exists "editors replace uploads" on storage.objects;
create policy "editors replace uploads" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin(array['owner', 'editor']));
drop policy if exists "editors delete uploads" on storage.objects;
create policy "editors delete uploads" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin(array['owner', 'editor']));


-- ----------------------------------------------------------------------------
-- 6. The first Owner
--    ▼▼▼  Put the Owner's email address and name here, then run.  ▼▼▼
-- ----------------------------------------------------------------------------
insert into public.admins (email, name, role)
values (lower('owner@example.com'), 'Owner name', 'owner')
on conflict (email) do update set role = 'owner', name = excluded.name;
