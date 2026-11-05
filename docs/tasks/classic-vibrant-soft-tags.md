# Classic Vibrant Soft Tag Palette

## Scope And Release Control

Branch `codex/post-rc6-markdown-performance`, HEAD
`42cdf9cca1371eac49c5645f6f82036d63b65b50`, version `1.0.0-rc.6`.
Initial worktree: 71 modified, 74 untracked, 0 staged. Existing uncommitted work
and historical QA files are preserved. No version bump, staging, commit, tag,
push, merge or release is authorized by this task.

Only tag color presentation and its compatibility handling change. Chip sizes,
radii, padding, fonts and placement are unchanged. Markdown, autosave/CAS,
sidebar/toolbar layout, search, chat and database schema are not redesigned.

## Exact Approved Palette And Contrast

The previous helper generated blended tints from a single HEX. That cannot
represent the newly approved exact background/foreground pairs. Recognized
palette colors now use explicit pairs from one central definition. Dark pairs
are also explicit, not independent CSS palettes for different screens.

WCAG contrast uses linearized sRGB relative luminance and `(L1+.05)/(L2+.05)`.
AA for the existing small text requires at least 4.5:1. Four exact light pairs
do not meet that threshold. The user was informed of the measured conflict and
explicitly requested the original HEX values be retained. These are acknowledged
accessibility limitations, not an AA PASS and not silently corrected colors.

| Family | Light background | Light text | Ratio | AA | Dark background | Dark text | Ratio | AA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Red | #F87171 | #5C1111 | 4.919 | PASS | #5F282C | #FCA5A5 | 6.058 | PASS |
| Orange | #FDBA74 | #71330B | 5.711 | PASS | #5E3B23 | #FED7AA | 7.298 | PASS |
| Yellow | #FDE68A | #71500A | 5.908 | PASS | #51441D | #FDE68A | 7.684 | PASS |
| Lime | #D9F99D | #405E10 | 6.364 | PASS | #3A4C21 | #D9F99D | 8.046 | PASS |
| Green | #86EFAC | #166534 | 5.078 | PASS | #214E35 | #86EFAC | 6.780 | PASS |
| Teal | #5EEAD4 | #115E59 | 5.126 | PASS | #1B4D48 | #5EEAD4 | 6.448 | PASS |
| Blue | #60A5FA | #153E85 | 4.010 | FAIL, retained | #253F68 | #93C5FD | 5.853 | PASS |
| Violet | #A78BFA | #4C1D95 | 4.025 | FAIL, retained | #453266 | #C4B5FD | 5.983 | PASS |
| Fuchsia | #E879F9 | #701A75 | 4.076 | FAIL, retained | #542D5C | #F0ABFC | 6.259 | PASS |
| Pink | #F472B6 | #831843 | 3.643 | FAIL, retained | #592A43 | #F9A8D4 | 6.304 | PASS |

The selectable palette contains exactly ten families. The existing blue default
is retained. The color-picker checkmark uses the same foreground/background pair
instead of white on the new light swatches. Focus/selected outlines remain intact.

## Compatibility And Persistence

The database stores the existing five-value `color` family plus optional
`customColor` HEX, not the palette item's UI ID. No migration or tag relation
rewrite is needed or performed.

Explicit historical HEX aliases resolve to the corresponding new family:
blue/sky -> blue; teal -> teal; green -> green; lime -> lime; red -> red;
amber -> yellow; orange -> orange; rose -> pink; violet -> violet;
previous purple/fuchsia -> fuchsia. Blue and sky share the new blue because the
approved palette has no separate sky family. Matching uses exact historical HEX,
not array index or only the broad stored family, which would conflate green/teal.

Unrelated custom colors, including historical graphite #64748B, remain custom;
they are not repurposed into an unrelated approved family. The existing current-
color compatibility swatch remains available only for such legacy data. It is
not an eleventh selectable preset. The existing contrast correction remains for
arbitrary custom chips.

Opening, displaying or renaming a tag does not rewrite its stored `color` or
`customColor`. Only an explicit different swatch selection saves the selected
new background HEX. IDs, note relations and symbolic colors without a custom HEX
are preserved. Backup/import representation is unchanged.

Existing colored chips continue using `tagColorStyle`: editor, note cards and
search-result cards. TagsPage dots, inline editor tag-picker dots and color-picker
swatches now also use the corresponding shared theme pairs. The note/archive
accent stripe resolves the same family through `getTagDisplayColor`.
The dark removal-button hover tint uses the dark foreground token. Only colors
change in CSS; no geometric properties are modified by this task.

## Regression Strategy

Targeted tests assert every literal approved light pair, all historical alias
families, unchanged input objects, arbitrary custom-color preservation, dark AA,
the exact four acknowledged light failures, and actual TagEditorModal submission
behavior on rename versus explicit color selection.

Existing browser contrast checks still reject any unapproved failure. They accept
only the four exact user-retained light pairs, record `wcagAa: false`, and do not
lower the global threshold or ignore dark/custom failures. The exact-palette
matrix checks all ten editor chips and tag-page dots, selected swatches, hover,
light/dark, 100/160%, collapsed/maximum sidebar, and comparison of chip geometry
against the previous QA production fixture.

The first frontend run found two obsolete #E05272 accent expectations in the
note/archive tests. Only those expected display values were updated to #F472B6;
the tests' behavioral assertions remain. The failed initial run is preserved in
`releases/qa/classic-vibrant-soft-tests-initial-old-color-expectations.log`.

## Fresh Verification And Native Evidence

### AUTOMATED / BROWSER PASS

| Gate | Fresh result | Evidence under releases/qa |
| --- | --- | --- |
| npm run typecheck | PASS | classic-vibrant-soft-final-typecheck.log |
| npm run test | 979/979 PASS, 0 skipped, 76.040 s | classic-vibrant-soft-final-tests.log |
| npm run build | PASS | classic-vibrant-soft-final-build.log |
| cargo fmt --check | PASS | classic-vibrant-soft-fmt.log |
| cargo check | PASS | classic-vibrant-soft-check.log |
| cargo test | 292 passed, 11 ignored, 0 failed, 28.41 s | classic-vibrant-soft-rust-tests.log |
| cargo clippy --all-targets --all-features -- -D warnings | PASS | classic-vibrant-soft-clippy.log |
| npm audit --omit=dev --offline=false | 0 production vulnerabilities | classic-vibrant-soft-audit.log |
| Full 17 browser runners | 1915 cases PASS | classic-vibrant-browser/counts.json |
| Toolbar/sidebar/right-chat/focus matrix | 54 cases PASS | classic-vibrant-soft-toolbar.log |
| Compact-form geometry regression | 40 cases PASS | classic-vibrant-soft-forms.log |
| Exact palette/theme/zoom/sidebar/hover/selection matrix | 8 cases PASS | classic-vibrant-soft/browser/results.json |
| Total current-code browser/geometry cases | 2017 PASS | No baseline or unit-test double counting |
| Separate Windows QA EXE | PASS | classic-vibrant-soft-final-qa-exe.log |
| npm run tauri build | PASS, NSIS + en-US/ru-RU MSI | classic-vibrant-soft-final-tauri.log |
| Source/EXE/version fingerprint | PASS, 356 matching source inputs | classic-vibrant-soft-check.json |
| git diff --check | PASS | classic-vibrant-soft-final-diff.log |

Rust/dependencies were not changed by this palette task; their gates above were
rerun during this task. The final frontend, fixture and native builds were rerun
after the last color-only CSS change. One intermediate sandboxed frontend run
failed only because AuthorizationManager blocked the release-staging PowerShell
test. The same suite passed outside the sandbox without changing that test; the
final full run also passed. The intermediate failure log is retained.

Existing Vite editor-runtime >500 kB warning and existing Git LF/CRLF advisories
remain. They were not suppressed or misreported as test failures. The four light
AA exceptions remain explicitly recorded in the color results despite functional
regression PASS. This is not a claim of full accessibility conformance.

### New QA Artifact

`D:/Projects/NoteFlow/releases/qa/NoteFlow-QA-Classic-Vibrant-Soft.exe`

- Build ID: `classic-vibrant-soft-59a2893bf3da`.
- Working-copy fingerprint:
  `59a2893bf3da5a6eb278953c4ee02ce81439ab0695a51832ee40fc2a7a6f8c07`.
- SHA-256:
  `8F94231F671DF43477E5B8871A60C2D5D33C52FE59A775913988DD66D229D230`.
- Built `2026-11-03T20:39:46.6784036Z`; 21,362,176 bytes.
- Separate synthetic profile: `com.noteflow.qa.repeatnative`.
- Canonical identity remains `NoteFlow` / `com.noteflow.desktop`.
- All canonical versions remain `1.0.0-rc.6`.

The first intermediate QA build was not used for native verification. The final
EXE was rebuilt after the dark swatch variable-precedence fix; its SHA and all
356 manifest source inputs were verified before/after native testing. Twelve
historical RC5 and four staged published RC6 artifact hashes still match.

### WINDOWS NATIVE VERIFIED

Actual Tauri/WebView2, 1440x844 logical client, Windows DPR 1.25, app zoom 100%.
Input actions were performed through Computer Use; CDP only read DOM/computed
colors and captured screenshots. SQLite evidence was opened read-only. No real
user profile, notes, credentials or AI model requests were used.

1. Opened the new fingerprinted EXE and the existing synthetic profile.
2. Confirmed old blue/red tags display new colors while their stored custom HEX
   values remain #3B82F6 and #E53935, with original IDs and note relations intact.
3. Opened the real create-tag modal and selected Lime. All ten light swatches
   match the exact approved foreground/background pairs.
4. Created `Classic Lime QA` through the UI, not direct SQLite insertion. The
   saved value is `color=green`, `custom_color=#D9F99D`.
5. Assigned it to the synthetic `QA Extended Import14` note using its real inline
   tag picker. Blue and lime chips appear in the editor and note card.
6. Switched theme through Settings. Verified dark chips, tag-page dots and all ten
   dark palette swatches. No tag padding/radius/height change or app overflow.
7. Closed the QA app gracefully. Confirmed both its window and process had exited
   before reopening the same SHA-verified EXE; no concurrent second DB instance.
8. After cold restart the tag, saved HEX and note relation remained. Opened the
   editor again: the same two chips and 31-command toolbar remain, with no app
   overflow. The full stored tag rows and relations match their pre-restart state.

Native checks assert 20 exact swatch pairs, both chip themes, unchanged chip
geometry, preserved old records/relations and persistence of the newly selected
color. Evidence: `releases/qa/classic-vibrant-soft-native-check.json` plus native
state JSON/PNG files. A transient Computer Use geometry failure was recovered by
fresh window selection/activation and the editor was actually reopened. The
earlier failed transition capture is retained but is not used as editor evidence.

Native swatches retain 48 px height and 12 px radius. Editor chips retain 24 px
height, 6 px radius and 2 px/7 px padding. The browser matrix additionally covers
160% zoom and both collapsed/maximum sidebar widths. Native 160% and other Windows
DPI values are NOT VALIDATED in this task. macOS native QA remains PENDING.

### Screenshots

Actual Windows light palette:

![Native light palette](D:/Projects/NoteFlow/releases/qa/classic-vibrant-soft/native/palette-light.png)

Actual Windows dark palette:

![Native dark palette](D:/Projects/NoteFlow/releases/qa/classic-vibrant-soft/native/palette-dark.png)

Actual Windows chips in the editor, light:

![Native light chips](D:/Projects/NoteFlow/releases/qa/classic-vibrant-soft/native/editor-light.png)

Actual Windows chips after cold restart, dark:

![Native persisted dark chips](D:/Projects/NoteFlow/releases/qa/classic-vibrant-soft/native/restart-editor-dark-confirmed.png)

Complete ten-color chip gallery, browser-rendered (not ten newly persisted
native tags):

![Browser light chips](D:/Projects/NoteFlow/releases/qa/classic-vibrant-soft/browser/editor-light.png)

![Browser dark chips](D:/Projects/NoteFlow/releases/qa/classic-vibrant-soft/browser/editor-dark.png)

## Changed Files And Final State

Production: `tagPalette.ts`, `TagEditorModal.tsx`, `TagsPage.tsx`,
`NoteTagsInline.tsx`, `pages.css`, `editor.css`. Only shared color definitions,
compatibility, rename color preservation and theme-token application changed.

Tests: `tagValidationRegression.test.ts`, `finalUxMarkdownLinks.test.ts`,
`userSmokeCorrections.test.ts`, `phaseAOrganization.test.ts`. Added four real
behavior/value regressions; updated exact old color expectations only where the
new display specification requires it.

QA: added `classic-vibrant-expectations.mjs` and `classic-vibrant-palette.mjs`;
updated contrast assertions in `final-ux-vision.mjs`,
`repeat-native-corrective.mjs` and `compact-form-regression.mjs`. Added this report.
Build/native helpers, logs and screenshots remain under Git-ignored releases/qa.

Final tree: 75 modified, 77 untracked, 0 staged. Branch, HEAD and version unchanged.
Existing user work and historical QA files retained. No git add, commit, push,
merge, tag, version bump or release. The task's preview servers were stopped;
the pre-existing development server was not taken over or stopped.

**READY FOR USER SMOKE**, with the explicitly retained four light WCAG AA
limitations above. This does not publish or approve a Stable release.
