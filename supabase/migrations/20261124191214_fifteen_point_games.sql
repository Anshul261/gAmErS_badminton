-- Games can also be played to 15.
alter table public.sessions drop constraint sessions_target_score_check,
  add constraint sessions_target_score_check check (target_score in (11, 15, 21));
alter table public.games drop constraint games_target_score_check,
  add constraint games_target_score_check check (target_score in (11, 15, 21));
