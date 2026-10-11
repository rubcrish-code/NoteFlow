# RC5 Release Validation

## Scope and baseline

- Preparation started on `feature/rc5-usability-editor-polish` at `234e9737e694a84d10bccdee6fef1da29516ff07` (published RC4 baseline).
- Initial tree: 66 tracked modified entries, 35 untracked, no staged entries. Existing changes were reviewed and retained; this release pass adds no product behavior.
- Release source version: `1.0.0-rc.5` in package.json, both root npm lock locations, Cargo package/lock and Tauri configuration. Dynamic About still calls Tauri `getVersion()`.
- MSI mapping: `0.99.4 < 0.99.5 < 1.0.0`. Identity stays `NoteFlow` / `com.noteflow.desktop`; required UpgradeCode stays `{FF9D3DE5-B119-5CB0-9873-43E30A097AFA}` and must be verified in both final MSI packages.
- RC4 release notes, tag and remote asset metadata are preserved. Local hashes of intentional historical files and RC4 notes were captured before commits.

## Selective staging

The implementation commit includes 65 existing tracked source/test changes and 28 RC5 additions: nine production source files, five tests, eleven synthetic QA fixture/runner files and three task reports. No application database, profile, provider configuration, credential, installer or build output is included.

Seven historical intentional untracked files remain local: the six Phase B/C/D reports and `scripts/qa/phase-b-provider.mjs` present before RC5. Ignored `releases/qa/` stores synthetic QA profiles, screenshots, logs and gate outputs; it is not staged or published. Release metadata and these validation notes belong to a separate release commit.

## Fresh gates after version bump

All of these gates were actually rerun after the version bump, with owned Vite/browser/native processes closed before the full frontend/Rust suites and benchmark:

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | 639/639 PASS, 75 suites, 0 failed/skipped; 15.619 s |
| `npm run build` | PASS; Vite 12.64 s, no chunk-size warning |
| `cargo fmt --check` | PASS, no automatic formatting |
| `cargo check` | PASS; 20.02 s |
| `cargo test` | 274 PASS, 10 existing ignored, 0 failed; 20.71 s test execution |
| Strict all-targets/all-features clippy | PASS; 11.81 s |
| Separate ignored FTS benchmark | PASS: 10,000 notes; indexing 11.6885358 s, query 818.8 microseconds; 11.70 s test execution |
| Online production npm audit | 0 vulnerabilities |
| `git diff --check` / staged check | PASS; LF/CRLF conversion notices are not test failures |
| Browser regression | 1,378/1,378 PASS: fluid sidebar 348, five-panel stability 272, settings overflow 562, final UI 110, corrective geometry 86 |

P0 partial-underline regressions passed for ranges 18:19, 10:15 and 0:18, over ten canonical cycles; the queued formatted-autosave/navigation test also passed. Adversarial Markdown application parsing passed in 601.1295 ms. There were no changed test thresholds or disabled tests in this release pass.

The production web output contains no source maps, dev server URLs or synthetic QA fixture markers. Final production bundling must run again at the canonical release branch's final HEAD. A build made before that commit is not a publishable artifact. Relevant gates are repeated after the canonical fast-forward; final package metadata and remote download hashes remain separate post-build evidence.

## Regression evidence and limits

- Frontend behavioral tests exercise the real TipTap serializer/load pipeline, including `Стоимость следующая -` with bold and partial underline over ten canonical cycles and queued autosave/navigation. Temporary SQLite tests cover transactions, content-version conflicts, migrations, restore, assets, reference-aware GC, FTS and knowledge index consistency.
- AI tests cover note/RAG drafts, background generation, streaming/Stop, citations, scope, source identity and indexing. Synthetic IPC fixtures are not live Bridge/Ollama evidence; live provider smoke is not repeated for this release pass. No credentials or user database are copied into QA.
- Five browser runners check real Edge layout/frame geometry at 100%/160%, light/dark, narrow/wide, min/max sidebar widths, rapid toggles, manual resize, persistence and reduced motion. They are not native installer QA.
- RC5 functional user smoke was accepted before this release request. Earlier native Tauri smoke remains documented in the task reports. No fresh packaged clean-install/upgrade/reinstall/uninstall matrix is claimed: **NOT VALIDATED**. RC4-to-RC5 upgrade ordering/identity checks do not replace that matrix.
- Windows RC is unsigned, SmartScreen warnings are possible. Windows 10 and macOS production releases are not validated. No updater exists; unsent AI drafts remain session-only.

## Security and publication boundary

Tracked/candidate text was scanned for credential signatures and private key blocks; no credential was found. Filename scanning found no tracked/candidate database, log, private environment or credential container. LLM diagnostics are debug-only and allowlisted; serializer warnings are frontend DEV-only. Test diagnostics are excluded by `cfg(test)`.

Only three fresh final installers and their three-entry `SHA256SUMS.txt` may be published. The standalone EXE remains local QA-only. Publication must verify the canonical remote HEAD, annotated tag target, GitHub `prerelease=true` / `draft=false` / non-latest status, exactly four public assets and hashes of files downloaded back from GitHub. Actual post-build/post-publication metadata belongs to the ignored release audit and final task report, not an unverified promise in these pre-publication notes.
