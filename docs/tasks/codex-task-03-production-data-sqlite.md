# NoteFlow — 03. Production data layer: SQLite, файлы, импорт/экспорт

Перед началом прочитать `AGENTS.md`, актуальный HTML-макет, `product-spec.md`, текущий TipTap/Markdown.
Git commit не выполнять.

## Цель
Сделать реальное локальное хранение. После перезапуска должны сохраняться заметки, проекты, теги, вложения, настройки, форматирование.

## Архитектура
React UI → TypeScript data services → Tauri invoke → Rust commands → Rust services/repositories → SQLite + managed file storage.
SQL не писать в React. Пользовательские данные не хранить в localStorage.

## SQLite
Создать БД в директории данных приложения. Миграции версионированные. Тесты на временной БД.
Таблицы: `notes`, `projects`, `tags`, `note_tags`, `attachments`, `app_settings`, `note_revisions`, `ai_chats`, `ai_messages`.

## Notes
Поля: id, title, note_date, content_json, content_markdown, content_html, plain_text, project_id, is_favorite, created_at, updated_at, archived_at, deleted_at.
Реализовать CRUD, дублирование, избранное, проект, архив, восстановление, окончательное удаление, автосохранение.

## Autosave
Debounce, `Сохранение…`, `Сохранено`, `Ошибка сохранения`, flush перед переключением заметки и перед закрытием окна.

## Projects / Tags
Реальное создание, редактирование, цвета, назначение, объединение тегов, фильтры, удаление без потери заметок.

## Attachments
Файлы хранить в managed storage:
`database.sqlite`, `attachments/`, `images/`, `exports/`, `backups/`, `cache/`.
Выбор через системный диалог, копирование, относительные пути, защита от path traversal, метаданные в SQLite, открытие системной программой.

## Import / Export
Минимум: Markdown export, заметка с вложениями в ZIP, полный backup ZIP, import backup, экспорт настроек без API-ключей.

## Search
Поиск по title, plain_text, тегам, проектам. Желательно SQLite FTS5 и индексы.

## Tests
Миграции, notes/projects/tags CRUD, attachments, autosave, export/import, fallback из Markdown, отсутствие повторного seed, сохранение после перезапуска.

## Проверки
`npm run typecheck`
`npm run test`
`npm run build`
`npm run tauri dev`
`cd src-tauri && cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test`

Git commit не выполнять.
