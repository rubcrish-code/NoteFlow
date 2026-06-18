# NoteFlow — production-план

Текущая версия — сильная preview-сборка UI/редактора. Для production нужно закрыть 4 этапа:

1. `codex-task-02g-zoom-maximized-window.md`
   - Ctrl+Wheel масштаб;
   - Ctrl+0/+/-;
   - запуск развёрнутым окном.

2. `codex-task-03-production-data-sqlite.md`
   - SQLite;
   - реальное автосохранение;
   - проекты, теги, архив;
   - вложения;
   - импорт/экспорт;
   - backup.

3. `codex-task-04-production-ai-rag.md`
   - Ollama;
   - LM Studio;
   - OpenAI-compatible;
   - secure keys;
   - ИИ по заметке;
   - RAG по базе;
   - инструкция пользователя.

4. `codex-task-05-release-hardening.md`
   - убрать mock;
   - audit;
   - code splitting;
   - документация;
   - финальная сборка и проверка установщика.
