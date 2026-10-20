-- ============================================================================
-- Dr AjokeSings: Supabase setup, part 6 — community members
-- People who join the community at /community-member: full name, birthday
-- (day and month), state of residence (and its country), state of origin,
-- the team they belong to, email, phone and social media handles. Kept apart from the volunteers (setup-5.sql), with a screen of
-- their own in the admin (Inbox → Community members).
--
-- Run it once, after parts 1 to 5 (setup.sql to setup-5.sql):
--   Supabase → SQL Editor → New query → paste all of this → Run.
-- Running it again is safe.
--
-- Visitors never read any of this: they send it through
-- submit_community_member(), which checks the details first. The admin team
-- reads and updates it signed in, and only Owners can delete, as for the
-- rest of the inbox.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The table
-- ----------------------------------------------------------------------------
create table if not exists public.community_members (
  id             text primary key,
  full_name      text not null,
  email          text not null,
  phone          text,
  status         text not null default 'new' check (status in ('new', 'contacted', 'active', 'inactive')),
  data           jsonb not null default '{}',  -- birthday, state of residence and country, state of origin, team, social media handles
  note           text,                         -- the team's private notes
  submitted_at   timestamptz not null default now(),
  updated_at     timestamptz,
  updated_by     text
);
create index if not exists community_members_submitted on public.community_members (submitted_at desc);
create index if not exists community_members_email on public.community_members (email);

-- Who changed what and when, and status changes in the activity log, as
-- for the rest of the inbox (setup-2.sql).
drop trigger if exists community_members_stamp on public.community_members;
create trigger community_members_stamp before update on public.community_members for each row execute function public.stamp_change();
drop trigger if exists community_members_log on public.community_members;
create trigger community_members_log after update on public.community_members for each row execute function public.log_inbox_change();


-- ----------------------------------------------------------------------------
-- 2. The rules: the team reads and updates; Owners delete
-- ----------------------------------------------------------------------------
alter table public.community_members enable row level security;
revoke all on public.community_members from anon;   -- visitors only ever send, through submit_community_member()
grant select, update, delete on public.community_members to authenticated;

drop policy if exists "the team reads community members" on public.community_members;
create policy "the team reads community members" on public.community_members for select to authenticated using (public.is_admin());
drop policy if exists "the team updates community members" on public.community_members;
create policy "the team updates community members" on public.community_members for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "owners delete community members" on public.community_members;
create policy "owners delete community members" on public.community_members for delete to authenticated using (public.is_admin(array['owner']));


-- ----------------------------------------------------------------------------
-- 3. Joining (community-member.html). One sign-up per email.
-- ----------------------------------------------------------------------------
create or replace function public.submit_community_member(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mail  text := lower(trim(coalesce(payload ->> 'email', '')));
  who   text := regexp_replace(trim(coalesce(payload ->> 'fullName', '')), '\s+', ' ', 'g');
  team  text := left(trim(coalesce(payload ->> 'team', '')), 100);
  ref   text;
begin
  if length(payload::text) > 10000 then raise exception 'That sign-up is too long.'; end if;
  if length(who) = 0
     or length(trim(coalesce(payload ->> 'phone', ''))) = 0
     or length(trim(coalesce(payload ->> 'birthday', ''))) = 0
     or length(trim(coalesce(payload ->> 'stateOfResidence', ''))) = 0
     or length(trim(coalesce(payload ->> 'stateOfOrigin', ''))) = 0 then
    raise exception 'Please complete all required fields before sending.';
  end if;
  if length(team) = 0 then raise exception 'Choose the team you belong to.'; end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'That email address doesn''t look right.'; end if;

  if exists (select 1 from public.community_members m where m.email = mail) then
    raise exception 'You''ve already joined with that email. Welcome back!';
  end if;

  ref := public.new_ref('COM');
  insert into public.community_members (id, full_name, email, phone, data)
  values (
    ref, left(who, 200), mail, left(trim(payload ->> 'phone'), 40),
    jsonb_strip_nulls(jsonb_build_object(
      'birthday', left(trim(payload ->> 'birthday'), 20),
      'stateOfResidence', left(trim(payload ->> 'stateOfResidence'), 100),
      'countryOfResidence', left(nullif(trim(coalesce(payload ->> 'countryOfResidence', '')), ''), 100),
      'stateOfOrigin', left(trim(payload ->> 'stateOfOrigin'), 100),
      'team', team,
      'socials', left(nullif(trim(coalesce(payload ->> 'socials', '')), ''), 500)
    ))
  );
  return jsonb_build_object('id', ref, 'email', mail, 'submittedAt', now());
end $$;

grant execute on function public.submit_community_member(jsonb) to anon, authenticated;
