-- ============================================================
-- KOLKLI SEND — schema (deliveries module).
-- Everything lives in its own `kolkli_send` schema so it never
-- collides with the existing public.projects / profiles tables.
--
-- Supabase-safe: assumes the `auth` schema, auth.uid(), and the
-- anon/authenticated/service_role roles already exist (they do on
-- Supabase; the local shim provides them for embedded Postgres).
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_bytes/uuid, crypt, gen_salt (no-op if present)

create schema if not exists kolkli_send;

-- ---------- enums -------------------------------------------------
do $$ begin
  create type kolkli_send.delivery_status as enum
    ('draft','ready','sent','opened','downloaded','revoked','expired','blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kolkli_send.security_type as enum
    ('link','password','email_code');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kolkli_send.recipient_status as enum
    ('pending','notified','verified','opened','downloaded','blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kolkli_send.file_status as enum
    ('pending','stored','failed');
exception when duplicate_object then null; end $$;

-- ---------- helpers ----------------------------------------------
-- Unguessable, long public id for the share link (128 bits of entropy,
-- hex). Never sequential, never the order number.
create or replace function kolkli_send.gen_public_id() returns text
  language sql volatile
as $$ select encode(gen_random_bytes(18), 'hex') $$;   -- 36 hex chars

-- Order numbers for Files Sent deliveries, starting at 100001.
create sequence if not exists kolkli_send.order_seq start with 100001 increment by 1;

create or replace function kolkli_send.touch_updated_at() returns trigger
  language plpgsql
as $$ begin new.updated_at := now(); return new; end $$;

-- ---------- stored_files: the physical object registry -----------
-- One row per real object in private storage. delivery_files points
-- here, so associating an existing file to a new delivery never
-- duplicates the bytes.
create table if not exists kolkli_send.stored_files (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_key   text not null unique,          -- private object key; NEVER exposed publicly
  bucket        text not null default 'kolkli-files',
  original_name text,
  mime_type     text,
  size_bytes    bigint,
  sha256        text,                           -- for dedupe
  status        kolkli_send.file_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Dedupe: the same owner never stores the same bytes twice.
create unique index if not exists stored_files_owner_sha_uniq
  on kolkli_send.stored_files (owner, sha256) where sha256 is not null;
create index if not exists stored_files_owner_idx on kolkli_send.stored_files (owner);

-- ---------- deliveries -------------------------------------------
create table if not exists kolkli_send.deliveries (
  id                 uuid primary key default gen_random_uuid(),
  public_id          text not null unique default kolkli_send.gen_public_id(),
  order_number       bigint not null unique default nextval('kolkli_send.order_seq'),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id         uuid,
  title              text,
  message            text,
  status             kolkli_send.delivery_status not null default 'draft',
  security_type      kolkli_send.security_type not null default 'link',
  password_hash      text,                       -- bcrypt; never returned publicly
  allow_preview      boolean not null default true,
  allow_download     boolean not null default true,
  allow_download_all boolean not null default true,
  allow_comments     boolean not null default false,
  expires_at         timestamptz,
  max_views          integer,
  max_downloads      integer,
  view_count         integer not null default 0,
  download_count     integer not null default 0,
  sent_at            timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists deliveries_user_idx    on kolkli_send.deliveries (user_id);
create index if not exists deliveries_status_idx   on kolkli_send.deliveries (status);
create index if not exists deliveries_expires_idx  on kolkli_send.deliveries (expires_at) where expires_at is not null;

-- ---------- recipients -------------------------------------------
create table if not exists kolkli_send.delivery_recipients (
  id                    uuid primary key default gen_random_uuid(),
  delivery_id           uuid not null references kolkli_send.deliveries(id) on delete cascade,
  name                  text,
  email                 text,
  phone                 text,
  access_token_hash     text,
  status                kolkli_send.recipient_status not null default 'pending',
  verified_at           timestamptz,
  first_opened_at       timestamptz,
  last_opened_at        timestamptz,
  first_downloaded_at   timestamptz,
  last_downloaded_at    timestamptz,
  view_count            integer not null default 0,
  download_count        integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists recipients_delivery_email_uniq
  on kolkli_send.delivery_recipients (delivery_id, lower(email)) where email is not null;
create index if not exists recipients_delivery_idx on kolkli_send.delivery_recipients (delivery_id);

-- ---------- folders (nested) -------------------------------------
create table if not exists kolkli_send.delivery_folders (
  id                uuid primary key default gen_random_uuid(),
  delivery_id       uuid not null references kolkli_send.deliveries(id) on delete cascade,
  parent_folder_id  uuid references kolkli_send.delivery_folders(id) on delete cascade,
  name              text not null,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists folders_delivery_idx on kolkli_send.delivery_folders (delivery_id);
create index if not exists folders_parent_idx   on kolkli_send.delivery_folders (parent_folder_id);

-- ---------- file associations ------------------------------------
create table if not exists kolkli_send.delivery_files (
  id             uuid primary key default gen_random_uuid(),
  delivery_id    uuid not null references kolkli_send.deliveries(id) on delete cascade,
  file_id        uuid not null references kolkli_send.stored_files(id) on delete restrict,
  folder_id      uuid references kolkli_send.delivery_folders(id) on delete set null,
  display_name   text,
  sort_order     integer not null default 0,
  allow_preview  boolean,     -- null => inherit the delivery's allow_preview
  allow_download boolean,     -- null => inherit the delivery's allow_download
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (delivery_id, file_id)   -- prevents accidental double association
);
create index if not exists delivery_files_delivery_idx on kolkli_send.delivery_files (delivery_id);
create index if not exists delivery_files_folder_idx   on kolkli_send.delivery_files (folder_id);

-- ---------- audit log --------------------------------------------
create table if not exists kolkli_send.delivery_events (
  id           bigint generated always as identity primary key,
  delivery_id  uuid references kolkli_send.deliveries(id) on delete cascade,
  recipient_id uuid references kolkli_send.delivery_recipients(id) on delete set null,
  file_id      uuid,                       -- delivery_files id; no FK so audit survives deletes
  event_type   text not null,
  ip_address   inet,
  user_agent   text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint delivery_events_type_ck check (event_type in (
    'delivery_created','delivery_updated','delivery_sent','delivery_opened',
    'recipient_added','recipient_verified','file_previewed','file_downloaded',
    'download_all_requested','password_failed','verification_sent','verification_failed',
    'delivery_expired','delivery_revoked','delivery_reactivated',
    'folder_created','file_added'
  ))
);
create index if not exists events_delivery_idx on kolkli_send.delivery_events (delivery_id, created_at desc);

-- ---------- verification codes (email) ---------------------------
-- Only the bcrypt hash of the 6-digit code is stored; the plaintext
-- code never touches the database.
create table if not exists kolkli_send.verification_codes (
  id           uuid primary key default gen_random_uuid(),
  delivery_id  uuid not null references kolkli_send.deliveries(id) on delete cascade,
  recipient_id uuid references kolkli_send.delivery_recipients(id) on delete cascade,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists vcodes_lookup_idx
  on kolkli_send.verification_codes (delivery_id, recipient_id, created_at desc);

-- ---------- updated_at triggers ----------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'stored_files','deliveries','delivery_recipients',
    'delivery_folders','delivery_files'
  ] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on kolkli_send.%1$s;', t);
    execute format(
      'create trigger trg_touch_%1$s before update on kolkli_send.%1$s
         for each row execute function kolkli_send.touch_updated_at();', t);
  end loop;
end $$;

-- ---------- status-transition guard ------------------------------
-- Rejects illegal lifecycle moves (e.g. downloading a draft, opening a
-- revoked/expired delivery). Engagement moves (sent->opened->downloaded)
-- and reactivation (revoked/expired -> ready/sent) are allowed.
create or replace function kolkli_send.valid_status_transition(old_s text, new_s text)
  returns boolean language sql immutable as $$
  select case old_s
    when 'draft'      then new_s in ('draft','ready','revoked')
    when 'ready'      then new_s in ('ready','draft','sent','revoked')
    when 'sent'       then new_s in ('sent','opened','downloaded','revoked','expired','blocked')
    when 'opened'     then new_s in ('opened','downloaded','sent','revoked','expired','blocked')
    when 'downloaded' then new_s in ('downloaded','opened','sent','revoked','expired','blocked')
    when 'revoked'    then new_s in ('revoked','ready','sent')
    when 'expired'    then new_s in ('expired','ready','sent')
    when 'blocked'    then new_s in ('blocked','ready','sent','revoked')
    else false end
$$;

create or replace function kolkli_send.enforce_status_transition()
  returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and not kolkli_send.valid_status_transition(old.status::text, new.status::text) then
    raise exception 'illegal delivery status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_status_guard on kolkli_send.deliveries;
create trigger trg_status_guard before update on kolkli_send.deliveries
  for each row execute function kolkli_send.enforce_status_transition();

-- ---------- keep folders within their delivery -------------------
create or replace function kolkli_send.enforce_folder_parent()
  returns trigger language plpgsql as $$
declare parent_delivery uuid;
begin
  if new.parent_folder_id is not null then
    if new.parent_folder_id = new.id then
      raise exception 'a folder cannot be its own parent' using errcode = 'check_violation';
    end if;
    select delivery_id into parent_delivery
      from kolkli_send.delivery_folders where id = new.parent_folder_id;
    if parent_delivery is null or parent_delivery <> new.delivery_id then
      raise exception 'parent folder must belong to the same delivery' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_folder_parent on kolkli_send.delivery_folders;
create trigger trg_folder_parent before insert or update on kolkli_send.delivery_folders
  for each row execute function kolkli_send.enforce_folder_parent();
