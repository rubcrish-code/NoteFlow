# Repeat Windows Native Smoke Corrective Pass

Date: 2 November 2026 (build timestamps are UTC). Branch:
`codex/post-rc6-markdown-performance`. HEAD:
`42cdf9cca1371eac49c5645f6f82036d63b65b50`. Version: **1.0.0-rc.6**.
No release, Git staging, commit, tag, merge, push or version change is authorized.
Initial tree: **57 modified, 56 untracked, 0 staged**. All earlier work is retained.

This report supersedes the previous smoke handoff for these four defects. A prior
READY verdict was not proof that the user's native defects were fixed.

## Root Cause Analysis

| Defect | Reproduction and confirmed cause | Correction |
| --- | --- | --- |
| Missing Markdown marks | Created `QA Export Soft Breaks` in the real old QA editor, typed ordinary text, inserted Shift+Enter, selected it and applied Bold. SQLite retained a bold text node plus a bold-marked hardBreak, canonical `<strong>Native bold</strong><br>`, contentVersion3. The real export menu/native Save dialog produced `Native bold&#32;&#32;&#10;`. `projectInlineMarkdown` compared invisible inherited marks on hardBreak against the parser's unmarked break. A terminal soft break also cannot roundtrip at block end in plain CommonMark. Both mismatches could downgrade the entire paragraph to unmarked text. | Compare line breaks by text, not inherited visual marks. Only in the portable projection omit terminal invisible soft breaks before validation. Keep internal breaks and visible supported marks; retain lossless canonical storage/sidecars. No second converter or regex HTML-stripping layer. |
| Chat refused to open | In the old EXE, expanded main sidebar + note list + full toolbar + docked chat exceeded the monitor width. The layout guard rejected opening and displayed the reported toast. It also coupled chat opening to native minimum-size/resize calls. | Resolve docked vs compact-overlay presentation from the real viewport. Shrink panels to existing minima, use chat overlay below the toolbar when necessary, and temporarily use a rail/list drawer at smaller widths. The native minimum depends only on the physically required ribbon, never on chat opening. Chat/editor instances and document state survive presentation changes; preferences are not overwritten. The compact note list remains reachable through All Notes and the existing search shortcut; Escape/click outside returns to the editor. |
| Toolbar horizontal jumps | CSS at1000/1130px simultaneously changed32/28/24px flex minima, gaps, padding and separator margins. Native baseline observed both `compact` and `ultra-compact` during drag. React already retained the same31 actions; rAF input coalescing alone could not remove these discontinuities. | One stable action DOM and continuous container-relative spacing, equal flexible tracks with24CSS-px minima, fixed control/toolbar height. No button hiding, wrapping, cropping, additional overflow or translateY workaround. |
| Over-saturated tags | Shared chip CSS used `--tag-color` as the full background, i.e. the same saturated color intended for picker swatches/accent bars. | Keep stored color IDs/hex values and relationships. Derive shared light/dark chip background/foreground tokens from each color. Light backgrounds mix88% white; dark backgrounds mix78% neutral dark. Foregrounds are contrast-checked and adjusted toward black/white until >=4.5:1, including custom/legacy colors. Chip radii/padding are unchanged. |

The supplied user `.md` confirms missing portable marks when compared with the
screenshot. It does not contain the original ProseMirror ranges, so we do not claim
to have recovered those exact private ranges or read the user's database. The
synthetic native reproduction demonstrates a concrete matching pipeline failure.
The user's file was not modified or copied into source/tests/reports.

## Real Export Pipeline

1. **Real Windows editor input:** Computer Use typed ordinary text and used toolbar,
   selection, Shift+Enter, list nesting and standard editor input rules. No DOM/JSON
   document injection or preformatted Markdown fixture supplied the native document.
2. **Autosave:** existing editor serializer produced canonical Markdown/cache/sidecars.
   Read-only SQLite checks were restricted to explicitly named synthetic QA notes.
3. **Storage:** the original soft-break reproduction retained its bold mark/cache;
   the rich Matrix document saved at contentVersion63 with two sidecars.
4. **Export source:** `exportAfterFlush` -> `noteExportService` -> fresh saved Note;
   `tiptapJsonToStandardMarkdown(note.editorDocument)` prepares the portable projection.
   No `getText()` or plain-text extraction was substituted for this document.
5. **Backend:** existing version-checked `export_note_markdown_at_path` writes the
   supplied portable snapshot. Rust/file writing was not the mark-stripping stage.
6. **Physical files:** real native export produced the files listed below.
7. **Import/reopen:** imported the physical Matrix file through the actual NoteFlow
   menu, Windows file picker and import confirmation into a new empty QA note.
   Closed/restarted the EXE normally and read the resulting actual editor document.

Installed TipTap is3.30.5; `@tiptap/markdown` is not installed. This project uses its
existing Marked-backed custom Markdown pipeline. The official `editor.getMarkdown()`
API requires the Markdown extension; it is not a hidden configured serializer here.
No new Markdown dependency was added.

## Native Evidence

Initial corrective QA build ID: `repeat-native-2dae800f765e`.
Initial executable SHA256:
`2D79BF1BE917C3804472591FA3A9F254CDA2CCA02FF967E9CE92B7DD84F65BAA`.
Profile: `com.noteflow.qa.repeatnative`, created without overwriting an existing
profile from a verified synthetic QA DB:10004 notes,0 attachments,0 providers,
0 embedding profiles. Only a loopback synthetic provider was subsequently seeded;
no credentials or user provider profiles were copied. Final EXE metadata follows
below; both the earlier and final native builds are identified explicitly.

All evidence below lives in Git-ignored `releases/qa/`:

- `native-softbreak-before.md`: actual old native export, missing Bold.
- `native-softbreak-after.md`: actual corrected native export, `**Native bold**`.
- `native-softbreak-before-ui.png`: old real editor shows Bold, before export.
- `native-markdown-matrix.md`: physical rich Matrix export, not a test-generated file.
- `native-markdown-matrix-ui-headings.png`, `native-markdown-matrix-ui-lower.png`:
  UI provenance for headings, mixed marks, lists, quotation, code and checklist.
- `native-markdown-matrix-ui-imported.png`: real import into a new empty note.
- `native-document-saved.json`, `native-document-imported.json`,
  `native-document-reopened.json`: read-only DOM/storage stage evidence.
- `native-chat-after.png`: chat opens in the previously refused configuration.
- `native-tag-light.png`, `native-tag-dark.png`: shared chip rendering in both themes.
- `native-toolbar-before-breakpoint.json`: old native density switch.
- `native-toolbar-after.json`:107 native samples over two Computer Use drags,
 31 unchanged controls, `fluid` density only, no observed long task in the drag interval.

The Matrix physically contains H1-H6, partial Bold, nested Bold/Italic, Strike,
bullet and nested lists, an ordered list, blockquote, multiline fenced code,
checklist and a standard external link. Read-only assertions compare its portable
semantics with the actual saved, imported and reopened native documents: **equal**.
Terminal invisible breaks/blank paragraphs are intentionally not a portable
formatting guarantee. Normal storage remains lossless.

**Important measurement limit:** Computer Use drag exposes no configurable speed.
Native frame samples establish observed fast-drag geometry, not a full slow human
drag/CPU profile or hardware input-to-photon certification. Browser tests separately
record slow100-step and fast10-step drags. Remaining native matrix cells are reported
honestly below; they are not inferred from browser emulation.

## Changed Areas

- `src/features/editor/markdownService.ts`: soft-break portability validation.
- `src/shared/editorWorkspaceWidth.ts`: pure typed presentation resolver.
- `src/app/AppShell.tsx`: adaptive chat/list, independent ribbon window minimum,
  preserved editor/chat identity, compact list access and dismissal.
- `src/styles/editor.css`: continuous toolbar geometry and scoped compact panels.
- `src-tauri/tauri.conf.json`: base minimum width900, identity/version unchanged.
- `src/features/tags/tagPalette.ts`, `src/styles/pages.css`: shared soft theme tokens.
- `tests/postRc6Markdown.test.ts`: real Editor-command/save/export/import soft-break
  regressions and exact output assertions; canonical snapshot immutability.
- `tests/editorWorkspaceWidth.test.ts`: viewport/DPI/zoom matrix, immutable preferences,
  honest physically unsupported ribbon widths, dock/overlay selection.
- `tests/tagValidationRegression.test.ts`: actual light/dark foreground-background
  contrast, source color preservation, tint instead of full swatch fill.
- `tests/p12UiPolish.test.ts`: replace the obsolete no-overlay contract with the
  explicitly requested compact-chat policy; native chat resize remains forbidden.
- `scripts/qa/repeat-native-corrective.mjs`, `native-toolbar-frames.mjs`,
  `repeat-native-build-manifest.mjs`: targeted geometry/color/identity checks,
  read-only native measurement and build provenance.
- Existing browser motion/list runners now distinguish physically supported docked
  measurement widths from compact-overlay cases, covered by the new separate matrix.
  No assertions, action counts or security checks were removed.

## Test Gates

Intermediate fresh gates: frontend874/874, Rust291 passed/11 ignored, typecheck,
build, fmt, check, clippy, production audit0, QA EXE, canonical Tauri installers and
diff check passed. These are NOT substituted for final gates after compact-list work.

Intermediate full browser run: first attempt had four failures. One unchanged
settings->RAG navigation timeout passed the subsequent complete272-case runner;
its precise transient scheduling cause is not proved. The other three failures
were obsolete expectations: demand a docked grid animation for an overlay, or a
permanently visible list where the complete ribbon cannot physically coexist.
Docked motion/list tests now use explicit supported widths; compact behavior is
tested separately. Earlier accepted totals:16 runners/1893 assertions plus22 targeted
cases. The original110 final-UI count became128 because more supported docked layouts
exercise their history/source motion branches, not because failing cases were removed.

### Final Gates On The Final Source Fingerprint

| Command / suite | Result |
| --- | --- |
| `npm run typecheck` | AUTOMATED PASS |
| `npm run test` | AUTOMATED PASS:874/874,76 suites,0 failed;73.754s |
| `npm run build` | AUTOMATED PASS;19.95s |
| `cargo fmt --check` | AUTOMATED PASS; no automatic formatting |
| `cargo check` | AUTOMATED PASS |
| `cargo test` | AUTOMATED PASS:291 passed,11 explicitly ignored,0 failed |
| `cargo clippy --all-targets --all-features -- -D warnings` | AUTOMATED PASS |
| `npm audit --omit=dev --offline=false` | AUTOMATED PASS:0 vulnerabilities |
| Full browser regression including the new matrix | BROWSER PASS WITH RETRIES:17 runners/1915 unique cases have passing results. First full attempt:16 runners passed1836 cases; `standard-links-corrective` failed its immediate autofocus assertion. The identical79-case runner then passed three consecutive isolated repeats (85.176s/85.482s/101.979s). This is NOT a clean first-attempt full gate; the flake remains recorded. |
| New compact-chat/tag/continuous-toolbar matrix | Fresh BROWSER PASS:22 cases; included in the17-runner handoff gate;92.62s |
| `npm run tauri build` | AUTOMATED PASS:en-US MSI,ru-RU MSI,NSIS in `src-tauri/target/release/bundle/` |
| Separate isolated native QA EXE | Build PASS; final binary opened and exercised through Computer Use |
| `git diff --check` | PASS, exit0; existing LF/CRLF conversion notices remain |
| Historical release preservation | PASS:12 historical RC5 hashes and4 staged RC6 hashes unchanged |

Frontend baseline870 grew by4 behavioral/presentation regressions. Rust production
source was not changed by this pass; all Rust gates were nevertheless rerun. The
eleven ignored cases were not silently enabled against user credentials/data.
The separate FTS benchmark was explicitly run as described below. No lint script is
configured. Vite still warns that `editorContentSerializer` is imported statically
and dynamically; this existing chunk-splitting warning is not hidden or fixed here.
PowerShell5 wraps Cargo stderr progress as NativeCommandError text in captured logs;
the gate results above are based on actual process exit codes, not those wrappers.

Fresh browser results: `releases/qa/repeat-handoff-full-browser/counts.json`.
Earlier complete results are preserved in `repeat-final-full-browser`; earlier
targeted results in `repeat-native-browser` and `repeat-native-targeted-final.log`.
Final gate logs: `releases/qa/repeat-handoff-*.log`. The final build was performed
after removing two ineffective CSS declarations referencing undefined `--shadow-lg`;
they had no visual effect. All frontend/Rust/security/build gates were rerun.
No stale binary or earlier gate result for a different fingerprint is substituted.

The original full-run `counts.json`, `counts-first-attempt.json`, failure log and
partial results are retained. Repeat records: `standard-links-retries.json` and
three separately saved logs/result files. No production or test code was changed
between those repeats. ModalShell schedules autofocus with requestAnimationFrame,
while this assertion samples activeElement immediately after options appear; that
is a plausible synchronization edge, not a conclusively diagnosed product defect.
This pass does not claim to have eliminated suite flakiness or silently replace
the first failed aggregate with an unqualified green result.

### Final QA Artifact

- Executable: `D:/Projects/NoteFlow/releases/qa/NoteFlow-QA-Native-Smoke.exe`.
- Build ID, also observed in the real native title: **repeat-native-0991feda9ff0**.
- Source SHA256: `0991feda9ff065233d0a5e49aafcd545a9ac6f3477acc87397d4a49b90300dd4`.
- Binary SHA256: `FC95FDBDF4AD8B97BDE81106146C83FCB590A74286B3EC201994B0AAED9D7BA9`.
- Size:21,237,248 bytes.
- Actual executable build timestamp: **2 November2026,10:27:22 Moscow**
  (`2026-11-02T07:27:22.8548603Z`). Source manifest preparation was at
  `2026-11-02T07:23:19.446Z`; it is not misreported as executable build time.
- Provenance: `releases/qa/repeat-handoff-artifact.json`, `repeat-native-build.json`.
  All344 listed source/test/config hashes and the physical EXE hash were verified
  by `repeat-handoff-verify.mjs`. Earlier2dae/7d3 artifacts remain preserved.
- Isolated profile identifier remains `com.noteflow.qa.repeatnative`. Do not use the
  ordinary target/release executable for isolated QA; it uses the real product ID.
- `releases/qa/Start-Final-Native-QA.ps1` starts/reuses only this QA EXE and a synthetic
  loopback provider. It stops only its own child provider when this QA process exits.
  The helper is already running for the open handoff window; it uses no API key.

Canonical application version remains **1.0.0-rc.6** in package/lock/root package,
Cargo/Cargo.lock and Tauri configuration. Canonical productName remains **NoteFlow**,
identifier **com.noteflow.desktop**, MSI mapping **0.99.6**. QA overrides are not a
change to published RC6 or the real profile identifier.

### Final Native Confirmation And Remaining Cells

| Scenario | Status and exact scope |
| --- | --- |
| Real UI-created rich document -> save -> export | NATIVE VERIFIED, including H1-H6, nested/mixed marks, lists, quote, code, checklist, link |
| Physical export -> actual menu/file-picker import into a new empty note -> restart | NATIVE VERIFIED; all supported portable semantics equal the physical file |
| Export after restart in7d3 and final099 builds at160% | NATIVE VERIFIED: `native-markdown-matrix-final.md` and `native-markdown-handoff.md` are byte-identical to the original corrected Matrix export;731 bytes;SHA256 `901514d656dfc51651187cfb0af2c1b61da57f72d202e622e8dd103c75d00b7a`. Final099 export used the actual menu and native Save dialog on the previously imported UI-created document. |
| Compact note list at160% | NATIVE VERIFIED: All Notes opens the drawer; selecting another note closes it and updates the editor |
| Chat opens without layout rejection | NATIVE VERIFIED at100% and160% on the available desktop; no native resize or Focus Mode needed |
| Final099 geometry at160% | NATIVE VERIFIED:31 visible controls, minimum width25.875CSS-px, toolbar height45CSS-px, root scrollWidth=clientWidth=900, toolbar scrollWidth=clientWidth=854, chat overlay within viewport; `native-handoff-geometry-160.json` |
| Native document not rewritten by navigation/zoom/chat/export | NATIVE VERIFIED: original contentVersion remains63, imported note remains1; two sidecars each; supported portable output unchanged |
| Fast native toolbar drag | NATIVE OBSERVED in initial corrective build:107 frames,45CSS-px height, minimum observed target27.34CSS-px, same31-control DOM,0 scroll violations,fluid density only; no long task observed in the sampled drag interval |
| Full slow-human drag / CPU Performance trace | PENDING USER SMOKE; the fast geometry observer is not relabelled as a full CPU profile |
| Tag appearance | NATIVE VERIFIED samples in light/dark and after reopening; all10 curated colors and180 browser-rendered samples tested separately, minimum observed text contrast5.87:1 |
| Real native message send/history | NATIVE VERIFIED after the user's subsequent manual consent: composer enabled at160%; Computer Use typed/sent one synthetic question; the loopback HTTP provider returned its test response; both messages appeared in the real Tauri chat. After normal close/relaunch of final099 and reopening chat, the same two messages/context were visible. Read-only SQLite confirmed one note chat, user+assistant messages and unchanged document/cache/contentVersion63 and1. This validates the real UI/provider/persistence path against a local synthetic fixture, not live Bridge/Ollama quality or streaming. |
| Physical1920/1600/1366 and OS DPI100/125/150 matrix | Available Windows desktop/base DPR1.25 plus real app zoom100/160 exercised; other actual monitors/DPI cells PENDING USER SMOKE. Browser device-scale/viewport matrix is not physical monitor certification. |
| macOS native | PENDING; no Mac was available |

The final099 executable was explicitly closed/opened separately from the earlier
7d3 process. Its real title, physical export and read-only document/cache state
were observed again. The final native export is the imported document exported
after restarting; the earlier original Matrix creation/import evidence remains
identified by its actual stage rather than being described as new typing in099.

The earlier pre-consent screenshot is preserved as
`releases/qa/native-handoff-chat-160.png`; it describes the actual earlier state,
not the final history result. After the user manually accepted, native evidence:
`native-chat-sent-099.png`, `native-chat-reopened-099.png`, and read-only
`native-chat-history-reopened.json`. The QA window is now left open with the
restored test conversation. No privacy confirmation was automated. Document
evidence remains `native-document-handoff.json`; additional read-only checks proved
that sending/reopening chat did not alter Markdown, JSON cache or content versions.
Note chat uses its persisted `chat.note_id` context; its existing `sources_json=[]`
is not a missing RAG snapshot. The source label was visible again after restart.
`repeat-native-roundtrip.ts` rechecked all four actual DOM/storage evidence stages
(saved/imported/reopened/handoff) against the final physical731-byte export, using
the current portable serializer. All portable DOM/cache assertions and sidecar
counts passed; this read-only comparison did not create the native documents.

### Controlled Loading And FTS

Production before fixture: retained `native-smoke-production`; after fixture:
`repeat-native-production`. Three independent alternating series,30 cold and30 warm
samples per side in total, six excluded warmups,126 matching DTO payload records,
10000 metadata notes. No concurrent compiler or other browser test suite ran.
Lightweight evidence inspection occurred; this is a comparative diagnostic, not
a hardware-isolated lab or native input-to-photon measurement.

| DOM-usable mode | Before p50 / p95 ms | After p50 / p95 ms |
| --- | --- | --- |
| Fresh browser process |743.8 /804.9 |704.4 /792.2 |
| Warm |498.2 /566.7 |472.5 /557.3 |

No loading regression was demonstrated by this comparison. Process-cold does not
mean an OS disk-cache flush; IPC is mocked metadata, not native SQLite startup.
Raw data: `releases/qa/loading-validation-repeat-final/results.json`.
This measurement preceded only the removal of the two undefined shadow-token
declarations; it is labelled by its actual fixture/build stage, not silently
claimed to have run on the later099 executable.

Separate existing ignored FTS benchmark, temporary10000-note fixture:
`cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --exact --nocapture`.
PASS: indexing21.051s, query1.0018ms, test21.07s (debug compilation31.74s recorded
separately). This does not claim indexing itself is instantaneous or improved.

### Final Shared Palette

Stored identity/swatch values are unchanged. These are computed chip tokens, not
independent per-page palettes; arbitrary custom colors use the same derivation.

| Existing ID | Source | Light background / text | Dark background / text |
| --- | --- | --- | --- |
| blue |#2563EB |#E5ECFD / #184099 |#1C2C4F / #B3C8F8 |
| sky |#0095DD |#E0F2FB / #006190 |#14374C / #A6DAF3 |
| teal |#009688 |#E0F2F1 / #006258 |#143739 / #A6DAD5 |
| green |#16A34A |#E3F4E9 / #0E6A30 |#183A2C / #ADDFC0 |
| red |#E53935 |#FCE7E7 / #952522 |#462227 / #F6BAB8 |
| amber |#B77900 |#F6EFE0 / #774F00 |#3C301B / #E6D0A6 |
| orange |#EA580C |#FCEBE2 / #983908 |#47291E / #F8C5AA |
| rose |#EC4899 |#FDE9F3 / #992F63 |#47263D / #F8BFDB |
| violet |#7C3AED |#EFE7FD / #51269A |#2F234F / #D1BAF9 |
| slate (historical purple ID) |#B520C9 |#F6E4F9 / #761583 |#3B1D48 / #E5B1EC |

### Final Git And Verdict

Branch and HEAD unchanged. **60 modified,60 untracked,0 staged** (initial57/56/0),
including all earlier unfinished work. No `git add`, commit, tag, push, merge,
version bump or release. No historical QA deletion or published artifact replacement.
Owned dev/preview servers were stopped intentionally after measurements. For the
last handoff, their exact command lines/PIDs were revalidated before stopping only
those four Node server processes; this cleanup is not a failed gate. The isolated QA window/loopback helper
remain available for the user's remaining native checks.

**PENDING USER SMOKE**. The code, fresh automated gates and verifiable QA EXE are
prepared. Markdown and local synthetic chat send/history are genuinely native-verified;
slow-drag/profile and additional physical DPI cells are not marked PASS. This is
not a Stable release approval or a claim that every requested native cell passed.

## Privacy And Limitations

- Standard Markdown exports portable semantics, not underline/color/font size,
  arbitrary appearance, exact terminal soft breaks or sidecar-specific attributes.
- The31-control ribbon needs at least820CSS-px; zoom160% plus a74px rail requires
  at least1386 logical window px before OS scaling. A1366 physical display at150%
  OS scale cannot contain that ribbon at160% app zoom. This is a physical limit,
  not a reason to reject ordinary100% note chat. Browser matrix flags unsupported
  ribbon cells rather than silently shrinking targets/hiding tools.
- Native observations are on the available Windows desktop atDPR1.25. Other actual
  monitor resolutions/OS scaling combinations require user smoke; browser device
  emulation is labelled BROWSER, never NATIVE.
- User privacy confirmation for the loopback model is manual. No privacy permission
  was accepted through automation. Real Bridge/Ollama requests/credentials are not
  part of this local layout smoke.
- Telegram, macOS native and physical slow-drag/CPU-profile validation are NOT
  claimed by this Windows corrective pass.
- One immediate-focus browser assertion failed in the full gate; three unchanged
  isolated repetitions passed. The retained flake should be investigated separately
  before demanding a reliably green first-attempt release gate.
- No historical QA files, published artifacts or user notes were deleted. All
  temporary notes/assets/profiles are synthetic and remain isolated for reproducibility.

## References

- [TipTap Markdown editor API](https://tiptap.dev/docs/editor/markdown/api/editor)
- [TipTap Markdown basic usage](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage)
- [Primer Label](https://primer.style/product/components/label/)
- [Atlassian Lozenge](https://atlassian.design/components/lozenge)
- [Notion database properties](https://www.notion.com/en-gb/help/database-properties)

The chip design applies restrained tint/foreground roles and preserved user color
identity. It does not claim that NoteFlow's generated palette is copied from any
of those products or that their numeric color values are NoteFlow's tokens.
