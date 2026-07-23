-- ============================================================
-- KOLKLI SEND — SECURITY DEFINER functions.
--
-- These are the ONLY surface an anonymous client's flow touches.
-- Each runs as the function owner (bypassing RLS) and exposes a
-- single, tightly-scoped operation on ONE delivery identified by its
-- unguessable public_id. Password/code plaintext is hashed here with
-- pgcrypto and never stored or returned.
-- ============================================================

-- bcrypt a secret (password or code). Cost 10.
create or replace function kolkli_send.hash_secret(p_plain text)
  returns text language sql volatile security definer set search_path = kolkli_send, public
as $$ select crypt(p_plain, gen_salt('bf', 10)) $$;

-- Lazily flip an out-of-date delivery to `expired` (and audit it).
-- Returns true when the delivery is expired (already or just now).
create or replace function kolkli_send.lazy_expire(p_delivery uuid)
  returns boolean language plpgsql security definer set search_path = kolkli_send, public
as $$
declare d kolkli_send.deliveries;
begin
  select * into d from kolkli_send.deliveries where id = p_delivery for update;
  if d.id is null then return false; end if;
  if d.status = 'expired' then return true; end if;
  if d.expires_at is not null and d.expires_at <= now()
     and d.status not in ('draft','ready','revoked','blocked') then
    update kolkli_send.deliveries set status = 'expired' where id = p_delivery;
    insert into kolkli_send.delivery_events (delivery_id, event_type, metadata)
      values (p_delivery, 'delivery_expired', '{}'::jsonb);
    return true;
  end if;
  return false;
end $$;

-- Verify a password against the delivery. Returns true/false only.
create or replace function kolkli_send.verify_password(p_public_id text, p_plain text)
  returns boolean language plpgsql security definer set search_path = kolkli_send, public
as $$
declare h text;
begin
  select password_hash into h from kolkli_send.deliveries where public_id = p_public_id;
  if h is null then return false; end if;
  return h = crypt(p_plain, h);
end $$;

-- Store a bcrypt of a freshly generated code for a recipient.
create or replace function kolkli_send.store_code(
  p_delivery uuid, p_recipient uuid, p_plain text, p_ttl_min integer)
  returns uuid language plpgsql security definer set search_path = kolkli_send, public
as $$
declare new_id uuid;
begin
  insert into kolkli_send.verification_codes (delivery_id, recipient_id, code_hash, expires_at)
  values (p_delivery, p_recipient, crypt(p_plain, gen_salt('bf', 10)),
          now() + make_interval(mins => greatest(p_ttl_min, 1)))
  returning id into new_id;
  return new_id;
end $$;

-- Atomically check a code. Returns: 'ok' | 'bad' | 'expired' | 'locked' | 'none'.
-- Increments attempts; on the max-th wrong attempt returns 'locked'.
create or replace function kolkli_send.check_code(
  p_delivery uuid, p_recipient uuid, p_plain text, p_max_attempts integer)
  returns text language plpgsql security definer set search_path = kolkli_send, public
as $$
declare c kolkli_send.verification_codes;
begin
  select * into c from kolkli_send.verification_codes
    where delivery_id = p_delivery and recipient_id is not distinct from p_recipient
      and verified_at is null
    order by created_at desc limit 1
    for update;

  if c.id is null then return 'none'; end if;
  if c.expires_at <= now() then return 'expired'; end if;
  if c.attempts >= p_max_attempts then return 'locked'; end if;

  update kolkli_send.verification_codes set attempts = attempts + 1 where id = c.id;

  if c.code_hash = crypt(p_plain, c.code_hash) then
    update kolkli_send.verification_codes set verified_at = now() where id = c.id;
    update kolkli_send.delivery_recipients
      set status = case when status = 'pending' then 'verified' else status end,
          verified_at = coalesce(verified_at, now())
      where id = p_recipient;
    return 'ok';
  end if;

  if c.attempts + 1 >= p_max_attempts then return 'locked'; end if;
  return 'bad';
end $$;

-- Append an audit event. Safe for the anonymous client flow to call.
create or replace function kolkli_send.record_event(
  p_delivery uuid, p_recipient uuid, p_file uuid, p_type text,
  p_ip text, p_ua text, p_meta jsonb)
  returns bigint language plpgsql security definer set search_path = kolkli_send, public
as $$
declare new_id bigint; ip inet;
begin
  begin ip := nullif(p_ip,'')::inet; exception when others then ip := null; end;
  insert into kolkli_send.delivery_events
    (delivery_id, recipient_id, file_id, event_type, ip_address, user_agent, metadata)
  values (p_delivery, p_recipient, p_file, p_type, ip, nullif(p_ua,''), coalesce(p_meta,'{}'::jsonb))
  returning id into new_id;
  return new_id;
end $$;

-- Record an open: bump view counts, set opened timestamps, sent->opened.
create or replace function kolkli_send.mark_opened(p_delivery uuid, p_recipient uuid)
  returns void language plpgsql security definer set search_path = kolkli_send, public
as $$
begin
  update kolkli_send.deliveries
    set view_count = view_count + 1,
        status = case when status = 'sent' then 'opened'::kolkli_send.delivery_status else status end
    where id = p_delivery;
  if p_recipient is not null then
    update kolkli_send.delivery_recipients
      set view_count = view_count + 1,
          first_opened_at = coalesce(first_opened_at, now()),
          last_opened_at = now(),
          status = case when status in ('pending','notified','verified') then 'opened'::kolkli_send.recipient_status else status end
      where id = p_recipient;
  end if;
end $$;

-- Record a download: bump counts, set downloaded timestamps, ->downloaded.
-- Returns the delivery's new download_count.
create or replace function kolkli_send.mark_downloaded(p_delivery uuid, p_recipient uuid, p_n integer)
  returns integer language plpgsql security definer set search_path = kolkli_send, public
as $$
declare n integer;
begin
  update kolkli_send.deliveries
    set download_count = download_count + greatest(p_n, 1),
        status = case when status in ('sent','opened') then 'downloaded'::kolkli_send.delivery_status else status end
    where id = p_delivery
    returning download_count into n;
  if p_recipient is not null then
    update kolkli_send.delivery_recipients
      set download_count = download_count + greatest(p_n, 1),
          first_downloaded_at = coalesce(first_downloaded_at, now()),
          last_downloaded_at = now(),
          status = 'downloaded'
      where id = p_recipient;
  end if;
  return n;
end $$;

-- The curated public view of a delivery. NEVER returns user_id,
-- password_hash, storage keys, recipient details, IPs, or the audit log.
-- Files/folders are included only when p_include_files is true (link-only
-- deliveries, or a client who has already passed password/code).
create or replace function kolkli_send.public_view(p_public_id text, p_include_files boolean)
  returns jsonb language plpgsql security definer set search_path = kolkli_send, public
as $$
declare d kolkli_send.deliveries; files jsonb; folders jsonb; expired boolean;
begin
  select * into d from kolkli_send.deliveries where public_id = p_public_id;
  if d.id is null then return null; end if;

  expired := kolkli_send.lazy_expire(d.id);
  if expired then select * into d from kolkli_send.deliveries where id = d.id; end if;

  if p_include_files and d.status in ('sent','opened','downloaded') then
    select coalesce(jsonb_agg(f order by f->>'sort_order', f->>'name'), '[]'::jsonb) into files
    from (
      select jsonb_build_object(
        'id', df.id,
        'name', coalesce(df.display_name, sf.original_name),
        'size_bytes', sf.size_bytes,
        'mime_type', sf.mime_type,
        'folder_id', df.folder_id,
        'sort_order', df.sort_order,
        'allow_preview', coalesce(df.allow_preview, d.allow_preview),
        'allow_download', coalesce(df.allow_download, d.allow_download)
      ) as f
      from kolkli_send.delivery_files df
      join kolkli_send.stored_files sf on sf.id = df.file_id
      where df.delivery_id = d.id
    ) x;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', fo.id, 'parent_folder_id', fo.parent_folder_id,
        'name', fo.name, 'sort_order', fo.sort_order
      ) order by fo.sort_order, fo.name), '[]'::jsonb) into folders
    from kolkli_send.delivery_folders fo where fo.delivery_id = d.id;
  end if;

  return jsonb_build_object(
    'public_id', d.public_id,
    'reference', d.order_number,
    'title', d.title,
    'message', d.message,
    'status', d.status,
    'security_type', d.security_type,
    'allow_preview', d.allow_preview,
    'allow_download', d.allow_download,
    'allow_download_all', d.allow_download_all,
    'allow_comments', d.allow_comments,
    'expires_at', d.expires_at,
    'files', files,       -- null unless included
    'folders', folders
  );
end $$;

grant execute on all functions in schema kolkli_send to anon, authenticated, service_role;
