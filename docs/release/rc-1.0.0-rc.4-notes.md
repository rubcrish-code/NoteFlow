# NoteFlow 1.0.0-rc.4

Windows x64 **prerelease**, not final 1.0.0. Recommended download: **NoteFlow_1.0.0-rc.4_x64-setup.exe**. Final RC4 functional smoke has been accepted by the user; newly built installer lifecycle testing is a separate check.

## What's New

This release improves everyday editing, copying files and images, and continuing AI conversations without losing a draft or interrupting an answer when changing screens.

## Editor & Clipboard

- Fixed text paste through Ctrl+V and the editor's context menu, including supported rich text and Markdown.
- Paste copied files from Windows Explorer directly at the cursor. Mixed selections of images and documents are inserted as one batch, with undo/redo.
- Paste supported image data from browsers, screenshot tools and other compatible applications. Clipboard format support depends on the source application; unsupported formats are not fabricated.
- Pasted HTML does not automatically download external images.

## Files & Images

- Native drag & drop imports images and documents into the current note using NoteFlow's managed storage. Moving or deleting the original file does not remove the imported copy.
- Copy the current image, including applied crop/drawing edits, to the system clipboard, or save it through the system Save As dialog.
- Image menu: Draw, Image description, Reset changes, Copy, Save, then Delete image. In the Russian interface the shortened labels are **Копировать** and **Сохранить…**.

## AI Chat Improvements

- Unsent drafts remain available when closing the note chat panel, switching notes or navigating away from the knowledge-base chat. Drafts stay isolated between chats.
- Answers stream as the model generates them, when supported by the provider. Closing the sidebar or changing sections does not stop an active chat request.
- An explicit Stop action cancels the active request. Guards prevent duplicate answers and late results from restoring deleted chats.

## AI Integration

- Real OpenAI-compatible and Ollama checks covered chat, streaming, embeddings, scoped retrieval and grounded sources/citations using synthetic test notes.
- Requests keep their original note and search scope even when the visible screen changes. No simulated model response or hardcoded model catalog was added.

## Stability & Data Integrity

- Fixed a Markdown serialization defect where overlapping bold/underline formatting could introduce extra `****` or damage text after save/reload.
- Repeated Markdown/sidecar/SQLite roundtrips and stale-autosave checks protect the canonical document without changing its storage format.
- Clipboard imports reuse existing asset validation, backup/restore and reference-aware cleanup rather than a separate file store.

## Security

- API keys remain in OS credential storage and are not included in backups or release assets.
- Clipboard files and images are size/type/path validated; external image URLs are not fetched automatically by HTML paste.
- Publication requires a fresh online production dependency audit with **0 vulnerabilities**. This is a point-in-time check, not a universal security guarantee.

## Known Limitations

- Windows installers and binaries are **unsigned / no Authenticode**; SmartScreen or unknown-publisher warnings are possible. Verify the source and checksums; do not disable Windows security protections.
- **macOS production builds are not validated or included. Windows 10 has not been separately validated** in the recorded release QA.
- AI drafts are **session-only**: unsent text is retained during the current application run, not after closing the application. Saved chat history remains persistent.
- No automatic updater or separate retrieval reranker. Streaming and clipboard formats depend on provider/source-application support.
- New rc.4 packages have build and metadata checks; a separate clean-install/upgrade/uninstall QA matrix has not been completed. Previous-RC installer smoke does not certify every rebuilt package.

## Installation

Back up important notes before upgrading. Use **NoteFlow_1.0.0-rc.4_x64-setup.exe** (NSIS, current-user installation) for normal use. **NoteFlow_1.0.0-rc.4_x64_ru-RU.msi** and **NoteFlow_1.0.0-rc.4_x64_en-US.msi** are optional per-machine alternatives; normally choose one installer type.

The application and dynamic About version are **1.0.0-rc.4**. MSI ProductVersion is **0.99.4**, ordered after rc.3 (0.99.3) and before final 1.0.0. Product identifier and the existing MSI UpgradeCode remain unchanged. Standalone/debug executables and QA profiles are not public downloads.

## Checksums

Download **SHA256SUMS.txt** with the installer. Compute its SHA-256 with `Get-FileHash -Algorithm SHA256` in PowerShell and compare the result with the entry for that exact filename. The manifest contains the three installers in this release, not files from an earlier RC.
