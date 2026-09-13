-- ============================================================================
-- Dr AjokeSings: Supabase setup, part 2 — the inbox
-- Contact and booking enquiries, Talent Quest applications (with their
-- audio and video samples), event registrations and check-in, and
-- newsletter sign-ups.
--
-- Run it once, after part 1 (setup.sql):
--   Supabase → SQL Editor → New query → paste all of this → Run.
-- Running it again is safe.
--
-- Visitors never read any of this. They send it through the functions in
-- section 3, which check the details first; the admin team reads and
-- updates it signed in, and only Owners can delete.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.enquiries (
  id            text primary key,
  type          text not null check (type in ('message', 'booking')),
  status        text not null default 'new' check (status in ('new', 'replied', 'confirmed', 'declined', 'archived')),
  name          text not null,
  email         text not null,
  phone         text,
  subject       text,
  message       text,
  data          jsonb not null default '{}',   -- booking details, newsletter opt-in
  note          text,                          -- the team's private notes
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by    text
);
create index if not exists enquiries_submitted on public.enquiries (submitted_at desc);

create table if not exists public.applications (
  id            text primary key,
  full_name     text not null,
  email         text not null,
  phone         text,
  location      text,
  track         text,
  status        text not null default 'received' check (status in ('received', 'shortlisted', 'invited', 'selected', 'not-selected')),
  rating        smallint check (rating between 0 and 5),
  data          jsonb not null default '{}',   -- bio, links, uploaded samples
  note          text,
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz,
  updated_by    text
);
create index if not exists applications_submitted on public.applications (submitted_at desc);

create table if not exists public.registrations (
  id             text primary key,
  event_id       text not null,
  event_name     text,
  name           text not null,
  email          text not null,
  phone          text,
  status         text not null default 'registered' check (status in ('registered', 'cancelled')),
  checked_in     boolean not null default false,
  checked_in_at  timestamptz,
  source         text not null default 'website',
  note           text,
  registered_at  timestamptz not null default now(),
  updated_at     timestamptz,
  updated_by     text
);
create index if not exists registrations_event on public.registrations (event_id);
-- One live registration per email per event (a cancelled one can be redone).
create unique index if not exists registrations_once on public.registrations (event_id, lower(email)) where status = 'registered';

create table if not exists public.subscribers (
  email            text primary key check (email = lower(email)),
  source           text,
  subscribed_at    timestamptz not null default now(),
  unsubscribed_at  timestamptz
);


-- ----------------------------------------------------------------------------
-- 2. Housekeeping: references, who-changed-what, and the activity log
-- ----------------------------------------------------------------------------
-- A short reference people can quote: MSG-3F9A2C71.
create or replace function public.new_ref(prefix text)
returns text language sql volatile as $$
  select prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

create or replace function public.stamp_change()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := lower(coalesce(auth.jwt() ->> 'email', ''));
  return new;
end $$;

-- Status changes and check-ins go into the activity log.
create or replace function public.log_inbox_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who    text  := lower(coalesce(auth.jwt() ->> 'email', 'system'));
  now_j  jsonb := to_jsonb(new);
  was_j  jsonb := to_jsonb(old);
  label  text  := coalesce(to_jsonb(new) ->> 'name', to_jsonb(new) ->> 'full_name', to_jsonb(new) ->> 'email');
begin
  if coalesce((now_j ->> 'checked_in')::boolean, false) and not coalesce((was_j ->> 'checked_in')::boolean, false) then
    insert into public.activity (actor, action, target, detail)
    values (who, 'registration.checkin', label, jsonb_build_object('event', now_j ->> 'event_name', 'id', now_j ->> 'id'));
  end if;
  if (now_j ->> 'status') is distinct from (was_j ->> 'status') then
    insert into public.activity (actor, action, target, detail)
    values (who, tg_table_name || '.status', label, jsonb_build_object('status', now_j ->> 'status', 'id', now_j ->> 'id'));
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['enquiries', 'applications', 'registrations'] loop
    execute format('drop trigger if exists %1$s_stamp on public.%1$s', t);
    execute format('create trigger %1$s_stamp before update on public.%1$s for each row execute function public.stamp_change()', t);
    execute format('drop trigger if exists %1$s_log on public.%1$s', t);
    execute format('create trigger %1$s_log after update on public.%1$s for each row execute function public.log_inbox_change()', t);
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 3. What visitors can send (each checks the details first)
-- ----------------------------------------------------------------------------
create or replace function public.submit_enquiry(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  kind  text := coalesce(payload ->> 'type', 'message');
  mail  text := lower(trim(coalesce(payload ->> 'email', '')));
  ref   text;
begin
  if kind not in ('message', 'booking') then raise exception 'Unknown kind of enquiry.'; end if;
  if length(payload::text) > 20000 then raise exception 'That message is too long.'; end if;
  if length(trim(coalesce(payload ->> 'name', ''))) = 0 then raise exception 'Enter your name.'; end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'That email address doesn''t look right.'; end if;
  if length(trim(coalesce(payload ->> 'subject', ''))) = 0 then raise exception 'Add a subject.'; end if;
  if length(trim(coalesce(payload ->> 'message', ''))) < 20 then raise exception 'Tell us a little more: at least 20 characters.'; end if;

  ref := public.new_ref(case when kind = 'booking' then 'BKG' else 'MSG' end);
  insert into public.enquiries (id, type, name, email, phone, subject, message, data)
  values (
    ref, kind, trim(payload ->> 'name'), mail, nullif(trim(coalesce(payload ->> 'phone', '')), ''),
    trim(payload ->> 'subject'), trim(payload ->> 'message'),
    payload - 'type' - 'name' - 'email' - 'phone' - 'subject' - 'message'
  );

  if coalesce((payload ->> 'joinNewsletter')::boolean, false) then
    insert into public.subscribers (email, source) values (mail, 'contact form')
    on conflict (email) do update set unsubscribed_at = null;
  end if;

  return jsonb_build_object('id', ref, 'submittedAt', now());
end $$;

-- 'added', or 'exists' when the address is already on the list.
create or replace function public.subscribe(p_email text, p_source text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  mail text := lower(trim(coalesce(p_email, '')));
begin
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'That email address doesn''t look right.'; end if;
  if exists (select 1 from public.subscribers where email = mail and unsubscribed_at is null) then return 'exists'; end if;
  insert into public.subscribers (email, source) values (mail, left(p_source, 60))
  on conflict (email) do update set unsubscribed_at = null, subscribed_at = now(), source = excluded.source;
  return 'added';
end $$;

-- Registration checks the event as published from the admin, when it has
-- been: open or closed, and room left. (setup-3.sql replaces this with a
-- version that also follows the event's status and closing date.)
create or replace function public.register_for_event(p_event_id text, p_event_name text, p_name text, p_email text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mail   text := lower(trim(coalesce(p_email, '')));
  ev     jsonb;
  ename  text := p_event_name;
  cap    integer;
  taken  integer;
  ref    text;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter your full name.'; end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'That email address doesn''t look right.'; end if;

  select e.value into ev
  from public.content c,
       jsonb_array_elements(case when jsonb_typeof(c.data) = 'array' then c.data else '[]'::jsonb end) as e(value)
  where c.key = 'events' and e.value ->> 'id' = p_event_id
  limit 1;

  if ev is not null then
    ename := ev ->> 'name';
    if coalesce((ev ->> 'registrationOpen')::boolean, true) = false then
      raise exception 'Registration for this event is closed.';
    end if;
    cap := floor(nullif(ev ->> 'capacity', '')::numeric)::integer;
    if cap is not null then
      select count(*) into taken from public.registrations where event_id = p_event_id and status = 'registered';
      if taken >= cap then raise exception 'This event is full.'; end if;
    end if;
  end if;

  if exists (select 1 from public.registrations where event_id = p_event_id and lower(email) = mail and status = 'registered') then
    raise exception 'You''re already registered for this event with that email.';
  end if;

  ref := public.new_ref('REG');
  insert into public.registrations (id, event_id, event_name, name, email, phone, source)
  values (ref, p_event_id, left(coalesce(ename, p_event_id), 200), trim(p_name), mail,
          nullif(trim(coalesce(p_phone, '')), ''), case when public.is_admin() then 'admin' else 'website' end);

  return jsonb_build_object('id', ref, 'eventId', p_event_id, 'eventName', ename, 'name', trim(p_name),
                            'email', mail, 'phone', nullif(trim(coalesce(p_phone, '')), ''),
                            'registeredAt', now(), 'checkedIn', false, 'status', 'registered');
end $$;

-- The Talent Quest checks the dates and switch published from the admin.
create or replace function public.submit_application(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mail    text := lower(trim(coalesce(payload ->> 'email', '')));
  sym     jsonb;
  closes  date;
  ref     text;
begin
  if length(payload::text) > 30000 then raise exception 'That application is too long.'; end if;
  if length(trim(coalesce(payload ->> 'fullName', ''))) = 0
     or length(trim(coalesce(payload ->> 'phone', ''))) = 0
     or length(trim(coalesce(payload ->> 'location', ''))) = 0
     or length(trim(coalesce(payload ->> 'track', ''))) = 0
     or length(trim(coalesce(payload ->> 'bio', ''))) = 0 then
    raise exception 'Please complete all required fields before submitting.';
  end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'That email address doesn''t look right.'; end if;
  if not coalesce((payload ->> 'agreedToTerms')::boolean, false) then
    raise exception 'You need to agree to the terms to submit your application.';
  end if;

  select c.data into sym from public.content c where c.key = 'symphony';
  if sym is not null then
    if coalesce((sym ->> 'applicationsOpen')::boolean, true) = false then raise exception 'Applications are closed.'; end if;
    closes := nullif(sym ->> 'applicationCloses', '')::date;
    if closes is not null and current_date > closes then
      raise exception 'Applications closed on %.', to_char(closes, 'FMDD FMMonth YYYY');
    end if;
  end if;

  ref := public.new_ref('SYM');
  insert into public.applications (id, full_name, email, phone, location, track, data)
  values (
    ref, trim(payload ->> 'fullName'), mail, trim(payload ->> 'phone'), trim(payload ->> 'location'), trim(payload ->> 'track'),
    jsonb_strip_nulls(jsonb_build_object(
      'bio', payload ->> 'bio',
      'socialLink', nullif(payload ->> 'socialLink', ''),
      'projectLink', nullif(payload ->> 'projectLink', ''),
      'files', payload -> 'files'
    ))
  );
  return jsonb_build_object('id', ref, 'email', mail, 'submittedAt', now());
end $$;

-- How many are registered for each event: numbers only, for the public
-- "120 of 800 registered" lines.
create or replace function public.event_counts()
returns table (event_id text, registered bigint)
language sql stable security definer set search_path = public as $$
  select r.event_id, count(*) from public.registrations r where r.status = 'registered' group by r.event_id;
$$;

-- Check-in at the door: the admin team only.
create or replace function public.check_in(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.registrations;
begin
  if not public.is_admin() then raise exception 'Sign in to the admin to check people in.'; end if;
  select * into r from public.registrations where id = upper(trim(p_id));
  if not found then raise exception 'No registration found with that ID.'; end if;
  if r.status = 'cancelled' then raise exception 'That registration was cancelled.'; end if;
  if r.checked_in then
    raise exception 'Already checked in at %.', to_char(r.checked_in_at at time zone 'Africa/Lagos', 'HH24:MI');
  end if;
  update public.registrations set checked_in = true, checked_in_at = now() where id = r.id returning * into r;
  return to_jsonb(r);
end $$;

grant execute on function public.submit_enquiry(jsonb) to anon, authenticated;
grant execute on function public.subscribe(text, text) to anon, authenticated;
grant execute on function public.register_for_event(text, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_application(jsonb) to anon, authenticated;
grant execute on function public.event_counts() to anon, authenticated;
grant execute on function public.check_in(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. The rules: the team reads and updates the inbox; Owners delete
-- ----------------------------------------------------------------------------
-- Signed-in admins may reach these tables at all; the rules below decide
-- which rows and what they can do. Visitors get no table access.
grant select, update, delete on public.enquiries, public.applications, public.registrations, public.subscribers to authenticated;

do $$
declare t text;
begin
  foreach t in array array['enquiries', 'applications', 'registrations', 'subscribers'] loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists "the team reads %1$s" on public.%1$s', t);
    execute format('create policy "the team reads %1$s" on public.%1$s for select to authenticated using (public.is_admin())', t);
    execute format('drop policy if exists "the team updates %1$s" on public.%1$s', t);
    execute format('create policy "the team updates %1$s" on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('drop policy if exists "owners delete %1$s" on public.%1$s', t);
    execute format('create policy "owners delete %1$s" on public.%1$s for delete to authenticated using (public.is_admin(array[''owner'']))', t);
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 5. Talent Quest samples: a private folder. Applicants can add files to
--    it (50 MB each, audio or video) but never list or open them; the team
--    opens them from the admin through short-lived links.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 52428800, array['audio/*', 'video/*'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "applicants upload samples" on storage.objects;
create policy "applicants upload samples" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'applications' and (storage.foldername(name))[1] = 'incoming');
drop policy if exists "the team opens samples" on storage.objects;
create policy "the team opens samples" on storage.objects
  for select to authenticated using (bucket_id = 'applications' and public.is_admin());
drop policy if exists "owners delete samples" on storage.objects;
create policy "owners delete samples" on storage.objects
  for delete to authenticated using (bucket_id = 'applications' and public.is_admin(array['owner']));
