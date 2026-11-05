# Release process

[Documentation](README.md)

This is a guide, not authorization to publish. Publishing source changes through a reviewed pull request does not publish new application packages or create a release. The current application version is `1.0.0-rc.6`; stable 1.0 requires separate release QA and maintainer approval.

## Before packaging

1. Obtain explicit maintainer approval for the intended release scope and version.
2. Record the branch, commit, dirty-tree state and canonical version sources: package/lock, Cargo/lock and Tauri configuration. About reads the version dynamically.
3. Complete fresh frontend, Rust, browser, security and native gates. Keep output and exact artifact fingerprints.
4. Back up real data; run destructive installer and restore tests only in an isolated account or VM.

## Windows

Use the existing [Windows checklist](../release/windows-release-checklist.md), `scripts/release-windows.ps1` and `scripts/stage-windows-artifacts.ps1` according to their preconditions. The release script’s clean-tree requirement must not be weakened merely to get a pass on a corrective branch.

MSI needs a numeric ProductVersion. The current rc.6 maps to `0.99.6`, below final `1.0.0`; retain the established UpgradeCode and canonical product identifier `com.noteflow.desktop`. Read the actual configuration before a future bump, rather than copying an old RC example.

Stage final NSIS setup, ru-RU MSI, en-US MSI, local QA EXE and `SHA256SUMS.txt` under the ignored versioned release directory. Hash the final bytes and compare staged files against build outputs. Publish the three installers and checksum list only after approval; standalone EXE is for QA.

Record clean install, upgrade, reinstall, uninstall/data retention, coexistence, second launch, offline use and disaster recovery for the exact packages. A bundling pass alone is not release readiness. The present RC is unsigned; do not imply otherwise. Signed production distribution requires real signing, timestamping and verification before final hashes are staged.

## macOS

Build and validate on a real Mac. Test Apple Silicon and any claimed Intel support separately, including clipboard, dialogs, Keychain, shortcuts, window behavior, app data, signing and notarization. No macOS native or production pass can be inferred from Windows or browser tests.

## Publication

Version bump, commit, tag, push and GitHub publication are separate approval-controlled steps. Never publish synthetic QA profiles, keys, logs, temporary files or user databases with installers. Keep historical validation records rather than relabeling them for the new artifact.
