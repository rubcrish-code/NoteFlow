# Interface Language Segmented Control

Date: 2026-11-04. Version: `1.0.0-rc.6` (unchanged).
Branch: `codex/post-rc6-markdown-performance`.
HEAD: `42cdf9cca1371eac49c5645f6f82036d63b65b50` (unchanged).

## Scope and Implementation

The approved screenshot replaces the old language select for this row only.
The language row now belongs to the Profile list, below the introduction row.
Other preference rows and icons are unchanged.

- `InterfaceLanguageControl.tsx`: controlled native radio inputs, one named group,
  accessible group label, language-specific text, and the existing change callback.
- `SettingsPage.tsx`: integrates the control with the existing language and settings
  persistence. No localization store, IPC, database or editor changes.
- `settings.css`: scoped capsule (initially 244 x 42 CSS px; compact follow-up below),
  2 px inset, 21 px outer radius,
  equal segments, `#3B82F6` active background, white selected text, themed inactive
  surface, 160 ms sliding highlight, hover and focus-visible states.
- Language row padding is 11 px above/below. A scoped container query keeps the
  control right-aligned beside its label when the profile list has enough room.
  Very narrow layouts wrap below the label instead of overlapping or clipping.
- Reduced motion follows the existing global fallback (at most 1 ms).

## Typography Follow-Up

The initial implementation incorrectly used `--text-sm-size` (12.5 px) for segment
text, while adjacent settings buttons resolve to 16 px. Font family and weight
already matched. The segment now uses `font: inherit` and the shared semibold
weight; no dimensions or spacing changed.

Browser computed styles after correction match the adjacent settings button:

| Property | Standard button | Both language segments |
| --- | --- | --- |
| Family | Existing NoteFlow system/Inter stack | Identical |
| Size | 16 px | 16 px |
| Weight | 600 | 600 |
| Line height | normal | normal |
| Letter spacing | normal | normal |

Evidence: `releases/qa/language-segment/fonts/before.json` and `after.json`.
The geometry suite now compares all five properties in every language/theme/zoom case.

## Automated Checks (Typography Build)

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | 1005/1005 PASS, 76 suites |
| `npm run build` | PASS |
| Dedicated dev browser suite | 96 PASS |
| Existing bilingual settings/editor suite | 297 PASS, rerun after typography correction |
| Dedicated production browser suite | 96 PASS, including exact typography comparisons |
| New isolated QA EXE | PASS, file hash and all 369 source inputs verified |
| `npm run tauri build` | PASS after typography correction; NSIS and en-US/ru-RU MSI |
| `git diff --check` | PASS |

The dedicated suite covers light/dark, 100/125/150/160%, 900/1100/1440/1920 px
viewports, both languages, equal segments, divider gaps, containment, page/row
overflow, matching typography, arrows, Tab/Shift+Tab, focus ring, reduced motion,
live switching and full fixture reload with persisted language. Note snapshots
and note-save command counts must remain unchanged.
Total final browser cases: 489 (96 dev + 297 bilingual regression + 96 production).

There is no lint script. Rust source was not changed by this task; standalone
Rust checks were not rerun. Tauri builds compile the current Rust backend.
Existing Vite warnings about large main/editor chunks remain outside scope.

## Windows Native Evidence and Limits

Actual production Tauri EXE `NoteFlow-QA-Language-Segment.exe` was opened with
isolated identifier `com.noteflow.qa.languagesegment`, synthetic profile name
`Language QA`, and no API keys. Its build ID is
`language-segment-15a598c5b188`. This is the BEFORE-typography build, not the final EXE.

NATIVE OBSERVED before the typography follow-up:

- RU -> EN -> RU -> EN, including native left/right arrow interaction.
- Russian and English selected states in the light theme; English in dark theme.
- Native WebView viewport 1440 x 844, Windows device-pixel ratio 1.25.
- Capsule 244 x 42 CSS px; top/bottom divider clearance exactly 11/11 px.
- No page-level horizontal overflow; selected background `rgb(59, 130, 246)`.

Valid native screenshots and read-only geometry snapshots:
`releases/qa/language-segment/native/ru-light.{png,json}`,
`en-light.{png,json}`, and `en-dark.{png,json}`.
The exploratory file named `ru-dark` still contains English and is NOT Russian-state evidence.

Computer Use was stopped with the physical Escape key. No subsequent native UI
input or alternate UI automation was attempted. Final typography native screenshots,
maximized-window checks, native 125/150/160% and full native restart remain
PENDING USER SMOKE. Browser reload/persistence PASS is not native restart proof.
Latest browser screenshots are under `releases/qa/language-segment/browser/`.

## Previous Typography QA Build

Final EXE: `releases/qa/NoteFlow-QA-Language-Segment-Fonts.exe`.
Isolated identifier: `com.noteflow.qa.languagesegmentfonts`.
Build ID: `language-segment-fonts-05b1f707f34d`.
Source fingerprint:
`05b1f707f34df0f763707a8f3f0818c584baf24e859ebc25dde15058713221df`.
Manifest/hash evidence: `releases/qa/language-segment-fonts-artifact.json`.
Built: `2026-11-04T15:40:31.7746547Z`; size: 21,473,792 bytes.
SHA-256: `266BD768E5CEB12B37E4832FCDF4D34F3452CF3F2864F0FB914E8824FB0EC07C`.
The final EXE is not launched automatically after the Computer Use stop.

## Git and Release Control

Initial worktree: 153 modified tracked files, 108 untracked files, 0 staged.
All previous modifications and historical QA files are preserved.
No version change, staging, commit, merge, tag, push or release was performed.
Final worktree: 154 modified tracked files, 111 untracked files, 0 staged.

## Compact Size Follow-Up

The user's next adjustment reduces only the language control geometry:

- Outer capsule: 244 x 42 -> 224 x 38 CSS px.
- The existing proportional highlight becomes 109 x 32 px (previously 119 x 36).
- Font family, 16 px size, 600 weight, colors, radii, 2 px inset and 160 ms
  animation are unchanged. No React, localization or persistence changes.
- The language row's scoped minimum height is 60 px, preserving 11 px above and
  below the capsule. Keeping the inherited 64 px minimum would have enlarged
  these gaps after reducing the control height.
- Other settings rows are unchanged.

Fresh checks: typecheck PASS; 1005/1005 frontend tests PASS; build PASS;
96 browser geometry/typography/keyboard/persistence cases PASS across both themes,
100/125/150/160% and four viewport widths. CSS zoom is read independently of the
control dimensions so dimension assertions cannot pass merely by normalization.
Measured divider gaps are 11 px (maximum subpixel rounding deviation < 0.01 px).

Screenshots/results: `releases/qa/language-segment-compact/browser/`.
New QA EXE: `releases/qa/NoteFlow-QA-Language-Segment-Compact.exe`.
Isolated profile: `com.noteflow.qa.languagesegmentcompact`.
Build ID: `language-segment-compact-72cffaeda0dd`.
Source fingerprint:
`72cffaeda0dd58a1e7e558d2ff2b8361a17e0e3556a24d63bfb2d7ad19797f0a`.
QA Tauri build PASS (`--no-bundle`); file hash and all 369 manifest inputs verified.
Built: `2026-11-04T15:53:36.3377012Z`; size: 21,473,792 bytes.
SHA-256: `72AB97488C698BD55447E9609AFC04787EF088202689CA0F85FB41FB77A9A1A0`.
`git diff --check` PASS; worktree remains 154 modified, 111 untracked, 0 staged.
No native automation was resumed; compact-size native QA is PENDING USER SMOKE.
No new installer build was requested for this dimension-only follow-up.
Version, branch and Git release-control restrictions remain unchanged.
