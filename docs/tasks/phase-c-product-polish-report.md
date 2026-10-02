# Phase C: accepted editor and Settings product polish

Date: 02.10.2026. Branch: `feature/rc3-product-polish`.
Parent commit: `b53d8a171feb9e0f245127d7fb24d06f3baf008a` (accepted Phase B).
Application version remains `1.0.0-rc.2`; productName remains `NoteFlow`;
identifier remains `com.noteflow.desktop`; MSI mapping remains `0.99.2`.

The user has accepted Phase C after the final native re-smoke. This is the
consolidated final report; the two detailed local editor/Settings reports are
retained outside the commit. Phase D/E, backend, migrations and release
configuration are not changed by this phase. No tag, push or release is requested.

## Editor synchronization and formatting

The old reload policy could replace the live TipTap document with a lossy
Markdown/cache save acknowledgement and reset selection or newer local input.
Reload now occurs only on initial load, note-ID change or explicit
`documentReloadGeneration`. Same-ID restore/import still reloads; ordinary
autosave acknowledgements do not. Existing persistence queues, optimistic
concurrency, transactions and close/import coordination remain unchanged.

StarterKit no longer duplicates explicitly installed Link, Underline and Code.
Code marks allow compatible companion marks, whose visual details use the
existing sidecar. A Marked lexer handles nested inline/list grammar. Text color
and highlight are independent; changing highlight sets its color, and clearing
it does not remove text color or other marks. Nested task-list indentation and
the lexer checkbox token are handled without losing Markdown semantics.

`@tiptap/extension-code` is now a direct dependency already present transitively;
`marked` is the small production parser dependency. No new UI library is added.

## Tables, Details and divider

ProseMirror TableMap supplies logical table geometry rather than serializing
only physical cells. Markdown includes empty covered slots; optional
`tableLayouts` in the existing `editor_node_attrs_v1` sidecar restores validated
colspan/rowspan geometry before appearance and text marks. If externally edited
Markdown has content in a covered slot, the stale layout is rejected instead
of discarding that content. No SQLite or sidecar schema-version change occurs.

Details uses an editable NodeView and a separate accessible toggle. Collapse
hides content without deleting it, moves selection out of hidden content when
necessary, persists its existing open attribute and cleans up event handlers.
Dividers remain horizontalRule nodes and serialize as `---`.

## Interaction changes

The editor-only context menu uses shared toolbar formatting commands and a
selection bookmark. Document changes invalidate the bookmark/menu; asynchronous
clipboard actions verify their operation token and document before applying.
Normal inputs retain their native context menu. Clipboard failure shows a toast.

Tab/Shift+Tab use list indentation for list/task items, two-space indentation
inside code blocks, sidecar-backed indentation for paragraphs/headings, and
existing TipTap cell navigation inside tables. Normal inputs are unaffected.
Prose and long URLs wrap without page overflow; code blocks retain their own
horizontal scrolling. Safe links expose URL-only tooltips through TooltipPortal,
with existing URI validation and no metadata/network fetch.

Formula nodes, commands, insert UI, icon, serializer/parser branches and chat
rendering are removed as explicitly accepted. Dollar expressions remain plain
text. Date nodes remain; no destructive data migration is introduced.

## Settings sidebar corrective fix

Settings shares `.nav-i`/`.nav-sec` classes with MainSidebar. Global
`.collapse-sb` selectors incorrectly hid Settings labels and centered its items.
All MainSidebar collapse rules in `app.css`/`pages.css` are now scoped to `.sb`.
The existing PageShell grid and `--page-sbw` still drive layout; no negative
margins, alternate zoom calculations or hardcoded expanded offsets are added.

Settings keeps its existing wide/compact layout and form max-width. Physical
navigation X changes from 290 to 114 at 100%, 300 to 124 at 125%, and 314 to 138
at 160%: the same 176-pixel released sidebar width at each zoom.

## Accepted verification results

These are the latest completed Phase C checks preceding this commit-only pass,
not a claim that all builds were rerun during staging. Only the consolidated
report is added during this pass; production source and tests are unchanged.

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | 373 passed, 62 suites, 0 failed/skipped; 13.474 s |
| `npm run build` | PASS; Vite 4.48 s; no large-chunk warning |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS |
| `cargo test` | 239 passed, 5 intentionally ignored, 0 failed; 19.83 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| `npm run tauri dev` | PASS; isolated-profile native editor and Settings QA |
| `npm run tauri build` | PASS; NSIS and ru-RU/en-US MSI, unchanged RC.2 version |
| Editor browser geometry | 8/8 PASS |
| Settings browser geometry | 24/24 PASS |

The isolated FTS benchmark ran without concurrent dev/build: 10,000 notes,
indexing 12.4585467 s, query 975 microseconds, PASS. The five ignored Rust tests
are not counted as passed. No new Rust tests are needed for this frontend phase.
Lint script is absent. Git LF/CRLF notices are not whitespace-check failures.

## Behavioral and native coverage

`phaseCEditor.test.ts` adds 27 behavioral tests using actual editor extensions
and mounted EditorArea: compatible marks, independent resets, merged-table
roundtrip, Details/divider, Tab contexts, ten edit/ack cycles, same-ID reload,
note switching and real context-menu selection. `settingsSidebarLayout.test.ts`
mounts SettingsPage and checks five live collapse cycles across all six sections.

Reusable browser fixtures mount actual components and production CSS with
synthetic data/mock IPC. Editor geometry covers 1100x700 and 1440x900, 100/160%,
light/dark. Settings covers 1100x700, 1440x900, 1920x1080 and 2560x1440,
100/125/160%, light/dark, five collapse cycles and all six subpages. Geometry
assertions check viewport fill, overflow, labels, panel bounds and menu/tooltip
positioning. Screenshots are written to TEMP, not committed.

Developer native QA used an isolated debug profile, not the user's database or
credentials. It verified cursor edits across autosave/restart, combined marks,
color/highlight resets, horizontal table merge/split/restart, Details, divider,
context formatting and paragraph Tab. Settings had five collapse cycles each
at 100% and 160%, all six sections at 160%, and basic other-page navigation.
The actual maximized native window was 1536x816; larger/exact window matrices
are browser coverage, not claimed native coverage. The user separately accepted
the final re-smoke. A nonfatal WebView unregister diagnostic 1412 occurred at
shutdown; the process exited with code 0.

## Scope, privacy and remaining limitations

Candidate changes contain synthetic fixture text, example.com/localhost URLs
and public npm registry metadata, not real notes/chats, credentials, API keys,
Authorization values, private provider endpoints or user-home paths. No QA
profile, database, screenshot, log, benchmark output or installer is included.
The four specified local Phase B files are preserved and excluded. The two
local detailed Phase C reports are preserved and excluded in favor of this one.

General raw HTML paste and arbitrary nested non-paragraph content in merged
Markdown table cells are not newly promised. Clipboard availability depends
on WebView permissions. Full native Tab/vertical-merge/viewport matrices are
not claimed beyond the documented tests. Images/crop/drawing, calendars,
callout colors, exports, TOC and other Phase D/E work are outside this commit.

Accepted status: Phase C complete; ready for the separately requested commit.
