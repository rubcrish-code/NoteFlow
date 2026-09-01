use crate::data::{DataError, DataResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

const SEARCH_QUERY_MAX_CHARS: usize = 256;
const SEARCH_RESULT_LIMIT_MAX: i64 = 100;
const SEARCH_RESULT_OFFSET_MAX: i64 = 100_000;

pub const SEARCH_MIGRATION_SQL: &str = r#"
    CREATE VIRTUAL TABLE IF NOT EXISTS note_search_fts USING fts5(
        note_id UNINDEXED,
        title,
        plain_text,
        tags_text,
        project_text,
        tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS note_search_notes_insert
    AFTER INSERT ON notes
    BEGIN
        DELETE FROM note_search_fts WHERE note_id = NEW.id;
        INSERT INTO note_search_fts (note_id, title, plain_text, tags_text, project_text)
        SELECT n.id, COALESCE(n.title, ''), COALESCE(n.plain_text, ''),
               COALESCE((
                   SELECT GROUP_CONCAT(t.name, ' ')
                   FROM note_tags nt
                   INNER JOIN tags t ON t.id = nt.tag_id
                   WHERE nt.note_id = n.id
               ), ''),
               COALESCE(p.title, '')
        FROM notes n
        LEFT JOIN projects p ON p.id = n.project_id
        WHERE n.id = NEW.id AND n.deleted_at IS NULL;
    END;

    CREATE TRIGGER IF NOT EXISTS note_search_notes_update
    AFTER UPDATE OF title, plain_text, project_id, deleted_at ON notes
    BEGIN
        DELETE FROM note_search_fts WHERE note_id = NEW.id;
        INSERT INTO note_search_fts (note_id, title, plain_text, tags_text, project_text)
        SELECT n.id, COALESCE(n.title, ''), COALESCE(n.plain_text, ''),
               COALESCE((
                   SELECT GROUP_CONCAT(t.name, ' ')
                   FROM note_tags nt
                   INNER JOIN tags t ON t.id = nt.tag_id
                   WHERE nt.note_id = n.id
               ), ''),
               COALESCE(p.title, '')
        FROM notes n
        LEFT JOIN projects p ON p.id = n.project_id
        WHERE n.id = NEW.id AND n.deleted_at IS NULL;
    END;

    CREATE TRIGGER IF NOT EXISTS note_search_notes_delete
    AFTER DELETE ON notes
    BEGIN
        DELETE FROM note_search_fts WHERE note_id = OLD.id;
    END;

    CREATE TRIGGER IF NOT EXISTS note_search_note_tags_insert
    AFTER INSERT ON note_tags
    BEGIN
        DELETE FROM note_search_fts WHERE note_id = NEW.note_id;
        INSERT INTO note_search_fts (note_id, title, plain_text, tags_text, project_text)
        SELECT n.id, COALESCE(n.title, ''), COALESCE(n.plain_text, ''),
               COALESCE((
                   SELECT GROUP_CONCAT(t.name, ' ')
                   FROM note_tags nt
                   INNER JOIN tags t ON t.id = nt.tag_id
                   WHERE nt.note_id = n.id
               ), ''),
               COALESCE(p.title, '')
        FROM notes n
        LEFT JOIN projects p ON p.id = n.project_id
        WHERE n.id = NEW.note_id AND n.deleted_at IS NULL;
    END;

    CREATE TRIGGER IF NOT EXISTS note_search_note_tags_delete
    AFTER DELETE ON note_tags
    BEGIN
        DELETE FROM note_search_fts WHERE note_id = OLD.note_id;
        INSERT INTO note_search_fts (note_id, title, plain_text, tags_text, project_text)
        SELECT n.id, COALESCE(n.title, ''), COALESCE(n.plain_text, ''),
               COALESCE((
                   SELECT GROUP_CONCAT(t.name, ' ')
                   FROM note_tags nt
                   INNER JOIN tags t ON t.id = nt.tag_id
                   WHERE nt.note_id = n.id
               ), ''),
               COALESCE(p.title, '')
        FROM notes n
        LEFT JOIN projects p ON p.id = n.project_id
        WHERE n.id = OLD.note_id AND n.deleted_at IS NULL;
    END;

    CREATE TRIGGER IF NOT EXISTS note_search_tags_update
    AFTER UPDATE OF name ON tags
    BEGIN
        DELETE FROM note_search_fts
        WHERE note_id IN (SELECT note_id FROM note_tags WHERE tag_id = NEW.id);
        INSERT INTO note_search_fts (note_id, title, plain_text, tags_text, project_text)
        SELECT n.id, COALESCE(n.title, ''), COALESCE(n.plain_text, ''),
               COALESCE((
                   SELECT GROUP_CONCAT(t.name, ' ')
                   FROM note_tags nt2
                   INNER JOIN tags t ON t.id = nt2.tag_id
                   WHERE nt2.note_id = n.id
               ), ''),
               COALESCE(p.title, '')
        FROM notes n
        LEFT JOIN projects p ON p.id = n.project_id
        WHERE n.deleted_at IS NULL
          AND n.id IN (SELECT note_id FROM note_tags WHERE tag_id = NEW.id);
    END;

    CREATE TRIGGER IF NOT EXISTS note_search_projects_update
    AFTER UPDATE OF title ON projects
    BEGIN
        DELETE FROM note_search_fts WHERE note_id IN (SELECT id FROM notes WHERE project_id = NEW.id);
        INSERT INTO note_search_fts (note_id, title, plain_text, tags_text, project_text)
        SELECT n.id, COALESCE(n.title, ''), COALESCE(n.plain_text, ''),
               COALESCE((
                   SELECT GROUP_CONCAT(t.name, ' ')
                   FROM note_tags nt
                   INNER JOIN tags t ON t.id = nt.tag_id
                   WHERE nt.note_id = n.id
               ), ''),
               COALESCE(NEW.title, '')
        FROM notes n
        WHERE n.project_id = NEW.id AND n.deleted_at IS NULL;
    END;

    DELETE FROM note_search_fts;
    INSERT INTO note_search_fts (note_id, title, plain_text, tags_text, project_text)
    SELECT n.id, COALESCE(n.title, ''), COALESCE(n.plain_text, ''),
           COALESCE((
               SELECT GROUP_CONCAT(t.name, ' ')
               FROM note_tags nt
               INNER JOIN tags t ON t.id = nt.tag_id
               WHERE nt.note_id = n.id
           ), ''),
           COALESCE(p.title, '')
    FROM notes n
    LEFT JOIN projects p ON p.id = n.project_id
    WHERE n.deleted_at IS NULL;
"#;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesRequest {
    pub query: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub tag_id: Option<String>,
    #[serde(default)]
    pub include_archived: bool,
    #[serde(default)]
    pub favorites_only: bool,
    #[serde(default = "default_search_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_search_limit() -> i64 {
    50
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchTagDto {
    pub id: String,
    pub name: String,
    pub color: String,
    pub custom_color: Option<String>,
    pub icon_key: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNoteResultDto {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
    pub match_source: String,
    pub project_id: Option<String>,
    pub project: String,
    pub tags: Vec<SearchTagDto>,
    pub updated_at: String,
    pub archived: bool,
    pub favorite: bool,
    pub relevance_score: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildSearchIndexResultDto {
    pub indexed_notes: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocumentsRequest {
    #[serde(default)]
    pub include_archived: bool,
    #[serde(default = "default_knowledge_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_knowledge_limit() -> i64 {
    500
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocumentDto {
    pub note_id: String,
    pub title: String,
    pub plain_text: String,
    pub content_markdown: String,
    pub project_id: Option<String>,
    pub project: String,
    pub tags: Vec<SearchTagDto>,
    pub updated_at: String,
    pub revision_count: i64,
    pub latest_revision_at: Option<String>,
}

pub fn search_notes(
    conn: &Connection,
    request: &SearchNotesRequest,
) -> DataResult<Vec<SearchNoteResultDto>> {
    let Some(fts_query) = build_fts_query(&request.query) else {
        return Ok(Vec::new());
    };
    let normalized_query = normalize_search_text(&request.query);
    let terms = search_terms(&request.query)
        .into_iter()
        .map(|term| term.to_lowercase())
        .collect::<Vec<_>>();
    let project_id = request.project_id.as_deref().unwrap_or("").trim();
    let tag_id = request.tag_id.as_deref().unwrap_or("").trim();
    let limit = request.limit.clamp(1, SEARCH_RESULT_LIMIT_MAX);
    let offset = request.offset.clamp(0, SEARCH_RESULT_OFFSET_MAX);

    let mut statement = conn.prepare(
        "SELECT n.id,
                n.title,
                TRIM(snippet(note_search_fts, 2, '', '', ' … ', 28)) AS body_snippet,
                n.project_id,
                COALESCE(p.title, 'Входящие') AS project_title,
                COALESCE((
                    SELECT json_group_array(json_object(
                        'id', t.id,
                        'name', t.name,
                        'color', t.color,
                        'customColor', t.custom_color,
                        'iconKey', t.icon_key
                    ))
                    FROM note_tags nt_json
                    INNER JOIN tags t ON t.id = nt_json.tag_id
                    WHERE nt_json.note_id = n.id
                ), '[]') AS tags_json,
                n.updated_at,
                n.archived_at IS NOT NULL AS archived,
                n.is_favorite,
                (-bm25(note_search_fts, 0.0, 12.0, 1.0, 5.0, 3.0)) AS relevance_score
         FROM note_search_fts
         INNER JOIN notes n ON n.id = note_search_fts.note_id
         LEFT JOIN projects p ON p.id = n.project_id
         WHERE note_search_fts MATCH ?1
           AND n.deleted_at IS NULL
           AND (?2 OR n.archived_at IS NULL)
           AND (?3 = '' OR n.project_id = ?3)
           AND (?4 = '' OR EXISTS (
               SELECT 1 FROM note_tags nt_filter
               WHERE nt_filter.note_id = n.id AND nt_filter.tag_id = ?4
           ))
           AND (NOT ?5 OR n.is_favorite = 1)
         ORDER BY relevance_score DESC, n.updated_at DESC
         LIMIT ?6 OFFSET ?7",
    )?;

    let rows = statement.query_map(
        params![
            fts_query,
            request.include_archived,
            project_id,
            tag_id,
            request.favorites_only,
            limit,
            offset
        ],
        |row| {
            let tags_json: String = row.get(5)?;
            let tags = serde_json::from_str::<Vec<SearchTagDto>>(&tags_json).unwrap_or_default();
            let title: String = row.get(1)?;
            let body_snippet: String = row.get(2)?;
            let project: String = row.get(4)?;
            let normalized_title = normalize_search_text(&title);
            let mut relevance_score: f64 = row.get(9)?;
            if normalized_title == normalized_query {
                relevance_score += 1000.0;
            } else if normalized_title.starts_with(&normalized_query) {
                relevance_score += 100.0;
            }
            Ok(SearchNoteResultDto {
                note_id: row.get(0)?,
                snippet: if body_snippet.is_empty() {
                    title.clone()
                } else {
                    body_snippet
                },
                title,
                match_source: determine_match_source(&normalized_title, &project, &tags, &terms),
                project_id: row.get(3)?,
                project,
                tags,
                updated_at: row.get(6)?,
                archived: row.get::<_, i64>(7)? != 0,
                favorite: row.get::<_, i64>(8)? != 0,
                relevance_score,
            })
        },
    )?;
    let mut results = rows.collect::<Result<Vec<_>, _>>()?;
    results.sort_by(|left, right| {
        right
            .relevance_score
            .total_cmp(&left.relevance_score)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
    });
    Ok(results)
}

fn determine_match_source(
    normalized_title: &str,
    project: &str,
    tags: &[SearchTagDto],
    terms: &[String],
) -> String {
    if terms.iter().all(|term| normalized_title.contains(term)) {
        return "title".to_string();
    }
    if tags.iter().any(|tag| {
        let normalized_tag = tag.name.to_lowercase();
        terms.iter().all(|term| normalized_tag.contains(term))
    }) {
        return "tag".to_string();
    }
    let normalized_project = project.to_lowercase();
    if terms.iter().all(|term| normalized_project.contains(term)) {
        return "project".to_string();
    }
    "text".to_string()
}

pub fn rebuild_search_index(conn: &mut Connection) -> DataResult<RebuildSearchIndexResultDto> {
    let transaction = conn.transaction()?;
    let indexed_notes = rebuild_search_index_transaction(&transaction)?;
    transaction.commit()?;
    Ok(RebuildSearchIndexResultDto { indexed_notes })
}

pub(crate) fn rebuild_search_index_transaction(
    transaction: &rusqlite::Transaction<'_>,
) -> DataResult<i64> {
    transaction.execute("DELETE FROM note_search_fts", [])?;
    transaction.execute(
        "INSERT INTO note_search_fts (note_id, title, plain_text, tags_text, project_text)
         SELECT n.id, COALESCE(n.title, ''), COALESCE(n.plain_text, ''),
                COALESCE((
                    SELECT GROUP_CONCAT(t.name, ' ')
                    FROM note_tags nt
                    INNER JOIN tags t ON t.id = nt.tag_id
                    WHERE nt.note_id = n.id
                ), ''),
                COALESCE(p.title, '')
         FROM notes n
         LEFT JOIN projects p ON p.id = n.project_id
         WHERE n.deleted_at IS NULL",
        [],
    )?;
    transaction
        .query_row("SELECT COUNT(*) FROM note_search_fts", [], |row| row.get(0))
        .map_err(Into::into)
}

pub fn get_knowledge_documents(
    conn: &Connection,
    request: &KnowledgeDocumentsRequest,
) -> DataResult<Vec<KnowledgeDocumentDto>> {
    let limit = request.limit.clamp(1, 10_000);
    let offset = request.offset.clamp(0, SEARCH_RESULT_OFFSET_MAX);
    let mut statement = conn.prepare(
        "SELECT n.id, n.title, n.plain_text, n.content_markdown, n.project_id,
                COALESCE(p.title, 'Входящие'), n.updated_at,
                COALESCE((
                    SELECT json_group_array(json_object(
                        'id', t.id,
                        'name', t.name,
                        'color', t.color,
                        'customColor', t.custom_color,
                        'iconKey', t.icon_key
                    ))
                    FROM note_tags nt_json
                    INNER JOIN tags t ON t.id = nt_json.tag_id
                    WHERE nt_json.note_id = n.id
                ), '[]'),
                COUNT(DISTINCT nr.id), MAX(nr.created_at)
         FROM notes n
         LEFT JOIN projects p ON p.id = n.project_id
         LEFT JOIN note_revisions nr ON nr.note_id = n.id
         WHERE n.deleted_at IS NULL AND (?1 OR n.archived_at IS NULL)
         GROUP BY n.id
         ORDER BY n.updated_at DESC
         LIMIT ?2 OFFSET ?3",
    )?;
    let rows = statement.query_map(
        params![request.include_archived, limit, offset],
        knowledge_document_from_row,
    )?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_knowledge_document_by_note_id(
    conn: &Connection,
    note_id: &str,
) -> DataResult<KnowledgeDocumentDto> {
    conn.query_row(
        "SELECT n.id, n.title, n.plain_text, n.content_markdown, n.project_id,
                COALESCE(p.title, 'Входящие'), n.updated_at,
                COALESCE((
                    SELECT json_group_array(json_object(
                        'id', t.id,
                        'name', t.name,
                        'color', t.color,
                        'customColor', t.custom_color,
                        'iconKey', t.icon_key
                    ))
                    FROM note_tags nt_json
                    INNER JOIN tags t ON t.id = nt_json.tag_id
                    WHERE nt_json.note_id = n.id
                ), '[]'),
                COUNT(DISTINCT nr.id), MAX(nr.created_at)
         FROM notes n
         LEFT JOIN projects p ON p.id = n.project_id
         LEFT JOIN note_revisions nr ON nr.note_id = n.id
         WHERE n.id = ?1 AND n.deleted_at IS NULL
         GROUP BY n.id",
        params![note_id],
        knowledge_document_from_row,
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            DataError::NotFound("Заметка для базы знаний не найдена".to_string())
        }
        other => DataError::Sql(other),
    })
}

fn knowledge_document_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeDocumentDto> {
    let tags_json: String = row.get(7)?;
    let tags = serde_json::from_str::<Vec<SearchTagDto>>(&tags_json).unwrap_or_default();
    Ok(KnowledgeDocumentDto {
        note_id: row.get(0)?,
        title: row.get(1)?,
        plain_text: row.get(2)?,
        content_markdown: row.get(3)?,
        project_id: row.get(4)?,
        project: row.get(5)?,
        updated_at: row.get(6)?,
        revision_count: row.get(8)?,
        latest_revision_at: row.get(9)?,
        tags,
    })
}

pub fn build_fts_query(query: &str) -> Option<String> {
    let terms = search_terms(query);
    if terms.is_empty() {
        return None;
    }
    Some(
        terms
            .into_iter()
            .map(|term| format!("\"{}\"*", term.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND "),
    )
}

fn search_terms(query: &str) -> Vec<String> {
    query
        .chars()
        .take(SEARCH_QUERY_MAX_CHARS)
        .collect::<String>()
        .split(|character: char| !character.is_alphanumeric())
        .filter_map(|term| {
            let trimmed = term.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        })
        .collect()
}

fn normalize_search_text(query: &str) -> String {
    search_terms(query).join(" ").to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn create_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory database");
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL
             );
             CREATE TABLE tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'blue',
                custom_color TEXT,
                icon_key TEXT
             );
             CREATE TABLE notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                plain_text TEXT NOT NULL DEFAULT '',
                content_markdown TEXT NOT NULL DEFAULT '',
                project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
                updated_at TEXT NOT NULL,
                archived_at TEXT,
                deleted_at TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE note_tags (
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (note_id, tag_id)
             );
             CREATE TABLE note_revisions (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
             );",
        )
        .expect("base schema");
        conn
    }

    fn insert_note(
        conn: &Connection,
        id: &str,
        title: &str,
        plain_text: &str,
        project_id: Option<&str>,
        archived: bool,
        favorite: bool,
    ) {
        conn.execute(
            "INSERT INTO notes (
                id, title, plain_text, content_markdown, project_id, updated_at,
                archived_at, deleted_at, is_favorite
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)",
            params![
                id,
                title,
                plain_text,
                format!("# {title}\n\n{plain_text}"),
                project_id,
                "2026-07-11T12:00:00Z",
                archived.then_some("2026-07-11T13:00:00Z"),
                favorite
            ],
        )
        .expect("insert note");
    }

    fn request(query: &str) -> SearchNotesRequest {
        SearchNotesRequest {
            query: query.to_string(),
            project_id: None,
            tag_id: None,
            include_archived: false,
            favorites_only: false,
            limit: 50,
            offset: 0,
        }
    }

    #[test]
    fn migration_backfills_and_searches_ranked_unicode_content() {
        let conn = create_connection();
        conn.execute(
            "INSERT INTO projects (id, title) VALUES ('project-search', 'База знаний')",
            [],
        )
        .expect("project");
        conn.execute(
            "INSERT INTO tags (id, name, color, icon_key) VALUES ('tag-research', 'Исследование', 'green', 'tag')",
            [],
        )
        .expect("tag");
        insert_note(
            &conn,
            "title-match",
            "Поиск знаний",
            "Короткое описание продукта",
            Some("project-search"),
            false,
            true,
        );
        insert_note(
            &conn,
            "body-match",
            "Обычная заметка",
            "Полнотекстовый поиск на русском и English Search content",
            None,
            false,
            false,
        );
        insert_note(
            &conn,
            "archived-match",
            "Архивный поиск",
            "Скрытый результат",
            None,
            true,
            false,
        );
        conn.execute(
            "INSERT INTO note_tags (note_id, tag_id) VALUES ('title-match', 'tag-research')",
            [],
        )
        .expect("note tag");

        conn.execute_batch(SEARCH_MIGRATION_SQL)
            .expect("search migration");
        let fts_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'note_search_fts'",
                [],
                |row| row.get(0),
            )
            .expect("fts table exists");
        assert_eq!(fts_exists, 1);
        let indexed: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_search_fts", [], |row| row.get(0))
            .expect("backfill count");
        assert_eq!(indexed, 3);

        let russian =
            search_notes(&conn, &request("ПОИСК")).expect("case-insensitive Russian search");
        assert_eq!(russian[0].note_id, "title-match");
        assert_eq!(russian[0].match_source, "title");
        assert!(russian.iter().any(|result| result.note_id == "body-match"));
        assert!(!russian
            .iter()
            .any(|result| result.note_id == "archived-match"));

        let prefix = search_notes(&conn, &request("знан")).expect("prefix search");
        assert_eq!(prefix[0].note_id, "title-match");
        let english = search_notes(&conn, &request("english")).expect("English search");
        assert_eq!(english[0].note_id, "body-match");

        let tag = search_notes(&conn, &request("исслед")).expect("tag search");
        assert_eq!(tag[0].match_source, "tag");
        let project = search_notes(&conn, &request("база")).expect("project search");
        assert_eq!(project[0].match_source, "project");

        let mut archived_request = request("поиск");
        archived_request.include_archived = true;
        assert!(search_notes(&conn, &archived_request)
            .expect("archived search")
            .iter()
            .any(|result| result.note_id == "archived-match" && result.archived));

        let mut favorite_request = request("поиск");
        favorite_request.favorites_only = true;
        let favorites = search_notes(&conn, &favorite_request).expect("favorite filter");
        assert_eq!(favorites.len(), 1);
        assert!(favorites[0].favorite);

        let mut project_filter = request("поиск");
        project_filter.project_id = Some("project-search".to_string());
        assert_eq!(
            search_notes(&conn, &project_filter).expect("project filter")[0].note_id,
            "title-match"
        );
        let mut tag_filter = request("поиск");
        tag_filter.tag_id = Some("tag-research".to_string());
        assert_eq!(
            search_notes(&conn, &tag_filter).expect("tag filter")[0].note_id,
            "title-match"
        );

        for unsafe_query in ["", "   ", "\"поиск\" AND:* - ()", "😀😀", "a:b*c-(d)"] {
            search_notes(&conn, &request(unsafe_query)).expect("special query is safe");
        }
        assert!(russian.iter().all(|result| {
            !result.snippet.contains('<')
                && !result.snippet.contains('{')
                && !result.snippet.contains("content_markdown")
        }));
        let markdown: String = conn
            .query_row(
                "SELECT content_markdown FROM notes WHERE id = 'title-match'",
                [],
                |row| row.get(0),
            )
            .expect("canonical Markdown");
        assert_eq!(markdown, "# Поиск знаний\n\nКороткое описание продукта");
    }

    #[test]
    fn triggers_keep_only_affected_search_documents_in_sync() {
        let conn = create_connection();
        conn.execute(
            "INSERT INTO projects (id, title) VALUES ('project-one', 'Первый проект')",
            [],
        )
        .expect("project");
        conn.execute(
            "INSERT INTO projects (id, title) VALUES ('project-two', 'Второй проект')",
            [],
        )
        .expect("second project");
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES ('tag-one', 'Первый тег', 'blue')",
            [],
        )
        .expect("tag");
        conn.execute_batch(SEARCH_MIGRATION_SQL)
            .expect("search migration");

        insert_note(
            &conn,
            "note-one",
            "Начальный заголовок",
            "Первоначальный текст",
            Some("project-one"),
            false,
            false,
        );
        assert_eq!(search_notes(&conn, &request("начальн")).unwrap().len(), 1);

        conn.execute(
            "UPDATE notes SET title = 'Обновлённый заголовок', plain_text = 'Свежий текст' WHERE id = 'note-one'",
            [],
        )
        .expect("update note");
        assert!(search_notes(&conn, &request("начальн")).unwrap().is_empty());
        assert_eq!(search_notes(&conn, &request("свеж")).unwrap().len(), 1);

        conn.execute(
            "INSERT INTO note_tags (note_id, tag_id) VALUES ('note-one', 'tag-one')",
            [],
        )
        .expect("add tag");
        assert_eq!(search_notes(&conn, &request("первый")).unwrap().len(), 1);
        conn.execute(
            "UPDATE tags SET name = 'Новый тег' WHERE id = 'tag-one'",
            [],
        )
        .expect("rename tag");
        assert_eq!(search_notes(&conn, &request("новый")).unwrap().len(), 1);
        conn.execute(
            "DELETE FROM note_tags WHERE note_id = 'note-one' AND tag_id = 'tag-one'",
            [],
        )
        .expect("remove tag");
        assert!(search_notes(&conn, &request("новый")).unwrap().is_empty());

        conn.execute(
            "UPDATE projects SET title = 'Переименованный проект' WHERE id = 'project-one'",
            [],
        )
        .expect("rename project");
        assert_eq!(search_notes(&conn, &request("переимен")).unwrap().len(), 1);
        conn.execute(
            "UPDATE notes SET project_id = 'project-two' WHERE id = 'note-one'",
            [],
        )
        .expect("move note");
        assert!(search_notes(&conn, &request("переимен"))
            .unwrap()
            .is_empty());
        assert_eq!(search_notes(&conn, &request("второй")).unwrap().len(), 1);

        conn.execute_batch(
            "BEGIN;
             INSERT INTO notes (
                id, title, plain_text, content_markdown, project_id, updated_at,
                archived_at, deleted_at, is_favorite
             ) VALUES (
                'rolled-back', 'Транзакционная заметка', 'rollback marker', '', NULL,
                '2026-07-11T12:00:00Z', NULL, NULL, 0
             );
             ROLLBACK;",
        )
        .expect("rolled back insert");
        assert!(search_notes(&conn, &request("rollback"))
            .unwrap()
            .is_empty());

        insert_note(
            &conn,
            "duplicate-note",
            "Обновлённый заголовок копия",
            "Свежий текст копии",
            Some("project-one"),
            false,
            false,
        );
        assert_eq!(search_notes(&conn, &request("свежий")).unwrap().len(), 2);
        conn.execute(
            "UPDATE notes SET deleted_at = '2026-07-11T14:00:00Z' WHERE id = 'note-one'",
            [],
        )
        .expect("soft delete");
        assert_eq!(search_notes(&conn, &request("свежий")).unwrap().len(), 1);
        conn.execute("DELETE FROM notes WHERE id = 'duplicate-note'", [])
            .expect("permanent delete");
        assert!(search_notes(&conn, &request("свежий")).unwrap().is_empty());
    }

    #[test]
    fn rebuild_and_knowledge_documents_read_canonical_note_data() {
        let mut conn = create_connection();
        insert_note(
            &conn,
            "knowledge-note",
            "Knowledge foundation",
            "Canonical plain text",
            None,
            false,
            false,
        );
        conn.execute_batch(SEARCH_MIGRATION_SQL)
            .expect("search migration");
        conn.execute("DELETE FROM note_search_fts", [])
            .expect("damage index");
        let rebuild = rebuild_search_index(&mut conn).expect("rebuild index");
        assert_eq!(rebuild.indexed_notes, 1);
        assert_eq!(search_notes(&conn, &request("canonical")).unwrap().len(), 1);

        conn.execute(
            "INSERT INTO note_revisions (id, note_id, created_at)
             VALUES ('revision-one', 'knowledge-note', '2026-07-11T13:00:00Z')",
            [],
        )
        .expect("revision");
        let document =
            get_knowledge_document_by_note_id(&conn, "knowledge-note").expect("knowledge document");
        assert_eq!(document.plain_text, "Canonical plain text");
        assert_eq!(
            document.content_markdown,
            "# Knowledge foundation\n\nCanonical plain text"
        );
        assert_eq!(document.revision_count, 1);
        assert_eq!(
            document.latest_revision_at.as_deref(),
            Some("2026-07-11T13:00:00Z")
        );
        assert_eq!(
            get_knowledge_documents(
                &conn,
                &KnowledgeDocumentsRequest {
                    include_archived: false,
                    limit: 10,
                    offset: 0,
                }
            )
            .expect("knowledge documents")
            .len(),
            1
        );
    }

    #[derive(Debug)]
    struct SearchPerformanceMetrics {
        database_setup: Duration,
        search_schema: Duration,
        fixture_generation: Duration,
        indexing: Duration,
        query: Duration,
    }

    fn run_ten_thousand_note_search_probe() -> SearchPerformanceMetrics {
        let database_started = Instant::now();
        let mut conn = create_connection();
        let database_setup = database_started.elapsed();

        let schema_started = Instant::now();
        conn.execute_batch(SEARCH_MIGRATION_SQL)
            .expect("search migration");
        let search_schema = schema_started.elapsed();

        let fixture_started = Instant::now();
        let fixtures = (0..10_000)
            .map(|index| {
                let marker = if index == 7_777 {
                    " уникальныймаркер"
                } else {
                    ""
                };
                (
                    format!("note-{index}"),
                    format!("Заметка {index}"),
                    format!("Текст базы знаний номер {index}{marker}"),
                    format!("# Заметка {index}"),
                )
            })
            .collect::<Vec<_>>();
        let fixture_generation = fixture_started.elapsed();

        let indexing_started = Instant::now();
        let transaction = conn.transaction().expect("performance transaction");
        {
            let mut statement = transaction
                .prepare(
                    "INSERT INTO notes (
                        id, title, plain_text, content_markdown, project_id, updated_at,
                        archived_at, deleted_at, is_favorite
                     ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, NULL, NULL, 0)",
                )
                .expect("insert statement");
            for (id, title, plain_text, content_markdown) in fixtures {
                statement
                    .execute(params![
                        id,
                        title,
                        plain_text,
                        content_markdown,
                        "2026-07-11T12:00:00Z"
                    ])
                    .expect("bulk insert note");
            }
        }
        transaction.commit().expect("bulk insert commit");
        let indexing = indexing_started.elapsed();

        let query_started = Instant::now();
        let results = search_notes(&conn, &request("уникальныймар")).expect("performance search");
        let query = query_started.elapsed();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].note_id, "note-7777");
        let indexed_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_search_fts", [], |row| row.get(0))
            .expect("count indexed notes");
        assert_eq!(indexed_count, 10_000);

        SearchPerformanceMetrics {
            database_setup,
            search_schema,
            fixture_generation,
            indexing,
            query,
        }
    }

    #[test]
    fn search_indexes_and_queries_ten_thousand_notes() {
        run_ten_thousand_note_search_probe();
    }

    #[test]
    #[ignore = "machine-sensitive benchmark; run the documented isolated performance command"]
    fn search_performance_on_ten_thousand_notes() {
        let metrics = run_ten_thousand_note_search_probe();
        assert!(
            metrics.query.as_secs_f32() < 5.0,
            "search took {:?}",
            metrics.query
        );
        assert!(
            metrics.indexing.as_secs_f32() < 30.0,
            "bulk indexing took {:?}",
            metrics.indexing
        );
        eprintln!(
            "FTS5 performance: database_setup={:?}, search_schema={:?}, fixture_generation={:?}, indexing={:?}, query={:?}",
            metrics.database_setup,
            metrics.search_schema,
            metrics.fixture_generation,
            metrics.indexing,
            metrics.query
        );
    }
}
