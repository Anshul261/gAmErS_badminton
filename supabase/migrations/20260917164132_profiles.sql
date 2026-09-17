-- One display name per account, so the score sheet can say who logged each game.
create table public.profiles (
  user_id uuid primary key default auth.uid(),
  display_name text not null
    check (pg_catalog.char_length(display_name) between 1 and 32 and pg_catalog.btrim(display_name) <> ''),
  created_at timestamptz not null default pg_catalog.now()
);

create trigger profiles_identity before update on public.profiles
  for each row execute function public.guard_row_identity('user_id', 'created_at');

alter table public.profiles enable row level security;

-- Everyone can read names; each account writes only its own row.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.profiles from public, anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
