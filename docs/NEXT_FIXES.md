# Продолжить завтра

Текущий этап: перенос UI-настроек в SQLite app_settings.

Codex уже сделал:
- app_settings под ключом ui.settings.v1;
- get_ui_settings / update_ui_settings;
- uiSettingsService;
- мигратор legacy localStorage;
- тема, zoom, ширины панелей, sidebar collapsed, RAG sources panel, последний раздел и язык переведены на SQLite;
- Rust checks прошли: cargo fmt/check/test/clippy;
- npm run typecheck прошёл.

Завтра нужно локально проверить:
1. npm run test
2. npm run build
3. npm run tauri dev
4. npm run tauri build

Ручной smoke-test:
- тема сохраняется после перезапуска;
- zoom сохраняется после перезапуска;
- ширины панелей сохраняются;
- состояние сайдбара сохраняется;
- панель источников в RAG-чате сохраняет состояние;
- последний раздел сохраняется;
- заметки/закрепление/изображения не сломались;
- приложение закрывается через X.
