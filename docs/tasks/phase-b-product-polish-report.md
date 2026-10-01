# Phase B: Accepted Product Polish

Date: 2026-10-01. Branch: `feature/rc3-product-polish`.
Baseline: `381175354a6128ca097f97f7d796d2ba652df01d`
(`feat: complete rc3 product polish phase A`).
Application version remains `1.0.0-rc.2`; product identity remains
`NoteFlow` / `com.noteflow.desktop`.

The user accepted the complete Phase B final smoke. This report consolidates
implementation, indexing corrections, standalone scope and responsive QA.
Intermediate reports remain local historical notes, not duplicate deliverables.
No Phase C work is included.

## Knowledge Scope

The selector reuses the portal positioning helper, icons, design tokens and
Russian pluralization. Lists longer than seven active projects are searchable.
Escape restores trigger focus; outside pointer/focus closes the popover.
Failed persistence retains the previous selection.

- NULL project IDs mean ALL: current/future active projects and standalone notes.
- Explicit IDs with false standalone flag mean only those projects.
- Explicit IDs with true flag mean project OR active standalone notes.
- Empty IDs with true mean standalone-only, including future standalone notes.
- Empty IDs with false mean no scope, never ALL; composer/send are disabled.

ALL checks every active project and standalone. Unchecking a project preserves
standalone selection. Checking every current option remains explicit until ALL
is selected; future projects do not silently join an explicit scope.

The typed command validates active project IDs and persists mutable chat scope
transactionally. Each user request snapshots both scope parts in its existing
transaction. Generation and Retry use the original request, not today's selector.
Assistant persistence copies request scope with answer/source snapshots.
Renaming preserves selection.

The shared bound SQL scope governs metadata counts, chronology/date/subject
queries, lexical/exact-title candidates, semantic/hybrid retrieval and final
source validation. An inferred project narrows the selection. Final validation
reads current SQLite relations, rejecting fabricated frontend source metadata.
Archived projects are excluded from active retrieval even if a legacy note
archive flag is inconsistent. Historical messages/sources are not rewritten.
Project moves change future retrieval without reembedding unchanged content.

## Migrations and Backup

| Migration | Purpose |
| --- | --- |
| 16 | Nullable project scopes on chats/messages |
| 17 | Durable note queue and automatic-sync generation |
| 18 | Enqueue only actual searchable content/metadata changes |
| 19 | Reconcile mutable scopes on project archive/delete |
| 20 | Standalone flag, backward-compatible false default |

Archive/delete removes unavailable IDs only from mutable chat scope. Empty
stays empty; ALL stays NULL. Mixed scope retains standalone after its last
project disappears. Historical Retry scopes remain unchanged.

Backup v5 carries additive serde-default scope fields without a version bump.
Legacy explicit selections remain project-only. Tests exercise migrations 1-19
then 20, DB reopen and ZIP restore of mixed chat/request scopes. No secrets added.

## Automatic Knowledge Indexing

SQLite triggers are the shared notification boundary for autosave, title edits,
create/duplicate, revision restore and import. Queue changes commit with notes;
failed/stale writes do not create successful jobs. Existing P0 atomic storage,
content-version guards, Markdown-first pipeline, sidecars, revisions, lifecycle
chunk sync and startup reconcile are preserved.

A dedicated Rust worker owns a separate WAL connection and shares the embedding
operation registry with recovery actions. HTTP does not hold the main store
mutex or a long SQLite write transaction. Autosave sends no embedding request.

- Debounce: 1500 ms; maximum continuous-edit wait: 15 seconds.
- One row per note, coalesced to latest generation; local batch: 100 notes.
- Polling: 500 ms; ordinary backlog continues in 50 ms ticks.
- Provider retry: exponential from 15 seconds, capped at 300 seconds.
- Completion checks latest generation; edits during a request remain pending.
- Restart resumes durable note queue and unfinished vector work.

Migration 18 ignores unchanged assignments and cache/sidecar-only saves.
Enabled profiles recover despite an old failed connection test. Disabled
profiles and cloud profiles without profile-specific consent are skipped.
Provider failure cannot reject a successfully saved local note.

Vector commits revalidate chunk identity/hash, note version, current source,
deletion, profile configuration and cancellation after HTTP. Semantic retrieval
ignores vectors when chunks lag saved Markdown, caching checks per note.
Queued notes prevent a false current status before sync.

Normal update buttons are removed from RAG, embedding cards and knowledge
settings. Existing recovery/rebuild remains behind additional actions and
confirmation. Mounted screens poll status every three seconds with cleanup and
stale-result guards. Connection-test success is not proof of index health.

## Onboarding, Tooltips and Copy

One six-step first-run introduction replaces the session-only flow. Back/Next/
Skip reuse ModalShell. Completion and Skip persist in SQLite; failure retains
the dialog with a safe retryable error. Next does not submit the new final form.
Historic completion/demo markers, customized profiles or existing notes,
projects, tags, chats or models suppress onboarding.

Shared portal tooltips use 350 ms hover/focus delay, cancel on exit/click and
close on Escape/scroll/resize. Cleanup restores previous aria-describedby.
Chat copy/history/actions/sources/settings/composer use the shared mechanism.
Knowledge settings explain fragments as smaller note parts for precise search.
The chunker and stored note content are unchanged.

## Responsive Layout

The old budget reserved 440 unscaled pixels despite zoomed chat controls and
physical persisted panel widths. At 160% this allowed an unusably narrow chat.
Intrinsic grid minimums also caused overflow from long source/assistant text.

The corrected budget reserves 440 CSS pixels converted with the shared
physical-layout helper, without scaling panel widths twice. Three columns remain
when they fit; otherwise existing mutually exclusive drawers are used.
Returning to wide restores docked preferences without changing persisted widths.
No editor remount or retrieval behavior change is introduced.

Sources/assistant text use zero-minimum grid tracks and wrapping. A 640 CSS
pixel conversation query places title/actions in deliberate rows.
useRagOverlayBounds observes full header/composer so drawers cannot cover them.
Compact history uses one action row, leaving a full history item at 160%.

## Final Accepted Checks

These checks ran in the final implementation pass, before this commit-only
review; they are not claimed as fresh native/build runs during commit review.

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run test | 349/349, 60 suites, no failures/skips; 39.80 s |
| npm run build | PASS; 222 modules, 4.18 s; no large-chunk warning |
| cargo fmt --check | PASS |
| cargo check | PASS |
| cargo test | 239 passed, 5 intentionally ignored; 21.62 s |
| cargo clippy --all-targets --all-features -- -D warnings | PASS |
| npm run tauri dev | PASS, isolated synthetic native QA |
| npm run tauri build | PASS; 2m 23s Rust release compilation, NSIS/two MSI |
| git diff --check | PASS |

Ignored Rust tests: two external Bridge smokes, two performance benchmarks and
one isolated native fixture seeder. Normal suite totals do not count them as run.
FTS ran separately without dev/build activity: 10,000-note indexing
11.1692676 seconds, query 0.6303 ms, total 11.18 seconds. Not repeated for layout.

Behavioral DOM tests cover selector persistence/Retry/empty/busy/errors,
onboarding, tooltip and stable drafts/messages/citations across layout changes.
Rust SQLite/provider integration covers migration/reopen/backup, scoped metadata,
retrieval/source authority, atomic autosave queue recovery and stale HTTP discard.

Reusable Playwright geometry fixtures use actual RAG components/production CSS
with synthetic mock IPC, no database or real provider. Six viewport/zoom pairs,
three titles and four panel states give 72 cases plus four live zoom cases:
76 passed checks, zero measured horizontal overflow. Live 100/125/160/100
preserves draft, 12 answers and explicit scroll position.

| Physical viewport / zoom | Both panels requested | Chat CSS width |
| --- | --- | ---: |
| 1100x700 / 100% | One drawer | 770 |
| 1100x700 / 160% | One drawer | 476.72 |
| 1440x900 / 100% | Three columns | 510 |
| 1440x900 / 160% | One drawer | 671.75 |
| 1920x1080 / 100% | Three columns | 990 |
| 2560x1440 / 100% | Three columns | 1630 |

To reproduce: start local Vite, supply a runtime containing Playwright with
NOTEFLOW_QA_NODE_MODULES if not locally installed, then run
`node scripts/qa/rag-layout-geometry.mjs`. Installed Edge is used. No production
dependency was added. Screenshots default to the OS temporary directory.

## Native Evidence and Limits

Real Tauri QA used a synthetic temporary profile and loopback provider, never
user notes/credentials or cloud calls. Observed onboarding completion/restart,
autosave/index recovery while offline, ALL/project/standalone/mixed scopes,
project moves, archive reconciliation, error-Retry after scope change and
chat/history/source persistence.

Layout was operated at 1100x700 client size, 100/125/160% and the available
maximized 1536x816 work area. Long text, drawer switching, portal and drafts
were inspected. Exact 1920/2560 results are geometry, not native display evidence.
Native destructive project deletion was not repeated; SQLite tests passed.
Synthetic provider checks do not establish real-model quality. The user
separately confirmed final product smoke and accepted Phase B.

Known out-of-scope diagnostics: TipTap duplicate link/underline warnings and
nonfatal WebView class-unregistration error 1412 on shutdown. QA processes
exited normally. Sequential worker profiles can delay each other under a slow
provider; bounded timeouts/backoff remain. Empty unchanged legacy profiles
without completion markers cannot always be distinguished from first use.

## Commit Scope and Privacy

Included: accepted Phase B code/tests, three reusable geometry harness files and
this single final report. Excluded locally: temporary native provider and three
intermediate reports. No QA DB/profiles, screenshots, logs, binaries, dependency
directories or build outputs are included. Fixtures are explicitly synthetic.

Version sources, product identity, Phase A behavior and Phase C editor/image/
table/export/calendar functionality are unchanged by commit preparation.
The requested operation is one Phase B commit, not a tag, push, release or merge.
