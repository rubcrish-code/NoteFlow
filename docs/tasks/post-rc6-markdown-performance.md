# Post-RC6 Markdown, Visual Stability and Performance Corrective Pass

Date: 28 October 2026. Branch: `codex/post-rc6-markdown-performance`.
Base: `42cdf9cca1371eac49c5645f6f82036d63b65b50` (`v1.0.0-rc.6`).
Application: **1.0.0-rc.6**, MSI: **0.99.6**. This is not a release.

Latest follow-up: **Windows Native Smoke Corrective Pass**, detailed in [windows-native-smoke-corrective.md](windows-native-smoke-corrective.md). Earlier verdicts below are chronological history, not certification of the new changes. Windows native acceptance remains with the user.

## 1. Executive Summary

The tag, validation, Markdown paste/export and Link Picker corrections are implemented. Windows native Ctrl+V and context-menu paste produced identical persisted documents. The actual native-exported file is ordinary CommonMark/GFM without HTML.

Performance is **PARTIALLY IMPROVED, NOT CLOSED**. Rendering the entire note list was a demonstrated bottleneck; virtualization substantially reduces large-list startup and memory. Duplicate inline validation within a save was removed without changing canonical output. Long-document input still causes measurable main-thread work, including in optimized native Tauri. A speculative cross-save memo did not establish a production benefit and was removed. The final verdict is **NEEDS MORE WORK**, not a claim that all responsiveness problems have been resolved.

User data, credentials, published installers and historical QA files were not changed. No staging, commit, push, merge, tag, version bump or release was performed.

## 2. User Reports and Scope

Six reports were investigated: indistinct tag colors; validation-induced form movement; Markdown source being pasted as code; HTML in portable Markdown; clipped Link Picker input; reduced responsiveness. No AI/provider, schema/migration, CAS, backup policy, revision retention, attachment ownership or Sidebar motion redesign was undertaken.

The current HTML reference, product specification and the two required DOCX documents were read. Historical task/release reports were used as verification evidence, not as a replacement design source. The initial tracked tree was clean; seven historical untracked QA/report files were retained. The working branch was created from freshly fetched canonical release HEAD.

## 3. Root Causes

| Issue | Cause | Retained correction |
| --- | --- | --- |
| Dull chips | Only 12% of the stored color reached the chip background; several palette families were close | Stronger, distinct palette and 26% background mix; chip shape unchanged |
| Form jump | Conditional error text introduced another layout row after validation | Permanent counter/feedback rows in `EntityNameCounter` |
| Markdown pasted as code | HTML had priority even when PRE/CODE/SPAN merely represented highlighted Markdown source | Shared clipboard-format arbitration before the existing Markdown parser |
| HTML in .md | Lossless inline HTML fallback was also used by the portable exporter | Separate portable document projection; plain-text fallback instead of HTML |
| Link input clipping | Input was flush with the overflowing modal body; `scrollIntoView` could scroll ancestors | Scoped top clearance and list-only scrolling |
| Large lists/input | Every note card mounted; repeated inline validation during save; whole-document serialization and React/DOM work on edits | Headless list virtualization, per-save projection sharing, reduced TipTap transaction rerenders; remaining long-input cost documented |

## 4. Tag Color Improvements

| Color | HEX |
| --- | --- |
| Blue | `#2563EB` |
| Sky | `#0095DD` |
| Teal | `#009688` |
| Green | `#16A34A` |
| Red | `#E53935` |
| Amber | `#B77900` |
| Orange | `#EA580C` |
| Rose | `#EC4899` |
| Violet | `#7C3AED` |
| Magenta | `#B520C9` |

Only color rules changed. Accepted RC5 chips retain 6px radius, 2px/7px padding, no border and existing typography/geometry. Existing stored HEX values and legacy color mappings are not migrated or overwritten. An unmatched old HEX remains available as the current color. Palette IDs remain stable; `slate` is the existing slot now offered as magenta, not a rewrite of saved tags.

Actual rendered background distances were measured in OKLab, scaled by 100 (not CIEDE2000):

| Theme | RC6 minimum / mean | New minimum / mean |
| --- | --- | --- |
| Light | 0.810 / 2.614 | 2.602 / 7.424 |
| Dark | 0.941 / 3.578 | 3.262 / 9.131 |

Text contrast in the fresh vision runner: light 5.71–7.04, dark 5.83–6.40. The runner covers normal and four simulated color-vision modes. Simulation and color distances are not a promise of absolute color-only distinguishability; labels remain essential. Windows native palette inspection covered light 100% and dark 160%; a red tag was created, saved and verified after restart as `#E53935`.

## 5. Modal Layout Stability

`EntityNameCounter` always reserves a separate feedback line. New Note, create/edit Project, create/edit Tag and inline Note rename use the same component. No absolute overlay or overflow masking was introduced. Validation remains 25 Unicode grapheme clusters; input is neither truncated nor silently normalized into a valid shorter name. Legacy long names remain compatible.

Browser geometry covers 0/24/25/26/30 characters and correction to 25 in five modal forms, plus a separate inline-rename case. Modal, heading, input and footer positions/heights remain within the existing 1 physical-pixel tolerance. The inline test isolates feedback height from legitimate heading wrapping and confirms no document autosave. Windows native checks verified Note and Tag creation in light 100%, Project creation in optimized Tauri dark 160%, disabled submission on overflow and recovery after correction. All rename/theme/viewport combinations are browser coverage, not a claim of an exhaustive native matrix.

## 6. Markdown Clipboard Architecture

`editorPaste.ts` owns shared dispatch for browser paste and the asynchronous native/context path. Priority is: existing files/images; raw text in an existing code context; explicit `text/markdown`; recognizable Markdown in plain text, with absent HTML or a matching source-style HTML wrapper; otherwise genuine rich HTML; otherwise ordinary text.

PRE/CODE/SPAN wrappers are treated as source only when their normalized text matches plain text and they do not contain semantic rich elements. A genuinely formatted HTML document remains rich. Both input routes use the existing Markdown-first parser and ProseMirror insertion/history machinery. Existing asynchronous document/selection/generation guards remain.

Windows backend reads registered `text/markdown`/`Markdown` UTF-8 formats through the platform clipboard abstraction. No API keys or clipboard content are logged. Limits are 4 MiB per text format, checked before parsing. Native sequence checks, file/image priority and bounded bitmap handling are retained. HTML is parsed inertly, active elements and event attributes are removed, remote images are not loaded, and schema/link validation still applies.

## 7. Ctrl+V Behavior

Unit/integration tests use real TipTap editors and DOM paste events for plain text, explicit Markdown, PRE/CODE and styled DIV/SPAN wrappers. The full user fixture becomes headings, an ordered list, a quote, task list, a single genuine code block and a table. Start/middle/end, selection replacement, list/table insertion, single Undo/Redo, malformed input, size limits and code-context raw insertion are covered.

Windows native: the supplied synthetic fixture was opened in Notepad, selected and copied there, then pasted with Ctrl+V into an empty QA note. It did not become one code block. Native copying from actual VS Code/browser source wrappers was not separately performed; those formats have DOM/browser coverage.

## 8. Context Menu Paste Behavior

Windows native: a second empty QA note received the same system clipboard via the actual NoteFlow right-click menu's `Вставить`. Both notes persisted identical JSON and canonical Markdown: SHA-256 `e2a5ffb07a87963681452cf6c98b3079d7d8a453f0117beb47834cd36ca2fa55`, 1537 Markdown characters, 16 top-level blocks. Each had `content_version = 1`; export, Link Picker navigation, search/clear and restart did not increment it.

Browser tests also compare keyboard and context paste using the actual browser clipboard at 100%/160%. Native insertion inside already populated content and native Undo/Redo were not exhaustively repeated; actual TipTap behavioral tests cover those insertion/history cases.

## 9. Pure Markdown Export

`portableMarkdown.ts` creates a non-mutating projection for `.md` only. Standard marks use `**`, `*`, `~~`, backticks and ordinary links. Blocks use headings, lists, task markers, quotes, adaptive code fences and GFM tables. Multiline/multiparagraph table cells are separated rather than concatenated. Unsafe image destinations degrade to their label. Managed attachment references still pass through the existing backend resource-rewrite flow, without a new attachment architecture.

The canonical serializer keeps its lossless fallback. No storage migration, destructive rewrite or regex postprocessing of completed Markdown was added. Ordinary save, sidecar, backup and project ZIP paths retain their lossless representation. This distinction is documented in README without changing its release version.

## 10. User Fixture Verification

`tests/fixtures/post-rc6-user.md` contains the full supplied planning/Pomodoro fixture, including all three unaligned GFM table columns. A separate historical golden fixture with aligned columns remains unchanged. No standalone `в.md` file was provided; the attached document's actual body is the fixture source.

Native export used the real format picker and Windows Save dialog. Actual file: `releases/qa/post-rc6-native-export.md` (ignored). It was read as text: `#`/`##`/`###`, partial emphasis, quote, ordered/task lists, JavaScript fence, table pipes and external Markdown link; no HTML tags, JSON or NoteFlow wrappers. Behavioral tests compare the full supported document structure, not just substring presence.

## 11. Unsupported Formatting Handling

Underline, colors, custom highlight/font/alignment, merged/multiblock cell appearance and special blocks cannot all be expressed by pure CommonMark/GFM. The export dialog now states `Чистый Markdown без HTML`, lists applicable losses and recommends backup for full appearance. Unsupported marks become text; callouts become quotes, details flatten, interactive dates/formula-like nodes become readable text, and unavailable images become labels. Unrepresentable emphasis ranges fall back safely without corrupting words. Internal links remain documented NoteFlow URIs and carry a profile-dependence warning.

This is deliberate portability loss in the exported copy, not data loss during ordinary NoteFlow save. No claim is made that pure `.md` preserves all advanced formatting.

## 12. Markdown Roundtrip

Supported fixture semantics survive Document → save/load → standard export → import. Tests cover partial/nested/adjacent marks, punctuation, Cyrillic, links, escaping, code, lists, tables, internal/fragment URIs and canonical sidecars. The P0 case `Стоимость следующая -` retains its exact text and canonical partial underline; portable output uses normal bold without corrupt `****` sequences. Old safe HTML exports still import; opening/searching a stored note does not rewrite its source.

Portable tests formerly expecting exported `<u>`/`<mark>` were updated to the new explicit product policy, with separate stronger canonical equality assertions. Existing lossless assertions were not removed. Native reimport of the exported file and external Markdown-viewer rendering were not separately repeated. Rich-text clipboard and Telegram were not changed or tested in this pass; ordinary Markdown paste into Telegram is not promised to format automatically.

## 13. Link Picker Geometry

`NoteLinkPicker` no longer calls option `scrollIntoView`. Only its list's scroll position changes when keyboard selection leaves the visible list bounds; CSS zoom is accounted for. Scoped body padding gives the input/focus ring top clearance. No global overflow suppression was added.

Before: input top equalled overflowing body top; its focus decoration extended above it. Fresh browser tests cover 1100/1440/1920, 100%/160%, both themes, initial results, keyboard wrapping, filtering, clearing and no page overflow. Existing pagination/large-database tests remain. Native light 100% and optimized dark 160% show the whole field/ring; filtering and clearing restore the expected list.

## 14. Performance Baseline and Method

Windows, Intel Core i5-13420H (8 cores/12 threads), 16.85 GB physical RAM, Node 24.15.0, React 19, Edge 156.0.4314.50 via bundled Playwright. Browser viewport 1440×900. Development, production-browser and native results are separate. Published RC6 production sources were read via `git archive` into an ignored source copy, then built with the same synthetic QA entry and installed runtime dependencies. No Git checkout/reset or production telemetry was used.

Three page loads per list size separate the first navigation from two reloads in raw JSON. UI actions have 12 samples, typing 20, microbenchmarks 15. The final sequential production pair uses nearest-rank p50/p95 and retains every duration in `samplesMs`, plus browser/Node versions. Earlier exploratory aggregates used the upper median for even sample counts; they are not substituted for the final table. Browser click-to-ready timings include automation/IPC scheduling and two animation frames; separate keyboard-event-to-double-RAF timings avoid the Node protocol interval. These are browser-page loads, not OS process startup. Small n means p95 often equals max; cold lazy imports are not hidden. Profiler commit counts are meaningful in development only, not zero-cost production evidence.

Accepted production before/after measurements ran without a compiler, Tauri dev/native QA or a competing QA runner. The final pair ran sequentially after stopping the owned QA processes. Background OS/user applications were not terminated or hard-isolated; absolute values varied substantially between passes, and a thermal/scheduler cause was not proven. Interrupted/overlapping experimental runs are retained but excluded from accepted comparisons. Native timings are after-only, on a separate production-optimized QA identifier. Automated access-tree/screenshot capture can affect their scheduling; native before/after distributions are not claimed.

## 15. Bottlenecks

1. **Confirmed high impact:** all note cards mounted; 10k lists took seconds and substantial JS heap. Addressed with virtualization.
2. **Confirmed redundant work:** canonical inline validation was repeated for Markdown and sidecar extraction. Addressed within one immutable save snapshot.
3. **Confirmed residual:** full JSON/HTML/Markdown/sidecar/preview derivation and React/DOM updates still occur synchronously on long-document edits. Native 1000-paragraph input still produces >50ms tasks. Not closed.
4. Cold lazy-feature loading and occasional scheduling outliers remain visible in p95. Ordinary small-note actions are not uniformly faster; no universal latency claim is made.
5. Existing initial workspace hydration still obtains full notes. Virtualization removes DOM cost, not a complete metadata-only/lazy-content architecture. The large synthetic IPC benchmark does not prove SQLite hydration is free.

## 16. Retained Optimizations and Rejected Experiment

`@tanstack/react-virtual@3.14.23` is the one new direct production dependency (headless; no visual library), with locked `@tanstack/virtual-core@3.19.8`. It is justified by the measured 10k-card bottleneck. Lists above 200 notes use dynamically measured rows, overscan, focused-row retention and keyboard scroll/focus; smaller lists and FTS results keep their existing path. Browser tests reach item 9999 and return focus to item 0 with fewer than 100 mounted cards. Native 10,003-note QA mounted 20 cards without root overflow.

`useEditor` avoids automatic rerenders on every transaction. Existing toolbar subscriptions and document-change handling remain. One save-local WeakMap shares inline projection between Markdown and sidecars; it never persists between edits. No autosave delay, CAS, transaction, revision cadence or note-reload policy changed. Sidebar 240ms/easing, fluid New Note, manual resize and reduced motion were not modified.

A bounded exact-content cross-save memo was prototyped and tested for canonical equivalence. Its production run did not establish better input-to-paint (54.6/80.0ms p50/p95 versus retained 47.4/77.3ms); scheduler variance prevents declaring a proven regression, but it does not justify extra complexity. The prototype and its test were removed. Experimental build/results remain ignored, not counted as the final gate.

## 17. Before/After Metrics

All times below are milliseconds. Raw results are retained under ignored `releases/qa/post-rc6-perf-*`.

| Production browser action | n | RC6 p50 / p95 | Retained changes p50 / p95 |
| --- | --- | --- | --- |
| Page load, 2 notes | 3 | 206.9 / 473.4 | 203.9 / 463.8 |
| Page load, 1,000 notes | 3 | 1135.2 / 1181.3 | 260.2 / 433.6 |
| Page load, 10,000 notes | 3 | 7983.9 / 10440.3 | 391.7 / 572.6 |
| New Note ready | 12 | 85.3 / 216.6 | 78.0 / 204.1 |
| Note menu ready | 12 | 63.3 / 78.3 | 57.3 / 96.2 |
| Settings ready | 12 | 76.6 / 420.8 | 93.4 / 406.5 |
| Link Picker ready | 12 | 108.2 / 160.8 | 130.2 / 187.8 |
| Note switch | 12 | 79.9 / 125.5 | 79.0 / 176.4 |
| Note chat panel ready | 12 | 172.7 / 237.5 | 181.0 / 236.2 |
| Sidebar collapse first paint | 12 | 132.9 / 212.1 | 157.9 / 214.1 |
| Projects ready | 12 | 68.8 / 377.5 | 68.6 / 368.0 |
| Tags ready | 12 | 78.8 / 373.3 | 75.6 / 381.5 |
| Tag dialog ready | 12 | 90.5 / 132.6 | 74.3 / 97.5 |
| Short input, event → paint | 20 | 15.4 / 23.5 | 12.1 / 15.0 |
| 1,000-paragraph input, event → paint | 20 | 90.6 / 124.9 | 71.2 / 107.3 |

For document loads and 12-sample actions, the p95 above is also the measured maximum. Short typing max: 30.8 → 23.6ms. Long typing max: 156.7 → 108.4ms. Protocol-inclusive long typing: p50 212.9 → 195.3, p95 275.7 → 236.1, max 332.6 → 238.0 (not mixed with event-to-paint). Settings/Link Picker/note-switch/Sidebar distributions do not establish a universal improvement and require further investigation, not a blanket PASS on performance.

Final 10k-note production-browser heap: **177,383,331 → 34,583,541 bytes**; this is JS heap, not total process RAM. The earlier independent production pair measured 4234.9 → 234.1ms 10k load and 64.7 → 47.4ms long-input upper median, but long-input p95 73.4 → 77.3ms did not improve. Both passes support the list-rendering improvement, not uniform latency wins. Development 10k page-load median: **5417.1 → 371.0ms**, p95 **5463.3 → 551.3ms**. Earlier development long-input protocol-inclusive upper median/p95: **152.2/179.3 → 143.6/172.8ms**. Dev commit samples generally fell from an initial two to one per input; IPC did not show duplicate Link Picker reads. Cold feature commits/imports are separately retained in raw output, not asserted to be eliminated.

Isolated serializer microbenchmark, 1000 paragraphs, n=15: p50 **38.76 → 23.73ms**, p95/max **49.72 → 28.23ms**. Export microbenchmark: 25.58/36.36 → 27.45/34.99ms; no uniform export speedup is claimed.

Native after-only: 10,003 notes + 1000 paragraphs, 20 mounted cards, no root overflow. Twelve key samples with access-tree observations: nearest-rank p50 **83.5**, p95/max **102.6ms**, minimum 67.7ms. Six screenshot-only samples: p50 **77.8**, p95/max **98.1ms**, minimum 60.1ms. Both retain noticeable long-input cost; neither capture mode establishes uninstrumented native latency. A single All Notes/long-editor mount measured 409.4ms with 266/136ms tasks; n=1 is diagnostic, not a startup percentile. Heap samples were 21–46 MB; not a leak/soak-test conclusion. Raw timings contain no note content.

## 18. Windows Native QA

**WINDOWS NATIVE PASS (scoped functional checks):** real Ctrl+V and context-menu fixture paste, identical stored output, actual system-dialog `.md` export, Note/Tag validation and Project validation recovery, palette light/dark, persistence across restart, same-ID content display, Link Picker visibility at 100%/160%, initial list/filter/clear, no extra content-version increments, 10,003-note virtual list and long-note typing in optimized Tauri.

Dev used a unique QA identifier plus `NOTEFLOW_DEV_DATA_DIR`. Production used a copied optimized executable with identifier `com.noteflow.qa.postrc6production`; it does not rely on the debug-only data-dir environment variable. Only the synthetic QA DB was transferred through SQLite's backup API (including WAL), never the real user profile. The initial plain DB-file copy omitted WAL state and produced an empty QA profile; that setup attempt was discarded, not mistaken for a product data-loss bug. No existing user credentials were edited; the QA profile has no providers. The temporary diagnostic port was local and scoped to the QA process. UI actions used Computer Use; CDP only installed/read timing listeners and DOM geometry counters.

Native vs browser evidence is not interchangeable. Native reimport, native mixed-content insertion/Undo matrix, actual VS Code/browser clipboard sources, native 1k-note separate profile, image/table latency distributions, repeated OS cold launches and long-session memory soak remain **NOT VALIDATED**. Bridge/Ollama live requests were not made; their unit/integration regressions passed, not live-provider smoke.

## 19. macOS Compatibility Review

**MACOS NATIVE QA: PENDING.** Parser, portable projection, React form/geometry and virtualization changes are platform-neutral. Existing arboard/native abstraction, managed paths and Tauri exports remain. Browser paste supports `text/markdown`; explicit native-only Markdown registered-format reading was added only to Windows behind `cfg(windows)`. macOS still has its existing plain/HTML fallback; native Markdown-only UTI handling was not implemented or claimed. No absolute Windows path was added to production functionality. Windows QA is not approval for a cross-platform stable release.

## 20. Automated Results

Final frontend rerun after removal of the rejected memo completed. The rejected prototype is not present in the retained source; the final deterministic frontend asset names match the retained-code Tauri/browser build. Gates executed in this pass:

| Gate | Result |
| --- | --- |
| Typecheck | PASS |
| Frontend tests | 764/764 PASS, 75 suites, zero failed/skipped; final runner 37.72s |
| Frontend build | PASS; final Vite build 16.18s |
| Rust fmt/check | PASS |
| Rust tests | 285 PASS, 10 existing ignored, 0 failed; 41.28s test runtime |
| Clippy all targets/features, warnings denied | PASS |
| Production npm audit, online | 0 vulnerabilities |
| Full browser suite | 1630/1630 PASS, 12 runners |
| Windows Tauri build | PASS, both MSI locales + NSIS; no staging/publication |
| Separate FTS benchmark | PASS after stopping owned Vite/native/browser QA; indexing 16.4678896s, query 24.8836ms; runner 16.54s |
| `git diff --check` | PASS; only Git's informational LF→CRLF notices for the two Rust files |

Browser counts: approved Sidebar 348; Sidebar/panels 272; Settings 562; final UI 110; corrective geometry 86; final UX 40; vision 10; RAG navigation 14; links/clipboard 79; golden Markdown 8; motion synchronization 13; new corrective 88. The initial 76-case corrective run was extended to 88 by inline rename; it is not counted twice. No timing assertions, negative controls, tolerances or production motion tokens were weakened.

Earlier failures are retained in ignored logs: old portable tests expected HTML contrary to the new requested policy; palette exact HEX expected the old value; new insertion fixtures needed the existing editable trailing paragraph for Undo; one Rust clipboard fixture omitted the newly added field; the added attachment projection exposed safe-link sanitization removing its managed reference. Each was corrected explicitly. No failed experiment or stale output is counted as final PASS. Development-only npm advisories were not bulk-fixed; the production gate is zero.

Reproduction helpers: tracked `post-rc6-corrective.mjs`, `post-rc6-performance.mjs`, `post-rc6-color-metrics.mjs` and `post-rc6-vite.config.ts`. Final raw production distributions: `post-rc6-perf-production-before-final-samples/results.json` and `post-rc6-perf-production-after-final-samples/results.json`, both ignored. Earlier dev/production passes, isolated micro JSON, browser logs/screenshots, native timing JSON, FTS log and actual native export are also retained under `releases/qa/`. These contain synthetic fixtures only. The single-run FTS number is not a causal before/after comparison with a historical release measurement; search SQL was not changed.

## 21. Remaining Risks and Next Work

**Release/smoke readiness blocker for this whole request: long-document responsiveness remains unresolved.** The next performance change must isolate expensive derived serialization/preview/React work while preserving pending-save, close/import/restore and CAS ordering. A worker/deferred pipeline must not be introduced casually as another stale-write risk. Keep the measured per-save optimization and virtualization; do not shorten approved Sidebar animations to hide CPU work. Establish native before/after distributions for the chosen narrow change, including 1k/10k metadata and real DB hydration.

Cold lazy-loading outliers, full-note workspace hydration, detailed image/table/RAG latency and native soak/startup baselines remain separate measurement gaps. No statement of universal faster menus is justified by these samples. Pure Markdown deliberately cannot retain all advanced visual attributes; lossless backup/sidecar paths remain necessary. macOS and the unexecuted native cases above remain pending.

## 22. Git Status and Release Control

Branch/HEAD remain `codex/post-rc6-markdown-performance` / `42cdf9cca1371eac49c5645f6f82036d63b65b50`. Version sources remain 1.0.0-rc.6; productName `NoteFlow`, identifier `com.noteflow.desktop`, MSI 0.99.6. Package changes only add the justified virtualizer dependency/lock entries.

Final tree: **24 tracked modified, 15 untracked, 0 staged**. Seven untracked entries are the historical files present at the start; eight are the new report, four QA modules, portable projection, user fixture and behavioral test. Changes are confined to the requested clipboard/export/color/form/Link Picker paths, measured editor/list optimizations, their tests, dependency lock and documentation. Published RC5 installer hashes and historical QA/report hashes match their preservation manifests; all four RC6 staged asset hashes match the published-release manifest. Normal build outputs were rebuilt locally but never copied over published staging or uploaded. No `git add`, commit, push, merge, tag or release. All historical untracked QA files retained.

**Verdict: NEEDS MORE WORK (performance only; functional corrective checks above are explicitly scoped).** This is not authorization to publish NoteFlow 1.0.0.

## A. Editor Typing Performance Final Optimization

### Scope and Safety

This continuation starts from the existing dirty corrective tree: 24 modified, 15 untracked, zero staged. Branch/HEAD remain `codex/post-rc6-markdown-performance` / `42cdf9cca1371eac49c5645f6f82036d63b65b50`; application version remains 1.0.0-rc.6. The source-only baseline is retained under ignored `releases/qa/typing-baseline-source/`. It contains the previous **working tree**, including its accepted virtualization/Markdown fixes, not a checkout of the published RC6. The before production fixture is frozen separately under `typing-production-before/`.

No user database, model profile or credentials were copied. Native tests use only the previously created synthetic `com.noteflow.qa.postrc6production` profile, 10,003 notes and no providers. Published RC5/RC6 staging is not a destination of any build/copy operation. Normal generated build outputs are not published artifacts.

### Confirmed Critical Path

The previous `EditorArea.onUpdate` synchronously called `getJSON()`, `getHTML()` and the full canonical serializer before returning from a text transaction. Markdown projection, inline validation, sidecar extraction, cloning and preview/state preparation scaled with the entire document, not the changed range. In the fresh exploratory pair, the 1,000-paragraph transaction p50 fell from about 27ms to 1.2ms once the derivation moved out of that path. A native screenshot-only control measured changed transactions around 27–52ms before versus 3–9ms after. These are distinct environments/documents, not interchangeable samples.

Empty search queries already avoid a document scan. Active search and heading anchors still scan their relevant document structures; they were not disabled. The closed outline still performs its existing heading update. No speculative global memoization, custom native text-input bypass, IME override or reduced functionality was introduced.

### Implemented Pipeline

`EditorArea.onUpdate` now records the immutable ProseMirror document reference, marks the editor dirty and schedules preparation after paint. JSON and the existing TipTap HTML cache are captured lazily on the main thread; canonical Markdown, plain text, normalization and sidecars are produced by a local module Worker using the **same** `serializeEditorDocumentForStorage` implementation. This is not a second serializer. DOM-derived HTML remains the existing cache representation; portable export policy is unchanged.

`EditorSavePreparation` permits one active preparation and one latest unsent snapshot. Rapid changes replace only the unsent job. Sequence/generation checks suppress stale responses after newer edits, note switches, restore/import and unmount. Worker lifetime is bounded to the mounted editor; dispose terminates it and rejects outstanding work safely. There is no cross-save content cache, network request or note-content diagnostic logging.

`flushPreparedEditorSaves` drains preparation **and** the existing `PendingNoteSaves` CAS queue. It loops when another edit appears during an in-flight SQLite write. A save acknowledgement cannot replace a newer live draft while its Worker result is pending. The existing 850ms autosave clock starts at the edit, not at Worker completion; autosave was not disabled or delayed to improve the benchmark. Close/export/navigation/import keep their existing safe-flush boundaries and backend transaction/CAS rules.

Bulk deletion suspends preparation before the database operation. It discards the draft only after successful deletion; failure resumes the retained snapshot and autosave. A late Worker result cannot save during deletion or resurrect a successfully deleted note. This specifically avoids turning a failed destructive operation into loss of an unsaved draft.

Worker construction failure falls back to the existing serializer after paint. Runtime/message/timeout failure leaves the document dirty, reports a generic save error and supports retry; the failed Worker is not silently treated as a successful save. No note text/HTML/sidecar is placed in a user-facing error message. The browser fault test verifies that content version remains unchanged before Retry and the latest document is committed afterward.

### Measurement Method and Evidence

`scripts/qa/typing-hardening.mjs` uses Edge production fixtures for exact 1k/10k/50k/100k source-character documents, a structured document, the legacy 1,000-paragraph scenario and a 10k-note database with a long editor document. It retains raw samples, nearest-rank p50/p95/max/n, transaction/HTML/JSON/Worker/clone costs, CDP task/layout/style counters, long tasks and JS heap. IPC in this fixture is synthetic and must not be presented as SQLite IPC latency.

Each action is measured separately: character, Backspace, Enter, cursor, Undo/Redo, Delete, selection, selection replacement, rapid Unicode input, 16k-character paste, AI sidebar, actual active search decorations, table and list input. The corrected harness drains setup frames, excludes modifier keys and uses `beforeinput` for Unicode text insertion and `paste` for clipboard timing. It explicitly asserts that real input samples exist. Selection/replacement setup starts inside a sufficiently long paragraph, rather than accidentally reaching structured nodes after the preceding editing scenarios; each replacement asserts a nonempty selection. The initial final-run attempt stopped on that invalid complex-document setup; its incomplete JSON/log is retained and excluded. The earlier extended attempt had an unfocused search scenario and modifier/setup samples; its raw logs also remain, but it is not the final acceptance distribution.

Event-to-double-rAF is a reproducible **paint proxy**, not a hardware presentation timestamp or a measurement of the first physically displayed glyph. CDP task/style/layout counters are renderer work, not operating-system CPU percentages. JS heap snapshots do not prove total process memory, absence of leaks or long-session stability. These limits apply to the numbers below as well as the native observations.

React profiling uses a separate QA-only production profiling renderer, unminified for diagnostic names. This build is not shipped and its durations are not mixed with ordinary production latency. The official root Profiler records commits; fiber-name diagnostics are supporting observations, not a sum of exclusive CPU time. The retained implementation still updates AppShell, the visible note list, Sidebar and editor header around dirty/prepared/saved states. It does not claim to eliminate every React commit.

Final clean browser/profile/load distributions and gate results are recorded in the final-results subsection below.

### Windows Native Findings

Real Windows Tauri/WebView2 was opened through Computer Use. Before and after executables use the same isolated QA profile. No production executable was launched against `com.noteflow.desktop`. A timed-out app approval was reported rather than bypassed; native work resumed only after the user authorized retrying access.

**WINDOWS NATIVE PASS, scoped:** real long-note typing, rendered 31-command ribbon at 100%, main Sidebar manual resize to 360 with list 260, collapse/expand, successful constrained chat opening, explicit rejection of a configuration too wide for the screen, focus-mode zoom through 160%, light/dark switching, native plain-Markdown clipboard paste into a heading, Undo/Redo, saved heading after restart and the actual system Save dialog. `releases/qa/typing-native-export.md` contains `# Заголовок`, without HTML. The first interrupted dialog attempt did not create that file; only the completed second attempt is counted.

**Native responsiveness is not yet a PASS for the whole task.** With UIA observations, six isolated keys measured p50/p95 77.2/131.2ms before versus 61.4/88.5ms after. A separate fresh-process screenshot-only control, same second-paragraph scenario, measured 78.2/117.5ms before versus 71.2/90.1ms after, n=6 each. These small native samples show shorter transactions but do not demonstrate the desired consistently immediate input. A 20-character input action measured 283 → 106.3ms, n=1, diagnostic only. Native results are not replaced with browser numbers.

Native snapshot diagnostics measured JSON about 0.2–1.1ms, HTML about 5–13.5ms and request structured-clone/post about 1.3–2.6ms. Warm Worker round trips were roughly 23–52ms, with a separate cold-start outlier. Idle WebView2 rAF cadence was about 6.9ms; low native frame rate alone does not explain the input tail. A traced key had a short keydown handler, about 31ms keypress/textInput and an 18ms input callback, with Worker work on another thread. Nested trace events must not be added together. This is evidence for further native input/render/commit investigation, not proof that spellcheck, accessibility or a specific ProseMirror branch is at fault.

The attempted native invoke wrapper produced no usable IPC samples despite real SQLite content-version increments and successful restart persistence. Therefore native IPC overhead is **NOT VALIDATED**, not zero. JS heap samples are not process working-set/soak-test measurements. Full native complex-fixture paste/reimport, every toolbar command, RAG source transitions, both themes at every zoom, multi-monitor DPI changes and macOS native QA remain **NOT VALIDATED / PENDING** in this pass. Existing browser/integration coverage is listed separately.

## B. Strict Single-Row Toolbar

### Inventory and Layout

The previous priority-based action partition and the `...` overflow control were removed from `FormattingToolbar`. All 30 prior registered commands remain direct, in order, and the existing 3×3 table insertion command is exposed as the 31st button. Font family/size remain in the existing `Aa` semantic dropdown; color, highlight, link and AI controls keep their own popovers. They are not replacement overflow menus.

The complete direct registry is: Undo, Redo, H1, H2, H3, paragraph, font/size, bold, italic, underline, strike, inline code, highlight, text color, superscript, subscript, bullet list, ordered list, checklist, quote, code block, left/center/right/justify alignment, external link, table, note link, fragment link, clear formatting and AI. There is no hidden action, second row, toolbar scroll or ellipsis control. Existing block-insertion and contextual table/image menus retain their independent purpose; no command was deleted from those menus.

CSS container queries select **normal** (32px minimum targets), **compact** (28px) and **ultra-compact** (24px). Icons remain 16px and control height remains 30px inside the existing 45px ribbon. Group spacing becomes tighter, not the icons. Font/size no longer reserves extra width. The toolbar no longer owns a per-pixel width observer or React overflow state. Selection-preserving pointer handling, keyboard activation, accessible names, tooltips, disabled/active/focus states and the shared command handlers remain.

### Approved Spatial Contract

The user explicitly chose to keep the ribbon **only over the editor**, accepting a higher minimum window width/panel constraints instead of a full-window toolbar. The reserved minimum is **820 CSS px**. This is a supported-layout boundary, not a claim that 31 usable controls fit into an arbitrary 100px editor.

Minimum client widths below are window logical pixels/DIPs at the stated application zoom. Actual monitor pixels also depend on OS display scaling. A 125% OS scale requires multiplying these values by 1.25; do not compare them directly with a monitor's raw resolution.

| Configuration | 100% | 125% | 150% | 160% |
| --- | ---: | ---: | ---: | ---: |
| Focus, including existing 1100 window floor | 1100 | 1100 | 1230 | 1312 |
| Collapsed main + minimum note list | 1154 | 1359 | 1564 | 1646 |
| Expanded main + minimum note list | 1270 | 1475 | 1680 | 1762 |
| Collapsed main + list + chat minima | 1454 | 1659 | 1864 | 1946 |
| Expanded main + list + chat minima | 1570 | 1775 | 1980 | 2062 |
| All three panels at preferred maxima | 2360 | 2565 | 2770 | 2852 |

Panel limits remain main 190–360, list 260–560 and chat 300–620 logical pixels (collapsed rail 74). The fit helper reduces effective panel widths to their minima when needed without closing panels or overwriting saved preferences. Manual resize starts from the effective width and stops at the room actually available with the other panels. Restoring room restores preferred widths. Settings/RAG pages retain their original narrow-window policy; only the note workspace has the complete-ribbon requirement.

Native `setMinSize`/`setSize` calls are serialized. Zoom, Sidebar expansion, chat opening and focus exit reserve necessary native window space before committing the constrained layout. An impossible screen configuration is rejected with a user-facing explanation instead of hiding tools or silently closing a Sidebar. Only own-window sizing capabilities were added; no filesystem/network permission was broadened. The CSS-zoom fallback viewport calculation was corrected to avoid multiplying the browser width by application zoom twice.

Sidebar motion tokens remain 240ms / `cubic-bezier(0.22, 1, 0.36, 1)`. Manual resize remains transition-free. The persisted Sidebar/New Note design was not redesigned.

### Geometry and Regression Contract

The new runner checks 96 supported configurations, eight intermediate Sidebar frames per configuration, both themes, 100/125/150/160% zoom, collapsed/minimum/maximum preferred main Sidebar, chat/no chat and minimum/wider windows. Ten additional boundary cases verify the actual CSS normal/compact/ultra-compact density. **202/202 PASS**. Assertions cover exact ordered 31-button registry, visibility, target widths, row alignment, overlap, toolbar-vs-editor/window bounds, scrollWidth/clientWidth and absence of an overflow control. Unsupported collapsed-window expansion is tested after reserving the expanded minimum, matching native preflight; it is not disguised as support for an impossible viewport.

The existing Sidebar/links runners were migrated to this user-approved Notes minimum instead of retaining tests that explicitly demanded hidden overflow buttons. Their motion duration/easing, negative controls, selection, focus, drag/persistence and geometry tolerances were not relaxed. Sidebar stability restores the **original** narrow viewports before testing Settings/RAG, so those regressions are not weakened by a wider Notes window. Existing unit contracts now require every action direct rather than accepting an overflow partition.

The full existing browser suite passed **1630/1630** in a fresh frozen-code rerun; the initial run's two old-width failures are preserved separately under `typing-browser-attempt1/`. The six additional real-Worker persistence/fault cases passed, including 10k-note navigation, table color/borders, image alignment, date, partial marks, passive decorations and Retry. Browser aggregate including the new geometry/persistence runners: **1838 checks**. Native and browser evidence are not interchangeable.

### Final Results and Remaining Acceptance

Fresh gates on the retained production source (not the earlier 764-test baseline):

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **786/786 PASS**, 75 suites, zero failed/skipped; 45.176s |
| `npm run build` | PASS, including the default Tauri before-build command; final Vite build 15.25s |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS; clean final rerun without sandbox hard-link warnings |
| `cargo test` | **285 PASS, 10 existing ignored**, zero failed; 26.92s |
| Strict Clippy, all targets/features | PASS, warnings denied; 13.34s |
| `npm audit --omit=dev --offline=false` | **0 vulnerabilities** |
| Full existing browser suite | **1630/1630 PASS**, 12 runners |
| Additional strict-toolbar geometry | **202/202 PASS** |
| Additional real-Worker persistence/fault scenarios | **6/6 PASS** |
| `npm run tauri build` | PASS, canonical default config; en-US/ru-RU MSI and NSIS rebuilt locally, not staged or published |

The first sandboxed bundle attempt could not download WiX support because of network/DNS restrictions. The permitted external rerun completed; that infrastructure failure is retained in its log, not counted as a product PASS. Initial browser old-width failures and the invalid benchmark setup are retained separately rather than erased.

Remaining acceptance gaps are substantive: the native input/paint tail remains noticeable; the complete native command/content/source-navigation matrix is not executed; monitor/DPI changes are not validated. The window-width hook reads the current monitor on mount. Its stale-monitor bound and startup with an unsupported persisted panel/zoom combination need a follow-up before treating every native monitor transition as supported. Browser fit properties do not prove those OS flows.

The whole-task verdict is **NEEDS MORE WORK**. Green unit/geometry results alone do not satisfy the native responsiveness criterion. This is not a Stable/RC7 release approval. Final paired distributions and Git preservation checks follow.

### Final Paired Production Measurements

The final sequential runner completed all six stages successfully: before/after typing, before/after loading, then before/after profiling. Typing/load stages ran without a concurrent compiler, Tauri app, browser QA runner or native observer. Profiling compilation started only after those measurements ended. Existing idle preview servers are not workload generators; unrelated user/OS applications were not terminated. Absolute timings varied from exploratory runs, so the final results below are used instead of selecting the fastest earlier pass.

Raw data: ignored `releases/qa/typing-hardening-final2-{before,after}/results.json`, `typing-load-final2-{before,after}/results.json`, `typing-react-profile-final2-{before,after}/results.json`. `typing-final2-measurements.log` records six successful stages. The before side is the frozen pre-hardening working tree, which **already includes virtualization**; it is not relabeled as the published RC6 baseline.

Single-character event-to-double-rAF proxy, milliseconds, **n=20 per cell**:

| Document | Before p50 / p95 / max | After p50 / p95 / max | Transaction p50 before / after |
| --- | ---: | ---: | ---: |
| 1,000 source characters | 14.1 / 18.0 / 34.9 | 13.4 / 19.8 / 38.0 | 1.6 / 1.1 |
| 10,000 source characters | 13.8 / 19.2 / 27.8 | 12.0 / 18.4 / 28.8 | 2.6 / 0.9 |
| 50,000 source characters | 26.5 / 39.0 / 51.6 | 11.9 / 25.8 / 30.8 | 11.3 / 1.1 |
| 100,000 source characters | 38.5 / 51.7 / 59.6 | 13.9 / 22.6 / 45.8 | 18.9 / 1.4 |
| Complex, 60 structured sections | 48.0 / 61.6 / 113.0 | 23.4 / 34.4 / 46.5 | 26.6 / 2.4 |
| Legacy 1,000 paragraphs | 75.7 / 127.3 / 144.1 | 26.4 / 32.6 / 51.3 | 42.8 / 2.0 |
| 10,000 notes + long document | 66.7 / 100.5 / 137.4 | 29.7 / 43.6 / 76.8 | 38.9 / 2.3 |

The final run therefore **does not establish p50 below 25ms for every large-document scenario**. The 26.4/29.7ms cases, active search and native tail remain acceptance gaps. Small-note p95/max are not uniformly improved; no universal speedup is claimed.

Remaining action matrix on the **10k-note + long-document** fixture; table/list rows use the structured fixture. Milliseconds. With n<=12, nearest-rank p95 equals the observed maximum here; rapid typing has 76 actual input events across four bursts.

| Action | n | Before p50 / p95 / max | After p50 / p95 / max |
| --- | ---: | ---: | ---: |
| Backspace | 12 | 70.8 / 112.7 / 112.7 | 21.3 / 31.1 / 31.1 |
| Enter | 12 | 69.3 / 107.0 / 107.0 | 35.0 / 61.7 / 61.7 |
| Cursor movement | 12 | 11.8 / 12.4 / 12.4 | 10.5 / 14.5 / 14.5 |
| Undo | 6 | 6.0 / 65.5 / 65.5 | 8.8 / 37.6 / 37.6 |
| Redo | 6 | 11.9 / 87.8 / 87.8 | 11.8 / 42.6 / 42.6 |
| Delete | 12 | 66.0 / 109.8 / 109.8 | 14.1 / 28.1 / 28.1 |
| Selection | 12 | 12.6 / 25.5 / 25.5 | 14.7 / 27.8 / 27.8 |
| Replace selection | 12 | 79.8 / 114.8 / 114.8 | 43.1 / 56.0 / 56.0 |
| Rapid Unicode typing | 76 | 68.3 / 132.0 / 149.0 | 29.1 / 54.2 / 68.8 |
| 16k-character paste | 3 | 128.4 / 129.5 / 129.5 | 60.7 / 74.7 / 74.7 |
| AI note sidebar open | 12 | 86.9 / 109.5 / 109.5 | 35.1 / 62.1 / 62.1 |
| Active search decorations | 12 | 97.5 / 116.1 / 116.1 | 45.5 / 75.5 / 75.5 |
| Table input, complex fixture | 12 | 49.9 / 76.6 / 76.6 | 21.6 / 27.3 / 27.3 |
| List input, complex fixture | 12 | 51.3 / 78.6 / 78.6 | 21.2 / 36.7 / 36.7 |

Every fixture verifies actual autosave commands; autosave is not disabled. Undo/Redo distributions include key actions that can be no-ops after grouped typing; their low median is not advertised as full-document restoration speed. The separate persistence suite verifies real latest-content saves, failure/retry, passive transactions and navigation drainage.

**Renderer work and preparation.** For 20 character actions with 10k notes, aggregate CDP main-thread TaskDuration fell **1617.0 -> 1391.4ms**, ScriptDuration **985.9 -> 311.3ms**. Layout increased **20.4 -> 26.5ms** and style recalculation **51.8 -> 89.2ms**; this is not an across-the-board reduction in rendering work. Observed >50ms tasks in that action window fell **12 -> 0** (legacy long: **16 -> 0**). This does not claim there can be no long task elsewhere, during cold startup or a large paste.

After-change 10k/long preparation diagnostics: HTML p50/p95/max **10.8/15.8/22.8ms**, n=20; document JSON **0.5/1.5/1.5ms**, n=39 instrumented document calls; Worker request clone/post **2.2/5.5/5.5ms**, n=20; Worker round trip **42.3/65.2/189.4ms**, n=20, including cold initialization. These are overlapping component timings, not quantities to sum into key latency. Coalescing means not every edit produces a completed Worker request. The HTML cache still incurs main-thread DOM serialization, and Worker round trip includes scheduling/clone/response overhead rather than exclusive serialization CPU. These are remaining costs, not hidden by the transaction improvement.

The sampled main-renderer JS heap at the end of this action window increased **40.96 -> 48.22 MB**. That snapshot excludes Worker heap and is GC-sensitive; it is neither a total-memory budget nor evidence of a leak. Process CPU, native IPC latency and a long-session memory soak remain **NOT VALIDATED**.

**React diagnostic, not an ordinary production benchmark:** one key plus the 1.5s save window produced four root Profiler commits before (5.1, 0, 6.5, 6.4ms) and five after (4.1, 0, 4.4, 5.8, 5.1ms). Summed root actualDuration **18.0 -> 19.4ms**, n=1 interaction. The asynchronous dirty/prepared/saved phases add a commit; this is **not** a proven React-render reduction. The diagnostic still implicates AppShell, visible NoteListPanel, EditorArea/toolbar, Sidebar and header around those phases. Fiber flags are supporting names, not reliable exclusive per-component totals; the official root Profiler is the count source. Targeted render isolation should follow measurement, not blanket memoization.

**Large-database loading is retained.** Fresh five-navigation distributions (page ready, not OS startup):

| Note count | Before p50 / p95 / max | After p50 / p95 / max |
| --- | ---: | ---: |
| 2 | 221.3 / 471.5 / 471.5ms | 238.4 / 460.3 / 460.3ms |
| 1,000 | 236.7 / 454.5 / 454.5ms | 327.7 / 418.4 / 418.4ms |
| 10,000 | 321.4 / 482.1 / 482.1ms | 337.0 / 501.5 / 501.5ms |

The 10k fixture mounts 20 note cards in every sample on both sides. This preserves the previous roughly 0.39s class of loading rather than returning to the historical 7.98s full-DOM baseline. It is not a new 7.98 -> 0.337s paired experiment, nor proof that native SQLite hydration is equally fast. The 1k median variation is recorded rather than concealed.

### Final Preservation, Git and Follow-Up

Final `git diff --check`: **PASS**, with informational LF-to-CRLF notices only; no whitespace errors. Branch `codex/post-rc6-markdown-performance`, HEAD `42cdf9cca1371eac49c5645f6f82036d63b65b50`. Final tree: **43 tracked modified, 32 untracked, 0 staged**; this includes the pre-existing dirty work. No historical untracked QA file was removed.

All package/Tauri/Cargo versions remain **1.0.0-rc.6**, MSI mapping **0.99.6**; productName `NoteFlow`, identifier `com.noteflow.desktop`. Twelve RC5/historical preservation-manifest hashes match; all four RC6 staged release-file hashes also match. Generated local production bundles were not copied to release staging. No add, commit, push, merge, tag, version bump or release was performed. Owned preview/dev servers and isolated native QA were stopped after measurement; no user process was forcibly terminated.

Next narrow work is native input/DOM/paint profiling with a trustworthy presentation/IPC probe, reducing the measured remaining HTML/render/decorations work without changing canonical persistence, then validating startup/monitor width recovery and the remaining native command/content matrix. Do not bypass ProseMirror native input, IME, spellcheck or accessibility on an unproven hypothesis. Keep the new transaction reduction, latest-snapshot/fault protections, existing virtualization and the agreed single-row toolbar contract.

**Final verdict: NEEDS MORE WORK.** Browser and native input improved, but the requested uniformly immediate long-document responsiveness and complete native acceptance matrix are not established. **MACOS NATIVE PENDING.** No NoteFlow Stable/RC7 publication is authorized or performed.

## Native Input Latency & Search Decorations — Final Investigation

This section supersedes the preceding pass's acceptance summary, not its historical measurements. Investigation dates: 29-30 October 2026. Branch: `codex/post-rc6-markdown-performance`; HEAD: `42cdf9cca1371eac49c5645f6f82036d63b65b50`. Version remains **1.0.0-rc.6**. The source-only return point is ignored `releases/qa/native-latency-baseline-source/`. No user database, credentials or real note contents were copied into that snapshot.

### Findings and Scope

**Confirmed bottleneck:** the old note-search plugin rescanned every textblock and recreated the entire DecorationSet on each content edit, even when only one paragraph changed. Index-only next/previous-result navigation also did a full scan. `NoteSearchBar` subscribed to the whole plugin state rather than the displayed count/index. Those costs are established by actual bound ProseMirror state-field timings, not inferred from source alone.

**Confirmed secondary risk:** when Worker serialization is unavailable, the prior after-paint scheduling could repeatedly run the synchronous fallback while typing. The fallback now coalesces until the existing autosave/navigation/close flush. This does not disable saving or introduce a second serializer.

**Unresolved:** why the full native application still has a roughly 80-120ms double-rAF tail in the accepted long-note workload. Search computation is faster, but the native presentation-related metrics did not improve. No claim is made that WebView2 itself, spellcheck, GPU, antivirus or a particular Windows service is the cause. No hardware-acceleration, accessibility, IME or system configuration workaround was introduced.

### Measurement Validity

The previous six observations were real native actions but an inadequate distribution. Their end point was double-rAF, **not physical pixel presentation**. They are not evidence of hardware input-to-photon latency. `sky.type_text` also pastes a whole string in one action; a 20/50-character call is not 20/50 independent typing samples. Such exploratory actions are not included in the new single-character distributions.

New native measurements use 30 separate trusted single-character keyboard actions per configuration, each sent through Computer Use and followed by a state observation. The before and after executables use the same isolated synthetic profile, same caret, document and viewport. No compiler, browser regression runner or other owned heavy workload ran concurrently. Unrelated user/OS applications were not forcibly stopped; their residual load is not experimentally controlled.

Recorded metrics are explicitly different:

- **App processing:** beforeinput to completion of the changed ProseMirror dispatch / observed DOM update; the table uses the later of these two observed end points. MutationObserver delivery is an upper-bound observation, not an exclusive CPU timer.
- **ProseMirror dispatch:** time inside `view.dispatch`; search state application is measured separately inside it. Nested timings must not be added.
- **Double-rAF proxy:** renderer keydown to a second animation-frame callback. Useful as a repeatable proxy, not a display timestamp.
- **Event Timing:** Chromium's reported interaction duration, quantized to 8ms and observed with a 16ms threshold. This is another browser presentation estimate, not a hardware measurement.
- **Automation:** SendInput/tool-call and UIA capture wall time retained separately in `native-automation-paired-complete.json`; no arbitrary constant was subtracted.

The probe attaches to `editor.state.config.fields` because ProseMirror binds the plugin apply function during configuration. Patching only `plugin.spec.state.apply` produced zero samples and was rejected. Match/decorations counters count scans and decoration submissions, not exclusive allocations or DOM nodes. An attempted invoke wrapper did not see persistence calls; native IPC latency remains **NOT VALIDATED**, not zero.

Environment: Windows x64, Intel Core i5-13420H, 12 logical processors, approximately 16.85GB RAM, WebView2/Edge **156.0.4314.50**, native DPR **1.25**, 1440x844 inner viewport, application zoom 100%. Main Sidebar collapsed, list width 260 for the primary native pair. The profile contains 10,003 synthetic notes. Native starting document: 1,000 paragraphs, 41,027 characters; search phase starts at 41,057 after the preceding 30 edits. Before/after stored Markdown, plain text and JSON match exactly at that boundary; caret is 141 in both. Actual per-process CPU percentages, total working set, antivirus effects and long-session memory are not established by JS heap/CDP counters.

### Native Before/After

Raw accepted series: ignored `releases/qa/native-input-before2-complete.json` and `native-input-after2-complete.json`. Each cell below has **n=30** valid trusted edits. Milliseconds, nearest-rank p50 / p95 / maximum:

| Native workload / metric | Before | After |
| --- | ---: | ---: |
| Search closed: app processing | 16.9 / 25.6 / 36.9 | 18.0 / 21.4 / 21.6 |
| 1,000 matches: app processing | 25.6 / 31.4 / 31.5 | 22.5 / 27.8 / 28.2 |
| Search closed: PM dispatch | 4.7 / 8.1 / 14.0 | 4.1 / 6.7 / 7.8 |
| 1,000 matches: PM dispatch | 8.7 / 11.9 / 14.6 | 4.6 / 7.5 / 10.3 |
| 1,000 matches: search compute | 3.9 / 6.0 / 6.3 | 0.9 / 2.4 / 5.7 |
| Search closed: double-rAF proxy | 79.1 / 104.1 / 118.5 | 80.7 / 98.7 / 100.5 |
| 1,000 matches: double-rAF proxy | 95.2 / 112.6 / 114.4 | 97.3 / 120.1 / 131.5 |

The closed-search processing median did not improve. Search dispatch/processing improved, but **native visual-proxy acceleration is not demonstrated**. The larger after-search maximum is not removed as an inconvenient outlier.

Correlated Event Timing keydown interactions: closed before n=29, after n=30, p50/p95/max **64/80/80ms on both sides**; search before n=30, after n=29, **80/96/96ms on both sides**. Missing threshold/correlation entries are not counted as zero. This independently prevents a claim that the double-rAF difference proves an actual visual improvement.

Native search edits scan **1,000 -> 1** textblocks and submit **1,000 -> 1** decorations in this fixture. Typical observed editor DOM MutationRecords remain **2 on both sides**; a claim of 1,000 -> 2 DOM changes would be false. After-search HTML cache work is 9.4/13.6/17.3ms, Worker round trip 36.9/54.0/54.4ms (n=30 each). Closed cold Worker initialization has a 145.6ms maximum; it is not hidden in a warm-only distribution. These asynchronous/preparation costs overlap other work and are not additive exclusive CPU times.

### Search Algorithm and Correctness

`noteSearch.ts` now retains the compiled literal Unicode/case-insensitive query pattern. Empty search reuses the existing empty state. Index-only navigation keeps matches and changes only the old/new current decorations. Content edits map matches and decorations through the transaction mapping and rescan changed final textblocks. Multi-step positions are mapped through subsequent steps. Overlapping old ranges are removed before adding rescanned matches; mark-only transactions skip text scanning. Unknown zero-map document steps conservatively fall back to a complete search.

This is **not O(1)**: mapping/filtering/sorting still scales with match count and mapping steps, while scanning scales with touched textblocks. A huge single paragraph is still rescanned as one huge paragraph. Dense decoration DOM/layout work remains expensive. Query changes necessarily scan the document. No asynchronous stale-range cache or delayed incorrect highlight is introduced.

`NoteSearchBar` subscribes only to count and active index. Navigation obtains current ranges directly from the authoritative plugin state. Mounted React tests verify zero counter rerenders for position-only edits and correct fresh-range navigation. Query/index metadata and selection do not alter the document, autosave or canonical Markdown.

Literal Ctrl+F matching was extended to physical `KeyF` for non-Latin layouts and passes the mounted browser/component test. **Native limitation:** in the observed Tauri build, Ctrl+F still opened WebView's built-in find overlay, including after an editor click. The browser test is not presented as a native fix. Search reached through the existing note-list query and actual in-note highlighting was exercised in native measurements.

### Paired Production Browser Search

Both sides use the same Chromium version and synthetic AppShell/10k-note fixture, 1,000 paragraphs / approximately 95.7k characters, **30 single-character observations per cell**. This document is larger than the native fixture; absolute browser/native numbers below are not an identical-document engine comparison. Accepted outputs: `search-decorations-final2-{before,after}/results.json`; all nine workloads completed on both sides. Failed focus/probe setup attempts are retained and excluded.

| Workload | Before proxy p50 / p95 / max | After proxy p50 / p95 / max |
| --- | ---: | ---: |
| Closed | 15.4 / 20.4 / 38.2 | 16.4 / 28.6 / 41.1 |
| Open, empty query | 16.0 / 24.9 / 38.4 | 16.6 / 26.6 / 30.7 |
| No matches | 15.6 / 22.0 / 36.4 | 16.9 / 24.8 / 38.9 |
| One match | 17.3 / 35.5 / 38.3 | 16.5 / 24.1 / 46.2 |
| 100 matches | 19.9 / 35.8 / 37.7 | 17.4 / 32.4 / 34.6 |
| 1,000 matches | 26.8 / 40.4 / 56.1 | 22.2 / 34.7 / 64.9 |
| 10,000 matches | 98.9 / 127.8 / 174.7 | 76.0 / 103.4 / 163.5 |
| Fragment-decoration control | 25.6 / 36.6 / 66.2 | 22.5 / 33.4 / 76.3 |
| RAG-decoration control | 24.6 / 37.4 / 59.0 | 22.4 / 31.6 / 66.7 |

The last two timing cases install the actual decoration plugin state but are not substitutes for source-navigation UX tests. Actual RAG/fragment navigation is covered separately by the regression runner. Dense search compute p50/p95/max falls **18.2/26.9/29.8 -> 0.9/2.8/9.8ms**. At 1,000 matches it falls **2.0/3.6/3.9 -> 0.4/1.0/2.3ms**. A single edit scans 1 rather than 1,000 blocks; dense navigation drops from about 17.4ms / 1,000 scans / 10,000 decoration submissions to 0.3ms / 0 scans / 2 submissions. Nevertheless the dense visual proxy remains slow; it is not a performance PASS for arbitrary query density.

### Native Engine Isolation and React

The separate `native-isolation-qa.exe` uses `com.noteflow.qa.editorisolation`, no user database, the same WebView2 and a 1,000-paragraph surface. Its actual native buttons were opened through Computer Use. Diagnostic-only samples, **n=3 per mode**, include a trusted single-character beforeinput and changed PM transaction:

| Mode | Input-to-dispatch p50 / max | Double-rAF p50 / max |
| --- | ---: | ---: |
| Minimal ProseMirror | 6.1 / 14.5 | 12.6 / 23.2 |
| Basic TipTap | 4.0 / 8.8 | 13.9 / 14.1 |
| Full NoteFlow extensions, no shell/save | 7.0 / 9.7 | 14.3 / 15.3 |
| Full extensions + 1,000 matches, no shell/save | 11.8 / 16.4 | 18.8 / 23.2 |

Raw `native-isolation-results.json` is retained. This small diagnostic is not a 30-sample acceptance distribution or exact full-app A/B: document marks, theme/layout, shell, serialization and persistence differ. It shows the generic engine can respond faster in this environment; it does not identify which integration cost explains the whole remaining full-app tail.

Separate QA-only React production profiling renderer, n=1 key plus 1.5s save window: five root commits **7.0, 0.1, 8.5, 10.5, 4.6ms** (30.7ms total across the window). AppShell, visible NoteListPanel, Sidebar, EditorArea and toolbar still participate in dirty/prepared/saved renders. Nested component durations are not exclusive and are not summed again. Native actions are spaced seconds apart, allowing Saved -> Saving on each key; rapid browser typing often remains in Saving. This cadence difference and shell work are concrete follow-up hypotheses, not a proven explanation of 60ms or justification for blanket memoization.

### Worker, CAS and Native Persistence

Normal Worker preparation retains the existing after-paint path. When the Worker is unavailable/failed, background scheduling does not prepare every key; the existing 850ms autosave or explicit close/navigation flush reads the latest snapshot once. Constructor failure may incur one initial fallback; subsequent edits are coalesced. Errors remain generic and private-safe. The 30s unresponsive-Worker deadline rejects pending work, terminates the failed Worker and allows explicit bounded fallback Retry. Recovery means saving via fallback, not silently restarting a failed Worker forever.

The existing generation/sequence guards, one-running-job policy and CAS queue remain. Restore/import discards old-generation results; suspend/resume and deletion do not deliver a late draft into a different note. No changes to the canonical serializer, SQLite schema, revision cadence, retention, attachment ownership or AI provider behavior were needed in this task.

Added tests: 11 real ProseMirror incremental-search cases including a 240-edit deterministic oracle comparison; 2 mounted search-counter/physical-shortcut behaviors; 2 Worker messageerror/timeout cases; 1 coalesced-fallback preparation test. Existing navigation/close flush, in-flight write drainage, import generation, retry, partial-formatting and CAS tests remain enabled. The browser Worker runner now also covers 20 rapid edits after constructor failure, zero per-key HTML preparation, and exactly one latest-snapshot preparation on navigation.

**WINDOWS NATIVE PASS, scoped:** 30 closed-search edits and 30 active-search edits on each executable; actual 1,000-result highlights; editing existing paragraphs; opening the right note-chat panel without configured provider; typing with that panel; Undo/Redo; normal close; restart; persisted long-note display. The QA SQLite row before and after restart has identical Markdown/plain/JSON SHA-256 and `content_version=239`; `PRAGMA integrity_check=ok`, zero foreign-key violations. The restart does not create a spurious save. Hash-only evidence is stored in `native-search-persistence-{before,after}.json`. No real user note/provider was used.

**NOT VALIDATED in this pass:** every toolbar command through native clicks; sustained fast physical typing/IME; all seven native size/structure fixtures with 30 observations each; actual native RAG source generation/navigation; every theme/zoom/panel permutation; close under an intentionally stalled native IPC write; profile switching; monitor/DPI changes; total process-memory soak. Browser/integration coverage is not relabeled as native coverage. Subjective responsiveness is not substituted for timings.

### Toolbar and Cross-Platform Boundaries

No toolbar/Sidebar production layout or motion changed in this investigation. The approved contract remains 31 direct tools, exactly one row over the editor, no ellipsis/overflow/scroll, minimum editor width 820 CSS px, 240ms `cubic-bezier(0.22, 1, 0.36, 1)` Sidebar motion and transition-free manual drag. The minimum-width table in the preceding section remains applicable: e.g. focus at 160% needs 1,312 DIPs; collapsed main/list/chat at 160% needs 1,946 DIPs. OS display scale must also be accounted for. Arbitrarily small laptop screens cannot satisfy all panel/zoom combinations.

New production search/fallback code uses platform-independent ProseMirror mappings, Unicode RegExp and Web Workers, with no Windows path or WebView2-specific dependency. **MACOS NATIVE PENDING**: there is no Mac in this QA environment. Physical presentation latency, monitor migration, unsupported persisted startup layout and the stale monitor-width bound remain open. The task does not authorize a Stable or RC7 release.

### Fresh Seven-Document Matrix and Loading

The new complete sequential before/after action matrix is retained at `releases/qa/typing-hardening-native-search-final4-{before,after}/results.json` (107 records on each side). Here **before is the previous pass's retained Worker/virtualization build**, not published RC6. Both sides run the same updated harness. Initial attempts stopped on unready focus/selection and are preserved under final/final2/final3; they are not counted as completed distributions. The harness now waits for TipTap's deferred focus and the actual selectionchange, asserts the requested caret and nonempty replacement selection, and keeps the existing content/action assertions. It does not synthesize a missing input or silently count a failed action.

All seven document cases completed, with **n=30 character events per cell**. This new run has materially variable frame tails; the data do not establish a universal performance improvement. Milliseconds, double-rAF proxy p50 / p95 / maximum:

| Document | Before | After | PM dispatch p50 before / after |
| --- | ---: | ---: | ---: |
| 1k source characters | 82.3 / 194.6 / 199.0 | 24.2 / 115.7 / 191.1 | 1.7 / 1.3 |
| 10k source characters | 26.2 / 192.5 / 397.4 | 32.1 / 115.0 / 412.1 | 1.5 / 1.6 |
| 50k source characters | 19.8 / 113.3 / 442.3 | 35.9 / 123.8 / 175.5 | 1.7 / 1.7 |
| 100k source characters | 21.7 / 99.5 / 107.4 | 23.1 / 103.1 / 113.3 | 1.5 / 1.5 |
| Complex, 60 structured sections | 37.1 / 119.3 / 193.4 | 35.9 / 90.9 / 118.3 | 2.8 / 3.5 |
| 1,000 paragraphs | 26.6 / 44.3 / 52.0 | 30.9 / 41.6 / 50.1 | 1.6 / 2.2 |
| 10k notes + long document | 28.2 / 43.4 / 67.6 | 38.2 / 57.2 / 89.4 | 1.9 / 2.2 |

There was no concurrent owned compiler/native app/second performance runner. Nevertheless residual OS/user workload, scheduling, GC and CPU power-state variability were not isolated experimentally. These numbers are retained rather than replacing them with the faster previous run. They are a regression/variance investigation requirement, **not proof that a particular changed line caused every tail**. A stable browser-frame performance gate is not satisfied by this run.

Other freshly repeated action distributions below use the 10k-note/long fixture except table/list, which use the structured document. With n=12 or less, nearest-rank p95 is the observed maximum. Undo/Redo include possible grouped/no-op key actions and are not advertised as independent full-document restores.

| Action | n | Before p50 / p95 / max | After p50 / p95 / max |
| --- | ---: | ---: | ---: |
| Backspace | 12 | 37.3 / 127.8 / 127.8 | 30.2 / 80.5 / 80.5 |
| Enter | 12 | 38.4 / 129.1 / 129.1 | 43.9 / 194.3 / 194.3 |
| Cursor | 12 | 13.2 / 42.5 / 42.5 | 16.9 / 39.6 / 39.6 |
| Undo | 6 | 11.7 / 115.2 / 115.2 | 13.0 / 41.4 / 41.4 |
| Redo | 6 | 10.7 / 58.5 / 58.5 | 9.9 / 41.5 / 41.5 |
| Delete | 12 | 25.3 / 48.5 / 48.5 | 28.7 / 66.7 / 66.7 |
| Selection | 12 | 15.1 / 33.6 / 33.6 | 19.9 / 29.0 / 29.0 |
| Replace selection | 12 | 63.3 / 159.8 / 159.8 | 78.1 / 107.0 / 107.0 |
| Rapid typing, four bursts | 76 | 72.0 / 155.9 / 191.3 | 68.0 / 147.0 / 162.8 |
| 16k-character paste | 3 | 68.0 / 105.8 / 105.8 | 63.0 / 71.7 / 71.7 |
| AI Sidebar open, no request | 12 | 42.2 / 195.5 / 195.5 | 44.8 / 367.2 / 367.2 |
| Active search | 12 | 66.6 / 98.6 / 98.6 | 54.7 / 82.5 / 82.5 |
| Table input | 12 | 54.4 / 307.1 / 307.1 | 26.2 / 190.7 / 190.7 |
| List input | 12 | 26.9 / 134.6 / 134.6 | 36.2 / 148.9 / 148.9 |

The 30-character 10k-note window has renderer TaskDuration **2139.1 -> 2675.6ms**, ScriptDuration **449.7 -> 552.8ms**, LayoutDuration **48.6 -> 57.0ms**, style recalculation **125.3 -> 178.3ms**. Observed long tasks: 0 before, 1 after (54ms). This is not a renderer-work reduction. After HTML preparation is 12.9/18.4/18.7ms; Worker request post/clone 2.9/4.5/4.7ms; Worker round trip 49.6/74.2/233.5ms, n=30 each including cold startup. Main-renderer JS heap snapshot is 45.31 -> 53.17MB, excluding Worker/native memory; this is not a leak diagnosis or a total-memory measurement.

Fresh loading outputs: `typing-load-native-search-final4-{before,after}/results.json`, five complete page navigations per count, milliseconds:

| Notes | Before p50 / p95 / max | After p50 / p95 / max | Mounted cards |
| --- | ---: | ---: | ---: |
| 2 | 457.8 / 593.8 / 593.8 | 531.8 / 782.9 / 782.9 | 2 |
| 1,000 | 348.1 / 1332.7 / 1332.7 | 301.3 / 1344.7 / 1344.7 | 20 |
| 10,000 | 375.0 / 1274.1 / 1274.1 | 622.8 / 1020.6 / 1020.6 | 20 |

Virtualization remains structurally effective, but **preservation of the old 337ms median is not demonstrated**. The new 10k median is slower; five observations are insufficient to attribute it to code versus environment. It must not be reported as an unchanged loading-performance PASS.

### Fresh Functional Gates and Geometry

All gates below were executed on this investigation's retained production source. The 786-test / 1838-browser previous-pass results were not substituted for these runs. No production source changed after the successful full build; later edits were QA instrumentation/harness and this report.

| Gate | Actual result |
| --- | --- |
| `npm run typecheck` | **AUTOMATED PASS** |
| `npm run test` | **802/802 PASS**, 75 suites, zero failed/skipped; 37.618s |
| `npm run build` | **PASS**, 15.31s; also repeated by canonical Tauri build, 15.77s |
| `cargo fmt --check` | **PASS** |
| `cargo check` | **PASS**; incremental-cache hard-link warning, including final outside-sandbox repeat (43.04s) |
| `cargo test` | **285 PASS, 10 existing ignored**, zero failed; 26.76s |
| `cargo clippy --all-targets --all-features -- -D warnings` | **PASS**, 1.09s, no emitted warnings |
| `npm audit --omit=dev --offline=false` | **0 production vulnerabilities** |
| Complete existing browser regression | **1630/1630 PASS**, all 12 runners |
| Strict 31-command toolbar geometry | **202/202 PASS** |
| Real browser Worker/persistence/fault scenarios | **7/7 PASS** |
| Browser aggregate | **1839/1839 PASS**, 14 runners, 1164.584s sequential runner time |
| `npm run tauri build` | **PASS**, canonical default config, release Rust build 2m05s plus frontend/bundling |
| `git diff --check` | **PASS**, informational LF-to-CRLF notices only |

The cache warning says Cargo copied incremental files instead of hard-linking them; it is not a Rust source warning suppressed to make Clippy green. No cache deletion/cleanup or dependency change was performed. No lint script exists in `package.json`; an unexecuted lint gate is not claimed.

Browser counts by runner: approved Sidebar 348; Sidebar stability 272; Settings overflow 562; final UI 110; corrective3 86; final UX geometry 40; final UX vision 10; CAS/RAG 14; standard links 79; Markdown acceptance 8; panel motion 13; post-RC6 corrective 88; strict toolbar 202; Worker persistence 7. Ignored `native-search-browser/counts.json` stores each exit status and duration. Generated copies change only the QA artifact-root prefix, verified by reverse substitution/source hashes; historical outputs and assertions were retained.

The strict toolbar rerun covers 96 supported layout configurations, 768 intermediate Sidebar frames and ten density boundaries, both themes, 100/125/150/160% zoom. Exact 31-command order, visibility, one row, click-target bounds, no overlap/scroll/overflow menu and minimum editor space all pass. Existing manual drag, width persistence, rapid toggles, focus/selection, reduced motion and narrow Settings/RAG checks also pass. These are **BROWSER PASS**, not a native monitor/DPI certification. The seven Worker cases ran against the new production QA fixture on port 1432, not the frozen before fixture.

The actual user Markdown fixture and partial `Стоимость следующая -` regression remain covered by the fresh tests; no canonical storage or export serializer was changed here. Search/highlight-only transactions preserve the document and content version in the persistence cases. RAG navigation tests use the actual fixture UI with mocked services; no live Bridge/Ollama generation is claimed.

New local build outputs, not copied into published release staging:

- `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.6_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.6_x64_ru-RU.msi`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.6_x64_en-US.msi`

### Final Git Preservation and Verdict

Final branch: **`codex/post-rc6-markdown-performance`**. HEAD remains **`42cdf9cca1371eac49c5645f6f82036d63b65b50`**. Initial task tree: **43 tracked modified, 32 untracked, 0 staged**. Final tree: **46 tracked modified, 40 untracked, 0 staged**, including all pre-existing work. No historical QA file was deleted.

Relative to this task's source snapshot, existing production changes are limited to `noteSearch.ts`, `NoteSearchBar.tsx`, `EditorArea.tsx` and `editorSerializationClient.ts`; existing test edits are `rc5Editor.test.ts`, `editorSerializationClient.test.ts` and `editorSavePreparation.test.ts`. Added `noteSearchIncremental.test.ts` supplies the real ProseMirror oracle/fault-sensitive coverage. Remaining additions/changes are isolated QA diagnostics/runners and this report. Earlier dirty AppShell/Markdown/toolbar/backend/package work is preserved, not attributed to this investigation.

All package, lock-root, Tauri and Cargo versions remain **1.0.0-rc.6**, MSI **0.99.6**, productName **NoteFlow**, identifier **com.noteflow.desktop**. Twelve RC5/historical preservation hashes and four RC6 staged release-file hashes match. `native-search-preservation-result.json` records the checks. QA outputs, source snapshot, synthetic databases and QA executables remain Git-ignored. Owned dev/preview servers and both isolated native apps were stopped; no user process was forcibly terminated.

No `git add`, commit, push, merge, tag, version bump or release was performed. Real user notes, API keys and provider profiles were not used or changed. CDP was timing/read-only instrumentation in isolated QA executables, without a DevTools window; its overhead has not been fully quantified and is not claimed absent.

**Final verdict: NEEDS MORE WORK.** Functional regression and production builds are green, and the search/fallback improvements are retained. The main acceptance criterion is still open: native visual responsiveness did not measurably improve; dense search remains expensive to render; the fresh broad browser timing/loading series is variable and does not establish retained loading latency. Missing native scenarios and macOS QA remain explicitly pending.

Next focused work: obtain a trustworthy native presentation/IPC trace and matched-cadence full-shell isolation, distinguish dirty/prepared/saved React commits and HTML-cache preparation from layout/compositor work, investigate the fresh loading/timing variance under repeatable idle conditions, then optimize only confirmed critical-path costs. Validate native Ctrl+F handling, startup/monitor width recovery and the remaining native command/source matrix before release approval. Do not bypass native input, IME, accessibility or canonical persistence to improve a proxy metric.

## Final Native Validation and Performance Regression Investigation

This follow-up uses the revised acceptance criteria: an unchanged double-rAF proxy alone is not a product blocker. It is not treated as physical input-to-display latency. Existing Worker, CAS, Markdown and incremental-search implementations were investigated before making production changes. Initial state: branch `codex/post-rc6-markdown-performance`, HEAD `42cdf9cca1371eac49c5645f6f82036d63b65b50`, version `1.0.0-rc.6`, 46 modified / 40 untracked / 0 staged. A source-only snapshot was created under ignored `releases/qa/final-native-validation-source/`.

### Loading: What the Old Numbers Actually Measured

`typing-load.mjs` timed `performance.now()` after a Playwright locator wait and an additional evaluate round trip. Its samples include automation/polling delay and mix the first navigation with reused-page/cache navigations. It used a mock `load_workspace` response, **not SQLite**. The old 375 -> 623ms medians therefore did not establish a database or IPC regression. Neither the exact historical OS load nor its individual outliers can be reconstructed; automation is not asserted to explain every millisecond of that difference.

The new `loading-validation.mjs` installs an observer before fixture bootstrap. It records readiness inside the page when the actual editable TipTap editor, note title, virtualized note cards and 31 tools exist. It also times the mock metadata response and the subsequent mapping/render interval. This is DOM usability readiness, not physical presentation. The old locator timestamp is collected on the same navigation to expose the automation gap.

Three independent series alternate before/after order. Each side has 30 new-browser-process cold samples and 30 warm samples; six warmups are explicitly excluded. Process-cold does not mean the OS disk cache was flushed. Viewport is 1440x900, app zoom 100%, same production fixture and same 10,000 DTO rows. Every one of the 126 observations has identical metadata payload SHA-256 (`f9d39606bc4b3723e8d1b0f902de16eb8129a9eb8e01e25c9e7522c666a7239a`), 4,148,736 bytes. The same tests/data are used on both sides, with no compiler, second benchmark or native input workload running concurrently. Residual unrelated OS/user activity is not claimed controlled.

The discovery run, before the final shortcut/IME patch, is retained under `loading-validation-first/`: cold ready p50/p95 **384.5/458.4 -> 377.6/460.2ms**; warm **193.4/235.7 -> 195.9/251.3ms**. Typical extra locator/automation delay was about 26-31ms, reaching 62.5ms. The 248ms median regression did not reproduce. No production loading/query/hydration refactor was justified or made. Final-build repetition is recorded below, separately from this discovery run.

### Real SQLite and Native SDK Round Trips

Actual native reads used only the already isolated `com.noteflow.qa.postrc6production` profile: 10,003 synthetic notes, zero attachments, zero chat/embedding provider profiles. Thirty real read-only `load_workspace` calls returned about 11MB each. SDK round trip minimum/p50/p95/maximum was **587.0 / 888.6 / 1036.5 / 1162.0ms**. This includes backend querying, DTO enrichment, response serialization/transfer and JavaScript delivery; it is not exclusive IPC transport time. Browser mock IPC numbers are not substituted for it.

The earlier invoke wrapper collected zero samples because the real `__TAURI_INTERNALS__.invoke` property is **non-writable**, confirmed on this WebView. Zero wrapper observations were not zero IPC latency. The new read-only benchmark calls the real SDK directly without replacing it and records only counts, bytes and timings.

The explicit ignored Rust benchmark `profiles_isolated_workspace_loading` runs actual optimized `DataStore` code on a backup-API SQLite snapshot copied into a temporary test directory. It never opens the real user profile, starts AI providers or updates user notes. It executes three connection series of ten samples and verifies unchanged content versions and SQLite integrity. The exact row query is timed separately from production DTO enrichment, `load_workspace` and serde serialization. Source-only extra code is under `cfg(test)`; no benchmark branch was added to production storage.

Accepted 30-sample optimized run (`final-native-loading/rust-benchmark.{log,json}`), milliseconds:

| Component | Minimum | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| SQLite row query/collection | 37.8 | 54.3 | 127.5 | 181.3 |
| DTO enrichment | 235.5 | 295.1 | 587.3 | 587.5 |
| Actual complete workspace load | 280.7 | 349.0 | 713.3 | 728.9 |
| Response JSON serialization | 14.0 | 18.1 | 43.7 | 44.5 |

The source explains baseline cost: note DTO enrichment performs tag, attachment and sidecar queries and JSON parsing for every note; complete content/cache fields are returned, not just card metadata. This is existing scalability debt, not a new change between the compared builds. The full-workspace and isolated component samples are separate calls; do not sum their percentiles or subtract them from the native SDK percentile to invent exclusive IPC latency. Reopening `DataStore` also includes migration checks/startup maintenance and is not equivalent to an OS cold process start.

### Ctrl+F: Confirmed Cause and Narrow Fix

Before editing, the real QA Tauri window again opened WebView2's built-in Find overlay after Ctrl+F from the editor. WebView2 handles browser accelerators before web content; JavaScript preventDefault alone cannot reliably fix this reserved-key path. Microsoft documents [per-event browser-accelerator control](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2acceleratorkeypressedeventargs2).

`native_shortcuts.rs` disables **only browser handling of Ctrl+F and unmodified/Shift+F3** through `ICoreWebView2AcceleratorKeyPressedEventArgs2`. It deliberately does not mark the key handled, so the trusted DOM event can reach the existing NoteFlow handler. Print, reload, zoom, copy/paste, Undo, ordinary typing, Alt shortcuts and other accelerators are not globally disabled. Windows-only direct dependencies expose versions already in Tauri's transitive lock graph; Cargo.lock adds only those two direct dependency names, no new package versions. On a runtime lacking the per-event interface it leaves browser behavior unchanged rather than crashing.

`NoteSearchBar` now refocuses an already open query, reveals the input for manual Ctrl+F after an FTS-driven query, supports Enter/Shift+Enter direction, restores editor focus/selection on closing, and consumes Escape only inside its editor/search scope so it does not also close the AI panel. Active IME composition is not intercepted. Initial FTS highlighting still does not steal focus from the note-list search. No global keyboard preventDefault, UI redesign or new search implementation was introduced.

### Search and Persistence Correctness

Six new real ProseMirror oracle tests cover 1,200 repeated matches, split/join, deletion of many paragraphs, multiline Markdown insertion (heading/list/table/code/Unicode), actual history Undo/Redo, wrapping/splitting/lifting list items, code-block conversion and replacement with another note. Every transaction is compared against full search for ordered ranges, decorations and current match. No search algorithm change was needed in this pass.

Four mounted behavioral tests cover forward/backward Enter, repeated Ctrl+F/FTS focus, Escape preserving selection without autosave or AI-panel closure, and IME composition. The new browser runner separately exercises a real 1,200-match editor, query clearing/restoration, query navigation, editing/full-search equivalence, same-shell note switching, no spurious content version and 31-tool geometry. Existing Worker failure/retry, bounded timeout, latest-snapshot coalescing, stale generation, close/navigation drainage, CAS, backup/restore, FTS and Markdown tests remain enabled.

Canonical lossless storage, portable Markdown, revisions/retention, asset ownership, model/provider logic and Sidebar motion (240ms, `cubic-bezier(0.22, 1, 0.36, 1)`) were not changed. The user Markdown fixture and partial bold/underline `Стоимость следующая -` regressions remain in the full automated suite.

### Native Scope and User Handoff

The user explicitly requested **"Оставить native smoke мне"** during this follow-up. Further native input was stopped. Post-fix native Ctrl+F, sustained typing/Backspace, every toolbar command, all theme/zoom/window/panel combinations, close during pending save and restart are therefore **PENDING USER SMOKE**, not WINDOWS NATIVE PASS. Browser results do not certify them. Historical double-rAF/Event Timing observations are retained in the preceding section, not presented as new measurements after this fix. Physical input-to-photon latency remains outside the available instrumentation.

The attempted one-shot native reload observer timed out without a usable reload timestamp; it is **NOT VALIDATED** and is not proof of an application freeze. Process responsiveness and stale/nonchanging UI observations alone do not establish either a freeze or a successful click. No user process was forcibly terminated to make the measurement work.

A separate final QA executable/profile is prepared for this handoff, with the same synthetic 10,003-note dataset and no provider profiles/credentials. It uses identifier `com.noteflow.qa.finalnativevalidation`, independent of the normal profile and the earlier QA executable. The existing destination database was not overwritten. The final executable and short smoke checklist are listed with the final results below. No native macOS validation or port was attempted; **MACOS NATIVE PENDING** is not converted into a Windows correctness claim.

### Final-Build Loading Repetition

The controlled benchmark was repeated only after all final production/QA/profiling compilation finished, against the final shortcut/IME code. No second owned benchmark/compiler/browser suite ran at the same time. Accepted output: `releases/qa/loading-validation-final/results.json`; three independent series, n=30 per cell, six warmups excluded, 126 identical DTO payload hashes. Current after fixture: `final2-native-validation-after`; before is the retained previous-pass Worker/virtualization production fixture, not published RC6.

DOM-ready usability, milliseconds:

| Side / cache mode | n | Minimum | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before / new browser process | 30 | 324.3 | 380.8 | 406.4 | 449.2 |
| After / new browser process | 30 | 327.1 | 377.5 | 431.0 | 490.5 |
| Before / warm page | 30 | 154.7 | 192.4 | 229.4 | 235.2 |
| After / warm page | 30 | 148.5 | 190.3 | 243.2 | 244.2 |

There is **no reproduced sustained 375 -> 623ms regression** in either complete controlled run. This does not mean every tail improved: final cold/warm p95 are higher by 24.6/13.8ms, and the after cold maximum is 490.5ms. No outlier was discarded. The old five-observation median is not a reliable controlled comparison of cold/warm or SQLite cost. No production loading optimization was made to obtain these results.

Final browser phase timing, p50/p95:

| Phase | Before | After |
| --- | ---: | ---: |
| Mock metadata response, process-cold | 0.4 / 0.7 | 0.4 / 0.7 |
| Mapping + render after metadata, process-cold | 204.8 / 251.1 | 204.7 / 241.8 |
| Mock metadata response, warm | 0.2 / 0.4 | 0.2 / 0.3 |
| Mapping + render after metadata, warm | 128.8 / 169.6 | 132.4 / 161.1 |

The legacy locator timestamp on these same navigations has before/after process-cold medians **404.0/404.5ms**, warm **224.8/215.0ms**. Its extra automation gap reaches **73.1ms**. This confirms the endpoint was contaminated by automation, but does not claim to reconstruct every historical 1.3-second outlier.

A separate fresh QA-only unminified React production-profiling build measured ten 10k-note loads at 1920x1080: six root commits each, 23 mounted cards, summed root actualDuration minimum/p50/p95/max **15.7/23.7/47.8/47.8ms**. Raw data: `typing-react-profile-loading-final/results.json`. This is renderer work in a diagnostic build, not a native latency distribution or an exclusive phase to subtract from the 1440x900 ordinary-production table. DTO hydration outside React and resource/layout scheduling remain outside that Profiler duration.

### Reproduction Commands And Evidence

These commands assume the retained local frozen fixtures and the existing QA Playwright runtime (`NOTEFLOW_QA_PLAYWRIGHT` module URL), not a newly installed production dependency. Run performance measurements separately from compilers, native typing and the full browser suite. Preview servers may remain idle.

```powershell
# Separate terminals for the retained before and final after production fixtures.
npm exec vite preview -- --host 127.0.0.1 --port 1431 --strictPort --outDir releases/qa/typing-production-after
npm exec vite preview -- --host 127.0.0.1 --port 1432 --strictPort --outDir releases/qa/final2-native-validation-after
node scripts/qa/loading-validation.mjs final

# Optimized real SQLite/DataStore benchmark; fixture is the synthetic QA snapshot.
$env:NOTEFLOW_QA_LOAD_DB='D:\Projects\NoteFlow\releases\qa\final-native-loading\database.sqlite'
cd src-tauri
cargo test --release profiles_isolated_workspace_loading -- --ignored --nocapture --test-threads=1
cd ..

# Current UI and separate profiling preview.
npm run dev -- --host 127.0.0.1 --port 1420 --strictPort
npm exec vite preview -- --host 127.0.0.1 --port 1433 --strictPort --outDir releases/qa/final-native-validation-profile
$env:NOTEFLOW_TYPING_URL='http://127.0.0.1:1433/scripts/qa/final-ux-fixture.html'
node scripts/qa/typing-react-profile.mjs loading-final --loading
Remove-Item Env:NOTEFLOW_TYPING_URL
node releases/qa/final-validation-browser.mjs
```

`native-loading-validation.mjs reads` is a separate read-only native SDK diagnostic requiring exactly one isolated synthetic WebView on local CDP port 9237 and the known QA note marker. It does not generate native input. Its timed read requests do not update notes. The failed `reload` mode is retained as diagnostic history, not an accepted startup benchmark.

Source-boundary verification (`final-validation-source-boundaries.json`) confirms byte-identical AppShell, incremental search, Worker/preparation clients, canonical/portable Markdown code, editor CSS/tokens and canonical Tauri config against this pass's source snapshot. The production region of `data.rs` is identical after line-ending normalization; all added storage code is a test-only benchmark. The only production behavior correction is native find-key routing and its existing search UI focus/navigation handling.

### Final Gates, Comparison And Handoff

Final source includes the IME guard. The earlier 811-test build logs are retained but are not substituted for these final results:

| Gate | Final result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm run test` | **812/812 PASS**, 75 suites, zero failed/skipped; 31.648s (baseline 802) |
| `npm run build` | **PASS**, also executed by both final Tauri builds |
| `cargo fmt --check` | **PASS** |
| `cargo check` | **PASS**, 0.55s, no emitted warnings |
| `cargo test` | **288 PASS, 11 ignored**, zero failed; 22.95s (baseline 285 PASS / 10 ignored) |
| Explicit optimized loading benchmark | **1 PASS**, 3 connection series / 30 samples; the newly ignored benchmark was executed separately |
| Strict all-target/all-feature Clippy, warnings denied | **PASS**, 0.72s, no emitted warnings |
| `npm audit --omit=dev --offline=false` | **0 production vulnerabilities** |
| Entire old browser baseline | **1839/1839 PASS**, no runner disabled |
| Additional search behavioral browser runner | **12/12 PASS** |
| Browser aggregate | **1851/1851 PASS**, 15 runners, 903.183s sequential runtime |
| Canonical Windows `npm run tauri build` | **PASS**, en-US/ru-RU MSI and NSIS rebuilt locally |
| Separate user QA production executable | **PASS**, version metadata verified as 1.0.0-rc.6 |
| `git diff --check` | **PASS**, informational LF-to-CRLF notices only |
| Post-fix native UI / all 31 actions / actual sustained typing | **PENDING USER SMOKE**, explicitly handed off by the user |
| macOS native | **PENDING**, no Mac release/port claimed |

Browser runner counts: 348 Sidebar appearance; 272 Sidebar stability; 562 Settings overflow; 110 final UI; 86 corrective3; 40 final geometry; 10 visual checks; 14 RAG source navigation; 79 links; 8 Markdown acceptance; 13 panel motion; 88 post-RC6 corrections; 202 strict-toolbar checks; 7 real Worker/persistence cases; 12 new search cases. Exit status/duration/source-hash manifests are under `final-validation-browser/`. Only generated QA artifact-root paths were substituted; assertions and all old suites were retained. Actual user fixture coverage reads `tests/fixtures/post-rc6-user.md` in both Node and browser tests.

The 202 toolbar checks again cover all 31 direct controls, exact one-row order, bounds, density and supported zoom/panel combinations, including 96 configurations and 768 intermediate Sidebar frames. Existing Sidebar manual drag, width persistence, rapid toggles and reduced motion remain green. These are **BROWSER PASS**, not native OS/DPI proof. The seven Worker cases verify latest-content persistence across navigation, complex sidecars, no passive autosave, failure/Retry and deferred fallback coalescing; native close/restart during saving remains for the user.

Hardware/runtime recorded for this pass: Intel Core i5-13420H, 12 logical processors, 16,852,574,208 RAM bytes, Windows x64 build 10.0.26200, Node 24.15.0, Edge 156.0.4314.50. No causal OS/antivirus/power-state conclusion is inferred from these specifications. The first final-gate launch had an automatic permission-review timeout; the permitted single retry ran successfully. It was infrastructure, not a failed source test.

For native smoke use only:

`D:\Projects\NoteFlow\releases\qa\NoteFlow-QA-Final.exe`

Expected title/productName: **NoteFlow QA Final Validation**. ProductVersion/FileVersion: **1.0.0-rc.6**. SHA-256: `963963AEDF21832E59D02746E78523F7064E121783D5B458B00DEF91604147DF`. Profile: `com.noteflow.qa.finalnativevalidation`, independently seeded from the guarded synthetic snapshot (10,003 notes, 0 attachments, 0 chat providers, 0 embedding profiles). No existing profile database was overwritten. Short Russian checklist and detailed action list: `releases/qa/FinalNativeSmoke.md`.

This is not the earlier **NoteFlow QA Native Search** executable/window. Do not use the normal `src-tauri/target/release/noteflow.exe` for this isolated smoke: its identifier is the normal desktop profile. Native Ctrl+F/F3, editor/IME focus, fast typing/Backspace, all 31 actual commands, selection, themes, 100/125/160%, supported window/panel sizes, close during save and restart remain explicit manual checks. No real credentials are needed to check the AI control's honest unconfigured state.

Final branch: **codex/post-rc6-markdown-performance**; HEAD **42cdf9cca1371eac49c5645f6f82036d63b65b50**. Final tree: **49 modified, 44 untracked, 0 staged**, including the earlier large uncommitted work. Version remains **1.0.0-rc.6** in package/lock/Tauri/Cargo, MSI mapping **0.99.6**, canonical productName **NoteFlow**, identifier **com.noteflow.desktop**. All 12 RC5/historical preservation hashes and all 4 RC6 staged-release hashes match. New canonical bundles remain local target outputs, not copied into published staging.

No add, commit, push, merge, tag, version bump or release was performed. No historical QA file was removed; failed/incomplete diagnostic attempts remain identified separately from accepted results. Owned dev/preview servers were stopped. After the user's handoff, no further native input or forced termination of the native QA/user applications was performed.

**Final handoff verdict: READY FOR USER SMOKE.** This denotes technical readiness for the native smoke the user chose to perform, not completion of the original all-native acceptance matrix or Windows/macOS Stable release approval. The suspected large loading regression was not reproduced in two controlled complete A/B runs; no speculative production loading rewrite was made. Search correctness, data-flow protections and mandatory automated/build gates are green. No newly confirmed automated blocker remains.

Remaining risks are bounded and explicit: actual post-fix Windows accelerator behavior and subjective sustained typing are unvalidated until that smoke; exclusive IPC transport and physical paint are not separately measured; native cold-start/reload instrumentation did not yield a valid timestamp; existing full-content/N+1 DTO loading is scalability debt, not a demonstrated new regression; monitor-change/unsupported persisted-layout recovery and macOS native QA have not been newly certified. Do not reopen an indefinite micro-optimization loop solely because an old double-rAF proxy did not fall. If manual smoke exposes a reproducible freeze, missed input, shortcut or geometry failure, record its exact supported layout/action sequence and address that concrete blocker before release.
