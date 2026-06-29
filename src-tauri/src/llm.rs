use crate::data::{DataError, DataResult};
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    io::Write,
    process::{Command, Stdio},
    time::Instant,
};
use uuid::Uuid;

const SECRET_SERVICE_NAME: &str = "NoteFlow LLM";
const STATUS_NOT_CONFIGURED: &str = "not_configured";
const STATUS_SUCCESS: &str = "success";
const STATUS_ERROR: &str = "error";
const LIST_MODELS_TIMEOUT_MS: i64 = 15_000;
const TEST_CONNECTION_TIMEOUT_MS: i64 = 10_000;

pub const LLM_PROVIDER_SCHEMA_SQL: &str = "
    CREATE TABLE IF NOT EXISTS llm_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key_ref TEXT,
        chat_model TEXT NOT NULL DEFAULT '',
        embedding_model TEXT NOT NULL DEFAULT '',
        models_endpoint TEXT NOT NULL DEFAULT '/models',
        chat_endpoint TEXT NOT NULL DEFAULT '/chat/completions',
        embeddings_endpoint TEXT NOT NULL DEFAULT '/embeddings',
        timeout_ms INTEGER NOT NULL DEFAULT 120000,
        context_size INTEGER NOT NULL DEFAULT 16384,
        temperature REAL NOT NULL DEFAULT 0.3,
        streaming_enabled INTEGER NOT NULL DEFAULT 1,
        custom_headers_json TEXT NOT NULL DEFAULT '{}',
        is_default INTEGER NOT NULL DEFAULT 0,
        last_status TEXT NOT NULL DEFAULT 'not_configured',
        status_message TEXT,
        last_checked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_llm_providers_default ON llm_providers(is_default);
    CREATE INDEX IF NOT EXISTS idx_llm_providers_type ON llm_providers(provider_type);
";

#[derive(Clone, Debug)]
pub struct LlmProviderRecord {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub api_key_ref: Option<String>,
    pub chat_model: String,
    pub embedding_model: String,
    pub models_endpoint: String,
    pub chat_endpoint: String,
    pub embeddings_endpoint: String,
    pub timeout_ms: i64,
    pub context_size: i64,
    pub temperature: f64,
    pub streaming_enabled: bool,
    pub custom_headers_json: String,
    pub is_default: bool,
    pub last_status: String,
    pub status_message: Option<String>,
    pub last_checked_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderDto {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub has_api_key: bool,
    pub chat_model: String,
    pub embedding_model: String,
    pub models_endpoint: String,
    pub chat_endpoint: String,
    pub embeddings_endpoint: String,
    pub timeout_ms: i64,
    pub context_size: i64,
    pub temperature: f64,
    pub streaming_enabled: bool,
    pub custom_headers_json: String,
    pub is_default: bool,
    pub last_status: String,
    pub status_message: Option<String>,
    pub last_checked_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_local: bool,
    pub privacy_notice: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLlmProviderRequest {
    pub id: Option<String>,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub api_key: Option<String>,
    #[serde(default)]
    pub delete_api_key: bool,
    pub chat_model: String,
    pub embedding_model: String,
    pub models_endpoint: String,
    pub chat_endpoint: String,
    pub embeddings_endpoint: String,
    pub timeout_ms: i64,
    pub context_size: i64,
    pub temperature: f64,
    pub streaming_enabled: bool,
    pub custom_headers_json: String,
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmKeyStatusDto {
    pub has_api_key: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModelsResultDto {
    pub status: String,
    pub message: String,
    pub models: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmConnectionTestResultDto {
    pub status: String,
    pub message: String,
    pub checked_at: String,
    pub models: Vec<String>,
    pub chat_ok: bool,
    pub embeddings_ok: bool,
    pub is_local: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LlmProviderBackup {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub chat_model: String,
    pub embedding_model: String,
    pub models_endpoint: String,
    pub chat_endpoint: String,
    pub embeddings_endpoint: String,
    pub timeout_ms: i64,
    pub context_size: i64,
    pub temperature: f64,
    pub streaming_enabled: bool,
    pub custom_headers_json: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub trait SecretStorage {
    fn set_secret(&self, secret_ref: &str, secret: &str) -> DataResult<()>;
    fn get_secret(&self, secret_ref: &str) -> DataResult<Option<String>>;
    fn delete_secret(&self, secret_ref: &str) -> DataResult<()>;

    fn has_secret(&self, secret_ref: &str) -> DataResult<bool> {
        self.get_secret(secret_ref).map(|secret| secret.is_some())
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemSecretStorage;

impl SecretStorage for SystemSecretStorage {
    fn set_secret(&self, secret_ref: &str, secret: &str) -> DataResult<()> {
        system_secret_storage::set_secret(secret_ref, secret)
    }

    fn get_secret(&self, secret_ref: &str) -> DataResult<Option<String>> {
        system_secret_storage::get_secret(secret_ref)
    }

    fn delete_secret(&self, secret_ref: &str) -> DataResult<()> {
        system_secret_storage::delete_secret(secret_ref)
    }
}

#[derive(Clone, Debug)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Value>,
    pub timeout_ms: i64,
}

#[derive(Clone, Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

pub trait HttpClient {
    fn send(&self, request: HttpRequest) -> DataResult<HttpResponse>;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct CurlHttpClient;

impl HttpClient for CurlHttpClient {
    fn send(&self, request: HttpRequest) -> DataResult<HttpResponse> {
        validate_http_url(&request.url)?;
        let timeout_seconds = ((request.timeout_ms.clamp(1000, 600_000) + 999) / 1000).max(1);
        let connect_timeout_seconds = timeout_seconds.clamp(1, 4);
        let mut config = String::new();
        config.push_str(&format!(
            "url = \"{}\"\n",
            escape_curl_config_value(&request.url)
        ));
        config.push_str(&format!(
            "request = \"{}\"\n",
            escape_curl_config_value(&request.method)
        ));
        config.push_str("header = \"Accept: application/json\"\n");
        for (name, value) in &request.headers {
            config.push_str(&format!(
                "header = \"{}: {}\"\n",
                escape_curl_config_value(name),
                escape_curl_config_value(value)
            ));
        }
        if let Some(body) = request.body {
            config.push_str("header = \"Content-Type: application/json\"\n");
            config.push_str(&format!(
                "data = \"{}\"\n",
                escape_curl_config_value(&body.to_string())
            ));
        }

        let mut child = Command::new(curl_binary_name())
            .arg("--silent")
            .arg("--show-error")
            .arg("--location")
            .arg("--max-time")
            .arg(timeout_seconds.to_string())
            .arg("--connect-timeout")
            .arg(connect_timeout_seconds.to_string())
            .arg("--write-out")
            .arg("\n%{http_code}")
            .arg("--config")
            .arg("-")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                DataError::InvalidInput(format!(
                    "HTTP-клиент недоступен: не удалось запустить curl ({error})"
                ))
            })?;

        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(config.as_bytes())?;
        }

        let output = child.wait_with_output()?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if !output.status.success() {
            return Err(DataError::InvalidInput(map_curl_error(&stderr)));
        }

        let (body, status_text) = stdout.rsplit_once('\n').ok_or_else(|| {
            DataError::InvalidInput("Некорректный ответ HTTP-клиента".to_string())
        })?;
        let status = status_text.trim().parse::<u16>().map_err(|_| {
            DataError::InvalidInput("Некорректный HTTP-статус от провайдера".to_string())
        })?;
        Ok(HttpResponse {
            status,
            body: body.to_string(),
        })
    }
}

pub fn list_providers<S: SecretStorage>(
    conn: &Connection,
    storage: &S,
) -> DataResult<Vec<LlmProviderDto>> {
    let records = query_provider_records(conn)?;
    records
        .into_iter()
        .map(|record| dto_from_record(record, storage))
        .collect()
}

pub fn get_provider_record(conn: &Connection, provider_id: &str) -> DataResult<LlmProviderRecord> {
    query_provider_record(conn, provider_id)
}

pub fn save_provider<S: SecretStorage>(
    conn: &mut Connection,
    storage: &S,
    request: SaveLlmProviderRequest,
) -> DataResult<LlmProviderDto> {
    let normalized = normalize_provider_request(request)?;
    let now = now_iso();
    let provider_id = normalized
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing = query_provider_record(conn, &provider_id).optional_for_not_found()?;
    let mut api_key_ref = existing
        .as_ref()
        .and_then(|record| record.api_key_ref.clone());
    let trimmed_key = normalized.api_key.as_deref().unwrap_or("").trim();

    if normalized.delete_api_key {
        if let Some(secret_ref) = &api_key_ref {
            storage.delete_secret(secret_ref)?;
        }
        api_key_ref = None;
    } else if !trimmed_key.is_empty() {
        let secret_ref = api_key_ref
            .clone()
            .unwrap_or_else(|| format!("noteflow.llm.{provider_id}.api_key"));
        storage.set_secret(&secret_ref, trimmed_key)?;
        api_key_ref = Some(secret_ref);
    }

    let was_empty = provider_count(conn)? == 0;
    let should_be_default = normalized.is_default || was_empty;
    let created_at = existing
        .as_ref()
        .map(|record| record.created_at.clone())
        .unwrap_or_else(|| now.clone());

    let transaction = conn.transaction()?;
    if should_be_default {
        transaction.execute("UPDATE llm_providers SET is_default = 0", [])?;
    }
    transaction.execute(
        "INSERT INTO llm_providers (
            id, name, provider_type, base_url, api_key_ref, chat_model, embedding_model,
            models_endpoint, chat_endpoint, embeddings_endpoint, timeout_ms, context_size,
            temperature, streaming_enabled, custom_headers_json, is_default, last_status,
            status_message, last_checked_at, created_at, updated_at
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
            ?16, ?17, NULL, NULL, ?18, ?19
         )
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            provider_type = excluded.provider_type,
            base_url = excluded.base_url,
            api_key_ref = excluded.api_key_ref,
            chat_model = excluded.chat_model,
            embedding_model = excluded.embedding_model,
            models_endpoint = excluded.models_endpoint,
            chat_endpoint = excluded.chat_endpoint,
            embeddings_endpoint = excluded.embeddings_endpoint,
            timeout_ms = excluded.timeout_ms,
            context_size = excluded.context_size,
            temperature = excluded.temperature,
            streaming_enabled = excluded.streaming_enabled,
            custom_headers_json = excluded.custom_headers_json,
            is_default = excluded.is_default,
            last_status = excluded.last_status,
            status_message = NULL,
            last_checked_at = NULL,
            updated_at = excluded.updated_at",
        params![
            provider_id,
            normalized.name,
            normalized.provider_type,
            normalized.base_url,
            api_key_ref,
            normalized.chat_model,
            normalized.embedding_model,
            normalized.models_endpoint,
            normalized.chat_endpoint,
            normalized.embeddings_endpoint,
            normalized.timeout_ms,
            normalized.context_size,
            normalized.temperature,
            normalized.streaming_enabled,
            normalized.custom_headers_json,
            should_be_default,
            STATUS_NOT_CONFIGURED,
            created_at,
            now
        ],
    )?;
    transaction.commit()?;

    let saved = query_provider_record(conn, &provider_id)?;
    dto_from_record(saved, storage)
}

pub fn delete_provider<S: SecretStorage>(
    conn: &mut Connection,
    storage: &S,
    provider_id: &str,
) -> DataResult<()> {
    let provider = query_provider_record(conn, provider_id)?;
    if let Some(secret_ref) = &provider.api_key_ref {
        storage.delete_secret(secret_ref)?;
    }

    let transaction = conn.transaction()?;
    transaction.execute(
        "DELETE FROM llm_providers WHERE id = ?1",
        params![provider_id],
    )?;
    if provider.is_default {
        transaction.execute(
            "UPDATE llm_providers
             SET is_default = 1
             WHERE id = (
                SELECT id FROM llm_providers ORDER BY updated_at DESC LIMIT 1
             )",
            [],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

pub fn set_default_provider<S: SecretStorage>(
    conn: &mut Connection,
    storage: &S,
    provider_id: &str,
) -> DataResult<LlmProviderDto> {
    query_provider_record(conn, provider_id)?;
    let transaction = conn.transaction()?;
    transaction.execute("UPDATE llm_providers SET is_default = 0", [])?;
    transaction.execute(
        "UPDATE llm_providers SET is_default = 1, updated_at = ?1 WHERE id = ?2",
        params![now_iso(), provider_id],
    )?;
    transaction.commit()?;

    dto_from_record(query_provider_record(conn, provider_id)?, storage)
}

pub fn delete_provider_key<S: SecretStorage>(
    conn: &mut Connection,
    storage: &S,
    provider_id: &str,
) -> DataResult<LlmProviderDto> {
    let provider = query_provider_record(conn, provider_id)?;
    if let Some(secret_ref) = &provider.api_key_ref {
        storage.delete_secret(secret_ref)?;
    }
    conn.execute(
        "UPDATE llm_providers
         SET api_key_ref = NULL, last_status = ?1, status_message = NULL, last_checked_at = NULL, updated_at = ?2
         WHERE id = ?3",
        params![STATUS_NOT_CONFIGURED, now_iso(), provider_id],
    )?;
    dto_from_record(query_provider_record(conn, provider_id)?, storage)
}

pub fn key_status<S: SecretStorage>(
    conn: &Connection,
    storage: &S,
    provider_id: &str,
) -> DataResult<LlmKeyStatusDto> {
    let provider = query_provider_record(conn, provider_id)?;
    Ok(LlmKeyStatusDto {
        has_api_key: provider
            .api_key_ref
            .as_deref()
            .map(|secret_ref| storage.has_secret(secret_ref))
            .transpose()?
            .unwrap_or(false),
    })
}

pub fn update_provider_status(
    conn: &mut Connection,
    provider_id: &str,
    result: &LlmConnectionTestResultDto,
) -> DataResult<()> {
    conn.execute(
        "UPDATE llm_providers
         SET last_status = ?1, status_message = ?2, last_checked_at = ?3, updated_at = ?3
         WHERE id = ?4",
        params![
            result.status,
            result.message,
            result.checked_at,
            provider_id
        ],
    )?;
    Ok(())
}

pub fn collect_provider_backups(conn: &Connection) -> DataResult<Vec<LlmProviderBackup>> {
    let mut statement = conn.prepare(
        "SELECT id, name, provider_type, base_url, chat_model, embedding_model,
                models_endpoint, chat_endpoint, embeddings_endpoint, timeout_ms, context_size,
                temperature, streaming_enabled, custom_headers_json, is_default, created_at, updated_at
         FROM llm_providers
         ORDER BY is_default DESC, lower(name)",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(LlmProviderBackup {
            id: row.get(0)?,
            name: row.get(1)?,
            provider_type: row.get(2)?,
            base_url: row.get(3)?,
            chat_model: row.get(4)?,
            embedding_model: row.get(5)?,
            models_endpoint: row.get(6)?,
            chat_endpoint: row.get(7)?,
            embeddings_endpoint: row.get(8)?,
            timeout_ms: row.get(9)?,
            context_size: row.get(10)?,
            temperature: row.get(11)?,
            streaming_enabled: row.get::<_, i64>(12)? != 0,
            custom_headers_json: row.get(13)?,
            is_default: row.get::<_, i64>(14)? != 0,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn import_provider_backups(
    conn: &Connection,
    providers: &[LlmProviderBackup],
) -> DataResult<()> {
    for provider in providers {
        let normalized_type = normalize_provider_type(&provider.provider_type)?;
        validate_http_url(&provider.base_url)?;
        validate_endpoint(&provider.models_endpoint, "Путь списка моделей")?;
        validate_endpoint(&provider.chat_endpoint, "Путь чата")?;
        validate_endpoint(&provider.embeddings_endpoint, "Путь embeddings")?;
        let headers_json = normalize_custom_headers_json(&provider.custom_headers_json)?;
        conn.execute(
            "INSERT INTO llm_providers (
                id, name, provider_type, base_url, api_key_ref, chat_model, embedding_model,
                models_endpoint, chat_endpoint, embeddings_endpoint, timeout_ms, context_size,
                temperature, streaming_enabled, custom_headers_json, is_default, last_status,
                status_message, last_checked_at, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, NULL, NULL, ?17, ?18)",
            params![
                provider.id,
                normalize_name(&provider.name)?,
                normalized_type,
                provider.base_url.trim(),
                provider.chat_model.trim(),
                provider.embedding_model.trim(),
                provider.models_endpoint.trim(),
                provider.chat_endpoint.trim(),
                provider.embeddings_endpoint.trim(),
                clamp_i64(provider.timeout_ms, 5000, 600000),
                clamp_i64(provider.context_size, 1024, 1048576),
                clamp_temperature(provider.temperature),
                provider.streaming_enabled,
                headers_json,
                provider.is_default,
                STATUS_NOT_CONFIGURED,
                provider.created_at,
                provider.updated_at
            ],
        )?;
    }
    ensure_default_provider(conn)?;
    Ok(())
}

pub fn list_models_for_provider<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
) -> DataResult<LlmModelsResultDto> {
    let budget = LlmOperationBudget::new(LIST_MODELS_TIMEOUT_MS, "получение списка моделей");
    let models = fetch_models(
        provider,
        storage,
        client,
        budget.request_timeout(provider.timeout_ms)?,
    )?;
    let message = if models.is_empty() {
        "Endpoint доступен, но список моделей пуст".to_string()
    } else {
        format!("Получено моделей: {}", models.len())
    };
    Ok(LlmModelsResultDto {
        status: STATUS_SUCCESS.to_string(),
        message,
        models,
    })
}

pub fn test_provider_connection<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
) -> DataResult<LlmConnectionTestResultDto> {
    let checked_at = now_iso();
    let budget = LlmOperationBudget::new(TEST_CONNECTION_TIMEOUT_MS, "проверка подключения");
    let models = fetch_models(
        provider,
        storage,
        client,
        budget.request_timeout(provider.timeout_ms)?,
    )?;
    let chat_ok = if provider.chat_model.trim().is_empty() {
        false
    } else {
        run_chat_probe(
            provider,
            storage,
            client,
            budget.request_timeout(provider.timeout_ms)?,
        )?;
        true
    };
    let embeddings_ok = if provider.embedding_model.trim().is_empty() {
        false
    } else {
        run_embeddings_probe(
            provider,
            storage,
            client,
            budget.request_timeout(provider.timeout_ms)?,
        )?;
        true
    };
    let message = if chat_ok || embeddings_ok {
        "Подключение успешно проверено".to_string()
    } else if models.is_empty() {
        "Endpoint доступен, но модели не найдены".to_string()
    } else {
        "Endpoint доступен, список моделей получен".to_string()
    };

    Ok(LlmConnectionTestResultDto {
        status: STATUS_SUCCESS.to_string(),
        message,
        checked_at,
        models,
        chat_ok,
        embeddings_ok,
        is_local: is_local_base_url(&provider.base_url),
    })
}

pub fn connection_error_result(
    provider: &LlmProviderRecord,
    error: DataError,
) -> LlmConnectionTestResultDto {
    LlmConnectionTestResultDto {
        status: STATUS_ERROR.to_string(),
        message: error.to_string(),
        checked_at: now_iso(),
        models: Vec::new(),
        chat_ok: false,
        embeddings_ok: false,
        is_local: is_local_base_url(&provider.base_url),
    }
}

pub fn models_error_result(error: DataError) -> LlmModelsResultDto {
    LlmModelsResultDto {
        status: STATUS_ERROR.to_string(),
        message: error.to_string(),
        models: Vec::new(),
    }
}

fn query_provider_records(conn: &Connection) -> DataResult<Vec<LlmProviderRecord>> {
    let mut statement = conn.prepare(
        "SELECT id, name, provider_type, base_url, api_key_ref, chat_model, embedding_model,
                models_endpoint, chat_endpoint, embeddings_endpoint, timeout_ms, context_size,
                temperature, streaming_enabled, custom_headers_json, is_default, last_status,
                status_message, last_checked_at, created_at, updated_at
         FROM llm_providers
         ORDER BY is_default DESC, lower(name), updated_at DESC",
    )?;
    let rows = statement.query_map([], provider_record_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn query_provider_record(conn: &Connection, provider_id: &str) -> DataResult<LlmProviderRecord> {
    conn.query_row(
        "SELECT id, name, provider_type, base_url, api_key_ref, chat_model, embedding_model,
                models_endpoint, chat_endpoint, embeddings_endpoint, timeout_ms, context_size,
                temperature, streaming_enabled, custom_headers_json, is_default, last_status,
                status_message, last_checked_at, created_at, updated_at
         FROM llm_providers
         WHERE id = ?1",
        params![provider_id],
        provider_record_from_row,
    )
    .optional()?
    .ok_or_else(|| DataError::NotFound("Подключение LLM не найдено".to_string()))
}

fn provider_record_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LlmProviderRecord> {
    Ok(LlmProviderRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        provider_type: row.get(2)?,
        base_url: row.get(3)?,
        api_key_ref: row.get(4)?,
        chat_model: row.get(5)?,
        embedding_model: row.get(6)?,
        models_endpoint: row.get(7)?,
        chat_endpoint: row.get(8)?,
        embeddings_endpoint: row.get(9)?,
        timeout_ms: row.get(10)?,
        context_size: row.get(11)?,
        temperature: row.get(12)?,
        streaming_enabled: row.get::<_, i64>(13)? != 0,
        custom_headers_json: row.get(14)?,
        is_default: row.get::<_, i64>(15)? != 0,
        last_status: row.get(16)?,
        status_message: row.get(17)?,
        last_checked_at: row.get(18)?,
        created_at: row.get(19)?,
        updated_at: row.get(20)?,
    })
}

fn dto_from_record<S: SecretStorage>(
    record: LlmProviderRecord,
    storage: &S,
) -> DataResult<LlmProviderDto> {
    let has_api_key = record
        .api_key_ref
        .as_deref()
        .map(|secret_ref| storage.has_secret(secret_ref))
        .transpose()?
        .unwrap_or(false);
    let is_local = is_local_base_url(&record.base_url);
    Ok(LlmProviderDto {
        id: record.id,
        name: record.name,
        provider_type: record.provider_type,
        base_url: record.base_url,
        has_api_key,
        chat_model: record.chat_model,
        embedding_model: record.embedding_model,
        models_endpoint: record.models_endpoint,
        chat_endpoint: record.chat_endpoint,
        embeddings_endpoint: record.embeddings_endpoint,
        timeout_ms: record.timeout_ms,
        context_size: record.context_size,
        temperature: record.temperature,
        streaming_enabled: record.streaming_enabled,
        custom_headers_json: record.custom_headers_json,
        is_default: record.is_default,
        last_status: record.last_status,
        status_message: record.status_message,
        last_checked_at: record.last_checked_at,
        created_at: record.created_at,
        updated_at: record.updated_at,
        is_local,
        privacy_notice: privacy_notice(is_local),
    })
}

fn provider_count(conn: &Connection) -> DataResult<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM llm_providers", [], |row| row.get(0))?)
}

fn ensure_default_provider(conn: &Connection) -> DataResult<()> {
    let has_default: i64 = conn.query_row(
        "SELECT COUNT(*) FROM llm_providers WHERE is_default = 1",
        [],
        |row| row.get(0),
    )?;
    if has_default == 0 {
        conn.execute(
            "UPDATE llm_providers
             SET is_default = 1
             WHERE id = (SELECT id FROM llm_providers ORDER BY updated_at DESC LIMIT 1)",
            [],
        )?;
    }
    Ok(())
}

fn normalize_provider_request(
    request: SaveLlmProviderRequest,
) -> DataResult<SaveLlmProviderRequest> {
    let provider_type = normalize_provider_type(&request.provider_type)?;
    validate_http_url(&request.base_url)?;
    validate_endpoint(&request.models_endpoint, "Путь списка моделей")?;
    validate_endpoint(&request.chat_endpoint, "Путь чата")?;
    validate_endpoint(&request.embeddings_endpoint, "Путь embeddings")?;
    let custom_headers_json = normalize_custom_headers_json(&request.custom_headers_json)?;

    Ok(SaveLlmProviderRequest {
        id: request.id.filter(|id| !id.trim().is_empty()),
        name: normalize_name(&request.name)?,
        provider_type,
        base_url: request.base_url.trim().trim_end_matches('/').to_string(),
        api_key: request.api_key,
        delete_api_key: request.delete_api_key,
        chat_model: request.chat_model.trim().to_string(),
        embedding_model: request.embedding_model.trim().to_string(),
        models_endpoint: request.models_endpoint.trim().to_string(),
        chat_endpoint: request.chat_endpoint.trim().to_string(),
        embeddings_endpoint: request.embeddings_endpoint.trim().to_string(),
        timeout_ms: clamp_i64(request.timeout_ms, 5000, 600000),
        context_size: clamp_i64(request.context_size, 1024, 1048576),
        temperature: clamp_temperature(request.temperature),
        streaming_enabled: request.streaming_enabled,
        custom_headers_json,
        is_default: request.is_default,
    })
}

fn normalize_provider_type(provider_type: &str) -> DataResult<String> {
    match provider_type.trim() {
        "openai" | "ollama" | "lmstudio" | "custom" => Ok(provider_type.trim().to_string()),
        _ => Err(DataError::InvalidInput(
            "Неизвестный тип LLM-провайдера".to_string(),
        )),
    }
}

fn normalize_name(name: &str) -> DataResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        Err(DataError::InvalidInput(
            "Название подключения не может быть пустым".to_string(),
        ))
    } else {
        Ok(trimmed.to_string())
    }
}

fn validate_http_url(url: &str) -> DataResult<()> {
    let trimmed = url.trim();
    let without_scheme = if let Some(rest) = trimmed.strip_prefix("http://") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("https://") {
        rest
    } else {
        return Err(DataError::InvalidInput(
            "Base URL должен начинаться с http:// или https://".to_string(),
        ));
    };

    let host = without_scheme
        .split(['/', ':', '?', '#'])
        .next()
        .unwrap_or_default();
    if host.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return Err(DataError::InvalidInput("Некорректный Base URL".to_string()));
    }
    Ok(())
}

fn validate_endpoint(endpoint: &str, field_name: &str) -> DataResult<()> {
    let trimmed = endpoint.trim();
    if trimmed.starts_with('/') && !trimmed.chars().any(char::is_whitespace) {
        Ok(())
    } else {
        Err(DataError::InvalidInput(format!(
            "{field_name} должен начинаться с / и не содержать пробелов"
        )))
    }
}

fn normalize_custom_headers_json(value: &str) -> DataResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok("{}".to_string());
    }
    let parsed: Value = serde_json::from_str(trimmed)?;
    let object = parsed.as_object().ok_or_else(|| {
        DataError::InvalidInput("Дополнительные заголовки должны быть JSON-объектом".to_string())
    })?;
    let mut normalized = BTreeMap::new();
    for (key, value) in object {
        validate_custom_header(key, value)?;
        let header_value = value
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| value.to_string());
        normalized.insert(key.trim().to_string(), header_value);
    }
    serde_json::to_string(&normalized).map_err(DataError::from)
}

fn validate_custom_header(key: &str, value: &Value) -> DataResult<()> {
    let lower_key = key.trim().to_ascii_lowercase();
    let looks_secret = lower_key == "authorization"
        || lower_key.contains("api-key")
        || lower_key.contains("apikey")
        || lower_key.contains("token")
        || lower_key.contains("secret")
        || lower_key.ends_with("-key");
    if looks_secret {
        return Err(DataError::InvalidInput(
            "Секретные HTTP-заголовки нельзя хранить в открытом виде на этом этапе".to_string(),
        ));
    }
    if let Some(text) = value.as_str() {
        let lower_value = text.trim().to_ascii_lowercase();
        if lower_value.starts_with("bearer ") || lower_value.starts_with("sk-") {
            return Err(DataError::InvalidInput(
                "Похоже, дополнительный заголовок содержит секрет. Используйте поле API key"
                    .to_string(),
            ));
        }
    }
    Ok(())
}

fn clamp_i64(value: i64, min: i64, max: i64) -> i64 {
    value.max(min).min(max)
}

fn clamp_temperature(value: f64) -> f64 {
    if value.is_nan() {
        0.3
    } else {
        value.clamp(0.0, 2.0)
    }
}

struct LlmOperationBudget {
    started_at: Instant,
    timeout_ms: i64,
    label: &'static str,
}

impl LlmOperationBudget {
    fn new(timeout_ms: i64, label: &'static str) -> Self {
        Self {
            started_at: Instant::now(),
            timeout_ms,
            label,
        }
    }

    fn request_timeout(&self, provider_timeout_ms: i64) -> DataResult<i64> {
        let elapsed_ms = self.started_at.elapsed().as_millis() as i64;
        let remaining_ms = self.timeout_ms.saturating_sub(elapsed_ms);
        if remaining_ms <= 0 {
            return Err(operation_timeout_error(self.label));
        }
        Ok(provider_timeout_ms.clamp(1, 600_000).min(remaining_ms))
    }
}

fn operation_timeout_error(label: &str) -> DataError {
    DataError::InvalidInput(format!(
        "Timeout: {label} не завершилась вовремя. Проверьте, запущена ли локальная модель и доступен ли endpoint."
    ))
}

fn fetch_models<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
    timeout_ms: i64,
) -> DataResult<Vec<String>> {
    let url = join_url(&provider.base_url, &provider.models_endpoint)?;
    let response = client.send(HttpRequest {
        method: "GET".to_string(),
        url,
        headers: provider_headers(provider, storage)?,
        body: None,
        timeout_ms,
    })?;
    ensure_success_status(response.status, &response.body)?;
    parse_models_response(&provider.provider_type, &response.body)
}

fn run_chat_probe<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
    timeout_ms: i64,
) -> DataResult<()> {
    let body = if provider.provider_type == "ollama" {
        json!({
            "model": provider.chat_model,
            "prompt": "ping",
            "stream": false
        })
    } else {
        json!({
            "model": provider.chat_model,
            "messages": [{ "role": "user", "content": "ping" }],
            "temperature": 0,
            "max_tokens": 1,
            "stream": false
        })
    };
    let response = client.send(HttpRequest {
        method: "POST".to_string(),
        url: join_url(&provider.base_url, &provider.chat_endpoint)?,
        headers: provider_headers(provider, storage)?,
        body: Some(body),
        timeout_ms,
    })?;
    ensure_success_status(response.status, &response.body)
}

fn run_embeddings_probe<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
    timeout_ms: i64,
) -> DataResult<()> {
    let body = if provider.provider_type == "ollama" {
        json!({
            "model": provider.embedding_model,
            "prompt": "ping"
        })
    } else {
        json!({
            "model": provider.embedding_model,
            "input": "ping"
        })
    };
    let response = client.send(HttpRequest {
        method: "POST".to_string(),
        url: join_url(&provider.base_url, &provider.embeddings_endpoint)?,
        headers: provider_headers(provider, storage)?,
        body: Some(body),
        timeout_ms,
    })?;
    ensure_success_status(response.status, &response.body)
}

fn provider_headers<S: SecretStorage>(
    provider: &LlmProviderRecord,
    storage: &S,
) -> DataResult<Vec<(String, String)>> {
    let mut headers = parse_custom_headers(&provider.custom_headers_json)?;
    if let Some(secret_ref) = &provider.api_key_ref {
        if let Some(api_key) = storage.get_secret(secret_ref)? {
            headers.push(("Authorization".to_string(), format!("Bearer {api_key}")));
        }
    }
    Ok(headers)
}

fn parse_custom_headers(value: &str) -> DataResult<Vec<(String, String)>> {
    let parsed: Value = serde_json::from_str(value)?;
    let object = parsed.as_object().ok_or_else(|| {
        DataError::InvalidInput("Дополнительные заголовки должны быть JSON-объектом".to_string())
    })?;
    Ok(object
        .iter()
        .map(|(key, value)| {
            (
                key.to_string(),
                value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string()),
            )
        })
        .collect())
}

fn parse_models_response(provider_type: &str, body: &str) -> DataResult<Vec<String>> {
    let value: Value = serde_json::from_str(body).map_err(|_| {
        DataError::InvalidInput("Провайдер вернул некорректный JSON со списком моделей".to_string())
    })?;
    let mut models = Vec::new();

    if let Some(items) = value.get("data").and_then(Value::as_array) {
        collect_model_ids(items, &mut models);
    }
    if let Some(items) = value.get("models").and_then(Value::as_array) {
        collect_model_ids(items, &mut models);
    }
    if let Some(items) = value.as_array() {
        collect_model_ids(items, &mut models);
    }

    models.sort();
    models.dedup();
    if models.is_empty() && provider_type != "ollama" {
        return Err(DataError::InvalidInput(
            "Ответ провайдера не содержит список моделей".to_string(),
        ));
    }
    Ok(models)
}

fn collect_model_ids(items: &[Value], models: &mut Vec<String>) {
    for item in items {
        if let Some(id) = item.as_str() {
            models.push(id.to_string());
        } else if let Some(id) = item.get("id").and_then(Value::as_str) {
            models.push(id.to_string());
        } else if let Some(name) = item.get("name").and_then(Value::as_str) {
            models.push(name.to_string());
        } else if let Some(model) = item.get("model").and_then(Value::as_str) {
            models.push(model.to_string());
        }
    }
}

fn ensure_success_status(status: u16, body: &str) -> DataResult<()> {
    if (200..300).contains(&status) {
        return Ok(());
    }
    let message = match status {
        401 => "401 Unauthorized: проверьте API key".to_string(),
        403 => "403 Forbidden: доступ запрещён провайдером".to_string(),
        404 => "404 Not Found: проверьте Base URL и endpoint".to_string(),
        408 | 504 => "Timeout: провайдер не ответил вовремя".to_string(),
        _ if body.to_ascii_lowercase().contains("model") => {
            format!("{status}: модель не найдена или недоступна")
        }
        _ => format!("{status}: провайдер вернул ошибку"),
    };
    Err(DataError::InvalidInput(message))
}

fn join_url(base_url: &str, endpoint: &str) -> DataResult<String> {
    validate_http_url(base_url)?;
    validate_endpoint(endpoint, "Endpoint")?;
    Ok(format!(
        "{}/{}",
        base_url.trim().trim_end_matches('/'),
        endpoint.trim().trim_start_matches('/')
    ))
}

fn is_local_base_url(base_url: &str) -> bool {
    let without_scheme = base_url
        .trim()
        .strip_prefix("http://")
        .or_else(|| base_url.trim().strip_prefix("https://"))
        .unwrap_or_default();
    let host = without_scheme
        .trim_start_matches('[')
        .split([']', '/', ':'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1" | "0.0.0.0")
}

fn privacy_notice(is_local: bool) -> String {
    if is_local {
        "Локальный endpoint: данные остаются на устройстве, если сервер действительно запущен локально."
            .to_string()
    } else {
        "Внешний endpoint: при использовании модели выбранный контекст будет отправлен провайдеру."
            .to_string()
    }
}

fn escape_curl_config_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn map_curl_error(stderr: &str) -> String {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("timed out") || lower.contains("timeout") {
        "Timeout: провайдер не ответил вовремя".to_string()
    } else if lower.contains("failed to connect")
        || lower.contains("could not connect")
        || lower.contains("connection refused")
    {
        "Локальный endpoint недоступен или соединение отклонено".to_string()
    } else if stderr.trim().is_empty() {
        "Не удалось выполнить HTTP-запрос к провайдеру".to_string()
    } else {
        "Ошибка HTTP-клиента: провайдер недоступен или вернул сетевую ошибку".to_string()
    }
}

fn curl_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "curl.exe"
    } else {
        "curl"
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

trait OptionalForNotFound<T> {
    fn optional_for_not_found(self) -> DataResult<Option<T>>;
}

impl<T> OptionalForNotFound<T> for DataResult<T> {
    fn optional_for_not_found(self) -> DataResult<Option<T>> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(DataError::NotFound(_)) => Ok(None),
            Err(error) => Err(error),
        }
    }
}

#[cfg(target_os = "windows")]
mod system_secret_storage {
    use super::{DataError, DataResult, SECRET_SERVICE_NAME};
    use std::{ffi::c_void, ptr};

    const CRED_TYPE_GENERIC: u32 = 1;
    const CRED_PERSIST_LOCAL_MACHINE: u32 = 2;
    const ERROR_NOT_FOUND: u32 = 1168;

    #[repr(C)]
    struct FileTime {
        low_date_time: u32,
        high_date_time: u32,
    }

    #[repr(C)]
    struct CredentialW {
        flags: u32,
        type_: u32,
        target_name: *mut u16,
        comment: *mut u16,
        last_written: FileTime,
        credential_blob_size: u32,
        credential_blob: *mut u8,
        persist: u32,
        attribute_count: u32,
        attributes: *mut c_void,
        target_alias: *mut u16,
        user_name: *mut u16,
    }

    #[link(name = "Advapi32")]
    extern "system" {
        fn CredWriteW(credential: *const CredentialW, flags: u32) -> i32;
        fn CredReadW(
            target_name: *const u16,
            type_: u32,
            flags: u32,
            credential: *mut *mut CredentialW,
        ) -> i32;
        fn CredDeleteW(target_name: *const u16, type_: u32, flags: u32) -> i32;
        fn CredFree(buffer: *mut c_void);
    }

    #[link(name = "Kernel32")]
    extern "system" {
        fn GetLastError() -> u32;
    }

    pub fn set_secret(secret_ref: &str, secret: &str) -> DataResult<()> {
        let mut target_name = to_wide(&target_name(secret_ref));
        let mut user_name = to_wide(SECRET_SERVICE_NAME);
        let mut secret_bytes = secret.as_bytes().to_vec();
        let credential = CredentialW {
            flags: 0,
            type_: CRED_TYPE_GENERIC,
            target_name: target_name.as_mut_ptr(),
            comment: ptr::null_mut(),
            last_written: FileTime {
                low_date_time: 0,
                high_date_time: 0,
            },
            credential_blob_size: secret_bytes.len() as u32,
            credential_blob: secret_bytes.as_mut_ptr(),
            persist: CRED_PERSIST_LOCAL_MACHINE,
            attribute_count: 0,
            attributes: ptr::null_mut(),
            target_alias: ptr::null_mut(),
            user_name: user_name.as_mut_ptr(),
        };
        let ok = unsafe { CredWriteW(&credential, 0) };
        if ok == 0 {
            return Err(windows_error("Credential Manager не сохранил API key"));
        }
        Ok(())
    }

    pub fn get_secret(secret_ref: &str) -> DataResult<Option<String>> {
        let target_name = to_wide(&target_name(secret_ref));
        let mut credential_ptr: *mut CredentialW = ptr::null_mut();
        let ok = unsafe {
            CredReadW(
                target_name.as_ptr(),
                CRED_TYPE_GENERIC,
                0,
                &mut credential_ptr,
            )
        };
        if ok == 0 {
            let code = unsafe { GetLastError() };
            if code == ERROR_NOT_FOUND {
                return Ok(None);
            }
            return Err(windows_error("Credential Manager не вернул API key"));
        }
        let result = unsafe {
            let credential = &*credential_ptr;
            let bytes = std::slice::from_raw_parts(
                credential.credential_blob,
                credential.credential_blob_size as usize,
            );
            String::from_utf8(bytes.to_vec()).map_err(|_| {
                DataError::InvalidInput(
                    "Credential Manager вернул ключ в неподдерживаемой кодировке".to_string(),
                )
            })
        };
        unsafe { CredFree(credential_ptr.cast::<c_void>()) };
        result.map(Some)
    }

    pub fn delete_secret(secret_ref: &str) -> DataResult<()> {
        let target_name = to_wide(&target_name(secret_ref));
        let ok = unsafe { CredDeleteW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ok == 0 {
            let code = unsafe { GetLastError() };
            if code == ERROR_NOT_FOUND {
                return Ok(());
            }
            return Err(windows_error("Credential Manager не удалил API key"));
        }
        Ok(())
    }

    fn target_name(secret_ref: &str) -> String {
        format!("NoteFlow:{secret_ref}")
    }

    fn to_wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn windows_error(prefix: &str) -> DataError {
        let code = unsafe { GetLastError() };
        DataError::InvalidInput(format!("{prefix}. Код Windows: {code}"))
    }
}

#[cfg(target_os = "macos")]
mod system_secret_storage {
    use super::{DataError, DataResult, SECRET_SERVICE_NAME};
    use std::{ffi::c_void, ptr};

    const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

    #[link(name = "Security", kind = "framework")]
    extern "C" {
        fn SecKeychainAddGenericPassword(
            keychain: *mut c_void,
            service_name_length: u32,
            service_name: *const i8,
            account_name_length: u32,
            account_name: *const i8,
            password_length: u32,
            password_data: *const c_void,
            item_ref: *mut *mut c_void,
        ) -> i32;
        fn SecKeychainFindGenericPassword(
            keychain: *mut c_void,
            service_name_length: u32,
            service_name: *const i8,
            account_name_length: u32,
            account_name: *const i8,
            password_length: *mut u32,
            password_data: *mut *mut c_void,
            item_ref: *mut *mut c_void,
        ) -> i32;
        fn SecKeychainItemModifyAttributesAndData(
            item_ref: *mut c_void,
            attr_list: *const c_void,
            length: u32,
            data: *const c_void,
        ) -> i32;
        fn SecKeychainItemDelete(item_ref: *mut c_void) -> i32;
        fn SecKeychainItemFreeContent(attr_list: *mut c_void, data: *mut c_void) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
    }

    pub fn set_secret(secret_ref: &str, secret: &str) -> DataResult<()> {
        let service = SECRET_SERVICE_NAME.as_bytes();
        let account = secret_ref.as_bytes();
        let secret_bytes = secret.as_bytes();
        let mut item_ref: *mut c_void = ptr::null_mut();
        let find_status = unsafe {
            SecKeychainFindGenericPassword(
                ptr::null_mut(),
                service.len() as u32,
                service.as_ptr().cast::<i8>(),
                account.len() as u32,
                account.as_ptr().cast::<i8>(),
                ptr::null_mut(),
                ptr::null_mut(),
                &mut item_ref,
            )
        };

        let status = if find_status == ERR_SEC_ITEM_NOT_FOUND {
            unsafe {
                SecKeychainAddGenericPassword(
                    ptr::null_mut(),
                    service.len() as u32,
                    service.as_ptr().cast::<i8>(),
                    account.len() as u32,
                    account.as_ptr().cast::<i8>(),
                    secret_bytes.len() as u32,
                    secret_bytes.as_ptr().cast::<c_void>(),
                    ptr::null_mut(),
                )
            }
        } else if find_status == 0 {
            let status = unsafe {
                SecKeychainItemModifyAttributesAndData(
                    item_ref,
                    ptr::null(),
                    secret_bytes.len() as u32,
                    secret_bytes.as_ptr().cast::<c_void>(),
                )
            };
            unsafe { CFRelease(item_ref.cast_const()) };
            status
        } else {
            find_status
        };

        if status == 0 {
            Ok(())
        } else {
            Err(macos_error("Keychain не сохранил API key", status))
        }
    }

    pub fn get_secret(secret_ref: &str) -> DataResult<Option<String>> {
        let service = SECRET_SERVICE_NAME.as_bytes();
        let account = secret_ref.as_bytes();
        let mut length: u32 = 0;
        let mut data: *mut c_void = ptr::null_mut();
        let mut item_ref: *mut c_void = ptr::null_mut();
        let status = unsafe {
            SecKeychainFindGenericPassword(
                ptr::null_mut(),
                service.len() as u32,
                service.as_ptr().cast::<i8>(),
                account.len() as u32,
                account.as_ptr().cast::<i8>(),
                &mut length,
                &mut data,
                &mut item_ref,
            )
        };
        if status == ERR_SEC_ITEM_NOT_FOUND {
            return Ok(None);
        }
        if status != 0 {
            return Err(macos_error("Keychain не вернул API key", status));
        }
        let result = unsafe {
            let bytes = std::slice::from_raw_parts(data.cast::<u8>(), length as usize);
            String::from_utf8(bytes.to_vec()).map_err(|_| {
                DataError::InvalidInput(
                    "Keychain вернул ключ в неподдерживаемой кодировке".to_string(),
                )
            })
        };
        unsafe {
            SecKeychainItemFreeContent(ptr::null_mut(), data);
            CFRelease(item_ref.cast_const());
        }
        result.map(Some)
    }

    pub fn delete_secret(secret_ref: &str) -> DataResult<()> {
        let service = SECRET_SERVICE_NAME.as_bytes();
        let account = secret_ref.as_bytes();
        let mut item_ref: *mut c_void = ptr::null_mut();
        let status = unsafe {
            SecKeychainFindGenericPassword(
                ptr::null_mut(),
                service.len() as u32,
                service.as_ptr().cast::<i8>(),
                account.len() as u32,
                account.as_ptr().cast::<i8>(),
                ptr::null_mut(),
                ptr::null_mut(),
                &mut item_ref,
            )
        };
        if status == ERR_SEC_ITEM_NOT_FOUND {
            return Ok(());
        }
        if status != 0 {
            return Err(macos_error("Keychain не нашёл API key", status));
        }
        let delete_status = unsafe { SecKeychainItemDelete(item_ref) };
        unsafe { CFRelease(item_ref.cast_const()) };
        if delete_status == 0 {
            Ok(())
        } else {
            Err(macos_error("Keychain не удалил API key", delete_status))
        }
    }

    fn macos_error(prefix: &str, status: i32) -> DataError {
        DataError::InvalidInput(format!("{prefix}. Код macOS: {status}"))
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod system_secret_storage {
    use super::{DataError, DataResult};

    pub fn set_secret(_secret_ref: &str, _secret: &str) -> DataResult<()> {
        Err(unavailable())
    }

    pub fn get_secret(_secret_ref: &str) -> DataResult<Option<String>> {
        Err(unavailable())
    }

    pub fn delete_secret(_secret_ref: &str) -> DataResult<()> {
        Err(unavailable())
    }

    fn unavailable() -> DataError {
        DataError::InvalidInput(
            "Защищённое хранилище API-ключей поддерживается на Windows и macOS".to_string(),
        )
    }
}

#[cfg(test)]
#[derive(Default)]
pub struct MemorySecretStorage {
    secrets: std::sync::Mutex<BTreeMap<String, String>>,
}

#[cfg(test)]
impl SecretStorage for MemorySecretStorage {
    fn set_secret(&self, secret_ref: &str, secret: &str) -> DataResult<()> {
        self.secrets
            .lock()
            .map_err(|_| DataError::State("Тестовое хранилище секретов недоступно".to_string()))?
            .insert(secret_ref.to_string(), secret.to_string());
        Ok(())
    }

    fn get_secret(&self, secret_ref: &str) -> DataResult<Option<String>> {
        Ok(self
            .secrets
            .lock()
            .map_err(|_| DataError::State("Тестовое хранилище секретов недоступно".to_string()))?
            .get(secret_ref)
            .cloned())
    }

    fn delete_secret(&self, secret_ref: &str) -> DataResult<()> {
        self.secrets
            .lock()
            .map_err(|_| DataError::State("Тестовое хранилище секретов недоступно".to_string()))?
            .remove(secret_ref);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MockHttpClient {
        requests: std::sync::Mutex<Vec<HttpRequest>>,
        responses: std::sync::Mutex<Vec<HttpResponse>>,
    }

    impl MockHttpClient {
        fn with_responses(responses: Vec<HttpResponse>) -> Self {
            Self {
                requests: std::sync::Mutex::new(Vec::new()),
                responses: std::sync::Mutex::new(responses),
            }
        }

        fn requests(&self) -> Vec<HttpRequest> {
            self.requests.lock().expect("mock requests lock").clone()
        }
    }

    impl HttpClient for MockHttpClient {
        fn send(&self, request: HttpRequest) -> DataResult<HttpResponse> {
            self.requests
                .lock()
                .map_err(|_| DataError::State("mock http unavailable".to_string()))?
                .push(request);
            let mut responses = self
                .responses
                .lock()
                .map_err(|_| DataError::State("mock http unavailable".to_string()))?;
            if responses.is_empty() {
                return Err(DataError::InvalidInput("no mock response".to_string()));
            }
            Ok(responses.remove(0))
        }
    }

    fn provider_record() -> LlmProviderRecord {
        LlmProviderRecord {
            id: "provider-1".to_string(),
            name: "Test".to_string(),
            provider_type: "openai".to_string(),
            base_url: "http://localhost:8080/v1".to_string(),
            api_key_ref: Some("secret-ref".to_string()),
            chat_model: "gpt-test".to_string(),
            embedding_model: "embed-test".to_string(),
            models_endpoint: "/models".to_string(),
            chat_endpoint: "/chat/completions".to_string(),
            embeddings_endpoint: "/embeddings".to_string(),
            timeout_ms: 5000,
            context_size: 4096,
            temperature: 0.3,
            streaming_enabled: true,
            custom_headers_json: "{}".to_string(),
            is_default: true,
            last_status: STATUS_NOT_CONFIGURED.to_string(),
            status_message: None,
            last_checked_at: None,
            created_at: now_iso(),
            updated_at: now_iso(),
        }
    }

    #[test]
    fn parses_openai_model_response() {
        let models = parse_models_response("openai", r#"{"data":[{"id":"gpt-a"},{"id":"gpt-b"}]}"#)
            .expect("models parse");

        assert_eq!(models, vec!["gpt-a".to_string(), "gpt-b".to_string()]);
    }

    #[test]
    fn rejects_secret_custom_headers() {
        let error = normalize_custom_headers_json(r#"{"Authorization":"Bearer sk-test"}"#)
            .expect_err("secret header rejected");

        assert!(error.to_string().contains("Секретные HTTP-заголовки"));
    }

    #[test]
    fn adapter_runs_model_chat_and_embedding_checks() {
        let storage = MemorySecretStorage::default();
        storage
            .set_secret("secret-ref", "sk-test")
            .expect("secret saved");
        let http = MockHttpClient::with_responses(vec![
            HttpResponse {
                status: 200,
                body: r#"{"data":[{"id":"gpt-test"},{"id":"embed-test"}]}"#.to_string(),
            },
            HttpResponse {
                status: 200,
                body: r#"{"choices":[{"message":{"content":"ok"}}]}"#.to_string(),
            },
            HttpResponse {
                status: 200,
                body: r#"{"data":[{"embedding":[0.1]}]}"#.to_string(),
            },
        ]);

        let result = test_provider_connection(&provider_record(), &storage, &http)
            .expect("connection tested");

        assert_eq!(result.status, STATUS_SUCCESS);
        assert!(result.chat_ok);
        assert!(result.embeddings_ok);
        assert_eq!(
            result.models,
            vec!["embed-test".to_string(), "gpt-test".to_string()]
        );
    }

    #[test]
    fn list_models_uses_bounded_operation_timeout() {
        let mut provider = provider_record();
        provider.timeout_ms = 120_000;
        let storage = MemorySecretStorage::default();
        let http = MockHttpClient::with_responses(vec![HttpResponse {
            status: 200,
            body: r#"{"data":[{"id":"gpt-test"}]}"#.to_string(),
        }]);

        let result = list_models_for_provider(&provider, &storage, &http).expect("models listed");

        assert_eq!(result.status, STATUS_SUCCESS);
        let requests = http.requests();
        assert_eq!(requests.len(), 1);
        assert!(requests[0].timeout_ms <= LIST_MODELS_TIMEOUT_MS);
        assert!(requests[0].timeout_ms > 0);
    }

    #[test]
    fn test_connection_uses_bounded_operation_timeout() {
        let mut provider = provider_record();
        provider.timeout_ms = 120_000;
        let storage = MemorySecretStorage::default();
        storage
            .set_secret("secret-ref", "sk-test")
            .expect("secret saved");
        let http = MockHttpClient::with_responses(vec![
            HttpResponse {
                status: 200,
                body: r#"{"data":[{"id":"gpt-test"},{"id":"embed-test"}]}"#.to_string(),
            },
            HttpResponse {
                status: 200,
                body: r#"{"choices":[{"message":{"content":"ok"}}]}"#.to_string(),
            },
            HttpResponse {
                status: 200,
                body: r#"{"data":[{"embedding":[0.1]}]}"#.to_string(),
            },
        ]);

        let result =
            test_provider_connection(&provider, &storage, &http).expect("connection tested");

        assert_eq!(result.status, STATUS_SUCCESS);
        let requests = http.requests();
        assert_eq!(requests.len(), 3);
        assert!(requests
            .iter()
            .all(|request| request.timeout_ms > 0
                && request.timeout_ms <= TEST_CONNECTION_TIMEOUT_MS));
    }

    #[test]
    fn maps_unauthorized_status_to_safe_error() {
        let error = ensure_success_status(401, r#"{"error":"bad key"}"#)
            .expect_err("unauthorized is error");

        assert!(error.to_string().contains("401 Unauthorized"));
        assert!(!error.to_string().contains("bad key"));
    }

    #[test]
    fn detects_local_endpoints() {
        assert!(is_local_base_url("http://localhost:11434"));
        assert!(is_local_base_url("http://127.0.0.1:1234/v1"));
        assert!(!is_local_base_url("https://api.example.com/v1"));
    }
}
