-- One court, one crew. Every signed-in account is a member; anon gets nothing.
-- Close sign-ups in Supabase Auth once your friends have accounts.

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Some hosted projects already have this DDL safeguard. It is not an app RPC.
do $$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

create table public.players (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  display_name text not null
    check (pg_catalog.char_length(display_name) between 1 and 32 and pg_catalog.btrim(display_name) <> ''),
  archived boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now()
);
create unique index players_name_idx on public.players (pg_catalog.lower(display_name));

create table public.sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_date date not null default (pg_catalog.now() at time zone 'Asia/Dubai')::date,
  target_score smallint not null default 11 check (target_score in (11, 21)),
  ended_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now()
);
create unique index sessions_one_active_idx on public.sessions ((true)) where ended_at is null;
create index sessions_date_idx on public.sessions (session_date desc, created_at desc);

create table public.session_players (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (session_id, player_id)
);
create index session_players_player_idx on public.session_players (player_id);

create table public.games (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  target_score smallint not null default 11 check (target_score in (11, 21)),
  side_a_player_1 uuid not null,
  side_a_player_2 uuid,
  side_b_player_1 uuid not null,
  side_b_player_2 uuid,
  score_a smallint not null,
  score_b smallint not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (session_id, side_a_player_1) references public.session_players(session_id, player_id) on delete cascade,
  foreign key (session_id, side_a_player_2) references public.session_players(session_id, player_id) on delete cascade,
  foreign key (session_id, side_b_player_1) references public.session_players(session_id, player_id) on delete cascade,
  foreign key (session_id, side_b_player_2) references public.session_players(session_id, player_id) on delete cascade,
  constraint games_distinct_players check (
    side_a_player_1 <> side_b_player_1
    and (side_a_player_2 is null or (
      side_a_player_2 <> side_a_player_1 and side_a_player_2 <> side_b_player_1))
    and (side_b_player_2 is null or (
      side_b_player_2 <> side_a_player_1 and side_b_player_2 <> side_b_player_1))
    and (side_a_player_2 is null or side_b_player_2 is null or side_a_player_2 <> side_b_player_2)
  ),
  constraint games_final_score check (
    score_a >= 0 and score_b >= 0 and score_a <> score_b and (
      (greatest(score_a, score_b) = target_score and least(score_a, score_b) <= target_score - 2)
      or (greatest(score_a, score_b) > target_score
        and least(score_a, score_b) = greatest(score_a, score_b) - 2)
    )
  )
);
create index games_session_idx on public.games (session_id, created_at, id);
create index games_attendee_a1_idx on public.games (session_id, side_a_player_1);
create index games_attendee_a2_idx on public.games (session_id, side_a_player_2);
create index games_attendee_b1_idx on public.games (session_id, side_b_player_1);
create index games_attendee_b2_idx on public.games (session_id, side_b_player_2);

create function public.start_session(attendees uuid[], points smallint default 11)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  new_id uuid := pg_catalog.gen_random_uuid();
begin
  if attendees is null or pg_catalog.cardinality(attendees) < 2
    or pg_catalog.cardinality(attendees) <> (
      select pg_catalog.count(distinct a.player_id) from pg_catalog.unnest(attendees) as a(player_id)
    ) then
    raise exception 'Choose at least two distinct, non-null attendees' using errcode = '22023';
  end if;
  insert into public.sessions (id, target_score) values (new_id, points);
  insert into public.session_players (session_id, player_id)
  select new_id, a.player_id from pg_catalog.unnest(attendees) as a(player_id);
  return new_id;
end;
$$;

create function public.player_stats()
returns table (player_id uuid, played bigint, wins bigint, points_for bigint, points_against bigint)
language sql stable security invoker set search_path = ''
as $$
  select side.player_id,
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where side.scored > side.conceded),
    pg_catalog.sum(side.scored),
    pg_catalog.sum(side.conceded)
  from public.games as g
  cross join lateral (values
    (g.side_a_player_1, g.score_a, g.score_b),
    (g.side_a_player_2, g.score_a, g.score_b),
    (g.side_b_player_1, g.score_b, g.score_a),
    (g.side_b_player_2, g.score_b, g.score_a)
  ) as side(player_id, scored, conceded)
  where side.player_id is not null
  group by side.player_id;
$$;

create function public.guard_row_identity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  before_row jsonb := pg_catalog.to_jsonb(old);
  after_row jsonb := pg_catalog.to_jsonb(new);
  identity_column text;
begin
  foreach identity_column in array tg_argv loop
    if before_row -> identity_column is distinct from after_row -> identity_column then
      raise exception '% is immutable', identity_column using errcode = '23514';
    end if;
  end loop;
  if tg_table_name = 'sessions' and before_row ->> 'ended_at' is not null
    and before_row -> 'ended_at' is distinct from after_row -> 'ended_at' then
    raise exception 'A closed session cannot be reopened or re-ended' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger players_identity before update on public.players
  for each row execute function public.guard_row_identity('id', 'created_at');
create trigger sessions_identity before update on public.sessions
  for each row execute function public.guard_row_identity('id', 'created_at');
create trigger session_players_identity before update on public.session_players
  for each row execute function public.guard_row_identity('session_id', 'player_id', 'created_at');
create trigger games_identity before update on public.games
  for each row execute function public.guard_row_identity('id', 'session_id', 'created_at');

create function public.guard_game_insert()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  session_end timestamptz;
begin
  -- FOR SHARE conflicts with an UPDATE of ended_at, unlike FOR KEY SHARE.
  select s.ended_at into session_end from public.sessions as s
  where s.id = new.session_id for share;
  if not found then
    raise exception 'Session not accessible' using errcode = '42501';
  end if;
  if session_end is not null then
    raise exception 'Session has ended' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger games_open_session before insert on public.games
  for each row execute function public.guard_game_insert();

alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.games enable row level security;

-- Every signed-in account shares the court. Writes are always attributed to the caller.
create policy players_select on public.players for select to authenticated using (true);
create policy players_insert on public.players for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy players_update on public.players for update to authenticated
  using (true) with check (created_by = (select auth.uid()));
create policy players_delete on public.players for delete to authenticated using (true);

create policy sessions_select on public.sessions for select to authenticated using (true);
create policy sessions_insert on public.sessions for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy sessions_update on public.sessions for update to authenticated
  using (true) with check (created_by = (select auth.uid()));
create policy sessions_delete on public.sessions for delete to authenticated using (true);

create policy session_players_select on public.session_players for select to authenticated using (true);
create policy session_players_insert on public.session_players for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy session_players_update on public.session_players for update to authenticated
  using (true) with check (created_by = (select auth.uid()));
create policy session_players_delete on public.session_players for delete to authenticated using (true);

create policy games_select on public.games for select to authenticated using (true);
create policy games_insert on public.games for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy games_update on public.games for update to authenticated
  using (true) with check (created_by = (select auth.uid()));
create policy games_delete on public.games for delete to authenticated using (true);

revoke all on table public.players, public.sessions, public.session_players, public.games
  from public, anon, authenticated;
grant select, insert, update, delete on public.players, public.sessions,
  public.session_players, public.games to authenticated;

revoke all on function public.start_session(uuid[], smallint), public.player_stats(),
  public.guard_row_identity(), public.guard_game_insert() from public, anon, authenticated;
grant execute on function public.start_session(uuid[], smallint), public.player_stats() to authenticated;
