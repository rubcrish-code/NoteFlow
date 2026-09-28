# NoteFlow 1.0.0-rc.2

Windows Release Candidate for continued real-world testing. **Recommended installer:** NSIS. The en-US and ru-RU MSI packages are optional alternatives; switching installer families has not been validated.

## Fixed since rc.1

- Centered icons in shared empty states, including Projects, Tags, and Archive.
- Improved wide and ultrawide layout: bounded Tags, Models, and Data content instead of excessively stretched forms and rows.
- Preserved the configurable editor reading width and responsive toolbar layout.
- Restored the `Aa` font and size menu. It now opens in a positioned portal instead of being clipped by the toolbar, including at narrow widths.

The app reports `1.0.0-rc.2`. Windows MSI uses numeric `ProductVersion` **0.99.2** to order upgrades after rc.1 (`0.99.1`) and before final `1.0.0`; the application identifier and MSI UpgradeCode are unchanged.

## Known limitations

- This RC is **unsigned**; Windows SmartScreen may warn. Do not disable Windows security protections.
- The Windows installer lifecycle, including upgrade and switching between MSI and NSIS, is still undergoing real-world testing. Preserve important profiles and use a separate QA profile for destructive tests.
- A production macOS release has not been validated. There is no automatic updater.

SHA-256 checksums are supplied with the Windows artifacts. The standalone EXE is for QA, not the recommended user download.
