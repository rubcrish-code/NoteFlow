# RC5 User Smoke Corrective Pass No. 2

## Scope and Git Control

- Project: `D:\Projects\NoteFlow`.
- Branch: `feature/rc5-usability-editor-polish`.
- HEAD: `234e9737e694a84d10bccdee6fef1da29516ff07`.
- Application version remains `1.0.0-rc.4`; identifier remains `com.noteflow.desktop`.
- No commit, tag, staging of source files, push, merge or release was performed.
- The existing dirty first RC5 implementation and seven pre-existing untracked QA documents/scripts were preserved.
- This report supplements the first-pass report; its older 601/273 results are historical, not results of this corrective run.

Status meanings: PASS is evidence for the stated implementation or check only. PENDING USER SMOKE is an unperformed native scenario. KNOWN LIMITATION is an observed restriction, not a successful check. Automated DOM/style tests do not establish native visual correctness.

## All 20 Requested Items

### 1. Extra Period After Notes

Root cause: the model-settings explanatory subtitle ended in a period after the requested word. Only that copy was changed in `src/features/settings/SettingsPage.tsx`. Other empty-state text was not arbitrarily rewritten. Settings was inspected in the QA window. Implementation: PASS; exhaustive native empty-copy matrix: PENDING USER SMOKE.

### 2. Markdown Import into the Current Note

Root cause: the note menu reused the generic new-note import callback. `EditorArea.tsx` now captures the editor document/cursor and uses `insertImportedMarkdown.ts` for the current note. `MarkdownImportControl.tsx` accepts a current-note preview mode instead of offering filename-derived titles.

- Empty document: insert formatted content into that document.
- Nonempty document: insert at the captured position without replacing the selected text.
- Document changed while selecting/preparing files, or no captured cursor: append at the end.
- Multiple files: insert in their chosen order as one undoable editor transaction.
- Read-only/destroyed editor: reject without inserting.
- Note ID, title and note count do not change; existing autosave/CAS serializes the result.
- Data/Export's separate generic import still creates new notes.
- Parsing uses the existing Markdown-first pipeline. No second serializer was introduced.

Tests: `rc5Editor.test.ts` covers empty/cursor/fallback/batch/read-only and undo/redo/canonical reload; `rc5Management.test.ts` covers preview/long filename/cancel; `phaseCEditor.test.ts` mounts EditorArea, invokes its actual menu/file input/confirmation, and asserts the original ID/title, one record, zero new-note callback calls, and the updated editor snapshot. The latter is a component integration fixture, not a real SQLite import test.

Native PASS: imported a synthetic Markdown file through the Windows file picker into existing RC5 search note; original title and list count of one remained, original text remained, headings/checklists/table/link/code appeared formatted, autosave reached saved. Closed and restarted QA: all imported content remained. Native ID was not displayed; ID preservation is established by the component path/test, not claimed as an on-screen assertion. Error/undo matrix in the native window: PENDING USER SMOKE.

### 3. Button Alignment Audit

Root causes: action SVGs without explicit dimensions, shrinking header/action groups, and export buttons wider than their available column. Scoped fixes use the existing control tokens; no global button reset was added.

Files: `pages.css`, `editor.css`, `settings.css`, `app.css`. Export controls wrap safely; export sections switch columns by available container width. Recovery separator changes to horizontal when stacked. Tests: `rc5Styles.test.ts` checks those constraints. Native PASS for inspected Settings, Data/Export, toolbar, note actions and dialog controls at 100/160%. Full default/hover/focus/active/disabled/loading matrix across every application button and genuinely narrow/ultrawide widths: PENDING USER SMOKE.

### 4. Shared Empty States

Root cause: shared page empty content did not consistently center its flex children. `pages.css` centers the shared page empty state; note empty copy follows the same horizontal alignment. No hardcoded screen coordinates. Style regression PASS. Native empty Archive at 160% PASS; empty Projects/Notes full two-theme matrix PENDING USER SMOKE.

### 5. Compact Note Delete Dialog

Root causes: the description width cap and header flex allocation wasted available width, leaving an orphan word. Scoped `.note-delete-dialog` styles remove the cap, give copy the available width, balance wrapping, hide an empty body and trim footer spacing. Class used in EditorArea and NoteListPanel. Warning and deletion behavior remain intact.

Native PASS: opened/cancelled the dialog at light 160%; the sentence about inability to restore fits intact. No actual note deletion was performed. Narrow-window and 100% dialog visual matrix remains PENDING USER SMOKE.

### 6. Archive and Tags Header Wrapping

Root cause: header copy could shrink while actions consumed width. Shared row header copy grows with `min-width: 0`; actions do not shrink. Files: `pages.css`. Long descriptions still wrap at genuinely insufficient width instead of overflowing. Native Archive 160% inspected; full Tags/narrow matrix PENDING USER SMOKE. Implementation/style gate PASS.

### 7. Tag Picker Search Border

Root cause: wrapper and nested input both applied borders/focus decoration. `editor.css` gives the wrapper a single thin border and accessible focus-visible outline; the nested input has no independent border/shadow. Light 160% default/focus inspected: PASS. Style regression PASS; dark/full keyboard matrix PENDING USER SMOKE.

### 8. Tag Search and All Tags

Root causes: note/result cards used `slice(0, 2)`, hiding the third tag; tag-page navigation passed a name rather than the relationship identity. NoteListPanel now renders all assigned tag chips with wrapping. TagsPage passes ID; AppShell carries typed `tagId` into the existing Tauri search contract, updates the display query after rename and clears tag scope for ordinary query changes.

The Rust production search implementation was not changed. A real SQLite test in `src-tauri/src/search.rs` verifies third-tag search, Cyrillic/case/prefix behavior, shared-tag results, archived inclusion/filtering, exact tag-ID scope and full tags on returned records. DOM tests cover 1/2/3/12 visible tags and tag-ID navigation. No fake frontend search catalog or SQL.

Automated PASS. Three-tag native result-card/tag-navigation matrix: PENDING USER SMOKE; QA profile did not contain the required tags.

### 9. Uniform Search Highlighting

Root cause: active match styling could change perceived fill. `editor.css` uses the same match fill/radius, adding only a thin outline for active match. `noteSearch.ts` uses ProseMirror decorations, not marks/content mutations. Tests prove Markdown/sidecar/selection unchanged and no autosave triggered by navigation. Cyrillic/mark boundaries and edits/undo covered. Native differently cased matches and active outline at dark 100% PASS; full 160%/large-note visual matrix PENDING USER SMOKE.

### 10. In-Note Search Navigation

The existing engine is retained. `NoteSearchBar.tsx` renders bottom-right inside the writing viewport, with previous/counter/next, safe inset, wrap-around, centered scrolling and reduced-motion behavior. Query changes reset active match; edits remap its position. FTS query typing retains input focus. F3/Shift+F3 and Escape are scoped away from unrelated inputs.

Tests cover more than 100 matches, new query, editing/undo, Cyrillic, mark boundaries, next/previous/wrap/Escape, focus and no document mutation. Native counter and next/F3 wrap at 100% PASS. Long native document and full 160% navigation matrix PENDING USER SMOKE.

The official [TipTap Find and Replace documentation](https://tiptap.dev/docs/editor/extensions/functionality/find-and-replace) was reviewed. A second engine/dependency was not installed: replacing the existing FTS-aware decoration flow was unnecessary for this correction.

KNOWN LIMITATION: Ctrl+F opened WebView2's built-in find bar in this environment. Custom Ctrl+F was optional; it is not counted as a successful application shortcut check.

### 11. AI Field Help

Root cause: existing technical fields lacked local explanations. Existing `InfoHint`/tooltip infrastructure is used in SettingsPage, ModelSettingsUi and SemanticSearchSettings for real profile URL/key/model/discovery/manual-ID, timeout/context/temperature, custom headers/paths and embedding settings. Absent controls such as a streaming switch were not invented. Help is informational, keyboard focusable, not an action button.

DOM keyboard-help tests PASS. Native help affordances and accessible labels were inspected in Models. Actual native hover/focus tooltip rendering across all fields remains PENDING USER SMOKE: clicking an information icon suppresses hover in the existing portal behavior and was not treated as proof of a visible tooltip.

### 12. Data/Export Help

Files: SettingsPage and DeleteAllNotesControl. Added explanations beside actual knowledge/fragments/rebuild/backup/import/deletion sections using the same helper. No absent features added. DOM help behavior PASS; native section affordances/labels and layout at 160% PASS; complete native tooltip interaction matrix PENDING USER SMOKE.

### 13. Unboxed Bulk Deletion Section

Root cause: an outlined card created unnecessary visual weight. Scoped settings styles remove its outer border/shadow/background while retaining one section divider. Existing confirmation and handlers unchanged. Style regression PASS; Data/Export inspected without performing destructive deletion. Full two-theme visual matrix PENDING USER SMOKE.

### 14. Compact Note Context Menu

Root cause: direct SVG children in row action menus lacked constrained size and could use large intrinsic SVG dimensions. `pages.css` constrains direct SVGs to 18px, nonshrinking block display within existing flex rows. This fixes the geometry rather than hiding it with overlays. Existing viewport/menu keyboard behavior retained. Native right-click menu dark 100% PASS; style constraints PASS; full 160%/edge positioning matrix PENDING USER SMOKE.

### 15. Drag and Drop Policy Audit

The first RC5 fix routes native drop targeting through `.ed-scroll`, including blank writing space, instead of only the current document's DOM height. Coordinates convert physical pixels by devicePixelRatio; existing in-flight/stale-document guards and managed attachment ingestion remain.

Actual policy: `src/services/attachmentPolicy.ts` is populated by `get_attachment_policy` from `src-tauri/src/assets.rs`. Images: PNG/JPEG/WebP with signature validation, maximum 25 MiB. Generic files: maximum 512 MiB, no extension whitelist. Native batch maximum 32 paths; duplicate paths within a batch are deduplicated. Existing asset architecture/GC was not replaced.

`rc5Editor.test.ts` covers 160% coordinate conversion and uppercase image/generic classification, including an unlisted extension. Existing drop/asset tests cover insertion, stale responses and storage behavior. These are not proof of Windows Explorer/Desktop drag events.

| Scenario | Automated evidence | Real Windows native status |
| --- | --- | --- |
| PNG/JPG/JPEG/WebP | Kind classification and existing signature/asset tests PASS | PENDING USER SMOKE |
| PDF/DOCX/XLSX/TXT/ZIP | Generic classification PASS | PENDING USER SMOKE |
| Other generic extension | Not rejected by extension whitelist; classification PASS | PENDING USER SMOKE |
| Cyrillic/Unicode/spaces/uppercase | Synthetic filename/classification checks PASS | PENDING USER SMOKE |
| Mixed/multiple files | Existing batch insertion/stale/limit tests PASS | PENDING USER SMOKE |
| Empty/oversize/bad image signature | Existing validation tests PASS | PENDING USER SMOKE |
| Duplicate event/path behavior | Batch dedup and busy guard remain; no exhaustive native proof | PENDING USER SMOKE |
| Explorer/Desktop to blank editor space, 100/160% | Bounds/conversion tests PASS | PENDING USER SMOKE |
| Managed assets after restart/removal/shared references | Existing automated asset regression PASS | PENDING USER SMOKE |

No real cross-window drag was performed in this corrective native session. A native all-format PASS would be dishonest. Generic formats were not hardcoded into a restrictive catalog.

### 16. Single Header Row and Column

Root cause: toggling cell types alone neither identified a single axis nor preserved an independently selected row/column. `tableSelectionHeaders.ts` manages one optional row and one optional column. New row/column replaces the previous axis; toggling the same axis clears only that axis. Cell header type is the union of both axes. Multi-cell selection uses its top/left axis. Legacy tables infer existing full axes when first managed.

`tableExtensions.ts` stores `headerAxesManaged`, `headerRow`, `headerColumn`; `editorContentSerializer.ts` preserves these as formatting sidecar attributes, not an alternate text source. Export stays clean Markdown. Geometry, text, color and other attrs are retained.

A failing structural-edit regression additionally exposed numeric-axis drift when inserting rows/columns. An appendTransaction plugin now maps surviving header cells through the actual ProseMirror transaction mapping; deleting an axis clears it without losing the other axis. Appended normalization remains part of the original undo action.

Tests: selected middle axes, multiple/merged cells, intersection, move/toggle independence, undo, canonical reload, add row/column before axes, delete row and preserve column. Automated PASS. Native PASS: moved the header to the last row, added the first header column, saved and restarted; both axes and table text remained correct. Native merged-cell/structural-command/undo matrix PENDING USER SMOKE.

### 17. Calm Table Borders

Root cause: contrast, not a need for fractional border width. `editor.css` retains collapsed 1px default lines with lower token-based contrast. Selected cells stay distinguishable; explicit thick borders retain 2px black behavior. Native default table inspected at dark 100% and light 160%, including after restart: PASS. Full selection/thick-border theme matrix PENDING USER SMOKE.

### 18. Equal Block-Menu Grid

Root cause: two independent grids used different gaps. BlockInsertMenu uses one grid for all eight entries in the unchanged order, equal tracks/heights and no individual margins. Native inspection additionally exposed overlap by the table toolbar and right-edge clipping at 160%.

EditorArea hides table tools while the block menu is open, without altering selection/content. `app.css` limits menu width to its own editor parent rather than the whole viewport. Mounted test proves table/document/selection stay unchanged on menu open/close. Style tests cover equal tracks/margins/width constraints.

Native PASS: dark 100% and light 160%; all four rows inspected (scrolling inside the menu at 160%), no table-toolbar overlap and no right-edge clipping after corrections. Genuinely narrow/two-theme hover/focus matrix PENDING USER SMOKE.

### 19. Clear-Formatting and Unlink Icons

Root cause: old clear icon combined a cross with an underline; unlink strokes extended beyond its own SVG viewBox. Existing Icon registry now uses an eraser shape and in-bounds unlink geometry. Handlers and undo behavior unchanged; no icon library installed. Existing unlink/formatting behavior tests PASS. Full native icon states at 100/160% remain PENDING USER SMOKE.

### 20. Hyperlink Wording

Files: editorToolbarLayout and EditorCommandPopover. Updated the link action's tooltip/accessible name and popover heading to the requested hyperlink term. URL validation and insertion remain unchanged. Toolbar label inspected natively at 100%; automated regression PASS; overflow/popover text at every zoom PENDING USER SMOKE.

## Automated Gates

Completed in this corrective pass, not copied from the first-pass results:

| Gate | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run test | 625/625 PASS; 75 suites; final run 24.357 s |
| npm run build | PASS inside Tauri's beforeBuildCommand; Vite 15.53 s |
| cargo fmt --check | PASS |
| cargo check | PASS |
| cargo test | 274 PASS, 10 ignored; 284 total; final repeat 23.20 s |
| cargo clippy --all-targets --all-features -- -D warnings | PASS |
| npm audit --omit=dev --offline=false | PASS; 0 production vulnerabilities |
| isolated FTS benchmark | PASS; final repeat: 10,000 notes, query 1.0271 ms; index 13.5836 s; test 13.59 s |
| npm run tauri dev | PASS on debug-only isolated profile; closed through X |
| npm run tauri build | PASS; release compilation 2 min 39 s; NSIS and both MSI languages created |
| git diff --check | PASS; no whitespace errors |

Final frontend total is 24 higher than the first-pass 601; Rust is one higher than 273. Old tests were not deleted. CSS/source contract tests only assert structural constraints; they are not presented as rendered layout tests. Behavioral regressions use real TipTap/ProseMirror and mounted React DOM where applicable.

Earlier attempts are recorded rather than silently erased: a Markdown security timing assertion failed under concurrent Tauri/native work; clean full reruns passed without changing its threshold. A sandbox-only full run passed 623/624 but blocked the PowerShell release-fixture script with AuthorizationManager. Rerun with allowed access passed 624/624; after adding the mounted import integration, final full run passed 625/625. Separate sandbox Vite failed on EPERM realpath; Tauri's allowed beforeBuildCommand subsequently completed. No system security/ExecutionPolicy settings were changed.

FTS was run separately from dev/heavy compilation. The ten explicitly ignored Rust tests are not claimed to have all run; only the named isolated FTS performance test was additionally executed.

## Native Evidence and Limitations

- Used actual debug Tauri/WebView2, not browser-only screenshots.
- Isolated profile: `D:\Projects\NoteFlow\releases\qa\rc5-usability-profile`; override is debug-only.
- Synthetic import fixture: `releases/qa/rc5-corrective2.md`; both paths are Git-ignored.
- Inspected 100/160%, dark/light; 1536x816 maximized and approximately 1442x864 restored windows. This is not coverage of every supported width.
- Real note-menu import, preserved title/count, formatted Markdown, autosave, search matches/counter/next/F3, header switching, default borders, block-menu grid, tag-picker focus, compact delete cancellation, settings/help affordances and Data/Export adaptive controls were observed.
- Reopened after system-X shutdown: title/count, original text, imported Markdown/checklist/table/link/code, chosen header row/column and applied 160% zoom persisted.
- Final system-X close ended dev with exit 0; no remaining NoteFlow process. WebView2 emitted upstream Chrome_WidgetWin_0 unregister error 1412; this diagnostic was not fixed or hidden.
- No actual destructive operation on user's data. No user API keys read/copied; no external AI requests issued.
- Native full Drag & Drop, three-tag result display, all tooltip hover/focus states, genuinely narrow/ultrawide layouts, live Bridge/Ollama/background AI/RAG, and complete export/backup/restore/image workflows remain PENDING USER SMOKE.
- Installers are build artifacts only; installation/upgrade lifecycle was not performed.
- Synthetic isolated profile is retained for repeatable smoke; it was not silently deleted through the UI.

## Packaged Artifacts and Final State

Fresh local QA outputs (local file times, 10 October 2026):

| Artifact | Bytes | Modified |
| --- | --- | --- |
| `D:\Projects\NoteFlow\src-tauri\target\release\noteflow.exe` | 20,984,832 | 00:32:37 |
| `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.4_x64-setup.exe` | 6,042,408 | 00:32:37 |
| `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_en-US.msi` | 8,146,944 | 00:32:01 |
| `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` | 8,146,944 | 00:32:12 |

Version consistency checked in package.json, package-lock.json (top-level and root package), Cargo.toml, Cargo.lock and tauri.conf.json: all `1.0.0-rc.4`. ProductName is NoteFlow; identifier is com.noteflow.desktop. No new dependency or migration added by this corrective pass.

Final tree: 59 tracked modified, 20 untracked, 0 staged. This count includes all first-pass RC5 work; it is not a claim that this corrective pass changed all 79 files. The extra untracked corrective report is intentional. The seven older QA documents/scripts remain. Git reports existing LF-to-CRLF normalization notices; these are not diff whitespace failures and no mass formatting was performed.

These are uncommitted local QA builds, not published updates to RC4. No installer was installed, no release directory was staged, and no GitHub asset was uploaded.

## Recommended User Re-Smoke

1. Import Markdown into an empty and a nonempty existing note. Check title/count, cursor insertion, undo/redo and restart.
2. Assign three short tags; find the third by name, open tag scope, rename/clear, and inspect all chips.
3. Navigate 100+ search matches with previous/next/F3/Shift+F3, edit/undo, switch notes; check 160% placement.
4. Switch/move/toggle both table header axes, merge/split/add/delete row/column, colors/thick borders, undo and restart.
5. Inspect all eight block-menu entries, context icons, delete-warning wrapping and help tooltips at 100/160%, narrow/wide, both themes.
6. Complete the Drag & Drop matrix above from Explorer/Desktop, including mixed generic files and policy failures; verify managed references after restart.
7. Recheck Bridge/Ollama, AI drafts/background work, RAG, clipboard/image/export and backup/restore on a safe profile.

## Final Verdict

READY FOR USER RC5 CORRECTIVE SMOKE.

Implementation and automated gates are ready for user re-smoke. This is not an assertion that every requested native scenario already passed: the pending matrix above remains explicit. Optional custom Ctrl+F remains a known limitation. No commit/tag/push/merge/release/version change was performed. Stop here until user smoke/authorization.
