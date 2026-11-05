# Toolbar And Extended Markdown Corrective Pass

## Scope And Baseline

Branch `codex/post-rc6-markdown-performance`, HEAD
`42cdf9cca1371eac49c5645f6f82036d63b65b50`, version `1.0.0-rc.6`.
Initial tree: 67 modified, 67 untracked, zero staged. Existing work and historical
QA evidence are preserved. Safety diff: `releases/qa/toolbar-extended-before.patch`.
No staging, commit, tag, push, merge, version bump or publication is authorized.
This document supplements, not replaces, `markdown-sidebar-architecture.md`.

## Confirmed Causes And Changes

1. The previous ribbon used fixed-size tracks with default start alignment. It
   solved repartitioning jitter but left unused editor width on the right.
   `editor.css` now distributes the existing tracks using `space-between`.
   No density switch, wrapping, overflow menu, JS coordinate positioning or target
   resizing was added. The existing snapshot-based splitter controller remains.
2. Portable GFM deliberately strips underline/color/font/alignment because GFM
   cannot express them. It was the only Markdown export choice. A distinct typed
   `md-noteflow` choice now uses registered handlers in the same official
   `@tiptap/markdown` 3.30.5 manager. Internal canonical v1 storage is unchanged.
3. The list adapter used a standalone GFM lexer, bypassing registered extension
   tokens inside list items. It now retains GFM's exact list/task boundaries but
   passes inline source tokens and explicit extension blocks through the active
   extension lexer. Structural checkbox tokens are not copied back into text.
   First paragraphs use their
   registered renderer, including alignment directives. Regression tests cover
   rich styles inside bullets, numbering, tasks, quotes and callouts.
4. File import previously removed even external HTTPS images. Safe HTTP(S) image
   references without credentials/control characters are retained. Unresolved
   local paths and cross-profile managed IDs are still rejected/placeholdered.
5. Derived tag backgrounds mix 82% white (was 84%) in light mode, 72% dark surface
   (was 74%) in dark mode. Stored colors/IDs, compact chip geometry, foreground
   rules and >=4.5:1 contrast correction are unchanged. This is a small tint
   adjustment, not a replacement palette.

## Export Contract And Grammar

Both Markdown choices flush pending edits, obtain authoritative hydrated
`get_note`, serialize without editor transactions, then call the existing
version-checked Rust `export_note_markdown_at_path`. Both produce `.md` files and
reuse managed-resource rewriting. Save-dialog cancellation performs no write.
The last successful format is stored in existing nonsecret UI settings; old
settings default to GFM. No DB migration or retention/attachment redesign.

Standard Markdown uses headings, `**bold**`, `*italic*`, `~~strike~~`, code spans,
fenced code, links, nested lists, checkboxes and GFM tables, without HTML tags.
The export dialog discloses unsupported rich formatting. Colors/underline/font
size are not promised in GFM. The actual user-supplied `пп.md` is normalized into
`tests/fixtures/user-markdown-reference.md`; it is input evidence, not a substitute
for a UI-authored export. Its `https://example.com` image is only a URI/alt-text
fixture, not proof that an actual image is hosted at that address.

Extended syntax (in addition to the standard constructs):

```text
++underlined text++
{{nf:{"color":"#315F97","fontFamily":"Georgia, serif","fontSize":"20px"}}}text{{/nf}}
{{nf:{"highlight":"#fff176","script":"sup"}}}text{{/nf}}
:::nf-block {"textAlign":"center","indent":2}
Paragraph or heading
:::
:::nf-image {"width":320,"height":180,"alignment":"right"}
![alt](https://example.com/image.png)
:::
:::nf-table {"attrs":{"emphasizedBorders":true}}
| A | B |
| --- | --- |
| C | D |
:::
```

Style headers accept an allowlisted JSON object, not CSS/HTML or arbitrary editor
JSON. `highlight:true` means default highlight; `script` accepts `sup` or `sub`.
For exact emphasis ranges that include edge whitespace, the same style token
also accepts `bold:true`, `italic:true`, `strike:true`. This avoids CommonMark's
delimiter-flanking ambiguity without losing the marked spaces. Ordinary GFM
emphasis remains `**`, `*`, `~~`; GFM deliberately normalizes mark-edge whitespace.
Combined inline-code/rich-style ranges use the same allowlisted `code:true`
flag: CommonMark code spans otherwise treat nested underline/color syntax as
literal source. Standalone inline code still uses ordinary backticks. Both
colored-code and bold+underline+code combinations have round-trip tests.
Font families, sizes, hex colors, alignments and indents are validated. Inline
headers are bounded to 2 KiB/depth32. Table/image metadata is bounded to256 KiB;
table metadata validation limits the layout to20,000 cells. Table directives can
carry header axes, border flag, cell fills/column widths and validated geometry.
Merged simple text cells use the existing table projection/layout restoration.

Literal plus pairs and directive prefixes are escaped at text leaves. Marked
edge whitespace can use numeric character references (CommonMark entities, not
HTML tags). The official manager remains responsible for delimiter transitions;
a projection-only transparent code-context mark avoids double escaping. It is
never persisted in editor JSON/sidecars. Pure serialization dispatches no update.
Existing canonical notes containing literal `++` keep their prior interpretation.
Unversioned external files with literal unescaped `++word++` are inherently
ambiguous and now follow the documented underline syntax; escape pluses for
literal text. New GFM exports do that automatically.

## Complete Formatting Policy

All content rows use canonical Markdown plus existing sidecars inside NoteFlow.
Export is a projection only; it does not replace canonical data or increment CAS.

| Toolbar action(s) / registered content | GFM | NoteFlow Markdown / reopen |
| --- | --- | --- |
| undo, redo | History commands, no persistent node | Unchanged editor history commands |
| h1, h2, h3; heading levels4-6 | `#` through `######` | Same; alignment/indent directive |
| p; paragraph, text, doc | Ordinary paragraphs/escaping | Same plus rich block attributes |
| font; fontFormat | Family/size omitted with warning | Allowlisted inline fontFamily/fontSize |
| bold, italic, strike | `**`, `*`, `~~` including partial/nested ranges | Same |
| underline | Explicitly unsupported; warning | `++...++`, nested marks and literal escapes |
| inline-code; code | Variable backtick fences | Same, no parsing directives inside code |
| highlight; highlight | Omitted with warning | Inline highlight hex/default token |
| color; textStyle | Omitted with warning | Inline hex color |
| sup, sub; superscript/subscript | Omitted with warning | Inline script token |
| ul, ol; bulletList/orderedList/listItem | Nested lists and ordered start | Same with active rich extension lexer |
| task; taskList/taskItem | `- [x]` / `- [ ]` | Same with rich marks |
| quote; blockquote | `>` and nested structure | Same with nested directives |
| code-block; codeBlock | Fenced literal code with language | Same; no inline interpretation |
| align-left/center/right/justify; EditorIndent | Non-GFM block attrs omitted; table column alignment retained | Validated nf-block attrs |
| link; link | `[label](href)` with safe URI rules | Same |
| table; table/row/header/cell | GFM projection; complex appearance warning | Simple cells, fills, borders, widths, header/merge metadata |
| note-link, fragment-link; link | Profile-specific URI + readable label | Same existing navigation; profile identity not remapped |
| legacy noteMention (registered compatibility node, not a new toolbar command) | Readable/profile-specific fallback | Existing label token only; exact legacy noteId/label mapping requires backup/sidecar, not a lossless single-file claim |
| clear | Removes formatting via existing command | Same |
| ai | Existing assistant action, not a format/node | Unchanged |
| image / EditableImage | Markdown image + rewritten managed resources | Additional validated size/alignment |
| hardBreak/horizontalRule | Standard line break/divider | Same; trailing layout-only empty blocks are not a fidelity contract |
| callout | Quote fallback with warning | Existing typed `:::info/tip/warning/important` blocks |
| detailsBlock/detailsSummary/detailsContent | Flattened text with warning | Existing `:::details` grammar |
| inlineDate | Readable date text with warning | Existing `{{date:...}}` token |
| fileAttachment / InteractiveFileAttachment | Managed resource link; no rich card promise | Existing file token/resource link; backup for complete metadata |
| search, fragment navigation, heading anchors, passive transactions, table tools, code restoration | Editor plugins, not exported content | Unchanged; must not trigger hidden mutations |

Complex table cells (multiple paragraphs, blocks or inline atoms) fail closed in
extended export; use backup, not a misleading lossy "complete" file. GFM can still
produce a disclosed simplified projection. Image edit originals/crops, attachment
ownership, revisions, exact blank/trailing-break layout, resource availability
across profiles and collapsible UI state require backup/sidecars. A `.md` alone is
not a full-profile archive. Rich-text clipboard/Telegram are not new integrations;
ordinary Telegram paste is not promised to parse GFM or NoteFlow extensions.

## Validation Log

Status names are separate: AUTOMATED PASS, BROWSER PASS, NATIVE VERIFIED,
PENDING USER SMOKE and NOT VALIDATED. Historical results are not new PASS.

- Initial targeted run:97/97, typecheck PASS.
- Table/image/cancel tests:65/65.
- Active-lexer nested rich formatting, mounted editor/physical-file pipeline,
  canonical compatibility and paste regressions:135/135.
- Fresh full gates, browser regression, artifact fingerprint and native proof:
  running; final results must be appended below before close-out.
- macOS native and physical DPI matrix are NOT VALIDATED on this Windows host.
- Phase acceptance still requires the user's confirmation of the new QA build.

### Fresh Gate Progress

- Full frontend:968/968 PASS, zero skipped,57.67 s (previous phase912).
- New browser distribution suite:50/50 PASS (previous18). Covers actual pointer
  drags of all three splitters, 100/160% app zoom, light/dark and browser DPR
  1/1.25/1.5. Per-frame affine-position error stays below0.2 px; target widths and
  ribbon height remain constant. Last target ends at the right8 px inset.
  Chat draft/editor identity/content and single settings commit are checked.
- Full Rust:292 PASS,11 ignored (previous291 PASS,11 ignored). New test covers
  legacy/default/invalid export-format settings; persistence/reopen test includes
  the new preference. Clippy/fmt/check PASS.
- Audit:0 production vulnerabilities. Tauri release compilation is in progress.
- Preliminary FTS:10,000 notes, indexing15.928 s, query0.999 ms; concurrent geometry
  makes this unsuitable as a clean performance baseline. A separate clean run is
  still required.
- Direct official Paragraph/Heading dependencies are pinned3.30.5, matching the
  existing TipTap peer set. These were already transitive packages; they preserve
  official image lifting/heading parsing, not a second Markdown engine.
- User fixture normalized content matches the supplied file exactly (861 chars,
  SHA256 `b3440df77c246be59097dec6d0d0c02cabac64cc8710b26fb9547fed0ba0ee4d`).
- Palette text contrast measured across all10 colors: light minimum4.922:1,
  dark minimum6.999:1. Shape/identity do not change. Visual/native review pending.

### Native-Discovered Range Case (Not Hidden By Unit Results)

The first new QA build `toolbar-extended-f5dc1b0b4d7e` opened successfully in real
WebView2 at1440x844 logical pixels/DPR1.25. Toolbar font, alignment, selection and
color controls were operated on the historically UI-authored synthetic note
`QA Architecture 22c9`. Read-only observation then found a serialization failure
in an earlier partial-mark paragraph with trailing selected spaces. No document
mutation occurred (`pure:true`); CAS/sidecars remained saved at version66.

Cause: a numeric entity just inside an emphasis delimiter can change CommonMark
right-flanking eligibility before the next word. A standalone marked-space test
did not cover several adjacent mixed ranges. New regression uses that actual
UI-authored paragraph. The registered style tokenizer now preserves exact
nonportable emphasis ranges through typed flags rather than returning plain text
or HTML. Canonical storage and standard GFM syntax remain unchanged. Targeted
mounted/persistence/extended matrix:166/166 PASS. Full gates and a new fingerprint
are being regenerated; the initial binary is not accepted as the final artifact.

### Explicit Non-Green Performance Gate

Fresh full frontend after the native range correction:969/969 PASS. A subsequent
two-case mixed-code extension matrix is168/168 PASS; final full frontend rerun
must include those cases. Rust292/292 PASS,11 ignored; Rust source did not change
after that run. Production audit remains0 vulnerabilities.

The unchanged ignored machine-sensitive FTS benchmark failed at47.203 s with
concurrent work, then failed again at41.586 s in a separate run with no native QA,
browser runner or build. Its existing30 s indexing threshold is NOT relaxed.
The cause of the slowdown is not proven; it must not be dismissed as fixed by
frontend unit tests. Earlier15.928 s was a different run, not the current clean
result. Logs: `toolbar-extended-fts.log`, `toolbar-extended-fts-clean.log`.
This remains FAIL and prevents claiming a completely green regression gate.

Final source checkpoint: full frontend971/971 PASS, typecheck and build PASS;
extended parser matrix56/56 including bounded table rowspans. Application source
is frozen at build fingerprint
`14dffc1726d092de665738b8cb026d69e04ffa423b9d2be99f5c5a1efd9ee194`.
Previous intermediate binaries/manifests are superseded, not native evidence
for this final source. Complete browser suite is restarting from scratch under
`releases/qa/toolbar-extended-release-browser`.

### Windows Evidence On Build14dffc1726d0

- Real toolbar operations on the original UI-authored note: selected text,
  Bold/Italic/Underline, Georgia20, color#315F97, center alignment. Source saved
  at contentVersion67. Public getMarkdown is pure and no longer throws on the
  native-discovered adjacent-space ranges.
- Actual UI -> native Save dialog -> Rust -> physical extended file:
  `releases/qa/extended-native-ui-noteflow.md`,1452 bytes, SHA256
  `4088eb87078886e24a56afa6f7fc3c6a03fb90439ceecbea23d44a1f596e95f9`.
  All declared styles, including `++`, survive. The file equals the authoritative
  saved projection, not just a synthetic JSON projection. Metadata key order from
  hydrated SQLite differs from live JSON order; comparison hydrates the actual
  canonical Markdown/sidecars through the real loader before checking bytes.
- Imported through actual file menu/preview into `QA Extended Import14`, then
  closed via system X and restarted the same EXE. Full rich character-level marks
  and structure match the physical file; contentVersion stays1, pure:true.
  Screenshot: `extended-native-evidence/imported-reopened.png`; comparison JSON:
  `extended-native-evidence/comparison-extended-imported-reopened.json`.
- Last selected NoteFlow Markdown mode is visibly retained after restart.
- Actual UI GFM export: `extended-native-ui-gfm.md`,1136 bytes, SHA256
  `e0ab0935137ccc92a67942e1721f233cb696f00d295821413d77b0085c9c768d`.
  It uses ordinary emphasis/fences/lists/headings, no HTML or rich directives.
  GFM-supported semantics and exact saved projection match. Non-GFM attributes
  are deliberately not part of that projection; internal rich state is separately
  compared without dropping any marks/attributes.

### Additional Native Clipboard Blocker And Correction

VS Code opened the exact reference in a new window (the user's unsaved11.md was
not touched). Real Ctrl+A/Ctrl+C selected861 source characters. Native explicit
Markdown paste into a new empty QA note failed, including retry. It was NOT
declared PASS. A read-only backend diagnostic (null noteId, plainTextOnly=true;
returns before every attachment/DB-write branch) confirmed successful OS clipboard
read:910 characters,48 CRLF pairs. No clipboard content was logged.

Root cause is schema validity, not unavailable clipboard: public parse produced
`paragraph(text("caption\\n"), image)`, but NoteFlow registers block-only images.
The official Paragraph adapter unwraps only image-only paragraphs, not mixed
text/image paragraphs. The UI's generic paste catch unfortunately labels that
schema exception as a clipboard-read error.

A registered Paragraph parse adapter now delegates to the official parser then
lifts block images into sibling blocks, consuming only adjacent soft newline
separators. It does not introduce an HTML converter or change the serializer.
New mounted tests use the exact user reference with LF and CRLF, check the real
ProseMirror schema, public Markdown commands, image alt, save/reopen equality.
Targeted71/71 PASS; full frontend/build and a new fingerprint are required again.
Pixel loading is not claimed for the example URI. Nested images in list/table
contexts are not covered by this particular native test and remain NOT VALIDATED.

The previous full browser attempt passed16 runners; the17th still expected fixed
relative icon X positions. That expectation contradicts the newly requested full-
width distribution. It now asserts the same affine motion law, constant target
sizes and equal-width anti-oscillation, retaining slow100-step/fast10-step drags.
The previous failure is preserved; it is not presented as a product PASS.

## Final Frozen Build And Current Results

This section supersedes intermediate build checkpoints, not the historical
failure record. No production source changed after the final image-parser fix.

### Verified Artifact

- QA EXE: `releases/qa/NoteFlow-QA-Extended-Markdown.exe`.
- Build ID: `toolbar-extended-9c4f9ed7b842`.
- Working-copy fingerprint:
  `9c4f9ed7b8423af0f19878503ab735180e6de7942596a1c8ff0f778831b1d477`.
- EXE SHA256:
  `54A0AA6636419CEA3A01FB95CD127E2DFC9832BCF0A08F39414C8AD9D06C36DF`.
- Size21,361,664 bytes; built2026-11-03T14:38:15.8040044Z.
-353 source/test/config inputs match the manifest. Branch and HEAD remain the
  baseline above. Canonical version locations remain1.0.0-rc.6;
  productName=NoteFlow, identifier=com.noteflow.desktop.
- Native tests used only the separate synthetic profile
  `com.noteflow.qa.repeatnative`. No real user note or credential was changed.

### Current Gate Table

| Gate | Current result | Evidence under releases/qa |
| --- | --- | --- |
| npm run typecheck | AUTOMATED PASS | toolbar-extended-typecheck.log |
| npm run test | AUTOMATED PASS,973/973,0 skipped,78.195 s | toolbar-extended-tests.log |
| npm run build | AUTOMATED PASS | toolbar-extended-build.log |
| cargo fmt --check | AUTOMATED PASS | toolbar-extended-fmt.log |
| cargo check | AUTOMATED PASS | toolbar-extended-check.log |
| cargo test | AUTOMATED PASS,292 passed,11 ignored,89.48 s | toolbar-extended-rust-tests.log |
| cargo clippy --all-targets --all-features -- -D warnings | AUTOMATED PASS | toolbar-extended-clippy.log |
| npm audit --omit=dev --offline=false | AUTOMATED PASS,0 production vulnerabilities | toolbar-extended-audit.log |
| Full existing browser suite | BROWSER PASS,17 runners,1915 cases | toolbar-extended-confirmed-browser/counts.json |
| Added distributed-toolbar architecture suite | BROWSER PASS,50 cases | toolbar-extended-layout-confirmed.log |
| Combined browser/geometry coverage |1965 PASS | The two preceding independent runs |
| npm run tauri build | AUTOMATED PASS,MSI en-US/ru-RU and NSIS | toolbar-extended-tauri.log |
| FTS benchmark, final clean run | AUTOMATED PASS,10,000 notes,indexing14.553580 s,query27.113 ms | toolbar-extended-fts-final-clean.log |
| Source/EXE/version fingerprint | AUTOMATED PASS,353 inputs | toolbar-extended-check.json |

The final FTS run was separate from native QA, builds and browser runners, after
closing the QA EXE and the QA-only VS Code window. The earlier47.203/41.586 s
failures remain recorded above; the performance gate is measurably variable.
The final PASS does not prove the cause of those slower runs or erase them.
No FTS code or threshold was changed in this task.

The build still reports the existing Vite chunk warning: editor-runtime536.45 kB,
main457.17 kB before gzip. The warning was not disabled or masked. JSDOM codec
comparison can also print the existing linkify initialization warning; it is not
a production provider/persistence log. No user content was used as a fixture.

### Native Verification On Final9c4f9ed7b842

1. The actual previously exported extended file was reopened on the final binary.
   Full rich marks/attributes match; contentVersion remains1 and getMarkdown is
   pure. Evidence: `extended-native-evidence/imported-reopened-current.json` and
   its `comparison-extended-imported-reopened-current.json` comparison. Export
   creation occurred on14dffc as recorded above; it is not falsely attributed to
   the later binary. The subsequent parser fix is covered by final native paste.
2. Real VS Code Ctrl+A/Ctrl+C from the supplied reference, followed by the actual
   editor context command "Paste as Markdown", now succeeds in the final EXE.
   It was not replaced by an IPC/programmatic document insertion. The complete
   schema and rich text/structure match the exact fixture and file-import path.
   System-X close/restart retains the same contentVersion1. Evidence:
   `extended-native-evidence/clipboard-reference-final.json`,
   `clipboard-reference-reopened.json`,
   `comparison-clipboard-reference-reopened.json` and
   `clipboard-reference-final.png`. The final menu click is recorded as trusted.
3. The physical GFM file was opened in real VS Code source and built-in preview.
   Ordinary headings, partial emphasis, lists, quote, code and link render.
   Screenshots: `gfm-vscode-source.png`, `gfm-vscode-preview.png` in the same
   evidence directory. That viewer displayed task markers textually; this is not
   a promise that every viewer provides interactive/rendered GFM checkboxes.
   The existing Restricted Mode and authentication controls were not touched.
4. Actual Sky pointer drags exercised the main navigation divider, note-list
   divider and right-chat divider at100% on the final EXE.156 captured frames,
   three drags: maximum affine-position error0.011588 CSS px, target-size error0,
   ribbon-height error0, no observed long tasks or root overflow.31 controls keep
   identity/order. The motion law measures intended full-width distribution,
   not obsolete fixed relative-X coordinates. Evidence:
   `extended-native-evidence/toolbar-100-light.json`, `toolbar-native-100.png`.
   Saved imported note stays contentVersion1 after resize; no hidden autosave.
5. Right chat opened beside the editor at100%, without overlay, Focus Mode or
   native-window resize. This pass did not send a new AI request; network/provider
   generation is not claimed as newly validated by a layout test.
6. Real Settings controls applied dark/light themes and160% native WebView zoom.
   Host client size is1440x844 logical pixels at OS DPR1.25. At160%, WebView reports
   viewport900x527 CSS pixels and effective DPR2. In both themes all31 targets
   remain visible,24 CSS px wide (font30), ribbon height45 CSS px. Toolbar853.75
   CSS px; toolbar scrollWidth=clientWidth854, root scrollWidth=clientWidth900.
   Left panels compact automatically to honor the ribbon minimum. Screenshots
   and exact rectangles: `chip-dark-160.{png,json}`,
   `chip-light-160.{png,json}` under `extended-native-evidence`.
7. Tag page, color-picker selected red state, search-result chip and editor chip
   were inspected through the real UI.100/160% light/dark chip shape is still6 px
   radius. Red chip uses light backgroundrgb(250,219,219),textrgb(160,40,37);
   dark backgroundrgb(82,36,40),textrgb(245,176,174). Same identities survive restart.
   Screenshots: `tags-light.png`, `chip-light-100.png`, `chip-dark-100.png`, plus
   both160% captures. The full ten-color contrast matrix is automated, not a claim
   that every color's creation/edit/restart was repeated manually this pass.
8. QA theme/zoom returned to light/100%; the saved QA app and QA-only VS Code
   window were closed gracefully before benchmarks. The user's separate unsaved
   VS Code11.md window was not touched. Historical QA notes/files remain.

### Explicit Limits And Acceptance

- WINDOWS NATIVE VERIFIED applies to the scenarios above, not every combination
  of every mark, attachment and image location. The complete codec matrix is
  AUTOMATED PASS, not a substitute for those explicitly listed native operations.
- Browser DPR1/1.25/1.5 and100/160% drags are BROWSER PASS. Native host OS DPR1.25
  only was available; physical OS DPI100/150% and other monitors are NOT VALIDATED.
- A160% right-only chat requires at least1686 logical px using the agreed
  ribbon820 CSS px + chat300 + compact navigation74 strategy. This host cannot
  provide that width. Native160%+right-chat is NOT VALIDATED, not a fake PASS.
- macOS native QA is PENDING. No cross-platform Stable readiness is claimed.
- External image pixel loading at example.com and nested image combinations
  inside lists/table cells remain NOT VALIDATED in this native pass.
- Rich-text clipboard into Telegram is NOT VALIDATED; ordinary text paste is not
  promised to interpret either Markdown dialect. No Telegram API integration.
- Extended Markdown is not a backup replacement. Complex table cells fail closed;
  attachment ownership/history and exact legacy mention identity require backup.
- PENDING USER SMOKE: final product acceptance still requires the user to open
  this fingerprinted QA EXE and approve the toolbar/export/tag behavior.

### Final Loading Comparison And Repository Check

Three independent before/after series completed after native/build/full-browser
work stopped:126 navigations including six excluded warmups,30 observations per
side/mode. Every navigation uses the exact same10,000-note metadata DTO hash;
fewer than100 note cards are mounted. There is no material regression in these
observations, but this is not a statistically proven universal speed guarantee.

| DOM-usable timestamp | Before p50/p95 | Final p50/p95 |
| --- | --- | --- |
| Browser-process cold |569.6 /658.4 ms |571.7 /675.5 ms |
| Warm navigation |284.0 /351.6 ms |282.0 /340.3 ms |

Method limits: browser process cold is not OS-disk-cache cold; the timestamp is
an internal usable-DOM event, not physical paint. Metadata IPC is mocked, not
SQLite. This comparison does not claim native input latency or a macOS result.
Evidence: `releases/qa/loading-validation-toolbar-extended-final/results.json`
and `toolbar-extended-loading-final.log`; all three series completed with exit0.

Historical artifact preservation check PASS:12 RC5 historical hashes and4 staged
RC6 hashes unchanged. Fresh canonical build outputs are not published or copied
over released staging. The task's Vite/preview servers were stopped after QA.

Final `git diff --check`: PASS; only existing LF-to-CRLF advisories, no whitespace
errors. Working tree remains72 modified,71 untracked,0 staged, branch
`codex/post-rc6-markdown-performance`, same HEAD and1.0.0-rc.6. The counts include
the pre-existing large uncommitted stage, not just this corrective task.
No git add/commit/tag/push/merge, version bump or release was performed.

**Verdict: READY FOR USER SMOKE.** This is a verified QA handoff, not acceptance
of the phase or approval to publish Stable. The platform/format limits above
remain explicit; final user acceptance of this new binary is still pending.
