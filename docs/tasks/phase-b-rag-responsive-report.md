# Phase B: Zoom-Aware RAG Layout Corrective Pass

Date: 2026-10-01. Branch: `feature/rc3-product-polish`.
HEAD: `381175354a6128ca097f97f7d796d2ba652df01d`.
Application version: `1.0.0-rc.2`, unchanged.

## Scope

Only RAG screen layout and its regression coverage were changed in this pass.
The pre-existing Phase B changes were preserved. No new changes were made to
FTS, Rust, retrieval/generation semantics, project/standalone scope, Retry,
persistence, auto-indexing, the editor, or Phase C.

## Root Cause

The RAG grid uses persisted physical widths for history and Sources, divided
by `--app-zoom` when rendered in CSS. Its existing width observer also reports
physical width. However, the layout budget reserved an unscaled 440 pixels
for the conversation, although chat typography and controls scale with zoom.

For example, a 1110-pixel workspace with 280-pixel history and 320-pixel Sources
leaves 510 physical pixels for chat: only 318.75 CSS pixels at 160%. The old
1040-pixel threshold nevertheless allowed three docked columns. Fixed-width
header actions then consumed almost all of this narrow title row.

Sources had a second problem: implicit grid tracks and flex children retained
the intrinsic minimum width of unbroken titles, URLs and snippets. A native
stress test also reproduced overflow when a long source title appeared inside
an assistant response, not just in the source list.

The existing drawers covered the complete conversation, including header and
composer. The first browser run demonstrated this by failing to click the
scope selector because Sources intercepted the pointer.

## Responsive Policy

- Keep the existing wide three-column layout when the preferred physical panel
  widths plus **440 CSS pixels converted through the shared physical-layout
  helper** fit. Do not multiply persisted panel widths by zoom a second time.
- Otherwise use the existing single-drawer model. Opening history closes the
  Sources drawer and vice versa. No compressed three-column intermediate mode
  was introduced; preferred panel widths are not overwritten by responsiveness.
- When leaving wide mode, Sources has priority if it was preferred open;
  otherwise preferred-open history remains accessible. Returning to wide clears
  transient drawer flags and restores docked preferences.
- The existing `AppZoomContext` and physical `ResizeObserver` remain the only
  zoom/width measurement path. Zoom changes require no restart.
- A conversation container query at 640 CSS pixels places title and actions in
  two deliberate rows, rather than squeezing the title between fixed actions.
- Stream and composer retain their existing 780-pixel maximum width.

## Text, Header and Drawer Constraints

Sources use explicit `minmax(0, 1fr)` list tracks and a number/text grid inside
each card. Long titles, snippets, heading paths and project labels wrap through
`overflow-wrap: anywhere`. Assistant Markdown uses a zero-minimum grid track
and wrapping; user text and thread items have matching intrinsic-width guards.
No new top-level `overflow-x: hidden` was added to conceal overflow.

Title uses available flex space with ellipsis; subtitle stays on one line.
Scope selection semantics and the portal itself are unchanged.

`useRagOverlayBounds` observes the complete header and composer in layout CSS
pixels. Drawer top/bottom variables reserve both areas. The observer disconnects
on cleanup and updates only when measured dimensions change. History drawers
use one compact action row, leaving enough height for a complete history item
even at 1100x700 / 160%. Docked history styling is unchanged.

## Automated Coverage

`tests/ragResponsiveLayout.test.ts`: 8 behavioral helper tests for zoom budgets,
panel widths, threshold boundaries and deterministic drawer transitions.

`tests/ragWorkspace.test.ts`: 2 additional rendered DOM tests for stable message,
citation and composer nodes, preserved drafts/scope, no extra service calls on
layout changes, mutually exclusive drawers and restored wide preferences.

The Playwright geometry harness mounts the actual RAG components and production
CSS with typed mock IPC and synthetic data. It is not a native Tauri test and
does not call real models or read a user database. No production dependency was
added; Playwright came from the bundled QA runtime and used installed Edge.

Covered 6 viewport/zoom pairs, 3 chat titles, 4 requested panel states:

| Window / Zoom | Both Panels Requested | Conversation CSS Width |
| --- | --- | ---: |
| 1100x700 / 100% | One drawer | 770 |
| 1100x700 / 160% | One drawer | 476.72 |
| 1440x900 / 100% | Three columns | 510 |
| 1440x900 / 160% | One drawer | 671.75 |
| 1920x1080 / 100% | Three columns | 990 |
| 2560x1440 / 100% | Three columns | 1630 |

72 matrix cases plus 4 live zoom cases = **76 passed rendered geometry checks**.
All measured page, chat, source and history horizontal overflow was zero.
Assertions include minimum chat/title/composer widths, visible send/header
actions, one drawer maximum, drawer bounds outside header/composer, and room
for a complete history row. Scope popover bounds and standalone label were
checked. Short/long titles, unbroken words, URLs, Cyrillic and Markdown were
tested both in Sources and assistant answers.

Live 100% -> 125% -> 160% -> 100% preserved the draft, 12 answer nodes, and
an explicitly set chat scroll position of 200. Screenshots were visually read
in addition to the numeric assertions, including narrow/high-zoom and ultrawide.

Reproduction, with a local Vite server:

```powershell
$env:NOTEFLOW_QA_NODE_MODULES = 'C:\Users\rubcr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node scripts/qa/rag-layout-geometry.mjs
```

Screenshots: `%TEMP%\noteflow-rag-layout-qa`.

## Native QA

Started `npm run tauri dev -- --no-watch --config <temporary window override>`
with `NOTEFLOW_DEV_DATA_DIR=%TEMP%\noteflow-standalone-scope-20261001`.
This is the existing synthetic QA profile, not the user's installed profile.
Only the deterministic loopback provider at `127.0.0.1:19999` was used.

Observed the real Tauri/WebView window at a 1100x700 client size (1102x731
outer capture) and at 100%, 125% and 160%. Renamed the synthetic chat to the
specified long title, created a synthetic long-title/long-snippet note through
the UI, saved it, and retrieved it through the existing mixed scope. The answer
and four actual source snapshots displayed correctly. No cloud requests or
real credentials were involved.

At 160%: Sources and History toggle exclusively; no horizontal scrollbar;
title uses readable ellipsis; the history row remains visible; long source
text wraps and scrolls vertically; scope selector opens correctly above layout;
composer/send remain accessible. An unsubmitted draft survived live zoom back
to 100%, without a restart.

The maximized native capture was 1536x816, the available desktop work area.
At 100% it restored history | chat | Sources. Sources close/reopen worked and
the long title remained readable. Larger native resolutions were unavailable;
1920x1080 and 2560x1440 are geometry coverage only, not claimed native QA.

The QA window closed with Alt+F4; Tauri exited with code 0. WebView emitted
`Failed to unregister class Chrome_WidgetWin_0. Error = 1412` during teardown;
this was nonfatal. The QA provider and dev session were stopped afterward.
Synthetic fixtures remain in TEMP for reproduction, not in the repository.

## Full Checks

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run test | PASS: 349/349, 60 suites, 39.80 seconds |
| npm run build | PASS: 222 modules, Vite 4.18 seconds |
| cargo fmt --check | PASS |
| cargo check | PASS |
| cargo test | PASS: 239 passed, 5 ignored, 0 failed; tests 21.62 seconds |
| cargo clippy --all-targets --all-features -- -D warnings | PASS |
| npm run tauri dev | PASS, isolated native QA above |
| npm run tauri build | PASS: release compilation 2m 23s, NSIS + ru-RU/en-US MSI |
| git diff --check | PASS; only existing LF/CRLF notices |

The first sandboxed npm test attempt failed before test execution with
`spawn EPERM`. The full suite passed after allowing child processes. Browser,
Vite and Tauri builds needed the same process permission. No tests were weakened
to work around the environment. The isolated FTS benchmark was not rerun:
search code is untouched and the accepted prior baseline remains 11.169 seconds
indexing / 0.6303 ms query, not a new measurement from this pass.

## Files in This Corrective Pass

Production:
- `src/features/rag/ragResponsiveLayout.ts`
- `src/features/rag/RagChatPage.tsx`
- `src/features/rag/RagChatWorkspace.tsx` (layout-only additions atop Phase B)
- `src/features/rag/useRagOverlayBounds.ts` (new)
- `src/styles/rag.css` (layout-only additions atop Phase B)

Tests / QA / report:
- `tests/ragResponsiveLayout.test.ts` (new)
- `tests/ragWorkspace.test.ts` (2 additional DOM cases)
- `scripts/qa/rag-layout-fixture.html` (new)
- `scripts/qa/rag-layout-fixture.tsx` (new)
- `scripts/qa/rag-layout-geometry.mjs` (new)
- `docs/tasks/phase-b-rag-responsive-report.md` (new)

## Git / Release State

The initial tree had 28 modified tracked files and 8 untracked files. This pass
preserves them, adding 2 newly modified tracked files and 6 untracked files.
Final total: 30 modified tracked files and 14 untracked files.
All version sources remain `1.0.0-rc.2`; productName is `NoteFlow` and identifier
is `com.noteflow.desktop`. No commit, tag, push, staging or Phase C work occurred.

Built artifacts (not copied to release staging or published):
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.2_x64-setup.exe`
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.2_x64_en-US.msi`

Final verdict: **READY FOR USER PHASE B FINAL SMOKE**.
