# Compact Modals And Stronger Tag Tints

## Baseline And Scope

Branch `codex/post-rc6-markdown-performance`,HEAD
`42cdf9cca1371eac49c5645f6f82036d63b65b50`,version1.0.0-rc.6.
Initial tree71 modified,72 untracked,0 staged. Existing uncommitted work and
historical QA artifacts are preserved. No version bump,commit,tag,push or release.
This is a visual corrective pass,not a validation/persistence redesign.

## Root Cause And Fix

The shared EntityNameCounter rendered two vertical rows:18 px count +36 px
minimum error space,including an invisible nonbreaking-space placeholder.
That54 px block existed even with no error. TagEditorModal additionally placed
the counter between two20 px form-grid gaps.

The shared component now uses one18 px grid row:count and error beside each other.
No placeholder text or separate error-height reservation. The counter uses tabular
digits and the existing11 px typography; errors inherit that compact line height.
Long text wraps in the remaining minmax(0,1fr) column,without clipping or overlap.
It may use the actual additional lines needed; arbitrary unbounded error text is
not forced into a one-line fixed-height box or hidden to fake stability.

Tag name,input and feedback now share a single field group. An explicit label/for
association preserves the accessible input name instead of including counter/error
text in its label. Existing validation messages,limits,legacy-name exceptions,
busy/disabled states,submission and focus behavior are unchanged. ModalShell,
input/button heights and modal animations are untouched.

All existing consumers use the same component:NewNoteModal,project create/edit,
editor's create-project flow,inline note title and Markdown import title fields.
No competing validation UI component or global button/layout reset was added.

## Measured Before/After

Fresh previous-production-fixture versus current-code comparison at1440x900,
100%,light. Same data,viewport and actual form actions:

| Form | Before height | After height | Count/error block | Gap to next field |
| --- | --- | --- | --- | --- |
| New note |481.03 px |445.03 px |54 ->18 px |16 px |
| New project |481.03 px |445.03 px |54 ->18 px |16 px |
| Edit project |481.03 px |445.03 px |54 ->18 px |16 px |
| New tag |469.66 px |420.66 px |54 ->18 px |20 px |
| Edit tag |469.66 px |420.66 px |54 ->18 px |20 px |

40 current geometry cases cover five forms,1100/1440 widths,100/160%,light/dark.
Empty,valid,25/26 graphemes,error-clear and actual duplicate-name paths are checked.
Standard validation preserves modal/header/input/footer position and height within
0.5 px. Tag duplicates are tested for create/edit;project-create duplicate uses
the real frontend submit check. Notes keep the existing nonunique-title policy.
A separate CSS-only long-message stress test verifies natural wrapping and no
overlap/overflow;it is not misrepresented as a real backend-generated message.

Evidence:`releases/qa/compact-forms/{before,after}/results.json` and matching
screenshots. The before set is freshly rendered from the previous production
fixture,not a historical PASS reused for current code.

## Tag Colors

One shared helper changes the light white mix80% ->76%,dark surface mix70% ->66%.
Foreground black mix30% ->24% and white mix60% ->54% make the text more chromatic;
the contrast guard still darkens/lightens it as needed for readability.
The exact baseline/current values are recorded in the color JSON evidence.
Palette HEX/IDs,brand blue#3B82F6,custom-color identity,chip geometry/padding/radii
and note/tag relations remain unchanged. The existing>=4.5:1 correction still
protects all palette and arbitrary custom colors.

## Current Gates

Targeted behavior20/20 PASS,typecheck PASS. Full frontend975/975 PASS,0 skipped.
Fresh before/after geometry40+40 PASS;baseline cases are not counted as new-code
regression coverage. Full browser/build/native results must be appended below.

## Final Build And Gates

QA EXE:
`D:/Projects/NoteFlow/releases/qa/NoteFlow-QA-Compact-Forms-Tags.exe`

- Build ID:`compact-forms-tags-89f6b3d16f05`.
- Working-copy fingerprint:
  `89f6b3d16f059404245b29a7e3a5b30bd4f29c71489574dfe3c706936e680e4d`.
- SHA256:`F404D7F8A83BE2FF224456204DEACAD17DD48F0794C32684A4E5751CC536398B`.
- Built2026-11-03T17:59:20.5721169Z;21,361,664 bytes.
- All354 manifest inputs match current files. Canonical version locations remain
 1.0.0-rc.6;productName=NoteFlow,identifier=com.noteflow.desktop. The separate
  native synthetic profile is com.noteflow.qa.repeatnative.

| Check | Fresh result | Evidence under releases/qa |
| --- | --- | --- |
| npm run typecheck |PASS |compact-forms-tags-typecheck.log |
| npm run test |975/975 PASS,0 skipped,41.562 s |compact-forms-tags-tests.log |
| npm run build |PASS |compact-forms-tags-build.log |
| cargo fmt --check |PASS |compact-forms-tags-fmt.log |
| cargo check |PASS |compact-forms-tags-check.log |
| cargo test |292 passed,11 ignored,0 failed,29.83 s |compact-forms-tags-rust-tests.log |
| cargo clippy --all-targets --all-features -- -D warnings |PASS |compact-forms-tags-clippy.log |
| npm audit --omit=dev --offline=false |0 production vulnerabilities |compact-forms-tags-audit.log |
| Full17 browser runners |1915 PASS |compact-forms-browser/counts.json |
| Toolbar/sidebar/right-chat/focus matrix |54 PASS |compact-forms-toolbar.log |
| New compact-form geometry matrix |40 PASS |compact-forms-after.log |
| Palette hover/selected matrix |4 PASS |compact-palette-states.json |
| Total new-code browser/geometry cases |2013 PASS |No baseline/targeted-test double counting |
| Separate QA build |PASS |compact-forms-tags-qa-exe.log |
| npm run tauri build |PASS |compact-forms-tags-tauri.log |
| Source/EXE/version fingerprint |PASS,354 matching inputs |compact-forms-tags-check.json |
| git diff --check |PASS |Final command;only existing LF/CRLF advisories |

The four palette-state cases cover every one of10 chips on hover and all10 swatch
selections in light/dark at100/160%. Chip padding,typography,radius and height do
not change on hover. Existing selected-card/contrast checks also pass. Minimum
palette text contrast is4.677:1 light and5.881:1 dark. Blue stays#3B82F6;light
chip background changesrgb(216,230,253) ->rgb(208,225,253),dark
rgb(35,59,98) ->rgb(37,63,107). Chip radius stays6 px.

The existing Vite editor-runtime>500 kB warning remains;it was not disabled or
treated as a vulnerability. Rust source was not changed by this visual task,
but all Rust checks were rerun rather than reusing a previous PASS.

## Windows Native Verification

WINDOWS NATIVE VERIFIED on the new EXE,1440x844 logical client,OS DPR1.25,100% app
zoom. Computer Use initially timed out on the new app permission request,then
recovered;only successfully opened native states are counted.

- New note,dark:empty ->26-character error ->valid name. Modal/header/first input/
  footer coordinates and heights are exactly unchanged,maxShift0 px. Input stays
 42 px high,counter/error18 px. Creation was cancelled;no note was written.
- New tag,dark:empty ->existing synthetic name `Синий QA Final`. The actual
  duplicate validation appears in the shared row,creation stays disabled,and
  maxShift is0 px. Cancelled;no tag or relation was added/changed.
- New project,light:empty ->26-character limit error. First input,description,
  header/footer and modal remain in place,maxShift0 px. Cancelled;no project was
  written. Project/tag edit modes and other dimensions have BROWSER PASS coverage,
  not a false claim of additional native edit operations.
- The light editor chip was opened/inspected after returning from the forms.
  Dark forms and the updated selected color palette were also visually opened.
  The complete10-color before/after comparison is browser-rendered evidence,not
  misrepresented as10 new persisted native tags.
- Native evidence is under `releases/qa/compact-forms/native`;numeric comparison
  `releases/qa/compact-forms-native-validation.json` confirms all three0 px results.
- No existing real user data,keys or models were used. Only ordinary QA visual
  preferences changed;all test forms were cancelled. Native QA app and the task's
  dev/preview servers were closed gracefully after verification.

Physical Windows DPI100/150%,macOS native and arbitrary backend error texts are
NOT VALIDATED in native UI. Long-message layout is explicitly a CSS stress test:
it wraps without clipping and grows only by the text's needed lines. We do not
claim that unlimited error text preserves an identical fixed modal height;that
would require the large blank reservation or clipping this task removes.

## Screenshots

Matched browser comparison,new-note empty:

![Before](D:/Projects/NoteFlow/releases/qa/compact-forms/before/note-create-empty.png)

![After](D:/Projects/NoteFlow/releases/qa/compact-forms/after/note-create-empty.png)

Actual Windows note limit error,dark:

![Native note error](D:/Projects/NoteFlow/releases/qa/compact-forms/native/note-error-dark.png)

Actual Windows tag duplicate error,dark:

![Native tag duplicate](D:/Projects/NoteFlow/releases/qa/compact-forms/native/tag-duplicate-dark.png)

Actual Windows project error,light:

![Native project error](D:/Projects/NoteFlow/releases/qa/compact-forms/native/project-error-light.png)

Updated complete palette,light/dark(browser):

![Light palette](D:/Projects/NoteFlow/releases/qa/compact-forms/after/palette-light.png)

![Dark palette](D:/Projects/NoteFlow/releases/qa/compact-forms/after/palette-dark.png)

Native light editor chip:

![Native chip](D:/Projects/NoteFlow/releases/qa/compact-forms/native/palette-editor-light.png)

## Files And Release Control

Production edits are limited to EntityNameCounter.tsx,TagEditorModal.tsx,
tagPalette.ts and editor.css. Added one shared-row behavioral test to the existing
tagValidationRegression.test.ts and a new scripts/qa/compact-form-regression.mjs.
This report is new;historical reports/QA files are preserved.

No Markdown codec,export handler,toolbar,sidebar controller,chat logic,SQLite,
API model or persisted date/color identity was changed in this pass.
Historical12 RC5 and4 staged RC6 artifact hashes still match. Version/HEAD/branch
unchanged;71 modified,74 untracked,0 staged. No git add/commit/tag/push/merge/release.

**READY FOR USER SMOKE.** New visual approval is still the user's decision;this
does not publish or accept a Stable release.
