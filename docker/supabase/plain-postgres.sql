-- Prepares a plain Postgres (a managed database, not the supabase/postgres image) for the
-- Supabase Auth (GoTrue) and PostgREST services and for supabase/migrations. It recreates the
-- roles, schemas and default grants the supabase/postgres image sets up on first boot.
--
-- Run once as a superuser, before starting Auth, PostgREST or the app. Safe to re-run.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v authenticator_password="$AUTHENTICATOR_PASSWORD" \
--     -v auth_admin_password="$AUTH_ADMIN_PASSWORD" \
--     -f docker/supabase/plain-postgres.sql
--
-- Then start Auth (it creates the auth tables and auth.uid() / auth.jwt()), then PostgREST and
-- the app, which applies supabase/migrations.

select set_config('deathspot.authenticator_password', :'authenticator_password', false);
select set_config('deathspot.auth_admin_password', :'auth_admin_password', false);

do $$
begin
  -- API roles. PostgREST switches to one of these per request, based on the JWT's `role`.
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;

  -- PostgREST logs in as authenticator and can only become the API roles.
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  execute format('alter role authenticator with login password %L', current_setting('deathspot.authenticator_password'));

  -- Supabase Auth owns the auth schema and runs its own migrations in it.
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login noinherit createrole;
  end if;
  execute format('alter role supabase_auth_admin with login password %L', current_setting('deathspot.auth_admin_password'));
end
$$;

grant anon, authenticated, service_role to authenticator;
alter role supabase_auth_admin set search_path = auth;
alter role authenticator set statement_timeout = '8s';
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';

create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists extensions;

do $$
begin
  execute format('grant create on database %I to supabase_auth_admin', current_database());
end
$$;

-- The API roles call auth.uid() / auth.jwt() from RLS policies, and extension functions such as
-- pg_trgm's word_similarity() from search.
grant usage on schema auth, extensions, public to anon, authenticated, service_role;

-- Supabase's defaults: tables, functions and sequences the migrations create in public are
-- reachable by the API roles, and row-level security decides what each one actually sees.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema extensions grant execute on functions to anon, authenticated, service_role;
