# Final Toolbar, Markdown Export UI And Tag Palette

## Scope And Baseline

Branch `codex/post-rc6-markdown-performance`, HEAD
`42cdf9cca1371eac49c5645f6f82036d63b65b50`, version `1.0.0-rc.6`.
Initial working tree72 modified,71 untracked,0 staged. Historical QA files and
the previous extended-Markdown report are preserved. No commit/tag/push/release
or version change is authorized. This follow-up supersedes the previous two-option
export UI requirement, not the codec's syntax or internal storage contract.

## Three Changes And Confirmed Causes

1. **AI alignment.** The AI button had no special auto margin. The problem was
   `space-between` distributing free space around separators as if they were full
   toolbar items. A separate final group amplified the visual gap, especially in
   focus mode. Existing31 tool slots now distribute width continuously; each
   fixed24 px target is centered in its cell (font target30 px with proportional
   cell weight1.25). Separators occupy cell boundaries without extra free-space
   tracks. AI follows the same center-to-center rhythm as Clear/Fragment and
   mirrors Undo's outer inset. No width observer, density switch, transforms,
   resize-state rewrite, wrapping, hidden actions or smaller targets were added.
2. **One Markdown choice.** The dialog now offers exactly `Markdown (.md)`, TXT,
   DOCX and PDF. Markdown uses the already tested extended official codec so
   underline/color/font/alignment are not silently stripped. No serializer/parser,
   CAS transaction, resource rewriting or Save-dialog logic was replaced.
   The old `md-noteflow` preference safely normalizes to `md` in both frontend and
   backend; it cannot create a fifth radio option or invalid selection.
   The requested single compatibility sentence is a small11 px regular-weight
   secondary-text caption directly under Markdown, associated by aria-describedby.
   There is no warning panel, GFM choice or duplicate Markdown file.
3. **One stronger tint.** Light background white mix changes82% ->80%; dark
   surface mix72% ->70%. Shape, padding, type and palette IDs stay unchanged.
   Blue uses UI brand#3B82F6. Existing recognized blue#2563EB/legacy#3B6EF2 are
   displayed with that same brand identity without mutating stored tags/relations.
   Arbitrary other custom colors remain unchanged. The central helper is reused
   by the tag page, search/cards and editor; no independent CSS palette was added.

## Changed Files

- `src/features/editor/FormattingToolbar.tsx`, `src/styles/editor.css`: cell
  layout, font-cell classification and scoped caption styling; handlers unchanged.
- `src/features/export/NoteExportDialog.tsx`, `exportDocument.ts`, `exportWorker.ts`:
  one public Markdown format; removed redundant UI choice, not codec capability.
- `src/services/noteExportService.ts`, `uiSettingsService.ts`: one service route
  to existing rich codec and compatible preference normalization.
- `src-tauri/src/data.rs`: settings allowlist/legacy normalization tests only;
  note persistence, SQLite schema and Markdown writer untouched.
- `src/features/tags/tagPalette.ts`: shared tint and recognized-blue rendering.
- `tests/phaseEBehavior.test.ts`, `standardMarkdownAcceptance.test.ts`,
  `tagValidationRegression.test.ts`, `userSmokeCorrections.test.ts`: new UI policy,
  legacy preference, full actual saved-sidecar export and color identity tests.
- `scripts/qa/architecture-layout.mjs`, `repeat-native-corrective.mjs`,
  `standard-markdown-acceptance.mjs`: tool-cell motion law/AI rhythm/focus and
  actual UI export/reparse equality. Anti-oscillation, target sizes, editor identity,
  unsaved document, chat draft and settings-write assertions remain.
- `README.md`: correct description of the single rich Markdown export.

## Regression Method

The ordinary CommonMark/GFM codec golden tests remain, even though GFM is no
longer a separate user choice. The public export integration test now compares
the authoritative sidecar-hydrated state and actual physical file using the
single rich route. Its separate toolbar-command test requires underline, color,
font, highlight and alignment to survive import without an editor update.

Browser export checks compare the complete supported UI document/marks to the
schema-validated imported actual export. Only layout-only trailing blank paragraphs
and equivalent text-node segmentation are normalized, not styles or text.
The caption has an independent accessible description and no background panel.

Tool motion assertions use the new proportional cell-center motion law, not an
obsolete separator-track rank. AI's equal neighbor spacing and symmetric outer
inset are separately asserted in ordinary and focus mode, including window resize.
54 architecture cases pass across100/160%,light/dark,DPR1/1.25/1.5;8 export UI
cases pass across1100/1440 width,100/160%,light/dark.

## Current Validation

- Frontend full suite:974/974 PASS,0 skipped,42.476 s.
- Fresh typecheck:PASS.
- Remaining full gates, new artifact/native screenshots and final Git check:
  in progress; final evidence must be appended before handoff.

## Format And Platform Limits

Common constructs use normal Markdown. Nonstandard appearance uses the documented
NoteFlow extensions (`++...++`, typed style/block/table/image directives). External
editors may render those differently. No HTML fallback or Telegram integration.
The file is not a full-profile backup: history, asset ownership and unsupported
complex table cells still require backup/sidecars. Internal storage is unchanged.
macOS native QA and physical Windows DPI variants unavailable on this host remain
NOT VALIDATED. No Stable/release acceptance is inferred from automated checks.

## Final Results

### New QA EXE

`D:/Projects/NoteFlow/releases/qa/NoteFlow-QA-Final-Toolbar-Export-Tags.exe`

- Build ID: `final-toolbar-export-tags-130c65d5d768`.
- Working-copy fingerprint:
  `130c65d5d76834665e77d770581670ec924646620c06164baa4de82a712aac51`.
- SHA256:
  `2789CF9A5BBD2C467AAE75755384B052BC1F356ACDFA6055494DFF17373A9DBF`.
- Built2026-11-03T17:06:34.4139249Z;21,361,664 bytes.
- All353 manifest inputs and the copied EXE hash match the current source.
  Canonical version locations remain1.0.0-rc.6; productName/identifier remain
  NoteFlow/com.noteflow.desktop. QA uses only com.noteflow.qa.repeatnative.

### Fresh Gates

| Check | Result | Evidence under releases/qa |
| --- | --- | --- |
| npm run typecheck | AUTOMATED PASS | final-toolbar-export-tags-typecheck.log |
| npm run test |974/974 PASS,0 skipped,42.476 s | final-toolbar-export-tags-tests.log |
| npm run build | AUTOMATED PASS | final-toolbar-export-tags-build.log |
| cargo fmt --check | AUTOMATED PASS | final-toolbar-export-tags-fmt.log |
| cargo check | AUTOMATED PASS | final-toolbar-export-tags-check.log |
| cargo test |292 passed,11 ignored,0 failed,27.72 s | final-toolbar-export-tags-rust-tests.log |
| cargo clippy --all-targets --all-features -- -D warnings | AUTOMATED PASS | final-toolbar-export-tags-clippy.log |
| npm audit --omit=dev --offline=false |0 production vulnerabilities | final-toolbar-export-tags-audit.log |
| All17 existing browser runners |1915 PASS,all exit0 | final-polish-browser/counts.json |
| Extended toolbar/focus architecture matrix |54 PASS | final-polish-layout.log |
| Combined browser/geometry |1969 PASS | The two preceding fresh runs |
| Separate QA Tauri build | AUTOMATED PASS | final-toolbar-export-tags-qa-exe.log |
| npm run tauri build | AUTOMATED PASS,NSIS + en-US/ru-RU MSI | final-toolbar-export-tags-tauri.log |
| Separate clean FTS benchmark |10,000 notes,indexing14.959736 s,query28.0732 ms,PASS | final-polish-fts.log |
| Source/version/EXE verification |353 matching inputs,PASS | final-toolbar-export-tags-check.json |
| git diff --check |PASS,only existing LF/CRLF advisories | Final command and build gate |

The1969 total does not double-count the initial standalone8-case export run;
those8 are already part of the17-runner suite. The comparison baseline was
973 frontend and1965 browser cases; the extra cases cover legacy preference,
recognized-blue identity and focus/AI rhythm. One duplicate Markdown-format
cancellation case was removed because there is no second user format anymore.
The ordinary GFM codec matrix was not removed or weakened.

The existing Vite editor-runtime chunk warning remains536.45 kB before gzip.
It was not hidden, and code splitting is outside this corrective task.
The FTS timing was measured after closing native QA, browser runners and the
task's dev/preview servers, not concurrently with compilation.

### Windows Native Verified

Computer Use initially timed out on the new EXE permission request, then recovered.
The results below are from the actual new fingerprinted Windows WebView2 process,
not from headless browser screenshots. Host client1440x844 logical px,OS DPR1.25.

- Ordinary and focus toolbar:31 tools visible,AI follows the same cell-center
  spacing as its two neighbors and has the same outer inset as Undo. Entering and
  leaving focus preserves the complete document hash.
- Actual native pointer drags: main sidebar,note list,right chat.148 rAF frames,
  three drags,maximum position error0.094988 CSS px against the continuous motion
  law. Target widths and ribbon height stay fixed; no toolbar/root horizontal
  overflow. Frame evidence: `final-polish-native/frames.json`.
- Native export modal: exactly Markdown/TXT/DOCX/PDF,one Markdown choice,requested
  compatibility sentence at11 px. No separate GFM/NoteFlow mode or warning panel.
- Actual UI -> Windows Save dialog -> physical
  `D:/Projects/NoteFlow/releases/qa/final-polish-native-export.md`.
  Size1452 bytes,SHA256
  `4088EB87078886E24A56AFA6F7FC3C6A03FB90439CEECBEA23D44A1F596E95F9`.
  This is byte-identical to the previously verified rich export,including underline,
  exact partial marks,Georgia20,color#315F97,center alignment and table metadata.
  It was produced through the single Markdown radio,not a programmatic file fixture.
- A new synthetic blue tag was created through the real UI and assigned only to
  `QA Extended Import14`. Tag page,selected picker and editor/card chips were
  inspected in light/dark. Existing red QA tag remains readable/distinct. All
  ten palette colors have automatic contrast coverage: minimum4.833:1 light,
  6.845:1 dark. Palette/token identities and chip shape remain consistent.
- The same EXE was closed via system X and restarted. Blue tag/theme/panel widths
  persist; document hash is unchanged. Read-only SQLite assertion confirms
  `QA Extended Import14.content_version=1`,including after export/focus/resize
  and restart. Evidence: `final-polish-cas.json` and native stage JSON.
- Real user notes,profiles,keys and credentials were not used. Only the synthetic
  QA tag/relation was added; historical QA files/data are preserved. No AI request
  or privacy-consent automation was performed in this pass.
- Native app was closed gracefully and the task's dev/preview servers stopped.
  Physical DPI100/150% and macOS remain NOT VALIDATED; browser DPR1/1.25/1.5 and
 100/160% tests are not mislabeled as native OS-DPI results.

### Native Screenshots

Ordinary toolbar:

![Ordinary toolbar](D:/Projects/NoteFlow/releases/qa/final-polish-native/toolbar-normal.png)

Focus toolbar:

![Focus toolbar](D:/Projects/NoteFlow/releases/qa/final-polish-native/toolbar-focus.png)

Single Markdown export modal:

![Export modal](D:/Projects/NoteFlow/releases/qa/final-polish-native/export-modal.png)

Tags page,light:

![Tags page](D:/Projects/NoteFlow/releases/qa/final-polish-native/tags-page-light.png)

Editor chip,light:

![Editor chip](D:/Projects/NoteFlow/releases/qa/final-polish-native/tags-editor-light.png)

Tags page,dark:

![Dark tags page](D:/Projects/NoteFlow/releases/qa/final-polish-native/tags-page-dark.png)

Editor chip,dark:

![Dark editor chip](D:/Projects/NoteFlow/releases/qa/final-polish-native/tags-editor-dark.png)

## Final Git Status And Handoff

Branch/HEAD unchanged.71 modified,72 untracked,0 staged. The count includes the
large pre-existing uncommitted stage. Removing the redundant export-format type
returns exportWorker.ts to its committed single-Markdown type,so that file no
longer appears modified; no unrelated work was reverted. New untracked report:
`docs/tasks/final-toolbar-export-tags.md`.

Version remains1.0.0-rc.6. No git add,commit,tag,push,merge or release.
Historical12 RC5 artifact hashes and4 published/staged RC6 hashes still match.
The new QA EXE is Git-ignored; no installer was copied over published staging.

**READY FOR USER SMOKE.** The three corrections are implemented and freshly
verified. This is not approval to publish or close the phase without user smoke.
