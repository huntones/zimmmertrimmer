-- ============================================================
-- KOLKLI — Supabase schema. Run this ONCE, in full, in the
-- Supabase dashboard → SQL Editor → New query → Run.
--
-- It creates a `profiles` table that mirrors each auth user with a
-- name / role / plan, secured with Row-Level Security so a signed-in
-- visitor can only ever read and edit their OWN row. A trigger
-- auto-creates the profile the moment someone signs up, and a guard
-- makes sure nobody can promote themselves to admin or 'pro' from the
-- browser console (role/plan changes must come from the server side).
-- ============================================================

-- 1) Profile table -------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  full_name  text default '',
  role       text not null default 'user',   -- 'user' | 'admin'
  plan       text not null default 'free',    -- 'free' | 'lite' | 'pro' | 'business'
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2) Row-Level Security: each user sees & edits only their own row --
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- (No insert/delete policy on purpose: rows are created by the trigger
--  below, and deletion cascades from auth.users.)

-- 3) Auto-create a profile on sign-up ------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    -- bootstrap owner is admin; everyone else starts as a normal user
    case when lower(new.email) = 'digitalzimmer@gmail.com' then 'admin' else 'user' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Guard: a normal user may edit their name, but NOT their own
--    role or plan (those can only change server-side, e.g. after a
--    payment or from an admin edge function running as service_role).
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;                       -- server/admin: allow anything
  end if;
  new.role := old.role;              -- revert any client-side change
  new.plan := old.plan;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ------------------------------------------------------------------
-- OPTIONAL next step (files & share-link metadata) — uncomment when
-- you want the file organizer / send-links to persist server-side too.
-- The audio/file bytes still stay in the browser; only metadata here.
-- ------------------------------------------------------------------
-- create table if not exists public.files (
--   id         uuid primary key default gen_random_uuid(),
--   owner      uuid not null references auth.users on delete cascade,
--   name       text not null,
--   size       bigint,
--   kind       text,
--   created_at timestamptz not null default now()
-- );
-- alter table public.files enable row level security;
-- create policy "files_own" on public.files
--   for all using (auth.uid() = owner) with check (auth.uid() = owner);
