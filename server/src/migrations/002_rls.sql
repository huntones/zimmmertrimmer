-- ============================================================
-- KOLKLI SEND — Row-Level Security + grants.
--
-- Model:
--   * Owners (authenticated, JWT sub = user_id) may touch ONLY their
--     own deliveries and everything hanging off them. RLS enforces
--     this even if the app layer has a bug — defense in depth.
--   * Anonymous clients have NO identity and NO table access. They
--     reach exactly one delivery through its unguessable public_id,
--     via the SECURITY DEFINER functions in 003_functions.sql.
--   * service_role bypasses RLS (Supabase default) and is used by the
--     backend for public-flow orchestration and system tasks.
-- ============================================================

grant usage on schema kolkli_send to anon, authenticated, service_role;

-- Authenticated owners get table DML; RLS narrows it to their rows.
grant select, insert, update, delete on all tables in schema kolkli_send to authenticated;
grant usage, select on all sequences in schema kolkli_send to authenticated;
grant execute on all functions in schema kolkli_send to authenticated, anon, service_role;

alter table kolkli_send.stored_files          enable row level security;
alter table kolkli_send.deliveries            enable row level security;
alter table kolkli_send.delivery_recipients   enable row level security;
alter table kolkli_send.delivery_folders      enable row level security;
alter table kolkli_send.delivery_files        enable row level security;
alter table kolkli_send.delivery_events       enable row level security;
alter table kolkli_send.verification_codes    enable row level security;

-- Helper: does auth.uid() own this delivery?
create or replace function kolkli_send.owns_delivery(p_delivery uuid)
  returns boolean language sql stable security definer set search_path = kolkli_send, public as $$
  select exists (
    select 1 from kolkli_send.deliveries d
    where d.id = p_delivery and d.user_id = auth.uid()
  )
$$;

-- ---- stored_files: owner-only ----
drop policy if exists sf_owner_all on kolkli_send.stored_files;
create policy sf_owner_all on kolkli_send.stored_files
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- ---- deliveries: owner-only (no public policy; clients use RPCs) ----
drop policy if exists del_owner_all on kolkli_send.deliveries;
create policy del_owner_all on kolkli_send.deliveries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- child tables: owner reaches them through the parent delivery ----
drop policy if exists rcp_owner_all on kolkli_send.delivery_recipients;
create policy rcp_owner_all on kolkli_send.delivery_recipients
  for all to authenticated
  using (kolkli_send.owns_delivery(delivery_id))
  with check (kolkli_send.owns_delivery(delivery_id));

drop policy if exists fld_owner_all on kolkli_send.delivery_folders;
create policy fld_owner_all on kolkli_send.delivery_folders
  for all to authenticated
  using (kolkli_send.owns_delivery(delivery_id))
  with check (kolkli_send.owns_delivery(delivery_id));

drop policy if exists df_owner_all on kolkli_send.delivery_files;
create policy df_owner_all on kolkli_send.delivery_files
  for all to authenticated
  using (kolkli_send.owns_delivery(delivery_id))
  with check (kolkli_send.owns_delivery(delivery_id));

-- ---- audit log: owner may READ their delivery's events, never write
--      directly (events are written by SECURITY DEFINER functions) ----
drop policy if exists ev_owner_read on kolkli_send.delivery_events;
create policy ev_owner_read on kolkli_send.delivery_events
  for select to authenticated
  using (kolkli_send.owns_delivery(delivery_id));

-- ---- verification codes: no direct access to anyone. Only the
--      SECURITY DEFINER functions read/write them. (RLS on, zero
--      policies => authenticated sees nothing; service_role bypasses.)
