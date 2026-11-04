# Windows Native Smoke Corrective Pass

> Follow-up: see [Repeat Native Smoke Corrective Pass](windows-native-smoke-repeat-corrective.md).
> The later report supersedes this earlier handoff for the newly reproduced export,
> chat-layout, toolbar-density and tag-saturation defects.

Date: 1 November 2026. Branch: `codex/post-rc6-markdown-performance`.
HEAD: `42cdf9cca1371eac49c5645f6f82036d63b65b50`. Application: **1.0.0-rc.6**.
This is development, not a release. No Git add/commit/push/merge/tag or version bump.
The initial tree already contained 49 modified and 44 untracked files; prior work is retained.

## Evidence And Scope

The request referenced screenshots and an exported Markdown file, but neither binary was
attached to this task. The user supplied a text excerpt containing Cyrillic, NBSP/blank
lines, three list items and a long blockquote. It does not contain bold/italic delimiters
or the original rich document, so it cannot prove where those particular marks disappeared.
A synthetic equivalent is now tested through repeated parse/export/import cycles.
No private user database, attachments, profile secrets or provider requests were used.

## Root Cause Analysis And Fixes

| Area | Confirmed code path / problem | Correction and qualification |
| --- | --- | --- |
| Markdown mixed marks | Crossing bold/italic boundaries can generate ambiguous contiguous stars. The portability check then simplifies affected groups, losing representable marks. | Retry standard `_` emphasis with a fixed nesting order and validate by parsing before simplifying. Actual export text and repeated editor roundtrips are asserted. |
| Markdown code fences | Block-start detection recognized only triple backticks, although the parser also accepted tilde/long fences. A fence after text could be absorbed into a paragraph. Canonical serialization always emitted only three backticks. | One fence recognizer is used by block detection and parsing, with up to three spaces indentation; closing fences match type/length. Both canonical and portable serializers choose a sufficiently long fence. |
| Nested quote persistence | Canonical quote serialization treated children as inline content, flattening headings, nested lists and code inside quotes. Portable output alone did not fix save/reopen. | Recursively serialize quoted blocks through the same existing block serializer in canonical and portable modes. |
| Markdown paste detection | Standalone italic/underscore emphasis and H4-H6 were not reliably recognized by the detector. Source editors can publish highlighted code HTML alongside Markdown plain text. | Keep source-HTML detection, extend heading detection and confirm inline marks with the existing parser. Real rich HTML retains priority unless explicit Markdown MIME/command is used; code contexts remain literal. |
| Clipboard | Default ProseMirror text/plain and context-menu copy contained plain visible text, not Markdown. | Share `editorClipboardMarkdown` between normal copy serialization and context copy/cut. Normal ProseMirror HTML clipboard remains available. Add explicit `Вставить как Markdown` to the existing context menu and existing guarded asynchronous paste flow. |
| Quote / code scope | Standard TipTap toggle commands operate on complete textblocks even for a partial text selection. Code schema does not allow inline marks. | Replace only the selected closed fragment, retaining cut siblings/ancestors. With an empty cursor, insert an empty focused block and preserve suffix. Code rich source is validated data in the existing sidecar, never rendered HTML, bound to canonical Markdown and code text. |
| Code reversal | Marks and structure are normally erased on conversion to code. | Preserve a bounded rich source; restore across save/reopen and Undo/Redo. Map unambiguous single-textblock edits back into source. Ambiguous structural edits invalidate restoration rather than resurrect stale content; see limitations. |
| Window mode | Both layout effects and prepareWidth called native setMinSize unconditionally, then potentially setSize, without checking native mode. | Never issue either resizing call in Maximized/Fullscreen. Reject an unsupported width without leaving that mode. Reapply minimum after an observed return to normal mode. Serialize jobs and check cancellation. Native symptom/cure still requires user validation. |
| Tag duplicates | UI/storage checks lacked NFC equivalence; checking before a separate write allowed cross-connection races. A disabled button did not explain the duplicate during typing. | Normalize comparison keys consistently, retain historical spelling, display exact duplicate error, use SQLite IMMEDIATE transactions for create/rename/update. No migration or destructive de-duplication. |
| Tag saturation | Tag chips blended the source color at 12%, unlike full-color swatches. | Use the shared exact tag color in all chip locations, choose black/white foreground by luminance (all curated/custom test colors >=4.5 contrast), keep chip shape and accessible focus. |
| Validation modal | A single-line minimum feedback slot could expand when a message wrapped. | Reserve two lines in the shared EntityNameCounter, retain the same feedback DOM node for all states and historical long names. Covers note/project/tag consumers. |
| Link input clipping | The input was a shrinkable flex child of the constrained scrolling modal body, with insufficient top clearance. | Prevent vertical flex shrink, retain standard control min-height, add modal-body top clearance/scroll margin. Check actual rectangles/focus at 100/160%, both themes. |
| Escape with retained editor focus | Full regression exposed find's document-capture handler consuming Escape before a formatting popover's bubble handler. Table menus could remain open. | Yield Escape to the shared popover/modal layer first. A mounted real MenuPopover test verifies first Escape closes it, second closes find, with zero document changes/autosaves. The table fixture explicitly clicks its cell instead of relying on mount-effect timing; all 86 assertions are retained. |
| Sidebar drag | Every pointermove immediately updated parent state. | Accumulate deltas per requestAnimationFrame; flush on pointerup/cancel/lost capture; cancel on unmount. Existing 250ms settings debounce is retained, no drag transition is introduced. |
| Export / texts | Export explanatory block remained; saved-note success had trailing period; chat contained `default provider` in Russian copy. | Remove only the explanatory block, remove the period in UI/backend results, add typed RU/EN message keyed to existing UiSettings.language. No app-wide translation infrastructure existed, so no fictitious existing translator is claimed. |

## Markdown Architecture And Evidence

TipTap is pinned to **3.30.5**. `@tiptap/markdown` is not installed/configured. Its
`getMarkdown()` / `contentType: markdown` API requires the extension and custom-node
handlers; adding it here would introduce another parser and require a broad migration.
The existing Marked-backed parser and shared serializer are retained instead. Official
reference: https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension

Portable export is still a projection, NOT the canonical-storage source. Sidecars and
backups remain necessary for underline, highlight, colors, sizes, alignment and advanced
tables. `++text++` was considered but deliberately not introduced into CommonMark/GFM:
existing literal-plus text must not silently become underlined. Old allowlisted HTML
imports remain readable; ordinary note loading is not a destructive data migration.

Regression examples include:

```markdown
**Стоимость следующая -**

Текст **жирный** и *курсив*.

- пункт
- второй

> Цитата
```

The P0 source has underline on a subrange of the bold phrase; portable output preserves
the complete bold phrase without `****` corruption, while NoteFlow sidecar retains
underline. Crossing marks, escaping, Unicode, nested quoted lists/code, long fences,
tables, internal links, managed attachments and surrounding paste content are tested.
Repeated file import/export and actual ProseMirror DOM paste are compared semantically.
No getText()/HTML-stripping export was introduced.

Regular keyboard copy retains ProseMirror text/html and now supplies Markdown in
text/plain; this is exercised through browser clipboard permissions. The existing
context-menu text writer remains Markdown-only (it does not add a new native CF_HTML
writer). Telegram compatibility is therefore not certified for either route.
Explicit native Markdown paste asks the existing clipboard command for text only,
so a file/image clipboard cannot import orphan assets through that text action;
the mounted IPC regression checks `plainTextOnly: true` and the inserted strong mark.

## Performance And Native Limits

The resize behavior test measures update coalescing, not milliseconds: movements from
100 ->101 ->110 before one frame produce one +10 callback; final +5 is flushed at
pointerup and no uncaptured/unmounted callback runs. This confirms bounded callback
frequency, NOT physical smoothness or a native latency improvement.

No fresh controlled native before/after timing or physical input-to-photon measurement
was obtained in this pass. Previous loading/typing numbers are historical evidence,
not reused as new PASS. Long-document Worker/CAS/search regressions are rerun, but
subjective responsiveness, OS/DPI/monitor changes and native window modes remain
**PENDING USER SMOKE**. Do not claim that all latency complaints are solved.

Code restoration has an explicit safety limit: structural/newline edits that cannot
unambiguously map back into the original rich tree discard restorable metadata and
toggle to current plain paragraphs. Current text is never replaced by an old snapshot.
Undo/revisions/backups remain available. This is not a promise of exact original
formatting after arbitrary restructuring of code. Unsupported atomic selections are
rejected without deleting their content. Snapshot validation is bounded to 20k nodes,
2M text code units and depth64.

A partial paragraph is intentionally split into sibling blocks to isolate the selected
quote/code. Reversing that block retains those paragraph boundaries rather than merging
neighbors that may have been edited independently. Undo restores the exact pre-command
document. This is distinct from preserving marks and the selected rich fragment.

Project ZIP/legacy backend export still uses its existing representation; this pass
does not claim a new universal portability contract for every old backend export.
Telegram, macOS native, actual VS Code UI clipboard and Windows close/restart were
not newly certified. Browser-generated clipboard is not a Telegram/native PASS.

## Changed Files

- `markdownService.ts`, `editorPaste.ts`, `editorClipboardMarkdown.ts`: coherent Markdown detection, fences, quotes, mixed marks and copy/paste.
- `editorBlockCommands.ts`, `codeBlockSource.ts`, `codeBlockRestoration.ts`, `editorFormattingCommands.ts`, `editorContentSerializer.ts`, `EditorArea.tsx`: scoped block commands, sidecar restoration, shared clipboard/paste entry points.
- `editorNativeWindowSize.ts`, `useEditorWindowMinimum.ts`, `ResizeHandle.tsx`: mode-aware sizing and bounded drag updates.
- `TagEditorModal.tsx`, `tagEditor.ts`, `tagPalette.ts`, `EntityNameCounter.tsx`, scoped editor/pages CSS: tags, validation and link-input layout.
- `data.rs`, `Cargo.toml/lock`: transactional Unicode tag uniqueness, saved-note wording. ICU2.2 already existed transitively in lockfile; now declared directly for NFC, not a new alternative storage system.
- `NoteExportDialog.tsx`, `NoteChatPanel.tsx`, `uiMessages.ts`, `AppShell.tsx`: requested text removal/localization and integration.
- Behavioral tests plus exact-label/order assertions in existing tests; QA fixture and browser clipboard expectation match the new Markdown text/plain contract. No old test removed or disabled.

## Verification

Final raw logs are under ignored `releases/qa/native-smoke-*`. Browser attempts retain
nonzero exits in logs until their successful reruns. Initial localhost refusals and a
PowerShell stderr-warning interruption were not silently counted as PASS. The later
table-menu Escape failure was a real interaction bug, fixed and regression-tested as
described above; it was not dismissed as infrastructure.

| Final gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **870/870 PASS**, 76 suites, 0 failed/skipped, 34.211s |
| `npm run build` | PASS |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS |
| `cargo test` | **291 PASS / 11 ignored**, 0 failed |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| `npm audit --omit=dev --offline=false` | **0 production vulnerabilities** |
| Full existing browser aggregate | **1851/1851 PASS**, including 202 strict-toolbar and 7 Worker/persistence cases |
| Additional geometry / selected-block browser cases | **24/24 PASS**, both themes, 100/160%, heights700/1440, picker100 notes |
| Browser total | **1875/1875 PASS** |
| `npm run tauri build` | PASS: en-US MSI, ru-RU MSI and NSIS, local target outputs only |
| Separate QA executable build | PASS, own synthetic profile |
| `git diff --check` | PASS; informational LF-to-CRLF notices only |
| Windows native user assessment | **PENDING USER SMOKE**, not self-certified |
| macOS native / Telegram / actual VS Code UI / physical latency | **NOT VALIDATED** |

Frontend baseline was812; the additional58 tests are behavioral/roundtrip/control cases.
Rust baseline288 grew by3 real storage-uniqueness integration tests. The11 ignored Rust
cases remain explicit environment/live-provider/fixture-seeding/benchmark cases; no
new regular test was disabled. Live credential-dependent ignored tests were not run
against a user profile. Browser acceptance is aggregated from the complete15 suites
and targeted reruns; `native-smoke-browser/accepted-summary.json` records the accepted
results, not a claim that every intermediate orchestration attempt exited zero.

The existing Vite warning about a serializer imported both statically and dynamically
remains. It is not a failed build or a new native latency measurement. No chunking
refactor was smuggled into this corrective pass.

Windows user checklist: `releases/qa/SmokeCorrectiveChecklist.md`. Isolated build target:
`releases/qa/NoteFlow-QA-Smoke-Corrective.exe`, identifier `com.noteflow.qa.smokecorrective`.
New synthetic profile: 10,003 notes, zero attachments/chat providers/embedding profiles.
No existing profile was overwritten. Final Windows native assessment belongs to the user.

QA executable ProductName: **NoteFlow QA Smoke Corrective**, version **1.0.0-rc.6**.
Final SHA-256: `DDE669435CA899758BB5115C1D6771171E411A1FE0E15E779CE9C61912F27EEF`.
Do not use the regular target/release executable for this isolated profile.

## Final Controlled Loading Comparison

After final compilation and all other browser suites finished, reran the existing
controlled observer benchmark against the retained previous-pass production fixture
(`final2-native-validation-after`, before) and the final current production fixture
(`native-smoke-production`, after). Idle preview servers only; no owned compiler or
other browser suite ran concurrently. Three independent series; n30 in each cell,
six warmups excluded,126 matching DTO payload hashes, 10k metadata notes.

| Mode / side | Minimum ms | p50 ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: |
| Process-cold / before | 326.6 | 388.6 | 443.3 | 454.5 |
| Process-cold / after | 324.5 | 377.5 | 432.0 | 446.2 |
| Warm / before | 154.0 | 189.6 | 232.5 | 242.2 |
| Warm / after | 165.5 | 194.6 | 227.2 | 233.2 |

No material loading regression is demonstrated by this distribution. Warm median is
5ms higher, not universally faster. These are internal browser DOM-usable timestamps
with mocked metadata IPC, NOT native SQLite startup or hardware input-to-paint.
Process-cold means fresh browser process, not flushed OS disk cache. Raw evidence:
`releases/qa/loading-validation-native-smoke-final/results.json`.
The earlier intermediate run is retained separately, not substituted for this one.
Source typing latency in very large converted code blocks was not separately profiled;
the rich-source mapping safety limits are not a latency guarantee.

## Handoff

**READY FOR USER SMOKE** means the available automated gates passed and a separate
QA build is ready. It does not mean Windows Native Smoke = PASS, physical responsiveness
is certified, every CommonMark edge case is implemented, or Stable publication is approved.
The user's real rich document/file that allegedly lost marks remains necessary to
certify that exact case; the supplied excerpt alone has no original mark information.
Use the checklist above for actual native state, input, clipboard and restart validation.

All12 RC5/historical preservation hashes and all4 staged RC6 hashes still match.
No release artifact was published or copied into published staging. No user profile
was overwritten, no credentials were accessed, no historical QA file was deleted.
No Git add/commit/push/merge/tag, version bump or GitHub release was performed.

Final Git status: **57 modified / 56 untracked / 0 staged**, including all previously
uncommitted work. Branch and HEAD remain as stated above. Version remains1.0.0-rc.6,
canonical productName NoteFlow, identifier com.noteflow.desktop, MSI0.99.6.
Owned dev/preview servers were intentionally stopped after measurements; their Ctrl+C
exit statuses are not build/test failures. No native user application was terminated.
