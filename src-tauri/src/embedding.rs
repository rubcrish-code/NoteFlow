use crate::{
    data::{DataError, DataResult},
    knowledge,
    llm::{self, HttpClient, HttpRequest, SecretStorage},
    provider_url::{is_local_destination, normalize_provider_url, ProviderLocality},
};
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
use uuid::Uuid;

pub const EMBEDDING_PIPELINE_VERSION: i64 = 1;
const MAX_BATCH_SIZE: i64 = 128;
const RRF_K: f64 = 60.0;

pub const EMBEDDING_MIGRATION_SQL: &str = r#"
    CREATE TABLE IF NOT EXISTS embedding_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        base_url TEXT NOT NULL,
        embeddings_endpoint TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER,
        batch_size INTEGER NOT NULL,
        timeout_seconds INTEGER NOT NULL,
        locality TEXT NOT NULL,
        api_key_ref TEXT,
        cloud_consent_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        pipeline_version INTEGER NOT NULL DEFAULT 1,
        last_status TEXT NOT NULL DEFAULT 'not_configured',
        last_checked_at TEXT,
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
        chunk_id TEXT NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES embedding_profiles(id) ON DELETE CASCADE,
        chunk_content_hash TEXT NOT NULL,
        vector_blob BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        vector_norm REAL NOT NULL,
        pipeline_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (chunk_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS embedding_chunk_failures (
        chunk_id TEXT NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES embedding_profiles(id) ON DELETE CASCADE,
        chunk_content_hash TEXT NOT NULL,
        error_code TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (chunk_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS embedding_index_state (
        profile_id TEXT PRIMARY KEY REFERENCES embedding_profiles(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        total_chunks INTEGER NOT NULL DEFAULT 0,
        indexed_chunks INTEGER NOT NULL DEFAULT 0,
        pending_chunks INTEGER NOT NULL DEFAULT 0,
        failed_chunks INTEGER NOT NULL DEFAULT 0,
        last_checked_at TEXT,
        last_indexed_at TEXT,
        last_error_code TEXT,
        updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_profile_id
        ON knowledge_chunk_embeddings(profile_id);
    CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_content_hash
        ON knowledge_chunk_embeddings(chunk_content_hash);
    CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_updated_at
        ON knowledge_chunk_embeddings(updated_at);
    CREATE INDEX IF NOT EXISTS idx_embedding_failures_profile_id
        ON embedding_chunk_failures(profile_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
        chunk_id UNINDEXED,
        note_id UNINDEXED,
        heading_path,
        content_text,
        tokenize = 'unicode61 remove_diacritics 2',
        prefix = '2 3 4'
    );

    INSERT INTO knowledge_chunks_fts (chunk_id, note_id, heading_path, content_text)
    SELECT k.id, k.note_id, k.heading_path_json, k.content_text
    FROM knowledge_chunks k
    WHERE NOT EXISTS (
        SELECT 1 FROM knowledge_chunks_fts f WHERE f.chunk_id = k.id
    );

    CREATE TRIGGER IF NOT EXISTS knowledge_chunks_embedding_ai
    AFTER INSERT ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts (chunk_id, note_id, heading_path, content_text)
        VALUES (new.id, new.note_id, new.heading_path_json, new.content_text);
    END;

    CREATE TRIGGER IF NOT EXISTS knowledge_chunks_embedding_ad
    AFTER DELETE ON knowledge_chunks BEGIN
        DELETE FROM knowledge_chunks_fts WHERE chunk_id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS knowledge_chunks_embedding_au
    AFTER UPDATE OF note_id, heading_path_json, content_text, content_hash ON knowledge_chunks BEGIN
        DELETE FROM knowledge_chunks_fts WHERE chunk_id = old.id;
        INSERT INTO knowledge_chunks_fts (chunk_id, note_id, heading_path, content_text)
        VALUES (new.id, new.note_id, new.heading_path_json, new.content_text);
        DELETE FROM knowledge_chunk_embeddings
        WHERE chunk_id = new.id AND chunk_content_hash <> new.content_hash;
        DELETE FROM embedding_chunk_failures
        WHERE chunk_id = new.id AND chunk_content_hash <> new.content_hash;
    END;
"#;

#[derive(Clone, Debug)]
pub struct EmbeddingProfileRecord {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub embeddings_endpoint: String,
    pub model: String,
    pub dimensions: Option<i64>,
    pub batch_size: i64,
    pub timeout_seconds: i64,
    pub locality: String,
    pub api_key_ref: Option<String>,
    pub cloud_consent_at: Option<String>,
    pub enabled: bool,
    pub pipeline_version: i64,
    pub last_status: String,
    pub last_checked_at: Option<String>,
    pub last_error_code: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingProfileDto {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub embeddings_endpoint: String,
    pub model: String,
    pub dimensions: Option<i64>,
    pub batch_size: i64,
    pub timeout_seconds: i64,
    pub locality: String,
    pub has_api_key: bool,
    pub has_cloud_consent: bool,
    pub enabled: bool,
    pub last_status: String,
    pub last_checked_at: Option<String>,
    pub last_error_code: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEmbeddingProfileRequest {
    pub id: Option<String>,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub embeddings_endpoint: String,
    pub model: String,
    pub batch_size: i64,
    pub timeout_seconds: i64,
    pub locality: String,
    pub api_key: Option<String>,
    #[serde(default)]
    pub delete_api_key: bool,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingProviderTestResultDto {
    pub status: String,
    pub message: String,
    pub model: String,
    pub dimensions: Option<i64>,
    pub locality: String,
    pub checked_at: String,
    pub error_code: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingModelListRequest {
    pub profile_id: Option<String>,
    pub provider_type: String,
    pub base_url: String,
    pub timeout_seconds: i64,
    pub api_key: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingModelListResultDto {
    pub status: String,
    pub models: Vec<String>,
    pub options: Vec<llm::ModelDiscoveryOptionDto>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingIndexStatusDto {
    pub profile_id: String,
    pub status: String,
    pub total_chunks: i64,
    pub indexed_chunks: i64,
    pub pending_chunks: i64,
    pub failed_chunks: i64,
    pub last_checked_at: Option<String>,
    pub last_indexed_at: Option<String>,
    pub last_error_code: Option<String>,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingIndexUpdateResultDto {
    pub profile_id: String,
    pub status: String,
    pub processed_chunks: i64,
    pub indexed_chunks: i64,
    pub failed_chunks: i64,
    pub skipped_chunks: i64,
    pub cancelled: bool,
    pub duration_ms: u128,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSearchRequest {
    pub query: String,
    pub profile_id: String,
    pub project_id: Option<String>,
    pub tag_id: Option<String>,
    #[serde(default)]
    pub include_archived: bool,
    #[serde(default)]
    pub favorites_only: bool,
    #[serde(default = "default_search_limit")]
    pub limit: i64,
    #[serde(default = "default_candidate_limit")]
    pub candidate_limit: i64,
    #[serde(default = "default_per_note_limit")]
    pub per_note_limit: i64,
    #[serde(default)]
    pub include_neighbors: bool,
}

fn default_search_limit() -> i64 {
    30
}

fn default_candidate_limit() -> i64 {
    100
}

fn default_per_note_limit() -> i64 {
    3
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSearchTagDto {
    pub id: String,
    pub name: String,
    pub color: String,
    pub custom_color: Option<String>,
    pub icon_key: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSearchResultDto {
    pub chunk_id: String,
    pub note_id: String,
    pub note_title: String,
    pub heading_path: Vec<String>,
    pub snippet: String,
    pub project: String,
    pub project_id: Option<String>,
    pub tags: Vec<SemanticSearchTagDto>,
    pub archived: bool,
    pub favorite: bool,
    pub updated_at: String,
    pub semantic_score: Option<f64>,
    pub match_type: String,
    pub neighboring_chunk_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EmbeddingProfileBackup {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub embeddings_endpoint: String,
    pub model: String,
    pub dimensions: Option<i64>,
    pub batch_size: i64,
    pub timeout_seconds: i64,
    pub locality: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
struct PendingChunk {
    id: String,
    content_hash: String,
    content_text: String,
}

#[derive(Clone, Debug)]
struct SearchCandidate {
    chunk_id: String,
    note_id: String,
    note_title: String,
    heading_path: Vec<String>,
    content_text: String,
    project: String,
    project_id: Option<String>,
    archived: bool,
    favorite: bool,
    updated_at: String,
    semantic_score: Option<f64>,
    exact_title: bool,
}

#[derive(Clone, Debug)]
struct ProviderFailure {
    code: &'static str,
    message: String,
    retryable: bool,
}

impl ProviderFailure {
    fn into_data_error(self) -> DataError {
        DataError::InvalidInput(self.message)
    }
}

pub fn list_profiles<S: SecretStorage>(
    conn: &Connection,
    storage: &S,
) -> DataResult<Vec<EmbeddingProfileDto>> {
    let mut statement = conn.prepare(
        "SELECT id, name, provider_type, base_url, embeddings_endpoint, model, dimensions,
                batch_size, timeout_seconds, locality, api_key_ref, cloud_consent_at, enabled,
                pipeline_version, last_status, last_checked_at, last_error_code, created_at, updated_at
         FROM embedding_profiles ORDER BY enabled DESC, updated_at DESC",
    )?;
    let rows = statement.query_map([], profile_from_row)?;
    rows.map(|row| {
        row.map_err(DataError::from)
            .and_then(|profile| profile_to_dto(profile, storage))
    })
    .collect()
}

pub fn get_profile(conn: &Connection, profile_id: &str) -> DataResult<EmbeddingProfileRecord> {
    conn.query_row(
        "SELECT id, name, provider_type, base_url, embeddings_endpoint, model, dimensions,
                batch_size, timeout_seconds, locality, api_key_ref, cloud_consent_at, enabled,
                pipeline_version, last_status, last_checked_at, last_error_code, created_at, updated_at
         FROM embedding_profiles WHERE id = ?1",
        params![profile_id],
        profile_from_row,
    )
    .optional()?
    .ok_or_else(|| DataError::NotFound("Настройки смыслового поиска (RAG) не найдены".to_string()))
}

pub fn save_profile<S: SecretStorage>(
    conn: &mut Connection,
    storage: &S,
    request: SaveEmbeddingProfileRequest,
) -> DataResult<EmbeddingProfileDto> {
    let normalized = normalize_profile_request(request)?;
    let profile_id = normalized
        .id
        .clone()
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing = get_profile(conn, &profile_id).ok();
    let mut api_key_ref = existing
        .as_ref()
        .and_then(|profile| profile.api_key_ref.clone());
    let key = normalized.api_key.as_deref().unwrap_or_default().trim();

    if normalized.delete_api_key {
        if let Some(secret_ref) = &api_key_ref {
            storage.delete_secret(secret_ref)?;
        }
        api_key_ref = None;
    } else if !key.is_empty() {
        let secret_ref = api_key_ref
            .clone()
            .unwrap_or_else(|| format!("noteflow.embedding.{profile_id}.api_key"));
        storage.set_secret(&secret_ref, key)?;
        api_key_ref = Some(secret_ref);
    }

    let now = now_iso();
    let created_at = existing
        .as_ref()
        .map(|profile| profile.created_at.clone())
        .unwrap_or_else(|| now.clone());
    let provider_changed = existing.as_ref().is_some_and(|profile| {
        profile.provider_type != normalized.provider_type
            || profile.base_url != normalized.base_url
            || profile.embeddings_endpoint != normalized.embeddings_endpoint
            || profile.model != normalized.model
            || profile.locality != normalized.locality
            || profile.pipeline_version != EMBEDDING_PIPELINE_VERSION
    });
    let consent = existing.as_ref().and_then(|profile| {
        (!provider_changed && normalized.locality == "cloud")
            .then(|| profile.cloud_consent_at.clone())
            .flatten()
    });
    let dimensions = existing
        .as_ref()
        .and_then(|profile| (!provider_changed).then_some(profile.dimensions).flatten());

    let transaction = conn.transaction()?;
    transaction.execute(
        "INSERT INTO embedding_profiles (
            id, name, provider_type, base_url, embeddings_endpoint, model, dimensions,
            batch_size, timeout_seconds, locality, api_key_ref, cloud_consent_at, enabled,
            pipeline_version, last_status, last_checked_at, last_error_code, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                   'not_configured', NULL, NULL, ?15, ?16)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            provider_type = excluded.provider_type,
            base_url = excluded.base_url,
            embeddings_endpoint = excluded.embeddings_endpoint,
            model = excluded.model,
            dimensions = excluded.dimensions,
            batch_size = excluded.batch_size,
            timeout_seconds = excluded.timeout_seconds,
            locality = excluded.locality,
            api_key_ref = excluded.api_key_ref,
            cloud_consent_at = excluded.cloud_consent_at,
            enabled = excluded.enabled,
            pipeline_version = excluded.pipeline_version,
            last_status = CASE WHEN ?17 THEN 'not_configured' ELSE embedding_profiles.last_status END,
            last_checked_at = CASE WHEN ?17 THEN NULL ELSE embedding_profiles.last_checked_at END,
            last_error_code = CASE WHEN ?17 THEN NULL ELSE embedding_profiles.last_error_code END,
            updated_at = excluded.updated_at",
        params![
            profile_id,
            normalized.name,
            normalized.provider_type,
            normalized.base_url,
            normalized.embeddings_endpoint,
            normalized.model,
            dimensions,
            normalized.batch_size,
            normalized.timeout_seconds,
            normalized.locality,
            api_key_ref,
            consent,
            normalized.enabled,
            EMBEDDING_PIPELINE_VERSION,
            created_at,
            now,
            provider_changed,
        ],
    )?;
    if provider_changed {
        transaction.execute(
            "DELETE FROM knowledge_chunk_embeddings WHERE profile_id = ?1",
            params![profile_id],
        )?;
        transaction.execute(
            "DELETE FROM embedding_chunk_failures WHERE profile_id = ?1",
            params![profile_id],
        )?;
    }
    transaction.execute(
        "INSERT INTO embedding_index_state (
            profile_id, status, total_chunks, indexed_chunks, pending_chunks, failed_chunks, updated_at
         ) VALUES (?1, 'pending', 0, 0, 0, 0, ?2)
         ON CONFLICT(profile_id) DO UPDATE SET
            status = CASE WHEN ?3 THEN 'pending' ELSE embedding_index_state.status END,
            last_error_code = CASE WHEN ?3 THEN NULL ELSE embedding_index_state.last_error_code END,
            updated_at = excluded.updated_at",
        params![profile_id, now_iso(), provider_changed],
    )?;
    transaction.commit()?;
    refresh_index_state(conn, &profile_id, None)?;
    profile_to_dto(get_profile(conn, &profile_id)?, storage)
}

pub fn delete_profile<S: SecretStorage>(
    conn: &mut Connection,
    storage: &S,
    profile_id: &str,
) -> DataResult<()> {
    let profile = get_profile(conn, profile_id)?;
    if let Some(secret_ref) = profile.api_key_ref {
        storage.delete_secret(&secret_ref)?;
    }
    conn.execute(
        "DELETE FROM embedding_profiles WHERE id = ?1",
        params![profile_id],
    )?;
    Ok(())
}

pub fn grant_cloud_consent(
    conn: &Connection,
    profile_id: &str,
) -> DataResult<EmbeddingProfileRecord> {
    let profile = get_profile(conn, profile_id)?;
    if profile.locality != "cloud" {
        return Ok(profile);
    }
    conn.execute(
        "UPDATE embedding_profiles SET cloud_consent_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![now_iso(), profile_id],
    )?;
    get_profile(conn, profile_id)
}

pub fn test_profile<S: SecretStorage, H: HttpClient>(
    profile: &EmbeddingProfileRecord,
    storage: &S,
    http: &H,
) -> EmbeddingProviderTestResultDto {
    let checked_at = now_iso();
    let technical_inputs = [
        "NoteFlow semantic search connection test".to_string(),
        "Technical vector dimension check".to_string(),
    ];
    match embed_texts_with_retry(profile, storage, http, &technical_inputs) {
        Ok(vectors) => {
            let dimensions = vectors.first().map(|vector| vector.len() as i64);
            EmbeddingProviderTestResultDto {
                status: "success".to_string(),
                message: "Подключение к модели смыслового поиска (RAG) работает".to_string(),
                model: profile.model.clone(),
                dimensions,
                locality: profile.locality.clone(),
                checked_at,
                error_code: None,
            }
        }
        Err(error) => {
            let message = if matches!(
                error.code,
                "embedding_endpoint_unsupported" | "model_not_supported"
            ) {
                "Эта модель не поддерживает смысловой поиск".to_string()
            } else {
                error.message
            };
            EmbeddingProviderTestResultDto {
                status: "error".to_string(),
                message,
                model: profile.model.clone(),
                dimensions: None,
                locality: profile.locality.clone(),
                checked_at,
                error_code: Some(error.code.to_string()),
            }
        }
    }
}

pub fn list_models<H: HttpClient>(
    request: &EmbeddingModelListRequest,
    saved_api_key: Option<&str>,
    http: &H,
) -> EmbeddingModelListResultDto {
    let manual_result = || EmbeddingModelListResultDto {
        status: "manual".to_string(),
        models: Vec::new(),
        options: Vec::new(),
        message: "Не удалось получить список моделей. Укажите название вручную.".to_string(),
    };
    let provider_type = request.provider_type.trim();
    if !matches!(provider_type, "ollama" | "openai" | "custom") {
        return manual_result();
    }
    let endpoint = if provider_type == "ollama" {
        "/api/tags"
    } else {
        "/models"
    };
    let api_key = request
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or(saved_api_key);
    let options = match llm::discover_model_catalog(
        provider_type,
        &request.base_url,
        endpoint,
        api_key.map(str::to_string),
        request.timeout_seconds.clamp(5, 15) * 1_000,
        http,
    ) {
        Ok(options) => options,
        Err(_) => return manual_result(),
    };
    let models = options
        .iter()
        .map(|option| option.id.clone())
        .collect::<Vec<_>>();
    if models.is_empty() {
        return EmbeddingModelListResultDto {
            status: "success".to_string(),
            models,
            options,
            message: "Endpoint доступен, но список моделей пуст".to_string(),
        };
    }
    EmbeddingModelListResultDto {
        status: "success".to_string(),
        message: format!("Найдено моделей: {}", models.len()),
        models,
        options,
    }
}

pub fn record_test_result(
    conn: &mut Connection,
    profile_id: &str,
    result: &EmbeddingProviderTestResultDto,
) -> DataResult<()> {
    let profile = get_profile(conn, profile_id)?;
    let dimensions_changed = result.status == "success"
        && profile.dimensions.is_some()
        && profile.dimensions != result.dimensions;
    let transaction = conn.transaction()?;
    if dimensions_changed {
        transaction.execute(
            "DELETE FROM knowledge_chunk_embeddings WHERE profile_id = ?1",
            params![profile_id],
        )?;
        transaction.execute(
            "DELETE FROM embedding_chunk_failures WHERE profile_id = ?1",
            params![profile_id],
        )?;
    }
    transaction.execute(
        "UPDATE embedding_profiles
         SET dimensions = CASE WHEN ?1 = 'success' THEN ?2 ELSE dimensions END,
             last_status = ?1, last_checked_at = ?3, last_error_code = ?4, updated_at = ?3
         WHERE id = ?5",
        params![
            result.status,
            result.dimensions,
            result.checked_at,
            result.error_code,
            profile_id,
        ],
    )?;
    transaction.commit()?;
    refresh_index_state(conn, profile_id, None)?;
    Ok(())
}

pub fn get_index_status(
    conn: &mut Connection,
    profile_id: &str,
) -> DataResult<EmbeddingIndexStatusDto> {
    get_profile(conn, profile_id)?;
    refresh_index_state(conn, profile_id, None)?;
    index_state_from_db(conn, profile_id)
}

pub fn update_index<S: SecretStorage, H: HttpClient>(
    conn: &mut Connection,
    profile: &EmbeddingProfileRecord,
    storage: &S,
    http: &H,
    cancel: Arc<AtomicBool>,
    rebuild: bool,
) -> DataResult<EmbeddingIndexUpdateResultDto> {
    require_cloud_consent(profile)?;
    if !profile.enabled {
        return Err(DataError::InvalidInput(
            "Модель смыслового поиска (RAG) отключена".to_string(),
        ));
    }
    let started = Instant::now();
    if rebuild {
        let transaction = conn.transaction()?;
        transaction.execute(
            "DELETE FROM knowledge_chunk_embeddings WHERE profile_id = ?1",
            params![profile.id],
        )?;
        transaction.execute(
            "DELETE FROM embedding_chunk_failures WHERE profile_id = ?1",
            params![profile.id],
        )?;
        transaction.commit()?;
    }
    mark_indexing(conn, &profile.id)?;
    let pending = pending_chunks(conn, profile)?;
    let skipped_chunks = count_total_chunks(conn)? - pending.len() as i64;
    let mut processed_chunks = 0_i64;
    let mut indexed_chunks = 0_i64;
    let mut failed_chunks = 0_i64;
    let batch_size = profile.batch_size.clamp(1, MAX_BATCH_SIZE) as usize;

    for batch in pending.chunks(batch_size) {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let inputs = batch
            .iter()
            .map(|chunk| chunk.content_text.clone())
            .collect::<Vec<_>>();
        match embed_texts_with_retry(profile, storage, http, &inputs) {
            Ok(vectors) => {
                let now = now_iso();
                let transaction = conn.transaction()?;
                for (chunk, vector) in batch.iter().zip(vectors.iter()) {
                    let vector_norm = vector_norm(vector)?;
                    let vector_blob = serialize_vector(vector)?;
                    transaction.execute(
                        "INSERT INTO knowledge_chunk_embeddings (
                            chunk_id, profile_id, chunk_content_hash, vector_blob, dimensions,
                            vector_norm, pipeline_version, created_at, updated_at
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
                         ON CONFLICT(chunk_id, profile_id) DO UPDATE SET
                            chunk_content_hash = excluded.chunk_content_hash,
                            vector_blob = excluded.vector_blob,
                            dimensions = excluded.dimensions,
                            vector_norm = excluded.vector_norm,
                            pipeline_version = excluded.pipeline_version,
                            updated_at = excluded.updated_at",
                        params![
                            chunk.id,
                            profile.id,
                            chunk.content_hash,
                            vector_blob,
                            vector.len() as i64,
                            vector_norm,
                            EMBEDDING_PIPELINE_VERSION,
                            now,
                        ],
                    )?;
                    transaction.execute(
                        "DELETE FROM embedding_chunk_failures WHERE chunk_id = ?1 AND profile_id = ?2",
                        params![chunk.id, profile.id],
                    )?;
                }
                transaction.commit()?;
                indexed_chunks += batch.len() as i64;
            }
            Err(error) => {
                failed_chunks += batch.len() as i64;
                let now = now_iso();
                let transaction = conn.transaction()?;
                for chunk in batch {
                    transaction.execute(
                        "INSERT INTO embedding_chunk_failures (
                            chunk_id, profile_id, chunk_content_hash, error_code, updated_at
                         ) VALUES (?1, ?2, ?3, ?4, ?5)
                         ON CONFLICT(chunk_id, profile_id) DO UPDATE SET
                            chunk_content_hash = excluded.chunk_content_hash,
                            error_code = excluded.error_code,
                            updated_at = excluded.updated_at",
                        params![chunk.id, profile.id, chunk.content_hash, error.code, now],
                    )?;
                }
                transaction.commit()?;
                refresh_index_state(conn, &profile.id, Some(error.code))?;
                if !error.retryable {
                    processed_chunks += batch.len() as i64;
                    break;
                }
            }
        }
        processed_chunks += batch.len() as i64;
        refresh_index_state(conn, &profile.id, None)?;
    }

    let cancelled = cancel.load(Ordering::SeqCst);
    conn.execute(
        "UPDATE embedding_index_state SET status = 'pending', updated_at = ?1
         WHERE profile_id = ?2 AND status = 'indexing'",
        params![now_iso(), profile.id],
    )?;
    let final_status = refresh_index_state(conn, &profile.id, None)?;
    Ok(EmbeddingIndexUpdateResultDto {
        profile_id: profile.id.clone(),
        status: if cancelled && final_status.status == "indexing" {
            "partial".to_string()
        } else {
            final_status.status
        },
        processed_chunks,
        indexed_chunks,
        failed_chunks,
        skipped_chunks,
        cancelled,
        duration_ms: started.elapsed().as_millis(),
    })
}

pub fn hybrid_search<S: SecretStorage, H: HttpClient>(
    conn: &Connection,
    profile: &EmbeddingProfileRecord,
    storage: &S,
    http: &H,
    request: &SemanticSearchRequest,
) -> DataResult<Vec<SemanticSearchResultDto>> {
    require_cloud_consent(profile)?;
    let query = normalize_query(&request.query)?;
    let vectors = embed_texts_with_retry(profile, storage, http, std::slice::from_ref(&query))
        .map_err(ProviderFailure::into_data_error)?;
    let query_vector = vectors.first().ok_or_else(|| {
        DataError::InvalidInput("Модель не вернула вектор поискового запроса".to_string())
    })?;
    if let Some(dimensions) = profile.dimensions {
        if dimensions != query_vector.len() as i64 {
            return Err(DataError::InvalidInput(
                "Размерность ответа модели изменилась. Пересоздайте смысловой индекс".to_string(),
            ));
        }
    }

    let semantic = semantic_candidates(conn, profile, query_vector, request)?;
    let lexical = lexical_candidates(conn, &query, request)?;
    let semantic_count = semantic.len();
    let lexical_count = lexical.len();
    let results = fuse_candidates(conn, &query, request, semantic, lexical)?;
    llm::log_llm_diagnostic(
        "hybrid_retrieval_completed",
        &[
            ("semanticCandidates", semantic_count.to_string()),
            ("lexicalCandidates", lexical_count.to_string()),
            ("fusedResults", results.len().to_string()),
        ],
    );
    Ok(results)
}

pub fn semantic_search<S: SecretStorage, H: HttpClient>(
    conn: &Connection,
    profile: &EmbeddingProfileRecord,
    storage: &S,
    http: &H,
    request: &SemanticSearchRequest,
) -> DataResult<Vec<SemanticSearchResultDto>> {
    require_cloud_consent(profile)?;
    let query = normalize_query(&request.query)?;
    let vectors = embed_texts_with_retry(profile, storage, http, std::slice::from_ref(&query))
        .map_err(ProviderFailure::into_data_error)?;
    let query_vector = &vectors[0];
    let candidates = semantic_candidates(conn, profile, query_vector, request)?;
    fuse_candidates(conn, &query, request, candidates, Vec::new())
}

pub fn rebuild_chunk_fts(conn: &Connection) -> DataResult<i64> {
    let transaction = conn.unchecked_transaction()?;
    transaction.execute("DELETE FROM knowledge_chunks_fts", [])?;
    let inserted = transaction.execute(
        "INSERT INTO knowledge_chunks_fts (chunk_id, note_id, heading_path, content_text)
         SELECT id, note_id, heading_path_json, content_text FROM knowledge_chunks",
        [],
    )?;
    transaction.commit()?;
    Ok(inserted as i64)
}

pub fn collect_profile_backups(conn: &Connection) -> DataResult<Vec<EmbeddingProfileBackup>> {
    let mut statement = conn.prepare(
        "SELECT id, name, provider_type, base_url, embeddings_endpoint, model, dimensions,
                batch_size, timeout_seconds, locality, enabled, created_at, updated_at
         FROM embedding_profiles ORDER BY created_at",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(EmbeddingProfileBackup {
            id: row.get(0)?,
            name: row.get(1)?,
            provider_type: row.get(2)?,
            base_url: row.get(3)?,
            embeddings_endpoint: row.get(4)?,
            model: row.get(5)?,
            dimensions: row.get(6)?,
            batch_size: row.get(7)?,
            timeout_seconds: row.get(8)?,
            locality: row.get(9)?,
            enabled: row.get::<_, i64>(10)? != 0,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn import_profile_backups(
    conn: &Connection,
    profiles: &[EmbeddingProfileBackup],
) -> DataResult<()> {
    for profile in profiles {
        conn.execute(
            "INSERT INTO embedding_profiles (
                id, name, provider_type, base_url, embeddings_endpoint, model, dimensions,
                batch_size, timeout_seconds, locality, api_key_ref, cloud_consent_at, enabled,
                pipeline_version, last_status, last_checked_at, last_error_code, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, ?11, ?12,
                       'not_configured', NULL, NULL, ?13, ?14)",
            params![
                profile.id,
                profile.name,
                profile.provider_type,
                profile.base_url,
                profile.embeddings_endpoint,
                profile.model,
                profile.dimensions,
                profile.batch_size.clamp(1, MAX_BATCH_SIZE),
                profile.timeout_seconds.clamp(5, 300),
                profile.locality,
                profile.enabled,
                EMBEDDING_PIPELINE_VERSION,
                profile.created_at,
                profile.updated_at,
            ],
        )?;
        conn.execute(
            "INSERT INTO embedding_index_state (
                profile_id, status, total_chunks, indexed_chunks, pending_chunks, failed_chunks, updated_at
             ) VALUES (?1, 'pending', 0, 0, 0, 0, ?2)",
            params![profile.id, now_iso()],
        )?;
    }
    Ok(())
}

pub fn reconcile_all_index_states(conn: &mut Connection) -> DataResult<()> {
    rebuild_chunk_fts(conn)?;
    let profile_ids = {
        let mut statement = conn.prepare("SELECT id FROM embedding_profiles")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    for profile_id in profile_ids {
        refresh_index_state(conn, &profile_id, None)?;
    }
    Ok(())
}

pub fn serialize_vector(vector: &[f32]) -> DataResult<Vec<u8>> {
    validate_vector(vector)?;
    let mut bytes = Vec::with_capacity(std::mem::size_of_val(vector));
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    Ok(bytes)
}

pub fn deserialize_vector(blob: &[u8], dimensions: usize) -> DataResult<Vec<f32>> {
    if dimensions == 0 || blob.len() != dimensions.saturating_mul(std::mem::size_of::<f32>()) {
        return Err(DataError::InvalidInput(
            "Повреждён локальный смысловой индекс: неверный размер вектора".to_string(),
        ));
    }
    let vector = blob
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect::<Vec<_>>();
    validate_vector(&vector)?;
    Ok(vector)
}

pub fn cosine_similarity(left: &[f32], right: &[f32]) -> DataResult<f64> {
    if left.len() != right.len() || left.is_empty() {
        return Err(DataError::InvalidInput(
            "Размерности векторов смыслового поиска (RAG) не совпадают".to_string(),
        ));
    }
    if left
        .iter()
        .chain(right.iter())
        .any(|value| !value.is_finite())
    {
        return Err(DataError::InvalidInput(
            "Модель вернула некорректный числовой вектор".to_string(),
        ));
    }
    let mut dot = 0.0_f64;
    let mut left_norm = 0.0_f64;
    let mut right_norm = 0.0_f64;
    for (left_value, right_value) in left.iter().zip(right.iter()) {
        let left_value = f64::from(*left_value);
        let right_value = f64::from(*right_value);
        dot += left_value * right_value;
        left_norm += left_value * left_value;
        right_norm += right_value * right_value;
    }
    if left_norm == 0.0 || right_norm == 0.0 {
        return Ok(0.0);
    }
    Ok((dot / (left_norm.sqrt() * right_norm.sqrt())).clamp(-1.0, 1.0))
}

fn normalize_profile_request(
    request: SaveEmbeddingProfileRequest,
) -> DataResult<SaveEmbeddingProfileRequest> {
    let provider_type = match request.provider_type.trim() {
        "ollama" | "openai" | "custom" => request.provider_type.trim().to_string(),
        _ => {
            return Err(DataError::InvalidInput(
                "Неизвестный тип модели смыслового поиска (RAG)".to_string(),
            ))
        }
    };
    let locality = match request.locality.trim() {
        "local" | "cloud" => request.locality.trim().to_string(),
        _ => {
            return Err(DataError::InvalidInput(
                "Выберите локальную или облачную обработку".to_string(),
            ))
        }
    };
    let base_url = normalize_base_url(&request.base_url, &locality)?;
    if locality == "local" && !is_local_base_url(&base_url) {
        return Err(DataError::InvalidInput(
            "Для локальной обработки используйте локальный или частный сетевой адрес".to_string(),
        ));
    }
    let endpoint = normalize_endpoint(&request.embeddings_endpoint)?;
    let name = required_text(&request.name, "Название подключения")?;
    let model = required_text(&request.model, "Модель смыслового поиска (RAG)")?;
    Ok(SaveEmbeddingProfileRequest {
        id: request.id,
        name,
        provider_type,
        base_url,
        embeddings_endpoint: endpoint,
        model,
        batch_size: request.batch_size.clamp(1, MAX_BATCH_SIZE),
        timeout_seconds: request.timeout_seconds.clamp(5, 300),
        locality,
        api_key: request.api_key,
        delete_api_key: request.delete_api_key,
        enabled: request.enabled,
    })
}

fn profile_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EmbeddingProfileRecord> {
    Ok(EmbeddingProfileRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        provider_type: row.get(2)?,
        base_url: row.get(3)?,
        embeddings_endpoint: row.get(4)?,
        model: row.get(5)?,
        dimensions: row.get(6)?,
        batch_size: row.get(7)?,
        timeout_seconds: row.get(8)?,
        locality: row.get(9)?,
        api_key_ref: row.get(10)?,
        cloud_consent_at: row.get(11)?,
        enabled: row.get::<_, i64>(12)? != 0,
        pipeline_version: row.get(13)?,
        last_status: row.get(14)?,
        last_checked_at: row.get(15)?,
        last_error_code: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
}

fn profile_to_dto<S: SecretStorage>(
    profile: EmbeddingProfileRecord,
    storage: &S,
) -> DataResult<EmbeddingProfileDto> {
    let has_api_key = profile
        .api_key_ref
        .as_deref()
        .map(|secret_ref| storage.has_secret(secret_ref))
        .transpose()?
        .unwrap_or(false);
    Ok(EmbeddingProfileDto {
        id: profile.id,
        name: profile.name,
        provider_type: profile.provider_type,
        base_url: profile.base_url,
        embeddings_endpoint: profile.embeddings_endpoint,
        model: profile.model,
        dimensions: profile.dimensions,
        batch_size: profile.batch_size,
        timeout_seconds: profile.timeout_seconds,
        locality: profile.locality,
        has_api_key,
        has_cloud_consent: profile.cloud_consent_at.is_some(),
        enabled: profile.enabled,
        last_status: profile.last_status,
        last_checked_at: profile.last_checked_at,
        last_error_code: profile.last_error_code,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
    })
}

fn embed_texts_with_retry<S: SecretStorage, H: HttpClient>(
    profile: &EmbeddingProfileRecord,
    storage: &S,
    http: &H,
    inputs: &[String],
) -> Result<Vec<Vec<f32>>, ProviderFailure> {
    let mut attempt = 0_u32;
    loop {
        match embed_texts(profile, storage, http, inputs) {
            Ok(vectors) => return Ok(vectors),
            Err(error) if error.retryable && attempt < 2 => {
                let backoff = Duration::from_millis(200 * 2_u64.pow(attempt));
                thread::sleep(backoff);
                attempt += 1;
            }
            Err(error) => return Err(error),
        }
    }
}

fn embed_texts<S: SecretStorage, H: HttpClient>(
    profile: &EmbeddingProfileRecord,
    storage: &S,
    http: &H,
    inputs: &[String],
) -> Result<Vec<Vec<f32>>, ProviderFailure> {
    if inputs.is_empty() {
        return Ok(Vec::new());
    }
    if profile.locality == "local" && !is_local_base_url(&profile.base_url) {
        return Err(provider_error(
            "invalid_local_url",
            "Локальная модель должна использовать адрес localhost, 127.0.0.1 или ::1",
            false,
        ));
    }
    let mut headers = Vec::new();
    if profile.provider_type != "ollama" {
        headers.push((
            "User-Agent".to_string(),
            llm::OPENAI_COMPATIBLE_USER_AGENT.to_string(),
        ));
    }
    if let Some(secret_ref) = &profile.api_key_ref {
        if let Some(key) = storage.get_secret(secret_ref).map_err(storage_failure)? {
            headers.push(("Authorization".to_string(), format!("Bearer {key}")));
        }
    }
    if profile.locality == "cloud" && !headers.iter().any(|(name, _)| name == "Authorization") {
        return Err(provider_error(
            "api_key_missing",
            "Для облачной модели нужен API key",
            false,
        ));
    }
    let url = join_url(&profile.base_url, &profile.embeddings_endpoint);
    let body = json!({ "model": profile.model, "input": inputs });
    let response = http
        .send(HttpRequest {
            method: "POST".to_string(),
            url,
            headers,
            body: Some(body),
            timeout_ms: profile.timeout_seconds * 1_000,
        })
        .map_err(http_transport_failure)?;
    if !(200..300).contains(&response.status) {
        if profile.provider_type == "ollama" && response.status == 400 {
            return Err(provider_error(
                "model_not_supported",
                "Эта модель не поддерживает смысловой поиск",
                false,
            ));
        }
        return Err(http_status_failure(response.status));
    }
    let value: Value = serde_json::from_str(&response.body).map_err(|_| {
        provider_error(
            "invalid_response",
            "Модель вернула ответ в неподдерживаемом формате",
            false,
        )
    })?;
    let vectors = if profile.provider_type == "ollama" {
        parse_ollama_vectors(&value)?
    } else {
        parse_openai_vectors(&value)?
    };
    validate_vector_batch(&vectors, inputs.len(), profile.dimensions)?;
    Ok(vectors)
}

fn parse_ollama_vectors(value: &Value) -> Result<Vec<Vec<f32>>, ProviderFailure> {
    let embeddings = value
        .get("embeddings")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            provider_error(
                "embedding_endpoint_unsupported",
                "Endpoint не вернул embeddings. Проверьте модель и адрес подключения",
                false,
            )
        })?;
    embeddings.iter().map(parse_vector_value).collect()
}

fn parse_openai_vectors(value: &Value) -> Result<Vec<Vec<f32>>, ProviderFailure> {
    let data = value.get("data").and_then(Value::as_array).ok_or_else(|| {
        provider_error(
            "embedding_endpoint_unsupported",
            "Endpoint не поддерживает OpenAI-compatible embeddings",
            false,
        )
    })?;
    let mut indexed = data
        .iter()
        .enumerate()
        .map(|(position, item)| {
            let index = item
                .get("index")
                .and_then(Value::as_u64)
                .unwrap_or(position as u64);
            let vector = item.get("embedding").ok_or_else(|| {
                provider_error(
                    "invalid_response",
                    "Модель вернула ответ без числового вектора",
                    false,
                )
            })?;
            parse_vector_value(vector).map(|vector| (index, vector))
        })
        .collect::<Result<Vec<_>, _>>()?;
    indexed.sort_by_key(|(index, _)| *index);
    Ok(indexed.into_iter().map(|(_, vector)| vector).collect())
}

fn parse_vector_value(value: &Value) -> Result<Vec<f32>, ProviderFailure> {
    let values = value.as_array().ok_or_else(|| {
        provider_error(
            "invalid_response",
            "Модель вернула некорректный числовой вектор",
            false,
        )
    })?;
    values
        .iter()
        .map(|value| {
            let number = value.as_f64().ok_or_else(|| {
                provider_error(
                    "invalid_response",
                    "Модель вернула некорректный числовой вектор",
                    false,
                )
            })?;
            let number = number as f32;
            if !number.is_finite() {
                return Err(provider_error(
                    "invalid_vector",
                    "Модель вернула некорректные значения вектора",
                    false,
                ));
            }
            Ok(number)
        })
        .collect()
}

fn validate_vector_batch(
    vectors: &[Vec<f32>],
    expected_count: usize,
    expected_dimensions: Option<i64>,
) -> Result<(), ProviderFailure> {
    if vectors.len() != expected_count || vectors.is_empty() {
        return Err(provider_error(
            "invalid_response",
            "Количество полученных векторов не совпадает с количеством фрагментов",
            false,
        ));
    }
    let dimensions = vectors[0].len();
    if dimensions == 0
        || vectors.iter().any(|vector| {
            vector.len() != dimensions
                || vector.iter().any(|value| !value.is_finite())
                || vector.iter().all(|value| *value == 0.0)
        })
    {
        return Err(provider_error(
            "dimensions_mismatch",
            "Модель вернула векторы с несовпадающей или некорректной размерностью",
            false,
        ));
    }
    if expected_dimensions.is_some_and(|expected| expected != dimensions as i64) {
        return Err(provider_error(
            "dimensions_mismatch",
            "Размерность модели изменилась. Пересоздайте смысловой индекс",
            false,
        ));
    }
    Ok(())
}

fn pending_chunks(
    conn: &Connection,
    profile: &EmbeddingProfileRecord,
) -> DataResult<Vec<PendingChunk>> {
    let mut statement = conn.prepare(
        "SELECT k.id, k.content_hash, k.content_text
         FROM knowledge_chunks k
         LEFT JOIN knowledge_chunk_embeddings e
           ON e.chunk_id = k.id AND e.profile_id = ?1
         LEFT JOIN embedding_chunk_failures f
           ON f.chunk_id = k.id AND f.profile_id = ?1
         WHERE e.chunk_id IS NULL
            OR e.chunk_content_hash <> k.content_hash
            OR e.pipeline_version <> ?2
            OR (?3 IS NOT NULL AND e.dimensions <> ?3)
            OR (f.chunk_id IS NOT NULL AND f.chunk_content_hash = k.content_hash)
         ORDER BY k.note_id, k.chunk_order",
    )?;
    let rows = statement.query_map(
        params![profile.id, EMBEDDING_PIPELINE_VERSION, profile.dimensions],
        |row| {
            Ok(PendingChunk {
                id: row.get(0)?,
                content_hash: row.get(1)?,
                content_text: row.get(2)?,
            })
        },
    )?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn semantic_candidates(
    conn: &Connection,
    profile: &EmbeddingProfileRecord,
    query_vector: &[f32],
    request: &SemanticSearchRequest,
) -> DataResult<Vec<SearchCandidate>> {
    let candidate_limit = request.candidate_limit.clamp(10, 500) as usize;
    let mut statement = conn.prepare(
        "SELECT k.id, k.note_id, n.title, k.heading_path_json, k.content_text,
                COALESCE(p.title, 'Входящие'), p.id, n.archived_at IS NOT NULL,
                n.is_favorite, n.updated_at, e.vector_blob, e.dimensions, e.vector_norm
         FROM knowledge_chunk_embeddings e
         JOIN knowledge_chunks k ON k.id = e.chunk_id
         JOIN notes n ON n.id = k.note_id
         LEFT JOIN projects p ON p.id = n.project_id
         WHERE e.profile_id = ?1
           AND e.chunk_content_hash = k.content_hash
           AND e.pipeline_version = ?2
           AND n.deleted_at IS NULL
           AND (?3 OR n.archived_at IS NULL)
           AND (?4 IS NULL OR n.project_id = ?4)
           AND (NOT ?5 OR n.is_favorite = 1)
           AND (?6 IS NULL OR EXISTS (
               SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?6
           ))",
    )?;
    let rows = statement.query_map(
        params![
            profile.id,
            EMBEDDING_PIPELINE_VERSION,
            request.include_archived,
            request.project_id,
            request.favorites_only,
            request.tag_id,
        ],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, bool>(7)?,
                row.get::<_, bool>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, Vec<u8>>(10)?,
                row.get::<_, i64>(11)?,
                row.get::<_, f64>(12)?,
            ))
        },
    )?;
    let mut candidates = Vec::new();
    for row in rows {
        let (
            chunk_id,
            note_id,
            note_title,
            heading_path_json,
            content_text,
            project,
            project_id,
            archived,
            favorite,
            updated_at,
            vector_blob,
            dimensions,
            stored_norm,
        ) = row?;
        if dimensions <= 0 || stored_norm <= 0.0 || dimensions as usize != query_vector.len() {
            continue;
        }
        let vector = deserialize_vector(&vector_blob, dimensions as usize)?;
        let semantic_score = cosine_similarity(query_vector, &vector)?;
        candidates.push(SearchCandidate {
            chunk_id,
            note_id,
            note_title,
            heading_path: parse_heading_path(&heading_path_json),
            content_text,
            project,
            project_id,
            archived,
            favorite,
            updated_at,
            semantic_score: Some(semantic_score),
            exact_title: false,
        });
    }
    candidates.sort_by(|left, right| {
        right
            .semantic_score
            .partial_cmp(&left.semantic_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
    });
    candidates.truncate(candidate_limit);
    Ok(candidates)
}

fn lexical_candidates(
    conn: &Connection,
    query: &str,
    request: &SemanticSearchRequest,
) -> DataResult<Vec<SearchCandidate>> {
    let mut candidates = exact_title_candidates(conn, query, request)?;
    let Some(fts_query) = build_chunk_fts_query(query) else {
        return Ok(candidates);
    };
    let mut statement = conn.prepare(
        "SELECT k.id, k.note_id, n.title, k.heading_path_json, k.content_text,
                COALESCE(p.title, 'Входящие'), p.id, n.archived_at IS NOT NULL,
                n.is_favorite, n.updated_at
         FROM knowledge_chunks_fts f
         JOIN knowledge_chunks k ON k.id = f.chunk_id
         JOIN notes n ON n.id = k.note_id
         LEFT JOIN projects p ON p.id = n.project_id
         WHERE knowledge_chunks_fts MATCH ?1
           AND n.deleted_at IS NULL
           AND (?2 OR n.archived_at IS NULL)
           AND (?3 IS NULL OR n.project_id = ?3)
           AND (NOT ?4 OR n.is_favorite = 1)
           AND (?5 IS NULL OR EXISTS (
               SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?5
           ))
         ORDER BY bm25(knowledge_chunks_fts, 0.0, 0.0, 1.8, 1.0)
         LIMIT ?6",
    )?;
    let rows = statement.query_map(
        params![
            fts_query,
            request.include_archived,
            request.project_id,
            request.favorites_only,
            request.tag_id,
            request.candidate_limit.clamp(10, 500),
        ],
        candidate_from_row,
    )?;
    let fts_candidates = rows.collect::<Result<Vec<_>, _>>()?;
    let normalized_query = query.trim().to_lowercase();
    let mut known_chunks = candidates
        .iter()
        .map(|candidate| candidate.chunk_id.clone())
        .collect::<HashSet<_>>();
    for mut candidate in fts_candidates {
        candidate.exact_title = candidate.note_title.trim().to_lowercase() == normalized_query;
        if known_chunks.insert(candidate.chunk_id.clone()) {
            candidates.push(candidate);
        }
    }
    candidates.truncate(request.candidate_limit.clamp(10, 500) as usize);
    Ok(candidates)
}

fn exact_title_candidates(
    conn: &Connection,
    query: &str,
    request: &SemanticSearchRequest,
) -> DataResult<Vec<SearchCandidate>> {
    let normalized_query = query.trim().to_lowercase();
    let mut statement = conn.prepare(
        "SELECT k.id, k.note_id, n.title, k.heading_path_json, k.content_text,
                COALESCE(p.title, 'Входящие'), p.id, n.archived_at IS NOT NULL,
                n.is_favorite, n.updated_at
         FROM knowledge_chunks k
         JOIN notes n ON n.id = k.note_id
         LEFT JOIN projects p ON p.id = n.project_id
         WHERE k.chunk_order = 0
           AND n.deleted_at IS NULL
           AND (?1 OR n.archived_at IS NULL)
           AND (?2 IS NULL OR n.project_id = ?2)
           AND (NOT ?3 OR n.is_favorite = 1)
           AND (?4 IS NULL OR EXISTS (
               SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?4
           ))
         ORDER BY n.updated_at DESC",
    )?;
    let rows = statement.query_map(
        params![
            request.include_archived,
            request.project_id,
            request.favorites_only,
            request.tag_id,
        ],
        candidate_from_row,
    )?;
    let mut candidates = rows
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|candidate| candidate.note_title.trim().to_lowercase() == normalized_query)
        .collect::<Vec<_>>();
    for candidate in &mut candidates {
        candidate.exact_title = true;
    }
    Ok(candidates)
}

fn candidate_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchCandidate> {
    let heading_path_json: String = row.get(3)?;
    Ok(SearchCandidate {
        chunk_id: row.get(0)?,
        note_id: row.get(1)?,
        note_title: row.get(2)?,
        heading_path: parse_heading_path(&heading_path_json),
        content_text: row.get(4)?,
        project: row.get(5)?,
        project_id: row.get(6)?,
        archived: row.get(7)?,
        favorite: row.get(8)?,
        updated_at: row.get(9)?,
        semantic_score: None,
        exact_title: false,
    })
}

fn fuse_candidates(
    conn: &Connection,
    query: &str,
    request: &SemanticSearchRequest,
    semantic: Vec<SearchCandidate>,
    lexical: Vec<SearchCandidate>,
) -> DataResult<Vec<SemanticSearchResultDto>> {
    #[derive(Clone)]
    struct FusionEntry {
        candidate: SearchCandidate,
        score: f64,
        lexical: bool,
        semantic: bool,
    }

    let mut entries: HashMap<String, FusionEntry> = HashMap::new();
    for (rank, candidate) in semantic.into_iter().enumerate() {
        let entry = entries
            .entry(candidate.chunk_id.clone())
            .or_insert(FusionEntry {
                candidate: candidate.clone(),
                score: 0.0,
                lexical: false,
                semantic: false,
            });
        entry.score += 1.0 / (RRF_K + rank as f64 + 1.0);
        entry.semantic = true;
        entry.candidate.semantic_score = candidate.semantic_score;
    }
    for (rank, candidate) in lexical.into_iter().enumerate() {
        let entry = entries
            .entry(candidate.chunk_id.clone())
            .or_insert(FusionEntry {
                candidate: candidate.clone(),
                score: 0.0,
                lexical: false,
                semantic: false,
            });
        entry.score += 1.1 / (RRF_K + rank as f64 + 1.0);
        entry.lexical = true;
        entry.candidate.exact_title |= candidate.exact_title;
        if entry.candidate.exact_title {
            entry.score += 0.05;
        }
    }
    let mut entries = entries.into_values().collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.candidate.updated_at.cmp(&left.candidate.updated_at))
    });

    let limit = request.limit.clamp(1, 100) as usize;
    let per_note_limit = request.per_note_limit.clamp(1, 10) as usize;
    let mut note_counts: HashMap<String, usize> = HashMap::new();
    let mut results = Vec::new();
    for entry in entries {
        let count = note_counts
            .entry(entry.candidate.note_id.clone())
            .or_default();
        if *count >= per_note_limit {
            continue;
        }
        *count += 1;
        let match_type = if entry.candidate.exact_title {
            "exact"
        } else if entry.lexical && entry.semantic {
            "hybrid"
        } else if entry.lexical {
            "lexical"
        } else {
            "semantic"
        };
        let neighboring_chunk_ids = if request.include_neighbors {
            knowledge::get_neighbor_chunks(
                conn,
                &knowledge::KnowledgeChunkNeighborsRequest {
                    chunk_id: entry.candidate.chunk_id.clone(),
                    radius: 1,
                },
            )?
            .into_iter()
            .filter(|chunk| chunk.id != entry.candidate.chunk_id)
            .map(|chunk| chunk.id)
            .collect()
        } else {
            Vec::new()
        };
        results.push(SemanticSearchResultDto {
            chunk_id: entry.candidate.chunk_id,
            note_id: entry.candidate.note_id.clone(),
            note_title: entry.candidate.note_title,
            heading_path: entry.candidate.heading_path,
            snippet: search_snippet(&entry.candidate.content_text, query),
            project: entry.candidate.project,
            project_id: entry.candidate.project_id,
            tags: tags_for_note(conn, &entry.candidate.note_id)?,
            archived: entry.candidate.archived,
            favorite: entry.candidate.favorite,
            updated_at: entry.candidate.updated_at,
            semantic_score: entry.candidate.semantic_score,
            match_type: match_type.to_string(),
            neighboring_chunk_ids,
        });
        if results.len() >= limit {
            break;
        }
    }
    Ok(results)
}

fn tags_for_note(conn: &Connection, note_id: &str) -> DataResult<Vec<SemanticSearchTagDto>> {
    let mut statement = conn.prepare(
        "SELECT t.id, t.name, t.color, t.custom_color, t.icon_key
         FROM tags t JOIN note_tags nt ON nt.tag_id = t.id
         WHERE nt.note_id = ?1 ORDER BY t.name",
    )?;
    let rows = statement.query_map(params![note_id], |row| {
        Ok(SemanticSearchTagDto {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            custom_color: row.get(3)?,
            icon_key: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn refresh_index_state(
    conn: &mut Connection,
    profile_id: &str,
    error_code: Option<&str>,
) -> DataResult<EmbeddingIndexStatusDto> {
    let profile = get_profile(conn, profile_id)?;
    let total_chunks = count_total_chunks(conn)?;
    let indexed_chunks: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM knowledge_chunk_embeddings e
         JOIN knowledge_chunks k ON k.id = e.chunk_id
         WHERE e.profile_id = ?1
           AND e.chunk_content_hash = k.content_hash
           AND e.pipeline_version = ?2
           AND (?3 IS NULL OR e.dimensions = ?3)",
        params![profile_id, EMBEDDING_PIPELINE_VERSION, profile.dimensions],
        |row| row.get(0),
    )?;
    let failed_chunks: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM embedding_chunk_failures f
         JOIN knowledge_chunks k ON k.id = f.chunk_id
         WHERE f.profile_id = ?1 AND f.chunk_content_hash = k.content_hash",
        params![profile_id],
        |row| row.get(0),
    )?;
    let pending_chunks = (total_chunks - indexed_chunks).max(0);
    let existing_status = index_state_from_db(conn, profile_id)
        .ok()
        .map(|state| state.status);
    let status = if !profile.enabled {
        "not_configured"
    } else if existing_status.as_deref() == Some("indexing")
        && pending_chunks > 0
        && error_code.is_none()
    {
        "indexing"
    } else if total_chunks == 0 || pending_chunks == 0 {
        "current"
    } else if failed_chunks > 0 && indexed_chunks > 0 {
        "partial"
    } else if failed_chunks > 0 {
        "failed"
    } else if indexed_chunks > 0 {
        "partial"
    } else {
        "pending"
    };
    let now = now_iso();
    conn.execute(
        "INSERT INTO embedding_index_state (
            profile_id, status, total_chunks, indexed_chunks, pending_chunks, failed_chunks,
            last_checked_at, last_indexed_at, last_error_code, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
                   CASE WHEN ?2 = 'current' THEN ?7 ELSE NULL END, ?8, ?7)
         ON CONFLICT(profile_id) DO UPDATE SET
            status = excluded.status,
            total_chunks = excluded.total_chunks,
            indexed_chunks = excluded.indexed_chunks,
            pending_chunks = excluded.pending_chunks,
            failed_chunks = excluded.failed_chunks,
            last_checked_at = excluded.last_checked_at,
            last_indexed_at = CASE
                WHEN excluded.status = 'current' THEN excluded.updated_at
                ELSE embedding_index_state.last_indexed_at
            END,
            last_error_code = excluded.last_error_code,
            updated_at = excluded.updated_at",
        params![
            profile_id,
            status,
            total_chunks,
            indexed_chunks,
            pending_chunks,
            failed_chunks,
            now,
            error_code,
        ],
    )?;
    index_state_from_db(conn, profile_id)
}

fn index_state_from_db(conn: &Connection, profile_id: &str) -> DataResult<EmbeddingIndexStatusDto> {
    conn.query_row(
        "SELECT profile_id, status, total_chunks, indexed_chunks, pending_chunks, failed_chunks,
                last_checked_at, last_indexed_at, last_error_code, updated_at
         FROM embedding_index_state WHERE profile_id = ?1",
        params![profile_id],
        |row| {
            Ok(EmbeddingIndexStatusDto {
                profile_id: row.get(0)?,
                status: row.get(1)?,
                total_chunks: row.get(2)?,
                indexed_chunks: row.get(3)?,
                pending_chunks: row.get(4)?,
                failed_chunks: row.get(5)?,
                last_checked_at: row.get(6)?,
                last_indexed_at: row.get(7)?,
                last_error_code: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    )
    .map_err(DataError::from)
}

fn mark_indexing(conn: &Connection, profile_id: &str) -> DataResult<()> {
    conn.execute(
        "INSERT INTO embedding_index_state (
            profile_id, status, total_chunks, indexed_chunks, pending_chunks, failed_chunks, updated_at
         ) VALUES (?1, 'indexing', 0, 0, 0, 0, ?2)
         ON CONFLICT(profile_id) DO UPDATE SET status = 'indexing', last_error_code = NULL, updated_at = ?2",
        params![profile_id, now_iso()],
    )?;
    Ok(())
}

fn count_total_chunks(conn: &Connection) -> DataResult<i64> {
    Ok(
        conn.query_row("SELECT COUNT(*) FROM knowledge_chunks", [], |row| {
            row.get(0)
        })?,
    )
}

fn validate_vector(vector: &[f32]) -> DataResult<()> {
    if vector.is_empty() || vector.iter().any(|value| !value.is_finite()) {
        return Err(DataError::InvalidInput(
            "Модель вернула некорректный числовой вектор".to_string(),
        ));
    }
    if vector.iter().all(|value| *value == 0.0) {
        return Err(DataError::InvalidInput(
            "Модель вернула нулевой вектор".to_string(),
        ));
    }
    Ok(())
}

fn vector_norm(vector: &[f32]) -> DataResult<f64> {
    validate_vector(vector)?;
    Ok(vector
        .iter()
        .map(|value| {
            let value = f64::from(*value);
            value * value
        })
        .sum::<f64>()
        .sqrt())
}

fn require_cloud_consent(profile: &EmbeddingProfileRecord) -> DataResult<()> {
    if profile.locality == "cloud" && profile.cloud_consent_at.is_none() {
        return Err(DataError::InvalidInput(
            "Перед облачной обработкой подтвердите передачу смысловых фрагментов выбранному провайдеру"
                .to_string(),
        ));
    }
    Ok(())
}

fn build_chunk_fts_query(query: &str) -> Option<String> {
    let terms = query
        .split(|character: char| {
            !character.is_alphanumeric() && character != '_' && character != '-'
        })
        .filter_map(|term| {
            let normalized = term.trim_matches('-').trim().to_lowercase();
            (!normalized.is_empty()).then_some(format!("\"{}\"*", normalized.replace('"', "\"\"")))
        })
        .collect::<Vec<_>>();
    (!terms.is_empty()).then(|| terms.join(" AND "))
}

fn normalize_query(query: &str) -> DataResult<String> {
    let query = query.trim();
    if query.is_empty() {
        return Err(DataError::InvalidInput(
            "Введите поисковый запрос".to_string(),
        ));
    }
    if query.chars().count() > 2_000 {
        return Err(DataError::InvalidInput(
            "Поисковый запрос слишком длинный".to_string(),
        ));
    }
    Ok(query.to_string())
}

fn parse_heading_path(value: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(value).unwrap_or_default()
}

fn search_snippet(content: &str, query: &str) -> String {
    let normalized_content = content.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower_content = normalized_content.to_lowercase();
    let first_term = query
        .split_whitespace()
        .map(str::to_lowercase)
        .find(|term| lower_content.contains(term));
    let center_byte = first_term
        .as_ref()
        .and_then(|term| lower_content.find(term))
        .unwrap_or(0);
    let center = lower_content[..center_byte].chars().count();
    let characters = normalized_content.chars().collect::<Vec<_>>();
    let start = center.saturating_sub(80);
    let end = (start + 260).min(characters.len());
    let snippet = characters[start..end].iter().collect::<String>();
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        snippet,
        if end < characters.len() { "…" } else { "" }
    )
}

fn normalize_base_url(value: &str, locality: &str) -> DataResult<String> {
    normalize_provider_url(
        value,
        if locality == "local" {
            ProviderLocality::Local
        } else {
            ProviderLocality::Cloud
        },
    )
}

fn normalize_endpoint(value: &str) -> DataResult<String> {
    let value = value.trim();
    if !value.starts_with('/') || value.contains("..") || value.contains(['\r', '\n', '\t', ' ']) {
        return Err(DataError::InvalidInput(
            "Путь embeddings должен начинаться с / и не содержать пробелов".to_string(),
        ));
    }
    Ok(value.to_string())
}

fn required_text(value: &str, field_name: &str) -> DataResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(DataError::InvalidInput(format!(
            "Заполните поле «{field_name}»"
        )));
    }
    Ok(value.to_string())
}

fn is_local_base_url(base_url: &str) -> bool {
    url::Url::parse(base_url).is_ok_and(|url| is_local_destination(&url))
}

fn join_url(base_url: &str, endpoint: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        endpoint.trim_start_matches('/')
    )
}

fn provider_error(code: &'static str, message: &str, retryable: bool) -> ProviderFailure {
    ProviderFailure {
        code,
        message: message.to_string(),
        retryable,
    }
}

fn storage_failure(_error: DataError) -> ProviderFailure {
    provider_error(
        "secure_storage_unavailable",
        "Безопасное хранилище ключей недоступно",
        false,
    )
}

fn http_transport_failure(error: DataError) -> ProviderFailure {
    let text = error.to_string().to_lowercase();
    if text.contains("timeout") || text.contains("timed out") || text.contains("время") {
        provider_error("timeout", "Время ожидания ответа модели истекло", true)
    } else {
        provider_error("server_unavailable", "Сервер модели недоступен", true)
    }
}

fn http_status_failure(status: u16) -> ProviderFailure {
    match status {
        401 | 403 => provider_error("unauthorized", "API key не принят провайдером", false),
        404 => provider_error(
            "model_or_endpoint_not_found",
            "Модель не найдена или endpoint embeddings не поддерживается",
            false,
        ),
        429 => provider_error(
            "rate_limit",
            "Провайдер временно ограничил частоту запросов",
            true,
        ),
        408 | 500..=599 => provider_error(
            "server_unavailable",
            "Сервер модели временно недоступен",
            true,
        ),
        _ => provider_error(
            "provider_error",
            "Провайдер не выполнил запрос смыслового поиска (RAG)",
            false,
        ),
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::{HttpResponse, SecretStorage};
    use std::{
        collections::{HashSet, VecDeque},
        sync::{atomic::AtomicUsize, Mutex},
    };

    #[derive(Default)]
    struct MemorySecrets(Mutex<HashMap<String, String>>);

    impl SecretStorage for MemorySecrets {
        fn set_secret(&self, secret_ref: &str, secret: &str) -> DataResult<()> {
            self.0
                .lock()
                .expect("secret lock")
                .insert(secret_ref.to_string(), secret.to_string());
            Ok(())
        }

        fn get_secret(&self, secret_ref: &str) -> DataResult<Option<String>> {
            Ok(self.0.lock().expect("secret lock").get(secret_ref).cloned())
        }

        fn delete_secret(&self, secret_ref: &str) -> DataResult<()> {
            self.0.lock().expect("secret lock").remove(secret_ref);
            Ok(())
        }
    }

    struct MockHttp;

    impl HttpClient for MockHttp {
        fn send(&self, request: HttpRequest) -> DataResult<HttpResponse> {
            let count = request
                .body
                .as_ref()
                .and_then(|body| body.get("input"))
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or(1);
            let data = (0..count)
                .map(|index| json!({ "index": index, "embedding": [1.0, index as f32 + 1.0, 0.5] }))
                .collect::<Vec<_>>();
            Ok(HttpResponse {
                status: 200,
                body: json!({ "data": data }).to_string(),
            })
        }
    }

    struct SequenceHttp {
        calls: AtomicUsize,
        statuses: Mutex<VecDeque<u16>>,
    }

    impl SequenceHttp {
        fn new(statuses: impl IntoIterator<Item = u16>) -> Self {
            Self {
                calls: AtomicUsize::new(0),
                statuses: Mutex::new(statuses.into_iter().collect()),
            }
        }

        fn calls(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }

    impl HttpClient for SequenceHttp {
        fn send(&self, request: HttpRequest) -> DataResult<HttpResponse> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let status = self
                .statuses
                .lock()
                .expect("status queue")
                .pop_front()
                .unwrap_or(200);
            if status == 200 {
                MockHttp.send(request)
            } else {
                Ok(HttpResponse {
                    status,
                    body: "private chunk text and provider debug details".to_string(),
                })
            }
        }
    }

    struct RecordedHttp {
        response: HttpResponse,
        requests: Mutex<Vec<HttpRequest>>,
    }

    impl RecordedHttp {
        fn new(status: u16, body: Value) -> Self {
            Self {
                response: HttpResponse {
                    status,
                    body: body.to_string(),
                },
                requests: Mutex::new(Vec::new()),
            }
        }
    }

    impl HttpClient for RecordedHttp {
        fn send(&self, request: HttpRequest) -> DataResult<HttpResponse> {
            self.requests.lock().expect("request lock").push(request);
            Ok(self.response.clone())
        }
    }

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().expect("open database");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        conn.execute_batch(
            "CREATE TABLE notes (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, content_markdown TEXT NOT NULL DEFAULT '',
                plain_text TEXT NOT NULL DEFAULT '', project_id TEXT, is_favorite INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL, archived_at TEXT, deleted_at TEXT
             );
             CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL);
             CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, custom_color TEXT, icon_key TEXT);
             CREATE TABLE note_tags (note_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(note_id, tag_id));
             CREATE TABLE note_content_sidecars (
                note_id TEXT NOT NULL, kind TEXT NOT NULL, schema_version INTEGER NOT NULL,
                payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                PRIMARY KEY (note_id, kind)
             );",
        ).expect("base schema");
        conn.execute_batch(knowledge::KNOWLEDGE_MIGRATION_SQL)
            .expect("knowledge schema");
        conn.execute_batch(knowledge::KNOWLEDGE_METADATA_MIGRATION_SQL)
            .expect("knowledge metadata schema");
        conn.execute_batch(EMBEDDING_MIGRATION_SQL)
            .expect("embedding schema");
        conn
    }

    fn profile_request() -> SaveEmbeddingProfileRequest {
        SaveEmbeddingProfileRequest {
            id: None,
            name: "Local test".to_string(),
            provider_type: "openai".to_string(),
            base_url: "http://127.0.0.1:11434/v1".to_string(),
            embeddings_endpoint: "/embeddings".to_string(),
            model: "embed-test".to_string(),
            batch_size: 8,
            timeout_seconds: 10,
            locality: "local".to_string(),
            api_key: None,
            delete_api_key: false,
            enabled: true,
        }
    }

    #[test]
    #[ignore = "requires the external Bridge and the current profile's secure credential"]
    fn real_bridge_embedding_smoke() {
        struct StatusHttp(Mutex<Vec<u16>>);
        impl HttpClient for StatusHttp {
            fn send(&self, request: HttpRequest) -> DataResult<HttpResponse> {
                let response = llm::CurlHttpClient.send(request)?;
                self.0.lock().expect("status lock").push(response.status);
                Ok(response)
            }
        }

        let database_path = std::env::var("NOTEFLOW_BRIDGE_SMOKE_DB")
            .expect("set NOTEFLOW_BRIDGE_SMOKE_DB to a read-only copy or local NoteFlow DB");
        let source =
            Connection::open_with_flags(database_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .expect("open NoteFlow database read-only");
        let api_key_ref: String = source
            .query_row(
                "SELECT api_key_ref FROM llm_providers WHERE base_url LIKE '%bridge-back.admlr.lipetsk.ru%' AND api_key_ref IS NOT NULL LIMIT 1",
                [],
                |row| row.get(0),
            )
            .expect("Bridge credential reference exists");
        let mut conn = setup();
        let mut request = profile_request();
        request.provider_type = "custom".to_string();
        request.base_url = "https://bridge-back.admlr.lipetsk.ru/api/v1".to_string();
        request.model = "cifra48/embedding".to_string();
        request.locality = "cloud".to_string();
        let created = save_profile(&mut conn, &MemorySecrets::default(), request)
            .expect("create temporary profile");
        let mut profile = get_profile(&conn, &created.id).expect("load temporary profile");
        profile.api_key_ref = Some(api_key_ref);
        let http = StatusHttp(Mutex::new(Vec::new()));
        let result = test_profile(&profile, &llm::SystemSecretStorage, &http);
        eprintln!(
            "Bridge embedding: endpoint={} http_status={:?} result={} dimensions={:?} error_code={:?}",
            profile.embeddings_endpoint,
            http.0.lock().expect("status lock"),
            result.status,
            result.dimensions,
            result.error_code,
        );
        assert_eq!(result.status, "success");
    }

    fn search_request(profile_id: &str, query: &str) -> SemanticSearchRequest {
        SemanticSearchRequest {
            query: query.to_string(),
            profile_id: profile_id.to_string(),
            project_id: None,
            tag_id: None,
            include_archived: false,
            favorites_only: false,
            limit: 30,
            candidate_limit: 100,
            per_note_limit: 3,
            include_neighbors: true,
        }
    }

    #[test]
    fn migration_creates_vector_and_chunk_fts_tables() {
        let conn = setup();
        for table in [
            "embedding_profiles",
            "knowledge_chunk_embeddings",
            "embedding_index_state",
            "knowledge_chunks_fts",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE name = ?1",
                    params![table],
                    |row| row.get(0),
                )
                .expect("table query");
            assert_eq!(count, 1, "missing {table}");
        }
    }

    #[test]
    fn model_listing_supports_ollama_and_openai_compatible_shapes() {
        let ollama = RecordedHttp::new(
            200,
            json!({ "models": [{ "name": "nomic-embed-text:latest" }, { "model": "mxbai-embed-large" }] }),
        );
        let ollama_result = list_models(
            &EmbeddingModelListRequest {
                profile_id: None,
                provider_type: "ollama".to_string(),
                base_url: "http://127.0.0.1:11434".to_string(),
                timeout_seconds: 30,
                api_key: None,
            },
            None,
            &ollama,
        );
        assert_eq!(ollama_result.status, "success");
        assert_eq!(ollama_result.models.len(), 2);
        let ollama_requests = ollama.requests.lock().expect("ollama requests");
        assert_eq!(ollama_requests[0].url, "http://127.0.0.1:11434/api/tags");
        assert_eq!(ollama_requests[0].timeout_ms, 15_000);

        let compatible = RecordedHttp::new(
            200,
            json!({ "data": [{ "id": "embed-small" }, { "id": "embed-large" }] }),
        );
        let compatible_result = list_models(
            &EmbeddingModelListRequest {
                profile_id: Some("profile".to_string()),
                provider_type: "openai".to_string(),
                base_url: "https://api.example.test/v1".to_string(),
                timeout_seconds: 10,
                api_key: None,
            },
            Some("saved-secret"),
            &compatible,
        );
        assert_eq!(compatible_result.models, vec!["embed-large", "embed-small"]);
        let compatible_requests = compatible.requests.lock().expect("compatible requests");
        assert_eq!(
            compatible_requests[0].url,
            "https://api.example.test/v1/models"
        );
        assert!(compatible_requests[0]
            .headers
            .iter()
            .any(|(name, value)| name == "Authorization" && value == "Bearer saved-secret"));
        assert!(compatible_requests[0]
            .headers
            .iter()
            .any(|(name, value)| name == "User-Agent" && value.contains("Mozilla/5.0")));
        assert_eq!(compatible_result.options.len(), 2);
        assert!(compatible_result
            .options
            .iter()
            .all(|option| option.supports_chat.is_none() && option.supports_embeddings.is_none()));
    }

    #[test]
    fn model_listing_falls_back_to_manual_input_and_reports_incompatible_model() {
        let unavailable = RecordedHttp::new(404, json!({ "error": "missing" }));
        let result = list_models(
            &EmbeddingModelListRequest {
                profile_id: None,
                provider_type: "custom".to_string(),
                base_url: "http://localhost:8000/v1".to_string(),
                timeout_seconds: 10,
                api_key: None,
            },
            None,
            &unavailable,
        );
        assert_eq!(result.status, "manual");
        assert!(result.models.is_empty());
        assert_eq!(
            result.message,
            "Не удалось получить список моделей. Укажите название вручную."
        );

        let mut conn = setup();
        let secrets = MemorySecrets::default();
        let mut request = profile_request();
        request.provider_type = "ollama".to_string();
        request.base_url = "http://127.0.0.1:11434".to_string();
        request.embeddings_endpoint = "/api/embed".to_string();
        let saved = save_profile(&mut conn, &secrets, request).expect("save Ollama profile");
        let profile = get_profile(&conn, &saved.id).expect("load profile");
        let incompatible =
            RecordedHttp::new(400, json!({ "error": "model does not support embeddings" }));
        let test_result = test_profile(&profile, &secrets, &incompatible);
        assert_eq!(test_result.status, "error");
        assert_eq!(
            test_result.message,
            "Эта модель не поддерживает смысловой поиск"
        );
    }

    #[test]
    fn vector_blob_round_trip_and_validation_work() {
        let vector = vec![0.25, -1.5, 3.0];
        let blob = serialize_vector(&vector).expect("serialize");
        assert_eq!(deserialize_vector(&blob, 3).expect("deserialize"), vector);
        assert!(deserialize_vector(&blob[..8], 3).is_err());
        assert!(serialize_vector(&[f32::NAN, 1.0]).is_err());
        assert!(serialize_vector(&[f32::INFINITY, 1.0]).is_err());
        assert!(serialize_vector(&[0.0, 0.0]).is_err());
    }

    #[test]
    fn cosine_is_deterministic_and_handles_zero_vector() {
        assert!((cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]).expect("cosine") - 1.0).abs() < 1e-9);
        assert_eq!(
            cosine_similarity(&[0.0, 0.0], &[1.0, 0.0]).expect("zero cosine"),
            0.0
        );
        assert!(cosine_similarity(&[1.0], &[1.0, 2.0]).is_err());
    }

    #[test]
    fn profile_crud_uses_separate_secure_key_and_rename_keeps_vectors() {
        let mut conn = setup();
        let secrets = MemorySecrets::default();
        let mut request = profile_request();
        request.api_key = Some("secret-value".to_string());
        let saved = save_profile(&mut conn, &secrets, request).expect("save profile");
        let sqlite_dump = conn
            .query_row(
                "SELECT COALESCE(api_key_ref, '') FROM embedding_profiles WHERE id = ?1",
                params![saved.id],
                |row| row.get::<_, String>(0),
            )
            .expect("key ref");
        assert!(!sqlite_dump.contains("secret-value"));
        conn.execute("INSERT INTO notes (id, title, is_favorite, updated_at) VALUES ('n', 'Note', 0, '2026-01-01')", []).expect("note");
        conn.execute("INSERT INTO knowledge_chunks (id, note_id, chunk_order, heading_path_json, content_markdown, content_text, content_hash, char_count, estimated_tokens, chunker_version, created_at, updated_at) VALUES ('c', 'n', 0, '[]', 'text', 'text', 'hash', 4, 1, 1, 'now', 'now')", []).expect("chunk");
        conn.execute("INSERT INTO knowledge_chunk_embeddings (chunk_id, profile_id, chunk_content_hash, vector_blob, dimensions, vector_norm, pipeline_version, created_at, updated_at) VALUES ('c', ?1, 'hash', ?2, 3, 1, 1, 'now', 'now')", params![saved.id, serialize_vector(&[1.0, 0.5, 0.25]).expect("blob")]).expect("embedding");
        let mut renamed = profile_request();
        renamed.id = Some(saved.id.clone());
        renamed.name = "Renamed".to_string();
        save_profile(&mut conn, &secrets, renamed).expect("rename profile");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM knowledge_chunk_embeddings WHERE profile_id = ?1",
                params![saved.id],
                |row| row.get(0),
            )
            .expect("embedding count");
        assert_eq!(count, 1);
        delete_profile(&mut conn, &secrets, &saved.id).expect("delete profile");
        assert!(!secrets.has_secret(&sqlite_dump).expect("secret status"));
    }

    #[test]
    fn provider_change_invalidates_vectors_and_cloud_consent() {
        let mut conn = setup();
        let secrets = MemorySecrets::default();
        let saved = save_profile(&mut conn, &secrets, profile_request()).expect("save profile");
        conn.execute(
            "UPDATE embedding_profiles SET cloud_consent_at = 'now' WHERE id = ?1",
            params![saved.id],
        )
        .expect("consent");
        conn.execute("INSERT INTO notes (id, title, is_favorite, updated_at) VALUES ('n', 'Note', 0, '2026-01-01')", []).expect("note");
        conn.execute("INSERT INTO knowledge_chunks (id, note_id, chunk_order, heading_path_json, content_markdown, content_text, content_hash, char_count, estimated_tokens, chunker_version, created_at, updated_at) VALUES ('c', 'n', 0, '[]', 'text', 'text', 'hash', 4, 1, 1, 'now', 'now')", []).expect("chunk");
        conn.execute("INSERT INTO knowledge_chunk_embeddings (chunk_id, profile_id, chunk_content_hash, vector_blob, dimensions, vector_norm, pipeline_version, created_at, updated_at) VALUES ('c', ?1, 'hash', ?2, 3, 1, 1, 'now', 'now')", params![saved.id, serialize_vector(&[1.0, 0.5, 0.25]).expect("blob")]).expect("embedding");
        let mut changed = profile_request();
        changed.id = Some(saved.id.clone());
        changed.model = "new-model".to_string();
        let updated = save_profile(&mut conn, &secrets, changed).expect("change model");
        assert!(!updated.has_cloud_consent);
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM knowledge_chunk_embeddings WHERE profile_id = ?1",
                params![saved.id],
                |row| row.get(0),
            )
            .expect("embedding count");
        assert_eq!(count, 0);
    }

    #[test]
    fn configured_dimension_mismatch_rejects_vectors() {
        let vectors = vec![vec![0.2, 0.4, 0.6]];
        let failure =
            validate_vector_batch(&vectors, 1, Some(1024)).expect_err("dimension mismatch");
        assert_eq!(failure.code, "dimensions_mismatch");
    }

    #[test]
    fn batch_indexing_skips_unchanged_and_semantic_search_returns_top_k() {
        let mut conn = setup();
        conn.execute("INSERT INTO notes (id, title, is_favorite, updated_at) VALUES ('n', 'Semantic note', 0, '2026-01-01')", []).expect("note");
        for index in 0..3 {
            conn.execute("INSERT INTO knowledge_chunks (id, note_id, chunk_order, heading_path_json, content_markdown, content_text, content_hash, char_count, estimated_tokens, chunker_version, created_at, updated_at) VALUES (?1, 'n', ?2, '[]', ?3, ?3, ?4, 4, 1, 1, 'now', 'now')", params![format!("c{index}"), index, format!("text {index}"), format!("hash{index}")]).expect("chunk");
        }
        let secrets = MemorySecrets::default();
        let saved = save_profile(&mut conn, &secrets, profile_request()).expect("save profile");
        let profile = get_profile(&conn, &saved.id).expect("profile");
        let result = update_index(
            &mut conn,
            &profile,
            &secrets,
            &MockHttp,
            Arc::new(AtomicBool::new(false)),
            false,
        )
        .expect("index");
        assert_eq!(result.indexed_chunks, 3);
        let second = update_index(
            &mut conn,
            &profile,
            &secrets,
            &MockHttp,
            Arc::new(AtomicBool::new(false)),
            false,
        )
        .expect("second index");
        assert_eq!(second.indexed_chunks, 0);
        assert_eq!(second.skipped_chunks, 3);
        let request = SemanticSearchRequest {
            query: "meaning".to_string(),
            profile_id: saved.id,
            project_id: None,
            tag_id: None,
            include_archived: false,
            favorites_only: false,
            limit: 2,
            candidate_limit: 10,
            per_note_limit: 2,
            include_neighbors: true,
        };
        let results = semantic_search(&conn, &profile, &secrets, &MockHttp, &request)
            .expect("semantic search");
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|result| result.note_id == "n"));
    }

    #[test]
    fn cloud_indexing_requires_profile_specific_consent() {
        let mut conn = setup();
        let secrets = MemorySecrets::default();
        let mut request = profile_request();
        request.locality = "cloud".to_string();
        request.base_url = "https://example.invalid/v1".to_string();
        request.api_key = Some("secret".to_string());
        let saved = save_profile(&mut conn, &secrets, request).expect("save cloud profile");
        let profile = get_profile(&conn, &saved.id).expect("profile");
        assert!(update_index(
            &mut conn,
            &profile,
            &secrets,
            &MockHttp,
            Arc::new(AtomicBool::new(false)),
            false
        )
        .is_err());
        let profile = grant_cloud_consent(&conn, &saved.id).expect("grant consent");
        assert!(profile.cloud_consent_at.is_some());
    }

    #[test]
    fn changed_note_keeps_unchanged_chunk_vectors_and_indexes_only_new_hashes() {
        let mut conn = setup();
        conn.execute(
            "INSERT INTO notes (id, title, content_markdown, plain_text, is_favorite, updated_at)
             VALUES ('n', 'Incremental', '# A\n\nAlpha\n\n# B\n\nBeta', 'Alpha Beta', 0, '2026-01-01')",
            [],
        )
        .expect("note");
        knowledge::sync_note(&mut conn, "n").expect("initial chunks");
        let secrets = MemorySecrets::default();
        let saved = save_profile(&mut conn, &secrets, profile_request()).expect("save profile");
        let profile = get_profile(&conn, &saved.id).expect("profile");
        update_index(
            &mut conn,
            &profile,
            &secrets,
            &MockHttp,
            Arc::new(AtomicBool::new(false)),
            false,
        )
        .expect("initial embeddings");
        let initial_ids = {
            let mut statement = conn
                .prepare("SELECT chunk_id FROM knowledge_chunk_embeddings WHERE profile_id = ?1")
                .expect("embedding ids query");
            let rows = statement
                .query_map(params![saved.id], |row| row.get::<_, String>(0))
                .expect("embedding ids");
            rows.collect::<Result<HashSet<_>, _>>()
                .expect("collect embedding ids")
        };

        conn.execute(
            "UPDATE notes SET content_markdown = '# Intro\n\nNew\n\n# A\n\nAlpha\n\n# B\n\nBeta', plain_text = 'New Alpha Beta' WHERE id = 'n'",
            [],
        )
        .expect("change note");
        knowledge::sync_note(&mut conn, "n").expect("changed chunks");
        let preserved: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM knowledge_chunk_embeddings WHERE profile_id = ?1 AND chunk_id IN (
                    SELECT id FROM knowledge_chunks WHERE note_id = 'n'
                 )",
                params![saved.id],
                |row| row.get(0),
            )
            .expect("preserved embeddings");
        assert_eq!(preserved as usize, initial_ids.len());
        let result = update_index(
            &mut conn,
            &profile,
            &secrets,
            &MockHttp,
            Arc::new(AtomicBool::new(false)),
            false,
        )
        .expect("incremental embeddings");
        assert_eq!(result.indexed_chunks, 1);
        assert!(result.skipped_chunks >= preserved);
    }

    #[test]
    fn hybrid_retrieval_prioritizes_exact_titles_and_applies_filters_and_neighbors() {
        let mut conn = setup();
        conn.execute_batch(
            "INSERT INTO projects (id, title) VALUES ('p1', 'Research'), ('p2', 'Personal');
             INSERT INTO tags (id, name, color) VALUES ('t1', 'Space', 'blue');
             INSERT INTO notes (id, title, project_id, is_favorite, updated_at, archived_at) VALUES
                ('n1', 'Космический план', 'p1', 1, '2026-03-03', NULL),
                ('n2', 'Наблюдения', 'p2', 0, '2026-03-02', NULL),
                ('n3', 'Старый журнал', 'p1', 0, '2026-03-01', '2026-03-04');
             INSERT INTO note_tags (note_id, tag_id) VALUES ('n1', 't1');
             INSERT INTO knowledge_chunks (id, note_id, chunk_order, heading_path_json, content_markdown, content_text, content_hash, char_count, estimated_tokens, chunker_version, created_at, updated_at) VALUES
                ('c1', 'n1', 0, '[\"План\"]', 'unrelated body', 'unrelated body', 'h1', 14, 3, 1, 'now', 'now'),
                ('c1b', 'n1', 1, '[\"План\"]', 'next context', 'next context', 'h1b', 12, 3, 1, 'now', 'now'),
                ('c2', 'n2', 0, '[\"Телескоп\"]', 'лунная миссия', 'лунная миссия', 'h2', 13, 3, 1, 'now', 'now'),
                ('c3', 'n3', 0, '[]', 'лунная миссия архив', 'лунная миссия архив', 'h3', 19, 4, 1, 'now', 'now');",
        )
        .expect("retrieval fixtures");
        let secrets = MemorySecrets::default();
        let saved = save_profile(&mut conn, &secrets, profile_request()).expect("profile");
        let profile = get_profile(&conn, &saved.id).expect("stored profile");
        update_index(
            &mut conn,
            &profile,
            &secrets,
            &MockHttp,
            Arc::new(AtomicBool::new(false)),
            false,
        )
        .expect("index fixtures");

        let exact = hybrid_search(
            &conn,
            &profile,
            &secrets,
            &MockHttp,
            &search_request(&saved.id, "КОСМИЧЕСКИЙ ПЛАН"),
        )
        .expect("exact title search");
        assert_eq!(exact[0].note_id, "n1");
        assert_eq!(exact[0].match_type, "exact");
        assert_eq!(exact[0].neighboring_chunk_ids, vec!["c1b"]);

        let mut filtered = search_request(&saved.id, "лунная миссия");
        filtered.project_id = Some("p2".to_string());
        let project_results =
            hybrid_search(&conn, &profile, &secrets, &MockHttp, &filtered).expect("project filter");
        assert!(project_results.iter().all(|result| result.note_id == "n2"));
        assert!(project_results
            .iter()
            .any(|result| result.match_type == "hybrid"));

        filtered.project_id = None;
        filtered.tag_id = Some("t1".to_string());
        let tag_results =
            hybrid_search(&conn, &profile, &secrets, &MockHttp, &filtered).expect("tag filter");
        assert!(tag_results.iter().all(|result| result.note_id == "n1"));

        filtered.tag_id = None;
        let without_archive = hybrid_search(&conn, &profile, &secrets, &MockHttp, &filtered)
            .expect("archive excluded");
        assert!(without_archive.iter().all(|result| result.note_id != "n3"));
        filtered.include_archived = true;
        let with_archive = hybrid_search(&conn, &profile, &secrets, &MockHttp, &filtered)
            .expect("archive included");
        assert!(with_archive.iter().any(|result| result.note_id == "n3"));
    }

    #[test]
    fn retries_temporary_failures_once_but_never_retries_auth_and_hides_response_body() {
        let mut conn = setup();
        let secrets = MemorySecrets::default();
        let saved = save_profile(&mut conn, &secrets, profile_request()).expect("profile");
        let profile = get_profile(&conn, &saved.id).expect("stored profile");

        let temporary = SequenceHttp::new([503, 200]);
        let success = test_profile(&profile, &secrets, &temporary);
        assert_eq!(success.status, "success");
        assert_eq!(temporary.calls(), 2);

        let unauthorized = SequenceHttp::new([401, 200]);
        let failure = test_profile(&profile, &secrets, &unauthorized);
        assert_eq!(failure.status, "error");
        assert_eq!(failure.error_code.as_deref(), Some("unauthorized"));
        assert_eq!(unauthorized.calls(), 1);
        assert!(!failure.message.contains("private chunk text"));
        assert!(!failure.message.contains("provider debug"));
    }

    #[test]
    fn cancellation_partial_success_and_resume_preserve_content_and_sidecar() {
        let mut conn = setup();
        conn.execute_batch(
            "INSERT INTO notes (id, title, content_markdown, plain_text, is_favorite, updated_at)
                VALUES ('n', 'Durable', '# Canonical', 'Canonical', 0, '2026-01-01');
             INSERT INTO note_content_sidecars (note_id, kind, schema_version, payload_json, created_at, updated_at)
                VALUES ('n', 'editor_formatting', 1, '{\"table\":true}', 'now', 'now');
             INSERT INTO knowledge_chunks (id, note_id, chunk_order, heading_path_json, content_markdown, content_text, content_hash, char_count, estimated_tokens, chunker_version, created_at, updated_at) VALUES
                ('c0', 'n', 0, '[]', 'first', 'first', 'h0', 5, 1, 1, 'now', 'now'),
                ('c1', 'n', 1, '[]', 'second', 'second', 'h1', 6, 1, 1, 'now', 'now'),
                ('c2', 'n', 2, '[]', 'third', 'third', 'h2', 5, 1, 1, 'now', 'now');",
        )
        .expect("durability fixtures");
        let secrets = MemorySecrets::default();
        let mut request = profile_request();
        request.batch_size = 1;
        let saved = save_profile(&mut conn, &secrets, request).expect("profile");
        let profile = get_profile(&conn, &saved.id).expect("stored profile");

        let cancelled = update_index(
            &mut conn,
            &profile,
            &secrets,
            &MockHttp,
            Arc::new(AtomicBool::new(true)),
            false,
        )
        .expect("cancel before first batch");
        assert!(cancelled.cancelled);
        assert_eq!(cancelled.indexed_chunks, 0);

        let partial_http = SequenceHttp::new([200, 401]);
        let partial = update_index(
            &mut conn,
            &profile,
            &secrets,
            &partial_http,
            Arc::new(AtomicBool::new(false)),
            false,
        )
        .expect("partial update");
        assert_eq!(partial.indexed_chunks, 1);
        assert_eq!(partial.failed_chunks, 1);

        let resumed = update_index(
            &mut conn,
            &profile,
            &secrets,
            &MockHttp,
            Arc::new(AtomicBool::new(false)),
            false,
        )
        .expect("resume update");
        assert_eq!(resumed.indexed_chunks, 2);
        assert_eq!(resumed.status, "current");
        let content: String = conn
            .query_row(
                "SELECT content_markdown FROM notes WHERE id = 'n'",
                [],
                |row| row.get(0),
            )
            .expect("canonical markdown");
        let sidecar: String = conn
            .query_row(
                "SELECT payload_json FROM note_content_sidecars WHERE note_id = 'n'",
                [],
                |row| row.get(0),
            )
            .expect("sidecar");
        assert_eq!(content, "# Canonical");
        assert_eq!(sidecar, "{\"table\":true}");

        conn.execute("DELETE FROM knowledge_chunks WHERE id = 'c0'", [])
            .expect("delete chunk");
        let chunk_vector_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM knowledge_chunk_embeddings WHERE chunk_id = 'c0'",
                [],
                |row| row.get(0),
            )
            .expect("chunk cascade");
        assert_eq!(chunk_vector_count, 0);
        delete_profile(&mut conn, &secrets, &saved.id).expect("delete profile");
        let profile_vector_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM knowledge_chunk_embeddings",
                [],
                |row| row.get(0),
            )
            .expect("profile cascade");
        assert_eq!(profile_vector_count, 0);
    }

    #[test]
    fn local_profiles_reject_external_urls_before_network() {
        let mut conn = setup();
        let secrets = MemorySecrets::default();
        let mut request = profile_request();
        request.base_url = "https://embedding.example.com/v1".to_string();
        assert!(save_profile(&mut conn, &secrets, request).is_err());
    }

    #[test]
    fn exact_cosine_scan_and_hybrid_fusion_scale_to_one_hundred_thousand_candidates() {
        let query = vec![0.25_f32; 32];
        let vector = vec![0.5_f32; 32];
        for count in [1_000, 10_000, 50_000, 100_000] {
            let started = Instant::now();
            let mut best: f64 = -1.0;
            for _ in 0..count {
                let blob = serialize_vector(&vector).expect("serialize vector");
                let decoded = deserialize_vector(&blob, vector.len()).expect("deserialize vector");
                best = best.max(cosine_similarity(&query, &decoded).expect("cosine"));
            }
            assert!(best > 0.99);
            assert!(
                started.elapsed() < Duration::from_secs(5),
                "exact scan of {count} candidates exceeded five seconds"
            );
        }

        let conn = setup();
        let semantic = (0..50_000)
            .map(|index| SearchCandidate {
                chunk_id: format!("c{index}"),
                note_id: format!("n{index}"),
                note_title: format!("Note {index}"),
                heading_path: Vec::new(),
                content_text: "semantic candidate".to_string(),
                project: "Входящие".to_string(),
                project_id: None,
                archived: false,
                favorite: false,
                updated_at: "2026-01-01".to_string(),
                semantic_score: Some(0.8),
                exact_title: false,
            })
            .collect::<Vec<_>>();
        let lexical = semantic.iter().take(10_000).cloned().collect::<Vec<_>>();
        let started = Instant::now();
        let results = fuse_candidates(
            &conn,
            "candidate",
            &SemanticSearchRequest {
                query: "candidate".to_string(),
                profile_id: "profile".to_string(),
                project_id: None,
                tag_id: None,
                include_archived: false,
                favorites_only: false,
                limit: 30,
                candidate_limit: 50_000,
                per_note_limit: 3,
                include_neighbors: false,
            },
            semantic,
            lexical,
        )
        .expect("hybrid fusion");
        assert_eq!(results.len(), 30);
        assert!(results.iter().all(|result| result.match_type == "hybrid"));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn chunk_fts_with_project_and_tag_filters_is_fast_for_fifty_thousand_chunks() {
        let mut conn = setup();
        conn.execute_batch(
            "INSERT INTO projects (id, title) VALUES ('p', 'Performance');
             INSERT INTO tags (id, name, color) VALUES ('t', 'Indexed', 'blue');
             INSERT INTO notes (id, title, project_id, is_favorite, updated_at)
                VALUES ('n', 'Large note', 'p', 0, '2026-01-01');
             INSERT INTO note_tags (note_id, tag_id) VALUES ('n', 't');",
        )
        .expect("filter fixtures");
        let transaction = conn.transaction().expect("chunk transaction");
        {
            let mut insert = transaction
                .prepare("INSERT INTO knowledge_chunks (id, note_id, chunk_order, heading_path_json, content_markdown, content_text, content_hash, char_count, estimated_tokens, chunker_version, created_at, updated_at) VALUES (?1, 'n', ?2, '[]', ?3, ?3, ?4, 20, 4, 1, 'now', 'now')")
                .expect("chunk insert");
            for index in 0..50_000 {
                let content = if index == 42_000 {
                    "редкая семантическая игла".to_string()
                } else {
                    format!("обычный смысловой фрагмент {index}")
                };
                insert
                    .execute(params![
                        format!("c{index}"),
                        index,
                        content,
                        format!("h{index}")
                    ])
                    .expect("insert chunk");
            }
        }
        transaction.commit().expect("commit chunks");

        let mut request = search_request("profile", "семантическая игла");
        request.project_id = Some("p".to_string());
        request.tag_id = Some("t".to_string());
        let started = Instant::now();
        let results = lexical_candidates(&conn, &request.query, &request).expect("chunk FTS");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].chunk_id, "c42000");
        assert!(started.elapsed() < Duration::from_secs(5));
    }
}
