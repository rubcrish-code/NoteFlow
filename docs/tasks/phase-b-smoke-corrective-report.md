# Phase B smoke corrective pass

Date: 01.10.2026. Project: `D:\Projects\NoteFlow`.
Branch: `feature/rc3-product-polish`.
HEAD: `381175354a6128ca097f97f7d796d2ba652df01d`.
Version remains `1.0.0-rc.2`; identity remains `NoteFlow` / `com.noteflow.desktop`.

This report supersedes the indexing eligibility and project-selection details
of the earlier `phase-b-product-polish-report.md`. The previous Phase B working
tree was preserved. No commit, tag, push, version change, or Phase C work.

## 1. Reproduced Causes

Two actual regressions were reproduced with SQLite/provider fixtures before
changing production behavior:

- `failed_connection_check_does_not_disable_automatic_recovery` failed: the
  worker made zero requests after `last_status` became `error`, even though the
  provider had recovered. It incorrectly required an earlier successful
  connection test to attempt automatic work.
- `queued_change_cannot_report_current_before_local_sync` failed: embedding
  status was `current` while a changed note was still in the durable local
  queue. It compared cached chunks/vectors without considering queued notes.

The frontend also used that historical connection-test flag as a retrieval
gate. Even a recovered current index could remain unusable in the chat.
The queue update trigger additionally reacted to `content_version` changes
and updates assigning unchanged values, allowing cache-only saves to postpone
the debounce for a real earlier edit.

These are code-level reproductions, not a claim that the user's private profile
or Bridge credentials were inspected.

## 2. Save Paths and Durable Notification

There was no need to add another editor callback or replace the accepted P0
persistence pipeline. Ordinary editor updates, AI insertions and pasted content
share `AppShell.flushPendingSave` / per-note pending saves ->
`dataService.updateNoteContent` -> `update_note_content` -> SQLite `notes`.
Timer autosave, explicit flush, note-switch flush, close flush and failed-save
retry use that same path. Title edits use `rename_note` -> `UPDATE notes`.
Create, duplicate, revision restore and import also insert/update `notes`.

The durable SQLite triggers are the shared notification boundary, so individual
frontend save paths cannot forget an indexing callback. For a relevant content
save the queue entry commits in the same transaction as note/sidecar/revision.
Rollback or rejected optimistic writes do not leave a successful queue event.
The existing `expectedContentVersion` and per-note save coordination remain.

Migration 18 replaces the update trigger for both fresh and previously created
Phase B profiles. It checks real old/new changes in Markdown, plain text, title,
project membership, archive and deletion state. JSON/HTML cache-only and unchanged
assignments no longer enqueue or restart the debounce. A title change refreshes
chunk metadata but does not re-embed an unchanged chunk hash.

## 3. Worker, Debounce and Recovery

The existing durable queue and dedicated Rust worker are retained:

- One queue row per note, with a monotonically advanced generation.
- 1500 ms quiet-period debounce; 15 second maximum wait during continuous edits.
- 500 ms worker observation interval; bounded local batches of 100 notes.
- Local backlog continues in short ticks rather than provider-error backoff.
- Provider retry starts at 15 seconds, doubles and caps at 300 seconds.
- Completion checks the latest generation after HTTP work; changes made during
  the request remain scheduled.

Autosave performs no embedding HTTP request and does not wait for the provider.
Local chunk sync already present in the save path was not rewritten.
Enabled profiles are now eligible regardless of their last connection-test
result. Disabled profiles and cloud profiles without profile-specific consent
remain skipped. The worker does not grant consent or expose API keys.

Restart observes the persisted generation and unfinished queue/vector state,
drains local work and retries missing embeddings without a manual refresh.
The operation registry still prevents worker/manual updates competing for the
same profile. HTTP is outside the main store mutex and long SQLite transactions.

## 4. Stale Content and Status

The existing Phase B HTTP-result guard checks chunk identity/hash, note content
version, current source state, profile identity/configuration and cancellation
before vector commit. Old content cannot become a current vector. Retrieval
excludes vectors whose chunks lag authoritative saved content.

Embedding status now includes the durable note queue. A queued content change
cannot report `current` merely because old vectors match old cached chunks.
Statuses remain pending/indexing, partial/retry or failed until work completes.
`pendingChunks` still counts actual chunk work, not queued-note rows.

RAG accepts a recovered usable index even if the last connection test failed;
cloud consent remains mandatory. Settings badge tone reflects the actual index,
not an old connection-test result. The existing three-second status polling is
retained. The fast-provider transient indexing badge was not captured natively;
queue-before-sync status is covered by the deterministic Rust regression test.

## 5. ALL and Explicit Scope

The selector used to compute checked rows only from explicit IDs. ALL was stored
correctly as `NULL` but appeared as unchecked projects.

Now ALL (`NULL` / frontend `null`) checks every active project, including newly
created projects, without persisting a snapshot list. ALL includes standalone
notes. Unchecking B from A/B/C creates explicit A+C; standalone notes are then
excluded. Rechecking B yields explicit A+B+C, NOT ALL: those scopes differ in
standalone-note semantics. The separate `Все проекты` control returns to ALL.

An explicit empty array means no selected projects, not ALL. The selector/chat
state says `Проекты не выбраны`. ALL is still valid with zero projects because
standalone notes may exist.

## 6. Archive/Delete and Retry

Migration 19 reconciles existing mutable RAG-chat filters against active
projects. SQLite project archive/delete triggers remove unavailable IDs from
`ai_chats.project_scope_json` in the same logical database operation. An emptied
explicit filter stays `[]`; ALL stays `NULL`.

Historical `ai_messages.project_scope_json` is intentionally NOT rewritten.
Retry continues using the original message's scope, not the current selector.
Historical answer/source snapshots also remain unchanged and readable.
The archive/delete test verifies persisted filters after database reopen.

## 7. Focused Corrective Files

| File | Corrective change |
| --- | --- |
| `src-tauri/src/auto_knowledge.rs` | Relevant-change trigger, retry eligibility, queue count, reproduction tests |
| `src-tauri/src/embedding.rs` | Pending note queue participates in index status |
| `src-tauri/src/project_scope.rs` | Mutable scope archive/delete reconciliation SQL |
| `src-tauri/src/data.rs` | Migrations 18/19, explicit empty scope, full persistence/retrieval integration tests |
| `src/features/rag/ProjectScopeSelector.tsx` | Checked ALL rows and distinct explicit scope |
| `src/features/rag/RagChatWorkspace.tsx` | Recovered index eligibility and empty-scope labels |
| `src/features/settings/SemanticSearchSettings.tsx` | Actual index status determines badge tone |
| `tests/phaseBPolish.test.ts` | Behavioral ALL/new project/empty/archive/delete selector coverage |
| `tests/ragWorkspace.test.ts` | Recovered index and original-scope Retry coverage |
| `docs/tasks/phase-b-smoke-corrective-report.md` | This verification report |

Other pre-existing Phase B files remain uncommitted and were not discarded.

## 8. Automated Regression

The real file-backed `DataStore` integration test uses the complete migration
chain, real atomic create/update commands and a synthetic typed HTTP adapter.
It verifies OLD -> NEW persisted content/hash/queue -> semantic retrieval,
VERSION_1/2/3/FINAL coalescing, unchanged-cache saves, title metadata refresh
without another embedding, provider failure with successful local save, recovery
despite an error connection-test status, and pending work after DB reopen.

Additional tests cover queued false-current status, cloud consent, scheduling
backoff, edits during requests, old-vector discard and latest follow-up, and
archive/delete filter reconciliation without rewriting Retry snapshots.
Frontend tests mount actual selector/workspace components; they are behavioral
DOM tests, not source-regex replacements for those interactions.

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 336/336, 59 suites, 20.43353 seconds |
| `npm run build` | PASS: 221 modules, Vite 7.27 seconds |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS |
| `cargo test` | PASS: 235 passed, 5 ignored, 0 failed; 17.29 seconds |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| Isolated FTS benchmark | PASS, see below |
| `npm run tauri dev -- --no-watch` | PASS: two isolated-profile native launches |
| `npm run tauri build` | PASS: release EXE, en-US/ru-RU MSI and NSIS |
| `git diff --check` | PASS; only Git LF/CRLF normalization notices |

Five Rust tests are intentionally ignored in the normal suite; this is not a
claim that all external-provider or benchmark tests ran. The FTS test was run
separately without Tauri dev, provider, release build or other agent-started
heavy jobs: `cargo test search_performance_on_ten_thousand_notes -- --ignored
--nocapture --test-threads=1`. For 10,000 notes: indexing 11.7054534 seconds;
query 648.1 microseconds (0.6481 ms); test elapsed 11.71 seconds.

Frontend tests retain known TipTap duplicate `link`/`underline` warnings; those
editor concerns are outside this corrective scope. Rust check/clippy are clean.
QA native shutdown emitted a WebView class-unregister diagnostic (1412), but
both dev processes exited successfully without a stuck application process.

## 9. Actual Native QA

Real Tauri debug window; isolated `NOTEFLOW_DEV_DATA_DIR` profile
`%TEMP%\noteflow-phase-b-20261001`; synthetic HTTP provider on loopback port 19999.
No real user database, credentials or provider profiles were edited.

Verified through the interface, not direct SQL mutation of the UI scenario:

1. Created AUTO INDEX TEST and typed FIRST_VALUE_91827 in the ordinary editor.
2. Observed autosave; RAG returned FIRST_VALUE_91827 in the source snapshot.
3. Replaced the body with SECOND_VALUE_55129; no manual index/test control used.
4. A new RAG answer/source used SECOND_VALUE_55129, not FIRST_VALUE_91827.
   The old answer retained its historical source snapshot as intended.
5. ALL showed ALPHA/BETA checked; newly created GAMMA also appeared checked.
6. Unchecked BETA: ALPHA/GAMMA remained checked. A question returned only ALPHA
   evidence, excluding BETA and the standalone AUTO INDEX TEST note.
7. Returned to ALL: ALPHA/BETA/GAMMA checked again.
8. Stopped only the synthetic provider. Edited VERSION then VERSION FINAL.
   The note displayed `Сохранено`; RAG displayed `Ожидает повторной обработки`.
9. Closed the QA app normally, restarted the provider and the same QA app/profile.
   Without a manual update, status became current and a new RAG source contained
   VERSION FINAL. Chat history and the ALL filter survived restart.

The precise four-write faster-than-debounce sequence is deterministic integration
coverage; native QA exercised a shorter rapid-edit sequence and offline/restart
recovery. Archive/delete cleanup and an in-flight stale HTTP race were exercised
on isolated DB fixtures, not destructively on the real user profile.

The synthetic provider deliberately uses uniform vectors and returns supplied
source snapshots. This validates the real native transport/index/retrieval/scope
pipeline, not model quality or Bridge compatibility. User re-smoke remains
required with Bridge `cifra48/embedding` + `cifra48/agent`, and Ollama if available.

## 10. Final State

Version, product identity and HEAD are unchanged. The previous Phase B working
tree remains present: 28 modified tracked files and, with this report, 7 untracked
source/test/QA/report files. No commit/tag/push or Phase C work was performed.
The isolated QA app and loopback provider were stopped after verification.

Release outputs (not published or copied into a release staging directory):

- `src-tauri/target/release/noteflow.exe`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`
- `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe`

Final verdict: **READY FOR USER PHASE B RE-SMOKE**.

This is readiness for the required real-provider user re-smoke, not a claim
that Bridge or Ollama was tested in this corrective pass. No Phase C work begins.
