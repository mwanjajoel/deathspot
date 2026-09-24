-- Sets the service role passwords to POSTGRES_PASSWORD (from upstream supabase/docker).
-- Unlike upstream, roles belonging to services this stack leaves out (edge functions,
-- storage) are skipped when missing, so a trimmed stack still initialises cleanly.
\set pgpass `echo "$POSTGRES_PASSWORD"`
select set_config('deathspot.pgpass', :'pgpass', false);

do $$
declare
  r text;
begin
  foreach r in array array['authenticator', 'pgbouncer', 'supabase_auth_admin', 'supabase_functions_admin', 'supabase_storage_admin']
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('alter user %I with password %L', r, current_setting('deathspot.pgpass'));
    end if;
  end loop;
end
$$;
