-- ============================================================
-- KOLKLI — Supabase schema. Run this ONCE, in full, in the
-- Supabase dashboard → SQL Editor → New query → Run.
--
-- It creates a `profiles` table that mirrors each auth user with a
-- name / role / plan, secured with Row-Level Security so a signed-in
-- visitor can only ever read and edit their OWN row. A trigger
-- auto-creates the profile the moment someone signs up, and a guard
-- makes sure nobody can promote themselves to admin or a paid plan from
-- the browser console (role/plan/trial changes come from the server side).
-- A one-shot start_trial() RPC grants a 7-day Creator trial (no card).
-- ============================================================

-- 1) Profile table -------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  full_name  text default '',
  role       text not null default 'user',   -- 'user' | 'admin'
  plan       text not null default 'free',    -- 'free' | 'creator' | 'studio'
  trial_started_at timestamptz,               -- 7-day free trial window
  trial_ends_at    timestamptz,               -- null = this account never started a trial
  created_at timestamptz not null default now()
);

-- If the table already exists from an earlier run, add the trial columns:
alter table public.profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at    timestamptz;

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
  -- the server (service_role) and the controlled start_trial() path may set
  -- privileged columns; a normal client cannot touch role / plan / trial.
  if auth.role() = 'service_role'
     or coalesce(current_setting('app.granting_trial', true), '') = '1' then
    return new;                       -- server/admin/start_trial: allow
  end if;
  new.role := old.role;              -- revert any client-side change
  new.plan := old.plan;
  new.trial_started_at := old.trial_started_at;
  new.trial_ends_at    := old.trial_ends_at;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- 5) One-time, self-service 7-day free trial -----------------------
-- A freshly-registered user calls this (via KolkliAuth.startTrial() → RPC) to
-- unlock the Creator tier for 7 days with NO credit card. SECURITY DEFINER so
-- it can flip the otherwise-protected plan column, and it is strictly one-shot:
-- a no-op if a trial was already used (trial_ends_at set) or a paid plan is
-- active. Abuse from the same device across many fresh accounts is blocked
-- separately by the storage Worker's fingerprint-gated /usage/trial-claim,
-- which the client calls BEFORE this RPC.
create or replace function public.start_trial()
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'no profile for %', auth.uid();
  end if;
  if me.plan <> 'free' or me.trial_ends_at is not null then
    return me;                        -- already trialing / used / on a paid plan
  end if;
  perform set_config('app.granting_trial', '1', true);   -- allow the guarded write
  update public.profiles
     set plan = 'creator',
         trial_started_at = now(),
         trial_ends_at    = now() + interval '7 days'
   where id = auth.uid()
   returning * into me;
  return me;
end;
$$;

grant execute on function public.start_trial() to authenticated;

-- 6) Atomic project numbers per service ---------------------------
-- The browser never accepts manual project numbers. It asks this RPC for the
-- next number, and Postgres performs the increment atomically with a row lock.
-- Deleted / archived records do not free numbers because allocations are kept
-- in project_numbers.
create table if not exists public.project_number_counters (
  service     text primary key,
  next_number bigint not null check (next_number > 0),
  updated_at  timestamptz not null default now(),
  constraint project_number_counters_service_check
    check (service in ('select', 'receive', 'send', 'review'))
);

insert into public.project_number_counters (service, next_number)
values
  ('select', 1001),
  ('receive', 10001),
  ('send', 100001),
  ('review', 101)
on conflict (service) do nothing;

create table if not exists public.project_numbers (
  service        text not null,
  project_number bigint not null,
  owner          uuid default auth.uid(),
  project_ref    text,
  created_at     timestamptz not null default now(),
  primary key (service, project_number),
  constraint project_numbers_service_check
    check (service in ('select', 'receive', 'send', 'review'))
);

revoke all on public.project_number_counters from anon, authenticated;
revoke all on public.project_numbers from anon, authenticated;

create or replace function public.allocate_project_number(
  project_service text,
  project_ref text default null
)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  svc text := lower(trim(project_service));
  allocated bigint;
begin
  if svc not in ('select', 'receive', 'send', 'review') then
    raise exception 'unknown project service: %', project_service
      using errcode = '22023';
  end if;

  loop
    update public.project_number_counters
       set next_number = next_number + 1,
           updated_at = now()
     where service = svc
     returning next_number - 1 into allocated;

    if not found then
      raise exception 'missing project number counter for service: %', svc
        using errcode = '23503';
    end if;

    begin
      insert into public.project_numbers (service, project_number, owner, project_ref)
      values (svc, allocated, auth.uid(), project_ref);
      return allocated;
    exception when unique_violation then
      -- Defensive only: if imported legacy data already owns this number,
      -- continue to the next counter value instead of recycling.
    end;
  end loop;
end;
$$;

grant execute on function public.allocate_project_number(text, text) to authenticated;

-- NOTE on expiry: the stored plan stays 'creator' until something flips it back.
-- Effective-plan readers already downgrade an expired trial to Free at read time
-- (the storage Worker's userPlan() + the browser's trial.js sweep). To also
-- reset the column server-side, schedule this with pg_cron (optional):
--   update public.profiles set plan = 'free'
--     where plan = 'creator' and trial_ends_at is not null and trial_ends_at < now();

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
