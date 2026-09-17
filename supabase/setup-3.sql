-- ============================================================================
-- Dr AjokeSings: Supabase setup, part 3 — analytics and campaign links
-- Anonymous visit counting for the admin's analytics (no cookies, no names,
-- no internet addresses kept), and the campaign links the team makes for
-- flyers and posts.
--
-- Run it once, after parts 1 and 2 (setup.sql, setup-2.sql):
--   Supabase → SQL Editor → New query → paste all of this → Run.
-- Running it again is safe.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Visits, and what happens in them
--    A visit (session) ends after 30 minutes without activity. "vid" is a
--    random name this browser gives itself; it says nothing about the person.
-- ----------------------------------------------------------------------------
create table if not exists public.analytics_sessions (
  sid         text primary key,
  vid         text not null,
  started_at  timestamptz not null default now(),
  is_new      boolean not null default false,   -- this browser's first visit
  landing     text,                             -- the first page of the visit
  ref         text,                             -- the site they came from (its name only)
  channel     text,                             -- Direct, Search, Social, Email, Campaign, Referral
  source      text,                             -- google, instagram, whatsapp, flyer…
  medium      text,
  campaign    text,
  device      text,                             -- mobile, tablet, desktop
  browser     text,
  os          text,
  lang        text,
  country     text                              -- estimated from the time zone
);
create index if not exists analytics_sessions_started on public.analytics_sessions (started_at);

create table if not exists public.analytics_events (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  sid    text not null references public.analytics_sessions (sid) on delete cascade,
  name   text not null,       -- pageview, engagement, or an action (see js/track.js)
  path   text,                -- /events, /song?id=track-001
  title  text,
  value  numeric,             -- seconds, a percentage or a count, depending on the name
  label  text,                -- what was tapped, played or searched
  props  jsonb                -- small extras
);
create index if not exists analytics_events_at on public.analytics_events (at);
create index if not exists analytics_events_sid on public.analytics_events (sid, at);

-- Nobody reads or writes these tables directly: visitors send through
-- track(), and the admin reads through analytics_report().
alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;
revoke all on public.analytics_sessions, public.analytics_events from anon, authenticated;

-- A number sent by a browser, or nothing when it isn't one.
create or replace function public.analytics_num(t text)
returns numeric language sql immutable as $$
  select case when t ~ '^-?[0-9]{1,12}(\.[0-9]{1,6})?$' then t::numeric end;
$$;


-- ----------------------------------------------------------------------------
-- 2. What the website sends: one visit's details and a batch of events
-- ----------------------------------------------------------------------------
create or replace function public.track(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  s_id   text := p ->> 'sid';
  v_id   text := p ->> 'vid';
  item   jsonb;
  names  constant text[] := array[
    'pageview', 'engagement', 'slide', 'slide_tap', 'cta', 'menu', 'outbound', 'stream', 'youtube',
    'play', 'heard', 'video', 'gallery', 'search', 'register_open', 'registered', 'apply_start',
    'applied', 'booking_start', 'booking', 'enquiry', 'newsletter', 'error'];
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'events') is distinct from 'array' then return; end if;
  if coalesce(s_id, '') !~ '^[A-Za-z0-9_-]{8,40}$' or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{8,40}$' then return; end if;
  if jsonb_array_length(p -> 'events') > 50 then return; end if;
  -- A visit sending far more than a person could is dropped, not stored.
  if (select count(*) from public.analytics_events where sid = s_id and at > now() - interval '10 minutes') > 400 then return; end if;

  insert into public.analytics_sessions (sid, vid, is_new, landing, ref, channel, source, medium, campaign, device, browser, os, lang, country)
  values (
    s_id, v_id, coalesce(p ->> 'new', '') = 'true',
    nullif(left(p ->> 'land', 200), ''), nullif(left(p ->> 'ref', 120), ''), nullif(left(p ->> 'ch', 20), ''),
    nullif(left(lower(p ->> 'src'), 60), ''), nullif(left(lower(p ->> 'med'), 60), ''), nullif(left(lower(p ->> 'cmp'), 80), ''),
    nullif(left(p ->> 'dev', 12), ''), nullif(left(p ->> 'br', 30), ''), nullif(left(p ->> 'os', 20), ''),
    nullif(left(p ->> 'lang', 20), ''), nullif(left(p ->> 'cty', 60), '')
  )
  on conflict (sid) do nothing;

  for item in select value from jsonb_array_elements(p -> 'events') loop
    continue when jsonb_typeof(item) is distinct from 'object' or not coalesce((item ->> 'n') = any (names), false);
    insert into public.analytics_events (sid, name, path, title, value, label, props)
    values (
      s_id, item ->> 'n', nullif(left(item ->> 'p', 200), ''), nullif(left(item ->> 't', 150), ''),
      public.analytics_num(item ->> 'v'), nullif(left(item ->> 'l', 150), ''),
      case when jsonb_typeof(item -> 'x') = 'object' and length((item -> 'x')::text) <= 1500 then item -> 'x' end
    );
  end loop;

  -- Now and then, visits older than 25 months are cleared away.
  if random() < 0.001 then
    delete from public.analytics_sessions where started_at < now() - interval '25 months';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 3. The report the admin reads: everything for one date range, as JSON.
--    Days and hours are in Lagos time. p_light returns the totals and the
--    days only (for comparing with the period before).
--    js/analytics-core.js works out the same report in demo mode; the two
--    must agree field for field. Lists are sorted largest first, then by
--    name byte by byte (collate "C"), so both sort ties the same way.
-- ----------------------------------------------------------------------------
create or replace function public.analytics_report(p_from timestamptz, p_to timestamptz, p_light boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tz      constant text := 'Africa/Lagos';
  totals  jsonb;
  result  jsonb;
begin
  if not public.is_admin() then raise exception 'Sign in to the admin to see the analytics.'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'That date range doesn''t work.'; end if;
  if p_to - p_from > interval '400 days' then raise exception 'Choose a range of up to 400 days.'; end if;

  drop table if exists pg_temp.a_ev, pg_temp.a_ss, pg_temp.a_pv;

  -- Every event in the range, with its visit's details.
  create temp table a_ev on commit drop as
    select e.id, e.at, e.sid, e.name, e.path, e.title, e.value, e.label, e.props,
           s.vid, s.is_new, s.ref, s.channel, s.source, s.medium, s.campaign, s.device, s.browser, s.os, s.lang, s.country
    from public.analytics_events e join public.analytics_sessions s on s.sid = e.sid
    where e.at >= p_from and e.at < p_to;

  -- One row per visit that saw at least one page.
  create temp table a_ss on commit drop as
    select sid, min(vid) as vid, bool_or(is_new) as is_new, min(ref) as ref, min(channel) as channel,
           min(source) as source, min(medium) as medium, min(campaign) as campaign, min(device) as device,
           min(browser) as browser, min(os) as os, min(lang) as lang, min(country) as country,
           count(*) filter (where name = 'pageview') as pageviews,
           count(*) filter (where name in ('registered', 'applied', 'booking', 'enquiry', 'newsletter')) as conversions,
           min(at) filter (where name = 'pageview') as started
    from a_ev group by sid
    having count(*) filter (where name = 'pageview') > 0;

  -- One row per page view that reported how it went (time, scroll, speed).
  create temp table a_pv on commit drop as
    select sid, props ->> 'pv' as pv, min(path collate "C") as path, min(device) as device,
           case when max(value) > 1800 then 1800 else max(value) end as secs,
           max(public.analytics_num(props ->> 'scroll')) as scroll,
           max(public.analytics_num(props ->> 'load')) as load,
           max(public.analytics_num(props ->> 'lcp')) as lcp
    from a_ev where name = 'engagement' and props ? 'pv'
    group by sid, props ->> 'pv';

  select jsonb_build_object(
    'visitors', count(distinct vid),
    'newVisitors', count(distinct vid) filter (where is_new),
    'sessions', count(*),
    'pageviews', coalesce(sum(pageviews), 0),
    'bounces', count(*) filter (where pageviews = 1),
    'conversions', coalesce(sum(conversions), 0),
    'convertingSessions', count(*) filter (where conversions > 0),
    'engagedSeconds', (select coalesce(sum(secs), 0) from a_pv),
    'engagedViews', (select count(*) from a_pv),
    'homeViews', (select count(*) from a_ev where name = 'pageview' and path = '/'),
    'youtubeTaps', (select count(*) from a_ev where name = 'youtube')
  ) into totals from a_ss;

  result := jsonb_build_object(
    'from', p_from, 'to', p_to, 'totals', totals,
    'daily', coalesce((select jsonb_agg(to_jsonb(x) order by x.day) from (
      select to_char(at at time zone tz, 'YYYY-MM-DD') as day,
             count(distinct vid) filter (where name = 'pageview') as visitors,
             count(distinct sid) filter (where name = 'pageview') as sessions,
             count(*) filter (where name = 'pageview') as pageviews,
             count(*) filter (where name in ('registered', 'applied', 'booking', 'enquiry', 'newsletter')) as conversions
      from a_ev group by 1) x), '[]'::jsonb)
  );
  if p_light then return result; end if;

  -- Where visitors come from
  result := result || jsonb_build_object(
    'hours', coalesce((select jsonb_agg(to_jsonb(x) order by x.dow, x.hour) from (
      select extract(isodow from started at time zone tz)::int as dow, extract(hour from started at time zone tz)::int as hour, count(*) as sessions
      from a_ss group by 1, 2) x), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C") from (
      select coalesce(channel, 'Direct') as key, count(*) as sessions, count(distinct vid) as visitors,
             coalesce(sum(conversions), 0) as conversions, count(*) filter (where conversions > 0) as converting
      from a_ss group by 1) x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C", x.channel collate "C") from (
      select * from (
        select coalesce(source, 'direct') as key, coalesce(channel, 'Direct') as channel, count(*) as sessions,
               count(distinct vid) as visitors, coalesce(sum(conversions), 0) as conversions
        from a_ss group by 1, 2) y
      order by y.sessions desc, y.key collate "C", y.channel collate "C" limit 50) x), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C", x.source collate "C", x.medium collate "C") from (
      select * from (
        select s.campaign as key, coalesce(s.source, '') as source, coalesce(s.medium, '') as medium,
               count(distinct s.sid) as sessions, count(distinct s.vid) as visitors, count(e.id) as conversions,
               count(e.id) filter (where e.name = 'registered') as registered,
               count(e.id) filter (where e.name = 'applied') as applied,
               count(e.id) filter (where e.name = 'booking') as bookings,
               count(e.id) filter (where e.name = 'enquiry') as enquiries,
               count(e.id) filter (where e.name = 'newsletter') as signups
        from a_ss s left join a_ev e on e.sid = s.sid and e.name in ('registered', 'applied', 'booking', 'enquiry', 'newsletter')
        where coalesce(s.campaign, '') <> ''
        group by 1, 2, 3) y
      order by y.sessions desc, y.key collate "C", y.source collate "C", y.medium collate "C" limit 100) x), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C") from (
      select * from (select ref as key, count(*) as sessions from a_ss where coalesce(ref, '') <> '' group by 1) y
      order by y.sessions desc, y.key collate "C" limit 50) x), '[]'::jsonb)
  );

  -- Who they are
  result := result || jsonb_build_object(
    'devices', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C") from (
      select coalesce(device, 'unknown') as key, count(*) as sessions, count(distinct vid) as visitors from a_ss group by 1) x), '[]'::jsonb),
    'browsers', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C") from (
      select * from (select coalesce(browser, 'unknown') as key, count(*) as sessions, count(distinct vid) as visitors from a_ss group by 1) y
      order by y.sessions desc, y.key collate "C" limit 50) x), '[]'::jsonb),
    'os', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C") from (
      select * from (select coalesce(os, 'unknown') as key, count(*) as sessions, count(distinct vid) as visitors from a_ss group by 1) y
      order by y.sessions desc, y.key collate "C" limit 50) x), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C") from (
      select * from (select coalesce(country, 'unknown') as key, count(*) as sessions, count(distinct vid) as visitors from a_ss group by 1) y
      order by y.sessions desc, y.key collate "C" limit 50) x), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(to_jsonb(x) order by x.sessions desc, x.key collate "C") from (
      select * from (select coalesce(lang, 'unknown') as key, count(*) as sessions, count(distinct vid) as visitors from a_ss group by 1) y
      order by y.sessions desc, y.key collate "C" limit 50) x), '[]'::jsonb)
  );

  -- What they look at
  result := result || jsonb_build_object(
    'pages', coalesce((
      with pv as (
        select path as key, count(*) as views, count(distinct vid) as visitors, max(title collate "C") as title
        from a_ev where name = 'pageview' and path is not null group by path),
      eng as (
        select path, coalesce(sum(secs), 0) as seconds, count(*) as engaged, round(avg(scroll), 1) as scroll
        from a_pv group by path),
      firsts as (select distinct on (sid) sid, path from a_ev where name = 'pageview' order by sid, at, id),
      lasts as (select distinct on (sid) sid, path from a_ev where name = 'pageview' order by sid, at desc, id desc),
      en as (select path, count(*) as n from firsts group by path),
      ex as (select path, count(*) as n from lasts group by path)
      select jsonb_agg(to_jsonb(x) order by x.views desc, x.key collate "C") from (
        select pv.key, pv.title, pv.views, pv.visitors, coalesce(eng.seconds, 0) as seconds, coalesce(eng.engaged, 0) as engaged,
               eng.scroll, coalesce(en.n, 0) as entries, coalesce(ex.n, 0) as exits
        from pv left join eng on eng.path = pv.key left join en on en.path = pv.key left join ex on ex.path = pv.key
        order by pv.views desc, pv.key collate "C" limit 100) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x) order by x.reached desc, x.key collate "C") from (
      select * from (
        select sec as key, count(*) as reached from (
          select distinct sid, props ->> 'pv' as pv, jsonb_array_elements_text(props -> 'sections') as sec
          from a_ev where name = 'engagement' and path = '/' and jsonb_typeof(props -> 'sections') = 'array') d
        group by 1) y
      order by y.reached desc, y.key collate "C" limit 40) x), '[]'::jsonb),
    'slides', coalesce((select jsonb_agg(to_jsonb(x) order by x.views desc, x.key collate "C") from (
      select * from (
        select label as key, count(*) filter (where name = 'slide') as views, count(*) filter (where name = 'slide_tap') as taps
        from a_ev where name in ('slide', 'slide_tap') and label is not null group by 1) y
      order by y.views desc, y.key collate "C" limit 20) x), '[]'::jsonb),
    'ctas', coalesce((select jsonb_agg(to_jsonb(x) order by x.taps desc, x.key collate "C") from (
      select * from (select label as key, count(*) as taps from a_ev where name = 'cta' and label is not null group by 1) y
      order by y.taps desc, y.key collate "C" limit 50) x), '[]'::jsonb),
    'menu', coalesce((select jsonb_agg(to_jsonb(x) order by x.taps desc, x.key collate "C") from (
      select * from (select label as key, count(*) as taps from a_ev where name = 'menu' and label is not null group by 1) y
      order by y.taps desc, y.key collate "C" limit 30) x), '[]'::jsonb),
    'outbound', coalesce((select jsonb_agg(to_jsonb(x) order by x.taps desc, x.key collate "C") from (
      select * from (select label as key, count(*) as taps from a_ev where name = 'outbound' and label is not null group by 1) y
      order by y.taps desc, y.key collate "C" limit 30) x), '[]'::jsonb)
  );

  -- Music, video and photos
  result := result || jsonb_build_object(
    'songs', coalesce((select jsonb_agg(to_jsonb(x) order by x.plays desc, x.key collate "C") from (
      select * from (
        select label as key, count(*) filter (where name = 'play') as plays, count(*) filter (where name = 'heard') as listens,
               round(avg(value) filter (where name = 'heard'), 1) as heard,
               count(*) filter (where name = 'heard' and value >= 90) as completes
        from a_ev where name in ('play', 'heard') and label is not null group by 1) y
      order by y.plays desc, y.key collate "C" limit 50) x), '[]'::jsonb),
    'streams', coalesce((select jsonb_agg(to_jsonb(x) order by x.taps desc, x.key collate "C") from (
      select * from (select label as key, count(*) as taps from a_ev where name = 'stream' and label is not null group by 1) y
      order by y.taps desc, y.key collate "C" limit 20) x), '[]'::jsonb),
    'videos', coalesce((select jsonb_agg(to_jsonb(x) order by x.plays desc, x.key collate "C") from (
      select * from (select label as key, count(*) as plays from a_ev where name = 'video' and label is not null group by 1) y
      order by y.plays desc, y.key collate "C" limit 50) x), '[]'::jsonb),
    'galleries', coalesce((select jsonb_agg(to_jsonb(x) order by x.opens desc, x.key collate "C") from (
      select * from (select label as key, count(*) as opens from a_ev where name = 'gallery' and label is not null group by 1) y
      order by y.opens desc, y.key collate "C" limit 30) x), '[]'::jsonb),
    'searches', coalesce((select jsonb_agg(to_jsonb(x) order by x.searches desc, x.key collate "C") from (
      select * from (
        select lower(trim(label)) as key, count(*) as searches, count(*) filter (where value = 0) as empty
        from a_ev where name = 'search' and coalesce(trim(label), '') <> '' group by 1) y
      order by y.searches desc, y.key collate "C" limit 50) x), '[]'::jsonb)
  );

  -- Sign-ups, step by step
  result := result || jsonb_build_object(
    'goals', coalesce((select jsonb_object_agg(name, n) from (
      select name, count(*) as n from a_ev
      where name in ('registered', 'applied', 'booking', 'enquiry', 'newsletter', 'register_open', 'apply_start', 'booking_start')
      group by name) g), '{}'::jsonb),
    'funnels', jsonb_build_object(
      'talent', jsonb_build_array(
        (select count(distinct sid) from a_ev where name = 'pageview' and path = '/symphony'),
        (select count(distinct sid) from a_ev where name = 'apply_start'),
        (select count(distinct sid) from a_ev where name = 'applied')),
      'events', jsonb_build_array(
        (select count(distinct sid) from a_ev where name = 'pageview' and path = '/events'),
        (select count(distinct sid) from a_ev where name = 'register_open'),
        (select count(distinct sid) from a_ev where name = 'registered')),
      'booking', jsonb_build_array(
        (select count(distinct sid) from a_ev where name = 'pageview' and path = '/contact'),
        (select count(distinct sid) from a_ev where name = 'booking_start'),
        (select count(distinct sid) from a_ev where name = 'booking'))),
    'eventRegistrations', coalesce((select jsonb_agg(to_jsonb(x) order by x.opens desc, x.key collate "C") from (
      select * from (
        select props ->> 'id' as key, max(label collate "C") as title,
               count(*) filter (where name = 'register_open') as opens, count(*) filter (where name = 'registered') as registered
        from a_ev where name in ('register_open', 'registered') and coalesce(props ->> 'id', '') <> '' group by 1) y
      order by y.opens desc, y.key collate "C" limit 50) x), '[]'::jsonb),
    'newsletterBy', coalesce((select jsonb_agg(to_jsonb(x) order by x.signups desc, x.key collate "C") from (
      select * from (select coalesce(path, '') as key, count(*) as signups from a_ev where name = 'newsletter' group by 1) y
      order by y.signups desc, y.key collate "C" limit 20) x), '[]'::jsonb)
  );

  -- Site health
  result := result || jsonb_build_object(
    'perf', coalesce((select jsonb_agg(to_jsonb(x) order by x.loads desc, x.key collate "C") from (
      select coalesce(device, 'unknown') as key, count(*) as loads,
             percentile_cont(0.5) within group (order by load) as median,
             percentile_cont(0.75) within group (order by load) as p75,
             percentile_cont(0.5) within group (order by lcp) as lcp
      from a_pv where load is not null group by 1) x), '[]'::jsonb),
    'slowPages', coalesce((select jsonb_agg(to_jsonb(x) order by x.median desc, x.key collate "C") from (
      select * from (
        select path as key, count(*) as loads, percentile_cont(0.5) within group (order by load) as median
        from a_pv where load is not null and path is not null group by 1) y
      order by y.median desc, y.key collate "C" limit 20) x), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc, x.key collate "C") from (
      select * from (
        select label as key, count(*) as n, count(distinct path) as pages, max(at) as last
        from a_ev where name = 'error' and label is not null group by 1) y
      order by y.n desc, y.key collate "C" limit 30) x), '[]'::jsonb)
  );

  return result;
end $$;

-- Who's on the site right now: anything in the last five minutes.
create or replace function public.analytics_live()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Sign in to the admin to see the analytics.'; end if;
  return (
    with recent as (
      select e.sid, e.name, e.path, s.vid, s.source
      from public.analytics_events e join public.analytics_sessions s on s.sid = e.sid
      where e.at > now() - interval '5 minutes')
    select jsonb_build_object(
      'visitors', (select count(distinct vid) from recent),
      'pages', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitors desc, x.key collate "C") from (
        select * from (select path as key, count(distinct sid) as visitors from recent where name = 'pageview' and path is not null group by 1) y
        order by y.visitors desc, y.key collate "C" limit 10) x), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(to_jsonb(x) order by x.visitors desc, x.key collate "C") from (
        select * from (select coalesce(source, 'direct') as key, count(distinct sid) as visitors from recent group by 1) y
        order by y.visitors desc, y.key collate "C" limit 10) x), '[]'::jsonb))
  );
end $$;

grant execute on function public.track(jsonb) to anon, authenticated;
grant execute on function public.analytics_report(timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.analytics_live() to authenticated;


-- ----------------------------------------------------------------------------
-- 4. Campaign links: the tagged links (and flyer QR codes) the team makes,
--    so visits from each post or poster are counted separately.
-- ----------------------------------------------------------------------------
create table if not exists public.campaign_links (
  id           text primary key,
  name         text not null,
  destination  text not null default '',   -- a page on the site, e.g. events?register=event-004
  source       text not null,              -- instagram, whatsapp, flyer…
  medium       text not null default '',   -- social, messaging, print…
  campaign     text not null,              -- e.g. spaw-2026
  content      text,                       -- which post or poster, when there are several
  created_at   timestamptz not null default now(),
  created_by   text default lower(coalesce(auth.jwt() ->> 'email', ''))
);
alter table public.campaign_links enable row level security;
revoke all on public.campaign_links from anon;
grant select, insert, update, delete on public.campaign_links to authenticated;
drop policy if exists "the team reads campaign links" on public.campaign_links;
create policy "the team reads campaign links" on public.campaign_links for select to authenticated using (public.is_admin());
drop policy if exists "the team adds campaign links" on public.campaign_links;
create policy "the team adds campaign links" on public.campaign_links for insert to authenticated with check (public.is_admin());
drop policy if exists "the team changes campaign links" on public.campaign_links;
create policy "the team changes campaign links" on public.campaign_links for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "the team removes campaign links" on public.campaign_links;
create policy "the team removes campaign links" on public.campaign_links for delete to authenticated using (public.is_admin());


-- Event registration used to be part 5 here; it is in setup-4.sql now, with
-- the registration form's own questions and sold-out events.
