# RC5 Usability and Editor Polish

## Baseline and Release Control

- Branch: `feature/rc5-usability-editor-polish`.
- HEAD: `234e9737e694a84d10bccdee6fef1da29516ff07`, published RC4 baseline.
- Initial tracked tree was clean; seven intentional untracked QA reports/scripts are preserved.
- Version remains `1.0.0-rc.4` in package.json, package-lock.json/root package, Cargo.toml, Cargo.lock and tauri.conf.json.
- Product remains NoteFlow; identifier remains `com.noteflow.desktop`.
- No git add, commit, tag, push, merge, version bump or GitHub release.
- No migration, production dependency, backup-format or Markdown serialization change.
- Implementation is complete for all 39 items. User acceptance and the native scenarios explicitly listed below remain pending.
- Current tree: 52 tracked status entries and 18 untracked files. Cargo.toml is a Tauri CLI line-ending/stat-only entry with no semantic diff. Eleven untracked files belong to this task; seven pre-existing files remain untouched.

## Status Interpretation

PASS in the automated column means the named automated checks passed; it does not imply native Windows verification. PENDING USER SMOKE is not a disguised PASS. Native checks used the debug Tauri application with an isolated profile; they are not packaged-installer tests.

## All 39 Requirements

| # | Requirement | Implementation and evidence | Automated | Native / Acceptance |
|---|---|---|---|---|
| 1 | Replay onboarding | Settings General opens the existing FirstRunModal in replay mode. Same six steps; finish/skip only closes it. Behavioral tests and actual six-step replay. | PASS | PASS |
| 2 | Empty-state copy | Removed the instruction to clear search when no notes exist; retained create-note guidance without an empty wrapper. Initial native empty profile inspected. | PASS | PASS |
| 3 | Default profile name | Shared frontend/Rust defaults are Пользователь. Existing stored profile names are not rewritten. Actual fresh QA profile shows the default. | PASS | PASS |
| 4 | Editable Markdown import names | Per-file editable title, Unicode length counter, explicit 25-character validation and Импортировать action. DOM test imports two renamed files without changing Markdown. | PASS | PENDING USER SMOKE |
| 5 | All-notes scope label | Все заметки replaces Вся база in the scope UI. Internal scope IDs and retrieval semantics are unchanged. Scope tests updated. | PASS | PENDING USER SMOKE |
| 6 | Button alignment | Shared flex icon/text alignment, SVG block rendering, spinner spacing and common input/control tokens. CSS AST tests; native Settings/project controls inspected. Full control/state/zoom matrix remains pending. | PASS | PENDING USER SMOKE |
| 7 | Active project deletion | Active-project menu has separated danger action; typed service invokes the shared Rust cascade transaction. Rust deletion and fault rollback tests. Menu inspected natively without final deletion. | PASS | PENDING USER SMOKE |
| 8 | Shared project confirmation | Active/archive reuse ProjectDeleteDialog with exact-name guard, note count, zero-note copy, busy guard and safe error. DOM wrong-name/cancel/Escape tests; native zero-note modal and Escape checked. | PASS | PENDING USER SMOKE |
| 9 | Note deletion warning | Editor/archive/list confirmations explain that the note cannot be recovered. Context-menu cancellation has no persistence effect. | PASS | PENDING USER SMOKE |
| 10 | Duplicate project names | Unicode case/trim comparison inside Immediate SQLite transaction for create/rename, excluding the edited ID. Safe error code and explicit message. Real creation with differently cased/spaced Cyrillic duplicate rejected. | PASS | PASS for creation; rename PENDING USER SMOKE |
| 11 | Active/archive FTS groups | Search includes archive by default, displays separate active/archive groups, preserves archive state and keyboard order. Existing FTS tests plus grouped-list DOM behavior. | PASS | PENDING USER SMOKE |
| 12 | One project per note | Permanent explanation in the project chooser; existing move confirmation remains. No change to internal project ownership. | PASS | PENDING USER SMOKE |
| 13 | 25-character entity names | Shared Unicode-scalar count and matching Rust chars validation for create/manual rename/import. No truncation. Inline counter is visible while editing. Old long titles remain readable and unchanged; unchanged legacy project title allows description editing. | PASS | PENDING USER SMOKE |
| 14 | Settings descriptions | Removed subtitle and model-section description width caps; natural wrapping still applies when space is genuinely limited. Native inspection identified the second cap; CSS AST guards cover both. | PASS | PENDING USER SMOKE for final Models width matrix |
| 15 | Archive restore in overflow | Restore removed from the row and retained in its actions menu. DOM test confirms absence before menu opening and correct restore target. | PASS | PENDING USER SMOKE |
| 16 | Markdown import location | Removed only Settings Data import control. Existing main note-menu import, commands and pipeline retained. | PASS | PENDING USER SMOKE |
| 17 | Stable tag search | Controlled frontend search preserved; Unicode literal backend filtering replaces ASCII-only SQLite lower/LIKE. Latest-response guards prevent old secondary data from replacing newer state. Repeated query/clear/count-refresh DOM and Rust tests. Original UI input-loss report was not reproduced and is not attributed to SQL without evidence. | PASS | PENDING USER SMOKE |
| 18 | Temporary editor matches | ProseMirror decorations span marked text, update after edits/undo, count/navigate matches and do not change selection, Markdown, sidecar or autosave. FTS query opens the bar without stealing focus. Native Cyrillic query, both matches, next and clear verified at 100%. | PASS | PASS at 100%; 160% PENDING USER SMOKE |
| 19 | Contextual hints | Existing TooltipPortal reused through InfoHint in provider/model, temperature, scope, indexing and backup settings. Short Russian explanations, no second tooltip system. | PASS | PENDING USER SMOKE |
| 20 | Neutral question icons | Focusable informational span, neutral hover, default cursor, no action handler. Actual TooltipPortal focus/Escape behavioral test and CSS guards. Keyboard focus ring retained. | PASS | PENDING USER SMOKE |
| 21 | Zoom draft / Apply | Appearance changes only draft until Apply; leaving unmounts/discards it. Existing zoom shortcuts unchanged. DOM tests and real 100-to-160-to-100 Apply verified. | PASS | PASS for Apply; restart PENDING USER SMOKE |
| 22 | Data/export simplification | Removed two redundant export dividers and bulk-delete button outline, preserving danger color and confirmation. Existing behavior tests retained. | PASS | PENDING USER SMOKE |
| 23 | Note-list right-click | Context menu targets clicked card/result, not selected note. Duplicate/pin/archive or restore/export/delete reuse existing actions and confirmation. DOM correct-target/cancel tests. | PASS | PENDING USER SMOKE |
| 24 | Action-only top note menu | Removed redundant title/header; existing action handlers retained. | PASS | PENDING USER SMOKE |
| 25 | Native file drop | Hit-testing accepts the full writing viewport, not only the small content DOM; target position is clamped into document coordinates. PNG/JPEG/WEBP remain images; generic supported files remain attachments. Same managed import/backend limits as picker and paste. Geometry/type tests pass; Explorer/Desktop/MIME/size matrix not executed natively. | PASS | PENDING USER SMOKE |
| 26 | Image resize coordinates | Uses actual rendered/layout dimensions and pointer deltas divided by scale. Preserves aspect ratio, avoids initial jump and allows bounds below normal minimum for already-small images. Geometry regression at 100/160 plus existing image tests. | PASS | PENDING USER SMOKE |
| 27 | Selected table headers | Row/column actions use selectedRect/TableMap, not TipTap's first row/column toggle. Merged cells transformed once; attributes/marks retained. Real TipTap middle/multiple selection and canonical reload tests. | PASS | PENDING USER SMOKE |
| 28 | Subtle table borders | Default 1px subtle border; existing thick black border toggle unchanged. CSS tests and existing table-sidecar regressions. | PASS | PENDING USER SMOKE |
| 29 | Stable scrollbar layout | Editor viewport reserves scrollbar gutter on both sides; no document storage change. CSS AST assertion. Actual scrollbar-threshold/zoom matrix still pending. | PASS | PENDING USER SMOKE |
| 30 | Block-menu geometry | Consistent two-column tracks, gaps, padding/minimum height and SVG alignment; compact single-column fallback. Style regressions plus existing insertion behavior tests. | PASS | PENDING USER SMOKE |
| 31 | Compact date action | Date follows drawing; calendar opens on date action, not unrelated block menus. Existing captured-selection insertion behavior retained; date insertion tests updated. | PASS | PENDING USER SMOKE |
| 32 | Sidebar anchors | Equal expanded/collapsed navigation height/gap, stable brand height and new-note spacing. Existing motion preserved. Native screenshots confirm unchanged navigation vertical positions at 100 and 160%. | PASS | PASS in inspected wide window; narrow PENDING USER SMOKE |
| 33 | Current project file references | list_projects counts distinct current note_asset_refs blobs, not attachment metadata/revisions. Successful project-note saves refresh only guarded project counters. Shared/revision assets retained by existing GC. Rust save/remove/shared-blob/reinsert/delete regression. | PASS | PENDING USER SMOKE |
| 34 | ZIP dialog filter | Project export filter is ZIP-архив (*.zip), extension/bytes/layout unchanged. Existing actual ZIP extraction tests plus dialog contract. | PASS | PENDING USER SMOKE |
| 35 | Export spinner spacing | Shared actions menu/loading control flex gap and block SVG baseline. Disabled/loading flow unchanged. CSS regression. | PASS | PENDING USER SMOKE |
| 36 | Note title hierarchy | 36px title, existing H1 body hierarchy preserved, no viewport-scaled font. Native title inspected; long/narrow matrix pending. | PASS | PENDING USER SMOKE |
| 37 | Unlink action | Убрать гиперссылку with unlink icon, existing extendMarkRange/unsetLink command. Real TipTap test preserves visible text/bold and supports undo. Safe-link rules unchanged. | PASS | PENDING USER SMOKE |
| 38 | Layout-bounded Tab | Removed six-level UI limit; available writing width bounds indentation. Shift-Tab/list/code behavior retained; sidecar reload preserves deeper indent. Fixed-page DOCX/PDF cap prevents unusable export widths. | PASS | PENDING USER SMOKE |
| 39 | Justify | Fourth toolbar alignment action, selected state and TipTap command. Existing textAlign sidecar persists it; Markdown stays clean. Actual DOCX XML and generated PDF tests cover justify/deep indentation/marks. | PASS | PENDING USER SMOKE |

## Root Causes and Scope

### Management and search

- Active project deletion was absent from the active menu. It now calls the same database note-cascade abstraction used by archived projects, not an independent delete implementation.
- Duplicate project names were previously accepted. Validation is inside a SQLite write transaction to avoid a check/write race; frontend validation provides early feedback but is not the authority.
- Tag SQL lower() did not normalize Cyrillic case, and LIKE treated user wildcard characters as patterns. Rust Unicode lowercase/literal contains fixes those concrete issues. The reported disappearing frontend input was not reproduced; its actual controlled input remains in place.
- Archive matches were opt-in and intermixed with active matches. They are now enabled by default, grouped and keyboard-ordered in displayed order.
- Editor search did not exist as a temporary document decoration layer. It now does. Native QA also caught initial autofocus stealing the FTS input; a behavioral test verifies that it no longer happens.
- The shared deletion name field and note-search input initially missed common input styling. Native QA caught both; they now reuse nf-input.

### Editor, sidebar and attachments

- Resize mixed CSS layout coordinates with zoomed rendered bounds and persisted dimensions. The initial box now comes from actual element size and delta conversion is explicit.
- TipTap default header-row/header-column actions affect the first row/column. The new helper targets the selected rectangle.
- Editor indentation was capped at six regardless of usable width. It now derives a bound from current layout and persists through the existing sidecar.
- Sidebar collapsed navigation and brand geometry differed from expanded geometry. Shared heights/gaps keep navigation anchors stable.
- Native drop required a hit on editor.view.dom; the blank writing viewport could reject an otherwise valid file before format detection. This concrete geometry error is fixed. No evidence is claimed that a particular allowed file extension itself failed in a native test.
- Project file count joined attachments metadata, which can intentionally remain for revision/history safety. It now counts current document references instead.
- A broad secondary-data refresh after every autosave would introduce avoidable tag/archive IPC. The final implementation refreshes project counters only for project notes, guards stale responses and preserves current project titles.
- Settings had two independent text-width caps; native Models inspection found the second after the initial subtitle fix.

## Data, Markdown and Reference Integrity

- No migrations or SQLite timestamp/storage-format changes.
- New active project command uses a real transaction: delete_note_rows for each note, mark knowledge state changed, delete project, commit, then existing reference-aware GC outside the transaction.
- Fault injection uses a temporary trigger on project deletion after note operations. Failure rolls back project, all notes and the active note_search_fts rows. Successful cascade removes all three fixture notes.
- Existing deletion path cleans relational/search/chunk/vector state and preserves historical RAG citation snapshots according to RC4 behavior. This was not replaced.
- PendingNoteSaves deletion can target only affected note IDs. Existing pending-save draining and CAS protection remain; unrelated project drafts are not discarded.
- Current-reference counts exclude revision-only and stale metadata entries. The same physical blob in two notes counts once; removing one reference does not hide the remaining one. Removing the last current reference removes the project count without destroying a revision-owned asset.
- Ingestion may temporarily hold pending references until the next canonical save. That safety mechanism is intentionally retained rather than forcing GC during insertion.
- Existing Markdown-first serializer/load pipeline, P0 partial-underline/bold regression, formulas, dates, tables, assets and backup contracts passed the complete existing suite.
- Search decorations are not serialized and do not create revisions or trigger autosave.
- Justify/table header/deep indent reuse existing sidecar storage; they do not become a new text source.
- New title validation counts Unicode scalar values consistently across frontend/Rust, not grapheme clusters. A composed emoji or combining-mark sequence can count as multiple characters. Existing titles are not truncated or automatically renamed.
- Duplicate of an overlong legacy note uses a valid generic copy title, leaving original title/content untouched.

## Automated Verification

| Gate | Result | Evidence |
|---|---|---|
| npm run typecheck | PASS | Final post-native-fix run |
| npm run test | PASS | 601 tests, 75 suites, 0 failures/skips; 25.215 s final run |
| npm run build | PASS | 257 modules; Vite 15.95 s |
| cargo fmt --check | PASS | Elevated repeat after sandbox path-canonicalization denial |
| cargo check | PASS | 41.21 s final run |
| cargo test | PASS | 273 passed, 10 ignored, 0 failed; 283 discovered; 23.27 s test execution |
| cargo clippy --all-targets --all-features -- -D warnings | PASS | 23.02 s final run |
| npm audit --omit=dev --offline=false | PASS | 0 vulnerabilities |
| Isolated FTS benchmark | PASS | Existing exact ignored benchmark: 10,000 notes; 679.6 microseconds/query; indexing 11.4140638 s |
| npm run tauri dev | PASS | Real isolated debug Tauri window; closed through X and process exited |
| npm run tauri build | PASS | Release compilation 2m 30s; NSIS and en-US/ru-RU MSI completed |
| git diff --check | PASS | No whitespace errors; Git emitted CRLF conversion notices |

FTS benchmark was run separately, without Tauri dev or a production build running concurrently. It was not compared against a performance run under concurrent compilation.

New frontend coverage totals 36 tests over the baseline: four RC5 files (settings, management, editor and parsed-CSS invariants), selective pending-save safety and actual justify DOCX/PDF export. Existing tests were updated for intentional labels/geometry, not deleted to obtain a PASS. Six new Rust integration tests cover entity validation, Cyrillic/literal tag filtering, current assets, active-project cascade and rollback. Existing RC4 backup/CAS/clipboard/RAG/security coverage remains.

Style checks use the already-installed PostCSS parser from the Vite toolchain; no dependency/package changes were made. DOM/TipTap behavioral tests are distinguished from CSS and source-contract tests.

Final frontend bundle: entry 348.12 kB, editor runtime 473.84 kB, React 192.54 kB, Settings 80.27 kB. PDF export remains a large deferred worker-only chunk (2,287.96 kB); it was not pulled into the startup bundle.

## Native Windows QA Actually Performed

Isolated profile: `D:\Projects\NoteFlow\releases\qa\rc5-usability-profile`, verified Git-ignored. It contains only synthetic QA data, no copied user database, providers, credentials or real notes.

Observed with Computer Use, not inferred from JSX:

1. Fresh empty profile: Пользователь and useful create-note empty copy.
2. Skipped initial training, opened Settings General, replayed the same six steps and finished without profile recreation/name form/new note.
3. Settings and model section layout at 100%; native inspection found and prompted removal of the model description width cap.
4. Zoom remained unchanged while the draft became 160%; Apply changed the actual layout. Applied back to 100%.
5. Light and dark Appearance views at 160%, dark view at 100%.
6. Sidebar collapse at 160% and expansion at 100%; navigation vertical anchors stayed stable.
7. Created isolated project RC5 проверка; attempting differently cased/spaced duplicate showed explicit error and did not create a second project.
8. Active project actions contain the separated red delete action. Opened zero-note confirmation, observed disabled delete and warning, then cancelled with Escape. Final destructive deletion was not performed through UI.
9. Created isolated RC5 поиск note, typed synthetic Cyrillic text and observed autosave reaching saved.
10. FTS поиск displayed the result, editor count 1/2, highlighted both differently cased occurrences, next switched to 2/2, clear removed the highlights.
11. After the focus fix, entered the FTS query in two separate inputs: п followed by оиск. Focus stayed in the global search field.
12. Editor title and toolbar inspected in dark theme at 100% in 1536x816 maximized and 1442x882 restored windows.
13. Closed QA through system X; dev command ended and no NoteFlow process remained.

Native UI deletion was intentionally stopped at confirmation. Actual cascade/rollback was verified on temporary SQLite fixtures.

Native Ctrl+F opened the built-in WebView find bar in this environment instead of the React handler. This optional shortcut is a KNOWN LIMITATION; the required FTS-to-editor highlighting/navigation flow was genuinely verified. It is not counted as a successful custom Ctrl+F test.

The dev shutdown emitted WebView2 Chrome_WidgetWin_0 unregister error 1412; shutdown nevertheless completed with exit 0 and no remaining NoteFlow process. No claim is made that this upstream diagnostic was fixed.

## Packaged QA and Security

- Production build: PASS. Final artifacts exist in target/release; these are local QA builds with the unchanged RC4 version, not a staged or published RC5 release.
- EXE: `D:\Projects\NoteFlow\src-tauri\target\release\noteflow.exe`.
- NSIS: `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.4_x64-setup.exe` (6,037,779 bytes).
- MSI en-US: `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_en-US.msi` (8,146,944 bytes).
- MSI ru-RU: `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` (8,146,944 bytes).
- Packaged installer lifecycle / packaged native smoke: NOT TESTED in this task.
- The isolated-profile override is debug-only. The release EXE was not launched against the user's live data merely to claim packaged QA.
- API keys, secure storage and provider auth logic are unchanged. No user credentials were read or copied into QA.
- No external AI requests were issued from this QA profile. Bridge/Ollama live regression is PENDING USER SMOKE, not an automated PASS.
- No new content logging was added. New backend validation errors are allowlisted public errors; SQL/raw input is not exposed.
- QA databases, build outputs and synthetic data stay in Git-ignored locations. No release was staged or published.
- Initial sandbox access failures were environmental, not successful checks; gates were rerun with allowed access and the results above reflect completed runs.

## Changed Files

Production sources changed:

- `src-tauri/src/data.rs`, `src-tauri/src/lib.rs`
- `src/app/AppShell.tsx`, `src/app/noteAutosaveCoordinator.ts`
- `src/features/archive/ArchivePage.tsx`
- `src/features/editor/BlockInsertMenu.tsx`, `EditorArea.tsx`, `EditorContextMenu.tsx`, `FormattingToolbar.tsx`, `InlineNoteTitle.tsx`, `NoteMenuPopover.tsx`, `TableToolsPopover.tsx`, `editorFormattingCommands.ts`, `editorInteractions.ts`, `editorToolbarLayout.ts`
- `src/features/export/generateDocx.ts`, `generatePdf.ts`
- `src/features/imageEditor/ImageNodeView.tsx`, `imageGeometry.ts`
- `src/features/notes/FirstRunModal.tsx`, `NewNoteModal.tsx`, `NoteListPanel.tsx`
- `src/features/projects/ProjectsPage.tsx`
- `src/features/rag/ProjectScopeSelector.tsx`
- `src/features/settings/MarkdownImportControl.tsx`, `ModelSettingsUi.tsx`, `SettingsPage.tsx`, `markdownImport.ts`
- `src/services/dataService.ts`, `noteExportService.ts`
- `src/shared/Icon.tsx`, `localProfile.ts`
- `src/styles/app.css`, `editor.css`, `foundation.css`, `pages.css`, `settings.css`

New production files:

- `src/features/editor/NoteSearchBar.tsx`, `noteSearch.ts`, `tableSelectionHeaders.ts`
- `src/features/projects/ProjectDeleteDialog.tsx`
- `src/shared/InfoHint.tsx`, `entityName.ts`

Tests changed: autosaveFailureSafety, editorUiPolish, modelSettingsUi, p13FinalUxPolish, phaseAOrganization, phaseBPolish, phaseCEditor, phaseDImageEditor, phaseEBehavior, phaseEExport, ragWorkspace, semanticRetrieval, userSmokeCorrections and visualRefresh.

Tests added: `tests/rc5Settings.test.ts`, `tests/rc5Management.test.ts`, `tests/rc5Editor.test.ts`, `tests/rc5Styles.test.ts`.

Task document: `docs/tasks/rc5-usability-editor-polish-report.md`.

Seven preserved pre-existing untracked files: phase-b-rag-responsive-report.md, phase-b-smoke-corrective-report.md, phase-b-standalone-scope-report.md, phase-c-editor-correctness-report.md, phase-c-settings-layout-corrective-report.md, phase-d-image-insert-calendar-report.md and scripts/qa/phase-b-provider.mjs.

## USER ACTIONS STILL REQUIRED

1. Full visual smoke at 100/160%, genuinely narrow and wide/ultrawide windows: Settings descriptions, hints, block/date menus, table/image toolbar, action/loading/disabled states and title wrapping.
2. Markdown import through native dialog with edited per-file Cyrillic names; new/manual rename limit and compatibility with old long titles.
3. Active and archived project deletion: count, wrong/exact name, cancel/Escape and final cascade on an isolated QA project only.
4. Archive FTS groups, open/restore without accidentally unarchiving, repeated tag search/clear during data refresh.
5. In-note highlight/navigation at 160%, long text, edits/undo, clearing and document reopen.
6. Image resizing at 100/160%, crop/drawing, copy/save and restart.
7. Selected/multiple/merged table header row/column, colors/thick borders, scrollbar threshold and restart.
8. Explorer/Desktop drag/drop, multiple files, PNG/JPEG/WEBP/PDF/DOCX/XLSX/TXT/ZIP and other actually allowed generic files; Cyrillic/Unicode/spaces/uppercase extension, MIME mismatch and size failures. Repeat CF_HDROP/bitmap/file paste.
9. Current project file count after remove/move/shared-asset/delete/backup restore and restart. Verify another note/revision can still resolve a retained asset.
10. Native ZIP Save filter/export/spinner and actual extracted files; DOCX/PDF justify visual output.
11. Deeper Tab/Shift-Tab, list/code behavior, unlink/undo, justify with selections/marks, P0 bold/partial-underline save/reopen/restart.
12. Live Bridge/Ollama, background AI/drafts, RAG citations/scopes/indexing and safe backup/restore on an isolated test profile.
13. Restart persistence of note contents, sidecar formatting and applied zoom. Packaged installer smoke is separate and remains NOT TESTED.

## Final Verdict

READY FOR USER RC5 FULL SMOKE.

All 39 requested changes are implemented, automated gates are green, and the native checks actually performed are recorded above. This verdict authorizes user smoke, not a claim that every native scenario already passed. User acceptance, packaged lifecycle checks and the pending native matrix remain required before RC5 publication. No commit, tag, push, merge or release was created; version remains 1.0.0-rc.4.

## User Smoke Corrective Pass №2

The first-pass results above remain historical. The subsequent 20-item corrective pass is documented in [rc5-user-smoke-corrective-2.md](rc5-user-smoke-corrective-2.md), including each root cause, changed files, automated evidence and separate native status.

Key corrections: current-note Markdown insertion without creating/renaming notes; all tag chips and relationship-ID search scope; uniform search decorations and bottom-right navigation; single managed table header row/column with structural-edit mapping and sidecar persistence; compact action SVGs; shared empty states; calmer tag search/table borders; one equal block grid without table-toolbar overlap; real-field help and adaptive Data/Export buttons.

Fresh final frontend run: 625/625; final Rust corrective repeat: 274 PASS, 10 ignored (23.20 s). Production npm audit: 0 vulnerabilities. Final isolated FTS repeat: 1.0271 ms query over 10,000 notes, indexing 13.5836 s. Native QA confirmed import/autosave/restart and persisted table axes on the isolated profile. Full native Drag & Drop and live AI remain PENDING USER SMOKE; optional custom Ctrl+F is a KNOWN LIMITATION.

Typecheck, frontend build, fmt, check, clippy, Tauri build and diff check passed. NSIS, en-US MSI and ru-RU MSI were freshly built with unchanged 1.0.0-rc.4 version. Final Git state: 59 tracked modified, 20 untracked, 0 staged. Packaging paths/sizes and all 20 statuses are recorded in the corrective report.

Corrective verdict: READY FOR USER RC5 CORRECTIVE SMOKE. No commit/tag/push/merge/release/version change was performed.

## User Smoke Corrective Pass №3

The nine subsequent corrections are recorded independently in [rc5-user-smoke-corrective-3.md](rc5-user-smoke-corrective-3.md), with root causes, actual geometry, behavioral regression evidence and per-item native status. This includes actual empty-state punctuation, scoped RAG action centering, three shorter descriptions, zoom-aware match scrolling, modal tooltip/focus fixes, top note-menu icons, collision-aware table-menu portal, a compact 2x4 block grid and the plain clear-format X.

Final frontend regression: 630/630 PASS. Rust: 274 PASS, 10 existing ignored tests. Browser: 86/86 geometry scenarios on synthetic fixtures, 100/160%, light/dark, wide/narrow; these are not native claims. Production npm audit: 0 vulnerabilities. Actual native QA confirmed the fresh-profile empty state at 100% light. The user explicitly elected to perform the remaining native smoke; it remains PENDING USER SMOKE. Typecheck, build, fmt, check, clippy, Tauri packaging and final diff check all passed. Fresh NSIS, en-US MSI and ru-RU MSI paths/sizes are recorded in the separate report. Final Git state: 62 tracked modified, 26 untracked, 0 staged. Version remains 1.0.0-rc.4; no commit/tag/push/merge/release was created. Verdict: READY FOR USER RC5 CORRECTIVE SMOKE.

## Final UI Polish

This pass is limited to five description endings and collapsible side panels. The existing RC5 changes and intentional QA files remain intact. No Markdown, persistence, search, attachment, provider or generation-lifecycle implementation was changed in this pass.

### Text Changes

Only the terminal period was removed from the actual production descriptions:

| Area | Current description | Source |
| --- | --- | --- |
| Projects | Организуйте заметки и материалы по направлениям работы | `src/features/projects/ProjectsPage.tsx` |
| Tags | Управляйте тегами и открывайте связанные заметки | `src/features/tags/TagsPage.tsx` |
| Archive | Архивные заметки можно восстановить в любой момент | `src/features/archive/ArchivePage.tsx` |
| Generative models | Генерируют и редактируют текст, отвечают на вопросы и используются в ИИ-помощнике | `src/features/settings/SettingsPage.tsx` |
| Embeddings | Находит связанные по смыслу фрагменты заметок и используется для поиска по базе знаний | `src/features/settings/SemanticSearchSettings.tsx` |

The existing empty-state description `Создайте новую заметку` still has no final period. No global punctuation replacement was performed. All five descriptions were checked against the real mounted feature pages in browser QA, not only source-text assertions.

### Sidebar Animations

The previous immediate conditional unmount/display-none paths removed content before the grid transition could finish. RAG also changed the number of grid tracks on close, preventing a continuous interpolation.

- Added `src/shared/SidebarPanel.tsx`: closing content is retained for 240 ms, immediately receives `inert`/`aria-hidden`, and is removed after the transition. Rapid reopening cancels pending removal; initially closed panels do not mount their children.
- Integrated the wrapper in `src/app/AppShell.tsx` for the main sidebar, note list and current-note AI chat; integrated it in `src/features/rag/RagChatWorkspace.tsx` for history and sources, including responsive drawers.
- Updated `src/styles/foundation.css` and `src/styles/rag.css`: fixed grid slots interpolate between user-selected width and zero; content fades, and overlay drawers use a small horizontal translation. Existing duration/easing tokens are reused: **240 ms**, **`cubic-bezier(0.22, 1, 0.36, 1)`**. No `transition: all` or JavaScript animation loop was added.
- Main-sidebar label slots and navigation heights remain stable while text fades. `src/features/navigation/MainSidebar.tsx` exposes the collapse state through `aria-expanded`.
- Initial mount does not use panel entry animation. Existing reduced-motion CSS disables motion; retained content also closes immediately when the OS preference changes during a close.
- Resize handles retain their existing direct-parent geometry. Dragging disables interpolation, and the stored physical width is reused on reopening. Browser tests exercised six rapid toggles after a real drag from 250 to 280 px.
- Closing a focused panel restores focus to its corresponding outside control without scrolling. Closed retained subtrees cannot receive pointer or keyboard interaction.
- The editor stays mounted in the same grid slot. Scroll anchoring is temporarily disabled during grid reflow and restored after two final layout frames, rather than a per-frame React animation. This fixed measured anchor drift at 160%; the final matrix retained scroll position **320 -> 320**, the same TipTap instance, document JSON and ProseMirror selection, with no extra autosave.

AI state remains owned by the existing application services. Panel retention does not own, stop or restart generation. The mounted note-chat regression verifies an unsent draft, one delayed request, completion while the panel is unmounted, reopening with the answer, one persisted assistant message and no cancellation/duplicate send.

### Automated Evidence

- Added four behavioral tests in `tests/sidebarPanel.test.ts`: initial closed mount, retained/inert closing and focus restoration, rapid reopen with the same draft, and reduced motion including an OS preference change.
- Added the real note-chat background-request/draft test and updated the RAG drawer test in `tests/ragWorkspace.test.ts` to account for the intentional closing interval. Updated two grid-contract expectations in `tests/p13FinalUxPolish.test.ts` and two exact description expectations in `tests/rc5Management.test.ts`.
- Added reusable synthetic QA fixture/runner files `scripts/qa/rc5-final-ui.{html,tsx,css,mjs}`. These mount the real AppShell with in-memory mocked IPC, a long Markdown note, table and image. They do not access the user database, credentials or real AI providers. The fixture's CSS-zoom viewport shim is QA-only; native WebView zoom is not represented as an actual native result.
- **110/110 final browser cases PASS** in Edge: 1440x900 and 1100x700, 100%/160%, light/dark. Intermediate animation widths were sampled, navigation icon Y positions checked each frame, and horizontal overflow checked. Coverage includes five actual descriptions, sidebar/chat/list motion, stable editor/selection/scroll, resized-width rapid toggling, docked RAG history/sources, responsive drawer exclusivity/inert state, focus restoration and reduced motion.
- Existing corrective-pass-3 browser geometry repeated: **86/86 PASS**. Total for the two independent browser runners: **196 cases**. Screenshots and result JSON are under ignored `releases/qa/rc5-final-ui/` and the existing corrective QA output directory.
- Final isolated `npm run test`: **635/635 PASS**, 75 suites, **30.197 s**. An earlier full run with concurrent browser/native/build work measured the existing adversarial Markdown application test at 1307.86 ms and failed its time limit. The clean rerun passed that test at **956.66 ms**. Neither the test nor its threshold was changed. Early failures while integrating the new retention semantics were corrected in targeted tests; they are not counted as green runs.
- Rust checks on the unchanged backend: `cargo fmt --check`, `cargo check`, `cargo test`, and `cargo clippy --all-targets --all-features -- -D warnings` PASS. Rust test result: **274 PASS, 10 existing ignored, 0 failed**; test execution **30.80 s**.
- Final `npm run typecheck` PASS. Final `npm run build` PASS; Vite completed in **25.87 s**, without a chunk-size warning. The sandbox-only attempt failed with `EPERM` during Vite realpath resolution; the authorized rerun passed without code/config changes.
- `npm audit --omit=dev --offline=false`: **0 vulnerabilities**. No dependencies were added or changed.
- `git diff --check` PASS. Git reports existing LF-to-CRLF conversion warnings, not whitespace errors.
- Final `npm run tauri build`: **PASS**, including the final UI changes; Rust release compilation **2 min 50 s**, exit code 0. Verified fresh build outputs on 11 October 2026:

| Artifact | Full path | Bytes |
| --- | --- | ---: |
| NSIS | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.4_x64-setup.exe` | 6,040,864 |
| English MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_en-US.msi` | 8,146,944 |
| Russian MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` | 8,146,944 |

These are local unchanged-version validation builds, not a published or staged RC5 release. Existing installer metadata remains unchanged.

### Native QA / Limitations

Actual `npm run tauri dev` was launched with an isolated empty profile at ignored `releases/qa/rc5-final-ui-profile`, not the user's profile. In the real 1536x816 Windows Tauri window at 100% light, onboarding was skipped, the empty-state description was observed without a final period, and the main sidebar was collapsed and expanded with its endpoint icon positions unchanged. The app was closed through the system X; the dev process exited successfully and no NoteFlow process remained. WebView2 emitted a non-blocking shutdown diagnostic (`Chrome_WidgetWin_0`, error 1412); this was not hidden or treated as a failed app exit.

This native check does **not** establish native animation smoothness, 160% behavior, long-note/chat reflow or live Bridge/Ollama generation. Those are **PENDING USER SMOKE**, as allowed by the task. Browser frame/geometry tests and mocked background-generation tests are separate evidence, not substitutes for native/live-provider acceptance. No real credentials or user notes were changed.

### Git / Release Control

Branch: `feature/rc5-usability-editor-polish`. HEAD: `234e9737e694a84d10bccdee6fef1da29516ff07`.

Start: **62 tracked modified / 26 untracked / 0 staged**. Final source/test/report state: **64 tracked modified / 32 untracked / 0 staged**, including the preserved earlier work. The six new untracked files for this pass are SidebarPanel, its behavioral tests and the four final-UI QA files; the report was already untracked before this pass. Version remains **1.0.0-rc.4** in package.json, both package-lock version sources, Cargo.toml, the NoteFlow Cargo.lock entry and tauri.conf.json. Product remains **NoteFlow**, identifier **com.noteflow.desktop**. No release metadata, Git index, commit, tag, push, merge or GitHub release was created or changed by this pass.

### User Actions Still Required

1. Confirm all five descriptions and the empty-state text have no final period.
2. At 100%/160%, light/dark and narrow/wide windows, collapse/expand the main sidebar, list/focus mode, note chat and RAG history/sources. Check smoothness, unchanged icon spacing and absence of clipping/overflow.
3. Resize a panel, rapidly toggle it several times, and confirm its saved width returns.
4. With a long note containing tables/images and selected text, open/close the chat and confirm stable editor contents, selection and scroll.
5. Start one live AI response, close/reopen the chat, and confirm uninterrupted generation, retained draft and no duplicate request. Also check keyboard focus and OS reduced-motion behavior.

Final UI Polish verdict: **READY FOR USER RC5 FINAL SMOKE**. RC5 publication remains blocked on user confirmation; no release action is authorized by this report.

## Final Sidebar Stability Corrective Pass

11 October 2026. This section supersedes the previous pass's sidebar alignment claim and records fresh checks, not reused totals. Scope is ten descriptions, the two model-dialog descriptions, and sidebar layout/resize stability. The earlier RC5 implementation and intentional QA files are preserved. No backend, serializer, autosave, provider, generation or release implementation was changed in this pass.

### A. Text Cleanup

| Area | Before | After |
| --- | --- | --- |
| Generative-model empty state | Подключите модель для работы ИИ-помощника и чата. | Подключите модель для работы ИИ-помощника и чата |
| Semantic-model empty state | Подключите локальную или облачную модель, чтобы искать заметки по смыслу. | Подключите локальную или облачную модель, чтобы искать заметки по смыслу |
| Chat-model dialog | Локальный endpoint: данные остаются на устройстве, если сервер действительно запущен локально. | Данные остаются на устройстве, только если сервер работает локально |
| Embedding-model dialog | Настройте отдельную модель для поиска заметок по смыслу. Подключение не меняет модель ИИ-помощника. | Модель смыслового поиска настраивается отдельно от ИИ-помощника |
| Appearance | Тема приложения настраивается только в этом разделе. | Тема приложения настраивается только в этом разделе |
| Data & Export | Резервные копии профиля, импорт и восстановление данных. | Резервные копии профиля, импорт и восстановление данных |
| Knowledge-fragment explanation | NoteFlow делит длинные заметки на небольшие части, чтобы точнее находить нужную информацию при ИИ-поиске. | NoteFlow делит длинные заметки на небольшие части, чтобы точнее находить нужную информацию при ИИ-поиске |
| Shortcuts | Сочетания, которые уже работают в приложении. На macOS используйте ⌘ вместо Ctrl. | Сочетания, которые уже работают в приложении. На macOS используйте ⌘ вместо Ctrl |
| About | Локальные заметки, Markdown-first редактор и ИИ-инструменты с контролем приватности. | Локальные заметки, Markdown-first редактор и ИИ-инструменты с контролем приватности |
| General | Профиль и основные сведения о локальной работе NoteFlow. | Профиль и основные сведения о локальной работе NoteFlow |

All ten exact strings were verified on mounted production feature components in browser QA. The internal full stop in the shortcuts description remains. No global punctuation replace was performed. The earlier Projects, Tags, Archive, generative-model and embedding-model section descriptions, plus `Создайте новую заметку`, remain without a final period and passed the repeated 110-case runner.

Changed copy sources: `src/features/settings/SettingsPage.tsx` and `src/features/settings/SemanticSearchSettings.tsx`. The local privacy explanation is shortened only when rendering the model dialog, including the notice returned for an existing provider. Backend privacy classification and external-provider warnings are untouched. The wording still conditions locality on where the server actually runs, not merely its URL.

In `src/styles/settings.css`, only the two model dialogs override the generic heading paragraph's `max-width: 68ch`; their heading flex item can use the available header width. Neither modal was widened and neither font was reduced. There is no nowrap-plus-clipping workaround. In settled browser layout at 100%, both descriptions occupy one line in every light/dark and narrow/normal/wide case, with the original 12.5 px computed font size. At 160%, natural wrapping is allowed; the tested cases also had no paragraph overflow. Screenshots now wait for modal entry animations to finish.

### B. Root Cause

The previous pass combined incompatible layouts: the icon remained in the button's flex flow while the label was absolutely positioned. On collapse, legacy CSS immediately changed buttons to fixed-width, centred controls; the outer grid was still animating from the full width. Label geometry therefore did not share the icon's track.

The pre-fix first collapse frame reproduced the defect: sidebar width was still **250 px**, but icon X jumped from **22 px to 115.5 px**; label X was **143.5 px** with **zero available width** while opacity was still 1. At the compact endpoint the icon returned to 27.5 px. This was a discontinuity inside the animation, not just a poor endpoint screenshot. Steady expanded geometry at 190/250/300/360 px did not alone reproduce that jump; the report does not claim otherwise.

The old tests primarily sampled icon Y positions and endpoints, so they could miss an X-axis jump and a zero-width label. The new frame sampler captures the click and the first requestAnimationFrame in one page evaluation.

Two further layout defects were exposed during this pass's stronger checks: the expanded brand and collapse button could briefly make the compact sidebar's scrollWidth exceed clientWidth, and fixed collapsed padding did not account for 160% zoom. Both were corrected in the actual sidebar layout, not hidden with an overlay or a changed test threshold.

### C. Sidebar Fix

- `src/features/navigation/MainSidebar.tsx`: New Note and the six navigation buttons share `sidebar-action` and `sidebar-action-label`. Brand copy has a bounded wrapper; the profile uses a bounded info track. Existing actions, labels, tooltips and routing remain unchanged.
- `src/styles/pages.css`: one **40 px icon track + minmax(0, 1fr) label track** is used for expanded, collapsed and intermediate sizes. Icons are block SVGs centred in the shared track; labels stay in normal grid flow. They fade with opacity instead of being immediately removed from layout. Truncation at genuinely insufficient width remains intentional.
- Brand layout uses a flexible bounded copy track and a 40 px collapse-control track. Collapsed inline padding is calculated from the 74 px physical rail and app zoom, so a scaled control does not overflow the rail. The profile info track is similarly constrained.
- `src/styles/foundation.css`: removed the previous absolute-label workaround. Existing **240 ms / cubic-bezier(0.22, 1, 0.36, 1)** motion is retained. During an actual `.resize-handle.dragging` state, sidebar padding and shell-width transitions are disabled.
- `src/shared/ResizeHandle.tsx`: loss of pointer capture also ends the local drag state, preventing an abandoned drag from leaving transitions disabled or applying subsequent uncaptured deltas.
- Existing width clamping and debounced settings persistence remain unchanged. Collapse does not write 74 px as the user's expanded preference; reopening uses the last expanded width. Six rapid toggles do not remount action controls or discard that width.
- No animation dependency, text scaleX, per-button compensation margin, perpetual layout loop or new provider request was introduced. Existing SidebarPanel retention, inert/focus handling and background-generation ownership are preserved.

### D. Geometry Evidence

`scripts/qa/rc5-sidebar-stability.mjs`: **260/260 PASS** in real headless Edge using the real AppShell with synthetic/mock IPC data. Matrix: **1100x700, 1440x900, 1920x900; 100%/160%; light/dark**. These are browser results, not native WebView2 claims.

Each matrix combination checks default 250 px, minimum 190 px, intermediate 320 px, maximum 360 px and collapsed 74 px sidebar geometry. Checks include all seven icon/label X positions, stable row/icon Y positions, unchanged per-control height, icon-to-label separation, non-overlapping row bounds, labels contained in controls, and sidebar scrollWidth/clientWidth. The New Note button retains its existing 40 px height and navigation rows their existing 38 px height throughout motion; no new height jump is introduced.

At 100% expanded widths, every action icon starts at **X=23 px**, every label at **X=52 px**, leaving **11 px** between the 18 px icon's right edge and text. The compact endpoint is **icon X=27.5 / label X=56.5**. During collapse and expand the icon stays between these endpoints rather than jumping to the centre of the wide panel. At 160%, all action icons/labels remain aligned on their scaled tracks, with zoom-aware compact padding.

Example fresh 1440/100/light collapse samples:

| Sidebar width | Icon X | Label X |
| ---: | ---: | ---: |
| 320 | 23 | 52 |
| 287.88 | 23.58 | 52.58 |
| 231.63 | 24.61 | 53.61 |
| 139.45 | 26.30 | 55.30 |
| 103.67 | 26.95 | 55.95 |
| 82.03 | 27.34 | 56.34 |
| 74 | 27.50 | 56.50 |

The fresh example has 13 collapse and 12 expand samples. Width changes are monotonic; no frame violates the shared-track, row-height or sidebar-overflow checks. These counts are headless frame samples, not a measured native FPS guarantee.

Pointer tests use actual mouse down/move/up and DOM bounding boxes, not screenshots or assigned widths. Four held samples per drag confirm a **0s transition duration**, rendered width consistent with the live CSS width variable, and no change on release. Sidebar min/max clamping, note-list and note-chat dragging passed every matrix combination; docked RAG history/sources dragging passed when those handles are available, and the existing responsive-drawer tests cover the narrow presentation. The persisted-setting assertion waits for the existing debounce rather than mistaking an intermediate preference for live geometry. Reload-width replay uses mock session persistence of nonsecret UI settings and is explicitly not native SQLite restart evidence.

The final-UI runner was repeated: **110/110 PASS**. The corrective-pass-3 geometry runner was repeated: **86/86 PASS**. Total fresh browser cases: **456**. They retain the same editor instance, Markdown document, selection and scroll **320 -> 320** during panel reflow, with the test table/image present and no extra autosave. Browser page-error collection is empty.

Ignored synthetic screenshots/results: `releases/qa/rc5-sidebar-stability/`, including settled chat/embedding dialogs. No user notes, credentials or real provider traffic enter these fixtures.

### E. Actual Native QA and Limits

Real `npm run tauri dev` used the isolated empty profile `D:\Projects\NoteFlow\releases\qa\rc5-sidebar-stability-profile`. The existing user profile, real keys and model configurations were not modified. The native window was **1536x816**, not the browser matrix's virtual viewports.

| Native combination | Actually observed/performed |
| --- | --- |
| 100%, light | Fresh-profile onboarding dismissed; expanded sidebar at 250 px; real pointer resize to minimum 190 px; collapse and expand back to the saved minimum; navigation to Settings; actual model empty descriptions; chat-model dialog opened and cancelled, with its shortened privacy line visible on one line |
| 100%, dark | Appearance theme changed on the isolated QA profile; expanded minimum-width sidebar and setting description visually inspected |
| 160%, dark | Zoom changed through Appearance and Apply; minimum-width sidebar with normal ellipsis, intermediate pointer resize, maximum-width resize; collapse to compact rail and expand back to saved maximum; all action icons/labels visibly aligned |
| 160%, light | Theme changed on the QA profile; maximum-width expanded sidebar visually inspected; application closed through system X |

The NoteFlow process was absent after closing; no forced termination of the user's app was used. No chat-model form was saved and no live AI request was sent.

**Native matrix is PARTIAL, not PASS.** Narrow/standard/wide native window resizing, native list/chat/RAG resize, high-frequency rapid toggles, restart persistence, long-document selection/scroll and live background AI remain **PENDING USER SMOKE**. Browser checks and mocked background-generation tests are separate evidence. Native screenshots were inspected through Computer Use; this report does not claim saved native before/during/after image artifacts or measured native animation FPS.

**Additional native observation:** at 160% with the main sidebar at its maximum, the Appearance page shows an internal horizontal scrollbar. Sidebar icons/labels themselves are aligned and contained, but this means the entire native Settings page cannot be described as overflow-free. This content-layout issue was not investigated or changed in this sidebar/text-only pass; whether it predates these changes has not been established by a native before/after comparison. It must be included in the user's remaining check and triaged separately if reproduced. No overflow-hiding CSS workaround was added.

### F. Fresh Quality Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **637/637 PASS**, 75 suites, 26.388 s |
| `npm run build` | PASS, Vite 14.46 s; no chunk-size warning |
| `cargo fmt --check` | PASS; read-only authorized rerun after sandbox path-access error |
| `cargo check` | PASS, 9.87 s |
| `cargo test` | **274 PASS / 10 existing ignored / 0 failed**, 21.83 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS, 1.93 s |
| `npm audit --omit=dev --offline=false` | PASS, **0 production vulnerabilities** |
| Browser geometry/regression | **260 + 110 + 86 = 456 PASS** |
| `npm run tauri dev` | Real isolated-profile launch/close performed; native scope is partial as described above |
| `npm run tauri build` | PASS, exit 0; bundled frontend build 15.53 s, release compilation 2 min 38 s; NSIS and both MSI verified |
| `git diff --check` | PASS; existing Git LF/CRLF conversion warnings are not whitespace errors |

Added two behavioral tests in `tests/sidebarPanel.test.ts`: shared seven-control DOM retained on collapse, and lost-pointer-capture termination. Updated `tests/settingsSidebarLayout.test.ts` to check the current opacity-based layout, including New Note, instead of requiring immediate display:none. Settings navigation must remain visible through five collapse cycles. The first full suite correctly flagged this obsolete assertion (636/637); after updating its expected behavior the full isolated rerun passed. It was not bypassed or weakened to a source-text-only check.

The P0 string **`Стоимость следующая -`** passed the existing real TipTap serialization/reload tests, including intraword italic and mixed adjacent marks over ten cycles. The source serializer was not changed. Existing note-chat tests confirm draft preservation, one request completing while the panel is closed, no cancellation/duplicate send and one persisted response. The adversarial Markdown application test completed at **685.463 ms** in the clean final run. Browser/native/dev processes were stopped before that run; no performance threshold was raised.

Fresh local installer outputs verified after the final build on 11 October 2026:

| Artifact | Full path | Bytes | Last write, local |
| --- | --- | ---: | --- |
| NSIS | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.4_x64-setup.exe` | 6,042,761 | 18:24:16 |
| English MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_en-US.msi` | 8,146,944 | 18:23:40 |
| Russian MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` | 8,146,944 | 18:23:50 |

These are local validation builds, not staged/published RC5 assets. Installer installation/upgrade was not repeated in this visual pass. Existing MSI mapping remains 0.99.4; no release metadata was changed.

### G. Git and Release Control

Branch **`feature/rc5-usability-editor-polish`**, HEAD **`234e9737e694a84d10bccdee6fef1da29516ff07`** unchanged.

Start: **64 tracked modified / 32 untracked / 0 staged**. Current corrective-pass state: **66 tracked modified / 33 untracked / 0 staged**. The additional tracked paths are ResizeHandle and the existing Settings sidebar behavioral test; the new untracked path is the sidebar stability QA runner. Existing dirty source/test/report files were preserved. QA outputs/profiles remain ignored; intentional QA source files were not removed.

Version remains **1.0.0-rc.4** in package.json, both package-lock version sources, Cargo.toml, the NoteFlow Cargo.lock package and tauri.conf.json. ProductName remains **NoteFlow** and identifier remains **com.noteflow.desktop**. No dependency, Git index, commit, tag, push, merge, release or version update was performed. The published RC4 release was not changed.

Files touched in this pass: `src/features/navigation/MainSidebar.tsx`, `src/shared/ResizeHandle.tsx`, `src/styles/pages.css`, `src/styles/foundation.css`, `src/styles/settings.css`, `src/features/settings/SettingsPage.tsx`, `src/features/settings/SemanticSearchSettings.tsx`, `tests/sidebarPanel.test.ts`, `tests/settingsSidebarLayout.test.ts`, `scripts/qa/rc5-final-ui.tsx`, `scripts/qa/rc5-final-ui.mjs`, `scripts/qa/rc5-sidebar-stability.mjs`, and this report. Other dirty files listed by git status are preserved earlier RC5 work, not new changes from this pass.

### H. Remaining User Smoke

1. Confirm all ten descriptions and the two one-line model-dialog explanations at 100%; allow natural wrapping at 160%/narrow widths.
2. Repeat native 100%/160%, light/dark, narrow/standard/wide main-sidebar resize, collapse/expand and rapid toggles. Verify New Note's plus and label share the navigation tracks, no row shifts, no rail overflow, and saved width returns after reopening/restart.
3. Repeat list/focus mode, note chat, RAG history and source-panel dragging/open/close, including keyboard focus and reduced motion.
4. Use a long temporary QA note with selection, table/image and the P0 phrase; verify unchanged contents, scroll, autosave and reopen. Do not use a real user note for destructive tests.
5. Start a live AI answer, close/reopen its panel, and confirm continued generation, retained draft/history and no duplicate request.
6. Recheck the observed Appearance content scrollbar at 160% plus maximum main-sidebar width and record whether it affects the supported native window sizes. This observation is not covered by the sidebar-only no-overflow assertion.

Final verdict: **READY FOR USER RC5 FINAL SMOKE**. All fresh automated/packaging gates are green. Native acceptance remains partial, including the explicitly recorded Settings content overflow observation; this verdict is not complete native acceptance or authorization to publish RC5.

## Final Sidebar Overflow Fix

This separate follow-up addresses the Appearance overflow recorded above. The earlier section is historical evidence, not the final result of this follow-up. Version remains **1.0.0-rc.4**; branch remains **feature/rc5-usability-editor-polish**.

### Root Cause and Scoped Fix

The bug was reproduced before editing in the actual Windows Tauri/WebView2 window, using the isolated existing QA profile `releases/qa/rc5-sidebar-stability-profile`, native application zoom 160%, and saved main-sidebar width 360 physical px. Appearance showed a horizontal scrollbar at the bottom and its third theme option extended beyond the content column.

Browser DOM measurement at 1536 px / 160% / 360 px sidebar identified the exact offender: `.theme-options`. Its three fixed minimum tracks, `repeat(3, minmax(150px, 1fr))`, plus two 12 px gaps required **474 CSS px**, but the content column had only **441 CSS px**. Settings uses physical-width breakpoints and retained its two-column `wide` layout; physical space is not equivalent to available CSS space after zoom and the Settings navigation column. At 1440 px, the theme grid also expanded the scrollable `.simple-page` (clientWidth 675, scrollWidth 728). Checking only documentElement.scrollWidth missed the internal page scrollbar.

Only production file changed by this follow-up: **`src/styles/settings.css`**.

- Theme tracks now use `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`; three choices stay on one row when they fit and reflow when they do not. The existing narrow-mode one-column rule remains intact.
- Theme buttons have `min-width: 0`, so their intrinsic minimum cannot expand the responsive track.
- The zoom card permits wrapping. Its label has a 180 px flex basis so the label and control group move onto separate lines before the label gets squeezed below its useful width. Existing narrow-mode vertical layout remains intact.
- No global or local overflow-hiding workaround was added. All theme choices and zoom controls remain present. Vertical scrolling for taller content is intentional.
- Sidebar components, physical sizing/breakpoints, width persistence, resize handlers, shared icon/label tracks, 240 ms transition, easing and reduced-motion rules were **not changed** in this follow-up. No business logic, backend, credentials, dependencies or release metadata changed.

### New Browser Regression

New QA source: **`scripts/qa/rc5-settings-overflow.mjs`**. It uses the existing real-AppShell synthetic IPC fixture and records results/screenshots only under ignored `releases/qa/rc5-settings-overflow/`.

The matrix covers all six Settings sections at 1100, 1280, 1440, 1536 and 1920 px, 100%/160%, light/dark, minimum sidebar 190 px, maximum 360 px and collapsed 74 px. Checks include:

- Internal page, Settings grid, content and visible descendant scrollWidth/clientWidth, in addition to document-level overflow.
- Bounding rectangles for controls and theme previews; no horizontally clipped content controls.
- All seven Sidebar action icon/label tracks, including New Note.
- Real pointer drag samples, zero transition while dragging, width clamping and no width jump on release.
- Collapse/expand intermediate frames, monotonic width, stable icon vertical position and bounded icon horizontal movement.
- Six rapid toggles, saved-width replay after mock reload and reduced motion.
- Both actual chat/embedding configuration dialogs; all three theme options retained and the third option moved below the first when necessary.
- A negative control in each theme temporarily reinstates the old theme grid in the browser only. The detector must catch its 441/474 px overflow and clipped third theme choice; removal of that test-only stylesheet must restore valid geometry.

The final new runner passed **562/562 cases**, including **1,517 intermediate animation frames**, with no browser page errors. The earlier 560-case development run passed too; it is not added to the final count. Hidden contents of closed details are excluded from visible-control assertions, not used as evidence of clipping. Compact Settings navigation retains its deliberate local horizontal scrolling; it does not expand the page.

### Actual Windows QA

This was **real Tauri/WebView2**, not browser emulation. Two isolated-profile `npm run tauri dev` launches completed. Actual captured window sizes were 1536x816 (maximized) and 1442x864 (restored). The initial defect was observed before the CSS change; after the change its horizontal scrollbar was absent in both window presentations.

| Native scope | Actually checked |
| --- | --- |
| Appearance | 100% and 160%, light and dark; all theme choices accessible, zoom controls reachable through normal vertical scroll; 160% plus maximum Sidebar rechecked after a cold restart |
| Six Settings sections | All six opened at 100% light and at 160% dark, with maximum Sidebar; no horizontal page scrollbar observed |
| Sidebar | Real pointer resize 360 -> 190 -> 360 at 160%; collapse and expansion restored saved width; keyboard Ctrl+B collapse/expand checked; New Note and navigation icons remained aligned |
| Persistence | Closed QA app through system X, relaunched the same isolated profile, observed saved 160% zoom, light theme and expanded 360 px Sidebar, then reopened Appearance successfully |

No real user notes, credentials or models were touched; no provider requests were sent. The two dev sessions exited with code 0 after normal window close. WebView2 printed `Failed to unregister class Chrome_WidgetWin_0. Error = 1412` during shutdown; no Rust check/clippy warning or failed app launch accompanied it. It is recorded rather than suppressed.

Native high-frequency frame timing, reduced-motion OS behavior, minimum-size 1100 px and 1920 px native windows were **not** certified by this run. These remain **PENDING USER SMOKE**; the complete size/theme/settings matrix and rapid-toggle animation-frame evidence above are explicitly browser evidence. No claim of measured native FPS or full installer lifecycle acceptance is made.

### Fresh Final Gates

| Gate | This follow-up |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **637/637 PASS**, 75 suites, 24.788 s |
| `npm run build` | PASS, Vite 15.05 s; no chunk-size warning |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS, 0.79 s |
| `cargo test` | **274 PASS / 10 existing ignored / 0 failed**, 21.95 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS, 0.80 s |
| `npm audit --omit=dev --offline=false` | PASS, **0 production vulnerabilities** |
| Browser geometry | **562 + 260 + 110 + 86 = 1,018 PASS** |
| `npm run tauri dev` | Real isolated-profile before/after QA and cold restart; scope/limits listed above |
| `npm run tauri build` | PASS, exit 0; Vite 15.18 s, release compilation 2 min 06 s; NSIS and both MSI verified |
| `git diff --check` | PASS; existing LF/CRLF conversion warnings, no whitespace errors |

The first sandboxed frontend suite had 636/637 successes because the existing Windows release fixture's PowerShell child process was denied by AuthorizationManager. The authorized full rerun passed unchanged. Similarly, read-only fmt was initially denied during path canonicalization, and Vite build was initially denied by realpath EPERM; authorized reruns passed without source changes or relaxed gates. No tests were skipped or performance thresholds adjusted. Browser, Vite dev and native QA processes were closed before the clean frontend/Rust suite runs. The adversarial Markdown application test completed in **664.827 ms**.

QA logs/results remain Git-ignored under `releases/qa/`; the Windows staging test uses synthetic temporary artifacts, not a published release.

Fresh local bundles verified on 11 October 2026 (local timezone +03:00):

| Artifact | Full path | Bytes | Last write |
| --- | --- | ---: | --- |
| NSIS | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.4_x64-setup.exe` | 6,040,169 | 19:21:15 |
| English MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_en-US.msi` | 8,146,944 | 19:20:40 |
| Russian MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` | 8,146,944 | 19:20:50 |

No installers were copied into a release staging directory or published. Installation/upgrade testing is outside this scoped layout fix.

### Git and Scope

Start: **66 tracked modified / 33 untracked / 0 staged**. Follow-up: **66 tracked modified / 34 untracked / 0 staged**. The only added untracked path is the new Settings overflow runner; all previous untracked QA sources remain intact. Files edited here are `src/styles/settings.css`, the new runner and this existing untracked report. The large existing RC5 working tree was preserved.

HEAD remains **234e9737e694a84d10bccdee6fef1da29516ff07**. Version consistency was checked in package.json, package-lock.json including its root package, Cargo.toml, Cargo.lock and tauri.conf.json: **1.0.0-rc.4**. ProductName is **NoteFlow**; identifier is **com.noteflow.desktop**. No commit, tag, push, merge, version bump or release action was performed.

Final verdict: **READY FOR USER RC5 FINAL SMOKE**. The originally reported native overflow is fixed and rechecked after restart; all fresh automated gates pass. Extreme native sizes and native high-frequency/reduced-motion checks remain explicitly pending user smoke, not silently counted as browser-derived native acceptance.

## Approved Sidebar Design Implementation

This is a separate, scoped follow-up to the accepted sidebar/overflow fixes above. Their results are historical; the checks below were rerun for this change. Version remains **1.0.0-rc.4**; no RC5 publication is authorized by this pass.

### A. Button Fix and Scope

The previous creation button used the navigation's full available width with no cap. Its 40 px icon track placed the label 11 CSS px after the 18 px icon. At maximum sidebar width this produced an unnecessarily long button. A browser-only negative control reinstates those exact old rules and verifies that the new geometry assertions reject them.

Only production file edited in this pass: **`src/styles/pages.css`**. The scoped `.sb .new-btn.sidebar-action` override now:

- Caps the button at **280 CSS px**, while the existing 100% width adapts to smaller available space.
- Keeps it left aligned with navigation. At 360 px / 100%, its left edge is x=12 and right edge x=292; the navigation right edge is x=347, leaving 55 px on the right.
- Uses a 29 px icon track with the existing 18 px plus end-aligned, then `var(--space-2)` (**8 CSS px**) before the label. Plus X is identical to the six navigation icons. The creation label is intentionally 3 CSS px closer than navigation labels; the six navigation labels still share their original X coordinate.
- Preserves height 40 CSS px, radius, blue accent, font and existing hover/active/focus styles. No handler, accessibility label or component DOM was changed.
- Produces the same compact 40x40 CSS px button, with the plus centered and the label invisible. No scale transform or premature compact-layout switch was introduced.

Physical sidebar widths remain **74 collapsed / 190 minimum / 250 default / 360 maximum**; 320 was also checked. The 240 ms `cubic-bezier(0.22, 1, 0.36, 1)` transition, zero transition during pointer drag, width persistence, reduced-motion behavior and existing release/cancel handlers are unchanged.

No editor, Markdown, storage, search, AI lifecycle, RAG, model, project, archive, clipboard, drag/drop, dependency or release logic was edited. Other dirty source files predate this task and were preserved.

### B. Browser Geometry and Behavioral Regression

New source **`scripts/qa/rc5-approved-sidebar.mjs`** runs against the actual AppShell through the existing synthetic IPC fixture, in headless Edge. It covers 1100x700, 1440x900 and 1920x900; 100%/160%; light/dark; real pointer resize to 190/250/320/360; normal/hover/active/focus; keyboard Tab/Shift+Tab/Space; compact/expanded; rapid toggles; mock persisted width; and reduced motion.

Assertions measure real DOM rectangles and scrollWidth/clientWidth, not just classes: cap, left edge, exact gap, all icon X positions and 18 px sizes, nav label X, 40/38 px control heights, vertical centers and fixed Y positions, containment, nonintersection, page/sidebar overflow, monotonic sampled widths and no pointer-release jump. Pointer drag uses rounded physical deltas to match the existing integer settings normalization; no production rounding rule was changed.

The final new runner passed **240/240 cases**, including **303 actual samples across 24 collapse/expand animations**. It stores both every captured frame and the nearest captured frames to the requested 0/60/120/180/240 ms checkpoints. Maximum checkpoint sampling distance was 23.7 ms. This is actual runtime geometry, not a claim of exact-time captures or native FPS.

Example: collapse at 1440x900, 100%, light, starting from 360 px:

| Target ms | Captured ms | Sidebar px | Button px | Plus X | Label X | Gap px |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.0 | 360.00 | 280.00 | 23.00 | 49.00 | 8.00 |
| 60 | 64.9 | 360.00 | 280.00 | 23.00 | 49.00 | 8.00 |
| 120 | 124.1 | 258.39 | 230.20 | 24.59 | 50.59 | 8.00 |
| 180 | 200.1 | 96.88 | 63.62 | 27.12 | 53.12 | 8.00 |
| 240 | 245.8 | 79.69 | 45.88 | 27.41 | 53.41 | 8.00 |

The final sampled state at 330.6 ms is sidebar 74 px / square button 40 px. Times start at the click, not at `transitionstart`; React commit and frame scheduling explain why a 240 ms click checkpoint need not be the final width. Animation duration is separately checked as 0.24s, with the required easing. All frame assertions pass without assuming linear easing.

At 160%, the expanded 360 physical px sidebar's button measured 320.62 physical px (about 200.39 CSS px), with a 12.80 physical px gap (8 CSS px). The cap is **not** 280 physical px; when less than 280 CSS px is available, the button shrinks naturally.

Fresh companion runners:

| Runner | Cases | Scope |
| --- | ---: | --- |
| `rc5-approved-sidebar.mjs` | 240 | New button design, negative control and motion samples |
| `rc5-sidebar-stability.mjs` | 272 | Main/list/chat/RAG resize and persisted settings for all five widths |
| `rc5-settings-overflow.mjs` | 562 | Six Settings sections, five viewport sizes, themes/zoom/min/max/compact; 1,257 animation samples |
| `rc5-final-ui.mjs` | 110 | Panel transitions, editor identity/document/selection/scroll and narrow RAG drawers |
| `rc5-corrective3.mjs` | 86 | Earlier RC5 search/editor/sidebar regression |
| **Total** | **1,270** | All passed; no page errors |

Existing navigation alignment assertions were narrowed to the six nav labels to account for the approved 8 px creation gap; all seven icon positions are still checked. `rc5-sidebar-stability.mjs` now verifies all five settings widths survive fixture reload, explicitly mock persistence rather than a native SQLite restart assertion. `rc5-final-ui.mjs` now rechecks editor JSON, selection, DOM identity and scroll after actual main-sidebar resize plus rapid toggles.

Two real React behavioral tests were added to **`tests/sidebarPanel.test.ts`**: pointercancel releases capture/stops late deltas; creation/navigation actions and accessible names survive repeated collapsed-state renders. Existing lost-capture, 240 ms removal, inert/focus return, draft retention, rapid reopening and reduced-motion tests remain. The mounted note-chat test also passed: close/reopen during a deferred response retains the draft, completes one background request and writes history once, without issuing a duplicate request.

English labels and long Cyrillic labels are synthetic layout stress inputs, not a claim that full English localization now exists. At minimum physical width plus 160%, existing single-line ellipsis remains for labels that cannot fit; the full accessible name and tooltip remain. This pass neither claims all arbitrarily long strings are fully visible nor changes the accepted min width/font/navigation behavior to force them to fit.

### C. Actual Windows Tauri/WebView2 QA

Two fresh `npm run tauri dev` launches used only **`releases/qa/rc5-sidebar-stability-profile`**, with the existing ignored config disabling the duplicate Vite launch. No user database, credentials or model settings were copied or altered. No provider request was sent. One synthetic QA note was retained in this isolated ignored profile; intentional QA files were not removed.

Actually observed through the native window:

- Maximized 1536x816 and restored 1442x864; 100%/160%, light/dark. Appearance retains the preceding overflow fix; no horizontal page scrollbar was observed.
- At 100% and sidebar 360 px, the button stays 280 px wide and left aligned. At 160%, it uses the available narrower CSS space. Compact plus remains centered in a square button.
- Main sidebar pointer changes 360 -> 320 -> 250 -> 190 -> 360, staged smaller moves and a larger drag; collapse/expand and keyboard Ctrl+B. Icons and row positions remained visually stable.
- Real note-list resize, opening/closing the note chat, and RAG history/source-panel resize plus close/reopen. RAG changes width 280 -> 320 for history and 320 -> 260 for sources; reopening retains width.
- A synthetic long note (30 paragraphs, 333 words, Markdown table) saved successfully. Its text selection remained when opening note chat, and closing chat restored the previous visible paragraph after wrapping changed. Numerical selection/scroll equality is browser evidence, not an invented native measurement.
- Cold restart retained sidebar 360 px, list 440 px, history 320 px, sources 260 px, 100% light theme and the saved note/table. The creation button still showed the cap after restart.

Both native sessions exited with code 0 after normal system-X close. WebView2 printed the existing shutdown message `Failed to unregister class Chrome_WidgetWin_0. Error = 1412`; this is recorded, not suppressed. The Vite QA server and browser/native sessions were stopped before the fresh frontend/Rust gates.

**PENDING USER SMOKE:** native minimum/1920 px windows, high-frequency native animation/rapid-toggle feel, OS reduced-motion changes, successful manual note-chat resize, and closing/reopening during real Bridge/Ollama generation. The attempted native window-corner/chat-handle drags did not reliably engage their handles and are not counted as passes. Browser geometry and mounted deferred-provider tests cover these contracts without being relabeled native acceptance.

An initial synthetic inline data-URL PNG paste was rejected by the existing serialization guard (`not saved`); undoing that insertion and repeating the text/table-only paste saved successfully. No image/serializer fix was attempted in this sidebar-only scope, and the PNG rejection's cause was not proved. Real managed-image insertion/persistence remains **PENDING USER SMOKE**; browser image geometry is not proof of successful native image ingestion.

### D. Fresh Quality Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **639/639 PASS**, 75 suites, 44.604 s; 0 skipped/failed |
| `npm run build` | PASS, Vite 14.71 s; no chunk-size warning |
| `cargo fmt --check` | PASS; read-only |
| `cargo check` | PASS, 9.50 s |
| `cargo test` | **274 PASS / 10 existing ignored / 0 failed**, 30.12 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS, 2.43 s |
| `npm audit --omit=dev --offline=false` | PASS, **0 production vulnerabilities** |
| Browser regression | **1,270/1,270 PASS** |
| `npm run tauri dev` | Actual isolated-profile native smoke and cold restart, limitations above |
| `npm run tauri build` | PASS, exit 0; Vite 14.20 s, release compilation 2 min 39 s; fresh NSIS and both MSI verified |
| `git diff --check` | PASS; existing LF/CRLF conversion notices, no whitespace errors |

The adversarial Markdown application test passed in 865.549 ms. Tests were not skipped or weakened for performance; no dependency or production logic changed. Logs/results/screenshots stay ignored under `releases/qa/`.

Fresh bundles verified on 11 October 2026 (local timezone +03:00):

| Artifact | Full path | Bytes | Last write |
| --- | --- | ---: | --- |
| NSIS | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.4_x64-setup.exe` | 6,041,544 | 21:14:05 |
| English MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_en-US.msi` | 8,146,944 | 21:13:30 |
| Russian MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` | 8,146,944 | 21:13:40 |

Both MSI Property tables were read in read-only mode: ProductName **NoteFlow**, ProductVersion **0.99.4** (the existing RC4 mapping), ProductLanguage **1033** / **1049**. No installer was executed, installed, copied into release staging or published.

### E. Git and Release Control

Branch **`feature/rc5-usability-editor-polish`**; HEAD **`234e9737e694a84d10bccdee6fef1da29516ff07`** unchanged. Start **66 tracked modified / 34 untracked / 0 staged**; current **66 tracked modified / 35 untracked / 0 staged**. The only new path is `scripts/qa/rc5-approved-sidebar.mjs`.

Files edited in this pass: `src/styles/pages.css`, `tests/sidebarPanel.test.ts`, `scripts/qa/rc5-approved-sidebar.mjs`, `scripts/qa/rc5-sidebar-stability.mjs`, `scripts/qa/rc5-settings-overflow.mjs`, `scripts/qa/rc5-final-ui.mjs`, and this report. Production MainSidebar/ResizeHandle/SidebarPanel code was not changed in this pass. All unrelated dirty files and QA sources remain intact.

Version consistency was reread from package.json, both package-lock version fields, Cargo.toml, the NoteFlow Cargo.lock package and tauri.conf.json: **1.0.0-rc.4**. ProductName remains **NoteFlow**; identifier remains **com.noteflow.desktop**. No git add, commit, tag, push, merge, version bump or release action was performed. Published RC4 was not modified.

Final verdict: **READY FOR USER RC5 FINAL SMOKE**. All fresh automated and packaging gates pass. The explicitly listed native limitations remain **PENDING USER SMOKE**, not complete native acceptance. No commit or publication follows this report.

## Restore Fluid New Note Button Width

This follow-up supersedes the **280 CSS px cap** in the preceding Approved Sidebar Design section. Those earlier measurements and native observations are historical, not the acceptance criteria for this correction. The user rejected the cap after smoke; all results below were obtained again with the cap removed.

### A. Root Cause, Correction and Scope

The scoped `.sb .new-btn.sidebar-action` rule set `max-width: 280px`. At sidebar 360 px / 100%, the button stopped at x=292 while navigation reached x=347, producing 55 px of unnecessary empty space. This was a real width constraint, not overflow or a pointer/animation defect.

Only production file edited in this follow-up: **`src/styles/pages.css`**. The cap is removed with no replacement cap or fixed width. The button inherits the existing shared `width: 100%` and `box-sizing: border-box`; its scoped `min-width: 0` permits contraction. Button and navigation use the same container and therefore the same left/right edges throughout resize and collapse/expand. No independent width animation or JavaScript synchronization was added.

The 29 px icon track, 18 px plus, end alignment and 8 CSS px gap remain. Navigation labels keep their existing X coordinate; the creation label remains 3 CSS px closer to its icon, as accepted previously. Expanded button height stays 40 CSS px. At minimum physical width and 160%, only the creation label wraps to two lines; its existing 1.15 line height fits in the unchanged button. This restores the original creation-label wrapping intent, overridden by the shared single-line navigation rule. It avoids truncating "Новая заметка" without shrinking the font or increasing control height. Longer navigation labels retain their existing ellipsis, accessible names and tooltips.

The compact control remains a centered-plus square. **240 ms / `cubic-bezier(0.22, 1, 0.36, 1)`**, zero transition during manual drag, width settings, rapid toggles and reduced motion are unchanged. MainSidebar, ResizeHandle, SidebarPanel, editor and AI lifecycle code were not edited in this follow-up. No dependency, storage, backend, release configuration, functionality or version change was made.

Files edited here: `src/styles/pages.css`, the existing untracked `scripts/qa/rc5-approved-sidebar.mjs`, and this existing untracked report. Previous QA sources and unrelated dirty changes were preserved.

### B. Fresh Browser Geometry and Regression

The existing targeted runner now checks the **fluid** contract, rather than its rejected cap. Fresh results are stored separately in ignored `releases/qa/rc5-fluid-sidebar/`, preserving the preceding targeted run. Tests use actual AppShell/CSS with the existing synthetic IPC fixture, headless Edge and real browser pointer input. This is not native SQLite/provider evidence.

Matrix: 1100x700, 1440x900, 1920x900; 100%/160%; light/dark. Each combination resizes in both directions through **190 -> 250 -> 320 -> 360 -> 320 -> 250 -> 190 -> 360**, with multiple captured pointer positions for each drag. Assertions compare button/navigation left and right edges and widths, icon X/size, label X, fixed Y and control height, 8 px gap, computed max-width, clientWidth/scrollWidth, containment and intersections. The creation label's actual word rectangles must fit while expanded, including the two-line minimum-width case.

Negative controls separately inject `max-width:280px` and `width:280px`; the runner must reject both. At 100% the cap creates the original measurable right-edge gap. At 160% available CSS width is below 280, so checking computed `max-width: none` also detects a dormant cap before it becomes visible at another zoom.

Measured physical pixels at 1440x900, light; matching edges were also asserted for every other matrix entry:

| Zoom | Sidebar | Button | Left gutter | Right gutter | Plus X | Label X | Label height |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100% | 190 | 165 | 12 | 13 | 23 | 49 | 15.52 |
| 100% | 250 | 225 | 12 | 13 | 23 | 49 | 15.52 |
| 100% | 320 | 295 | 12 | 13 | 23 | 49 | 15.52 |
| 100% | 360 | 335 | 12 | 13 | 23 | 49 | 15.52 |
| 160% | 190 | 150.63 | 19.19 | 20.19 | 36.78 | 78.38 | 49.66 |
| 160% | 250 | 210.63 | 19.19 | 20.19 | 36.78 | 78.38 | 24.83 |
| 160% | 320 | 280.63 | 19.19 | 20.19 | 36.78 | 78.38 | 24.83 |
| 160% | 360 | 320.63 | 19.19 | 20.19 | 36.78 | 78.38 | 24.83 |

The extra 1 px in the right gutter is the sidebar border, not asymmetric content padding. The two-line label at 160% has height 31.04 CSS px inside the fixed 40 CSS px control. The expanded plus position is independent of width. In compact mode the different centered position is intentional and shared with navigation.

Targeted runner: **348/348 PASS**, including **643 real frame samples across 24 collapse/expand transitions**, with nearest captured checkpoints to 0/60/120/180/240 ms. Maximum checkpoint sampling distance: **18.5 ms**. Example collapse, 1440x900 / 100% / light:

| Target ms | Captured ms | Sidebar px | Button px | Plus X | Label X | Gap px |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.0 | 360.00 | 335.00 | 23.00 | 49.00 | 8.00 |
| 60 | 62.1 | 205.28 | 175.44 | 25.42 | 51.42 | 8.00 |
| 120 | 122.7 | 96.80 | 63.52 | 27.14 | 53.14 | 8.00 |
| 180 | 179.8 | 77.27 | 43.39 | 27.44 | 53.44 | 8.00 |
| 240 | 242.7 | 74.02 | 40.05 | 27.48 | 53.48 | 8.00 |

Every frame verifies synchronized button/navigation edges, monotonic widths, bounded icon motion, stable row Y and no page/sidebar overflow. Settled compact state is 74 physical px with a 40 CSS px square control and centered plus. Label visibility fades to zero during collapse; full-text assertions apply to visible expanded/drag states, not an invisible label squeezed into the compact track. Drag checks require zero width-transition duration and no additional button jump on pointer release.

Fresh companion runs:

| Runner | Cases | Evidence |
| --- | ---: | --- |
| `rc5-approved-sidebar.mjs` | 348 | Fluid creation width, min/default/intermediate/max, word containment, negative controls, frames, persistence, keyboard/focus, rapid toggles, reduced motion |
| `rc5-sidebar-stability.mjs` | 272 | All five panels, pointer resize and all five persisted fixture widths |
| `rc5-settings-overflow.mjs` | 562 | Six Settings pages, five viewport sizes, zoom/themes/min/max/compact, original Appearance regression; 1,356 transition samples |
| `rc5-final-ui.mjs` | 110 | Main/list/chat/RAG transitions; editor DOM identity, JSON, selection and scroll survive resize/toggles; narrow RAG drawers |
| `rc5-corrective3.mjs` | 86 | Earlier editor/search/table/sidebar regression |
| **Total** | **1,378** | All PASS; no browser page errors |

No existing frontend test was removed, skipped or weakened. The already present React pointercancel/lost-capture, action-name, panel retention and deferred note-chat tests were rerun as part of the full suite. Synthetic English/long labels are layout stress inputs, not a claim of completed localization.

### C. Actual Windows Tauri/WebView2 QA

Two fresh `npm run tauri dev -- --no-watch` launches used only **`releases/qa/rc5-sidebar-stability-profile`** and the existing ignored native config. The window was maximized at **1536x816**. No real user database, credentials or models were touched; no provider request was made and no new note was needed for this correction. The prior synthetic QA note/profile and intentional QA files were preserved.

Actually observed in the native window:

- 100% light: real main-sidebar drag through maximum, intermediate, default and minimum widths in both directions. At maximum, the button now reaches the same right edge as navigation instead of stopping at 280 px. Plus and label positions remain stable. Collapse/expand restores the maximum width and compact plus is centered.
- 100% dark: switched through Appearance and verified the maximum-width fluid button and navigation alignment.
- 160% dark: maximum -> intermediate -> approximately default -> minimum; full creation label at minimum wraps to two lines without clipping or changing button height.
- 160% light: switched themes at minimum and dragged back through default/intermediate to maximum. The button follows available width with no disproportionate blank right space. Collapse/expand preserves the saved maximum width and centers the compact plus.
- Cold restart retained **160%, light, sidebar 360 physical px**; the creation button was still fluid. Settings reopened on its existing default Models page; this is not a claim of subpage persistence.
- No horizontal page scrollbar was observed in these native states. The six-page/viewport matrix and numerical frame assertions are browser evidence, not relabeled native checks.

Both native launches exited with code 0 after normal system-X close. WebView2 again printed the existing shutdown diagnostic `Failed to unregister class Chrome_WidgetWin_0. Error = 1412`; it was recorded, not suppressed. Owned native windows, browser sessions and Vite were closed before the fresh full test gates.

**PENDING USER SMOKE:** subjective continuous slow-drag/rapid-toggle feel and native frame timing, extreme native window sizes, OS reduced-motion changes, and panel interaction during real Bridge/Ollama generation. Computer Use drag has no adjustable duration, so its actual start/end and successive resize observations are not claimed as a measured native slow-drag/FPS test. Browser pointer/frame checks cover continuous geometry; they do not replace this final native user assessment. The preceding unrelated managed-image ingestion limitation remains unchanged and outside this button-only scope.

### D. Fresh Quality Gates and Windows Build

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **639/639 PASS**, 75 suites, 26.399 s; 0 failed/skipped |
| `npm run build` | PASS, Vite 15.74 s; no chunk-size warning |
| `cargo fmt --check` | PASS; no automatic formatting |
| `cargo check` | PASS, 0.85 s |
| `cargo test` | **274 PASS / 10 existing ignored / 0 failed**, 24.42 s; test compilation 20.43 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS, 0.89 s |
| `npm audit --omit=dev --offline=false` | PASS, **0 production vulnerabilities** |
| Browser regression | **1,378/1,378 PASS** |
| `npm run tauri dev` | Two actual isolated-profile native launches; observed states and limitations above |
| `npm run tauri build` | PASS, exit 0; Vite 15.22 s, release compilation 2 min 11 s; NSIS and both MSI created |
| `git diff --check` | PASS; existing LF/CRLF conversion notices only |

The adversarial Markdown application test passed in 833.094 ms. Full frontend/Rust tests ran after closing owned browser/native QA and Vite, without concurrent Tauri dev. No test coverage or threshold was reduced. Command logs, browser results/screenshots and the synthetic native profile remain ignored under `releases/qa/`.

Fresh build outputs verified on 11 October 2026, local timezone +03:00:

| Artifact | Full path | Bytes | Last write |
| --- | --- | ---: | --- |
| NSIS | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.4_x64-setup.exe` | 6,040,625 | 21:45:29 |
| English MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_en-US.msi` | 8,146,944 | 21:44:51 |
| Russian MSI | `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` | 8,146,944 | 21:45:02 |

These installers were built, not executed, installed, copied to release staging or published.

### E. Git and Release Control

Branch **`feature/rc5-usability-editor-polish`** and HEAD **`234e9737e694a84d10bccdee6fef1da29516ff07`** remain unchanged. Start and final working-tree counts: **66 tracked modified / 35 untracked / 0 staged**. No source/test path was added in this follow-up; the QA runner and report were already intentional untracked files. All unrelated RC5 work remains intact.

Canonical versions were reread from package.json, both package-lock version fields, Cargo.toml, the NoteFlow Cargo.lock package and tauri.conf.json: **1.0.0-rc.4**. ProductName remains **NoteFlow** and identifier **com.noteflow.desktop**. No git add, commit, push, merge, tag, version bump, release creation or RC5 publication was performed.

Final verdict: **READY FOR USER RC5 FINAL SMOKE**. The fluid-width fix, regression tests and Windows packaging gates pass. Native start/end resize, collapse/expand, themes/zoom and cold restart were actually observed; subjective continuous-motion and extreme-native conditions remain explicitly pending user smoke. Stop after this report; no commit or release follows it.
