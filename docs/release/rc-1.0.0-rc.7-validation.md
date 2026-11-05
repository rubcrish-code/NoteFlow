# RC.7 Release Validation

## Authorization and Source Boundary

The maintainer explicitly approved publishing a new Windows prerelease
`1.0.0-rc.7` with the latest application changes, preserving RC.6 and not
publishing stable 1.0.0.

The baseline is `0d490372eaf15bd0ea33f0dc3ca9862d45b1e2bd`, the merged post-RC6
source/documentation publication. Its exact tree passed both
[PR CI](https://github.com/rubcrish-code/NoteFlow/actions/runs/41974083766) and
[post-merge CI](https://github.com/rubcrish-code/NoteFlow/actions/runs/41979311785):
1009 frontend tests, 292 Rust tests with 11 explicit ignored tests, and 30 browser
suites with 2669 reported cases. These are baseline results, not a substitute for
the new RC.7 gates. Separate baseline performance/FTS evidence is recorded in
[the publication report](../tasks/github-source-publication-2026-11-04.md).

This release pass changes only canonical versions, current release documentation
and these records. It does not change application logic, dependencies, user data
or migrations. About still obtains its version dynamically.

## Version and Installer Identity

- npm package/lock, Cargo package/lock and Tauri version: `1.0.0-rc.7`.
- MSI ProductVersion: `0.99.7`; ordering `0.99.6 < 0.99.7 < 1.0.0`.
- Product identifier: `com.noteflow.desktop`, unchanged.
- Expected MSI UpgradeCode: `{FF9D3DE5-B119-5CB0-9873-43E30A097AFA}`, unchanged.

## Final Gates and Publication Contract

Run fresh frontend typecheck/tests/build, Rust fmt/check/tests/strict Clippy, the
isolated FTS benchmark, online production npm audit and Tauri packaging on a clean
release commit. Run the complete browser CI on the release preparation revision.
Do not infer a pass from old logs. Preserve actual results, timing, source hashes
and artifact hashes under the ignored release audit directory; put the final CI
and verification results in the PR/release, avoiding a self-referencing commit.

Stage NSIS, both MSI locales and the standalone QA EXE using the existing script.
Publish only the three installers and their three-entry `SHA256SUMS.txt`.
Compare staged bytes against final build outputs, inspect both MSI identities and
the executable/signature metadata, and download the uploaded files to verify
their complete SHA-256 hashes. Check the remote annotated tag against the release
commit. No force push or previous asset replacement is permitted.

## Validation Limits

No destructive installer operation may use the maintainer's real profile. Fresh
installer lifecycle, Windows 10 and macOS native QA remain pending. No new live
Bridge/Ollama or physical input-latency pass is claimed. The packages are unsigned,
updates are manual, and stable 1.0.0 is not authorized by this RC publication.

The final GitHub prerelease must be public (`draft=false`, `prerelease=true`) with
`latest=false`, and must not alter RC.6 notes, assets or tags.
