# NoteFlow 1.0.0-rc.1

Closed-testing Windows Release Candidate. **Recommended:** NSIS setup. **Optional:** MSI (en-US or ru-RU). The two installer families are not yet validated as interchangeable; use one family per QA profile.

The app identifies itself as `1.0.0-rc.1`. Windows Installer requires a numeric MSI `ProductVersion`, so the MSI packages use `0.99.1` for upgrade ordering; their filenames retain the RC app version.

## What is available

- Markdown-first notes with rich editing, projects, tags, archive and search.
- Images, attachments and external backups.
- Local and OpenAI-compatible AI providers, note AI actions and note chat.
- Semantic search, grounded RAG with sources and Global Knowledge Agent.
- Windows first-run and Markdown import, with security and error-handling hardening.

## Known limitations

- This RC is **unsigned**. Windows SmartScreen may warn; do not disable Windows security controls. Authenticode signing remains required before public v1.
- Clean install, upgrade, reinstall, uninstall and cross-family MSI/NSIS behaviour are **DEFERRED TO SECOND-PC RC SMOKE**, not passed. Preserve real user profiles until tested.
- There is no automatic updater. macOS has not reached RC validation.
- AI response streaming is not implemented; reranking is not used.

SHA-256 hashes are supplied alongside the Windows artifacts. Report Windows build, installer family, exact steps and non-sensitive evidence for any issue.
