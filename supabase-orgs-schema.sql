-- ============================================================
-- KOLKLI — multi-tenant B2B schema (Phase 1).
-- Run this ONCE in Supabase → SQL Editor, AFTER supabase-schema.sql
-- (this builds on the profiles table / auth users created there).
--
-- Model: every user gets a personal "organization" on sign-up, and
-- B2B is the exact same model at scale — an organization with several
-- members (seats) and roles. All business data (files, share links…)
-- carries an org_id and is isolated per organization by Row-Level
-- Security. Billing (plan + seat count) lives on the ORGANIZATION, not
-- the user, so a company pays once for N seats.
--
--   organizations ─< org_members >─ auth.users
--                 └─< org_invites
--                 └─< files / share_links   (org-scoped)
--
-- The tricky part of multi-tenant RLS in Postgres is recursion: a
-- policy on org_members that itself queries org_members loops forever.
-- We avoid it with SECURITY DEFINER helper functions (user_orgs /
-- user_org_role) that read membership WITHOUT triggering RLS.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) Tables
-- ------------------------------------------------------------------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Workspace',
  slug       text unique not null,
  owner      uuid not null references auth.users on delete cascade,
  plan       text not null default 'free',   -- 'free' | 'lite' | 'pro' | 'business'
  seats      int  not null default 1,         -- how many members the plan allows
  created_at timestamptz not null default now()
);

-- Stripe billing links (Phase 3) — written only by the billing Worker
-- (service_role). Safe to re-run on an existing table.
alter table public.organizations add column if not exists stripe_customer     text;
alter table public.organizations add column if not exists stripe_subscription text;

create table if not exists public.org_members (
  org_id     uuid not null references public.organizations on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations on delete cascade,
  email      text not null,
  role       text not null default 'member' check (role in ('admin','member')),
  -- 64 hex chars of entropy without needing the pgcrypto extension
  token      text not null unique
               default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  invited_by uuid references auth.users on delete set null,
  accepted   boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create table if not exists public.files (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations on delete cascade,
  owner      uuid not null references auth.users on delete cascade,
  name       text not null,
  size       bigint,
  kind       text,
  r2_key     text,                            -- object key in the Cloudflare R2 bucket
  created_at timestamptz not null default now()
);

create table if not exists public.share_links (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations on delete cascade,
  created_by uuid not null references auth.users on delete cascade,
  token      text unique not null
               default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  label      text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.org_members  enable row level security;
alter table public.org_invites  enable row level security;
alter table public.files        enable row level security;
alter table public.share_links  enable row level security;

-- ------------------------------------------------------------------
-- 2) Recursion-safe membership helpers (SECURITY DEFINER = bypass RLS)
-- ------------------------------------------------------------------
create or replace function public.user_orgs()
returns setof uuid
language sql security definer stable set search_path = public as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

create or replace function public.user_org_role(org uuid)
returns text
language sql security definer stable set search_path = public as $$
  select role from public.org_members where org_id = org and user_id = auth.uid();
$$;

-- everyone who shares at least one org with me (for the team roster)
create or replace function public.org_comembers()
returns setof uuid
language sql security definer stable set search_path = public as $$
  select distinct m.user_id
  from public.org_members m
  where m.org_id in (select org_id from public.org_members where user_id = auth.uid());
$$;

-- ------------------------------------------------------------------
-- 3) Row-Level Security policies (everything scoped to your orgs)
-- ------------------------------------------------------------------
-- organizations: members can read; owner/admin can rename (billing is
-- protected by a trigger below, so plan/seats can't be self-edited).
drop policy if exists "org_select" on public.organizations;
create policy "org_select" on public.organizations
  for select using (id in (select public.user_orgs()));

drop policy if exists "org_update" on public.organizations;
create policy "org_update" on public.organizations
  for update using (public.user_org_role(id) in ('owner','admin'))
             with check (public.user_org_role(id) in ('owner','admin'));

-- org_members: members see their org's roster; owner/admin manage it.
drop policy if exists "members_select" on public.org_members;
create policy "members_select" on public.org_members
  for select using (user_id = auth.uid());

drop policy if exists "members_write" on public.org_members;
create policy "members_write" on public.org_members
  for all using (public.user_org_role(org_id) in ('owner','admin'))
          with check (public.user_org_role(org_id) in ('owner','admin'));

-- invites: only owner/admin of the org can see/create/revoke them.
drop policy if exists "invites_manage" on public.org_invites;
create policy "invites_manage" on public.org_invites
  for all using (public.user_org_role(org_id) in ('owner','admin'))
          with check (public.user_org_role(org_id) in ('owner','admin'));

-- files + share_links: owner-only, even inside an organization.
drop policy if exists "files_org" on public.files;
drop policy if exists "files_owner" on public.files;
create policy "files_owner" on public.files
  for all using (owner = auth.uid())
          with check (owner = auth.uid());

drop policy if exists "links_org" on public.share_links;
drop policy if exists "links_owner" on public.share_links;
create policy "links_owner" on public.share_links
  for all using (created_by = auth.uid())
          with check (created_by = auth.uid());

-- policy from supabase-schema.sql — permissive policies are OR'd.)
drop policy if exists "profiles_select_comembers" on public.profiles;

-- ------------------------------------------------------------------
-- 4) Auto-create a personal organization on sign-up
-- ------------------------------------------------------------------
create or replace function public.handle_new_user_org()
returns trigger
language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  insert into public.organizations (name, slug, owner, plan, seats)
  values (
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'My workspace'),
    'org_' || replace(new.id::text, '-', ''),
    new.id, 'free', 1
  )
  returning id into new_org;
  insert into public.org_members (org_id, user_id, role)
  values (new_org, new.id, 'owner');
  return new;
end; $$;

drop trigger if exists on_auth_user_created_org on auth.users;
create trigger on_auth_user_created_org
  after insert on auth.users
  for each row execute function public.handle_new_user_org();

-- ------------------------------------------------------------------
-- 5) Create additional orgs / accept invites (atomic, from the client)
-- ------------------------------------------------------------------
create or replace function public.create_organization(org_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid; new_org uuid;
begin
  me := auth.uid();
  if me is null then raise exception 'must be signed in'; end if;
  insert into public.organizations (name, slug, owner, plan, seats)
  values (coalesce(nullif(org_name, ''), 'Workspace'),
          'org_' || replace(gen_random_uuid()::text, '-', ''), me, 'free', 1)
  returning id into new_org;
  insert into public.org_members (org_id, user_id, role) values (new_org, me, 'owner');
  return new_org;
end; $$;

create or replace function public.accept_invite(invite_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.org_invites; me uuid; my_email text; used int;
begin
  me := auth.uid();
  if me is null then raise exception 'must be signed in'; end if;
  my_email := lower(auth.jwt() ->> 'email');
  select * into inv from public.org_invites where token = invite_token;
  if inv.id is null then raise exception 'invalid invite'; end if;
  if inv.accepted then raise exception 'invite already used'; end if;
  if inv.expires_at < now() then raise exception 'invite expired'; end if;
  if lower(inv.email) <> my_email then raise exception 'invite is for a different email'; end if;
  select count(*) into used from public.org_members where org_id = inv.org_id;
  if used >= (select seats from public.organizations where id = inv.org_id) then
    raise exception 'no seats left on this plan';
  end if;
  insert into public.org_members (org_id, user_id, role)
  values (inv.org_id, me, inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.org_invites set accepted = true where id = inv.id;
  return inv.org_id;
end; $$;

-- ------------------------------------------------------------------
-- 6) Guards: protect billing + enforce seat limits from the client
-- ------------------------------------------------------------------
-- plan/seats can only change server-side (Stripe webhook via service_role).
create or replace function public.protect_org_billing()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  new.plan  := old.plan;
  new.seats := old.seats;
  return new;
end; $$;

drop trigger if exists protect_org_billing on public.organizations;
create trigger protect_org_billing
  before update on public.organizations
  for each row execute function public.protect_org_billing();

-- can't add more members than the plan allows (service_role bypasses).
create or replace function public.enforce_seat_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if (select count(*) from public.org_members where org_id = new.org_id)
     > (select seats from public.organizations where id = new.org_id) then
    raise exception 'seat limit reached for this organization';
  end if;
  return new;
end; $$;

drop trigger if exists enforce_seat_limit on public.org_members;
create trigger enforce_seat_limit
  after insert on public.org_members
  for each row execute function public.enforce_seat_limit();

-- ------------------------------------------------------------------
-- 7) Let signed-in users call the helper functions
-- ------------------------------------------------------------------
grant execute on function public.user_orgs()               to authenticated;
grant execute on function public.user_org_role(uuid)       to authenticated;
grant execute on function public.org_comembers()           to authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.accept_invite(text)       to authenticated;
