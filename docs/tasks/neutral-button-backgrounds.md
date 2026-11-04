# Neutral Button Backgrounds

Date: 2026-11-04. Version remains `1.0.0-rc.6`.
Branch: `codex/post-rc6-markdown-performance`.

## Approved Scope

Use the language switcher's inactive background for neutral action buttons across
the application. The user explicitly confirmed retaining primary blue buttons,
destructive colors and colored tags. Transparent icon/navigation/menu controls
remain transparent; this is not a blanket `button` background override.

## Root Cause and Fix

Neutral actions originally inherited `--field-bg` or `--surface-panel` and some
components overrode these again locally. The language track used `--asoft2`.

The shared tokens now resolve as follows:

- `--button-bg: var(--asoft2)`; light `#F2F6FD`, dark `#1D2531`.
- `--button-secondary-bg: var(--button-bg)`.
- `--button-bg-hover`: the common background mixed with 8% theme accent.
- Language track and inactive-segment hover use these same tokens.

Scoped neutral overrides now use the shared surface for secondary buttons,
form cancel actions, model key/discovery actions, font reset, image actions,
table controls, zoom reset, calendar navigation, export/open-file actions,
RAG new-chat and note-chat suggestion buttons, and inactive introduction steps.
The secondary semantic-search action also receives the common hover state.

No changes to dimensions, radii, typography, layouts, business logic, persistence,
Markdown, toolbar structure or sidebar behavior. Input surfaces stay
`#F4F4F4` / `#242427`. Primary and destructive tokens are unchanged.

## Changed Files in This Task

- `src/styles/tokens.css`
- `src/styles/foundation.css`
- `src/styles/app.css`
- `src/styles/settings.css`
- `src/styles/chat.css`
- `src/styles/rag.css`
- `src/styles/pages.css`
- `tests/neutralButtonTheme.test.ts`
- `scripts/qa/neutral-button-backgrounds.mjs`
- This report.

Existing unrelated changes, including `editor.css`, are preserved.

## Validation

| Gate | Result |
| --- | --- |
| Typecheck | PASS |
| Full frontend suite, after final CSS changes | 1007/1007 PASS, 76 suites |
| Production frontend build | PASS |
| Dev neutral-button browser matrix | 88 PASS |
| Language geometry/keyboard/persistence matrix | 96 PASS |
| Existing bilingual settings/editor regression | 297 PASS |
| Production neutral-button matrix | 88 PASS |
| Separate Tauri QA EXE | PASS; SHA-256 and all 371 input files verified |
| `git diff --check` | PASS |

The color matrix checks actual pages (all six settings sections, projects, tags,
archive, RAG) and 20 rendered component-style samples, in both themes at 100/160%
and widths 1440/2800. Samples check default, hover, keyboard focus and disabled
availability. Protected-state assertions cover primary, danger, transparent ghost
buttons and input backgrounds. Note content snapshots must remain unchanged.
Two new structured-CSS unit tests cover shared aliases and independent semantic colors.
Total fresh browser cases: 569 (88 dev color + 96 language + 297 bilingual + 88 production color).

Browser screenshots: `releases/qa/neutral-button-backgrounds/browser/profile-light.png`
and `profile-dark.png`. These are BROWSER evidence, not native screenshots.
Native QA remains PENDING USER SMOKE. Computer Use was not resumed after the
earlier physical Escape stop. No real user profile, notes, API keys or models were used.

Rust sources were unchanged by this task; standalone Rust checks were not rerun.
The QA Tauri build compiles the current backend. Existing large-bundle Vite warnings
remain outside scope. No new dependencies or installer/release publication.

## QA Artifact

EXE: `releases/qa/NoteFlow-QA-Neutral-Buttons.exe`.
Profile identifier: `com.noteflow.qa.neutralbuttons`.
Build: `neutral-button-backgrounds-dc0d43a85da2`.
Source fingerprint: `dc0d43a85da263d826cbb17759043a1f88eea344e138530c10659b4ffa353559`.
Hash/manifest evidence: `releases/qa/neutral-button-backgrounds-artifact.json`.
Built: `2026-11-04T16:11:04.5299050Z`; size: 21,473,280 bytes.
SHA-256: `1E3ED1D4F423EFA53604014D2FB9CBB33817918965C1382076A21C29E2A2FBC0`.

## Git Control

Initial status: 154 modified tracked, 111 untracked, 0 staged.
Previous work and historical QA files were not removed or reverted.
No version bump, staging, commit, merge, tag, push or release.
Final status: 158 modified tracked, 114 untracked, 0 staged.
