use crate::{data::DataResult, embedding, knowledge, llm};
use rusqlite::{params, Connection};
use std::{
    collections::HashMap,
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::{Duration, Instant},
};

pub type Operations = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;
const DEBOUNCE_MS: u64 = 1_500;
const MAX_WAIT_MS: u64 = 15_000;
const RETRY_BASE_MS: u64 = 15_000;
const RETRY_MAX_MS: u64 = 300_000;
const LOCAL_BATCH_SIZE: i64 = 100;

pub const MIGRATION_SQL: &str = r#"
    CREATE TABLE knowledge_sync_queue (
        note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
        generation INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO knowledge_sync_queue(note_id) SELECT id FROM notes WHERE deleted_at IS NULL;
    CREATE TABLE knowledge_auto_sync (
        singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
        generation INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO knowledge_auto_sync(singleton_id) VALUES(1);
    CREATE TRIGGER knowledge_queue_insert AFTER INSERT ON notes BEGIN
        INSERT INTO knowledge_sync_queue(note_id) VALUES(new.id);
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
    CREATE TRIGGER knowledge_queue_update
    AFTER UPDATE OF content_markdown, plain_text, content_version, title, project_id, archived_at, deleted_at ON notes BEGIN
        INSERT INTO knowledge_sync_queue(note_id) VALUES(new.id)
        ON CONFLICT(note_id) DO UPDATE SET generation = generation + 1;
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
    CREATE TRIGGER knowledge_queue_delete AFTER DELETE ON notes BEGIN
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
    CREATE TRIGGER knowledge_profile_insert AFTER INSERT ON embedding_profiles BEGIN
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
    CREATE TRIGGER knowledge_profile_update
    AFTER UPDATE OF model, base_url, embeddings_endpoint, enabled, api_key_ref, cloud_consent_at, last_status ON embedding_profiles BEGIN
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
    CREATE TRIGGER knowledge_project_update AFTER UPDATE OF title, archived_at ON projects BEGIN
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
    CREATE TRIGGER knowledge_tag_update AFTER UPDATE OF name ON tags BEGIN
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
    CREATE TRIGGER knowledge_tag_link_insert AFTER INSERT ON note_tags BEGIN
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
    CREATE TRIGGER knowledge_tag_link_delete AFTER DELETE ON note_tags BEGIN
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
"#;

// Upgrade already-created Phase B profiles too; cache/sidecar-only saves must
// not postpone indexing of a preceding searchable edit.
pub const UPDATE_TRIGGER_SQL: &str = r#"
    DROP TRIGGER knowledge_queue_update;
    CREATE TRIGGER knowledge_queue_update
    AFTER UPDATE OF content_markdown, plain_text, title, project_id, archived_at, deleted_at ON notes
    WHEN old.content_markdown IS NOT new.content_markdown
      OR old.plain_text IS NOT new.plain_text OR old.title IS NOT new.title
      OR old.project_id IS NOT new.project_id OR old.archived_at IS NOT new.archived_at
      OR old.deleted_at IS NOT new.deleted_at
    BEGIN
        INSERT INTO knowledge_sync_queue(note_id) VALUES(new.id)
        ON CONFLICT(note_id) DO UPDATE SET generation = generation + 1;
        UPDATE knowledge_auto_sync SET generation = generation + 1;
    END;
"#;

pub(crate) fn queued_note_count(conn: &Connection) -> DataResult<i64> {
    // Older standalone embedding fixtures deliberately predate the queue.
    let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='knowledge_sync_queue')", [], |row| row.get(0))?;
    if !exists {
        return Ok(0);
    }
    Ok(
        conn.query_row("SELECT COUNT(*) FROM knowledge_sync_queue", [], |row| {
            row.get(0)
        })?,
    )
}

#[derive(Default)]
struct Schedule {
    generation: i64,
    dirty_since: Option<u64>,
    last_change: u64,
    next_attempt: u64,
    failures: u32,
}

impl Schedule {
    fn observe(&mut self, generation: i64, now: u64) {
        if generation != self.generation {
            self.generation = generation;
            self.dirty_since.get_or_insert(now);
            self.last_change = now;
        }
    }

    fn ready(&self, now: u64) -> bool {
        self.dirty_since.is_some_and(|first| {
            now >= self.next_attempt
                && (now.saturating_sub(self.last_change) >= DEBOUNCE_MS
                    || now.saturating_sub(first) >= MAX_WAIT_MS)
        })
    }

    fn finish(&mut self, generation: i64, success: bool, now: u64) {
        if success {
            self.failures = 0;
            self.next_attempt = 0;
            if generation == self.generation {
                self.dirty_since = None;
            }
        } else {
            self.next_attempt =
                now + (RETRY_BASE_MS * (1_u64 << self.failures.min(5))).min(RETRY_MAX_MS);
            self.failures = self.failures.saturating_add(1);
        }
    }
}

fn generation(conn: &Connection) -> DataResult<i64> {
    Ok(conn.query_row(
        "SELECT generation FROM knowledge_auto_sync WHERE singleton_id = 1",
        [],
        |row| row.get(0),
    )?)
}

pub(crate) fn drain_local_queue(conn: &mut Connection) -> DataResult<bool> {
    let queued = conn
        .prepare("SELECT note_id, generation FROM knowledge_sync_queue ORDER BY rowid LIMIT ?1")?
        .query_map(params![LOCAL_BATCH_SIZE], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (note_id, version) in queued {
        if let Err(error) = knowledge::sync_note(conn, &note_id) {
            let _ = knowledge::mark_failed(conn, &note_id, "chunking_failed");
            return Err(error);
        }
        conn.execute(
            "DELETE FROM knowledge_sync_queue WHERE note_id = ?1 AND generation = ?2",
            params![note_id, version],
        )?;
    }
    let remaining: i64 =
        conn.query_row("SELECT COUNT(*) FROM knowledge_sync_queue", [], |row| {
            row.get(0)
        })?;
    if remaining == 0 {
        knowledge::mark_index_checked(conn, &chrono::Utc::now().to_rfc3339())?;
    }
    Ok(remaining == 0)
}

pub(crate) fn update_profiles<S: llm::SecretStorage, H: llm::HttpClient>(
    conn: &mut Connection,
    operations: &Operations,
    storage: &S,
    http: &H,
) -> DataResult<bool> {
    let profiles = embedding::list_profiles(conn, storage)?;
    let mut success = true;
    for dto in profiles {
        let profile = embedding::get_profile(conn, &dto.id)?;
        if !profile.enabled || (profile.locality == "cloud" && profile.cloud_consent_at.is_none()) {
            continue;
        }
        let status = embedding::get_index_status(conn, &profile.id)?;
        if status.status == "current" {
            continue;
        }
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let Ok(mut registry) = operations.lock() else {
                return Ok(false);
            };
            if registry.contains_key(&profile.id) {
                success = false;
                continue;
            }
            registry.insert(profile.id.clone(), cancel.clone());
        }
        let result = embedding::update_index(conn, &profile, storage, http, cancel, false);
        if let Ok(mut registry) = operations.lock() {
            registry.remove(&profile.id);
        }
        success &= result.is_ok_and(|result| result.status == "current");
    }
    Ok(success)
}

pub fn start(database_path: std::path::PathBuf, operations: Operations) -> std::io::Result<()> {
    std::thread::Builder::new()
        .name("noteflow-knowledge-sync".into())
        .spawn(move || {
            let Ok(mut conn) = super::data::open_background_connection(&database_path) else {
                return;
            };
            let started = Instant::now();
            let mut schedule = Schedule::default();
            loop {
                let now = started.elapsed().as_millis() as u64;
                if let Ok(current) = generation(&conn) {
                    schedule.observe(current, now);
                    if schedule.ready(now) {
                        // A normal backlog is not a provider failure: drain bounded local batches
                        // on subsequent ticks without applying the network retry backoff.
                        let success = match drain_local_queue(&mut conn) {
                            Ok(false) => {
                                std::thread::sleep(Duration::from_millis(50));
                                continue;
                            }
                            Ok(true) => update_profiles(
                                &mut conn,
                                &operations,
                                &llm::SystemSecretStorage,
                                &llm::CurlHttpClient,
                            )
                            .unwrap_or(false),
                            Err(_) => false,
                        };
                        let finished_at = started.elapsed().as_millis() as u64;
                        if let Ok(latest) = generation(&conn) {
                            schedule.observe(latest, finished_at);
                        }
                        schedule.finish(current, success, finished_at);
                    }
                }
                std::thread::sleep(Duration::from_millis(500));
            }
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn fixture() -> Connection {
        let conn = Connection::open_in_memory().expect("database");
        conn.execute_batch("PRAGMA foreign_keys=ON;
            CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT,content_markdown TEXT DEFAULT '',plain_text TEXT DEFAULT '',content_version INTEGER DEFAULT 0,project_id TEXT,archived_at TEXT,deleted_at TEXT,updated_at TEXT);
            CREATE TABLE projects(id TEXT PRIMARY KEY,title TEXT,archived_at TEXT);
            CREATE TABLE tags(id TEXT PRIMARY KEY,name TEXT);
            CREATE TABLE note_tags(note_id TEXT,tag_id TEXT);
            CREATE TABLE note_content_sidecars(note_id TEXT,kind TEXT,schema_version INTEGER,payload_json TEXT,created_at TEXT,updated_at TEXT);").expect("base schema");
        conn.execute_batch(knowledge::KNOWLEDGE_MIGRATION_SQL)
            .expect("chunks");
        conn.execute_batch(knowledge::KNOWLEDGE_METADATA_MIGRATION_SQL)
            .expect("check metadata");
        conn.execute_batch(embedding::EMBEDDING_MIGRATION_SQL)
            .expect("embeddings");
        conn.execute_batch(MIGRATION_SQL).expect("queue");
        conn.execute_batch(UPDATE_TRIGGER_SQL)
            .expect("relevant changes");
        conn
    }

    fn add_note(conn: &Connection) {
        conn.execute("INSERT INTO notes(id,title,content_markdown,plain_text,updated_at) VALUES('n','Title','Server Berlin','Server Berlin','2026-10-01')", []).expect("note");
    }

    fn profile(conn: &mut Connection, cloud: bool) -> embedding::EmbeddingProfileRecord {
        let request = serde_json::from_value(serde_json::json!({
            "name":"QA", "providerType":"openai", "baseUrl": if cloud {"https://example.invalid/v1"} else {"http://127.0.0.1:19999/v1"},
            "embeddingsEndpoint":"/embeddings", "model":"test", "batchSize":8, "timeoutSeconds":5,
            "locality":if cloud {"cloud"} else {"local"}, "deleteApiKey":false, "enabled":true
        })).expect("request");
        let saved = embedding::save_profile(conn, &llm::MemorySecretStorage::default(), request)
            .expect("profile");
        conn.execute(
            "UPDATE embedding_profiles SET last_status='success' WHERE id=?1",
            params![saved.id],
        )
        .expect("verified profile");
        embedding::get_profile(conn, &saved.id).expect("record")
    }

    struct CountingHttp {
        calls: Cell<usize>,
        fail: bool,
    }
    impl llm::HttpClient for CountingHttp {
        fn send(&self, request: llm::HttpRequest) -> DataResult<llm::HttpResponse> {
            self.calls.set(self.calls.get() + 1);
            let count = request.body.expect("body")["input"]
                .as_array()
                .expect("inputs")
                .len();
            Ok(llm::HttpResponse { status: if self.fail {401} else {200}, body: serde_json::json!({"data":(0..count).map(|index| serde_json::json!({"index":index,"embedding":[1.0,0.5]})).collect::<Vec<_>>()}).to_string() })
        }
    }

    #[test]
    fn queue_coalesces_to_latest_saved_content_and_indexes_it_once() {
        let mut conn = fixture();
        add_note(&conn);
        for version in 1..=4 {
            conn.execute("UPDATE notes SET content_markdown=?1, plain_text=?1,content_version=?2 WHERE id='n'", params![format!("Server v{version}"), version]).expect("edit");
        }
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM knowledge_sync_queue", [], |row| row
                .get::<_, i64>(
                0
            ))
            .expect("coalesced"),
            1
        );
        assert!(drain_local_queue(&mut conn).expect("drain"));
        assert!(
            knowledge::get_chunks_by_note_id(&conn, "n").expect("chunks")[0]
                .content_text
                .contains("v4")
        );
        let profile = profile(&mut conn, false);
        let http = CountingHttp {
            calls: Cell::new(0),
            fail: false,
        };
        let operations = Arc::new(Mutex::new(HashMap::new()));
        assert!(update_profiles(
            &mut conn,
            &operations,
            &llm::MemorySecretStorage::default(),
            &http
        )
        .expect("auto index"));
        assert_eq!(http.calls.get(), 1);
        assert_eq!(
            embedding::get_index_status(&mut conn, &profile.id)
                .expect("index")
                .status,
            "current"
        );
        assert!(update_profiles(
            &mut conn,
            &operations,
            &llm::MemorySecretStorage::default(),
            &http
        )
        .expect("unchanged"));
        assert_eq!(http.calls.get(), 1);
    }

    #[test]
    fn provider_failure_preserves_note_and_cloud_without_consent_never_sends() {
        let mut conn = fixture();
        add_note(&conn);
        drain_local_queue(&mut conn).expect("local sync");
        let local = profile(&mut conn, false);
        let http = CountingHttp {
            calls: Cell::new(0),
            fail: true,
        };
        let operations = Arc::new(Mutex::new(HashMap::new()));
        assert!(!update_profiles(
            &mut conn,
            &operations,
            &llm::MemorySecretStorage::default(),
            &http
        )
        .expect("retryable failure"));
        assert_eq!(
            conn.query_row(
                "SELECT content_markdown FROM notes WHERE id='n'",
                [],
                |row| row.get::<_, String>(0)
            )
            .expect("local content"),
            "Server Berlin"
        );
        let working = CountingHttp {
            calls: Cell::new(0),
            fail: false,
        };
        assert!(update_profiles(
            &mut conn,
            &operations,
            &llm::MemorySecretStorage::default(),
            &working
        )
        .expect("recovery"));
        assert_eq!(
            embedding::get_index_status(&mut conn, &local.id)
                .expect("recovered")
                .status,
            "current"
        );
        let cloud = profile(&mut conn, true);
        let calls = working.calls.get();
        assert!(update_profiles(
            &mut conn,
            &operations,
            &llm::MemorySecretStorage::default(),
            &working
        )
        .expect("skip cloud"));
        assert_eq!(working.calls.get(), calls);
        assert!(
            embedding::get_index_status(&mut conn, &cloud.id)
                .expect("pending cloud")
                .pending_chunks
                > 0
        );
    }

    #[test]
    fn failed_connection_check_does_not_disable_automatic_recovery() {
        let mut conn = fixture();
        add_note(&conn);
        drain_local_queue(&mut conn).expect("drain");
        let profile = profile(&mut conn, false);
        conn.execute(
            "UPDATE embedding_profiles SET last_status='error' WHERE id=?1",
            params![profile.id],
        )
        .expect("failed connection test");
        let http = CountingHttp {
            calls: Cell::new(0),
            fail: false,
        };
        assert!(update_profiles(
            &mut conn,
            &Arc::new(Mutex::new(HashMap::new())),
            &llm::MemorySecretStorage::default(),
            &http
        )
        .expect("automatic recovery"));
        assert_eq!(
            http.calls.get(),
            1,
            "a connection-test error must not permanently disable indexing"
        );
        assert_eq!(
            embedding::get_index_status(&mut conn, &profile.id)
                .expect("status")
                .status,
            "current"
        );
    }

    #[test]
    fn queued_change_cannot_report_current_before_local_sync() {
        let mut conn = fixture();
        add_note(&conn);
        drain_local_queue(&mut conn).expect("drain");
        let profile = profile(&mut conn, false);
        let http = CountingHttp {
            calls: Cell::new(0),
            fail: false,
        };
        update_profiles(
            &mut conn,
            &Arc::new(Mutex::new(HashMap::new())),
            &llm::MemorySecretStorage::default(),
            &http,
        )
        .expect("index");
        conn.execute("UPDATE notes SET content_markdown='NEW',plain_text='NEW',content_version=content_version+1 WHERE id='n'", []).expect("persist");
        assert_ne!(
            embedding::get_index_status(&mut conn, &profile.id)
                .expect("queued status")
                .status,
            "current"
        );
    }

    #[test]
    fn metadata_archive_and_delete_hooks_are_durable_and_do_not_rewrite_content() {
        let mut conn = fixture();
        add_note(&conn);
        drain_local_queue(&mut conn).expect("drain");
        for sql in [
            "UPDATE notes SET title='Renamed' WHERE id='n'",
            "UPDATE notes SET project_id='a' WHERE id='n'",
            "UPDATE notes SET archived_at='2026-10-01' WHERE id='n'",
            "UPDATE notes SET archived_at=NULL WHERE id='n'",
        ] {
            let before = generation(&conn).expect("generation");
            conn.execute(sql, []).expect("metadata hook");
            assert!(generation(&conn).expect("generation") > before);
            assert!(drain_local_queue(&mut conn).expect("drain"));
        }
        let before = generation(&conn).expect("generation");
        conn.execute("INSERT INTO note_tags VALUES('n','tag')", [])
            .expect("tag hook");
        assert!(generation(&conn).expect("generation") > before);
        conn.execute("DELETE FROM notes WHERE id='n'", [])
            .expect("delete");
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM knowledge_chunks", [], |row| row
                .get::<_, i64>(0))
                .expect("cascade"),
            0
        );
    }

    #[test]
    fn restart_schedule_resumes_existing_dirty_generation_with_bounded_backoff() {
        let mut conn = fixture();
        add_note(&conn);
        let mut resumed = Schedule::default();
        resumed.observe(generation(&conn).expect("persisted generation"), 0);
        assert!(resumed.ready(DEBOUNCE_MS));
        for _ in 0..12 {
            resumed.finish(resumed.generation, false, 100);
        }
        assert_eq!(resumed.next_attempt, 100 + RETRY_MAX_MS);
        assert!(drain_local_queue(&mut conn).expect("resume queue"));
    }

    #[test]
    fn rapid_updates_coalesce_to_latest_generation_and_do_not_starve() {
        let mut schedule = Schedule::default();
        for version in 1..=4 {
            schedule.observe(version, version as u64 * 400);
            assert!(!schedule.ready(version as u64 * 400));
        }
        assert!(!schedule.ready(3_099));
        assert!(schedule.ready(3_100));
        assert_eq!(schedule.generation, 4);
        schedule.finish(4, true, 3_100);
        assert!(!schedule.ready(30_000));
        schedule.observe(5, 30_000);
        schedule.observe(6, 44_999);
        assert!(schedule.ready(45_000));
    }

    #[test]
    fn failure_backs_off_and_edits_during_a_request_remain_pending() {
        let mut schedule = Schedule::default();
        schedule.observe(1, 0);
        schedule.finish(1, false, 2_000);
        assert!(!schedule.ready(16_999));
        assert!(schedule.ready(17_000));
        schedule.observe(2, 18_000);
        schedule.finish(1, true, 19_000);
        assert!(schedule.ready(19_500));
        schedule.finish(2, true, 20_000);
        assert!(!schedule.ready(21_500));
    }
}
