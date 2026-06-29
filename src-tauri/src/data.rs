use crate::llm;
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Cursor, Read},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{App, Manager, State};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

pub(crate) type DataResult<T> = Result<T, DataError>;

const DATABASE_FILE: &str = "database.sqlite";
const CURRENT_BACKUP_VERSION: u32 = 2;
const UI_SETTINGS_KEY: &str = "ui.settings.v1";

#[derive(Debug)]
pub enum DataError {
    Io(std::io::Error),
    Json(serde_json::Error),
    Sql(rusqlite::Error),
    Zip(zip::result::ZipError),
    InvalidInput(String),
    NotFound(String),
    State(String),
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
    pub project_id: Option<String>,
    pub project: String,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub pinned_at: Option<String>,
    pub icon_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
    pub tags: Vec<NoteTagDto>,
    pub attachments: Vec<AttachmentDto>,
    pub word_count: usize,
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
            editor_content_width: clamp_i64(self.editor_content_width, 560, 1440),
            editor_content_offset: clamp_i64(self.editor_content_offset, -720, 720),
        }
    }
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
    pub content_json: Value,
    pub content_markdown: String,
    pub content_html: String,
    pub plain_text: String,
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
pub struct CreateTagRequest {
    pub name: String,
    pub color: String,
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
pub struct ImportBackupRequest {
    pub file_name: String,
    pub bytes: Vec<u8>,
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
    archived_at: Option<String>,
    deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupData {
    version: u32,
    exported_at: String,
    projects: Vec<ProjectBackup>,
    tags: Vec<TagBackup>,
    notes: Vec<NoteBackup>,
    note_tags: Vec<NoteTagBackup>,
    attachments: Vec<AttachmentBackup>,
    #[serde(default)]
    llm_providers: Vec<llm::LlmProviderBackup>,
    app_settings: Vec<SettingBackup>,
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
    mime_type: String,
    size_bytes: i64,
    original_attachment_id: Option<String>,
    #[serde(default)]
    edit_metadata: Option<Value>,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SettingBackup {
    key: String,
    value_json: Value,
    updated_at: String,
}

pub struct AppState {
    store: Mutex<DataStore>,
}

impl AppState {
    fn new(store: DataStore) -> Self {
        Self {
            store: Mutex::new(store),
        }
    }

    fn with_store<T>(&self, action: impl FnOnce(&mut DataStore) -> DataResult<T>) -> DataResult<T> {
        let mut store = self
            .store
            .lock()
            .map_err(|_| DataError::State("Хранилище данных временно недоступно".to_string()))?;
        action(&mut store)
    }
}

pub fn init_state(app: &mut App) -> Result<AppState, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Не удалось определить директорию данных: {error}"))?;
    DataStore::open(data_dir)
        .map(AppState::new)
        .map_err(command_error)
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
        Self::run_migrations(&mut conn)?;
        let mut store = Self { base_dir, conn };
        store.seed_demo_data_if_needed()?;
        Ok(store)
    }

    fn run_migrations(conn: &mut Connection) -> DataResult<()> {
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
        }

        Ok(())
    }

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
                        n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at
                 FROM notes n
                 LEFT JOIN projects p ON p.id = n.project_id
                 WHERE n.deleted_at IS NULL AND (?1 OR n.archived_at IS NULL)
                 ORDER BY n.is_pinned DESC, n.pinned_at DESC, n.updated_at DESC",
                params![include_archived],
            )?
        } else if let Some(fts_query) = build_fts_query(&trimmed_query) {
            match self.query_note_rows(
                "SELECT n.id, n.title, n.note_date, n.content_json, n.content_markdown, n.content_html,
                        n.plain_text, n.project_id, COALESCE(p.title, 'Входящие') AS project_title,
                        n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at
                 FROM notes n
                 LEFT JOIN projects p ON p.id = n.project_id
                 WHERE n.deleted_at IS NULL
                   AND (?1 OR n.archived_at IS NULL)
                   AND n.id IN (SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?2)
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
                    n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at
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
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn note_dto_from_row(&self, row: NoteRow) -> DataResult<NoteDto> {
        let content_json =
            serde_json::from_str(&row.content_json).unwrap_or_else(|_| empty_document());
        let tags = self.get_note_tags(&row.id)?;
        let attachments = self.get_note_attachments(&row.id)?;
        let word_count = count_words(&row.plain_text);

        Ok(NoteDto {
            id: row.id,
            title: row.title,
            note_date: row.note_date,
            content_json,
            content_markdown: row.content_markdown,
            content_html: row.content_html,
            plain_text: row.plain_text,
            project_id: row.project_id,
            project: row.project,
            is_favorite: row.is_favorite,
            is_pinned: row.is_pinned,
            pinned_at: row.pinned_at,
            icon_key: row.icon_key,
            created_at: row.created_at,
            updated_at: row.updated_at,
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
                    n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at
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
            "SELECT id, note_id, kind, original_name, storage_rel_path, mime_type, size_bytes,
                    original_attachment_id, edit_metadata_json, created_at
             FROM attachments
             WHERE note_id = ?1
             ORDER BY created_at",
        )?;
        let rows = statement.query_map(params![note_id], attachment_from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn create_note(&mut self, request: CreateNoteRequest) -> DataResult<NoteDto> {
        let title = normalize_required_text(&request.title, "Название заметки")?;
        validate_iso_date(&request.note_date)?;
        let now = now_iso();
        let note_id = Uuid::new_v4().to_string();
        let default_tag_id = self.ensure_tag("новая", "blue")?;
        let project_id = self.ensure_project("Входящие", "Быстрые заметки без проекта")?;

        self.conn.execute(
            "INSERT INTO notes (
                id, title, note_date, content_json, content_markdown, content_html, plain_text,
                project_id, is_favorite, icon, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, '', '', '', ?5, 0, 'doc', ?6, ?6)",
            params![
                note_id,
                title,
                request.note_date,
                empty_document().to_string(),
                project_id,
                now
            ],
        )?;
        self.conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            params![note_id, default_tag_id],
        )?;
        self.refresh_note_search_index(&note_id)?;
        self.get_note(&note_id)
    }

    fn update_note_content(&mut self, request: UpdateNoteContentRequest) -> DataResult<NoteDto> {
        let current = self.get_note(&request.note_id)?;
        let now = now_iso();
        self.conn.execute(
            "INSERT INTO note_revisions (
                id, note_id, content_json, content_markdown, content_html, plain_text, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                request.note_id,
                current.content_json.to_string(),
                current.content_markdown,
                current.content_html,
                current.plain_text,
                now
            ],
        )?;
        self.conn.execute(
            "UPDATE notes
             SET content_json = ?1, content_markdown = ?2, content_html = ?3, plain_text = ?4, updated_at = ?5
             WHERE id = ?6 AND deleted_at IS NULL",
            params![
                request.content_json.to_string(),
                request.content_markdown,
                request.content_html,
                request.plain_text,
                now,
                request.note_id
            ],
        )?;
        self.refresh_note_search_index(&request.note_id)?;
        self.get_note(&request.note_id)
    }

    fn rename_note(&mut self, request: RenameNoteRequest) -> DataResult<NoteDto> {
        let title = normalize_required_text(&request.title, "Название заметки")?;
        self.conn.execute(
            "UPDATE notes SET title = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL",
            params![title, now_iso(), request.note_id],
        )?;
        self.refresh_note_search_index(&request.note_id)?;
        self.get_note(&request.note_id)
    }

    fn duplicate_note(&mut self, note_id: &str) -> DataResult<NoteDto> {
        let source = self.get_note(note_id)?;
        let new_id = Uuid::new_v4().to_string();
        let now = now_iso();
        self.conn.execute(
            "INSERT INTO notes (
                id, title, note_date, content_json, content_markdown, content_html, plain_text,
                project_id, is_favorite, icon, icon_key, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 'doc', ?9, ?10, ?10)",
            params![
                new_id,
                format!("{} - копия", source.title),
                source.note_date,
                source.content_json.to_string(),
                source.content_markdown,
                source.content_html,
                source.plain_text,
                source.project_id,
                source.icon_key,
                now
            ],
        )?;

        for tag in source.tags {
            self.conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![new_id, tag.id],
            )?;
        }

        self.refresh_note_search_index(&new_id)?;
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
        self.refresh_note_search_index(&request.note_id)?;
        self.get_note(&request.note_id)
    }

    fn archive_note(&mut self, note_id: &str) -> DataResult<()> {
        self.conn.execute(
            "UPDATE notes SET archived_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now_iso(), note_id],
        )?;
        self.refresh_note_search_index(note_id)?;
        Ok(())
    }

    fn restore_note(&mut self, note_id: &str) -> DataResult<NoteDto> {
        self.conn.execute(
            "UPDATE notes SET archived_at = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now_iso(), note_id],
        )?;
        self.refresh_note_search_index(note_id)?;
        self.get_note(note_id)
    }

    fn delete_note(&mut self, note_id: &str) -> DataResult<()> {
        self.conn.execute(
            "UPDATE notes SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now_iso(), note_id],
        )?;
        self.conn
            .execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
        Ok(())
    }

    fn delete_note_permanently(&mut self, note_id: &str) -> DataResult<()> {
        let attachments = self.get_note_attachments(note_id)?;
        for attachment in attachments {
            let path = self.resolve_storage_path(&attachment.storage_rel_path)?;
            if path.exists() {
                fs::remove_file(path)?;
            }
        }
        self.conn
            .execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
        self.conn
            .execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
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
        let name = normalize_required_text(&request.name, "Название тега")?;
        let tag_id = self.ensure_tag(&name, &request.color)?;
        self.list_tags(None)?
            .into_iter()
            .find(|tag| tag.id == tag_id)
            .ok_or_else(|| DataError::NotFound("Тег не найден после создания".to_string()))
    }

    fn rename_tag(&mut self, request: RenameTagRequest) -> DataResult<Vec<TagRowDto>> {
        let name = normalize_required_text(&request.name, "Название тега")?;
        self.conn.execute(
            "UPDATE tags SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now_iso(), request.tag_id],
        )?;
        self.rebuild_search_index()?;
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
        self.rebuild_search_index()?;
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
        self.rebuild_search_index()?;
        self.list_tags(None)
    }

    fn ensure_project(&mut self, title: &str, description: &str) -> DataResult<String> {
        if let Some(project_id) = self
            .conn
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
        self.conn.execute(
            "INSERT INTO projects (id, title, description, color, icon_key, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'blue', 'project', 'active', ?4, ?4)",
            params![project_id, title, description, now],
        )?;
        Ok(project_id)
    }

    fn ensure_tag(&mut self, name: &str, color: &str) -> DataResult<String> {
        if let Some(tag_id) = self
            .conn
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
        self.conn.execute(
            "INSERT INTO tags (id, name, color, icon_key, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![tag_id, name, normalize_tag_color(color), icon_key, now],
        )?;
        Ok(tag_id)
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
        let table = if kind == "Проект" {
            "projects"
        } else {
            "notes"
        };
        self.conn.execute(
            &format!("UPDATE {table} SET archived_at = NULL, updated_at = ?1 WHERE id = ?2"),
            params![now_iso(), item_id],
        )?;
        if table == "notes" {
            self.refresh_note_search_index(item_id)?;
        } else {
            self.rebuild_search_index()?;
        }
        Ok(())
    }

    fn delete_archive_item(&mut self, item_id: &str, kind: &str) -> DataResult<()> {
        if kind == "Проект" {
            self.conn
                .execute("DELETE FROM projects WHERE id = ?1", params![item_id])?;
            self.rebuild_search_index()?;
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
        if request.bytes.is_empty() {
            return Err(DataError::InvalidInput("Файл пустой".to_string()));
        }

        let kind = if request.kind == "image" {
            "image"
        } else {
            "file"
        };
        if kind == "image" && !is_supported_image_file(&request.mime_type, &request.original_name) {
            return Err(DataError::InvalidInput(
                "Поддерживаются только изображения PNG, JPEG и WebP".to_string(),
            ));
        }
        if let Some(original_attachment_id) = &request.original_attachment_id {
            self.ensure_original_image_attachment(&request.note_id, original_attachment_id)?;
        }
        let folder = if kind == "image" {
            "images"
        } else {
            "attachments"
        };
        let safe_name = sanitize_file_name(&request.original_name);
        let attachment_id = Uuid::new_v4().to_string();
        let relative_path = format!("{folder}/{}/{}-{safe_name}", request.note_id, attachment_id);
        let absolute_path = self.resolve_storage_path(&relative_path)?;
        if let Some(parent) = absolute_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&absolute_path, &request.bytes)?;

        let attachment = AttachmentDto {
            id: attachment_id,
            note_id: request.note_id,
            kind: kind.to_string(),
            original_name: request.original_name,
            storage_rel_path: relative_path,
            mime_type: request.mime_type,
            size_bytes: i64::try_from(request.bytes.len()).unwrap_or(i64::MAX),
            original_attachment_id: request.original_attachment_id,
            edit_metadata: request.edit_metadata.unwrap_or_else(|| json!({})),
            created_at: now_iso(),
        };
        self.conn.execute(
            "INSERT INTO attachments (
                id, note_id, kind, original_name, storage_rel_path, mime_type, size_bytes,
                original_attachment_id, edit_metadata_json, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
                attachment.created_at
            ],
        )?;

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
        let file_name = format!("{}.md", sanitize_file_name(&note.title));
        let relative_path = format!("exports/{file_name}");
        let path = self.resolve_storage_path(&relative_path)?;
        fs::write(&path, note.content_markdown)?;
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
        self.write_note_attachments_to_zip(&mut zip, &note.attachments)?;
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
                    n.is_favorite, n.is_pinned, n.pinned_at, n.icon_key, n.created_at, n.updated_at, n.archived_at, n.deleted_at
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
            self.write_note_attachments_to_zip(&mut zip, &note.attachments)?;
        }
        zip.finish()?;

        Ok(export_result(
            path,
            relative_path,
            "ZIP-экспорт проекта создан",
        ))
    }

    fn create_backup(&self) -> DataResult<ExportResultDto> {
        let backup_data = self.collect_backup_data()?;
        let stamp = Utc::now().format("%Y%m%d-%H%M%S");
        let relative_path = format!("backups/noteflow-backup-{stamp}.zip");
        let path = self.resolve_storage_path(&relative_path)?;
        let file = File::create(&path)?;
        let mut zip = ZipWriter::new(file);
        let options = zip_options();
        let backup_json = serde_json::to_vec_pretty(&backup_data)?;

        zip.start_file("noteflow-backup.json", options)?;
        std::io::copy(&mut Cursor::new(backup_json), &mut zip)?;
        for attachment in &backup_data.attachments {
            let source = self.resolve_storage_path(&attachment.storage_rel_path)?;
            if source.exists() {
                zip.start_file(format!("files/{}", attachment.storage_rel_path), options)?;
                let mut file = File::open(source)?;
                std::io::copy(&mut file, &mut zip)?;
            }
        }
        zip.finish()?;

        Ok(export_result(
            path,
            relative_path,
            "Резервная копия базы создана",
        ))
    }

    fn import_backup(&mut self, request: ImportBackupRequest) -> DataResult<WorkspaceSnapshotDto> {
        if request.bytes.is_empty() {
            return Err(DataError::InvalidInput(
                "Файл резервной копии пустой".to_string(),
            ));
        }

        let cache_name = format!(
            "import-{}-{}",
            Uuid::new_v4(),
            sanitize_file_name(&request.file_name)
        );
        let cache_relative = format!("cache/{cache_name}");
        let cache_path = self.resolve_storage_path(&cache_relative)?;
        fs::write(cache_path, &request.bytes)?;

        let reader = Cursor::new(request.bytes);
        let mut archive = ZipArchive::new(reader)?;
        let backup_json = {
            let mut backup_file = archive.by_name("noteflow-backup.json")?;
            let mut json_text = String::new();
            backup_file.read_to_string(&mut json_text)?;
            json_text
        };
        let backup_data: BackupData = serde_json::from_str(&backup_json)?;
        if backup_data.version > CURRENT_BACKUP_VERSION {
            return Err(DataError::InvalidInput(
                "Резервная копия создана более новой версией NoteFlow".to_string(),
            ));
        }

        let transaction = self.conn.transaction()?;
        transaction.execute("DELETE FROM note_tags", [])?;
        transaction.execute("DELETE FROM attachments", [])?;
        transaction.execute("DELETE FROM note_revisions", [])?;
        transaction.execute("DELETE FROM ai_messages", [])?;
        transaction.execute("DELETE FROM ai_chats", [])?;
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
                    project_id, is_favorite, is_pinned, pinned_at, icon, icon_key, created_at, updated_at, archived_at, deleted_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
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
                    note.deleted_at
                ],
            )?;
        }
        for note_tag in &backup_data.note_tags {
            transaction.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![note_tag.note_id, note_tag.tag_id],
            )?;
        }
        for attachment in &backup_data.attachments {
            transaction.execute(
                "INSERT INTO attachments (
                    id, note_id, kind, original_name, storage_rel_path, mime_type, size_bytes,
                    original_attachment_id, edit_metadata_json, created_at
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
                    attachment.created_at
                ],
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
        transaction.commit()?;

        for attachment in &backup_data.attachments {
            let zip_path = format!("files/{}", attachment.storage_rel_path);
            if let Ok(mut zip_file) = archive.by_name(&zip_path) {
                let output_path = self.resolve_storage_path(&attachment.storage_rel_path)?;
                if let Some(parent) = output_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                let mut output = File::create(output_path)?;
                std::io::copy(&mut zip_file, &mut output)?;
            }
        }

        self.rebuild_search_index()?;
        self.load_workspace()
    }

    fn write_note_attachments_to_zip(
        &self,
        zip: &mut ZipWriter<File>,
        attachments: &[AttachmentDto],
    ) -> DataResult<()> {
        let options = zip_options();
        for attachment in attachments {
            let source = self.resolve_storage_path(&attachment.storage_rel_path)?;
            if source.exists() {
                zip.start_file(format!("attachments/{}", attachment.original_name), options)?;
                let mut file = File::open(source)?;
                std::io::copy(&mut file, zip)?;
            }
        }
        Ok(())
    }

    fn collect_backup_data(&self) -> DataResult<BackupData> {
        Ok(BackupData {
            version: CURRENT_BACKUP_VERSION,
            exported_at: now_iso(),
            projects: self.collect_projects_backup()?,
            tags: self.collect_tags_backup()?,
            notes: self.collect_notes_backup()?,
            note_tags: self.collect_note_tags_backup()?,
            attachments: self.collect_attachments_backup()?,
            llm_providers: llm::collect_provider_backups(&self.conn)?,
            app_settings: self.collect_settings_backup()?,
        })
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
                    project_id, is_favorite, is_pinned, pinned_at, icon, icon_key, created_at, updated_at, archived_at, deleted_at
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
            "SELECT id, note_id, kind, original_name, storage_rel_path, mime_type, size_bytes,
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
                mime_type: row.get(5)?,
                size_bytes: row.get(6)?,
                original_attachment_id: row.get(7)?,
                edit_metadata: serde_json::from_str::<Value>(&row.get::<_, String>(8)?).ok(),
                created_at: row.get(9)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn collect_settings_backup(&self) -> DataResult<Vec<SettingBackup>> {
        let mut statement = self.conn.prepare(
            "SELECT key, value_json, updated_at
             FROM app_settings
             WHERE lower(key) NOT LIKE '%api%' AND lower(key) NOT LIKE '%secret%' AND lower(key) NOT LIKE '%key%'
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

    fn refresh_note_search_index(&self, note_id: &str) -> DataResult<()> {
        let row = self
            .conn
            .query_row(
                "SELECT n.title, n.plain_text, COALESCE(p.title, '')
                 FROM notes n
                 LEFT JOIN projects p ON p.id = n.project_id
                 WHERE n.id = ?1 AND n.deleted_at IS NULL",
                params![note_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        self.conn
            .execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
        if let Some((title, plain_text, project_title)) = row {
            let tag_names = self
                .conn
                .query_row(
                    "SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '')
                     FROM tags t
                     INNER JOIN note_tags nt ON nt.tag_id = t.id
                     WHERE nt.note_id = ?1",
                    params![note_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
                .unwrap_or_default();
            self.conn.execute(
                "INSERT INTO notes_fts (note_id, title, plain_text, tag_names, project_title)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![note_id, title, plain_text, tag_names, project_title],
            )?;
        }
        Ok(())
    }

    fn rebuild_search_index(&self) -> DataResult<()> {
        self.conn.execute("DELETE FROM notes_fts", [])?;
        let mut statement = self
            .conn
            .prepare("SELECT id FROM notes WHERE deleted_at IS NULL")?;
        let note_ids = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);
        for note_id in note_ids {
            self.refresh_note_search_index(&note_id)?;
        }
        Ok(())
    }

    fn resolve_storage_path(&self, relative_path: &str) -> DataResult<PathBuf> {
        ensure_safe_relative_path(relative_path)?;
        Ok(self.base_dir.join(relative_path))
    }
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
    ]
}

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

        for tag_id in note.tags {
            transaction.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                params![note.id, tag_id],
            )?;
        }
    }
    Ok(())
}

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
    let edit_metadata_json: String = row.get(8)?;
    Ok(AttachmentDto {
        id: row.get(0)?,
        note_id: row.get(1)?,
        kind: row.get(2)?,
        original_name: row.get(3)?,
        storage_rel_path: row.get(4)?,
        mime_type: row.get(5)?,
        size_bytes: row.get(6)?,
        original_attachment_id: row.get(7)?,
        edit_metadata: serde_json::from_str(&edit_metadata_json).unwrap_or_else(|_| json!({})),
        created_at: row.get(9)?,
    })
}

fn ensure_storage_dirs(base_dir: &Path) -> DataResult<()> {
    fs::create_dir_all(base_dir)?;
    for folder in ["attachments", "images", "exports", "backups", "cache"] {
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

fn is_supported_image_file(mime_type: &str, file_name: &str) -> bool {
    let normalized_mime = mime_type.trim().to_lowercase();
    if matches!(
        normalized_mime.as_str(),
        "image/png" | "image/jpeg" | "image/jpg" | "image/webp"
    ) {
        return true;
    }

    let extension = Path::new(file_name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_lowercase();
    matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp")
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

fn normalize_required_text(value: &str, field_name: &str) -> DataResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(DataError::InvalidInput(format!(
            "{field_name} не может быть пустым"
        )));
    }
    Ok(trimmed.to_string())
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

fn plain_text_to_html(text: &str) -> String {
    if text.trim().is_empty() {
        String::new()
    } else {
        format!("<p>{}</p>", escape_html(text))
    }
}

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

fn build_fts_query(query: &str) -> Option<String> {
    let terms = query
        .split(|character: char| !character.is_alphanumeric())
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .map(|term| format!("{term}*"))
        .collect::<Vec<_>>();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

fn command_error(error: DataError) -> String {
    error.to_string()
}

#[tauri::command]
pub fn load_workspace(state: State<'_, AppState>) -> Result<WorkspaceSnapshotDto, String> {
    state
        .with_store(|store| store.load_workspace())
        .map_err(command_error)
}

#[tauri::command]
pub fn get_ui_settings(state: State<'_, AppState>) -> Result<UiSettingsDto, String> {
    state
        .with_store(|store| store.get_ui_settings())
        .map_err(command_error)
}

#[tauri::command]
pub fn update_ui_settings(
    request: UiSettingsDto,
    state: State<'_, AppState>,
) -> Result<UiSettingsDto, String> {
    state
        .with_store(|store| store.update_ui_settings(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_llm_providers(state: State<'_, AppState>) -> Result<Vec<llm::LlmProviderDto>, String> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.list_llm_providers(&storage))
        .map_err(command_error)
}

#[tauri::command]
pub fn save_llm_provider(
    request: llm::SaveLlmProviderRequest,
    state: State<'_, AppState>,
) -> Result<llm::LlmProviderDto, String> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.save_llm_provider(&storage, request))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_llm_provider(provider_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.delete_llm_provider(&storage, &provider_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn set_default_llm_provider(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmProviderDto, String> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.set_default_llm_provider(&storage, &provider_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_llm_provider_key(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmProviderDto, String> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.delete_llm_provider_key(&storage, &provider_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn check_llm_provider_key(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmKeyStatusDto, String> {
    let storage = llm::SystemSecretStorage;
    state
        .with_store(|store| store.check_llm_provider_key(&storage, &provider_id))
        .map_err(command_error)
}

#[tauri::command]
pub async fn list_llm_models(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmModelsResultDto, String> {
    let provider = state
        .with_store(|store| store.get_llm_provider_record(&provider_id))
        .map_err(command_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        match llm::list_models_for_provider(&provider, &storage, &http) {
            Ok(result) => result,
            Err(error) => llm::models_error_result(error),
        }
    })
    .await
    .map_err(|error| format!("Получение списка моделей было прервано: {error}"))
}

#[tauri::command]
pub async fn test_llm_provider(
    provider_id: String,
    state: State<'_, AppState>,
) -> Result<llm::LlmConnectionTestResultDto, String> {
    let provider = state
        .with_store(|store| store.get_llm_provider_record(&provider_id))
        .map_err(command_error)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let storage = llm::SystemSecretStorage;
        let http = llm::CurlHttpClient;
        match llm::test_provider_connection(&provider, &storage, &http) {
            Ok(result) => result,
            Err(error) => llm::connection_error_result(&provider, error),
        }
    })
    .await
    .map_err(|error| format!("Проверка подключения была прервана: {error}"))?;
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
) -> Result<Vec<NoteDto>, String> {
    state
        .with_store(|store| store.list_notes(query, include_archived))
        .map_err(command_error)
}

#[tauri::command]
pub fn create_note(
    request: CreateNoteRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, String> {
    state
        .with_store(|store| store.create_note(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn update_note_content(
    request: UpdateNoteContentRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, String> {
    state
        .with_store(|store| store.update_note_content(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn rename_note(
    request: RenameNoteRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, String> {
    state
        .with_store(|store| store.rename_note(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn duplicate_note(note_id: String, state: State<'_, AppState>) -> Result<NoteDto, String> {
    state
        .with_store(|store| store.duplicate_note(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn toggle_note_pin(note_id: String, state: State<'_, AppState>) -> Result<NoteDto, String> {
    state
        .with_store(|store| store.toggle_note_pin(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn move_note_to_project(
    request: MoveNoteRequest,
    state: State<'_, AppState>,
) -> Result<NoteDto, String> {
    state
        .with_store(|store| store.move_note_to_project(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn archive_note(note_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .with_store(|store| store.archive_note(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn restore_note(note_id: String, state: State<'_, AppState>) -> Result<NoteDto, String> {
    state
        .with_store(|store| store.restore_note(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_note(note_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .with_store(|store| store.delete_note(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_note_permanently(note_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .with_store(|store| store.delete_note_permanently(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_projects(
    include_archived: bool,
    state: State<'_, AppState>,
) -> Result<Vec<ProjectCardDto>, String> {
    state
        .with_store(|store| store.list_projects(include_archived))
        .map_err(command_error)
}

#[tauri::command]
pub fn create_project(
    request: CreateProjectRequest,
    state: State<'_, AppState>,
) -> Result<ProjectCardDto, String> {
    state
        .with_store(|store| store.create_project(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_tags(
    query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, String> {
    state
        .with_store(|store| store.list_tags(query))
        .map_err(command_error)
}

#[tauri::command]
pub fn create_tag(
    request: CreateTagRequest,
    state: State<'_, AppState>,
) -> Result<TagRowDto, String> {
    state
        .with_store(|store| store.create_tag(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn rename_tag(
    request: RenameTagRequest,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, String> {
    state
        .with_store(|store| store.rename_tag(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn update_tag_color(
    request: UpdateTagColorRequest,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, String> {
    state
        .with_store(|store| store.update_tag_color(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_tag(tag_id: String, state: State<'_, AppState>) -> Result<Vec<TagRowDto>, String> {
    state
        .with_store(|store| store.delete_tag(&tag_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn merge_tags(
    request: MergeTagsRequest,
    state: State<'_, AppState>,
) -> Result<Vec<TagRowDto>, String> {
    state
        .with_store(|store| store.merge_tags(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn list_archive(
    query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ArchiveItemDto>, String> {
    state
        .with_store(|store| store.list_archive(query))
        .map_err(command_error)
}

#[tauri::command]
pub fn restore_archive_item(
    item_id: String,
    kind: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .with_store(|store| store.restore_archive_item(&item_id, &kind))
        .map_err(command_error)
}

#[tauri::command]
pub fn delete_archive_item(
    item_id: String,
    kind: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .with_store(|store| store.delete_archive_item(&item_id, &kind))
        .map_err(command_error)
}

#[tauri::command]
pub fn store_attachment(
    request: StoreAttachmentRequest,
    state: State<'_, AppState>,
) -> Result<AttachmentStoreResultDto, String> {
    state
        .with_store(|store| store.store_attachment(request))
        .map_err(command_error)
}

#[tauri::command]
pub fn export_note_markdown(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<ExportResultDto, String> {
    state
        .with_store(|store| store.export_note_markdown(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn export_note_zip(
    note_id: String,
    state: State<'_, AppState>,
) -> Result<ExportResultDto, String> {
    state
        .with_store(|store| store.export_note_zip(&note_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn export_project_zip(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<ExportResultDto, String> {
    state
        .with_store(|store| store.export_project_zip(&project_id))
        .map_err(command_error)
}

#[tauri::command]
pub fn create_backup(state: State<'_, AppState>) -> Result<ExportResultDto, String> {
    state
        .with_store(|store| store.create_backup())
        .map_err(command_error)
}

#[tauri::command]
pub fn import_backup(
    request: ImportBackupRequest,
    state: State<'_, AppState>,
) -> Result<WorkspaceSnapshotDto, String> {
    state
        .with_store(|store| store.import_backup(request))
        .map_err(command_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::SecretStorage;

    fn temp_store() -> DataStore {
        let dir = std::env::temp_dir().join(format!("noteflow-test-{}", Uuid::new_v4()));
        DataStore::open(dir).expect("store opens")
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
                    editor_content_width: 2000,
                    editor_content_offset: -900,
                })
                .expect("save ui settings");

            assert_eq!(saved.theme, "dark");
            assert_eq!(saved.app_zoom_percent, 125);
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
        assert!(settings.sidebar_collapsed);
        assert!(settings.rag_sources_collapsed);
        assert_eq!(settings.last_section, "rag");
        assert_eq!(settings.language, "en");
        assert_eq!(settings.editor_content_width, 1440);
        assert_eq!(settings.editor_content_offset, -720);
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

        assert!(error.to_string().contains("http:// или https://"));
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
                content_json: document_from_text("Текст"),
                content_markdown: "Текст".to_string(),
                content_html: "<p>Текст</p>".to_string(),
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
            })
            .expect("create tag");

        assert_eq!(updated.plain_text, "Текст");
        assert_eq!(moved.project, "Проект теста");
        assert_eq!(tag.name, "тест");
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
                content_json: document_from_text("уникальный маркер"),
                content_markdown: "уникальный маркер".to_string(),
                content_html: "<p>уникальный маркер</p>".to_string(),
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
    fn backup_can_be_imported_into_fresh_store() {
        let mut store = temp_store();
        let pinned_note = store
            .create_note(CreateNoteRequest {
                title: "backup pinned note".to_string(),
                note_date: "2026-06-18".to_string(),
            })
            .expect("create pinned note");
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

        assert!(!snapshot.notes.is_empty());
        assert!(!snapshot.projects.is_empty());
        assert!(!snapshot.tags.is_empty());
        assert!(snapshot
            .notes
            .iter()
            .any(|note| note.title == "backup pinned note" && note.is_pinned));
    }
}
