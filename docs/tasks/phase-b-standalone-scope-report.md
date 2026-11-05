# Phase B: Standalone and Mixed Knowledge Scope

Date: 2026-10-01. Branch: `feature/rc3-product-polish`.
HEAD: `381175354a6128ca097f97f7d796d2ba652df01d`.
Application version: `1.0.0-rc.2`, unchanged.

## Scope and Compatibility

The former nullable project-ID array could represent ALL or selected projects,
but could not explicitly include notes without a project. Removing a project
from ALL therefore silently excluded standalone notes.

The array remains the persisted project selection. Migration 20 additively adds
`include_standalone` to `ai_chats` and `ai_messages`, with default false and a
boolean CHECK constraint. No fake project ID or captured list of all projects
is used.

- NULL project IDs mean ALL: current and future active projects and standalone
  notes. The stored boolean is irrelevant in this mode.
- Explicit IDs plus false mean only those projects (the backward-compatible
  interpretation of previous explicit scopes).
- Explicit IDs plus true mean those projects OR active standalone notes.
- An empty array plus true is standalone-only, including future standalone notes.
- An empty array plus false matches nothing, never ALL.

Standalone membership is evaluated by SQLite `notes.project_id IS NULL`, not by
frontend inspection. Deleted and archived standalone notes are excluded.
The existing explicit archive-query behavior outside standalone selection is
not redesigned by this corrective pass.

## Selector and Empty State

The selector now says `Вся база` and includes `Заметки вне проектов` as a separate
checkbox. ALL visually selects every active project and standalone. Unchecking
a project from ALL preserves standalone; unchecking standalone produces an
explicit project-only scope. Selecting every currently visible checkbox remains
explicit until the user selects ALL, preserving the distinction for new projects.

Standalone remains selectable with zero projects or zero standalone notes.
Empty explicit scope disables the composer and send action and explains:
`Выберите хотя бы один проект или заметки вне проектов.` It does not save a new
question or start retrieval. Selecting a nonempty scope re-enables the composer.

## Query, Source and Retry Authority

`project_scope::sql_value` builds a bound JSON object containing both parts of the
explicit selection. Structured counts, chronology, date ranges, subject queries,
lexical/exact-title candidates, semantic candidates and hybrid retrieval use the
same project OR standalone semantics. A project inferred from the question is
an intersection, not an expansion of the selected scope.

The query preview passes the standalone flag to typed frontend retrieval.
Final source validation reads the current SQLite note relation through
`note_matches_filters`, so fabricated frontend source/project metadata cannot
admit a note from an excluded project.

Each persisted user request snapshots both scope parts transactionally.
Generation and Retry read that original request, not the current chat selector.
Assistant persistence copies the request's scope in the same transaction as
the answer and source snapshots. Renaming a chat preserves its selection.

Existing project archive/delete reconciliation still removes only mutable chat
project IDs. It preserves the standalone flag and historical message snapshots.
After removal of the last selected project, a mixed scope remains standalone-only;
a project-only scope remains empty, not ALL.

## Persistence and Backup

Both scope fields are returned by typed Tauri commands and restored on reload.
Backup chat/message records include an additive serde-default boolean. Existing
backup formats lacking that field still load as false for explicit selections;
there is no application or backup-format version bump for this additive field.
An actual ZIP export/import test verifies mixed chat and original-request scope.
A real migration-chain test applies versions 1-19, inserts legacy scopes and
checks migration 20 does not broaden them.

## Project Moves and Automatic Indexing

Retrieval joins the current note row rather than relying on a captured project
relation in vectors. Moving a standalone note into BETA excludes it from
standalone-only and admits it to BETA. Removing it from BETA reverses membership.
Metadata/chunk reconciliation keeps content-identical vectors valid. A test-only
HTTP client that panics on any call proves unchanged content is not reembedded.

The previous durable queue, 1.5-second debounce, coalescing, backoff, stale-vector
protection and restart recovery were not rewritten. Their existing behavioral
and SQLite integration tests remain green.

## Automated Coverage

Frontend DOM tests exercise:

- ALL and checkbox presentation, project and standalone toggles, mixed and empty
  selections, return to ALL, newly added projects, missing projects and busy/error
  behavior;
- actual workspace send prevention for empty scope and recovery to standalone-only;
- original mixed request scope reused by Retry after the current selector changes.

Rust integration tests exercise:

- deterministic S1/S2/A1/B1 scopes for ALL, standalone, A, A+standalone, A+B,
  B+standalone and empty in lexical, semantic and hybrid paths;
- first/latest/last-edited/count/date metadata for ALL, standalone, A and
  A+standalone, archived/deleted exclusion and inferred-project intersection;
- relation moves in both directions without redundant embedding calls;
- source rejection even when frontend relation metadata is spoofed;
- original Retry and persisted assistant snapshot flags;
- reopen/ZIP backup restore, legacy migration defaults, project archive/delete
  reconciliation without mutation of historical scopes.

## Check Results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 339/339, 59 suites, 9.04 s |
| `npm run build` | PASS, no large-chunk warning |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS |
| `cargo test` | PASS: 239, 5 explicitly ignored, 0 failures; 52.62 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| FTS dedicated ignored benchmark | PASS: indexing 27.376 s, query 1.4864 ms |
| `npm run tauri dev` isolated profile | Blocked by an existing dev instance and occupied port 1420 |
| `npm run tauri build` | PASS: release EXE, en-US MSI, ru-RU MSI and NSIS generated |
| `git diff --check` | PASS; Git emits LF/CRLF conversion notices only |

The initial sandboxed npm-test invocation was unable to spawn Node test children
(`EPERM`). The complete rerun with the required process permission passed.
The earlier full-suite failure in the mock chat-rename response was fixed by
preserving its scope flag, matching production command behavior.

The FTS benchmark ran separately from this agent's dev/build/test tasks. An
unrelated user dev instance was observed around this period, so strict
dev-free-environment verification still requires closing that instance and
rerunning the dedicated benchmark.

## Native QA and Limits

A separate synthetic SQLite fixture was prepared at
`%TEMP%/noteflow-standalone-scope-20261001`, using the previous isolated QA profile's
loopback-only model metadata, never the user's profile or credentials. It contains:

- standalone S: `STANDALONE_SECRET_481`;
- ALPHA: `ALPHA_SECRET_927`;
- BETA: `BETA_SECRET_315`.

The temporary provider is loopback-only and does not log prompts or credentials.
The first `tauri dev` attempt encountered port 1420 in use; the single-instance
plugin focused the already open user instance instead of opening this QA profile.
That window was only inspected, not used for test modifications, model changes
or requests. Native scope/move/restart QA is therefore NOT claimed as passed.
The user was asked to close their dev instance; it was not forcibly terminated.

Real Bridge `cifra48/embedding` + `cifra48/agent` remains a separate user smoke.
Synthetic-provider results cannot be claimed as Bridge verification.

## Files and Final State

This correction touches scope-related code in `data.rs`, `project_scope.rs`,
`knowledge_agent.rs`, `embedding.rs`, `rag.rs`, the RAG selector/workspace and
typed RAG/embedding services, plus behavioral/integration tests and this report.
The earlier Phase B working tree remains intact. No unrelated editor, table,
image, formula, export, calendar or context-menu changes were added by this scope
correction. No commit, tag, push, version bump or Phase C work was performed.

Final Git status: 28 modified tracked files and 8 untracked files, including the
earlier Phase B changes and this report. All five version/config sources are
unchanged. HEAD and branch are unchanged. Only the agent's synthetic provider
was stopped after verification; the user's running dev instance was left alone.

Release artifacts (not published or copied into release staging):

- `src-tauri/target/release/noteflow.exe`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`
- `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe`

Previous implementation-pass verdict: **NEEDS MORE WORK** solely because native scope/move/restart QA
and strictly dev-free FTS verification remain uncompleted. Automated correctness
and full release builds are green. Close the user dev instance before continuing
the remaining isolated QA; do not use its profile for test changes.

## Follow-Up QA: Clean Benchmark and Native Scope Checks

This section supersedes the previous pass's check results and native-QA limits.
No production code, test code, version source or threshold was changed during
this QA pass. Only this report was updated. The existing Phase B working tree
was preserved.

### Clean FTS Benchmark

Before running the benchmark, no NoteFlow, cargo, rustc or linker process was
running. No dev server or build was launched concurrently. Command:

```text
cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --exact --nocapture --test-threads=1
```

- Profile: Rust `test`, unoptimized + debuginfo.
- Indexing: **11.1692676 s**.
- Query: **630.3 us / 0.6303 ms**.
- Total test time: 11.18 s; 1 passed, 243 filtered out.
- Previous indexing: 27.3761607 s; query: 1.4864 ms.

Indexing was approximately 2.45 times faster. This is consistent with concurrent
dev/system load affecting the earlier result, but a single comparison does not
prove causation. No FTS regression was demonstrated and no threshold or search
implementation was changed.

### Native QA Environment

The actual Tauri debug executable was operated through its Windows UI using
`NOTEFLOW_DEV_DATA_DIR=%TEMP%/noteflow-standalone-scope-20261001`.
The QA profile was copied from an earlier synthetic QA profile, not from the
user's database. It used the loopback-only provider at `127.0.0.1:19999`, with
synthetic chat and embedding models and no API keys. Its deterministic embedding
vectors prove scope filtering and source handling, not semantic ranking quality.
No request was sent to Bridge or a cloud provider.

Native actions created MOVE_TEST_001, moved it into/out of ALPHA, edited its
content, archived BETA, changed the chat scope and restarted the application.
No real user notes, chats, model profiles or credentials were modified.

| Scenario | Native result |
| --- | --- |
| ALL | PASS: S, ALPHA and BETA were returned as three real retrieval sources. |
| Uncheck BETA from ALL | PASS: explicit ALPHA + standalone; fresh answer excluded BETA. |
| Standalone-only | PASS: initial answer used only S. |
| ALPHA-only | PASS: initial answer used only ALPHA. |
| ALPHA + standalone | PASS: both selected categories, no BETA source. |
| Empty selection | PASS: explanatory hint, disabled composer/send, no silent ALL. |
| Standalone note moved into ALPHA | PASS: MOVE_TEST_001 disappeared from standalone retrieval and appeared in ALPHA. |
| Note removed from ALPHA | PASS: reverse membership change in both fresh queries. |
| Automatic indexing after edit | PASS: fresh source contained NEW_SCOPE_VALUE, not OLD_SCOPE_VALUE, without manual refresh. |
| Retry original mixed scope | PASS for the existing error-Retry flow; details below. |
| Restart persistence | PASS: same chat, messages, source snapshots and checked ALPHA + standalone restored. |
| Archive BETA from explicit ALPHA + BETA + standalone | PASS: BETA removed, ALPHA and standalone remained checked. |
| Delete temporary project | NOT RUN through native UI: action-time confirmation was requested but not received. Existing Rust integration coverage passed. |
| Selector at 1100 x 700 client size, 100% and 160% | PASS: complete standalone label, ALPHA visible, popover inside the viewport. |
| Selector at wider restored window, 100% and 160% | PASS for the popover itself; broader workspace issue below. |
| Complete native 1440 x 900 viewport | NOT VERIFIED: available capture was 1442 x 864 including window chrome; exact full-height coverage is not claimed. |

The 1100 x 700 window was launched using an ephemeral CLI configuration, not
by editing `tauri.conf.json`. Its captured outer size was 1102 x 731 including
window borders/title bar. The application's zoom control displayed 160%.

Retry was tested by stopping the agent-owned loopback provider, submitting a
request with ALPHA + standalone, observing the failure and Retry action,
restarting the provider, changing the current selector to BETA-only, and clicking
Retry. The new result used MOVE_TEST_001, ALPHA and S, not BETA. The current
selector remained BETA. Successful assistant answers have no Retry action in
the current UI, so the literal "retry an old successful answer" scenario was
not available and is not claimed as tested. No new Retry feature was added.

Historical messages may still display OLD_SCOPE_VALUE in their preserved source
snapshots; this is expected. The newly retrieved source displayed NEW_SCOPE_VALUE.

### Responsive Finding and Remaining Native Limits

At the wider restored window (capture 1442 x 864), 160% zoom and simultaneously
open conversation history and sources, a horizontal scrollbar appeared inside
the sources panel. The chat title/subtitle also became a narrow, heavily wrapped
column. The project selector's popover itself remained readable and fully inside
the window. This is a confirmed workspace layout issue, not evidence of incorrect
standalone filtering. It was recorded rather than expanding this scope-QA pass
into a general RAG layout redesign.

At 1100 x 700, responsive overlay/collapse behavior produced a usable main chat
and readable selector at 160%. Full native 1440 x 900 still requires a display
that can expose the complete window. Native project deletion remains pending
confirmation; the passed integration tests are not a substitute for claiming
that destructive UI scenario passed.

### Full Regression After Native QA

All agent-owned NoteFlow/dev/provider processes were stopped before the checks.

| Check | Latest result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 339/339, 59 suites, 10.8818 s |
| `npm run build` | PASS: 221 modules, Vite build 3.93 s, no large-chunk warning |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS |
| `cargo test` | PASS: 239, 5 explicitly ignored, 0 failures; test execution 30.89 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| Clean dedicated FTS benchmark | PASS: 11.1692676 s indexing, 0.6303 ms query |
| `npm run tauri dev` | PASS: isolated native QA and restart |
| `npm run tauri build` | Not repeated: successful previous build, no production source changes in this QA pass |
| `git diff --check` | PASS; LF/CRLF notices only |

Sandboxed npm test/build and the QA restart initially encountered `spawn EPERM`;
the full reruns with process permission passed. Frontend tests still emit existing
TipTap duplicate-extension warnings for `link` and `underline`. Native shutdown
emitted a WebView class-unregistration diagnostic (1412); both QA runs exited
normally and no NoteFlow process remained. These warnings were not hidden or
fixed in this QA-only task.

Final state remains branch `feature/rc3-product-polish`, HEAD
`381175354a6128ca097f97f7d796d2ba652df01d`, application `1.0.0-rc.2`, with 28 modified
tracked files and 8 untracked files. All five application-version sources remain
unchanged. No commit, tag, push, Phase C or repeat release build was performed.

Latest verdict: **NEEDS MORE WORK**. Scope correctness, automatic indexing,
restart persistence and automated regression passed, but the wider-window
workspace layout issue and the explicitly unverified native checks prevent
claiming the complete requested smoke matrix is green.
