-- ============================================================================
-- Dr AjokeSings: Supabase setup, part 4 — event registration forms
-- An event's registration form asks its own questions (admin → Events →
-- Registration form: where people live, gender, age category, anything
-- else) and the answers are kept with each registration. Registration also
-- stops once an event is sold out, and the Talent Quest application keeps
-- gender, age category, state and country. And it notes when each form's
-- confirmation email was sent.
--
-- Run it once, after parts 1, 2 and 3 (setup.sql, setup-2.sql, setup-3.sql):
--   Supabase → SQL Editor → New query → paste all of this → Run.
-- Running it again is safe. Event registration lives here from now on; the
-- earlier parts no longer carry it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. When each form's email went out (supabase/functions/send-email): one
--    email per registration, application, message and sign-up.
-- ----------------------------------------------------------------------------
alter table public.registrations add column if not exists emailed_at timestamptz;
alter table public.applications  add column if not exists emailed_at timestamptz;
alter table public.enquiries     add column if not exists emailed_at timestamptz;
alter table public.subscribers   add column if not exists emailed_at timestamptz;


-- ----------------------------------------------------------------------------
-- 1. Registrations keep their answers
--    A list of { id, label, type, value }; value is text, or
--    { state, country } for "where do you live".
-- ----------------------------------------------------------------------------
alter table public.registrations add column if not exists answers jsonb not null default '[]';


-- ----------------------------------------------------------------------------
-- 2. Registering
--    Follows the event as published from the admin, when it has been:
--    shown or not, cancelled or postponed, over, sold out (marked, or every
--    place taken), registration switched off or past its closing date, the
--    phone number required, and the required questions answered.
-- ----------------------------------------------------------------------------
drop function if exists public.register_for_event(text, text, text, text, text);

create or replace function public.register_for_event(
  p_event_id text, p_event_name text, p_name text, p_email text, p_phone text default null, p_answers jsonb default '[]'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  mail      text := lower(trim(coalesce(p_email, '')));
  phone     text := nullif(trim(coalesce(p_phone, '')), '');
  today     date := (now() at time zone 'Africa/Lagos')::date;
  ev        jsonb;
  ename     text := p_event_name;
  last_day  text;
  closes    date;
  cap       integer;
  taken     integer;
  answers   jsonb := '[]';
  q         jsonb;
  a         jsonb;
  ref       text;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter your full name.'; end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'That email address doesn''t look right.'; end if;

  -- The answers, kept to what a form sends.
  if p_answers is not null and jsonb_typeof(p_answers) = 'array' then
    if length(p_answers::text) > 20000 then raise exception 'Those answers are too long.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', left(x ->> 'id', 80),
             'label', left(coalesce(x ->> 'label', ''), 200),
             'type', left(coalesce(x ->> 'type', 'text'), 20),
             'value', case when jsonb_typeof(x -> 'value') = 'object'
                           then jsonb_build_object('state', left(coalesce(x -> 'value' ->> 'state', ''), 100),
                                                   'country', left(coalesce(x -> 'value' ->> 'country', ''), 100))
                           else to_jsonb(left(coalesce(x ->> 'value', ''), 2000)) end)), '[]'::jsonb)
      into answers
      from (select value as x from jsonb_array_elements(p_answers) limit 40) s
     where jsonb_typeof(x) = 'object' and coalesce(x ->> 'id', '') <> '';
  end if;

  select e.value into ev
  from public.content c,
       jsonb_array_elements(case when jsonb_typeof(c.data) = 'array' then c.data else '[]'::jsonb end) as e(value)
  where c.key = 'events' and e.value ->> 'id' = p_event_id
  limit 1;

  if ev is not null then
    ename := ev ->> 'name';
    if coalesce(ev ->> 'visible', 'true') = 'false' then raise exception 'This event isn''t open for registration.'; end if;
    if ev ->> 'status' = 'cancelled' then raise exception 'This event has been cancelled.'; end if;
    if ev ->> 'status' = 'postponed' then raise exception 'This event has been postponed. Registration reopens with the new date.'; end if;
    last_day := coalesce(nullif(ev ->> 'endDate', ''), ev ->> 'date');
    if coalesce(last_day, '') ~ '^\d{4}-\d{2}-\d{2}$' and last_day::date < today then
      raise exception 'This event has already taken place.';
    end if;
    if ev ->> 'soldOut' = 'true' then raise exception 'Sorry, this event is sold out: every place has been taken.'; end if;
    cap := case when coalesce(ev ->> 'capacity', '') ~ '^\d+(\.\d+)?$' then floor((ev ->> 'capacity')::numeric)::integer end;
    if cap is not null and cap > 0 then
      select count(*) into taken from public.registrations where event_id = p_event_id and status = 'registered';
      if taken >= cap then raise exception 'Sorry, this event is sold out: every place has been taken.'; end if;
    end if;
    if coalesce(ev ->> 'registrationOpen', 'true') = 'false' then raise exception 'Registration for this event is closed.'; end if;
    closes := case when coalesce(ev ->> 'registrationCloses', '') ~ '^\d{4}-\d{2}-\d{2}$' then (ev ->> 'registrationCloses')::date end;
    if closes is not null and today > closes then
      raise exception 'Registration for this event closed on %.', to_char(closes, 'FMDD FMMonth YYYY');
    end if;

    if ev ->> 'phone' = 'off' then phone := null; end if;
    if ev ->> 'phone' = 'required' and length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) < 7 then
      raise exception 'Enter a phone number.';
    end if;

    if jsonb_typeof(ev -> 'formFields') = 'array' then
      for q in select value from jsonb_array_elements(ev -> 'formFields') loop
        continue when coalesce(q ->> 'required', 'false') <> 'true';
        a := null;
        select value into a from jsonb_array_elements(answers) where value ->> 'id' = q ->> 'id' limit 1;
        if a is null
           or (jsonb_typeof(a -> 'value') = 'object'
               and (coalesce(a -> 'value' ->> 'state', '') = '' or coalesce(a -> 'value' ->> 'country', '') = ''))
           or (jsonb_typeof(a -> 'value') <> 'object' and trim(coalesce(a ->> 'value', '')) = '')
           or (q ->> 'type' = 'checkbox' and coalesce(a ->> 'value', '') <> 'Yes') then
          raise exception 'Please answer: %', coalesce(nullif(q ->> 'label', ''), 'every required question');
        end if;
      end loop;
    end if;
  end if;

  if exists (select 1 from public.registrations where event_id = p_event_id and lower(email) = mail and status = 'registered') then
    raise exception 'You''re already registered for this event with that email.';
  end if;

  ref := public.new_ref('REG');
  insert into public.registrations (id, event_id, event_name, name, email, phone, answers, source)
  values (ref, p_event_id, left(coalesce(ename, p_event_id), 200), trim(p_name), mail, phone, answers,
          case when public.is_admin() then 'admin' else 'website' end);

  return jsonb_build_object('id', ref, 'eventId', p_event_id, 'eventName', ename, 'name', trim(p_name),
                            'email', mail, 'phone', phone, 'answers', answers,
                            'registeredAt', now(), 'checkedIn', false, 'status', 'registered');
end $$;

grant execute on function public.register_for_event(text, text, text, text, text, jsonb) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. The Talent Quest application
--    Follows the switch and closing date published from the admin, and
--    keeps gender, age category, state and country with the rest.
-- ----------------------------------------------------------------------------
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
      'gender', left(nullif(trim(coalesce(payload ->> 'gender', '')), ''), 60),
      'ageCategory', left(nullif(trim(coalesce(payload ->> 'ageCategory', '')), ''), 60),
      'state', left(nullif(trim(coalesce(payload ->> 'state', '')), ''), 100),
      'country', left(nullif(trim(coalesce(payload ->> 'country', '')), ''), 100),
      'socialLink', nullif(payload ->> 'socialLink', ''),
      'projectLink', nullif(payload ->> 'projectLink', ''),
      'files', payload -> 'files'
    ))
  );
  return jsonb_build_object('id', ref, 'email', mail, 'submittedAt', now());
end $$;

grant execute on function public.submit_application(jsonb) to anon, authenticated;
