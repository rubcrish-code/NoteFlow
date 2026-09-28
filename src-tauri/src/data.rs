use crate::revisions::{self, RevisionKind, RevisionSnapshot};
use crate::{assets, embedding, knowledge, llm, rag, search};
use chrono::{SecondsFormat, Utc};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Cursor, Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::{App, Manager, State};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

pub(crate) type DataResult<T> = Result<T, DataError>;

const DATABASE_FILE: &str = "database.sqlite";
const CURRENT_BACKUP_VERSION: u32 = 6;
const BACKUP_MANIFEST_NAME: &str = "noteflow-backup.json";
const MAX_BACKUP_ARCHIVE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_BACKUP_MANIFEST_BYTES: u64 = 128 * 1024 * 1024;
const MAX_BACKUP_ENTRY_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_BACKUP_UNCOMPRESSED_BYTES: u64 = 64 * 1024 * 1024 * 1024;
const MAX_BACKUP_ENTRIES: usize = 25_000;
const MAX_BACKUP_COMPRESSION_RATIO: u64 = 1_000;
const MANAGED_ATTACHMENT_ROOTS: [&str; 3] = ["attachments", "images", assets::ASSET_ROOT];
const RESTORE_STATE_FILE: &str = "restore-state.json";
const RESTORE_COMMIT_SETTING_KEY: &str = "internal.restore.commit.v1";
const UI_SETTINGS_KEY: &str = "ui.settings.v1";
const FIRST_RUN_COMPLETED_KEY: &str = "onboarding.completed.v1";
const MAX_MARKDOWN_IMPORT_FILES: usize = 32;
const MAX_MARKDOWN_IMPORT_FILE_BYTES: usize = 8 * 1024 * 1024;
const MAX_MARKDOWN_IMPORT_TOTAL_BYTES: usize = 64 * 1024 * 1024;
const NOTE_AI_PRIVACY_LOCAL_KEY: &str = "ai.note.privacy.local.v1";
const NOTE_AI_PRIVACY_EXTERNAL_KEY: &str = "ai.note.privacy.external.v1";
const LEGACY_TIPTAP_SIDECAR_KIND: &str = revisions::LEGACY_TIPTAP_SIDECAR_KIND;

#[derive(Debug)]
pub enum DataError {
    Io(std::io::Error),
    Json(serde_json::Error),
    Sql(rusqlite::Error),
    Zip(zip::result::ZipError),
    InvalidInput(String),
    NotFound(String),
    State(String),
    Serialization,
    Transaction,
    Revision,
    RestoreApplied,
    Sidecar,
    StaleWrite,
}

impl From<std::io::Error> for DataError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for DataError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl From<rusqlite::Error> for DataError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sql(value)
    }
}

impl From<zip::result::ZipError> for DataError {
    fn from(value: zip::result::ZipError) -> Self {
        Self::Zip(value)
    }
}

impl std::fmt::Display for DataError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "Ошибка файловой системы: {error}"),
            Self::Json(error) => write!(formatter, "Ошибка JSON: {error}"),
            Self::Sql(error) => write!(formatter, "Ошибка SQLite: {error}"),
            Self::Zip(error) => write!(formatter, "Ошибка ZIP: {error}"),
            Self::InvalidInput(message) | Self::NotFound(message) | Self::State(message) => {
                formatter.write_str(message)
            }
            Self::Serialization => {
                formatter.write_str("Не удалось подготовить содержимое заметки к сохранению")
            }
            Self::Transaction => formatter.write_str("Не удалось атомарно сохранить заметку"),
            Self::Revision => formatter.write_str("Не удалось сохранить историю изменений заметки"),
            Self::RestoreApplied => formatter
                .write_str("Резервная копия восстановлена, но интерфейс не удалось обновить"),
            Self::Sidecar => {
                formatter.write_str("Не удалось сохранить расширенное оформление заметки")
            }
            Self::StaleWrite => {
                formatter.write_str("Заметка уже была изменена. Загружена более новая версия")
            }
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceCommandError {
    code: &'static str,
    message: &'static str,
}

impl From<DataError> for PersistenceCommandError {
    fn from(error: DataError) -> Self {
        match error {
            DataError::Serialization | DataError::Json(_) => Self {
                code: "serialization",
                message: "Не удалось подготовить содержимое заметки к сохранению",
            },
            DataError::Revision => Self {
                code: "revision",
                message: "Не удалось сохранить историю изменений заметки",
            },
            DataError::Sidecar => Self {
                code: "sidecar",
                message: "Не удалось сохранить расширенное оформление заметки",
            },
            DataError::StaleWrite => Self {
                code: "stale_write",
                message: "Заметка уже была изменена. Загружена более новая версия",
            },
            DataError::NotFound(_) => Self {
                code: "not_found",
                message: "Заметка не найдена",
            },
            DataError::InvalidInput(_) => Self {
                code: "invalid_input",
                message: "Содержимое заметки не прошло проверку",
            },
            DataError::Io(_)
            | DataError::Sql(_)
            | DataError::Zip(_)
            | DataError::State(_)
            | DataError::RestoreApplied
            | DataError::Transaction => Self {
                code: "transaction",
                message: "Не удалось атомарно сохранить заметку",
            },
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTagDto {
    pub id: String,
    pub name: String,
    pub color: String,
    pub custom_color: Option<String>,
    pub icon_key: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDto {
    pub id: String,
    pub note_id: String,
    pub kind: String,
    pub original_name: String,
    pub storage_rel_path: String,
    pub blob_id: Option<String>,
    pub asset_uri: Option<String>,
    pub mime_type: String,
    pub size_bytes: i64,
    pub original_attachment_id: Option<String>,
    pub edit_metadata: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDto {
    pub id: String,
    pub title: String,
    pub note_date: String,
    pub content_json: Value,
    pub content_markdown: String,
    pub content_html: String,
    pub plain_text: String,
    pub content_sidecars: Vec<NoteContentSidecarDto>,
    pub project_id: Option<String>,
    pub project: String,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub pinned_at: Option<String>,
    pub icon_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub content_version: i64,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
    pub tags: Vec<NoteTagDto>,
    pub attachments: Vec<AttachmentDto>,
    pub word_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContentSidecarDto {
    pub kind: String,
    pub schema_version: i64,
    pub payload_json: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCardDto {
    pub id: String,
    pub title: String,
    pub description: String,
    pub color: String,
    pub icon_key: Option<String>,
    pub notes: i64,
    pub tasks: i64,
    pub files: Option<i64>,
    pub status: String,
    pub archived_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRowDto {
    pub id: String,
    pub name: String,
    pub count: i64,
    pub color: String,
    pub custom_color: Option<String>,
    pub icon_key: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveItemDto {
    pub id: String,
    pub title: String,
    pub archived_at: String,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResultDto {
    pub path: String,
    pub relative_path: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentStoreResultDto {
    pub attachment: AttachmentDto,
    pub size_label: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataLocationDto {
    pub data_dir: String,
    pub database_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshotDto {
    pub notes: Vec<NoteDto>,
    pub projects: Vec<ProjectCardDto>,
    pub tags: Vec<TagRowDto>,
    pub archive_items: Vec<ArchiveItemDto>,
    pub data_location: DataLocationDto,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunStateDto {
    pub required: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunCompletionDto {
    pub note: NoteDto,
    pub settings: UiSettingsDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteFirstRunRequest {
    pub profile_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMarkdownNoteInput {
    pub title: String,
    pub content_json: Value,
    pub content_markdown: String,
    pub content_html: String,
    pub plain_text: String,
    #[serde(default)]
    pub content_sidecars: Vec<NoteContentSidecarInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMarkdownRequest {
    pub notes: Vec<ImportMarkdownNoteInput>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMarkdownResultDto {
    pub notes: Vec<NoteDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupContentsSummaryDto {
    pub notes: usize,
    pub projects: usize,
    pub tags: usize,
    pub attachments: usize,
    pub note_ai_chats: usize,
    pub rag_chats: usize,
    pub messages: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreviewDto {
    pub format_version: u32,
    pub exported_at: String,
    pub app_version: Option<String>,
    pub contents: BackupContentsSummaryDto,
    pub includes_ai_history: bool,
    pub preserves_existing_ai_history: bool,
    pub missing_attachment_files: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupResultDto {
    pub workspace: WorkspaceSnapshotDto,
    pub contents: BackupContentsSummaryDto,
    pub preserved_legacy_chats: usize,
    pub indexes_updating: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct UiSettingsDto {
    #[serde(default = "default_ui_theme")]
    pub theme: String,
    #[serde(default = "default_ui_app_zoom_percent")]
    pub app_zoom_percent: i64,
    #[serde(default = "default_ui_sidebar_width")]
    pub sidebar_width: i64,
    #[serde(default = "default_ui_list_width")]
    pub list_width: i64,
    #[serde(default = "default_ui_chat_width")]
    pub chat_width: i64,
    #[serde(default)]
    pub sidebar_collapsed: bool,
    #[serde(default = "default_ui_rag_conversation_width")]
    pub rag_conversation_width: i64,
    #[serde(default = "default_ui_rag_sources_width")]
    pub rag_sources_width: i64,
    #[serde(default)]
    pub rag_sources_collapsed: bool,
    #[serde(default = "default_ui_last_section")]
    pub last_section: String,
    #[serde(default = "default_ui_language")]
    pub language: String,
    #[serde(default = "default_ui_local_profile_name")]
    pub local_profile_name: String,
    #[serde(default = "default_ui_editor_content_width")]
    pub editor_content_width: i64,
    #[serde(default)]
    pub editor_content_offset: i64,
}

impl Default for UiSettingsDto {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            app_zoom_percent: 100,
            sidebar_width: 250,
            list_width: 376,
            chat_width: 380,
            sidebar_collapsed: false,
            rag_conversation_width: 280,
            rag_sources_width: 320,
            rag_sources_collapsed: false,
            last_section: "notes".to_string(),
            language: "ru".to_string(),
            local_profile_name: default_ui_local_profile_name(),
            editor_content_width: 840,
            editor_content_offset: 0,
        }
    }
}

impl UiSettingsDto {
    fn normalized(self) -> Self {
        Self {
            theme: normalize_ui_theme(&self.theme),
            app_zoom_percent: normalize_app_zoom(self.app_zoom_percent),
            sidebar_width: clamp_i64(self.sidebar_width, 190, 360),
            list_width: clamp_i64(self.list_width, 260, 560),
            chat_width: clamp_i64(self.chat_width, 300, 620),
            sidebar_collapsed: self.sidebar_collapsed,
            rag_conversation_width: clamp_i64(self.rag_conversation_width, 220, 380),
            rag_sources_width: clamp_i64(self.rag_sources_width, 260, 460),
            rag_sources_collapsed: self.rag_sources_collapsed,
            last_section: normalize_app_section(&self.last_section),
            language: normalize_app_language(&self.language),
            local_profile_name: normalize_local_profile_name(&self.local_profile_name),
            editor_content_width: clamp_i64(self.editor_content_width, 560, 1440),
            editor_content_offset: clamp_i64(self.editor_content_offset, -720, 720),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteChatMessageDto {
    pub id: String,
    pub note_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagChatDto {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagChatMessageDto {
    pub id: String,
    pub chat_id: String,
    pub role: String,
    pub content: String,
    pub sources: Value,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    pub title: String,
    pub note_date: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteContentRequest {
    pub note_id: String,
    pub expected_content_version: i64,
    pub content_json: Value,
    pub content_markdown: String,
    pub content_html: String,
    pub plain_text: String,
    #[serde(default)]
    pub content_sidecars: Vec<NoteContentSidecarInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreNoteRevisionRequest {
    pub note_id: String,
    pub revision_id: String,
    pub expected_content_version: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContentSidecarInput {
    pub kind: String,
    #[serde(default = "default_sidecar_schema_version")]
    pub schema_version: i64,
    pub payload_json: Value,
}

fn default_sidecar_schema_version() -> i64 {
    1
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameNoteRequest {
    pub note_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveNoteRequest {
    pub note_id: String,
    pub project_title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectRequest {
    pub project_id: String,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTagRequest {
    pub name: String,
    pub color: String,
    pub custom_color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetNoteTagRequest {
    pub note_id: String,
    pub tag_id: String,
    pub assigned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameTagRequest {
    pub tag_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTagColorRequest {
    pub tag_id: String,
    pub color: String,
    pub custom_color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTagRequest {
    pub tag_id: String,
    pub name: String,
    pub color: String,
    pub custom_color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeTagsRequest {
    pub source_tag_id: String,
    pub target_tag_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreAttachmentRequest {
    pub note_id: String,
    pub kind: String,
    pub original_name: String,
    pub mime_type: String,
    pub original_attachment_id: Option<String>,
    pub edit_metadata: Option<Value>,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreAttachmentPathRequest {
    pub note_id: String,
    pub kind: String,
    pub source_path: String,
    pub original_attachment_id: Option<String>,
    pub edit_metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupRequest {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteChatMessageRequest {
    pub note_id: String,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRagChatRequest {
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRagChatRequest {
    pub chat_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRagChatMessageRequest {
    pub chat_id: String,
    pub role: String,
    pub content: String,
    #[serde(default = "empty_json_array")]
    pub sources: Value,
}

fn empty_json_array() -> Value {
    json!([])
}

#[derive(Debug)]
struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

#[derive(Clone, Debug)]
struct NoteRow {
    id: String,
    title: String,
    note_date: String,
    content_json: String,
    content_markdown: String,
    content_html: String,
    plain_text: String,
    project_id: Option<String>,
    project: String,
    is_favorite: bool,
    is_pinned: bool,
    pinned_at: Option<String>,
    icon_key: Option<String>,
    created_at: String,
    updated_at: String,
    content_version: i64,
    archived_at: Option<String>,
    deleted_at: Option<String>,
}

#[derive(Debug)]
struct NoteContentSnapshot {
    content_json: String,
    content_markdown: String,
    content_html: String,
    plain_text: String,
    content_version: i64,
    revision_checkpoint_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupData {
    version: u32,
    exported_at: String,
    #[serde(default)]
    app_version: Option<String>,
    projects: Vec<ProjectBackup>,
    tags: Vec<TagBackup>,
    notes: Vec<NoteBackup>,
    #[serde(default)]
    note_revisions: Vec<NoteRevisionBackup>,
    #[serde(default)]
    note_content_sidecars: Vec<NoteContentSidecarBackup>,
    #[serde(default)]
    note_revision_sidecars: Vec<NoteRevisionSidecarBackup>,
    note_tags: Vec<NoteTagBackup>,
    attachments: Vec<AttachmentBackup>,
    #[serde(default)]
    asset_blobs: Vec<AssetBlobBackup>,
    #[serde(default)]
    note_asset_refs: Vec<NoteAssetRefBackup>,
    #[serde(default)]
    revision_asset_refs: Vec<RevisionAssetRefBackup>,
    #[serde(default)]
    note_attachment_refs: Vec<NoteAttachmentRefBackup>,
    #[serde(default)]
    revision_attachment_refs: Vec<RevisionAttachmentRefBackup>,
    #[serde(default)]
    llm_providers: Vec<llm::LlmProviderBackup>,
    #[serde(default)]
    embedding_profiles: Vec<embedding::EmbeddingProfileBackup>,
    #[serde(default)]
    ai_chats: Vec<AiChatBackup>,
    #[serde(default)]
    ai_messages: Vec<AiMessageBackup>,
    app_settings: Vec<SettingBackup>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct AiChatBackup {
    id: String,
    scope: String,
    note_id: Option<String>,
    title: String,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct AiMessageBackup {
    id: String,
    chat_id: String,
    role: String,
    content: String,
    sources_json: Value,
    created_at: String,
}

#[derive(Debug)]
struct ValidatedBackup {
    data: BackupData,
    attachment_entries: HashSet<String>,
    missing_attachment_files: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreState {
    restore_id: String,
    staging_directory: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProjectBackup {
    id: String,
    title: String,
    description: String,
    color: Option<String>,
    icon_key: Option<String>,
    status: String,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TagBackup {
    id: String,
    name: String,
    color: String,
    custom_color: Option<String>,
    icon_key: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteBackup {
    id: String,
    title: String,
    note_date: String,
    content_json: Value,
    content_markdown: String,
    content_html: String,
    plain_text: String,
    #[serde(default)]
    content_version: i64,
    project_id: Option<String>,
    is_favorite: bool,
    #[serde(default)]
    is_pinned: bool,
    pinned_at: Option<String>,
    icon: Option<String>,
    icon_key: Option<String>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
    deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteRevisionBackup {
    id: String,
    note_id: String,
    content_json: Value,
    content_markdown: String,
    content_html: String,
    plain_text: String,
    created_at: String,
    #[serde(default)]
    snapshot_hash: Option<String>,
    #[serde(default)]
    revision_kind: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteContentSidecarBackup {
    note_id: String,
    kind: String,
    schema_version: i64,
    payload_json: Value,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteRevisionSidecarBackup {
    revision_id: String,
    kind: String,
    schema_version: i64,
    payload_json: Value,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteTagBackup {
    note_id: String,
    tag_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AttachmentBackup {
    id: String,
    note_id: String,
    kind: String,
    original_name: String,
    storage_rel_path: String,
    #[serde(default)]
    blob_id: Option<String>,
    mime_type: String,
    size_bytes: i64,
    original_attachment_id: Option<String>,
    #[serde(default)]
    edit_metadata: Option<Value>,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AssetBlobBackup {
    id: String,
    sha256: String,
    storage_rel_path: String,
    mime_type: String,
    size_bytes: i64,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteAssetRefBackup {
    note_id: String,
    blob_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RevisionAssetRefBackup {
    revision_id: String,
    blob_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NoteAttachmentRefBackup {
    note_id: String,
    attachment_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RevisionAttachmentRefBackup {
    revision_id: String,
    attachment_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SettingBackup {
    key: String,
    value_json: Value,
    updated_at: String,
}

pub struct AppState {
    store: Arc<Mutex<DataStore>>,
    embedding_operations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl AppState {
    fn new(store: DataStore) -> Self {
        Self {
            store: Arc::new(Mutex::new(store)),
            embedding_operations: Mutex::new(HashMap::new()),
        }
    }

    fn with_store<T>(&self, action: impl FnOnce(&mut DataStore) -> DataResult<T>) -> DataResult<T> {
        let mut store = self
            .store
            .lock()
            .map_err(|_| DataError::State("Хранилище данных временно недоступно".to_string()))?;
        action(&mut store)
    }

    pub(crate) fn resolve_asset_protocol(&self, asset_id: &str) -> DataResult<(PathBuf, String)> {
        self.with_store(|store| assets::resolve_blob_path(&store.conn, &store.base_dir, asset_id))
    }

    fn begin_embedding_operation(&self, profile_id: &str) -> DataResult<Arc<AtomicBool>> {
        let mut operations = self.embedding_operations.lock().map_err(|_| {
            DataError::State("Операции смыслового поиска (RAG) временно недоступны".to_string())
        })?;
        if operations.contains_key(profile_id) {
            return Err(DataError::State(
                "Обновление смыслового поиска (RAG) для этой модели уже выполняется".to_string(),
            ));
        }
        let token = Arc::new(AtomicBool::new(false));
        operations.insert(profile_id.to_string(), token.clone());
        Ok(token)
    }

    fn finish_embedding_operation(&self, profile_id: &str) {
        if let Ok(mut operations) = self.embedding_operations.lock() {
            operations.remove(profile_id);
        }
    }

    fn cancel_embedding_operation(&self, profile_id: &str) -> DataResult<bool> {
        let operations = self.embedding_operations.lock().map_err(|_| {
            DataError::State("Операции смыслового поиска (RAG) временно недоступны".to_string())
        })?;
        if let Some(token) = operations.get(profile_id) {
            token.store(true, Ordering::SeqCst);
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

async fn with_store_blocking<T, F>(store: Arc<Mutex<DataStore>>, action: F) -> DataResult<T>
where
    T: Send + 'static,
    F: FnOnce(&mut DataStore) -> DataResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = store
            .lock()
            .map_err(|_| DataError::State("Хранилище данных временно недоступно".to_string()))?;
        action(&mut store)
    })
    .await
    .map_err(|_| DataError::State("Фоновая операция с данными не завершена".to_string()))?
}

pub fn init_state(app: &mut App) -> Result<AppState, String> {
    let platform_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Не удалось определить директорию данных".to_string())?;
    #[cfg(debug_assertions)]
    let data_dir = std::env::var_os("NOTEFLOW_DEV_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or(platform_data_dir);
    #[cfg(not(debug_assertions))]
    let data_dir = platform_data_dir;
    DataStore::open(data_dir)
        .map(AppState::new)
        .map_err(|_| "Не удалось открыть хранилище данных".to_string())
}

pub struct DataStore {
    base_dir: PathBuf,
    conn: Connection,
}

impl DataStore {
    pub fn open(base_dir: PathBuf) -> DataResult<Self> {
        ensure_storage_dirs(&base_dir)?;
        let database_path = base_dir.join(DATABASE_FILE);
        let mut conn = Connection::open(database_path)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        let knowledge_migration_applied = Self::run_migrations(&mut conn)?;
        recover_interrupted_restore(&base_dir, &conn)?;
        let mut store = Self { base_dir, conn };
        revisions::run_startup_maintenance(&mut store.conn, &now_iso())?;
        assets::run_startup_maintenance(&mut store.conn, &store.base_dir, &now_iso())?;
        let _ = assets::collect_garbage(&mut store.conn, &store.base_dir);
        if knowledge_migration_applied {
            knowledge::reconcile(&mut store.conn)?;
        }
        Ok(store)
    }

    fn run_migrations(conn: &mut Connection) -> DataResult<bool> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );",
        )?;

        let applied_versions = {
            let mut statement = conn.prepare("SELECT version FROM schema_migrations")?;
            let rows = statement.query_map([], |row| row.get::<_, i64>(0))?;
            rows.collect::<Result<HashSet<_>, _>>()?
        };

        let mut knowledge_migration_applied = false;
        for migration in migrations() {
            if applied_versions.contains(&migration.version) {
                continue;
            }

            let transaction = conn.transaction()?;
            transaction.execute_batch(migration.sql)?;
            transaction.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                params![migration.version, migration.name, now_iso()],
            )?;
            transaction.commit()?;
            if migration.version == 9 {
                knowledge_migration_applied = true;
            }
        }

        Ok(knowledge_migration_applied)
    }

    #[cfg(test)]
    fn seed_demo_data_if_needed(&mut self) -> DataResult<()> {
        let existing_seed = self.get_setting("seed.demo.v1")?;
        if existing_seed.is_some() {
            return Ok(());
        }

        let transaction = self.conn.transaction()?;
        seed_projects(&transaction)?;
        seed_tags(&transaction)?;
        seed_notes(&transaction)?;
        set_setting_tx(
            &transaction,
            "seed.demo.v1",
            json!({ "seededAt": now_iso() }),
        )?;
        transaction.commit()?;
        self.rebuild_search_index()?;
        Ok(())
    }

    fn get_setting(&self, key: &str) -> DataResult<Option<Value>> {
        self.conn
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = ?1",
                params![key],
                |row| {
                    let value: String = row.get(0)?;
                    Ok(value)
                },
            )
            .optional()?
            .map(|value| serde_json::from_str(&value).map_err(DataError::from))
            .transpose()
    }

    fn first_run_required(&self) -> DataResult<bool> {
        if self.get_setting(FIRST_RUN_COMPLETED_KEY)?.is_some()
            || self.get_setting("seed.demo.v1")?.is_some()
        {
            return Ok(false);
        }
        let existing_data: i64 = self.conn.query_row(
            "SELECT (SELECT COUNT(*) FROM notes) + (SELECT COUNT(*) FROM projects)
                    + (SELECT COUNT(*) FROM tags)",
            [],
            |row| row.get(0),
        )?;
        Ok(existing_data == 0)
    }

    fn complete_first_run(
        &mut self,
        request: CompleteFirstRunRequest,
    ) -> DataResult<FirstRunCompletionDto> {
        if !self.first_run_required()? {
            return Err(DataError::InvalidInput(
                "Первый запуск уже завершён".to_string(),
            ));
        }
        let profile_name = normalize_required_text(&request.profile_name, "Имя профиля")?;
        if profile_name.chars().count() > 48 {
            return Err(DataError::InvalidInput(
                "Имя профиля слишком длинное".to_string(),
            ));
        }
        let mut settings = self.get_ui_settings()?;
        settings.local_profile_name = profile_name;
        let now = now_iso();
        let note_request = CreateNoteRequest {
            title: "Первая заметка".to_string(),
            note_date: Utc::now().format("%Y-%m-%d").to_string(),
        };
        let transaction = self.conn.transaction()?;
        let note_id = Self::insert_new_note(&transaction, &note_request, &now)?;
        set_setting_tx(
            &transaction,
            UI_SETTINGS_KEY,
            serde_json::to_value(&settings)?,
        )?;
        set_setting_tx(&transaction, FIRST_RUN_COMPLETED_KEY, json!(true))?;
        transaction.commit()?;
        knowledge::sync_note_best_effort(&mut self.conn, &note_id);
        Ok(FirstRunCompletionDto {
            note: self.get_note(&note_id)?,
            settings,
        })
    }

    fn get_ui_settings(&self) -> DataResult<UiSettingsDto> {
        let settings = self
            .get_setting(UI_SETTINGS_KEY)?
            .map(serde_json::from_value::<UiSettingsDto>)
            .transpose()?
            .unwrap_or_default()
            .normalized();
        Ok(settings)
    }

    fn update_ui_settings(&mut self, request: UiSettingsDto) -> DataResult<UiSettingsDto> {
        let settings = request.normalized();
        let transaction = self.conn.transaction()?;
        set_setting_tx(
            &transaction,
            UI_SETTINGS_KEY,
            serde_json::to_value(&settings)?,
        )?;
        transaction.commit()?;
        Ok(settings)
    }

    fn list_llm_providers<S: llm::SecretStorage>(
        &self,
        storage: &S,
    ) -> DataResult<Vec<llm::LlmProviderDto>> {
        llm::list_providers(&self.conn, storage)
    }

    fn save_llm_provider<S: llm::SecretStorage>(
        &mut self,
        storage: &S,
        request: llm::SaveLlmProviderRequest,
    ) -> DataResult<llm::LlmProviderDto> {
        llm::save_provider(&mut self.conn, storage, request)
    }

    fn delete_llm_provider<S: llm::SecretStorage>(
        &mut self,
        storage: &S,
        provider_id: &str,
    ) -> DataResult<()> {
        llm::delete_provider(&mut self.conn, storage, provider_id)
    }

    fn set_default_llm_provider<S: llm::SecretStorage>(
        &mut self,
        storage: &S,
        provider_id: &str,
    ) -> DataResult<llm::LlmProviderDto> {
        llm::set_default_provider(&mut self.conn, storage, provider_id)
    }

    fn delete_llm_provider_key<S: llm::SecretStorage>(
        &mut self,
        storage: &S,
        provider_id: &str,
    ) -> DataResult<llm::LlmProviderDto> {
        llm::delete_provider_key(&mut self.conn, storage, provider_id)
    }

    fn check_llm_provider_key<S: llm::SecretStorage>(
        &self,
        storage: &S,
        provider_id: &str,
    ) -> DataResult<llm::LlmKeyStatusDto> {
        llm::key_status(&self.conn, storage, provider_id)
    }

    fn get_llm_provider_record(&self, provider_id: &str) -> DataResult<llm::LlmProviderRecord> {
        llm::get_provider_record(&self.conn, provider_id)
    }

    fn get_default_llm_provider_record(&self) -> DataResult<Option<llm::LlmProviderRecord>> {
        llm::get_default_provider_record(&self.conn)
    }

    fn get_note_ai_privacy_accepted(&self, privacy_scope: &str) -> DataResult<bool> {
        let key = note_ai_privacy_key(privacy_scope)?;
        Ok(self
            .get_setting(key)?
            .and_then(|value| {
                value
                    .get("accepted")
                    .and_then(Value::as_bool)
                    .or_else(|| value.as_bool())
            })
            .unwrap_or(false))
    }

    fn accept_note_ai_privacy(&mut self, privacy_scope: &str) -> DataResult<()> {
        let key = note_ai_privacy_key(privacy_scope)?;
        let transaction = self.conn.transaction()?;
        set_setting_tx(
            &transaction,
            key,
            json!({
                "accepted": true,
                "acceptedAt": now_iso(),
                "scope": privacy_scope
            }),
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn note_ai_status<S: llm::SecretStorage>(
        &self,
        storage: &S,
    ) -> DataResult<llm::NoteAiStatusDto> {
        let provider = self.get_default_llm_provider_record()?;
        let privacy_scope = provider
            .as_ref()
            .map(llm::privacy_scope_for_provider)
            .unwrap_or("local");
        let privacy_accepted = self.get_note_ai_privacy_accepted(privacy_scope)?;
        llm::note_ai_status(provider.as_ref(), privacy_accepted, storage)
    }

    fn list_note_chat_messages(&self, note_id: &str) -> DataResult<Vec<NoteChatMessageDto>> {
        let normalized_note_id = normalize_required_text(note_id, "note_id")?;
        let note_exists = self
            .conn
            .query_row(
                "SELECT id FROM notes WHERE id = ?1 AND deleted_at IS NULL",
                params![normalized_note_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .is_some();
        if !note_exists {
            return Ok(Vec::new());
        }

        let mut statement = self.conn.prepare(
            "SELECT m.id, COALESCE(c.note_id, ''), m.role, m.content, m.created_at
             FROM ai_messages m
             INNER JOIN ai_chats c ON c.id = m.chat_id
             WHERE c.scope = 'note' AND c.note_id = ?1
             ORDER BY m.created_at ASC, m.rowid ASC",
        )?;
        let rows = statement.query_map(params![normalized_note_id], |row| {
            Ok(NoteChatMessageDto {
                id: row.get(0)?,
                note_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn save_note_chat_message(
        &mut self,
        request: SaveNoteChatMessageRequest,
    ) -> DataResult<NoteChatMessageDto> {
        let note_id = normalize_required_text(&request.note_id, "note_id")?;
        let role = normalize_note_chat_role(&request.role)?;
        let content = normalize_required_text(&request.content, "Сообщение чата")?;
        let note_title = self
            .conn
            .query_row(
                "SELECT title FROM notes WHERE id = ?1 AND deleted_at IS NULL",
                params![note_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| DataError::NotFound("Заметка для AI-чата не найдена".to_string()))?;
        let chat_title = normalize_note_chat_title(&note_title);
        let now = now_iso();
        let message_id = Uuid::new_v4().to_string();
        let transaction = self.conn.transaction()?;
        let existing_chat_id = transaction
            .query_row(
                "SELECT id FROM ai_chats WHERE scope = 'note' AND note_id = ?1",
                params![note_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let chat_id = if let Some(chat_id) = existing_chat_id {
            transaction.execute(
                "UPDATE ai_chats SET title = ?1, updated_at = ?2 WHERE id = ?3",
                params![chat_title, now, chat_id],
            )?;
            chat_id
        } else {
            let chat_id = Uuid::new_v4().to_string();
            transaction.execute(
                "INSERT INTO ai_chats (id, scope, note_id, title, created_at, updated_at)
                 VALUES (?1, 'note', ?2, ?3, ?4, ?4)",
                params![chat_id, note_id, chat_title, now],
            )?;
            chat_id
        };
        transaction.execute(
            "INSERT INTO ai_messages (id, chat_id, role, content, sources_json, created_at)
             VALUES (?1, ?2, ?3, ?4, '[]', ?5)",
            params![message_id, chat_id, role, content, now],
        )?;
        transaction.commit()?;

        Ok(NoteChatMessageDto {
            id: message_id,
            note_id,
            role,
            content,
            created_at: now,
        })
    }

    fn list_rag_chats(&self) -> DataResult<Vec<RagChatDto>> {
        let mut statement = self.conn.prepare(
            "SELECT id, title, created_at, updated_at
             FROM ai_chats
             WHERE scope = 'rag'
             ORDER BY updated_at DESC, id DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(RagChatDto {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn create_rag_chat(&mut self, request: CreateRagChatRequest) -> DataResult<RagChatDto> {
        let title = normalize_rag_chat_title(request.title.as_deref().unwrap_or("Новый чат"))?;
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        self.conn.execute(
            "INSERT INTO ai_chats (id, scope, note_id, title, created_at, updated_at)
             VALUES (?1, 'rag', NULL, ?2, ?3, ?3)",
            params![id, title, now],
        )?;
        Ok(RagChatDto {
            id,
            title,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    fn rename_rag_chat(&mut self, request: RenameRagChatRequest) -> DataResult<RagChatDto> {
        let chat_id = normalize_required_text(&request.chat_id, "chat_id")?;
        let title = normalize_rag_chat_title(&request.title)?;
        let now = now_iso();
        let changed = self.conn.execute(
            "UPDATE ai_chats SET title = ?1, updated_at = ?2
             WHERE id = ?3 AND scope = 'rag'",
            params![title, now, chat_id],
        )?;
        if changed == 0 {
            return Err(DataError::NotFound("RAG-чат не найден".to_string()));
        }
        let created_at = self.conn.query_row(
            "SELECT created_at FROM ai_chats WHERE id = ?1 AND scope = 'rag'",
            params![chat_id],
            |row| row.get(0),
        )?;
        Ok(RagChatDto {
            id: chat_id,
            title,
            created_at,
            updated_at: now,
        })
    }

    fn delete_rag_chat(&mut self, chat_id: &str) -> DataResult<()> {
        let chat_id = normalize_required_text(chat_id, "chat_id")?;
        let changed = self.conn.execute(
            "DELETE FROM ai_chats WHERE id = ?1 AND scope = 'rag'",
            params![chat_id],
        )?;
        if changed == 0 {
            return Err(DataError::NotFound("RAG-чат не найден".to_string()));
        }
        Ok(())
    }

    fn list_rag_chat_messages(&self, chat_id: &str) -> DataResult<Vec<RagChatMessageDto>> {
        let chat_id = normalize_required_text(chat_id, "chat_id")?;
        let mut statement = self.conn.prepare(
            "SELECT m.id, m.chat_id, m.role, m.content, m.sources_json, m.created_at
             FROM ai_messages m
             INNER JOIN ai_chats c ON c.id = m.chat_id
             WHERE c.scope = 'rag' AND c.id = ?1
             ORDER BY m.created_at ASC, m.rowid ASC",
        )?;
        let rows = statement.query_map(params![chat_id], |row| {
            let sources_json: String = row.get(4)?;
            Ok(RagChatMessageDto {
                id: row.get(0)?,
                chat_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                sources: serde_json::from_str(&sources_json).unwrap_or_else(|_| json!([])),
                created_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn save_rag_chat_message(
        &mut self,
        request: SaveRagChatMessageRequest,
    ) -> DataResult<RagChatMessageDto> {
        let chat_id = normalize_required_text(&request.chat_id, "chat_id")?;
        let role = normalize_note_chat_role(&request.role)?;
        let content = normalize_required_text(&request.content, "Сообщение чата")?;
        if !request.sources.is_array() {
            return Err(DataError::InvalidInput(
                "Источники RAG-сообщения должны быть массивом".to_string(),
            ));
        }
        let now = now_iso();
        let id = Uuid::new_v4().to_string();
        let transaction = self.conn.transaction()?;
        let chat_exists = transaction
            .query_row(
                "SELECT id FROM ai_chats WHERE id = ?1 AND scope = 'rag'",
                params![chat_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .is_some();
        if !chat_exists {
            return Err(DataError::NotFound("RAG-чат не найден".to_string()));
        }
        transaction.execute(
            "INSERT INTO ai_messages (id, chat_id, role, content, sources_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, chat_id, role, content, request.sources.to_string(), now],
        )?;
        transaction.execute(
            "UPDATE ai_chats SET updated_at = ?1 WHERE id = ?2 AND scope = 'rag'",
            params![now, chat_id],
        )?;
        transaction.commit()?;
        Ok(RagChatMessageDto {
            id,
            chat_id,
            role,
            content,
            sources: request.sources,
            created_at: now,
        })
    }

    fn update_llm_provider_status(
        &mut self,
        provider_id: &str,
        result: &llm::LlmConnectionTestResultDto,
    ) -> DataResult<()> {
        llm::update_provider_status(&mut self.conn, provider_id, result)
    }

    fn load_workspace(&mut self) -> DataResult<WorkspaceSnapshotDto> {
        Ok(WorkspaceSnapshotDto {
            notes: self.list_notes(None, false)?,
            projects: self.list_projects(false)?,
            tags: self.list_tags(None)?,
            archive_items: self.list_archive(None)?,
            data_location: self.data_location(),
        })
    }

    fn data_location(&self) -> DataLocationDto {
        DataLocationDto {
            data_dir: self.base_dir.to_string_lossy().to_string(),
            database_path: self
                .base_dir
                .join(DATABASE_FILE)
                .to_string_lossy()
                .to_string(),
        }
    }

    fn list_notes(
        &self,
        query: Option<String>,
        include_archived: bool,
    ) -> DataResult<Vec<NoteDto>> {
        let trimmed_query = query.unwrap_or_default().trim().to_string();
        let rows = if trimmed_query.is_empty() {
            self.query_note_rows(
                "SELECT n.id, n.title, n.note_date, n.content_json, n.content_markdown, n.content_html,
                        n.plain_text, n.project_id, COALESCE(p.title, 'Входящие') AS project_title,
                        n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at,
                        n.content_version
                 FROM notes n
                 LEFT JOIN projects p ON p.id = n.project_id
                 WHERE n.deleted_at IS NULL AND (?1 OR n.archived_at IS NULL)
                 ORDER BY n.is_pinned DESC, n.pinned_at DESC, n.updated_at DESC",
                params![include_archived],
            )?
        } else if let Some(fts_query) = search::build_fts_query(&trimmed_query) {
            match self.query_note_rows(
                "SELECT n.id, n.title, n.note_date, n.content_json, n.content_markdown, n.content_html,
                        n.plain_text, n.project_id, COALESCE(p.title, 'Входящие') AS project_title,
                        n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at,
                        n.content_version
                 FROM notes n
                 LEFT JOIN projects p ON p.id = n.project_id
                 WHERE n.deleted_at IS NULL
                   AND (?1 OR n.archived_at IS NULL)
                   AND n.id IN (SELECT note_id FROM note_search_fts WHERE note_search_fts MATCH ?2)
                 ORDER BY n.is_pinned DESC, n.pinned_at DESC, n.updated_at DESC",
                params![include_archived, fts_query],
            ) {
                Ok(rows) => rows,
                Err(_) => self.list_notes_like(&trimmed_query, include_archived)?,
            }
        } else {
            self.list_notes_like(&trimmed_query, include_archived)?
        };

        rows.into_iter()
            .map(|row| self.note_dto_from_row(row))
            .collect()
    }

    fn list_notes_like(&self, query: &str, include_archived: bool) -> DataResult<Vec<NoteRow>> {
        let like_query = format!("%{}%", query.to_lowercase());
        self.query_note_rows(
            "SELECT DISTINCT n.id, n.title, n.note_date, n.content_json, n.content_markdown, n.content_html,
                    n.plain_text, n.project_id, COALESCE(p.title, 'Входящие') AS project_title,
                    n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at,
                    n.content_version
             FROM notes n
             LEFT JOIN projects p ON p.id = n.project_id
             LEFT JOIN note_tags nt ON nt.note_id = n.id
             LEFT JOIN tags t ON t.id = nt.tag_id
             WHERE n.deleted_at IS NULL
               AND (?1 OR n.archived_at IS NULL)
               AND (
                    lower(n.title) LIKE ?2
                    OR lower(n.plain_text) LIKE ?2
                    OR lower(COALESCE(p.title, '')) LIKE ?2
                    OR lower(COALESCE(t.name, '')) LIKE ?2
               )
             ORDER BY n.is_pinned DESC, n.pinned_at DESC, n.updated_at DESC",
            params![include_archived, like_query],
        )
    }

    fn query_note_rows<P>(&self, sql: &str, params: P) -> DataResult<Vec<NoteRow>>
    where
        P: rusqlite::Params,
    {
        let mut statement = self.conn.prepare(sql)?;
        let rows = statement.query_map(params, |row| {
            Ok(NoteRow {
                id: row.get(0)?,
                title: row.get(1)?,
                note_date: row.get(2)?,
                content_json: row.get(3)?,
                content_markdown: row.get(4)?,
                content_html: row.get(5)?,
                plain_text: row.get(6)?,
                project_id: row.get(7)?,
                project: row.get(8)?,
                is_favorite: row.get::<_, i64>(9)? != 0,
                is_pinned: row.get::<_, i64>(10)? != 0,
                pinned_at: row.get(11)?,
                icon_key: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                archived_at: row.get(15)?,
                deleted_at: row.get(16)?,
                content_version: row.get(17)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn get_note_content_sidecars(&self, note_id: &str) -> DataResult<Vec<NoteContentSidecarDto>> {
        let mut statement = self.conn.prepare(
            "SELECT kind, schema_version, payload_json, created_at, updated_at
             FROM note_content_sidecars
             WHERE note_id = ?1
             ORDER BY kind",
        )?;
        let rows = statement.query_map(params![note_id], |row| {
            let payload_json: String = row.get(2)?;
            Ok(NoteContentSidecarDto {
                kind: row.get(0)?,
                schema_version: row.get(1)?,
                payload_json: serde_json::from_str(&payload_json).unwrap_or(Value::Null),
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn upsert_note_content_sidecar(
        connection: &Connection,
        note_id: &str,
        kind: &str,
        schema_version: i64,
        payload_json: &Value,
        created_at: &str,
        updated_at: &str,
    ) -> DataResult<()> {
        connection.execute(
            "INSERT INTO note_content_sidecars (
                note_id, kind, schema_version, payload_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(note_id, kind) DO UPDATE SET
                schema_version = excluded.schema_version,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at",
            params![
                note_id,
                kind,
                schema_version.max(1),
                payload_json.to_string(),
                created_at,
                updated_at
            ],
        )?;
        Ok(())
    }

    fn persist_note_content_sidecars(
        connection: &Connection,
        note_id: &str,
        content_json: &Value,
        sidecars: &[NoteContentSidecarInput],
        timestamp: &str,
    ) -> DataResult<()> {
        connection.execute(
            "DELETE FROM note_content_sidecars WHERE note_id = ?1",
            params![note_id],
        )?;
        Self::upsert_note_content_sidecar(
            connection,
            note_id,
            LEGACY_TIPTAP_SIDECAR_KIND,
            1,
            content_json,
            timestamp,
            timestamp,
        )?;

        for sidecar in sidecars {
            let kind = sidecar.kind.trim();
            if kind.is_empty() || kind == LEGACY_TIPTAP_SIDECAR_KIND {
                continue;
            }
            Self::upsert_note_content_sidecar(
                connection,
                note_id,
                kind,
                sidecar.schema_version,
                &sidecar.payload_json,
                timestamp,
                timestamp,
            )?;
        }
        Ok(())
    }

    fn note_dto_from_row(&self, row: NoteRow) -> DataResult<NoteDto> {
        let content_json =
            serde_json::from_str(&row.content_json).unwrap_or_else(|_| empty_document());
        let tags = self.get_note_tags(&row.id)?;
        let attachments = self.get_note_attachments(&row.id)?;
        let content_sidecars = self.get_note_content_sidecars(&row.id)?;
        let word_count = count_words(&row.plain_text);

        Ok(NoteDto {
            id: row.id,
            title: row.title,
            note_date: row.note_date,
            content_json,
            content_markdown: row.content_markdown,
            content_html: row.content_html,
            plain_text: row.plain_text,
            content_sidecars,
            project_id: row.project_id,
            project: row.project,
            is_favorite: row.is_favorite,
            is_pinned: row.is_pinned,
            pinned_at: row.pinned_at,
            icon_key: row.icon_key,
            created_at: row.created_at,
            updated_at: row.updated_at,
            content_version: row.content_version,
            archived_at: row.archived_at,
            deleted_at: row.deleted_at,
            tags,
            attachments,
            word_count,
        })
    }

    fn get_note(&self, note_id: &str) -> DataResult<NoteDto> {
        let rows = self.query_note_rows(
            "SELECT n.id, n.title, n.note_date, n.content_json, n.content_markdown, n.content_html,
                    n.plain_text, n.project_id, COALESCE(p.title, 'Входящие') AS project_title,
                    n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at,
                    n.content_version
             FROM notes n
             LEFT JOIN projects p ON p.id = n.project_id
             WHERE n.id = ?1 AND n.deleted_at IS NULL",
            params![note_id],
        )?;

        rows.into_iter()
            .next()
            .ok_or_else(|| DataError::NotFound("Заметка не найдена".to_string()))
            .and_then(|row| self.note_dto_from_row(row))
    }

    fn get_note_tags(&self, note_id: &str) -> DataResult<Vec<NoteTagDto>> {
        let mut statement = self.conn.prepare(
            "SELECT t.id, t.name, t.color, t.custom_color, t.icon_key
             FROM tags t
             INNER JOIN note_tags nt ON nt.tag_id = t.id
             WHERE nt.note_id = ?1
             ORDER BY lower(t.name)",
        )?;
        let rows = statement.query_map(params![note_id], |row| {
            Ok(NoteTagDto {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                custom_color: row.get(3)?,
                icon_key: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn get_note_attachments(&self, note_id: &str) -> DataResult<Vec<AttachmentDto>> {
        let mut statement = self.conn.prepare(
            "SELECT id, note_id, kind, original_name, storage_rel_path, blob_id, mime_type, size_bytes,
                    original_attachment_id, edit_metadata_json, created_at
             FROM attachments
             WHERE note_id = ?1
             ORDER BY created_at",
        )?;
        let rows = statement.query_map(params![note_id], attachment_from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn resolve_attachment_path(&self, attachment_id: &str) -> DataResult<PathBuf> {
        let attachment_id = normalize_required_text(attachment_id, "Идентификатор вложения")?;
        assets::materialize_attachment_view(&self.conn, &self.base_dir, &attachment_id)
    }

    fn note_content_snapshot(
        connection: &Connection,
        note_id: &str,
    ) -> DataResult<NoteContentSnapshot> {
        connection
            .query_row(
                "SELECT content_json, content_markdown, content_html, plain_text, content_version,
                        revision_checkpoint_at
                 FROM notes
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![note_id],
                |row| {
                    Ok(NoteContentSnapshot {
                        content_json: row.get(0)?,
                        content_markdown: row.get(1)?,
                        content_html: row.get(2)?,
                        plain_text: row.get(3)?,
                        content_version: row.get(4)?,
                        revision_checkpoint_at: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(|_| DataError::Transaction)?
            .ok_or_else(|| DataError::NotFound("Заметка не найдена".to_string()))
    }

    fn create_note(&mut self, request: CreateNoteRequest) -> DataResult<NoteDto> {
        let now = now_iso();
        let transaction = self
            .conn
            .transaction()
            .map_err(|_| DataError::Transaction)?;
        let note_id = Self::insert_new_note(&transaction, &request, &now)?;
        transaction.commit().map_err(|_| DataError::Transaction)?;
        knowledge::sync_note_best_effort(&mut self.conn, &note_id);
        self.get_note(&note_id)
    }

    fn insert_new_note(
        transaction: &Transaction<'_>,
        request: &CreateNoteRequest,
        now: &str,
    ) -> DataResult<String> {
        let title = normalize_required_text(&request.title, "Название заметки")?;
        validate_iso_date(&request.note_date)?;
        let note_id = Uuid::new_v4().to_string();
        let content_json = empty_document();
        let default_tag_id =
            ensure_tag_on(transaction, "новая", "blue").map_err(|_| DataError::Transaction)?;
        let project_id = ensure_project_on(transaction, "Входящие", "Быстрые заметки без проекта")
            .map_err(|_| DataError::Transaction)?;

        transaction
            .execute(
                "INSERT INTO notes (
                    id, title, note_date, content_json, content_markdown, content_html, plain_text,
                    project_id, is_favorite, icon, created_at, updated_at, revision_checkpoint_at
                 ) VALUES (?1, ?2, ?3, ?4, '', '', '', ?5, 0, 'doc', ?6, ?6, ?6)",
                params![
                    note_id,
                    title,
                    request.note_date,
                    content_json.to_string(),
                    project_id,
                    now
                ],
            )
            .map_err(|_| DataError::Transaction)?;
        Self::persist_note_content_sidecars(transaction, &note_id, &content_json, &[], now)
            .map_err(|_| DataError::Sidecar)?;
        transaction
            .execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![note_id, default_tag_id],
            )
            .map_err(|_| DataError::Transaction)?;
        Ok(note_id)
    }

    fn update_note_content(&mut self, request: UpdateNoteContentRequest) -> DataResult<NoteDto> {
        validate_note_content_request(&request)?;
        let now = now_iso();
        let transaction = self
            .conn
            .transaction()
            .map_err(|_| DataError::Transaction)?;
        let current = Self::note_content_snapshot(&transaction, &request.note_id)?;
        if current.content_version != request.expected_content_version {
            return Err(DataError::StaleWrite);
        }
        serde_json::from_str::<Value>(&current.content_json)
            .map_err(|_| DataError::Serialization)?;
        let revision_decision = revisions::periodic_revision_decision(
            &transaction,
            &request.note_id,
            &current.content_markdown,
            current.revision_checkpoint_at.as_deref(),
            &now,
        )
        .map_err(|_| DataError::Revision)?;
        let created_revision = revision_decision.snapshot_hash.is_some();
        if let Some(snapshot_hash) = revision_decision.snapshot_hash.as_deref() {
            revisions::insert_revision(
                &transaction,
                &request.note_id,
                &RevisionSnapshot {
                    content_json: &current.content_json,
                    content_markdown: &current.content_markdown,
                    content_html: &current.content_html,
                    plain_text: &current.plain_text,
                },
                RevisionKind::Periodic,
                snapshot_hash,
                &now,
            )
            .map_err(|_| DataError::Revision)?;
        }
        let updated = transaction
            .execute(
                "UPDATE notes
                 SET content_json = ?1, content_markdown = ?2, content_html = ?3, plain_text = ?4,
                     updated_at = ?5, content_version = content_version + 1,
                     revision_checkpoint_at = ?6
                 WHERE id = ?7 AND deleted_at IS NULL AND content_version = ?8",
                params![
                    request.content_json.to_string(),
                    request.content_markdown,
                    request.content_html,
                    request.plain_text,
                    now,
                    &revision_decision.checkpoint_at,
                    request.note_id,
                    request.expected_content_version
                ],
            )
            .map_err(|_| DataError::Transaction)?;
        if updated != 1 {
            return Err(DataError::StaleWrite);
        }
        Self::persist_note_content_sidecars(
            &transaction,
            &request.note_id,
            &request.content_json,
            &request.content_sidecars,
            &now,
        )
        .map_err(|_| DataError::Sidecar)?;
        assets::replace_note_references(
            &transaction,
            &request.note_id,
            persisted_reference_values(
                &request.content_json,
                &request.content_markdown,
                &request.content_html,
                &request.content_sidecars,
            ),
        )
        .map_err(|_| DataError::Sidecar)?;
        if created_revision {
            revisions::prune_note_revisions(
                &transaction,
                &request.note_id,
                &now,
                false,
                &HashSet::new(),
            )
            .map_err(|_| DataError::Revision)?;
        }
        transaction.commit().map_err(|_| DataError::Transaction)?;
        if created_revision {
            let _ = assets::collect_garbage(&mut self.conn, &self.base_dir);
        }
        knowledge::sync_note_best_effort(&mut self.conn, &request.note_id);
        self.get_note(&request.note_id)
    }

    fn restore_note_revision(
        &mut self,
        request: RestoreNoteRevisionRequest,
    ) -> DataResult<NoteDto> {
        if request.expected_content_version < 0 {
            return Err(DataError::InvalidInput(
                "Версия содержимого заметки некорректна".to_string(),
            ));
        }
        let now = now_iso();
        let transaction = self
            .conn
            .transaction()
            .map_err(|_| DataError::Transaction)?;
        let current = Self::note_content_snapshot(&transaction, &request.note_id)?;
        if current.content_version != request.expected_content_version {
            return Err(DataError::StaleWrite);
        }
        serde_json::from_str::<Value>(&current.content_json)
            .map_err(|_| DataError::Serialization)?;
        let restored_content = transaction
            .query_row(
                "SELECT content_json, content_markdown, content_html, plain_text
                 FROM note_revisions
                 WHERE id = ?1 AND note_id = ?2",
                params![request.revision_id, request.note_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()
            .map_err(|_| DataError::Revision)?
            .ok_or_else(|| DataError::NotFound("Ревизия заметки не найдена".to_string()))?;
        let (restored_content_json, restored_markdown, restored_html, restored_plain_text) =
            restored_content;
        serde_json::from_str::<Value>(&restored_content_json)
            .map_err(|_| DataError::Serialization)?;
        let current_snapshot_hash = revisions::snapshot_hash_for_note(
            &transaction,
            &request.note_id,
            &current.content_markdown,
        )
        .map_err(|_| DataError::Revision)?;
        revisions::insert_revision(
            &transaction,
            &request.note_id,
            &RevisionSnapshot {
                content_json: &current.content_json,
                content_markdown: &current.content_markdown,
                content_html: &current.content_html,
                plain_text: &current.plain_text,
            },
            RevisionKind::RestoreGuard,
            &current_snapshot_hash,
            &now,
        )
        .map_err(|_| DataError::Revision)?;
        let updated = transaction
            .execute(
                "UPDATE notes
                 SET content_json = ?1, content_markdown = ?2, content_html = ?3,
                     plain_text = ?4, updated_at = ?5, content_version = content_version + 1,
                     revision_checkpoint_at = ?5
                 WHERE id = ?6 AND deleted_at IS NULL AND content_version = ?7",
                params![
                    restored_content_json,
                    restored_markdown,
                    restored_html,
                    restored_plain_text,
                    now,
                    request.note_id,
                    request.expected_content_version
                ],
            )
            .map_err(|_| DataError::Transaction)?;
        if updated != 1 {
            return Err(DataError::StaleWrite);
        }
        transaction
            .execute(
                "DELETE FROM note_content_sidecars WHERE note_id = ?1",
                params![request.note_id],
            )
            .map_err(|_| DataError::Sidecar)?;
        let restored_sidecar_count = transaction
            .execute(
                "INSERT INTO note_content_sidecars (
                    note_id, kind, schema_version, payload_json, created_at, updated_at
                 )
                 SELECT ?1, kind, schema_version, payload_json, ?2, ?2
                 FROM note_revision_sidecars
                 WHERE revision_id = ?3",
                params![request.note_id, now, request.revision_id],
            )
            .map_err(|_| DataError::Sidecar)?;
        if restored_sidecar_count == 0 {
            transaction
                .execute(
                    "INSERT INTO note_content_sidecars (
                        note_id, kind, schema_version, payload_json, created_at, updated_at
                     ) VALUES (?1, ?2, 1, ?3, ?4, ?4)",
                    params![
                        request.note_id,
                        LEGACY_TIPTAP_SIDECAR_KIND,
                        restored_content_json,
                        now
                    ],
                )
                .map_err(|_| DataError::Sidecar)?;
        }
        assets::restore_note_references_from_revision(
            &transaction,
            &request.note_id,
            &request.revision_id,
        )
        .map_err(|_| DataError::Sidecar)?;
        let protected_revision_ids = HashSet::from([request.revision_id.clone()]);
        revisions::prune_note_revisions(
            &transaction,
            &request.note_id,
            &now,
            false,
            &protected_revision_ids,
        )
        .map_err(|_| DataError::Revision)?;
        transaction.commit().map_err(|_| DataError::Transaction)?;
        let _ = assets::collect_garbage(&mut self.conn, &self.base_dir);
        knowledge::sync_note_best_effort(&mut self.conn, &request.note_id);
        self.get_note(&request.note_id)
    }

    fn rename_note(&mut self, request: RenameNoteRequest) -> DataResult<NoteDto> {
        let title = normalize_required_text(&request.title, "Название заметки")?;
        self.conn.execute(
            "UPDATE notes SET title = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
            params![title, now_iso(), request.note_id],
        )?;
        self.get_note(&request.note_id)
    }

    fn set_note_tag(&mut self, request: SetNoteTagRequest) -> DataResult<NoteDto> {
        let transaction = self.conn.transaction()?;
        let note_exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM notes WHERE id = ?1 AND deleted_at IS NULL)",
            params![request.note_id],
            |row| row.get(0),
        )?;
        let tag_exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM tags WHERE id = ?1)",
            params![request.tag_id],
            |row| row.get(0),
        )?;
        if !note_exists || !tag_exists {
            return Err(DataError::NotFound(
                "Заметка или тег не найдены".to_string(),
            ));
        }
        let changed = if request.assigned {
            transaction.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![request.note_id, request.tag_id],
            )?
        } else {
            transaction.execute(
                "DELETE FROM note_tags WHERE note_id = ?1 AND tag_id = ?2",
                params![request.note_id, request.tag_id],
            )?
        };
        if changed > 0 {
            transaction.execute(
                "UPDATE notes SET updated_at = ?1 WHERE id = ?2",
                params![now_iso(), request.note_id],
            )?;
        }
        transaction.commit()?;
        if changed > 0 {
            knowledge::sync_note_best_effort(&mut self.conn, &request.note_id);
        }
        self.get_note(&request.note_id)
    }

    fn duplicate_note(&mut self, note_id: &str) -> DataResult<NoteDto> {
        let new_id = Uuid::new_v4().to_string();
        let now = now_iso();
        let transaction = self
            .conn
            .transaction()
            .map_err(|_| DataError::Transaction)?;
        let source = transaction
            .query_row(
                "SELECT title, note_date, content_json, content_markdown, content_html, plain_text,
                        project_id, icon_key
                 FROM notes
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![note_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                    ))
                },
            )
            .optional()
            .map_err(|_| DataError::Transaction)?
            .ok_or_else(|| DataError::NotFound("Заметка не найдена".to_string()))?;
        let (
            source_title,
            source_note_date,
            source_content_json,
            source_content_markdown,
            source_content_html,
            source_plain_text,
            source_project_id,
            source_icon_key,
        ) = source;
        let source_attachments = {
            let mut statement = transaction
                .prepare(
                    "SELECT id, kind, original_name, storage_rel_path, blob_id, mime_type,
                            size_bytes, original_attachment_id, edit_metadata_json, created_at
                     FROM attachments WHERE note_id = ?1 ORDER BY created_at, id",
                )
                .map_err(|_| DataError::Transaction)?;
            let rows = statement
                .query_map(params![note_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, String>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                })
                .map_err(|_| DataError::Transaction)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| DataError::Transaction)?;
            rows
        };
        let attachment_id_map = source_attachments
            .iter()
            .map(|attachment| (attachment.0.clone(), Uuid::new_v4().to_string()))
            .collect::<HashMap<_, _>>();
        let mut duplicate_content_json = serde_json::from_str::<Value>(&source_content_json)
            .map_err(|_| DataError::Serialization)?;
        rewrite_attachment_ids_in_json(&mut duplicate_content_json, &attachment_id_map);
        let duplicate_content_markdown =
            rewrite_attachment_ids_in_text(&source_content_markdown, &attachment_id_map);
        let duplicate_content_html =
            rewrite_attachment_ids_in_text(&source_content_html, &attachment_id_map);
        let source_sidecars = {
            let mut statement = transaction
                .prepare(
                    "SELECT kind, schema_version, payload_json
                     FROM note_content_sidecars WHERE note_id = ?1 ORDER BY kind",
                )
                .map_err(|_| DataError::Sidecar)?;
            let rows = statement
                .query_map(params![note_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|_| DataError::Sidecar)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| DataError::Sidecar)?;
            rows
        };

        transaction
            .execute(
                "INSERT INTO notes (
                    id, title, note_date, content_json, content_markdown, content_html, plain_text,
                    project_id, is_favorite, icon, icon_key, created_at, updated_at,
                    revision_checkpoint_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 'doc', ?9, ?10, ?10, ?10)",
                params![
                    new_id,
                    format!("{source_title} - копия"),
                    source_note_date,
                    duplicate_content_json.to_string(),
                    duplicate_content_markdown,
                    duplicate_content_html,
                    source_plain_text,
                    source_project_id,
                    source_icon_key,
                    now
                ],
            )
            .map_err(|_| DataError::Transaction)?;
        for attachment in &source_attachments {
            let new_attachment_id = attachment_id_map
                .get(&attachment.0)
                .ok_or(DataError::Transaction)?;
            let new_original_id = attachment
                .7
                .as_ref()
                .and_then(|id| attachment_id_map.get(id));
            transaction
                .execute(
                    "INSERT INTO attachments (
                        id, note_id, kind, original_name, storage_rel_path, blob_id, mime_type,
                        size_bytes, original_attachment_id, edit_metadata_json, created_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        new_attachment_id,
                        new_id,
                        attachment.1,
                        attachment.2,
                        attachment.3,
                        attachment.4,
                        attachment.5,
                        attachment.6,
                        new_original_id,
                        attachment.8,
                        now
                    ],
                )
                .map_err(|_| DataError::Transaction)?;
        }
        transaction
            .execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id)
                 SELECT ?1, tag_id FROM note_tags WHERE note_id = ?2",
                params![new_id, note_id],
            )
            .map_err(|_| DataError::Transaction)?;
        for (kind, schema_version, payload) in &source_sidecars {
            let mut value =
                serde_json::from_str::<Value>(payload).map_err(|_| DataError::Serialization)?;
            rewrite_attachment_ids_in_json(&mut value, &attachment_id_map);
            Self::upsert_note_content_sidecar(
                &transaction,
                &new_id,
                kind,
                *schema_version,
                &value,
                &now,
                &now,
            )
            .map_err(|_| DataError::Sidecar)?;
        }
        if source_sidecars.is_empty() {
            Self::upsert_note_content_sidecar(
                &transaction,
                &new_id,
                LEGACY_TIPTAP_SIDECAR_KIND,
                1,
                &duplicate_content_json,
                &now,
                &now,
            )
            .map_err(|_| DataError::Sidecar)?;
        }
        let duplicate_sidecars = source_sidecars
            .iter()
            .filter_map(|(_, _, payload)| serde_json::from_str::<Value>(payload).ok())
            .map(|mut value| {
                rewrite_attachment_ids_in_json(&mut value, &attachment_id_map);
                NoteContentSidecarInput {
                    kind: "duplicate".to_string(),
                    schema_version: 1,
                    payload_json: value,
                }
            })
            .collect::<Vec<_>>();
        assets::replace_note_references(
            &transaction,
            &new_id,
            persisted_reference_values(
                &duplicate_content_json,
                &duplicate_content_markdown,
                &duplicate_content_html,
                &duplicate_sidecars,
            ),
        )
        .map_err(|_| DataError::Transaction)?;
        transaction.commit().map_err(|_| DataError::Transaction)?;
        knowledge::sync_note_best_effort(&mut self.conn, &new_id);
        self.get_note(&new_id)
    }

    fn toggle_note_pin(&mut self, note_id: &str) -> DataResult<NoteDto> {
        let note = self.get_note(note_id)?;
        let now = now_iso();
        if note.is_pinned {
            self.conn.execute(
                "UPDATE notes
                 SET is_pinned = 0, pinned_at = NULL, updated_at = ?1
                 WHERE id = ?2 AND deleted_at IS NULL",
                params![now, note_id],
            )?;
        } else {
            self.conn.execute(
                "UPDATE notes
                 SET is_pinned = 1, pinned_at = ?1, updated_at = ?1
                 WHERE id = ?2 AND deleted_at IS NULL",
                params![now, note_id],
            )?;
        }
        self.get_note(note_id)
    }

    fn move_note_to_project(&mut self, request: MoveNoteRequest) -> DataResult<NoteDto> {
        let project_title = normalize_required_text(&request.project_title, "Название проекта")?;
        let project_id = self.ensure_project(&project_title, "Проект заметок")?;
        self.conn.execute(
            "UPDATE notes SET project_id = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
            params![project_id, now_iso(), request.note_id],
        )?;
        self.get_note(&request.note_id)
    }

    fn archive_note(&mut self, note_id: &str) -> DataResult<()> {
        self.conn.execute(
            "UPDATE notes SET archived_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now_iso(), note_id],
        )?;
        Ok(())
    }

    fn restore_note(&mut self, note_id: &str) -> DataResult<NoteDto> {
        self.conn.execute(
            "UPDATE notes SET archived_at = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now_iso(), note_id],
        )?;
        knowledge::sync_note_best_effort(&mut self.conn, note_id);
        self.get_note(note_id)
    }

    fn delete_note(&mut self, note_id: &str) -> DataResult<()> {
        self.conn.execute(
            "UPDATE notes SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now_iso(), note_id],
        )?;
        self.conn
            .execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
        knowledge::remove_note_index(&mut self.conn, note_id)?;
        Ok(())
    }

    fn delete_note_permanently(&mut self, note_id: &str) -> DataResult<()> {
        let transaction = self.conn.transaction()?;
        transaction.execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
        transaction.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
        transaction.commit()?;
        let _ = assets::collect_garbage(&mut self.conn, &self.base_dir);
        Ok(())
    }

    fn list_projects(&self, include_archived: bool) -> DataResult<Vec<ProjectCardDto>> {
        let mut statement = self.conn.prepare(
            "SELECT p.id, p.title, p.description, p.color, p.icon_key, p.status, p.archived_at,
                    COUNT(DISTINCT CASE WHEN n.deleted_at IS NULL AND n.archived_at IS NULL THEN n.id END) AS note_count,
                    COUNT(DISTINCT a.id) AS file_count
             FROM projects p
             LEFT JOIN notes n ON n.project_id = p.id
             LEFT JOIN attachments a ON a.note_id = n.id
             WHERE ?1 OR p.archived_at IS NULL
             GROUP BY p.id
             ORDER BY lower(p.title)",
        )?;
        let rows = statement.query_map(params![include_archived], |row| {
            let files: i64 = row.get(8)?;
            Ok(ProjectCardDto {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                icon_key: row.get(4)?,
                status: row.get(5)?,
                archived_at: row.get(6)?,
                notes: row.get(7)?,
                tasks: 0,
                files: if files > 0 { Some(files) } else { None },
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn create_project(&mut self, request: CreateProjectRequest) -> DataResult<ProjectCardDto> {
        let title = normalize_required_text(&request.title, "Название проекта")?;
        let description = if request.description.trim().is_empty() {
            "Новое пространство заметок".to_string()
        } else {
            request.description.trim().to_string()
        };
        let project_id = Uuid::new_v4().to_string();
        let now = now_iso();
        self.conn.execute(
            "INSERT INTO projects (id, title, description, color, icon_key, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'blue', 'project', 'active', ?4, ?4)",
            params![project_id, title, description, now],
        )?;
        self.list_projects(false)?
            .into_iter()
            .find(|project| project.id == project_id)
            .ok_or_else(|| DataError::NotFound("Проект не найден после создания".to_string()))
    }

    fn update_project(&mut self, request: UpdateProjectRequest) -> DataResult<ProjectCardDto> {
        let title = normalize_required_text(&request.title, "Название проекта")?;
        let description = request.description.trim();
        let updated = self.conn.execute(
            "UPDATE projects SET title = ?1, description = ?2, updated_at = ?3
             WHERE id = ?4 AND archived_at IS NULL",
            params![title, description, now_iso(), request.project_id],
        )?;
        if updated == 0 {
            return Err(DataError::NotFound("Проект не найден".to_string()));
        }
        self.list_projects(false)?
            .into_iter()
            .find(|project| project.id == request.project_id)
            .ok_or_else(|| DataError::NotFound("Проект не найден".to_string()))
    }

    fn archive_project(&mut self, project_id: &str) -> DataResult<()> {
        let updated = self.conn.execute(
            "UPDATE projects SET archived_at = ?1, status = 'archived', updated_at = ?1
             WHERE id = ?2 AND archived_at IS NULL",
            params![now_iso(), project_id],
        )?;
        if updated == 0 {
            return Err(DataError::NotFound("Проект не найден".to_string()));
        }
        Ok(())
    }

    fn import_markdown(
        &mut self,
        request: ImportMarkdownRequest,
    ) -> DataResult<ImportMarkdownResultDto> {
        if request.notes.is_empty() || request.notes.len() > MAX_MARKDOWN_IMPORT_FILES {
            return Err(DataError::InvalidInput(
                "Выберите от 1 до 32 Markdown-файлов".to_string(),
            ));
        }
        let mut total_bytes = 0usize;
        for note in &request.notes {
            total_bytes = total_bytes.saturating_add(note.content_markdown.len());
            if note.content_markdown.len() > MAX_MARKDOWN_IMPORT_FILE_BYTES
                || total_bytes > MAX_MARKDOWN_IMPORT_TOTAL_BYTES
            {
                return Err(DataError::InvalidInput(
                    "Markdown-файлы слишком большие".to_string(),
                ));
            }
            normalize_required_text(&note.title, "Название заметки")?;
            if note.content_markdown.contains("noteflow-asset://")
                || note.content_markdown.contains("noteflow-file://")
            {
                return Err(DataError::InvalidInput(
                    "Локальные вложения нельзя импортировать из Markdown".to_string(),
                ));
            }
            validate_note_content_request(&UpdateNoteContentRequest {
                note_id: String::new(),
                expected_content_version: 0,
                content_json: note.content_json.clone(),
                content_markdown: note.content_markdown.clone(),
                content_html: note.content_html.clone(),
                plain_text: note.plain_text.clone(),
                content_sidecars: note.content_sidecars.clone(),
            })?;
        }

        let now = now_iso();
        let note_date = Utc::now().format("%Y-%m-%d").to_string();
        let transaction = self.conn.transaction()?;
        let project_id =
            ensure_project_on(&transaction, "Входящие", "Быстрые заметки без проекта")?;
        let mut ids = Vec::with_capacity(request.notes.len());
        for note in &request.notes {
            let id = Uuid::new_v4().to_string();
            transaction.execute(
                "INSERT INTO notes (
                    id, title, note_date, content_json, content_markdown, content_html, plain_text,
                    project_id, is_favorite, icon, created_at, updated_at, revision_checkpoint_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 'doc', ?9, ?9, ?9)",
                params![
                    id,
                    note.title.trim(),
                    note_date,
                    note.content_json.to_string(),
                    note.content_markdown,
                    note.content_html,
                    note.plain_text,
                    project_id,
                    now
                ],
            )?;
            Self::persist_note_content_sidecars(
                &transaction,
                &id,
                &note.content_json,
                &note.content_sidecars,
                &now,
            )?;
            ids.push(id);
        }
        transaction.commit()?;
        for id in &ids {
            knowledge::sync_note_best_effort(&mut self.conn, id);
        }
        Ok(ImportMarkdownResultDto {
            notes: ids
                .iter()
                .map(|id| self.get_note(id))
                .collect::<DataResult<_>>()?,
        })
    }

    fn list_tags(&self, query: Option<String>) -> DataResult<Vec<TagRowDto>> {
        let trimmed_query = query.unwrap_or_default().trim().to_lowercase();
        let like_query = format!("%{trimmed_query}%");
        let mut statement = self.conn.prepare(
            "SELECT t.id, t.name, t.color, t.custom_color, t.icon_key,
                    COUNT(DISTINCT CASE WHEN n.deleted_at IS NULL AND n.archived_at IS NULL THEN n.id END) AS note_count
             FROM tags t
             LEFT JOIN note_tags nt ON nt.tag_id = t.id
             LEFT JOIN notes n ON n.id = nt.note_id
             WHERE ?1 = '' OR lower(t.name) LIKE ?2
             GROUP BY t.id
             ORDER BY lower(t.name)",
        )?;
        let rows = statement.query_map(params![trimmed_query, like_query], |row| {
            Ok(TagRowDto {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                custom_color: row.get(3)?,
                icon_key: row.get(4)?,
                count: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn create_tag(&mut self, request: CreateTagRequest) -> DataResult<TagRowDto> {
        let name = normalize_tag_name(&request.name)?;
        if tag_name_exists(&self.conn, &name, None)? {
            return Err(DataError::InvalidInput(
                "Тег с таким названием уже существует".to_string(),
            ));
        }
        let tag_id = Uuid::new_v4().to_string();
        let now = now_iso();
        let icon_key = infer_tag_icon_key(&name);
        self.conn.execute(
            "INSERT INTO tags (id, name, color, custom_color, icon_key, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![
                tag_id,
                name,
                normalize_tag_color(&request.color),
                normalize_tag_custom_color(request.custom_color)?,
                icon_key,
                now
            ],
        )?;
        self.list_tags(None)?
            .into_iter()
            .find(|tag| tag.id == tag_id)
            .ok_or_else(|| DataError::NotFound("Тег не найден после создания".to_string()))
    }

    fn update_tag(&mut self, request: UpdateTagRequest) -> DataResult<Vec<TagRowDto>> {
        let name = normalize_tag_name(&request.name)?;
        if tag_name_exists(&self.conn, &name, Some(&request.tag_id))? {
            return Err(DataError::InvalidInput(
                "Тег с таким названием уже существует".to_string(),
            ));
        }
        let changed = self.conn.execute(
            "UPDATE tags
             SET name = ?1, color = ?2, custom_color = ?3, updated_at = ?4
             WHERE id = ?5",
            params![
                name,
                normalize_tag_color(&request.color),
                normalize_tag_custom_color(request.custom_color)?,
                now_iso(),
                request.tag_id
            ],
        )?;
        if changed == 0 {
            return Err(DataError::NotFound("Тег не найден".to_string()));
        }
        self.list_tags(None)
    }

    fn rename_tag(&mut self, request: RenameTagRequest) -> DataResult<Vec<TagRowDto>> {
        let name = normalize_required_text(&request.name, "Название тега")?;
        self.conn.execute(
            "UPDATE tags SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now_iso(), request.tag_id],
        )?;
        self.list_tags(None)
    }

    fn update_tag_color(&mut self, request: UpdateTagColorRequest) -> DataResult<Vec<TagRowDto>> {
        self.conn.execute(
            "UPDATE tags SET color = ?1, custom_color = ?2, updated_at = ?3 WHERE id = ?4",
            params![
                request.color,
                request.custom_color,
                now_iso(),
                request.tag_id
            ],
        )?;
        self.list_tags(None)
    }

    fn delete_tag(&mut self, tag_id: &str) -> DataResult<Vec<TagRowDto>> {
        self.conn
            .execute("DELETE FROM tags WHERE id = ?1", params![tag_id])?;
        self.list_tags(None)
    }

    fn merge_tags(&mut self, request: MergeTagsRequest) -> DataResult<Vec<TagRowDto>> {
        if request.source_tag_id == request.target_tag_id {
            return Err(DataError::InvalidInput(
                "Выберите два разных тега".to_string(),
            ));
        }

        let transaction = self.conn.transaction()?;
        transaction.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id)
             SELECT note_id, ?1 FROM note_tags WHERE tag_id = ?2",
            params![request.target_tag_id, request.source_tag_id],
        )?;
        transaction.execute(
            "DELETE FROM tags WHERE id = ?1",
            params![request.source_tag_id],
        )?;
        transaction.commit()?;
        self.list_tags(None)
    }

    fn ensure_project(&mut self, title: &str, description: &str) -> DataResult<String> {
        ensure_project_on(&self.conn, title, description)
    }

    fn list_archive(&self, query: Option<String>) -> DataResult<Vec<ArchiveItemDto>> {
        let query = query.unwrap_or_default().trim().to_lowercase();
        let like_query = format!("%{query}%");
        let mut items = Vec::new();

        let mut note_statement = self.conn.prepare(
            "SELECT id, title, archived_at
             FROM notes
             WHERE archived_at IS NOT NULL AND deleted_at IS NULL
               AND (?1 = '' OR lower(title) LIKE ?2)
             ORDER BY archived_at DESC",
        )?;
        let note_rows = note_statement.query_map(params![query, like_query], |row| {
            Ok(ArchiveItemDto {
                id: row.get(0)?,
                title: row.get(1)?,
                archived_at: format_archived_at(row.get::<_, String>(2)?),
                kind: "Заметка".to_string(),
            })
        })?;
        items.extend(note_rows.collect::<Result<Vec<_>, _>>()?);

        let mut project_statement = self.conn.prepare(
            "SELECT id, title, archived_at
             FROM projects
             WHERE archived_at IS NOT NULL
               AND (?1 = '' OR lower(title) LIKE ?2)
             ORDER BY archived_at DESC",
        )?;
        let project_rows = project_statement.query_map(params![query, like_query], |row| {
            Ok(ArchiveItemDto {
                id: row.get(0)?,
                title: row.get(1)?,
                archived_at: format_archived_at(row.get::<_, String>(2)?),
                kind: "Проект".to_string(),
            })
        })?;
        items.extend(project_rows.collect::<Result<Vec<_>, _>>()?);

        Ok(items)
    }

    fn restore_archive_item(&mut self, item_id: &str, kind: &str) -> DataResult<()> {
        if kind == "Проект" {
            self.conn.execute(
                "UPDATE projects SET archived_at = NULL, status = 'active', updated_at = ?1 WHERE id = ?2",
                params![now_iso(), item_id],
            )?;
        } else {
            self.conn.execute(
                "UPDATE notes SET archived_at = NULL, updated_at = ?1 WHERE id = ?2",
                params![now_iso(), item_id],
            )?;
        }
        Ok(())
    }

    fn delete_archive_item(&mut self, item_id: &str, kind: &str) -> DataResult<()> {
        if kind == "Проект" {
            self.conn
                .execute("DELETE FROM projects WHERE id = ?1", params![item_id])?;
        } else {
            self.delete_note_permanently(item_id)?;
        }
        Ok(())
    }

    fn store_attachment(
        &mut self,
        request: StoreAttachmentRequest,
    ) -> DataResult<AttachmentStoreResultDto> {
        self.get_note(&request.note_id)?;
        let kind = if request.kind == "image" {
            "image"
        } else {
            "file"
        };
        if let Some(original_attachment_id) = &request.original_attachment_id {
            self.ensure_original_image_attachment(&request.note_id, original_attachment_id)?;
        }
        let blob = assets::prepare_blob_from_bytes(
            &self.base_dir,
            &request.bytes,
            &request.mime_type,
            kind == "image",
        )?;
        self.insert_prepared_attachment(
            request.note_id,
            kind,
            request.original_name,
            request.original_attachment_id,
            request.edit_metadata,
            blob,
        )
    }

    fn store_attachment_from_path(
        &mut self,
        request: StoreAttachmentPathRequest,
    ) -> DataResult<AttachmentStoreResultDto> {
        self.get_note(&request.note_id)?;
        let kind = if request.kind == "image" {
            "image"
        } else {
            "file"
        };
        if let Some(original_attachment_id) = &request.original_attachment_id {
            self.ensure_original_image_attachment(&request.note_id, original_attachment_id)?;
        }
        let source_path = PathBuf::from(request.source_path);
        let original_name = source_path
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
            .ok_or_else(|| {
                DataError::InvalidInput("Имя выбранного файла некорректно".to_string())
            })?;
        let requested_mime = mime_type_from_file_name(&original_name, kind == "image");
        let blob = assets::prepare_blob_from_path(
            &self.base_dir,
            &source_path,
            &requested_mime,
            kind == "image",
        )?;
        self.insert_prepared_attachment(
            request.note_id,
            kind,
            original_name,
            request.original_attachment_id,
            request.edit_metadata,
            blob,
        )
    }

    fn insert_prepared_attachment(
        &mut self,
        note_id: String,
        kind: &str,
        original_name: String,
        original_attachment_id: Option<String>,
        edit_metadata: Option<Value>,
        blob: assets::PreparedBlob,
    ) -> DataResult<AttachmentStoreResultDto> {
        let attachment_id = Uuid::new_v4().to_string();
        let created_at = now_iso();

        let attachment = AttachmentDto {
            id: attachment_id,
            note_id,
            kind: kind.to_string(),
            original_name,
            storage_rel_path: blob.relative_path.clone(),
            blob_id: Some(blob.id.clone()),
            asset_uri: Some(assets::asset_uri(&blob.id)),
            mime_type: blob.mime_type.clone(),
            size_bytes: blob.size_bytes,
            original_attachment_id,
            edit_metadata: edit_metadata.unwrap_or_else(|| json!({})),
            created_at: created_at.clone(),
        };
        let transaction = self.conn.transaction()?;
        assets::register_blob(&transaction, &blob, &created_at)?;
        transaction.execute(
            "INSERT INTO attachments (
                id, note_id, kind, original_name, storage_rel_path, mime_type, size_bytes,
                original_attachment_id, edit_metadata_json, created_at, blob_id
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                attachment.id,
                attachment.note_id,
                attachment.kind,
                attachment.original_name,
                attachment.storage_rel_path,
                attachment.mime_type,
                attachment.size_bytes,
                attachment.original_attachment_id,
                attachment.edit_metadata.to_string(),
                attachment.created_at,
                attachment.blob_id
            ],
        )?;
        transaction.execute(
            "INSERT INTO note_attachment_refs (note_id, attachment_id) VALUES (?1, ?2)",
            params![attachment.note_id, attachment.id],
        )?;
        transaction.execute(
            "INSERT OR IGNORE INTO note_asset_refs (note_id, blob_id) VALUES (?1, ?2)",
            params![attachment.note_id, blob.id],
        )?;
        transaction.commit()?;

        Ok(AttachmentStoreResultDto {
            size_label: format_file_size(attachment.size_bytes),
            attachment,
        })
    }

    fn ensure_original_image_attachment(
        &self,
        note_id: &str,
        attachment_id: &str,
    ) -> DataResult<()> {
        let exists = self.conn.query_row(
            "SELECT COUNT(*)
                 FROM attachments
                 WHERE id = ?1 AND note_id = ?2 AND kind = 'image'",
            params![attachment_id, note_id],
            |row| row.get::<_, i64>(0),
        )? > 0;

        if exists {
            Ok(())
        } else {
            Err(DataError::InvalidInput(
                "Оригинальное изображение не найдено в managed storage".to_string(),
            ))
        }
    }

    fn export_note_markdown(&self, note_id: &str) -> DataResult<ExportResultDto> {
        let note = self.get_note(note_id)?;
        let stem = sanitize_file_name(&note.title);
        let file_name = format!("{stem}.md");
        let relative_path = format!("exports/{file_name}");
        let path = self.resolve_storage_path(&relative_path)?;
        let assets_directory_name = format!("{stem}.assets");
        let assets_directory =
            self.resolve_storage_path(&format!("exports/{assets_directory_name}"))?;
        let mut markdown = note.content_markdown.clone();
        let mut used_names = HashSet::new();
        let mut exported_blobs = HashMap::<String, String>::new();
        let referenced_blobs = {
            let mut statement = self.conn.prepare(
                "SELECT b.id, b.mime_type, MIN(a.original_name)
                 FROM note_asset_refs r
                 INNER JOIN asset_blobs b ON b.id = r.blob_id
                 LEFT JOIN attachments a ON a.blob_id = b.id AND a.note_id = ?1
                 WHERE r.note_id = ?1
                 GROUP BY b.id, b.mime_type
                 ORDER BY b.id",
            )?;
            let rows = statement
                .query_map(params![note.id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        if !referenced_blobs.is_empty() {
            fs::create_dir_all(&assets_directory)?;
        }
        for (blob_id, mime_type, original_name) in referenced_blobs {
            let preferred = original_name
                .map(|name| sanitize_file_name(&name))
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| default_asset_export_name(&blob_id, &mime_type));
            let exported_name = collision_safe_export_name(&preferred, &mut used_names);
            let (source, _) = assets::resolve_blob_path(&self.conn, &self.base_dir, &blob_id)?;
            fs::copy(source, assets_directory.join(&exported_name))?;
            let relative_asset_path = format!("{assets_directory_name}/{exported_name}");
            markdown = markdown.replace(&assets::asset_uri(&blob_id), &relative_asset_path);
            exported_blobs.insert(blob_id, exported_name);
        }
        for attachment in &note.attachments {
            let Some(blob_id) = attachment.blob_id.as_deref() else {
                continue;
            };
            let exported_name = if let Some(existing) = exported_blobs.get(blob_id) {
                existing
            } else {
                continue;
            };
            let relative_asset_path = format!("{assets_directory_name}/{exported_name}");
            markdown = markdown.replace(
                &format!("noteflow-file://{}", attachment.id),
                &relative_asset_path,
            );
        }
        fs::write(&path, markdown)?;
        Ok(export_result(
            path,
            relative_path,
            "Markdown-экспорт заметки создан",
        ))
    }

    fn export_note_zip(&self, note_id: &str) -> DataResult<ExportResultDto> {
        let note = self.get_note(note_id)?;
        let file_name = format!("{}-note.zip", sanitize_file_name(&note.title));
        let relative_path = format!("exports/{file_name}");
        let path = self.resolve_storage_path(&relative_path)?;
        let file = File::create(&path)?;
        let mut zip = ZipWriter::new(file);
        let options = zip_options();

        zip.start_file("note.md", options)?;
        std::io::copy(&mut Cursor::new(note.content_markdown.as_bytes()), &mut zip)?;
        zip.start_file("note.html", options)?;
        std::io::copy(&mut Cursor::new(note.content_html.as_bytes()), &mut zip)?;
        zip.start_file("note.json", options)?;
        let note_json = serde_json::to_vec_pretty(&note)?;
        std::io::copy(&mut Cursor::new(note_json), &mut zip)?;
        self.write_note_attachments_to_zip(&mut zip, &note.attachments, "attachments")?;
        zip.finish()?;

        Ok(export_result(
            path,
            relative_path,
            "ZIP-экспорт заметки создан",
        ))
    }

    fn export_project_zip(&self, project_id: &str) -> DataResult<ExportResultDto> {
        let project = self
            .list_projects(true)?
            .into_iter()
            .find(|project| project.id == project_id)
            .ok_or_else(|| DataError::NotFound("Проект не найден".to_string()))?;
        let rows = self.query_note_rows(
            "SELECT n.id, n.title, n.note_date, n.content_json, n.content_markdown, n.content_html,
                    n.plain_text, n.project_id, COALESCE(p.title, 'Входящие') AS project_title,
                    n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at,
                    n.content_version
             FROM notes n
             LEFT JOIN projects p ON p.id = n.project_id
             WHERE n.project_id = ?1 AND n.deleted_at IS NULL
             ORDER BY n.is_pinned DESC, n.pinned_at DESC, n.updated_at DESC",
            params![project_id],
        )?;
        let notes = rows
            .into_iter()
            .map(|row| self.note_dto_from_row(row))
            .collect::<DataResult<Vec<_>>>()?;

        let file_name = format!("{}-project.zip", sanitize_file_name(&project.title));
        let relative_path = format!("exports/{file_name}");
        let path = self.resolve_storage_path(&relative_path)?;
        let file = File::create(&path)?;
        let mut zip = ZipWriter::new(file);
        let options = zip_options();
        let project_json =
            serde_json::to_vec_pretty(&json!({ "project": project, "notes": notes }))?;

        zip.start_file("project.json", options)?;
        std::io::copy(&mut Cursor::new(project_json), &mut zip)?;
        for note in &notes {
            let note_file_name = sanitize_file_name(&note.title);
            zip.start_file(format!("notes/{note_file_name}.md"), options)?;
            std::io::copy(&mut Cursor::new(note.content_markdown.as_bytes()), &mut zip)?;
            self.write_note_attachments_to_zip(
                &mut zip,
                &note.attachments,
                &format!("attachments/{}", note.id),
            )?;
        }
        zip.finish()?;

        Ok(export_result(
            path,
            relative_path,
            "ZIP-экспорт проекта создан",
        ))
    }

    fn create_backup(&self) -> DataResult<ExportResultDto> {
        let stamp = Utc::now().format("%Y%m%d-%H%M%S");
        let mut relative_path = format!("backups/noteflow-backup-{stamp}.zip");
        if self.resolve_storage_path(&relative_path)?.exists() {
            relative_path = format!(
                "backups/noteflow-backup-{stamp}-{}.zip",
                &Uuid::new_v4().to_string()[..8]
            );
        }
        let path = self.resolve_storage_path(&relative_path)?;
        self.write_backup_archive(&path)?;

        Ok(export_result(
            path,
            relative_path,
            "Резервная копия базы создана",
        ))
    }

    fn create_backup_at_path(&self, path: &Path) -> DataResult<ExportResultDto> {
        validate_external_backup_path(path)?;
        self.write_backup_archive(path)?;
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("NoteFlow-backup.zip")
            .to_string();
        Ok(export_result(
            path.to_path_buf(),
            file_name,
            "Резервная копия создана",
        ))
    }

    fn write_backup_archive(&self, path: &Path) -> DataResult<()> {
        let backup_data = self.collect_backup_data()?;
        let temp_path = path.with_extension(format!("zip.{}.tmp", Uuid::new_v4()));
        let write_result = (|| -> DataResult<()> {
            let file = File::create_new(&temp_path)?;
            let mut zip = ZipWriter::new(file);
            let options = zip_options();
            let backup_json = serde_json::to_vec_pretty(&backup_data)?;

            zip.start_file(BACKUP_MANIFEST_NAME, options)?;
            std::io::copy(&mut Cursor::new(backup_json), &mut zip)?;
            for blob in &backup_data.asset_blobs {
                let storage_path = validate_managed_attachment_path(&blob.storage_rel_path)?;
                let source = self.resolve_storage_path(&storage_path)?;
                if !source.is_file() {
                    return Err(backup_invalid(
                        "Не удалось создать резервную копию: один из файлов вложений недоступен",
                    ));
                }
                zip.start_file(format!("files/{storage_path}"), options)?;
                let mut blob_file = File::open(source)?;
                std::io::copy(&mut blob_file, &mut zip)?;
            }
            let completed_file = zip.finish()?;
            completed_file.sync_all()?;

            let mut verification = ZipArchive::new(File::open(&temp_path)?)?;
            let mut manifest = Vec::new();
            verification
                .by_name(BACKUP_MANIFEST_NAME)?
                .read_to_end(&mut manifest)?;
            let verified: BackupData = serde_json::from_slice(&manifest)?;
            if verified.version != CURRENT_BACKUP_VERSION {
                return Err(backup_invalid(
                    "Не удалось проверить созданную резервную копию",
                ));
            }
            for index in 0..verification.len() {
                let mut entry = verification.by_index(index)?;
                std::io::copy(&mut entry, &mut std::io::sink())?;
            }
            Ok(())
        })();
        if let Err(error) = write_result {
            let _ = fs::remove_file(&temp_path);
            return Err(error);
        }
        if let Err(error) = fs::rename(&temp_path, path) {
            let _ = fs::remove_file(&temp_path);
            return Err(DataError::Io(error));
        }

        Ok(())
    }

    fn preview_backup(&self, request: &ImportBackupRequest) -> DataResult<BackupPreviewDto> {
        if request.file_name.trim().is_empty() {
            return Err(backup_invalid("Не выбрано имя файла резервной копии"));
        }
        let validated = validate_backup_archive(&request.bytes)?;
        Ok(BackupPreviewDto {
            format_version: validated.data.version,
            exported_at: validated.data.exported_at.clone(),
            app_version: validated.data.app_version.clone(),
            contents: backup_contents_summary(&validated.data),
            includes_ai_history: validated.data.version >= 5,
            preserves_existing_ai_history: validated.data.version < 5,
            missing_attachment_files: validated.missing_attachment_files,
        })
    }

    fn import_backup(&mut self, request: ImportBackupRequest) -> DataResult<ImportBackupResultDto> {
        if request.file_name.trim().is_empty() {
            return Err(backup_invalid("Не выбрано имя файла резервной копии"));
        }
        let validated = validate_backup_archive(&request.bytes)?;
        let source_summary = backup_contents_summary(&validated.data);
        let preserves_legacy_chats = validated.data.version < 5;
        let mut legacy_chats = if preserves_legacy_chats {
            self.collect_ai_chats_backup()?
        } else {
            Vec::new()
        };
        let mut legacy_messages = if preserves_legacy_chats {
            self.collect_ai_messages_backup()?
        } else {
            Vec::new()
        };
        let staged_files = stage_backup_files(&self.base_dir, &request.bytes, &validated)?;
        let backup_data = validated.data;
        let restored_note_ids = backup_data
            .notes
            .iter()
            .map(|note| note.id.clone())
            .collect::<HashSet<_>>();
        if preserves_legacy_chats {
            legacy_chats.retain(|chat| {
                chat.scope == "rag"
                    || (chat.scope == "note"
                        && chat
                            .note_id
                            .as_ref()
                            .is_some_and(|note_id| restored_note_ids.contains(note_id)))
            });
            let retained_chat_ids = legacy_chats
                .iter()
                .map(|chat| chat.id.clone())
                .collect::<HashSet<_>>();
            legacy_messages.retain(|message| retained_chat_ids.contains(&message.chat_id));
            for message in &mut legacy_messages {
                sanitize_historical_sources(&mut message.sources_json, &restored_note_ids);
            }
        }
        let restored_chats = if preserves_legacy_chats {
            &legacy_chats
        } else {
            &backup_data.ai_chats
        };
        let restored_messages = if preserves_legacy_chats {
            &legacy_messages
        } else {
            &backup_data.ai_messages
        };
        let preserved_legacy_chats = if preserves_legacy_chats {
            restored_chats.len()
        } else {
            0
        };
        let base_dir = self.base_dir.clone();
        let current_content_version: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(content_version), 0) FROM notes",
            [],
            |row| row.get(0),
        )?;
        let backup_content_version = backup_data
            .notes
            .iter()
            .map(|note| note.content_version)
            .max()
            .unwrap_or(0);
        let imported_content_version = current_content_version
            .max(backup_content_version)
            .checked_add(1)
            .ok_or_else(|| backup_invalid("Версия содержимого заметок недопустима"))?;
        let restore_now = now_iso();

        let transaction = self.conn.transaction()?;
        transaction.execute("DELETE FROM revision_attachment_refs", [])?;
        transaction.execute("DELETE FROM note_attachment_refs", [])?;
        transaction.execute("DELETE FROM revision_asset_refs", [])?;
        transaction.execute("DELETE FROM note_asset_refs", [])?;
        transaction.execute("DELETE FROM note_revision_sidecars", [])?;
        transaction.execute("DELETE FROM note_content_sidecars", [])?;
        transaction.execute("DELETE FROM note_tags", [])?;
        transaction.execute("DELETE FROM attachments", [])?;
        transaction.execute("DELETE FROM asset_blobs", [])?;
        transaction.execute("DELETE FROM note_revisions", [])?;
        transaction.execute("DELETE FROM ai_messages", [])?;
        transaction.execute("DELETE FROM ai_chats", [])?;
        transaction.execute("DELETE FROM embedding_profiles", [])?;
        transaction.execute("DELETE FROM llm_providers", [])?;
        transaction.execute("DELETE FROM notes", [])?;
        transaction.execute("DELETE FROM tags", [])?;
        transaction.execute("DELETE FROM projects", [])?;
        transaction.execute("DELETE FROM app_settings WHERE key NOT LIKE 'ui.%'", [])?;

        for project in &backup_data.projects {
            transaction.execute(
                "INSERT INTO projects (id, title, description, color, icon_key, status, created_at, updated_at, archived_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    project.id,
                    project.title,
                    project.description,
                    project.color.as_deref().unwrap_or("blue"),
                    project.icon_key.as_deref(),
                    project.status,
                    project.created_at,
                    project.updated_at,
                    project.archived_at
                ],
            )?;
        }
        for tag in &backup_data.tags {
            transaction.execute(
                "INSERT INTO tags (id, name, color, custom_color, icon_key, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    tag.id,
                    tag.name,
                    tag.color,
                    tag.custom_color,
                    tag.icon_key
                        .as_deref()
                        .unwrap_or_else(|| infer_tag_icon_key(&tag.name)),
                    tag.created_at,
                    tag.updated_at
                ],
            )?;
        }
        for note in &backup_data.notes {
            transaction.execute(
                "INSERT INTO notes (
                    id, title, note_date, content_json, content_markdown, content_html, plain_text,
                    project_id, is_favorite, is_pinned, pinned_at, icon, icon_key, created_at, updated_at,
                    archived_at, deleted_at, content_version, revision_checkpoint_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
                params![
                    note.id,
                    note.title,
                    note.note_date,
                    note.content_json.to_string(),
                    note.content_markdown,
                    note.content_html,
                    note.plain_text,
                    note.project_id,
                    note.is_favorite,
                    note.is_pinned,
                    note.pinned_at,
                    note.icon.as_deref().unwrap_or("doc"),
                    note.icon_key.as_deref(),
                    note.created_at,
                    note.updated_at,
                    note.archived_at,
                    note.deleted_at,
                    imported_content_version,
                    &restore_now
                ],
            )?;
        }
        for revision in &backup_data.note_revisions {
            let revision_kind =
                revisions::imported_revision_kind(revision.revision_kind.as_deref());
            let snapshot_hash =
                revisions::validated_snapshot_hash(revision.snapshot_hash.as_deref());
            transaction.execute(
                "INSERT INTO note_revisions (
                    id, note_id, content_json, content_markdown, content_html, plain_text, created_at,
                    snapshot_hash, revision_kind
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    revision.id,
                    revision.note_id,
                    revision.content_json.to_string(),
                    revision.content_markdown,
                    revision.content_html,
                    revision.plain_text,
                    revision.created_at,
                    snapshot_hash,
                    revision_kind.as_str()
                ],
            )?;
        }
        for sidecar in &backup_data.note_content_sidecars {
            transaction.execute(
                "INSERT OR REPLACE INTO note_content_sidecars (
                    note_id, kind, schema_version, payload_json, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    sidecar.note_id,
                    sidecar.kind,
                    sidecar.schema_version.max(1),
                    sidecar.payload_json.to_string(),
                    sidecar.created_at,
                    sidecar.updated_at
                ],
            )?;
        }
        for sidecar in &backup_data.note_revision_sidecars {
            transaction.execute(
                "INSERT OR REPLACE INTO note_revision_sidecars (
                    revision_id, kind, schema_version, payload_json, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    sidecar.revision_id,
                    sidecar.kind,
                    sidecar.schema_version.max(1),
                    sidecar.payload_json.to_string(),
                    sidecar.created_at
                ],
            )?;
        }
        for note_tag in &backup_data.note_tags {
            transaction.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![note_tag.note_id, note_tag.tag_id],
            )?;
        }
        for blob in &backup_data.asset_blobs {
            transaction.execute(
                "INSERT INTO asset_blobs (
                    id, sha256, storage_rel_path, mime_type, size_bytes, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    blob.id,
                    blob.sha256,
                    blob.storage_rel_path,
                    blob.mime_type,
                    blob.size_bytes,
                    blob.created_at
                ],
            )?;
        }
        for attachment in &backup_data.attachments {
            transaction.execute(
                "INSERT INTO attachments (
                    id, note_id, kind, original_name, storage_rel_path, mime_type, size_bytes,
                    original_attachment_id, edit_metadata_json, created_at, blob_id
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    attachment.id,
                    attachment.note_id,
                    attachment.kind,
                    attachment.original_name,
                    attachment.storage_rel_path,
                    attachment.mime_type,
                    attachment.size_bytes,
                    attachment.original_attachment_id,
                    attachment
                        .edit_metadata
                        .clone()
                        .unwrap_or_else(|| json!({}))
                        .to_string(),
                    attachment.created_at,
                    attachment.blob_id
                ],
            )?;
        }
        for reference in &backup_data.note_asset_refs {
            transaction.execute(
                "INSERT INTO note_asset_refs (note_id, blob_id) VALUES (?1, ?2)",
                params![reference.note_id, reference.blob_id],
            )?;
        }
        for reference in &backup_data.revision_asset_refs {
            transaction.execute(
                "INSERT INTO revision_asset_refs (revision_id, blob_id) VALUES (?1, ?2)",
                params![reference.revision_id, reference.blob_id],
            )?;
        }
        for reference in &backup_data.note_attachment_refs {
            transaction.execute(
                "INSERT INTO note_attachment_refs (note_id, attachment_id) VALUES (?1, ?2)",
                params![reference.note_id, reference.attachment_id],
            )?;
        }
        for reference in &backup_data.revision_attachment_refs {
            transaction.execute(
                "INSERT INTO revision_attachment_refs (revision_id, attachment_id) VALUES (?1, ?2)",
                params![reference.revision_id, reference.attachment_id],
            )?;
        }
        for setting in &backup_data.app_settings {
            if setting.key.contains("api")
                || setting.key.contains("secret")
                || setting.key.contains("key")
            {
                continue;
            }
            set_setting_tx(&transaction, &setting.key, setting.value_json.clone())?;
        }
        llm::import_provider_backups(&transaction, &backup_data.llm_providers)?;
        embedding::import_profile_backups(&transaction, &backup_data.embedding_profiles)?;
        for chat in restored_chats {
            transaction.execute(
                "INSERT INTO ai_chats (id, scope, note_id, title, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    chat.id,
                    chat.scope,
                    chat.note_id,
                    chat.title,
                    chat.created_at,
                    chat.updated_at
                ],
            )?;
        }
        for message in restored_messages {
            transaction.execute(
                "INSERT INTO ai_messages (id, chat_id, role, content, sources_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    message.id,
                    message.chat_id,
                    message.role,
                    message.content,
                    message.sources_json.to_string(),
                    message.created_at
                ],
            )?;
        }
        let restore_id = Uuid::new_v4().to_string();
        set_setting_tx(
            &transaction,
            RESTORE_COMMIT_SETTING_KEY,
            json!(restore_id.clone()),
        )?;
        set_setting_tx(
            &transaction,
            revisions::REVISION_MAINTENANCE_SETTING_KEY,
            json!({ "importedAt": restore_now, "pruningDeferred": true }),
        )?;
        search::rebuild_search_index_transaction(&transaction)?;

        let file_swap = RestoreFileSwap::apply(&base_dir, staged_files.into_path(), restore_id)?;
        if let Err(error) = transaction.commit() {
            drop(file_swap);
            return Err(DataError::Sql(error));
        }
        file_swap.commit(&self.conn);

        assets::run_startup_maintenance(&mut self.conn, &self.base_dir, &now_iso())
            .map_err(|_| DataError::RestoreApplied)?;
        let _ = assets::collect_garbage(&mut self.conn, &self.base_dir);

        let knowledge_ready = knowledge::reconcile(&mut self.conn).is_ok();
        let embeddings_ready = embedding::reconcile_all_index_states(&mut self.conn).is_ok();
        let indexes_updating = !knowledge_ready || !embeddings_ready;
        let workspace = self
            .load_workspace()
            .map_err(|_| DataError::RestoreApplied)?;
        let contents = BackupContentsSummaryDto {
            note_ai_chats: restored_chats
                .iter()
                .filter(|chat| chat.scope == "note")
                .count(),
            rag_chats: restored_chats
                .iter()
                .filter(|chat| chat.scope == "rag")
                .count(),
            messages: restored_messages.len(),
            ..source_summary
        };
        Ok(ImportBackupResultDto {
            workspace,
            contents,
            preserved_legacy_chats,
            indexes_updating,
        })
    }

    fn write_note_attachments_to_zip(
        &self,
        zip: &mut ZipWriter<File>,
        attachments: &[AttachmentDto],
        directory: &str,
    ) -> DataResult<()> {
        let options = zip_options();
        let mut used_names = HashSet::new();
        for attachment in attachments {
            let Some(blob_id) = attachment.blob_id.as_deref() else {
                continue;
            };
            let (source, _) = assets::resolve_blob_path(&self.conn, &self.base_dir, blob_id)?;
            let exported_name = collision_safe_export_name(
                &sanitize_file_name(&attachment.original_name),
                &mut used_names,
            );
            zip.start_file(format!("{directory}/{exported_name}"), options)?;
            let mut file = File::open(source)?;
            std::io::copy(&mut file, zip)?;
        }
        Ok(())
    }

    fn collect_backup_data(&self) -> DataResult<BackupData> {
        Ok(BackupData {
            version: CURRENT_BACKUP_VERSION,
            exported_at: now_iso(),
            app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
            projects: self.collect_projects_backup()?,
            tags: self.collect_tags_backup()?,
            notes: self.collect_notes_backup()?,
            note_revisions: self.collect_note_revisions_backup()?,
            note_content_sidecars: self.collect_note_content_sidecars_backup()?,
            note_revision_sidecars: self.collect_note_revision_sidecars_backup()?,
            note_tags: self.collect_note_tags_backup()?,
            attachments: self.collect_attachments_backup()?,
            asset_blobs: self.collect_asset_blobs_backup()?,
            note_asset_refs: self.collect_note_asset_refs_backup()?,
            revision_asset_refs: self.collect_revision_asset_refs_backup()?,
            note_attachment_refs: self.collect_note_attachment_refs_backup()?,
            revision_attachment_refs: self.collect_revision_attachment_refs_backup()?,
            llm_providers: llm::collect_provider_backups(&self.conn)?,
            embedding_profiles: embedding::collect_profile_backups(&self.conn)?,
            ai_chats: self.collect_ai_chats_backup()?,
            ai_messages: self.collect_ai_messages_backup()?,
            app_settings: self.collect_settings_backup()?,
        })
    }

    fn collect_ai_chats_backup(&self) -> DataResult<Vec<AiChatBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT id, scope, note_id, title, created_at, updated_at
             FROM ai_chats
             ORDER BY created_at, id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(AiChatBackup {
                id: row.get(0)?,
                scope: row.get(1)?,
                note_id: row.get(2)?,
                title: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_ai_messages_backup(&self) -> DataResult<Vec<AiMessageBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT id, chat_id, role, content, sources_json, created_at
             FROM ai_messages
             ORDER BY created_at, rowid",
        )?;
        let rows = statement.query_map([], |row| {
            let sources_json: String = row.get(4)?;
            Ok(AiMessageBackup {
                id: row.get(0)?,
                chat_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                sources_json: serde_json::from_str(&sources_json).unwrap_or_else(|_| json!([])),
                created_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_projects_backup(&self) -> DataResult<Vec<ProjectBackup>> {
        let mut statement = self
            .conn
            .prepare("SELECT id, title, description, color, icon_key, status, created_at, updated_at, archived_at FROM projects ORDER BY title")?;
        let rows = statement.query_map([], |row| {
            Ok(ProjectBackup {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                icon_key: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                archived_at: row.get(8)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_tags_backup(&self) -> DataResult<Vec<TagBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT id, name, color, custom_color, icon_key, created_at, updated_at FROM tags ORDER BY name",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(TagBackup {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                custom_color: row.get(3)?,
                icon_key: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_notes_backup(&self) -> DataResult<Vec<NoteBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT id, title, note_date, content_json, content_markdown, content_html, plain_text,
                    project_id, is_favorite, is_pinned, pinned_at, icon, icon_key, created_at, updated_at,
                    archived_at, deleted_at, content_version
             FROM notes
             ORDER BY is_pinned DESC, pinned_at DESC, updated_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            let content_json: String = row.get(3)?;
            Ok(NoteBackup {
                id: row.get(0)?,
                title: row.get(1)?,
                note_date: row.get(2)?,
                content_json: serde_json::from_str(&content_json)
                    .unwrap_or_else(|_| empty_document()),
                content_markdown: row.get(4)?,
                content_html: row.get(5)?,
                plain_text: row.get(6)?,
                content_version: row.get(17)?,
                project_id: row.get(7)?,
                is_favorite: row.get::<_, i64>(8)? != 0,
                is_pinned: row.get::<_, i64>(9)? != 0,
                pinned_at: row.get(10)?,
                icon: row.get(11)?,
                icon_key: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                archived_at: row.get(15)?,
                deleted_at: row.get(16)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_note_revisions_backup(&self) -> DataResult<Vec<NoteRevisionBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT id, note_id, content_json, content_markdown, content_html, plain_text, created_at,
                    snapshot_hash, revision_kind
             FROM note_revisions
             ORDER BY created_at",
        )?;
        let rows = statement.query_map([], |row| {
            let content_json: String = row.get(2)?;
            Ok(NoteRevisionBackup {
                id: row.get(0)?,
                note_id: row.get(1)?,
                content_json: serde_json::from_str(&content_json)
                    .unwrap_or_else(|_| empty_document()),
                content_markdown: row.get(3)?,
                content_html: row.get(4)?,
                plain_text: row.get(5)?,
                created_at: row.get(6)?,
                snapshot_hash: row.get(7)?,
                revision_kind: row.get(8)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_note_content_sidecars_backup(&self) -> DataResult<Vec<NoteContentSidecarBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT note_id, kind, schema_version, payload_json, created_at, updated_at
             FROM note_content_sidecars
             ORDER BY note_id, kind",
        )?;
        let rows = statement.query_map([], |row| {
            let payload_json: String = row.get(3)?;
            Ok(NoteContentSidecarBackup {
                note_id: row.get(0)?,
                kind: row.get(1)?,
                schema_version: row.get(2)?,
                payload_json: serde_json::from_str(&payload_json).unwrap_or(Value::Null),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_note_revision_sidecars_backup(&self) -> DataResult<Vec<NoteRevisionSidecarBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT revision_id, kind, schema_version, payload_json, created_at
             FROM note_revision_sidecars
             ORDER BY revision_id, kind",
        )?;
        let rows = statement.query_map([], |row| {
            let payload_json: String = row.get(3)?;
            Ok(NoteRevisionSidecarBackup {
                revision_id: row.get(0)?,
                kind: row.get(1)?,
                schema_version: row.get(2)?,
                payload_json: serde_json::from_str(&payload_json).unwrap_or(Value::Null),
                created_at: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_note_tags_backup(&self) -> DataResult<Vec<NoteTagBackup>> {
        let mut statement = self
            .conn
            .prepare("SELECT note_id, tag_id FROM note_tags ORDER BY note_id, tag_id")?;
        let rows = statement.query_map([], |row| {
            Ok(NoteTagBackup {
                note_id: row.get(0)?,
                tag_id: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_attachments_backup(&self) -> DataResult<Vec<AttachmentBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT id, note_id, kind, original_name, storage_rel_path, blob_id, mime_type, size_bytes,
                    original_attachment_id, edit_metadata_json, created_at
             FROM attachments
             ORDER BY created_at",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(AttachmentBackup {
                id: row.get(0)?,
                note_id: row.get(1)?,
                kind: row.get(2)?,
                original_name: row.get(3)?,
                storage_rel_path: row.get(4)?,
                blob_id: row.get(5)?,
                mime_type: row.get(6)?,
                size_bytes: row.get(7)?,
                original_attachment_id: row.get(8)?,
                edit_metadata: serde_json::from_str::<Value>(&row.get::<_, String>(9)?).ok(),
                created_at: row.get(10)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_asset_blobs_backup(&self) -> DataResult<Vec<AssetBlobBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT id, sha256, storage_rel_path, mime_type, size_bytes, created_at
             FROM asset_blobs ORDER BY id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(AssetBlobBackup {
                id: row.get(0)?,
                sha256: row.get(1)?,
                storage_rel_path: row.get(2)?,
                mime_type: row.get(3)?,
                size_bytes: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_note_asset_refs_backup(&self) -> DataResult<Vec<NoteAssetRefBackup>> {
        let mut statement = self
            .conn
            .prepare("SELECT note_id, blob_id FROM note_asset_refs ORDER BY note_id, blob_id")?;
        let rows = statement.query_map([], |row| {
            Ok(NoteAssetRefBackup {
                note_id: row.get(0)?,
                blob_id: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_revision_asset_refs_backup(&self) -> DataResult<Vec<RevisionAssetRefBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT revision_id, blob_id FROM revision_asset_refs ORDER BY revision_id, blob_id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(RevisionAssetRefBackup {
                revision_id: row.get(0)?,
                blob_id: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_note_attachment_refs_backup(&self) -> DataResult<Vec<NoteAttachmentRefBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT note_id, attachment_id FROM note_attachment_refs ORDER BY note_id, attachment_id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(NoteAttachmentRefBackup {
                note_id: row.get(0)?,
                attachment_id: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_revision_attachment_refs_backup(
        &self,
    ) -> DataResult<Vec<RevisionAttachmentRefBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT revision_id, attachment_id FROM revision_attachment_refs
             ORDER BY revision_id, attachment_id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(RevisionAttachmentRefBackup {
                revision_id: row.get(0)?,
                attachment_id: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_settings_backup(&self) -> DataResult<Vec<SettingBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT key, value_json, updated_at
             FROM app_settings
             WHERE lower(key) NOT LIKE '%api%' AND lower(key) NOT LIKE '%secret%' AND lower(key) NOT LIKE '%key%'
               AND lower(key) NOT LIKE 'internal.%'
             ORDER BY key",
        )?;
        let rows = statement.query_map([], |row| {
            let value_json: String = row.get(1)?;
            Ok(SettingBackup {
                key: row.get(0)?,
                value_json: serde_json::from_str(&value_json).unwrap_or(Value::Null),
                updated_at: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    #[cfg(test)]
    fn rebuild_search_index(&mut self) -> DataResult<()> {
        search::rebuild_search_index(&mut self.conn)?;
        Ok(())
    }

    fn search_notes(
        &self,
        request: search::SearchNotesRequest,
    ) -> DataResult<Vec<search::SearchNoteResultDto>> {
        search::search_notes(&self.conn, &request)
    }

    fn rebuild_knowledge_search_index(
        &mut self,
    ) -> DataResult<search::RebuildSearchIndexResultDto> {
        search::rebuild_search_index(&mut self.conn)
    }

    fn get_knowledge_documents(
        &self,
        request: search::KnowledgeDocumentsRequest,
    ) -> DataResult<Vec<search::KnowledgeDocumentDto>> {
        search::get_knowledge_documents(&self.conn, &request)
    }

    fn get_knowledge_document_by_note_id(
        &self,
        note_id: &str,
    ) -> DataResult<search::KnowledgeDocumentDto> {
        search::get_knowledge_document_by_note_id(&self.conn, note_id)
    }

    fn database_path(&self) -> PathBuf {
        self.base_dir.join(DATABASE_FILE)
    }

    fn resolve_storage_path(&self, relative_path: &str) -> DataResult<PathBuf> {
        ensure_safe_relative_path(relative_path)?;
        Ok(self.base_dir.join(relative_path))
    }
}

fn validate_note_content_request(request: &UpdateNoteContentRequest) -> DataResult<()> {
    if request.expected_content_version < 0
        || request.content_json.get("type").and_then(Value::as_str) != Some("doc")
    {
        return Err(DataError::Serialization);
    }

    let mut kinds = HashSet::new();
    for sidecar in &request.content_sidecars {
        let kind = sidecar.kind.trim();
        if kind.is_empty() || sidecar.schema_version < 1 || !kinds.insert(kind) {
            return Err(DataError::Serialization);
        }
        validate_canonical_asset_fields(&sidecar.payload_json)?;
    }
    validate_canonical_asset_fields(&request.content_json)?;
    for value in [&request.content_markdown, &request.content_html] {
        if value.contains("data:image/")
            || value.contains("http://noteflow-asset.localhost")
            || value.contains("https://noteflow-asset.localhost")
            || contains_noncanonical_resource_path(value)
        {
            return Err(DataError::Serialization);
        }
    }
    Ok(())
}

fn validate_canonical_asset_fields(value: &Value) -> DataResult<()> {
    match value {
        Value::Array(items) => {
            for item in items {
                validate_canonical_asset_fields(item)?;
            }
        }
        Value::Object(object) => {
            for (key, item) in object {
                if matches!(key.as_str(), "src" | "originalSrc") {
                    if let Some(source) = item.as_str() {
                        let normalized_source = source.to_ascii_lowercase();
                        let looks_like_windows_path = source.len() > 2
                            && source.as_bytes().get(1) == Some(&b':')
                            && matches!(source.as_bytes().get(2), Some(b'\\' | b'/'));
                        if normalized_source.starts_with("data:image/")
                            || normalized_source.starts_with("blob:")
                            || normalized_source.starts_with("file:")
                            || normalized_source.starts_with("http://noteflow-asset.localhost")
                            || normalized_source.starts_with("https://noteflow-asset.localhost")
                            || Path::new(source).is_absolute()
                            || looks_like_windows_path
                        {
                            return Err(DataError::Serialization);
                        }
                    }
                }
                validate_canonical_asset_fields(item)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn contains_noncanonical_resource_path(value: &str) -> bool {
    static PATTERN: OnceLock<Option<Regex>> = OnceLock::new();
    let pattern = PATTERN.get_or_init(|| {
        Regex::new(r#"(?i)(?:\]\(\s*|src\s*=\s*[\"']?\s*)(?:file:|blob:|[a-z]:[\\/]|\\\\)"#).ok()
    });
    pattern
        .as_ref()
        .is_some_and(|pattern| pattern.is_match(value))
}

fn persisted_reference_values(
    content_json: &Value,
    content_markdown: &str,
    content_html: &str,
    sidecars: &[NoteContentSidecarInput],
) -> Vec<String> {
    let mut values = vec![
        content_json.to_string(),
        content_markdown.to_string(),
        content_html.to_string(),
    ];
    values.extend(
        sidecars
            .iter()
            .map(|sidecar| sidecar.payload_json.to_string()),
    );
    values
}

fn rewrite_attachment_ids_in_text(value: &str, replacements: &HashMap<String, String>) -> String {
    replacements
        .iter()
        .fold(value.to_string(), |text, (source, target)| {
            text.replace(
                &format!("noteflow-file://{source}"),
                &format!("noteflow-file://{target}"),
            )
            .replace(
                &format!("data-attachment-id=\"{source}\""),
                &format!("data-attachment-id=\"{target}\""),
            )
            .replace(
                &format!("data-original-attachment-id=\"{source}\""),
                &format!("data-original-attachment-id=\"{target}\""),
            )
            .replace(
                &format!("data-storage-id=\"{source}\""),
                &format!("data-storage-id=\"{target}\""),
            )
        })
}

fn rewrite_attachment_ids_in_json(value: &mut Value, replacements: &HashMap<String, String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                rewrite_attachment_ids_in_json(item, replacements);
            }
        }
        Value::Object(object) => {
            for item in object.values_mut() {
                rewrite_attachment_ids_in_json(item, replacements);
            }
        }
        Value::String(text) => {
            if let Some(replacement) = replacements.get(text) {
                *text = replacement.clone();
            } else {
                *text = rewrite_attachment_ids_in_text(text, replacements);
            }
        }
        _ => {}
    }
}

fn ensure_project_on(
    connection: &Connection,
    title: &str,
    description: &str,
) -> DataResult<String> {
    if let Some(project_id) = connection
        .query_row(
            "SELECT id FROM projects WHERE lower(title) = lower(?1) LIMIT 1",
            params![title],
            |row| row.get(0),
        )
        .optional()?
    {
        return Ok(project_id);
    }

    let project_id = Uuid::new_v4().to_string();
    let now = now_iso();
    connection.execute(
        "INSERT INTO projects (id, title, description, color, icon_key, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'blue', 'project', 'active', ?4, ?4)",
        params![project_id, title, description, now],
    )?;
    Ok(project_id)
}

fn ensure_tag_on(connection: &Connection, name: &str, color: &str) -> DataResult<String> {
    if let Some(tag_id) = connection
        .query_row(
            "SELECT id FROM tags WHERE lower(name) = lower(?1) LIMIT 1",
            params![name],
            |row| row.get(0),
        )
        .optional()?
    {
        return Ok(tag_id);
    }

    let tag_id = Uuid::new_v4().to_string();
    let now = now_iso();
    let icon_key = infer_tag_icon_key(name);
    connection.execute(
        "INSERT INTO tags (id, name, color, icon_key, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![tag_id, name, normalize_tag_color(color), icon_key, now],
    )?;
    Ok(tag_id)
}

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            name: "initial_schema",
            sql: "
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    archived_at TEXT
                );

                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    color TEXT NOT NULL DEFAULT 'blue',
                    custom_color TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    note_date TEXT NOT NULL,
                    content_json TEXT NOT NULL,
                    content_markdown TEXT NOT NULL DEFAULT '',
                    content_html TEXT NOT NULL DEFAULT '',
                    plain_text TEXT NOT NULL DEFAULT '',
                    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    icon TEXT NOT NULL DEFAULT 'doc',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    archived_at TEXT,
                    deleted_at TEXT
                );

                CREATE TABLE IF NOT EXISTS note_tags (
                    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                    PRIMARY KEY (note_id, tag_id)
                );

                CREATE TABLE IF NOT EXISTS attachments (
                    id TEXT PRIMARY KEY,
                    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    storage_rel_path TEXT NOT NULL,
                    mime_type TEXT NOT NULL DEFAULT '',
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS note_revisions (
                    id TEXT PRIMARY KEY,
                    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                    content_json TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    content_html TEXT NOT NULL,
                    plain_text TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ai_chats (
                    id TEXT PRIMARY KEY,
                    scope TEXT NOT NULL,
                    note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ai_messages (
                    id TEXT PRIMARY KEY,
                    chat_id TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sources_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL
                );

                CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                    note_id UNINDEXED,
                    title,
                    plain_text,
                    tag_names,
                    project_title,
                    tokenize = 'unicode61'
                );

                CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);
                CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
                CREATE INDEX IF NOT EXISTS idx_notes_archived_at ON notes(archived_at);
                CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);
                CREATE INDEX IF NOT EXISTS idx_attachments_note_id ON attachments(note_id);
                CREATE INDEX IF NOT EXISTS idx_ai_messages_chat_id ON ai_messages(chat_id);
            ",
        },
        Migration {
            version: 2,
            name: "storage_metadata",
            sql: "
                CREATE INDEX IF NOT EXISTS idx_projects_archived_at ON projects(archived_at);
                CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
            ",
        },
        Migration {
            version: 3,
            name: "icon_keys",
            sql: "
                ALTER TABLE projects ADD COLUMN icon_key TEXT;
                ALTER TABLE projects ADD COLUMN color TEXT NOT NULL DEFAULT 'blue';
                ALTER TABLE tags ADD COLUMN icon_key TEXT;
                ALTER TABLE notes ADD COLUMN icon_key TEXT;

                UPDATE projects
                SET icon_key = 'project'
                WHERE icon_key IS NULL;

                UPDATE projects
                SET color = CASE id
                    WHEN 'project-noteflow' THEN 'blue'
                    WHEN 'project-market' THEN 'purple'
                    WHEN 'project-personal' THEN 'green'
                    ELSE color
                END;

                UPDATE tags
                SET icon_key = CASE
                    WHEN lower(id) LIKE '%docs%' OR lower(name) LIKE '%док%' THEN 'document'
                    WHEN lower(id) LIKE '%planning%' OR lower(name) LIKE '%план%' THEN 'task'
                    WHEN lower(id) LIKE '%ideas%' OR lower(name) LIKE '%иде%' THEN 'idea'
                    WHEN lower(id) LIKE '%research%' OR lower(id) LIKE '%personal%' OR lower(name) LIKE '%исслед%' OR lower(name) LIKE '%лич%' THEN 'person'
                    WHEN lower(id) LIKE '%project%' OR lower(id) LIKE '%architecture%' OR lower(name) LIKE '%проект%' OR lower(name) LIKE '%архитект%' THEN 'project'
                    WHEN lower(id) LIKE '%code%' OR lower(name) LIKE '%код%' OR lower(name) LIKE '%api%' THEN 'code'
                    ELSE 'tag'
                END
                WHERE icon_key IS NULL;
            ",
        },
        Migration {
            version: 4,
            name: "pinned_notes",
            sql: "
                ALTER TABLE notes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE notes ADD COLUMN pinned_at TEXT;

                UPDATE notes
                SET is_pinned = CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END,
                    pinned_at = CASE WHEN is_favorite = 1 THEN updated_at ELSE NULL END
                WHERE is_pinned = 0;

                CREATE INDEX IF NOT EXISTS idx_notes_pinned_at ON notes(is_pinned, pinned_at);
            ",
        },
        Migration {
            version: 5,
            name: "image_edit_metadata",
            sql: "
                ALTER TABLE attachments ADD COLUMN original_attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL;
                ALTER TABLE attachments ADD COLUMN edit_metadata_json TEXT NOT NULL DEFAULT '{}';

                CREATE INDEX IF NOT EXISTS idx_attachments_original_attachment_id
                    ON attachments(original_attachment_id);
            ",
        },
        Migration {
            version: 6,
            name: "llm_providers",
            sql: llm::LLM_PROVIDER_SCHEMA_SQL,
        },
        Migration {
            version: 7,
            name: "markdown_first_sidecars",
            sql: "
                CREATE TABLE IF NOT EXISTS note_content_sidecars (
                    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL,
                    schema_version INTEGER NOT NULL DEFAULT 1,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (note_id, kind)
                );

                CREATE TABLE IF NOT EXISTS note_revision_sidecars (
                    revision_id TEXT NOT NULL REFERENCES note_revisions(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL,
                    schema_version INTEGER NOT NULL DEFAULT 1,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (revision_id, kind)
                );

                INSERT OR IGNORE INTO note_content_sidecars (
                    note_id, kind, schema_version, payload_json, created_at, updated_at
                )
                SELECT
                    id,
                    'legacy_tiptap_json',
                    1,
                    content_json,
                    created_at,
                    updated_at
                FROM notes
                WHERE trim(content_json) <> '';

                INSERT OR IGNORE INTO note_revision_sidecars (
                    revision_id, kind, schema_version, payload_json, created_at
                )
                SELECT
                    id,
                    'legacy_tiptap_json',
                    1,
                    content_json,
                    created_at
                FROM note_revisions
                WHERE trim(content_json) <> '';

                UPDATE notes
                SET content_markdown = plain_text
                WHERE trim(content_markdown) = ''
                  AND trim(plain_text) <> '';
            ",
        },
        Migration {
            version: 8,
            name: "search_foundation_fts5",
            sql: search::SEARCH_MIGRATION_SQL,
        },
        Migration {
            version: 9,
            name: "knowledge_chunks",
            sql: knowledge::KNOWLEDGE_MIGRATION_SQL,
        },
        Migration {
            version: 10,
            name: "knowledge_index_metadata",
            sql: knowledge::KNOWLEDGE_METADATA_MIGRATION_SQL,
        },
        Migration {
            version: 11,
            name: "semantic_retrieval",
            sql: embedding::EMBEDDING_MIGRATION_SQL,
        },
        Migration {
            version: 12,
            name: "note_content_versions",
            sql: "
                ALTER TABLE notes ADD COLUMN content_version INTEGER NOT NULL DEFAULT 0;
            ",
        },
        Migration {
            version: 13,
            name: "revision_retention",
            sql: revisions::REVISION_MIGRATION_SQL,
        },
        Migration {
            version: 14,
            name: "canonical_asset_storage",
            sql: assets::ASSET_MIGRATION_SQL,
        },
    ]
}

#[cfg(test)]
fn seed_projects(transaction: &Transaction<'_>) -> DataResult<()> {
    let now = now_iso();
    let projects = [
        (
            "project-noteflow",
            "NoteFlow",
            "Приложение для заметок и базы знаний",
            "blue",
            "project",
            "active",
            None,
        ),
        (
            "project-market",
            "Исследование рынка",
            "Конкуренты, пользователи и идеи развития",
            "purple",
            "project",
            "active",
            None,
        ),
        (
            "project-personal",
            "Личные заметки",
            "Идеи, обучение и личные планы",
            "green",
            "project",
            "active",
            None,
        ),
        (
            "project-old-redesign",
            "Старый проект редизайна",
            "Архивное направление",
            "blue",
            "project",
            "archived",
            Some(now.clone()),
        ),
    ];

    for (id, title, description, color, icon_key, status, archived_at) in projects {
        transaction.execute(
            "INSERT OR IGNORE INTO projects (id, title, description, color, icon_key, status, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8)",
            params![id, title, description, color, icon_key, status, now, archived_at],
        )?;
    }
    Ok(())
}

#[cfg(test)]
fn seed_tags(transaction: &Transaction<'_>) -> DataResult<()> {
    let now = now_iso();
    let tags = [
        ("tag-project", "проект", "blue", "project"),
        ("tag-architecture", "архитектура", "purple", "project"),
        ("tag-docs", "документация", "green", "document"),
        ("tag-ideas", "идеи", "amber", "idea"),
        ("tag-personal", "личное", "pink", "person"),
        ("tag-planning", "планирование", "green", "task"),
        ("tag-research", "исследования", "purple", "person"),
    ];

    for (id, name, color, icon_key) in tags {
        transaction.execute(
            "INSERT OR IGNORE INTO tags (id, name, color, icon_key, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![id, name, color, icon_key, now],
        )?;
    }
    Ok(())
}

#[cfg(test)]
fn seed_notes(transaction: &Transaction<'_>) -> DataResult<()> {
    let now = now_iso();
    let notes = [
        SeedNote {
            id: "note-architecture",
            title: "Архитектура проекта",
            note_date: "2026-06-14",
            project_id: "project-noteflow",
            is_favorite: true,
            tags: &["tag-project", "tag-architecture", "tag-docs"],
            archived: false,
            markdown: "# Архитектура проекта\n\nОбзор структуры приложения NoteFlow, ключевых модулей и принципов взаимодействия между ними.\n\n- Скорость и плавность интерфейса\n- Локальное хранение и приватность\n- Поиск, проекты, теги и будущий RAG",
        },
        SeedNote {
            id: "note-sprint",
            title: "Планирование спринта",
            note_date: "2026-06-13",
            project_id: "project-noteflow",
            is_favorite: false,
            tags: &["tag-planning"],
            archived: false,
            markdown: "Цели спринта, задачи, оценки и приоритеты команды.\n\n1. Уточнить критерии готовности\n2. Проверить риски\n3. Подготовить демо",
        },
        SeedNote {
            id: "note-research",
            title: "Исследование пользователей",
            note_date: "2026-05-22",
            project_id: "project-market",
            is_favorite: false,
            tags: &["tag-research"],
            archived: false,
            markdown: "Интервью, боли, инсайты и ключевые выводы.\n\n| Сегмент | Боль |\n| --- | --- |\n| Исследователи | Сложно быстро находить старые выводы |\n| Команды | Заметки разбросаны по инструментам |",
        },
        SeedNote {
            id: "note-ideas",
            title: "Идеи для улучшения",
            note_date: "2026-05-20",
            project_id: "project-market",
            is_favorite: false,
            tags: &["tag-ideas"],
            archived: false,
            markdown: "Список идей по улучшению продукта на основе обратной связи.\n\n> Хорошая заметка легко записывается и легко находится.",
        },
        SeedNote {
            id: "note-api",
            title: "Документация API",
            note_date: "2026-05-18",
            project_id: "project-noteflow",
            is_favorite: false,
            tags: &["tag-docs"],
            archived: false,
            markdown: "Эндпоинты, параметры, примеры запросов и ответов.\n\n```http\nGET /notes?query=markdown\n```",
        },
        SeedNote {
            id: "note-garden",
            title: "Заметки по саду",
            note_date: "2026-05-12",
            project_id: "project-personal",
            is_favorite: false,
            tags: &["tag-personal"],
            archived: false,
            markdown: "Ирисы бородатые: пересадка, деление корневищ, сроки.\n\n> Делить лучше после цветения, когда корневища видны.",
        },
        SeedNote {
            id: "note-launch-v2",
            title: "План запуска версии 2.0",
            note_date: "2026-05-25",
            project_id: "project-noteflow",
            is_favorite: false,
            tags: &["tag-planning"],
            archived: true,
            markdown: "Архивный план запуска версии 2.0.",
        },
        SeedNote {
            id: "note-market-q1",
            title: "Исследование рынка Q1",
            note_date: "2026-05-18",
            project_id: "project-market",
            is_favorite: false,
            tags: &["tag-research"],
            archived: true,
            markdown: "Архивная сводка исследования рынка за Q1.",
        },
    ];

    for note in notes {
        let plain_text = markdown_to_plain_text(note.markdown);
        let content_json = document_from_text(&plain_text);
        let content_html = plain_text_to_html(&plain_text);
        let archived_at = if note.archived {
            Some(now.clone())
        } else {
            None
        };
        let pinned_at = if note.is_favorite {
            Some(now.clone())
        } else {
            None
        };
        transaction.execute(
            "INSERT OR IGNORE INTO notes (
                id, title, note_date, content_json, content_markdown, content_html, plain_text,
                project_id, is_favorite, is_pinned, pinned_at, icon, created_at, updated_at, archived_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'doc', ?12, ?12, ?13)",
            params![
                note.id,
                note.title,
                note.note_date,
                content_json.to_string(),
                note.markdown,
                content_html,
                plain_text,
                note.project_id,
                note.is_favorite,
                note.is_favorite,
                pinned_at,
                now,
                archived_at
            ],
        )?;
        transaction.execute(
            "INSERT OR IGNORE INTO note_content_sidecars (
                note_id, kind, schema_version, payload_json, created_at, updated_at
             ) VALUES (?1, ?2, 1, ?3, ?4, ?4)",
            params![
                note.id,
                LEGACY_TIPTAP_SIDECAR_KIND,
                content_json.to_string(),
                now
            ],
        )?;

        for tag_id in note.tags {
            transaction.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![note.id, tag_id],
            )?;
        }
    }
    Ok(())
}

#[cfg(test)]
struct SeedNote {
    id: &'static str,
    title: &'static str,
    note_date: &'static str,
    project_id: &'static str,
    is_favorite: bool,
    tags: &'static [&'static str],
    archived: bool,
    markdown: &'static str,
}

fn note_ai_privacy_key(privacy_scope: &str) -> DataResult<&'static str> {
    match privacy_scope {
        "local" => Ok(NOTE_AI_PRIVACY_LOCAL_KEY),
        "external" => Ok(NOTE_AI_PRIVACY_EXTERNAL_KEY),
        _ => Err(DataError::InvalidInput(
            "Некорректный тип privacy confirmation для AI".to_string(),
        )),
    }
}

fn normalize_note_chat_role(role: &str) -> DataResult<String> {
    match role.trim() {
        "user" => Ok("user".to_string()),
        "assistant" => Ok("assistant".to_string()),
        _ => Err(DataError::InvalidInput(
            "Роль сообщения AI-чата должна быть user или assistant".to_string(),
        )),
    }
}

fn normalize_note_chat_title(title: &str) -> String {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        "Без названия".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_rag_chat_title(title: &str) -> DataResult<String> {
    let title = normalize_required_text(title, "Название чата")?;
    Ok(title.chars().take(120).collect())
}

fn set_setting_tx(transaction: &Transaction<'_>, key: &str, value: Value) -> DataResult<()> {
    transaction.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![key, value.to_string(), now_iso()],
    )?;
    Ok(())
}

fn attachment_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AttachmentDto> {
    let edit_metadata_json: String = row.get(9)?;
    let blob_id: Option<String> = row.get(5)?;
    Ok(AttachmentDto {
        id: row.get(0)?,
        note_id: row.get(1)?,
        kind: row.get(2)?,
        original_name: row.get(3)?,
        storage_rel_path: row.get(4)?,
        asset_uri: blob_id.as_deref().map(assets::asset_uri),
        blob_id,
        mime_type: row.get(6)?,
        size_bytes: row.get(7)?,
        original_attachment_id: row.get(8)?,
        edit_metadata: serde_json::from_str(&edit_metadata_json).unwrap_or_else(|_| json!({})),
        created_at: row.get(10)?,
    })
}

fn ensure_storage_dirs(base_dir: &Path) -> DataResult<()> {
    fs::create_dir_all(base_dir)?;
    for folder in [
        "attachments",
        "images",
        assets::ASSET_ROOT,
        "exports",
        "backups",
        "cache",
    ] {
        fs::create_dir_all(base_dir.join(folder))?;
    }
    Ok(())
}

fn ensure_safe_relative_path(relative_path: &str) -> DataResult<()> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(DataError::InvalidInput(
            "Абсолютные пути в managed storage запрещены".to_string(),
        ));
    }

    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => {
                return Err(DataError::InvalidInput(
                    "Путь содержит небезопасные компоненты".to_string(),
                ))
            }
        }
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct BackupLimits {
    max_archive_bytes: u64,
    max_manifest_bytes: u64,
    max_entry_bytes: u64,
    max_uncompressed_bytes: u64,
    max_entries: usize,
    max_compression_ratio: u64,
}

impl Default for BackupLimits {
    fn default() -> Self {
        Self {
            max_archive_bytes: MAX_BACKUP_ARCHIVE_BYTES,
            max_manifest_bytes: MAX_BACKUP_MANIFEST_BYTES,
            max_entry_bytes: MAX_BACKUP_ENTRY_BYTES,
            max_uncompressed_bytes: MAX_BACKUP_UNCOMPRESSED_BYTES,
            max_entries: MAX_BACKUP_ENTRIES,
            max_compression_ratio: MAX_BACKUP_COMPRESSION_RATIO,
        }
    }
}

fn backup_invalid(message: &str) -> DataError {
    DataError::InvalidInput(message.to_string())
}

fn validate_external_backup_path(path: &Path) -> DataResult<()> {
    let valid_extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"));
    if !path.is_absolute() || !valid_extension || path.file_name().is_none() {
        return Err(backup_invalid("Выберите файл ZIP для резервной копии"));
    }
    if !path.parent().is_some_and(Path::is_dir) || path.is_dir() {
        return Err(backup_invalid("Выбранная папка недоступна для сохранения"));
    }
    Ok(())
}

fn validate_managed_attachment_path(relative_path: &str) -> DataResult<String> {
    if relative_path.is_empty()
        || relative_path.contains('\\')
        || relative_path.starts_with('/')
        || relative_path.starts_with("//")
    {
        return Err(backup_invalid(
            "Резервная копия содержит небезопасный путь вложения",
        ));
    }
    ensure_safe_relative_path(relative_path)?;
    let components = Path::new(relative_path)
        .components()
        .map(|component| match component {
            Component::Normal(value) => value.to_string_lossy().into_owned(),
            _ => String::new(),
        })
        .collect::<Vec<_>>();
    if components.len() < 2
        || !MANAGED_ATTACHMENT_ROOTS
            .iter()
            .any(|root| components.first().is_some_and(|value| value == root))
        || components.iter().any(String::is_empty)
    {
        return Err(backup_invalid(
            "Резервная копия содержит неизвестный путь вложения",
        ));
    }
    Ok(components.join("/"))
}

fn normalize_backup_entry_name(name: &str) -> DataResult<String> {
    if name.is_empty() || name.contains('\\') || name.starts_with('/') || name.starts_with("//") {
        return Err(backup_invalid(
            "Резервная копия содержит небезопасное имя файла",
        ));
    }
    let trimmed = name.trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(backup_invalid(
            "Резервная копия содержит небезопасное имя файла",
        ));
    }
    ensure_safe_relative_path(trimmed)?;
    let normalized = Path::new(trimmed)
        .components()
        .map(|component| match component {
            Component::Normal(value) => value.to_string_lossy().into_owned(),
            _ => String::new(),
        })
        .collect::<Vec<_>>()
        .join("/");
    if normalized != trimmed {
        return Err(backup_invalid(
            "Резервная копия содержит неоднозначное имя файла",
        ));
    }
    Ok(normalized)
}

fn validate_backup_archive(bytes: &[u8]) -> DataResult<ValidatedBackup> {
    validate_backup_archive_with_limits(bytes, BackupLimits::default())
}

fn validate_backup_archive_with_limits(
    bytes: &[u8],
    limits: BackupLimits,
) -> DataResult<ValidatedBackup> {
    let archive_size = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
    if bytes.is_empty() {
        return Err(backup_invalid("Файл резервной копии пустой"));
    }
    if archive_size > limits.max_archive_bytes {
        return Err(backup_invalid("Резервная копия слишком большая"));
    }

    let mut archive = ZipArchive::new(Cursor::new(bytes))?;
    if archive.is_empty() || archive.len() > limits.max_entries {
        return Err(backup_invalid(
            "Резервная копия содержит недопустимое количество файлов",
        ));
    }

    let mut entry_names = HashSet::new();
    let mut attachment_entries = HashSet::new();
    let mut manifest_bytes = None;
    let mut uncompressed_total = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let entry_name = normalize_backup_entry_name(entry.name())?;
        if !entry_names.insert(entry_name.clone()) {
            return Err(backup_invalid(
                "Резервная копия содержит повторяющиеся файлы",
            ));
        }
        let entry_size = entry.size();
        if entry_size > limits.max_entry_bytes {
            return Err(backup_invalid(
                "Один из файлов резервной копии слишком большой",
            ));
        }
        uncompressed_total = uncompressed_total
            .checked_add(entry_size)
            .ok_or_else(|| backup_invalid("Размер резервной копии некорректен"))?;
        if uncompressed_total > limits.max_uncompressed_bytes {
            return Err(backup_invalid(
                "Распакованные данные резервной копии слишком большие",
            ));
        }
        let compressed_size = entry.compressed_size();
        if entry_size > 1024 * 1024
            && (compressed_size == 0
                || entry_size / compressed_size.max(1) > limits.max_compression_ratio)
        {
            return Err(backup_invalid(
                "Резервная копия имеет подозрительную степень сжатия",
            ));
        }

        if entry_name == BACKUP_MANIFEST_NAME {
            if entry.is_dir() || entry_size > limits.max_manifest_bytes {
                return Err(backup_invalid(
                    "Описание резервной копии отсутствует или повреждено",
                ));
            }
            let capacity = usize::try_from(entry_size).unwrap_or(0);
            let mut value = Vec::with_capacity(capacity);
            entry.read_to_end(&mut value)?;
            manifest_bytes = Some(value);
            continue;
        }

        let Some(storage_path) = entry_name.strip_prefix("files/") else {
            return Err(backup_invalid("Резервная копия содержит неизвестный файл"));
        };
        if entry.is_dir() {
            validate_managed_attachment_path(storage_path)?;
            continue;
        }
        attachment_entries.insert(validate_managed_attachment_path(storage_path)?);
    }

    let manifest_bytes = manifest_bytes
        .ok_or_else(|| backup_invalid("Описание резервной копии отсутствует или повреждено"))?;
    let mut data: BackupData = serde_json::from_slice(&manifest_bytes)?;
    validate_backup_data(&mut data)?;
    let expected_entries = if data.version >= 6 {
        data.asset_blobs
            .iter()
            .map(|blob| validate_managed_attachment_path(&blob.storage_rel_path))
            .collect::<DataResult<HashSet<_>>>()?
    } else {
        data.attachments
            .iter()
            .map(|attachment| validate_managed_attachment_path(&attachment.storage_rel_path))
            .collect::<DataResult<HashSet<_>>>()?
    };
    if attachment_entries
        .iter()
        .any(|entry| !expected_entries.contains(entry))
    {
        return Err(backup_invalid(
            "Резервная копия содержит вложение без описания",
        ));
    }
    let missing_attachment_files = expected_entries
        .iter()
        .filter(|entry| !attachment_entries.contains(*entry))
        .count();
    if data.version >= 5 && missing_attachment_files > 0 {
        return Err(backup_invalid(
            "Резервная копия не содержит один или несколько файлов вложений",
        ));
    }

    Ok(ValidatedBackup {
        data,
        attachment_entries,
        missing_attachment_files,
    })
}

fn validate_backup_data(data: &mut BackupData) -> DataResult<()> {
    if data.version == 0 || data.version > CURRENT_BACKUP_VERSION {
        return Err(backup_invalid(
            "Эта резервная копия создана неподдерживаемой версией NoteFlow",
        ));
    }

    let project_ids = unique_backup_ids(data.projects.iter().map(|item| item.id.as_str()))?;
    let tag_ids = unique_backup_ids(data.tags.iter().map(|item| item.id.as_str()))?;
    let note_ids = unique_backup_ids(data.notes.iter().map(|item| item.id.as_str()))?;
    let revision_ids = unique_backup_ids(data.note_revisions.iter().map(|item| item.id.as_str()))?;
    unique_backup_ids(data.attachments.iter().map(|item| item.id.as_str()))?;
    unique_backup_ids(data.llm_providers.iter().map(|item| item.id.as_str()))?;
    unique_backup_ids(data.embedding_profiles.iter().map(|item| item.id.as_str()))?;

    for note in &data.notes {
        if note.content_version < 0 {
            return Err(backup_invalid(
                "Резервная копия содержит недопустимую версию заметки",
            ));
        }
        if note
            .project_id
            .as_ref()
            .is_some_and(|project_id| !project_ids.contains(project_id))
        {
            return Err(backup_invalid(
                "Резервная копия содержит заметку с неизвестным проектом",
            ));
        }
    }
    if data
        .note_revisions
        .iter()
        .any(|item| !note_ids.contains(&item.note_id))
        || data
            .note_content_sidecars
            .iter()
            .any(|item| !note_ids.contains(&item.note_id))
        || data
            .note_revision_sidecars
            .iter()
            .any(|item| !revision_ids.contains(&item.revision_id))
        || data
            .note_tags
            .iter()
            .any(|item| !note_ids.contains(&item.note_id) || !tag_ids.contains(&item.tag_id))
        || data
            .attachments
            .iter()
            .any(|item| !note_ids.contains(&item.note_id) || item.size_bytes < 0)
    {
        return Err(backup_invalid(
            "Резервная копия содержит несогласованные данные",
        ));
    }

    unique_backup_pairs(
        data.note_content_sidecars
            .iter()
            .map(|item| (item.note_id.as_str(), item.kind.as_str())),
    )?;
    unique_backup_pairs(
        data.note_revision_sidecars
            .iter()
            .map(|item| (item.revision_id.as_str(), item.kind.as_str())),
    )?;
    unique_backup_pairs(
        data.note_tags
            .iter()
            .map(|item| (item.note_id.as_str(), item.tag_id.as_str())),
    )?;
    unique_backup_ids(data.app_settings.iter().map(|item| item.key.as_str()))?;
    data.app_settings
        .retain(|setting| is_safe_backup_setting_key(&setting.key));

    let attachment_ids = data
        .attachments
        .iter()
        .map(|attachment| attachment.id.as_str())
        .collect::<HashSet<_>>();
    let mut storage_paths = HashSet::new();
    for attachment in &data.attachments {
        let path = validate_managed_attachment_path(&attachment.storage_rel_path)?;
        if data.version < 6 && !storage_paths.insert(path.clone()) {
            return Err(backup_invalid(
                "Резервная копия содержит повторяющийся путь вложения",
            ));
        }
        if attachment
            .original_attachment_id
            .as_ref()
            .is_some_and(|id| id == &attachment.id || !attachment_ids.contains(id.as_str()))
        {
            return Err(backup_invalid(
                "Резервная копия содержит несогласованное изображение",
            ));
        }
    }

    if data.version >= 6 {
        let asset_ids = unique_backup_ids(data.asset_blobs.iter().map(|blob| blob.id.as_str()))?;
        let mut asset_paths = HashSet::new();
        for blob in &data.asset_blobs {
            let path = validate_managed_attachment_path(&blob.storage_rel_path)?;
            let canonical_path = assets::canonical_blob_relative_path(&blob.id).map_err(|_| {
                backup_invalid("Резервная копия содержит несогласованный managed asset")
            })?;
            if blob.id != blob.sha256
                || blob.id.len() != 64
                || !blob.id.bytes().all(|byte| byte.is_ascii_hexdigit())
                || blob.size_bytes <= 0
                || path != canonical_path
                || !asset_paths.insert(path)
            {
                return Err(backup_invalid(
                    "Резервная копия содержит несогласованный managed asset",
                ));
            }
        }
        for attachment in &data.attachments {
            let blob_id = attachment.blob_id.as_ref().ok_or_else(|| {
                backup_invalid("Резервная копия содержит вложение без managed asset")
            })?;
            let blob = data
                .asset_blobs
                .iter()
                .find(|blob| &blob.id == blob_id)
                .ok_or_else(|| {
                    backup_invalid("Резервная копия содержит неизвестный managed asset")
                })?;
            if attachment.storage_rel_path != blob.storage_rel_path {
                return Err(backup_invalid(
                    "Резервная копия содержит несогласованный путь managed asset",
                ));
            }
        }
        unique_backup_pairs(
            data.note_asset_refs
                .iter()
                .map(|item| (item.note_id.as_str(), item.blob_id.as_str())),
        )?;
        unique_backup_pairs(
            data.revision_asset_refs
                .iter()
                .map(|item| (item.revision_id.as_str(), item.blob_id.as_str())),
        )?;
        unique_backup_pairs(
            data.note_attachment_refs
                .iter()
                .map(|item| (item.note_id.as_str(), item.attachment_id.as_str())),
        )?;
        unique_backup_pairs(
            data.revision_attachment_refs
                .iter()
                .map(|item| (item.revision_id.as_str(), item.attachment_id.as_str())),
        )?;
        if data
            .note_asset_refs
            .iter()
            .any(|item| !note_ids.contains(&item.note_id) || !asset_ids.contains(&item.blob_id))
            || data.revision_asset_refs.iter().any(|item| {
                !revision_ids.contains(&item.revision_id) || !asset_ids.contains(&item.blob_id)
            })
            || data.note_attachment_refs.iter().any(|item| {
                !note_ids.contains(&item.note_id)
                    || !attachment_ids.contains(item.attachment_id.as_str())
            })
            || data.revision_attachment_refs.iter().any(|item| {
                !revision_ids.contains(&item.revision_id)
                    || !attachment_ids.contains(item.attachment_id.as_str())
            })
        {
            return Err(backup_invalid(
                "Резервная копия содержит несогласованные asset references",
            ));
        }
    } else {
        data.asset_blobs.clear();
        data.note_asset_refs.clear();
        data.revision_asset_refs.clear();
        data.note_attachment_refs.clear();
        data.revision_attachment_refs.clear();
        for attachment in &mut data.attachments {
            attachment.blob_id = None;
        }
    }

    if data.version < 5 {
        data.ai_chats.clear();
        data.ai_messages.clear();
        return Ok(());
    }

    let chat_ids = unique_backup_ids(data.ai_chats.iter().map(|item| item.id.as_str()))?;
    unique_backup_ids(data.ai_messages.iter().map(|item| item.id.as_str()))?;
    for chat in &data.ai_chats {
        match chat.scope.as_str() {
            "note"
                if chat
                    .note_id
                    .as_ref()
                    .is_some_and(|id| note_ids.contains(id)) => {}
            "rag" if chat.note_id.is_none() => {}
            _ => {
                return Err(backup_invalid(
                    "Резервная копия содержит несогласованный ИИ-чат",
                ))
            }
        }
    }
    for message in &mut data.ai_messages {
        if !chat_ids.contains(&message.chat_id)
            || !matches!(message.role.as_str(), "user" | "assistant")
        {
            return Err(backup_invalid(
                "Резервная копия содержит несогласованную историю ИИ-чата",
            ));
        }
        sanitize_historical_sources(&mut message.sources_json, &note_ids);
    }
    Ok(())
}

fn unique_backup_ids<'a>(values: impl Iterator<Item = &'a str>) -> DataResult<HashSet<String>> {
    let mut ids = HashSet::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() || !ids.insert(trimmed.to_string()) {
            return Err(backup_invalid(
                "Резервная копия содержит пустые или повторяющиеся идентификаторы",
            ));
        }
    }
    Ok(ids)
}

fn unique_backup_pairs<'a>(values: impl Iterator<Item = (&'a str, &'a str)>) -> DataResult<()> {
    let mut pairs = HashSet::new();
    for (left, right) in values {
        if left.trim().is_empty()
            || right.trim().is_empty()
            || !pairs.insert((left.to_string(), right.to_string()))
        {
            return Err(backup_invalid(
                "Резервная копия содержит повторяющиеся связи",
            ));
        }
    }
    Ok(())
}

fn sanitize_historical_sources(sources: &mut Value, note_ids: &HashSet<String>) {
    let Some(items) = sources.as_array_mut() else {
        *sources = json!([]);
        return;
    };
    items.retain(|source| {
        source
            .get("noteId")
            .and_then(Value::as_str)
            .is_some_and(|note_id| note_ids.contains(note_id))
    });
}

fn is_safe_backup_setting_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    !normalized.starts_with("internal.")
        && !normalized.contains("api")
        && !normalized.contains("secret")
        && !normalized.contains("credential")
        && !normalized.contains("authorization")
        && !normalized.contains("token")
        && !normalized.contains("key")
}

fn backup_contents_summary(data: &BackupData) -> BackupContentsSummaryDto {
    BackupContentsSummaryDto {
        notes: data.notes.len(),
        projects: data.projects.len(),
        tags: data.tags.len(),
        attachments: data.attachments.len(),
        note_ai_chats: data
            .ai_chats
            .iter()
            .filter(|chat| chat.scope == "note")
            .count(),
        rag_chats: data
            .ai_chats
            .iter()
            .filter(|chat| chat.scope == "rag")
            .count(),
        messages: data.ai_messages.len(),
    }
}

fn stage_backup_files(
    base_dir: &Path,
    bytes: &[u8],
    validated: &ValidatedBackup,
) -> DataResult<StagedBackupFiles> {
    let staging_dir = base_dir
        .join("cache")
        .join(format!("restore-{}", Uuid::new_v4()));
    let incoming_dir = staging_dir.join("incoming");
    let result = (|| -> DataResult<()> {
        for root in MANAGED_ATTACHMENT_ROOTS {
            fs::create_dir_all(incoming_dir.join(root))?;
        }
        let mut archive = ZipArchive::new(Cursor::new(bytes))?;
        let storage_paths = if validated.data.version >= 6 {
            validated
                .data
                .asset_blobs
                .iter()
                .map(|blob| blob.storage_rel_path.as_str())
                .collect::<Vec<_>>()
        } else {
            validated
                .data
                .attachments
                .iter()
                .map(|attachment| attachment.storage_rel_path.as_str())
                .collect::<Vec<_>>()
        };
        let blob_integrity = validated
            .data
            .asset_blobs
            .iter()
            .map(|blob| {
                (
                    blob.storage_rel_path.as_str(),
                    (blob.id.as_str(), blob.size_bytes),
                )
            })
            .collect::<HashMap<_, _>>();
        for path in storage_paths {
            let storage_path = validate_managed_attachment_path(path)?;
            if !validated.attachment_entries.contains(&storage_path) {
                continue;
            }
            let entry_name = format!("files/{storage_path}");
            let mut entry = archive.by_name(&entry_name)?;
            let output_path = incoming_dir.join(Path::new(&storage_path));
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = File::create(&output_path)?;
            let copied = std::io::copy(&mut entry, &mut output)?;
            output.flush()?;
            output.sync_all()?;
            drop(output);
            if copied != entry.size() {
                return Err(backup_invalid(
                    "Не удалось полностью распаковать вложение резервной копии",
                ));
            }
            if let Some((expected_hash, expected_size)) = blob_integrity.get(path) {
                let copied_size = i64::try_from(copied).unwrap_or(i64::MAX);
                let actual_hash = assets::sha256_file(&output_path)?;
                if copied_size != *expected_size || actual_hash != *expected_hash {
                    return Err(backup_invalid(
                        "Резервная копия содержит повреждённый managed asset",
                    ));
                }
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(error);
    }
    Ok(StagedBackupFiles { staging_dir })
}

struct StagedBackupFiles {
    staging_dir: PathBuf,
}

impl StagedBackupFiles {
    fn into_path(mut self) -> PathBuf {
        std::mem::take(&mut self.staging_dir)
    }
}

impl Drop for StagedBackupFiles {
    fn drop(&mut self) {
        if !self.staging_dir.as_os_str().is_empty() {
            let _ = fs::remove_dir_all(&self.staging_dir);
        }
    }
}

struct RestoreFileSwap {
    base_dir: PathBuf,
    staging_dir: PathBuf,
    committed: bool,
}

impl RestoreFileSwap {
    fn apply(base_dir: &Path, staging_dir: PathBuf, restore_id: String) -> DataResult<Self> {
        write_restore_state(base_dir, &staging_dir, &restore_id)?;
        let swap = Self {
            base_dir: base_dir.to_path_buf(),
            staging_dir,
            committed: false,
        };
        fs::create_dir_all(swap.staging_dir.join("rollback"))?;
        for root in MANAGED_ATTACHMENT_ROOTS {
            let live = swap.base_dir.join(root);
            let incoming = swap.staging_dir.join("incoming").join(root);
            let rollback = swap.staging_dir.join("rollback").join(root);
            if !live.is_dir() || !incoming.is_dir() {
                return Err(backup_invalid(
                    "Не удалось подготовить хранилище вложений к восстановлению",
                ));
            }
            fs::rename(&live, &rollback)?;
            if let Err(error) = fs::rename(&incoming, &live) {
                let _ = fs::rename(&rollback, &live);
                return Err(DataError::Io(error));
            }
        }
        Ok(swap)
    }

    fn commit(mut self, conn: &Connection) {
        self.committed = true;
        finalize_committed_restore(&self.base_dir, &self.staging_dir, conn);
    }
}

impl Drop for RestoreFileSwap {
    fn drop(&mut self) {
        if !self.committed
            && rollback_restore_roots(&self.base_dir, &self.staging_dir).is_ok()
            && fs::remove_dir_all(&self.staging_dir).is_ok()
        {
            let _ = fs::remove_file(restore_state_path(&self.base_dir));
        }
    }
}

fn restore_state_path(base_dir: &Path) -> PathBuf {
    base_dir.join("cache").join(RESTORE_STATE_FILE)
}

fn restore_staging_path(base_dir: &Path, directory: &str) -> DataResult<PathBuf> {
    let path = Path::new(directory);
    let mut components = path.components();
    let Some(Component::Normal(name)) = components.next() else {
        return Err(DataError::State(
            "Состояние восстановления повреждено".to_string(),
        ));
    };
    if components.next().is_some()
        || !directory.starts_with("restore-")
        || name.to_string_lossy() != directory
    {
        return Err(DataError::State(
            "Состояние восстановления повреждено".to_string(),
        ));
    }
    Ok(base_dir.join("cache").join(directory))
}

fn write_restore_state(base_dir: &Path, staging_dir: &Path, restore_id: &str) -> DataResult<()> {
    let staging_directory = staging_dir
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| DataError::State("Не удалось подготовить восстановление".to_string()))?;
    let expected = restore_staging_path(base_dir, staging_directory)?;
    if expected != staging_dir {
        return Err(DataError::State(
            "Не удалось подготовить восстановление".to_string(),
        ));
    }
    let state_path = restore_state_path(base_dir);
    if state_path.exists() {
        return Err(DataError::State(
            "Предыдущее восстановление требует перезапуска NoteFlow".to_string(),
        ));
    }
    let state = RestoreState {
        restore_id: restore_id.to_string(),
        staging_directory: staging_directory.to_string(),
    };
    let temporary_path = state_path.with_extension("json.tmp");
    let result = (|| -> DataResult<()> {
        let mut file = File::create(&temporary_path)?;
        serde_json::to_writer(&mut file, &state)?;
        file.flush()?;
        file.sync_all()?;
        fs::rename(&temporary_path, &state_path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn read_restore_state(base_dir: &Path) -> DataResult<Option<(RestoreState, PathBuf)>> {
    let state_path = restore_state_path(base_dir);
    if !state_path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&state_path)?;
    if bytes.len() > 4096 {
        return Err(DataError::State(
            "Состояние восстановления повреждено".to_string(),
        ));
    }
    let state: RestoreState = serde_json::from_slice(&bytes)?;
    let staging_dir = restore_staging_path(base_dir, &state.staging_directory)?;
    Ok(Some((state, staging_dir)))
}

fn rollback_restore_roots(base_dir: &Path, staging_dir: &Path) -> DataResult<()> {
    let discarded_dir = staging_dir.join("discarded");
    fs::create_dir_all(&discarded_dir)?;
    for root in MANAGED_ATTACHMENT_ROOTS.into_iter().rev() {
        let rollback = staging_dir.join("rollback").join(root);
        if !rollback.exists() {
            continue;
        }
        let live = base_dir.join(root);
        let discarded = discarded_dir.join(root);
        if live.exists() {
            fs::rename(&live, &discarded)?;
        }
        if let Err(error) = fs::rename(&rollback, &live) {
            if discarded.exists() {
                let _ = fs::rename(&discarded, &live);
            }
            return Err(DataError::Io(error));
        }
    }
    Ok(())
}

fn finalize_committed_restore(base_dir: &Path, staging_dir: &Path, conn: &Connection) {
    if staging_dir.exists() && fs::remove_dir_all(staging_dir).is_err() {
        return;
    }
    let state_path = restore_state_path(base_dir);
    if state_path.exists() && fs::remove_file(state_path).is_err() {
        return;
    }
    let _ = conn.execute(
        "DELETE FROM app_settings WHERE key = ?1",
        [RESTORE_COMMIT_SETTING_KEY],
    );
}

fn recover_interrupted_restore(base_dir: &Path, conn: &Connection) -> DataResult<()> {
    let Some((state, staging_dir)) = read_restore_state(base_dir)? else {
        let _ = conn.execute(
            "DELETE FROM app_settings WHERE key = ?1",
            [RESTORE_COMMIT_SETTING_KEY],
        );
        return Ok(());
    };
    let committed_restore_id = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            [RESTORE_COMMIT_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|value| serde_json::from_str::<String>(&value).ok());
    if committed_restore_id.as_deref() == Some(state.restore_id.as_str()) {
        if staging_dir.exists() {
            fs::remove_dir_all(&staging_dir)?;
        }
    } else {
        if !staging_dir.exists() {
            return Err(DataError::State(
                "Не удалось восстановить предыдущее состояние файлов".to_string(),
            ));
        }
        rollback_restore_roots(base_dir, &staging_dir)?;
        fs::remove_dir_all(&staging_dir)?;
    }
    fs::remove_file(restore_state_path(base_dir))?;
    conn.execute(
        "DELETE FROM app_settings WHERE key = ?1",
        [RESTORE_COMMIT_SETTING_KEY],
    )?;
    Ok(())
}

fn mime_type_from_file_name(file_name: &str, is_image: bool) -> String {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        "md" => "text/markdown",
        "txt" => "text/plain",
        "json" => "application/json",
        "zip" => "application/zip",
        _ if is_image => "application/octet-stream",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn sanitize_file_name(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = sanitized.trim_matches(['.', '_', '-']).to_string();
    if trimmed.is_empty() {
        "noteflow-file".to_string()
    } else {
        trimmed
    }
}

fn collision_safe_export_name(preferred: &str, used_names: &mut HashSet<String>) -> String {
    let candidate = if preferred.trim().is_empty() {
        "Вложение".to_string()
    } else {
        preferred.to_string()
    };
    if used_names.insert(candidate.to_ascii_lowercase()) {
        return candidate;
    }
    let path = Path::new(&candidate);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Вложение");
    let extension = path.extension().and_then(|value| value.to_str());
    for index in 2..10_000 {
        let next = match extension {
            Some(extension) => format!("{stem} ({index}).{extension}"),
            None => format!("{stem} ({index})"),
        };
        if used_names.insert(next.to_ascii_lowercase()) {
            return next;
        }
    }
    format!("{}-{}", stem, Uuid::new_v4())
}

fn default_asset_export_name(blob_id: &str, mime_type: &str) -> String {
    let extension = match mime_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "text/plain" => "txt",
        "application/pdf" => "pdf",
        _ => "bin",
    };
    let short_id = blob_id.get(..8).unwrap_or("asset");
    format!("asset-{short_id}.{extension}")
}

fn normalize_required_text(value: &str, field_name: &str) -> DataResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(DataError::InvalidInput(format!(
            "{field_name} не может быть пустым"
        )));
    }
    Ok(trimmed.to_string())
}

fn normalize_tag_name(value: &str) -> DataResult<String> {
    let name = normalize_required_text(value, "Название тега")?;
    let normalized = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() > 80 {
        return Err(DataError::InvalidInput(
            "Название тега не должно быть длиннее 80 символов".to_string(),
        ));
    }
    Ok(normalized)
}

fn tag_name_exists(
    connection: &Connection,
    name: &str,
    excluded_tag_id: Option<&str>,
) -> DataResult<bool> {
    let normalized_name = name.to_lowercase();
    let mut statement = connection.prepare("SELECT id, name FROM tags")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (tag_id, existing_name) = row?;
        if excluded_tag_id == Some(tag_id.as_str()) {
            continue;
        }
        if existing_name.to_lowercase() == normalized_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn normalize_tag_custom_color(value: Option<String>) -> DataResult<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let normalized = value.trim().to_ascii_uppercase();
    if normalized.len() != 7
        || !normalized.starts_with('#')
        || !normalized[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(DataError::InvalidInput(
            "Цвет тега имеет некорректный формат".to_string(),
        ));
    }
    Ok(Some(normalized))
}

fn normalize_tag_color(color: &str) -> String {
    match color {
        "blue" | "green" | "purple" | "amber" | "pink" => color.to_string(),
        _ => "blue".to_string(),
    }
}

fn default_ui_theme() -> String {
    "light".to_string()
}

fn default_ui_app_zoom_percent() -> i64 {
    100
}

fn default_ui_sidebar_width() -> i64 {
    250
}

fn default_ui_list_width() -> i64 {
    376
}

fn default_ui_chat_width() -> i64 {
    380
}

fn default_ui_rag_conversation_width() -> i64 {
    280
}

fn default_ui_rag_sources_width() -> i64 {
    320
}

fn default_ui_last_section() -> String {
    "notes".to_string()
}

fn default_ui_language() -> String {
    "ru".to_string()
}

fn default_ui_local_profile_name() -> String {
    "Локальный профиль".to_string()
}

fn normalize_local_profile_name(value: &str) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return default_ui_local_profile_name();
    }
    normalized.chars().take(48).collect()
}

fn default_ui_editor_content_width() -> i64 {
    840
}

fn clamp_i64(value: i64, min: i64, max: i64) -> i64 {
    value.max(min).min(max)
}

fn normalize_app_zoom(value: i64) -> i64 {
    let stepped_value = ((value as f64) / 5.0).round() as i64 * 5;
    clamp_i64(stepped_value, 80, 160)
}

fn normalize_ui_theme(value: &str) -> String {
    match value {
        "dark" | "system" => value.to_string(),
        _ => "light".to_string(),
    }
}

fn normalize_app_section(value: &str) -> String {
    match value {
        "projects" | "rag" | "tags" | "archive" | "settings" => value.to_string(),
        _ => "notes".to_string(),
    }
}

fn normalize_app_language(value: &str) -> String {
    match value {
        "en" => "en".to_string(),
        _ => "ru".to_string(),
    }
}

fn infer_tag_icon_key(name: &str) -> &'static str {
    let normalized = name.to_lowercase();
    if normalized.contains("код") || normalized.contains("api") || normalized.contains("dev") {
        "code"
    } else if normalized.contains("зада")
        || normalized.contains("план")
        || normalized.contains("todo")
        || normalized.contains("task")
    {
        "task"
    } else if normalized.contains("иде") || normalized.contains("idea") {
        "idea"
    } else if normalized.contains("исслед")
        || normalized.contains("польз")
        || normalized.contains("лич")
        || normalized.contains("research")
        || normalized.contains("user")
        || normalized.contains("personal")
    {
        "person"
    } else if normalized.contains("проект")
        || normalized.contains("архитект")
        || normalized.contains("project")
        || normalized.contains("architecture")
    {
        "project"
    } else if normalized.contains("док") || normalized.contains("doc") {
        "document"
    } else {
        "tag"
    }
}

fn validate_iso_date(value: &str) -> DataResult<()> {
    let bytes = value.as_bytes();
    let is_valid = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());
    if is_valid {
        Ok(())
    } else {
        Err(DataError::InvalidInput(
            "Дата заметки должна быть в формате YYYY-MM-DD".to_string(),
        ))
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn empty_document() -> Value {
    json!({ "type": "doc", "content": [{ "type": "paragraph" }] })
}

#[cfg(test)]
fn document_from_text(text: &str) -> Value {
    let content: Vec<Value> = text
        .split("\n\n")
        .map(str::trim)
        .filter(|paragraph| !paragraph.is_empty())
        .map(|paragraph| json!({ "type": "paragraph", "content": [{ "type": "text", "text": paragraph }] }))
        .collect();
    if content.is_empty() {
        empty_document()
    } else {
        json!({ "type": "doc", "content": content })
    }
}

#[cfg(test)]
fn markdown_to_plain_text(markdown: &str) -> String {
    markdown
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.starts_with('|') && !trimmed.starts_with("```")
        })
        .map(|line| {
            line.replace(['#', '*', '`'], "")
                .replace("- [x]", "")
                .replace("- [ ]", "")
                .replace("- ", "")
                .replace("> ", "")
        })
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
fn plain_text_to_html(text: &str) -> String {
    if text.trim().is_empty() {
        String::new()
    } else {
        format!("<p>{}</p>", escape_html(text))
    }
}

#[cfg(test)]
fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn count_words(text: &str) -> usize {
    text.split_whitespace().count()
}

fn format_archived_at(value: String) -> String {
    let date = value.split('T').next().unwrap_or(value.as_str());
    format!("Архивировано {date}")
}

fn format_file_size(size: i64) -> String {
    if size < 1024 {
        format!("{size} Б")
    } else if size < 1024 * 1024 {
        format!("{} КБ", size / 1024)
    } else {
        format!("{:.1} МБ", size as f64 / 1024.0 / 1024.0)
    }
}

fn zip_options() -> SimpleFileOptions {
    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)
}

fn export_result(path: PathBuf, relative_path: String, message: &str) -> ExportResultDto {
    ExportResultDto {
        path: path.to_string_lossy().to_string(),
        relative_path,
        message: message.to_string(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicCommandError {
    code: &'static str,
    message: &'static str,
    retryable: bool,
}

impl PublicCommandError {
    fn interrupted() -> Self {
        Self {
            code: "OPERATION_INTERRUPTED",
            message: "Операция была прервана. Попробуйте ещё раз.",
            retryable: true,
        }
    }
}

fn command_error(error: DataError) -> PublicCommandError {
    let (code, message, retryable) = match &error {
        DataError::Sql(_) => (
            "DATABASE_FAILED",
            "Не удалось получить доступ к данным. Попробуйте ещё раз.",
            true,
        ),
        DataError::Io(_) => (
            "FILE_ACCESS_FAILED",
            "Не удалось обработать файл. Проверьте доступ и повторите попытку.",
            true,
        ),
        DataError::Zip(_) => ("FILE_ACCESS_FAILED", "Не удалось обработать архив.", false),
        DataError::Json(_) | DataError::Serialization => (
            "SERIALIZATION_FAILED",
            "Не удалось обработать данные.",
            false,
        ),
        DataError::NotFound(_) => ("NOT_FOUND", "Запрошенные данные больше не доступны.", false),
        DataError::StaleWrite => (
            "STALE_WRITE",
            "Заметка уже была изменена. Загружена более новая версия.",
            true,
        ),
        DataError::Revision => (
            "REVISION_FAILED",
            "Не удалось сохранить историю изменений заметки.",
            true,
        ),
        DataError::Sidecar => (
            "SIDECAR_FAILED",
            "Не удалось сохранить расширенное оформление заметки.",
            true,
        ),
        DataError::Transaction => (
            "DATABASE_WRITE_FAILED",
            "Не удалось сохранить изменения. Попробуйте ещё раз.",
            true,
        ),
        DataError::RestoreApplied => (
            "RESTORE_APPLIED",
            "Данные восстановлены. Перезапустите NoteFlow для обновления интерфейса.",
            false,
        ),
        DataError::State(_) => (
            "OPERATION_UNAVAILABLE",
            "Операция временно недоступна. Попробуйте ещё раз.",
            true,
        ),
        DataError::InvalidInput(raw) => {
            let lower = raw.to_lowercase();
            if lower.contains("timeout")
                || lower.contains("timed out")
                || lower.contains("время ожидания")
            {
                (
                    "PROVIDER_TIMEOUT",
                    "Модель не ответила вовремя. Повторите запрос.",
                    true,
                )
            } else if lower.contains("401")
                || lower.contains("403")
                || lower.contains("unauthorized")
                || lower.contains("forbidden")
            {
                (
                    "PROVIDER_UNAUTHORIZED",
                    "Проверьте API-ключ и настройки модели.",
                    false,
                )
            } else if lower.contains("429") || lower.contains("rate limit") {
                (
                    "PROVIDER_RATE_LIMITED",
                    "Провайдер ограничил число запросов. Повторите позже.",
                    true,
                )
            } else if lower.contains("404") {
                (
                    "PROVIDER_UNAVAILABLE",
                    "Модель или endpoint недоступны.",
                    false,
                )
            } else if (500..=599).contains(
                &lower
                    .split(':')
                    .next()
                    .unwrap_or_default()
                    .parse::<u16>()
                    .unwrap_or_default(),
            ) {
                (
                    "PROVIDER_UNAVAILABLE",
                    "Сервис модели временно недоступен.",
                    true,
                )
            } else if lower.contains("некорректный ответ")
                || lower.contains("неподдерживаемом формате")
            {
                (
                    "INVALID_PROVIDER_RESPONSE",
                    "Модель вернула некорректный ответ.",
                    false,
                )
            } else if lower.contains("endpoint")
                || lower.contains("соединени")
                || lower.contains("curl")
            {
                (
                    "NETWORK_UNAVAILABLE",
                    "Нет соединения с моделью. Проверьте её доступность.",
                    true,
                )
            } else {
                (
                    "INVALID_CONFIGURATION",
                    "Проверьте введённые данные и повторите попытку.",
                    false,
                )
            }
        }
    };
    PublicCommandError {
        code,
        message,
        retryable,
    }
}

pub(crate) fn safe_command_message(error: DataError) -> String {
    command_error(error).message.to_string()
}

fn backup_command_error(error: DataError) -> PublicCommandError {
    match error {
        DataError::RestoreApplied => PublicCommandError {
            code: "RESTORE_APPLIED",
            message: "Резервная копия восстановлена. Перезапустите NoteFlow.",
            retryable: false,
        },
        DataError::Sql(_) | DataError::Transaction => PublicCommandError {
            code: "IMPORT_FAILED",
            message: "Не удалось восстановить резервную копию. Текущие данные не изменены.",
            retryable: true,
        },
        _ => PublicCommandError {
            code: "BACKUP_FAILED",
            message: "Не удалось обработать резервную копию. Проверьте файл и повторите попытку.",
            retryable: false,
        },
    }
}

fn open_background_connection(database_path: &Path) -> DataResult<Connection> {
    let conn = Connection::open(database_path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(conn)
}

#[tauri::command]
pub fn load_workspace(
    state: State<'_, AppState>,
) -> Result<WorkspaceSnapshotDto, PublicCommandError> {
    state
        .with_store(|store| store.load_workspace())
        .map_err(command_error)
}

#[tauri::command]
pub fn get_ui_settings(state: State<'_, AppState>) -> Result<UiSettingsDto, PublicCommandError> {
    state
        .with_store(|store| store.get_ui_settings())
        .map_err(command_error)
}

#[tauri::command]
pub fn update_ui_settings(
    request: UiSettingsDto,
    state: State<'_, AppState>,
) -> Result<UiSettingsDto, PublicCommandError> {
    state
        .with_store(|store| store.update_ui_settings(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_llm_providers(
    state: State<'_, AppState>,
) -> Result<Vec<llm::LlmProviderDto>, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.list_llm_providers(&storage))
        .map_err(command_error)
}

#[tauri::command]
pub fn save_llm_provider(
    request: llm::SaveLlmProviderRequest,
    state: State<'_, AppState>,
) -> Result<llm::LlmProviderDto, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.save_llm_provider(&storage, request))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_llm_provider(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.delete_llm_provider(&storage, &provider_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn set_default_llm_provider(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmProviderDto, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.set_default_llm_provider(&storage, &provider_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_llm_provider_key(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmProviderDto, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.delete_llm_provider_key(&storage, &provider_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn check_llm_provider_key(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmKeyStatusDto, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.check_llm_provider_key(&storage, &provider_id))
        .map_err(command_error)
}

#[tauri::command]
pub async fn list_llm_models_for_draft(
    request: llm::DraftLlmProviderRequest,
    state: State<'_, AppState>,
) -> Result<llm::LlmModelsResultDto, PublicCommandError> {
    llm::log_llm_diagnostic(
        "rust_command_entered",
        &[
            ("command", "list_llm_models_for_draft".to_string()),
            ("providerType", request.provider_type.clone()),
            ("baseUrl", llm::diagnostic_url(&request.base_url)),
            ("modelsEndpoint", request.models_endpoint.clone()),
        ],
    );
    let has_draft_key = request
        .api_key
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    let saved_api_key = if has_draft_key {
        None
    } else if let Some(provider_id) = request.provider_id.as_deref() {
        state
            .with_store(|store| {
                let provider = llm::get_provider_record(&store.conn, provider_id)?;
                let storage = llm::SystemSecretStorage;
                provider
                    .api_key_ref
                    .as_deref()
                    .map(|secret_ref| llm::SecretStorage::get_secret(&storage, secret_ref))
                    .transpose()
                    .map(Option::flatten)
            })
            .map_err(command_error)?
    } else {
        None
    };
    tauri::async_runtime::spawn_blocking(move || {
        let http = llm::CurlHttpClient;
        let result = match llm::list_models_for_draft_with_saved_key(request, saved_api_key, &http)
        {
            Ok(result) => result,
            Err(error) => llm::models_error_result(error),
        };
        llm::log_llm_diagnostic(
            "rust_command_returned",
            &[
                ("command", "list_llm_models_for_draft".to_string()),
                ("status", result.status.clone()),
                ("modelsCount", result.models.len().to_string()),
            ],
        );
        result
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())
}

#[tauri::command]
pub async fn test_llm_provider_draft(
    request: llm::DraftLlmProviderRequest,
) -> Result<llm::LlmConnectionTestResultDto, PublicCommandError> {
    let base_url = request.base_url.clone();
    llm::log_llm_diagnostic(
        "rust_command_entered",
        &[
            ("command", "test_llm_provider_draft".to_string()),
            ("providerType", request.provider_type.clone()),
            ("baseUrl", llm::diagnostic_url(&request.base_url)),
            ("modelsEndpoint", request.models_endpoint.clone()),
        ],
    );
    tauri::async_runtime::spawn_blocking(move || {
        let http = llm::CurlHttpClient;
        let result = match llm::test_draft_provider_connection(request, &http) {
            Ok(result) => result,
            Err(error) => llm::connection_error_result_for_base_url(&base_url, error),
        };
        llm::log_llm_diagnostic(
            "rust_command_returned",
            &[
                ("command", "test_llm_provider_draft".to_string()),
                ("status", result.status.clone()),
                ("modelsCount", result.models.len().to_string()),
                ("chatOk", result.chat_ok.to_string()),
                ("embeddingsOk", result.embeddings_ok.to_string()),
            ],
        );
        result
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())
}

#[tauri::command]
pub fn get_note_ai_status(
    state: State<'_, AppState>,
) -> Result<llm::NoteAiStatusDto, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.note_ai_status(&storage))
        .map_err(command_error)
}

#[tauri::command]
pub fn accept_note_ai_privacy(
    privacy_scope: String,
    state: State<'_, AppState>,
) -> Result<llm::NoteAiStatusDto, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| {
            store.accept_note_ai_privacy(&privacy_scope)?;
            store.note_ai_status(&storage)
        })
        .map_err(command_error)
}

#[tauri::command]
pub fn list_note_chat_messages(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<NoteChatMessageDto>, PublicCommandError> {
    state
        .with_store(|store| store.list_note_chat_messages(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn save_note_chat_message(
    request: SaveNoteChatMessageRequest,
    state: State<'_, AppState>,
) -> Result<NoteChatMessageDto, PublicCommandError> {
    state
        .with_store(|store| store.save_note_chat_message(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_rag_chats(state: State<'_, AppState>) -> Result<Vec<RagChatDto>, PublicCommandError> {
    state
        .with_store(|store| store.list_rag_chats())
        .map_err(command_error)
}

#[tauri::command]
pub fn create_rag_chat(
    request: CreateRagChatRequest,
    state: State<'_, AppState>,
) -> Result<RagChatDto, PublicCommandError> {
    state
        .with_store(|store| store.create_rag_chat(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn rename_rag_chat(
    request: RenameRagChatRequest,
    state: State<'_, AppState>,
) -> Result<RagChatDto, PublicCommandError> {
    state
        .with_store(|store| store.rename_rag_chat(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_rag_chat(
    chat_id: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    state
        .with_store(|store| store.delete_rag_chat(&chat_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_rag_chat_messages(
    chat_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<RagChatMessageDto>, PublicCommandError> {
    state
        .with_store(|store| store.list_rag_chat_messages(&chat_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn save_rag_chat_message(
    request: SaveRagChatMessageRequest,
    state: State<'_, AppState>,
) -> Result<RagChatMessageDto, PublicCommandError> {
    state
        .with_store(|store| store.save_rag_chat_message(request))
        .map_err(command_error)
}

#[tauri::command]
pub async fn run_note_ai(
    request: llm::NoteAiRequestDto,
    state: State<'_, AppState>,
) -> Result<llm::NoteAiResponseDto, PublicCommandError> {
    let provider = state
        .with_store(|store| {
            let provider = store.get_default_llm_provider_record()?.ok_or_else(|| {
                DataError::InvalidInput("Default LLM provider не выбран".to_string())
            })?;
            let privacy_scope = llm::privacy_scope_for_provider(&provider);
            if !store.get_note_ai_privacy_accepted(privacy_scope)? {
                return Err(DataError::InvalidInput(
                    "Перед отправкой текста подтвердите предупреждение AI privacy".to_string(),
                ));
            }
            Ok(provider)
        })
        .map_err(command_error)?;

    tauri::async_runtime::spawn_blocking(move || {
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        llm::run_note_ai_request(&provider, &storage, &http, request)
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())?
    .map_err(command_error)
}

#[tauri::command]
pub async fn run_rag_generation(
    request: rag::RagGenerationRequest,
    state: State<'_, AppState>,
) -> Result<rag::RagGenerationResultDto, rag::RagGenerationCommandError> {
    let (database_path, provider) = state
        .with_store(|store| {
            let provider = store.get_default_llm_provider_record()?.ok_or_else(|| {
                DataError::InvalidInput("Default LLM provider не выбран".to_string())
            })?;
            let privacy_scope = llm::privacy_scope_for_provider(&provider);
            let privacy_accepted = store.get_note_ai_privacy_accepted(privacy_scope)?;
            let storage = llm::SystemSecretStorage;
            let status = llm::note_ai_status(Some(&provider), privacy_accepted, &storage)?;
            if !status.can_use {
                return Err(DataError::InvalidInput(status.message));
            }
            Ok((store.database_path(), provider))
        })
        .map_err(rag::RagGenerationCommandError::from_data_error)?;

    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = open_background_connection(&database_path)?;
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        rag::generate_grounded_answer(&mut conn, &provider, &storage, &http, request)
    })
    .await
    .map_err(|_| {
        rag::RagGenerationCommandError::from_data_error(DataError::State(
            "Фоновая RAG generation не завершена".to_string(),
        ))
    })?
    .map_err(rag::RagGenerationCommandError::from_data_error)
}

#[tauri::command]
pub async fn plan_rag_question(
    chat_id: String,
    user_message_id: String,
    state: State<'_, AppState>,
) -> Result<crate::knowledge_agent::QueryPreview, rag::RagGenerationCommandError> {
    let database_path = state
        .with_store(|store| Ok(store.database_path()))
        .map_err(rag::RagGenerationCommandError::from_data_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_background_connection(&database_path)?;
        rag::preview_global_query(&conn, &chat_id, &user_message_id)
    })
    .await
    .map_err(|_| {
        rag::RagGenerationCommandError::from_data_error(DataError::State(
            "Не удалось подготовить запрос по базе".to_string(),
        ))
    })?
    .map_err(rag::RagGenerationCommandError::from_data_error)
}

#[tauri::command]
pub async fn list_llm_models(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmModelsResultDto, PublicCommandError> {
    let provider = state
        .with_store(|store| store.get_llm_provider_record(&provider_id))
        .map_err(command_error)?;
    llm::log_llm_diagnostic(
        "rust_command_entered",
        &[
            ("command", "list_llm_models".to_string()),
            ("providerId", provider_id.clone()),
            ("providerType", provider.provider_type.clone()),
            ("baseUrl", llm::diagnostic_url(&provider.base_url)),
            ("modelsEndpoint", provider.models_endpoint.clone()),
        ],
    );
    tauri::async_runtime::spawn_blocking(move || {
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        let result = match llm::list_models_for_provider(&provider, &storage, &http) {
            Ok(result) => result,
            Err(error) => llm::models_error_result(error),
        };
        llm::log_llm_diagnostic(
            "rust_command_returned",
            &[
                ("command", "list_llm_models".to_string()),
                ("status", result.status.clone()),
                ("modelsCount", result.models.len().to_string()),
            ],
        );
        result
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())
}

#[tauri::command]
pub async fn test_llm_provider(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmConnectionTestResultDto, PublicCommandError> {
    let provider = state
        .with_store(|store| store.get_llm_provider_record(&provider_id))
        .map_err(command_error)?;
    llm::log_llm_diagnostic(
        "rust_command_entered",
        &[
            ("command", "test_llm_provider".to_string()),
            ("providerId", provider_id.clone()),
            ("providerType", provider.provider_type.clone()),
            ("baseUrl", llm::diagnostic_url(&provider.base_url)),
            ("modelsEndpoint", provider.models_endpoint.clone()),
        ],
    );
    let result = tauri::async_runtime::spawn_blocking(move || {
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        let result = match llm::test_provider_connection(&provider, &storage, &http) {
            Ok(result) => result,
            Err(error) => llm::connection_error_result(&provider, error),
        };
        llm::log_llm_diagnostic(
            "rust_command_returned",
            &[
                ("command", "test_llm_provider".to_string()),
                ("status", result.status.clone()),
                ("modelsCount", result.models.len().to_string()),
                ("chatOk", result.chat_ok.to_string()),
                ("embeddingsOk", result.embeddings_ok.to_string()),
            ],
        );
        result
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())?;
    state
        .with_store(|store| store.update_llm_provider_status(&provider_id, &result))
        .map_err(command_error)?;
    Ok(result)
}

#[tauri::command]
pub fn list_notes(
    query: Option<String>,
    include_archived: bool,
    state: State<'_, AppState>,
) -> Result<Vec<NoteDto>, PublicCommandError> {
    state
        .with_store(|store| store.list_notes(query, include_archived))
        .map_err(command_error)
}

#[tauri::command]
pub fn get_note(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<NoteDto, PublicCommandError> {
    state
        .with_store(|store| store.get_note(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn search_notes(
    request: search::SearchNotesRequest,
    state: State<'_, AppState>,
) -> Result<Vec<search::SearchNoteResultDto>, PublicCommandError> {
    state
        .with_store(|store| store.search_notes(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn rebuild_search_index(
    state: State<'_, AppState>,
) -> Result<search::RebuildSearchIndexResultDto, PublicCommandError> {
    state
        .with_store(DataStore::rebuild_knowledge_search_index)
        .map_err(command_error)
}

#[tauri::command]
pub fn get_knowledge_documents(
    request: search::KnowledgeDocumentsRequest,
    state: State<'_, AppState>,
) -> Result<Vec<search::KnowledgeDocumentDto>, PublicCommandError> {
    state
        .with_store(|store| store.get_knowledge_documents(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn get_knowledge_document_by_note_id(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<search::KnowledgeDocumentDto, PublicCommandError> {
    state
        .with_store(|store| store.get_knowledge_document_by_note_id(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn sync_knowledge_chunks_for_note(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<i64, PublicCommandError> {
    state
        .with_store(|store| knowledge::sync_note(&mut store.conn, &note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn get_knowledge_index_status(
    state: State<'_, AppState>,
) -> Result<knowledge::KnowledgeIndexStatusDto, PublicCommandError> {
    state
        .with_store(|store| knowledge::index_status(&store.conn))
        .map_err(command_error)
}

#[tauri::command]
pub fn get_knowledge_chunks_by_note_id(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<knowledge::KnowledgeChunkDto>, PublicCommandError> {
    state
        .with_store(|store| knowledge::get_chunks_by_note_id(&store.conn, &note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn get_knowledge_chunks_by_note_ids(
    request: knowledge::KnowledgeChunksByNoteIdsRequest,
    state: State<'_, AppState>,
) -> Result<Vec<knowledge::KnowledgeChunkDto>, PublicCommandError> {
    state
        .with_store(|store| knowledge::get_chunks_by_note_ids(&store.conn, &request))
        .map_err(command_error)
}

#[tauri::command]
pub fn get_neighbor_knowledge_chunks(
    request: knowledge::KnowledgeChunkNeighborsRequest,
    state: State<'_, AppState>,
) -> Result<Vec<knowledge::KnowledgeChunkDto>, PublicCommandError> {
    state
        .with_store(|store| knowledge::get_neighbor_chunks(&store.conn, &request))
        .map_err(command_error)
}

#[tauri::command]
pub fn get_knowledge_chunk_state(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<Option<knowledge::KnowledgeChunkStateDto>, PublicCommandError> {
    state
        .with_store(|store| knowledge::get_state(&store.conn, &note_id))
        .map_err(command_error)
}

#[tauri::command]
pub async fn reconcile_knowledge_chunks(
    state: State<'_, AppState>,
) -> Result<knowledge::RebuildKnowledgeChunksResultDto, PublicCommandError> {
    let database_path = state
        .with_store(|store| Ok(store.base_dir.join(DATABASE_FILE)))
        .map_err(command_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = open_background_connection(&database_path)?;
        knowledge::reconcile(&mut conn)
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())?
    .map_err(command_error)
}

#[tauri::command]
pub async fn rebuild_knowledge_chunks(
    state: State<'_, AppState>,
) -> Result<knowledge::RebuildKnowledgeChunksResultDto, PublicCommandError> {
    let database_path = state
        .with_store(|store| Ok(store.base_dir.join(DATABASE_FILE)))
        .map_err(command_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = open_background_connection(&database_path)?;
        knowledge::rebuild(&mut conn)
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())?
    .map_err(command_error)
}

#[tauri::command]
pub fn list_embedding_profiles(
    state: State<'_, AppState>,
) -> Result<Vec<embedding::EmbeddingProfileDto>, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| embedding::list_profiles(&store.conn, &storage))
        .map_err(command_error)
}

#[tauri::command]
pub fn save_embedding_profile(
    request: embedding::SaveEmbeddingProfileRequest,
    state: State<'_, AppState>,
) -> Result<embedding::EmbeddingProfileDto, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| embedding::save_profile(&mut store.conn, &storage, request))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_embedding_profile(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| embedding::delete_profile(&mut store.conn, &storage, &profile_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn accept_embedding_cloud_consent(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<embedding::EmbeddingProfileDto, PublicCommandError> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| {
            embedding::grant_cloud_consent(&store.conn, &profile_id)?;
            embedding::list_profiles(&store.conn, &storage)?
                .into_iter()
                .find(|profile| profile.id == profile_id)
                .ok_or_else(|| {
                    DataError::NotFound("Настройки смыслового поиска (RAG) не найдены".to_string())
                })
        })
        .map_err(command_error)
}

#[tauri::command]
pub async fn test_embedding_provider(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<embedding::EmbeddingProviderTestResultDto, PublicCommandError> {
    let profile = state
        .with_store(|store| embedding::get_profile(&store.conn, &profile_id))
        .map_err(command_error)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        embedding::test_profile(&profile, &storage, &http)
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())?;
    state
        .with_store(|store| embedding::record_test_result(&mut store.conn, &profile_id, &result))
        .map_err(command_error)?;
    Ok(result)
}

#[tauri::command]
pub async fn list_embedding_models(
    request: embedding::EmbeddingModelListRequest,
    state: State<'_, AppState>,
) -> Result<embedding::EmbeddingModelListResultDto, PublicCommandError> {
    let has_draft_key = request
        .api_key
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    let saved_api_key = if has_draft_key {
        None
    } else if let Some(profile_id) = request.profile_id.as_deref() {
        state
            .with_store(|store| {
                let profile = embedding::get_profile(&store.conn, profile_id)?;
                let storage = llm::SystemSecretStorage;
                profile
                    .api_key_ref
                    .as_deref()
                    .map(|secret_ref| llm::SecretStorage::get_secret(&storage, secret_ref))
                    .transpose()
                    .map(Option::flatten)
            })
            .map_err(command_error)?
    } else {
        None
    };
    tauri::async_runtime::spawn_blocking(move || {
        let http = llm::CurlHttpClient;
        embedding::list_models(&request, saved_api_key.as_deref(), &http)
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())
}

#[tauri::command]
pub fn get_embedding_index_status(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<embedding::EmbeddingIndexStatusDto, PublicCommandError> {
    state
        .with_store(|store| embedding::get_index_status(&mut store.conn, &profile_id))
        .map_err(command_error)
}

async fn run_embedding_index_operation(
    profile_id: String,
    rebuild: bool,
    state: State<'_, AppState>,
) -> Result<embedding::EmbeddingIndexUpdateResultDto, PublicCommandError> {
    let (database_path, profile) = state
        .with_store(|store| {
            Ok((
                store.database_path(),
                embedding::get_profile(&store.conn, &profile_id)?,
            ))
        })
        .map_err(command_error)?;
    let cancel = state
        .begin_embedding_operation(&profile_id)
        .map_err(command_error)?;
    let operation_result = tauri::async_runtime::spawn_blocking(move || {
        let mut conn = open_background_connection(&database_path)?;
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        embedding::update_index(&mut conn, &profile, &storage, &http, cancel, rebuild)
    })
    .await;
    state.finish_embedding_operation(&profile_id);
    operation_result
        .map_err(|_| PublicCommandError::interrupted())?
        .map_err(command_error)
}

#[tauri::command]
pub async fn update_embedding_index(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<embedding::EmbeddingIndexUpdateResultDto, PublicCommandError> {
    run_embedding_index_operation(profile_id, false, state).await
}

#[tauri::command]
pub async fn rebuild_embedding_index(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<embedding::EmbeddingIndexUpdateResultDto, PublicCommandError> {
    run_embedding_index_operation(profile_id, true, state).await
}

#[tauri::command]
pub fn cancel_embedding_indexing(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<bool, PublicCommandError> {
    state
        .cancel_embedding_operation(&profile_id)
        .map_err(command_error)
}

#[tauri::command]
pub async fn semantic_search(
    request: embedding::SemanticSearchRequest,
    state: State<'_, AppState>,
) -> Result<Vec<embedding::SemanticSearchResultDto>, PublicCommandError> {
    let (database_path, profile) = state
        .with_store(|store| {
            Ok((
                store.database_path(),
                embedding::get_profile(&store.conn, &request.profile_id)?,
            ))
        })
        .map_err(command_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_background_connection(&database_path)?;
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        embedding::semantic_search(&conn, &profile, &storage, &http, &request)
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())?
    .map_err(command_error)
}

#[tauri::command]
pub async fn hybrid_search(
    request: embedding::SemanticSearchRequest,
    state: State<'_, AppState>,
) -> Result<Vec<embedding::SemanticSearchResultDto>, PublicCommandError> {
    let (database_path, profile) = state
        .with_store(|store| {
            Ok((
                store.database_path(),
                embedding::get_profile(&store.conn, &request.profile_id)?,
            ))
        })
        .map_err(command_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open_background_connection(&database_path)?;
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        embedding::hybrid_search(&conn, &profile, &storage, &http, &request)
    })
    .await
    .map_err(|_| PublicCommandError::interrupted())?
    .map_err(command_error)
}

#[tauri::command]
pub fn create_note(
    request: CreateNoteRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, PersistenceCommandError> {
    state
        .with_store(|store| store.create_note(request))
        .map_err(PersistenceCommandError::from)
}

#[tauri::command]
pub fn update_note_content(
    request: UpdateNoteContentRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, PersistenceCommandError> {
    state
        .with_store(|store| store.update_note_content(request))
        .map_err(PersistenceCommandError::from)
}

#[tauri::command]
pub fn restore_note_revision(
    request: RestoreNoteRevisionRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, PersistenceCommandError> {
    state
        .with_store(|store| store.restore_note_revision(request))
        .map_err(PersistenceCommandError::from)
}

#[tauri::command]
pub fn rename_note(
    request: RenameNoteRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, PublicCommandError> {
    state
        .with_store(|store| store.rename_note(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn set_note_tag(
    request: SetNoteTagRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, PublicCommandError> {
    state
        .with_store(|store| store.set_note_tag(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn duplicate_note(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<NoteDto, PersistenceCommandError> {
    state
        .with_store(|store| store.duplicate_note(&note_id))
        .map_err(PersistenceCommandError::from)
}

#[tauri::command]
pub fn toggle_note_pin(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<NoteDto, PublicCommandError> {
    state
        .with_store(|store| store.toggle_note_pin(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn move_note_to_project(
    request: MoveNoteRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, PublicCommandError> {
    state
        .with_store(|store| store.move_note_to_project(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn archive_note(note_id: String, state: State<'_, AppState>) -> Result<(), PublicCommandError> {
    state
        .with_store(|store| store.archive_note(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn restore_note(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<NoteDto, PublicCommandError> {
    state
        .with_store(|store| store.restore_note(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_note(note_id: String, state: State<'_, AppState>) -> Result<(), PublicCommandError> {
    state
        .with_store(|store| store.delete_note(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_note_permanently(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    state
        .with_store(|store| store.delete_note_permanently(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_projects(
    include_archived: bool,
    state: State<'_, AppState>,
) -> Result<Vec<ProjectCardDto>, PublicCommandError> {
    state
        .with_store(|store| store.list_projects(include_archived))
        .map_err(command_error)
}

#[tauri::command]
pub fn create_project(
    request: CreateProjectRequest,
    state: State<'_, AppState>,
) -> Result<ProjectCardDto, PublicCommandError> {
    state
        .with_store(|store| store.create_project(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn update_project(
    request: UpdateProjectRequest,
    state: State<'_, AppState>,
) -> Result<ProjectCardDto, PublicCommandError> {
    state
        .with_store(|store| store.update_project(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn archive_project(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    state
        .with_store(|store| store.archive_project(&project_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn get_first_run_state(
    state: State<'_, AppState>,
) -> Result<FirstRunStateDto, PublicCommandError> {
    state
        .with_store(|store| {
            store
                .first_run_required()
                .map(|required| FirstRunStateDto { required })
        })
        .map_err(command_error)
}

#[tauri::command]
pub fn complete_first_run(
    request: CompleteFirstRunRequest,
    state: State<'_, AppState>,
) -> Result<FirstRunCompletionDto, PublicCommandError> {
    state
        .with_store(|store| store.complete_first_run(request))
        .map_err(command_error)
}

#[tauri::command]
pub async fn import_markdown(
    request: ImportMarkdownRequest,
    state: State<'_, AppState>,
) -> Result<ImportMarkdownResultDto, PublicCommandError> {
    with_store_blocking(Arc::clone(&state.store), move |store| {
        store.import_markdown(request)
    })
    .await
    .map_err(command_error)
}

#[tauri::command]
pub fn list_tags(
    query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, PublicCommandError> {
    state
        .with_store(|store| store.list_tags(query))
        .map_err(command_error)
}

#[tauri::command]
pub fn create_tag(
    request: CreateTagRequest,
    state: State<'_, AppState>,
) -> Result<TagRowDto, PublicCommandError> {
    state
        .with_store(|store| store.create_tag(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn update_tag(
    request: UpdateTagRequest,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, PublicCommandError> {
    state
        .with_store(|store| store.update_tag(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn rename_tag(
    request: RenameTagRequest,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, PublicCommandError> {
    state
        .with_store(|store| store.rename_tag(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn update_tag_color(
    request: UpdateTagColorRequest,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, PublicCommandError> {
    state
        .with_store(|store| store.update_tag_color(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_tag(
    tag_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, PublicCommandError> {
    state
        .with_store(|store| store.delete_tag(&tag_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn merge_tags(
    request: MergeTagsRequest,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, PublicCommandError> {
    state
        .with_store(|store| store.merge_tags(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_archive(
    query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ArchiveItemDto>, PublicCommandError> {
    state
        .with_store(|store| store.list_archive(query))
        .map_err(command_error)
}

#[tauri::command]
pub fn restore_archive_item(
    item_id: String,
    kind: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    state
        .with_store(|store| store.restore_archive_item(&item_id, &kind))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_archive_item(
    item_id: String,
    kind: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    state
        .with_store(|store| store.delete_archive_item(&item_id, &kind))
        .map_err(command_error)
}

#[tauri::command]
pub fn store_attachment(
    request: StoreAttachmentRequest,
    state: State<'_, AppState>,
) -> Result<AttachmentStoreResultDto, PublicCommandError> {
    state
        .with_store(|store| store.store_attachment(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn store_attachment_from_path(
    request: StoreAttachmentPathRequest,
    state: State<'_, AppState>,
) -> Result<AttachmentStoreResultDto, PublicCommandError> {
    state
        .with_store(|store| store.store_attachment_from_path(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn open_attachment(
    attachment_id: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    let path = state
        .with_store(|store| store.resolve_attachment_path(&attachment_id))
        .map_err(command_error)?;
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|_| command_error(DataError::State("Не удалось открыть вложение".to_string())))
}

#[tauri::command]
pub fn reveal_attachment(
    attachment_id: String,
    state: State<'_, AppState>,
) -> Result<(), PublicCommandError> {
    let path = state
        .with_store(|store| store.resolve_attachment_path(&attachment_id))
        .map_err(command_error)?;
    tauri_plugin_opener::reveal_item_in_dir(path)
        .map_err(|_| command_error(DataError::State("Не удалось показать вложение".to_string())))
}

#[tauri::command]
pub fn export_note_markdown(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<ExportResultDto, PublicCommandError> {
    state
        .with_store(|store| store.export_note_markdown(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn export_note_zip(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<ExportResultDto, PublicCommandError> {
    state
        .with_store(|store| store.export_note_zip(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn export_project_zip(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<ExportResultDto, PublicCommandError> {
    state
        .with_store(|store| store.export_project_zip(&project_id))
        .map_err(command_error)
}

#[tauri::command]
pub async fn create_backup(
    state: State<'_, AppState>,
) -> Result<ExportResultDto, PublicCommandError> {
    with_store_blocking(Arc::clone(&state.store), |store| store.create_backup())
        .await
        .map_err(backup_command_error)
}

#[tauri::command]
pub async fn create_backup_at_path(
    path: String,
    state: State<'_, AppState>,
) -> Result<ExportResultDto, PublicCommandError> {
    with_store_blocking(Arc::clone(&state.store), move |store| {
        store.create_backup_at_path(Path::new(&path))
    })
    .await
    .map_err(backup_command_error)
}

#[tauri::command]
pub async fn preview_backup(
    request: ImportBackupRequest,
    state: State<'_, AppState>,
) -> Result<BackupPreviewDto, PublicCommandError> {
    with_store_blocking(Arc::clone(&state.store), move |store| {
        store.preview_backup(&request)
    })
    .await
    .map_err(backup_command_error)
}

#[tauri::command]
pub async fn import_backup(
    request: ImportBackupRequest,
    state: State<'_, AppState>,
) -> Result<ImportBackupResultDto, PublicCommandError> {
    with_store_blocking(Arc::clone(&state.store), move |store| {
        store.import_backup(request)
    })
    .await
    .map_err(backup_command_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::SecretStorage;
    use sha2::{Digest, Sha256};

    fn temp_store() -> DataStore {
        let dir = std::env::temp_dir().join(format!("noteflow-test-{}", Uuid::new_v4()));
        let mut store = DataStore::open(dir).expect("store opens");
        store.seed_demo_data_if_needed().expect("seed test fixture");
        store
    }

    fn temp_store_dir() -> PathBuf {
        std::env::temp_dir().join(format!("noteflow-test-{}", Uuid::new_v4()))
    }

    #[test]
    fn public_errors_never_expose_database_paths_or_provider_bodies() {
        let database = command_error(DataError::Sql(rusqlite::Error::InvalidPath(PathBuf::from(
            "C:/Users/private/database.sqlite",
        ))));
        assert_eq!(database.code, "DATABASE_FAILED");
        assert!(!database.message.contains("private"));

        for (raw, expected_code) in [
            ("401 Unauthorized Bearer sk-secret", "PROVIDER_UNAUTHORIZED"),
            ("Timeout with prompt text", "PROVIDER_TIMEOUT"),
            ("429 rate limit with source text", "PROVIDER_RATE_LIMITED"),
            ("500: raw provider response", "PROVIDER_UNAVAILABLE"),
            ("Некорректный ответ модели", "INVALID_PROVIDER_RESPONSE"),
        ] {
            let mapped = command_error(DataError::InvalidInput(raw.to_string()));
            assert_eq!(mapped.code, expected_code);
            assert!(!mapped.message.contains("sk-secret"));
            assert!(!mapped.message.contains("prompt text"));
            assert!(!mapped.message.contains("source text"));
            assert!(!mapped.message.contains("raw provider response"));
        }
    }

    fn create_v6_database_with_notes(dir: &Path) {
        ensure_storage_dirs(dir).expect("storage dirs");
        let mut conn = Connection::open(dir.join(DATABASE_FILE)).expect("open sqlite");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );",
        )
        .expect("schema migrations table");

        for migration in migrations()
            .into_iter()
            .filter(|migration| migration.version <= 6)
        {
            let transaction = conn.transaction().expect("migration transaction");
            transaction
                .execute_batch(migration.sql)
                .expect("apply pre-sidecar migration");
            transaction
                .execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                    params![migration.version, migration.name, now_iso()],
                )
                .expect("record migration");
            transaction.commit().expect("commit migration");
        }

        let now = now_iso();
        conn.execute(
            "INSERT INTO notes (
                id, title, note_date, content_json, content_markdown, content_html, plain_text,
                project_id, is_favorite, is_pinned, pinned_at, icon, icon_key, created_at, updated_at, archived_at, deleted_at
             ) VALUES (?1, ?2, '2026-06-18', ?3, ?4, ?5, ?6, NULL, 0, 0, NULL, 'doc', NULL, ?7, ?7, NULL, NULL)",
            params![
                "v6-note-preserved",
                "V6 preserved markdown",
                document_from_text("legacy preserved json").to_string(),
                "Существующий **Markdown**".to_string(),
                "<p>legacy preserved json</p>".to_string(),
                "legacy preserved json".to_string(),
                now
            ],
        )
        .expect("insert preserved v6 note");
        conn.execute(
            "INSERT INTO notes (
                id, title, note_date, content_json, content_markdown, content_html, plain_text,
                project_id, is_favorite, is_pinned, pinned_at, icon, icon_key, created_at, updated_at, archived_at, deleted_at
             ) VALUES (?1, ?2, '2026-06-18', ?3, '', ?4, ?5, NULL, 0, 0, NULL, 'doc', NULL, ?6, ?6, NULL, NULL)",
            params![
                "v6-note-fallback",
                "V6 fallback markdown",
                document_from_text("legacy fallback json").to_string(),
                "<p>fallback marker text</p>".to_string(),
                "fallback marker text".to_string(),
                now
            ],
        )
        .expect("insert fallback v6 note");
    }

    fn note_sidecar_payload(store: &DataStore, note_id: &str, kind: &str) -> Value {
        let payload_json: String = store
            .conn
            .query_row(
                "SELECT payload_json FROM note_content_sidecars WHERE note_id = ?1 AND kind = ?2",
                params![note_id, kind],
                |row| row.get(0),
            )
            .expect("note sidecar payload exists");
        serde_json::from_str(&payload_json).expect("payload is json")
    }

    fn sidecar_count_for_note(store: &DataStore, note_id: &str) -> i64 {
        store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM note_content_sidecars WHERE note_id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .expect("count sidecars")
    }

    fn old_backup_without_sidecars_bytes() -> Vec<u8> {
        let note_json = document_from_text("old backup text");
        let backup_json = json!({
            "version": 2,
            "exportedAt": now_iso(),
            "projects": [],
            "tags": [],
            "notes": [{
                "id": "old-backup-note",
                "title": "Old backup note",
                "note_date": "2026-06-18",
                "content_json": note_json,
                "content_markdown": "old backup markdown",
                "content_html": "<p>old backup text</p>",
                "plain_text": "old backup text",
                "project_id": null,
                "is_favorite": false,
                "is_pinned": false,
                "pinned_at": null,
                "icon": "doc",
                "icon_key": null,
                "created_at": now_iso(),
                "updated_at": now_iso(),
                "archived_at": null,
                "deleted_at": null
            }],
            "noteTags": [],
            "attachments": [],
            "llmProviders": [],
            "appSettings": []
        })
        .to_string();
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("noteflow-backup.json", zip_options())
            .expect("start backup json");
        std::io::copy(&mut Cursor::new(backup_json.into_bytes()), &mut zip)
            .expect("write backup json");
        zip.finish().expect("finish zip").into_inner()
    }

    fn backup_bytes_from_value(manifest: &Value, files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file(BACKUP_MANIFEST_NAME, zip_options())
            .expect("start backup manifest");
        zip.write_all(manifest.to_string().as_bytes())
            .expect("write backup manifest");
        for (name, bytes) in files {
            zip.start_file(*name, zip_options())
                .expect("start backup entry");
            zip.write_all(bytes).expect("write backup entry");
        }
        zip.finish().expect("finish backup zip").into_inner()
    }

    fn backup_value_from_bytes(bytes: &[u8]) -> Value {
        let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("backup opens");
        let mut manifest = String::new();
        archive
            .by_name(BACKUP_MANIFEST_NAME)
            .expect("manifest exists")
            .read_to_string(&mut manifest)
            .expect("read manifest");
        serde_json::from_str(&manifest).expect("manifest json")
    }

    fn backup_bytes_for_store(store: &DataStore) -> Vec<u8> {
        let backup = store.create_backup().expect("create backup");
        fs::read(backup.path).expect("read backup")
    }

    fn create_note_with_content(store: &mut DataStore, title: &str, content: &str) -> NoteDto {
        let note = store
            .create_note(CreateNoteRequest {
                title: title.to_string(),
                note_date: "2026-08-28".to_string(),
            })
            .expect("create note");
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: note.content_version,
                content_json: document_from_text(content),
                content_markdown: content.to_string(),
                content_html: format!("<p>{content}</p>"),
                content_sidecars: vec![],
                plain_text: content.to_string(),
            })
            .expect("save note")
    }

    fn markdown_import_input(title: &str, markdown: &str) -> ImportMarkdownNoteInput {
        ImportMarkdownNoteInput {
            title: title.to_string(),
            content_json: document_from_text(markdown),
            content_markdown: markdown.to_string(),
            content_html: format!("<p>{markdown}</p>"),
            plain_text: markdown.to_string(),
            content_sidecars: vec![],
        }
    }

    #[test]
    fn clean_profile_starts_without_demo_and_first_run_persists() {
        let dir = temp_store_dir();
        let mut store = DataStore::open(dir.clone()).expect("open clean profile");
        assert!(store.first_run_required().expect("first run state"));
        assert!(store.list_notes(None, false).expect("notes").is_empty());
        assert!(store.list_projects(false).expect("projects").is_empty());

        let completion = store
            .complete_first_run(CompleteFirstRunRequest {
                profile_name: "Рубен".to_string(),
            })
            .expect("complete first run");
        assert_eq!(completion.note.title, "Первая заметка");
        assert_eq!(completion.settings.local_profile_name, "Рубен");
        let note_id = completion.note.id;
        drop(store);

        let reopened = DataStore::open(dir).expect("reopen profile");
        assert!(!reopened.first_run_required().expect("first run state"));
        assert_eq!(
            reopened
                .get_ui_settings()
                .expect("settings")
                .local_profile_name,
            "Рубен"
        );
        assert_eq!(reopened.list_notes(None, false).expect("notes").len(), 1);
        assert_eq!(
            reopened.get_note(&note_id).expect("first note").title,
            "Первая заметка"
        );
    }

    #[test]
    fn first_run_failure_rolls_back_note_and_settings() {
        let mut store = DataStore::open(temp_store_dir()).expect("open clean profile");
        store
            .conn
            .execute_batch(
                "CREATE TEMP TRIGGER fail_first_run BEFORE INSERT ON app_settings
             WHEN NEW.key = 'onboarding.completed.v1'
             BEGIN SELECT RAISE(ABORT, 'first run fault'); END;",
            )
            .expect("install fault");
        assert!(store
            .complete_first_run(CompleteFirstRunRequest {
                profile_name: "Тест".to_string(),
            })
            .is_err());
        assert!(store.first_run_required().expect("first run state"));
        assert!(store.list_notes(None, false).expect("notes").is_empty());
        assert_ne!(
            store
                .get_ui_settings()
                .expect("settings")
                .local_profile_name,
            "Тест"
        );
    }

    #[test]
    fn project_edit_archive_restore_preserves_note_relationship_after_reopen() {
        let dir = temp_store_dir();
        let mut store = DataStore::open(dir.clone()).expect("open profile");
        let project = store
            .create_project(CreateProjectRequest {
                title: "Проект".to_string(),
                description: "Начало".to_string(),
            })
            .expect("create project");
        let note = create_note_with_content(&mut store, "Связанная", "Текст проекта");
        store
            .move_note_to_project(MoveNoteRequest {
                note_id: note.id.clone(),
                project_title: project.title.clone(),
            })
            .expect("move note");
        let updated = store
            .update_project(UpdateProjectRequest {
                project_id: project.id.clone(),
                title: "Переименован".to_string(),
                description: "Новое описание".to_string(),
            })
            .expect("update project");
        assert_eq!(updated.description, "Новое описание");
        assert_eq!(
            store.get_note(&note.id).expect("note").project_id,
            Some(project.id.clone())
        );
        store.archive_project(&project.id).expect("archive project");
        assert!(!store
            .list_projects(false)
            .expect("active projects")
            .iter()
            .any(|p| p.id == project.id));
        assert!(store
            .list_archive(None)
            .expect("archive")
            .iter()
            .any(|p| p.id == project.id));
        assert_eq!(
            store.get_note(&note.id).expect("note preserved").project_id,
            Some(project.id.clone())
        );
        store
            .restore_archive_item(&project.id, "Проект")
            .expect("restore project");
        drop(store);

        let reopened = DataStore::open(dir).expect("reopen profile");
        let restored = reopened
            .list_projects(false)
            .expect("projects")
            .into_iter()
            .find(|p| p.id == project.id)
            .expect("restored project");
        assert_eq!(restored.title, "Переименован");
        assert_eq!(restored.status, "active");
        assert_eq!(restored.notes, 1);
        assert_eq!(
            reopened.get_note(&note.id).expect("linked note").project_id,
            Some(project.id)
        );
    }

    #[test]
    fn markdown_batch_import_keeps_duplicates_distinct_and_persists() {
        let dir = temp_store_dir();
        let mut store = DataStore::open(dir.clone()).expect("open profile");
        let existing = create_note_with_content(&mut store, "Одинаковая", "Старый текст");
        let result = store
            .import_markdown(ImportMarkdownRequest {
                notes: vec![
                    markdown_import_input("Одинаковая", "# Русский заголовок\n\nПривет 😊"),
                    markdown_import_input("Одинаковая", ""),
                ],
            })
            .expect("import batch");
        assert_eq!(result.notes.len(), 2);
        assert_ne!(result.notes[0].id, result.notes[1].id);
        assert_ne!(result.notes[0].id, existing.id);
        assert_eq!(
            store
                .get_note(&existing.id)
                .expect("existing note")
                .content_markdown,
            "Старый текст"
        );
        let ids: Vec<_> = result.notes.iter().map(|note| note.id.clone()).collect();
        drop(store);

        let reopened = DataStore::open(dir).expect("reopen profile");
        assert_eq!(
            reopened
                .get_note(&ids[0])
                .expect("imported note")
                .content_markdown,
            "# Русский заголовок\n\nПривет 😊"
        );
        assert_eq!(
            reopened
                .get_note(&ids[1])
                .expect("empty note")
                .content_markdown,
            ""
        );
        assert_eq!(
            reopened
                .get_note(&existing.id)
                .expect("original note")
                .content_markdown,
            "Старый текст"
        );
    }

    #[test]
    fn markdown_batch_import_rolls_back_all_notes_on_sidecar_failure() {
        let mut store = DataStore::open(temp_store_dir()).expect("open profile");
        store
            .conn
            .execute_batch(
                "CREATE TEMP TRIGGER fail_second_import BEFORE INSERT ON note_content_sidecars
             WHEN (SELECT COUNT(*) FROM notes) = 2
             BEGIN SELECT RAISE(ABORT, 'sidecar fault'); END;",
            )
            .expect("install fault");
        assert!(store
            .import_markdown(ImportMarkdownRequest {
                notes: vec![
                    markdown_import_input("A", "one"),
                    markdown_import_input("B", "two")
                ],
            })
            .is_err());
        assert!(store.list_notes(None, false).expect("notes").is_empty());
        assert!(store.list_projects(false).expect("projects").is_empty());
    }

    fn remove_newer_backup_fields(manifest: &mut Value, version: u32) {
        let object = manifest.as_object_mut().expect("manifest object");
        object.insert("version".to_string(), json!(version));
        object.remove("appVersion");
        object.remove("aiChats");
        object.remove("aiMessages");
        if let Some(revisions) = object
            .get_mut("noteRevisions")
            .and_then(Value::as_array_mut)
        {
            for revision in revisions {
                if let Some(revision) = revision.as_object_mut() {
                    revision.remove("snapshot_hash");
                    revision.remove("revision_kind");
                }
            }
        }
        if version < 4 {
            object.remove("embeddingProfiles");
        }
        if version < 3 {
            object.remove("noteRevisions");
            object.remove("noteContentSidecars");
            object.remove("noteRevisionSidecars");
        }
        if version < 2 {
            object.remove("llmProviders");
        }
    }

    #[test]
    fn migrations_seed_only_once() {
        let mut store = temp_store();
        let first_count: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("count notes");
        store.seed_demo_data_if_needed().expect("seed idempotent");
        let second_count: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("count notes again");

        assert_eq!(first_count, second_count);
        assert!(first_count > 0);
    }

    #[test]
    fn real_database_copy_migrates_when_test_directory_is_provided() {
        let Some(copy_dir) = std::env::var_os("NOTEFLOW_REAL_DB_COPY_DIR") else {
            return;
        };
        let store = DataStore::open(PathBuf::from(copy_dir)).expect("real database copy migrates");
        let migration_applied: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = 8 AND name = 'search_foundation_fts5'",
                [],
                |row| row.get(0),
            )
            .expect("search migration recorded");
        let note_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )
            .expect("count source notes");
        let index_count: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM note_search_fts", [], |row| row.get(0))
            .expect("count indexed notes");
        assert_eq!(migration_applied, 1);
        assert_eq!(index_count, note_count);
        let asset_migration_applied: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations
                 WHERE version = 14 AND name = 'canonical_asset_storage'",
                [],
                |row| row.get(0),
            )
            .expect("asset migration recorded");
        let legacy_payloads: i64 = store
            .conn
            .query_row(
                "SELECT
                    (SELECT COUNT(*) FROM notes WHERE content_json LIKE '%data:image/%'
                        OR content_markdown LIKE '%data:image/%' OR content_html LIKE '%data:image/%')
                  + (SELECT COUNT(*) FROM note_revisions WHERE content_json LIKE '%data:image/%'
                        OR content_markdown LIKE '%data:image/%' OR content_html LIKE '%data:image/%')
                  + (SELECT COUNT(*) FROM note_content_sidecars WHERE payload_json LIKE '%data:image/%')
                  + (SELECT COUNT(*) FROM note_revision_sidecars WHERE payload_json LIKE '%data:image/%')",
                [],
                |row| row.get(0),
            )
            .expect("legacy payload count");
        let unmigrated_attachments: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM attachments WHERE blob_id IS NULL",
                [],
                |row| row.get(0),
            )
            .expect("unmigrated attachments");
        assert_eq!(asset_migration_applied, 1);
        assert_eq!(legacy_payloads, 0);
        assert_eq!(unmigrated_attachments, 0);
    }

    #[test]
    fn markdown_first_sidecar_migration_preserves_legacy_content() {
        let dir = temp_store_dir();
        create_v6_database_with_notes(&dir);

        let store = DataStore::open(dir).expect("store upgrades to v7");
        let note_sidecar_table_exists: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'note_content_sidecars'",
                [],
                |row| row.get(0),
            )
            .expect("note sidecar table exists");
        let revision_sidecar_table_exists: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'note_revision_sidecars'",
                [],
                |row| row.get(0),
            )
            .expect("revision sidecar table exists");
        assert_eq!(note_sidecar_table_exists, 1);
        assert_eq!(revision_sidecar_table_exists, 1);
        let search_migration_applied: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = 8 AND name = 'search_foundation_fts5'",
                [],
                |row| row.get(0),
            )
            .expect("search migration recorded");
        let indexed_legacy_notes: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM note_search_fts", [], |row| row.get(0))
            .expect("legacy notes backfilled");
        let current_note_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )
            .expect("current note count");
        assert_eq!(search_migration_applied, 1);
        assert_eq!(indexed_legacy_notes, current_note_count);

        let preserved_markdown: String = store
            .conn
            .query_row(
                "SELECT content_markdown FROM notes WHERE id = 'v6-note-preserved'",
                [],
                |row| row.get(0),
            )
            .expect("preserved markdown");
        let fallback_markdown: String = store
            .conn
            .query_row(
                "SELECT content_markdown FROM notes WHERE id = 'v6-note-fallback'",
                [],
                |row| row.get(0),
            )
            .expect("fallback markdown");

        assert_eq!(preserved_markdown, "Существующий **Markdown**");
        assert_eq!(fallback_markdown, "fallback marker text");
        assert_eq!(
            note_sidecar_payload(&store, "v6-note-preserved", LEGACY_TIPTAP_SIDECAR_KIND),
            document_from_text("legacy preserved json")
        );
        assert_eq!(
            note_sidecar_payload(&store, "v6-note-fallback", LEGACY_TIPTAP_SIDECAR_KIND),
            document_from_text("legacy fallback json")
        );

        let search_results = store
            .list_notes(Some("fallback marker".to_string()), false)
            .expect("search migrated note");
        assert!(search_results
            .iter()
            .any(|note| note.id == "v6-note-fallback"));
    }

    #[test]
    fn note_sidecars_duplicate_and_cascade_delete_work() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Sidecar source".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create note");
        let updated = store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 0,
                content_json: document_from_text("sidecar source text"),
                content_markdown: "sidecar source text".to_string(),
                content_html: "<p>sidecar source text</p>".to_string(),
                content_sidecars: vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({
                        "version": 1,
                        "images": [],
                        "fileAttachments": [],
                        "detailsBlocks": [],
                        "callouts": [],
                        "blocks": [],
                        "textMarks": []
                    }),
                }],
                plain_text: "sidecar source text".to_string(),
            })
            .expect("save note");
        let duplicate = store.duplicate_note(&updated.id).expect("duplicate note");

        assert_eq!(
            note_sidecar_payload(&store, &updated.id, "editor_node_attrs_v1"),
            json!({
                "version": 1,
                "images": [],
                "fileAttachments": [],
                "detailsBlocks": [],
                "callouts": [],
                "blocks": [],
                "textMarks": []
            })
        );
        assert_eq!(
            note_sidecar_payload(&store, &duplicate.id, LEGACY_TIPTAP_SIDECAR_KIND),
            document_from_text("sidecar source text")
        );
        assert_eq!(
            note_sidecar_payload(&store, &duplicate.id, "editor_node_attrs_v1"),
            json!({
                "version": 1,
                "images": [],
                "fileAttachments": [],
                "detailsBlocks": [],
                "callouts": [],
                "blocks": [],
                "textMarks": []
            })
        );

        store
            .delete_note_permanently(&duplicate.id)
            .expect("delete duplicate permanently");
        assert_eq!(sidecar_count_for_note(&store, &duplicate.id), 0);
    }

    #[test]
    fn note_revisions_snapshot_sidecars() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Revision sidecar".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create note");
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 0,
                content_json: document_from_text("first revision text"),
                content_markdown: "first revision text".to_string(),
                content_html: "<p>first revision text</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "first revision text".to_string(),
            })
            .expect("first save");
        force_revision_due(&store, &note.id);
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 1,
                content_json: document_from_text("second revision text"),
                content_markdown: "second revision text".to_string(),
                content_html: "<p>second revision text</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "second revision text".to_string(),
            })
            .expect("second save");

        let revision_payload: String = store
            .conn
            .query_row(
                "SELECT nrs.payload_json
                 FROM note_revision_sidecars nrs
                 INNER JOIN note_revisions nr ON nr.id = nrs.revision_id
                 WHERE nr.note_id = ?1
                   AND nr.plain_text = 'first revision text'
                   AND nrs.kind = ?2",
                params![note.id, LEGACY_TIPTAP_SIDECAR_KIND],
                |row| row.get(0),
            )
            .expect("revision sidecar exists");

        assert_eq!(
            serde_json::from_str::<Value>(&revision_payload).expect("payload json"),
            document_from_text("first revision text")
        );
    }

    #[test]
    fn restoring_revision_updates_search_and_sidecar_atomically() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Revision search".to_string(),
                note_date: "2026-07-11".to_string(),
            })
            .expect("create note");
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 0,
                content_json: document_from_text("first searchable revision"),
                content_markdown: "first searchable revision".to_string(),
                content_html: "<p>first searchable revision</p>".to_string(),
                content_sidecars: vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "revision": "first" }),
                }],
                plain_text: "first searchable revision".to_string(),
            })
            .expect("save first revision");
        force_revision_due(&store, &note.id);
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 1,
                content_json: document_from_text("second searchable revision"),
                content_markdown: "second searchable revision".to_string(),
                content_html: "<p>second searchable revision</p>".to_string(),
                content_sidecars: vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "revision": "second" }),
                }],
                plain_text: "second searchable revision".to_string(),
            })
            .expect("save second revision");
        let first_revision_id: String = store
            .conn
            .query_row(
                "SELECT id FROM note_revisions WHERE note_id = ?1 AND plain_text = ?2",
                params![note.id, "first searchable revision"],
                |row| row.get(0),
            )
            .expect("first revision id");

        let restored = store
            .restore_note_revision(RestoreNoteRevisionRequest {
                note_id: note.id.clone(),
                revision_id: first_revision_id,
                expected_content_version: 2,
            })
            .expect("restore revision");
        assert_eq!(restored.content_markdown, "first searchable revision");
        assert_eq!(restored.plain_text, "first searchable revision");
        assert_eq!(
            note_sidecar_payload(&store, &note.id, "editor_node_attrs_v1"),
            json!({ "revision": "first" })
        );

        let first_results = store
            .search_notes(search::SearchNotesRequest {
                query: "first searchable".to_string(),
                project_id: None,
                tag_id: None,
                include_archived: false,
                favorites_only: false,
                limit: 50,
                offset: 0,
            })
            .expect("search restored revision");
        assert_eq!(first_results[0].note_id, note.id);
        let second_results = store
            .search_notes(search::SearchNotesRequest {
                query: "second searchable".to_string(),
                project_id: None,
                tag_id: None,
                include_archived: false,
                favorites_only: false,
                limit: 50,
                offset: 0,
            })
            .expect("search stale revision");
        assert!(second_results.is_empty());
    }

    #[test]
    fn ui_settings_are_stored_in_app_settings_and_persist() {
        let dir = std::env::temp_dir().join(format!("noteflow-test-{}", Uuid::new_v4()));
        {
            let mut store = DataStore::open(dir.clone()).expect("store opens");
            let saved = store
                .update_ui_settings(UiSettingsDto {
                    theme: "dark".to_string(),
                    app_zoom_percent: 127,
                    sidebar_width: 999,
                    list_width: 120,
                    chat_width: 481,
                    sidebar_collapsed: true,
                    rag_conversation_width: 301,
                    rag_sources_width: 1000,
                    rag_sources_collapsed: true,
                    last_section: "rag".to_string(),
                    language: "en".to_string(),
                    local_profile_name: "  Рубен   Локальный  ".to_string(),
                    editor_content_width: 2000,
                    editor_content_offset: -900,
                })
                .expect("save ui settings");

            assert_eq!(saved.theme, "dark");
            assert_eq!(saved.app_zoom_percent, 125);
            assert_eq!(saved.local_profile_name, "Рубен Локальный");
            assert_eq!(saved.sidebar_width, 360);
            assert_eq!(saved.list_width, 260);
            assert_eq!(saved.rag_sources_width, 460);
            assert_eq!(saved.editor_content_width, 1440);
            assert_eq!(saved.editor_content_offset, -720);

            let persisted_key: String = store
                .conn
                .query_row(
                    "SELECT key FROM app_settings WHERE key = ?1",
                    params![UI_SETTINGS_KEY],
                    |row| row.get(0),
                )
                .expect("ui settings key exists");
            assert_eq!(persisted_key, UI_SETTINGS_KEY);
        }

        let reopened_store = DataStore::open(dir).expect("store reopens");
        let settings = reopened_store.get_ui_settings().expect("load ui settings");
        assert_eq!(settings.theme, "dark");
        assert_eq!(settings.app_zoom_percent, 125);
        assert_eq!(settings.local_profile_name, "Рубен Локальный");
        assert!(settings.sidebar_collapsed);
        assert!(settings.rag_sources_collapsed);
        assert_eq!(settings.last_section, "rag");
        assert_eq!(settings.language, "en");
        assert_eq!(settings.editor_content_width, 1440);
        assert_eq!(settings.editor_content_offset, -720);
    }

    #[test]
    fn note_ai_privacy_consent_is_stored_in_app_settings() {
        let dir = std::env::temp_dir().join(format!("noteflow-test-{}", Uuid::new_v4()));
        {
            let mut store = DataStore::open(dir.clone()).expect("store opens");
            assert!(!store
                .get_note_ai_privacy_accepted("external")
                .expect("privacy setting reads"));
            store
                .accept_note_ai_privacy("external")
                .expect("privacy accepted");
            assert!(store
                .get_note_ai_privacy_accepted("external")
                .expect("privacy setting reads"));

            let stored_key: String = store
                .conn
                .query_row(
                    "SELECT key FROM app_settings WHERE key = ?1",
                    params![NOTE_AI_PRIVACY_EXTERNAL_KEY],
                    |row| row.get(0),
                )
                .expect("privacy key exists");
            assert_eq!(stored_key, NOTE_AI_PRIVACY_EXTERNAL_KEY);
        }

        let reopened_store = DataStore::open(dir).expect("store reopens");
        assert!(reopened_store
            .get_note_ai_privacy_accepted("external")
            .expect("privacy persisted"));
    }

    #[test]
    fn note_ai_status_uses_default_provider_and_privacy_setting() {
        let mut store = temp_store();
        let storage = llm::MemorySecretStorage::default();
        let provider = store
            .save_llm_provider(
                &storage,
                llm::SaveLlmProviderRequest {
                    provider_type: "ollama".to_string(),
                    base_url: "http://localhost:11434".to_string(),
                    api_key: None,
                    chat_model: "qwen3-4b-local:latest".to_string(),
                    embedding_model: String::new(),
                    models_endpoint: "/api/tags".to_string(),
                    chat_endpoint: "/api/generate".to_string(),
                    embeddings_endpoint: "/api/embeddings".to_string(),
                    is_default: true,
                    ..llm_provider_request(None, "Ollama local", None)
                },
            )
            .expect("save provider");
        assert!(provider.is_default);

        let pending_status = store.note_ai_status(&storage).expect("status reads");
        assert!(pending_status.has_provider);
        assert!(!pending_status.privacy_accepted);
        assert!(!pending_status.can_use);

        store
            .accept_note_ai_privacy("local")
            .expect("privacy accepted");
        let ready_status = store.note_ai_status(&storage).expect("status reads again");
        assert!(ready_status.privacy_accepted);
        assert!(ready_status.can_use);
        assert_eq!(ready_status.model.as_deref(), Some("qwen3-4b-local:latest"));
    }

    #[test]
    fn note_chat_history_is_lazy_scoped_and_persistent() {
        let dir = std::env::temp_dir().join(format!("noteflow-test-{}", Uuid::new_v4()));
        let (note_a_id, note_b_id) = {
            let mut store = DataStore::open(dir.clone()).expect("store opens");
            let note_a = store
                .create_note(CreateNoteRequest {
                    title: "AI chat note A".to_string(),
                    note_date: "2026-06-18".to_string(),
                })
                .expect("create note A");
            let note_b = store
                .create_note(CreateNoteRequest {
                    title: "AI chat note B".to_string(),
                    note_date: "2026-06-18".to_string(),
                })
                .expect("create note B");

            assert!(store
                .list_note_chat_messages(&note_a.id)
                .expect("empty history reads")
                .is_empty());
            let chat_count_before: i64 = store
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM ai_chats WHERE scope = 'note'",
                    [],
                    |row| row.get(0),
                )
                .expect("count note chats");
            assert_eq!(chat_count_before, 0);

            store
                .save_note_chat_message(SaveNoteChatMessageRequest {
                    note_id: note_a.id.clone(),
                    role: "user".to_string(),
                    content: "Explain this note".to_string(),
                })
                .expect("save note A user message");
            store
                .save_note_chat_message(SaveNoteChatMessageRequest {
                    note_id: note_a.id.clone(),
                    role: "assistant".to_string(),
                    content: "**Summary**\n\n- item".to_string(),
                })
                .expect("save note A assistant message");
            store
                .save_note_chat_message(SaveNoteChatMessageRequest {
                    note_id: note_b.id.clone(),
                    role: "user".to_string(),
                    content: "Different note question".to_string(),
                })
                .expect("save note B user message");

            let note_a_history = store
                .list_note_chat_messages(&note_a.id)
                .expect("note A history loads");
            let note_b_history = store
                .list_note_chat_messages(&note_b.id)
                .expect("note B history loads");

            assert_eq!(note_a_history.len(), 2);
            assert_eq!(note_b_history.len(), 1);
            assert!(note_a_history
                .iter()
                .all(|message| message.note_id == note_a.id));
            assert!(note_b_history
                .iter()
                .all(|message| message.note_id == note_b.id));
            assert_eq!(note_a_history[0].role, "user");
            assert_eq!(note_a_history[1].role, "assistant");
            assert_eq!(note_a_history[1].content, "**Summary**\n\n- item");

            (note_a.id, note_b.id)
        };

        let reopened_store = DataStore::open(dir).expect("store reopens");
        let note_a_history = reopened_store
            .list_note_chat_messages(&note_a_id)
            .expect("persisted note A history loads");
        let note_b_history = reopened_store
            .list_note_chat_messages(&note_b_id)
            .expect("persisted note B history loads");

        assert_eq!(note_a_history.len(), 2);
        assert_eq!(note_b_history.len(), 1);
        assert!(note_a_history
            .iter()
            .all(|message| message.note_id == note_a_id));
        assert!(note_b_history
            .iter()
            .all(|message| message.note_id == note_b_id));
    }

    #[test]
    fn chat_messages_with_equal_timestamps_keep_insertion_order() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Stable chat order".to_string(),
                note_date: "2026-09-01".to_string(),
            })
            .expect("create note");

        store
            .save_note_chat_message(SaveNoteChatMessageRequest {
                note_id: note.id.clone(),
                role: "user".to_string(),
                content: "First message".to_string(),
            })
            .expect("save first message");
        store
            .save_note_chat_message(SaveNoteChatMessageRequest {
                note_id: note.id.clone(),
                role: "assistant".to_string(),
                content: "Second message".to_string(),
            })
            .expect("save second message");

        store
            .conn
            .execute(
                "UPDATE ai_messages
                 SET created_at = '2026-09-01T12:00:00.000Z',
                     id = CASE role WHEN 'user' THEN 'z-first' ELSE 'a-second' END
                 WHERE chat_id = (
                     SELECT id FROM ai_chats WHERE scope = 'note' AND note_id = ?1
                 )",
                params![note.id],
            )
            .expect("force equal timestamps and reverse lexical IDs");

        let messages = store
            .list_note_chat_messages(&note.id)
            .expect("ordered history loads");
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content, "First message");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content, "Second message");
    }

    #[test]
    fn note_chat_history_handles_archived_deleted_and_missing_notes() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "AI chat archived note".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create note");
        store
            .save_note_chat_message(SaveNoteChatMessageRequest {
                note_id: note.id.clone(),
                role: "assistant".to_string(),
                content: "Archived notes still load chat history".to_string(),
            })
            .expect("save message");

        store.archive_note(&note.id).expect("archive note");
        assert_eq!(
            store
                .list_note_chat_messages(&note.id)
                .expect("archived note history loads")
                .len(),
            1
        );

        store.delete_note(&note.id).expect("soft delete note");
        assert!(store
            .list_note_chat_messages(&note.id)
            .expect("deleted note history does not break")
            .is_empty());
        assert!(store
            .list_note_chat_messages("missing-note-id")
            .expect("missing note history does not break")
            .is_empty());
        assert!(store
            .save_note_chat_message(SaveNoteChatMessageRequest {
                note_id: "missing-note-id".to_string(),
                role: "user".to_string(),
                content: "hello".to_string(),
            })
            .is_err());
    }

    #[test]
    fn rag_chat_crud_history_and_sources_persist_without_parallel_tables() {
        let dir = std::env::temp_dir().join(format!("noteflow-test-{}", Uuid::new_v4()));
        let chat_id = {
            let mut store = DataStore::open(dir.clone()).expect("store opens");
            let chat = store
                .create_rag_chat(CreateRagChatRequest {
                    title: Some("Новый чат".to_string()),
                })
                .expect("chat created");
            store
                .rename_rag_chat(RenameRagChatRequest {
                    chat_id: chat.id.clone(),
                    title: "Архитектура RAG".to_string(),
                })
                .expect("chat renamed");
            store
                .save_rag_chat_message(SaveRagChatMessageRequest {
                    chat_id: chat.id.clone(),
                    role: "user".to_string(),
                    content: "Что записано про RAG?".to_string(),
                    sources: json!([]),
                })
                .expect("user message saved");
            store
                .save_rag_chat_message(SaveRagChatMessageRequest {
                    chat_id: chat.id.clone(),
                    role: "assistant".to_string(),
                    content: "Найдены релевантные источники.".to_string(),
                    sources: json!([{"noteId":"note-1","chunkId":"chunk-1"}]),
                })
                .expect("assistant message saved");

            let chats = store.list_rag_chats().expect("chats listed");
            let messages = store
                .list_rag_chat_messages(&chat.id)
                .expect("messages listed");
            assert_eq!(chats.len(), 1);
            assert_eq!(chats[0].title, "Архитектура RAG");
            assert_eq!(messages.len(), 2);
            assert_eq!(messages[1].sources[0]["noteId"], "note-1");
            let table_count: i64 = store
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master
                     WHERE type = 'table' AND name IN ('ai_chats', 'ai_messages')",
                    [],
                    |row| row.get(0),
                )
                .expect("shared chat tables exist");
            assert_eq!(table_count, 2);
            chat.id
        };

        let mut reopened = DataStore::open(dir).expect("store reopens");
        assert_eq!(reopened.list_rag_chats().expect("chats persist").len(), 1);
        assert_eq!(
            reopened
                .list_rag_chat_messages(&chat_id)
                .expect("messages persist")
                .len(),
            2
        );
        reopened.delete_rag_chat(&chat_id).expect("chat deleted");
        assert!(reopened
            .list_rag_chat_messages(&chat_id)
            .expect("messages cascade")
            .is_empty());
    }

    fn llm_provider_request(
        id: Option<String>,
        name: &str,
        api_key: Option<&str>,
    ) -> llm::SaveLlmProviderRequest {
        llm::SaveLlmProviderRequest {
            id,
            name: name.to_string(),
            provider_type: "openai".to_string(),
            base_url: "https://api.example.com/v1".to_string(),
            api_key: api_key.map(str::to_string),
            delete_api_key: false,
            chat_model: "gpt-test".to_string(),
            embedding_model: "embed-test".to_string(),
            models_endpoint: "/models".to_string(),
            chat_endpoint: "/chat/completions".to_string(),
            embeddings_endpoint: "/embeddings".to_string(),
            timeout_ms: 120000,
            context_size: 16384,
            temperature: 0.3,
            streaming_enabled: true,
            custom_headers_json: "{}".to_string(),
            is_default: true,
        }
    }

    #[test]
    fn llm_provider_crud_default_and_key_storage_work() {
        let mut store = temp_store();
        let storage = llm::MemorySecretStorage::default();
        let saved = store
            .save_llm_provider(
                &storage,
                llm_provider_request(None, "Рабочий OpenAI-compatible", Some("sk-test-secret")),
            )
            .expect("save provider");

        assert!(saved.has_api_key);
        assert!(saved.is_default);

        let persisted_secret_ref: Option<String> = store
            .conn
            .query_row(
                "SELECT api_key_ref FROM llm_providers WHERE id = ?1",
                params![saved.id],
                |row| row.get(0),
            )
            .expect("read secret ref");
        assert!(persisted_secret_ref
            .as_deref()
            .is_some_and(|secret_ref| secret_ref.starts_with("noteflow.llm.")));
        assert_ne!(persisted_secret_ref.as_deref(), Some("sk-test-secret"));
        assert_eq!(
            storage
                .get_secret(persisted_secret_ref.as_deref().unwrap())
                .expect("secret from storage")
                .as_deref(),
            Some("sk-test-secret")
        );

        let second = store
            .save_llm_provider(
                &storage,
                llm::SaveLlmProviderRequest {
                    provider_type: "ollama".to_string(),
                    base_url: "http://localhost:11434".to_string(),
                    api_key: None,
                    chat_model: "qwen3:8b".to_string(),
                    embedding_model: String::new(),
                    models_endpoint: "/api/tags".to_string(),
                    chat_endpoint: "/api/generate".to_string(),
                    embeddings_endpoint: "/api/embeddings".to_string(),
                    is_default: true,
                    ..llm_provider_request(None, "Ollama локально", None)
                },
            )
            .expect("save second provider");
        let first_after_default = store
            .list_llm_providers(&storage)
            .expect("list providers")
            .into_iter()
            .find(|provider| provider.id == saved.id)
            .expect("first provider exists");
        assert!(second.is_default);
        assert!(!first_after_default.is_default);

        let without_key = store
            .delete_llm_provider_key(&storage, &saved.id)
            .expect("delete key");
        assert!(!without_key.has_api_key);
        assert_eq!(
            storage
                .get_secret(persisted_secret_ref.as_deref().unwrap())
                .expect("secret removed"),
            None
        );
    }

    #[test]
    fn llm_provider_status_update_after_delete_does_not_recreate_provider() {
        let mut store = temp_store();
        let storage = llm::MemorySecretStorage::default();
        let saved = store
            .save_llm_provider(
                &storage,
                llm_provider_request(None, "Temporary provider", None),
            )
            .expect("save provider");

        store
            .delete_llm_provider(&storage, &saved.id)
            .expect("delete provider");
        store
            .update_llm_provider_status(
                &saved.id,
                &llm::LlmConnectionTestResultDto {
                    status: "success".to_string(),
                    message: "stale result".to_string(),
                    checked_at: now_iso(),
                    models: vec!["stale-model".to_string()],
                    chat_ok: true,
                    embeddings_ok: false,
                    is_local: true,
                },
            )
            .expect("stale status update is harmless");

        let providers = store
            .list_llm_providers(&storage)
            .expect("providers list reads");
        assert!(providers.iter().all(|provider| provider.id != saved.id));
        assert!(store.get_llm_provider_record(&saved.id).is_err());
    }

    #[test]
    fn llm_provider_rejects_invalid_url() {
        let mut store = temp_store();
        let storage = llm::MemorySecretStorage::default();
        let error = store
            .save_llm_provider(
                &storage,
                llm::SaveLlmProviderRequest {
                    base_url: "ftp://api.example.com".to_string(),
                    ..llm_provider_request(None, "Bad provider", None)
                },
            )
            .expect_err("invalid url rejected");

        assert!(error.to_string().contains("корректный адрес модели"));
    }

    #[test]
    fn llm_provider_backup_excludes_api_keys_and_secret_refs() {
        let mut store = temp_store();
        let storage = llm::MemorySecretStorage::default();
        store
            .save_llm_provider(
                &storage,
                llm_provider_request(None, "Backup provider", Some("sk-backup-secret")),
            )
            .expect("save provider");

        let backup = store.create_backup().expect("create backup");
        let bytes = fs::read(backup.path).expect("read backup");
        let reader = Cursor::new(bytes);
        let mut archive = ZipArchive::new(reader).expect("backup zip opens");
        let mut backup_json = String::new();
        archive
            .by_name("noteflow-backup.json")
            .expect("backup json exists")
            .read_to_string(&mut backup_json)
            .expect("read backup json");

        assert!(backup_json.contains("Backup provider"));
        assert!(!backup_json.contains("sk-backup-secret"));
        assert!(!backup_json.contains("api_key_ref"));
        assert!(!backup_json.contains("apiKeyRef"));
    }

    #[test]
    fn notes_projects_and_tags_crud_work() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Новая заметка".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create note");
        let updated = store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 0,
                content_json: document_from_text("Текст"),
                content_markdown: "Текст".to_string(),
                content_html: "<p>Текст</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "Текст".to_string(),
            })
            .expect("update note");
        let project = store
            .create_project(CreateProjectRequest {
                title: "Проект теста".to_string(),
                description: "Описание".to_string(),
            })
            .expect("create project");
        let moved = store
            .move_note_to_project(MoveNoteRequest {
                note_id: updated.id.clone(),
                project_title: project.title.clone(),
            })
            .expect("move note");
        let tag = store
            .create_tag(CreateTagRequest {
                name: "тест".to_string(),
                color: "purple".to_string(),
                custom_color: None,
            })
            .expect("create tag");

        assert_eq!(updated.plain_text, "Текст");
        assert_eq!(moved.project, "Проект теста");
        assert_eq!(tag.name, "тест");
    }

    #[test]
    fn tag_name_and_curated_color_create_update_and_persist_together() {
        let mut store = temp_store();
        let dir = store.base_dir.clone();
        let created = store
            .create_tag(CreateTagRequest {
                name: "  Важные   идеи  ".to_string(),
                color: "blue".to_string(),
                custom_color: Some("#3b6ef2".to_string()),
            })
            .expect("create tag with explicit color");
        assert_eq!(created.name, "Важные идеи");
        assert_eq!(created.color, "blue");
        assert_eq!(created.custom_color.as_deref(), Some("#3B6EF2"));

        let updated = store
            .update_tag(UpdateTagRequest {
                tag_id: created.id.clone(),
                name: "Проекты".to_string(),
                color: "purple".to_string(),
                custom_color: Some("#7c5cf0".to_string()),
            })
            .expect("update name and color");
        let updated_tag = updated
            .into_iter()
            .find(|tag| tag.id == created.id)
            .expect("updated tag remains available");
        assert_eq!(updated_tag.name, "Проекты");
        assert_eq!(updated_tag.color, "purple");
        assert_eq!(updated_tag.custom_color.as_deref(), Some("#7C5CF0"));

        drop(store);
        let reopened = DataStore::open(dir).expect("store reopens");
        let persisted = reopened
            .list_tags(None)
            .expect("list persisted tags")
            .into_iter()
            .find(|tag| tag.id == created.id)
            .expect("tag persists after restart");
        assert_eq!(persisted.name, "Проекты");
        assert_eq!(persisted.custom_color.as_deref(), Some("#7C5CF0"));
    }

    #[test]
    fn note_tag_assignment_changes_only_the_link_and_persists() {
        let mut store = temp_store();
        let dir = store.base_dir.clone();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Заметка".to_string(),
                note_date: "2026-09-22".to_string(),
            })
            .expect("note");
        let tag = store
            .create_tag(CreateTagRequest {
                name: "Проверка".to_string(),
                color: "green".to_string(),
                custom_color: None,
            })
            .expect("tag");
        let assigned = store
            .set_note_tag(SetNoteTagRequest {
                note_id: note.id.clone(),
                tag_id: tag.id.clone(),
                assigned: true,
            })
            .expect("assign");
        assert!(assigned.tags.iter().any(|item| item.id == tag.id));
        drop(store);
        let mut reopened = DataStore::open(dir).expect("reopen");
        assert!(reopened
            .get_note(&note.id)
            .expect("persisted note")
            .tags
            .iter()
            .any(|item| item.id == tag.id));
        let unassigned = reopened
            .set_note_tag(SetNoteTagRequest {
                note_id: note.id.clone(),
                tag_id: tag.id.clone(),
                assigned: false,
            })
            .expect("remove link");
        assert!(!unassigned.tags.iter().any(|item| item.id == tag.id));
        assert!(reopened
            .list_tags(None)
            .expect("global tags")
            .iter()
            .any(|item| item.id == tag.id));
    }

    #[test]
    fn tag_create_and_update_reject_duplicates_and_invalid_colors_without_partial_changes() {
        let mut store = temp_store();
        let original = store
            .create_tag(CreateTagRequest {
                name: "Smoke Работа".to_string(),
                color: "blue".to_string(),
                custom_color: Some("#3B6EF2".to_string()),
            })
            .expect("create original tag");
        let second = store
            .create_tag(CreateTagRequest {
                name: "Личное smoke".to_string(),
                color: "green".to_string(),
                custom_color: Some("#1EA463".to_string()),
            })
            .expect("create second tag");

        assert!(matches!(
            store.create_tag(CreateTagRequest {
                name: " smoke работа ".to_string(),
                color: "pink".to_string(),
                custom_color: Some("#E05272".to_string()),
            }),
            Err(DataError::InvalidInput(_))
        ));
        assert!(matches!(
            store.update_tag(UpdateTagRequest {
                tag_id: second.id.clone(),
                name: original.name.clone(),
                color: "purple".to_string(),
                custom_color: Some("#7C5CF0".to_string()),
            }),
            Err(DataError::InvalidInput(_))
        ));
        assert!(matches!(
            store.update_tag(UpdateTagRequest {
                tag_id: second.id.clone(),
                name: "Личное smoke".to_string(),
                color: "purple".to_string(),
                custom_color: Some("not-a-color".to_string()),
            }),
            Err(DataError::InvalidInput(_))
        ));

        let persisted = store
            .list_tags(None)
            .expect("list tags after rejected writes");
        assert!(persisted.len() >= 2);
        let unchanged = persisted
            .into_iter()
            .find(|tag| tag.id == second.id)
            .expect("second tag remains");
        assert_eq!(unchanged.name, "Личное smoke");
        assert_eq!(unchanged.custom_color.as_deref(), Some("#1EA463"));
    }

    #[test]
    fn note_pinning_crud_and_sorting_work() {
        let mut store = temp_store();
        let pinned_columns: Vec<String> = store
            .conn
            .prepare("PRAGMA table_info(notes)")
            .expect("prepare notes schema")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("read notes schema")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect notes schema");
        assert!(pinned_columns.iter().any(|column| column == "is_pinned"));
        assert!(pinned_columns.iter().any(|column| column == "pinned_at"));

        let ordinary = store
            .create_note(CreateNoteRequest {
                title: "pin-test ordinary".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create ordinary note");
        let selected = store
            .create_note(CreateNoteRequest {
                title: "pin-test selected".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create selected note");

        let pinned = store
            .toggle_note_pin(&ordinary.id)
            .expect("pin ordinary note");
        let filtered = store
            .list_notes(Some("pin-test".to_string()), false)
            .expect("list filtered notes");

        assert!(pinned.is_pinned);
        assert!(pinned.pinned_at.is_some());
        let persisted_pin_state = store
            .conn
            .query_row(
                "SELECT is_pinned, pinned_at FROM notes WHERE id = ?1",
                params![ordinary.id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .expect("read persisted pin state");
        assert_eq!(persisted_pin_state.0, 1);
        assert!(persisted_pin_state.1.is_some());
        assert_eq!(
            filtered.first().map(|note| note.id.as_str()),
            Some(ordinary.id.as_str())
        );
        assert!(filtered.iter().any(|note| note.id == selected.id));

        let unpinned = store
            .toggle_note_pin(&ordinary.id)
            .expect("unpin ordinary note");
        assert!(!unpinned.is_pinned);
        assert!(unpinned.pinned_at.is_none());
        let persisted_unpin_state = store
            .conn
            .query_row(
                "SELECT is_pinned, pinned_at FROM notes WHERE id = ?1",
                params![ordinary.id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .expect("read persisted unpin state");
        assert_eq!(persisted_unpin_state, (0, None));
    }

    #[test]
    fn note_pinning_persists_after_reopen() {
        let dir = std::env::temp_dir().join(format!("noteflow-test-{}", Uuid::new_v4()));
        let note_id = {
            let mut store = DataStore::open(dir.clone()).expect("store opens");
            let note = store
                .create_note(CreateNoteRequest {
                    title: "pin-test persisted".to_string(),
                    note_date: "2026-06-18".to_string(),
                })
                .expect("create note");
            store.toggle_note_pin(&note.id).expect("pin note");
            note.id
        };

        let reopened_store = DataStore::open(dir).expect("store reopens");
        let notes = reopened_store
            .list_notes(Some("pin-test persisted".to_string()), false)
            .expect("list persisted note");
        let persisted_note = notes
            .into_iter()
            .find(|note| note.id == note_id)
            .expect("persisted note exists");

        assert!(persisted_note.is_pinned);
        assert!(persisted_note.pinned_at.is_some());
    }

    #[test]
    fn search_uses_persisted_content() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "FTS проверка".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create note");
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 0,
                content_json: document_from_text("уникальный маркер"),
                content_markdown: "уникальный маркер".to_string(),
                content_html: "<p>уникальный маркер</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "уникальный маркер".to_string(),
            })
            .expect("update note");

        let results = store
            .list_notes(Some("уникальный".to_string()), false)
            .expect("search notes");

        assert!(results.iter().any(|item| item.id == note.id));
    }

    #[test]
    fn attachments_are_written_under_managed_storage() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "С файлом".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create note");
        let stored = store
            .store_attachment(StoreAttachmentRequest {
                note_id: note.id,
                kind: "file".to_string(),
                original_name: "../unsafe.txt".to_string(),
                mime_type: "text/plain".to_string(),
                original_attachment_id: None,
                edit_metadata: None,
                bytes: b"hello".to_vec(),
            })
            .expect("store attachment");
        let path = store
            .resolve_storage_path(&stored.attachment.storage_rel_path)
            .expect("safe path");

        assert!(path.exists());
        assert!(!stored.attachment.storage_rel_path.contains(".."));
    }

    #[test]
    fn attachment_path_resolves_only_existing_managed_files() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Открытие вложения".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create note");
        let stored = store
            .store_attachment(StoreAttachmentRequest {
                note_id: note.id,
                kind: "file".to_string(),
                original_name: "brief.txt".to_string(),
                mime_type: "text/plain".to_string(),
                original_attachment_id: None,
                edit_metadata: None,
                bytes: b"hello".to_vec(),
            })
            .expect("store attachment");

        let resolved = store
            .resolve_attachment_path(&stored.attachment.id)
            .expect("resolve attachment path");
        assert!(Path::new(&resolved).is_file());

        let blob_id = stored.attachment.blob_id.as_deref().expect("blob id");
        let (blob_path, _) =
            assets::resolve_blob_path(&store.conn, &store.base_dir, blob_id).expect("resolve blob");
        fs::remove_file(&blob_path).expect("remove attachment blob");
        let error = store
            .resolve_attachment_path(&stored.attachment.id)
            .expect_err("missing attachment must fail");
        assert!(error.to_string().contains("Managed asset недоступен"));
    }

    #[test]
    fn backup_can_be_imported_into_fresh_store() {
        let mut store = temp_store();
        let pinned_note = store
            .create_note(CreateNoteRequest {
                title: "backup pinned note".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create pinned note");
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: pinned_note.id.clone(),
                expected_content_version: 0,
                content_json: document_from_text("backup sidecar text"),
                content_markdown: "backup sidecar text".to_string(),
                content_html: "<p>backup sidecar text</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "backup sidecar text".to_string(),
            })
            .expect("save note content");
        store
            .toggle_note_pin(&pinned_note.id)
            .expect("pin note for backup");
        let backup = store.create_backup().expect("create backup");
        let bytes = fs::read(backup.path).expect("read backup");
        let mut imported_store = temp_store();
        let snapshot = imported_store
            .import_backup(ImportBackupRequest {
                file_name: "backup.zip".to_string(),
                bytes,
            })
            .expect("import backup");

        assert!(!snapshot.workspace.notes.is_empty());
        assert!(!snapshot.workspace.projects.is_empty());
        assert!(!snapshot.workspace.tags.is_empty());
        assert!(snapshot
            .workspace
            .notes
            .iter()
            .any(|note| note.title == "backup pinned note" && note.is_pinned));
        let imported_note = snapshot
            .workspace
            .notes
            .iter()
            .find(|note| note.title == "backup pinned note")
            .expect("imported note exists");
        assert!(imported_note
            .content_sidecars
            .iter()
            .any(|sidecar| sidecar.kind == LEGACY_TIPTAP_SIDECAR_KIND));
        assert_eq!(
            note_sidecar_payload(
                &imported_store,
                &imported_note.id,
                LEGACY_TIPTAP_SIDECAR_KIND
            ),
            document_from_text("backup sidecar text")
        );
        let search_results = imported_store
            .search_notes(search::SearchNotesRequest {
                query: "backup sidecar".to_string(),
                project_id: None,
                tag_id: None,
                include_archived: false,
                favorites_only: false,
                limit: 50,
                offset: 0,
            })
            .expect("imported search index rebuilt");
        assert_eq!(search_results[0].note_id, imported_note.id);
    }

    #[test]
    fn external_backup_roundtrip_survives_reopen() {
        let mut source = temp_store();
        let note = create_note_with_content(&mut source, "Внешняя копия", "# Привет\n\nТекст");
        let destination_dir =
            std::env::temp_dir().join(format!("noteflow-export-{}", Uuid::new_v4()));
        fs::create_dir(&destination_dir).expect("external directory");
        let path = destination_dir.join("NoteFlow-backup.zip");
        let result = source
            .create_backup_at_path(&path)
            .expect("external backup");
        assert_eq!(result.path, path.to_string_lossy());
        assert!(result.relative_path.ends_with(".zip"));
        let bytes = fs::read(&path).expect("external archive");
        let validated = validate_backup_archive(&bytes).expect("v6 archive validates");
        assert_eq!(validated.data.version, CURRENT_BACKUP_VERSION);
        let updated = source
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: note.content_version,
                content_json: document_from_text("Обновлённый текст"),
                content_markdown: "Обновлённый текст".to_string(),
                content_html: "<p>Обновлённый текст</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "Обновлённый текст".to_string(),
            })
            .expect("update before overwrite");
        source
            .create_backup_at_path(&path)
            .expect("replace existing archive");
        let replaced_bytes = fs::read(&path).expect("replaced archive");
        assert_ne!(replaced_bytes, bytes);
        assert_eq!(
            source
                .get_note(&updated.id)
                .expect("updated note")
                .content_markdown,
            "Обновлённый текст"
        );
        let mut target = temp_store();
        let target_dir = target.base_dir.clone();
        target
            .import_backup(ImportBackupRequest {
                file_name: "NoteFlow-backup.zip".to_string(),
                bytes: replaced_bytes,
            })
            .expect("restore external backup");
        drop(target);
        let reopened = DataStore::open(target_dir).expect("reopen restored profile");
        assert_eq!(
            reopened
                .get_note(&note.id)
                .expect("restored note")
                .content_markdown,
            "Обновлённый текст"
        );
        fs::remove_dir_all(destination_dir).expect("remove external test directory");
    }

    #[test]
    fn external_backup_rejects_invalid_destination_without_creating_archive() {
        let store = temp_store();
        let directory = std::env::temp_dir().join(format!("noteflow-export-{}", Uuid::new_v4()));
        fs::create_dir(&directory).expect("external directory");
        let invalid_extension = directory.join("backup.txt");
        assert!(store.create_backup_at_path(&invalid_extension).is_err());
        assert!(!invalid_extension.exists());
        let missing_parent = directory.join("missing").join("backup.zip");
        assert!(store.create_backup_at_path(&missing_parent).is_err());
        assert!(!missing_parent.exists());
        fs::remove_dir_all(directory).expect("remove external test directory");
    }

    #[test]
    fn failed_external_backup_preserves_previous_archive_and_cleans_temp_file() {
        let mut store = temp_store();
        let directory = std::env::temp_dir().join(format!("noteflow-export-{}", Uuid::new_v4()));
        fs::create_dir(&directory).expect("external directory");
        let path = directory.join("backup.zip");
        store.create_backup_at_path(&path).expect("previous backup");
        let previous_bytes = fs::read(&path).expect("previous archive");
        let note = store
            .create_note(CreateNoteRequest {
                title: "Missing asset".to_string(),
                note_date: "2026-09-27".to_string(),
            })
            .expect("note");
        let attached = store
            .store_attachment(StoreAttachmentRequest {
                note_id: note.id,
                kind: "file".to_string(),
                original_name: "asset.txt".to_string(),
                mime_type: "text/plain".to_string(),
                original_attachment_id: None,
                edit_metadata: None,
                bytes: b"asset".to_vec(),
            })
            .expect("attachment");
        let blob_id = attached.attachment.blob_id.as_deref().expect("blob id");
        let (blob_path, _) =
            assets::resolve_blob_path(&store.conn, &store.base_dir, blob_id).expect("blob path");
        fs::remove_file(blob_path).expect("simulate missing asset");
        assert!(store.create_backup_at_path(&path).is_err());
        assert_eq!(
            fs::read(&path).expect("previous archive intact"),
            previous_bytes
        );
        assert_eq!(
            fs::read_dir(&directory).expect("read export dir").count(),
            1
        );
        fs::remove_dir_all(directory).expect("remove external test directory");
    }

    #[test]
    fn backup_v5_revision_metadata_is_optional_and_imported_safely() {
        let mut source = temp_store();
        let note = source
            .create_note(CreateNoteRequest {
                title: "Revision backup".to_string(),
                note_date: "2026-08-29".to_string(),
            })
            .expect("create revision backup note");
        let first = source
            .update_note_content(persistence_request(
                &note.id,
                0,
                "Состояние для backup",
                document_from_text("Состояние для backup"),
                vec![],
            ))
            .expect("save revision backup baseline");
        force_revision_due(&source, &note.id);
        source
            .update_note_content(persistence_request(
                &note.id,
                first.content_version,
                "Новое состояние",
                document_from_text("Новое состояние"),
                vec![],
            ))
            .expect("create periodic revision for backup");

        let bytes = backup_bytes_for_store(&source);
        let manifest = backup_value_from_bytes(&bytes);
        let exported_revision = manifest["noteRevisions"]
            .as_array()
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| item["note_id"].as_str() == Some(note.id.as_str()))
            })
            .expect("exported revision metadata");
        assert_eq!(exported_revision["revision_kind"], "periodic");
        assert_eq!(
            exported_revision["snapshot_hash"].as_str().map(str::len),
            Some(64)
        );

        let mut imported = temp_store();
        imported
            .import_backup(ImportBackupRequest {
                file_name: "revision-metadata.zip".to_string(),
                bytes,
            })
            .expect("import metadata-aware v5 backup");
        let imported_kind: String = imported
            .conn
            .query_row(
                "SELECT revision_kind FROM note_revisions WHERE note_id = ?1",
                params![note.id],
                |row| row.get(0),
            )
            .expect("periodic kind preserved");
        assert_eq!(imported_kind, "periodic");

        let mut legacy_manifest = manifest;
        for revision in legacy_manifest["noteRevisions"]
            .as_array_mut()
            .expect("legacy revision list")
        {
            let object = revision.as_object_mut().expect("legacy revision object");
            object.remove("snapshot_hash");
            object.remove("revision_kind");
        }
        let mut legacy_import = temp_store();
        legacy_import
            .import_backup(ImportBackupRequest {
                file_name: "legacy-v5.zip".to_string(),
                bytes: backup_bytes_from_value(&legacy_manifest, &[]),
            })
            .expect("import pre-P0.3 v5 backup");
        let legacy_kind: String = legacy_import
            .conn
            .query_row(
                "SELECT revision_kind FROM note_revisions WHERE note_id = ?1",
                params![note.id],
                |row| row.get(0),
            )
            .expect("legacy backup revision imported");
        assert_eq!(legacy_kind, "imported");
    }

    #[test]
    fn old_backup_without_sidecars_imports_without_creating_sidecars() {
        let mut store = temp_store();
        let snapshot = store
            .import_backup(ImportBackupRequest {
                file_name: "old-backup.zip".to_string(),
                bytes: old_backup_without_sidecars_bytes(),
            })
            .expect("old backup imports");
        let imported_note = snapshot
            .workspace
            .notes
            .iter()
            .find(|note| note.id == "old-backup-note")
            .expect("old backup note exists");

        assert_eq!(imported_note.content_markdown, "old backup markdown");
        assert!(imported_note.content_sidecars.is_empty());
        assert_eq!(sidecar_count_for_note(&store, "old-backup-note"), 0);
    }

    #[test]
    fn backup_v5_roundtrip_preserves_ai_and_rag_history_without_secrets_or_vectors() {
        let mut source = temp_store();
        let note = create_note_with_content(
            &mut source,
            "История backup",
            "Русский **Markdown** и emoji 🚀",
        );
        source
            .save_note_chat_message(SaveNoteChatMessageRequest {
                note_id: note.id.clone(),
                role: "user".to_string(),
                content: "Что важно?".to_string(),
            })
            .expect("save note user message");
        source
            .save_note_chat_message(SaveNoteChatMessageRequest {
                note_id: note.id.clone(),
                role: "assistant".to_string(),
                content: "Важно сохранить **Markdown** 🚀".to_string(),
            })
            .expect("save note assistant message");
        let rag_chat = source
            .create_rag_chat(CreateRagChatRequest {
                title: Some("База знаний".to_string()),
            })
            .expect("create rag chat");
        let sources = json!([{
            "chunkId": "historical-chunk",
            "noteId": note.id,
            "noteTitle": note.title,
            "headingPath": ["Раздел"],
            "snippet": "Русский Markdown",
            "project": "Входящие",
            "projectId": null,
            "tags": [],
            "archived": false,
            "favorite": false,
            "updatedAt": now_iso(),
            "semanticScore": 0.9,
            "matchType": "semantic",
            "neighboringChunkIds": []
        }]);
        source
            .save_rag_chat_message(SaveRagChatMessageRequest {
                chat_id: rag_chat.id.clone(),
                role: "assistant".to_string(),
                content: "Ответ по базе ✨".to_string(),
                sources: sources.clone(),
            })
            .expect("save rag message");
        let storage = llm::MemorySecretStorage::default();
        let provider = source
            .save_llm_provider(
                &storage,
                llm_provider_request(None, "Backup secure provider", Some("sk-never-export")),
            )
            .expect("save provider");
        source
            .conn
            .execute(
                "UPDATE llm_providers SET custom_headers_json = ?1 WHERE id = ?2",
                params![
                    json!({
                        "Authorization": "Bearer never-export",
                        "X-Workspace": "portable"
                    })
                    .to_string(),
                    provider.id
                ],
            )
            .expect("inject legacy unsafe header");
        source
            .conn
            .execute(
                "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)",
                params![
                    RESTORE_COMMIT_SETTING_KEY,
                    json!("internal-id").to_string(),
                    now_iso()
                ],
            )
            .expect("inject internal restore marker");

        let bytes = backup_bytes_for_store(&source);
        let manifest = backup_value_from_bytes(&bytes);
        let manifest_text = manifest.to_string();
        assert_eq!(manifest["version"], 6);
        assert!(manifest["assetBlobs"].is_array());
        assert_eq!(manifest["appVersion"], env!("CARGO_PKG_VERSION"));
        assert_eq!(manifest["aiChats"].as_array().map(Vec::len), Some(2));
        assert_eq!(manifest["aiMessages"].as_array().map(Vec::len), Some(3));
        assert!(manifest_text.contains("Важно сохранить **Markdown**"));
        assert!(manifest_text.contains("historical-chunk"));
        assert!(!manifest_text.contains("sk-never-export"));
        assert!(!manifest_text.contains("never-export"));
        assert!(!manifest_text.contains("Authorization"));
        assert!(!manifest_text.contains(RESTORE_COMMIT_SETTING_KEY));
        assert!(!manifest_text.contains("reasoning"));
        assert!(!manifest_text.contains("knowledge_chunk_embeddings"));

        let mut target = temp_store();
        let preview = target
            .preview_backup(&ImportBackupRequest {
                file_name: "history.zip".to_string(),
                bytes: bytes.clone(),
            })
            .expect("preview backup");
        assert!(preview.includes_ai_history);
        assert_eq!(preview.contents.note_ai_chats, 1);
        assert_eq!(preview.contents.rag_chats, 1);
        assert_eq!(preview.contents.messages, 3);
        let result = target
            .import_backup(ImportBackupRequest {
                file_name: "history.zip".to_string(),
                bytes,
            })
            .expect("restore backup");
        assert_eq!(result.contents.note_ai_chats, 1);
        assert_eq!(result.contents.rag_chats, 1);
        assert_eq!(result.contents.messages, 3);
        let note_messages = target
            .list_note_chat_messages(&note.id)
            .expect("list restored note chat");
        assert_eq!(note_messages.len(), 2);
        assert_eq!(note_messages[1].content, "Важно сохранить **Markdown** 🚀");
        let rag_messages = target
            .list_rag_chat_messages(&rag_chat.id)
            .expect("list restored rag messages");
        assert_eq!(rag_messages.len(), 1);
        assert_eq!(rag_messages[0].sources, sources);
        assert!(target
            .list_llm_providers(&storage)
            .expect("list imported providers")
            .iter()
            .all(|item| !item.has_api_key));
    }

    #[test]
    fn real_backup_versions_one_through_four_preserve_existing_compatible_chats() {
        for version in 1..=4 {
            let mut store = temp_store();
            let note = create_note_with_content(
                &mut store,
                &format!("Legacy backup v{version}"),
                "same note survives",
            );
            store
                .save_note_chat_message(SaveNoteChatMessageRequest {
                    note_id: note.id.clone(),
                    role: "assistant".to_string(),
                    content: format!("note history v{version}"),
                })
                .expect("save note history");
            let rag = store
                .create_rag_chat(CreateRagChatRequest {
                    title: Some(format!("RAG v{version}")),
                })
                .expect("create rag chat");
            store
                .save_rag_chat_message(SaveRagChatMessageRequest {
                    chat_id: rag.id.clone(),
                    role: "assistant".to_string(),
                    content: format!("rag history v{version}"),
                    sources: json!([]),
                })
                .expect("save rag history");
            let mut manifest =
                serde_json::to_value(store.collect_backup_data().expect("collect backup data"))
                    .expect("serialize backup");
            remove_newer_backup_fields(&mut manifest, version);
            let bytes = backup_bytes_from_value(&manifest, &[]);
            let preview = store
                .preview_backup(&ImportBackupRequest {
                    file_name: format!("v{version}.zip"),
                    bytes: bytes.clone(),
                })
                .expect("preview old backup");
            assert!(preview.preserves_existing_ai_history);
            assert!(!preview.includes_ai_history);
            let result = store
                .import_backup(ImportBackupRequest {
                    file_name: format!("v{version}.zip"),
                    bytes,
                })
                .expect("import old backup");
            assert_eq!(result.preserved_legacy_chats, 2);
            assert_eq!(
                store
                    .list_note_chat_messages(&note.id)
                    .expect("preserved note chat")[0]
                    .content,
                format!("note history v{version}")
            );
            assert_eq!(
                store
                    .list_rag_chat_messages(&rag.id)
                    .expect("preserved rag chat")[0]
                    .content,
                format!("rag history v{version}")
            );
        }
    }

    #[test]
    fn backup_validation_rejects_corruption_duplicates_and_unsafe_paths() {
        let store = temp_store();
        let base = serde_json::to_value(store.collect_backup_data().expect("collect backup data"))
            .expect("serialize backup");

        assert!(validate_backup_archive(b"not a zip").is_err());
        assert!(
            validate_backup_archive(&backup_bytes_from_value(&json!({"broken": true}), &[]))
                .is_err()
        );

        let mut unsupported = base.clone();
        unsupported["version"] = json!(CURRENT_BACKUP_VERSION + 1);
        assert!(validate_backup_archive(&backup_bytes_from_value(&unsupported, &[])).is_err());

        let mut duplicate = base.clone();
        let note = duplicate["notes"][0].clone();
        duplicate["notes"]
            .as_array_mut()
            .expect("notes array")
            .push(note);
        assert!(validate_backup_archive(&backup_bytes_from_value(&duplicate, &[])).is_err());

        let traversal = backup_bytes_from_value(&base, &[("files/../../escape.txt", b"escape")]);
        assert!(validate_backup_archive(&traversal).is_err());

        let absolute = backup_bytes_from_value(&base, &[("files/C:/escape.txt", b"escape")]);
        assert!(validate_backup_archive(&absolute).is_err());
    }

    #[test]
    fn backup_validation_enforces_entry_count_and_uncompressed_size_limits() {
        let store = temp_store();
        let manifest =
            serde_json::to_value(store.collect_backup_data().expect("collect backup data"))
                .expect("serialize backup");
        let bytes = backup_bytes_from_value(&manifest, &[]);
        let one_entry_too_many = BackupLimits {
            max_entries: 0,
            ..BackupLimits::default()
        };
        assert!(validate_backup_archive_with_limits(&bytes, one_entry_too_many).is_err());

        let too_large_uncompressed = BackupLimits {
            max_uncompressed_bytes: 1,
            ..BackupLimits::default()
        };
        assert!(validate_backup_archive_with_limits(&bytes, too_large_uncompressed).is_err());
    }

    #[test]
    fn backup_validation_requires_v5_attachment_files_and_chat_references() {
        let mut store = temp_store();
        let note = create_note_with_content(&mut store, "Validation note", "body");
        store
            .store_attachment(StoreAttachmentRequest {
                note_id: note.id,
                kind: "file".to_string(),
                original_name: "required.txt".to_string(),
                mime_type: "text/plain".to_string(),
                original_attachment_id: None,
                edit_metadata: None,
                bytes: b"required".to_vec(),
            })
            .expect("store required attachment");
        let bytes = backup_bytes_for_store(&store);
        let manifest = backup_value_from_bytes(&bytes);
        assert!(validate_backup_archive(&backup_bytes_from_value(&manifest, &[])).is_err());

        let mut broken_chat = manifest;
        broken_chat["attachments"] = json!([]);
        broken_chat["aiChats"] = json!([{
            "id": "orphan-note-chat",
            "scope": "note",
            "note_id": "missing-note",
            "title": "Orphan",
            "created_at": now_iso(),
            "updated_at": now_iso()
        }]);
        broken_chat["aiMessages"] = json!([{
            "id": "orphan-message",
            "chat_id": "missing-chat",
            "role": "assistant",
            "content": "must not import",
            "sources_json": [],
            "created_at": now_iso()
        }]);
        assert!(validate_backup_archive(&backup_bytes_from_value(&broken_chat, &[])).is_err());
    }

    #[test]
    fn orphan_historical_rag_source_is_removed_without_losing_the_message() {
        let mut source = temp_store();
        let rag = source
            .create_rag_chat(CreateRagChatRequest {
                title: Some("Orphan source".to_string()),
            })
            .expect("create rag chat");
        source
            .save_rag_chat_message(SaveRagChatMessageRequest {
                chat_id: rag.id.clone(),
                role: "assistant".to_string(),
                content: "Historical answer remains".to_string(),
                sources: json!([{"noteId": "missing-note"}]),
            })
            .expect("save historical answer");
        let bytes = backup_bytes_for_store(&source);
        let mut target = temp_store();
        target
            .import_backup(ImportBackupRequest {
                file_name: "orphan-source.zip".to_string(),
                bytes,
            })
            .expect("restore with orphan source");
        let messages = target
            .list_rag_chat_messages(&rag.id)
            .expect("list restored message");
        assert_eq!(messages[0].content, "Historical answer remains");
        assert_eq!(messages[0].sources, json!([]));
    }

    #[test]
    fn database_restore_faults_roll_back_notes_sidecars_chats_and_live_files() {
        let mut source = temp_store();
        let source_note = create_note_with_content(&mut source, "Incoming", "incoming state");
        source
            .save_note_chat_message(SaveNoteChatMessageRequest {
                note_id: source_note.id.clone(),
                role: "assistant".to_string(),
                content: "incoming chat".to_string(),
            })
            .expect("save source chat");
        source
            .store_attachment(StoreAttachmentRequest {
                note_id: source_note.id.clone(),
                kind: "file".to_string(),
                original_name: "incoming.txt".to_string(),
                mime_type: "text/plain".to_string(),
                original_attachment_id: None,
                edit_metadata: None,
                bytes: b"incoming file".to_vec(),
            })
            .expect("store source attachment");
        let bytes = backup_bytes_for_store(&source);

        for table in ["notes", "note_content_sidecars", "ai_messages"] {
            let mut target = temp_store();
            let baseline = create_note_with_content(&mut target, "Baseline", "previous markdown");
            let attachment = target
                .store_attachment(StoreAttachmentRequest {
                    note_id: baseline.id.clone(),
                    kind: "file".to_string(),
                    original_name: "baseline.txt".to_string(),
                    mime_type: "text/plain".to_string(),
                    original_attachment_id: None,
                    edit_metadata: None,
                    bytes: b"previous file".to_vec(),
                })
                .expect("store baseline attachment");
            let baseline_path = target
                .resolve_storage_path(&attachment.attachment.storage_rel_path)
                .expect("baseline path");
            target
                .conn
                .execute_batch(&format!(
                    "CREATE TEMP TRIGGER fail_restore BEFORE INSERT ON {table}
                     BEGIN SELECT RAISE(ABORT, 'forced restore failure'); END;"
                ))
                .expect("install restore fault");
            assert!(target
                .import_backup(ImportBackupRequest {
                    file_name: "fault.zip".to_string(),
                    bytes: bytes.clone(),
                })
                .is_err());
            let preserved = target
                .get_note(&baseline.id)
                .expect("baseline note preserved");
            assert_eq!(preserved.content_markdown, "previous markdown");
            assert_eq!(
                fs::read(&baseline_path).expect("baseline file preserved"),
                b"previous file"
            );
            assert!(target
                .list_notes(Some("Incoming".to_string()), true)
                .expect("query notes")
                .is_empty());
        }
    }

    #[test]
    fn filesystem_swap_failure_does_not_commit_database_restore() {
        let mut source = temp_store();
        create_note_with_content(&mut source, "Incoming filesystem", "incoming");
        let bytes = backup_bytes_for_store(&source);
        let mut target = temp_store();
        let baseline = create_note_with_content(&mut target, "Baseline filesystem", "baseline");
        let images_root = target.base_dir.join("images");
        let saved_images_root = target.base_dir.join("images-before-test");
        fs::rename(&images_root, &saved_images_root).expect("move images root");
        fs::write(&images_root, b"blocks directory swap").expect("block images root");

        let result = target.import_backup(ImportBackupRequest {
            file_name: "filesystem-fault.zip".to_string(),
            bytes,
        });
        fs::remove_file(&images_root).expect("remove blocker");
        fs::rename(&saved_images_root, &images_root).expect("restore images root");

        assert!(result.is_err());
        assert_eq!(
            target
                .get_note(&baseline.id)
                .expect("baseline note survives")
                .content_markdown,
            "baseline"
        );
        assert!(target
            .list_notes(Some("Incoming filesystem".to_string()), true)
            .expect("query notes")
            .is_empty());
    }

    #[test]
    fn interrupted_restore_before_database_commit_rolls_back_files_on_reopen() {
        let dir = temp_store_dir();
        let store = DataStore::open(dir.clone()).expect("store opens");
        fs::write(dir.join("attachments").join("old.txt"), b"old attachment")
            .expect("write old attachment");
        fs::write(dir.join("images").join("old.png"), b"old image").expect("write old image");
        let staging_dir = dir.join("cache").join("restore-interrupted-before-commit");
        fs::create_dir_all(staging_dir.join("incoming").join("attachments"))
            .expect("create incoming attachments");
        fs::create_dir_all(staging_dir.join("incoming").join("images"))
            .expect("create incoming images");
        fs::create_dir_all(staging_dir.join("incoming").join(assets::ASSET_ROOT))
            .expect("create incoming assets");
        fs::write(
            staging_dir
                .join("incoming")
                .join("attachments")
                .join("new.txt"),
            b"new attachment",
        )
        .expect("write incoming attachment");
        fs::write(
            staging_dir.join("incoming").join("images").join("new.png"),
            b"new image",
        )
        .expect("write incoming image");

        let swap = RestoreFileSwap::apply(
            &dir,
            staging_dir.clone(),
            "restore-before-commit".to_string(),
        )
        .expect("swap files");
        assert!(dir.join("attachments").join("new.txt").exists());
        std::mem::forget(swap);
        drop(store);

        let reopened = DataStore::open(dir.clone()).expect("reopen recovers interrupted restore");
        assert_eq!(
            fs::read(dir.join("attachments").join("old.txt")).expect("old attachment restored"),
            b"old attachment"
        );
        assert_eq!(
            fs::read(dir.join("images").join("old.png")).expect("old image restored"),
            b"old image"
        );
        assert!(!dir.join("attachments").join("new.txt").exists());
        assert!(!staging_dir.exists());
        assert!(!restore_state_path(&dir).exists());
        drop(reopened);
    }

    #[test]
    fn interrupted_restore_after_database_commit_keeps_new_files_on_reopen() {
        let dir = temp_store_dir();
        let store = DataStore::open(dir.clone()).expect("store opens");
        fs::write(dir.join("attachments").join("old.txt"), b"old attachment")
            .expect("write old attachment");
        fs::write(dir.join("images").join("old.png"), b"old image").expect("write old image");
        let staging_dir = dir.join("cache").join("restore-interrupted-after-commit");
        fs::create_dir_all(staging_dir.join("incoming").join("attachments"))
            .expect("create incoming attachments");
        fs::create_dir_all(staging_dir.join("incoming").join("images"))
            .expect("create incoming images");
        fs::create_dir_all(staging_dir.join("incoming").join(assets::ASSET_ROOT))
            .expect("create incoming assets");
        fs::write(
            staging_dir
                .join("incoming")
                .join("attachments")
                .join("new.txt"),
            b"new attachment",
        )
        .expect("write incoming attachment");
        fs::write(
            staging_dir.join("incoming").join("images").join("new.png"),
            b"new image",
        )
        .expect("write incoming image");
        let restore_id = "restore-after-commit";
        let swap = RestoreFileSwap::apply(&dir, staging_dir.clone(), restore_id.to_string())
            .expect("swap files");
        store
            .conn
            .execute(
                "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
                params![RESTORE_COMMIT_SETTING_KEY, json!(restore_id).to_string(), now_iso()],
            )
            .expect("persist committed restore id");
        std::mem::forget(swap);
        drop(store);

        let reopened = DataStore::open(dir.clone()).expect("reopen finalizes committed restore");
        assert_eq!(
            fs::read(dir.join("attachments").join("new.txt")).expect("new attachment retained"),
            b"new attachment"
        );
        assert_eq!(
            fs::read(dir.join("images").join("new.png")).expect("new image retained"),
            b"new image"
        );
        assert!(!dir.join("attachments").join("old.txt").exists());
        assert!(!staging_dir.exists());
        assert!(!restore_state_path(&dir).exists());
        let marker_count: i64 = reopened
            .conn
            .query_row(
                "SELECT COUNT(*) FROM app_settings WHERE key = ?1",
                [RESTORE_COMMIT_SETTING_KEY],
                |row| row.get(0),
            )
            .expect("query restore marker");
        assert_eq!(marker_count, 0);
    }

    #[test]
    fn imported_content_version_invalidates_pre_import_pending_saves() {
        let mut source = temp_store();
        let source_note = create_note_with_content(&mut source, "Versioned", "imported state");
        let bytes = backup_bytes_for_store(&source);
        let mut target = temp_store();
        let old_expected_version = target
            .conn
            .query_row(
                "SELECT COALESCE(MAX(content_version), 0) FROM notes",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("current max version");
        target
            .import_backup(ImportBackupRequest {
                file_name: "versioned.zip".to_string(),
                bytes,
            })
            .expect("import versioned backup");
        let imported = target.get_note(&source_note.id).expect("imported note");
        assert!(imported.content_version > old_expected_version);
        let stale = target
            .update_note_content(UpdateNoteContentRequest {
                note_id: source_note.id.clone(),
                expected_content_version: old_expected_version,
                content_json: document_from_text("stale state"),
                content_markdown: "stale state".to_string(),
                content_html: "<p>stale state</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "stale state".to_string(),
            })
            .expect_err("pre-import save must be stale");
        assert!(matches!(stale, DataError::StaleWrite));
        assert_eq!(
            target
                .get_note(&source_note.id)
                .expect("authoritative note")
                .content_markdown,
            "imported state"
        );
    }

    #[test]
    fn failed_backup_export_leaves_no_final_or_temporary_archive() {
        let mut store = temp_store();
        let note = create_note_with_content(&mut store, "Missing file", "body");
        let attachment = store
            .store_attachment(StoreAttachmentRequest {
                note_id: note.id,
                kind: "file".to_string(),
                original_name: "missing.txt".to_string(),
                mime_type: "text/plain".to_string(),
                original_attachment_id: None,
                edit_metadata: None,
                bytes: b"temporary".to_vec(),
            })
            .expect("store attachment");
        let path = store
            .resolve_storage_path(&attachment.attachment.storage_rel_path)
            .expect("attachment path");
        fs::remove_file(path).expect("remove managed file");
        assert!(store.create_backup().is_err());
        let backup_entries = fs::read_dir(store.base_dir.join("backups"))
            .expect("read backup dir")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect backup dir");
        assert!(backup_entries.is_empty());
    }

    #[test]
    fn knowledge_migration_backfills_an_existing_v8_database() {
        let dir = temp_store_dir();
        {
            let mut store = DataStore::open(dir.clone()).expect("initial store");
            create_note_with_content(
                &mut store,
                "Legacy knowledge",
                "# Заметка\n\nСодержимое для проверки восстановления индекса знаний.",
            );
            store
                .conn
                .execute("DELETE FROM schema_migrations WHERE version = 9", [])
                .expect("remove migration marker");
            store
                .conn
                .execute_batch(
                    "DROP TABLE knowledge_chunk_state;
                     DROP TABLE knowledge_chunks;",
                )
                .expect("remove derived index");
        }

        let reopened = DataStore::open(dir).expect("v8 database migrates");
        let migration_count: i64 = reopened
            .conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = 9",
                [],
                |row| row.get(0),
            )
            .expect("migration marker");
        let status = knowledge::index_status(&reopened.conn).expect("knowledge status");
        assert_eq!(migration_count, 1);
        assert_eq!(status.status, "current");
        assert_eq!(status.indexed_notes, status.total_notes);
        assert!(status.chunk_count > 0);
    }

    #[test]
    fn knowledge_metadata_migration_upgrades_an_existing_v9_database() {
        let dir = temp_store_dir();
        {
            let store = DataStore::open(dir.clone()).expect("initial store");
            store
                .conn
                .execute("DELETE FROM schema_migrations WHERE version = 10", [])
                .expect("remove metadata migration marker");
            store
                .conn
                .execute("DROP TABLE knowledge_index_metadata", [])
                .expect("remove knowledge metadata");
        }

        let reopened = DataStore::open(dir).expect("v9 database migrates");
        let migration_count: i64 = reopened
            .conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations
                 WHERE version = 10 AND name = 'knowledge_index_metadata'",
                [],
                |row| row.get(0),
            )
            .expect("metadata migration marker");
        let metadata_table_count: i64 = reopened
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table' AND name = 'knowledge_index_metadata'",
                [],
                |row| row.get(0),
            )
            .expect("metadata table");

        assert_eq!(migration_count, 1);
        assert_eq!(metadata_table_count, 1);
    }

    #[test]
    fn semantic_retrieval_migration_upgrades_an_existing_v10_database() {
        let dir = temp_store_dir();
        {
            let store = DataStore::open(dir.clone()).expect("initial store");
            store
                .conn
                .execute("DELETE FROM schema_migrations WHERE version = 11", [])
                .expect("remove semantic migration marker");
            store
                .conn
                .execute_batch(
                    "DROP TRIGGER IF EXISTS knowledge_chunks_embedding_ai;
                     DROP TRIGGER IF EXISTS knowledge_chunks_embedding_ad;
                     DROP TRIGGER IF EXISTS knowledge_chunks_embedding_au;
                     DROP TABLE IF EXISTS knowledge_chunks_fts;
                     DROP TABLE IF EXISTS embedding_chunk_failures;
                     DROP TABLE IF EXISTS knowledge_chunk_embeddings;
                     DROP TABLE IF EXISTS embedding_index_state;
                     DROP TABLE IF EXISTS embedding_profiles;",
                )
                .expect("remove semantic derived index");
        }

        let reopened = DataStore::open(dir).expect("v10 database migrates");
        let migration_count: i64 = reopened
            .conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = 11",
                [],
                |row| row.get(0),
            )
            .expect("semantic migration marker");
        let fts_count: i64 = reopened
            .conn
            .query_row("SELECT COUNT(*) FROM knowledge_chunks_fts", [], |row| {
                row.get(0)
            })
            .expect("chunk fts backfill");
        let chunk_count: i64 = reopened
            .conn
            .query_row("SELECT COUNT(*) FROM knowledge_chunks", [], |row| {
                row.get(0)
            })
            .expect("knowledge chunks");
        assert_eq!(migration_count, 1);
        assert_eq!(fts_count, chunk_count);
    }

    #[test]
    fn note_lifecycle_keeps_knowledge_chunks_current_without_touching_sidecars() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Knowledge lifecycle".to_string(),
                note_date: "2026-07-13".to_string(),
            })
            .expect("create note");
        let sidecar = NoteContentSidecarInput {
            kind: "editor_node_attrs_v1".to_string(),
            schema_version: 1,
            payload_json: json!({"images":[{"alignment":"right"}]}),
        };
        let saved = store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 0,
                content_json: document_from_text("Раздел Содержимое"),
                content_markdown: "# Раздел\n\nСодержимое".to_string(),
                content_html: "<h1>Раздел</h1><p>Содержимое</p>".to_string(),
                content_sidecars: vec![sidecar],
                plain_text: "Раздел Содержимое".to_string(),
            })
            .expect("save note");
        let chunks = knowledge::get_chunks_by_note_id(&store.conn, &note.id).expect("chunks");
        assert!(!chunks.is_empty());
        assert_eq!(chunks[0].heading_path, vec!["Раздел"]);
        assert_eq!(saved.content_markdown, "# Раздел\n\nСодержимое");
        assert_eq!(
            note_sidecar_payload(&store, &note.id, "editor_node_attrs_v1"),
            json!({"images":[{"alignment":"right"}]})
        );

        force_revision_due(&store, &note.id);
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 1,
                content_json: document_from_text("Временная версия"),
                content_markdown: "Временная версия".to_string(),
                content_html: "<p>Временная версия</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "Временная версия".to_string(),
            })
            .expect("save temporary version");
        let revision_id: String = store
            .conn
            .query_row(
                "SELECT id FROM note_revisions WHERE note_id = ?1 AND content_markdown = ?2 ORDER BY created_at DESC LIMIT 1",
                params![note.id, "# Раздел\n\nСодержимое"],
                |row| row.get(0),
            )
            .expect("revision id");
        let restored = store
            .restore_note_revision(RestoreNoteRevisionRequest {
                note_id: note.id.clone(),
                revision_id,
                expected_content_version: 2,
            })
            .expect("restore revision");
        assert_eq!(restored.content_markdown, "# Раздел\n\nСодержимое");
        assert!(knowledge::get_chunks_by_note_id(&store.conn, &note.id)
            .expect("restored chunks")
            .iter()
            .any(|chunk| chunk.content_text.contains("Содержимое")));

        let duplicate = store.duplicate_note(&note.id).expect("duplicate note");
        assert!(
            !knowledge::get_chunks_by_note_id(&store.conn, &duplicate.id)
                .expect("duplicate chunks")
                .is_empty()
        );
        store.archive_note(&note.id).expect("archive note");
        assert!(!knowledge::get_chunks_by_note_id(&store.conn, &note.id)
            .expect("archived chunks")
            .is_empty());
        store.delete_note(&note.id).expect("soft delete note");
        assert!(knowledge::get_chunks_by_note_id(&store.conn, &note.id)
            .expect("deleted chunks")
            .is_empty());
    }

    #[test]
    fn backup_excludes_derived_chunks_and_import_reconciles_them() {
        let mut store = temp_store();
        let secret_storage = llm::MemorySecretStorage::default();
        let semantic_profile = embedding::save_profile(
            &mut store.conn,
            &secret_storage,
            embedding::SaveEmbeddingProfileRequest {
                id: None,
                name: "Backup semantic profile".to_string(),
                provider_type: "ollama".to_string(),
                base_url: "http://127.0.0.1:11434".to_string(),
                embeddings_endpoint: "/api/embed".to_string(),
                model: "nomic-embed-text".to_string(),
                batch_size: 16,
                timeout_seconds: 30,
                locality: "local".to_string(),
                api_key: Some("must-not-enter-backup".to_string()),
                delete_api_key: false,
                enabled: true,
            },
        )
        .expect("save semantic profile");
        let note = store
            .create_note(CreateNoteRequest {
                title: "Backup knowledge".to_string(),
                note_date: "2026-07-13".to_string(),
            })
            .expect("create note");
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id,
                expected_content_version: 0,
                content_json: document_from_text("Canonical backup body"),
                content_markdown: "Canonical backup body".to_string(),
                content_html: "<p>Canonical backup body</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "Canonical backup body".to_string(),
            })
            .expect("save note");
        let backup = store.create_backup().expect("create backup");
        let bytes = fs::read(backup.path).expect("read backup");
        let mut archive = ZipArchive::new(Cursor::new(bytes.clone())).expect("open backup");
        let mut backup_json = String::new();
        archive
            .by_name("noteflow-backup.json")
            .expect("backup json")
            .read_to_string(&mut backup_json)
            .expect("read backup json");
        assert!(!backup_json.contains("knowledge_chunks"));
        assert!(!backup_json.contains("knowledge_chunk_state"));
        assert!(!backup_json.contains("knowledge_chunk_embeddings"));
        assert!(!backup_json.contains("embedding_index_state"));
        assert!(!backup_json.contains("must-not-enter-backup"));
        assert!(backup_json.contains("Backup semantic profile"));

        let mut imported = temp_store();
        imported
            .import_backup(ImportBackupRequest {
                file_name: "backup.zip".to_string(),
                bytes,
            })
            .expect("import backup");
        let status = knowledge::index_status(&imported.conn).expect("imported status");
        assert_eq!(status.status, "current");
        assert_eq!(status.indexed_notes, status.total_notes);
        let imported_profile = embedding::get_profile(&imported.conn, &semantic_profile.id)
            .expect("semantic profile imported");
        assert!(imported_profile.api_key_ref.is_none());
        assert!(imported_profile.cloud_consent_at.is_none());
        let semantic_status = embedding::get_index_status(&mut imported.conn, &semantic_profile.id)
            .expect("semantic index status");
        assert_eq!(semantic_status.status, "pending");
        assert_eq!(semantic_status.indexed_chunks, 0);
    }

    fn persistence_request(
        note_id: &str,
        expected_content_version: i64,
        markdown: &str,
        content_json: Value,
        sidecars: Vec<NoteContentSidecarInput>,
    ) -> UpdateNoteContentRequest {
        UpdateNoteContentRequest {
            note_id: note_id.to_string(),
            expected_content_version,
            content_json,
            content_markdown: markdown.to_string(),
            content_html: format!("<p>{}</p>", markdown.replace('<', "&lt;")),
            content_sidecars: sidecars,
            plain_text: markdown.to_string(),
        }
    }

    fn note_revision_count(store: &DataStore, note_id: &str) -> i64 {
        store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM note_revisions WHERE note_id = ?1",
                params![note_id],
                |row| row.get(0),
            )
            .expect("revision count")
    }

    fn force_revision_due(store: &DataStore, note_id: &str) {
        store
            .conn
            .execute(
                "UPDATE notes SET revision_checkpoint_at = '2000-01-01T00:00:00.000Z' WHERE id = ?1",
                params![note_id],
            )
            .expect("make historical revision due");
    }

    fn insert_revision_fixture(
        store: &DataStore,
        note_id: &str,
        id: &str,
        created_at: &str,
        kind: RevisionKind,
    ) {
        let markdown = format!("fixture {id}");
        let content_json = document_from_text(&markdown).to_string();
        store
            .conn
            .execute(
                "INSERT INTO note_revisions (
                    id, note_id, content_json, content_markdown, content_html, plain_text,
                    created_at, snapshot_hash, revision_kind
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?6, NULL, ?7)",
                params![
                    id,
                    note_id,
                    content_json,
                    markdown,
                    format!("<p>{id}</p>"),
                    created_at,
                    kind.as_str(),
                ],
            )
            .expect("insert revision fixture");
        store
            .conn
            .execute(
                "INSERT INTO note_revision_sidecars (
                    revision_id, kind, schema_version, payload_json, created_at
                 ) VALUES (?1, ?2, 1, ?3, ?4)",
                params![
                    id,
                    LEGACY_TIPTAP_SIDECAR_KIND,
                    document_from_text(&markdown).to_string(),
                    created_at,
                ],
            )
            .expect("insert revision sidecar fixture");
    }

    #[test]
    fn atomic_autosave_commits_markdown_and_sidecars_without_eager_revision() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Атомарная заметка".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create atomic note");
        let markdown = "# Русский заголовок\n\n- [x] Чек-лист\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n$E = mc^2$\n\n2026-08-26";
        let document = json!({
            "type": "doc",
            "content": [
                { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Русский заголовок" }] },
                { "type": "table", "content": [] },
                { "type": "formulaBlock", "attrs": { "latex": "E = mc^2" } },
                { "type": "inlineDate", "attrs": { "date": "2026-08-26" } }
            ]
        });
        let attrs = json!({
            "blocks": [{ "type": "table", "thickBorders": true }],
            "images": [{ "alignment": "right", "src": "https://example.invalid/image.png" }]
        });
        let saved = store
            .update_note_content(persistence_request(
                &note.id,
                0,
                markdown,
                document.clone(),
                vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: attrs.clone(),
                }],
            ))
            .expect("atomic save");

        assert_eq!(saved.content_markdown, markdown);
        assert_eq!(saved.content_json, document);
        assert_eq!(saved.content_version, 1);
        assert_eq!(
            note_sidecar_payload(&store, &note.id, "editor_node_attrs_v1"),
            attrs
        );
        assert_eq!(note_revision_count(&store, &note.id), 0);
        let revision_sidecars: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM note_revision_sidecars nrs
                 INNER JOIN note_revisions nr ON nr.id = nrs.revision_id
                 WHERE nr.note_id = ?1",
                params![note.id],
                |row| row.get(0),
            )
            .expect("revision sidecars");
        assert_eq!(revision_sidecars, 0);
    }

    #[test]
    fn autosave_is_independent_from_periodic_revision_cadence() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Revision cadence".to_string(),
                note_date: "2026-08-29".to_string(),
            })
            .expect("create cadence note");
        let first = store
            .update_note_content(persistence_request(
                &note.id,
                0,
                "Первая версия 😀",
                document_from_text("Первая версия 😀"),
                vec![],
            ))
            .expect("first autosave");
        let second = store
            .update_note_content(persistence_request(
                &note.id,
                first.content_version,
                "Вторая версия 😀",
                document_from_text("Вторая версия 😀"),
                vec![],
            ))
            .expect("second autosave before cadence");
        assert_eq!(second.content_version, 2);
        assert_eq!(second.content_markdown, "Вторая версия 😀");
        assert_eq!(note_revision_count(&store, &note.id), 0);

        force_revision_due(&store, &note.id);
        let third = store
            .update_note_content(persistence_request(
                &note.id,
                second.content_version,
                "Третья версия 😀",
                document_from_text("Третья версия 😀"),
                vec![],
            ))
            .expect("autosave with due historical checkpoint");
        assert_eq!(third.content_version, 3);
        assert_eq!(third.content_markdown, "Третья версия 😀");
        assert_eq!(note_revision_count(&store, &note.id), 1);
        let (kind, markdown): (String, String) = store
            .conn
            .query_row(
                "SELECT revision_kind, content_markdown
                 FROM note_revisions WHERE note_id = ?1",
                params![note.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("periodic revision metadata");
        assert_eq!(kind, "periodic");
        assert_eq!(markdown, "Вторая версия 😀");
    }

    #[test]
    fn startup_retention_prunes_legacy_history_once_and_cascades_sidecars() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Legacy retention".to_string(),
                note_date: "2026-08-29".to_string(),
            })
            .expect("create legacy retention note");
        store
            .conn
            .execute(
                "DELETE FROM app_settings WHERE key = ?1",
                params![revisions::REVISION_MAINTENANCE_SETTING_KEY],
            )
            .expect("reset maintenance marker");
        let now = Utc::now();
        for index in 0..200 {
            let created_at = (now - chrono::Duration::minutes(index))
                .to_rfc3339_opts(SecondsFormat::Millis, true);
            insert_revision_fixture(
                &store,
                &note.id,
                &format!("legacy-{index:03}"),
                &created_at,
                RevisionKind::Legacy,
            );
        }
        let stats = revisions::run_startup_maintenance(&mut store.conn, &now_iso())
            .expect("run one-time retention");
        assert_eq!(stats.revisions_before, 200);
        assert!(stats.revisions_after <= revisions::REVISION_HARD_CAP);
        assert_eq!(stats.revisions_deleted, 200 - stats.revisions_after);
        assert_eq!(
            note_revision_count(&store, &note.id),
            stats.revisions_after as i64
        );
        let sidecars: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM note_revision_sidecars nrs
                 INNER JOIN note_revisions nr ON nr.id = nrs.revision_id
                 WHERE nr.note_id = ?1",
                params![note.id],
                |row| row.get(0),
            )
            .expect("retained revision sidecars");
        assert_eq!(sidecars, stats.revisions_after as i64);
        assert_eq!(
            revisions::run_startup_maintenance(&mut store.conn, &now_iso())
                .expect("maintenance is idempotent"),
            revisions::MaintenanceStats::default()
        );
    }

    #[test]
    fn pruning_is_note_scoped_and_transactional_on_failure() {
        let mut store = temp_store();
        let first = store
            .create_note(CreateNoteRequest {
                title: "Prune first".to_string(),
                note_date: "2026-08-29".to_string(),
            })
            .expect("create first prune note");
        let second = store
            .create_note(CreateNoteRequest {
                title: "Prune second".to_string(),
                note_date: "2026-08-29".to_string(),
            })
            .expect("create second prune note");
        let now = Utc::now();
        for index in 0..150 {
            let created_at = (now - chrono::Duration::minutes(index))
                .to_rfc3339_opts(SecondsFormat::Millis, true);
            insert_revision_fixture(
                &store,
                &first.id,
                &format!("first-{index:03}"),
                &created_at,
                RevisionKind::Periodic,
            );
            insert_revision_fixture(
                &store,
                &second.id,
                &format!("second-{index:03}"),
                &created_at,
                RevisionKind::Periodic,
            );
        }
        {
            let transaction = store.conn.transaction().expect("begin scoped prune");
            let stats = revisions::prune_note_revisions(
                &transaction,
                &first.id,
                &now_iso(),
                true,
                &HashSet::new(),
            )
            .expect("prune first note");
            assert!(stats.deleted > 0);
            transaction.commit().expect("commit scoped prune");
        }
        assert!(note_revision_count(&store, &first.id) <= revisions::REVISION_HARD_CAP as i64);
        assert_eq!(note_revision_count(&store, &second.id), 150);

        store
            .conn
            .execute_batch(
                "CREATE TEMP TRIGGER fail_revision_prune
                 BEFORE DELETE ON note_revisions
                 BEGIN SELECT RAISE(ABORT, 'forced prune failure'); END;",
            )
            .expect("create prune fault");
        let before = note_revision_count(&store, &second.id);
        let transaction = store.conn.transaction().expect("begin failing prune");
        let error = revisions::prune_note_revisions(
            &transaction,
            &second.id,
            &now_iso(),
            true,
            &HashSet::new(),
        )
        .expect_err("prune fault must abort");
        drop(transaction);
        assert!(matches!(error, rusqlite::Error::SqliteFailure(_, _)));
        assert_eq!(note_revision_count(&store, &second.id), before);
    }

    #[test]
    fn restore_protects_selected_revision_while_pruning_large_history() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Restore during prune".to_string(),
                note_date: "2026-08-29".to_string(),
            })
            .expect("create restore prune note");
        let now = Utc::now();
        for index in 0..150 {
            let created_at = (now - chrono::Duration::minutes(index))
                .to_rfc3339_opts(SecondsFormat::Millis, true);
            insert_revision_fixture(
                &store,
                &note.id,
                &format!("restore-{index:03}"),
                &created_at,
                RevisionKind::Periodic,
            );
        }
        let target_id = "restore-149".to_string();
        let restored = store
            .restore_note_revision(RestoreNoteRevisionRequest {
                note_id: note.id.clone(),
                revision_id: target_id.clone(),
                expected_content_version: note.content_version,
            })
            .expect("restore selected revision while pruning");
        assert_eq!(restored.content_markdown, "fixture restore-149");
        assert!(note_revision_count(&store, &note.id) <= revisions::REVISION_HARD_CAP as i64);
        let target_still_exists: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM note_revisions WHERE id = ?1",
                params![target_id],
                |row| row.get(0),
            )
            .expect("restored revision remains addressable");
        assert_eq!(target_still_exists, 1);
    }

    #[test]
    fn sidecar_failure_rolls_back_note_revision_and_previous_sidecar() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Sidecar rollback".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create rollback note");
        store
            .conn
            .execute_batch(
                "CREATE TEMP TRIGGER fail_note_sidecar
                 BEFORE INSERT ON note_content_sidecars
                 WHEN NEW.kind = 'editor_node_attrs_v1'
                 BEGIN SELECT RAISE(ABORT, 'PRIVATE NOTE TEXT MUST NOT ESCAPE'); END;",
            )
            .expect("sidecar fault trigger");

        let error = store
            .update_note_content(persistence_request(
                &note.id,
                0,
                "Новый секретный Markdown",
                document_from_text("Новый секретный Markdown"),
                vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "table": "new" }),
                }],
            ))
            .expect_err("sidecar write must fail");
        assert!(matches!(error, DataError::Sidecar));
        let persisted = store.get_note(&note.id).expect("previous note remains");
        assert_eq!(persisted.content_markdown, "");
        assert_eq!(persisted.content_version, 0);
        assert_eq!(note_revision_count(&store, &note.id), 0);
        assert_eq!(
            note_sidecar_payload(&store, &note.id, LEGACY_TIPTAP_SIDECAR_KIND),
            empty_document()
        );
        let safe_error = serde_json::to_string(&PersistenceCommandError::from(error))
            .expect("serialize safe persistence error");
        assert!(!safe_error.contains("PRIVATE NOTE TEXT"));
        assert!(!safe_error.contains("Новый секретный Markdown"));
        assert!(!safe_error.contains("INSERT"));
    }

    #[test]
    fn revision_failure_rolls_back_logical_save() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Revision rollback".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create revision rollback note");
        store
            .update_note_content(persistence_request(
                &note.id,
                0,
                "Предыдущее корректное состояние",
                document_from_text("Предыдущее корректное состояние"),
                vec![],
            ))
            .expect("save revision rollback baseline");
        force_revision_due(&store, &note.id);
        store
            .conn
            .execute_batch(
                "CREATE TEMP TRIGGER fail_note_revision
                 BEFORE INSERT ON note_revisions
                 BEGIN SELECT RAISE(ABORT, 'forced revision failure'); END;",
            )
            .expect("revision fault trigger");
        let error = store
            .update_note_content(persistence_request(
                &note.id,
                1,
                "Не должно сохраниться",
                document_from_text("Не должно сохраниться"),
                vec![],
            ))
            .expect_err("revision write must fail");
        assert!(matches!(error, DataError::Revision));
        assert_eq!(
            store
                .get_note(&note.id)
                .expect("note remains")
                .content_markdown,
            "Предыдущее корректное состояние"
        );
        assert_eq!(note_revision_count(&store, &note.id), 0);
    }

    #[test]
    fn revision_sidecar_failure_rolls_back_logical_save() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Revision sidecar rollback".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create revision sidecar note");
        store
            .update_note_content(persistence_request(
                &note.id,
                0,
                "Предыдущее корректное состояние",
                document_from_text("Предыдущее корректное состояние"),
                vec![],
            ))
            .expect("save revision sidecar rollback baseline");
        force_revision_due(&store, &note.id);
        store
            .conn
            .execute_batch(
                "CREATE TEMP TRIGGER fail_revision_sidecar
                 BEFORE INSERT ON note_revision_sidecars
                 BEGIN SELECT RAISE(ABORT, 'forced revision sidecar failure'); END;",
            )
            .expect("revision sidecar fault trigger");
        let error = store
            .update_note_content(persistence_request(
                &note.id,
                1,
                "Не должно сохраниться",
                document_from_text("Не должно сохраниться"),
                vec![],
            ))
            .expect_err("revision sidecar write must fail");
        assert!(matches!(error, DataError::Revision));
        assert_eq!(
            store
                .get_note(&note.id)
                .expect("note remains")
                .content_markdown,
            "Предыдущее корректное состояние"
        );
        assert_eq!(note_revision_count(&store, &note.id), 0);
    }

    #[test]
    fn create_note_rolls_back_row_sidecar_tag_and_project_on_failure() {
        let mut store = temp_store();
        store
            .conn
            .execute_batch(
                "CREATE TEMP TRIGGER fail_created_note_sidecar
                 BEFORE INSERT ON note_content_sidecars
                 BEGIN SELECT RAISE(ABORT, 'forced create sidecar failure'); END;",
            )
            .expect("create fault trigger");
        let error = store
            .create_note(CreateNoteRequest {
                title: "Atomic create failure".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect_err("create must fail");
        assert!(matches!(error, DataError::Sidecar));
        let note_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE title = 'Atomic create failure'",
                [],
                |row| row.get(0),
            )
            .expect("failed note count");
        assert_eq!(note_count, 0);
    }

    #[test]
    fn duplicate_note_rolls_back_sqlite_copy_when_sidecar_copy_fails() {
        let mut store = temp_store();
        let source = store
            .create_note(CreateNoteRequest {
                title: "Atomic duplicate source".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create duplicate source");
        store
            .conn
            .execute_batch(&format!(
                "CREATE TEMP TRIGGER fail_duplicate_sidecar
                 BEFORE INSERT ON note_content_sidecars
                 WHEN NEW.note_id <> '{}'
                 BEGIN SELECT RAISE(ABORT, 'forced duplicate sidecar failure'); END;",
                source.id
            ))
            .expect("duplicate fault trigger");
        let error = store
            .duplicate_note(&source.id)
            .expect_err("duplicate must fail");
        assert!(matches!(error, DataError::Sidecar));
        let duplicate_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE title = 'Atomic duplicate source - копия'",
                [],
                |row| row.get(0),
            )
            .expect("failed duplicate count");
        assert_eq!(duplicate_count, 0);
        assert!(store.get_note(&source.id).is_ok());
    }

    #[test]
    fn restore_revision_rolls_back_document_snapshot_and_sidecars_on_failure() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Atomic restore".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create restore note");
        let first = store
            .update_note_content(persistence_request(
                &note.id,
                0,
                "Первая версия",
                document_from_text("Первая версия"),
                vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "version": "first" }),
                }],
            ))
            .expect("save first restore version");
        force_revision_due(&store, &note.id);
        let second = store
            .update_note_content(persistence_request(
                &note.id,
                first.content_version,
                "Вторая версия",
                document_from_text("Вторая версия"),
                vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "version": "second" }),
                }],
            ))
            .expect("save second restore version");
        let revision_id: String = store
            .conn
            .query_row(
                "SELECT id FROM note_revisions WHERE note_id = ?1 AND content_markdown = 'Первая версия'",
                params![note.id],
                |row| row.get(0),
            )
            .expect("first revision");
        let revision_count_before = note_revision_count(&store, &note.id);
        store
            .conn
            .execute_batch(
                "CREATE TEMP TRIGGER fail_restored_sidecar
                 BEFORE INSERT ON note_content_sidecars
                 BEGIN SELECT RAISE(ABORT, 'forced restore sidecar failure'); END;",
            )
            .expect("restore fault trigger");
        let error = store
            .restore_note_revision(RestoreNoteRevisionRequest {
                note_id: note.id.clone(),
                revision_id,
                expected_content_version: second.content_version,
            })
            .expect_err("restore must fail");
        assert!(matches!(error, DataError::Sidecar));
        let persisted = store.get_note(&note.id).expect("second version remains");
        assert_eq!(persisted.content_markdown, "Вторая версия");
        assert_eq!(persisted.content_version, second.content_version);
        assert_eq!(
            note_sidecar_payload(&store, &note.id, "editor_node_attrs_v1"),
            json!({ "version": "second" })
        );
        assert_eq!(note_revision_count(&store, &note.id), revision_count_before);
    }

    #[test]
    fn stale_save_cannot_overwrite_newer_committed_content() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Stale write".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create stale note");
        let newer = store
            .update_note_content(persistence_request(
                &note.id,
                0,
                "Save B — новое состояние",
                document_from_text("Save B — новое состояние"),
                vec![],
            ))
            .expect("newer save wins");
        let stale_error = store
            .update_note_content(persistence_request(
                &note.id,
                0,
                "Save A — старое состояние",
                document_from_text("Save A — старое состояние"),
                vec![],
            ))
            .expect_err("stale save must fail");
        assert!(matches!(stale_error, DataError::StaleWrite));
        let persisted = store.get_note(&note.id).expect("newer note remains");
        assert_eq!(persisted.content_markdown, "Save B — новое состояние");
        assert_eq!(persisted.content_version, newer.content_version);
        assert_eq!(note_revision_count(&store, &note.id), 0);
    }

    #[test]
    fn content_version_migration_preserves_existing_notes() {
        let dir = temp_store_dir();
        create_v6_database_with_notes(&dir);
        let store = DataStore::open(dir).expect("migrate existing database");
        let preserved = store
            .get_note("v6-note-preserved")
            .expect("preserved migrated note");
        assert_eq!(preserved.content_version, 0);
        let migration_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = 12 AND name = 'note_content_versions'",
                [],
                |row| row.get(0),
            )
            .expect("content version migration marker");
        assert_eq!(migration_count, 1);
    }

    #[test]
    fn revision_retention_migration_adds_metadata_without_changing_note_content() {
        let dir = temp_store_dir();
        create_v6_database_with_notes(&dir);
        let store = DataStore::open(dir).expect("migrate database to revision retention");
        let note = store
            .get_note("v6-note-preserved")
            .expect("legacy note remains readable");
        assert_eq!(note.content_markdown, "Существующий **Markdown**");

        let note_columns = store
            .conn
            .prepare("PRAGMA table_info(notes)")
            .expect("prepare note columns")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query note columns")
            .collect::<Result<HashSet<_>, _>>()
            .expect("collect note columns");
        let revision_columns = store
            .conn
            .prepare("PRAGMA table_info(note_revisions)")
            .expect("prepare revision columns")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query revision columns")
            .collect::<Result<HashSet<_>, _>>()
            .expect("collect revision columns");
        assert!(note_columns.contains("revision_checkpoint_at"));
        assert!(revision_columns.contains("snapshot_hash"));
        assert!(revision_columns.contains("revision_kind"));
        let migration_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations
                 WHERE version = 13 AND name = 'revision_retention'",
                [],
                |row| row.get(0),
            )
            .expect("revision retention migration marker");
        assert_eq!(migration_count, 1);
    }

    #[test]
    fn note_persistence_performance_probe() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Persistence performance".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create performance note");

        let short_started = std::time::Instant::now();
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 0,
                content_json: document_from_text("Короткая заметка"),
                content_markdown: "Короткая заметка".to_string(),
                content_html: "<p>Короткая заметка</p>".to_string(),
                content_sidecars: vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "blocks": [] }),
                }],
                plain_text: "Короткая заметка".to_string(),
            })
            .expect("save short note");
        let short_elapsed = short_started.elapsed();

        let long_text = "Длинная заметка с русским текстом. ".repeat(8_000);
        let long_started = std::time::Instant::now();
        let long = store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: 1,
                content_json: document_from_text(&long_text),
                content_markdown: long_text.clone(),
                content_html: format!("<p>{long_text}</p>"),
                content_sidecars: vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "blocks": [{ "type": "table" }] }),
                }],
                plain_text: long_text,
            })
            .expect("save long note");
        let long_elapsed = long_started.elapsed();

        force_revision_due(&store, &note.id);
        let periodic_started = std::time::Instant::now();
        let periodic = store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: long.content_version,
                content_json: document_from_text("После periodic checkpoint"),
                content_markdown: "После periodic checkpoint".to_string(),
                content_html: "<p>После periodic checkpoint</p>".to_string(),
                content_sidecars: vec![],
                plain_text: "После periodic checkpoint".to_string(),
            })
            .expect("save periodic checkpoint");
        let periodic_elapsed = periodic_started.elapsed();

        let heavy_payload = "A".repeat(1024 * 1024);
        let heavy_started = std::time::Instant::now();
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: periodic.content_version,
                content_json: document_from_text("Image attrs"),
                content_markdown: "![image](attachment://image)".to_string(),
                content_html: "<p>Image attrs</p>".to_string(),
                content_sidecars: vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "imageData": heavy_payload }),
                }],
                plain_text: "Image attrs".to_string(),
            })
            .expect("save large sidecar");
        let heavy_elapsed = heavy_started.elapsed();

        let restore_note = store
            .create_note(CreateNoteRequest {
                title: "Restore performance".to_string(),
                note_date: "2026-08-26".to_string(),
            })
            .expect("create restore performance note");
        let restore_baseline = store
            .update_note_content(persistence_request(
                &restore_note.id,
                0,
                "Короткая версия для restore",
                document_from_text("Короткая версия для restore"),
                vec![],
            ))
            .expect("save restore baseline");
        force_revision_due(&store, &restore_note.id);
        let restore_current = store
            .update_note_content(persistence_request(
                &restore_note.id,
                restore_baseline.content_version,
                "Текущее состояние перед restore",
                document_from_text("Текущее состояние перед restore"),
                vec![],
            ))
            .expect("create restore checkpoint");
        let revision_id: String = store
            .conn
            .query_row(
                "SELECT id FROM note_revisions WHERE note_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
                params![restore_note.id],
                |row| row.get(0),
            )
            .expect("periodic revision id");
        let restore_started = std::time::Instant::now();
        store
            .restore_note_revision(RestoreNoteRevisionRequest {
                note_id: restore_note.id,
                revision_id,
                expected_content_version: restore_current.content_version,
            })
            .expect("restore periodic revision");
        let restore_elapsed = restore_started.elapsed();

        println!(
            "NOTE_PERSISTENCE_PERF short_us={} long_ms={} periodic_ms={} sidecar_1mb_ms={} restore_ms={}",
            short_elapsed.as_micros(),
            long_elapsed.as_millis(),
            periodic_elapsed.as_millis(),
            heavy_elapsed.as_millis(),
            restore_elapsed.as_millis()
        );
    }

    fn test_png_bytes(seed: u8) -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        bytes.extend([seed; 64]);
        bytes
    }

    fn store_test_image(
        store: &mut DataStore,
        note_id: &str,
        name: &str,
        seed: u8,
    ) -> AttachmentDto {
        store
            .store_attachment(StoreAttachmentRequest {
                note_id: note_id.to_string(),
                kind: "image".to_string(),
                original_name: name.to_string(),
                mime_type: "image/png".to_string(),
                original_attachment_id: None,
                edit_metadata: None,
                bytes: test_png_bytes(seed),
            })
            .expect("store test image")
            .attachment
    }

    fn write_sized_test_file(path: &Path, size_bytes: u64, image: bool) {
        let mut file = File::create(path).expect("create sized source");
        if image {
            file.write_all(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a])
                .expect("write image signature");
        } else {
            file.write_all(b"NoteFlow attachment performance fixture")
                .expect("write file prefix");
        }
        file.set_len(size_bytes).expect("size source");
        file.sync_all().expect("sync source");
    }

    fn store_sized_path_attachment(
        store: &mut DataStore,
        note_id: &str,
        file_name: &str,
        size_bytes: u64,
        kind: &str,
    ) -> (AttachmentDto, std::time::Duration) {
        let source = store.base_dir.join(file_name);
        write_sized_test_file(&source, size_bytes, kind == "image");
        let started = std::time::Instant::now();
        let attachment = store
            .store_attachment_from_path(StoreAttachmentPathRequest {
                note_id: note_id.to_string(),
                kind: kind.to_string(),
                source_path: source.to_string_lossy().to_string(),
                original_attachment_id: None,
                edit_metadata: None,
            })
            .expect("store sized attachment")
            .attachment;
        (attachment, started.elapsed())
    }

    fn image_document(attachment: &AttachmentDto, alignment: &str) -> Value {
        json!({
            "type": "doc",
            "content": [{
                "type": "image",
                "attrs": {
                    "alignment": alignment,
                    "attachmentId": attachment.id,
                    "editedAttachmentId": attachment.id,
                    "editMetadata": { "mode": "draw", "version": 1 },
                    "height": 480,
                    "originalAttachmentId": attachment.id,
                    "originalSrc": attachment.asset_uri,
                    "src": attachment.asset_uri,
                    "width": 640
                }
            }]
        })
    }

    fn save_image_note(
        store: &mut DataStore,
        note: &NoteDto,
        attachment: &AttachmentDto,
    ) -> NoteDto {
        let uri = attachment.asset_uri.as_deref().expect("asset uri");
        let document = image_document(attachment, "center");
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: note.content_version,
                content_json: document.clone(),
                content_markdown: format!("![Иллюстрация]({uri})"),
                content_html: format!("<img src=\"{uri}\" alt=\"Иллюстрация\">"),
                content_sidecars: vec![NoteContentSidecarInput {
                    kind: "editor_node_attrs_v1".to_string(),
                    schema_version: 1,
                    payload_json: json!({ "images": [{ "index": 0, "type": "image", "attrs": document["content"][0]["attrs"] }] }),
                }],
                plain_text: "Иллюстрация".to_string(),
            })
            .expect("save image note")
    }

    #[test]
    fn managed_image_ingest_persists_only_logical_references() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Canonical image".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("create note");
        let attachment = store_test_image(&mut store, &note.id, "пример.png", 7);
        let saved = save_image_note(&mut store, &note, &attachment);
        let persisted = format!(
            "{}{}{}{}",
            saved.content_markdown,
            saved.content_html,
            saved.content_json,
            saved
                .content_sidecars
                .iter()
                .map(|sidecar| sidecar.payload_json.to_string())
                .collect::<String>()
        );
        assert!(persisted.contains(assets::ASSET_URI_PREFIX));
        assert!(!persisted.contains("data:image/"));
        assert!(!persisted.contains("file:///"));
        let reopened = store.get_note(&note.id).expect("reopen managed image");
        let attrs = &reopened.content_json["content"][0]["attrs"];
        assert_eq!(attrs["alignment"], "center");
        assert_eq!(attrs["width"], 640);
        assert_eq!(attrs["height"], 480);
        assert_eq!(attrs["editMetadata"]["mode"], "draw");
        assert_eq!(attrs["src"], attachment.asset_uri.as_deref().expect("uri"));
        let reference_count: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM note_asset_refs WHERE note_id = ?1",
                params![note.id],
                |row| row.get(0),
            )
            .expect("asset refs");
        assert_eq!(reference_count, 1);
    }

    #[test]
    fn canonical_persistence_rejects_runtime_and_absolute_resource_paths() {
        let request = |markdown: &str, source: &str| UpdateNoteContentRequest {
            note_id: "note".to_string(),
            expected_content_version: 0,
            content_json: json!({"type":"doc","content":[{"type":"image","attrs":{"src":source}}]}),
            content_markdown: markdown.to_string(),
            content_html: format!("<img src=\"{source}\">"),
            content_sidecars: vec![],
            plain_text: String::new(),
        };
        for (markdown, source) in [
            (r"![private](C:\private\image.png)", r"C:\private\image.png"),
            ("![runtime](blob:temporary)", "blob:temporary"),
            (
                "![local](file:///private/image.png)",
                "file:///private/image.png",
            ),
        ] {
            assert!(matches!(
                validate_note_content_request(&request(markdown, source)),
                Err(DataError::Serialization)
            ));
        }
        assert!(validate_note_content_request(&request(
            "![external](https://example.com/image.png)",
            "https://example.com/image.png",
        ))
        .is_ok());
    }

    #[test]
    fn sha256_deduplicates_same_content_with_different_names() {
        let mut store = temp_store();
        let first = store
            .create_note(CreateNoteRequest {
                title: "First asset".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("first note");
        let second = store
            .create_note(CreateNoteRequest {
                title: "Second asset".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("second note");
        let left = store_test_image(&mut store, &first.id, "left.png", 9);
        let right = store_test_image(&mut store, &second.id, "right.png", 9);
        assert_eq!(left.blob_id, right.blob_id);
        assert_eq!(left.storage_rel_path, right.storage_rel_path);
        let blobs: i64 = store
            .conn
            .query_row("SELECT COUNT(*) FROM asset_blobs", [], |row| row.get(0))
            .expect("blob count");
        assert_eq!(blobs, 1);
    }

    #[test]
    fn generic_file_path_ingest_streams_into_managed_storage_and_resolves_only_by_id() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Generic attachment".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let source = store.base_dir.join("исходный файл.txt");
        fs::write(&source, "данные вложения").expect("source file");
        let stored = store
            .store_attachment_from_path(StoreAttachmentPathRequest {
                note_id: note.id,
                kind: "file".to_string(),
                source_path: source.to_string_lossy().to_string(),
                original_attachment_id: None,
                edit_metadata: None,
            })
            .expect("path ingest");
        let resolved = store
            .resolve_attachment_path(&stored.attachment.id)
            .expect("resolve by id");
        assert_ne!(resolved, source);
        assert_eq!(
            fs::read_to_string(resolved).expect("managed content"),
            "данные вложения"
        );
        assert!(stored.attachment.storage_rel_path.starts_with("assets/"));
        assert_eq!(
            store
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM note_attachment_refs WHERE attachment_id = ?1",
                    params![stored.attachment.id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("provisional ownership"),
            1
        );
        let gc = assets::collect_garbage(&mut store.conn, &store.base_dir)
            .expect("provisional ownership survives gc");
        assert_eq!(gc.attachments_deleted, 0);
        assert!(store
            .resolve_attachment_path(&stored.attachment.id)
            .expect("owned attachment still resolves")
            .is_file());
        assert!(store
            .resolve_attachment_path(&source.to_string_lossy())
            .expect_err("arbitrary path rejected")
            .to_string()
            .contains("не найдено"));
    }

    #[test]
    fn garbage_collection_removes_unregistered_ingest_orphans() {
        let mut store = temp_store();
        let prepared = assets::prepare_blob_from_bytes(
            &store.base_dir,
            &test_png_bytes(10),
            "image/png",
            true,
        )
        .expect("staged blob");
        let orphan_path = store.base_dir.join(&prepared.relative_path);
        assert!(orphan_path.is_file());
        let stats = assets::collect_garbage(&mut store.conn, &store.base_dir)
            .expect("collect unregistered orphan");
        assert_eq!(stats.files_deleted, 1);
        assert!(!orphan_path.exists());
    }

    #[test]
    fn garbage_collection_retries_filesystem_failure_without_losing_metadata() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "GC retry".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let attachment = store_test_image(&mut store, &note.id, "retry.png", 12);
        let blob_id = attachment.blob_id.as_deref().expect("blob id").to_string();
        let (blob_path, _) =
            assets::resolve_blob_path(&store.conn, &store.base_dir, &blob_id).expect("blob path");
        fs::remove_file(&blob_path).expect("replace blob with directory");
        fs::create_dir(&blob_path).expect("blocking directory");
        store
            .conn
            .execute(
                "DELETE FROM note_attachment_refs WHERE attachment_id = ?1",
                params![attachment.id],
            )
            .expect("release provisional attachment ref");
        store
            .conn
            .execute(
                "DELETE FROM note_asset_refs WHERE note_id = ?1 AND blob_id = ?2",
                params![note.id, blob_id],
            )
            .expect("release provisional asset ref");

        let first = assets::collect_garbage(&mut store.conn, &store.base_dir)
            .expect("safe failed deletion");
        assert_eq!(first.attachments_deleted, 1);
        assert_eq!(first.blobs_deleted, 0);
        assert_eq!(
            store
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM asset_blobs WHERE id = ?1",
                    params![blob_id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("blob metadata retained"),
            1
        );

        fs::remove_dir(&blob_path).expect("remove blocking directory");
        fs::write(&blob_path, test_png_bytes(12)).expect("restore orphan file");
        let second =
            assets::collect_garbage(&mut store.conn, &store.base_dir).expect("retry deletion");
        assert_eq!(second.blobs_deleted, 1);
        assert_eq!(second.files_deleted, 1);
        assert!(!blob_path.exists());
    }

    #[test]
    fn duplicate_owns_independent_attachments_and_survives_source_delete() {
        let mut store = temp_store();
        let source = store
            .create_note(CreateNoteRequest {
                title: "Source image".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("source note");
        let source_attachment = store_test_image(&mut store, &source.id, "shared.png", 11);
        save_image_note(&mut store, &source, &source_attachment);
        let duplicate = store.duplicate_note(&source.id).expect("duplicate note");
        assert_eq!(duplicate.attachments.len(), 1);
        assert_ne!(duplicate.attachments[0].id, source_attachment.id);
        assert_eq!(duplicate.attachments[0].blob_id, source_attachment.blob_id);
        assert!(!duplicate.content_markdown.contains(&source_attachment.id));
        store
            .delete_note_permanently(&source.id)
            .expect("delete source permanently");
        let reopened = store.get_note(&duplicate.id).expect("duplicate remains");
        let blob_id = reopened.attachments[0]
            .blob_id
            .as_deref()
            .expect("duplicate blob");
        let (path, _) = assets::resolve_blob_path(&store.conn, &store.base_dir, blob_id)
            .expect("duplicate blob resolves");
        assert!(path.is_file());
    }

    #[test]
    fn retained_revision_protects_blob_and_pruning_releases_it() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Revision asset".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let attachment = store_test_image(&mut store, &note.id, "history.png", 13);
        let image_state = save_image_note(&mut store, &note, &attachment);
        force_revision_due(&store, &note.id);
        store
            .update_note_content(persistence_request(
                &note.id,
                image_state.content_version,
                "Изображение удалено из текущей версии",
                document_from_text("Изображение удалено из текущей версии"),
                vec![],
            ))
            .expect("save state without image");
        let revision_refs: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM revision_asset_refs r
                 INNER JOIN note_revisions n ON n.id = r.revision_id
                 WHERE n.note_id = ?1",
                params![note.id],
                |row| row.get(0),
            )
            .expect("revision refs");
        assert_eq!(revision_refs, 1);
        assets::collect_garbage(&mut store.conn, &store.base_dir).expect("safe gc");
        assert_eq!(
            store
                .conn
                .query_row("SELECT COUNT(*) FROM asset_blobs", [], |row| row
                    .get::<_, i64>(0))
                .expect("protected blob"),
            1
        );
        store
            .conn
            .execute(
                "DELETE FROM note_revisions WHERE note_id = ?1",
                params![note.id],
            )
            .expect("prune revision fixture");
        let stats = assets::collect_garbage(&mut store.conn, &store.base_dir).expect("gc orphan");
        assert_eq!(stats.blobs_deleted, 1);
        assert_eq!(stats.files_deleted, 1);
    }

    #[test]
    fn legacy_note_and_revision_data_urls_migrate_restartably() {
        use base64::Engine as _;

        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Legacy image".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let bytes = test_png_bytes(15);
        let data_url = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        );
        let document = json!({ "type": "doc", "content": [{ "type": "image", "attrs": { "src": data_url } }] });
        store
            .conn
            .execute(
                "UPDATE notes SET content_json = ?1, content_markdown = ?2, content_html = ?3 WHERE id = ?4",
                params![
                    document.to_string(),
                    format!("![legacy]({data_url})"),
                    format!("<img src=\"{data_url}\">"),
                    note.id
                ],
            )
            .expect("inject legacy note");
        let revision_id = Uuid::new_v4().to_string();
        store
            .conn
            .execute(
                "INSERT INTO note_revisions (
                    id, note_id, content_json, content_markdown, content_html, plain_text,
                    created_at, snapshot_hash, revision_kind
                 ) VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, NULL, 'legacy')",
                params![
                    revision_id,
                    note.id,
                    document.to_string(),
                    format!("![legacy]({data_url})"),
                    format!("<img src=\"{data_url}\">"),
                    now_iso()
                ],
            )
            .expect("inject legacy revision");
        store
            .conn
            .execute(
                "INSERT OR REPLACE INTO note_content_sidecars
                 (note_id, kind, schema_version, payload_json, created_at, updated_at)
                 VALUES (?1, 'editor_node_attrs_v1', 1, ?2, ?3, ?3)",
                params![
                    note.id,
                    json!({"images":[{"attrs":{"src":data_url}}]}).to_string(),
                    now_iso()
                ],
            )
            .expect("inject legacy note sidecar");
        store
            .conn
            .execute(
                "INSERT INTO note_revision_sidecars
                 (revision_id, kind, schema_version, payload_json, created_at)
                 VALUES (?1, 'editor_node_attrs_v1', 1, ?2, ?3)",
                params![
                    revision_id,
                    json!({"images":[{"attrs":{"src":data_url}}]}).to_string(),
                    now_iso()
                ],
            )
            .expect("inject legacy revision sidecar");
        assets::run_startup_maintenance(&mut store.conn, &store.base_dir, &now_iso())
            .expect("first migration");
        assets::run_startup_maintenance(&mut store.conn, &store.base_dir, &now_iso())
            .expect("restart migration");
        let remaining: i64 = store
            .conn
            .query_row(
                "SELECT
                    (SELECT COUNT(*) FROM notes WHERE content_json LIKE '%data:image/%'
                        OR content_markdown LIKE '%data:image/%' OR content_html LIKE '%data:image/%')
                    + (SELECT COUNT(*) FROM note_revisions WHERE content_json LIKE '%data:image/%'
                        OR content_markdown LIKE '%data:image/%' OR content_html LIKE '%data:image/%')
                    + (SELECT COUNT(*) FROM note_content_sidecars WHERE payload_json LIKE '%data:image/%')
                    + (SELECT COUNT(*) FROM note_revision_sidecars WHERE payload_json LIKE '%data:image/%')",
                [],
                |row| row.get(0),
            )
            .expect("legacy count");
        assert_eq!(remaining, 0);
        assert_eq!(
            store
                .conn
                .query_row("SELECT COUNT(*) FROM asset_blobs", [], |row| row
                    .get::<_, i64>(0))
                .expect("deduplicated legacy blob"),
            1
        );
        let file_hash = assets::sha256_file(
            &assets::resolve_blob_path(
                &store.conn,
                &store.base_dir,
                &format!("{:x}", Sha256::digest(&bytes)),
            )
            .expect("legacy blob path")
            .0,
        )
        .expect("legacy blob hash");
        assert_eq!(file_hash, format!("{:x}", Sha256::digest(&bytes)));
    }

    #[test]
    fn malformed_legacy_data_url_is_rejected_without_echoing_payload() {
        let error = assets::decode_legacy_data_url("data:image/png;base64,not-valid-***")
            .expect_err("malformed data url rejected");
        let message = error.to_string();
        assert!(message.contains("повреждён"));
        assert!(!message.contains("not-valid"));
    }

    #[test]
    fn old_v5_backup_with_legacy_data_url_imports_into_canonical_storage() {
        use base64::Engine as _;

        let mut source = temp_store();
        let note = source
            .create_note(CreateNoteRequest {
                title: "Old backup image".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let bytes = test_png_bytes(16);
        let data_url = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        );
        source
            .conn
            .execute(
                "UPDATE notes SET content_json = ?1, content_markdown = ?2, content_html = ?3
                 WHERE id = ?4",
                params![
                    json!({"type":"doc","content":[{"type":"image","attrs":{"src":data_url}}]})
                        .to_string(),
                    format!("![old]({data_url})"),
                    format!("<img src=\"{data_url}\">"),
                    note.id
                ],
            )
            .expect("legacy payload");
        let mut manifest = source.collect_backup_data().expect("backup data");
        manifest.version = 5;
        manifest.asset_blobs.clear();
        manifest.note_asset_refs.clear();
        manifest.revision_asset_refs.clear();
        manifest.note_attachment_refs.clear();
        manifest.revision_attachment_refs.clear();
        let backup = backup_bytes_from_value(
            &serde_json::to_value(manifest).expect("manifest value"),
            &[],
        );
        let mut target = temp_store();
        target
            .import_backup(ImportBackupRequest {
                file_name: "legacy-v5.zip".to_string(),
                bytes: backup,
            })
            .expect("legacy import");
        let restored = target.get_note(&note.id).expect("restored note");
        assert!(restored.content_markdown.contains(assets::ASSET_URI_PREFIX));
        assert!(!restored.content_markdown.contains("data:image/"));
        assert_eq!(
            target
                .conn
                .query_row("SELECT COUNT(*) FROM asset_blobs", [], |row| row
                    .get::<_, i64>(0))
                .expect("canonical blob"),
            1
        );
    }

    #[test]
    fn backup_stores_deduplicated_blob_once_and_restores_refs() {
        let mut source = temp_store();
        let first = source
            .create_note(CreateNoteRequest {
                title: "Backup asset one".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("first");
        let second = source
            .create_note(CreateNoteRequest {
                title: "Backup asset two".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("second");
        let first_attachment = store_test_image(&mut source, &first.id, "one.png", 17);
        let second_attachment = store_test_image(&mut source, &second.id, "two.png", 17);
        save_image_note(&mut source, &first, &first_attachment);
        save_image_note(&mut source, &second, &second_attachment);
        let backup = source.create_backup().expect("backup");
        let bytes = fs::read(&backup.path).expect("backup bytes");
        let mut archive = ZipArchive::new(Cursor::new(bytes.clone())).expect("backup zip");
        let asset_entries = (0..archive.len())
            .filter(|index| {
                archive
                    .by_index(*index)
                    .map(|entry| entry.name().starts_with("files/assets/"))
                    .unwrap_or(false)
            })
            .count();
        assert_eq!(asset_entries, 1);
        let mut target = temp_store();
        target
            .import_backup(ImportBackupRequest {
                file_name: "canonical-assets.zip".to_string(),
                bytes,
            })
            .expect("restore backup");
        assert_eq!(
            target
                .conn
                .query_row("SELECT COUNT(*) FROM asset_blobs", [], |row| row
                    .get::<_, i64>(0))
                .expect("restored blob"),
            1
        );
        assert_eq!(
            target
                .conn
                .query_row("SELECT COUNT(*) FROM note_asset_refs", [], |row| row
                    .get::<_, i64>(0))
                .expect("restored refs"),
            2
        );
    }

    #[test]
    fn backup_rejects_tampered_or_noncanonical_blob_files_before_restore() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Backup integrity".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let attachment = store_test_image(&mut store, &note.id, "integrity.png", 18);
        save_image_note(&mut store, &note, &attachment);
        let backup = backup_bytes_for_store(&store);
        let manifest = backup_value_from_bytes(&backup);
        let path = manifest["assetBlobs"][0]["storage_rel_path"]
            .as_str()
            .expect("blob path");
        let entry_name = format!("files/{path}");
        let tampered = backup_bytes_from_value(
            &manifest,
            &[(entry_name.as_str(), b"tampered blob".as_slice())],
        );
        let validated = validate_backup_archive(&tampered).expect("manifest validation");
        assert!(stage_backup_files(&store.base_dir, &tampered, &validated).is_err());

        let mut noncanonical = manifest;
        let blob_id = noncanonical["assetBlobs"][0]["id"]
            .as_str()
            .expect("blob id")
            .to_string();
        let wrong_path = format!("assets/ff/ff/{blob_id}");
        noncanonical["assetBlobs"][0]["storage_rel_path"] = json!(wrong_path);
        noncanonical["attachments"][0]["storage_rel_path"] =
            noncanonical["assetBlobs"][0]["storage_rel_path"].clone();
        let wrong_entry = format!(
            "files/{}",
            noncanonical["assetBlobs"][0]["storage_rel_path"]
                .as_str()
                .expect("wrong path")
        );
        let bytes = test_png_bytes(18);
        let noncanonical_archive =
            backup_bytes_from_value(&noncanonical, &[(wrong_entry.as_str(), bytes.as_slice())]);
        assert!(validate_backup_archive(&noncanonical_archive).is_err());
    }

    #[test]
    fn portable_markdown_export_rewrites_internal_asset_uri() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Portable export".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let attachment = store_test_image(&mut store, &note.id, "диаграмма.png", 19);
        save_image_note(&mut store, &note, &attachment);
        let export = store
            .export_note_markdown(&note.id)
            .expect("portable export");
        let markdown = fs::read_to_string(&export.path).expect("export markdown");
        assert!(!markdown.contains(assets::ASSET_URI_PREFIX));
        assert!(markdown.contains("Portable_export.assets/диаграмма.png"));
        assert!(store
            .base_dir
            .join("exports")
            .join("Portable_export.assets")
            .join("диаграмма.png")
            .is_file());
    }

    #[test]
    fn portable_markdown_export_handles_legacy_assets_without_attachment_rows() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Legacy portable".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let blob = assets::prepare_blob_from_bytes(
            &store.base_dir,
            &test_png_bytes(20),
            "image/png",
            true,
        )
        .expect("blob");
        let transaction = store.conn.transaction().expect("transaction");
        assets::register_blob(&transaction, &blob, &now_iso()).expect("register blob");
        transaction.commit().expect("commit blob");
        let uri = assets::asset_uri(&blob.id);
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: note.content_version,
                content_json: json!({"type":"doc","content":[{"type":"image","attrs":{"src":uri,"alt":"Legacy"}}]}),
                content_markdown: format!("![Legacy]({uri})"),
                content_html: format!("<img src=\"{uri}\" alt=\"Legacy\">"),
                content_sidecars: vec![],
                plain_text: "Legacy".to_string(),
            })
            .expect("save canonical legacy asset");
        let export = store
            .export_note_markdown(&note.id)
            .expect("portable export");
        let markdown = fs::read_to_string(export.path).expect("markdown");
        assert!(!markdown.contains(assets::ASSET_URI_PREFIX));
        assert!(markdown.contains("Legacy_portable.assets/asset-"));
    }

    #[test]
    fn portable_markdown_export_uses_collision_safe_unicode_names() {
        let mut store = temp_store();
        let note = store
            .create_note(CreateNoteRequest {
                title: "Collision export".to_string(),
                note_date: "2026-08-30".to_string(),
            })
            .expect("note");
        let first = store_test_image(&mut store, &note.id, "схема.png", 21);
        let second = store_test_image(&mut store, &note.id, "схема.png", 22);
        let first_uri = first.asset_uri.as_deref().expect("first uri");
        let second_uri = second.asset_uri.as_deref().expect("second uri");
        store
            .update_note_content(UpdateNoteContentRequest {
                note_id: note.id.clone(),
                expected_content_version: note.content_version,
                content_json: json!({"type":"doc","content":[
                    {"type":"image","attrs":{"src":first_uri,"attachmentId":first.id}},
                    {"type":"image","attrs":{"src":second_uri,"attachmentId":second.id}}
                ]}),
                content_markdown: format!("![one]({first_uri})\n\n![two]({second_uri})"),
                content_html: format!("<img src=\"{first_uri}\"><img src=\"{second_uri}\">"),
                content_sidecars: vec![],
                plain_text: "one two".to_string(),
            })
            .expect("save images");
        let export = store.export_note_markdown(&note.id).expect("export");
        let markdown = fs::read_to_string(export.path).expect("markdown");
        assert!(markdown.contains("Collision_export.assets/схема.png"));
        assert!(markdown.contains("Collision_export.assets/схема (2).png"));
        assert!(store
            .base_dir
            .join("exports/Collision_export.assets/схема.png")
            .is_file());
        assert!(store
            .base_dir
            .join("exports/Collision_export.assets/схема (2).png")
            .is_file());
    }

    #[test]
    fn canonical_asset_performance_and_revision_growth_probe() {
        let mut store = temp_store();
        let create_note = |store: &mut DataStore, title: &str| {
            store
                .create_note(CreateNoteRequest {
                    title: title.to_string(),
                    note_date: "2026-08-30".to_string(),
                })
                .expect("performance note")
        };
        let note_100k = create_note(&mut store, "Image 100K");
        let note_5m = create_note(&mut store, "Image 5M");
        let note_20m = create_note(&mut store, "Image 20M");
        let note_50m = create_note(&mut store, "File 50M");
        let (_, image_100k) = store_sized_path_attachment(
            &mut store,
            &note_100k.id,
            "image-100k.png",
            100 * 1024,
            "image",
        );
        let (_, image_5m) = store_sized_path_attachment(
            &mut store,
            &note_5m.id,
            "image-5m.png",
            5 * 1024 * 1024,
            "image",
        );
        let (image_attachment, image_20m) = store_sized_path_attachment(
            &mut store,
            &note_20m.id,
            "image-20m.png",
            20 * 1024 * 1024,
            "image",
        );
        let (_, file_50m) = store_sized_path_attachment(
            &mut store,
            &note_50m.id,
            "file-50m.bin",
            50 * 1024 * 1024,
            "file",
        );
        let save_started = std::time::Instant::now();
        let saved = save_image_note(&mut store, &note_20m, &image_attachment);
        let save_elapsed = save_started.elapsed();
        let duplicate_started = std::time::Instant::now();
        let duplicate = store
            .duplicate_note(&note_20m.id)
            .expect("duplicate image note");
        let duplicate_elapsed = duplicate_started.elapsed();
        assert_eq!(
            duplicate.attachments[0].blob_id, image_attachment.blob_id,
            "duplicate shares immutable blob"
        );

        let content_json = saved.content_json.to_string();
        let snapshot = revisions::RevisionSnapshot {
            content_json: &content_json,
            content_markdown: &saved.content_markdown,
            content_html: &saved.content_html,
            plain_text: &saved.plain_text,
        };
        let revision_started = std::time::Instant::now();
        for index in 0..60 {
            let transaction = store.conn.transaction().expect("revision transaction");
            revisions::insert_revision(
                &transaction,
                &note_20m.id,
                &snapshot,
                RevisionKind::Periodic,
                &format!("asset-perf-{index}"),
                &format!("2026-08-30T12:{index:02}:00Z"),
            )
            .expect("logical revision");
            transaction.commit().expect("revision commit");
        }
        let revision_elapsed = revision_started.elapsed();
        let revision_payload_chars: i64 = store
            .conn
            .query_row(
                "SELECT COALESCE(SUM(
                    LENGTH(r.content_json) + LENGTH(r.content_markdown) + LENGTH(r.content_html)
                    + COALESCE((SELECT SUM(LENGTH(s.payload_json))
                                FROM note_revision_sidecars s WHERE s.revision_id = r.id), 0)
                 ), 0)
                 FROM note_revisions r WHERE r.note_id = ?1",
                params![note_20m.id],
                |row| row.get(0),
            )
            .expect("revision payload");
        let revision_refs: i64 = store
            .conn
            .query_row(
                "SELECT COUNT(*) FROM revision_asset_refs r
                 INNER JOIN note_revisions n ON n.id = r.revision_id
                 WHERE n.note_id = ?1",
                params![note_20m.id],
                |row| row.get(0),
            )
            .expect("revision refs");
        assert_eq!(revision_refs, 60);
        assert!(revision_payload_chars < 250_000);
        assert!(!saved.content_json.to_string().contains("data:image/"));
        println!(
            "ASSET_PERF image_100k_ms={} image_5m_ms={} image_20m_ms={} file_50m_ms={} save_us={} duplicate_ms={} revisions_60_ms={} revisions_60_payload_chars={}",
            image_100k.as_millis(),
            image_5m.as_millis(),
            image_20m.as_millis(),
            file_50m.as_millis(),
            save_elapsed.as_micros(),
            duplicate_elapsed.as_millis(),
            revision_elapsed.as_millis(),
            revision_payload_chars
        );
    }
}
