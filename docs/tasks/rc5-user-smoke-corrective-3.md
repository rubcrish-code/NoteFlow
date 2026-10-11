# RC5 User Smoke Corrective Pass 3

Verification completed on 11 October 2026. This report supersedes neither the historical RC5 report nor corrective pass 2: it records only the nine additional user-smoke corrections.

## Scope and safety

- Branch: `feature/rc5-usability-editor-polish`.
- HEAD: `234e9737e694a84d10bccdee6fef1da29516ff07`.
- Application version: `1.0.0-rc.4`; package, root lock package, Cargo package/lock and Tauri versions remain unchanged.
- Identity remains `NoteFlow` / `com.noteflow.desktop`. Existing MSI mapping remains `0.99.4`.
- Starting working tree: 59 tracked modified, 20 untracked, 0 staged. Existing corrective work and intentional QA files were preserved.
- No backend, provider, persistence, Markdown serializer, sidecar schema, deletion semantics or release metadata was changed in this pass.
- No commit, tag, staging, push, merge or release was performed.
- Native QA used the separate ignored `releases/qa/rc5-corrective3-profile` profile. Browser fixtures use only synthetic content and mocked IPC, never user credentials or a user database.

## Corrective matrix

All implementations below are complete. Browser and unit results are not a substitute for native acceptance. The user explicitly requested that the remaining native smoke be left to them.

| # | Problem | Root cause | Correction / files | Automated evidence | Native QA | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Empty notes instruction retained its period | The actual empty editor in AppShell had its own literal; changing a different empty state did not affect this screen | Removed the period in `src/app/AppShell.tsx` | Mounted AppShell bulk-delete test checks the exact instruction and rejects the old literal in `tests/deleteAllNotes.test.ts` | Actual fresh Tauri profile, onboarding skipped, light theme at 100%: instruction observed without a period | Implemented; native 100% light PASS; other native variants pending |
| 2 | RAG action icons/text were not centered | Fixed-size controls inherited native button padding/baseline behavior; direct SVGs were inline | Scoped flex centering, zero padding on fixed-size controls and block SVGs in `src/styles/rag.css`; no negative offsets | Actual RagChatWorkspace geometry at 100/160%, light/dark and narrow/wide; measured center delta 0 to 0.0078125 screen px | Remaining real RAG matrix left to user | Implemented; browser PASS; PENDING USER SMOKE |
| 3 | Three descriptions occupied unnecessary lines | Long copies and deletion-dialog description width restriction | Shortened actual TagsPage, ArchivePage, EditorArea and NoteListPanel copies; deletion description uses available width in `src/styles/pages.css` | Actual page/modal copy assertions; browser deletion description line count 1 at 100/160%; Tags/Archive descriptions both 1 line in the synthetic layout at 1100x700 | Remaining real pages/modal left to user | Implemented; automated PASS; PENDING USER SMOKE |
| 4 | Search overscrolled the target above the editor | `domAtPos` parent `scrollIntoView` centered a block, not the match, and did not explicitly account for the actual scroll viewport or app zoom | New `scrollToSearchMatch.ts`; NoteSearchBar uses coordsAtPos and actual `.ed-scroll` geometry, overlay exclusion and zoom conversion | Real TipTap browser navigation with 2/20/120 matches, sidebar widths, resize, mixed heading/list/table content, wrapping and smooth/reduced motion; document, selection and update counter unchanged | Ten sequential native next/previous checks left to user | Implemented; automated PASS; PENDING USER SMOKE |
| 5 | Model help alignment and invisible tooltip | Label was not a centered inline group; tooltip z-index 220 was below modal 1200; global focus/pointer dismissal could hide unrelated focused help | `foundation.css` field-label/InfoHint alignment; tooltip z-index 1400 in `app.css`; ownership-aware focusout/mouseout and informational-trigger handling in `TooltipPortal.tsx` | Mounted ModalShell hover/click/focus test, Escape/accessibility regression; real browser hover and keyboard tooltip inside modal, label/hint center delta 0 | Model fields and Data/Export native hover/focus left to user | Implemented; automated PASS; PENDING USER SMOKE |
| 6 | Top note action menu lacked consistent icons | Its action rows were text-only, unlike the note-list context menu | Same existing copy/pin/folder/doc/archive/X icons in `NoteMenuPopover.tsx`, icon/span grouping and bounded 18px SVGs in `editor.css` | Actual component action order, duplicate handler and closing behavior; 8 rows measured at both zooms, icon/text center delta <= 0.0078125 screen px | All real actions/menu placements left to user | Implemented; automated PASS; PENDING USER SMOKE |
| 7 | Expanded table menu clipped near viewport edges | Expanded menu was nested in the mini-toolbar rather than an independent collision-aware portal | Reused MenuPopover/positioning hook, stable button anchor, flip/shift, bounded height and internal scrolling in `TableToolsPopover.tsx` and `editor.css` | 24 top/middle/bottom geometry combinations; last action scrolled into menu bounds, Escape works and document unchanged; existing table behavior/header roundtrips remain green | Native edge placement and click behavior left to user | Implemented; automated PASS; PENDING USER SMOKE |
| 8 | Eight-entry block menu was too tall | Large vertical padding/min-height plus all-grid `1fr` equalization made short rows as tall as the longest row | `editor.css`: padding 8px, min-height 52px, auto rows with equal height within each pair, same order and 2-column grid; zoom-aware max-height, internal overflow | Browser 2x4 grid, equal row heights/gaps and no horizontal text overflow at 100/160%, both themes, 1440x900 and 1100x700 | Native click targets, closing and narrow layout left to user | Implemented; browser PASS; PENDING USER SMOKE |
| 9 | Clear-format icon remained decorative | Shared clear icon path was an eraser, not the requested plain X | Only the `clear` SVG path in `src/shared/Icon.tsx` changed to two crossing lines; handler untouched | Exact single-path SVG check; actual clear-format command with undo/redo in `tests/rc5Editor.test.ts` | Context menu/toolbar hover/disabled appearance left to user | Implemented; automated PASS; PENDING USER SMOKE |

## Behavior and geometry

### Search

The helper calculates a fresh viewport on every navigation. `coordsAtPos` supplies screen coordinates while `scrollTop`, `clientHeight` and `offsetHeight` remain CSS pixels under app zoom. The screen/CSS scale is derived from the real container rect, not a fixed offset. The bottom search panel is excluded when it overlaps the viewport; the result is clamped to document scroll limits. Reduced motion uses an immediate scroll; normal mode uses smooth scrolling.

The helper does not dispatch a content transaction, modify marks/selection, serialize a document, write sidecar data or scroll the application window. Search index changes still use the existing decoration metadata flow.

- 24 primary search combinations: 2/20/120 matches x two editor widths x two themes x two zooms. Ten consecutive Next clicks checked per combination, plus Previous and invariant checks.
- At 160%, 120 matches and reduced editor width: usable viewport y=0..720.421875; match 2 y=343.109375..377.109375, center=360.109375; match 11 center=360.15625. Viewport center=360.2109375. Both are visible and centered within 0.11 screen px.
- The short two-match document legitimately cannot scroll/center; matches stay visible and no impossible centering is required.
- Four mixed heading/list/table cases check ten Next, ten Previous and first/last wrapping with unchanged editor JSON.
- Resize to 1100x700 at 160%: target y=243.140625..277.140625 inside editor y=0..612.
- Ten sequential normal-motion Next clicks at 160% remain visible after each completed scroll; no secondary jump observed in the browser fixture.
- Every primary navigation keeps `window.scrollY=0`; document JSON, selection and editor update counter remain unchanged.

### RAG controls

The real workspace component was mounted with default physical side-panel widths (280/320px). The QA fixture originally divided these widths by zoom twice; this fixture error was corrected and the complete geometry matrix repeated. It was not a production layout change.

Measured controls: New chat, hide history, conversation overflow, scope dropdown, model-settings entry, setup action, send and hide sources. Each has centered computed alignment; SVG/button-center delta is <= 0.0078125 screen px. Stop shares the same ChatComposer control/class as Send; source-copy and retry controls use the scoped variants. Source/history rows intentionally keep their structured left-aligned content rather than being globally centered.

The unconfigured-model browser fixture does not simulate a live provider or prove every busy/retry/source action visually. Existing RAG/background/draft tests cover the functional flows; live model, Stop, populated sources, overlays and native geometry remain user smoke. This pass does not introduce a model selector or change the existing model-settings architecture.

### Descriptions and help

- Deletion description: `После удаления заметку не получится восстановить.` One line in the actual ModalShell fixture at 100/160%. The separate backup explanation is preserved.
- Tags: `Управляйте тегами и открывайте связанные заметки.`
- Archive: `Архивные заметки можно восстановить в любой момент.`
- Tags/Archive synthetic page layout: one line each at 1100x700, both themes and zooms. Actual page strings are separately asserted by mounted tests; the browser copy fixture is not a native page screenshot.
- No smaller typography, clipping or forced no-wrap was introduced. Genuine insufficient width may wrap accessibly.
- InfoHint remains focusable with a calm default cursor and visible focus ring. Tooltip remains pointer-transparent; its trigger is not pointer-disabled.
- At 160% inside ModalShell, hint and label centers both y=474; tooltip bounds x=433.375, y=492, w=300, h=42.78125. Tooltip z-index=1400, modal=1200, popover=1300. Hover and keyboard focus both produce a visible tooltip.
- Informational click does not suppress keyboard help; pointer/focus events from unrelated elements do not dismiss it. Escape, scroll, resize and trigger removal still dismiss safely.

### Menus

- Note action icons: 18x18 CSS px; at 160% measured 28.796875 screen px. All eight fixture rows have icon/text center delta <= 0.0078125 screen px. No title/preview header was reintroduced.
- Table menu portal remains within viewport. Representative 160% middle-table/sidebar case: x=564.34375, y=459.046875, w=380, h=426.953125; bottom=886 < 900. Last action y=854.046875, h=30, inside the bounded menu after internal scroll.
- Top and bottom tables, wide/right-edge and reduced editor width are covered at both zooms/themes. The shared portal uses its own screen-space sizing; it is not scaled twice by the editor's zoomed ancestor.
- Full table menu uses dialog semantics because it includes toggles, swatches and grouped controls; selection-preserving command handlers remain in place. Opening, scrolling and Escape do not mutate the table. Existing structural-edit tests continue to enforce a single managed header row/column.
- Block grid order remains Table / Callout / Details / Divider / Image / File / Drawing / Date. At 100% typical short rows measure 56.515625px and two-line media row 72.03125px. At 160% these measure 89.625px and 114.46875px. Each pair is equal height; row gaps are 8 CSS px (12.796875 screen px at 160%).
- At 1440x900 all eight block entries are visible simultaneously. At 1100x700/160% the bounded menu is x=28.796875, y=153, w=657.390625, h=444; longer text wraps without horizontal overflow. Internal scroll is necessary to access all four rows; the final Date action is reachable. This is not a claim that all eight entries fit simultaneously at every narrow size.

## Tests and reproducibility

Added five frontend test cases on top of the previous 625:

1. Correct scroll container/zoom centering, clamping, resize and unchanged document/selection/update counter at 100%.
2. Same behavior at 160%.
3. Hover, informational click, keyboard focus and unrelated pointer departure with help inside a real ModalShell.
4. Plain clear X plus real formatting clear/undo/redo.
5. Actual note-menu icons/order and duplicate action/close behavior.

Existing tests also gained exact empty-state, deletion copy and Tags/Archive assertions. Table positioning contracts now point to the shared portal implementation, while existing behavior/persistence tests remain intact.

- Tests touched: `tests/rc5Editor.test.ts`, `rc5Settings.test.ts`, `rc5Management.test.ts`, `rc5Styles.test.ts`, `deleteAllNotes.test.ts`, `editorUiPolish.test.ts`.
- Browser harness: `scripts/qa/rc5-corrective3.html`, `.tsx`, `.css`, `.mjs`. Imports real production components/styles and editor extensions with synthetic content and mocked IPC. No new production dependencies.
- Runner uses installed headless Edge through the bundled Playwright runtime. Final result: **86/86 browser geometry scenarios PASS**, after correcting the fixture's physical panel widths.
- Local ignored evidence: `releases/qa/rc5-corrective3-geometry/results.json`; eight screenshots for the block menu and RAG workspace at both zooms/themes. Screenshots were inspected; they are browser evidence, not native Tauri screenshots.
- Reproduction: run `npm run dev -- --host 127.0.0.1`; set `NOTEFLOW_QA_PLAYWRIGHT` to the local Playwright module URL when it is not installed in the project; run `node scripts/qa/rc5-corrective3.mjs`.

## Gates

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | PASS: 630 tests, 75 suites, 0 failed/skipped; 18.529 s final run |
| `npm run build` | PASS; Vite 259 modules, 12.60 s; no chunk-size warning |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS; 20.05 s |
| `cargo test` | PASS: 274 tests, 10 ignored, 0 failed; 20.37 s unit runtime; main/doc tests 0 and successful |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS; 1.66 s |
| `npm audit --omit=dev --offline=false` | PASS: 0 production vulnerabilities |
| `npm run tauri dev` | Actual separate-profile startup and empty-state observation completed before the user took over remaining native smoke |
| `npm run tauri build` | PASS: NSIS, en-US MSI and ru-RU MSI; Rust release compilation 1m 43s |
| `git diff --check` | PASS, including the final repeat after report completion |

The first full frontend attempt found an input missing from the new help test fixture and a sandbox AuthorizationManager failure in the existing PowerShell artifact test. The fixture was fixed, not the production behavior; the complete suite then passed outside that sandbox restriction. Rust fmt also needed the unrestricted local context because sandbox path canonicalization returned access denied. No automatic formatting or test skipping was used.

The ignored Rust tests remain the existing explicitly opt-in native/provider/machine-sensitive tests, not failures hidden by this pass. Live provider/installer lifecycle verification is not implied by these counts.

## Native QA and remaining user actions

Observed in actual Tauri/WebView2: isolated fresh QA profile, onboarding welcome/skip, empty editor and the exact instruction without a trailing period, light theme at 100%.

Subsequent native automation could not reliably capture/activate the QA window: some captures showed other foreground applications, and the QA window later remained minimized. Those captures are not counted as NoteFlow verification. The user explicitly answered: `Оставьте оставшийся native smoke мне`. No further native input was attempted, no real notes/keys/profiles were changed, and browser checks are clearly separated above.

Pending user smoke at 100/160%, light/dark, narrow/wide:

1. Verify the empty instruction and the three shortened descriptions on actual pages/modal.
2. Check RAG action alignment, configured models, scope/overflow, Send/Stop and populated sources.
3. In a long note, run ten Next/Previous clicks, wrap first/last and resize/open the AI panel; every active word must remain visible without manual correction.
4. Hover and Tab-focus model field hints inside dialogs and check Data/Export hints.
5. Use top note-menu actions and compare their icons with the list context menu.
6. Open table tools near the top/bottom/right edge, scroll to the last action and exercise commands on a temporary note.
7. Check all eight compact block actions and close/Escape at narrow 160%.
8. Check the plain clear X in context menu/toolbar and clear/undo/redo.

## Final control

Freshly built outputs, verified by existence, nonzero size and current build timestamp on 11 October 2026:

| Output | Bytes |
| --- | --- |
| `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.4_x64-setup.exe` | 6,039,850 |
| `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_en-US.msi` | 8,146,944 |
| `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` | 8,146,944 |
| `D:\Projects\NoteFlow\src-tauri\target\release\noteflow.exe` | 20,984,832 |

These are local QA builds of the current dirty tree, not a publication or alteration of the published RC4 release. No installer was installed or copied into release staging. Installer lifecycle smoke remains separate.

Final working tree: **62 tracked modified, 26 untracked, 0 staged**; branch and HEAD unchanged. Counts include the preserved earlier RC5 work, not just this pass. The three newly modified tracked files relative to the starting status are TooltipPortal, rag.css and deleteAllNotes.test.ts. New untracked additions in this pass are the search scroll helper, four browser-fixture/runner files and this report; existing untracked tests/reports were updated in place. QA screenshots, synthetic profile and build outputs remain ignored.

Production files changed specifically for this pass: AppShell, TagsPage, ArchivePage, EditorArea, NoteListPanel, NoteSearchBar, scrollToSearchMatch, NoteMenuPopover, TableToolsPopover, Icon, TooltipPortal, app.css, foundation.css, editor.css, pages.css and rag.css. Previously dirty backend and other phase files were preserved rather than reverted.

The local Vite/browser QA process was stopped after completion. No owned node/cargo/NoteFlow test processes remained at the final process check. No real credentials, notes or profile were modified. Do not publish or commit this pass without user acceptance.

**READY FOR USER RC5 CORRECTIVE SMOKE**

All nine corrections are implemented and all automated gates are green. Native items marked pending are not reported as PASS; remaining acceptance is explicitly delegated to the user.
