# Full English Localization & International Documentation

## Scope And Baseline

- Branch: `codex/post-rc6-markdown-performance`.
- HEAD: `42cdf9cca1371eac49c5645f6f82036d63b65b50`.
- Version: `1.0.0-rc.6`; canonical identifier: `com.noteflow.desktop`.
- Initial worktree: 86 modified, 80 untracked, 0 staged. Earlier uncommitted changes and historical QA artifacts are preserved.
- No commit, staging, push, merge, tag, version bump or publication is authorized or performed.

## Architecture And Inventory

The initial frontend AST inventory found 1,146 unique Cyrillic strings in 1,524 locations. This included UI copy, wire discriminators, keyboard mappings, stored defaults and document templates. It was not treated as permission to translate arbitrary strings.

The existing `uiMessages` catalog is retained. Paired `src/shared/i18n/ru.json` and `en.json` resources supply 1,130 additional keyed messages. Existing extracted `ui.<digest>` keys are stable identifiers, not runtime source-text replacement. New resources can use semantic keys such as `chat.source`. No new dependency is added.

The language store uses `useSyncExternalStore`. Existing components subscribe without changing keys, reloading the window or recreating the editor. Module-level navigation/tool/palette descriptors expose lazy translated labels. Calendar labels are computed for the current language. The existing UI settings persistence remains the source of truth.

Settings → General includes Interface language / Язык интерфейса, with Русский and English. Switching updates live state and persists `UiSettings.language`; Russian remains the fallback for existing profiles. Other settings are retained. No OS-language auto-detection is implemented (optional in the request).

Typed translation keys, parameter substitution, paired catalogs, locale-aware counts and display date helpers are shared. Russian dates remain DD.MM.YYYY; British English dates use DD/MM/YYYY; time stays 24-hour. Stored ISO timestamps, calendar values and chronology are unchanged.

Word counts also use plural rules: 1 word / 2 words and 1 слово / 2 слова / 5 слов. Restore failure classification now prefers the stable RESTORE_APPLIED error code rather than a Russian message substring, so English errors cannot incorrectly select the “current data unchanged” UI state. A targeted RU/EN test covers this; database restore semantics are not changed.

## Translated Surfaces

- Main navigation, sidebar/profile actions, page shells and loading/error states.
- Notes, projects, tags, archive, lists, search, filtering and context menus.
- All 31 formatting toolbar actions, editor menus, popovers, internal-link picker, outline, find controls, insertion, tables, attachment/image controls and focus mode.
- Onboarding, local profile, note/project/tag forms, validation and destructive confirmations.
- All six settings sections, AI provider and embedding forms, connection/discovery states, safe credential labels and advanced settings.
- Note AI, note chat, knowledge chat, history/source controls, consent notices, loading, retry and public errors.
- Import/export, backup preview/restore/result, model-independent search and knowledge maintenance feedback.
- App-controlled native dialog titles and filters, accessibility labels, tooltips, calendar controls, transient notifications and shared validation.

OS-owned dialog chrome follows the OS; NoteFlow controls its titles and filter names. Provider/model brand names, API paths and technical configuration values remain unchanged.

## Content And Persistence Boundaries

No DOM-wide translation or note-content transformation is used. User titles, tags/projects, names, note Markdown/JSON, existing chat history, model responses, IDs, URLs, paths and credentials are not translated.

Rust public error codes and retry flags remain stable. Known backend status messages and legacy aliases are translated only at explicit presentation boundaries; arbitrary provider/model response bodies are untouched. Language-aware date/detail node-view labels update their DOM/accessibility without document transactions and unsubscribe on destruction.

Stored archive discriminators `Проект` / `Заметка`, Russian keyboard mappings, name normalization and persisted legacy document defaults are intentionally retained. Newly inserted application template text can follow the selected UI language; existing document text is never rewritten.

Parameterized transient messages retain a bounded in-memory descriptor cache for language refresh. This is not persistent storage or logging. UI state changes do not call note-save commands or increment contentVersion.

## Geometry And Interaction

No general redesign, tag palette/shape, Markdown codec, sidebar controller or persistence policy is changed. Focus restoration selectors use stable data attributes instead of localized copy.

The AI popover previously lived inside the CSS-zoomed editor even though its geometry used viewport coordinates. It now uses the same body portal boundary as the font popover, avoiding double application of CSS zoom. Its business actions and toolbar positioning are unchanged.

Historical structural tests resolve only referenced catalog entries in an explicit Russian source view; assertions remain. The formerly absent language control now has real persistence, so its old “no language control” assertion is replaced with the real control contract. Separate DOM/TipTap tests cover switching, focus, selection and document integrity.

## Documentation Inventory

- English root README; original Russian README preserved as README.ru.md, with mutual language links.
- English documentation index plus installation/build, development, user guide, Markdown, AI configuration, architecture, data/backups, security/privacy, troubleshooting, release process and localization guides.
- CONTRIBUTING.md.
- Real application screenshots with synthetic data; no design mockups or personal content.
- Original Russian specification/DOCX guides and historical QA/release reports are retained. The index explicitly identifies old stage-specific files instead of translating their outdated claims as current behavior.
- No license is invented. Windows RC/unsigned status and macOS native/signing/notarization limitations remain explicit.

## Validation Status

This section is updated with fresh final gate results and native evidence before close-out. Intermediate results are not final acceptance:

- Initial full frontend run: 943/988; 44 old hardcoded-source copy contracts plus a sandbox PowerShell release-fixture failure. No tests were removed.
- After catalog-aware structural contracts: 999/999 frontend pass, including 11 new localization tests.
- New bilingual settings matrix: all 288 combinations passed before the runner reached editor checks.
- New editor/AI/picker/switch/reload/content-integrity matrix: 9/9 browser pass. Russian synthetic chat history was explicitly verified unchanged, not incorrectly counted as untranslated UI.
- Initial typecheck, frontend build, fmt, check, Rust tests, clippy, production audit and both Tauri builds ran. Audit: 0 production vulnerabilities.
- Initial diff check found two newly added blank EOF lines; corrected before final gate.
- A long-running old browser fixture encountered Vite reload during ongoing source edits. It must be rerun against frozen source before being counted as pass.

## Final Automated Gates

| Gate | Fresh result |
| --- | --- |
| npm run typecheck | AUTOMATED PASS |
| npm run test | 1,003 passed, 0 failed/skipped; 44.573 s |
| npm run build | AUTOMATED PASS |
| cargo fmt --check | AUTOMATED PASS |
| cargo check | AUTOMATED PASS |
| cargo test | 292 passed, 11 ignored, 0 failed; 22.23 s |
| cargo clippy --all-targets --all-features -- -D warnings | AUTOMATED PASS |
| npm audit --omit=dev --offline=false | 0 vulnerabilities |
| Separate isolated QA EXE | BUILD PASS |
| npm run tauri build | BUILD PASS; canonical NSIS and both MSI locales produced |
| git diff --check | PASS; line-ending advisories only |
| Documentation links/examples | 2/2 PASS, including the English product specification and both real frontend screenshots |

Final gate logs use `releases/qa/full-localization-final-*`. There is no npm lint script; no lint result is invented. Rust ignored tests are reported as ignored, not passed benchmarks.

## Browser Evidence

- Full existing 17-runner regression: 1,915 cases PASS. Final consolidated results: `releases/qa/full-localization-regression/final-counts.json`. Initial HMR/preview failures are retained in logs; unchanged assertions passed on retry with stable source and the correct preview URL. The retry driver also corrected its own result-file path, not the tested application.
- Bilingual settings/editor/AI/picker/theme/zoom/live-switch/reload matrix: 297 cases PASS. Includes 100/125/150/160% zoom, light/dark and settings widths 1100/1920/2800. The one-row editor toolbar is tested at a supported 2800px high-zoom viewport, not falsely claimed to fit an unsupported narrow layout.
- Additional RU/EN chat/send/reopen and actual export-menu pipeline: 4 cases PASS. Chat messages/model answers remain in their original language; note JSON/content versions stay unchanged. Export uses mock filesystem IPC, not a claim of new native physical-file validation.
- Total: 2,216 browser cases, with no unit/native double counting. Browser mock IPC and production-preview scenarios are not native Tauri evidence.

Screenshots: `releases/qa/full-localization/browser/language-{ru,en}-{light,dark}.png`, assistant theme/zoom views, `releases/qa/full-localization/functional/chat-{ru,en}.png`, and export dialogs. README screenshots are the real browser-rendered application frontend with synthetic note data; their caption explicitly says so.

## Markdown Non-Regression Finding

The extra functional check initially expected standard bold delimiters around a range including a trailing space. The existing export instead uses a lossless `{{nf:{"bold":true}}}...{{/nf}}` extension at that boundary. A real export through the previous `ai-localization-production` frontend reproduced the same output, confirming this predates localization.

Both new RU/EN exports are byte-for-byte identical to that pre-localization export (1,568 characters). Standard headings, list bold, tasks and code remain present, without HTML fallback. The locale-invariance check does not pretend to repair this separate Markdown representation limitation. No serializer was redesigned for it; the English Markdown guide now states it explicitly.

## Final QA Artifact

- File: `releases/qa/NoteFlow-QA-Full-Localization-Final.exe`.
- Build ID: `full-localization-final-417d5e30890a`.
- Source fingerprint: `417d5e30890a1bbe1af09ec9193019eca14a7d2770cb3ae928d16f502045a8a9`.
- SHA-256: `2D764BC4064AFAEE3590BDA8F7FC6BAC0F8CEFA010A183D8D349C714F71A27B3`.
- Size: 21,472,768 bytes.
- Built: 4 November 2026, 17:48:16 Europe/Moscow (14:48:16 UTC).
- Isolated profile identifier: `com.noteflow.qa.fulllocalizationfinal`.
- All 367 manifest input hashes and the EXE hash were verified. Canonical product identifier/version remain unchanged.

The earlier candidate `NoteFlow-QA-Full-Localization.exe` / build `full-localization-3f9c34e73d99` was preserved rather than overwritten while open. The **Final** artifact above is the one to test. Its distinct identifier prevents interference with either the previous QA profile or real user data.

## Native And Platform Status

**WINDOWS NATIVE: PENDING USER SMOKE.** The earlier isolated candidate was launched, and its window was returned by Computer Use. The window-inspection/access request was aborted; no subsequent native input was issued. No claim is made that switching, restart, settings, chats or clipboard were visually verified in that native window. The final artifact is built and hash-verified, not natively accepted.

**MACOS NATIVE: PENDING.** No real Mac was available. No macOS signing, notarization, Keychain, clipboard or window pass is inferred from Windows builds.

OS-owned native dialog chrome follows the OS. Existing user/model content, historical default profile names and persisted technical discriminators intentionally keep their language. Historical Russian QA/DOCX documents are preserved; current maintained guides and a requirements rendering have English Markdown counterparts. Live real-provider network generation and installer lifecycle are NOT VALIDATED in this localization task.

## Performance And Preservation

No production dependency was added. The primary bundle grows from the previous 472.48 kB / 143.07 kB gzip baseline to 606.09 kB / 188.72 kB gzip (+133.61 kB / +45.65 kB gzip) for the two UI catalogs and integration; the existing 536.45 kB editor-runtime chunk and its hash are unchanged. Vite’s >500 kB warnings are reported, not suppressed. No code-splitting work is included.

All 10 CSS inputs in the previous QA manifest remain byte-identical. Tag HEX values/geometry, Markdown content logic, sidebar animation/resize policy, SQLite schema, CAS and credential architecture are not redesigned. The changed-input comparison (122 source/test/QA inputs relative to the previous manifest) is recorded in `releases/qa/full-localization-changed-files.json`; it excludes historical worktree changes from an unrelated Git-base comparison.

## Git And Close-Out

Branch/HEAD/version remain as recorded above. Final worktree: 153 modified tracked files, 108 untracked files (92 collapsed untracked status entries), 0 staged. These totals include the large pre-existing worktree. Full file list: `releases/qa/full-localization-git-status.txt`.

No git add, commit, push, merge, tag, release or version bump. No historical QA artifacts, real notes, models or credentials were removed or changed.

**AUTOMATED PASS / BROWSER PASS. WINDOWS NATIVE PENDING USER SMOKE / MACOS NATIVE PENDING.** This is not approval to publish NoteFlow Stable.
