# Final UX, Markdown and Internal Linking Improvements

## 1. Executive Summary

Development branch: `codex/stable-ux-markdown-links`, based on published RC5 `e1ba444a4fb5939814ffb2daf6f0d5902bc64531`. Application version remains `1.0.0-rc.5`; this is not a stable release. No commit, push, merge, tag or publication is authorized for this task.

Implementation is present for all eight requested areas. The resumed regression on 26.10.2026 passed the frontend, Rust, browser, security and Windows packaging gates. Real Windows Tauri/WebView2 QA verified the primary Markdown export/import, system clipboard, ID/fragment navigation, onboarding and persistence flows below. This is readiness for user smoke, not permission to publish 1.0.0. Extended native cases and live RAG are explicitly separated from automated evidence. macOS native validation remains a separate stable-release blocker.

## 2. Initial Problems

- Ten palette entries collapsed into five chip CSS colors, although custom HEX values were persisted. Legacy green fallback accidentally selected the first green-family entry (teal).
- Entity-name counting used code points and the tag limit was 80 rather than 25. Native `maxLength` also counted UTF-16 units.
- A failed Markdown mark-projection comparison stripped all marks from a paragraph and relied on an appearance sidecar. Standalone Markdown export could not carry that recovery data.
- There was no validated ID-based note/fragment link insertion flow.
- RAG navigation used headings, the first six snippet words, then individual words, risking false source highlights.
- Tutorial progress used dots, and name entry came after the tutorial with an unnamed skip path.
- The new-note dialog repeated its selected date. The shared tooltip's original CSS centered help text.

## 3. Root Causes and Reproduction

The exact RC5 Markdown modules were extracted with read-only `git archive` into ignored QA storage. For a bold selection containing edge spaces, RC5 exported `До жирный фрагмент после`; the working tree exports `До<strong> жирный фрагмент </strong>после`. The simple partial-bold example without edge spaces already worked; the confirmed defect was broader mark-range fallback, not every partial bold selection. Evidence: `releases/qa/final-ux-markdown-reproduction.log`.

Full-suite adversarial-parser timing failed under unconstrained parallel test workers, while the identical isolated probe passed. All tests passed with four workers. `npm test` now bounds concurrency at four without removing tests, increasing time limits, or changing the existing 1,000 ms security threshold. An extension-free Marked lexer path also avoids repeated custom-tokenizer scans for ordinary text.

## 4. Changed Components

- Shared grapheme/name helpers, reusable counter, note/project/tag creation and rename forms, import title editing and duplicate validation.
- Tag palette/mapping, list/search chips, editor chips and legacy-color editing.
- Markdown parser/serializer and safe inline HTML allowlist; existing backend export still reads canonical Markdown.
- Internal URI parser, note picker, toolbar/context actions, link interception, fragment mapping/decorations and AppShell navigation.
- First-run profile transaction/command, existing UI-settings storage and icon-based tutorial progress.
- New-note date UI and existing tooltip CSS.
- Behavioral, structural, SQLite/fault, geometry and vision-emulation tests. No migration or new UI library.

## 5. Tag Palette

Ten distinct IDs/HEX values cover blue, sky, teal, green, red, amber, orange, rose, violet and graphite. Persisted compatibility family IDs remain unchanged; exact selected identity is the existing `customColor`. All consumers now use that exact value. Legacy/custom colors are retained, including an explicit current-color swatch when their HEX is outside the new palette. No mass update of stored tags.

Final browser measurements for new palette chips: text contrast at least 13.08:1; indicator contrast at least 3.08:1 across light/dark. Chromium vision emulation ran normal, deuteranopia, protanopia, tritanopia and achromatopsia in both themes (10 cases). Labels remain present; color alone is not claimed to distinguish all tags for every viewer. Evidence/screenshots: `releases/qa/final-ux-vision/`.

## 6. Name Limits

Notes, projects and tags use the same normalized 25-grapheme rule. Frontend uses `Intl.Segmenter`; Rust directly uses the already locked `unicode-segmentation` 1.13.3. No dependency version was upgraded. Counters show `N / 25`, over-limit error/red state and disabled save; pasted text is not truncated. Empty names are rejected. Existing long names remain readable and unchanged; ordinary content saves and appearance-only edits of an unchanged legacy tag still work. Duplicate titles use the same validator. The existing profile-name limit remains 48, counted safely rather than as UTF-16/code points.

## 7. Markdown Roundtrip

Standard expressible marks remain standard Markdown. Underline uses `<u>`; ambiguous/crossing ranges, whitespace-sensitive marks and combined code marks use an allowlisted inline HTML fallback. Supported tags are strong/b/em/i/s/del/u/code/mark and safe links; highlight background is limited to a six-digit HEX. Imports create editor nodes/marks, never execute HTML. Arbitrary tags, events and styles are not granted executable behavior.

Interior blank paragraphs can use `<p></p>`. The final empty editing paragraph is omitted, preserving canonical list reopen behavior. Sidecars still carry editor-specific layout, font and asset appearance; a standalone `.md` is not advertised as a lossless transport for all rich-editor attributes. Markdown remains the text source; no second serializer or cache-first load path was introduced.

Tests compare per-character marks, not just text. They include nested/crossing spans, entities, links, code/bold, highlight color, lists/tables/callouts/images and ten Markdown-only cycles of `Стоимость следующая -` with partial underline.

## 8. Internal Links

Canonical URI: `noteflow://note/<stable-id>`. Fragment links add `quote`, `before`, `after`; the latter two are SHA-256 fingerprints of up to 48 nearby UTF-16 positions within the boundary text blocks. Neighboring plaintext, paths, profile data and credentials are not embedded. WebCrypto has a bounded local Rust SHA-256 fallback.

Picker is available from the link popover and right-click menu, with typed title search, mouse/keyboard selection and Escape. Existing link UI supports editing/removal. Fragment-copy uses the existing native/browser clipboard service and copies a Markdown link. Internal links never reach the external opener. Unknown/invalid URI parameters, credentials, hosts, malformed fragments and oversized links are rejected.

Links survive autosave/restart/export and full backup with preserved note IDs. Rename/project movement does not change identity. There is no title-based remapping across profiles; an absent target stays unavailable, not relinked to a similarly named note. Duplicate notes retain their existing outgoing targets. No backlink service, automatic document rewrite or workspace-wide migration was added.

## 9. RAG Source Navigation

One ProseMirror text-position map handles cross-block quotes and temporary decorations. Heading/individual-word fallback is removed. Internal fragments require contextual agreement; ties are rejected. RAG snapshots must match the authoritative note timestamp and the complete normalized displayed quote must occur uniquely. Changed/ambiguous/deleted sources produce a neutral notice instead of a guessed highlight. Metadata-only timestamp changes can conservatively suppress a historical RAG highlight.

Decoration transactions do not change the document, selection, undo history, Markdown, sidecar or autosave. They clear on edit/context change and expire after four seconds. Scrolling reuses the zoom-aware search scroll helper and reduced-motion policy. Initial geometry sampling at 500 ms was premature during native smooth scroll; tests now await actual viewport visibility rather than claiming a coordinate bug.

AppShell navigation flushes pending saves and rejects late navigation results by sequence. No AI request or job lifecycle was replaced; existing background draft/streaming/history tests remain part of the full suite.

## 10. Onboarding and Profile

First-run name is mandatory before the existing six tutorial steps. Saving uses the existing UI-settings record and stores the existing completion marker as false atomically. Restart between name and tutorial resumes training without losing the name. Successful completion marks true using the established atomic first-note flow. Existing completed/customized RC5 profiles are not forced through onboarding again.

All six icons are visible together. Current/completed/future states are distinct, completed steps persist during Back/Next and future steps cannot be jumped to. Tutorial replay does not ask to rename the profile or create a first note. Error messages are generic and do not expose IPC/provider contents.

The previously interrupted native pass exposed a specificity conflict between completed and current icon styles. The existing correction uses `.onboarding-steps button[aria-current="step"]`; current state now wins over the completed background. The accessible label prioritizes current state. Fresh geometry and actual Windows Back/Next checks confirmed the correction; no replacement onboarding flow was introduced during the resumed QA.

## 11. Date UI

Only the duplicate `Выбрана дата` line was removed from the new-note dialog. Existing date control, keyboard calendar, `DD.MM.YYYY` display helper, metadata dates, sorting and SQLite/API timestamps are unchanged.

## 12. Tooltip Alignment

The actual shared tooltip selectors now align left. Existing portal, focus/hover delay, wrapping, viewport positioning, Escape and reduced-motion behavior are retained. Eight new geometry combinations check right-edge positioning in both themes and at 100/160% zoom.

## 13. Windows Native QA

Environment: debug Tauri/WebView2, not a browser substitute. Profile: `releases/qa/final-ux-native-20261025-ef092c38`, selected with the existing debug-only `NOTEFLOW_DEV_DATA_DIR`. The installed user profile, real notes and credentials were not used. Captured window sizes included approximately 1442 x 864 and 1536 x 816. Synthetic files and database inspection evidence remain Git-ignored under `releases/qa/`.

### Verified

- The first-run profile saved `QA Stable`; tutorial replay from Settings and cold restart did not ask for the name again. Empty-name/failed-save behavior also has fresh behavioral coverage; the original blank native first-run state was observed before entering the QA name.
- Tutorial icons occupy one row. Forward, Back, completed/current/future styling and Enter on Next were checked in the real window. Light 100%, light 160% and dark 160% were observed. Current remains visibly distinct after Back. Replay does not create another first note.
- A note containing `Это обычный текст, а это жирный фрагмент, затем снова обычный текст` was typed; only `жирный фрагмент` was selected and made bold with Ctrl+B. The actual system Save dialog produced `final-ux-native-bold.md`. Its contents were read from disk: `Это обычный текст, а это **жирный фрагмент**, затем снова обычный текст`.
- That exact file was imported through the real Windows file picker into a separate empty note. Text and the start/end of bold formatting were visually correct; neighboring text was retained.
- A second real import covered partial italic, inline code, strike, hyperlink, underline, bold/italic and code/bold combinations, mixed marks, lists and tables. `Стоимость следующая -` retained bold/underline on the intended word. The actual `final-ux-native-rich-export.md` retained these marks, list/table Markdown, safe underline HTML and the internal ID link. An escaped hyphen in exported Markdown is syntax escaping, not a lost character.
- In the imported note, the exact phrase was selected and the context-menu action `Скопировать ссылку на фрагмент` was invoked. Ctrl+V into the other note used the actual system clipboard and produced a clickable Markdown-derived internal link, containing the target ID, selected quote and context hashes.
- Clicking that link opened the correct note and highlighted exactly the phrase. Highlight expired. The ordinary link picker was also tested through toolbar, title search, Enter selection and a real click. No external browser was opened.
- The ordinary link continued to work after the target was renamed, assigned to a newly created QA project, archived and cold-restarted. Opening the archived target did not add it to the regular list. The fragment link still resolved after surrounding text was extended and after cold restart.
- The mixed-format document remained correct after switching away/reopening and cold restart, including lists, table, underline and links. Read-only SQLite inspection returned `PRAGMA integrity_check = ok`.
- A 26-grapheme emoji note title produced a red `26 / 25`, error and disabled create. A 26-character tag name likewise could not be saved. The new-note date appeared only once. Project/name rules have separate behavioral and Rust coverage; not every native form was repeated with every Unicode sample.
- All ten palette swatches were observed in the dark native dialog. A red QA tag was selected and saved; the red dot, name and exact `#C83F45` persisted after restart. The legacy family value remains `pink` by design; display uses the persisted custom HEX.
- RAG native UI correctly showed missing models and a disabled composer rather than generating a fake answer. The model settings screen confirmed no chat or embedding profile in this QA profile. No credentials were copied and no external AI request was issued.

The isolated debug application was closed normally after QA; its Cargo process exited 0 and the owned Vite server was stopped. WebView2 emitted `Failed to unregister class Chrome_WidgetWin_0. Error = 1412` during shutdown. No corresponding crash or navigation failure was observed; this teardown diagnostic is recorded, not silently counted as a warning-free native run. The new installers were not executed against the user's profile.

### Database Observation and No-Autosave Control

The immediate controlled cold-restart snapshots matched note IDs, Markdown SHA-256, content versions, archive state and tag HEX (`final-ux-native-before-restart.json`, `final-ux-native-after-restart.json`). A later comparison spanning the interrupted sessions found the mixed note's CAS version at 6 rather than 4, although its Markdown hash and current JSON/HTML/plain-text caches matched the latest revision. The origin of those intervening saves was not established; this broader interval is not presented as proof of zero writes.

A fresh, isolated control captured version 6, performed only B -> A -> fragment B navigation, then checked again after the temporary decoration expired. Both note hashes and CAS versions remained identical. Evidence: `final-ux-native-navigation-baseline.json`, `final-ux-native-navigation-result.json`, `final-ux-native-navigation-settled.json`. Thus a highlight-triggered autosave was not reproduced. Retain the uncontrolled CAS observation for follow-up if it recurs; do not silently rewrite the completed persistence system based on it.

### Pending Native Coverage

- Full live RAG generation/retrieval/source clicking, stale indexed chunks and multiple real provider sources: NOT VALIDATED without a configured, authorized QA model.
- Exhaustive long-note middle/end/repeated-context cases, removed fragment/deleted target, and full backup/restore portability: automated coverage exists, but the complete native matrix was not repeated. No destructive UI deletion/restore was performed.
- All 25/26-grapheme samples in every native form, all ten saved colors in both native themes, edge-positioned help tooltips, narrow-window onboarding, dark 100% replay and an OS reduced-motion change: browser/behavioral evidence only for the unobserved native combinations.
- No native assertion is inferred from a screenshot that was not opened. Transient Computer Use file-picker index/coordinate issues were recovered with fresh observations; they are not recorded as product bugs or successful actions.

## 14. macOS Readiness

No connected macOS runner or native environment was available. No macOS CI/build was run for this uncommitted tree; nothing was pushed to manufacture such a result. MACOS NATIVE: PENDING.

Static review: ID URIs contain no Windows paths/shell commands; parsing and text-position mapping use platform-neutral APIs. Clipboard uses the existing Tauri native commands; paste recognizes Ctrl or Meta. The picker supports ordinary arrows/Enter/Escape. Fingerprinting has a bounded local Rust fallback when WebCrypto is absent. Frontend grapheme counting depends on `Intl.Segmenter`, so its availability and Unicode behavior in the minimum supported WKWebView must be validated. Windows WebView2 screenshots do not prove Safari rendering, font geometry or smooth-scroll behavior. Native macOS clipboard, focus, scaling, menu shortcuts and scrolling remain mandatory before a cross-platform 1.0.0 release.

## 15. Automated Results

These are actual resumed runs, not the historical baseline:

| Gate | Result | Evidence under `releases/qa/` |
| --- | --- | --- |
| `npm run typecheck` | PASS | `final-ux-resume-typecheck.log` |
| `npm run test` | 697/697 PASS, 75 suites, 0 skipped; 44.79 s | `final-ux-resume-test.log` |
| `npm run build` | PASS; Vite 21.57 s | `final-ux-resume-build.log` |
| `cargo fmt --check` | PASS | `final-ux-resume-fmt.log` |
| `cargo check` | PASS | `final-ux-resume-check.log` |
| `cargo test` | 281 PASS, 0 failed, 10 existing ignored; main test run 39.48 s | `final-ux-resume-rust-test.log` |
| Strict all-targets/all-features Clippy | PASS | `final-ux-resume-clippy.log` |
| `npm audit --omit=dev --offline=false` | PASS, 0 vulnerabilities | `final-ux-resume-audit.log` |
| Existing browser suites | 348 + 272 + 562 + 110 + 86 = 1,378 PASS | `final-ux-resume-approved-sidebar.log`, `-sidebar-stability.log`, `-settings-overflow.log`, `-final-ui.log`, `-corrective3.log` |
| New UX geometry | 40 PASS, including current/completed CSS priority after Back | `final-ux-resume-geometry.log` |
| Vision/theme/contrast | 10 PASS | `final-ux-resume-vision.log` |
| `npm run tauri build` | PASS; Rust release compilation 5 min 06 s; NSIS and both MSI produced | `final-ux-resume-tauri-build.log` |
| `git diff --check` | PASS | No whitespace errors; Git emits existing LF-to-CRLF notices |

Browser tests use synthetic IPC and temporary browser contexts, not live providers or the user's DB. The full frontend run retained its four-worker bound, with no security threshold increased and no test removed. No new production fix was needed during this resumed QA. Build entry is 366.90 kB and lazy editor chunk 473.84 kB; export workers remain separately loaded. No new Vite chunk-size warning was printed.

## 16. Remaining Risks

macOS native/build and fresh live Bridge/Ollama smoke are not validated. No user credentials are copied into QA. Identical duplicate quote/context matches intentionally fail closed; deleted/replaced fragments cannot be guaranteed recoverable. Standalone Markdown does not carry every sidecar-only attribute. The extended Windows matrix listed above is not all marked PASS. The inter-session CAS observation is retained, while isolated highlight navigation is verified not to save. No new P0/P1 defect was reproduced in the executed matrix; that is not a claim that untested cases are defect-free. No auto-update, installer signing or stable release is added here.

## 17. Git Status and Control

Branch: `codex/stable-ux-markdown-links`. HEAD and the peeled published RC5 tag both resolve to `e1ba444a4fb5939814ffb2daf6f0d5902bc64531`. Working tree: 41 tracked modified, 19 untracked, 0 staged. Of the untracked entries, seven are historical sources/reports; their preservation manifest still matches SHA-256. They were not deleted or staged.

Canonical package/lock/Cargo/lock/Tauri versions remain `1.0.0-rc.5`, productName `NoteFlow`, identifier `com.noteflow.desktop`. No git add, commit, push, merge, tag, version bump or release was performed. Existing published RC5 staging installers and SHA256SUMS match `final-ux-rc5-preservation.json`. The new local target outputs were not copied over the published/staged RC5 set.

## 18. Eight-Requirement Status

DONE here means implemented and covered by the stated checks; it does not imply every native/platform permutation or stable-release approval.

| Requirement | Implementation / automated | Browser | Windows native | macOS / live |
| --- | --- | --- | --- | --- |
| Tag colors | DONE; distinct HEX and legacy preservation | PASS; 10 vision/theme cases | Palette/save/restart PASS; exhaustive light/dark saved-color matrix pending | macOS PENDING |
| 25-grapheme title limit | DONE; frontend/Rust and legacy-name guards | PASS | Note emoji overflow and tag overflow PASS; complete project/Unicode native matrix pending | macOS PENDING |
| Markdown roundtrip | DONE; per-character mark signatures, P0 repeated cycles | Existing editor regression PASS | Actual file export/import, mixed marks, list/table, P0 text and cold restart PASS | macOS PENDING |
| Internal links | DONE; URI/context/safety/persistence tests | Long-note fragment/scroll/no-save PASS | Picker, clipboard, ID open, rename/move/archive, changed surrounding text and restart PASS; extended missing/deleted/ambiguous matrix pending | macOS PENDING |
| RAG source navigation | DONE implementation; exact-match/timestamp/decorations tested | Shared scroll/highlight tests PASS; synthetic evidence only | PARTIAL: honest no-model state observed; real source-click flow unavailable | LIVE AI NOT VALIDATED; macOS PENDING |
| Onboarding icons | DONE; DOM state/label tests | 100/160%, narrow/wide, light/dark PASS | Primary first-run/replay/Back/Next/Enter and 100/160% observed combinations PASS; remaining combinations listed above | macOS PENDING |
| Mandatory profile name | DONE; atomic save/error/restart/legacy tests | PASS | QA name persisted; replay/cold restart did not ask again | macOS PENDING |
| Date / tooltip fixes | DONE; shared date semantics unchanged | Date duplication and left-aligned bounded tooltip PASS | Single date observed; native edge-tooltip matrix pending | macOS PENDING |

## 19. Local Windows Build and Verdict

Local outputs, NOT published:

- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.5_x64-setup.exe`
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.5_x64_ru-RU.msi`
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.5_x64_en-US.msi`

Read-only MSI inspection confirmed ProductName `NoteFlow`, ProductVersion `0.99.5`, languages 1049/1033 and unchanged UpgradeCode `{FF9D3DE5-B119-5CB0-9873-43E30A097AFA}`. EXE ProductVersion/FileVersion is `1.0.0-rc.5`. Installers were built and inspected, not installed as a new lifecycle smoke. Published RC5 assets remain unchanged.

Verdict: **READY FOR USER SMOKE** for the Windows corrective work with the explicit pending checks above. This is NOT readiness to publish NoteFlow 1.0.0. Next: user smoke of the extended native cases and authorized live RAG source navigation; then actual macOS Apple Silicon build/native validation before any cross-platform stable release.

## 20. CAS / RAG / WebView2 Final Diagnostics

This section records the new 26 October 2026 diagnostic pass. It supersedes the earlier unknown CAS origin and no-live-provider observations, not the historical evidence or platform limitations above.

### Scope and Isolation

Baseline: branch `codex/stable-ux-markdown-links`, HEAD `e1ba444a4fb5939814ffb2daf6f0d5902bc64531`, version `1.0.0-rc.5`; 41 modified, 19 untracked, 0 staged. Only an existing synthetic QA database was cloned, using SQLite's backup API, into `releases/qa/cas-rag-exit-20261026`. The user's profile, model profiles and credentials were not read/copied/modified. Two local, keyless Ollama profiles were configured through the real QA UI. No cloud AI request was made.

An ignored, test-only audit helper (`releases/qa/cas-rag-exit-audit.py`) installed triggers in this QA database, not in migrations or production. They record operation type, ID, content versions and changed-field booleans, never document bodies. Read-only snapshots include canonical SHA-256 field/sidecar hashes and `PRAGMA integrity_check`. These hashes use canonical JSON encoding, including for string fields; they are comparison fingerprints, not raw exported `.md` checksums.

### CAS Root Cause and Minimal Fix

The redundant write was reproduced, not inferred from a counter alone. Opening the Notes/editor/new-note flow after startup caused the existing mixed-format note to advance from CAS 6 to 7. The audit recorded an actual `UPDATE notes`, then deletion/reinsertion of its two sidecars. Markdown, JSON, HTML, plain text, metadata and both sidecar fingerprints were identical before and after. `updated_at` did change. Thus this was a genuine unnecessary save, capable of needlessly invalidating source timestamps or another editor's expected version.

Browser instrumentation of the real AppShell/TipTap, using only synthetic QA data, isolated the initiating transaction: `note-search$`, with **zero root document steps**, followed by an appended `replace` from TipTap's TrailingNode. A note ending in a table/list/heading has no terminal paragraph after Markdown loading. `NoteSearchBar` dispatches its initial search decoration update; upstream TrailingNode also responds to such non-edit transactions and adds a paragraph. TipTap therefore correctly emits `update`, but the serialized document can equal the previously stored document/cache. This explains the inter-session counter observation.

Changed production files in this pass:

- `src/features/editor/editorInteractions.ts`: `PassiveEditorTransactions` uses the existing upstream `skipTrailingNode` transaction metadata for transactions with `docChanged === false`.
- `src/features/editor/EditorArea.tsx`: registers that extension in the existing extension set.

This prevents selection/focus/search/source-decoration transactions from acquiring an unrelated trailing paragraph. Actual content edits still use upstream TrailingNode normally, including an editable paragraph after a terminal block. No serializer, autosave queue, backend transaction, optimistic-concurrency policy, revision cadence or restore behavior was rewritten. No document text is logged. No persisted sidecar or metadata change is filtered out.

### Version and Hash Evidence

IDs below refer only to synthetic notes: B = imported mixed-format note (`b1f1...37ef`), A = archived internal-link target (`bfca...c29a`), C = newly created long `CAS QA` note (`3517...787c`). Hashes are shortened here; complete fingerprints are in the named ignored JSON evidence.

| Operation | Note / CAS before -> after | Markdown / sidecar result | Audit result |
| --- | --- | --- | --- |
| Startup before correction | B 6 -> 6; A 4 -> 4 | Unchanged | 0 events |
| Reproduced editor mount before correction | B 6 -> 7 | MD `3b05644d818c...` unchanged; attrs `1579742b68ce...` and legacy `c84b3f8d9016...` unchanged; all other content/metadata hashes unchanged | 1 note update + 4 sidecar events |
| Native creation and intentional formatted paste | C created -> 1 | MD `4db22724bd6b...`, attrs `dcc46fd6a9bf...` | Expected insert/save; total audit 11 |
| Corrected source navigation, expired highlight, AI Sidebar open/close and Date Picker cancel | C 1 -> 1; B 7 -> 7; A 4 -> 4 | Every document, metadata and sidecar hash unchanged | Total remains 11 |
| First cold restart after correction | C 1 -> 1; B 7 -> 7; A 4 -> 4 | All note snapshot fields unchanged | 11 -> 11 events |
| Repeated live source navigation at 100% / 160% | C 1 -> 1 | Markdown/cache/sidecar unchanged | Still 11 events |
| Pin C through native UI | C 1 -> 1 | Only metadata hash / `updated_at` changes | Exactly 1 metadata-only update; total 12 |
| Open B, ID-link to archived A, fragment-link back to B | B 7 -> 7; A 4 -> 4 | All content and sidecars unchanged | Still 12 events |
| Intentional final paragraph and normal close | C 1 -> 2 | MD `a3830c8b498c...`; attrs `0c47bb2b80f7...`; legitimate cache/sidecar changes | Exactly 1 content update + 4 sidecar events; total 17 |
| Next cold restart and completed note-AI request | C 2 -> 2; B 7 -> 7; A 4 -> 4 | Notes unchanged; chat messages persisted separately | Still 17 note/sidecar events |
| Fourth cold startup, reopen note-chat history, ordinary close without editing | C 2 -> 2; B 7 -> 7; A 4 -> 4 | Entire note snapshots unchanged; completed AI response visible after restart | 17 -> 17 events; integrity `ok` |

Evidence under `releases/qa/`: `cas-rag-exit-startup-1.json`, `-opening-events.json`, `-formatted-1.json`, `-pre-source.json`, `-after-source.json`, `-closed-1.json`, `-restart-2.json`, `-source-160-settled.json`, `-metadata-pin.json`, `-internal-navigation.json`, `-closed-2.json`, `-restart-3.json`, `-closed-3.json`, `-restart-4.json`, `-closed-4.json`. All executed integrity checks returned `ok`. SQL version/hash checks distinguish intentional changes from no-edit navigation rather than assuming every increment is wrong.

### RAG Source Navigation and Live Provider

**LIVE LOCAL RAG: PASS for the executed main flow.** Real native model discovery returned the installed `bge-m3:latest` and `qwen3-4b-local:latest`. Connection testing succeeded. The QA embedding index completed 4/4 chunks. A real hybrid retrieval and grounded generation/citation-repair request returned the unique fact deliberately placed near the end of a 575-word QA document. One actual source was persisted with the answer. No synthetic provider was used for this native result.

Clicking the source opened C, scrolled through the long document to the matching preview excerpt, and temporarily highlighted that exact excerpt. Screenshot sequences were actually opened at both 100% and 160%; the highlight included the distinctive fact and surrounding text present in the saved source preview, not an arbitrary keyword. It expired and did not change the document, caches, sidecars, CAS or audit count. Returning to RAG retained the answer/source. A cold restart retained the same chat, messages and source.

After a deliberate metadata update changed `updated_at`, clicking the historical source conservatively opened the note without a highlight and displayed the existing changed/ambiguous-fragment message. This timestamp-based fail-closed behavior is intentionally preserved, even for metadata-only changes. The first test question mentioned a fictional project that had not been created; the agent correctly requested clarification instead of inventing a match. The all-database follow-up returned the real source.

Additional real-AppShell browser matrix: **14/14 PASS**, at 100% and 160%, using clearly synthetic persisted-message IPC fixtures. Cases: current long-note source, archived source, multiple sources and repeated navigation, repeated ambiguous quote, stale timestamp, missing fragment and deleted target. Assertions cover exact temporary decoration, viewport intersection, expiry, retained answer/sources and zero `update_note_content` calls. A missing target leaves the existing workspace intact. These are behavioral browser tests, not native/live PASS claims. Native multi-source generation, an actual deleted source and all archive/reindex permutations were not exercised destructively in this pass.

### WebView2 Exit Conclusion

Reproduced diagnostic: `Failed to unregister class Chrome_WidgetWin_0. Error = 1412`, emitted from Chromium `ui/gfx/win/window_impl.cc`, not NoteFlow's SQLite or note serializer. The matching upstream code logs an unsuccessful `UnregisterClass` during window-class cleanup. Microsoft defines 1412 as `ERROR_CLASS_HAS_WINDOWS`, meaning that the class still has open windows. See [Chromium source](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/gfx/win/window_impl.cc), [Microsoft error codes](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--1300-1699-) and [UnregisterClass contract](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-unregisterclassa).

All four native closes returned exit code **0**: after live RAG/source navigation, after an intentional document edit, after a completed live note-AI stream-command request, and ordinary close after a fourth no-edit startup/history check. Captured PID/PPID/creation-time trees distinguished owned QA WebView2 children from unrelated browser/Codex processes. A transient immediate sample still contained two children after the first exit; the later sample contained zero. Later exits likewise had zero remaining owned processes. The diagnostic recurred in all four logs, `cas-rag-exit-native-{1,2,3,4}.log`. No user processes were killed. The last edited paragraph and note-chat history survived reopening, integrity remained `ok`, and the next startup did not produce a corresponding failure or extra save.

The one-word note-AI response was observed complete and persisted. The actual note-chat service uses `run_note_ai_stream` and ControlledHttpClient; a long, visibly incremental response and closing mid-stream are not claimed as native coverage here. Their background/cancellation behavior remains covered by the existing automated suite.

Conclusion: a reproducible upstream teardown-order diagnostic, with no corresponding data-loss, nonzero-exit, persistent child-process or restart defect found in these runs. This is not a claim that upstream cleanup succeeded. The existing lifecycle and logs were left unchanged; no error was suppressed and no speculative shutdown rewrite was made.

### New Regression Coverage

- `tests/finalUxBehavior.test.ts`: seven additional real Editor/ProseMirror tests. One unprotected upstream control reproduces the search-triggered update; five terminal-block cases prove passive search/selection/focus/highlight transactions do not alter any serialized field or call autosave; a real table-sidecar edit still saves and gains an editable paragraph, and subsequent typing persists.
- `scripts/qa/final-ux-fixture.tsx`: opt-in isolated CAS seed and persisted RAG source fixtures only; ordinary existing fixture behavior retained.
- `scripts/qa/cas-rag-regression.mjs`: the 14-case source navigation/history/no-autosave browser matrix.

### Fresh Quality Gates

| Gate | Result / fresh evidence under `releases/qa/` |
| --- | --- |
| `npm run typecheck` | PASS; `cas-rag-final-typecheck.log` |
| `npm run test` | **704/704 PASS**, 75 suites, 0 skipped; clean run **46.49 s**, `cas-rag-final-test-clean.log` |
| `npm run build` | PASS; Vite **25.69 s**, `cas-rag-final-build.log` |
| `cargo fmt --check` | PASS; `cas-rag-final-fmt.log` |
| `cargo check` | PASS; **13.91 s**, `cas-rag-final-check.log` |
| `cargo test` | **281 PASS, 10 existing ignored**, 0 failed; test execution **68.31 s**, `cas-rag-final-rust-test.log` |
| All-target/all-feature Clippy, warnings denied | PASS; **1.98 s**, `cas-rag-final-clippy.log` |
| Online production npm audit | PASS, **0 vulnerabilities**; `cas-rag-final-audit.log` |
| Existing browser suites | **1,378 PASS**: 348 + 272 + 562 + 110 + 86; `cas-rag-final-{approved-sidebar,sidebar-stability,settings-overflow,final-ui,corrective3}.log` |
| Existing final UX geometry / vision | **40 + 10 PASS**; `cas-rag-final-{geometry,vision}.log` |
| Added source navigation matrix | **14 PASS**; `cas-rag-browser-regression-final.log` and `cas-rag-browser-results.json` |
| Isolated CAS AppShell probe | Before fix: 1 unintended save; after fix: **0 updates / 0 saves**; `cas-probe-result.json` records the corrected run |
| `npm run tauri build` | **PASS**, exit 0; Rust release compilation **6 min 30 s**, embedded frontend Vite **26.48 s**; NSIS and both MSI produced, `cas-rag-final-tauri-build.log` |
| `git diff --check` | PASS; existing LF/CRLF notices only, `cas-rag-final-diff-check.log` |

One loaded frontend run failed the existing adversarial-parser **1,000 ms** threshold with application parsing at **1,302.61 ms** while browser suites were active. The complete suite was rerun after those browsers finished, with no AI generation or build active: 704/704 passed. No timeout/threshold was raised, no security check was removed and no implementation was changed to conceal that failure. This load sensitivity remains a CI execution/isolation concern.

### Portability and Release Control

The production correction uses platform-neutral ProseMirror transaction metadata; no Windows paths, native APIs, new dependencies or platform branches were added. macOS build/native QA is still **PENDING**, not inferred from WebView2. The minimum supported WKWebView, clipboard, font geometry and scrolling still require a real Mac.

Version remains `1.0.0-rc.5` in package/lock, Cargo/lock and Tauri configuration; productName `NoteFlow`, identifier `com.noteflow.desktop` unchanged. No backend source changes were added by this diagnostic pass. Existing uncommitted backend work was preserved. No migrations, credential changes, git add/commit/tag/push/merge or GitHub release occurred. SHA-256 checks confirmed all four published RC5 staging entries and all eight historical files in the preservation manifests unchanged. New local build outputs are not published/staged over that set.

Working-tree count after adding the browser runner: **41 modified, 20 untracked, 0 staged**. All original untracked files remain. QA databases, audit helpers, logs and synthetic content remain ignored under `releases/qa/`, not in release assets.

Remaining limits: real macOS validation, exhaustive native multi-source/deleted/archive/reindex cases and mid-stream close remain unclaimed. No new P0/P1 data-integrity or source-navigation defect remains reproduced in the executed matrix. Source timestamp invalidation is deliberately conservative; ambiguous/deleted excerpts do not gain guessed highlights. Release readiness is not asserted by this diagnostic pass.

### Final Local Build and Verdict

Fresh local outputs, not published or installed against a user profile:

- `src-tauri/target/release/noteflow.exe` (21,022,208 bytes), ProductName `NoteFlow`, ProductVersion/FileVersion `1.0.0-rc.5`.
- `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.5_x64-setup.exe` (6,054,267 bytes).
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.5_x64_en-US.msi` (8,163,328 bytes).
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.5_x64_ru-RU.msi` (8,163,328 bytes).

After the build, all four published/staged preservation hashes and all eight historical-file preservation hashes still matched. All four owned native QA launches ended normally; the owned Vite server was stopped after the browser suites. The final DB audit remains at 17 events: the reproduced pre-fix save, intentional creation/content edits, and the deliberate metadata update; subsequent no-edit startup/navigation added none. Final `git diff --check`: PASS. Final tree: 41 modified, 20 untracked, 0 staged, unchanged HEAD/branch/version and published tag.

**READY FOR USER SMOKE**, with the explicit untested native/macOS cases above. This is not permission or readiness to publish NoteFlow 1.0.0. No commit, tag, push, merge, version bump or release was created.

## 21. Tag Appearance, Link Picker, Toolbar and Standard Markdown Corrective Pass

This section records the 27 October 2026 corrective pass against the current working tree. It supplements, rather than replaces, the earlier evidence. Baseline: `codex/stable-ux-markdown-links`, HEAD `e1ba444a4fb5939814ffb2daf6f0d5902bc64531`, version `1.0.0-rc.5`, 41 tracked modified / 20 untracked / 0 staged. No published release was edited. Existing uncommitted work and historical QA files were retained.

### 1. Tag Appearance: Root Cause and RC5 Comparison

The palette correction had introduced a later `--tag-color` style override: a border, a colored leading dot and more neutral text. These changed the appearance of every HEX-backed tag. The base chip radius was not the cause. Comparison with the published RC5 source confirmed the original compact shape: `border-radius: 6px`, `padding: 2px 7px`, `font-size: 10.5px`, weight 600 and inline-flex alignment.

`src/styles/pages.css` now retains that RC5 shape and restores a softly tinted background and colored text without the extra border/dot. The existing base chip, wrapping and remove controls remain. No new arbitrary chip design or tag business logic was introduced.

### 2. Palette Preservation

The new ten-color palette and its identifiers were not reverted: blue `#3B6EF2`, sky `#0284C7`, teal `#0B8E82`, green `#188F56`, red `#C83F45`, amber `#A97B0E`, orange `#D15C15`, rose `#D13C91`, violet `#7C5CF0` and slate `#64748B`. Existing/custom HEX values and legacy colors remain supported; there is no color-ID migration. The 25-grapheme limit is unchanged.

**BROWSER PASS:** shape, palette, readable text contrast and light/dark variants. The old dot assertion was replaced by exact RC5 chip-shape assertions; text contrast requirements were not lowered. **WINDOWS NATIVE PASS:** ten synthetic tags in the note list/editor, wrapping at 160%, both themes, creation of a violet tag through the actual color picker and persistence through cold restarts. Saved violet remains `purple` / `#7C5CF0`. The full cross-product of every legacy name, color, hover and remove state was not replayed natively.

### 3. Unified Link Picker Input and Modal

`src/features/editor/NoteLinkPicker.tsx` now uses the existing `.nf-input` style, not an unstyled input. The real browser reports a 12px input radius and 1px border, consistent with other NoteFlow inputs. `ModalShell` remains responsible for autofocus, focus trap, Escape and focus return. The old forced 180px list minimum was removed; the list is capped by `min(320px, 45vh)` and scrolls internally. Few results no longer produce a large empty panel.

The combobox owns keyboard focus and `aria-activedescendant`; list options are non-tabbable `role="option"` elements. This also fixes a focus-trap edge discovered during the browser pass: button options with `tabindex=-1` were still collected by the existing shared button selector. The common modal infrastructure was not rewritten. Opening the picker explicitly focuses the editor first, so closing a picker launched from overflow returns to the editor too.

### 4. Initial List, Search and Scale

The picker requests the first page immediately with an empty query. It shows all linkable notes in pages of 80, newest `updated_at` first with a stable ID tie-breaker. The extra 81st metadata record determines whether a next page exists. Back/Next make the whole list accessible rather than silently truncating it. Searching a title resets pagination, debounces nonempty input by 150ms and ignores obsolete async responses. Clearing restores the unfiltered list. Existing archived-note support is retained with an archive label; projects appear only as a secondary label when actually assigned. Soft-deleted notes are excluded.

The existing typed `search_notes` command gained an optional `titleOnly` request flag, default false. Its metadata-only Rust branch selects IDs, title, project metadata, timestamp and flags; it does not load every note's body, Markdown, caches or sidecars. Title search uses the existing safe FTS expression construction. Ordinary note-list FTS, including its empty-query semantics and relevance ranking, is unchanged. No new command or production dependency was added.

Empty states are distinct: `Заметок пока нет` for an empty collection and `Заметки не найдены` for no query matches. A failure presents a generic message and `Повторить`, never SQL or a path. **AUTOMATED/BROWSER PASS:** 10, 100, 1,000 and 10,000 metadata records, pagination, initial display, filtering, clearing, stale responses, retry and Arrow/Enter navigation. The real SQLite 10k fixture also checks archive/deletion scope, Russian title search and the absence of note-body payloads. These are not measurements of a 10k native user profile.

A separate fresh run after stopping browsers and the native app measured **36.0736ms for the complete metadata/paging/title-query assertion batch** against 10,000 records, not per query and not including fixture creation. The full targeted test, including database population, took 13.78s. Evidence: `standard-links-metadata-benchmark.log`; 1 passed, 292 filtered out. No timeout or performance threshold was raised.

### 5. Fragment Command Name and Selection

User-facing entry points now say exactly `Ссылка на фрагмент`: toolbar, overflow, context menu and editor command popover. Success says `Ссылка скопирована`. All call the existing fragment-link implementation. Empty selection disables the action with the explanation `Сначала выделите фрагмент текста` and a selection-specific tooltip; no arbitrary range is copied.

`selectionEmpty` is part of the toolbar's existing editor-state selector. This matters when selection changes on otherwise identical plain text: without subscribing to it, a disabled control could remain stale until another formatting state changed. Actual native selection of the unformatted word `обычный` enabled the command; clicking it retained that selection and displayed the success message.

### 6. Toolbar Integration and Geometry

`editorToolbarLayout.ts` now registers 30 actions, including two independent `note-link` and `fragment-link` entries. `FormattingToolbar.tsx` routes them to existing callbacks. Context-menu registry rendering excludes those IDs because that menu already has dedicated link entries, preventing duplicates and no-op commands. Mouse-down preserves the ProseMirror selection; click performs the command once. The new commands also avoid leaving a stale mouse-suppression flag after a modal interrupts pointer events.

The Aa button previously combined a 30px flex basis with the normal control sizing. Its basis is now zero while the existing minimum size remains. No global reduction of icons or hit areas was made; the existing height and adaptive overflow mechanism are retained.

Measured browser examples:

| Viewport / zoom / sidebar | Actual result |
| --- | --- |
| 1440px / 100% / maximum sidebar | Toolbar 704px by 45px; Aa approximately 30.67px wide; both link commands directly visible |
| 1100px / 160% / maximum sidebar | Toolbar 364px by 72 physical px; controls approximately 48.83 physical px wide; both commands accessible through existing overflow when necessary |
| 1100, 1440, 1920px; 100/160%; light/dark; collapsed/190/360px sidebar | Bounded toolbar/actions and modal, no document-level horizontal overflow; keyboard focus restored and no save on picker open/close |

**BROWSER PASS:** 36 toolbar geometry combinations plus 36 picker/focus/no-save combinations. Existing sidebar suites additionally cover 240ms motion, intermediate states, rapid toggles, manual resize, saved width and reduced motion. No sidebar CSS, animation duration or resize persistence code was changed by this pass.

### 7. Markdown Root Cause

Inspection of the earlier actual QA export and serializer showed that ordinary marks could fall back to whole-inline-run HTML. The existing integrity fallback is useful for exact preservation but was overly broad for a portable file: nested code with another mark, whitespace transitions and an unsupported range could cause unrelated bold/italic/link runs to become HTML too. Thus a semantically preserved document could still look unlike ordinary Markdown in a text editor.

This was not fixed with post-export regex substitutions or by weakening the data-loss comparison. Internal canonical storage keeps its existing preservation-oriented mode.

### 8. Standard File Serialization

`tiptapJsonToStandardMarkdown()` uses the existing renderer with an explicit standard-export mode. Normal bold, italic, strike, code, links, headings, lists, quotes and ordinary tables use CommonMark/GFM syntax. Shared active marks across whitespace and nested code/bold are retained. Exceptional runs are checked locally before a safe HTML fallback, so an unsupported underline range does not turn unrelated text into HTML. Exported code fences exceed any matching run inside the code and the importer recognizes the corresponding closing fence.

GFM table import now uses the existing Marked table tokens rather than a second hand-split interpretation. A real failing case, inline code `a|b` exported as a table's escaped pipe and reimported with a literal backslash, is covered and corrected. Only the contiguous table block is passed to table tokenization.

Unsupported appearance is not given invented Markdown markers. For example, underline can use safe `<u>`, highlight uses allowlisted `<mark>` rather than `==`, and sidecar-only text color/alignment is not promised to travel in a standalone `.md`. Sidecars, caches and debug fields are not injected into exported standard marks. Internal save still retains those appearance attributes through the existing sidecar architecture.

### 9. Export Flow and Storage Integrity

The current note's `.md` Save flow in `src/services/noteExportService.ts` loads the authoritative saved document, serializes the portable projection and passes it with `contentVersion` to the existing `export_note_markdown_at_path` command. Rust `data.rs` validates that version against the existing asset-aware snapshot and rejects a stale projection; it also enforces the existing export byte limit. The optional arguments preserve compatibility with older callers. File output continues through the existing safe filesystem flow outside the store lock.

The projection does not update `notes`, sidecars, revisions or CAS. No migration, automatic rewrite on open, revision-policy change or second storage serializer was added. A real Rust test proves read-only projection, stale/missing-version rejection and old-caller compatibility. Search, selection and temporary decorations retain the previous `PassiveEditorTransactions` correction.

Scope limit: project ZIP export and the legacy direct export command still use the existing canonical snapshot. This pass normalizes the current user-facing **note `.md` export**; it does not claim to have changed every older/ZIP export route. Backup fidelity and canonical stored Markdown were deliberately not converted to a lossy portable representation.

### 10. Actual File and Roundtrip Results

The real native Save dialog produced `releases/qa/standard-links-native-export.md`. Its actual UTF-8 text contains, among other cases:

```markdown
# Проверка экспорта

Это обычный текст, а это **жирный фрагмент**, затем обычный текст.

До ***жирный курсив*** и **`код жирный`**, затем [сайт](https://example.com).

**Стоимость следующа<u>я</u> -**

- **Пункт**
- *Курсив*

- [ ] Задача
- [x] Готово
```

The same file has a GFM table with a partial bold cell, inline code and an ordinary Markdown link using `noteflow://note/...`. The P0 text has every original character and the exact partial underline on `я`, with no `следующа****я` corruption. The native export checksum is `70d3ff149d1658e14b6aaba593741cf854e7d63e203dc55301411a8ba8e73b0d`.

The first native import deliberately used the existing insert-into-current-note flow while the cursor was in a table cell. It inserted into that cell, not as a whole-document replacement. That context-dependent flow is not evidence of a clean document roundtrip. A subsequent native run created an empty `QA Roundtrip` note and imported the same actual file through the Open dialog and confirmation. This produced heading, three paragraphs, bullet list, task list and table as separate blocks, plus the editor's normal trailing paragraph after the intentional insertion. The partial bold/italic/code, external link, P0 underline and internal link were verified in persisted JSON. A fourth cold launch reopened the note with those blocks intact.

**AUTOMATED PASS:** 19 new raw-Markdown/semantic tests include partial marks, nested and adjacent marks, Unicode, escaping, independent Marked rendering, GFM table pipes, code-fence boundaries, legacy safe-HTML import, internal links and sidecar exclusion. The P0 case repeats ten file cycles. Old storage roundtrip tests remain green. Opening old HTML-backed exports remains supported without rewriting the source on load.

### 11. Rich-Text Clipboard: Separate Result

**BROWSER PASS:** real ProseMirror Ctrl+C writes both `text/html` and `text/plain` to the browser clipboard; HTML includes the expected strong mark. This is an actual clipboard check, not only an event mock.

**WINDOWS NATIVE PASS:** Ctrl+C of a bold fragment plus an ordinary comma, then Ctrl+V into another QA note, preserved the bold fragment and unmarked comma in the saved document. Fragment-link copying remains plain URI text, as intended. The custom context-menu `Копировать` / `writeEditorClipboard` path is still plain-text-only; no new platform-specific clipboard dependency or Telegram integration was added. A small future extension could offer an explicit rich-copy action or add safe HTML to that custom clipboard path, with separate WKWebView/WebView2 testing.

### 12. Telegram: NOT VALIDATED

Telegram Desktop was not opened or tested in this pass. Standard Markdown text pasted into its composer is not promised to become formatted automatically. The [CommonMark emphasis rules](https://spec.commonmark.org/spec) and [Telegram Bot API MarkdownV2](https://core.telegram.org/bots/api#markdownv2-style) are different contracts; Bot API parsing is not the ordinary desktop composer paste mechanism. Neither file export nor clipboard behavior was changed to imitate MarkdownV2. Native rich-copy preservation inside NoteFlow is evidence of rich clipboard availability, not a Telegram compatibility PASS.

### 13. Windows Native Matrix and Evidence

Four owned debug launches used only `releases/qa/standard-links-native-20261027`, cloned from a previous synthetic QA fixture through SQLite's backup API. No real profile, notes, keys or cloud-model settings were used. All four launches closed normally with exit code 0.

Executed native checks: light/dark at 100% and 160%; maximum 360px sidebar through actual drag; tag appearance/palette/create/restart; immediate picker results including an archive target, title search, clear, Arrow/Enter selection, Tab/Shift+Tab and Escape focus return; toolbar link insertion; actual fragment clipboard and navigation back to the exact heading; actual `.md` Save/Open dialogs; import into a fresh empty note; native rich paste; cold restart. A restored approximately 1442x864 window was also observed. Exact 1100x700 native resizing was not successfully driven by Computer Use and is **PENDING USER SMOKE**, not replaced by the browser's 1100px PASS. Not every formatting command's native click matrix was replayed; their existing behavior tests and browser regression remain green.

Native screenshots actually captured and inspected are retained, ignored, under `releases/qa/`: `standard-links-native-light160.png`, `standard-links-native-dark160.png`, `standard-links-native-roundtrip.png`, `standard-links-native-restart-roundtrip.png`. Actual-file and JSON evidence: `standard-links-native-export.md`, `standard-links-native-metrics.json`, `standard-links-native-final-metrics.json`.

### 14. No Hidden Autosave / CAS Regression

The three preexisting synthetic notes finish at CAS 6, 10 and 4, unchanged by passive navigation, source highlighting, picker cancellation, copy or subsequent cold launches. Their versions increased earlier only for the intentional edits/import/paste documented in this pass. The new empty roundtrip note is CAS 1 after its one intentional import and remains 1 after selection, fragment copy, close, restart and reopening. Persisted P0 runs are bold `Стоимость следующа`, bold+underline `я`, bold ` -`. `PRAGMA integrity_check` returns `ok`.

The existing upstream WebView2 teardown diagnostic `Chrome_WidgetWin_0`, error 1412, recurred on normal exits. It was not suppressed or presented as fixed. No new nonzero exit, corresponding note mutation or failed reopen was observed. The prior diagnostic findings in section 20 still apply.

### 15. Fresh Automated Gates

All results below were rerun for the final production source, not copied from the 704/281 baseline. Evidence is ignored under `releases/qa/`.

| Gate | Fresh result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | `standard-links-final-typecheck.log` |
| `npm run test` | **736/736 PASS**, 75 suites, 0 skipped; 78.61s | `standard-links-final-test.log` |
| `npm run build` | PASS; Vite 16.46s | `standard-links-final-build.log` |
| `cargo fmt --check` | PASS | `standard-links-final-fmt.log` |
| `cargo check` | PASS; 46.13s | `standard-links-final-check.log` |
| `cargo test` | **283 PASS, 10 existing ignored**, 0 failed; test run 26.36s | `standard-links-final-rust-test.log` |
| Strict all-target/all-feature Clippy | PASS; 2.37s | `standard-links-final-clippy.log` |
| `npm audit --omit=dev --offline=false` | **0 vulnerabilities** | `standard-links-final-audit.log` |
| `npm run tauri build` | PASS; embedded frontend 15.88s, release compile 2m48s; NSIS and both MSI produced | `standard-links-final-tauri-build.log` |
| `git diff --check` | PASS; existing LF/CRLF notices only | Final command after report update |

The compiler reported the existing environment-specific incremental-cache hard-link fallback to copying. This is not a Clippy lint failure. No new production dependency was added. Exploratory sandbox process restrictions and an early browser motion failure while sources/HMR were changing were not counted as final PASS; the complete browser matrix was rerun against frozen sources. No animation tolerance, parser security threshold or failing test was removed to obtain green results.

### 16. Full Browser Regression

| Suite | PASS |
| --- | ---: |
| `rc5-approved-sidebar.mjs` | 348 |
| `rc5-sidebar-stability.mjs` | 272 |
| `rc5-settings-overflow.mjs` | 562 |
| `rc5-final-ui.mjs` | 110 |
| `rc5-corrective3.mjs` | 86 |
| `final-ux-geometry.mjs` | 40 |
| `final-ux-vision.mjs` | 10 |
| `cas-rag-regression.mjs` | 14 |
| New `standard-links-corrective.mjs` | 79 |
| **Total** | **1,521** |

Fresh logs are `standard-links-final-browser-<suite>.log`; the new structured geometry results and screenshots are in `standard-links-corrective/`. These browser tests use synthetic IPC/temporary contexts, not live AI providers or a real native DB. RAG source navigation, unchanged sidebar behavior, decoration/no-save guards and existing formatting tests remain covered without pretending this pass repeated live Bridge/Ollama generation.

### 17. Changed Files for This Corrective Pass

Production: `src/styles/pages.css`, `src/styles/editor.css`; `NoteLinkPicker.tsx`, `FormattingToolbar.tsx`, `editorToolbarLayout.ts`, `EditorContextMenu.tsx`, `EditorCommandPopover.tsx`, `EditorArea.tsx`, `markdownService.ts`, `markdownInline.ts`; `src/services/searchService.ts`, `src/services/noteExportService.ts`; `src-tauri/src/search.rs`, `src-tauri/src/data.rs`.

Tests/QA: new `tests/standardMarkdownExport.test.ts`, added behavioral coverage in `tests/finalUxBehavior.test.ts`, exact contract adjustments in `tests/phaseEBehavior.test.ts` and registry expectations in `tests/visualRefresh.test.ts`; new `scripts/qa/standard-links-corrective.mjs`, opt-in metadata/sidebar fixtures in `final-ux-fixture.tsx`, updated tag-shape checks in `final-ux-geometry.mjs` / `final-ux-vision.mjs`. This report was appended. The other dirty files belong to the preserved earlier work; their presence is not a claim that this pass changed them all.

### 18. Platform and Portability Status

**AUTOMATED PASS / BROWSER PASS / WINDOWS NATIVE PASS** apply only to the executed cases described above. **MACOS NATIVE PENDING:** no Apple Silicon machine/build was available; WKWebView clipboard, native Save/Open dialogs, keyboard conventions and font geometry need actual validation. New production paths use platform-neutral React/ProseMirror/Markdown logic and the existing Tauri file APIs, not hardcoded Windows paths. The standard Markdown was rendered in automated tests by an independent GFM parser; VS Code and other external desktop viewers were **NOT VALIDATED** interactively.

Standalone Markdown cannot reproduce all sidecar-only appearance, and arbitrary intraword/overlapping combinations can still require safe HTML rather than incorrect delimiters. That is explicit preservation behavior, not a claim that unsupported rich formatting has a pure CommonMark equivalent. Legacy project ZIP Markdown normalization and custom-menu rich copy are outside this correction. Full native narrow-window, exhaustive tag-state, Telegram and macOS checks remain pending as stated.

### 19. Git / Published Release Preservation

Final branch and HEAD remain `codex/stable-ux-markdown-links` / `e1ba444a4fb5939814ffb2daf6f0d5902bc64531`. Final tree: **47 tracked modified, 22 untracked, 0 staged**. The two new untracked entries relative to this pass's baseline are the standard-export test and browser runner; all earlier untracked source/QA/report files remain. No user notes or credentials were added to the report or release assets. Synthetic QA databases, fixtures, screenshots and logs remain ignored under `releases/qa/`.

All canonical package/lock/Cargo/lock/Tauri versions remain **`1.0.0-rc.5`**; productName `NoteFlow`, identifier `com.noteflow.desktop`. The fresh local target outputs are only verification builds, not a new release. SHA-256 verification after the build matches all four published/staged RC5 entries in `final-ux-rc5-preservation.json` and all eight historical files in `rc5-release-preserved-files.json`. No installers were copied over that published set. No git add, commit, push, merge, tag, version bump or GitHub release was performed.

All four owned native QA processes exited normally; the owned Vite server was stopped after the last cold-restart check. Final process inspection found no remaining NoteFlow/cargo/NoteFlow-Vite QA process. Ignored evidence was retained rather than cleaned up.

### 20. Corrective Verdict

**READY FOR USER SMOKE** for the six scoped Windows corrections, with the explicit pending matrix above. This is **not** approval or readiness to publish NoteFlow 1.0.0 Stable. Next validation is the user's actual narrow-window/160% workflow, followed by real macOS native QA before a cross-platform stable release. No additional features, provider changes, persistence redesign or release operation are included in this pass.

## 22. Standard Markdown Export — User Acceptance Fix

### Reproduction Before Editing Code

The user reported that the previous correction still produced unfamiliar HTML-backed Markdown. The pass started at the same HEAD/branch/version with **47 modified, 22 untracked, 0 staged**. The actual current export was investigated rather than assuming the previous PASS established the user's result.

Real debug Tauri/WebView2 was launched with `NOTEFLOW_DEV_DATA_DIR` pointing to `releases/qa/standard-md-user-20261027`, a SQLite backup of the previous synthetic QA profile. No document in the real user profile was read or modified. A new `Планирование QA` note was created through the UI. Initial manual H1/text/range-formatting actions were exercised; the complete supplied fixture was then populated through the application's formatted Markdown paste, producing real TipTap blocks, and edited through native mouse selections and toolbar actions. It was not inserted as a database row or passed directly to an exporter. Not every individual fixture block was separately authored from scratch with its toolbar button; this distinction is intentional, not a claim of an exhaustive toolbar-authoring smoke.

The first ordinary menu -> Export -> Markdown -> native Save dialog produced `releases/qa/user-md-native-before.md`. All ordinary headings, bold/italic, ordered lists, quote, tasks, code and links already used standard Markdown for a freshly pasted fixture. **No broad HTML failure was reproduced for that initial exact document.** One concrete defect was found immediately: table alignment became `| --- | --- | --- |` instead of retaining the central column's `:---:`.

Next, the mouse selected exactly `Правильное планирование `, including its trailing space, and the real bold toolbar action applied the mark to that range. SQLite's saved JSON confirmed that the space was bold. The normal export then produced `user-md-native-whitespace-before.md`, with this actual file fragment:

```html
<strong>Правильное планирование </strong>— это не про то, как делать *больше*, а про то, как делать *главное*.
```

That file is a genuine application output, SHA-256 `6debe0e6d9539dc3bad8278c9b1d9e913960292143e09f1196f2d5dddab2d76f`, not a hand-written approximation. Thus the specific WYSIWYG range that the previous happy-path test missed was reproduced before the fix.

### Root Causes

1. `projectInlineMarkdown` compared lossless mark runs, including bold/italic/strike on whitespace, even for portable export. Markdown requires spaces at emphasis boundaries outside its delimiters. A perfectly readable `**Правильное планирование** ` therefore failed exact equality against a ProseMirror bold run ending in a space, selecting HTML fallback. The previous local-group fallback still did the same exact comparison, so narrowing the HTML range had not resolved this case.
2. `readMarkdownTable` discarded Marked's alignment metadata, and `tableToMarkdown` unconditionally wrote `---` separators. The importer, canonical save/load and portable file could consequently lose alignment before or during export. A final real-TipTap command regression also demonstrated that an imported cell's older `align` could mask a later `setTextAlign` toolbar edit. Explicit paragraph alignment now takes priority, with the imported column alignment as the fallback; `user-md-alignment-red.log` captures the failing export before that one-line correction.
3. Two smaller structural gaps were addressed in the same serialization scope: intermediate empty paragraphs emitted `<p></p>` in portable output, and multi-block quotes were treated as a single inline paragraph. Ordinary blank spacing is now omitted in portable files, while structured quotes retain their blocks. Excessively deep quote input is bounded to avoid adding an unbounded recursive parse path.

The frontend note `.md` export service was already selecting the standard projection, not an accidentally stale HTML cache. No second exporter or post-export HTML-to-Markdown regex pass was added.

### Minimal Production Changes

- `markdownService.ts`: portable-only whitespace projection removes invisible emphasis from boundary whitespace before the existing serialization/integrity check. Text, order, punctuation and internal whitespace remain; code spans are excluded from this normalization. Whitespace inside a continuous shared span is retained, including the existing partial-bold/underline P0 case. Storage still preserves the exact original rich range and its sidecar.
- The same file emits GFM table alignment markers from the explicit header paragraph alignment or the imported cell alignment, skips empty paragraph HTML only in portable mode, and serializes/parses quote blocks structurally. Quote nesting over the named limit of 64 is retained as literal nested-marker text rather than overflowing the stack.
- `markdownInline.ts`: the existing Marked table token's alignment is assigned to real table cell/header attrs. TipTap already supports that attribute; no new extension, command, UI or dependency was needed.

The alignment correction necessarily applies to canonical GFM serialization too, so the value survives an intentional save/reload. There is no migration or automatic rewrite of old notes. Existing malformed/missing alignment cannot be reconstructed by guessing. The native test intentionally set the header's center alignment using the existing WYSIWYG action before exporting again. Unrelated note hashes and CAS remained unchanged.

### Standard Markdown Contract and Title Policy

Single-note UI export remains CommonMark plus GFM: ATX H1-H3; `**bold**`, `*italic*`, `***bold italic***`, `~~strike~~`; inline code; ordered/bullet/task lists; `>` quotes; `---` rules; fenced code with language; ordinary Markdown links; pipe tables and left/center/right markers. Existing escaping and code-fence safety remain. JavaScript source inside a code block is not passed through inline formatting.

The note's metadata title supplies the suggested filename, **not an extra synthesized H1**. Explicit headings inside the document are exported at their existing level and are never silently removed, deduplicated or demoted. Thus an explicit H1 is not duplicated by a second metadata heading. Empty notes export empty Markdown; a body with no heading does not acquire one. Import into an existing note retains that note's title; new-file import retains its established filename-based title behavior. No database title is edited for export.

All actual single-note UI entry points in AppShell/editor menu/note-list context export use the shared `noteExportService.exportNote` path and flush pending save first. No separate Markdown preview exists. The unused legacy backend export command and project ZIP canonical route are not presented as a second UI Standard Markdown command and were not rewritten. Project ZIP/backup fidelity and restore semantics are unchanged.

### Actual Post-Fix File

The same normal native Save flow wrote **`releases/qa/user-md-native-after.md`**. It was read back from disk as plain UTF-8 text, not replaced by the expected fixture. SHA-256: **`56f1fcdefb42a27579c5061e6fa3e5b4c0c647d9c082f3142a49f677da7017e5`**.

Complete actual file content follows. Relative to the user's example, blank separation before the quote and omission of optional explicit-left colons on the two default-aligned columns are the formatting differences; the central-column marker is retained.

````markdown
# Как эффективно планировать свой день

В современном мире очень легко потерять фокус. Постоянные уведомления, бесконечные списки дел и внезапные задачи часто приводят к выгоранию. **Правильное планирование** — это не про то, как делать *больше*, а про то, как делать *главное*.

## 3 правила успешного тайм-менеджмента

1. **Приоритезация.** Начинайте день с самой сложной и важной задачи.
2. **Фокусировка.** Отключайте уведомления на время глубокой работы.
3. **Отдых.** Делайте регулярные небольшие перерывы.

### Метод Помодоро (Pomodoro)

> Суть метода проста: вы работаете **25 минут**, а затем отдыхаете **5 минут**. Каждые четыре цикла делайте длинный перерыв на *15–30 минут*.

---

## Чек-лист на сегодня

- [x] Проверить рабочую почту
- [ ] Написать черновик отчета
- [ ] Провести созвон с командой (в 15:00)

---

## Инструменты для работы

Для автоматизации рутины часто используют простые скрипты. Например, вот функция на `JavaScript` для подсчета оставшегося времени до дедлайна:

```javascript
function getDaysLeft(deadline) {
  const diff = Date.parse(deadline) - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
```

### Сравнение популярных приложений

| Название | Платформа | Стоимость |
| --- | :---: | --- |
| **Todoist** | Web, iOS, Android | Бесплатно / Подписка |
| **Notion** | Web, Desktop, Mobile | Бесплатно для личного пользования |
| **Obsidian** | Desktop, Mobile | Бесплатно (хранение локально) |

Подробнее о принципах продуктивности можно почитать в [этой статье](https://example.com).
````

There are no `<strong>`, `<em>`, `<p>`, heading/list/quote/code/table HTML tags in that file. Underline/highlight or genuinely unrepresentable inline ranges remain a separate safe-HTML case; their existence no longer forces standard edge-space bold into HTML.

### Golden Fixture and Roundtrip

`tests/fixtures/standard-markdown-user.expected.md` contains the complete supplied acceptance example. `standardMarkdownUser.ts` constructs its block/mark model independently of the Markdown importer, including the native-reproduced trailing bold space and explicit left/center/left table attrs.

`tests/standardMarkdownAcceptance.test.ts` uses real `createEditorExtensions`/TipTap to normalize that model, then the production autosave serializer, stored Markdown+sidecar loader and Standard Markdown projection. It compares actual file text with the golden fixture, allowing blank-line separation only; asserts no ordinary HTML; checks exact JavaScript bytes; compares full block structure against both the independent editor model and expected Markdown; and checks visible marks character-by-character. Only invisible edge-space emphasis is normalized, not characters, punctuation, code whitespace or real marks. Saved storage snapshots must remain byte-for-byte unchanged by export.

A second test exercises pending-save completion, `get_note`, the production export service and a temporary file written by the clearly mocked IPC boundary. It asserts the version-checked projection, suggested title/filename and absence of persistence commands. That test is not described as a native Tauri file-writing result; the actual native file above is separate evidence.

The 11 new targeted cases cover edge-space bold/italic/strike, all table alignment directions through actual schema/save/reload, a later toolbar alignment edit overriding the imported cell value, quote block structure and excessive nesting, empty notes/title/H1 policy and 1,000 ordinary paragraphs. Existing mixed/nested/adjacent marks, escaping/Unicode/internal-link, safe-HTML backward compatibility, GFM pipe-in-code and ten-cycle P0 tests remain green without loosening their expected output.

### Native Import, Restart and Data Integrity

The actual exported file was selected through the Windows Open dialog and imported into a newly created empty `Эталон импорт QA` note through the existing import confirmation. The UI showed the expected formatted body, code and table; accessibility and persisted JSON contained the real headings, numbered list, blockquote, horizontal rules, task list with checked state, language-bearing code block, table and link. The note title stayed `Эталон импорт QA` rather than being replaced by its H1. The normal intentional edit added a trailing editable paragraph.

After autosave the imported document had CAS **1**. A cold restart and reopening the note retained it at **1**. Read-only SQLite snapshots before/after restart compare every synthetic note's version, Markdown hash and JSON-cache hash; all matched exactly and `integrity_check` returned `ok`. The four earlier fixture notes remained at CAS **6 / 10 / 4 / 1** throughout this task. Only the two newly created acceptance notes received intentional content writes. No real user note was involved.

Ignored evidence: `user-md-native-before.log`, `user-md-native-after.log`, `user-md-native-restart.log`, `user-md-native-import.png`, `user-md-native-restart.png`, `user-md-native-before-restart.json`, `user-md-native-after-restart.json` and the three actual `.md` exports. All three native launches closed normally, exit code 0. The known upstream WebView2 `Chrome_WidgetWin_0` / 1412 teardown diagnostic remains; it was not suppressed or claimed fixed.

### Portability and Limits

The export contract follows [CommonMark](https://spec.commonmark.org/0.31.2/) and the [GFM table/task extensions](https://github.github.com/gfm/), not Telegram MarkdownV2. Telegram Desktop was **NOT VALIDATED**, and plain Markdown paste is not promised to become rich text. No Telegram-specific code or clipboard integration was added.

README now distinguishes portable single-note Markdown, safe HTML/NoteFlow extensions and full backup fidelity. Font/color/per-block alignment/sidecar-only appearance is not guaranteed in standalone `.md`. Merged/multi-block tables retain the established rectangular projection and need NoteFlow's full backup/canonical representation with sidecars to recover original geometry; that unsupported-layout architecture was not changed into a new HTML-table importer. This limitation does not force ordinary tables into HTML. Full backup/restore and the project ZIP canonical route were left intact.

**WINDOWS NATIVE PASS** applies to the executed real-file pipeline, WYSIWYG range/alignment edits, import and restart described above. **MACOS NATIVE PENDING:** no Apple Silicon machine/build was available; native dialogs, clipboard and font geometry still need Mac validation. No Windows-specific production path, dependency or version change was added. Interactive VS Code/other external viewer and Telegram testing remain **NOT VALIDATED**. The native fixture preparation method is disclosed above rather than presented as an exhaustive manual test of every toolbar control.

### Final Native Recheck on Frozen Sources

After the final paragraph-versus-cell alignment correction, the debug Tauri executable was opened a fourth time against the same explicitly isolated QA directory and the final Vite sources. The existing `Планирование QA` note was opened and exported through the normal note menu, export modal and Windows Save dialog into **`releases/qa/user-md-native-final.md`**. The file was read back as UTF-8 plain text and its SHA-256 is **`56f1fcdefb42a27579c5061e6fa3e5b4c0c647d9c082f3142a49f677da7017e5`**, identical byte-for-byte to the complete post-fix file printed above. The application displayed the successful save toast. No synthetic IPC was used in this native export.

Before/after read-only SQLite checks confirmed that all six synthetic note versions remained unchanged, including the imported note at CAS 1 and the intentionally formatted source note at CAS 10; `integrity_check` returned `ok`. The fourth native process closed normally, exit 0. Its log is `user-md-native-final.log`; the pre-open version snapshot is `user-md-final-native-before.json`. Earlier import/restart checks remain the real native roundtrip evidence; this final recheck repeated export, not every individual toolbar-authoring action.

### Fresh Quality Gates

All commands were rerun after the last production-source edit. Logs use `releases/qa/user-md-verified-<gate>.log`; machine-readable command exit codes and wall times are in `user-md-verified-gates.json`. Performance-sensitive frontend tests and browser suites ran sequentially, before the release build and without a running native NoteFlow process. The fourth native recheck happened only after all browser suites completed, during the subsequent packaging build.

| Gate | Fresh Result |
| --- | --- |
| `npm run typecheck` | PASS; 12.52s wall time |
| `npm run test` | **747/747 PASS**, 75 suites, 0 skipped; runner 49.62s, command 50.77s |
| `npm run build` | PASS; 32.28s wall time |
| `cargo fmt --check` | PASS; 1.75s |
| `cargo check` | PASS; 1.87s |
| `cargo test` | **283 PASS, 10 existing ignored**, 0 failed; tests 29.96s, command 33.77s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS; 1.61s |
| `npm audit --omit=dev --offline=false` | **0 vulnerabilities**; 3.58s |
| Full browser regression | **FAIL: 4 of 10 runners failed**, details below |
| `npm run tauri build` | PASS; 395.07s wall time, release compile 5m04s |
| `git diff --check` | PASS; rerun after this report update |

The existing Rust incremental-cache hard-link-to-copy warnings remain environmental diagnostics, not new Clippy lint failures. No warning or failing test was suppressed. An exploratory frontend run with a native app active previously exceeded the parser-security test's 1,000ms performance bound; that failed log was retained as `user-md-preflight-test.log`. The final isolated 747-test run passed the unchanged test and threshold.

The final local verification outputs are `src-tauri/target/release/noteflow.exe`, `bundle/nsis/NoteFlow_1.0.0-rc.5_x64-setup.exe` and `bundle/msi/NoteFlow_1.0.0-rc.5_x64_{en-US,ru-RU}.msi`, under `src-tauri/target/release/`. They were not published or copied over the staged published RC5 release.

### Full Browser Regression and Unresolved Gate Failures

| Runner | Fresh Result |
| --- | --- |
| `rc5-approved-sidebar.mjs` | FAIL; reduced-motion collapsed button is 49x40, not square; assertion line 162 |
| `rc5-sidebar-stability.mjs` | FAIL; insufficient distinct intermediate toggle widths; assertion line 70, call line 107 |
| `rc5-settings-overflow.mjs` | FAIL; sidebar `scrollWidth > clientWidth + 1` during the reduced-motion snapshot; assertion line 41, call line 150 |
| `rc5-final-ui.mjs` | FAIL; intermediate toggle-width assertion, line 27; final run sampled width 250 at every captured frame |
| `rc5-corrective3.mjs` | **86 PASS** |
| `final-ux-geometry.mjs` | **40 PASS** |
| `final-ux-vision.mjs` | **10 PASS** |
| `cas-rag-regression.mjs` | **14 PASS**, synthetic IPC |
| `standard-links-corrective.mjs` | **79 PASS** |
| New `standard-markdown-acceptance.mjs` | **8/8 PASS**, actual UI export flow with synthetic IPC |

The six fully completed green runners total **237 cases**. Partial passes in the four interrupted runners are not misreported as a green full matrix. The earlier **1,521 PASS** baseline, or the expected 1,529-case matrix with the eight new cases, is **not** a fresh PASS result.

All four failures reproduced on frozen sources. Additional unchanged approved-sidebar retries also failed. An earlier standard-links run failed the immediate combobox-autofocus assertion at line 44; the final unchanged 79-case run passed, so that observation is retained rather than silently discarded. No sidebar component, animation threshold, timing wait or reduced-motion expectation was changed for this Markdown correction. It has not been established whether each failure is an application defect or a harness/environment timing problem. These failures need a separately scoped investigation; they are not claimed to be caused by, or proven unrelated to, the serializer change merely because the affected code was not edited here.

### Scoped Changes and Git State

Production changes in this pass are limited to `markdownService.ts`, `markdownInline.ts` and the Markdown portability paragraph in `README.md`. New coverage consists of `tests/standardMarkdownAcceptance.test.ts`, `tests/fixtures/standardMarkdownUser.ts`, `tests/fixtures/standard-markdown-user.expected.md`, `scripts/qa/standard-markdown-acceptance.mjs` and the opt-in user-Markdown mode in the existing untracked `final-ux-fixture.tsx`. This report was appended. Existing unrelated working-tree edits and historical QA files were retained. No Rust/backend source, UI design, persistence transaction boundary, provider or dependency was changed by this pass.

Final branch: **`codex/stable-ux-markdown-links`**. HEAD: **`e1ba444a4fb5939814ffb2daf6f0d5902bc64531`**. Working tree: **48 tracked modified, 26 untracked files, 0 staged**; untracked files are counted individually, not collapsed directory entries. Application/package/lock/Cargo/lock/Tauri versions remain **`1.0.0-rc.5`**. ProductName remains **NoteFlow**, identifier **`com.noteflow.desktop`**. No git add, commit, push, merge, tag, version bump or release was performed.

SHA-256 checks match all four published RC5 artifact entries in `final-ux-rc5-preservation.json` and all eight historical files in `rc5-release-preserved-files.json`; final verification was repeated after packaging. The actual QA exports, database and logs remain ignored under `releases/qa/`. Only synthetic notes were used. No real user notes or credentials were read into the report. The owned QA native app and Vite server were closed; the release build was awaited to completion.

### Current Verdict

**NEEDS MORE WORK.** The scoped Standard Markdown acceptance flow is **AUTOMATED PASS / BROWSER PASS / WINDOWS NATIVE PASS**, with the explicit native authoring, unsupported-format, Telegram and macOS limitations above. The overall task cannot be called green while the four full-browser runners still fail. This section supersedes the historical readiness verdict for the current working tree; it is not approval to publish NoteFlow 1.0.0. No unrelated Sidebar repair was folded into the Markdown correction, and no Git/release operation was performed.

## 23. Browser Sidebar/Settings Regression Resolution

### Scope and Baseline

Investigation started on `codex/stable-ux-markdown-links`, HEAD `e1ba444a4fb5939814ffb2daf6f0d5902bc64531`, application version `1.0.0-rc.5`, with **48 tracked modified, 26 untracked files and 0 staged**. The large earlier corrective tree was preserved. No redesign, serializer change, version bump, Git staging/commit/tag/push/merge or release is part of this task.

The preceding section's four failed runners and their original logs were read before any edits. Source fingerprints covering all files under `src/` and `src-tauri/src/` were captured in `releases/qa/sidebar-gate-production-before.json`. Production CSS was not edited to obtain a passing browser result.

### Failure Analysis

| Runner | Original Failure | Classification and Evidence |
| --- | --- | --- |
| `rc5-approved-sidebar.mjs` | Reduced-motion collapsed New Note button **49x40**, expected square within the existing 0.7px tolerance; label opacity **1**, expected hidden | **TEST HARNESS / TIMING ISSUE.** The grid had switched to its reduced-motion final width while the sidebar padding/label 1ms transitions were still pending. The exact geometry was reproduced after the React commit and became **40x40**, opacity **0**, after completion. |
| `rc5-settings-overflow.mjs` | Sidebar `scrollWidth > clientWidth + 1` in the reduced-motion step, after the ordinary Appearance max-width checks | **TEST HARNESS / TIMING ISSUE.** At 160%, the same pending-padding phase produced **52/46** scroll/client width; after completion it was **46/46**. The original Appearance theme-grid overflow had not returned: theme controls reflowed and all normal content-layout assertions passed without adding overflow masking. |
| `rc5-sidebar-stability.mjs` | Too few distinct intermediate sidebar widths in a fixed 320ms window after `click()` | **TEST HARNESS / TIMING ISSUE.** The observation epoch preceded the asynchronous React/style/animation start. The assertion conflated scheduling and frame cadence with interpolation. The replacement still checks more than three distinct geometry phases, monotonic widths, icon bounds, fixed heights and overflow, but samples the actual CSS transition timeline. |
| `rc5-final-ui.mjs` | Too few intermediate widths in a fixed 310ms window; prior frames at approximately 87/176/277/372ms all had width **250** | **TEST HARNESS / TIMING ISSUE.** Natural playback is now observed from the actual grid transition's readiness through completion rather than a deadline measured from dispatch. The original intermediate-width count, nav-position, editor document/selection/scroll, remount and no-autosave assertions remain. |

No unconditional production defect in the approved Sidebar/Settings layout was demonstrated. On this task's initial unchanged-source rerun all four runners passed (348/272/562/110 cases); the old failures were therefore not simply renamed flaky. Reproduction and deterministic phase measurements explain why they could fail. Rendering/scheduling load influences when the old sampling window is observed, but a specific OS/browser throttling cause is **not** asserted without evidence.

### Actual Geometry and Timing Evidence

`sidebar-timing-probe.mjs` observes the real production DOM at the class mutation, before an intervening painted frame, then waits for the browser's actual animation completion. It does not inject replacement CSS or normalize an incorrect measurement into an expected one.

| Metric | 100% Immediate -> Settled | 160% Immediate -> Settled |
| --- | --- | --- |
| New Note rectangle | **49x40 -> 40x40** | **34.625x64 -> 64.625x64** |
| Sidebar padding-inline, CSS px | **12 -> 16.5** | **12 -> 2.625** |
| Label opacity | **1 -> 0** | **1 -> 0** |
| Sidebar scroll/client width | **73/73 -> 73/73** | **52/46 -> 46/46** |
| Pending animations at immediate measurement | **26** | **22** |
| Elapsed time from input, ms | **8 -> 126.3** | **9.7 -> 50.4** |

The probe uses a **1100x700** viewport, devicePixelRatio **1**, and visible document state; the JSON includes full sidebar/button/icon rectangles, active collapsed class, zoom, animation properties, durations, pending flags and current times. The 1ms CSS duration is animation time, not a guarantee that layout, start and completion are painted within 1ms of a Node-side timeout. Evidence is in `sidebar-gate-timing-probe/results.json` and its settled screenshots. This is the same transitional geometry as the earlier failures, not an invented visual baseline.

Optional `sidebar-diagnostics.mjs` records computed CSS, viewport/DPR, visibility, geometry, scroll/client widths, animation state and transitionrun/start/end/cancel events, plus a screenshot and Playwright trace. The initial approved-sidebar diagnostic run completed 348 cases and retained `sidebar-gate-probe-approved/{page-0.json,page-0.png,trace-0.zip}`. The initial bare batch partly overlapped this optional tracing probe; that overlap is disclosed as a load diagnostic, not counted as a fully unloaded isolation benchmark. The fixed targeted runs and final complete gates were sequential, with no competing native NoteFlow or release compiler running.

### Test Harness Changes

- New `scripts/qa/panel-motion.mjs` waits for fonts and relevant real panel transitions to finish, followed by a painted frame. Reduced-motion checks no longer assume 30/40/50ms from a click means completion.
- Geometry-only suites locate the real `CSSTransition` for the active grid, sample **0/30/60/120/180/210/240ms** via its Web Animations timeline, and separately replay it naturally to its `finished` state and `transitionend` event. They do not create an imitation animation. Original geometry tolerances and minimum distinct-width assertions are retained; playback samples are checked as well.
- The editor-preservation suite observes **unpaused natural playback only**, so measurement does not introduce extra editor reflow. It still requires more than two distinct widths and checks document/selection, editor identity, scroll and content-write count. A targeted intermediate implementation that sought phases in this integration test changed scroll from 320 to 436; the original assertion caught it, and that failed log was retained. The test was not weakened or made to reset scroll. Phase seeking was restricted to the geometry tests instead.
- The active grid is selected explicitly: notes workspace, inner RAG grid, then Settings page shell. A wrapper outside the RAG grid must not be mistaken for the animated element.
- New `panel-motion-regression.mjs` adds **13 cases**: normal phases/natural playback and reduced-motion completion at both zooms/themes, a controlled delayed-input reproduction, successful phase-based observation of that delayed input, and negative controls rejecting missing transitions, a 250ms duration and linear easing.

The delayed-input negative control deliberately queues the action for **1200ms**. The former 320ms observation sees one unchanged width; the corrected observer waits for the real transition and then checks its actual duration, geometry and completion. This is explicitly a test-driver fault injection, not a claim that native NoteFlow normally delays input by 1200ms.

The synchronization uses the browser's existing [animation readiness](https://developer.mozilla.org/en-US/docs/Web/API/Animation/ready) and [currentTime](https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime) APIs. No global fake clock, disabled animation, assertion removal, skip, relaxed pixel tolerance or arbitrary enlargement of the old sampling window was used. The bounded 5-second missing-transition/completion watchdog fails absent or stuck transitions; it is not a geometry tolerance or an altered production duration.

### Sidebar and Settings Contract Preserved

The production duration remains **240ms** and easing **`cubic-bezier(0.22, 1, 0.36, 1)`**. New Note remains fluid, with the same left/right gutters as navigation and no 280px cap. Existing negative controls still reject both an artificial max-width cap and a fixed-width button. Min/max/manual resize, no animation while dragging, saved width, keyboard focus, icon sizing/centering, rapid toggles and reduced-motion expectations remain checked.

The Settings runner retains all six sections, separate chat/embedding dialogs, 100/160%, light/dark and widths **1100/1280/1440/1536/1920**. It checks page and inner-container overflow, clipped controls, wrapped theme choices, collapsed/max/min sidebar and intermediate frames. The deliberate old three-column theme-grid injection remains a negative control. There is no new `overflow-x: hidden` rule or clipped-content workaround. The responsive horizontal Settings navigation is a local scroll strip, not page overflow.

### Windows Native QA

Real Tauri/WebView2 was launched with `NOTEFLOW_DEV_DATA_DIR` set to **`releases/qa/sidebar-gate-native-20261027`**. The database was cloned from the previous **synthetic** QA profile through SQLite's backup API (including its WAL state); only that QA profile's managed assets were copied. The real user database, credentials and models were not edited.

Executed checks:

- Collapse/expand, pointer drag-resize, max width and the fluid New Note/nav gutters in the actual Windows window.
- Appearance at 160% with max Sidebar, both themes and a narrowed native window. Captured outer widths were **1536** maximized and **1102** restored (1100 client width); the native height was not a claimed 700px minimum-height test.
- Appearance at 100% in both themes; all six Settings sections opened at 100% in the narrow light-theme window. Models/embedding sections were inspected without connection tests or edits; Data & Export was inspected without destructive actions.
- Keyboard focus, navigation to the partly off-screen About tab using Tab/Enter, and an actual narrow-window tooltip. The Settings tabs deliberately remain locally horizontally scrollable; no absence of local tab scrolling is claimed.
- Both link commands in responsive toolbar overflow at 160%; End navigated to the bottom items, and Escape restored visible focus to the toolbar. Fragment-link action remained disabled without a selection.
- Editor reflow after resizing/collapse/expand, the visible existing partial bold/underline P0 text, normal closure, cold restart and restored Sidebar width. Native repeated pointer/keyboard attempts left a stable layout. Frame-precise rapid sequences and exact 240ms timing are established by browser tests, not inferred from screenshots or Computer Use latency.

Evidence: `sidebar-gate-native-{160-dark-max,160-dark-narrow,160-light-narrow,100-light-narrow,100-dark-narrow}.png`, `sidebar-gate-native-toolbar-160-narrow.png`, `sidebar-gate-native-focus-tooltip.png`, `sidebar-gate-native-restart.png` and the native/restart logs. Both owned native processes closed normally, exit 0. Read-only before/after/restart comparisons retained **all six notes' CAS, Markdown and JSON-cache hashes**, and SQLite `integrity_check` was `ok`. The read-only snapshot is `sidebar-gate-native-notes-before.json`.

**WINDOWS NATIVE PASS** is limited to those executed checks, not every combination of section/size/theme or a measured native FPS claim. No new macOS work was started; **MACOS NATIVE PENDING** remains. No new native Markdown export or Telegram test is claimed in this task.

### Final Gates and Repeat Runs

All final commands completed sequentially on frozen test/source files. `releases/qa/sidebar-gate-final-results.json` records **31 command gates, all exit 0**. Per-command logs are `sidebar-gate-final-<gate>.log`; both full browser result sets are copied independently into `sidebar-gate-full-1/` and `sidebar-gate-full-2/`, including `counts.json`. No pass from sections 21/22 was substituted for a fresh command.

| Gate | Fresh Result |
| --- | --- |
| `npm run typecheck` | **PASS**, 10.42s wall time |
| `npm run test` | **747/747 PASS**, 75 suites, 0 failed/skipped; runner 34.79s, command 35.75s |
| `npm run build` | **PASS**, 25.30s wall time |
| `cargo fmt --check` | **PASS**, 1.62s |
| `cargo check` | **PASS**, 1.72s |
| `cargo test` | **283 PASS, 10 existing ignored**, 0 failed; tests 26.77s, command 30.73s |
| Strict all-target/all-feature Clippy | **PASS**, 1.33s |
| `npm audit --omit=dev --offline=false` | **0 vulnerabilities**, 4.66s |
| Full browser run 1 | **1542/1542 PASS**, 0 failed, 0 skipped |
| Full browser run 2 | **1542/1542 PASS**, 0 failed, 0 skipped |
| `npm run tauri build` | **PASS**, 208.17s wall time; NSIS and both MSI produced |
| `node --check` on all four new QA modules | **PASS** |
| `git diff --check` | **PASS**, rerun after this report update |

| Browser Runner | Run 1 PASS / Seconds | Run 2 PASS / Seconds |
| --- | ---: | ---: |
| `rc5-approved-sidebar` | 348 / 128.22 | 348 / 127.21 |
| `rc5-sidebar-stability` | 272 / 172.16 | 272 / 170.87 |
| `rc5-settings-overflow` | 562 / 156.57 | 562 / 156.41 |
| `rc5-final-ui` | 110 / 65.24 | 110 / 64.83 |
| `rc5-corrective3` | 86 / 48.35 | 86 / 48.16 |
| `final-ux-geometry` | 40 / 30.89 | 40 / 31.16 |
| `final-ux-vision` | 10 / 4.16 | 10 / 9.95 |
| `cas-rag-regression` | 14 / 80.99 | 14 / 80.88 |
| `standard-links-corrective` | 79 / 61.20 | 79 / 61.94 |
| `standard-markdown-acceptance` | 8 / 15.51 | 8 / 15.45 |
| New `panel-motion-regression` | 13 / 18.21 | 13 / 17.91 |
| **Total** | **1542 / 781.50** | **1542 / 784.77** |

Duration totals are sums of the recorded runner wall times; JSON/screenshot-copy overhead between processes was not separately benchmarked. These are **1542 unique recorded cases per run**, or 3084 case executions across the two complete runs, not 3084 distinct tests. All 1529 existing browser cases remain, plus 13 new synchronization cases.

Each formerly failing runner also completed a successful separate targeted validation before the two full runs: `sidebar-gate-phase-approved.log` (348), `sidebar-gate-phase-rc5-sidebar-stability.log` (272), `sidebar-gate-phase-rc5-settings-overflow.log` (562) and `sidebar-gate-natural-final-ui-corrected.log` (110). The helper was refined during those preflights, as disclosed above; the two final full runs used identical frozen files. Failed intermediate experiments remain in their logs and are not counted as green. Reproduction covered fresh browser processes, sequential execution, the optional tracing/load probe, controlled delayed input and repeated full-suite ordering. No failing suite was skipped.

The existing Rust incremental-cache hard-link fallback to copying remains an environmental warning. Both normal native shutdowns also emitted the previously known WebView2 `Chrome_WidgetWin_0` / 1412 teardown diagnostic while exiting 0. Neither diagnostic was hidden or claimed fixed by this test-harness correction. No browser pageerror was accepted as a pass.

### Markdown and Data Regression

No Markdown implementation or fixture was rewritten. The fresh 747-test frontend run retains standard syntax, mixed marks, headings/lists/checklists, fenced code, blockquotes, all table alignment directions, external/internal links, old HTML-backed imports and canonical lossless sidecars. It includes the complete user golden document and the existing partial bold/underline **`Стоимость следующая -`** P0 regression. The eight browser golden-export cases passed in both full runs. Search/highlight no-save guards, RAG source navigation and editor no-remount/no-extra-save assertions also passed afresh.

Native navigation, resizing and restart left the six synthetic notes' content versions and Markdown/cache hashes unchanged. This is fresh persistence evidence for the exercised flow, not a claim that unit tests replace native export QA. The previous actual native Markdown file and its evidence were retained; a fresh native export or Telegram compatibility test was not required or claimed in this task.

### Changed Files, Preservation and Remaining Risks

Changed in this task: four existing QA runners (`rc5-approved-sidebar.mjs`, `rc5-sidebar-stability.mjs`, `rc5-settings-overflow.mjs`, `rc5-final-ui.mjs`), four new QA modules (`panel-motion.mjs`, `panel-motion-regression.mjs`, `sidebar-diagnostics.mjs`, `sidebar-timing-probe.mjs`) and this appended report.

**All 180 production files** under `src/` and `src-tauri/src/` match the captured baseline SHA-256 after the final build. There is no production CSS, UI, serializer, data model, backend/provider or business-logic change in this task. The new synchronization code runs only through the QA runners and is not imported by the production application.

Branch and HEAD remain **`codex/stable-ux-markdown-links` / `e1ba444a4fb5939814ffb2daf6f0d5902bc64531`**. Final tree: **52 tracked modified, 30 individual untracked files, 0 staged**, including all earlier work. Package/package-lock root/Cargo/Cargo.lock/Tauri versions remain **`1.0.0-rc.5`**, productName **NoteFlow**, identifier **`com.noteflow.desktop`**.

The local verification build produced `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.5_x64-setup.exe` and the `en-US`/`ru-RU` MSI files under `src-tauri/target/release/bundle/msi/`. They were not copied over the published RC5 set. Final SHA-256 verification matched **all four published-artifact entries** and **all eight preserved historical files**. No intentional QA files were deleted. The owned native app and Vite server were closed and process inspection found no remaining owned QA app/server. The release build was awaited to completion.

Remaining limits: browser phase seeking is an explicitly instrumented geometry test, not an FPS benchmark; editor-preservation playback is unpaused. Native validation is the executed subset above, not the exhaustive browser matrix or frame-precise rapid-toggle telemetry. Local horizontal Settings-tab scrolling remains by design. macOS native QA, installer lifecycle testing, Telegram and live external-provider smoke were not performed in this task. A specific OS scheduling/throttling cause for every historical observation was not inferred from a single successful run.

### Resolution Verdict

**READY FOR USER SMOKE.** The complete browser gate and every other mandatory fresh command passed, including the repeat full run and real Windows Tauri checks within their stated coverage. This resolves section 22's browser-gate blocker without altering the approved production Sidebar/Settings design or Markdown fix. It is not approval to publish NoteFlow 1.0.0 Stable. No git add, commit, push, merge, tag, version bump or release was performed.
