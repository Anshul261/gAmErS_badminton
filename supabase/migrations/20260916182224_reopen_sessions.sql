-- A finished session can be reopened to log a forgotten game, then finished again.
create or replace function public.guard_row_identity()
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
  return new;
end;
$$;
