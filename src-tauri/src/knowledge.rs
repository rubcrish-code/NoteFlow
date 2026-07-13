use crate::data::{DataError, DataResult};
use chrono::{SecondsFormat, Utc};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, time::Instant};

pub const CHUNKER_VERSION: i64 = 1;
pub const CHUNK_TARGET_CHARS: usize = 2_200;
pub const CHUNK_SOFT_MAX_CHARS: usize = 3_000;
pub const CHUNK_HARD_MAX_CHARS: usize = 4_000;
const ESTIMATED_CHARS_PER_TOKEN: usize = 4;
const MAX_NOTE_IDS_PER_REQUEST: usize = 500;

pub const KNOWLEDGE_MIGRATION_SQL: &str = r#"
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        chunk_order INTEGER NOT NULL,
        heading_path_json TEXT NOT NULL,
        content_markdown TEXT NOT NULL,
        content_text TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        char_count INTEGER NOT NULL,
        estimated_tokens INTEGER NOT NULL,
        chunker_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(note_id, chunk_order)
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunk_state (
        note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
        source_hash TEXT NOT NULL,
        chunker_version INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('current', 'pending', 'failed')),
        last_indexed_at TEXT,
        last_error_code TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_note_id
        ON knowledge_chunks(note_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_hash
        ON knowledge_chunks(content_hash);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_updated_at
        ON knowledge_chunks(updated_at);
"#;

pub const KNOWLEDGE_METADATA_MIGRATION_SQL: &str = r#"
    CREATE TABLE IF NOT EXISTS knowledge_index_metadata (
        singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
        last_checked_at TEXT,
        last_indexed_at TEXT
    );

    INSERT OR IGNORE INTO knowledge_index_metadata (
        singleton_id, last_checked_at, last_indexed_at
    )
    SELECT 1, MAX(last_indexed_at), MAX(last_indexed_at)
    FROM knowledge_chunk_state;
"#;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunkDto {
    pub id: String,
    pub note_id: String,
    pub chunk_order: i64,
    pub heading_path: Vec<String>,
    pub content_markdown: String,
    pub content_text: String,
    pub content_hash: String,
    pub char_count: i64,
    pub estimated_tokens: i64,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunkStateDto {
    pub note_id: String,
    pub chunker_version: i64,
    pub chunk_count: i64,
    pub status: String,
    pub last_indexed_at: Option<String>,
    pub last_error_code: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIndexStatusDto {
    pub status: String,
    pub total_notes: i64,
    pub indexed_notes: i64,
    pub chunk_count: i64,
    pub pending_notes: i64,
    pub failed_notes: i64,
    pub last_checked_at: Option<String>,
    pub last_indexed_at: Option<String>,
    pub chunker_version: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildKnowledgeChunksResultDto {
    pub processed_notes: i64,
    pub created_chunks: i64,
    pub errors: i64,
    pub duration_ms: u128,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunkNeighborsRequest {
    pub chunk_id: String,
    #[serde(default = "default_neighbor_radius")]
    pub radius: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeChunksByNoteIdsRequest {
    pub note_ids: Vec<String>,
}

fn default_neighbor_radius() -> i64 {
    1
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ChunkDraft {
    heading_path: Vec<String>,
    content_markdown: String,
    content_text: String,
    content_hash: String,
    char_count: usize,
    estimated_tokens: usize,
}

#[derive(Clone, Debug)]
struct MarkdownBlock {
    start: usize,
    end: usize,
    heading_path: Vec<String>,
    content_markdown: String,
    content_text: String,
    kind: BlockKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BlockKind {
    Code,
    CustomContainer,
    Heading,
    Other,
    Table,
}

#[derive(Debug)]
struct ActiveBlock {
    start: usize,
    end: usize,
    depth: usize,
    heading_level: Option<usize>,
    heading_text: String,
    text: String,
    kind: BlockKind,
}

pub fn sync_note_best_effort(conn: &mut Connection, note_id: &str) {
    if sync_note(conn, note_id).is_err() {
        let _ = mark_failed(conn, note_id, "chunking_failed");
    }
}

pub fn sync_note(conn: &mut Connection, note_id: &str) -> DataResult<i64> {
    let note = conn
        .query_row(
            "SELECT content_markdown, plain_text, deleted_at FROM notes WHERE id = ?1",
            params![note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| {
            DataError::NotFound("Заметка для индекса базы знаний не найдена".to_string())
        })?;

    if note.2.is_some() {
        remove_note_index(conn, note_id)?;
        return Ok(0);
    }

    let markdown = effective_markdown(&note.0, &note.1);
    let source_hash = source_hash(markdown);
    let existing_state = conn
        .query_row(
            "SELECT source_hash, chunker_version, status
             FROM knowledge_chunk_state WHERE note_id = ?1",
            params![note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?;
    if matches!(existing_state, Some((ref hash, version, ref status)) if hash == &source_hash && version == CHUNKER_VERSION && status == "current")
    {
        return conn
            .query_row(
                "SELECT chunk_count FROM knowledge_chunk_state WHERE note_id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .map_err(DataError::from);
    }

    set_pending(conn, note_id, &source_hash)?;
    let drafts = match chunk_markdown(markdown) {
        Ok(drafts) => drafts,
        Err(error) => {
            let _ = mark_failed(conn, note_id, "data_loss_guard");
            return Err(error);
        }
    };
    let now = now_iso();
    let existing_created_at = existing_chunk_creation_times(conn, note_id)?;
    let transaction = conn.transaction()?;
    transaction.execute(
        "DELETE FROM knowledge_chunks WHERE note_id = ?1",
        params![note_id],
    )?;

    let mut occurrences = HashMap::<(String, String), usize>::new();
    for (chunk_order, draft) in drafts.iter().enumerate() {
        let heading_path_json = serde_json::to_string(&draft.heading_path)?;
        let key = (draft.content_hash.clone(), heading_path_json.clone());
        let occurrence = occurrences.entry(key.clone()).or_insert(0);
        let chunk_id = deterministic_chunk_id(
            note_id,
            &draft.content_hash,
            &heading_path_json,
            *occurrence,
        );
        let created_at = existing_created_at
            .get(&(
                draft.content_hash.clone(),
                heading_path_json.clone(),
                *occurrence,
            ))
            .cloned()
            .unwrap_or_else(|| now.clone());
        *occurrence += 1;
        transaction.execute(
            "INSERT INTO knowledge_chunks (
                id, note_id, chunk_order, heading_path_json, content_markdown, content_text,
                content_hash, char_count, estimated_tokens, chunker_version, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                chunk_id,
                note_id,
                chunk_order as i64,
                heading_path_json,
                draft.content_markdown,
                draft.content_text,
                draft.content_hash,
                draft.char_count as i64,
                draft.estimated_tokens as i64,
                CHUNKER_VERSION,
                created_at,
                now
            ],
        )?;
    }
    transaction.execute(
        "INSERT INTO knowledge_chunk_state (
            note_id, source_hash, chunker_version, chunk_count, status, last_indexed_at, last_error_code
         ) VALUES (?1, ?2, ?3, ?4, 'current', ?5, NULL)
         ON CONFLICT(note_id) DO UPDATE SET
            source_hash = excluded.source_hash,
            chunker_version = excluded.chunker_version,
            chunk_count = excluded.chunk_count,
            status = 'current',
            last_indexed_at = excluded.last_indexed_at,
            last_error_code = NULL",
        params![note_id, source_hash, CHUNKER_VERSION, drafts.len() as i64, now],
    )?;
    transaction.commit()?;
    mark_index_changed(conn, &now)?;
    Ok(drafts.len() as i64)
}

pub fn reconcile(conn: &mut Connection) -> DataResult<RebuildKnowledgeChunksResultDto> {
    let started_at = Instant::now();
    let note_ids = active_note_ids(conn)?;
    let mut processed_notes = 0_i64;
    let mut created_chunks = 0_i64;
    let mut errors = 0_i64;
    for note_id in note_ids {
        if note_needs_sync(conn, &note_id)? {
            processed_notes += 1;
            match sync_note(conn, &note_id) {
                Ok(count) => created_chunks += count,
                Err(_) => {
                    errors += 1;
                    let _ = mark_failed(conn, &note_id, "chunking_failed");
                }
            }
        }
    }
    remove_orphaned_index_rows(conn)?;
    mark_index_checked(conn, &now_iso())?;
    Ok(RebuildKnowledgeChunksResultDto {
        processed_notes,
        created_chunks,
        errors,
        duration_ms: started_at.elapsed().as_millis(),
    })
}

pub fn rebuild(conn: &mut Connection) -> DataResult<RebuildKnowledgeChunksResultDto> {
    let started_at = Instant::now();
    let note_ids = active_note_ids(conn)?;
    let transaction = conn.transaction()?;
    transaction.execute("DELETE FROM knowledge_chunks", [])?;
    transaction.execute("DELETE FROM knowledge_chunk_state", [])?;
    transaction.commit()?;

    let mut created_chunks = 0_i64;
    let mut errors = 0_i64;
    for note_id in &note_ids {
        match sync_note(conn, note_id) {
            Ok(count) => created_chunks += count,
            Err(_) => {
                errors += 1;
                let _ = mark_failed(conn, note_id, "chunking_failed");
            }
        }
    }
    let completed_at = now_iso();
    set_index_timestamps(conn, Some(&completed_at), Some(&completed_at))?;
    Ok(RebuildKnowledgeChunksResultDto {
        processed_notes: note_ids.len() as i64,
        created_chunks,
        errors,
        duration_ms: started_at.elapsed().as_millis(),
    })
}

pub fn index_status(conn: &Connection) -> DataResult<KnowledgeIndexStatusDto> {
    let total_notes = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    let indexed_notes = conn.query_row(
        "SELECT COUNT(*) FROM knowledge_chunk_state s
         INNER JOIN notes n ON n.id = s.note_id
         WHERE n.deleted_at IS NULL AND s.status = 'current' AND s.chunker_version = ?1",
        params![CHUNKER_VERSION],
        |row| row.get::<_, i64>(0),
    )?;
    let pending_notes = conn.query_row(
        "SELECT COUNT(*) FROM knowledge_chunk_state WHERE status = 'pending'",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    let failed_notes = conn.query_row(
        "SELECT COUNT(*) FROM knowledge_chunk_state WHERE status = 'failed'",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    let chunk_count = conn.query_row("SELECT COUNT(*) FROM knowledge_chunks", [], |row| {
        row.get::<_, i64>(0)
    })?;
    let (last_checked_at, last_indexed_at) = conn
        .query_row(
            "SELECT last_checked_at, last_indexed_at
             FROM knowledge_index_metadata WHERE singleton_id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()?
        .unwrap_or((None, None));
    let status = if failed_notes > 0 {
        "failed"
    } else if pending_notes > 0 {
        "pending"
    } else if indexed_notes < total_notes {
        "needs_update"
    } else {
        "current"
    };
    Ok(KnowledgeIndexStatusDto {
        status: status.to_string(),
        total_notes,
        indexed_notes,
        chunk_count,
        pending_notes,
        failed_notes,
        last_checked_at,
        last_indexed_at,
        chunker_version: CHUNKER_VERSION,
    })
}

pub fn get_chunks_by_note_id(
    conn: &Connection,
    note_id: &str,
) -> DataResult<Vec<KnowledgeChunkDto>> {
    let mut statement = conn.prepare(
        "SELECT id, note_id, chunk_order, heading_path_json, content_markdown, content_text,
                content_hash, char_count, estimated_tokens, updated_at
         FROM knowledge_chunks WHERE note_id = ?1 ORDER BY chunk_order",
    )?;
    let rows = statement.query_map(params![note_id], chunk_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_chunks_by_note_ids(
    conn: &Connection,
    request: &KnowledgeChunksByNoteIdsRequest,
) -> DataResult<Vec<KnowledgeChunkDto>> {
    let note_ids = request
        .note_ids
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .take(MAX_NOTE_IDS_PER_REQUEST)
        .collect::<Vec<_>>();
    if note_ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = (1..=note_ids.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT id, note_id, chunk_order, heading_path_json, content_markdown, content_text,
                content_hash, char_count, estimated_tokens, updated_at
         FROM knowledge_chunks WHERE note_id IN ({placeholders})
         ORDER BY note_id, chunk_order"
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(note_ids), chunk_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_neighbor_chunks(
    conn: &Connection,
    request: &KnowledgeChunkNeighborsRequest,
) -> DataResult<Vec<KnowledgeChunkDto>> {
    let (note_id, chunk_order) = conn
        .query_row(
            "SELECT note_id, chunk_order FROM knowledge_chunks WHERE id = ?1",
            params![request.chunk_id.trim()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()?
        .ok_or_else(|| DataError::NotFound("Фрагмент базы знаний не найден".to_string()))?;
    let radius = request.radius.clamp(1, 10);
    let mut statement = conn.prepare(
        "SELECT id, note_id, chunk_order, heading_path_json, content_markdown, content_text,
                content_hash, char_count, estimated_tokens, updated_at
         FROM knowledge_chunks
         WHERE note_id = ?1 AND chunk_order BETWEEN ?2 AND ?3
         ORDER BY chunk_order",
    )?;
    let rows = statement.query_map(
        params![note_id, chunk_order - radius, chunk_order + radius],
        chunk_from_row,
    )?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_state(conn: &Connection, note_id: &str) -> DataResult<Option<KnowledgeChunkStateDto>> {
    conn.query_row(
        "SELECT note_id, chunker_version, chunk_count, status, last_indexed_at, last_error_code
         FROM knowledge_chunk_state WHERE note_id = ?1",
        params![note_id],
        |row| {
            Ok(KnowledgeChunkStateDto {
                note_id: row.get(0)?,
                chunker_version: row.get(1)?,
                chunk_count: row.get(2)?,
                status: row.get(3)?,
                last_indexed_at: row.get(4)?,
                last_error_code: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(DataError::from)
}

pub fn remove_note_index(conn: &mut Connection, note_id: &str) -> DataResult<()> {
    let transaction = conn.transaction()?;
    transaction.execute(
        "DELETE FROM knowledge_chunks WHERE note_id = ?1",
        params![note_id],
    )?;
    transaction.execute(
        "DELETE FROM knowledge_chunk_state WHERE note_id = ?1",
        params![note_id],
    )?;
    transaction.commit()?;
    mark_index_changed(conn, &now_iso())?;
    Ok(())
}

fn mark_index_checked(conn: &Connection, checked_at: &str) -> DataResult<()> {
    set_index_timestamps(conn, Some(checked_at), None)
}

fn mark_index_changed(conn: &Connection, indexed_at: &str) -> DataResult<()> {
    set_index_timestamps(conn, None, Some(indexed_at))
}

fn set_index_timestamps(
    conn: &Connection,
    checked_at: Option<&str>,
    indexed_at: Option<&str>,
) -> DataResult<()> {
    conn.execute(
        "INSERT INTO knowledge_index_metadata (singleton_id, last_checked_at, last_indexed_at)
         VALUES (1, ?1, ?2)
         ON CONFLICT(singleton_id) DO UPDATE SET
            last_checked_at = COALESCE(excluded.last_checked_at, knowledge_index_metadata.last_checked_at),
            last_indexed_at = COALESCE(excluded.last_indexed_at, knowledge_index_metadata.last_indexed_at)",
        params![checked_at, indexed_at],
    )?;
    Ok(())
}

fn set_pending(conn: &Connection, note_id: &str, source_hash: &str) -> DataResult<()> {
    conn.execute(
        "INSERT INTO knowledge_chunk_state (
            note_id, source_hash, chunker_version, chunk_count, status, last_indexed_at, last_error_code
         ) VALUES (?1, ?2, ?3, 0, 'pending', NULL, NULL)
         ON CONFLICT(note_id) DO UPDATE SET
            source_hash = excluded.source_hash,
            chunker_version = excluded.chunker_version,
            status = 'pending',
            last_error_code = NULL",
        params![note_id, source_hash, CHUNKER_VERSION],
    )?;
    Ok(())
}

fn mark_failed(conn: &Connection, note_id: &str, error_code: &str) -> DataResult<()> {
    let safe_error_code = match error_code {
        "data_loss_guard" => "data_loss_guard",
        _ => "chunking_failed",
    };
    conn.execute(
        "INSERT INTO knowledge_chunk_state (
            note_id, source_hash, chunker_version, chunk_count, status, last_indexed_at, last_error_code
         ) VALUES (?1, '', ?2, 0, 'failed', NULL, ?3)
         ON CONFLICT(note_id) DO UPDATE SET
            status = 'failed',
            last_error_code = excluded.last_error_code",
        params![note_id, CHUNKER_VERSION, safe_error_code],
    )?;
    Ok(())
}

fn note_needs_sync(conn: &Connection, note_id: &str) -> DataResult<bool> {
    let (content_markdown, plain_text) = conn.query_row(
        "SELECT content_markdown, plain_text FROM notes WHERE id = ?1 AND deleted_at IS NULL",
        params![note_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;
    let expected_hash = source_hash(effective_markdown(&content_markdown, &plain_text));
    let state = conn
        .query_row(
            "SELECT source_hash, chunker_version, status FROM knowledge_chunk_state WHERE note_id = ?1",
            params![note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?;
    Ok(
        !matches!(state, Some((hash, version, status)) if hash == expected_hash && version == CHUNKER_VERSION && status == "current"),
    )
}

fn active_note_ids(conn: &Connection) -> DataResult<Vec<String>> {
    let mut statement =
        conn.prepare("SELECT id FROM notes WHERE deleted_at IS NULL ORDER BY id")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn remove_orphaned_index_rows(conn: &Connection) -> DataResult<()> {
    conn.execute(
        "DELETE FROM knowledge_chunk_state
         WHERE note_id NOT IN (SELECT id FROM notes WHERE deleted_at IS NULL)",
        [],
    )?;
    conn.execute(
        "DELETE FROM knowledge_chunks
         WHERE note_id NOT IN (SELECT id FROM notes WHERE deleted_at IS NULL)",
        [],
    )?;
    Ok(())
}

fn existing_chunk_creation_times(
    conn: &Connection,
    note_id: &str,
) -> DataResult<HashMap<(String, String, usize), String>> {
    let mut statement = conn.prepare(
        "SELECT content_hash, heading_path_json, created_at
         FROM knowledge_chunks WHERE note_id = ?1 ORDER BY chunk_order",
    )?;
    let rows = statement.query_map(params![note_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut occurrences = HashMap::<(String, String), usize>::new();
    let mut result = HashMap::new();
    for row in rows {
        let (hash, heading_path, created_at) = row?;
        let key = (hash.clone(), heading_path.clone());
        let occurrence = occurrences.entry(key).or_insert(0);
        result.insert((hash, heading_path, *occurrence), created_at);
        *occurrence += 1;
    }
    Ok(result)
}

fn chunk_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeChunkDto> {
    let heading_path_json: String = row.get(3)?;
    Ok(KnowledgeChunkDto {
        id: row.get(0)?,
        note_id: row.get(1)?,
        chunk_order: row.get(2)?,
        heading_path: serde_json::from_str(&heading_path_json).unwrap_or_default(),
        content_markdown: row.get(4)?,
        content_text: row.get(5)?,
        content_hash: row.get(6)?,
        char_count: row.get(7)?,
        estimated_tokens: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn chunk_markdown(markdown: &str) -> DataResult<Vec<ChunkDraft>> {
    let normalized = normalize_line_endings(markdown);
    let blocks = extract_markdown_blocks(&normalized);
    let expected_text = blocks
        .iter()
        .map(|block| block.content_text.as_str())
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let expanded_blocks = blocks
        .into_iter()
        .flat_map(split_oversized_block)
        .collect::<Vec<_>>();
    let mut drafts = Vec::new();
    let mut current = Vec::<MarkdownBlock>::new();
    let mut current_chars = 0_usize;

    for block in expanded_blocks {
        let block_chars = unicode_len(&block.content_markdown);
        let heading_changed = current
            .first()
            .is_some_and(|first| first.heading_path != block.heading_path);
        let combined_chars = current_chars + usize::from(!current.is_empty()) * 2 + block_chars;
        if !current.is_empty()
            && (heading_changed
                || combined_chars > CHUNK_HARD_MAX_CHARS
                || (current_chars >= CHUNK_TARGET_CHARS && combined_chars > CHUNK_SOFT_MAX_CHARS))
        {
            drafts.push(build_chunk(&current)?);
            current.clear();
            current_chars = 0;
        }
        current_chars += usize::from(!current.is_empty()) * 2 + block_chars;
        current.push(block);
    }
    if !current.is_empty() {
        drafts.push(build_chunk(&current)?);
    }

    let actual_text = drafts
        .iter()
        .map(|chunk| chunk.content_text.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    if normalize_guard_text(&expected_text) != normalize_guard_text(&actual_text) {
        return Err(DataError::State(
            "Индекс базы знаний не обновлён: проверка целостности текста не пройдена".to_string(),
        ));
    }
    Ok(drafts)
}

fn build_chunk(blocks: &[MarkdownBlock]) -> DataResult<ChunkDraft> {
    let heading_path = blocks
        .first()
        .map(|block| block.heading_path.clone())
        .unwrap_or_default();
    let content_markdown = blocks
        .iter()
        .map(|block| block.content_markdown.trim())
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let content_text = blocks
        .iter()
        .map(|block| block.content_text.trim())
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let char_count = unicode_len(&content_text);
    let heading_path_json = serde_json::to_string(&heading_path)?;
    let content_hash = stable_hash(&format!(
        "{heading_path_json}\0{}\0{}",
        normalize_hash_text(&content_markdown),
        normalize_hash_text(&content_text)
    ));
    Ok(ChunkDraft {
        heading_path,
        content_markdown,
        content_text,
        content_hash,
        char_count,
        estimated_tokens: char_count.div_ceil(ESTIMATED_CHARS_PER_TOKEN),
    })
}

fn extract_markdown_blocks(markdown: &str) -> Vec<MarkdownBlock> {
    if markdown.trim().is_empty() {
        return Vec::new();
    }
    let custom_ranges = custom_container_ranges(markdown);
    let mut blocks = Vec::new();
    let mut active: Option<ActiveBlock> = None;
    let mut heading_path = Vec::<String>::new();
    let parser = Parser::new_ext(markdown, markdown_options()).into_offset_iter();

    for (event, range) in parser {
        if custom_ranges
            .iter()
            .any(|(start, end)| range.start >= *start && range.start < *end)
        {
            continue;
        }
        match &event {
            Event::Start(tag) => {
                if let Some(current) = active.as_mut() {
                    current.depth += 1;
                    current.end = current.end.max(range.end);
                } else {
                    let heading_level = heading_level(tag);
                    active = Some(ActiveBlock {
                        start: range.start,
                        end: range.end,
                        depth: 1,
                        heading_level,
                        heading_text: String::new(),
                        text: String::new(),
                        kind: block_kind(tag),
                    });
                }
            }
            Event::End(_) => {
                if let Some(current) = active.as_mut() {
                    current.end = current.end.max(range.end);
                    current.depth = current.depth.saturating_sub(1);
                    if current.depth == 0 {
                        let completed = active.take().expect("active Markdown block");
                        push_completed_block(markdown, completed, &mut heading_path, &mut blocks);
                    }
                }
            }
            Event::Rule => {}
            _ => {
                if let Some(current) = active.as_mut() {
                    current.end = current.end.max(range.end);
                    append_event_text(&event, &mut current.text);
                    if current.heading_level.is_some() {
                        append_event_text(&event, &mut current.heading_text);
                    }
                }
            }
        }
    }
    if let Some(completed) = active.take() {
        push_completed_block(markdown, completed, &mut heading_path, &mut blocks);
    }

    for (start, end) in custom_ranges {
        let content_markdown = markdown[start..end].trim().to_string();
        let content_text = custom_container_text(&content_markdown);
        if !content_text.trim().is_empty() {
            blocks.push(MarkdownBlock {
                start,
                end,
                heading_path: heading_path_at_offset(&blocks, start),
                content_markdown,
                content_text,
                kind: BlockKind::CustomContainer,
            });
        }
    }
    blocks.sort_by_key(|block| block.start);
    blocks
}

fn push_completed_block(
    markdown: &str,
    completed: ActiveBlock,
    heading_path: &mut Vec<String>,
    blocks: &mut Vec<MarkdownBlock>,
) {
    let start = completed.start.min(markdown.len());
    let end = completed.end.min(markdown.len()).max(start);
    let content_markdown = markdown[start..end].trim().to_string();
    let content_text = if completed.kind == BlockKind::Table {
        table_visible_text(&content_markdown)
    } else {
        completed.text.trim().to_string()
    };
    if content_markdown.is_empty() || content_text.is_empty() {
        return;
    }
    if let Some(level) = completed.heading_level {
        heading_path.truncate(level.saturating_sub(1));
        while heading_path.len() < level.saturating_sub(1) {
            heading_path.push(String::new());
        }
        heading_path.push(completed.heading_text.trim().to_string());
    }
    blocks.push(MarkdownBlock {
        start,
        end,
        heading_path: heading_path
            .iter()
            .filter(|part| !part.is_empty())
            .cloned()
            .collect(),
        content_markdown,
        content_text,
        kind: completed.kind,
    });
}

fn split_oversized_block(block: MarkdownBlock) -> Vec<MarkdownBlock> {
    if unicode_len(&block.content_markdown) <= CHUNK_HARD_MAX_CHARS {
        return vec![block];
    }
    match block.kind {
        BlockKind::Code => split_code_block(block),
        BlockKind::Table => split_table_block(block),
        _ => split_generic_block(block),
    }
}

fn split_code_block(block: MarkdownBlock) -> Vec<MarkdownBlock> {
    let lines = block.content_markdown.lines().collect::<Vec<_>>();
    if lines.len() < 3 {
        return split_generic_block(block);
    }
    let opening = lines[0];
    let closing = lines[lines.len() - 1];
    let body = &lines[1..lines.len() - 1];
    let body_limit =
        CHUNK_HARD_MAX_CHARS.saturating_sub(unicode_len(opening) + unicode_len(closing) + 2);
    let groups = group_lines(body, body_limit.max(200));
    groups
        .into_iter()
        .map(|group| {
            let content_text = group.join("\n");
            MarkdownBlock {
                content_markdown: format!("{opening}\n{content_text}\n{closing}"),
                content_text,
                ..block.clone()
            }
        })
        .collect()
}

fn split_table_block(block: MarkdownBlock) -> Vec<MarkdownBlock> {
    let lines = block.content_markdown.lines().collect::<Vec<_>>();
    if lines.len() < 3 {
        return split_generic_block(block);
    }
    let header = lines[0];
    let separator = lines[1];
    let rows = &lines[2..];
    let row_limit = CHUNK_HARD_MAX_CHARS
        .saturating_sub(unicode_len(header) + unicode_len(separator) + 2)
        .max(200);
    group_lines(rows, row_limit)
        .into_iter()
        .enumerate()
        .map(|(index, group)| {
            let rows_markdown = group.join("\n");
            let content_markdown = format!("{header}\n{separator}\n{rows_markdown}");
            let content_text = if index == 0 {
                table_visible_text(&content_markdown)
            } else {
                table_visible_text(&rows_markdown)
            };
            MarkdownBlock {
                content_markdown,
                content_text,
                ..block.clone()
            }
        })
        .collect()
}

fn split_generic_block(block: MarkdownBlock) -> Vec<MarkdownBlock> {
    let markdown_parts = split_text_prefer_sentences(&block.content_markdown, CHUNK_HARD_MAX_CHARS);
    let text_parts = split_text_prefer_sentences(&block.content_text, CHUNK_HARD_MAX_CHARS);
    let part_count = markdown_parts.len().max(text_parts.len());
    (0..part_count)
        .filter_map(|index| {
            let content_markdown = markdown_parts.get(index).cloned().unwrap_or_default();
            let content_text = text_parts.get(index).cloned().unwrap_or_default();
            (!content_markdown.trim().is_empty() || !content_text.trim().is_empty()).then(|| {
                MarkdownBlock {
                    content_markdown,
                    content_text,
                    ..block.clone()
                }
            })
        })
        .collect()
}

fn split_text_prefer_sentences(value: &str, max_chars: usize) -> Vec<String> {
    if unicode_len(value) <= max_chars {
        return vec![value.to_string()];
    }
    let chars = value.chars().collect::<Vec<_>>();
    let mut result = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let limit = (start + max_chars).min(chars.len());
        let mut end = limit;
        if limit < chars.len() {
            let lower = start + max_chars.saturating_mul(3) / 5;
            if let Some(position) = (lower..limit).rev().find(|position| {
                matches!(
                    chars[*position],
                    '.' | '!' | '?' | '。' | '！' | '？' | '\n'
                )
            }) {
                end = position + 1;
            } else if let Some(position) = (lower..limit)
                .rev()
                .find(|position| chars[*position].is_whitespace())
            {
                end = position + 1;
            }
        }
        result.push(
            chars[start..end]
                .iter()
                .collect::<String>()
                .trim()
                .to_string(),
        );
        start = end;
    }
    result.into_iter().filter(|part| !part.is_empty()).collect()
}

fn group_lines<'a>(lines: &'a [&'a str], max_chars: usize) -> Vec<Vec<&'a str>> {
    let mut groups = Vec::new();
    let mut current = Vec::new();
    let mut current_chars = 0;
    for line in lines {
        let line_chars = unicode_len(line) + usize::from(!current.is_empty());
        if !current.is_empty() && current_chars + line_chars > max_chars {
            groups.push(current);
            current = Vec::new();
            current_chars = 0;
        }
        current.push(*line);
        current_chars += line_chars;
    }
    if !current.is_empty() {
        groups.push(current);
    }
    groups
}

fn custom_container_ranges(markdown: &str) -> Vec<(usize, usize)> {
    let mut lines = Vec::<(usize, usize, &str)>::new();
    let mut offset = 0;
    for line in markdown.split_inclusive('\n') {
        let end = offset + line.len();
        lines.push((offset, end, line.trim_end_matches(['\r', '\n'])));
        offset = end;
    }
    if offset < markdown.len() {
        lines.push((offset, markdown.len(), &markdown[offset..]));
    }
    let mut ranges = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let marker = lines[index].2.trim();
        if is_custom_container_start(marker) {
            if let Some(close_offset) = lines[index + 1..]
                .iter()
                .position(|line| line.2.trim() == ":::")
            {
                let close_index = index + 1 + close_offset;
                ranges.push((lines[index].0, lines[close_index].1));
                index = close_index + 1;
                continue;
            }
        }
        index += 1;
    }
    ranges
}

fn is_custom_container_start(marker: &str) -> bool {
    [
        ":::info",
        ":::tip",
        ":::warning",
        ":::important",
        ":::details",
    ]
    .iter()
    .any(|prefix| marker == *prefix || marker.starts_with(&format!("{prefix} ")))
}

fn custom_container_text(markdown: &str) -> String {
    let mut lines = markdown.lines();
    let opening = lines.next().unwrap_or_default().trim();
    let mut body = lines.collect::<Vec<_>>();
    if body.last().is_some_and(|line| line.trim() == ":::") {
        body.pop();
    }
    let summary = opening
        .strip_prefix(":::details")
        .unwrap_or_default()
        .trim();
    let body_text = visible_text(&body.join("\n"));
    [summary, body_text.as_str()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn heading_path_at_offset(blocks: &[MarkdownBlock], offset: usize) -> Vec<String> {
    blocks
        .iter()
        .rfind(|block| block.end <= offset)
        .map(|block| block.heading_path.clone())
        .unwrap_or_default()
}

fn visible_text(markdown: &str) -> String {
    let mut result = String::new();
    for event in Parser::new_ext(markdown, markdown_options()) {
        append_event_text(&event, &mut result);
    }
    result.trim().to_string()
}

fn table_visible_text(markdown: &str) -> String {
    markdown
        .lines()
        .filter_map(|line| {
            let cells = line
                .trim()
                .trim_matches('|')
                .split('|')
                .map(str::trim)
                .collect::<Vec<_>>();
            let is_separator = !cells.is_empty()
                && cells.iter().all(|cell| {
                    !cell.is_empty()
                        && cell
                            .chars()
                            .all(|character| matches!(character, '-' | ':' | ' '))
                });
            (!is_separator).then(|| cells.join(" "))
        })
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn append_event_text(event: &Event<'_>, output: &mut String) {
    match event {
        Event::Text(text)
        | Event::Code(text)
        | Event::InlineMath(text)
        | Event::DisplayMath(text) => output.push_str(text),
        Event::Html(html) | Event::InlineHtml(html) => output.push_str(&html_visible_text(html)),
        Event::SoftBreak | Event::HardBreak => output.push('\n'),
        Event::TaskListMarker(checked) => output.push_str(if *checked { "[x] " } else { "[ ] " }),
        Event::FootnoteReference(reference) => output.push_str(reference),
        _ => {}
    }
}

fn html_visible_text(html: &str) -> String {
    let mut result = String::new();
    let mut inside_tag = false;
    for character in html.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => result.push(character),
            _ => {}
        }
    }
    result
}

fn markdown_options() -> Options {
    Options::ENABLE_TABLES
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
}

fn heading_level(tag: &Tag<'_>) -> Option<usize> {
    match tag {
        Tag::Heading { level, .. } => Some(match level {
            HeadingLevel::H1 => 1,
            HeadingLevel::H2 => 2,
            HeadingLevel::H3 => 3,
            HeadingLevel::H4 => 4,
            HeadingLevel::H5 => 5,
            HeadingLevel::H6 => 6,
        }),
        _ => None,
    }
}

fn block_kind(tag: &Tag<'_>) -> BlockKind {
    match tag {
        Tag::Heading { .. } => BlockKind::Heading,
        Tag::CodeBlock(_) => BlockKind::Code,
        Tag::Table(_) => BlockKind::Table,
        _ => BlockKind::Other,
    }
}

fn effective_markdown<'a>(content_markdown: &'a str, plain_text: &'a str) -> &'a str {
    if content_markdown.trim().is_empty() && !plain_text.trim().is_empty() {
        plain_text
    } else {
        content_markdown
    }
}

fn source_hash(markdown: &str) -> String {
    stable_hash(&format!(
        "chunker:{CHUNKER_VERSION}\0{}",
        normalize_hash_text(markdown)
    ))
}

fn deterministic_chunk_id(
    note_id: &str,
    content_hash: &str,
    heading_path_json: &str,
    occurrence: usize,
) -> String {
    format!(
        "chunk-{}",
        stable_hash(&format!(
            "{note_id}\0{content_hash}\0{heading_path_json}\0{occurrence}"
        ))
    )
}

fn stable_hash(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn normalize_line_endings(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn normalize_hash_text(value: &str) -> String {
    normalize_line_endings(value).trim_end().to_string()
}

fn normalize_guard_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn unicode_len(value: &str) -> usize {
    value.chars().count()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schema_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory database");
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE notes (
                id TEXT PRIMARY KEY,
                content_markdown TEXT NOT NULL DEFAULT '',
                plain_text TEXT NOT NULL DEFAULT '',
                deleted_at TEXT
             );",
        )
        .expect("notes schema");
        conn.execute_batch(KNOWLEDGE_MIGRATION_SQL)
            .expect("knowledge schema");
        conn.execute_batch(KNOWLEDGE_METADATA_MIGRATION_SQL)
            .expect("knowledge metadata schema");
        conn
    }

    fn insert_note(conn: &Connection, id: &str, markdown: &str) {
        conn.execute(
            "INSERT INTO notes (id, content_markdown, plain_text) VALUES (?1, ?2, ?3)",
            params![id, markdown, visible_text(markdown)],
        )
        .expect("insert note");
    }

    #[test]
    fn migration_creates_chunk_tables_and_indexes() {
        let conn = schema_connection();
        for object in [
            "knowledge_chunks",
            "knowledge_chunk_state",
            "knowledge_index_metadata",
            "idx_knowledge_chunks_note_id",
            "idx_knowledge_chunks_content_hash",
            "idx_knowledge_chunks_updated_at",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE name = ?1",
                    params![object],
                    |row| row.get(0),
                )
                .expect("schema object count");
            assert_eq!(count, 1, "missing {object}");
        }
    }

    #[test]
    fn empty_note_is_current_without_chunks() {
        let mut conn = schema_connection();
        insert_note(&conn, "empty", "");
        assert_eq!(sync_note(&mut conn, "empty").expect("sync empty"), 0);
        let state = get_state(&conn, "empty")
            .expect("state")
            .expect("state exists");
        assert_eq!(state.status, "current");
        assert_eq!(state.chunk_count, 0);
    }

    #[test]
    fn headings_preserve_hierarchy_for_russian_english_and_emoji() {
        let chunks = chunk_markdown(
            "# Проект 🚀\n\nВведение.\n\n## Architecture\n\nDetails.\n\n### Хранилище\n\nSQLite.",
        )
        .expect("chunks");
        assert_eq!(chunks[0].heading_path, vec!["Проект 🚀"]);
        assert_eq!(chunks[1].heading_path, vec!["Проект 🚀", "Architecture"]);
        assert_eq!(
            chunks[2].heading_path,
            vec!["Проект 🚀", "Architecture", "Хранилище"]
        );
    }

    #[test]
    fn structured_markdown_keeps_lists_tasks_quotes_tables_and_formulas() {
        let markdown = "# Данные\n\n- пункт\n- [x] готово\n\n> цитата\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n$$E = mc^2$$";
        let chunks = chunk_markdown(markdown).expect("structured chunks");
        let text = chunks
            .iter()
            .map(|chunk| chunk.content_text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        for expected in ["пункт", "готово", "цитата", "A", "B", "1", "2", "E = mc^2"]
        {
            assert!(text.contains(expected), "missing {expected}");
        }
    }

    #[test]
    fn callout_and_details_remain_atomic_when_small() {
        let chunks = chunk_markdown(
            ":::warning\nВажный текст\n:::\n\n:::details Подробнее\nСкрытый текст\n:::",
        )
        .expect("custom chunks");
        let combined = chunks
            .iter()
            .map(|chunk| chunk.content_text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        assert!(combined.contains("Важный текст"));
        assert!(combined.contains("Подробнее"));
        assert!(combined.contains("Скрытый текст"));
        assert!(!combined.contains(":::"));
    }

    #[test]
    fn image_alt_and_attachment_name_are_indexed_without_local_path() {
        let chunks = chunk_markdown(
            "![Схема](C:\\Users\\person\\secret.png)\n\n[file:brief.pdf](noteflow-file://attachment-1)",
        )
        .expect("media chunks");
        let text = chunks
            .iter()
            .map(|chunk| chunk.content_text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        assert!(text.contains("Схема"));
        assert!(text.contains("file:brief.pdf"));
        assert!(!text.contains("C:\\Users"));
        assert!(!text.contains("noteflow-file://"));
    }

    #[test]
    fn oversized_paragraph_code_and_table_split_without_losing_content() {
        let paragraph = (0..900)
            .map(|index| format!("Предложение {index}. "))
            .collect::<String>();
        let code = (0..800)
            .map(|index| format!("let value_{index} = {index};\n"))
            .collect::<String>();
        let table = (0..700)
            .map(|index| format!("| row-{index} | value-{index} |\n"))
            .collect::<String>();
        let markdown = format!(
            "# Large\n\n{paragraph}\n\n```rust\n{code}```\n\n| Key | Value |\n|---|---|\n{table}"
        );
        let chunks = chunk_markdown(&markdown).expect("oversized chunks");
        assert!(chunks.len() > 3);
        assert!(chunks
            .iter()
            .all(|chunk| unicode_len(&chunk.content_markdown) <= CHUNK_HARD_MAX_CHARS + 80));
        let text = chunks
            .iter()
            .map(|chunk| chunk.content_text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        assert!(text.contains("Предложение 899"));
        assert!(text.contains("value_799"));
        assert!(text.contains("row-699"));
    }

    #[test]
    fn hashes_are_deterministic_and_normalize_line_endings() {
        let lf = chunk_markdown("# Title\n\nText").expect("lf chunks");
        let crlf = chunk_markdown("# Title\r\n\r\nText").expect("crlf chunks");
        assert_eq!(lf, crlf);
        assert_eq!(
            source_hash("# Title\n\nText"),
            source_hash("# Title\r\n\r\nText")
        );
    }

    #[test]
    fn unchanged_note_is_not_rewritten_and_chunk_ids_survive_insert_before_it() {
        let mut conn = schema_connection();
        insert_note(&conn, "note", "# A\n\nAlpha\n\n# B\n\nBeta");
        sync_note(&mut conn, "note").expect("first sync");
        let initial = get_chunks_by_note_id(&conn, "note").expect("initial chunks");
        let initial_updated_at = initial[0].updated_at.clone();
        sync_note(&mut conn, "note").expect("unchanged sync");
        let unchanged = get_chunks_by_note_id(&conn, "note").expect("unchanged chunks");
        assert_eq!(unchanged[0].updated_at, initial_updated_at);

        conn.execute(
            "UPDATE notes SET content_markdown = '# Intro\n\nNew\n\n# A\n\nAlpha\n\n# B\n\nBeta' WHERE id = 'note'",
            [],
        )
        .expect("change note");
        sync_note(&mut conn, "note").expect("changed sync");
        let changed = get_chunks_by_note_id(&conn, "note").expect("changed chunks");
        for old in initial {
            assert!(changed.iter().any(|chunk| chunk.id == old.id));
        }
    }

    #[test]
    fn reconcile_updates_only_stale_notes_and_rebuild_restores_all() {
        let mut conn = schema_connection();
        insert_note(&conn, "one", "One");
        insert_note(&conn, "two", "Two");
        let first = reconcile(&mut conn).expect("initial reconcile");
        assert_eq!(first.processed_notes, 2);
        let no_changes = reconcile(&mut conn).expect("unchanged reconcile");
        assert_eq!(no_changes.processed_notes, 0);
        conn.execute(
            "UPDATE notes SET content_markdown = 'Two changed' WHERE id = 'two'",
            [],
        )
        .expect("change second note");
        let one_change = reconcile(&mut conn).expect("changed reconcile");
        assert_eq!(one_change.processed_notes, 1);
        let rebuilt = rebuild(&mut conn).expect("rebuild");
        assert_eq!(rebuilt.processed_notes, 2);
        assert_eq!(index_status(&conn).expect("status").indexed_notes, 2);
    }

    #[test]
    fn unchanged_reconcile_updates_last_checked_without_changing_last_indexed() {
        let mut conn = schema_connection();
        insert_note(&conn, "note", "Knowledge content");
        reconcile(&mut conn).expect("initial reconcile");
        let initial = index_status(&conn).expect("initial status");
        let initial_checked = initial.last_checked_at.expect("initial checked timestamp");
        let initial_indexed = initial.last_indexed_at.expect("initial indexed timestamp");

        std::thread::sleep(std::time::Duration::from_millis(2));
        let unchanged = reconcile(&mut conn).expect("unchanged reconcile");
        let current = index_status(&conn).expect("current status");

        assert_eq!(unchanged.processed_notes, 0);
        assert!(current.last_checked_at.expect("updated checked timestamp") > initial_checked);
        assert_eq!(
            current.last_indexed_at.as_deref(),
            Some(initial_indexed.as_str())
        );
    }

    #[test]
    fn cascade_and_soft_delete_remove_derived_rows() {
        let mut conn = schema_connection();
        insert_note(&conn, "note", "Text");
        sync_note(&mut conn, "note").expect("sync");
        conn.execute("DELETE FROM notes WHERE id = 'note'", [])
            .expect("delete note");
        assert!(get_chunks_by_note_id(&conn, "note")
            .expect("chunks")
            .is_empty());
        assert!(get_state(&conn, "note").expect("state").is_none());
    }

    #[test]
    fn neighbors_and_note_id_batch_are_ordered() {
        let mut conn = schema_connection();
        insert_note(&conn, "note", "# A\n\nAlpha\n\n# B\n\nBeta\n\n# C\n\nGamma");
        sync_note(&mut conn, "note").expect("sync");
        let chunks = get_chunks_by_note_id(&conn, "note").expect("chunks");
        let neighbors = get_neighbor_chunks(
            &conn,
            &KnowledgeChunkNeighborsRequest {
                chunk_id: chunks[1].id.clone(),
                radius: 1,
            },
        )
        .expect("neighbors");
        assert_eq!(neighbors.len(), 3);
        let batch = get_chunks_by_note_ids(
            &conn,
            &KnowledgeChunksByNoteIdsRequest {
                note_ids: vec!["note".to_string()],
            },
        )
        .expect("batch");
        assert_eq!(batch.len(), chunks.len());
    }

    #[test]
    fn failure_state_contains_only_safe_error_code() {
        let conn = schema_connection();
        insert_note(&conn, "note", "secret note body");
        mark_failed(&conn, "note", "secret note body").expect("mark failed");
        let state = get_state(&conn, "note")
            .expect("state")
            .expect("state exists");
        assert_eq!(state.last_error_code.as_deref(), Some("chunking_failed"));
        assert!(!format!("{state:?}").contains("secret note body"));
    }

    #[test]
    fn profiles_knowledge_index_for_one_and_ten_thousand_notes() {
        for note_count in [1_000_usize, 10_000_usize] {
            let mut conn = schema_connection();
            let transaction = conn.transaction().expect("performance insert transaction");
            {
                let mut statement = transaction
                    .prepare(
                        "INSERT INTO notes (id, content_markdown, plain_text) VALUES (?1, ?2, ?3)",
                    )
                    .expect("performance insert statement");
                for index in 0..note_count {
                    let markdown = format!(
                        "# Заметка {index}\n\nКороткий индексируемый текст номер {index}.\n\n- пункт\n- [ ] задача"
                    );
                    statement
                        .execute(params![
                            format!("note-{index:05}"),
                            markdown,
                            format!("Заметка {index} текст")
                        ])
                        .expect("insert performance note");
                }
            }
            transaction.commit().expect("commit performance notes");

            let rebuild_result = rebuild(&mut conn).expect("performance rebuild");
            let reconcile_started = Instant::now();
            let reconcile_result = reconcile(&mut conn).expect("performance reconcile");
            let reconcile_ms = reconcile_started.elapsed().as_millis();

            let short_started = Instant::now();
            conn.execute(
                "UPDATE notes SET content_markdown = '# Изменено\n\nКороткий текст' WHERE id = 'note-00000'",
                [],
            )
            .expect("update short note");
            sync_note(&mut conn, "note-00000").expect("sync short note");
            let short_ms = short_started.elapsed().as_millis();

            let long_markdown = format!("# Длинная\n\n{}", "Большое предложение. ".repeat(1_000));
            let long_started = Instant::now();
            conn.execute(
                "UPDATE notes SET content_markdown = ?1 WHERE id = 'note-00001'",
                params![long_markdown],
            )
            .expect("update long note");
            sync_note(&mut conn, "note-00001").expect("sync long note");
            let long_ms = long_started.elapsed().as_millis();

            let status_started = Instant::now();
            let status = index_status(&conn).expect("performance status");
            let status_ms = status_started.elapsed().as_millis();
            println!(
                "knowledge-performance notes={note_count} rebuild_ms={} reconcile_ms={reconcile_ms} short_sync_ms={short_ms} long_sync_ms={long_ms} status_ms={status_ms} chunks={}",
                rebuild_result.duration_ms,
                status.chunk_count
            );
            assert_eq!(rebuild_result.processed_notes, note_count as i64);
            assert_eq!(reconcile_result.processed_notes, 0);
            assert_eq!(status.indexed_notes, note_count as i64);
        }
    }
}
