# AI Provider Message Localization

## Scope And Baseline

Branch `codex/post-rc6-markdown-performance`, HEAD
`42cdf9cca1371eac49c5645f6f82036d63b65b50`, version `1.0.0-rc.6`.
Baseline: 75 modified, 77 untracked, 0 staged. Existing work and historical QA
artifacts retained. No commit, staging, push, tag, merge, version bump or release.

This task changes system-message presentation only. No CSS, tag palette, sidebar
geometry, Markdown pipeline, provider identifiers, model names, endpoints,
credential access, network request semantics or persisted message contents change.

## Root Cause

Rust `llm::note_ai_status` returns a mixed-language `message` and `privacy_notice`.
The frontend's `noteAiService.mapStatus` previously forwarded both strings verbatim.
FormattingToolbar then rendered `aiStatus.message` directly in the AI assistant.
The existing `uiMessages` resource covered only the disconnected note-chat hint;
it did not cover the toolbar, status DTOs, toasts, provider settings or errors.

Additional mixed strings were found in the editor and note chat (`default LLM
provider`, `AI privacy`, `AI provider`), settings validation (`chat model`,
`provider`, `API key`), timeout/model-discovery feedback and backend-originated
model/embedding/RAG messages. Debug labels, command names, API fields, provider
types and real model/provider names are technical/user data and are not translated.

## Implementation

Expanded the existing `src/shared/uiMessages.ts`, with typed Russian/English
entries. The required Russian message is exactly:

`Провайдер ИИ-модели по умолчанию не выбран`

The resource also has exact legacy aliases for known backend/system messages.
`localizeUiMessage(language, message)` translates only an entire recognized system
message. It is not a regex replacement over arbitrary note/chat/model text.
Unknown messages remain unchanged; the existing public-error security boundary
still sanitizes backend errors before they reach the frontend.

Status, model-discovery, connection-test, embedding-test and RAG-error adapters
use that resource. Existing cached provider status text is localized when read,
not rewritten in SQLite. Public error codes and retryability remain unchanged.
No second serializer, network adapter or localization dependency was added.

Editor/toolbar and note-chat rendering also use the resource, including the
existing language setting. Each new resource has an English entry; tests exercise
both locales and the actual disconnected toolbar component in both languages.
This is not a rewrite of the application's existing, partially localized English
UI. No new language selector or complete application translation is claimed.

System terms are consistent: `ИИ-модель`, `провайдер`, `по умолчанию`, `API-ключ`.
Technical values such as `providerType`, `chatModel`, command/error IDs,
Authorization, X-API-Key, `/models`, model IDs and configured provider names remain
intact. Model response bodies and note/chat contents are not passed through the
localizer. A failed privacy confirmation now uses a safe localized resource
instead of interpolating a raw `String(error)` prefix.

Rust keeps its existing wire/diagnostic messages and control flow unchanged. The
compatibility aliases isolate those legacy messages at the frontend presentation
boundary, rather than inserting translated prose into backend business logic.

## Regression Coverage

New `tests/aiLocalization.test.ts` covers resource completeness/terminology,
Russian/English alias mapping, a TypeScript-AST scan of all frontend UI literals,
actual mock IPC status/discovery/error mappings, stable API/model identifiers,
unchanged note/model response content, public error code/retry flags, embeddings,
RAG errors and actual FormattingToolbar rendering without document mutation.

Existing exact-copy expectations now reference the resource, retaining their
original content checks. The first full frontend run found one source-contract
test expecting tooltip prose directly in SettingsPage; it now asserts the
component's resource reference and the same actual tooltip copy. No functional
assertions or timeout thresholds were removed.

Targeted browser tests cover disconnected assistant, disconnected note chat,
models settings and an existing RAG conversation in RU/EN, light/dark, 100/160%.
Additional cases exercise an external-model privacy notice without accepting it,
and sending/reopening a note chat with synthetic IPC persistence. No external
provider or real API key is used.

### Pre-existing Browser Limitation

At browser CSS-fallback zoom 160%, the AI popover's physical left/right placement
is multiplied by zoom twice. This also reproduces in the previous fingerprinted
QA production fixture, with the same left/right coordinates. No positioning or
CSS change is made in this text-only task. The new suite records this explicitly
as a pre-existing geometry limitation, not a geometry PASS. Localization, chat
and settings assertions still run at 160%; ordinary-zoom popup bounds are checked.
The actual Windows WebView uses its native zoom path; native 160% is not inferred
from this browser-only observation.

## Verification

### Fresh Automated Gates

| Check | Result | Evidence under releases/qa |
| --- | --- | --- |
| npm run typecheck | PASS | ai-localization-typecheck.log |
| npm run test | 988/988 PASS, 0 skipped, 43.349 s | ai-localization-tests-final.log |
| New localization regressions | 9 PASS, included in 988 | tests/aiLocalization.test.ts |
| npm run build | PASS | ai-localization-build.log |
| cargo fmt --check | PASS | ai-localization-fmt.log |
| cargo check | PASS | ai-localization-check.log |
| cargo test | 292 PASS, 11 ignored, 0 failed, 23.54 s | ai-localization-rust-tests.log |
| cargo clippy --all-targets --all-features -- -D warnings | PASS | ai-localization-clippy.log |
| npm audit --omit=dev --offline=false | 0 production vulnerabilities | ai-localization-audit.log |
| AI localization/browser flow matrix | 10 PASS | ai-localization/browser/results.json |
| Chat + embedding model-dialog matrix | 4 PASS | ai-localization/model-dialogs/results.json |
| Separate QA EXE | PASS | ai-localization-qa-exe.log |
| npm run tauri build | PASS, NSIS + ru-RU/en-US MSI | ai-localization-tauri.log |
| Source/EXE/version fingerprint | PASS, 358 matching inputs | ai-localization-check.json |
| git diff --check | PASS | ai-localization-final-diff.log |

The browser count is 14 current-code functional/localization cases, not the old
2017-case palette run reused as a current result. The 160% CSS-fallback popover
placement exception above remains explicitly recorded; it is not counted as a
successful geometry assertion. No existing CSS/layout test or production behavior
was changed to hide it. The existing Vite >500 kB editor-runtime warning remains.

### Updated QA EXE

`D:/Projects/NoteFlow/releases/qa/NoteFlow-QA-AI-Localization.exe`

- Build ID: `ai-localization-c7020359368b`.
- Working-copy fingerprint:
  `c7020359368ba8ca6d8c6f64862057b8ee44f832b61c330a2fc6a07bd39a0e84`.
- SHA-256:
  `78715CA6D3FEC43077CCB76B87445707E529BF5AD4F511893277A8C4AEEDAFA7`.
- Built `2026-11-03T22:22:21.4493937Z`; 21,364,736 bytes.
- QA-only identifier: `com.noteflow.qa.ailocalization`.
- Canonical productName/identifier stay `NoteFlow` / `com.noteflow.desktop`.
- Canonical package/lock/Cargo/Tauri versions remain `1.0.0-rc.6`.

### WINDOWS NATIVE VERIFIED

Opened this SHA-verified EXE in actual Tauri/WebView2, 1440x844 logical client,
Windows DPR 1.25, app zoom 100%. Created a fresh local profile named
`QA Localization` through the actual UI and skipped training. The application
created its ordinary first empty note. No user database was copied or modified.

Read-only SQLite checks confirm zero chat providers and zero embedding profiles.
There are no actual credentials or configured endpoints in this new QA profile.

- AI assistant: the actual Rust DTO passes through the new frontend adapter and
  the visible message is exactly `Провайдер ИИ-модели по умолчанию не выбран`.
- Note chat: opens normally; the disconnected-model instruction is Russian,
  natural, and contains no mixed English provider/privacy wording. Sending is
  correctly disabled because no model is connected.
- AI settings: both generative-model and semantic-search empty sections are
  displayed in Russian. The help resource uses `API-ключ`.
- Global AI chat: opens normally with Russian model/index status and empty
  history/source states. Its input is correctly disabled without models.

Computer Use performed input actions. CDP was used only to read the rendered
state and capture screenshots. Native helper JSON records build ID, EXE hash,
visible text, viewport and read-only provider counts. No privacy confirmation,
real model request, external API key or fake native answer was used.

Connected sending and history reopening have BROWSER PASS with synthetic IPC,
not a claimed native Bridge/Ollama smoke. English targeted UI/resources are
AUTOMATED/BROWSER PASS. Native English, native 160% and macOS are NOT VALIDATED
in this task. The full application's existing English-localization gaps are not
represented as fixed by this narrow provider-message pass.

### Screenshots

Actual Windows assistant with the requested message:

![Native assistant](D:/Projects/NoteFlow/releases/qa/ai-localization/native/assistant.png)

Actual Windows disconnected note chat:

![Native note chat](D:/Projects/NoteFlow/releases/qa/ai-localization/native/note-chat.png)

Actual Windows AI settings:

![Native AI settings](D:/Projects/NoteFlow/releases/qa/ai-localization/native/settings.png)

Actual Windows global AI chat:

![Native global chat](D:/Projects/NoteFlow/releases/qa/ai-localization/native/global-chat.png)

Browser English message, separate from native evidence:

![English assistant](D:/Projects/NoteFlow/releases/qa/ai-localization/browser/assistant-en-light.png)

## Changed Files And Preservation

Production files: shared/uiMessages.ts; services/{noteAiService,llmProviderService,
safeInvoke,ragChatService,embeddingService}.ts; app/AppShell.tsx;
features/editor/{EditorArea,FormattingToolbar}.tsx; features/note-chat/NoteChatPanel.tsx;
features/settings/{SettingsPage,SemanticSearchSettings}.tsx and llmNetworkOperation.ts;
features/rag/RagChatWorkspace.tsx.

Tests: new aiLocalization.test.ts; resource-copy assertions in nativeSmokeControls,
llmNetworkOperation, toolbar02d and modelSettingsUi tests. QA: scoped synthetic
extensions in final-ux-fixture.tsx and new scripts/qa/ai-localization.mjs.
Other build/native helpers and evidence remain Git-ignored under releases/qa.

Compared against the preceding palette QA source manifest: 44 relevant CSS,
tag/Markdown/sidebar-related inputs are byte-for-byte unchanged. The preceding
Classic Vibrant Soft QA EXE hash also still matches. Evidence:
`releases/qa/ai-localization-preservation.json`. Existing dirty work is not reverted.

Final Git: branch/HEAD unchanged, 86 modified, 80 untracked, 0 staged. No git add,
commit, push, merge, tag, version bump or release. All canonical versions remain
1.0.0-rc.6. The task's local preview/dev servers and native QA window are closed
after verification; the isolated QA profile remains available for user smoke.

**READY FOR USER SMOKE.** This fixes provider-system-message localization; it is
not a complete English translation, a popup-layout fix or a Stable release.
