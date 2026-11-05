# Markdown And Sidebar Architecture

## Stage A: Diagnosis And Design

Branch `codex/post-rc6-markdown-performance`, HEAD
`42cdf9cca1371eac49c5645f6f82036d63b65b50`, app version1.0.0-rc.6.
Initial tree60 modified/60 untracked/0 staged. Existing changes are retained.
Safety copy: ignored `releases/qa/architecture-before.patch` plus
`architecture-before-untracked/`. No Git staging/commit/tag/push/release.

### Current Markdown Chain

`TipTap JSON -> save preparation/worker -> serializeEditorDocumentForStorage ->
canonical Markdown + HTML/JSON caches + editor_node_attrs_v1 -> typed Tauri CAS
save -> SQLite transaction -> hydrate Markdown + sidecar -> EditorArea`.

Export: `exportAfterFlush -> get_note -> hydrated editorDocument ->
tiptapJsonToStandardMarkdown -> version-checked Rust export -> physical .md`.
Import, AI insertion and Markdown clipboard call `markdownToTiptapDoc`.
Plain clipboard export calls the same portable function, but that function still
contains a separate handwritten delimiter renderer/validation fallback.
`@tiptap/markdown` is not currently installed; installed TipTap family is3.30.5.

| Confirmed code/evidence | Risk |
| --- | --- |
| projectInlineMarkdown still removes supported marks when its own round-trip comparison fails | A new valid range combination can again become plain text; prior soft-break fix covered only one trigger |
| Canonical HTML fallback, handwritten block parsing, portable projection and HTML clipboard use different rules | Fixing one projection does not prove the full persistence/export/paste chain |
| Prior real UI-created731-byte Matrix export roundtripped correctly | This does not reproduce every user document; do not label the latest unspecified document reproduced |
| Stored JSON is only a cache; Markdown/sidecars are authoritative | Changing the parser without legacy compatibility could lose existing formatting before export |

### Current Panel Chain And Jitter Risks

`ResizeHandle rAF delta -> AppShell updateUiSettings -> full AppShell render ->
fitEditorWorkspaceWidths -> grid tracks -> child ResizeObservers -> layout`.
The250ms settings debounce can write intermediate sizes during a paused drag.
Each frame derives deltas from already fitted/clamped widths; crossing a compact
threshold can hide a panel/change the coordinate base while its handle is captured.
CSS grid, panel opacity and sidebar padding transitions have independent owners.
All31 toolbar flex tracks redistribute width on each frame. The prior density
breakpoints were removed, but this alone does not isolate resize from global state.
The compact-chat override is explicitly absolute/overlay CSS, now rejected by the user.

### Proposed Architecture And Risks

1. Use official MarkdownManager3.30.5 (matching exact core/pm peers) for standard
   nodes/marks; register explicit adapters for NoteFlow extensions. One codec facade
   supplies storage, portable export and import/Markdown clipboard. Keep an explicit
   legacy reader for existing stored syntax; no data migration or open-time rewrite.
   Never silently remove supported marks on an error. Risk:L, formatting/data integrity.
2. Keep sidecars for appearance and nonportable structures. Verify old fixtures and
   actual saved UI documents before replacing a reader. Pure serialization must not
   dispatch transactions or increment CAS. Risk:L, backward compatibility.
3. One pure panel solver determines grid widths/visibility. A drag session captures
   a fitted baseline once, paints CSS variables per frame, and commits preferences
   once at pointer-up. Do not rerender AppShell or persist widths on pointer moves.
   Existing ResizeHandle remains the single pointer engine. Risk:M, shared shell.
4. Right chat is always a grid column. First compress panels, then collapse the note
   list/navigation if necessary. No chat/list overlay. Keep editor/chat mounted while
   changing widths and retain requests/drafts independently of presentation. Risk:M.
5. User explicitly selected right-only chat with a higher supported minimum width.
   Minimum at160% is approximately820*1.6+300+74=1686 logical window pixels.
   Smaller actual screens cannot support this combination. Do not resize a managed
   Maximized/Fullscreen window into normal state, shrink targets, hide tools, or
   claim that impossible geometry passes. Risk:documented physical limitation.
6. Slightly increase existing derived tag tints, preserving stored identity and
   >=4.5:1 text contrast, both themes. No chip redesign. Risk:S.

### Node / Mark Policy

| Nodes/marks | Standard Markdown | Canonical storage / sidecar |
| --- | --- | --- |
| doc, paragraph, text | CommonMark blocks/text/escaping | Markdown; extra empty-block layout retained separately if needed |
| heading1-6 | # through ###### | Markdown; alignment/indent sidecar |
| bold/italic/bold+italic/strike/code/link | ** / * / *** / ~~ / backticks / [label](href) | Standard marks in Markdown; exact unrepresentable boundary ranges in sidecar |
| bulletList/orderedList/listItem | nested GFM lists; ordered start retained | Markdown |
| taskList/taskItem | - [ ] / - [x] | Markdown |
| blockquote/codeBlock/horizontalRule/hardBreak | > / safe fenced code / --- / explicit break | Markdown; invisible terminal whitespace/extra appearance not a portable promise |
| image | ![alt](managed-or-external-uri) | Markdown; dimensions/alignment/edit metadata sidecar; existing backend resource rewrite |
| table/row/cell/header | GFM table for ordinary grid | Layout/span/background/header metadata sidecar; complex export clearly projected |
| underline/textStyle/fontFormat/highlight/superscript/subscript | text without nonstandard appearance | Sidecar; do not use invented Markdown markers |
| callout/detailsBlock/summary/content | quote / ordinary expanded content | Explicit canonical extension representation + sidecar |
| inlineDate | readable date text | Canonical date representation + attributes |
| fileAttachment/noteMention/internal fragment link | readable managed link / documented noteflow URI | Existing managed IDs and typed link metadata |
| unknown node/mark | explicit error or documented projection, never silent supported-mark stripping | No opaque data migration |

### Verification Plan

Official codec compatibility/probes -> targeted real-Editor save/export/import and
legacy sidecar tests -> pure panel solver and pointer-session tests -> full browser
regression, retained first-attempt failures and perf samples -> all frontend/Rust/
security/build gates -> fingerprinted isolated QA EXE -> actual UI-formatting,
physical export/import/restart/VS Code Markdown paste, native drag/profile and chat.
Label actual native observations separately from browser emulation. No real user DB,
notes, credentials or provider profiles are used.

References: official TipTap Markdown documentation and its package changelog;
fixes for overlapping/LIFO marks are documented in3.23.0 and escaping in3.25.0,
already included in the selected3.30.5 line. Current npm latest3.32.2 was checked;
no unrelated all-package update is justified merely by a newer version number.

## Execution

### Implementation

- Added exactly matched `@tiptap/markdown@3.30.5`; all existing TipTap packages
  remain on3.30.5. No application version bump. The official MarkdownManager is
  shared by the editor API, save worker, import/paste facade and portable export.
- Replaced the active handwritten writer, not just its export entry point. Kept
  the old reader for old notes/exports. New sidecars carry a codec discriminator;
  old notes are not rewritten on open. No SQLite migration was added.
- Public extension adapters cover nested mixed task/ordered lists, safe variable
  code fences, inline backticks, GFM tables, callouts/details, dates and managed
  files. The default package handlers alone did not pass the existing fixtures:
  nested tasks, fence literals and overlapping marks required explicit adapters.
- Additional appearance remains in sidecars. Bound structural sidecars preserve
  empty paragraphs and terminal hard breaks that ordinary Markdown cannot encode.
  Portable export validates standard-mark semantics and fails explicitly rather
  than silently replacing unsupported emphasis with plain text/HTML.
- CPU profiling identified costly GFM email lookaheads in long URL-free strings.
  A scoped Marked tokenizer delegates those runs to its CommonMark text rule,
  retaining GFM tilde boundaries. Real URLs still use GFM. Existing1-second
  security threshold and2-second worker termination were not increased.
- Added a single snapshot-based resize session for navigation, note list and note
  chat, including navigation on secondary pages. Pointer frames update only the
  owning grid's CSS variable. Preferences commit once on release. UI settings
  persistence is paused during capture. Pointer deltas respect application zoom.
- Removed both note-chat overlay and temporary note-list drawer. Chat is always
  the fourth grid column. At insufficient width left panels temporarily compress
  or collapse, without overwriting their preferences. The approved minimum is
  ribbon820*zoom+rail74+right-chat300 logical pixels;160% requires1686.
- Native minimum updates still defer managed Maximized/Fullscreen changes; they
  never force those windows back to normal. Unsupported screens receive an honest
  width requirement, not a claimed successful layout.
- The31 toolbar controls now have fixed24-CSS-pixel tracks, a30-pixel Font control
  and fixed dividers. Extra editor width no longer redistributes every icon.
  Existing240ms navigation/panel motion and reduced-motion behavior were retained.
- Chat stays mounted after its first opening, preserving history, requests and
  draft across close/open and resize without preloading it before first use.
- Tag tints changed slightly: light background white mix88%->84%, dark base
  mix78%->74%. Text tint35%->30% black/light and65%->60% white/dark, with the
  existing>=4.5:1 contrast correction. Stored colour identities/chip shape remain.

### Intermediate Evidence, Not Final Gates

| Check | Result |
| --- | --- |
| Focused Markdown/editor/security |135/135 PASS |
| Focused layout/export contracts |89/89 PASS |
| Most recent full frontend before final freeze |882/882 PASS |
| Repeat-native corrective browser |22/22 PASS, includes explicitly unsupported physical widths |
| New architecture browser |16/16 PASS |
| Browser drag |All three splitters,100/160%,both themes; zero settings/note IPC while held, one settings commit after release; stable31 icon tracks; no editor/chat replacement |
| Native baseline |Old isolated EXE,107 frames over2 Computer Use drags; CPU profile captured; new EXE comparison still pending |
| Build |Intermediate build PASS; editor runtime536.40kB,minifier warning retained, not suppressed |

Evidence is under ignored `releases/qa/architecture-*`. Initial failed runs and
diagnostics are retained separately. One browser run was invalidated by Vite HMR
while code was still changing; it was rerun with source frozen. A fixture test
also exposed a missing accessible name on chat-close; the control now has one.

Final gates, new artifact identity and real UI-to-file/native measurements follow
below only after execution. Old native evidence is not a PASS for the new binary.

### Additional Integrity Findings Closed Before Final Build

The first UI-authored physical export passed its supported-semantic comparison,
but additional repeated-storage tests found real gaps that were not safe to ship:

- Literal `---` could become a divider; an escaped checklist prefix could be
  split by an over-eager custom block tokenizer. Custom inline-date text also
  needed explicit escaping. Prefix handling is now in the AST projection and
  block tokenizers do not interrupt escaped text at arbitrary character offsets.
- Markdown cannot encode whitespace-only/extra nested paragraphs. Dropping them
  also shifted following linear sidecar mark ranges. A Markdown-hash-bound
  structural sidecar restores those paragraphs before applying mark ranges.
- Adjacent independent lists could merge and continue numbering. The writer
  alternates valid CommonMark bullet/delimiter styles for adjacent containers.
  This does not change editor nodes, text, list IDs or user metadata.
- Callout/details adapters joined blocks without paragraph separators. They now
  render explicit block separators through the official helper API.
- Ordinary GFM cells cannot preserve multiple paragraphs, line breaks or edge
  whitespace. Only these nonportable cells receive a bound cell-content sidecar;
  ordinary portable cells are still Markdown-first. The sidecar is ignored if
  authoritative Markdown changes or table-layout restoration does not match.

`tests/markdownCodecIntegrity.test.ts`:25/25 PASS, including three save/reopen
cycles, whitespace before underline, literal extension syntax, separate lists,
complex table cells and stale-sidecar rejection. Existing semantic tests remain.
The full current frontend run is910/910 PASS. No SQLite migration, revision
retention policy, app version or user data was changed.

The first current Rust run was stopped after its loopback HTTP-cancellation
fixture hung in the restricted execution environment. Its log is retained as
`architecture-verified-rust-tests-sandbox-stall.log`; it is not counted as PASS.
The same unmodified suite rerun with loopback access completed291 PASS/11 ignored
in26.97s. Remaining gates and native evidence are recorded below after completion.

### Native Findings And UI-To-File Evidence

On Windows WebView2, isolated profile `com.noteflow.qa.repeatnative`, actual
OS DPI125%, app zoom100%, native client1440x844:

- `architecture-verified-7dd6508f336d` restored the UI-authored source note with
  its original contentVersion60. No programmatic `setContent`/JSON/Markdown
  injection was used to author it. Its headings were made via real toolbar/
  shortcuts; actual selected phrases were formatted with Bold/Italic/Strike.
- Source contains H1-H6, partial bold, italic, bold+italic, strike, nested bullet
  list, ordered list, checked task, quote, multiline code, external link, inline
  code and a3x3 table. `lists.json` retains105 trusted authoring events, including
  the Bold toolbar action, bound to the same synthetic note ID.
- Actual note menu -> Export -> Markdown -> Windows Save dialog created
  `releases/qa/architecture-ui-export-verified.md`. It was not written manually.
 1087 bytes; SHA256 `e1a94619f5e71090449d10744afac2419c98635142a5480682003e8ceb8aacff`.
  Independent Marked rendering and structural comparison confirm the specific
  marks, blocks and readable GFM table, without ordinary formatting HTML.
- Actual New Note -> Import Markdown -> Windows Open dialog -> Import inserted
  that exact physical file into `QA Import 7dd6`. Supported semantics match the
  source/file. Native Undo emptied the import; Redo restored all supported nodes
  and marks. Its own autosave progressed1->3 for these real edits.
- Native chat opened as a real right column, not an overlay. A question was sent
  through UI to the existing synthetic localhost provider on127.0.0.1:19999;
  response appeared. No real model/credentials or external cloud was used.
  Close/reopen retained both messages and the unsent draft. Resize/chat operations
  did not change the note's contentVersion.
- Three actual Computer Use drags produced139 observed rAF frames. All31 controls
  remained connected; height drift0, relative icon drift0, toolbar overflow0,
  observed long tasks0. Baseline:107 frames,2 drags, relative drift133.925px.
  Frame interval after p50=6.9ms,p95=15.3ms,max=73.7ms versus baseline6.9/10.6/32.8ms.
  These are not proof of better frame-time latency: drag types/idle gaps differ.
  The demonstrated fix is stable geometry and no control remount/redistribution.
  CPU profiles and raw frame JSON are retained under ignored `releases/qa/`.
- Native right splitter hit-testing initially missed the inner visible edge;
  dragging its observed hit area succeeded,300->380px. The current wrapper clips
  the outer half of the splitter's8px box. This is a remaining ergonomics limit,
  not evidence that the first unsuccessful drag resized anything.
- Crucially, native close/reopen exposed a further solver defect: after hiding
  the note list it retained a needlessly compressed300px chat, despite sufficient
  room for the saved380px. The compact solver now recalculates recovered space
  from unchanged preferences. Two new pure tests pass; full frontend912/912.
  The final rebuilt EXE and native retest must be recorded separately below.

Native screenshots: `architecture-native-evidence/native-right-chat-draft.jpg`
and `native-import-code-table.jpg`. Read-only editor/SQLite snapshots and semantic
comparison results are in the same folder. Tauri freezes `invoke` as non-writable,
non-configurable; a direct native IPC payload tap was not available and was not
bypassed. Physical file equality, stored versions, actual UI actions and separate
service-level tests provide the evidence instead. Temporary observers are QA-only
in memory and disappear at process exit; no production document logging was added.

The separate VS Code QA profile opened the actual file, but displayed first-run
sign-in onboarding. The user was asked to choose Continue without Signing In;
that dialog was not automated. VS Code Copy -> explicit Markdown Paste remains
PENDING until the actual external-editor interaction can be completed.

### Physical Layout Contract

User-approved policy: right-only chat, never an overlay/bottom pane. Panel widths
are logical desktop pixels; toolbar minimum is820 CSS pixels multiplied by app
zoom. OS DPI is accounted for by the native monitor/window APIs, not multiplied a
second time into stored preferences.

| App zoom | Compact notes:rail+ribbon | Compact right chat:rail+ribbon+chat | Four panels:expanded navigation+list+editor+chat |
| --- | --- | --- | --- |
|100% |900 app minimum |1194 |1570 |
|125% |1099 |1399 |1775 |
|150% |1304 |1604 |1980 |
|160% |1386 |1686 |2062 |

At compact widths the note list temporarily closes; selecting All Notes restores
list space by closing chat, not opening a drawer. Preferences/drafts are retained.
Native WebView zoom scales pointer client coordinates; CSS zoom fallback does
not. The controller explicitly distinguishes the two. Browser tests now assert
that a70-pixel pointer movement changes each panel by70 pixels at both zooms.

The header chat action is a true toggle. A typed request generation invalidates
pending native-width preparation after a close/navigation/focus command. Closing
does not cancel background generation or discard drafts. Managed native windows
are never forced back to normal by width preparation.

### References And Limits

- [TipTap Markdown](https://tiptap.dev/docs/editor/markdown),
  [Editor API](https://tiptap.dev/docs/editor/markdown/api/editor),
  [Custom serialization](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-serializing),
  [Custom parsing](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-parsing).
- [Primer label accessibility](https://primer.style/product/components/label/accessibility/)
  and [colour utilities](https://primer.style/product/css-utilities/colors/): semantic
  text remains visible, colour is not the only identifier, contrast is verified.
- [Notion content styling](https://www.notion.com/help/customize-and-style-your-content)
  is a visual reference for restrained text/background distinction, not an exact
  palette copied into NoteFlow.

The official Markdown package brings a nested Marked17 dependency alongside the
existing Marked18. The central codec injects the existing private Marked18 lexer;
no unsupported package override or family-wide upgrade was introduced. The
dependency test now correctly distinguishes TipTap packages from their transitive
non-TipTap packages; exact versions, no nested TipTap, MIT and security checks
remain enforced. The editor runtime grew from473881 to536400 bytes before gzip;
the Vite size warning is retained and must be weighed against measured loading.

No native Mac is available. Browser geometry is not proof of Windows OS-DPI
changes, Maximized/Fullscreen behavior or macOS clipboard/window behavior. Native
evidence below must name the actual binary, app zoom, DPI and available window.

## Final Verification:2026-11-03

### Current Automated Gates

| Gate | Current result |
| --- | --- |
| npm run typecheck | PASS |
| npm run test |912/912 PASS,76 suites,110.52s |
| npm run build | PASS; existing editor-runtime size warning retained |
| cargo fmt --check | PASS |
| cargo check | PASS |
| cargo test |291 PASS,11 ignored,24.07s |
| cargo clippy --all-targets --all-features -- -D warnings | PASS |
| npm audit --omit=dev --offline=false |0 vulnerabilities |
| npm run tauri build | PASS,NSIS plus en-US/ru-RU MSI in target/release/bundle |
| git diff --check | PASS; existing LF/CRLF conversion advisories are not whitespace errors |
| Complete maintained browser regression |1915/1915 PASS,17 runners |
| Architecture browser geometry |18/18 PASS,including compact chat380px close/reopen in both themes |
| Fresh loading benchmark |3 independent series,126 samples,identical10000-note DTO |
| Isolated FTS benchmark |1/1 PASS,indexing13.1003s,query29.0327ms |

Final gate logs use `releases/qa/architecture-validated-*`. The first run after
the last width fix failed two timing assertions: cosine scan100000 candidates
exceeded5s and curl cancellation exceeded2s;289 passed,2 failed,11 ignored,
131.81s. The log is preserved as
`architecture-validated-rust-tests-first-timing-failure.log`. Closing only the
separate QA VS Code processes and rerunning the same unchanged full suite without
UI activity passed291/11 in24.07s. Do not hide the observed timing sensitivity or
claim that thresholds were relaxed; no Rust code/test changed in this task.

### Final QA Artifact

- EXE:`D:\Projects\NoteFlow\releases\qa\NoteFlow-QA-Markdown-Architecture-Validated.exe`
- Build ID:`architecture-validated-639e89681c95`.
- Working-source fingerprint:
  `639e89681c952d6066367ae8df0e39a8516f22ff8ae3f32bb8ea56e51a2b8635`.
- SHA256:`1DB7997AEF0A407F3F41C29381B92D80A663FE95A81C32E76EFDE7C52F3875BF`.
- Size21349888 bytes; built2026-11-03T07:37:37.6462716Z,10:37MSK.
- Manifest350 enumerated source/test/config files all match current disk contents.
  This identifies the working copy, not a claim of fully reproducible builds.
- Separate QA identifier/profile:`com.noteflow.qa.repeatnative`.
- Canonical product remainsNoteFlow/com.noteflow.desktop; version1.0.0-rc.6.
- Published RC5 historical artifacts12 checksums and RC6 staged artifacts4
  checksums match their preserved values. Nothing was published or restaged.

### Final Native Status

The final EXE reopened `QA Import 7dd6` after a real process restart. Read-only
WebView/SQLite diagnostics confirmed contentVersion3 and exact supported
semantic equivalence with the physical exported file. The document did not
rewrite itself on load. Earlier actual formatting/export/import/Undo/Redo/chat
proof belongs to build7dd6508f336d; only the compact-width solver and its tests
changed afterward. These artifact identities are deliberately not conflated.

Computer Use approval for the new `Validated.exe` timed out. Therefore the final
visual retest of the380px close/reopen correction, fullscreen/maximized behavior,
native slow drag and additional DPI/theme/zoom combinations is **PENDING USER
SMOKE**, not NATIVE VERIFIED. The last QA process was closed before isolated
browser/performance runs. No real user profile, credentials or notes were touched.

Known limits:

- Current monitor1920x1080 at OS DPI125% provides only1536 logical pixels.
  Right chat at app160% requires1686 logical pixels under the user's approved
  right-only/full-ribbon policy; all four panes require2062. Do not claim that
  this hardware supports that geometry. Browser large-viewport tests are separate.
- Mac native QA and Windows OS-DPI100/150 are PENDING, not inferred from CSS zoom.
- VS Code copy/paste is PENDING first-run user handoff. No Telegram integration
  was added; ordinary Markdown text is not promised as rich-text Telegram paste.
- Extra blank paragraphs/complex table layout/colours/underline are sidecar and
  backup data, not a promise of lossless stand-alone CommonMark appearance.
- The active writer is unified; the explicitly isolated legacy reader remains
  necessary for older HTML/`==` exports and old notes without the codec marker.

### Tag Palette Verification

The stored palette is unchanged. Only the common derived chip tint changed; no
per-page override, duplicate green identity or colour migration was introduced.
All10 palette entries pass4.5:1 in both themes. Minimum actual ratio:light5.0458,
dark7.1389. Full foreground/background/contrast data is in
`releases/qa/architecture-palette.json`.

| Identity | Stored colour | Light chip background/text | Dark chip background/text |
| --- | --- | --- | --- |
| blue |#2563EB |#DCE6FC/#1A45A5 |#1C2E57/#A8C1F7 |
| sky |#0095DD |#D6EEFA/#00689B |#133B53/#99D5F1 |
| teal |#009688 |#D6EEEC/#00695F |#133C3D/#99D5CF |
| green |#16A34A |#DAF0E2/#0F7234 |#183F2D/#A2DAB7 |
| red |#E53935 |#FBDFDF/#A02825 |#4E2428/#F5B0AE |
| amber |#B77900 |#F3EAD6/#805500 |#42341A/#E2C999 |
| orange |#EA580C |#FCE4D8/#A43E08 |#4F2C1D/#F7BC9E |
| rose |#EC4899 |#FCE2EF/#A5326B |#502742/#F7B6D6 |
| violet |#7C3AED |#EADFFC/#5729A6 |#332458/#CBB0F8 |
| slate |#B520C9 |#F3DBF6/#7F168D |#421D4E/#E1A6E9 |

Colour correctness is AUTOMATED PASS; a complete final native light/dark tag
editing/restart matrix remains part of USER SMOKE, not inferred from this table.

### Changed Areas And Preservation

Task-specific implementation areas:

- `package.json`, `package-lock.json`:matching official Markdown dependency.
- `src/features/editor/markdownCodec.ts`, `markdownService.ts`,
  `editorContentSerializer.ts`, `EditorArea.tsx`:one codec, explicit legacy reader,
  compatible sidecar policy, bound nonportable structure, official editor API.
- `src/shared/useWorkspacePanelResize.ts`, `ResizeHandle.tsx`,
  `editorWorkspaceWidth.ts`, `useEditorWindowMinimum.ts`, `SidebarPanel.tsx`,
  `src/app/AppShell.tsx`, `src/features/navigation/PageShell.tsx`,
  `src/features/note-chat/NoteChatPanel.tsx`:single resize owner, docked chat,
  preserved component/draft state and compact-width preparation.
- Shared editor/page/foundation CSS:fixed ribbon tracks, no chat/list overlay,
  no width transition during pointer drag; existing240ms/reduced-motion retained.
- `src/features/tags/tagPalette.ts`:shared derived tints only.
- Targeted codec/integrity/real-editor/panel tests and the architecture browser
  runner. Existing contract expectations were updated where the old active
  handwritten writer/HTML representation was intentionally removed. Semantics,
  worker cancellation/security budgets, exact dependency checks remain tested.

The final build manifest differs from the native-tested7dd6508f336d manifest in
exactly three files:`editorWorkspaceWidth.ts`, its pure regression test, and the
architecture geometry runner. Markdown, export, clipboard, storage and tag code
are identical between these two builds. This bounds reuse of earlier native
evidence; it is not a substitute for the missing final width-reopen visual test.

Rust modifications listed by Git belong to the pre-existing worktree; this task
did not change Rust production code, migrations, CAS semantics, revisions,
attachment ownership, secure credentials or release version. Existing untracked
source/tests/QA files were retained. Git remains67 modified/67 untracked/0 staged,
branch`codex/post-rc6-markdown-performance`, HEAD`42cdf9cca1371eac49c5645f6f82036d63b65b50`.
No add/commit/tag/push/merge/release was performed.

### Fresh Performance Results

The maintained17 browser runners passed without source changes/HMR during the
run. The additional18 architecture cases assert all three splitters,100/160%,
both themes, stable31 tracks, one preference commit after pointer release, no
note save/history reload while dragging, preserved draft/editor identity,
rapid toggles and restored380px compact chat width. Total1933 browser cases PASS.
Current results are isolated under`releases/qa/architecture-validated-browser/`;
previous result folders and failed logs were not deleted or reused as fresh PASS.

Loading:`releases/qa/loading-validation-architecture-validated/results.json`.
Three series,30 process-cold+30 warm samples per side,6 additional warmups
excluded. The before/after payload is exactly4148736 bytes and10000 metadata
rows; SHA256`f9d39606bc4b3723e8d1b0f902de16eb8129a9eb8e01e25c9e7522c666a7239a`.

| Browser DOM usable | Before p50/p95/max,ms | After p50/p95/max,ms |
| --- | --- | --- |
| Process-cold |408.2/463.0/480.9 |411.7/484.9/549.5 |
| Warm |205.7/263.2/272.2 |203.7/246.5/270.6 |

Cold p95 is4.7% slower in this run; warm p95 is6.3% lower. Do not call this a
universal speedup. The editor runtime grows about62.5kB uncompressed, and the
Vite>500kB warning remains. These measurements show a modest cold-load cost, not
an observed large slowdown, but they are not native key-to-paint measurements.
Metadata IPC is mocked, OS disk cache is not flushed, and the timestamp is DOM
usable rather than physical paint. No native app, VS Code QA, Rust build or
concurrent benchmark ran during these loading/FTS measurements.

The existing isolated FTS benchmark was run separately on a temporary test DB:
`cargo test search_performance_on_ten_thousand_notes -- --ignored --nocapture`.
1 PASS,13.17s; database setup16.4335ms,schema3.799ms,fixture9.0673ms,
indexing13.1002992s,query29.0327ms. This is additional to the291-pass main suite,
not a claim that all11 ignored/manual tests were executed.

### Remaining Native Checklist

- **PENDING USER SMOKE:**approve Computer Use for the final Validated EXE;
  visually confirm380px chat survives close/reopen/restart at a supported width.
- **NATIVE VERIFIED on7dd6508f336d:**real UI-authored formatting,physical export,
  import,Undo/Redo,local QA chat response,history/draft preservation,and fast
  drags of all three splitters. Exact artifact identity and raw evidence above.
- **AUTOMATED PASS:**new compact-width solver correction,slow stepped browser
  drags,100/160% themes,all31 controls,no page overflow on supported layouts.
- **PENDING USER SMOKE:**slow continuous native drag,in-flight generation while
  an actually captured splitter is moving,Maximized/Fullscreen preservation,
  final light/dark tag editing/restart matrix and additional native DPI values.
- **NOT VALIDATED:**VS Code Copy -> explicit Markdown Paste. First-run sign-in
  onboarding requires user handoff; no authentication/security UI was automated.
- **MACOS NATIVE PENDING:**clipboard,window constraints,zoom/pointer coordinates
  and native export/import. Windows/browser tests are not cross-platform release
  acceptance.

The final EXE is prepared and every available automated gate is green. The full
requested native acceptance is not complete because the final application access
approval timed out and the external-editor handoff was unavailable. Therefore
the overall task is **NEEDS MORE WORK / PENDING USER SMOKE**, not a claim that all
native scenarios have passed. No further production change is justified by a
merely unobserved scenario; resume with the pending native checks on this exact
fingerprinted binary. No commit,tag,push,version bump or release was performed.

After automated verification the owned QA native/VS Code processes,dev/preview
sessions and synthetic localhost provider were stopped. The existing QA profile
and all proof files remain for continuation. The local fixture must be restarted
for another synthetic message test (`node scripts/qa/phase-b-provider.mjs`); it
is not an actual AI model and must not be presented as Bridge/Ollama validation.
