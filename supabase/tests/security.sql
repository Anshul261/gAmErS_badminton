-- Run with psql -X -v ON_ERROR_STOP=1 -f supabase/tests/security.sql against a disposable database.
begin;

create function pg_temp.expect_error(command text, expected_state text)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  actual_state text;
begin
  begin
    execute command;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
  end;
  if actual_state is distinct from expected_state then
    raise exception 'Expected SQLSTATE %, got % for %', expected_state, coalesce(actual_state, 'success'), command;
  end if;
end;
$$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;

do $$
declare
  definer_names text[];
  f record;
  t record;
begin
  if (select count(*) from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')) <> 4 then
    raise exception 'Expected four public tables';
  end if;
  for t in select c.oid, c.relname, c.relrowsecurity from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    if not t.relrowsecurity then raise exception 'RLS missing on %', t.relname; end if;
    if pg_catalog.has_table_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'anon has table privileges on %', t.relname;
    end if;
    if pg_catalog.has_table_privilege('authenticated', t.oid, 'TRUNCATE') then
      raise exception 'authenticated can truncate %', t.relname;
    end if;
  end loop;
  select array_agg(p.proname::text order by p.proname) into definer_names
    from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'event_trigger'::regtype;
  if definer_names is not null then
    raise exception 'Unexpected SECURITY DEFINER functions: %', definer_names;
  end if;
  for f in select p.* from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace where n.nspname = 'public' loop
    if f.prorettype = 'event_trigger'::regtype then
      if pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') then
        raise exception 'Event trigger exposed to client: %', f.proname;
      end if;
      continue;
    end if;
    if not coalesce('search_path=""' = any(f.proconfig), false) then
      raise exception 'Unpinned search_path on %', f.proname;
    end if;
    if pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') or exists (
      select 1 from pg_catalog.aclexplode(coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))) as a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) then raise exception 'Public function execution on %', f.proname; end if;
    if f.proname not like 'guard_%' and not pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      raise exception 'Missing authenticated RPC grant on %', f.proname;
    end if;
    if f.proname like 'guard_%' and pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      raise exception 'Trigger function exposed as RPC: %', f.proname;
    end if;
  end loop;
end;
$$;

set local role anon;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
do $$
declare
  table_name text;
begin
  foreach table_name in array array['players', 'sessions', 'session_players', 'games'] loop
    perform pg_temp.expect_error(format('select * from public.%I', table_name), '42501');
    perform pg_temp.expect_error(format('insert into public.%I default values', table_name), '42501');
    perform pg_temp.expect_error(format('update public.%I set created_by = null', table_name), '42501');
    perform pg_temp.expect_error(format('delete from public.%I', table_name), '42501');
  end loop;
  perform pg_temp.expect_error('select public.start_session(null)', '42501');
  perform pg_temp.expect_error('select * from public.player_stats()', '42501');
end;
$$;

set local role authenticated;
do $$
declare
  owner_id uuid := '11111111-1111-4111-8111-111111111111';
  friend_id uuid := '22222222-2222-4222-8222-222222222222';
  sid uuid;
  other_sid uuid;
  game_id uuid := pg_catalog.gen_random_uuid();
  friend_game_id uuid;
  p1 uuid := pg_catalog.gen_random_uuid();
  p2 uuid := pg_catalog.gen_random_uuid();
  p3 uuid := pg_catalog.gen_random_uuid();
  p4 uuid := pg_catalog.gen_random_uuid();
  p5 uuid := pg_catalog.gen_random_uuid();
  ghost uuid := pg_catalog.gen_random_uuid();
  duplicates uuid[];
  score record;
  table_name text;
  row_count bigint;
  i integer;
  j integer;
begin
  -- A JWT without a subject must never be able to write.
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_error('insert into public.players (display_name) values (''nobody'')', '42501');

  perform pg_catalog.set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.players (id, display_name) values
    (p1, 'Asha'), (p2, 'Ben'), (p3, 'Chen'), (p4, 'Devi'), (p5, 'Eli');
  if not exists (select 1 from public.players where id = p1 and created_by = owner_id and not archived) then
    raise exception 'Player defaults or attribution failed';
  end if;
  perform pg_temp.expect_error('insert into public.players (display_name) values (''ASHA'')', '23505');
  perform pg_temp.expect_error('insert into public.players (display_name) values (''   '')', '23514');
  perform pg_temp.expect_error('insert into public.players (display_name) values (repeat(''x'', 33))', '23514');
  perform pg_temp.expect_error(format('select public.start_session(array[%L]::uuid[])', p1), '22023');
  perform pg_temp.expect_error(format('select public.start_session(array[%L,%L]::uuid[])', p1, p1), '22023');
  perform pg_temp.expect_error(format('select public.start_session(array[%L,null]::uuid[])', p1), '22023');
  perform pg_temp.expect_error(format('select public.start_session(array[%L,%L]::uuid[], 15::smallint)', p1, p2), '23514');
  perform pg_temp.expect_error(format('select public.start_session(array[%L,%L]::uuid[])', p1, ghost), '23503');
  if exists (select 1 from public.sessions where created_by = owner_id) then raise exception 'Failed start_session left partial data'; end if;
  sid := public.start_session(array[p1,p2,p3,p4]);
  if (select count(*) from public.session_players where session_id = sid) <> 4
    or not exists (select 1 from public.sessions where id = sid and target_score = 11 and created_by = owner_id
      and session_date = (now() at time zone 'Asia/Dubai')::date) then
    raise exception 'Session or attendance defaults failed';
  end if;
  -- Several courts can be open at once, and a player may be on more than one.
  other_sid := public.start_session(array[p1,p2]);
  if (select count(*) from public.sessions where ended_at is null and created_by = owner_id) <> 2 then
    raise exception 'Concurrent sessions are not allowed';
  end if;
  delete from public.sessions where id = other_sid;
  perform pg_temp.expect_error(format('insert into public.session_players (session_id, player_id) values (%L,%L)', sid, p1), '23505');
  perform pg_temp.expect_error(format('insert into public.session_players (session_id, player_id) values (%L,%L)', sid, ghost), '23503');

  for score in select * from (values
    (11,11,0), (11,0,11), (11,12,10), (11,10,12), (11,31,29),
    (21,21,0), (21,0,21), (21,22,20), (21,20,22), (21,40,38)
  ) as valid(points,a,b) loop
    insert into public.games (id, session_id, target_score, side_a_player_1, side_b_player_1, score_a, score_b)
    values (pg_catalog.gen_random_uuid(), sid, score.points, p1, p2, score.a, score.b);
  end loop;
  for score in select * from (values
    (11,0,0), (11,11,11), (11,11,10), (11,12,11), (11,12,9), (11,10,0), (11,-1,11),
    (21,21,20), (21,22,19), (21,20,0), (15,15,0)
  ) as invalid(points,a,b) loop
    perform pg_temp.expect_error(format(
      'insert into public.games (id,session_id,target_score,side_a_player_1,side_b_player_1,score_a,score_b) values (gen_random_uuid(),%L,%s,%L,%L,%s,%s)',
      sid, score.points, p1, p2, score.a, score.b), '23514');
  end loop;
  for i in 1..3 loop
    for j in (i + 1)..4 loop
      duplicates := array[p1,p2,p3,p4];
      duplicates[j] := duplicates[i];
      perform pg_temp.expect_error(format(
        'insert into public.games (id,session_id,side_a_player_1,side_a_player_2,side_b_player_1,side_b_player_2,score_a,score_b) values (gen_random_uuid(),%L,%L,%L,%L,%L,11,9)',
        sid, duplicates[1], duplicates[2], duplicates[3], duplicates[4]), '23514');
    end loop;
  end loop;
  -- Only attendees of that session can be on a game.
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b) values (gen_random_uuid(),%L,%L,%L,11,9)', sid, p1, p5), '23503');
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b) values (gen_random_uuid(),%L,%L,%L,11,9)', sid, p1, ghost), '23503');
  insert into public.games (id,session_id,side_a_player_1,side_a_player_2,side_b_player_1,side_b_player_2,score_a,score_b)
    values (game_id,sid,p1,p2,p3,p4,11,9);
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b) values (%L,%L,%L,%L,11,0)', game_id,sid,p1,p2), '23505');
  if (select score_b from public.games where id = game_id) <> 9 then raise exception 'Duplicate game ID changed a score'; end if;

  -- Identity columns are immutable and every write names its author.
  perform pg_temp.expect_error(format('update public.players set id = gen_random_uuid() where id = %L', p5), '23514');
  perform pg_temp.expect_error(format('update public.players set created_at = now() + interval ''1 day'' where id = %L', p5), '23514');
  perform pg_temp.expect_error(format('update public.sessions set id = gen_random_uuid() where id = %L', sid), '23514');
  perform pg_temp.expect_error(format('update public.session_players set player_id = %L where session_id = %L and player_id = %L', p5, sid, p1), '23514');
  perform pg_temp.expect_error(format('update public.games set session_id = gen_random_uuid() where id = %L', game_id), '23514');
  perform pg_temp.expect_error(format('insert into public.players (display_name,created_by) values (''spoof'',%L)', friend_id), '42501');
  perform pg_temp.expect_error(format('insert into public.sessions (created_by) values (%L)', friend_id), '42501');
  perform pg_temp.expect_error(format('insert into public.session_players (session_id,player_id,created_by) values (%L,%L,%L)', sid,p5,friend_id), '42501');
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b,created_by) values (gen_random_uuid(),%L,%L,%L,11,9,%L)', sid,p1,p2,friend_id), '42501');
  foreach table_name in array array['players','sessions','session_players','games'] loop
    perform pg_temp.expect_error(format('update public.%I set created_by = %L', table_name,friend_id), '42501');
  end loop;

  -- Any other signed-in friend shares the court and can correct anything, attributed to them.
  perform pg_catalog.set_config('request.jwt.claim.sub', friend_id::text, true);
  if (select count(*) from public.players where created_by = owner_id) <> 5 or (select count(*) from public.games where session_id = sid) <> 11 then
    raise exception 'Friend cannot read shared data';
  end if;
  if (select count(*) from public.player_stats() where player_id in (p1, p2, p3, p4)) <> 4 then raise exception 'Friend stats are incomplete'; end if;
  perform pg_temp.expect_error(format('update public.players set display_name = ''Asha corrected'' where id = %L', p1), '42501');
  update public.players set display_name = 'Asha corrected', created_by = friend_id where id = p1;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Friend correction failed'; end if;
  update public.players set archived = true, created_by = friend_id where id = p5;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Friend archive failed'; end if;
  insert into public.session_players (session_id,player_id) values (sid,p5);
  update public.session_players set created_by = friend_id where session_id = sid and player_id = p1;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Friend attendance revision failed'; end if;
  delete from public.session_players where session_id = sid and player_id = p5;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Friend attendance delete failed'; end if;
  insert into public.players (display_name) values ('Temporary');
  delete from public.players where display_name = 'Temporary';
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Friend player CRUD failed'; end if;
  insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b)
    values (pg_catalog.gen_random_uuid(),sid,p1,p2,11,9) returning id into friend_game_id;
  if not exists (select 1 from public.games where id = friend_game_id and created_by = friend_id) then
    raise exception 'Friend game insert failed';
  end if;

  -- Closing a session is final; existing games stay correctable.
  update public.sessions set ended_at = now(), created_by = friend_id where id = sid;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Friend could not end session'; end if;
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b) values (gen_random_uuid(),%L,%L,%L,11,9)', sid,p1,p2), '23514');
  perform pg_temp.expect_error(format('update public.sessions set ended_at = null, created_by = %L where id = %L', friend_id, sid), '23514');
  perform pg_temp.expect_error(format('update public.sessions set ended_at = now() + interval ''1 day'', created_by = %L where id = %L', friend_id, sid), '23514');
  update public.games set score_b = 8, created_by = friend_id where id = game_id;
  if not found or (select score_b from public.games where id = game_id) <> 8 then
    raise exception 'Closed-session score correction failed';
  end if;
  delete from public.games where id = game_id;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Closed-session game removal failed'; end if;
  other_sid := public.start_session(array[p1,p2],21::smallint);
  if not exists (select 1 from public.sessions where id = other_sid and target_score = 21 and created_by = friend_id) then
    raise exception 'Friend session start failed';
  end if;
  delete from public.sessions where id = other_sid;
  get diagnostics row_count = row_count;
  if row_count <> 1 or exists (select 1 from public.session_players where session_id = other_sid) then
    raise exception 'Session deletion did not cascade attendance';
  end if;
  delete from public.players where id = p3;
  if exists (select 1 from public.games where side_a_player_1 = p3 or side_a_player_2 = p3 or side_b_player_1 = p3 or side_b_player_2 = p3) then
    raise exception 'Player deletion did not cascade to games';
  end if;
  raise notice 'Security and constraint tests passed';
end;
$$;

rollback;
