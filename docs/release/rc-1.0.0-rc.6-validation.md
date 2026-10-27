# RC6 Release Validation

## Authorization and Baseline

The user accepted the post-RC5 smoke and explicitly authorized commits, the RC6 version bump, transfer to the canonical release branch, a normal push, an annotated tag and a public Windows prerelease. This supersedes the no-publication instructions in earlier historical task reports. Stable 1.0.0 is not being published.

Preparation started on `codex/stable-ux-markdown-links` at published RC5 `e1ba444a4fb5939814ffb2daf6f0d5902bc64531`: 52 tracked modified files, 30 individual untracked files, no staged entries. A fresh fetch found the same canonical `origin/release/windows-hardening` HEAD, with no remote divergence. RC5's annotated tag object is `b0db5de55d426f911a7d7d6c937f6fd2af266296` and peels to that RC5 commit. Its release notes/assets were recorded before publication and must not be changed.

## Source Review and Staging Boundary

All tracked differences and all untracked candidate paths were inventoried. Production changes cover tag presentation/palette, grapheme-aware validation, first-run profile/training, metadata-only paginated link selection, validated internal note/fragment URIs, temporary source decorations, passive editor transactions and portable Markdown export. There is no new migration or persistence schema in this release pass. The Rust `unicode-segmentation` dependency was part of the accepted feature implementation and already present transitively in the lockfile; this release preparation does not upgrade dependencies.

Internal links are parsed with an allowlist of URI fields, bounded IDs/quotes and context hashes; they do not open an arbitrary external protocol. Fragment copy includes the selected quote and neighboring context hashes, not raw neighboring text. Markdown export uses a version-checked saved document projection, does not rewrite canonical note storage and preserves the existing backup/sidecar representation. Ordinary CommonMark/GFM marks use standard syntax; unsupported rich formatting still has documented HTML/sidecar limits.

Feature staging includes the implementation, behavioral tests, synthetic fixtures, browser runners/timing helpers and the current task report. The six historical Phase B/C/D reports and `scripts/qa/phase-b-provider.mjs` intentionally remain local, unchanged. QA SQLite profiles, exports, screenshots, logs, preservation manifests, installers, build outputs and local audit helpers remain ignored under `releases/`. No `git add .`, cleanup or history rewrite is used.

A credential-signature/private-file scan of 432 tracked/candidate files found no key signatures or prohibited database/log/credential filenames. Source review retains debug-only allowlisted diagnostics and DEV-only serializer warnings. Synthetic test data is distinguished from native/live-provider evidence. No user profile or key is needed for release validation.

## Version and Identity

- Application: `1.0.0-rc.6` in npm package/lock roots, Cargo package/lock and Tauri configuration. About still calls Tauri `getVersion()`.
- MSI ProductVersion: `0.99.6`; ordering is `0.99.5 < 0.99.6 < 1.0.0`.
- ProductName: `NoteFlow`; identifier: `com.noteflow.desktop`.
- Required unchanged UpgradeCode: `{FF9D3DE5-B119-5CB0-9873-43E30A097AFA}`. Both final MSI packages must be queried read-only after bundling; metadata ordering is not an executed upgrade lifecycle test.

## Fresh Post-Bump Gates

| Gate | Result |
| --- | --- |
| Typecheck | PASS, 6.16 s |
| Frontend tests | 747/747 PASS, 75 suites, 0 failed/skipped; runner 24.98 s, command 25.62 s |
| Frontend build | PASS, 21.95 s |
| Rust fmt check | PASS, 0.74 s; no formatting applied |
| Rust check | PASS, 21.20 s |
| Rust tests | 283 PASS, 10 existing ignored, 0 failed; test execution 23.35 s, command including compilation 83.26 s |
| Strict all-target/all-feature Clippy | PASS, 16.71 s |
| Online production npm audit | 0 vulnerabilities, 3.32 s |
| Separate FTS benchmark | PASS: 10,000 notes; indexing 12.5201289 s, query 940.1 microseconds; execution 12.53 s |
| Full uninstrumented browser regression | 1542/1542 PASS across 11 runners, 0 skipped; all previously failing Sidebar/Settings runners completed |

The FTS benchmark ran without Vite, browser QA or Tauri dev. Frontend/Rust checks exercise real TipTap serialization/load, Markdown golden acceptance and P0 partial-bold/underline cases, SQLite transactions/migrations, CAS conflicts, assets, backup/restore and note/RAG history. Synthetic IPC tests are not live Bridge/Ollama checks. The ten ignored Rust tests remain explicit; no new skip was added.

The first gate wrapper used Windows PowerShell 5, which treated Cargo's normal `Compiling` stderr line as a terminating wrapper error. No Rust test failure was inferred from it. The complete gate wrapper was rerun in PowerShell 7; the fresh results above are from that successful run.

The first cold browser attempt timed out waiting for the synthetic editor after a fixture reload, with no recorded page error and no geometry assertion failure. Its partial results/log were preserved. An unchanged diagnostic rerun with optional tracing passed all 348 sidebar cases. No production code, assertion, timeout or skip was changed in response. The timeout's exact cause was not proven; it must not be misreported as a confirmed application defect or a proven infrastructure fix. The subsequent complete uninstrumented gate passed all 1542 cases: sidebar 348, panel stability 272, settings overflow 562, final UI 110, corrective geometry 86, final UX geometry 40, vision/contrast 10, RAG navigation 14, links/clipboard 79, golden Markdown 8 and motion-helper regression 13. These are newly executed post-bump results, not the historical two-run baseline.

The feature commit is `fdf0050` (74 selectively staged files). All 288 tested source/test/QA files retained their captured hashes; Git blob identity is recorded locally for comparison after the canonical fast-forward. Final-HEAD packaging/publication remain mandatory gates, with actual outcomes to be recorded in the local release audit after execution. Core checks must be repeated on the canonical branch before publication.

## Native Evidence and Limits

The user accepted the final changes. Earlier actual isolated Tauri/WebView2 checks, real-file Markdown export/import/restart and unchanged-content/CAS checks are detailed in [the task report](../tasks/final-ux-markdown-internal-links.md). They are historical evidence, not a newly executed RC6 installer lifecycle matrix. This release preparation changes metadata, not the accepted production behavior.

Clean install, RC5-to-RC6 upgrade, first launch of installed packages, preservation of a real profile and uninstall/reinstall on an isolated second Windows PC remain **PENDING TEST ON SECOND PC**. The primary user's installation/profile must not be used for destructive installer tests. Windows 10, macOS native QA and Telegram-specific paste are not validated. No new live Bridge/Ollama smoke is claimed. Installers are expected unsigned and must be inspected after build. Updates are manual; unsent AI drafts remain session-only.

## Final Publication Contract

Only the final release HEAD may be tagged `v1.0.0-rc.6`; the tag must be annotated and the canonical branch pushed without force. Final production packaging must use that HEAD with a clean tracked tree. Publish exactly three fresh installers plus their three-entry `SHA256SUMS.txt`, with `prerelease=true`, `draft=false`, `latest=false`. Do not publish the standalone QA executable.

Read-only installer identity/architecture/signature inspection, final output/staged SHA-256 comparison, remote HEAD/tag checks, release flags, asset sizes/digests and complete download-back hash verification are final post-commit gates. The machine-specific release audit/evidence stays ignored under `releases/qa/`; it must be reported with actual commit hashes and download results after execution. Published RC5 assets/tag/notes and intentional historical local files must still match their original records.
