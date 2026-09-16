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
      where n.nspname = 'public' and c.relkind in ('r', 'p')) <> 6 then
    raise exception 'Expected six public tables';
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
  if definer_names is distinct from array['is_group_admin', 'is_group_member', 'join_group'] then
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
  if pg_catalog.has_column_privilege('authenticated', 'public.groups', 'admin_bootstrapped', 'INSERT,UPDATE') then
    raise exception 'Bootstrap flag is client writable';
  end if;
  if exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.group_members'::regclass
      and polcmd not in ('r', 'd')) then
    raise exception 'Membership inserts or promotions have an RLS policy';
  end if;
end;
$$;

set local role anon;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
do $$
declare
  table_name text;
begin
  foreach table_name in array array['groups', 'group_members', 'players', 'sessions', 'session_players', 'games'] loop
    perform pg_temp.expect_error(format('select * from public.%I', table_name), '42501');
    perform pg_temp.expect_error(format('insert into public.%I default values', table_name), '42501');
    perform pg_temp.expect_error(format('update public.%I set created_by = null', table_name), '42501');
    perform pg_temp.expect_error(format('delete from public.%I', table_name), '42501');
  end loop;
  perform pg_temp.expect_error('select public.is_group_member(null)', '42501');
  perform pg_temp.expect_error('select public.is_group_admin(null)', '42501');
  perform pg_temp.expect_error('select public.join_group(''guess'')', '42501');
  perform pg_temp.expect_error('select public.create_group(''anon'')', '42501');
  perform pg_temp.expect_error('select public.rotate_invite(null)', '42501');
  perform pg_temp.expect_error('select public.start_session(null, null)', '42501');
end;
$$;

set local role authenticated;
do $$
declare
  owner_id uuid := '11111111-1111-4111-8111-111111111111';
  member_id uuid := '22222222-2222-4222-8222-222222222222';
  outsider_id uuid := '33333333-3333-4333-8333-333333333333';
  created json;
  gid uuid;
  other_gid uuid;
  code text;
  old_code text;
  sid uuid;
  other_sid uuid;
  game_id uuid := pg_catalog.gen_random_uuid();
  member_game_id uuid;
  p1 uuid := pg_catalog.gen_random_uuid();
  p2 uuid := pg_catalog.gen_random_uuid();
  p3 uuid := pg_catalog.gen_random_uuid();
  p4 uuid := pg_catalog.gen_random_uuid();
  p5 uuid := pg_catalog.gen_random_uuid();
  q1 uuid := pg_catalog.gen_random_uuid();
  q2 uuid := pg_catalog.gen_random_uuid();
  duplicates uuid[];
  score record;
  table_name text;
  row_count bigint;
  i integer;
  j integer;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.expect_error('select public.join_group(''guess'')', '42501');
  if public.is_group_member(pg_catalog.gen_random_uuid()) or public.is_group_admin(pg_catalog.gen_random_uuid()) then
    raise exception 'Missing identity passed membership helpers';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', owner_id::text, true);
  created := public.create_group('Evening badminton');
  gid := (created ->> 'group_id')::uuid;
  code := created ->> 'invite_code';
  if length(code) <> 64 or not public.is_group_admin(gid) or not public.is_group_member(gid) then
    raise exception 'Owner bootstrap failed';
  end if;
  if not exists (select 1 from public.groups where id = gid and admin_bootstrapped
      and created_by = owner_id and invite_hash = encode(extensions.digest(code, 'sha256'), 'hex')
      and invite_hash <> code and invite_expires_at = now() + interval '7 days') then
    raise exception 'Group hash, expiry, author or bootstrap state is wrong';
  end if;
  if not exists (select 1 from public.group_members where group_id = gid and user_id = owner_id
      and role = 'admin' and created_by = owner_id) then
    raise exception 'Owner membership audit failed';
  end if;
  perform public.join_group(code);
  if (select count(*) from public.group_members where group_id = gid) <> 1 then
    raise exception 'Joining twice created duplicate memberships';
  end if;
  perform pg_temp.expect_error(format('update public.groups set admin_bootstrapped = false where id = %L', gid), '42501');
  perform pg_temp.expect_error(format('update public.groups set invite_expires_at = now() + interval ''8 days'' where id = %L', gid), '23514');
  perform pg_temp.expect_error('select public.create_group('''')', '23514');
  perform pg_temp.expect_error('select public.create_group(repeat(''x'', 61))', '23514');
  perform pg_temp.expect_error(format(
    'insert into public.groups (name, created_by, invite_hash, invite_expires_at) values (''spoof'', %L, repeat(''a'', 64), now())', member_id), '42501');

  created := public.create_group('Other group');
  other_gid := (created ->> 'group_id')::uuid;
  if created ->> 'invite_code' = code then raise exception 'Invite codes were reused'; end if;
  insert into public.players (id, group_id, display_name) values
    (p1, gid, 'Asha'), (p2, gid, 'Ben'), (p3, gid, 'Chen'), (p4, gid, 'Devi'), (p5, gid, 'Eli'),
    (q1, other_gid, 'Asha'), (q2, other_gid, 'Farah');
  perform pg_temp.expect_error(format('insert into public.players (group_id, display_name) values (%L, ''ASHA'')', gid), '23505');
  perform pg_temp.expect_error(format('insert into public.players (group_id, display_name) values (%L, repeat(''x'', 33))', gid), '23514');
  perform pg_temp.expect_error(format('select public.start_session(%L, array[%L]::uuid[])', gid, p1), '22023');
  perform pg_temp.expect_error(format('select public.start_session(%L, array[%L,%L]::uuid[])', gid, p1, p1), '22023');
  perform pg_temp.expect_error(format('select public.start_session(%L, array[%L,null]::uuid[])', gid, p1), '22023');
  perform pg_temp.expect_error(format('select public.start_session(%L, array[%L,%L]::uuid[], 15::smallint)', gid, p1, p2), '23514');
  perform pg_temp.expect_error(format('select public.start_session(%L, array[%L,%L]::uuid[])', other_gid, q1, p1), '23503');
  if exists (select 1 from public.sessions) then raise exception 'Failed start_session left partial data'; end if;
  sid := public.start_session(gid, array[p1,p2,p3,p4]);
  other_sid := public.start_session(other_gid, array[q1,q2], 21::smallint);
  if (select count(*) from public.session_players where session_id = sid) <> 4
    or not exists (select 1 from public.sessions where id = sid and target_score = 11
      and session_date = (now() at time zone 'Asia/Dubai')::date) then
    raise exception 'Session or attendance defaults failed';
  end if;
  perform pg_temp.expect_error(format('select public.start_session(%L, array[%L,%L]::uuid[])', gid, p1, p2), '23505');
  perform pg_temp.expect_error(format('insert into public.session_players (session_id, group_id, player_id) values (%L,%L,%L)', sid, gid, p1), '23505');
  perform pg_temp.expect_error(format('insert into public.session_players (session_id, group_id, player_id) values (%L,%L,%L)', sid, gid, q1), '23503');
  perform pg_temp.expect_error(format('insert into public.session_players (session_id, group_id, player_id) values (%L,%L,%L)', sid, other_gid, q1), '23503');

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
  for i in 1..4 loop
    duplicates := array[p1,p2,p3,p4];
    duplicates[i] := q1;
    perform pg_temp.expect_error(format(
      'insert into public.games (id,session_id,side_a_player_1,side_a_player_2,side_b_player_1,side_b_player_2,score_a,score_b) values (gen_random_uuid(),%L,%L,%L,%L,%L,11,9)',
      sid, duplicates[1], duplicates[2], duplicates[3], duplicates[4]), '23503');
  end loop;
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b) values (gen_random_uuid(),%L,%L,%L,11,9)', sid, p1, p5), '23503');
  insert into public.games (id,session_id,side_a_player_1,side_a_player_2,side_b_player_1,side_b_player_2,score_a,score_b)
    values (game_id,sid,p1,p2,p3,p4,11,9);
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b) values (%L,%L,%L,%L,11,0)', game_id,sid,p1,p2), '23505');
  if (select score_b from public.games where id = game_id) <> 9 then raise exception 'Duplicate game ID changed a score'; end if;

  perform pg_temp.expect_error(format('update public.players set group_id = %L where id = %L', other_gid,p5), '23514');
  perform pg_temp.expect_error(format('update public.sessions set group_id = %L where id = %L', other_gid,sid), '23514');
  perform pg_temp.expect_error(format('update public.session_players set session_id = %L where session_id = %L', other_sid,sid), '23514');
  perform pg_temp.expect_error(format('update public.games set session_id = %L where id = %L', other_sid,game_id), '23514');
  perform pg_temp.expect_error(format('update public.groups set created_by = %L where id = %L', member_id,gid), '23514');
  perform pg_temp.expect_error(format('insert into public.players (group_id,display_name,created_by) values (%L,''spoof'',%L)', gid,member_id), '42501');
  perform pg_temp.expect_error(format('insert into public.sessions (group_id,created_by) values (%L,%L)', gid,member_id), '42501');
  perform pg_temp.expect_error(format('insert into public.session_players (session_id,group_id,player_id,created_by) values (%L,%L,%L,%L)', sid,gid,p5,member_id), '42501');
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b,created_by) values (gen_random_uuid(),%L,%L,%L,11,9,%L)', sid,p1,p2,member_id), '42501');
  foreach table_name in array array['players','sessions','session_players','games'] loop
    perform pg_temp.expect_error(format('update public.%I set created_by = %L', table_name,member_id), '42501');
  end loop;

  perform pg_catalog.set_config('request.jwt.claim.sub', outsider_id::text, true);
  foreach table_name in array array['groups','group_members','players','sessions','session_players','games'] loop
    execute format('select count(*) from public.%I', table_name) into row_count;
    if row_count <> 0 then raise exception 'Outsider read % rows from %', row_count,table_name; end if;
    execute format('delete from public.%I', table_name);
    get diagnostics row_count = row_count;
    if row_count <> 0 then raise exception 'Outsider deleted from %', table_name; end if;
  end loop;
  update public.players set display_name = 'stolen', created_by = outsider_id where id = p1;
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Outsider updated player'; end if;
  perform pg_temp.expect_error(format('insert into public.players (group_id,display_name) values (%L,''intruder'')', gid), '42501');
  perform pg_temp.expect_error('select public.join_group(null)', '22023');
  perform pg_temp.expect_error('select public.join_group('''')', '22023');
  perform pg_temp.expect_error('select public.join_group(repeat(''x'',129))', '22023');
  perform pg_temp.expect_error('select public.join_group(''wrong'')', '22023');
  if public.is_group_member(gid) or public.is_group_admin(gid) then raise exception 'Outsider helper returned true'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', member_id::text, true);
  if public.join_group(code) <> gid then
    raise exception 'Joined the wrong group';
  end if;
  -- STABLE helpers read the statement snapshot, so check after the join statement.
  if not public.is_group_member(gid) or public.is_group_admin(gid) then
    raise exception 'Invited member access failed';
  end if;
  if (select count(*) from public.group_members where group_id = gid) <> 2
    or not exists (select 1 from public.group_members where group_id = gid and user_id = member_id and created_by = member_id)
    or not exists (select 1 from public.players where id = p1 and display_name = 'Asha') then
    raise exception 'Member cannot read shared data or outsider changed it';
  end if;
  if exists (select 1 from public.groups where id = other_gid) then raise exception 'Member read another group'; end if;
  perform pg_temp.expect_error(format('insert into public.group_members (group_id,user_id,role) values (%L,%L,''admin'')', gid,outsider_id), '42501');
  perform pg_temp.expect_error(format('update public.group_members set role = ''admin'' where group_id = %L and user_id = %L', gid,member_id), '42501');
  perform pg_temp.expect_error(format('select public.rotate_invite(%L)', gid), '42501');
  update public.groups set name = 'stolen', created_by = member_id where id = gid;
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Member changed group'; end if;
  delete from public.groups where id = gid;
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Member deleted group'; end if;
  delete from public.group_members where group_id = gid and user_id = owner_id;
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Member removed admin'; end if;
  perform pg_temp.expect_error(format('update public.players set display_name = ''Asha corrected'' where id = %L', p1), '42501');
  update public.players set display_name = 'Asha corrected', created_by = member_id where id = p1;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Member correction failed'; end if;
  insert into public.session_players (session_id,group_id,player_id) values (sid,gid,p5);
  update public.session_players set created_by = member_id where session_id = sid and player_id = p1;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Member attendance revision failed'; end if;
  delete from public.session_players where session_id = sid and player_id = p5;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Member attendance delete failed'; end if;
  insert into public.players (group_id,display_name) values (gid,'Temporary');
  delete from public.players where group_id = gid and display_name = 'Temporary';
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Member player CRUD failed'; end if;
  insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b)
    values (pg_catalog.gen_random_uuid(),sid,p1,p2,11,9) returning id into member_game_id;
  if not exists (select 1 from public.games where id = member_game_id and created_by = member_id) then
    raise exception 'Member game insert failed';
  end if;

  update public.sessions set ended_at = now(), created_by = member_id where id = sid;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Member could not end session'; end if;
  perform pg_temp.expect_error(format(
    'insert into public.games (id,session_id,side_a_player_1,side_b_player_1,score_a,score_b) values (gen_random_uuid(),%L,%L,%L,11,9)', sid,p1,p2), '23514');
  perform pg_temp.expect_error(format('update public.sessions set ended_at = null where id = %L', sid), '23514');
  update public.games set score_b = 8, created_by = member_id where id = game_id;
  if not found or (select score_b from public.games where id = game_id) <> 8 then
    raise exception 'Closed-session score correction failed';
  end if;
  delete from public.games where id = game_id;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Closed-session game removal failed'; end if;
  game_id := public.start_session(gid,array[p1,p2],21::smallint);
  delete from public.sessions where id = game_id;
  get diagnostics row_count = row_count;
  if row_count <> 1 or exists (select 1 from public.session_players where session_id = game_id) then
    raise exception 'Session deletion did not cascade attendance';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', owner_id::text, true);
  if (select name from public.groups where id = gid) <> 'Evening badminton' then raise exception 'Member changed group name'; end if;
  old_code := code;
  code := public.rotate_invite(gid);
  if code = old_code or length(code) <> 64 then raise exception 'Rotation did not generate a new code'; end if;
  perform pg_temp.expect_error(format('select public.join_group(%L)', old_code), '22023');
  update public.groups set invite_expires_at = now() - interval '1 second', created_by = owner_id where id = gid;
  perform pg_temp.expect_error(format('select public.join_group(%L)', code), '22023');
  code := public.rotate_invite(gid);
  delete from public.group_members where group_id = gid and user_id = member_id;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Admin removal failed'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', member_id::text, true);
  foreach table_name in array array['groups','group_members','players','sessions','session_players','games'] loop
    execute format('select count(*) from public.%I', table_name) into row_count;
    if row_count <> 0 then raise exception 'Removed member still reads %',table_name; end if;
  end loop;
  perform pg_temp.expect_error(format('insert into public.players (group_id,display_name) values (%L,''removed'')', gid), '42501');
  if public.is_group_member(gid) then raise exception 'Removed membership remained cached'; end if;
  perform public.join_group(code);
  delete from public.group_members where group_id = gid and user_id = member_id;
  get diagnostics row_count = row_count;
  if row_count <> 1 or public.is_group_member(gid) then raise exception 'Self-removal failed'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', owner_id::text, true);
  delete from public.group_members where group_id = gid and user_id = owner_id;
  if public.is_group_member(gid) then raise exception 'Owner self-removal failed'; end if;
  perform public.join_group(code);
  if not public.is_group_member(gid) or public.is_group_admin(gid) then
    raise exception 'Removed creator regained admin rights';
  end if;
  perform pg_temp.expect_error(format('select public.rotate_invite(%L)', gid), '42501');
  delete from public.groups where id = other_gid;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Admin group deletion failed'; end if;
  raise notice 'Security and constraint tests passed';
end;
$$;

rollback;
