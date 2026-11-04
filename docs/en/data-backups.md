# Data storage and backups

[Documentation](README.md)

## Local storage

The canonical app identifier is `com.noteflow.desktop`. Tauri resolves the profile’s data directory; Windows commonly uses `%APPDATA%\com.noteflow.desktop`, while macOS uses its Application Support directory. The exact location is shown by the app. QA builds must use a distinct identifier.

SQLite stores notes, metadata, projects, tags, relations, revisions, sidecars, settings and chat records. Managed files store attachments and images. API secrets belong to OS credential storage, not ordinary database settings.

Timestamps and content versions are storage contracts. Interface language changes affect display only. Do not edit a live database with ad hoc scripts or copy only selected files while the app is running and assume that copy is consistent.

## Backups

Use **Settings → Data and export → Create backup** and choose a destination outside the working profile. The current backup format includes notes, Markdown, editor sidecars, tags, projects, revisions, managed attachment metadata/files, nonsecret settings and note/knowledge AI chat history with saved sources.

API keys and OS credential-store contents are excluded. Search indexes, knowledge chunks and vectors are derived data; they are not a required source of truth in the backup. Reconciliation after restore must not silently start cloud embedding requests without consent.

## Restore

1. Create an external copy of the current profile first.
2. Choose a NoteFlow backup and review the preview/counts.
3. Read the replacement warning and confirm only if you intend to restore that profile state.
4. Wait for completion. Inspect knowledge/index status and reconnect credentials if needed.

Restore is not a merge-import of arbitrary profile data. Older backups that never included AI history must not erase existing chats simply because their format lacks those fields. Historic sources can remain readable even if their live source note is missing.

The implementation validates the archive before mutation, stages managed files outside the live store, and applies SQLite restore transactionally. Filesystem and SQLite do not share a native transaction: retain rollback/recovery paths and do not claim stronger crash guarantees than the implementation provides.

## Deletion and recovery

Archive is reversible; deletion is not. Deleting a project deletes its notes and database relations atomically. Reference-aware asset cleanup must retain physical files still used elsewhere. Saved historical source snapshots are not active retrieval entries.

If saving fails, keep the application open and retry. If recovery is needed, preserve the current profile before experimenting. A Markdown file or project ZIP is not a substitute for a full profile backup.
