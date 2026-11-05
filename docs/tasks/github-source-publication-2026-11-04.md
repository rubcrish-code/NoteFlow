# GitHub Source Publication Validation

Validation started: 2026-11-04; final local checks: 2026-11-05.
Application version: `1.0.0-rc.6`.

This task publishes source and documentation, not a new application release.
The maintainer approved a normal merge into `release/windows-hardening` only
after the pull request's CI passes. Existing tags and release assets must remain
unchanged. The comparison baseline is the actual `v1.0.0-rc.6` source tag,
commit `42cdf9cca1371eac49c5645f6f82036d63b65b50`.

## Scope

- Preserve the accumulated post-RC.6 Markdown codec, paste/export, serialization
  worker, autosave/CAS, search-decoration and panel-layout corrections.
- Publish the complete RU/EN catalogs, English README, Russian README and English
  developer/user documentation, with synthetic screenshots and regression tests.
- Preserve the approved tag palette, compact forms, language control and neutral
  button styling. Do not claim a new native or cross-platform release pass.
- Add a reproducible browser coordinator and Windows source-validation workflow.
  Playwright is a development dependency, not an application runtime dependency.

## Source and secret audit

The initial tree contained 158 modified files, 114 untracked files and no staged
files. Source, tests, resources, scripts and maintained documentation were
reviewed before staging. Build output, QA executables, profiles, databases,
credentials, logs and generated browser output are excluded from the commit.

Eighteen old tracked EXE/MSI files under `releases/` are removed from the current
index only. Their local files, hashes, historical commits, tags and GitHub
Releases are retained. Eight analyzed obsolete development runtime logs were
removed; historical QA evidence was not deleted. `.gitignore` now explicitly
protects common secret, local-database and runtime artifact paths.

Gitleaks 8.30.1 was downloaded from its official release and checksum-verified.
The initial 55-commit history scan found no secrets. Eight current-tree findings
were exact hashed localization IDs, not credentials. The committed scanner
configuration permits only those ID-shaped matches in the two catalogs, not
their message values. A synthetic credential negative control in a catalog was
detected as expected. Final curated-source and exact staged-tree scans both
passed with zero findings. The current curated source inventory contains 527 files.

No real profile, API key, personal note or local user database is used by this
validation. Screenshots and Markdown fixtures contain synthetic/example content.
Scanner output is redacted; generated inventories and logs remain Git-ignored.

## Documentation

`README.md` is English; `README.ru.md` is Russian. The documentation distinguishes
the newer source from the immutable RC.6 installer downloads. It does not imply
that merging this source updates an existing installer or publishes stable 1.0.
The maintained documentation has 73 valid local links/images and two external
links returning HTTP 200. It contains no developer-specific absolute paths.

Historical reports, specification documents and design references are preserved.
No new license grant or unvalidated macOS production claim is introduced.

## Browser-gate findings

The first full run passed 26 of 30 suites and correctly blocked publication:

1. A real General settings language-row overflow occurred at 1280 px and 160%
   zoom: the copy had a 79 px column but needed 93 px. The outer settings mode
   used physical width while the row's logical CSS width was smaller. A scoped
   container query now moves only the language control below its label when its
   actual container is below 470 CSS px. No overflow-hiding rule was added.
2. The old AI localization runner still searched Russian tooltips/navigation in
   English mode. It now uses the stable chat control identifier and the correct
   localized accessible names, retaining Russian leak and English-copy checks.
3. The old RAG runner counted hidden panel wrappers and their nested asides as
   separate open drawers. It now measures visible content and counts actual
   open top-level panels; the one-drawer, bounds and draft/scroll checks remain.
   This exposed a real 200-to-177 px reading-position shift on live zoom. An
   isolated experiment reproduced it in 7/8 existing-layout runs and 7/8 runs
   waiting for actual transitions. Disabling browser scroll anchoring only on
   `.rag-chat-scroll` preserved exactly 200 px in all 8 comparison runs. The
   scoped CSS correction retains the strict pixel-position assertion; message
   arrival still uses the existing application-controlled scroll behavior.
4. The old Phase C settings runner required `display:none` for collapsed labels.
   The approved sidebar keeps grid slots stable and fades labels. The runner
   now verifies zero opacity and disabled pointer events without changing the UI.

The language suite additionally covers the 1280 px viewport and checks the copy
element's own scroll width. No existing geometry limit was relaxed.

## Fresh Local Checks

| Check | Result |
| --- | --- |
| TypeScript typecheck | PASS |
| Frontend | 1009 passed, 76 suites, 0 failed/skipped |
| Production frontend build | PASS; existing large-chunk warnings remain |
| Rust formatting/check/Clippy (`-D warnings`) | PASS |
| Rust tests | 292 passed, 11 ignored, 0 failed |
| FTS benchmark, 10,000 notes | PASS; query 0.6605 ms; indexing 12.24 s |
| Metadata benchmark, 10,000 notes | PASS; latest 3 ms, count 1 ms |
| Full npm audit / production npm audit | 0 vulnerabilities / 0 vulnerabilities |
| Windows Tauri MSI/NSIS build | PASS; local artifacts only, not published |
| Workflow syntax (`actionlint`) | PASS |
| Final full browser rerun | PASS; 30 suites, 2667 reported cases, 0 failed |
| Separate performance protocols | PASS; 4 protocols: 18 UI, 107 typing, 9 search and 126 loading records |
| Final staged source scan and diff check | PASS; 0 secret findings; working and staged diff checks clean |

The dependency remediation used compatible updates without `--force`. Its 65
changed lockfile entries are development-only; production dependencies were not
changed by publication preparation. RustSec advisory auditing was not run and
must not be reported as a separate zero-vulnerability result.

The browser coordinator builds current production fixtures and a genuine tagged
baseline, allocates its own loopback ports and writes isolated result ledgers.
For loading comparisons only, both versions use the same synthetic IPC fixture
and ten fixed synthetic tags, while the baseline application source and lockfile
remain from the tag. The loading protocol verifies identical 10,000-note payloads
by SHA-256. This does not measure SQLite or physical display latency.
The tagged version renders 22 main toolbar actions and all 10,000 note cards;
the current version renders 31 actions and a virtualized list. The probe verifies
each version's real toolbar structure rather than requiring the new UI from the
old tag. The current 31-action and under-100-rendered-card checks remain strict.
The action-latency probe waits for the retained chat subtree to become hidden,
inert and aria-hidden; it no longer incorrectly requires DOM removal.

### Performance Evidence

The loading protocol alternates versions across three independent series. Each
version has 30 process-cold and 30 warm observations; six warmup observations are
excluded from the aggregate percentiles. Process-cold does not mean OS disk-cache
cold. The metric is an internal DOM-ready timestamp, not physical display paint.

| Loading 10,000 notes | RC.6 p50 / p95 | Current p50 / p95 |
| --- | --- | --- |
| Process-cold DOM-ready | 1926 / 2145 ms | 459 / 527 ms |
| Warm DOM-ready | 3363 / 4048 ms | 255 / 315 ms |

These results compare real release/source implementations with the same input,
not identical UI feature sets: the current toolbar has more directly rendered
actions and the note list is virtualized. Warm observations reuse a browser and
are not interchangeable with process-cold observations.

For a 100,000-character note, character-input p95 was 13.2 ms to the probe's second
animation frame and 2.1 ms in editor transaction dispatch. The extreme 10,000
search-match stress case still reached 96.6 ms input-to-second-frame p95 (4.5 ms
dispatch; 2.2 ms search update). This stress result is a remaining performance
limitation, not a claim of universally low latency. All measurements use a
headless browser and mocked IPC; no native input-latency PASS is inferred.
All data/IPC is synthetic. Scripts with `native` in their historical filenames
are still browser tests when run this way, not native Windows evidence.

## CI and Publication

The workflow uses least-privilege repository access, pinned official Actions,
checksum-pinned secret scanning, locked installs, frontend/Rust/browser gates,
dependency auditing and a Tauri application build without release publication.
Node.js 24 and the validated Rust 1.96.0 toolchain are used for reproducibility.
It runs on pull requests and on the target release branch. No force push,
protection bypass, tag rewrite or GitHub Release operation is permitted.

All local gates have passed. The initial source commit contains 297 changed paths: 118
added source/documentation/test/resource files, 161 modified files and the 18
legacy installer index removals. Every local legacy installer hash is unchanged.
The CI isolation follow-up adds a Vite configuration change and one test file;
the complete PR therefore contains 299 changed paths (119 added, 162 modified,
18 legacy installer index removals).
Staging also detected one extra EOF blank line in a previously untracked
Markdown source file; only that blank line was removed, without logic changes.

Publication and merge remain gated on green PR CI.
The PR and final handoff record the resulting commit and CI URLs; this report
does not use an impossible self-referencing commit hash.

### CI Infrastructure Follow-Up

The first hosted run (`41913349691`) passed secret scanning, frontend checks,
dependency audit, Rust formatting/check/tests and Clippy, but its browser dev
server stopped responding during the first suite. Production-preview suites
still ran successfully; dev-server suites failed with connection refused.
No merge was performed. The coordinator now records unexpected server exits,
fails immediately if an owned server dies and prints the server logs. CI retains
only bounded diagnostic logs and result ledgers for seven days, not browser
profiles, binaries or caches. A fresh passing hosted run is still mandatory.

The diagnostic run (`41916983041`) identified the exact exception: the Vite
watcher hit `EBUSY` on a locked Chromium `Cookies` file inside the generated QA
TEMP directory. This was a synthetic browser profile, not the user's profile.
The default cold dependency discovery also crawled saved QA trees and generated
Rust HTML assets, reproducing a cold-start timeout locally on the runner's exact
Node 24.22.2 runtime.

`vite.config.ts` now discovers only `index.html` and source QA HTML files, and
does not watch `releases/**` or `src-tauri/**`. It does not suppress watcher
errors or disable source HMR. Two tests validate these structured config
boundaries. Cold startup with the same Node, project TEMP and forced optimizer
now passes in under six seconds. The emitted production JS asset names/content
hashes remained unchanged (16 chunks). All local frontend/Rust/security/packaging
gates were rerun successfully; hosted confirmation on this fix is required.

### Hosted Canvas Regression Follow-Up

Run `41919579569` confirmed that the Vite servers remain alive through all 30
browser suites. Twenty-nine suites passed; the image suite failed only on its
64-by-48 bitmap annotation check. No merge was performed.

The old oracle required a highly saturated blue pixel. A four-CSS-pixel stroke
on a small bitmap upscaled for editing can be less than one intrinsic pixel
wide. Antialiasing then blends the stroke with the red/green fixture. A local
diagnostic on the hosted Node runtime measured maximum blue values of 136, 109
and 91 at viewport heights 700, 900 and 1100; the old threshold rejected the last
two. In all three cases the cropped output exactly matched every retained RGBA
byte from the actual annotated canvas. This is evidence of an invalid test
oracle, not annotation loss.

The repeated-crop test now first verifies that the unannotated fixture has no
blue, waits for real UI drawing to add blue, and captures an unselected canvas
bitmap. Each crop and reopen compares SHA-256 of every retained RGBA byte against
an independently extracted rectangular region of that bitmap. Dimensions and
crop origin remain strict. A negative control verifies that removing the blue
annotation cannot satisfy the pixel oracle. Two additional 64-by-48 scenarios
at taller viewports exercise the subpixel-stroke case explicitly. No production
image code, geometry tolerance or existing case was removed or relaxed.

The updated image suite passed all 18 cases locally on Node 24.22.2 with GPU
disabled, including both repeated crops at all three tiny-image viewport sizes.
The previous 16-case suite also passed with default rendering. Typecheck,
all 1009 frontend tests and the production frontend build were rerun successfully.
A complete passing hosted run on this test correction remains the merge gate;
the earlier full local run contained 2667 cases before the two additions.

## Remaining QA Limitations

- No new Computer Use/native smoke is claimed in this publication task.
- Windows installer lifecycle, live external AI providers and physical input
  latency require their own fresh checks; mocked browser results are not proof.
- macOS native QA, signing and notarization remain pending. Windows 10 is not
  newly validated by the Windows development machine or hosted CI.
- Four approved exact light-theme tag color pairs remain below WCAG AA for
  small text, as already documented in the palette report.
- No automatic updater, stable 1.0 release, new tag or installer upload is made.
