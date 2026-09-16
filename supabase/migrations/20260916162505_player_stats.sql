create function public.player_stats(gid uuid)
returns table (player_id uuid, played bigint, wins bigint, points_for bigint, points_against bigint)
language sql stable security invoker set search_path = ''
as $$
  select side.player_id,
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where side.scored > side.conceded),
    pg_catalog.sum(side.scored),
    pg_catalog.sum(side.conceded)
  from public.games as g
  join public.sessions as s on s.id = g.session_id
  cross join lateral (values
    (g.side_a_player_1, g.score_a, g.score_b),
    (g.side_a_player_2, g.score_a, g.score_b),
    (g.side_b_player_1, g.score_b, g.score_a),
    (g.side_b_player_2, g.score_b, g.score_a)
  ) as side(player_id, scored, conceded)
  where s.group_id = gid and side.player_id is not null
  group by side.player_id;
$$;

revoke all on function public.player_stats(uuid) from public, anon, authenticated;
grant execute on function public.player_stats(uuid) to authenticated;
