create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

revoke create on schema public from public, anon, authenticated;
grant usage on schema public, extensions to authenticated;
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

create table public.groups (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null check (pg_catalog.char_length(name) between 1 and 60 and pg_catalog.btrim(name) <> ''),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now(),
  invite_hash text not null unique check (invite_hash ~ '^[0-9a-f]{64}$'),
  invite_expires_at timestamptz not null
    check (invite_expires_at <= pg_catalog.now() + interval '7 days'),
  admin_bootstrapped boolean not null default false
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id, group_id);

create table public.players (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  display_name text not null
    check (pg_catalog.char_length(display_name) between 1 and 32 and pg_catalog.btrim(display_name) <> ''),
  archived boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now(),
  unique (group_id, id)
);
create unique index players_group_name_idx
  on public.players (group_id, pg_catalog.lower(display_name));

create table public.sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  session_date date not null default (pg_catalog.now() at time zone 'Asia/Dubai')::date,
  target_score smallint not null default 11 check (target_score in (11, 21)),
  ended_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now(),
  unique (group_id, id)
);
create unique index sessions_one_active_idx on public.sessions (group_id) where ended_at is null;
create index sessions_group_date_idx on public.sessions (group_id, session_date desc);

create table public.session_players (
  session_id uuid not null,
  group_id uuid not null,
  player_id uuid not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (session_id, player_id),
  foreign key (group_id, session_id) references public.sessions(group_id, id) on delete cascade,
  foreign key (group_id, player_id) references public.players(group_id, id) on delete cascade
);
create index session_players_group_session_idx on public.session_players (group_id, session_id);
create index session_players_group_player_idx on public.session_players (group_id, player_id);

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
create index games_attendee_a1_idx on public.games (session_id, side_a_player_1);
create index games_attendee_a2_idx on public.games (session_id, side_a_player_2);
create index games_attendee_b1_idx on public.games (session_id, side_b_player_1);
create index games_attendee_b2_idx on public.games (session_id, side_b_player_2);

create function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.group_members as m
    where m.group_id = gid and m.user_id = (select auth.uid())
  );
$$;

create function public.is_group_admin(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.group_members as m
    where m.group_id = gid and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

create function public.join_group(invite_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  joined public.groups%rowtype;
  member_role text := 'member';
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if invite_code is null or pg_catalog.char_length(invite_code) not between 1 and 128 then
    raise exception 'Invalid or expired invite' using errcode = '22023';
  end if;

  -- Lock against rotation and concurrent bootstrap attempts. Only hashes are compared.
  select g.* into joined from public.groups as g
  where g.invite_hash = pg_catalog.encode(extensions.digest(invite_code, 'sha256'), 'hex')
    and g.invite_expires_at > pg_catalog.clock_timestamp()
  for update;
  if not found or joined.invite_expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Invalid or expired invite' using errcode = '22023';
  end if;

  if joined.created_by = caller and not joined.admin_bootstrapped then
    member_role := 'admin';
    update public.groups set admin_bootstrapped = true where id = joined.id;
  end if;
  insert into public.group_members (group_id, user_id, role, created_by)
  values (joined.id, caller, member_role, caller)
  on conflict (group_id, user_id) do nothing;
  return joined.id;
end;
$$;

create function public.create_group(group_name text)
returns json language plpgsql security invoker set search_path = ''
as $$
declare
  new_id uuid := pg_catalog.gen_random_uuid();
  code text := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- No RETURNING here: the creator cannot SELECT the group until join_group runs.
  insert into public.groups (id, name, invite_hash, invite_expires_at)
  values (new_id, pg_catalog.btrim(group_name),
    pg_catalog.encode(extensions.digest(code, 'sha256'), 'hex'), pg_catalog.now() + interval '7 days');
  perform public.join_group(code);
  return pg_catalog.json_build_object('group_id', new_id, 'invite_code', code);
end;
$$;

create function public.rotate_invite(gid uuid)
returns text language plpgsql security invoker set search_path = ''
as $$
declare
  code text := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.groups
  set invite_hash = pg_catalog.encode(extensions.digest(code, 'sha256'), 'hex'),
    invite_expires_at = pg_catalog.now() + interval '7 days', created_by = auth.uid()
  where id = gid;
  if not found then
    raise exception 'Group admin access required' using errcode = '42501';
  end if;
  return code;
end;
$$;

create function public.start_session(gid uuid, attendees uuid[], points smallint default 11)
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
  insert into public.sessions (id, group_id, target_score) values (new_id, gid, points);
  insert into public.session_players (session_id, group_id, player_id)
  select new_id, gid, a.player_id from pg_catalog.unnest(attendees) as a(player_id);
  return new_id;
end;
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

create trigger groups_identity before update on public.groups
  for each row execute function public.guard_row_identity('id', 'created_by', 'created_at');
create trigger group_members_identity before update on public.group_members
  for each row execute function public.guard_row_identity('group_id', 'user_id', 'created_at');
create trigger players_identity before update on public.players
  for each row execute function public.guard_row_identity('id', 'group_id', 'created_at');
create trigger sessions_identity before update on public.sessions
  for each row execute function public.guard_row_identity('id', 'group_id', 'created_at');
create trigger session_players_identity before update on public.session_players
  for each row execute function public.guard_row_identity('session_id', 'group_id', 'player_id', 'created_at');
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

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.games enable row level security;

create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (created_by = (select auth.uid()) and not admin_bootstrapped);
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id) and created_by = (select auth.uid()));
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_group_admin(id));

create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy group_members_delete on public.group_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_group_admin(group_id));

create policy players_select on public.players for select to authenticated
  using (public.is_group_member(group_id));
create policy players_insert on public.players for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
create policy players_update on public.players for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
create policy players_delete on public.players for delete to authenticated
  using (public.is_group_member(group_id));

create policy sessions_select on public.sessions for select to authenticated
  using (public.is_group_member(group_id));
create policy sessions_insert on public.sessions for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
create policy sessions_update on public.sessions for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
create policy sessions_delete on public.sessions for delete to authenticated
  using (public.is_group_member(group_id));

create policy session_players_select on public.session_players for select to authenticated
  using (exists (select 1 from public.sessions as s where s.id = session_players.session_id));
create policy session_players_insert on public.session_players for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.sessions as s where s.id = session_players.session_id
  ));
create policy session_players_update on public.session_players for update to authenticated
  using (exists (select 1 from public.sessions as s where s.id = session_players.session_id))
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.sessions as s where s.id = session_players.session_id
  ));
create policy session_players_delete on public.session_players for delete to authenticated
  using (exists (select 1 from public.sessions as s where s.id = session_players.session_id));

create policy games_select on public.games for select to authenticated
  using (exists (select 1 from public.sessions as s where s.id = games.session_id));
create policy games_insert on public.games for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.sessions as s where s.id = games.session_id
  ));
create policy games_update on public.games for update to authenticated
  using (exists (select 1 from public.sessions as s where s.id = games.session_id))
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.sessions as s where s.id = games.session_id
  ));
create policy games_delete on public.games for delete to authenticated
  using (exists (select 1 from public.sessions as s where s.id = games.session_id));

revoke all on table public.groups, public.group_members, public.players,
  public.sessions, public.session_players, public.games from public, anon, authenticated;
grant select, delete on public.groups to authenticated;
grant insert (id, name, created_by, created_at, invite_hash, invite_expires_at),
  update (name, created_by, invite_hash, invite_expires_at) on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.players, public.sessions,
  public.session_players, public.games to authenticated;

revoke all on function public.is_group_member(uuid), public.is_group_admin(uuid),
  public.join_group(text), public.create_group(text), public.rotate_invite(uuid),
  public.start_session(uuid, uuid[], smallint), public.guard_row_identity(),
  public.guard_game_insert() from public, anon, authenticated;
grant execute on function public.is_group_member(uuid), public.is_group_admin(uuid),
  public.join_group(text), public.create_group(text), public.rotate_invite(uuid),
  public.start_session(uuid, uuid[], smallint) to authenticated;
