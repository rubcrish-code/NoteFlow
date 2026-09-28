use crate::data::{DataError, DataResult};
use chrono::{Datelike, Duration, Local, NaiveDate, TimeZone, Utc};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

const MAX_LIST_NOTES: i64 = 50;
const MAX_CONTENT_NOTES: i64 = 8;
const MAX_FREQUENCY_NOTES: i64 = 10_000;
const MAX_FREQUENCY_CHARS: usize = 30_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QueryKind {
    Content,
    Clarify,
    MissingScope,
    Count,
    List,
    First,
    Last,
    LastEdited,
    Previous,
    Compare,
    ScopedContent,
    Frequency,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoteOrder {
    CreatedAsc,
    CreatedDesc,
    UpdatedDesc,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ArchiveScope {
    #[default]
    Active,
    Archived,
    All,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DateRange {
    pub start_utc: Option<String>,
    pub end_utc: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NoteFilters {
    pub project_id: Option<String>,
    pub tag_id: Option<String>,
    pub archive: ArchiveScope,
    pub date: DateRange,
    pub date_column: &'static str,
    pub before_created: Option<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct QueryPlan {
    pub kind: QueryKind,
    pub filters: NoteFilters,
    pub order: NoteOrder,
    pub search_query: String,
    pub project_name: Option<String>,
    pub tag_name: Option<String>,
    pub anchor_note_id: Option<String>,
    pub subject_term: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryPreview {
    pub needs_hybrid_retrieval: bool,
    pub search_query: String,
    pub project_id: Option<String>,
    pub tag_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct KnowledgeNote {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub project_id: Option<String>,
    pub project: String,
    pub archived: bool,
    pub pinned: bool,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct FrequentTerm {
    pub term: String,
    pub note_count: usize,
    pub example_note_id: String,
}

#[derive(Clone, Debug)]
pub struct FrequencySummary {
    pub complete: bool,
    pub inspected_notes: usize,
    pub terms: Vec<FrequentTerm>,
}

impl QueryPlan {
    pub fn preview(&self) -> QueryPreview {
        let scoped_hybrid = self.kind == QueryKind::ScopedContent
            && self.anchor_note_id.is_none()
            && (self.filters.project_id.is_some() || self.filters.tag_id.is_some())
            && self.filters.date.start_utc.is_none()
            && self.filters.date.end_utc.is_none()
            && !contains_any(
                &self.search_query.to_lowercase(),
                &["перв", "последн", "предыдущ"],
            );
        QueryPreview {
            needs_hybrid_retrieval: self.kind == QueryKind::Content || scoped_hybrid,
            search_query: self.search_query.clone(),
            project_id: self.filters.project_id.clone(),
            tag_id: self.filters.tag_id.clone(),
        }
    }
}

pub fn note_matches_filters(
    conn: &Connection,
    note_id: &str,
    filters: &NoteFilters,
) -> DataResult<bool> {
    let sql = format!(
        "SELECT 1 FROM notes n WHERE n.id = ?8 AND {}",
        filter_sql(filters)
    );
    Ok(conn
        .query_row(
            &sql,
            params![
                filters.project_id,
                filters.tag_id,
                archive_code(filters.archive),
                filters.date.start_utc,
                filters.date.end_utc,
                filters.before_created.as_ref().map(|(at, _)| at),
                filters.before_created.as_ref().map(|(_, id)| id),
                note_id,
            ],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

pub fn plan_query(
    conn: &Connection,
    question: &str,
    preceding_user_question: Option<&str>,
    previous_source_note_id: Option<&str>,
    today: NaiveDate,
) -> DataResult<QueryPlan> {
    let query = question.trim().to_lowercase();
    let prior = preceding_user_question.unwrap_or("").to_lowercase();
    let project_mention = match named_entity(conn, "projects", "title", &query)? {
        Some(entity) => Some(entity),
        None if is_follow_up(&query) => named_entity(conn, "projects", "title", &prior)?,
        None => None,
    };
    let explicit_project = has_explicit_project_scope(&query)
        || (is_follow_up(&query) && has_explicit_project_scope(&prior));
    let project = if explicit_project {
        project_mention.clone()
    } else {
        None
    };
    let tag_mention = match named_entity(conn, "tags", "name", &query)? {
        Some(entity) => Some(entity),
        None if is_follow_up(&query) => named_entity(conn, "tags", "name", &prior)?,
        None => None,
    };
    let explicit_tag =
        has_explicit_tag_scope(&query) || (is_follow_up(&query) && has_explicit_tag_scope(&prior));
    let tag = if explicit_tag {
        tag_mention.clone()
    } else {
        None
    };
    let current_date = parse_date_range(&query, today)?;
    let inherited_date = if current_date.is_none() && is_follow_up(&query) {
        parse_date_range(&prior, today)?
    } else {
        None
    };
    let date = current_date.or(inherited_date).unwrap_or_default();
    let mentions_note = contains_any(&query, &["замет", "запис", "документ"]);
    let edited = contains_any(&query, &["измен", "редакт", "менял", "правил"]);
    let asks_note_identity = Regex::new(
        r"(?iu)^(?:какая|какие)\s+(?:(?:у\s+меня|самая|самые|моя|мои|первая|последняя|первые|последние|изменённая|измененная)\s+)*(?:заметка|заметки|запись|записи|документ|документы)\b",
    )
    .is_ok_and(|pattern| pattern.is_match(&query));
    let fact_question = Regex::new(
        r"(?iu)^(?:(?:а|и)\s+)?(?:(?:на|в|по)\s+како(?:м|й|е)|кто|где|какой|какая|какое|когда|сколько\s+стоит)\b",
    )
    .is_ok_and(|pattern| pattern.is_match(&query))
        && !asks_note_identity;
    let wants_content = fact_question
        || (query.starts_with("что") && edited)
        || contains_any(
            &query,
            &[
                "что писал",
                "что я писал",
                "что написано",
                "о чём",
                "о чем",
                "расскажи",
                "решени",
                "содерж",
                "про сервер",
            ],
        );
    let previous = contains_any(
        &query,
        &[
            "перед ней",
            "перед ним",
            "перед последн",
            "до неё",
            "до нее",
            "предыдущ",
        ],
    );
    let first = contains_any(&query, &["перв", "самая ранн", "самый ранн"]);
    let last = contains_any(&query, &["последн", "самая нов", "самый нов"]);
    let compare = contains_any(&query, &["сравни", "сравнит", "отлича", "разниц"]);
    let count = contains_any(&query, &["сколько", "количеств"]);
    let frequency = contains_any(&query, &["чаще всего", "часто писал", "основные темы"]);
    let listed = contains_any(&query, &["какие", "перечисли", "покажи", "список"]);
    let temporal_content = wants_content
        && (first
            || last
            || date.start_utc.is_some()
            || previous
            || project.is_some()
            || tag.is_some()
            || (is_follow_up(&query) && previous_source_note_id.is_some()));
    let kind = if (explicit_project && project_mention.is_none())
        || (explicit_tag && tag_mention.is_none())
    {
        QueryKind::MissingScope
    } else if last
        && !mentions_note
        && project.is_none()
        && tag.is_none()
        && !wants_content
        && !compare
        && !previous
    {
        QueryKind::Clarify
    } else if frequency {
        QueryKind::Frequency
    } else if count && (mentions_note || query.contains("создал") || query.contains("создан"))
    {
        QueryKind::Count
    } else if compare && (first || last || previous || is_follow_up(&query)) {
        QueryKind::Compare
    } else if previous {
        QueryKind::Previous
    } else if temporal_content {
        QueryKind::ScopedContent
    } else if first && mentions_note {
        QueryKind::First
    } else if listed && edited && mentions_note {
        QueryKind::List
    } else if last && edited && mentions_note {
        QueryKind::LastEdited
    } else if last && mentions_note {
        QueryKind::Last
    } else if listed && (mentions_note || project.is_some() || tag.is_some()) {
        QueryKind::List
    } else {
        QueryKind::Content
    };
    let order = if kind == QueryKind::First {
        NoteOrder::CreatedAsc
    } else if edited {
        NoteOrder::UpdatedDesc
    } else {
        NoteOrder::CreatedDesc
    };
    let archive = if contains_any(&query, &["включая архив", "все вместе с архивом"])
    {
        ArchiveScope::All
    } else if contains_any(&query, &["в архиве", "из архива", "архивных"]) {
        ArchiveScope::Archived
    } else {
        ArchiveScope::Active
    };
    let date_column = if edited { "updated_at" } else { "created_at" };
    let subject_term = if last && mentions_note && !explicit_project {
        subject_after_note_reference(&query, project_mention.as_ref().map(|(_, name)| name))
    } else {
        None
    };
    let search_query = question.trim().to_string();
    Ok(QueryPlan {
        kind,
        filters: NoteFilters {
            project_id: project.as_ref().map(|(id, _)| id.clone()),
            tag_id: tag.as_ref().map(|(id, _)| id.clone()),
            archive,
            date,
            date_column,
            before_created: None,
        },
        order,
        search_query,
        project_name: project.map(|(_, name)| name),
        tag_name: tag.map(|(_, name)| name),
        anchor_note_id: (is_follow_up(&query) && ((!last && !first) || previous))
            .then(|| previous_source_note_id.map(str::to_string))
            .flatten(),
        subject_term,
    })
}

fn has_explicit_project_scope(question: &str) -> bool {
    Regex::new(
        r"(?iu)(?:(?:заметк|запис|документ)\p{L}*\s+(?:(?:в|из)\s+)?проект\p{L}*|(?:в|из)\s+проект\p{L}*|(?:относят\p{L}*\s+к|входят\s+в)\s+проект\p{L}*)",
    )
    .is_ok_and(|pattern| pattern.is_match(question))
        || question.contains("заметки по ")
}

fn has_explicit_tag_scope(question: &str) -> bool {
    Regex::new(
        r"(?iu)(?:(?:с|по)\s+тег\p{L}*|(?:имеют|есть|назначен\p{L}*)\s+тег\p{L}*|заметк\p{L}*\s+тег\p{L}*)",
    )
    .is_ok_and(|pattern| pattern.is_match(question))
}

fn subject_after_note_reference(question: &str, project_name: Option<&String>) -> Option<String> {
    let subject = Regex::new(r"(?iu)заметк\p{L}*\s+про\s+([\p{L}\p{N}_-]+)")
        .ok()?
        .captures(question)
        .and_then(|captures| captures.get(1).map(|value| value.as_str().to_string()))?;
    if let Some(project_name) = project_name {
        return Some(project_name.clone());
    }
    if subject == "проект" {
        return Regex::new(r"(?iu)\bпроект\p{L}*\s+([\p{L}\p{N}_-]+)")
            .ok()?
            .captures(question)
            .and_then(|captures| captures.get(1).map(|value| value.as_str().to_string()));
    }
    (!matches!(subject.as_str(), "него" | "нее" | "это" | "этот")).then_some(subject)
}

fn named_entity(
    conn: &Connection,
    table: &str,
    name_column: &str,
    question: &str,
) -> DataResult<Option<(String, String)>> {
    let mut matching = match (table, name_column) {
        ("projects", "title") => list_projects(conn)?,
        ("tags", "name") => list_tags(conn)?,
        _ => {
            return Err(DataError::InvalidInput(
                "Недопустимый тип фильтра".to_string(),
            ))
        }
    }
    .into_iter()
    .filter(|(_, name)| {
        if name.is_empty() {
            return false;
        }
        let pattern = format!(
            r"(?iu)(?:^|[^\p{{L}}\p{{N}}]){}(?:$|[^\p{{L}}\p{{N}}])",
            regex::escape(name)
        );
        Regex::new(&pattern).is_ok_and(|regex| regex.is_match(question))
    })
    .collect::<Vec<_>>();
    matching.sort_by(|a, b| {
        b.1.chars()
            .count()
            .cmp(&a.1.chars().count())
            .then_with(|| a.0.cmp(&b.0))
    });
    Ok(matching.into_iter().next())
}

pub fn count_notes(conn: &Connection, filters: &NoteFilters) -> DataResult<i64> {
    let sql = format!("SELECT COUNT(*) FROM notes n WHERE {}", filter_sql(filters));
    Ok(conn.query_row(
        &sql,
        params![
            filters.project_id,
            filters.tag_id,
            archive_code(filters.archive),
            filters.date.start_utc,
            filters.date.end_utc,
            filters.before_created.as_ref().map(|(at, _)| at),
            filters.before_created.as_ref().map(|(_, id)| id),
        ],
        |row| row.get(0),
    )?)
}

pub fn list_notes(
    conn: &Connection,
    filters: &NoteFilters,
    order: NoteOrder,
    limit: i64,
) -> DataResult<Vec<KnowledgeNote>> {
    let order_sql = match order {
        NoteOrder::CreatedAsc => "n.created_at ASC, n.id ASC",
        NoteOrder::CreatedDesc => "n.created_at DESC, n.id DESC",
        NoteOrder::UpdatedDesc => "n.updated_at DESC, n.created_at DESC, n.id DESC",
    };
    let sql = format!(
        "SELECT n.id, n.title, n.created_at, n.updated_at, n.project_id,
                COALESCE(p.title, 'Входящие'), n.archived_at IS NOT NULL, n.is_pinned
         FROM notes n LEFT JOIN projects p ON p.id = n.project_id
         WHERE {} ORDER BY {order_sql} LIMIT ?8",
        filter_sql(filters),
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(
        params![
            filters.project_id,
            filters.tag_id,
            archive_code(filters.archive),
            filters.date.start_utc,
            filters.date.end_utc,
            filters.before_created.as_ref().map(|(at, _)| at),
            filters.before_created.as_ref().map(|(_, id)| id),
            limit.clamp(1, MAX_LIST_NOTES),
        ],
        |row| {
            Ok(KnowledgeNote {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                project_id: row.get(4)?,
                project: row.get(5)?,
                archived: row.get(6)?,
                pinned: row.get::<_, i64>(7)? != 0,
                tags: Vec::new(),
            })
        },
    )?;
    let mut notes = rows.collect::<Result<Vec<_>, _>>()?;
    for note in &mut notes {
        note.tags = tags_for_note(conn, &note.id)?;
    }
    Ok(notes)
}

pub fn get_note_metadata(conn: &Connection, note_id: &str) -> DataResult<Option<KnowledgeNote>> {
    let sql = "SELECT n.id, n.title, n.created_at, n.updated_at, n.project_id,
                      COALESCE(p.title, 'Входящие'), n.archived_at IS NOT NULL,
                      n.is_pinned
               FROM notes n LEFT JOIN projects p ON p.id = n.project_id
               WHERE n.id = ?1 AND n.deleted_at IS NULL";
    let row = conn
        .query_row(sql, params![note_id], |row| {
            Ok(KnowledgeNote {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                project_id: row.get(4)?,
                project: row.get(5)?,
                archived: row.get(6)?,
                pinned: row.get::<_, i64>(7)? != 0,
                tags: Vec::new(),
            })
        })
        .optional()?;
    let Some(mut note) = row else { return Ok(None) };
    note.tags = tags_for_note(conn, &note.id)?;
    Ok(Some(note))
}

pub fn get_note_content(conn: &Connection, note_id: &str) -> DataResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT plain_text FROM notes WHERE id = ?1 AND deleted_at IS NULL",
            params![note_id],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn latest_note_about_subject(
    conn: &Connection,
    subject: &str,
    filters: &NoteFilters,
) -> DataResult<Option<KnowledgeNote>> {
    let match_expression = format!("\"{}\"", subject.replace('"', "\"\""));
    let sql = format!(
        "SELECT n.id FROM note_search_fts
         INNER JOIN notes n ON n.id = note_search_fts.note_id
         WHERE note_search_fts MATCH ?8 AND {}
         ORDER BY n.created_at DESC, n.id DESC LIMIT 1",
        filter_sql(filters),
    );
    let note_id: Option<String> = conn
        .query_row(
            &sql,
            params![
                filters.project_id,
                filters.tag_id,
                archive_code(filters.archive),
                filters.date.start_utc,
                filters.date.end_utc,
                filters.before_created.as_ref().map(|(at, _)| at),
                filters.before_created.as_ref().map(|(_, id)| id),
                match_expression,
            ],
            |row| row.get(0),
        )
        .optional()?;
    note_id
        .as_deref()
        .map(|id| get_note_metadata(conn, id))
        .transpose()
        .map(Option::flatten)
}

pub fn frequent_terms(conn: &Connection, filters: &NoteFilters) -> DataResult<FrequencySummary> {
    let sql = format!(
        "SELECT n.id, n.plain_text FROM notes n WHERE {} ORDER BY n.created_at DESC, n.id DESC LIMIT ?8",
        filter_sql(filters),
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(
        params![
            filters.project_id,
            filters.tag_id,
            archive_code(filters.archive),
            filters.date.start_utc,
            filters.date.end_utc,
            filters.before_created.as_ref().map(|(at, _)| at),
            filters.before_created.as_ref().map(|(_, id)| id),
            MAX_FREQUENCY_NOTES + 1,
        ],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;
    let stop_words = [
        "этого",
        "этот",
        "этом",
        "когда",
        "котор",
        "потом",
        "после",
        "перед",
        "только",
        "также",
        "очень",
        "было",
        "были",
        "будет",
        "чтобы",
        "нужно",
        "можно",
        "если",
        "проект",
        "заметка",
        "заметки",
        "задача",
        "текст",
        "часть",
        "данные",
        "система",
        "their",
        "about",
        "there",
        "which",
        "these",
        "those",
        "would",
        "could",
        "should",
    ];
    let mut counts: HashMap<String, (usize, String)> = HashMap::new();
    let mut inspected_notes = 0usize;
    let mut inspected_chars = 0usize;
    for row in rows {
        let (note_id, content) = row?;
        inspected_notes += 1;
        inspected_chars += content.chars().count();
        if inspected_notes > MAX_FREQUENCY_NOTES as usize || inspected_chars > MAX_FREQUENCY_CHARS {
            return Ok(FrequencySummary {
                complete: false,
                inspected_notes,
                terms: Vec::new(),
            });
        }
        let mut seen = HashSet::new();
        for word in content.split(|character: char| !character.is_alphabetic()) {
            let word = word.to_lowercase();
            if word.chars().count() < 5
                || stop_words.iter().any(|stop| word == *stop)
                || !seen.insert(word.clone())
            {
                continue;
            }
            let entry = counts.entry(word).or_insert_with(|| (0, note_id.clone()));
            entry.0 += 1;
        }
    }
    let mut terms = counts
        .into_iter()
        .filter(|(_, (count, _))| *count >= 2)
        .map(|(term, (note_count, example_note_id))| FrequentTerm {
            term,
            note_count,
            example_note_id,
        })
        .collect::<Vec<_>>();
    terms.sort_by(|a, b| {
        b.note_count
            .cmp(&a.note_count)
            .then_with(|| a.term.cmp(&b.term))
    });
    terms.truncate(5);
    Ok(FrequencySummary {
        complete: true,
        inspected_notes,
        terms,
    })
}

pub fn list_projects(conn: &Connection) -> DataResult<Vec<(String, String)>> {
    list_named(
        conn,
        "SELECT id, title FROM projects ORDER BY lower(title), id",
    )
}

pub fn list_tags(conn: &Connection) -> DataResult<Vec<(String, String)>> {
    list_named(conn, "SELECT id, name FROM tags ORDER BY lower(name), id")
}

fn list_named(conn: &Connection, sql: &str) -> DataResult<Vec<(String, String)>> {
    let mut statement = conn.prepare(sql)?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn tags_for_note(conn: &Connection, note_id: &str) -> DataResult<Vec<String>> {
    let mut statement = conn.prepare(
        "SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id
         WHERE nt.note_id = ?1 ORDER BY lower(t.name), t.id",
    )?;
    let rows = statement.query_map(params![note_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn max_list_notes() -> i64 {
    MAX_LIST_NOTES
}
pub fn max_content_notes() -> i64 {
    MAX_CONTENT_NOTES
}

fn filter_sql(filters: &NoteFilters) -> String {
    let date_column = if filters.date_column == "updated_at" {
        "updated_at"
    } else {
        "created_at"
    };
    format!(
        "n.deleted_at IS NULL
         AND (?1 IS NULL OR n.project_id = ?1)
         AND (?2 IS NULL OR EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?2))
         AND (?3 = 2 OR (?3 = 0 AND n.archived_at IS NULL) OR (?3 = 1 AND n.archived_at IS NOT NULL))
         AND (?4 IS NULL OR n.{date_column} >= ?4)
         AND (?5 IS NULL OR n.{date_column} < ?5)
         AND (?6 IS NULL OR (n.created_at < ?6 OR (n.created_at = ?6 AND n.id < ?7)))"
    )
}

fn archive_code(scope: ArchiveScope) -> i64 {
    match scope {
        ArchiveScope::Active => 0,
        ArchiveScope::Archived => 1,
        ArchiveScope::All => 2,
    }
}

fn contains_any(text: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|pattern| text.contains(pattern))
}

fn is_follow_up(text: &str) -> bool {
    contains_any(
        text,
        &[
            "перед ней",
            "перед ним",
            "перед последн",
            "предыдущ",
            "а что",
            "чем они",
            "чем эта",
            "а в ней",
            "а там",
            "а на каком",
            "а какой",
            "там разворачива",
        ],
    )
}

fn parse_date_range(question: &str, today: NaiveDate) -> DataResult<Option<DateRange>> {
    let single = if question.contains("вчера") {
        Some(today - Duration::days(1))
    } else if question.contains("сегодня") {
        Some(today)
    } else {
        None
    };
    if let Some(day) = single {
        return Ok(Some(local_range(day, day + Duration::days(1))?));
    }
    if question.contains("прошлой недел") || question.contains("прошедшей недел")
    {
        let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
        return Ok(Some(local_range(monday - Duration::days(7), monday)?));
    }
    if question.contains("этой недел") || question.contains("текущей недел") {
        let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
        return Ok(Some(local_range(monday, monday + Duration::days(7))?));
    }
    if question.contains("прошлом месяце") || question.contains("прошлый месяц")
    {
        let first = today
            .with_day(1)
            .ok_or_else(|| DataError::InvalidInput("Недопустимая дата".to_string()))?;
        let previous_end = first;
        let previous_start = (first - Duration::days(1))
            .with_day(1)
            .ok_or_else(|| DataError::InvalidInput("Недопустимая дата".to_string()))?;
        return Ok(Some(local_range(previous_start, previous_end)?));
    }
    let number_of_days = Regex::new(r"последн\w*\s+(\d{1,3})\s+дн")
        .expect("static regex")
        .captures(question)
        .and_then(|captures| captures.get(1))
        .and_then(|capture| capture.as_str().parse::<i64>().ok());
    if let Some(days) = number_of_days {
        return Ok(Some(local_range(
            today - Duration::days(days.saturating_sub(1)),
            today + Duration::days(1),
        )?));
    }
    if question.contains("последний месяц") || question.contains("последнего месяца")
    {
        return Ok(Some(local_range(
            today - Duration::days(30),
            today + Duration::days(1),
        )?));
    }
    let natural_date = Regex::new(
        r"\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(20\d{2})\b",
    ).expect("static regex");
    if let Some(captures) = natural_date.captures(question) {
        let day = captures[1].parse::<u32>().ok();
        let year = captures[3].parse::<i32>().ok();
        let names = [
            "января",
            "февраля",
            "марта",
            "апреля",
            "мая",
            "июня",
            "июля",
            "августа",
            "сентября",
            "октября",
            "ноября",
            "декабря",
        ];
        if let (Some(day), Some(year), Some(index)) = (
            day,
            year,
            names.iter().position(|name| *name == &captures[2]),
        ) {
            if let Some(date) = NaiveDate::from_ymd_opt(year, index as u32 + 1, day) {
                if question.contains("после ") {
                    return Ok(Some(DateRange {
                        start_utc: Some(local_start(date + Duration::days(1))?),
                        end_utc: None,
                    }));
                }
                if question.contains("до ") {
                    return Ok(Some(DateRange {
                        start_utc: None,
                        end_utc: Some(local_start(date)?),
                    }));
                }
                return Ok(Some(local_range(date, date + Duration::days(1))?));
            }
        }
    }
    let dates = Regex::new(r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\b")
        .expect("static regex")
        .find_iter(question)
        .filter_map(|match_| parse_date(match_.as_str()))
        .collect::<Vec<_>>();
    if dates.len() >= 2 {
        let (start, end) = if dates[0] <= dates[1] {
            (dates[0], dates[1])
        } else {
            (dates[1], dates[0])
        };
        return Ok(Some(local_range(start, end + Duration::days(1))?));
    }
    if let Some(day) = dates.first() {
        if question.contains("после ") {
            return Ok(Some(DateRange {
                start_utc: Some(local_start(*day + Duration::days(1))?),
                end_utc: None,
            }));
        }
        if question.contains("до ") {
            return Ok(Some(DateRange {
                start_utc: None,
                end_utc: Some(local_start(*day)?),
            }));
        }
        return Ok(Some(local_range(*day, *day + Duration::days(1))?));
    }
    let month_names: [&[&str]; 12] = [
        &["январ"],
        &["феврал"],
        &["марте", "марта", "март"],
        &["апрел"],
        &["мае", "мая", "май"],
        &["июн"],
        &["июл"],
        &["август"],
        &["сентябр"],
        &["октябр"],
        &["ноябр"],
        &["декабр"],
    ];
    let year_pattern = Regex::new(r"\b20\d{2}\b").expect("static regex");
    for (index, names) in month_names.iter().enumerate() {
        let month_pattern =
            Regex::new(&format!(r"\b(?:{})\w*\b", names.join("|"))).expect("static month names");
        if month_pattern.is_match(question) {
            let year = year_pattern
                .find(question)
                .and_then(|match_| match_.as_str().parse::<i32>().ok())
                .unwrap_or(today.year());
            let month = index as u32 + 1;
            let start = NaiveDate::from_ymd_opt(year, month, 1)
                .ok_or_else(|| DataError::InvalidInput("Недопустимая дата".to_string()))?;
            let (next_year, next_month) = if month == 12 {
                (year + 1, 1)
            } else {
                (year, month + 1)
            };
            let end = NaiveDate::from_ymd_opt(next_year, next_month, 1)
                .ok_or_else(|| DataError::InvalidInput("Недопустимая дата".to_string()))?;
            return Ok(Some(local_range(start, end)?));
        }
    }
    Ok(None)
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .or_else(|| NaiveDate::parse_from_str(value, "%d.%m.%Y").ok())
}

fn local_range(start: NaiveDate, end: NaiveDate) -> DataResult<DateRange> {
    Ok(DateRange {
        start_utc: Some(local_start(start)?),
        end_utc: Some(local_start(end)?),
    })
}

fn local_start(day: NaiveDate) -> DataResult<String> {
    let midnight = day
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| DataError::InvalidInput("Недопустимая дата".to_string()))?;
    let local = Local
        .from_local_datetime(&midnight)
        .earliest()
        .ok_or_else(|| DataError::InvalidInput("Локальная дата недоступна".to_string()))?;
    Ok(local
        .with_timezone(&Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Connection {
        let conn = Connection::open_in_memory().expect("memory database");
        conn.execute_batch(
            "CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL);
             CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL);
             CREATE TABLE notes (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, project_id TEXT, archived_at TEXT,
                deleted_at TEXT, is_pinned INTEGER NOT NULL DEFAULT 0,
                plain_text TEXT NOT NULL DEFAULT ''
             );
             CREATE TABLE note_tags (note_id TEXT NOT NULL, tag_id TEXT NOT NULL);
             INSERT INTO projects VALUES ('alpha', 'Альфа'), ('beta', 'Бета');
             INSERT INTO tags VALUES ('work', 'Работа');
             INSERT INTO notes VALUES
               ('a', 'Первая', '2026-08-01T10:00:00.000Z', '2026-09-27T12:00:00.000Z', 'alpha', NULL, NULL, 1, 'OAuth и сервер'),
               ('b', 'Вторая', '2026-08-02T10:00:00.000Z', '2026-08-02T10:00:00.000Z', 'beta', NULL, NULL, 0, 'План'),
               ('c', 'Последняя', '2026-09-26T10:00:00.000Z', '2026-09-26T10:00:00.000Z', 'alpha', NULL, NULL, 0, 'Сервер на порту 9000'),
               ('d', 'Архив', '2026-09-27T10:00:00.000Z', '2026-09-27T10:00:00.000Z', 'alpha', '2026-09-27T12:00:00.000Z', NULL, 0, 'Архивная запись'),
               ('e', 'Удалена', '2026-09-28T10:00:00.000Z', '2026-09-28T10:00:00.000Z', 'alpha', NULL, '2026-09-28T12:00:00.000Z', 0, 'Удалено');
             INSERT INTO note_tags VALUES ('a', 'work'), ('c', 'work');",
        ).expect("fixture schema");
        conn
    }

    fn plan(conn: &Connection, question: &str) -> QueryPlan {
        plan_query(
            conn,
            question,
            None,
            None,
            NaiveDate::from_ymd_opt(2026, 9, 27).expect("date"),
        )
        .expect("query plan")
    }

    #[test]
    fn chronology_and_count_use_sqlite_metadata_with_stable_order() {
        let conn = fixture();
        let first = plan(&conn, "Какая у меня самая первая заметка?");
        assert_eq!(first.kind, QueryKind::First);
        assert_eq!(
            list_notes(&conn, &first.filters, first.order, 1).expect("first")[0].id,
            "a"
        );
        let last = plan(&conn, "Какая у меня последняя заметка?");
        assert_eq!(last.kind, QueryKind::Last);
        assert_eq!(
            list_notes(&conn, &last.filters, last.order, 1).expect("last")[0].id,
            "c"
        );
        let edited = plan(&conn, "Какая заметка изменялась последней?");
        assert_eq!(edited.kind, QueryKind::LastEdited);
        assert_eq!(
            list_notes(&conn, &edited.filters, edited.order, 1).expect("edited")[0].id,
            "a"
        );
        let count = plan(&conn, "Сколько у меня заметок?");
        assert_eq!(count.kind, QueryKind::Count);
        assert_eq!(count_notes(&conn, &count.filters).expect("count"), 3);
        assert!(!count.preview().needs_hybrid_retrieval);
    }

    #[test]
    fn date_project_tag_and_archive_filters_are_exact() {
        let conn = fixture();
        let today = NaiveDate::from_ymd_opt(2026, 9, 27).expect("today");
        let yesterday =
            plan_query(&conn, "Что я писал вчера?", None, None, today).expect("yesterday");
        assert_eq!(yesterday.kind, QueryKind::ScopedContent);
        let expected = local_start(today - Duration::days(1)).expect("yesterday start");
        assert_eq!(
            yesterday.filters.date.start_utc.as_deref(),
            Some(expected.as_str())
        );
        let project = plan(&conn, "Какие заметки относятся к проекту Альфа?");
        assert_eq!(project.filters.project_id.as_deref(), Some("alpha"));
        assert_eq!(
            count_notes(&conn, &project.filters).expect("project count"),
            2
        );
        let tag = plan(&conn, "Какие заметки имеют тег Работа?");
        assert_eq!(tag.filters.tag_id.as_deref(), Some("work"));
        assert_eq!(count_notes(&conn, &tag.filters).expect("tag count"), 2);
        let archived = plan(&conn, "Какие заметки в архиве?");
        assert_eq!(
            count_notes(&conn, &archived.filters).expect("archive count"),
            1
        );
        let august = plan(&conn, "Сколько заметок я создал в августе 2026?");
        assert_eq!(
            count_notes(&conn, &august.filters).expect("august count"),
            2
        );
    }

    #[test]
    fn temporal_mixed_and_followup_plans_do_not_infer_order_from_embeddings() {
        let conn = fixture();
        let mixed = plan(&conn, "Что я писал про сервер в последней заметке?");
        assert_eq!(mixed.kind, QueryKind::ScopedContent);
        assert!(!mixed.preview().needs_hybrid_retrieval);
        let compare = plan(&conn, "Сравни первую и последнюю заметку проекта Альфа.");
        assert_eq!(compare.kind, QueryKind::Compare);
        assert_eq!(compare.filters.project_id.as_deref(), Some("alpha"));
        let followup = plan_query(
            &conn,
            "Что было перед последней заметкой?",
            Some("Какая последняя заметка проекта Альфа?"),
            Some("c"),
            NaiveDate::from_ymd_opt(2026, 9, 27).expect("today"),
        )
        .expect("follow-up");
        assert_eq!(followup.kind, QueryKind::Previous);
        assert_eq!(followup.filters.project_id.as_deref(), Some("alpha"));
        assert_eq!(followup.anchor_note_id.as_deref(), Some("c"));
        let changed = plan(&conn, "Какие заметки по Альфа я изменял последними?");
        assert_eq!(changed.order, NoteOrder::UpdatedDesc);
        assert_eq!(
            list_notes(&conn, &changed.filters, changed.order, 1).expect("changed")[0].id,
            "a"
        );
    }

    #[test]
    fn project_mention_in_a_fact_question_does_not_imply_project_membership() {
        let conn = fixture();
        for question in [
            "На каком сервере разворачивается проект Альфа?",
            "Какой бюджет проекта Альфа?",
            "Когда выполняется резервное копирование проекта Альфа?",
            "Что я писал про проект Альфа?",
        ] {
            let plan = plan(&conn, question);
            assert_eq!(plan.kind, QueryKind::Content, "{question}");
            assert!(plan.preview().needs_hybrid_retrieval, "{question}");
            assert_eq!(plan.filters.project_id, None, "{question}");
        }
        let explicit = plan(&conn, "Какой сервер указан в заметках проекта Альфа?");
        assert!(explicit.preview().needs_hybrid_retrieval);
        assert_eq!(explicit.filters.project_id.as_deref(), Some("alpha"));
        let latest_about = plan(
            &conn,
            "На каком сервере проект Альфа в самой последней заметке про него?",
        );
        assert_eq!(latest_about.kind, QueryKind::ScopedContent);
        assert_eq!(latest_about.subject_term.as_deref(), Some("Альфа"));
        assert!(!latest_about.preview().needs_hybrid_retrieval);
        let tag_topic = plan(&conn, "Что написано про тег Работа?");
        assert_eq!(tag_topic.kind, QueryKind::Content);
        assert_eq!(tag_topic.filters.tag_id, None);
    }

    #[test]
    fn fact_in_latest_note_reads_content_but_previous_note_stays_structured() {
        let conn = fixture();
        let fact = plan(&conn, "Какой сервер указан в последней заметке?");
        assert_eq!(fact.kind, QueryKind::ScopedContent);
        assert!(!fact.preview().needs_hybrid_retrieval);
        let about_in_latest = plan(&conn, "Что я писал про сервер в последней заметке?");
        assert_eq!(about_in_latest.kind, QueryKind::ScopedContent);
        assert_eq!(about_in_latest.subject_term, None);
        let chronology = plan(&conn, "Что было перед последней заметкой?");
        assert_eq!(chronology.kind, QueryKind::Previous);
        assert!(!chronology.preview().needs_hybrid_retrieval);
    }

    #[test]
    fn missing_explicit_project_does_not_expand_scope_but_textual_mention_does() {
        let conn = fixture();
        conn.execute("DELETE FROM projects WHERE id = 'alpha'", [])
            .expect("remove project entity from fixture");
        let explicit = plan(&conn, "Какой сервер указан в заметках проекта Альфа?");
        assert_eq!(explicit.kind, QueryKind::MissingScope);
        assert!(!explicit.preview().needs_hybrid_retrieval);
        let textual = plan(&conn, "На каком сервере разворачивается проект Альфа?");
        assert_eq!(textual.kind, QueryKind::Content);
        assert!(textual.preview().needs_hybrid_retrieval);
        assert_eq!(textual.filters.project_id, None);
    }

    #[test]
    fn same_timestamp_uses_note_id_as_deterministic_tie_breaker() {
        let conn = fixture();
        conn.execute(
            "INSERT INTO notes (id,title,created_at,updated_at,plain_text) VALUES ('z','Tie',?1,?1,'tie')",
            params!["2026-09-26T10:00:00.000Z"],
        ).expect("tie note");
        let last = plan(&conn, "Какая последняя заметка?");
        assert_eq!(
            list_notes(&conn, &last.filters, last.order, 1).expect("tie order")[0].id,
            "z"
        );
    }

    #[test]
    fn date_parser_covers_week_ranges_last_days_and_before_after() {
        let conn = fixture();
        let today = NaiveDate::from_ymd_opt(2026, 9, 27).expect("today");
        for query in [
            "Какие заметки я создавал на прошлой неделе?",
            "Что я писал за последние 7 дней?",
            "О чём я чаще всего писал за последний месяц?",
            "Какие заметки с 2026-08-01 по 2026-08-31?",
            "Какие заметки после 2026-08-01?",
            "Какие заметки до 2026-09-01?",
        ] {
            let planned = plan_query(&conn, query, None, None, today).expect("date plan");
            assert!(
                planned.filters.date.start_utc.is_some() || planned.filters.date.end_utc.is_some(),
                "{query}"
            );
        }
        let natural = plan_query(
            &conn,
            "Какие заметки созданы 4 января 2024?",
            None,
            None,
            today,
        )
        .expect("natural date");
        let expected = local_start(NaiveDate::from_ymd_opt(2024, 1, 4).expect("natural day"))
            .expect("natural start");
        assert_eq!(
            natural.filters.date.start_utc.as_deref(),
            Some(expected.as_str())
        );
    }

    #[test]
    fn frequency_scans_all_matching_notes_not_a_random_top_chunk_sample() {
        let conn = fixture();
        let plan = plan(&conn, "О чём я чаще всего писал за последние 90 дней?");
        assert_eq!(plan.kind, QueryKind::Frequency);
        let summary = frequent_terms(&conn, &plan.filters).expect("frequency");
        assert!(summary.complete);
        assert_eq!(summary.inspected_notes, 3);
        assert!(summary
            .terms
            .iter()
            .any(|term| term.term == "сервер" && term.note_count == 2));
    }

    #[test]
    #[ignore = "machine-sensitive metadata benchmark; run separately"]
    fn metadata_performance_at_one_hundred_one_thousand_and_ten_thousand_notes() {
        use std::time::Instant;
        for size in [100, 1_000, 10_000] {
            let mut conn = fixture();
            let transaction = conn.transaction().expect("transaction");
            {
                let mut insert = transaction.prepare(
                    "INSERT INTO notes (id,title,created_at,updated_at,plain_text) VALUES (?1,?2,?3,?3,'')",
                ).expect("insert statement");
                for index in 0..size {
                    let timestamp = format!(
                        "2026-09-01T{:02}:{:02}:{:02}.000Z",
                        index / 3600,
                        index / 60 % 60,
                        index % 60
                    );
                    insert
                        .execute(params![
                            format!("bench-{index:05}"),
                            format!("Benchmark {index}"),
                            timestamp
                        ])
                        .expect("insert note");
                }
            }
            transaction.commit().expect("commit");
            let plan = plan(&conn, "Какая последняя заметка?");
            let start = Instant::now();
            let latest = list_notes(&conn, &plan.filters, plan.order, 1).expect("latest");
            let list_ms = start.elapsed().as_millis();
            let start = Instant::now();
            let count = count_notes(&conn, &plan.filters).expect("count");
            let count_ms = start.elapsed().as_millis();
            assert_eq!(count, size + 3);
            assert_eq!(latest.len(), 1);
            eprintln!("metadata notes={size} latest_ms={list_ms} count_ms={count_ms}");
        }
    }
}
