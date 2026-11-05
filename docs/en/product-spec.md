# Product specification

[Documentation](README.md) · [Russian source](../specifications/product-spec.md)

This is an English rendering of the working product specification, version 1.0, dated 14 June 2026. It records requirements, not a claim that every item is implemented or validated in the current RC. Later explicit product decisions can supersede it. For implemented behavior and limitations, use the [user guide](user-guide.md) and [README](../../README.md). The Russian source remains authoritative if this translation is ambiguous.

## 1. Sources of truth

The only current design and UX source is the approved [HTML reference](../reference/NoteFlow_готовый_макет.html). Earlier layouts, images, collages and HTML variants must not guide implementation. This specification governs functionality, architecture, security, performance and platforms. The HTML reference takes priority for screen composition, placement, style and interaction.

## 2. Purpose

NoteFlow is a local desktop application for storing, editing, searching and organizing notes. It should be fast, smooth, minimal, Russian by default, and usable without mandatory registration. Users write with Markdown, organize with tags/projects, search, and optionally use AI for a note or retrieval-augmented chat across their notes.

## 3. Platforms

Target Windows 10/11 x64 and macOS 12+, including Apple Silicon and Intel where dependencies retain support. Functionality should be equivalent across Windows and macOS. Shortcuts must use Ctrl on Windows and Command on macOS where appropriate. These are platform requirements; actual release validation is tracked separately.

## 4. Technology

Use Tauri 2, Rust, React, strict TypeScript, Vite, TipTap/ProseMirror, SQLite, SQLite FTS5, a local vector index and an OpenAI-compatible provider layer. Do not replace Tauri with Electron, replace React, introduce a heavy UI framework that breaks the design, or store API keys in localStorage, source code or Git without approval.

## 5. Principles

Local-first; responsive and smooth; offline except external AI; no mandatory account; a local user profile; automatic saving; data export; light/dark/system themes; Russian by default with an English option; one coherent design derived from the approved reference.

## 6. Local profile

First-run profile requirements include a name, initials/avatar, local workspace name, data location, interface language and theme. The profile control represents local management, not authentication: name/avatar editing, viewing the database location, export/backup and workspace changes. A PIN lock is a possible future feature only if separately approved.

## 7. Main sections

### All notes

Show active notes, creation, note/tag search, selection/editing, tags, note chat, focus mode and Markdown formatting.

### Projects

Group notes by work area. The project model/design includes a name, description, related notes, tasks, tags, created/updated dates, status and archive state.

### Knowledge chat

Ask about the entire database or a selected scope, including project/tag requirements. Answers should include sources, excerpts, navigation to source notes and follow-up questions.

### Tags

Create, rename, recolor, delete and merge tags; search them; show note counts; open related notes; support bulk assignment/removal where implemented. Deleting a tag must not delete notes.

### Archive

Keep inactive material without deleting it. Show/search archived notes, restore them, require confirmation for permanent deletion, and support project/tag filtering.

### Settings

Required sections: General, Appearance, AI models, Data and export, Keyboard shortcuts and About. Theme selection belongs only in Appearance.

## 8. Layout

The workspace has the main left sidebar, adjustable note list and editor, with an optional right-hand note chat.

- Main sidebar: NoteFlow brand, collapse control, New note, navigation and local profile. Support expanded, compact and focus-hidden states; remember the user’s width.
- Note list: integrated note/tag search, current-list title/count and note items. It can resize or hide without covering the editor.
- Editor: project/breadcrumb context, save status, note-chat and focus controls, note menu, formatting toolbar, title, tags, document body and status footer.
- Right chat: opens beside the editor, reducing editor space instead of covering text. It closes and resizes, with width remembered.

The current corrective design retains a single toolbar above the editor and a right-only chat. Some high-zoom layouts require a larger minimum window width; supported geometry is validated separately.

## 9. Creating a note

New note opens a title/date form. After creation, the note appears in the list, the editor opens, focus goes to the title/body, automatic saving reports Saved, and the date appears in the note’s metadata. Use Ctrl+N on Windows or Command+N on macOS.

## 10. Markdown

Pasted Markdown must become readable WYSIWYG automatically. Required constructs include headings, bold, italic, supported underline, strikethrough, bullet/ordered/task lists, quotes, links, images, tables, inline/fenced code, horizontal rules, callouts and collapsible blocks.

Unsupported constructs must not silently destroy content. Internally, a structured editor document may be used, but Markdown import/export and semantic preservation remain required. Users should not need a separate recognition action for ordinary Markdown paste. See the current [Markdown guide](markdown.md) for extensions and actual export limitations.

## 11. Formatting toolbar

Place one toolbar above the note editor, never as a separate global navigation strip. At standard supported widths, tools stay on one row without horizontal scrolling. Tooltips explain controls; active/hover indicators belong to the individual tool; focus mode retains formatting.

The design’s tool inventory includes undo/redo; H1–H3 and paragraph; bold, italic, underline, strike and inline code; highlight/text color; super/subscript; bullet/ordered/task lists; quote/code/callout/collapsible blocks; tables/dividers/alignment; links/images/attachments/mentions/dates/formulas; clear formatting and AI. This inventory is not a claim that every historical tool is present in the current UI: for example, legacy formula content remains compatible while its creation tool is not currently offered.

## 12. Focus mode

Hide the main sidebar, note list, note chat and secondary interface elements. Keep the editor, title, document, formatting toolbar and a discreet exit control. Escape exits focus mode. Text formatting remains usable throughout.

## 13. Search, filters and sorting

Search belongs in the note list, not a separate global search modal. Requirements cover note title/body, tags, projects, dates and optionally archive state. Filter requirements include tags, project, date, favorite/archive state, tasks/attachments, creation and modification dates. Sorting requirements include newest/oldest, title, modified date, note date and project. The current guide must distinguish implemented controls from this broader requirement inventory.

## 14. AI behavior

### Current-note chat

Open from Note chat. Context can include the current note, selected excerpt, metadata, tags and project. Example actions: summarize, extract tasks, correct or formalize writing, shorten/expand/continue, explain, find contradictions, suggest structure and identify decisions.

AI output must not replace note text automatically. Let the user insert, replace selection, insert below, copy or cancel. Validate the selection before applying a result.

### Knowledge chat

Requirements include questions across all notes, a project/tag, selected notes or a time period. Answers should include source note names, excerpts, navigation, note dates and relevance where available. Preserve sources rather than inventing evidence.

## 15. AI connections

Support compatible local and public APIs: OpenAI-compatible services, Ollama, LM Studio and custom endpoints. Connection settings include a local name, provider type, base URL, secure API key, chat and embedding models, model-list/generation/embedding paths, timeout, context size, temperature, streaming, extra nonsecret headers, connection testing, discovery and status.

Store secrets using Windows Credential Manager or macOS Keychain. Never put keys in source, Git or localStorage. Generative and embedding configuration are separate in the current implementation.

## 16. Retrieval-augmented generation

1. A note is created or changed.
2. Its text is converted to an indexable representation and split into semantic chunks.
3. Embeddings and chunks are stored in the local index.
4. A user question triggers hybrid search.
5. Relevant excerpts are passed to the model.
6. The user sees an answer and sources.

Hybrid retrieval combines full-text search, vectors and filters, with reranking only if implemented. The current RC has no separate reranker. Indexing must respect external-processing consent.

## 17. Data model

The conceptual entity inventory includes UserProfile, Workspace, Note, NoteVersion, Tag, NoteTag, Project, ProjectNote, Task, Attachment, AiProvider, AiChat, AiMessage, RagChunk, Setting and ExportJob. These names describe the specification, not necessarily one table per entity.

| Entity | Required conceptual fields |
| --- | --- |
| Note | id, title, content_json, content_markdown, plain_text, note_date, created_at, updated_at, archived_at, project_id, is_favorite, metadata |
| Tag | id, name, color, created_at, updated_at |
| Project | id, title, description, status, created_at, updated_at, archived_at |
| AiProvider | id, name, type, base_url, api_key_ref, chat_model, embedding_model, models_endpoint, chat_endpoint, embeddings_endpoint, timeout_ms, context_size, temperature, streaming_enabled, extra_headers_json, created_at, updated_at |

Later persistence hardening adds authoritative content versions, sidecars and explicit transaction boundaries. Do not remove these because they were absent from the original field list.

## 18. Local storage

Keep the database, attachments, search/vector indexes, settings, profile and backups local. The original specification proposed NoteFlow-named application data directories. Current code resolves Tauri app data using `com.noteflow.desktop`; see [Data and backups](data-backups.md) for the actual locations. Do not hardcode the proposed paths into new code.

## 19. Import, export and backups

The original format inventory includes single-note Markdown/TXT/HTML/PDF/DOCX; project ZIP, Markdown folder and JSON; and full-base ZIP/JSON/SQLite backup/Markdown folders with attachments, tags, projects, tasks and nonsecret settings. Import requirements include Markdown, TXT, NoteFlow JSON and ZIP backups. These are requirements, not a list of all current commands.

Current user-facing export is MD/TXT/DOCX/PDF, project ZIP and profile backup/restore. Export belongs in the relevant note/project flow and Data and export settings. API keys must never be included. Do not present unsupported formats as available.

## 20. Themes and language

Support light, dark and system themes, configured only under Settings → Appearance. Russian is the default; English is selectable through full bilingual resources and live switching. User content, stored history, models and identifiers are not translated by changing interface language.

## 21. Performance

Target warm startup under 2 seconds, normal-note opening under 150 ms, responsive typing, search under 300 ms on 10,000 notes, navigation under 200 ms and note-chat opening under 250 ms before generation. These are targets, not unmeasured claims.

Do not rerender the whole interface for each keystroke. Isolate the editor from unnecessary React renders; run heavy work asynchronously and indexing in the background; do not block UI for RAG or embeddings. Autosave must not block interaction.

## 22. Security

No plaintext API-key storage. Do not transmit the local database without user action. Warn before external LLM processing; keep truly local endpoints local. Exclude secrets from exports/logs. Network operations must be transparent and configurable.

## 23. Offline operation

Launch, viewing/editing, search, tags, projects, archive, local export and locally available model requests must work without internet. Public APIs, unsaved remote images and any future update checks require connectivity.

## 24. MVP acceptance

Acceptance requires validated Windows/macOS launch; the approved UI and six sections; title/date creation; editing and WYSIWYG Markdown paste; core formatting; title/text/tag search; tag/project management; archive/restore; themes; focus mode with toolbar; adjustable panels; non-overlapping right chat; AI connections and knowledge chat with sources; note/full-base export; secure keys; and fast, stable everyday use. An automated Windows build alone does not satisfy the cross-platform criterion.

## 25. Development stages

1. UI scaffold: reference-to-React layout, sections, themes, panels and states; initially no SQLite, TipTap, LLM or RAG.
2. Local database: migrations, notes, tags, projects, archive, profile and settings.
3. Editor: TipTap, toolbar, Markdown paste/WYSIWYG/export, tables, tasks, images and code.
4. Search/tags: FTS5, filters, sorting and tag management.
5. AI connections: compatible providers, secure keys, tests and streaming.
6. Current-note chat: adjustable right panel, note context, actions and insertion.
7. Knowledge RAG: chunks, embeddings, hybrid search and sourced answers.
8. Import/export: supported portable formats, backups and restore.
9. Release: Windows installers, macOS packaging, signing, notarization and platform tests.

This is the original stage plan, not the current worktree status.

## 26. Development rules and checks

Read the specification and approved reference before work. Keep scope small, propose a plan for large changes, avoid unrequested features/redesigns and never store secrets in code. Report changed files, checks and limitations.

Run current frontend typecheck, tests and build; the original lint requirement remains a tooling gap because no lint script exists. Run Rust fmt check, clippy with warnings denied and tests when relevant. See [Development](development.md) for actual commands. Never label an unrun command as passed.

## 27. Outside the first version

Without separate approval: cloud sync, mobile, collaboration, a web version, paid subscriptions, extension marketplace, speech recognition, OCR, a full calendar, a Telegram bot and server authentication are outside MVP scope.

## 28. Summary

A fast, local Windows/macOS notes app with the approved minimal UI; Markdown paste and WYSIWYG editing; one editor toolbar; tags/projects/search/archive/focus mode/export; a local profile without registration; compatible local/external AI; note chat and sourced knowledge chat; secure credentials; and responsive interaction.
