-- ============================================================================
-- Dr AjokeSings: Supabase setup, part 5 — volunteers
-- People who register to volunteer at SPAW (spaw-volunteer.html). Each one
-- signs the Terms and Conditions for Volunteers (spaw-volunteer-terms.html)
-- by ticking the box and typing their full name, which is kept with the
-- date, time and version of the terms they signed.
--
-- Run it once, after parts 1 to 4 (setup.sql to setup-4.sql):
--   Supabase → SQL Editor → New query → paste all of this → Run.
-- Running it again is safe.
--
-- Visitors never read any of this: they send it through submit_volunteer(),
-- which checks the details first. The admin team reads and updates it
-- signed in, and only Owners can delete, as for the rest of the inbox.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The table
-- ----------------------------------------------------------------------------
create table if not exists public.volunteers (
  id             text primary key,
  full_name      text not null,
  email          text not null,
  phone          text,
  location       text,
  status         text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'declined')),
  data           jsonb not null default '{}',  -- gender, age category, state, country, teams, days, church, experience, emergency contact
  signature      text not null,                -- the full name they typed to sign the volunteer terms
  terms_version  text,                         -- which terms they signed (admin → Volunteering)
  signed_at      timestamptz not null default now(),
  note           text,                         -- the team's private notes
  submitted_at   timestamptz not null default now(),
  updated_at     timestamptz,
  updated_by     text,
  emailed_at     timestamptz                   -- when the "thank you" email went (functions/send-email)
);
create index if not exists volunteers_submitted on public.volunteers (submitted_at desc);
create index if not exists volunteers_email on public.volunteers (email);

-- Who changed what and when, and status changes in the activity log, as
-- for the rest of the inbox (setup-2.sql).
drop trigger if exists volunteers_stamp on public.volunteers;
create trigger volunteers_stamp before update on public.volunteers for each row execute function public.stamp_change();
drop trigger if exists volunteers_log on public.volunteers;
create trigger volunteers_log after update on public.volunteers for each row execute function public.log_inbox_change();


-- ----------------------------------------------------------------------------
-- 2. The rules: the team reads and updates; Owners delete
-- ----------------------------------------------------------------------------
alter table public.volunteers enable row level security;
revoke all on public.volunteers from anon;   -- visitors only ever send, through submit_volunteer()
grant select, update, delete on public.volunteers to authenticated;

drop policy if exists "the team reads volunteers" on public.volunteers;
create policy "the team reads volunteers" on public.volunteers for select to authenticated using (public.is_admin());
drop policy if exists "the team updates volunteers" on public.volunteers;
create policy "the team updates volunteers" on public.volunteers for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "owners delete volunteers" on public.volunteers;
create policy "owners delete volunteers" on public.volunteers for delete to authenticated using (public.is_admin(array['owner']));


-- ----------------------------------------------------------------------------
-- 3. Registering to volunteer
--    Follows admin → Volunteering once it has been published: switched off,
--    or past its closing date, it says so. One registration per email.
-- ----------------------------------------------------------------------------
create or replace function public.submit_volunteer(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mail      text := lower(trim(coalesce(payload ->> 'email', '')));
  who       text := regexp_replace(trim(coalesce(payload ->> 'fullName', '')), '\s+', ' ', 'g');
  signed    text := regexp_replace(trim(coalesce(payload ->> 'signature', '')), '\s+', ' ', 'g');
  teams     jsonb := '[]';
  days      jsonb := '[]';
  settings  jsonb;
  closes    date;
  ref       text;
begin
  if length(payload::text) > 20000 then raise exception 'That registration is too long.'; end if;
  if length(who) = 0
     or length(trim(coalesce(payload ->> 'phone', ''))) = 0
     or length(trim(coalesce(payload ->> 'location', ''))) = 0
     or length(trim(coalesce(payload ->> 'emergencyName', ''))) = 0
     or length(trim(coalesce(payload ->> 'emergencyPhone', ''))) = 0 then
    raise exception 'Please complete all required fields before sending.';
  end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'That email address doesn''t look right.'; end if;

  if jsonb_typeof(payload -> 'teams') = 'array' then
    select coalesce(jsonb_agg(left(t, 100)), '[]'::jsonb) into teams
      from (select jsonb_array_elements_text(payload -> 'teams') as t limit 20) s where length(trim(t)) > 0;
  end if;
  if jsonb_array_length(teams) = 0 then raise exception 'Choose at least one team you''d like to serve in.'; end if;
  if jsonb_typeof(payload -> 'days') = 'array' then
    select coalesce(jsonb_agg(left(t, 120)), '[]'::jsonb) into days
      from (select jsonb_array_elements_text(payload -> 'days') as t limit 10) s where length(trim(t)) > 0;
  end if;
  if jsonb_array_length(days) = 0 then raise exception 'Choose at least one day you can serve.'; end if;

  if not coalesce((payload ->> 'agreedToTerms')::boolean, false) then
    raise exception 'You need to agree to the Terms and Conditions for Volunteers.';
  end if;
  if lower(signed) <> lower(who) then raise exception 'To sign, type your full name exactly as you gave it above.'; end if;

  select c.data into settings from public.content c where c.key = 'volunteering';
  if settings is not null then
    if coalesce((settings ->> 'open')::boolean, true) = false then raise exception 'Volunteer registration is closed.'; end if;
    closes := nullif(settings ->> 'closes', '')::date;
    if closes is not null and (now() at time zone 'Africa/Lagos')::date > closes then
      raise exception 'Volunteer registration closed on %.', to_char(closes, 'FMDD FMMonth YYYY');
    end if;
  end if;

  if exists (select 1 from public.volunteers v where v.email = mail) then
    raise exception 'You''ve already registered to volunteer with that email. The team will be in touch.';
  end if;

  ref := public.new_ref('VOL');
  insert into public.volunteers (id, full_name, email, phone, location, data, signature, terms_version)
  values (
    ref, left(who, 200), mail, left(trim(payload ->> 'phone'), 40), left(trim(payload ->> 'location'), 200),
    jsonb_strip_nulls(jsonb_build_object(
      'gender', left(nullif(trim(coalesce(payload ->> 'gender', '')), ''), 60),
      'ageCategory', left(nullif(trim(coalesce(payload ->> 'ageCategory', '')), ''), 60),
      'state', left(nullif(trim(coalesce(payload ->> 'state', '')), ''), 100),
      'country', left(nullif(trim(coalesce(payload ->> 'country', '')), ''), 100),
      'teams', teams,
      'days', days,
      'church', left(nullif(trim(coalesce(payload ->> 'church', '')), ''), 200),
      'experience', left(nullif(trim(coalesce(payload ->> 'experience', '')), ''), 3000),
      'emergencyName', left(trim(payload ->> 'emergencyName'), 200),
      'emergencyPhone', left(trim(payload ->> 'emergencyPhone'), 40)
    )),
    left(signed, 200),
    left(nullif(trim(coalesce(payload ->> 'termsVersion', '')), ''), 120)
  );
  return jsonb_build_object('id', ref, 'email', mail, 'submittedAt', now());
end $$;

grant execute on function public.submit_volunteer(jsonb) to anon, authenticated;
