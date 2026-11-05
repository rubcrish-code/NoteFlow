# NoteFlow 1.0.0-rc.7

Windows x64 prerelease containing the latest post-RC.6 corrections. This is not
the stable 1.0 release. Existing RC.6 downloads and tags are unchanged.

## Changes Since RC.6

- Markdown import, paste and export corrections, including mixed formatting and
  documented NoteFlow extensions in the single Markdown export option.
- Editor saving, CAS diagnostics, search decorations, internal note/fragment
  links and note-list performance improvements.
- Toolbar and panel-layout hardening, compact validation forms, approved tag
  colors, a compact language switcher and consistent neutral button backgrounds.
- Full Russian/English interface resources, English and Russian README files,
  international guides and reproducible browser/security CI.

## Downloads

- Recommended: `NoteFlow_1.0.0-rc.7_x64-setup.exe` (NSIS, per-user).
- Alternatives: `NoteFlow_1.0.0-rc.7_x64_en-US.msi` and
  `NoteFlow_1.0.0-rc.7_x64_ru-RU.msi` (machine-wide).
- `SHA256SUMS.txt` verifies the three downloadable installers.

Back up important data and close NoteFlow before upgrading. Choose one installer
type for normal use. Updates are manual; no automatic updater is included.

## Known Limitations

- Unsigned RC: Windows SmartScreen may show an unknown-publisher warning.
- Fresh clean-install, upgrade, reinstall, uninstall/data retention and
  coexistence tests for these exact packages remain pending on an isolated PC/VM.
- Windows 10, macOS native behavior, signing/notarization and live external AI
  providers are not newly validated by this release. No macOS package is offered.
- Large bundle warnings, the documented extreme-search stress latency and four
  approved light-theme tag color pairs below small-text WCAG AA remain.
- Browser tests are not native Windows interaction or physical latency evidence.

See [RC.7 validation](rc-1.0.0-rc.7-validation.md) for the release boundary and
recorded evidence. Final hashes and CI links are attached to the GitHub release.
