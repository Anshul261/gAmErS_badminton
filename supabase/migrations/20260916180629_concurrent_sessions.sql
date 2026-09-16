-- Several courts can be in play at once, each phone picks which session it logs for.
drop index public.sessions_one_active_idx;
create index sessions_open_idx on public.sessions (created_at desc) where ended_at is null;
