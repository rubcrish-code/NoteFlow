use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

pub const LEGACY_TIPTAP_SIDECAR_KIND: &str = "legacy_tiptap_json";
pub const REVISION_MAINTENANCE_SETTING_KEY: &str = "internal.revision-retention.v1";
pub const PERIODIC_REVISION_CADENCE_SECONDS: i64 = 60;
pub const RECENT_REVISION_COUNT: usize = 20;
pub const CRITICAL_REVISION_LIMIT: usize = 60;
pub const REVISION_HARD_CAP: usize = 120;
pub const REVISION_PRUNE_TRIGGER: usize = 140;

pub const REVISION_MIGRATION_SQL: &str = "
    ALTER TABLE notes ADD COLUMN revision_checkpoint_at TEXT;
    ALTER TABLE note_revisions ADD COLUMN snapshot_hash TEXT;
    ALTER TABLE note_revisions ADD COLUMN revision_kind TEXT NOT NULL DEFAULT 'legacy';

    CREATE INDEX IF NOT EXISTS idx_note_revisions_note_created
        ON note_revisions(note_id, created_at DESC, id DESC);
";

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum RevisionKind {
    Periodic,
    RestoreGuard,
    Imported,
    Legacy,
}

impl RevisionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Periodic => "periodic",
            Self::RestoreGuard => "restore_guard",
            Self::Imported => "imported",
            Self::Legacy => "legacy",
        }
    }

    fn from_stored(value: &str) -> Self {
        match value {
            "periodic" => Self::Periodic,
            "restore_guard" => Self::RestoreGuard,
            "imported" => Self::Imported,
            _ => Self::Legacy,
        }
    }

    fn is_critical(self) -> bool {
        matches!(self, Self::RestoreGuard | Self::Imported)
    }
}

pub fn imported_revision_kind(value: Option<&str>) -> RevisionKind {
    match value {
        Some("periodic") => RevisionKind::Periodic,
        Some("restore_guard") => RevisionKind::RestoreGuard,
        Some("imported") => RevisionKind::Imported,
        Some("legacy") => RevisionKind::Legacy,
        _ => RevisionKind::Imported,
    }
}

pub fn validated_snapshot_hash(value: Option<&str>) -> Option<&str> {
    value.filter(|hash| hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
}

pub struct RevisionSnapshot<'a> {
    pub content_json: &'a str,
    pub content_markdown: &'a str,
    pub content_html: &'a str,
    pub plain_text: &'a str,
}

#[derive(Debug, Eq, PartialEq)]
pub struct PeriodicRevisionDecision {
    pub checkpoint_at: String,
    pub snapshot_hash: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RevisionRetentionCandidate {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub kind: RevisionKind,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PruneStats {
    pub before: usize,
    pub after: usize,
    pub deleted: usize,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct MaintenanceStats {
    pub notes_scanned: usize,
    pub revisions_before: usize,
    pub revisions_after: usize,
    pub revisions_deleted: usize,
}

pub fn periodic_revision_decision(
    connection: &Connection,
    note_id: &str,
    content_markdown: &str,
    checkpoint_at: Option<&str>,
    now: &str,
) -> rusqlite::Result<PeriodicRevisionDecision> {
    let now_timestamp = parse_timestamp(now)?;
    let Some(checkpoint) = checkpoint_at.and_then(parse_timestamp_optional) else {
        return Ok(PeriodicRevisionDecision {
            checkpoint_at: now.to_string(),
            snapshot_hash: None,
        });
    };
    let elapsed = now_timestamp.signed_duration_since(checkpoint);
    if elapsed < Duration::zero() {
        return Ok(PeriodicRevisionDecision {
            checkpoint_at: now.to_string(),
            snapshot_hash: None,
        });
    }
    if elapsed < Duration::seconds(PERIODIC_REVISION_CADENCE_SECONDS) {
        return Ok(PeriodicRevisionDecision {
            checkpoint_at: checkpoint_at.unwrap_or(now).to_string(),
            snapshot_hash: None,
        });
    }

    let candidate_hash = snapshot_hash_for_note(connection, note_id, content_markdown)?;
    let latest_hash = latest_revision_hash(connection, note_id)?;
    Ok(PeriodicRevisionDecision {
        checkpoint_at: now.to_string(),
        snapshot_hash: (latest_hash.as_deref() != Some(candidate_hash.as_str()))
            .then_some(candidate_hash),
    })
}

pub fn snapshot_hash_for_note(
    connection: &Connection,
    note_id: &str,
    content_markdown: &str,
) -> rusqlite::Result<String> {
    snapshot_hash_from_sidecars(
        connection,
        "SELECT kind, schema_version, payload_json
         FROM note_content_sidecars
         WHERE note_id = ?1 AND kind <> ?2
         ORDER BY kind, schema_version",
        note_id,
        content_markdown,
    )
}

pub fn snapshot_hash_for_revision(
    connection: &Connection,
    revision_id: &str,
    content_markdown: &str,
) -> rusqlite::Result<String> {
    snapshot_hash_from_sidecars(
        connection,
        "SELECT kind, schema_version, payload_json
         FROM note_revision_sidecars
         WHERE revision_id = ?1 AND kind <> ?2
         ORDER BY kind, schema_version",
        revision_id,
        content_markdown,
    )
}

fn snapshot_hash_from_sidecars(
    connection: &Connection,
    query: &str,
    owner_id: &str,
    content_markdown: &str,
) -> rusqlite::Result<String> {
    let mut hasher = Sha256::new();
    hash_segment(
        &mut hasher,
        normalize_line_endings(content_markdown).as_bytes(),
    );
    let mut statement = connection.prepare(query)?;
    let rows = statement.query_map(params![owner_id, LEGACY_TIPTAP_SIDECAR_KIND], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (kind, schema_version, payload_json) = row?;
        hash_segment(&mut hasher, kind.as_bytes());
        hash_segment(&mut hasher, &schema_version.to_le_bytes());
        hash_segment(&mut hasher, canonical_json(&payload_json).as_bytes());
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn hash_segment(hasher: &mut Sha256, bytes: &[u8]) {
    hasher.update((bytes.len() as u64).to_le_bytes());
    hasher.update(bytes);
}

fn normalize_line_endings(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn canonical_json(raw: &str) -> String {
    serde_json::from_str::<Value>(raw)
        .and_then(|value| serde_json::to_string(&value))
        .unwrap_or_else(|_| raw.to_string())
}

fn latest_revision_hash(
    connection: &Connection,
    note_id: &str,
) -> rusqlite::Result<Option<String>> {
    let latest = connection
        .query_row(
            "SELECT id, content_markdown, snapshot_hash
             FROM note_revisions
             WHERE note_id = ?1
             ORDER BY created_at DESC, id DESC
             LIMIT 1",
            params![note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()?;
    let Some((revision_id, markdown, stored_hash)) = latest else {
        return Ok(None);
    };
    if let Some(hash) = validated_snapshot_hash(stored_hash.as_deref()) {
        return Ok(Some(hash.to_ascii_lowercase()));
    }
    snapshot_hash_for_revision(connection, &revision_id, &markdown).map(Some)
}

pub fn insert_revision(
    transaction: &Transaction<'_>,
    note_id: &str,
    snapshot: &RevisionSnapshot<'_>,
    kind: RevisionKind,
    snapshot_hash: &str,
    created_at: &str,
) -> rusqlite::Result<String> {
    let revision_id = uuid::Uuid::new_v4().to_string();
    transaction.execute(
        "INSERT INTO note_revisions (
            id, note_id, content_json, content_markdown, content_html, plain_text, created_at,
            snapshot_hash, revision_kind
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            revision_id,
            note_id,
            snapshot.content_json,
            snapshot.content_markdown,
            snapshot.content_html,
            snapshot.plain_text,
            created_at,
            snapshot_hash,
            kind.as_str(),
        ],
    )?;
    let copied = transaction.execute(
        "INSERT INTO note_revision_sidecars (
            revision_id, kind, schema_version, payload_json, created_at
         )
         SELECT ?1, kind, schema_version, payload_json, ?2
         FROM note_content_sidecars
         WHERE note_id = ?3",
        params![revision_id, created_at, note_id],
    )?;
    if copied == 0 {
        transaction.execute(
            "INSERT INTO note_revision_sidecars (
                revision_id, kind, schema_version, payload_json, created_at
             ) VALUES (?1, ?2, 1, ?3, ?4)",
            params![
                revision_id,
                LEGACY_TIPTAP_SIDECAR_KIND,
                snapshot.content_json,
                created_at,
            ],
        )?;
    }
    crate::assets::copy_note_references_to_revision(transaction, note_id, &revision_id)
        .map_err(|_| rusqlite::Error::InvalidQuery)?;
    Ok(revision_id)
}

pub fn retained_revision_ids(
    candidates: &[RevisionRetentionCandidate],
    now: DateTime<Utc>,
    additionally_protected: &HashSet<String>,
) -> HashSet<String> {
    let mut sorted = candidates.to_vec();
    sorted.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.id.cmp(&left.id))
    });
    let by_id = sorted
        .iter()
        .map(|candidate| (candidate.id.as_str(), candidate))
        .collect::<HashMap<_, _>>();

    let mut selected = Vec::<(u8, &RevisionRetentionCandidate)>::new();
    for candidate in sorted.iter().take(RECENT_REVISION_COUNT) {
        selected.push((0, candidate));
    }
    for id in additionally_protected {
        if let Some(candidate) = by_id.get(id.as_str()) {
            selected.push((0, candidate));
        }
    }
    for candidate in sorted
        .iter()
        .filter(|candidate| candidate.kind.is_critical())
        .take(CRITICAL_REVISION_LIMIT)
    {
        selected.push((1, candidate));
    }

    let mut buckets = HashSet::new();
    for candidate in &sorted {
        let Some((tier, bucket_seconds)) = retention_bucket(candidate, now) else {
            continue;
        };
        let bucket = candidate.created_at.timestamp().div_euclid(bucket_seconds);
        if buckets.insert((candidate.kind, tier, bucket)) {
            selected.push((2, candidate));
        }
    }

    selected.sort_by(|(left_priority, left), (right_priority, right)| {
        left_priority.cmp(right_priority).then_with(|| {
            right
                .created_at
                .cmp(&left.created_at)
                .then_with(|| right.id.cmp(&left.id))
        })
    });
    let mut retained = HashSet::new();
    for (_, candidate) in selected {
        if retained.len() >= REVISION_HARD_CAP {
            break;
        }
        retained.insert(candidate.id.clone());
    }
    retained
}

fn retention_bucket(
    candidate: &RevisionRetentionCandidate,
    now: DateTime<Utc>,
) -> Option<(u8, i64)> {
    if candidate.kind.is_critical() {
        return None;
    }
    let age_seconds = now
        .signed_duration_since(candidate.created_at)
        .num_seconds()
        .max(0);
    let day = 24 * 60 * 60;
    if age_seconds <= day {
        return Some((0, 30 * 60));
    }
    if age_seconds <= 7 * day {
        return Some((1, 6 * 60 * 60));
    }
    match candidate.kind {
        RevisionKind::Periodic if age_seconds <= 30 * day => Some((2, day)),
        RevisionKind::Periodic => None,
        RevisionKind::Legacy if age_seconds <= 90 * day => Some((2, day)),
        RevisionKind::Legacy => Some((3, 7 * day)),
        RevisionKind::RestoreGuard | RevisionKind::Imported => None,
    }
}

pub fn prune_note_revisions(
    transaction: &Transaction<'_>,
    note_id: &str,
    now: &str,
    force: bool,
    additionally_protected: &HashSet<String>,
) -> rusqlite::Result<PruneStats> {
    let count = transaction.query_row(
        "SELECT COUNT(*) FROM note_revisions WHERE note_id = ?1",
        params![note_id],
        |row| row.get::<_, i64>(0),
    )? as usize;
    if !force && count <= REVISION_PRUNE_TRIGGER {
        return Ok(PruneStats {
            before: count,
            after: count,
            deleted: 0,
        });
    }

    let now = parse_timestamp(now)?;
    let mut statement = transaction.prepare(
        "SELECT id, created_at, revision_kind
         FROM note_revisions
         WHERE note_id = ?1
         ORDER BY created_at DESC, id DESC",
    )?;
    let rows = statement.query_map(params![note_id], |row| {
        let created_at = row.get::<_, String>(1)?;
        Ok(RevisionRetentionCandidate {
            id: row.get(0)?,
            created_at: parse_timestamp(&created_at)?,
            kind: RevisionKind::from_stored(&row.get::<_, String>(2)?),
        })
    })?;
    let candidates = rows.collect::<Result<Vec<_>, _>>()?;
    drop(statement);
    let retained = retained_revision_ids(&candidates, now, additionally_protected);
    let mut delete_statement =
        transaction.prepare("DELETE FROM note_revisions WHERE id = ?1 AND note_id = ?2")?;
    for candidate in &candidates {
        if !retained.contains(&candidate.id) {
            delete_statement.execute(params![candidate.id, note_id])?;
        }
    }
    drop(delete_statement);
    let after = retained.len().min(count);
    Ok(PruneStats {
        before: count,
        after,
        deleted: count.saturating_sub(after),
    })
}

pub fn run_startup_maintenance(
    connection: &mut Connection,
    now: &str,
) -> rusqlite::Result<MaintenanceStats> {
    let already_completed = connection
        .query_row(
            "SELECT 1 FROM app_settings WHERE key = ?1",
            params![REVISION_MAINTENANCE_SETTING_KEY],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if already_completed {
        return Ok(MaintenanceStats::default());
    }

    let transaction = connection.transaction()?;
    let note_ids = {
        let mut statement =
            transaction.prepare("SELECT DISTINCT note_id FROM note_revisions ORDER BY note_id")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    let mut stats = MaintenanceStats::default();
    for note_id in note_ids {
        let note_stats = prune_note_revisions(&transaction, &note_id, now, true, &HashSet::new())?;
        stats.notes_scanned += 1;
        stats.revisions_before += note_stats.before;
        stats.revisions_after += note_stats.after;
        stats.revisions_deleted += note_stats.deleted;
    }
    transaction.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![
            REVISION_MAINTENANCE_SETTING_KEY,
            json!({
                "notesScanned": stats.notes_scanned,
                "revisionsBefore": stats.revisions_before,
                "revisionsAfter": stats.revisions_after,
                "revisionsDeleted": stats.revisions_deleted,
            })
            .to_string(),
            now,
        ],
    )?;
    transaction.commit()?;
    Ok(stats)
}

fn parse_timestamp(value: &str) -> rusqlite::Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .map_err(|_| rusqlite::Error::InvalidQuery)
}

fn parse_timestamp_optional(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hash_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open hash database");
        connection
            .execute_batch(
                "CREATE TABLE note_content_sidecars (
                    note_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    payload_json TEXT NOT NULL
                 );
                 CREATE TABLE note_revisions (
                    id TEXT PRIMARY KEY,
                    note_id TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    snapshot_hash TEXT,
                    created_at TEXT NOT NULL,
                    revision_kind TEXT NOT NULL
                 );
                 CREATE TABLE note_revision_sidecars (
                    revision_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    payload_json TEXT NOT NULL
                 );",
            )
            .expect("create hash schema");
        connection
    }

    fn set_sidecar(connection: &Connection, payload: &str) {
        connection
            .execute("DELETE FROM note_content_sidecars", [])
            .expect("clear sidecars");
        connection
            .execute(
                "INSERT INTO note_content_sidecars (note_id, kind, schema_version, payload_json)
                 VALUES ('note', 'editor_node_attrs_v1', 1, ?1)",
                params![payload],
            )
            .expect("insert sidecar");
    }

    fn timestamp(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value)
            .expect("valid timestamp")
            .with_timezone(&Utc)
    }

    fn candidate(
        id: impl Into<String>,
        created_at: DateTime<Utc>,
        kind: RevisionKind,
    ) -> RevisionRetentionCandidate {
        RevisionRetentionCandidate {
            id: id.into(),
            created_at,
            kind,
        }
    }

    #[test]
    fn retention_is_deterministic_and_bounded_for_thousands_of_revisions() {
        let now = timestamp("2026-08-29T12:00:00Z");
        let entries = (0..10_000)
            .map(|index| {
                candidate(
                    format!("revision-{index:05}"),
                    now - Duration::minutes(index),
                    RevisionKind::Periodic,
                )
            })
            .collect::<Vec<_>>();
        let forward = retained_revision_ids(&entries, now, &HashSet::new());
        let mut reversed = entries;
        reversed.reverse();
        let backward = retained_revision_ids(&reversed, now, &HashSet::new());
        assert_eq!(forward, backward);
        assert!(forward.len() <= REVISION_HARD_CAP);
        assert!(forward.contains("revision-00000"));
        assert!(!forward.contains("revision-09999"));
    }

    #[test]
    fn retention_keeps_recent_critical_and_legacy_history_by_policy() {
        let now = timestamp("2026-08-29T12:00:00Z");
        let mut entries = (0..80)
            .map(|index| {
                candidate(
                    format!("periodic-{index}"),
                    now - Duration::minutes(index * 10),
                    RevisionKind::Periodic,
                )
            })
            .collect::<Vec<_>>();
        entries.push(candidate(
            "restore-guard",
            now - Duration::days(400),
            RevisionKind::RestoreGuard,
        ));
        entries.push(candidate(
            "imported",
            now - Duration::days(300),
            RevisionKind::Imported,
        ));
        entries.push(candidate(
            "legacy-daily",
            now - Duration::days(45),
            RevisionKind::Legacy,
        ));
        entries.push(candidate(
            "legacy-weekly",
            now - Duration::days(180),
            RevisionKind::Legacy,
        ));
        let retained = retained_revision_ids(&entries, now, &HashSet::new());
        assert!(retained.contains("restore-guard"));
        assert!(retained.contains("imported"));
        assert!(retained.contains("legacy-daily"));
        assert!(retained.contains("legacy-weekly"));
    }

    #[test]
    fn snapshot_hash_is_deterministic_and_normalizes_line_endings() {
        let connection = hash_connection();
        set_sidecar(&connection, r#"{"b":2,"a":1}"#);
        let crlf = snapshot_hash_for_note(&connection, "note", "# Заголовок\r\n\r\nТекст 😀")
            .expect("hash CRLF");
        set_sidecar(&connection, r#"{"a":1,"b":2}"#);
        let lf = snapshot_hash_for_note(&connection, "note", "# Заголовок\n\nТекст 😀")
            .expect("hash LF");
        assert_eq!(crlf, lf);
        assert_eq!(crlf.len(), 64);
    }

    #[test]
    fn periodic_decision_respects_cadence_dedup_markdown_and_sidecar_changes() {
        let connection = hash_connection();
        set_sidecar(&connection, r#"{"table":{"thickBorders":true}}"#);
        let before_cadence = periodic_revision_decision(
            &connection,
            "note",
            "Таблица и формула $E=mc^2$",
            Some("2026-08-29T12:00:00Z"),
            "2026-08-29T12:00:59Z",
        )
        .expect("decision before cadence");
        assert_eq!(before_cadence.snapshot_hash, None);

        let hash = snapshot_hash_for_note(&connection, "note", "Таблица и формула $E=mc^2$")
            .expect("baseline hash");
        connection
            .execute(
                "INSERT INTO note_revisions (
                    id, note_id, content_markdown, snapshot_hash, created_at, revision_kind
                 ) VALUES ('revision', 'note', ?1, ?2, '2026-08-29T11:00:00Z', 'periodic')",
                params!["Таблица и формула $E=mc^2$", hash],
            )
            .expect("insert baseline revision");
        connection
            .execute(
                "INSERT INTO note_revision_sidecars (
                    revision_id, kind, schema_version, payload_json
                 ) VALUES ('revision', 'editor_node_attrs_v1', 1, ?1)",
                params![r#"{"table":{"thickBorders":true}}"#],
            )
            .expect("insert baseline sidecar");

        let identical = periodic_revision_decision(
            &connection,
            "note",
            "Таблица и формула $E=mc^2$",
            Some("2026-08-29T12:00:00Z"),
            "2026-08-29T12:01:00Z",
        )
        .expect("identical decision");
        assert_eq!(identical.snapshot_hash, None);

        let markdown_changed = periodic_revision_decision(
            &connection,
            "note",
            "Таблица и формула $E=mc^3$ 😀",
            Some("2026-08-29T12:00:00Z"),
            "2026-08-29T12:01:00Z",
        )
        .expect("changed markdown decision");
        assert!(markdown_changed.snapshot_hash.is_some());

        set_sidecar(
            &connection,
            r#"{"table":{"thickBorders":false},"image":{"src":"data:image/png;base64,AAAA","alignment":"right"}}"#,
        );
        let sidecar_changed = periodic_revision_decision(
            &connection,
            "note",
            "Таблица и формула $E=mc^2$",
            Some("2026-08-29T12:00:00Z"),
            "2026-08-29T12:01:00Z",
        )
        .expect("changed sidecar decision");
        assert!(sidecar_changed.snapshot_hash.is_some());
    }

    #[test]
    fn retention_applies_recent_hourly_daily_and_expiry_tiers() {
        let now = timestamp("2026-08-29T12:00:00Z");
        let mut entries = (0..RECENT_REVISION_COUNT)
            .map(|index| {
                candidate(
                    format!("recent-{index}"),
                    now - Duration::minutes(index as i64),
                    RevisionKind::Periodic,
                )
            })
            .collect::<Vec<_>>();
        entries.extend([
            candidate(
                "within-day-new",
                timestamp("2026-08-29T10:15:00Z"),
                RevisionKind::Periodic,
            ),
            candidate(
                "within-day-old",
                timestamp("2026-08-29T10:10:00Z"),
                RevisionKind::Periodic,
            ),
            candidate(
                "within-week-new",
                timestamp("2026-08-26T10:20:00Z"),
                RevisionKind::Periodic,
            ),
            candidate(
                "within-week-old",
                timestamp("2026-08-26T10:10:00Z"),
                RevisionKind::Periodic,
            ),
            candidate(
                "within-month-new",
                timestamp("2026-08-15T11:00:00Z"),
                RevisionKind::Periodic,
            ),
            candidate(
                "within-month-old",
                timestamp("2026-08-15T10:00:00Z"),
                RevisionKind::Periodic,
            ),
            candidate(
                "expired-periodic",
                timestamp("2026-07-01T10:00:00Z"),
                RevisionKind::Periodic,
            ),
        ]);
        let retained = retained_revision_ids(&entries, now, &HashSet::new());
        assert!(retained.contains("within-day-new"));
        assert!(!retained.contains("within-day-old"));
        assert!(retained.contains("within-week-new"));
        assert!(!retained.contains("within-week-old"));
        assert!(retained.contains("within-month-new"));
        assert!(!retained.contains("within-month-old"));
        assert!(!retained.contains("expired-periodic"));
    }

    #[test]
    fn revision_pruning_performance_probe() {
        for size in [100_usize, 1_000, 10_000] {
            let mut connection = Connection::open_in_memory().expect("open prune database");
            connection
                .execute_batch(
                    "CREATE TABLE note_revisions (
                        id TEXT PRIMARY KEY,
                        note_id TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        revision_kind TEXT NOT NULL
                     );",
                )
                .expect("create prune schema");
            let now = timestamp("2026-08-29T12:00:00Z");
            {
                let transaction = connection.transaction().expect("begin fixture insert");
                {
                    let mut statement = transaction
                        .prepare(
                            "INSERT INTO note_revisions (id, note_id, created_at, revision_kind)
                             VALUES (?1, 'note', ?2, 'periodic')",
                        )
                        .expect("prepare fixture insert");
                    for index in 0..size {
                        let created_at = (now - Duration::minutes(index as i64))
                            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
                        statement
                            .execute(params![format!("revision-{index:05}"), created_at])
                            .expect("insert prune fixture");
                    }
                }
                transaction.commit().expect("commit fixture insert");
            }
            let started = std::time::Instant::now();
            let transaction = connection.transaction().expect("begin prune");
            let stats = prune_note_revisions(
                &transaction,
                "note",
                "2026-08-29T12:00:00Z",
                true,
                &HashSet::new(),
            )
            .expect("prune fixtures");
            transaction.commit().expect("commit prune");
            let elapsed = started.elapsed();
            assert!(stats.after <= REVISION_HARD_CAP);
            println!(
                "REVISION_PRUNE_PERF before={} after={} elapsed_ms={}",
                size,
                stats.after,
                elapsed.as_millis()
            );
        }
    }
}
