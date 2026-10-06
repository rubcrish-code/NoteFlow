# NoteFlow 1.0.0-rc.3

Windows x64 **prerelease**, not final 1.0.0. Recommended download: **NoteFlow_1.0.0-rc.3_x64-setup.exe** (NSIS, current user). The en-US and ru-RU MSI packages are optional per-machine alternatives. Verify downloads against `SHA256SUMS.txt`.

## Highlights

- Product polish across Notes, Projects, ordered Tags and Archive, including clearer project chips and consistent date formatting.
- Automatic knowledge indexing after autosave, with coalesced updates and retry/restart recovery. RAG can use the whole base, selected projects, standalone notes or mixed scopes, with grounded sources and citations.
- Editor correctness fixes for autosave selection, mixed lists/checklists, internal links and context-menu ordering.
- Image crop/drawing improvements, safe shared originals, object movement without duplicates, and a unified Russian calendar.
- MD/TXT/DOCX/PDF note export, portable project ZIP export, live outline and internal heading navigation.
- Safe bulk note deletion with two explicit confirmations, index/history cleanup and backup/restore support. Back up valuable data before destructive actions.

## Security

- Editor dependencies updated to **TipTap 3.30.5**, **prosemirror-model 1.25.12** and **prosemirror-view 1.42.6**, with paste/link regression coverage.
- Release gate requires a fresh online production npm audit with **0 vulnerabilities**. This is a point-in-time dependency check, not a guarantee against every possible vulnerability.
- API keys remain in OS credential storage and are excluded from backup. Public release assets contain no user profile or credentials.

## Reliability

- Atomic Markdown/sidecar persistence and optimistic concurrency protect against stale autosaves and restored-document overwrites.
- Transactional destructive operations and stale-job guards prevent deleted notes from returning to active search/index results.
- Staged, validated backup restore preserves AI/RAG history and sources; managed resources are checked before applying a restore.
- Final user smoke passed for export/PDF, editor security/correctness, local and OpenAI-compatible models, bulk deletion/restart/restore, second-PC installer lifecycle and NSIS/MSI coexistence. Exact Windows versions outside the recorded environment are not claimed as validated.

The app and About report **1.0.0-rc.3**. Both MSI locales use **ProductVersion 0.99.3**, after rc.2 (0.99.2) and before final 1.0.0. Product identifier and MSI UpgradeCode are unchanged.

## Known Limitations

- Windows binaries are currently **unsigned / no Authenticode**. Windows may show SmartScreen or unknown-publisher warnings. Do not disable security protections blindly; verify the source and checksums.
- **macOS is not included and is not production validated.** Windows 10 has not been separately validated in the recorded QA; do not infer universal platform coverage from the second-PC smoke.
- No automatic updater, AI response streaming or separate retrieval reranker. This release remains a Release Candidate.
- Standalone EXE is a local QA artifact, not a normal user download. Use an installer for routine use and retain backups before upgrades.
