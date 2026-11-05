# Installation and builds

[Documentation](README.md)

## Windows

Download packages only from the project’s [GitHub Releases](https://github.com/rubcrish-code/NoteFlow/releases). The published RC is `1.0.0-rc.6`. Later source commits and documentation do not update existing installer downloads; build from source to try corrections newer than the release tag.

- **Recommended:** NSIS `NoteFlow_1.0.0-rc.6_x64-setup.exe`, installed for the current user.
- **Alternative:** English or Russian x64 MSI, installed for the computer.
- **QA only:** standalone EXE. Do not treat it as the normal distribution package.

Use one installer type for everyday installation. Back up important data before an upgrade. Compare SHA-256 against the release’s `SHA256SUMS.txt` when verifying a download:

```powershell
Get-FileHash -LiteralPath .\NoteFlow_1.0.0-rc.6_x64-setup.exe -Algorithm SHA256
```

The RC is unsigned. SmartScreen may report an unknown publisher; do not disable Windows security. Installer clean-install, upgrade, uninstall, reinstall and coexistence results must be recorded for the exact package on an isolated account or VM. Windows 10 validation is separate from Windows 11 validation.

## Build on Windows

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/): Node.js/npm, Rust stable, MSVC Build Tools and WebView2. From the repository root:

```sh
npm ci
npm run tauri dev
npm run tauri build
```

Tauri reports the artifact paths. Windows bundles are normally under `src-tauri/target/release/bundle/`. A build pass does not mean installer QA has passed.

## Build on macOS

No public production DMG is validated for this RC. Local builds require a Mac, Xcode Command Line Tools, Rust and Node.js/npm:

```sh
xcode-select --install
rustup update stable
npm ci
npm run tauri dev
npm run tauri build -- --bundles dmg
```

The native target is `aarch64-apple-darwin` on Apple Silicon or `x86_64-apple-darwin` on Intel. Building another target requires adding it through rustup first. Cross-architecture and universal builds are not validated release artifacts here. Signing, notarization, Keychain behavior and native interactions still need a real Mac.

An unsigned local build can be blocked by Gatekeeper. Use only trusted source code and normal macOS approval controls; do not disable Gatekeeper globally.
