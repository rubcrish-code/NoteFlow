# Architecture

[Documentation](README.md)

```text
React feature UI
  -> typed TypeScript services
  -> Tauri IPC commands
  -> Rust application modules
  -> SQLite / managed files / OS credential storage
```

## Frontend

- `src/app/AppShell.tsx` coordinates navigation, workspace state, pending saves, panel geometry and settings persistence.
- `src/features/` contains notes, editor, projects, archive, tags, settings, AI chat and export surfaces. Secondary pages use existing lazy feature boundaries.
- TipTap/ProseMirror owns the editor document and selection. Search/source decorations are not content changes and must not trigger autosave.
- `src/services/` defines typed IPC adapters. `safeInvoke.ts` exposes sanitized public errors rather than raw SQL, stack traces or paths.
- Shared UI, geometry, accessibility and localization helpers live under `src/shared/`. Design tokens and styles remain under `src/styles/`.

## Persistence

Rust `data.rs` owns schema migrations and primary SQLite operations. Content saves update the note, editor sidecars, revisions and revision sidecars within a SQLite transaction. `notes.content_version` provides optimistic concurrency: a stale save cannot overwrite a newer authoritative document.

Frontend save coordination flushes or blocks conflicting work before restore, navigation and destructive operations. External replacement increments an explicit editor reload generation; an ordinary autosave must not remount the editor or discard selection.

Assets live in managed filesystem storage with reference-aware cleanup. SQL transactions do not provide cross-resource filesystem atomicity. Backup restore uses staged file work and a database transaction; failure and recovery paths must remain explicit.

## Search and AI

SQLite FTS5 supplies lexical search. Knowledge chunking and embedding profiles provide derived semantic data; retrieval combines lexical and semantic results. RAG stores chat messages and source snapshots, and can generate grounded answers through the provider layer.

Application-owned background jobs retain streaming state while views detach. Provider adapters manage endpoint differences, bounded requests, privacy state and secure credential references. API keys are not sent to the frontend as saved values.

## Localization

The existing `uiMessages` boundary is extended by typed Russian/English catalogs and a small external language store. React subscribes through `useSyncExternalStore`; language is persisted with existing UI settings. There is no document rewrite, window reload or locale-driven editor key. See [Localization](localization.md).

## Platform boundaries

Tauri supplies windowing, dialogs and native integration. Windows uses Credential Manager; macOS has Keychain-specific code. Windows validation does not prove macOS native readiness. Paths and app data are resolved through platform APIs, not hardcoded user directories.
