// Response serializers. Owner responses may include operational fields
// (status, counts, timestamps) but NEVER the password hash or storage
// keys. Public responses are built by the public_view RPC, which is
// curated in SQL.

export function ownerDelivery(d) {
  return {
    id: d.id,
    public_id: d.public_id,
    order_number: d.order_number,
    project_id: d.project_id,
    title: d.title,
    message: d.message,
    status: d.status,
    security_type: d.security_type,
    has_password: !!d.password_hash,     // boolean, never the hash
    allow_preview: d.allow_preview,
    allow_download: d.allow_download,
    allow_download_all: d.allow_download_all,
    allow_comments: d.allow_comments,
    expires_at: d.expires_at,
    max_views: d.max_views,
    max_downloads: d.max_downloads,
    view_count: d.view_count,
    download_count: d.download_count,
    sent_at: d.sent_at,
    revoked_at: d.revoked_at,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

export function ownerRecipient(r) {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone, status: r.status,
    verified_at: r.verified_at,
    first_opened_at: r.first_opened_at, last_opened_at: r.last_opened_at,
    first_downloaded_at: r.first_downloaded_at, last_downloaded_at: r.last_downloaded_at,
    view_count: r.view_count, download_count: r.download_count,
    created_at: r.created_at,
  };
}

export function ownerFolder(f) {
  return { id: f.id, parent_folder_id: f.parent_folder_id, name: f.name, sort_order: f.sort_order };
}

// Row is a delivery_files joined with stored_files.
export function ownerFile(f) {
  return {
    id: f.id,                       // delivery_files id (the client-facing handle)
    file_id: f.file_id,             // stored_files id (owner sees it; public never does)
    folder_id: f.folder_id,
    name: f.display_name || f.original_name,
    size_bytes: f.size_bytes,
    mime_type: f.mime_type,
    sort_order: f.sort_order,
    allow_preview: f.allow_preview,
    allow_download: f.allow_download,
    status: f.status,
    created_at: f.created_at,
  };
}

export function ownerEvent(e) {
  return {
    id: e.id, event_type: e.event_type, recipient_id: e.recipient_id, file_id: e.file_id,
    ip_address: e.ip_address, user_agent: e.user_agent, metadata: e.metadata, created_at: e.created_at,
  };
}
