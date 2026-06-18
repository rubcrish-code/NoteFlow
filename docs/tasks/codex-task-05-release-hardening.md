# NoteFlow — 05. Release hardening и production-сборка

Начинать после data layer и AI/RAG. Git commit не выполнять.

## Production-ready критерии
Данные сохраняются; backup/export есть; ключи безопасны; AI и RAG реальные; нет mock в основных сценариях; тесты проходят; Windows build проходит; macOS подготовлен; нет критичных production audit issues; есть документация.

## Убрать mock
Заметки, проекты, теги, архив, вложения, настройки моделей, ИИ-чаты, RAG-источники. Demo mock только отдельно от production.

## Performance
Исправить Vite chunk warning: code splitting, lazy load AI/RAG/editor-heavy parts, проверить старт и плавность.

## Security
Нет ключей в логах/SQLite/export; safe files; no path traversal; URL validation.

## Audit
`npm audit`
`npm audit --omit=dev`
Не запускать `npm audit fix --force` без анализа.

## Installer / version
Подготовить production version, например `0.2.0`.
Проверить productName, identifier, icons, NSIS/MSI, app data path, upgrade from preview, uninstall, Start Menu/Desktop shortcuts.

## Docs
README, user guide, AI connection guide, release notes, known limitations, backup/restore.

## macOS
Bundle config, icon, data dir, Keychain, build instructions. Для публичного выпуска нужны Apple Developer certificate и notarization.

## Final checks
`npm run typecheck`
`npm run test`
`npm run build`
`npm run tauri build`
`npm audit --omit=dev`
Rust fmt/clippy/test.
Manual: clean install, update, uninstall, create/edit/save/restart, import/export, AI, RAG, backup/restore, themes, zoom, maximized startup.

Git commit не выполнять.
