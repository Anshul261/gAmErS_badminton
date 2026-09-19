-- Leaderboard Score: strength-adjusted net wins.
-- Every game is worth up to 2 points, split by how strong each side was going in.
-- Even sides: win +1 / loss -1. Beating a stronger side is worth more; losing to a weaker side costs more.
-- A side's strength is the average running score of its players, so a strong partner makes a win
-- count a little less. In a 1v2 the pair is scored like any game; the solo player gets a handicap.
-- Margin of victory is ignored. Tuning knobs are the two constants at the top of game_values().

create function public.game_values()
returns table (game_id uuid, player_id uuid, value numeric)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  scale constant numeric := 10;         -- a 10-point strength gap makes the stronger side a ~91% favourite
  solo_handicap constant numeric := 2.7;  -- 1v2: the solo faces opponents rated this much higher (~65/35)
  ratings jsonb := '{}'::jsonb;
  g record;
  rating_a numeric;
  rating_b numeric;
  size_a integer;
  size_b integer;
  expected_a numeric;
  expected_b numeric;
  value_a numeric;
  value_b numeric;
  p uuid;
begin
  for g in
    select id, side_a_player_1, side_a_player_2, side_b_player_1, side_b_player_2, score_a > score_b as a_won
    from public.games order by created_at, id
  loop
    size_a := 1 + (g.side_a_player_2 is not null)::integer;
    size_b := 1 + (g.side_b_player_2 is not null)::integer;
    rating_a := (coalesce((ratings ->> g.side_a_player_1::text)::numeric, 0)
      + coalesce((ratings ->> g.side_a_player_2::text)::numeric, 0)) / size_a;
    rating_b := (coalesce((ratings ->> g.side_b_player_1::text)::numeric, 0)
      + coalesce((ratings ->> g.side_b_player_2::text)::numeric, 0)) / size_b;
    expected_a := 1 / (1 + pg_catalog.power(10, ((rating_b + case when size_a = 1 and size_b = 2 then solo_handicap else 0 end) - rating_a) / scale));
    expected_b := 1 / (1 + pg_catalog.power(10, ((rating_a + case when size_b = 1 and size_a = 2 then solo_handicap else 0 end) - rating_b) / scale));
    value_a := pg_catalog.round(2 * (g.a_won::integer - expected_a), 2);
    value_b := pg_catalog.round(2 * ((not g.a_won)::integer - expected_b), 2);
    foreach p in array array[g.side_a_player_1, g.side_a_player_2] loop
      if p is not null then
        game_id := g.id; player_id := p; value := value_a;
        return next;
        ratings := ratings || pg_catalog.jsonb_build_object(p::text, coalesce((ratings ->> p::text)::numeric, 0) + value_a);
      end if;
    end loop;
    foreach p in array array[g.side_b_player_1, g.side_b_player_2] loop
      if p is not null then
        game_id := g.id; player_id := p; value := value_b;
        return next;
        ratings := ratings || pg_catalog.jsonb_build_object(p::text, coalesce((ratings ->> p::text)::numeric, 0) + value_b);
      end if;
    end loop;
  end loop;
end;
$$;

create function public.session_game_values(sid uuid)
returns table (game_id uuid, player_id uuid, value numeric)
language sql stable security invoker set search_path = ''
as $$
  select v.game_id, v.player_id, v.value
  from public.game_values() as v
  join public.games as g on g.id = v.game_id
  where g.session_id = sid;
$$;

drop function public.player_stats();
create function public.player_stats()
returns table (
  player_id uuid, played bigint, wins bigint, losses bigint,
  singles bigint, solo bigint, pair bigint, doubles bigint,
  points_for bigint, points_against bigint, score numeric
)
language sql stable security invoker set search_path = ''
as $$
  with sides as (
    select g.id, p.player_id,
      case when p.side = 'a' then g.score_a else g.score_b end as scored,
      case when p.side = 'a' then g.score_b else g.score_a end as conceded,
      case when p.side = 'a' then 1 + (g.side_a_player_2 is not null)::integer
        else 1 + (g.side_b_player_2 is not null)::integer end as mine,
      case when p.side = 'a' then 1 + (g.side_b_player_2 is not null)::integer
        else 1 + (g.side_a_player_2 is not null)::integer end as theirs
    from public.games as g
    cross join lateral (values
      (g.side_a_player_1, 'a'), (g.side_a_player_2, 'a'),
      (g.side_b_player_1, 'b'), (g.side_b_player_2, 'b')
    ) as p(player_id, side)
    where p.player_id is not null
  )
  select s.player_id,
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where s.scored > s.conceded),
    pg_catalog.count(*) filter (where s.scored < s.conceded),
    pg_catalog.count(*) filter (where s.mine = 1 and s.theirs = 1),
    pg_catalog.count(*) filter (where s.mine = 1 and s.theirs = 2),
    pg_catalog.count(*) filter (where s.mine = 2 and s.theirs = 1),
    pg_catalog.count(*) filter (where s.mine = 2 and s.theirs = 2),
    pg_catalog.sum(s.scored),
    pg_catalog.sum(s.conceded),
    coalesce(pg_catalog.sum(v.value), 0)
  from sides as s
  left join public.game_values() as v on v.game_id = s.id and v.player_id = s.player_id
  group by s.player_id;
$$;

revoke all on function public.game_values(), public.session_game_values(uuid), public.player_stats()
  from public, anon, authenticated;
grant execute on function public.game_values(), public.session_game_values(uuid), public.player_stats() to authenticated;
