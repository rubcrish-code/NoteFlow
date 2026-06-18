# Текущее состояние NoteFlow

Этап: 03 — SQLite и реальное локальное хранение
Ветка: wip/sqlite-data-layer

## Что реализовано

- Локальный SQLite backend в Tauri.
- Миграции.
- Seed без повторной перезаписи.
- Managed storage для вложений.
- Реальные CRUD-операции заметок, проектов, тегов и архива.
- Autosave с debounce.
- Flush перед закрытием и переходами.
- Экспорт Markdown.
- Экспорт ZIP.
- Backup ZIP.
- Import backup через file picker.
- SQL находится только в Rust.
- Frontend работает через типизированный dataService.

## Основные файлы

- src-tauri/src/data.rs
- src-tauri/src/lib.rs
- src/services/dataService.ts
- src/app/AppShell.tsx
- src/app/types.ts
- src/features/editor/BlockInsertMenu.tsx
- src/features/settings/SettingsPage.tsx
- tests/dataLayerContract.test.ts

## Проверки, которые успел пройти Codex

- npm run typecheck — успешно.
- cargo fmt --check — успешно.
- cargo check — проходил до финальной маленькой правки.

## Что нужно проверить завтра локально

1. npm run typecheck
2. npm run test
3. npm run build
4. cargo fmt --check
5. cargo check
6. cargo test
7. cargo clippy --all-targets --all-features -- -D warnings
8. npm run tauri dev
9. npm run tauri build

## Ручная проверка завтра

- создать заметку;
- вставить Markdown;
- отформатировать текст;
- добавить тег;
- создать проект;
- переместить заметку в проект;
- добавить файл или изображение;
- закрыть приложение;
- открыть снова;
- убедиться, что всё сохранилось;
- проверить экспорт Markdown;
- проверить backup ZIP;
- проверить import backup;
- проверить архив и восстановление.

## Ограничения

- AI/RAG пока демонстрационные.
- UI-настройки вроде темы, масштаба и ширины панелей пока частично остаются в localStorage.
- Следующий маленький этап после проверки SQLite: перенести UI-настройки в app_settings.
