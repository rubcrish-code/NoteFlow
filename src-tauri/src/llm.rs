use crate::data::{DataError, DataResult};
use crate::provider_url::{is_local_destination, normalize_provider_url, ProviderLocality};
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
const NOTE_AI_TIMEOUT_MS: i64 = 45_000;
const RAG_AI_TIMEOUT_MS: i64 = 120_000;
const NOTE_AI_CONTEXT_LIMIT: usize = 24_000;
const NOTE_AI_HARD_CONTEXT_LIMIT: usize = 120_000;
const NOTE_AI_SELECTED_LIMIT: usize = 12_000;
const NOTE_AI_QUESTION_LIMIT: usize = 3_000;
pub(crate) const OPENAI_COMPATIBLE_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const OPENAI_COMPATIBLE_TEST_MAX_TOKENS: i64 = 512;
const OPENAI_COMPATIBLE_NOTE_AI_MAX_TOKENS: i64 = 2048;

pub fn diagnostic_url(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|parsed| {
            parsed
                .host_str()
                .map(|host| format!("{}://{host}", parsed.scheme()))
        })
        .unwrap_or_else(|| "<invalid-provider-url>".to_string())
}

pub fn log_llm_diagnostic(event: &str, fields: &[(&str, String)]) {
    #[cfg(debug_assertions)]
    {
        let rendered = fields
            .iter()
            .filter(|(key, _)| {
                matches!(
                    *key,
                    "command"
                        | "providerType"
                        | "status"
                        | "modelsCount"
                        | "chatOk"
                        | "embeddingsOk"
                        | "timeoutMs"
                        | "maxTokens"
                        | "hasContent"
                        | "hasReasoning"
                        | "operation"
                )
            })
            .map(|(key, value)| {
                let safe_value = value.replace(['\r', '\n', '\t'], " ");
                format!("{key}={safe_value}")
            })
            .collect::<Vec<_>>()
            .join(" ");
        eprintln!("[NoteFlow LLM] {event} {rendered}");
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = event;
        let _ = fields;
    }
}

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftLlmProviderRequest {
    #[serde(default)]
    pub provider_id: Option<String>,
    pub provider_type: String,
    pub base_url: String,
    pub api_key: Option<String>,
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
    pub options: Vec<ModelDiscoveryOptionDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelDiscoveryOptionDto {
    pub id: String,
    pub supports_chat: Option<bool>,
    pub supports_embeddings: Option<bool>,
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
#[serde(rename_all = "camelCase")]
pub struct NoteAiStatusDto {
    pub has_provider: bool,
    pub provider_name: Option<String>,
    pub model: Option<String>,
    pub is_local: bool,
    pub privacy_scope: String,
    pub privacy_accepted: bool,
    pub privacy_notice: String,
    pub can_use: bool,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAiContextDto {
    pub note_id: String,
    pub title: String,
    pub note_date: String,
    pub project: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub plain_text: String,
    pub content_markdown: String,
    pub selected_text: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAiRequestDto {
    pub kind: String,
    pub action_id: Option<String>,
    pub scope: String,
    pub question: Option<String>,
    pub context: NoteAiContextDto,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAiResponseDto {
    pub status: String,
    pub message: String,
    pub response: String,
    pub provider_name: String,
    pub model: String,
    pub is_local: bool,
}

#[derive(Debug)]
struct NoteAiPrompt {
    system: String,
    user: String,
}

#[derive(Clone, Debug)]
pub struct ChatCompletionMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug)]
pub struct ChatCompletionRequest {
    pub system: String,
    pub messages: Vec<ChatCompletionMessage>,
    pub max_output_tokens: i64,
    pub operation_label: &'static str,
}

#[derive(Clone, Debug)]
pub struct ChatCompletionResponse {
    pub content: String,
    pub provider_name: String,
    pub model: String,
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

#[derive(Clone, Debug, Default)]
struct OperationSecretStorage {
    secret_ref: Option<String>,
    secret: Option<String>,
}

impl OperationSecretStorage {
    fn from_api_key(api_key: Option<String>) -> Self {
        let trimmed_key = api_key.unwrap_or_default().trim().to_string();
        if trimmed_key.is_empty() {
            Self::default()
        } else {
            Self {
                secret_ref: Some("noteflow.llm.draft.api_key".to_string()),
                secret: Some(trimmed_key),
            }
        }
    }

    fn secret_ref(&self) -> Option<String> {
        self.secret_ref.clone()
    }
}

impl SecretStorage for OperationSecretStorage {
    fn set_secret(&self, _secret_ref: &str, _secret: &str) -> DataResult<()> {
        Err(DataError::State(
            "Operation secret storage is read-only".to_string(),
        ))
    }

    fn get_secret(&self, secret_ref: &str) -> DataResult<Option<String>> {
        if self.secret_ref.as_deref() == Some(secret_ref) {
            Ok(self.secret.clone())
        } else {
            Ok(None)
        }
    }

    fn delete_secret(&self, _secret_ref: &str) -> DataResult<()> {
        Ok(())
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
        let url = normalize_provider_url(&request.url, ProviderLocality::Local)?;
        if !matches!(request.method.as_str(), "GET" | "POST") {
            return Err(DataError::InvalidInput(
                "Неподдерживаемый HTTP-метод".to_string(),
            ));
        }
        let timeout_seconds = ((request.timeout_ms.clamp(1000, 600_000) + 999) / 1000).max(1);
        let connect_timeout_seconds = timeout_seconds.clamp(1, 4);
        let mut config = String::new();
        config.push_str(&format!("url = \"{}\"\n", escape_curl_config_value(&url)));
        config.push_str(&format!(
            "request = \"{}\"\n",
            escape_curl_config_value(&request.method)
        ));
        config.push_str("header = \"Accept: application/json\"\n");
        for (name, value) in &request.headers {
            validate_request_header(name, value)?;
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

        let mut child = curl_command(&url, timeout_seconds, connect_timeout_seconds)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| DataError::InvalidInput("HTTP-клиент недоступен".to_string()))?;

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

pub fn get_default_provider_record(conn: &Connection) -> DataResult<Option<LlmProviderRecord>> {
    query_default_provider_record(conn)
}

#[cfg(test)]
pub fn list_models_for_draft<H: HttpClient>(
    request: DraftLlmProviderRequest,
    client: &H,
) -> DataResult<LlmModelsResultDto> {
    list_models_for_draft_with_saved_key(request, None, client)
}

pub fn list_models_for_draft_with_saved_key<H: HttpClient>(
    request: DraftLlmProviderRequest,
    saved_api_key: Option<String>,
    client: &H,
) -> DataResult<LlmModelsResultDto> {
    let (provider, storage) = draft_provider_record(request, saved_api_key)?;
    list_models_for_provider(&provider, &storage, client)
}

pub fn test_draft_provider_connection<H: HttpClient>(
    request: DraftLlmProviderRequest,
    client: &H,
) -> DataResult<LlmConnectionTestResultDto> {
    let (provider, storage) = draft_provider_record(request, None)?;
    test_provider_connection(&provider, &storage, client)
}

pub fn note_ai_status<S: SecretStorage>(
    provider: Option<&LlmProviderRecord>,
    privacy_accepted: bool,
    storage: &S,
) -> DataResult<NoteAiStatusDto> {
    let Some(provider) = provider else {
        return Ok(NoteAiStatusDto {
            has_provider: false,
            provider_name: None,
            model: None,
            is_local: true,
            privacy_scope: "local".to_string(),
            privacy_accepted,
            privacy_notice: "Выберите default LLM provider в настройках моделей.".to_string(),
            can_use: false,
            message: "Default LLM provider не выбран".to_string(),
        });
    };

    let is_local = is_local_base_url(&provider.base_url);
    let has_required_key = is_local || provider_has_api_key(provider, storage)?;
    let has_model = !provider.chat_model.trim().is_empty();
    let message = if !has_model {
        "Для чата не выбрана модель".to_string()
    } else if !has_required_key {
        "Для внешнего провайдера нужен API key".to_string()
    } else if !privacy_accepted {
        "Перед первым AI-запросом подтвердите предупреждение о передаче текста".to_string()
    } else {
        "AI по текущей заметке готов".to_string()
    };

    Ok(NoteAiStatusDto {
        has_provider: true,
        provider_name: Some(provider.name.clone()),
        model: Some(provider.chat_model.clone()),
        is_local,
        privacy_scope: privacy_scope_for_provider(provider).to_string(),
        privacy_accepted,
        privacy_notice: privacy_notice(is_local),
        can_use: has_model && has_required_key && privacy_accepted,
        message,
    })
}

pub fn privacy_scope_for_provider(provider: &LlmProviderRecord) -> &'static str {
    if is_local_base_url(&provider.base_url) {
        "local"
    } else {
        "external"
    }
}

pub fn run_note_ai_request<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
    request: NoteAiRequestDto,
) -> DataResult<NoteAiResponseDto> {
    ensure_note_ai_provider_ready(provider, storage)?;
    let prompt = build_note_ai_prompt(&request)?;
    let budget = LlmOperationBudget::new(NOTE_AI_TIMEOUT_MS, "AI-запрос по текущей заметке");
    let headers = provider_headers(provider, storage)?;
    let url = join_url(&provider.base_url, &provider.chat_endpoint)?;
    let timeout_ms = budget.request_timeout(provider.timeout_ms)?;
    log_llm_diagnostic(
        "note_ai_request",
        &[
            ("providerType", provider.provider_type.clone()),
            ("baseUrl", diagnostic_url(&provider.base_url)),
            ("endpointPath", provider.chat_endpoint.clone()),
            ("url", diagnostic_url(&url)),
            (
                "hasAuthorization",
                has_header(&headers, "Authorization").to_string(),
            ),
            (
                "hasUserAgent",
                has_header(&headers, "User-Agent").to_string(),
            ),
            ("timeoutMs", timeout_ms.to_string()),
            (
                "maxTokens",
                note_ai_max_tokens(provider).unwrap_or(0).to_string(),
            ),
        ],
    );
    let response = client.send(HttpRequest {
        method: "POST".to_string(),
        url,
        headers,
        body: Some(note_ai_request_body(provider, &prompt)),
        timeout_ms,
    })?;
    let metadata = openai_response_metadata(&response.body);
    log_llm_diagnostic(
        "note_ai_response",
        &[
            ("providerType", provider.provider_type.clone()),
            ("endpointPath", provider.chat_endpoint.clone()),
            ("status", response.status.to_string()),
            ("finishReason", metadata.finish_reason.unwrap_or_default()),
            ("hasContent", metadata.has_content.to_string()),
            ("hasReasoning", metadata.has_reasoning.to_string()),
        ],
    );
    ensure_success_status(response.status, &response.body)?;
    let generated = parse_note_ai_response(&provider.provider_type, &response.body)?;

    Ok(NoteAiResponseDto {
        status: STATUS_SUCCESS.to_string(),
        message: "Ответ модели получен".to_string(),
        response: generated,
        provider_name: provider.name.clone(),
        model: provider.chat_model.clone(),
        is_local: is_local_base_url(&provider.base_url),
    })
}

pub fn run_chat_completion<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
    request: &ChatCompletionRequest,
) -> DataResult<ChatCompletionResponse> {
    ensure_note_ai_provider_ready(provider, storage)?;
    if request.system.trim().is_empty() || request.messages.is_empty() {
        return Err(DataError::InvalidInput(
            "Контекст AI-запроса не подготовлен".to_string(),
        ));
    }
    if request.messages.iter().any(|message| {
        !matches!(message.role.as_str(), "assistant" | "user") || message.content.trim().is_empty()
    }) {
        return Err(DataError::InvalidInput(
            "История AI-запроса содержит некорректное сообщение".to_string(),
        ));
    }

    let budget = LlmOperationBudget::new(RAG_AI_TIMEOUT_MS, request.operation_label);
    let headers = provider_headers(provider, storage)?;
    let url = join_url(&provider.base_url, &provider.chat_endpoint)?;
    let timeout_ms = budget.request_timeout(provider.timeout_ms)?;
    let max_output_tokens = request.max_output_tokens.clamp(256, 8_192);
    log_llm_diagnostic(
        "chat_completion_request",
        &[
            ("operation", request.operation_label.to_string()),
            ("providerType", provider.provider_type.clone()),
            ("baseUrl", diagnostic_url(&provider.base_url)),
            ("endpointPath", provider.chat_endpoint.clone()),
            ("url", diagnostic_url(&url)),
            (
                "hasAuthorization",
                has_header(&headers, "Authorization").to_string(),
            ),
            (
                "hasUserAgent",
                has_header(&headers, "User-Agent").to_string(),
            ),
            ("messageCount", request.messages.len().to_string()),
            ("timeoutMs", timeout_ms.to_string()),
            ("maxTokens", max_output_tokens.to_string()),
        ],
    );
    let response = client.send(HttpRequest {
        method: "POST".to_string(),
        url,
        headers,
        body: Some(chat_completion_request_body(
            provider,
            request,
            max_output_tokens,
        )),
        timeout_ms,
    })?;
    let metadata = openai_response_metadata(&response.body);
    log_llm_diagnostic(
        "chat_completion_response",
        &[
            ("operation", request.operation_label.to_string()),
            ("providerType", provider.provider_type.clone()),
            ("endpointPath", provider.chat_endpoint.clone()),
            ("status", response.status.to_string()),
            ("finishReason", metadata.finish_reason.unwrap_or_default()),
            ("hasContent", metadata.has_content.to_string()),
            ("hasReasoning", metadata.has_reasoning.to_string()),
        ],
    );
    ensure_success_status(response.status, &response.body)?;
    let content = parse_note_ai_response(&provider.provider_type, &response.body)?;
    Ok(ChatCompletionResponse {
        content,
        provider_name: provider.name.clone(),
        model: provider.chat_model.clone(),
        is_local: is_local_base_url(&provider.base_url),
    })
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
    let mut providers = rows.collect::<Result<Vec<_>, _>>()?;
    for provider in &mut providers {
        provider.custom_headers_json =
            safe_custom_headers_for_backup(&provider.custom_headers_json);
    }
    Ok(providers)
}

pub fn import_provider_backups(
    conn: &Connection,
    providers: &[LlmProviderBackup],
) -> DataResult<()> {
    for provider in providers {
        let normalized_type = normalize_provider_type(&provider.provider_type)?;
        normalize_provider_url(&provider.base_url, ProviderLocality::Local)?;
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
    let options = match fetch_model_catalog(
        provider,
        storage,
        client,
        budget.request_timeout(provider.timeout_ms)?,
    ) {
        Ok(models) => models,
        Err(error) if is_openai_compatible_provider(provider) => {
            log_llm_diagnostic(
                "models_unavailable_manual_entry_allowed",
                &[
                    ("providerType", provider.provider_type.clone()),
                    ("baseUrl", diagnostic_url(&provider.base_url)),
                    ("endpointPath", provider.models_endpoint.clone()),
                    ("error", safe_diagnostic_error(&error)),
                ],
            );
            return Ok(LlmModelsResultDto {
                status: STATUS_ERROR.to_string(),
                message: "Не удалось получить список моделей. Введите название модели вручную."
                    .to_string(),
                models: Vec::new(),
                options: Vec::new(),
            });
        }
        Err(error) => return Err(error),
    };
    let models = options
        .iter()
        .map(|option| option.id.clone())
        .collect::<Vec<_>>();
    let message = if models.is_empty() {
        "Endpoint доступен, но список моделей пуст".to_string()
    } else {
        format!("Получено моделей: {}", models.len())
    };
    Ok(LlmModelsResultDto {
        status: STATUS_SUCCESS.to_string(),
        message,
        models,
        options,
    })
}

pub fn test_provider_connection<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
) -> DataResult<LlmConnectionTestResultDto> {
    if is_openai_compatible_provider(provider) {
        return test_openai_compatible_connection(provider, storage, client);
    }

    let checked_at = now_iso();
    let budget = LlmOperationBudget::new(TEST_CONNECTION_TIMEOUT_MS, "проверка подключения");
    let models = fetch_models(
        provider,
        storage,
        client,
        budget.request_timeout(provider.timeout_ms)?,
    )?;
    let chat_ok = model_is_listed(&models, &provider.chat_model);
    let embeddings_ok = model_is_listed(&models, &provider.embedding_model);
    let message = if chat_ok || embeddings_ok {
        "Подключение успешно проверено".to_string()
    } else if models.is_empty() {
        "Endpoint доступен, но модели не найдены".to_string()
    } else if !provider.chat_model.trim().is_empty() || !provider.embedding_model.trim().is_empty()
    {
        "Endpoint доступен, но выбранная модель не найдена в списке".to_string()
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

fn test_openai_compatible_connection<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
) -> DataResult<LlmConnectionTestResultDto> {
    let checked_at = now_iso();
    let budget = LlmOperationBudget::new(TEST_CONNECTION_TIMEOUT_MS, "проверка подключения");
    let models = match fetch_models(
        provider,
        storage,
        client,
        budget.request_timeout(provider.timeout_ms)?,
    ) {
        Ok(models) => models,
        Err(error) => {
            log_llm_diagnostic(
                "models_unavailable_falling_back_to_chat_probe",
                &[
                    ("providerType", provider.provider_type.clone()),
                    ("baseUrl", diagnostic_url(&provider.base_url)),
                    ("endpointPath", provider.models_endpoint.clone()),
                    ("error", safe_diagnostic_error(&error)),
                ],
            );
            Vec::new()
        }
    };

    if provider.chat_model.trim().is_empty() {
        return Err(DataError::InvalidInput(
            "Для проверки OpenAI-compatible подключения укажите chat model вручную".to_string(),
        ));
    }
    if !is_local_base_url(&provider.base_url) && !provider_has_api_key(provider, storage)? {
        return Err(DataError::InvalidInput(
            "API key missing: для внешнего LLM provider нужен сохранённый ключ".to_string(),
        ));
    }

    let timeout_ms = budget.request_timeout(provider.timeout_ms)?;
    let headers = provider_headers(provider, storage)?;
    let url = join_url(&provider.base_url, &provider.chat_endpoint)?;
    log_llm_diagnostic(
        "chat_probe_request",
        &[
            ("providerType", provider.provider_type.clone()),
            ("baseUrl", diagnostic_url(&provider.base_url)),
            ("endpointPath", provider.chat_endpoint.clone()),
            ("url", diagnostic_url(&url)),
            (
                "hasAuthorization",
                has_header(&headers, "Authorization").to_string(),
            ),
            (
                "hasUserAgent",
                has_header(&headers, "User-Agent").to_string(),
            ),
            ("timeoutMs", timeout_ms.to_string()),
            ("maxTokens", OPENAI_COMPATIBLE_TEST_MAX_TOKENS.to_string()),
        ],
    );
    let response = client.send(HttpRequest {
        method: "POST".to_string(),
        url,
        headers,
        body: Some(openai_compatible_connection_test_body(provider)),
        timeout_ms,
    })?;
    let metadata = openai_response_metadata(&response.body);
    log_llm_diagnostic(
        "chat_probe_response",
        &[
            ("providerType", provider.provider_type.clone()),
            ("endpointPath", provider.chat_endpoint.clone()),
            ("status", response.status.to_string()),
            ("finishReason", metadata.finish_reason.unwrap_or_default()),
            ("hasContent", metadata.has_content.to_string()),
            ("hasReasoning", metadata.has_reasoning.to_string()),
        ],
    );
    ensure_success_status(response.status, &response.body)?;

    let chat_ok = true;
    let embeddings_ok = model_is_listed(&models, &provider.embedding_model);
    let message = if models.is_empty() {
        "Подключение успешно проверено через chat completions. Список моделей недоступен; используйте ручной ввод модели."
            .to_string()
    } else if model_is_listed(&models, &provider.chat_model)
        || provider.chat_model.trim().is_empty()
    {
        "Подключение успешно проверено".to_string()
    } else {
        "Chat endpoint доступен. Выбранная модель проверена запросом, но не найдена в /models."
            .to_string()
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
        message: crate::data::safe_command_message(error),
        checked_at: now_iso(),
        models: Vec::new(),
        chat_ok: false,
        embeddings_ok: false,
        is_local: is_local_base_url(&provider.base_url),
    }
}

pub fn connection_error_result_for_base_url(
    base_url: &str,
    error: DataError,
) -> LlmConnectionTestResultDto {
    LlmConnectionTestResultDto {
        status: STATUS_ERROR.to_string(),
        message: crate::data::safe_command_message(error),
        checked_at: now_iso(),
        models: Vec::new(),
        chat_ok: false,
        embeddings_ok: false,
        is_local: is_local_base_url(base_url),
    }
}

pub fn models_error_result(error: DataError) -> LlmModelsResultDto {
    LlmModelsResultDto {
        status: STATUS_ERROR.to_string(),
        message: crate::data::safe_command_message(error),
        models: Vec::new(),
        options: Vec::new(),
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

fn query_default_provider_record(conn: &Connection) -> DataResult<Option<LlmProviderRecord>> {
    conn.query_row(
        "SELECT id, name, provider_type, base_url, api_key_ref, chat_model, embedding_model,
                models_endpoint, chat_endpoint, embeddings_endpoint, timeout_ms, context_size,
                temperature, streaming_enabled, custom_headers_json, is_default, last_status,
                status_message, last_checked_at, created_at, updated_at
         FROM llm_providers
         WHERE is_default = 1
         ORDER BY updated_at DESC
         LIMIT 1",
        [],
        provider_record_from_row,
    )
    .optional()
    .map_err(DataError::from)
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
    let base_url = normalize_provider_base_url(&provider_type, &request.base_url)?;
    validate_endpoint(&request.models_endpoint, "Путь списка моделей")?;
    validate_endpoint(&request.chat_endpoint, "Путь чата")?;
    validate_endpoint(&request.embeddings_endpoint, "Путь embeddings")?;
    let custom_headers_json = normalize_custom_headers_json(&request.custom_headers_json)?;

    Ok(SaveLlmProviderRequest {
        id: request.id.filter(|id| !id.trim().is_empty()),
        name: normalize_name(&request.name)?,
        provider_type,
        base_url,
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

fn normalize_draft_provider_request(
    request: DraftLlmProviderRequest,
) -> DataResult<DraftLlmProviderRequest> {
    let provider_type = normalize_provider_type(&request.provider_type)?;
    let base_url = normalize_provider_base_url(&provider_type, &request.base_url)?;
    validate_endpoint(&request.models_endpoint, "Путь списка моделей")?;
    validate_endpoint(&request.chat_endpoint, "Путь чата")?;
    validate_endpoint(&request.embeddings_endpoint, "Путь embeddings")?;
    let custom_headers_json = normalize_custom_headers_json(&request.custom_headers_json)?;

    Ok(DraftLlmProviderRequest {
        provider_id: request.provider_id.filter(|id| !id.trim().is_empty()),
        provider_type,
        base_url,
        api_key: request.api_key,
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
    })
}

fn draft_provider_record(
    request: DraftLlmProviderRequest,
    saved_api_key: Option<String>,
) -> DataResult<(LlmProviderRecord, OperationSecretStorage)> {
    let normalized = normalize_draft_provider_request(request)?;
    let operation_api_key = normalized
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(str::to_string)
        .or(saved_api_key);
    let storage = OperationSecretStorage::from_api_key(operation_api_key);
    let now = now_iso();
    let provider = LlmProviderRecord {
        id: "draft-provider".to_string(),
        name: "Draft provider".to_string(),
        provider_type: normalized.provider_type,
        base_url: normalized.base_url,
        api_key_ref: storage.secret_ref(),
        chat_model: normalized.chat_model,
        embedding_model: normalized.embedding_model,
        models_endpoint: normalized.models_endpoint,
        chat_endpoint: normalized.chat_endpoint,
        embeddings_endpoint: normalized.embeddings_endpoint,
        timeout_ms: normalized.timeout_ms,
        context_size: normalized.context_size,
        temperature: normalized.temperature,
        streaming_enabled: normalized.streaming_enabled,
        custom_headers_json: normalized.custom_headers_json,
        is_default: false,
        last_status: STATUS_NOT_CONFIGURED.to_string(),
        status_message: None,
        last_checked_at: None,
        created_at: now.clone(),
        updated_at: now,
    };
    Ok((provider, storage))
}

fn normalize_provider_type(provider_type: &str) -> DataResult<String> {
    match provider_type.trim() {
        "openai" | "ollama" | "lmstudio" | "custom" => Ok(provider_type.trim().to_string()),
        _ => Err(DataError::InvalidInput(
            "Неизвестный тип LLM-провайдера".to_string(),
        )),
    }
}

fn normalize_provider_base_url(provider_type: &str, base_url: &str) -> DataResult<String> {
    let locality = if matches!(provider_type, "ollama" | "lmstudio" | "custom") {
        ProviderLocality::Local
    } else {
        ProviderLocality::Cloud
    };
    let mut normalized = normalize_provider_url(base_url, locality)?;

    if provider_type == "ollama" {
        if ends_with_path_segment(&normalized, "v1") {
            return Err(DataError::InvalidInput(
                "Для Ollama используйте адрес без /v1, например http://127.0.0.1:11434".to_string(),
            ));
        }
        if ends_with_path_segment(&normalized, "api") {
            normalized = strip_last_path_segment(&normalized);
        }
    } else if is_openai_compatible_provider_type(provider_type) {
        normalized = strip_endpoint_suffix(&normalized, "/chat/completions");
    }

    normalize_provider_url(&normalized, locality)?;
    Ok(normalized)
}

fn ends_with_path_segment(value: &str, segment: &str) -> bool {
    value
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .is_some_and(|last| last.eq_ignore_ascii_case(segment))
}

fn strip_last_path_segment(value: &str) -> String {
    value
        .trim_end_matches('/')
        .rsplit_once('/')
        .map(|(head, _)| head.to_string())
        .unwrap_or_else(|| value.trim_end_matches('/').to_string())
}

fn strip_endpoint_suffix(value: &str, endpoint: &str) -> String {
    let trimmed_value = value.trim_end_matches('/');
    let normalized_endpoint = endpoint.trim().trim_matches('/').to_ascii_lowercase();
    let normalized_value = trimmed_value.to_ascii_lowercase();
    let suffix = format!("/{normalized_endpoint}");
    if normalized_value.ends_with(&suffix) {
        trimmed_value[..trimmed_value.len() - suffix.len()].to_string()
    } else {
        trimmed_value.to_string()
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
    normalize_provider_url(url, ProviderLocality::Local).map(|_| ())
}

fn validate_endpoint(endpoint: &str, field_name: &str) -> DataResult<()> {
    let trimmed = endpoint.trim();
    if trimmed.starts_with('/')
        && !trimmed.starts_with("//")
        && !trimmed.contains("..")
        && !trimmed.contains(['?', '#', '\\'])
        && !trimmed.chars().any(char::is_whitespace)
    {
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

fn safe_custom_headers_for_backup(value: &str) -> String {
    let Ok(Value::Object(object)) = serde_json::from_str::<Value>(value) else {
        return "{}".to_string();
    };
    let mut safe_headers = BTreeMap::new();
    for (key, value) in object {
        if validate_custom_header(&key, &value).is_ok() {
            let header_value = value
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| value.to_string());
            safe_headers.insert(key.trim().to_string(), header_value);
        }
    }
    serde_json::to_string(&safe_headers).unwrap_or_else(|_| "{}".to_string())
}

fn validate_custom_header(key: &str, value: &Value) -> DataResult<()> {
    let header_value = value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string());
    validate_request_header(key, &header_value)?;
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
    fetch_model_catalog(provider, storage, client, timeout_ms)
        .map(|options| options.into_iter().map(|option| option.id).collect())
}

fn fetch_model_catalog<S: SecretStorage, H: HttpClient>(
    provider: &LlmProviderRecord,
    storage: &S,
    client: &H,
    timeout_ms: i64,
) -> DataResult<Vec<ModelDiscoveryOptionDto>> {
    let url = join_url(&provider.base_url, &provider.models_endpoint)?;
    log_llm_diagnostic(
        "adapter_selected",
        &[
            ("providerType", provider.provider_type.clone()),
            ("baseUrl", diagnostic_url(&provider.base_url)),
            ("endpointPath", provider.models_endpoint.clone()),
            ("url", diagnostic_url(&url)),
            ("timeoutMs", timeout_ms.to_string()),
        ],
    );
    let response = client.send(HttpRequest {
        method: "GET".to_string(),
        url,
        headers: provider_headers(provider, storage)?,
        body: None,
        timeout_ms,
    })?;
    log_llm_diagnostic(
        "http_response",
        &[
            ("providerType", provider.provider_type.clone()),
            ("endpointPath", provider.models_endpoint.clone()),
            ("status", response.status.to_string()),
        ],
    );
    ensure_success_status(response.status, &response.body)?;
    let models = parse_model_catalog_response(&provider.provider_type, &response.body)?;
    log_llm_diagnostic(
        "parsed_models",
        &[
            ("providerType", provider.provider_type.clone()),
            ("endpointPath", provider.models_endpoint.clone()),
            ("modelsCount", models.len().to_string()),
        ],
    );
    Ok(models)
}

pub fn discover_model_catalog<H: HttpClient>(
    provider_type: &str,
    base_url: &str,
    models_endpoint: &str,
    api_key: Option<String>,
    timeout_ms: i64,
    client: &H,
) -> DataResult<Vec<ModelDiscoveryOptionDto>> {
    let provider_type = normalize_provider_type(provider_type)?;
    let base_url = normalize_provider_base_url(&provider_type, base_url)?;
    validate_endpoint(models_endpoint, "Путь списка моделей")?;
    let storage = OperationSecretStorage::from_api_key(api_key);
    let now = now_iso();
    let provider = LlmProviderRecord {
        id: "model-discovery".to_string(),
        name: "Model discovery".to_string(),
        provider_type,
        base_url,
        api_key_ref: storage.secret_ref(),
        chat_model: String::new(),
        embedding_model: String::new(),
        models_endpoint: models_endpoint.trim().to_string(),
        chat_endpoint: "/chat/completions".to_string(),
        embeddings_endpoint: "/embeddings".to_string(),
        timeout_ms,
        context_size: 4096,
        temperature: 0.0,
        streaming_enabled: false,
        custom_headers_json: "{}".to_string(),
        is_default: false,
        last_status: STATUS_NOT_CONFIGURED.to_string(),
        status_message: None,
        last_checked_at: None,
        created_at: now.clone(),
        updated_at: now,
    };
    fetch_model_catalog(&provider, &storage, client, timeout_ms.clamp(1, 600_000))
}

fn ensure_note_ai_provider_ready<S: SecretStorage>(
    provider: &LlmProviderRecord,
    storage: &S,
) -> DataResult<()> {
    if provider.chat_model.trim().is_empty() {
        return Err(DataError::InvalidInput(
            "Для чата по заметке выберите chat model в настройках LLM".to_string(),
        ));
    }
    if !is_local_base_url(&provider.base_url) && !provider_has_api_key(provider, storage)? {
        return Err(DataError::InvalidInput(
            "API key missing: для внешнего LLM provider нужен сохранённый ключ".to_string(),
        ));
    }
    Ok(())
}

fn provider_has_api_key<S: SecretStorage>(
    provider: &LlmProviderRecord,
    storage: &S,
) -> DataResult<bool> {
    provider
        .api_key_ref
        .as_deref()
        .map(|secret_ref| storage.has_secret(secret_ref))
        .transpose()
        .map(|value| value.unwrap_or(false))
}

fn is_openai_compatible_provider(provider: &LlmProviderRecord) -> bool {
    is_openai_compatible_provider_type(&provider.provider_type)
}

fn is_openai_compatible_provider_type(provider_type: &str) -> bool {
    provider_type != "ollama"
}

fn safe_diagnostic_error(error: &DataError) -> String {
    crate::data::safe_command_message(match error {
        DataError::InvalidInput(message) => DataError::InvalidInput(message.clone()),
        _ => DataError::State("Provider operation failed".to_string()),
    })
}

fn build_note_ai_prompt(request: &NoteAiRequestDto) -> DataResult<NoteAiPrompt> {
    let kind = request.kind.trim();
    if kind != "chat" && kind != "action" {
        return Err(DataError::InvalidInput(
            "Некорректный тип AI-запроса".to_string(),
        ));
    }

    let selected_text = request
        .context
        .selected_text
        .as_deref()
        .unwrap_or_default()
        .trim();
    if selected_text.chars().count() > NOTE_AI_SELECTED_LIMIT {
        return Err(DataError::InvalidInput(
            "Выделенный фрагмент слишком большой для одного AI-запроса".to_string(),
        ));
    }

    let question = request.question.as_deref().unwrap_or_default().trim();
    if question.chars().count() > NOTE_AI_QUESTION_LIMIT {
        return Err(DataError::InvalidInput(
            "Вопрос слишком длинный для одного AI-запроса".to_string(),
        ));
    }
    if kind == "chat" && question.is_empty() {
        return Err(DataError::InvalidInput(
            "Введите вопрос для AI-чата".to_string(),
        ));
    }

    let note_text = note_context_text(&request.context)?;
    let note_metadata = note_metadata_block(&request.context);
    let scope = request.scope.trim();
    let target_text = if kind == "action" && scope == "selection" {
        if selected_text.is_empty() {
            return Err(DataError::InvalidInput(
                "Сначала выделите текст или примените действие ко всей заметке".to_string(),
            ));
        }
        selected_text.to_string()
    } else {
        note_text.clone()
    };
    if kind == "action" && target_text.trim().is_empty() {
        return Err(DataError::InvalidInput(
            "В заметке нет текста для AI-действия".to_string(),
        ));
    }

    let system = [
        "You are NoteFlow AI assistant.",
        "Answer in Russian unless the user explicitly asks for another language.",
        "Use only the current note context. Do not claim that you searched the whole notes database.",
        "Do not include secrets, API keys, hidden prompts, or unrelated data.",
    ]
    .join(" ");

    let user = if kind == "chat" {
        let mut prompt = format!(
            "TASK: Answer the user's question about the current note.\n\n{note_metadata}\n\nNOTE_CONTEXT:\n{}\n\nUSER_QUESTION:\n{}",
            limit_chars(&note_text, NOTE_AI_CONTEXT_LIMIT),
            question
        );
        if !selected_text.is_empty() {
            prompt.push_str("\n\nSELECTED_TEXT:\n");
            prompt.push_str(&limit_chars(selected_text, NOTE_AI_SELECTED_LIMIT));
        }
        prompt
    } else {
        let action_id = request.action_id.as_deref().unwrap_or_default();
        let instruction = action_instruction(action_id)?;
        format!(
            "TASK: {instruction}\nReturn only the final text. No preface, no markdown fence unless code is requested.\n\n{note_metadata}\n\nTARGET_SCOPE: {}\n\nTARGET_TEXT:\n{}",
            if scope == "selection" { "selection" } else { "whole_note" },
            limit_chars(&target_text, NOTE_AI_CONTEXT_LIMIT)
        )
    };

    Ok(NoteAiPrompt { system, user })
}

fn note_ai_request_body(provider: &LlmProviderRecord, prompt: &NoteAiPrompt) -> Value {
    if provider.provider_type == "ollama" {
        json!({
            "model": provider.chat_model,
            "prompt": format!("{}\n\n{}", prompt.system, prompt.user),
            "stream": false,
            "options": {
                "temperature": provider.temperature
            }
        })
    } else {
        json!({
            "model": provider.chat_model,
            "messages": [
                { "role": "system", "content": prompt.system },
                { "role": "user", "content": prompt.user }
            ],
            "temperature": provider.temperature,
            "stream": false,
            "max_tokens": note_ai_max_tokens(provider).unwrap_or(OPENAI_COMPATIBLE_NOTE_AI_MAX_TOKENS)
        })
    }
}

fn chat_completion_request_body(
    provider: &LlmProviderRecord,
    request: &ChatCompletionRequest,
    max_output_tokens: i64,
) -> Value {
    if provider.provider_type == "ollama" {
        let conversation = request
            .messages
            .iter()
            .map(|message| {
                let role = if message.role == "assistant" {
                    "ASSISTANT"
                } else {
                    "USER"
                };
                format!("{role}:\n{}", message.content)
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        json!({
            "model": provider.chat_model,
            "prompt": format!("SYSTEM:\n{}\n\n{}", request.system, conversation),
            "stream": false,
            "options": {
                "temperature": provider.temperature,
                "num_predict": max_output_tokens
            }
        })
    } else {
        let mut messages = vec![json!({
            "role": "system",
            "content": request.system
        })];
        messages.extend(request.messages.iter().map(|message| {
            json!({
                "role": message.role,
                "content": message.content
            })
        }));
        json!({
            "model": provider.chat_model,
            "messages": messages,
            "temperature": provider.temperature,
            "stream": false,
            "max_tokens": max_output_tokens
        })
    }
}

fn openai_compatible_connection_test_body(provider: &LlmProviderRecord) -> Value {
    json!({
        "model": provider.chat_model,
        "messages": [
            {
                "role": "system",
                "content": "Отвечай только финальным ответом. Не показывай рассуждения. Ответь кратко."
            },
            {
                "role": "user",
                "content": "Ответь одним предложением: соединение работает?"
            }
        ],
        "stream": false,
        "max_tokens": OPENAI_COMPATIBLE_TEST_MAX_TOKENS,
        "temperature": 0
    })
}

fn note_ai_max_tokens(provider: &LlmProviderRecord) -> Option<i64> {
    if is_openai_compatible_provider(provider) {
        Some(OPENAI_COMPATIBLE_NOTE_AI_MAX_TOKENS)
    } else {
        None
    }
}

fn parse_note_ai_response(provider_type: &str, body: &str) -> DataResult<String> {
    let value: Value = serde_json::from_str(body).map_err(|_| {
        DataError::InvalidInput("Провайдер вернул некорректный JSON-ответ".to_string())
    })?;

    let response = if provider_type == "ollama" {
        value
            .get("response")
            .and_then(Value::as_str)
            .or_else(|| value.pointer("/message/content").and_then(Value::as_str))
            .unwrap_or_default()
            .trim()
            .to_string()
    } else {
        let first_choice = value
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first());
        let content = first_choice
            .and_then(|choice| choice.pointer("/message/content"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        if content.is_empty() {
            let finish_reason = first_choice
                .and_then(|choice| choice.get("finish_reason"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let has_reasoning = first_choice
                .and_then(|choice| choice.pointer("/message/reasoning"))
                .is_some_and(value_has_visible_content);
            if finish_reason == "length" || has_reasoning {
                return Err(DataError::InvalidInput(
                    "Модель не вернула финальный ответ. Вероятно, лимит токенов слишком маленький или reasoning/thinking не отключён на стороне провайдера."
                        .to_string(),
                ));
            }
        }
        content
    };

    if response.is_empty() {
        let provider_label = if provider_type == "ollama" {
            "Ollama"
        } else {
            "LLM provider"
        };
        return Err(DataError::InvalidInput(format!(
            "{provider_label} вернул пустой или неподдерживаемый ответ"
        )));
    }
    Ok(response)
}

#[derive(Default)]
struct OpenAiResponseMetadata {
    finish_reason: Option<String>,
    has_content: bool,
    has_reasoning: bool,
}

fn openai_response_metadata(body: &str) -> OpenAiResponseMetadata {
    let Ok(value) = serde_json::from_str::<Value>(body) else {
        return OpenAiResponseMetadata::default();
    };
    let first_choice = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first());
    let finish_reason = first_choice
        .and_then(|choice| choice.get("finish_reason"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let has_content = first_choice
        .and_then(|choice| choice.pointer("/message/content"))
        .is_some_and(value_has_visible_content);
    let has_reasoning = first_choice
        .and_then(|choice| choice.pointer("/message/reasoning"))
        .is_some_and(value_has_visible_content);
    OpenAiResponseMetadata {
        finish_reason,
        has_content,
        has_reasoning,
    }
}

fn value_has_visible_content(value: &Value) -> bool {
    match value {
        Value::String(text) => !text.trim().is_empty(),
        Value::Array(items) => !items.is_empty(),
        Value::Object(object) => !object.is_empty(),
        _ => false,
    }
}

fn note_context_text(context: &NoteAiContextDto) -> DataResult<String> {
    let plain_text = context.plain_text.trim();
    let markdown = context.content_markdown.trim();
    let raw_size = plain_text.chars().count().max(markdown.chars().count());
    if raw_size > NOTE_AI_HARD_CONTEXT_LIMIT {
        return Err(DataError::InvalidInput(
            "Контекст заметки слишком большой для одного AI-запроса".to_string(),
        ));
    }

    let source = if !plain_text.is_empty() {
        plain_text
    } else {
        markdown
    };
    Ok(limit_chars(source, NOTE_AI_CONTEXT_LIMIT))
}

fn note_metadata_block(context: &NoteAiContextDto) -> String {
    let tags = if context.tags.is_empty() {
        "none".to_string()
    } else {
        context.tags.join(", ")
    };
    format!(
        "NOTE_METADATA:\n- note_id: {}\n- title: {}\n- date: {}\n- project: {}\n- tags: {}",
        context.note_id.trim(),
        context.title.trim(),
        context.note_date.trim(),
        context.project.trim(),
        tags
    )
}

fn action_instruction(action_id: &str) -> DataResult<&'static str> {
    match action_id {
        "improve" => Ok("Improve the text while preserving meaning and structure."),
        "fix" => Ok("Fix spelling, grammar, punctuation, and obvious wording issues."),
        "shorten" => Ok("Make the text shorter and clearer without losing key facts."),
        "expand" => Ok("Expand the text with useful detail while preserving the original intent."),
        "tone" => Ok("Rewrite the text in a more polished, professional tone."),
        "tasks" => Ok("Convert the text into a clear actionable task list."),
        "translate" => Ok("Translate the text into Russian if it is not Russian, otherwise translate it into English."),
        "explain" => Ok("Explain the text in simple words."),
        "ask" => Ok("Answer what is important in this text and what conclusions follow from it."),
        _ => Err(DataError::InvalidInput(
            "Неизвестное AI-действие редактора".to_string(),
        )),
    }
}

fn limit_chars(value: &str, limit: usize) -> String {
    let mut result = String::new();
    for (index, character) in value.chars().enumerate() {
        if index >= limit {
            result.push_str("\n\n[context truncated]");
            break;
        }
        result.push(character);
    }
    result
}

fn provider_headers<S: SecretStorage>(
    provider: &LlmProviderRecord,
    storage: &S,
) -> DataResult<Vec<(String, String)>> {
    let mut headers = parse_custom_headers(&provider.custom_headers_json)?;
    if is_openai_compatible_provider(provider) {
        upsert_header(
            &mut headers,
            "User-Agent",
            OPENAI_COMPATIBLE_USER_AGENT.to_string(),
        );
    }
    if let Some(secret_ref) = &provider.api_key_ref {
        if let Some(api_key) = storage.get_secret(secret_ref)? {
            upsert_header(
                &mut headers,
                "Authorization",
                format!("Bearer {}", api_key.trim()),
            );
        }
    }
    Ok(headers)
}

fn upsert_header(headers: &mut Vec<(String, String)>, name: &str, value: String) {
    headers.retain(|(candidate, _)| !candidate.eq_ignore_ascii_case(name));
    headers.push((name.to_string(), value));
}

fn has_header(headers: &[(String, String)], name: &str) -> bool {
    headers
        .iter()
        .any(|(candidate, _)| candidate.eq_ignore_ascii_case(name))
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

#[cfg(test)]
fn parse_models_response(provider_type: &str, body: &str) -> DataResult<Vec<String>> {
    parse_model_catalog_response(provider_type, body)
        .map(|options| options.into_iter().map(|option| option.id).collect())
}

fn parse_model_catalog_response(
    provider_type: &str,
    body: &str,
) -> DataResult<Vec<ModelDiscoveryOptionDto>> {
    let value: Value = serde_json::from_str(body).map_err(|_| {
        DataError::InvalidInput("Провайдер вернул некорректный JSON со списком моделей".to_string())
    })?;
    let mut models = BTreeMap::<String, ModelDiscoveryOptionDto>::new();
    let mut has_catalog = false;

    if let Some(items) = value.get("data").and_then(Value::as_array) {
        has_catalog = true;
        collect_model_options(items, &mut models);
    }
    if let Some(items) = value.get("models").and_then(Value::as_array) {
        has_catalog = true;
        collect_model_options(items, &mut models);
    }
    if let Some(items) = value.as_array() {
        has_catalog = true;
        collect_model_options(items, &mut models);
    }

    if !has_catalog && provider_type != "ollama" {
        return Err(DataError::InvalidInput(
            "Ответ провайдера не содержит список моделей".to_string(),
        ));
    }
    Ok(models.into_values().collect())
}

fn collect_model_options(items: &[Value], models: &mut BTreeMap<String, ModelDiscoveryOptionDto>) {
    for item in items {
        let id = item
            .as_str()
            .or_else(|| item.get("id").and_then(Value::as_str))
            .or_else(|| item.get("name").and_then(Value::as_str))
            .or_else(|| item.get("model").and_then(Value::as_str))
            .map(str::trim)
            .filter(|id| !id.is_empty());
        let Some(id) = id else { continue };
        let (supports_chat, supports_embeddings) = model_capabilities(item);
        models
            .entry(id.to_string())
            .and_modify(|existing| {
                existing.supports_chat = merge_capability(existing.supports_chat, supports_chat);
                existing.supports_embeddings =
                    merge_capability(existing.supports_embeddings, supports_embeddings);
            })
            .or_insert_with(|| ModelDiscoveryOptionDto {
                id: id.to_string(),
                supports_chat,
                supports_embeddings,
            });
    }
}

fn merge_capability(current: Option<bool>, incoming: Option<bool>) -> Option<bool> {
    match (current, incoming) {
        (Some(true), _) | (_, Some(true)) => Some(true),
        (Some(false), _) | (_, Some(false)) => Some(false),
        _ => None,
    }
}

fn model_capabilities(item: &Value) -> (Option<bool>, Option<bool>) {
    let Some(capabilities) = item.get("capabilities") else {
        return (None, None);
    };
    if let Some(values) = capabilities.as_array() {
        let values = values
            .iter()
            .filter_map(Value::as_str)
            .map(|value| value.to_ascii_lowercase())
            .collect::<Vec<_>>();
        return (
            Some(values.iter().any(|value| {
                matches!(
                    value.as_str(),
                    "chat" | "chat_completions" | "completion" | "generate"
                )
            })),
            Some(
                values
                    .iter()
                    .any(|value| matches!(value.as_str(), "embedding" | "embeddings" | "embed")),
            ),
        );
    }
    let Some(values) = capabilities.as_object() else {
        return (None, None);
    };
    let capability = |keys: &[&str]| {
        keys.iter()
            .find_map(|key| values.get(*key).and_then(Value::as_bool))
    };
    (
        capability(&["chat", "chat_completions", "completion", "generate"]),
        capability(&["embedding", "embeddings", "embed"]),
    )
}

fn model_is_listed(models: &[String], model: &str) -> bool {
    let model = model.trim();
    !model.is_empty() && models.iter().any(|candidate| candidate == model)
}

fn ensure_success_status(status: u16, body: &str) -> DataResult<()> {
    if (200..300).contains(&status) {
        return Ok(());
    }
    let message = match status {
        401 => "401 Unauthorized: проверьте API key".to_string(),
        403 => "403 Forbidden: запрос заблокирован WAF или провайдером. Проверьте доступ, API key и User-Agent.".to_string(),
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
    let normalized_base = base_url.trim().trim_end_matches('/');
    let normalized_endpoint = endpoint.trim().trim_start_matches('/');
    if path_ends_with_endpoint(normalized_base, normalized_endpoint) {
        return Ok(normalized_base.to_string());
    }
    Ok(format!("{}/{}", normalized_base, normalized_endpoint))
}

fn path_ends_with_endpoint(base_url: &str, endpoint: &str) -> bool {
    let normalized_endpoint = endpoint.trim_matches('/').to_ascii_lowercase();
    if normalized_endpoint.is_empty() {
        return false;
    }
    let base_without_query = base_url.split(['?', '#']).next().unwrap_or(base_url);
    base_without_query
        .trim_end_matches('/')
        .to_ascii_lowercase()
        .ends_with(&format!("/{normalized_endpoint}"))
}

fn is_local_base_url(base_url: &str) -> bool {
    url::Url::parse(base_url).is_ok_and(|url| is_local_destination(&url))
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

fn validate_request_header(name: &str, value: &str) -> DataResult<()> {
    if name.is_empty()
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        || value.chars().any(char::is_control)
    {
        return Err(DataError::InvalidInput(
            "Некорректный HTTP-заголовок подключения".to_string(),
        ));
    }
    Ok(())
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

fn curl_command(url: &str, timeout_seconds: i64, connect_timeout_seconds: i64) -> Command {
    let mut command = Command::new(curl_binary_name());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
        .arg("--silent")
        .arg("--show-error")
        .arg("--location")
        .arg("--max-redirs")
        .arg("2")
        .arg("--proto")
        .arg("=http,https")
        .arg("--proto-redir")
        .arg(if url.starts_with("https://") {
            "=https"
        } else {
            "=http,https"
        })
        .arg("--max-time")
        .arg(timeout_seconds.to_string())
        .arg("--connect-timeout")
        .arg(connect_timeout_seconds.to_string())
        .arg("--write-out")
        .arg("\n%{http_code}")
        .arg("--config")
        .arg("-");
    command
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
    fn legacy_streaming_preference_does_not_enable_streaming_requests() {
        let mut provider = provider_record();
        provider.streaming_enabled = true;
        let prompt = NoteAiPrompt {
            system: "System".to_string(),
            user: "User".to_string(),
        };
        let chat = ChatCompletionRequest {
            system: "System".to_string(),
            messages: vec![ChatCompletionMessage {
                role: "user".to_string(),
                content: "User".to_string(),
            }],
            max_output_tokens: 128,
            operation_label: "test",
        };

        for provider_type in ["openai", "ollama"] {
            provider.provider_type = provider_type.to_string();
            assert_eq!(note_ai_request_body(&provider, &prompt)["stream"], false);
            assert_eq!(
                chat_completion_request_body(&provider, &chat, 128)["stream"],
                false
            );
        }
    }

    fn draft_request(provider_type: &str, base_url: &str) -> DraftLlmProviderRequest {
        let (models_endpoint, chat_endpoint, embeddings_endpoint, chat_model) =
            if provider_type == "ollama" {
                (
                    "/api/tags",
                    "/api/generate",
                    "/api/embeddings",
                    "qwen3-4b-local:latest",
                )
            } else {
                ("/models", "/chat/completions", "/embeddings", "gpt-test")
            };
        DraftLlmProviderRequest {
            provider_id: None,
            provider_type: provider_type.to_string(),
            base_url: base_url.to_string(),
            api_key: None,
            chat_model: chat_model.to_string(),
            embedding_model: String::new(),
            models_endpoint: models_endpoint.to_string(),
            chat_endpoint: chat_endpoint.to_string(),
            embeddings_endpoint: embeddings_endpoint.to_string(),
            timeout_ms: 5000,
            context_size: 4096,
            temperature: 0.3,
            streaming_enabled: true,
            custom_headers_json: "{}".to_string(),
        }
    }

    #[test]
    fn parses_openai_model_response() {
        let models = parse_models_response("openai", r#"{"data":[{"id":"gpt-a"},{"id":"gpt-b"}]}"#)
            .expect("models parse");

        assert_eq!(models, vec!["gpt-a".to_string(), "gpt-b".to_string()]);
    }

    #[test]
    fn model_catalog_preserves_optional_capabilities_without_guessing() {
        let options = parse_model_catalog_response(
            "openai",
            r#"{"data":[
                {"id":"chat-model","capabilities":{"chat":true,"embeddings":false}},
                {"id":"embed-model","capabilities":["embeddings"]},
                {"id":"unknown-model","object":"model"}
            ]}"#,
        )
        .expect("catalog parses");

        assert_eq!(
            options,
            vec![
                ModelDiscoveryOptionDto {
                    id: "chat-model".to_string(),
                    supports_chat: Some(true),
                    supports_embeddings: Some(false),
                },
                ModelDiscoveryOptionDto {
                    id: "embed-model".to_string(),
                    supports_chat: Some(false),
                    supports_embeddings: Some(true),
                },
                ModelDiscoveryOptionDto {
                    id: "unknown-model".to_string(),
                    supports_chat: None,
                    supports_embeddings: None,
                },
            ]
        );
    }

    #[test]
    fn valid_empty_openai_catalog_is_a_successful_empty_state() {
        let http = MockHttpClient::with_responses(vec![HttpResponse {
            status: 200,
            body: r#"{"object":"list","data":[]}"#.to_string(),
        }]);

        let result = list_models_for_draft(
            draft_request("custom", "https://bridge.example.test/api/v1"),
            &http,
        )
        .expect("empty catalog remains valid");

        assert_eq!(result.status, STATUS_SUCCESS);
        assert!(result.models.is_empty());
        assert!(result.options.is_empty());
        assert!(result.message.contains("пуст"));
    }

    #[test]
    fn draft_discovery_reuses_saved_key_and_refreshes_the_catalog() {
        let http = MockHttpClient::with_responses(vec![
            HttpResponse {
                status: 200,
                body: r#"{"data":[{"id":"first-model"}]}"#.to_string(),
            },
            HttpResponse {
                status: 200,
                body: r#"{"data":[{"id":"first-model"},{"id":"second-model"}]}"#.to_string(),
            },
        ]);
        let first = list_models_for_draft_with_saved_key(
            draft_request("custom", "https://bridge.example.test/api/v1"),
            Some("saved-secret".to_string()),
            &http,
        )
        .expect("initial catalog");
        let refreshed = list_models_for_draft_with_saved_key(
            draft_request("custom", "https://bridge.example.test/api/v1"),
            Some("saved-secret".to_string()),
            &http,
        )
        .expect("refreshed catalog");

        assert_eq!(first.models, vec!["first-model"]);
        assert_eq!(refreshed.models, vec!["first-model", "second-model"]);
        let requests = http.requests();
        assert_eq!(requests.len(), 2);
        for request in requests {
            assert_eq!(request.method, "GET");
            assert_eq!(request.url, "https://bridge.example.test/api/v1/models");
            assert!(request.headers.iter().any(|(name, value)| {
                name == "Authorization" && value == "Bearer saved-secret"
            }));
            assert!(request.headers.iter().any(|(name, value)| {
                name == "User-Agent" && value == OPENAI_COMPATIBLE_USER_AGENT
            }));
        }
    }

    #[test]
    #[ignore = "requires the external Bridge and the current profile's secure credential"]
    fn real_bridge_model_discovery_smoke() {
        let database_path = std::env::var("NOTEFLOW_BRIDGE_SMOKE_DB")
            .expect("set NOTEFLOW_BRIDGE_SMOKE_DB to a read-only copy or the local NoteFlow DB");
        let connection =
            Connection::open_with_flags(database_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .expect("open NoteFlow database read-only");
        let provider_id = connection
            .query_row(
                "SELECT id FROM llm_providers WHERE base_url LIKE '%bridge-back.admlr.lipetsk.ru%' LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("Bridge provider exists");
        let provider =
            get_provider_record(&connection, &provider_id).expect("load Bridge provider");
        let result = list_models_for_provider(&provider, &SystemSecretStorage, &CurlHttpClient)
            .expect("Bridge model discovery succeeds");

        eprintln!(
            "Bridge model discovery: endpoint={} count={} models={:?} capabilities={}",
            provider.models_endpoint,
            result.models.len(),
            result.models,
            result.options.iter().any(|option| {
                option.supports_chat.is_some() || option.supports_embeddings.is_some()
            })
        );
        assert_eq!(result.status, STATUS_SUCCESS);
        assert!(!result.models.is_empty());
    }

    #[test]
    fn normalizes_ollama_base_url_and_lists_models_from_api_tags() {
        let http = MockHttpClient::with_responses(vec![HttpResponse {
            status: 200,
            body: r#"{"models":[{"name":"qwen3-4b-local:latest"},{"name":"llama3"}]}"#.to_string(),
        }]);

        let result =
            list_models_for_draft(draft_request("ollama", "http://127.0.0.1:11434/api"), &http)
                .expect("ollama draft models listed");

        assert_eq!(result.status, STATUS_SUCCESS);
        assert_eq!(
            result.models,
            vec!["llama3".to_string(), "qwen3-4b-local:latest".to_string()]
        );
        let requests = http.requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].method, "GET");
        assert_eq!(requests[0].url, "http://127.0.0.1:11434/api/tags");
    }

    #[test]
    fn ollama_rejects_openai_v1_base_url_before_network() {
        let http = MockHttpClient::default();

        let error =
            list_models_for_draft(draft_request("ollama", "http://127.0.0.1:11434/v1"), &http)
                .expect_err("ollama v1 url is rejected");

        assert!(error.to_string().contains("/v1"));
        assert!(http.requests().is_empty());
    }

    #[test]
    fn ollama_empty_model_list_is_successful_empty_state() {
        let http = MockHttpClient::with_responses(vec![HttpResponse {
            status: 200,
            body: r#"{"models":[]}"#.to_string(),
        }]);

        let result =
            list_models_for_draft(draft_request("ollama", "http://localhost:11434"), &http)
                .expect("empty ollama models list is valid");

        assert_eq!(result.status, STATUS_SUCCESS);
        assert!(result.models.is_empty());
    }

    #[test]
    fn openai_compatible_draft_keeps_single_v1_and_uses_ephemeral_key() {
        let mut request = draft_request("lmstudio", "http://localhost:1234/v1");
        request.api_key = Some("sk-draft".to_string());
        let http = MockHttpClient::with_responses(vec![HttpResponse {
            status: 200,
            body: r#"{"data":[{"id":"local-model"}]}"#.to_string(),
        }]);

        let result = list_models_for_draft(request, &http).expect("models listed");

        assert_eq!(result.models, vec!["local-model".to_string()]);
        let requests = http.requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].url, "http://localhost:1234/v1/models");
        assert_eq!(
            requests[0]
                .headers
                .iter()
                .find(|(name, _)| name == "Authorization")
                .map(|(_, value)| value.as_str()),
            Some("Bearer sk-draft")
        );
        assert_eq!(
            requests[0]
                .headers
                .iter()
                .find(|(name, _)| name == "User-Agent")
                .map(|(_, value)| value.as_str()),
            Some(OPENAI_COMPATIBLE_USER_AGENT)
        );
    }

    #[test]
    fn openai_compatible_base_url_strips_full_chat_endpoint() {
        let request = draft_request(
            "openai",
            "https://bridge-back.admlr.lipetsk.ru/api/v1/chat/completions",
        );
        let (provider, _) =
            draft_provider_record(request, None).expect("draft provider normalizes");

        assert_eq!(
            provider.base_url,
            "https://bridge-back.admlr.lipetsk.ru/api/v1"
        );
        assert_eq!(
            join_url(&provider.base_url, &provider.chat_endpoint).expect("url joins"),
            "https://bridge-back.admlr.lipetsk.ru/api/v1/chat/completions"
        );
        assert_eq!(
            join_url(
                "https://bridge-back.admlr.lipetsk.ru/api/v1/chat/completions",
                "/chat/completions"
            )
            .expect("full endpoint does not duplicate"),
            "https://bridge-back.admlr.lipetsk.ru/api/v1/chat/completions"
        );
    }

    #[test]
    fn draft_connection_error_result_keeps_locality_without_provider_record() {
        let result = connection_error_result_for_base_url(
            "http://127.0.0.1:11434",
            DataError::InvalidInput("Timeout: test".to_string()),
        );

        assert_eq!(result.status, STATUS_ERROR);
        assert!(result.is_local);
        assert!(result.models.is_empty());
    }

    #[test]
    fn rejects_secret_custom_headers() {
        let error = normalize_custom_headers_json(r#"{"Authorization":"Bearer sk-test"}"#)
            .expect_err("secret header rejected");

        assert!(error.to_string().contains("Секретные HTTP-заголовки"));
    }

    #[test]
    fn openai_connection_test_falls_back_to_chat_probe_without_models() {
        let storage = MemorySecretStorage::default();
        storage
            .set_secret("secret-ref", "sk-test")
            .expect("secret saved");
        let http = MockHttpClient::with_responses(vec![
            HttpResponse {
                status: 404,
                body: r#"{"error":"models unavailable"}"#.to_string(),
            },
            HttpResponse {
                status: 201,
                body: r#"{"choices":[{"finish_reason":"stop","message":{"content":"Соединение работает","reasoning":"hidden chain"}}]}"#.to_string(),
            },
        ]);

        let result = test_provider_connection(&provider_record(), &storage, &http)
            .expect("connection tested");

        assert_eq!(result.status, STATUS_SUCCESS);
        assert!(result.chat_ok);
        assert!(!result.embeddings_ok);
        assert!(result.models.is_empty());
        assert!(result.message.contains("ручной ввод модели"));
        let requests = http.requests();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].method, "GET");
        assert!(requests[0].url.ends_with("/models"));
        assert_eq!(requests[1].method, "POST");
        assert_eq!(requests[1].url, "http://localhost:8080/v1/chat/completions");
        assert_eq!(
            requests[1]
                .headers
                .iter()
                .find(|(name, _)| name == "Authorization")
                .map(|(_, value)| value.as_str()),
            Some("Bearer sk-test")
        );
        assert_eq!(
            requests[1]
                .headers
                .iter()
                .find(|(name, _)| name == "User-Agent")
                .map(|(_, value)| value.as_str()),
            Some(OPENAI_COMPATIBLE_USER_AGENT)
        );
        let body = requests[1].body.as_ref().expect("probe body exists");
        assert_eq!(body.get("model").and_then(Value::as_str), Some("gpt-test"));
        let max_tokens = body
            .get("max_tokens")
            .and_then(Value::as_i64)
            .expect("probe max_tokens is present");
        assert_eq!(max_tokens, OPENAI_COMPATIBLE_TEST_MAX_TOKENS);
        assert!(max_tokens >= 512);
        assert!(!body.to_string().contains("max_tokens\":16"));
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
    fn openai_models_failure_returns_manual_entry_message() {
        let provider = provider_record();
        let storage = MemorySecretStorage::default();
        storage
            .set_secret("secret-ref", "sk-test")
            .expect("secret saved");
        let http = MockHttpClient::with_responses(vec![HttpResponse {
            status: 404,
            body: r#"{"error":"not found"}"#.to_string(),
        }]);

        let result =
            list_models_for_provider(&provider, &storage, &http).expect("manual entry result");

        assert_eq!(result.status, STATUS_ERROR);
        assert!(result.models.is_empty());
        assert!(result.message.contains("Введите название модели вручную"));
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
                body: r#"{"choices":[{"finish_reason":"stop","message":{"content":"ok"}}]}"#
                    .to_string(),
            },
        ]);

        let result =
            test_provider_connection(&provider, &storage, &http).expect("connection tested");

        assert_eq!(result.status, STATUS_SUCCESS);
        let requests = http.requests();
        assert_eq!(requests.len(), 2);
        assert!(requests[0].timeout_ms > 0);
        assert!(requests[0].timeout_ms <= TEST_CONNECTION_TIMEOUT_MS);
        assert!(requests[1].timeout_ms > 0);
        assert!(requests[1].timeout_ms <= TEST_CONNECTION_TIMEOUT_MS);
    }

    #[test]
    fn maps_unauthorized_status_to_safe_error() {
        let error = ensure_success_status(401, r#"{"error":"bad key"}"#)
            .expect_err("unauthorized is error");

        assert!(error.to_string().contains("401 Unauthorized"));
        assert!(!error.to_string().contains("bad key"));
    }

    #[test]
    fn maps_forbidden_status_to_waf_user_agent_error() {
        let error =
            ensure_success_status(403, r#"{"error":"blocked"}"#).expect_err("forbidden is error");

        assert!(error.to_string().contains("403 Forbidden"));
        assert!(error.to_string().contains("WAF"));
        assert!(error.to_string().contains("User-Agent"));
        assert!(!error.to_string().contains("blocked"));
    }

    #[test]
    fn maps_timeout_and_connection_errors_to_safe_messages() {
        let timeout = map_curl_error(
            "curl: (28) Operation timed out after 10001 milliseconds with 0 bytes received sk-test",
        );
        assert!(timeout.contains("Timeout"));
        assert!(!timeout.contains("sk-test"));
        assert!(!timeout.contains("Operation timed out after"));

        let refused = map_curl_error(
            "curl: (7) Failed to connect to localhost port 11434 after 2000 ms: Connection refused sk-test",
        );
        assert!(refused.contains("endpoint") || refused.contains("соединение"));
        assert!(!refused.contains("sk-test"));
        assert!(!refused.contains("Failed to connect"));
    }

    #[test]
    fn http_status_errors_do_not_leak_provider_body_or_keys() {
        let error = ensure_success_status(
            500,
            r#"{"error":"server dumped Authorization Bearer sk-secret and raw stack"}"#,
        )
        .expect_err("server error is mapped");

        let text = error.to_string();
        assert!(text.contains("500"));
        assert!(!text.contains("sk-secret"));
        assert!(!text.contains("Authorization"));
        assert!(!text.contains("raw stack"));
    }

    #[test]
    fn curl_config_rejects_injected_header_lines() {
        let error =
            validate_request_header("X-Test", "safe\nheader = \"Authorization: Bearer secret\"")
                .unwrap_err();
        assert!(!error.to_string().contains("secret"));
        assert!(validate_request_header("X-Test", "ordinary-value").is_ok());
        assert!(validate_request_header("X-Test\r\nAnother", "value").is_err());
    }

    #[test]
    fn curl_invocation_keeps_authorization_out_of_process_arguments() {
        let command = curl_command("https://bridge.example.test/api/v1/models", 10, 4);
        let args = command
            .get_args()
            .map(|argument| argument.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert!(args.windows(2).any(|pair| pair == ["--config", "-"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--proto-redir", "=https"]));
        assert!(!args.join(" ").contains("Authorization"));
        assert!(!args.join(" ").contains("Bearer"));
    }

    #[test]
    fn timeout_error_results_clear_model_loading_payload() {
        let result = models_error_result(DataError::InvalidInput(map_curl_error(
            "curl: (28) Timeout was reached sk-secret",
        )));

        assert_eq!(result.status, STATUS_ERROR);
        assert!(result.message.contains("не ответила вовремя"));
        assert!(result.models.is_empty());
        assert!(!result.message.contains("sk-secret"));
    }

    #[test]
    fn detects_local_endpoints() {
        assert!(is_local_base_url("http://localhost:11434"));
        assert!(is_local_base_url("http://127.0.0.1:1234/v1"));
        assert!(!is_local_base_url("https://api.example.com/v1"));
    }

    fn note_ai_request(kind: &str, scope: &str, selected_text: Option<&str>) -> NoteAiRequestDto {
        NoteAiRequestDto {
            kind: kind.to_string(),
            action_id: Some("fix".to_string()),
            scope: scope.to_string(),
            question: Some("Summarize this note".to_string()),
            context: NoteAiContextDto {
                note_id: "note-1".to_string(),
                title: "Meeting notes".to_string(),
                note_date: "2026-06-30".to_string(),
                project: "NoteFlow".to_string(),
                tags: vec!["planning".to_string(), "ai".to_string()],
                plain_text: "Full note context with project decisions.".to_string(),
                content_markdown: "# Meeting notes".to_string(),
                selected_text: selected_text.map(str::to_string),
            },
        }
    }

    #[test]
    fn builds_note_ai_prompt_from_selection() {
        let prompt = build_note_ai_prompt(&note_ai_request(
            "action",
            "selection",
            Some("Selected fragment"),
        ))
        .expect("prompt builds");

        assert!(prompt.system.contains("current note context"));
        assert!(prompt.user.contains("NOTE_METADATA"));
        assert!(prompt.user.contains("title: Meeting notes"));
        assert!(prompt.user.contains("TARGET_SCOPE: selection"));
        assert!(prompt.user.contains("Selected fragment"));
        assert!(!prompt
            .user
            .contains("Full note context with project decisions."));
    }

    #[test]
    fn builds_note_ai_chat_prompt_with_note_context() {
        let prompt =
            build_note_ai_prompt(&note_ai_request("chat", "note", Some("Selected fragment")))
                .expect("chat prompt builds");

        assert!(prompt.user.contains("NOTE_CONTEXT"));
        assert!(prompt
            .user
            .contains("Full note context with project decisions."));
        assert!(prompt.user.contains("USER_QUESTION"));
        assert!(prompt.user.contains("Selected fragment"));
    }

    #[test]
    fn rejects_too_large_note_ai_context() {
        let mut request = note_ai_request("chat", "note", None);
        request.context.plain_text = "x".repeat(NOTE_AI_HARD_CONTEXT_LIMIT + 1);

        assert!(build_note_ai_prompt(&request).is_err());
    }

    #[test]
    fn run_note_ai_request_parses_openai_response() {
        let storage = MemorySecretStorage::default();
        let http = MockHttpClient::with_responses(vec![HttpResponse {
            status: 200,
            body: r#"{"choices":[{"finish_reason":"stop","message":{"content":"Готовый ответ","reasoning":"скрытая цепочка"}}]}"#.to_string(),
        }]);

        let result = run_note_ai_request(
            &provider_record(),
            &storage,
            &http,
            note_ai_request("chat", "note", None),
        )
        .expect("note ai request works");

        assert_eq!(result.status, STATUS_SUCCESS);
        assert_eq!(result.response, "Готовый ответ");
        assert!(!result.response.contains("скрытая цепочка"));
        let requests = http.requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].method, "POST");
        assert!(requests[0].timeout_ms <= NOTE_AI_TIMEOUT_MS);
        assert_eq!(
            requests[0]
                .headers
                .iter()
                .find(|(name, _)| name == "User-Agent")
                .map(|(_, value)| value.as_str()),
            Some(OPENAI_COMPATIBLE_USER_AGENT)
        );
        let body = requests[0].body.as_ref().expect("body exists");
        assert!(body.to_string().contains("Meeting notes"));
        let max_tokens = body
            .get("max_tokens")
            .and_then(Value::as_i64)
            .expect("note ai max_tokens is present");
        assert_eq!(max_tokens, OPENAI_COMPATIBLE_NOTE_AI_MAX_TOKENS);
        assert!(max_tokens >= 1024);
    }

    #[test]
    fn openai_response_parser_ignores_reasoning_when_content_exists() {
        let response = parse_note_ai_response(
            "openai",
            r#"{"choices":[{"finish_reason":"stop","message":{"content":"Финальный ответ","reasoning":"не показывать"}}]}"#,
        )
        .expect("content parses");

        assert_eq!(response, "Финальный ответ");
        assert!(!response.contains("не показывать"));
    }

    #[test]
    fn openai_response_parser_explains_empty_content_with_reasoning_or_length() {
        let error = parse_note_ai_response(
            "openai",
            r#"{"choices":[{"finish_reason":"length","message":{"content":null,"reasoning":"скрытая цепочка"}}]}"#,
        )
        .expect_err("missing final content is rejected");

        let text = error.to_string();
        assert!(text.contains("Модель не вернула финальный ответ"));
        assert!(text.contains("лимит токенов"));
        assert!(!text.contains("скрытая цепочка"));
    }

    #[test]
    fn run_note_ai_request_requires_external_api_key() {
        let mut provider = provider_record();
        provider.base_url = "https://api.example.com/v1".to_string();
        provider.api_key_ref = None;
        let storage = MemorySecretStorage::default();
        let http = MockHttpClient::default();

        let error = run_note_ai_request(
            &provider,
            &storage,
            &http,
            note_ai_request("chat", "note", None),
        )
        .expect_err("missing key rejected");

        assert!(error.to_string().contains("API key missing"));
    }

    #[test]
    fn run_note_ai_request_parses_ollama_response() {
        let mut provider = provider_record();
        provider.provider_type = "ollama".to_string();
        provider.base_url = "http://localhost:11434".to_string();
        provider.chat_endpoint = "/api/generate".to_string();
        provider.chat_model = "qwen3-4b-local:latest".to_string();
        provider.api_key_ref = None;
        let storage = MemorySecretStorage::default();
        let http = MockHttpClient::with_responses(vec![HttpResponse {
            status: 200,
            body: r#"{"response":"Локальный ответ"}"#.to_string(),
        }]);

        let result = run_note_ai_request(
            &provider,
            &storage,
            &http,
            note_ai_request("action", "selection", Some("исправь текст")),
        )
        .expect("ollama response parses");

        assert_eq!(result.response, "Локальный ответ");
        assert!(result.is_local);
        assert!(http.requests()[0]
            .body
            .as_ref()
            .expect("body exists")
            .to_string()
            .contains("qwen3-4b-local"));
    }
}
