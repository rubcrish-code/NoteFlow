use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};
use uuid::Uuid;

use crate::data::{DataError, DataResult};
use crate::revisions;

pub const ASSET_ROOT: &str = "assets";
pub const ASSET_URI_PREFIX: &str = "noteflow-asset://";
pub const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_ATTACHMENT_BYTES: u64 = 512 * 1024 * 1024;
const MAX_LEGACY_IMAGE_BYTES: usize = 100 * 1024 * 1024;
const MIGRATION_STATE_KEY: &str = "internal.asset-storage.v1";

pub const ASSET_MIGRATION_SQL: &str = "
    CREATE TABLE IF NOT EXISTS asset_blobs (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        storage_rel_path TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
        created_at TEXT NOT NULL
    );

    ALTER TABLE attachments ADD COLUMN blob_id TEXT REFERENCES asset_blobs(id);

    CREATE TABLE IF NOT EXISTS note_asset_refs (
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        blob_id TEXT NOT NULL REFERENCES asset_blobs(id) ON DELETE RESTRICT,
        PRIMARY KEY (note_id, blob_id)
    );

    CREATE TABLE IF NOT EXISTS revision_asset_refs (
        revision_id TEXT NOT NULL REFERENCES note_revisions(id) ON DELETE CASCADE,
        blob_id TEXT NOT NULL REFERENCES asset_blobs(id) ON DELETE RESTRICT,
        PRIMARY KEY (revision_id, blob_id)
    );

    CREATE TABLE IF NOT EXISTS note_attachment_refs (
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, attachment_id)
    );

    CREATE TABLE IF NOT EXISTS revision_attachment_refs (
        revision_id TEXT NOT NULL REFERENCES note_revisions(id) ON DELETE CASCADE,
        attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
        PRIMARY KEY (revision_id, attachment_id)
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_blob_id ON attachments(blob_id);
    CREATE INDEX IF NOT EXISTS idx_note_asset_refs_blob_id ON note_asset_refs(blob_id);
    CREATE INDEX IF NOT EXISTS idx_revision_asset_refs_blob_id ON revision_asset_refs(blob_id);
    CREATE INDEX IF NOT EXISTS idx_note_attachment_refs_attachment_id
        ON note_attachment_refs(attachment_id);
    CREATE INDEX IF NOT EXISTS idx_revision_attachment_refs_attachment_id
        ON revision_attachment_refs(attachment_id);
";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedBlob {
    pub id: String,
    pub mime_type: String,
    pub relative_path: String,
    pub size_bytes: i64,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct AssetMaintenanceStats {
    pub attachments_migrated: usize,
    pub blobs_created: usize,
    pub notes_migrated: usize,
    pub revisions_migrated: usize,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct AssetGcStats {
    pub attachments_deleted: usize,
    pub blobs_deleted: usize,
    pub files_deleted: usize,
}

pub fn asset_uri(blob_id: &str) -> String {
    format!("{ASSET_URI_PREFIX}{blob_id}")
}

pub fn canonical_blob_relative_path(blob_id: &str) -> DataResult<String> {
    if !is_sha256(blob_id) {
        return Err(DataError::InvalidInput(
            "Идентификатор asset некорректен".to_string(),
        ));
    }
    Ok(blob_relative_path(blob_id))
}

#[cfg(test)]
fn parse_asset_id(value: &str) -> Option<&str> {
    let id = value.strip_prefix(ASSET_URI_PREFIX)?;
    is_sha256(id).then_some(id)
}

pub fn prepare_blob_from_bytes(
    base_dir: &Path,
    bytes: &[u8],
    requested_mime: &str,
    is_image: bool,
) -> DataResult<PreparedBlob> {
    let size = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
    validate_ingest_size(size, is_image)?;
    let mime_type = validated_mime(bytes, requested_mime, is_image)?;
    prepare_blob(base_dir, &mime_type, size, |target| {
        let mut file = File::create(target)?;
        file.write_all(bytes)?;
        file.flush()?;
        file.sync_all()?;
        Ok(sha256_hex(bytes))
    })
}

pub fn prepare_blob_from_path(
    base_dir: &Path,
    source: &Path,
    requested_mime: &str,
    is_image: bool,
) -> DataResult<PreparedBlob> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(DataError::InvalidInput(
            "Можно добавить только обычный локальный файл".to_string(),
        ));
    }
    validate_ingest_size(metadata.len(), is_image)?;
    let mut signature = [0_u8; 16];
    let mut signature_file = File::open(source)?;
    let signature_len = signature_file.read(&mut signature)?;
    let mime_type = validated_mime(&signature[..signature_len], requested_mime, is_image)?;
    prepare_blob(base_dir, &mime_type, metadata.len(), |target| {
        let mut input = File::open(source)?;
        let mut output = File::create(target)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 128 * 1024];
        loop {
            let read = input.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            output.write_all(&buffer[..read])?;
        }
        output.flush()?;
        output.sync_all()?;
        Ok(format!("{:x}", hasher.finalize()))
    })
}

fn prepare_blob(
    base_dir: &Path,
    mime_type: &str,
    expected_size: u64,
    write: impl FnOnce(&Path) -> DataResult<String>,
) -> DataResult<PreparedBlob> {
    let cache_dir = base_dir.join("cache");
    fs::create_dir_all(&cache_dir)?;
    let temporary_path = cache_dir.join(format!("asset-ingest-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let hash = write(&temporary_path)?;
        let actual_size = fs::metadata(&temporary_path)?.len();
        if actual_size != expected_size || !is_sha256(&hash) {
            return Err(DataError::InvalidInput(
                "Файл вложения не удалось проверить".to_string(),
            ));
        }
        let relative_path = blob_relative_path(&hash);
        let final_path = resolve_managed_path(base_dir, &relative_path)?;
        if let Some(parent) = final_path.parent() {
            fs::create_dir_all(parent)?;
        }
        if final_path.exists() {
            let existing_hash = sha256_file(&final_path)?;
            if existing_hash != hash || fs::metadata(&final_path)?.len() != actual_size {
                return Err(DataError::State(
                    "Managed asset storage содержит конфликтующий файл".to_string(),
                ));
            }
            fs::remove_file(&temporary_path)?;
        } else {
            fs::rename(&temporary_path, &final_path)?;
        }
        Ok(PreparedBlob {
            id: hash.clone(),
            mime_type: mime_type.to_string(),
            relative_path,
            size_bytes: i64::try_from(actual_size).unwrap_or(i64::MAX),
        })
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

pub fn register_blob(
    transaction: &Transaction<'_>,
    blob: &PreparedBlob,
    now: &str,
) -> DataResult<()> {
    transaction.execute(
        "INSERT INTO asset_blobs (id, sha256, storage_rel_path, mime_type, size_bytes, created_at)
         VALUES (?1, ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
            mime_type = CASE
                WHEN asset_blobs.mime_type = 'application/octet-stream' THEN excluded.mime_type
                ELSE asset_blobs.mime_type
            END",
        params![
            blob.id,
            blob.relative_path,
            blob.mime_type,
            blob.size_bytes,
            now
        ],
    )?;
    Ok(())
}

pub fn replace_note_references(
    transaction: &Transaction<'_>,
    note_id: &str,
    persisted_values: impl IntoIterator<Item = String>,
) -> DataResult<()> {
    let references = collect_references(persisted_values);
    transaction.execute(
        "DELETE FROM note_asset_refs WHERE note_id = ?1",
        params![note_id],
    )?;
    transaction.execute(
        "DELETE FROM note_attachment_refs WHERE note_id = ?1",
        params![note_id],
    )?;
    let blob_ids = resolve_reference_blobs(transaction, &references)?;
    for blob_id in blob_ids {
        transaction.execute(
            "INSERT INTO note_asset_refs (note_id, blob_id) VALUES (?1, ?2)",
            params![note_id, blob_id],
        )?;
    }
    for attachment_id in references.attachment_ids {
        let inserted = transaction.execute(
            "INSERT INTO note_attachment_refs (note_id, attachment_id)
             SELECT ?1, id FROM attachments WHERE id = ?2 AND note_id = ?1",
            params![note_id, attachment_id],
        )?;
        if inserted == 0 {
            return Err(DataError::InvalidInput(
                "Документ содержит недоступное вложение".to_string(),
            ));
        }
    }
    Ok(())
}

pub fn replace_revision_references(
    transaction: &Transaction<'_>,
    revision_id: &str,
    persisted_values: impl IntoIterator<Item = String>,
) -> DataResult<()> {
    let references = collect_references(persisted_values);
    transaction.execute(
        "DELETE FROM revision_asset_refs WHERE revision_id = ?1",
        params![revision_id],
    )?;
    transaction.execute(
        "DELETE FROM revision_attachment_refs WHERE revision_id = ?1",
        params![revision_id],
    )?;
    let blob_ids = resolve_reference_blobs(transaction, &references)?;
    for blob_id in blob_ids {
        transaction.execute(
            "INSERT INTO revision_asset_refs (revision_id, blob_id) VALUES (?1, ?2)",
            params![revision_id, blob_id],
        )?;
    }
    for attachment_id in references.attachment_ids {
        let inserted = transaction.execute(
            "INSERT INTO revision_attachment_refs (revision_id, attachment_id)
             SELECT ?1, id FROM attachments WHERE id = ?2",
            params![revision_id, attachment_id],
        )?;
        if inserted == 0 {
            return Err(DataError::InvalidInput(
                "История заметки содержит недоступное вложение".to_string(),
            ));
        }
    }
    Ok(())
}

pub fn copy_note_references_to_revision(
    transaction: &Transaction<'_>,
    note_id: &str,
    revision_id: &str,
) -> DataResult<()> {
    transaction.execute(
        "INSERT INTO revision_asset_refs (revision_id, blob_id)
         SELECT ?1, blob_id FROM note_asset_refs WHERE note_id = ?2",
        params![revision_id, note_id],
    )?;
    transaction.execute(
        "INSERT INTO revision_attachment_refs (revision_id, attachment_id)
         SELECT ?1, attachment_id FROM note_attachment_refs WHERE note_id = ?2",
        params![revision_id, note_id],
    )?;
    Ok(())
}

pub fn restore_note_references_from_revision(
    transaction: &Transaction<'_>,
    note_id: &str,
    revision_id: &str,
) -> DataResult<()> {
    transaction.execute(
        "DELETE FROM note_asset_refs WHERE note_id = ?1",
        params![note_id],
    )?;
    transaction.execute(
        "DELETE FROM note_attachment_refs WHERE note_id = ?1",
        params![note_id],
    )?;
    transaction.execute(
        "INSERT INTO note_asset_refs (note_id, blob_id)
         SELECT ?1, blob_id FROM revision_asset_refs WHERE revision_id = ?2",
        params![note_id, revision_id],
    )?;
    transaction.execute(
        "INSERT INTO note_attachment_refs (note_id, attachment_id)
         SELECT ?1, attachment_id FROM revision_attachment_refs WHERE revision_id = ?2",
        params![note_id, revision_id],
    )?;
    Ok(())
}

#[derive(Default)]
struct DocumentReferences {
    asset_ids: HashSet<String>,
    attachment_ids: HashSet<String>,
}

fn collect_references(values: impl IntoIterator<Item = String>) -> DocumentReferences {
    let mut references = DocumentReferences::default();
    for value in values {
        collect_asset_uris(&value, &mut references.asset_ids);
        if let Ok(json) = serde_json::from_str::<Value>(&value) {
            collect_json_references(&json, &mut references);
        }
        collect_file_attachment_uris(&value, &mut references.attachment_ids);
    }
    references
}

fn resolve_reference_blobs(
    transaction: &Transaction<'_>,
    references: &DocumentReferences,
) -> DataResult<HashSet<String>> {
    let mut blob_ids = references.asset_ids.clone();
    for attachment_id in &references.attachment_ids {
        let blob_id = transaction
            .query_row(
                "SELECT blob_id FROM attachments WHERE id = ?1",
                params![attachment_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten()
            .ok_or_else(|| {
                DataError::InvalidInput("Вложение ещё не перенесено в managed storage".to_string())
            })?;
        blob_ids.insert(blob_id);
    }
    for blob_id in &blob_ids {
        let exists = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM asset_blobs WHERE id = ?1)",
            params![blob_id],
            |row| row.get::<_, bool>(0),
        )?;
        if !exists {
            return Err(DataError::InvalidInput(
                "Документ ссылается на недоступный managed asset".to_string(),
            ));
        }
    }
    Ok(blob_ids)
}

fn collect_json_references(value: &Value, references: &mut DocumentReferences) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_json_references(item, references);
            }
        }
        Value::Object(object) => {
            for (key, item) in object {
                if matches!(
                    key.as_str(),
                    "attachmentId" | "editedAttachmentId" | "originalAttachmentId" | "storageId"
                ) {
                    if let Some(id) = item.as_str().filter(|id| !id.trim().is_empty()) {
                        references.attachment_ids.insert(id.to_string());
                    }
                }
                collect_json_references(item, references);
            }
        }
        Value::String(text) => collect_asset_uris(text, &mut references.asset_ids),
        _ => {}
    }
}

fn collect_asset_uris(value: &str, target: &mut HashSet<String>) {
    let mut remaining = value;
    while let Some(index) = remaining.find(ASSET_URI_PREFIX) {
        let candidate = &remaining[index + ASSET_URI_PREFIX.len()..];
        let id = candidate
            .chars()
            .take_while(|ch| ch.is_ascii_hexdigit())
            .collect::<String>();
        if is_sha256(&id) {
            target.insert(id.clone());
        }
        remaining = &candidate[id.len().min(candidate.len())..];
    }
}

fn collect_file_attachment_uris(value: &str, target: &mut HashSet<String>) {
    const PREFIX: &str = "noteflow-file://";
    let mut remaining = value;
    while let Some(index) = remaining.find(PREFIX) {
        let candidate = &remaining[index + PREFIX.len()..];
        let id = candidate
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '-')
            .collect::<String>();
        if !id.is_empty() {
            target.insert(id.clone());
        }
        remaining = &candidate[id.len().min(candidate.len())..];
    }
}

pub fn resolve_blob_path(
    connection: &Connection,
    base_dir: &Path,
    blob_id: &str,
) -> DataResult<(PathBuf, String)> {
    if !is_sha256(blob_id) {
        return Err(DataError::InvalidInput(
            "Идентификатор asset некорректен".to_string(),
        ));
    }
    let (relative_path, mime_type) = connection
        .query_row(
            "SELECT storage_rel_path, mime_type FROM asset_blobs WHERE id = ?1",
            params![blob_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| DataError::NotFound("Managed asset не найден".to_string()))?;
    let path = resolve_managed_path(base_dir, &relative_path)?;
    if !path.is_file() {
        return Err(DataError::NotFound("Managed asset недоступен".to_string()));
    }
    Ok((path, mime_type))
}

pub fn resolve_attachment_blob_path(
    connection: &Connection,
    base_dir: &Path,
    attachment_id: &str,
) -> DataResult<(PathBuf, String)> {
    let (blob_id, original_name) = connection
        .query_row(
            "SELECT blob_id, original_name FROM attachments WHERE id = ?1",
            params![attachment_id],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| DataError::NotFound("Вложение не найдено".to_string()))?;
    let blob_id =
        blob_id.ok_or_else(|| DataError::NotFound("Файл вложения ещё не перенесён".to_string()))?;
    let (blob_path, _) = resolve_blob_path(connection, base_dir, &blob_id)?;
    Ok((blob_path, original_name))
}

pub fn materialize_attachment_view(
    connection: &Connection,
    base_dir: &Path,
    attachment_id: &str,
) -> DataResult<PathBuf> {
    let (blob_path, original_name) =
        resolve_attachment_blob_path(connection, base_dir, attachment_id)?;
    let safe_name = sanitize_export_name(&original_name);
    let view_dir = base_dir
        .join("cache")
        .join("attachment-view")
        .join(attachment_id);
    fs::create_dir_all(&view_dir)?;
    let view_path = view_dir.join(safe_name);
    let needs_copy =
        !view_path.is_file() || fs::metadata(&view_path)?.len() != fs::metadata(&blob_path)?.len();
    if needs_copy {
        let temporary = view_dir.join(format!("{}.tmp", Uuid::new_v4()));
        fs::copy(&blob_path, &temporary)?;
        if view_path.exists() {
            fs::remove_file(&view_path)?;
        }
        fs::rename(temporary, &view_path)?;
    }
    Ok(view_path)
}

pub fn run_startup_maintenance(
    connection: &mut Connection,
    base_dir: &Path,
    now: &str,
) -> DataResult<AssetMaintenanceStats> {
    let mut stats = migrate_attachment_files(connection, base_dir, now)?;
    let legacy_pattern = legacy_data_url_regex()?;
    let note_ids = query_ids(connection, "SELECT id FROM notes ORDER BY id")?;
    for note_id in note_ids {
        if migrate_note(connection, base_dir, &note_id, now, &legacy_pattern)? {
            stats.notes_migrated += 1;
        }
    }
    let revision_ids = query_ids(connection, "SELECT id FROM note_revisions ORDER BY id")?;
    for revision_id in revision_ids {
        if migrate_revision(connection, base_dir, &revision_id, now, &legacy_pattern)? {
            stats.revisions_migrated += 1;
        }
    }
    stats.blobs_created = connection.query_row("SELECT COUNT(*) FROM asset_blobs", [], |row| {
        row.get::<_, i64>(0)
    })? as usize;
    connection.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![MIGRATION_STATE_KEY, serde_json::json!({"completedAt": now}).to_string(), now],
    )?;
    Ok(stats)
}

fn migrate_attachment_files(
    connection: &mut Connection,
    base_dir: &Path,
    now: &str,
) -> DataResult<AssetMaintenanceStats> {
    let rows = {
        let mut statement = connection.prepare(
            "SELECT id, kind, storage_rel_path, mime_type FROM attachments
             WHERE blob_id IS NULL ORDER BY id",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    let mut stats = AssetMaintenanceStats::default();
    for (attachment_id, kind, old_relative_path, mime_type) in rows {
        let old_path = resolve_legacy_attachment_path(base_dir, &old_relative_path)?;
        let blob = prepare_blob_from_path(base_dir, &old_path, &mime_type, kind == "image")?;
        let transaction = connection.transaction()?;
        register_blob(&transaction, &blob, now)?;
        transaction.execute(
            "UPDATE attachments SET blob_id = ?1, storage_rel_path = ?2 WHERE id = ?3 AND blob_id IS NULL",
            params![blob.id, blob.relative_path, attachment_id],
        )?;
        transaction.commit()?;
        stats.attachments_migrated += 1;
        if old_path != resolve_managed_path(base_dir, &blob.relative_path)? {
            let remaining_legacy_references = connection.query_row(
                "SELECT COUNT(*) FROM attachments
                 WHERE blob_id IS NULL AND storage_rel_path = ?1",
                params![old_relative_path],
                |row| row.get::<_, i64>(0),
            )?;
            if remaining_legacy_references == 0 {
                let _ = fs::remove_file(old_path);
            }
        }
    }
    Ok(stats)
}

fn migrate_note(
    connection: &mut Connection,
    base_dir: &Path,
    note_id: &str,
    now: &str,
    pattern: &Regex,
) -> DataResult<bool> {
    let (content_json, content_markdown, content_html) = connection.query_row(
        "SELECT content_json, content_markdown, content_html FROM notes WHERE id = ?1",
        params![note_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    )?;
    let sidecars = query_owner_payloads(
        connection,
        "SELECT kind, payload_json FROM note_content_sidecars WHERE note_id = ?1 ORDER BY kind",
        note_id,
    )?;
    let mut values = vec![content_json, content_markdown, content_html];
    values.extend(sidecars.iter().map(|(_, payload)| payload.clone()));
    let (canonical, blobs) = canonicalize_values(base_dir, values, pattern)?;
    let changed = !blobs.is_empty();
    let transaction = connection.transaction()?;
    for blob in blobs.values() {
        register_blob(&transaction, blob, now)?;
    }
    if changed {
        serde_json::from_str::<Value>(&canonical[0]).map_err(|_| DataError::Serialization)?;
        transaction.execute(
            "UPDATE notes SET content_json = ?1, content_markdown = ?2, content_html = ?3,
                    content_version = content_version + 1
             WHERE id = ?4",
            params![canonical[0], canonical[1], canonical[2], note_id],
        )?;
        for ((kind, _), payload) in sidecars.iter().zip(canonical.iter().skip(3)) {
            serde_json::from_str::<Value>(payload).map_err(|_| DataError::Serialization)?;
            transaction.execute(
                "UPDATE note_content_sidecars SET payload_json = ?1, updated_at = ?2
                 WHERE note_id = ?3 AND kind = ?4",
                params![payload, now, note_id, kind],
            )?;
        }
    }
    replace_note_references(&transaction, note_id, canonical)?;
    transaction.commit()?;
    Ok(changed)
}

fn migrate_revision(
    connection: &mut Connection,
    base_dir: &Path,
    revision_id: &str,
    now: &str,
    pattern: &Regex,
) -> DataResult<bool> {
    let (content_json, content_markdown, content_html) = connection.query_row(
        "SELECT content_json, content_markdown, content_html FROM note_revisions WHERE id = ?1",
        params![revision_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    )?;
    let sidecars = query_owner_payloads(
        connection,
        "SELECT kind, payload_json FROM note_revision_sidecars WHERE revision_id = ?1 ORDER BY kind",
        revision_id,
    )?;
    let mut values = vec![content_json, content_markdown, content_html];
    values.extend(sidecars.iter().map(|(_, payload)| payload.clone()));
    let (canonical, blobs) = canonicalize_values(base_dir, values, pattern)?;
    let changed = !blobs.is_empty();
    let transaction = connection.transaction()?;
    for blob in blobs.values() {
        register_blob(&transaction, blob, now)?;
    }
    if changed {
        serde_json::from_str::<Value>(&canonical[0]).map_err(|_| DataError::Serialization)?;
        transaction.execute(
            "UPDATE note_revisions SET content_json = ?1, content_markdown = ?2, content_html = ?3
             WHERE id = ?4",
            params![canonical[0], canonical[1], canonical[2], revision_id],
        )?;
        for ((kind, _), payload) in sidecars.iter().zip(canonical.iter().skip(3)) {
            serde_json::from_str::<Value>(payload).map_err(|_| DataError::Serialization)?;
            transaction.execute(
                "UPDATE note_revision_sidecars SET payload_json = ?1
                 WHERE revision_id = ?2 AND kind = ?3",
                params![payload, revision_id, kind],
            )?;
        }
    }
    replace_revision_references(&transaction, revision_id, canonical)?;
    if changed {
        let markdown = transaction.query_row(
            "SELECT content_markdown FROM note_revisions WHERE id = ?1",
            params![revision_id],
            |row| row.get::<_, String>(0),
        )?;
        let hash = revisions::snapshot_hash_for_revision(&transaction, revision_id, &markdown)?;
        transaction.execute(
            "UPDATE note_revisions SET snapshot_hash = ?1 WHERE id = ?2",
            params![hash, revision_id],
        )?;
    }
    transaction.commit()?;
    Ok(changed)
}

fn canonicalize_values(
    base_dir: &Path,
    values: Vec<String>,
    pattern: &Regex,
) -> DataResult<(Vec<String>, HashMap<String, PreparedBlob>)> {
    let mut replacements = HashMap::<String, String>::new();
    let mut blobs = HashMap::<String, PreparedBlob>::new();
    for value in &values {
        for matched in pattern.find_iter(value) {
            let raw = matched.as_str();
            if replacements.contains_key(raw) {
                continue;
            }
            let (mime_type, bytes) = decode_legacy_data_url(raw)?;
            let blob = prepare_blob_from_bytes(base_dir, &bytes, &mime_type, true)?;
            replacements.insert(raw.to_string(), asset_uri(&blob.id));
            blobs.insert(blob.id.clone(), blob);
        }
    }
    let canonical = values
        .into_iter()
        .map(|mut value| {
            for (legacy, uri) in &replacements {
                value = value.replace(legacy, uri);
            }
            value
        })
        .collect();
    Ok((canonical, blobs))
}

pub(crate) fn decode_legacy_data_url(value: &str) -> DataResult<(String, Vec<u8>)> {
    decode_legacy_data_url_with_limit(value, MAX_LEGACY_IMAGE_BYTES)
}

fn decode_legacy_data_url_with_limit(
    value: &str,
    maximum_bytes: usize,
) -> DataResult<(String, Vec<u8>)> {
    let (header, payload) = value
        .split_once(',')
        .ok_or_else(|| DataError::InvalidInput("Legacy image data URL повреждён".to_string()))?;
    let mime_type = header
        .strip_prefix("data:")
        .and_then(|header| header.strip_suffix(";base64"))
        .ok_or_else(|| DataError::InvalidInput("Legacy image data URL повреждён".to_string()))?;
    let compact = payload
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>();
    let maximum_encoded_length = maximum_bytes
        .saturating_add(2)
        .saturating_div(3)
        .saturating_mul(4)
        .saturating_add(4);
    if compact.len() > maximum_encoded_length {
        return Err(DataError::InvalidInput(
            "Legacy image слишком большой для безопасного переноса".to_string(),
        ));
    }
    let bytes = BASE64_STANDARD
        .decode(compact)
        .map_err(|_| DataError::InvalidInput("Legacy image data URL повреждён".to_string()))?;
    if bytes.len() > maximum_bytes {
        return Err(DataError::InvalidInput(
            "Legacy image слишком большой для безопасного переноса".to_string(),
        ));
    }
    let detected = validated_mime(&bytes, mime_type, true)?;
    Ok((detected, bytes))
}

pub fn collect_garbage(connection: &mut Connection, base_dir: &Path) -> DataResult<AssetGcStats> {
    let transaction = connection.transaction()?;
    let attachments_deleted = transaction.execute(
        "DELETE FROM attachments
         WHERE NOT EXISTS (
             SELECT 1 FROM note_attachment_refs nar WHERE nar.attachment_id = attachments.id
         ) AND NOT EXISTS (
             SELECT 1 FROM revision_attachment_refs rar WHERE rar.attachment_id = attachments.id
         )",
        [],
    )?;
    transaction.commit()?;
    let orphan_blobs = {
        let mut statement = connection.prepare(
            "SELECT id, storage_rel_path FROM asset_blobs b
             WHERE NOT EXISTS (SELECT 1 FROM note_asset_refs n WHERE n.blob_id = b.id)
               AND NOT EXISTS (SELECT 1 FROM revision_asset_refs r WHERE r.blob_id = b.id)
               AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.blob_id = b.id)",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    let mut blobs_deleted = 0;
    let mut files_deleted = 0;
    for (blob_id, relative_path) in &orphan_blobs {
        let path = resolve_managed_path(base_dir, relative_path)?;
        let file_is_gone = match fs::remove_file(path) {
            Ok(()) => {
                files_deleted += 1;
                true
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
            Err(_) => false,
        };
        if file_is_gone {
            let transaction = connection.transaction()?;
            blobs_deleted += transaction.execute(
                "DELETE FROM asset_blobs
                 WHERE id = ?1
                   AND NOT EXISTS (SELECT 1 FROM note_asset_refs n WHERE n.blob_id = asset_blobs.id)
                   AND NOT EXISTS (SELECT 1 FROM revision_asset_refs r WHERE r.blob_id = asset_blobs.id)
                   AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.blob_id = asset_blobs.id)",
                params![blob_id],
            )?;
            transaction.commit()?;
        }
    }
    files_deleted += remove_untracked_asset_files(connection, base_dir)?;
    Ok(AssetGcStats {
        attachments_deleted,
        blobs_deleted,
        files_deleted,
    })
}

fn remove_untracked_asset_files(connection: &Connection, base_dir: &Path) -> DataResult<usize> {
    let tracked_paths = {
        let mut statement = connection.prepare("SELECT storage_rel_path FROM asset_blobs")?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<HashSet<_>, _>>()?;
        rows
    };
    let asset_root = base_dir.join(ASSET_ROOT);
    if !asset_root.is_dir() {
        return Ok(0);
    }
    let mut directories = vec![asset_root];
    let mut removed = 0;
    while let Some(directory) = directories.pop() {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let metadata = fs::symlink_metadata(entry.path())?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                directories.push(entry.path());
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            let relative_path = entry
                .path()
                .strip_prefix(base_dir)
                .map_err(|_| DataError::State("Managed asset path некорректен".to_string()))?
                .to_string_lossy()
                .replace('\\', "/");
            if !tracked_paths.contains(&relative_path) && fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

fn query_ids(connection: &Connection, sql: &str) -> DataResult<Vec<String>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn query_owner_payloads(
    connection: &Connection,
    sql: &str,
    owner_id: &str,
) -> DataResult<Vec<(String, String)>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params![owner_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn legacy_data_url_regex() -> DataResult<Regex> {
    Regex::new(r"data:image/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+")
        .map_err(|_| DataError::State("Не удалось подготовить asset migration".to_string()))
}

fn validate_ingest_size(size: u64, is_image: bool) -> DataResult<()> {
    if size == 0 {
        return Err(DataError::InvalidInput("Файл пустой".to_string()));
    }
    let limit = if is_image {
        MAX_IMAGE_BYTES
    } else {
        MAX_ATTACHMENT_BYTES
    };
    if size > limit {
        let label = if is_image {
            "Изображение"
        } else {
            "Файл"
        };
        return Err(DataError::InvalidInput(format!(
            "{label} превышает допустимый размер"
        )));
    }
    Ok(())
}

fn validated_mime(bytes: &[u8], requested_mime: &str, is_image: bool) -> DataResult<String> {
    if !is_image {
        let mime = requested_mime.trim().to_ascii_lowercase();
        return Ok(if mime.is_empty() {
            "application/octet-stream".to_string()
        } else {
            mime
        });
    }
    let detected = if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    };
    detected.map(str::to_string).ok_or_else(|| {
        DataError::InvalidInput("Поддерживаются только изображения PNG, JPEG и WebP".to_string())
    })
}

fn blob_relative_path(hash: &str) -> String {
    format!("{ASSET_ROOT}/{}/{}/{}", &hash[..2], &hash[2..4], hash)
}

fn resolve_managed_path(base_dir: &Path, relative_path: &str) -> DataResult<PathBuf> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(DataError::InvalidInput(
            "Managed asset path некорректен".to_string(),
        ));
    }
    if path.components().next().and_then(|part| match part {
        Component::Normal(value) => value.to_str(),
        _ => None,
    }) != Some(ASSET_ROOT)
    {
        return Err(DataError::InvalidInput(
            "Managed asset path некорректен".to_string(),
        ));
    }
    Ok(base_dir.join(path))
}

fn resolve_legacy_attachment_path(base_dir: &Path, relative_path: &str) -> DataResult<PathBuf> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(DataError::InvalidInput(
            "Legacy attachment path некорректен".to_string(),
        ));
    }
    let root = path.components().next().and_then(|part| match part {
        Component::Normal(value) => value.to_str(),
        _ => None,
    });
    if !matches!(root, Some("images" | "attachments" | ASSET_ROOT)) {
        return Err(DataError::InvalidInput(
            "Legacy attachment path некорректен".to_string(),
        ));
    }
    let resolved = base_dir.join(path);
    if !resolved.is_file() {
        return Err(DataError::NotFound(
            "Managed attachment file недоступен".to_string(),
        ));
    }
    Ok(resolved)
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(crate) fn sha256_file(path: &Path) -> DataResult<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn sanitize_export_name(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Вложение".to_string()
    } else {
        trimmed.chars().take(180).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn asset_uri_roundtrip_is_strict() {
        let id = "a".repeat(64);
        assert_eq!(parse_asset_id(&asset_uri(&id)), Some(id.as_str()));
        assert_eq!(parse_asset_id("noteflow-asset://../secret"), None);
    }

    #[test]
    fn image_magic_is_required() {
        assert!(validated_mime(b"<svg></svg>", "image/svg+xml", true).is_err());
        assert_eq!(
            validated_mime(&[0xff, 0xd8, 0xff, 0], "application/octet-stream", true).expect("jpeg"),
            "image/jpeg"
        );
    }

    #[test]
    fn oversized_legacy_payload_is_rejected_before_decode() {
        let value = format!("data:image/png;base64,{}", "A".repeat(17));
        let error = decode_legacy_data_url_with_limit(&value, 8)
            .expect_err("oversized legacy image rejected");
        assert!(error.to_string().contains("слишком большой"));
    }

    #[test]
    fn reference_collection_ignores_absolute_paths() {
        let id = "b".repeat(64);
        let refs = collect_references([format!(
            r#"{{"type":"image","attrs":{{"src":"{}","attachmentId":"attachment-1"}}}}"#,
            asset_uri(&id)
        )]);
        assert!(refs.asset_ids.contains(&id));
        assert!(refs.attachment_ids.contains("attachment-1"));
        assert!(!refs.asset_ids.contains("C:\\private"));
    }

    #[test]
    fn migration_schema_creates_reference_tables() {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE notes (id TEXT PRIMARY KEY);
                 CREATE TABLE note_revisions (id TEXT PRIMARY KEY);
                 CREATE TABLE attachments (id TEXT PRIMARY KEY);",
            )
            .expect("base schema");
        connection
            .execute_batch(ASSET_MIGRATION_SQL)
            .expect("asset schema");
        for table in [
            "asset_blobs",
            "note_asset_refs",
            "revision_asset_refs",
            "note_attachment_refs",
            "revision_attachment_refs",
        ] {
            let exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    params![table],
                    |row| row.get(0),
                )
                .expect("table lookup");
            assert!(exists, "{table}");
        }
    }
}
