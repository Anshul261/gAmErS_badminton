-- Sessions can be planned ahead: a date, an optional time, a place, and a map link.
-- Attendees are optional at creation; people add themselves when they arrive.
alter table public.sessions
  add column start_time time,
  add column venue_name text
    check (venue_name is null or (pg_catalog.char_length(venue_name) between 1 and 80 and pg_catalog.btrim(venue_name) <> '')),
  add column venue_url text
    check (venue_url is null or (venue_url ~ '^https://' and pg_catalog.char_length(venue_url) <= 500));

drop function public.start_session(uuid[], smallint);
create function public.start_session(
  attendees uuid[] default '{}',
  points smallint default 11,
  on_date date default null,
  at_time time default null,
  venue text default null,
  map_url text default null
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  new_id uuid := pg_catalog.gen_random_uuid();
  people uuid[] := coalesce(attendees, '{}');
begin
  if pg_catalog.cardinality(people) <> (
    select pg_catalog.count(distinct a.player_id) from pg_catalog.unnest(people) as a(player_id)
  ) then
    raise exception 'Attendees must be distinct and non-null' using errcode = '22023';
  end if;
  insert into public.sessions (id, target_score, session_date, start_time, venue_name, venue_url)
  values (new_id, points, coalesce(on_date, (pg_catalog.now() at time zone 'Asia/Dubai')::date), at_time,
    nullif(pg_catalog.btrim(venue), ''), nullif(pg_catalog.btrim(map_url), ''));
  insert into public.session_players (session_id, player_id)
  select new_id, a.player_id from pg_catalog.unnest(people) as a(player_id);
  return new_id;
end;
$$;

revoke all on function public.start_session(uuid[], smallint, date, time, text, text) from public, anon, authenticated;
grant execute on function public.start_session(uuid[], smallint, date, time, text, text) to authenticated;
