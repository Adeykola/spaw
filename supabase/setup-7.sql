-- ============================================================================
-- Dr AjokeSings: Supabase setup, part 7 — check-in by the registration team
-- The standalone check-in page (/checkin) for volunteers on the
-- Registration team. They sign in with the email they volunteered with and
-- a one-time code sent to it, and their sign-in lasts until the end of the
-- event's check-in window, which the admin sets (admin → Check-in access).
-- /checkin-test works the same way, for test events only; this file makes
-- one, "Check-in test event", with 60 made-up registrations (section 5).
--
-- Run it once, after parts 1 to 6 (setup.sql to setup-6.sql):
--   Supabase → SQL Editor → New query → paste all of this → Run.
-- Running it again is safe. The codes are emailed by the send-email
-- function (supabase/functions/send-email): deploy it again too.
--
-- Volunteers never read a table: everything goes through the checkin_*
-- functions below, which check the session on every call.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The tables
-- ----------------------------------------------------------------------------
-- When each event can be checked in (admin → Check-in access).
create table if not exists public.checkin_windows (
  event_id     text primary key,
  event_name   text not null,
  opens_at     timestamptz not null,
  closes_at    timestamptz not null,
  is_test      boolean not null default false,   -- shown on /checkin-test only
  updated_at   timestamptz,
  updated_by   text,
  check (closes_at > opens_at)
);

-- The one-time codes. Only the functions and send-email read them.
create table if not exists public.checkin_codes (
  id           text primary key,
  email        text not null,
  event_id     text not null,
  event_name   text,
  code         text not null,
  attempts     int not null default 0,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  emailed_at   timestamptz                         -- when send-email sent it
);
create index if not exists checkin_codes_email on public.checkin_codes (lower(email), created_at desc);

-- Who is signed in, until when (the end of the event's window).
create table if not exists public.checkin_sessions (
  token           text primary key,
  email           text not null,
  volunteer_id    text,
  volunteer_name  text,
  event_id        text not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_seen_at    timestamptz
);

-- Who checked each guest in: an admin's email, or a volunteer's.
alter table public.registrations add column if not exists checked_in_by text;

drop trigger if exists checkin_windows_stamp on public.checkin_windows;
create trigger checkin_windows_stamp before update on public.checkin_windows for each row execute function public.stamp_change();


-- ----------------------------------------------------------------------------
-- 2. The rules: the admin team sets the windows and sees who's signed in
-- ----------------------------------------------------------------------------
alter table public.checkin_windows enable row level security;
alter table public.checkin_codes enable row level security;
alter table public.checkin_sessions enable row level security;
revoke all on public.checkin_windows, public.checkin_codes, public.checkin_sessions from anon;
revoke all on public.checkin_codes from authenticated;
grant select, insert, update, delete on public.checkin_windows to authenticated;
grant select, delete on public.checkin_sessions to authenticated;

drop policy if exists "the team manages check-in windows" on public.checkin_windows;
create policy "the team manages check-in windows" on public.checkin_windows for all to authenticated
  using (public.is_admin()) with check (public.is_admin(array['owner', 'editor']));
drop policy if exists "the team sees check-in sessions" on public.checkin_sessions;
create policy "the team sees check-in sessions" on public.checkin_sessions for select to authenticated using (public.is_admin());
drop policy if exists "the team ends check-in sessions" on public.checkin_sessions;
create policy "the team ends check-in sessions" on public.checkin_sessions for delete to authenticated using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 3. Helpers (not callable from the site)
-- ----------------------------------------------------------------------------
-- Random hex from the database's own strong random source.
create or replace function public.checkin_random_hex(n int)
returns text language sql volatile set search_path = public as $$
  select left(string_agg(replace(gen_random_uuid()::text, '-', ''), ''), n)
    from generate_series(1, (n + 31) / 32);
$$;

-- The volunteer on the Registration team with this email (not declined).
create or replace function public.checkin_volunteer(p_email text)
returns public.volunteers language sql stable security definer set search_path = public as $$
  select v.* from public.volunteers v
   where lower(v.email) = lower(trim(p_email))
     and v.status <> 'declined'
     and exists (select 1 from jsonb_array_elements_text(coalesce(v.data -> 'teams', '[]'::jsonb)) t
                  where lower(trim(t)) = 'registration')
   limit 1;
$$;

-- A session that is still good: before its end, inside its event's window.
create or replace function public.checkin_session(p_token text)
returns public.checkin_sessions language plpgsql security definer set search_path = public as $$
declare
  s public.checkin_sessions;
begin
  select cs.* into s from public.checkin_sessions cs
    join public.checkin_windows w on w.event_id = cs.event_id
   where cs.token = p_token and cs.expires_at > now() and now() >= w.opens_at and now() < w.closes_at;
  if not found then raise exception 'Your check-in sign-in has ended. Sign in again with your email.'; end if;
  update public.checkin_sessions set last_seen_at = now() where token = p_token;
  return s;
end $$;

revoke all on function public.checkin_random_hex(int), public.checkin_volunteer(text), public.checkin_session(text) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. What the check-in pages call
-- ----------------------------------------------------------------------------
-- The events whose check-in hasn't ended: open now, or opening later.
create or replace function public.checkin_events(p_test boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.event_id, 'name', w.event_name, 'opensAt', w.opens_at, 'closesAt', w.closes_at,
           'open', now() >= w.opens_at) order by w.opens_at), '[]'::jsonb)
    from public.checkin_windows w
   where w.is_test = coalesce(p_test, false) and w.closes_at > now();
$$;

-- Asking for a code: the email must be on the Registration team, and the
-- event's check-in open. send-email then emails it (kind checkin_codes).
create or replace function public.checkin_request_code(p_email text, p_event text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mail  text := lower(trim(coalesce(p_email, '')));
  w     public.checkin_windows;
  v     public.volunteers;
  ref   text;
  code  text;
begin
  select * into w from public.checkin_windows where event_id = p_event;
  if not found or now() >= w.closes_at then raise exception 'Check-in for this event has ended.'; end if;
  if now() < w.opens_at then
    raise exception 'Check-in for this event opens on %.', to_char(w.opens_at at time zone 'Africa/Lagos', 'FMDD FMMonth "at" HH24:MI');
  end if;
  v := public.checkin_volunteer(mail);
  if v.id is null then
    raise exception 'That email isn''t on the registration team. Use the email you volunteered with, or ask the team to add you to Registration.';
  end if;
  if (select count(*) from public.checkin_codes c where lower(c.email) = mail and c.created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'Too many codes asked for. Wait a few minutes, then try again.';
  end if;

  code := lpad(((('x' || public.checkin_random_hex(8))::bit(32)::bigint % 1000000))::text, 6, '0');
  ref := public.new_ref('OTP');
  insert into public.checkin_codes (id, email, event_id, event_name, code, expires_at)
  values (ref, mail, w.event_id, w.event_name, code, now() + interval '10 minutes');
  return jsonb_build_object('id', ref, 'expiresAt', now() + interval '10 minutes');
end $$;

-- Checking the code. A wrong code counts a try (five, then a new code);
-- the right one opens a session until the event's check-in closes.
create or replace function public.checkin_verify(p_email text, p_event text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mail   text := lower(trim(coalesce(p_email, '')));
  c      public.checkin_codes;
  w      public.checkin_windows;
  v      public.volunteers;
  token  text;
begin
  select * into c from public.checkin_codes
   where lower(email) = mail and event_id = p_event and used_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'That code has expired. Ask for a new one.'); end if;
  if c.attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'Too many tries. Ask for a new code.'); end if;
  if c.code <> regexp_replace(coalesce(p_code, ''), '\D', '', 'g') then
    update public.checkin_codes set attempts = attempts + 1 where id = c.id;
    return jsonb_build_object('ok', false, 'error', 'That code isn''t right. Check the email and try again.');
  end if;

  select * into w from public.checkin_windows where event_id = p_event and now() >= opens_at and now() < closes_at;
  if not found then return jsonb_build_object('ok', false, 'error', 'Check-in for this event isn''t open.'); end if;
  v := public.checkin_volunteer(mail);
  if v.id is null then return jsonb_build_object('ok', false, 'error', 'That email isn''t on the registration team any more.'); end if;

  update public.checkin_codes set used_at = now() where id = c.id;
  token := public.checkin_random_hex(64);
  insert into public.checkin_sessions (token, email, volunteer_id, volunteer_name, event_id, expires_at)
  values (token, mail, v.id, v.full_name, w.event_id, w.closes_at);
  return jsonb_build_object('ok', true, 'token', token, 'expiresAt', w.closes_at,
    'eventId', w.event_id, 'eventName', w.event_name, 'name', v.full_name, 'email', mail);
end $$;

-- Who's signed in, for which event, and how many are in so far.
create or replace function public.checkin_whoami(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s  public.checkin_sessions := public.checkin_session(p_token);
  w  public.checkin_windows;
begin
  select * into w from public.checkin_windows where event_id = s.event_id;
  return jsonb_build_object('email', s.email, 'name', s.volunteer_name, 'eventId', s.event_id, 'eventName', w.event_name,
    'expiresAt', least(s.expires_at, w.closes_at),
    'registered', (select count(*) from public.registrations r where r.event_id = s.event_id and r.status = 'registered'),
    'checkedIn', (select count(*) from public.registrations r where r.event_id = s.event_id and r.status = 'registered' and r.checked_in));
end $$;

-- Finding a guest by ticket ID, name, email or phone, in this event only.
-- Their email and phone come back partly hidden.
create or replace function public.checkin_search(p_token text, p_query text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s     public.checkin_sessions := public.checkin_session(p_token);
  q     text := trim(coalesce(p_query, ''));
  like_q text := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  digits text := regexp_replace(q, '\D', '', 'g');
begin
  if length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'name', r.name,
             'email', regexp_replace(r.email, '^(.)[^@]*', '\1•••'),
             'phone', case when coalesce(r.phone, '') = '' then '' else '••• ' || right(regexp_replace(r.phone, '\D', '', 'g'), 4) end,
             'status', r.status, 'checkedIn', r.checked_in, 'checkedInAt', r.checked_in_at) order by r.name)
      from (select * from public.registrations r
             where r.event_id = s.event_id
               and (upper(r.id) = upper(q)
                    or lower(r.name) like like_q
                    or lower(r.email) like like_q
                    or (length(digits) >= 4 and regexp_replace(coalesce(r.phone, ''), '\D', '', 'g') like '%' || digits || '%'))
             order by r.name limit 25) r), '[]'::jsonb);
end $$;

-- Checking a guest in, by ticket ID (typed, scanned, or from a search).
-- Kept with who did it, and in the activity log under their email.
create or replace function public.checkin_mark(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s  public.checkin_sessions := public.checkin_session(p_token);
  r  public.registrations;
begin
  select * into r from public.registrations where id = upper(trim(coalesce(p_id, ''))) for update;
  if not found then raise exception 'No ticket found with that ID.'; end if;
  if r.event_id <> s.event_id then raise exception 'This ticket is for %, not this event.', coalesce(r.event_name, r.event_id); end if;
  if r.status <> 'registered' then raise exception 'This registration was cancelled. Send them to the registration desk lead.'; end if;
  if r.checked_in then
    return jsonb_build_object('id', r.id, 'name', r.name, 'already', true, 'checkedInAt', r.checked_in_at, 'checkedInBy', r.checked_in_by);
  end if;
  -- The activity log and "changed by" take the volunteer's email.
  perform set_config('request.jwt.claims', jsonb_build_object('email', s.email)::text, true);
  update public.registrations set checked_in = true, checked_in_at = now(), checked_in_by = s.email where id = r.id
    returning * into r;
  return jsonb_build_object('id', r.id, 'name', r.name, 'already', false, 'checkedInAt', r.checked_in_at,
    'checkedIn', (select count(*) from public.registrations x where x.event_id = s.event_id and x.status = 'registered' and x.checked_in));
end $$;

create or replace function public.checkin_sign_out(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.checkin_sessions where token = p_token;
$$;

grant execute on function public.checkin_events(boolean), public.checkin_request_code(text, text), public.checkin_verify(text, text, text),
  public.checkin_whoami(text), public.checkin_search(text, text), public.checkin_mark(text, text), public.checkin_sign_out(text)
  to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. For testing: "Check-in test event", open for 60 days from the first
--    run, on /checkin-test only, with 60 made-up guests (source 'test',
--    example.com addresses: nothing is emailed to them). It isn't on the
--    website's events. To take it all away later:
--      delete from public.registrations where event_id = 'event-test';
--      delete from public.checkin_windows where event_id = 'event-test';
-- ----------------------------------------------------------------------------
insert into public.checkin_windows (event_id, event_name, opens_at, closes_at, is_test)
values ('event-test', 'Check-in test event', now(), now() + interval '60 days', true)
on conflict (event_id) do nothing;

insert into public.registrations (id, event_id, event_name, name, email, phone, source, registered_at)
select 'REG-TEST' || lpad(i::text, 4, '0'), 'event-test', 'Check-in test event',
       (array['Adaeze','Tunde','Chiamaka','Emeka','Funmilayo','Ibrahim','Ngozi','Segun','Aisha','Chinedu',
              'Bukola','Yusuf','Ifeoma','Kunle','Zainab','Obinna','Temitope','Musa','Nkechi','Femi'])[1 + (i - 1) % 20]
       || ' ' ||
       (array['Okafor','Adeyemi','Bello','Eze','Ogunleye','Abubakar','Nwosu','Balogun','Okonkwo','Adebayo',
              'Danjuma','Olawale','Uche','Lawal','Afolabi'])[1 + ((i - 1) * 7) % 15],
       'guest' || lpad(i::text, 2, '0') || '@example.com',
       '+234 80' || lpad(((i * 7919) % 100000000)::text, 8, '0'),
       'test', now() - (i || ' hours')::interval
  from generate_series(1, 60) i
on conflict (id) do nothing;
