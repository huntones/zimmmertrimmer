-- ============================================================
-- LOCAL-ONLY shim.  Emulates the pieces a real Supabase project
-- already provides: the `auth` schema, the anon/authenticated/
-- service_role roles, and auth.uid() / auth.role().
--
-- The migrate runner applies this ONLY against a local / embedded
-- Postgres (when DATABASE_URL is empty, or with `--with-shim`).
-- It is deliberately NOT part of src/migrations/, so the real
-- migrations paste into the Supabase SQL editor unchanged.
--
-- NEVER run this against a real Supabase database.
-- ============================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Minimal stand-in for Supabase's auth.users. On real Supabase this
-- table already exists and is left untouched (create ... if not exists).
create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);
grant select on auth.users to authenticated, service_role;

-- auth.uid(): the current request's user id, read from a GUC that the
-- application sets per request. This is exactly how Supabase resolves
-- the JWT `sub` claim under the hood.
create or replace function auth.uid() returns uuid
  language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
