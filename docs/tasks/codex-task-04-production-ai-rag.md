# NoteFlow — 04. Реальные LLM, безопасные ключи, ИИ-чат и RAG

Начинать после production data layer. Git commit не выполнять.

## Цель
Подключить Ollama, LM Studio, OpenAI-compatible/custom API; безопасные ключи; ИИ по заметке; RAG по базе; инструкцию пользователя.

## Провайдеры
Поля: name, type, Base URL, API key, chat model, embedding model, models endpoint, chat endpoint, embeddings endpoint, timeout, context size, temperature, streaming, custom headers.

## Безопасность
API-ключи хранить только в Windows Credential Manager / macOS Keychain. Не хранить в localStorage, SQLite открыто, Git, логах, export/backup. В SQLite только `api_key_ref`.

## Проверка подключения
test connection, list models, test chat, test embeddings, ошибки 401/403/404/timeout/invalid URL/API mismatch.

## ИИ по текущей заметке
Streaming, контекст заметки/выделения, действия: исправить, сократить, расширить, официально, резюме, задачи, продолжить, объяснить. Вставка/замена только по подтверждению пользователя.

## Toolbar AI
Если модель не подключена — popover и переход в настройки. Если подключена — действия над выделением/заметкой и отмена генерации.

## RAG
Chunking, embeddings, локальный индекс, переиндексация, очередь, FTS5 + vector, reranking, фильтры по проекту/тегу/дате/архиву, источники, не отправлять всю базу в LLM.

## ИИ-чат по базе
История диалогов, сохранение сообщений, источники ответа, переход к заметке, used chunks, streaming, cancel, понятные ошибки.

## Privacy UX
Перед первым публичным LLM-запросом предупреждать, что данные уйдут внешнему провайдеру. Для локального endpoint объяснить, что данные остаются на устройстве.

## Документация
Создать `docs/user-guide/AI-models-connection-guide.md`: Ollama, LM Studio, OpenAI-compatible, поля, ошибки, privacy, embeddings.

## Tests / checks
Mock server, streaming, list models, 401/timeout, secure key ref, RAG retrieval, sources, privacy warning.
`npm run typecheck && npm run test && npm run build && npm run tauri dev`
Rust fmt/clippy/test.

Git commit не выполнять.
