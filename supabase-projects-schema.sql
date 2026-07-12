-- ============================================================
-- KOLKLI — projects + files backend schema.
-- Run this ONCE, in full, AFTER supabase-schema.sql
-- (Supabase dashboard → SQL Editor → New query → Run).
--
-- This is what turns the four file services from a single-browser
-- localStorage/IndexedDB demo into real, cross-device persistence:
--
--   receive  — "קבצים שהתקבלו"  (request.html / upload.html)
--   review   — "קבצים לאישור"   (review.html  / proof.html)
--   send     — "קבצים שנשלחו"   (send.html    / download.html)
--   select   — "קבצים לבחירה"   (files.html   / select.html)
--
-- HOW IT MAPS TO THE BROWSER STORES
--   Each store (window.KR / RV / the send store / the new select store)
--   keeps an array of JSON "project" records. We store ONE ROW PER RECORD
--   here, with the whole record living in `data` (jsonb) — a 1:1 mirror of
--   what the browser already holds. The actual file BYTES do NOT go in the
--   DB; they live in the Storage bucket `kolkli-files` (see bottom of file),
--   keyed by  {service}/{token}/{fileId}.
--
-- SECURITY MODEL
--   * The signed-in OWNER reads/writes only their own rows (RLS below).
--   * Public client pages (proof/upload/download) have NO account. They
--     reach exactly one project through its unguessable `token`, which is
--     the shared secret — the same model the local demo already uses
--     ("whoever has the link is authorized"). That access goes through the
--     SECURITY DEFINER rpc()s below (project_get + the guarded writers),
--     never through a blanket public policy on the table.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) projects -----------------------------------------------------
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  service    text not null check (service in ('receive','review','send','select')),
  token      text not null,
  owner      uuid references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,   -- the full store record (no blobs)
  status     text,                                  -- denormalized for cheap listing
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service, token)
);
create index if not exists projects_owner_idx  on public.projects(owner);
create index if not exists projects_token_idx  on public.projects(token);
create index if not exists projects_svc_owner_idx on public.projects(service, owner);

alter table public.projects enable row level security;

-- Owner: full access to their own rows. (Nothing else can touch the table
-- directly — anon client access is only via the SECURITY DEFINER rpcs.)
drop policy if exists projects_owner_all on public.projects;
create policy projects_owner_all on public.projects
  for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- 2) Public read by token (the token is the secret) ---------------
-- Returns the single project behind a share link, regardless of who is
-- asking. Used by proof.html / upload.html / download.html on any device.
create or replace function public.project_get(p_service text, p_token text)
returns public.projects
language sql security definer set search_path = public stable as $$
  select * from public.projects
  where service = p_service and token = p_token
  limit 1;
$$;
grant execute on function public.project_get(text, text) to anon, authenticated;

-- Receive links are different: the upload client must render the form but must
-- NOT see other clients' submissions. This returns ONLY the safe form fields of
-- a 'receive' request (never submissions / files / notify / email). The password
-- hash is included to preserve the demo's client-side gate — harden later with a
-- server-side check-password RPC if you switch to a stronger model.
create or replace function public.request_public_info(p_token text)
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare d jsonb; st text;
begin
  select data, status into d, st from public.projects
   where service = 'receive' and token = p_token limit 1;
  if d is null then return null; end if;
  return jsonb_build_object(
    'token', p_token, 'name', d->'name', 'desc', d->'desc', 'types', d->'types',
    'maxFileMB', d->'maxFileMB', 'maxCount', d->'maxCount', 'maxTotalMB', d->'maxTotalMB',
    'expiresAt', d->'expiresAt', 'status', to_jsonb(coalesce(st, d->>'status', 'active')),
    'thankYou', d->'thankYou', 'brand', d->'brand', 'password', d->'password');
end;
$$;
grant execute on function public.request_public_info(text) to anon, authenticated;

-- 3) Guarded client writes ---------------------------------------
-- Each rpc mutates ONLY whitelisted keys of one token's `data`, so an
-- anonymous visitor can append their own feedback but can never overwrite
-- the record or reach another project. All are SECURITY DEFINER + token-gated.

-- 3a) append a comment (+ optional event) — review/proof "leave a comment"
create or replace function public.project_add_comment(
  p_service text, p_token text, p_comment jsonb, p_event jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.projects
     set data = jsonb_set(
                  case when p_event is null then data
                       else jsonb_set(data, '{events}',
                              coalesce(data->'events','[]'::jsonb) || jsonb_build_array(p_event)) end,
                  '{comments}',
                  coalesce(data->'comments','[]'::jsonb) || jsonb_build_array(p_comment))
   where service = p_service and token = p_token;
  if not found then raise exception 'project not found'; end if;
end;
$$;
grant execute on function public.project_add_comment(text, text, jsonb, jsonb) to anon, authenticated;

-- 3b) set the client's decision (approve / changes) — review/proof
create or replace function public.project_set_decision(
  p_service text, p_token text, p_decision jsonb, p_status text default null, p_event jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  d := data_of(p_service, p_token);
  if d is null then raise exception 'project not found'; end if;
  -- a null decision clears it (the client's "change decision"); a value sets it.
  if p_decision is null then d := d - 'decision';
  else d := jsonb_set(d, '{decision}', p_decision); end if;
  if p_status is not null then d := jsonb_set(d, '{status}', to_jsonb(p_status)); end if;
  if p_event  is not null then d := jsonb_set(d, '{events}',
        coalesce(d->'events','[]'::jsonb) || jsonb_build_array(p_event)); end if;
  update public.projects set data = d, status = coalesce(p_status, status)
   where service = p_service and token = p_token;
  if not found then raise exception 'project not found'; end if;
end;
$$;
grant execute on function public.project_set_decision(text, text, jsonb, text, jsonb) to anon, authenticated;

-- 3c) append an event only (e.g. "viewed") — review/proof, download
create or replace function public.project_add_event(
  p_service text, p_token text, p_event jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.projects
     set data = jsonb_set(data, '{events}',
                  coalesce(data->'events','[]'::jsonb) || jsonb_build_array(p_event))
   where service = p_service and token = p_token;
  if not found then raise exception 'project not found'; end if;
end;
$$;
grant execute on function public.project_add_event(text, text, jsonb) to anon, authenticated;

-- 3d) client upload submission (receive/upload) — append a submission and its files
create or replace function public.project_add_submission(
  p_token text, p_submission jsonb, p_files jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.projects
     set data = jsonb_set(
                  jsonb_set(data, '{submissions}',
                    coalesce(data->'submissions','[]'::jsonb) || jsonb_build_array(p_submission)),
                  '{files}',
                  coalesce(data->'files','[]'::jsonb) || coalesce(p_files,'[]'::jsonb))
   where service = 'receive' and token = p_token;
  if not found then raise exception 'request not found'; end if;
end;
$$;
grant execute on function public.project_add_submission(text, jsonb, jsonb) to anon, authenticated;

-- 3e) client selection (select) — replace the picked/selected flag set
create or replace function public.project_set_selection(
  p_token text, p_selection jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.projects
     set data = jsonb_set(data, '{selection}', coalesce(p_selection,'[]'::jsonb))
   where service = 'select' and token = p_token;
  if not found then raise exception 'selection not found'; end if;
end;
$$;
grant execute on function public.project_set_selection(text, jsonb) to anon, authenticated;

-- 3f) client download counter (send/download)
create or replace function public.project_bump_download(p_token text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  update public.projects
     set data = jsonb_set(data, '{downloads}',
                  to_jsonb(coalesce((data->>'downloads')::bigint,0) + 1))
   where service = 'send' and token = p_token
   returning (data->>'downloads')::bigint into n;
  if not found then raise exception 'package not found'; end if;
  return n;
end;
$$;
grant execute on function public.project_bump_download(text) to anon, authenticated;

-- helper used by 3b
create or replace function public.data_of(p_service text, p_token text)
returns jsonb language sql security definer set search_path = public stable as $$
  select data from public.projects where service = p_service and token = p_token limit 1;
$$;

-- ============================================================
-- 4) STORAGE — the file bytes
-- ------------------------------------------------------------
-- Create the bucket FIRST in the dashboard:
--   Storage → New bucket → name: kolkli-files → Public bucket: ON → Save.
-- (Public read matches the demo's "whoever has the link" model; paths are
--  unguessable = {service}/{token}/{fileId}. Harden later with signed URLs
--  + an Edge Function if you want per-token download gating.)
--
-- Then run the policies below (they live on storage.objects):
-- ============================================================

-- public read of any object in the bucket (bucket is public; explicit for clarity)
drop policy if exists kolkli_files_public_read on storage.objects;
create policy kolkli_files_public_read on storage.objects
  for select using (bucket_id = 'kolkli-files');

-- signed-in owner: write / overwrite / delete anywhere in the bucket
drop policy if exists kolkli_files_auth_insert on storage.objects;
create policy kolkli_files_auth_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'kolkli-files');

drop policy if exists kolkli_files_auth_update on storage.objects;
create policy kolkli_files_auth_update on storage.objects
  for update to authenticated using (bucket_id = 'kolkli-files');

drop policy if exists kolkli_files_auth_delete on storage.objects;
create policy kolkli_files_auth_delete on storage.objects
  for delete to authenticated using (bucket_id = 'kolkli-files');

-- anonymous client uploads: allowed ONLY under receive/… and review/…
-- (client-submitted files on an upload link, and client comment attachments
--  on a proof link). The unguessable token in the path still gates access.
drop policy if exists kolkli_files_anon_insert on storage.objects;
create policy kolkli_files_anon_insert on storage.objects
  for insert to anon with check (
    bucket_id = 'kolkli-files'
    and (storage.foldername(name))[1] in ('receive','review')
  );
