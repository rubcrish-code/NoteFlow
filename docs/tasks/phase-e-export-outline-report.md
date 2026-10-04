# Phase E: export and note outline

Дата проверки: 04.10.2026. Ветка: `feature/rc3-product-polish`.
HEAD до фиксации Phase E: `54152047b1ac894b520c5e739d9a2bc46c8bfa4a`.
Версия приложения: `1.0.0-rc.2`; MSI: `0.99.2`.
ProductName: `NoteFlow`; identifier: `com.noteflow.desktop`.
Отчёт подготовлен перед разрешённым пользователем commit Phase E. Tag, push, release и изменение версии не выполнялись.

Phase E полностью принята пользователем после smoke-test. Следующий этап после фиксации: **RC3 FULL REGRESSION / RELEASE HARDENING**.
Это не утверждение о завершённой проверке разработчиком во всех офисных приложениях или о готовности RC3 к публикации. Ограничения developer QA ниже сохранены отдельно от пользовательской приёмки.

## 1. Предыдущая архитектура экспорта

Markdown экспортировался через `DataStore::export_note_markdown`: canonical Markdown, разрешение managed assets, материализация файлов. Экспорт текущей заметки/проекта в Settings использовал старые ZIP commands с внутренним представлением данных. External backup уже имел отдельный native Save flow и безопасную запись архива.

До изменений изучены текущие Markdown/sidecar load-save, assets/ref ownership, autosave, меню заметки/проекта, backup, Settings и актуальные продуктовые документы. План реализации предоставлен до изменения исходников.

## 2. UX экспорта заметки

`Меню заметки -> Экспортировать` открывает существующий `ModalShell` с четырьмя radio options: Markdown, Текст, Word, PDF. Markdown выбран по умолчанию. Во время операции виден spinner, повторный click и закрытие заблокированы; ошибка не закрывает диалог и позволяет повторить попытку.

Успех: `Заметка сохранена.` с действием `Показать в проводнике`. Отмена native Save не вызывает ошибку и не запускает генерацию/запись. В меню больше нет привязки действия только к Markdown.

## 3. Переиспользование Markdown export

Существующий portable Markdown pipeline вынесен в общий `document_export` helper и используется старым Markdown command, новым экспортом заметки по выбранному пути и новым portable ZIP проекта. Второй Markdown serializer не создан.

Источник: `notes.content_markdown`. В portable output managed URI заменяются относительными ссылками; служебный JSON и sidecar не добавляются. Существующая политика Markdown для callout/details сохранена.

## 4. TXT generator

`exportDocument.ts` преобразует восстановленный canonical editor document в читаемый UTF-8: название, заголовки, абзацы, списки, `[ ]`/`[x]`, цитаты, summary/body details, callout, строки таблиц, текст ссылки с URL. Изображения/файлы представлены читаемыми placeholders. Markdown markers и HTML cache не используются как текстовый источник.

## 5. DOCX: решение и перенос содержимого

Использован `docx` 9.8.1: настоящий OOXML ZIP, не HTML с другим расширением. Генерация offline в module worker. Microsoft Word/LibreOffice не являются runtime dependencies.

Переносятся title, H1-H3, абзацы, bold/italic/underline/strike, sup/sub, списки, независимая нумерация с исходным start, чек-листы, ссылки, таблицы, изображения, divider, readable callout/details. Цвет текста, highlight, paragraph indent/alignment и table background/thick borders переносятся из восстановленного sidecar оформления. Header semantics таблиц не превращены в полноценную отдельную Word design system.

## 6. PDF: решение и перенос содержимого

Использован `pdfmake` 0.2.23. A4, поля 48 pt, selectable document text, пагинация, номера страниц, заголовки, форматирование, списки, таблицы, встроенные изображения, безопасные внешние ссылки и readable callout/details. Это не скриншот заметки.

Генератор и шрифтовой VFS lazy-loaded внутри worker. Финальный native PDF rich fixture содержит 4 страницы. Hard breaks сохранены. Чек-листы используют ASCII `[ ]`/`[x]`, чтобы не зависеть от отсутствующих в шрифте символов checkbox.

## 7. Кириллица и лицензия шрифта

PDF использует bundled Roboto из pdfmake VFS; установка шрифта на машине не нужна. Проверены русский текст, `ё`, заголовки и extraction настоящего PDF text без OCR. Рендер PDFium визуально проверен.

Фактический шрифт Roboto 3.014 имеет SIL Open Font License 1.1, не Apache. MIT notices библиотек и полный OFL включены в `public/licenses/document-export.txt`, затем в production assets. DOCX содержит Unicode XML; для текста использует обычный office font Arial.

## 8. Изображения и таблицы

Managed изображения/рисунки включаются байтами в DOCX/PDF. PNG/JPEG используются напрямую; другие поддержанные image formats конвертируются worker-ом в PNG. Сохраняются aspect ratio, выравнивание и ограничения размера по странице. В готовом документе нет зависимости от `noteflow-asset://`.

Таблицы сохраняют content, spans, фон ячеек; толстые границы DOCX/PDF чёрные, внешние и внутренние. PDF использует существующий table projection helper, а не второй механизм координат merged cells.

## 9. Native Save workflow и autosave

Все четыре формата и ZIP проекта вызывают Tauri native Save с правильным extension/filter и default filename. Место выбирает пользователь; подтверждение overwrite оставлено системному диалогу.

Общий `exportAfterFlush` сначала ожидает успешный pending save. При ошибке экспорт не запускается; сообщение: `Не удалось сохранить изменения перед экспортом.`. Project export также flush-ит текущую заметку до backend snapshot. RAG/embedding completion не ожидается.

TXT/DOCX/PDF берут `getNote().editorDocument`, восстановленный из canonical Markdown + sidecar, а не stale HTML/JSON cache. Чтение изображений проверяет `contentVersion`. Native rich fixture специально содержит устаревшие cache fields: экспорт переносит canonical content.

## 10. Безопасная запись

Rust: `create_new` временного файла в той же папке, запись, `sync_all`, закрытие, валидация, `rename` на итоговый путь. При ошибке временный файл удаляется; существующий документ не обнуляется. На Windows тест подтверждает replacement после успешной валидации.

Для MD assets сначала создаётся новая уникальная соседняя папка; только потом публикуется MD. Ошибка удаляет лишь папку, созданную данной операцией. Старые успешно созданные asset folders не удаляются автоматически: это преднамеренная защита предыдущего экспортированного MD.

Форматы проверяются: UTF-8 для TXT/MD, PDF header/EOF, CRC/path safety ZIP и обязательные OOXML entries DOCX. Backend validation не заменяет полноценный PDF/OOXML parser; генераторы дополнительно проверены тестами с реальными документами.

## 11. ZIP проекта

`Проекты -> ... -> Экспортировать` создаёт portable ZIP выбранного проекта. Структура: отдельный `.md` на каждую активную заметку и `assets/` с нужными файлами. Имена одинаковых заметок различаются suffix `(2)`, `(3)`.

Не включаются другие проекты, архивированные/удалённые активным UI заметки, backup manifest, SQLite, revisions, chats, models/settings и secrets. Старые backend ZIP commands сохранены для совместимости, но новые UI actions их не используют.

## 12. Assets и границы backend операций

Backend берёт только references, реально присутствующие в Markdown экспортируемых заметок. Общий asset ID копируется в ZIP один раз. Paths разрешаются существующим managed asset layer, а не frontend filesystem APIs.

SQLite snapshot/валидация выполняются с кратковременным store lock; чтение изображений, файловые копии, ZIP compression и запись выполняются через background blocking task вне store mutex. Ownership/GC/attachment URI architecture Phase D/P0 не изменены.

## 13. Filename/path sanitization

Сохранены Unicode/кириллица. Заменяются Windows invalid characters и control characters; удаляются опасные trailing dots/spaces; reserved names `CON/PRN/AUX/NUL/COM1..9/LPT1..9` получают префикс. Имена ограничены 180 UTF-8 bytes с местом для расширения/suffix.

ZIP names collision-safe без зависимости от регистра; entries проверяются на enclosed path. Destination должен быть абсолютным, иметь ожидаемое расширение и существующую папку, не находиться внутри профиля. PathBuf/path APIs используются вместо ручных Windows separators.

## 14. UX оглавления

Небольшая icon button `Оглавление` в header редактора и focus strip. Portal `MenuPopover` показывает H1/H2/H3 с уровнями отступов. Long headings переносятся, popup ограничен viewport. Для пустого документа: `В заметке пока нет заголовков.`. Note metadata title и bold paragraphs не считаются headings.

Оглавление живое: ProseMirror traversal по document-changing transactions, включая same-ID silent restore. Serialized Markdown при каждом React render не сканируется.

## 15. Heading anchors

Implicit deterministic Unicode slug: lowercase, letters/numbers/combining marks, spaces в `-`, удаление punctuation. Повторения получают `-1`, `-2`; empty slug использует `section`. Конфликты с уже занятыми slug также разрешаются.

DOM IDs добавлены через ProseMirror node decorations, не attrs. Navigation не меняет canonical Markdown, cache, sidecar, selection и не запускает autosave. Название/порядок headings определяют slug; переименование либо перестановка одинаковых заголовков может изменить implicit anchor, как у Markdown renderers. Совпадение со всеми сторонними Markdown slug implementations не обещается.

## 16. Внутренние ссылки

`#anchor` click обрабатывается внутри редактора: decode, поиск актуального heading, scroll. Unknown/malformed anchor безопасен; UI сообщает `Заголовок по этой ссылке не найден.`. Внешний safe opener/Ctrl-click flow сохранён.

Scroll учитывает reduced motion. Portable MD содержит обычные headings и `(#anchor)` без custom HTML anchors. Word field TOC/PDF outline/bookmarks не добавлялись; heading styles в DOCX доступны для дальнейшего построения оглавления в Word.

## 17. Settings cleanup

Удалены exports текущей Note/Project и соответствующие props/handlers AppShell. Data & Export теперь описывает резервную копию, импорт и восстановление; основной backup action сохранён. Пустые headings/separators от удалённых блоков не оставлены. Full redesign не выполнялся.

## 18. Language UI

Убраны `Язык интерфейса` и обещание будущих языков; subtitle Основных настроек больше не упоминает язык. Приложение и first-run остаются русскоязычными. Внутреннее безопасное поле settings/данные пользователя не удалены; unrelated i18n refactor не делался.

## 19. Backup, Models/RAG и persistence

Backup schema/version/import policy, AI/RAG provider logic, credentials, revision retention, migrations, content version guards и attachment GC не менялись. Derived outline не хранится в БД/backup. Существующие internal links сохраняются как обычное содержимое заметки.

Полный regression включает existing persistence/backup/AI/search/editor tests. Native destructive restore и реальные API calls в Phase E не выполнялись.

## 20. Dependencies, лицензии, bundle

Добавлены production `docx ^9.8.1` (MIT) и `pdfmake ^0.2.23` (MIT), development `@types/pdfmake ^0.2.12`. Lockfile обновлён без version bump. Rust dependencies не добавлены; используются существующие ZIP/UUID/filesystem APIs.

Production audit: 0 vulnerabilities. Общий npm audit также имеет существующие dev/tooling findings (44: 1 low, 39 moderate, 4 high); это не выдаётся за отсутствие всех dependency risks. При установке были transitive deprecation notices `crypto-js`/`jpeg-exif`; широкий dependency upgrade вне scope.

Новые генераторы находятся в отдельных lazy worker chunks: DOCX 392.30 kB, PDF/VFS 2288.00 kB, worker entry 2.92 kB. Они не добавлены в initial React/editor bundle. Main 314.43 kB, React 192.54 kB, editor 478.98 kB. Vite worker format ES и dev optimizeDeps настроены; compiled worker протестирован с production CSP.

## 21. Frontend tests

`npm run typecheck`: PASS.
`npm run test`: **452/452 PASS**, 70 suites, 0 skipped; 17931.0715 ms.
`npm run build`: PASS; повторно frontend build выполнен в финальном Tauri build.

Добавлены 27 tests в `phaseEBehavior.test.ts` и `phaseEExport.test.ts`: real TipTap/JSDOM outline, live/silent reload, empty state, no document/selection/update mutation, internal links, native dialog options/cancel, canonical input, flush gating, duplicate clicks, safe retry/error, TXT, filename, actual OOXML, independent numbered lists, PDF fonts/images/pagination. Три существующих contract tests обновлены для удаления старых Settings controls; они не представлены как доказательство native UX.

Дополнительный browser test исполняет именно compiled production worker с production CSP, а не mock generator; TXT/DOCX/PDF успешно созданы и провалидированы. Генерация изображений проверена с transfer buffers.

## 22. Rust tests и проверки

`cargo fmt --check`: PASS.
`cargo check`: PASS.
`cargo test`: **249 PASS**, 0 failed, 6 ignored; 21.02 s.
`cargo clippy --all-targets --all-features -- -D warnings`: PASS.

Добавлены 6 real filesystem/ZIP fault tests и DataStore integration test: Unicode/collisions, successful validated replacement, invalid PDF rollback, missing asset rollback MD/ZIP, unsafe destination, selected project/active notes/assets. Отдельно успешно выполнен ignored QA fixture seed; он не входит в 249 обычных тестов. Другие ignored maintenance/native/performance fixtures не выдаются за запущенные.

## 23. FTS benchmark

Отдельный FTS test на 10 000 заметок: PASS. Последний чистый запуск: setup 1.2402 ms, schema 1.9372 ms, fixture 4.1281 ms, indexing 13.1332423 s, query 1.1261 ms; total 13.14 s.

Dedicated benchmark выполнялся без одновременно работающих Tauri dev/build и других тяжёлых проверок. Search production logic не менялась.

## 24. Native MD/TXT/DOCX/PDF QA

`npm run tauri dev` запущен на отдельных синтетических профилях `noteflow-phase-e-20261004-02` и `...-03` через существующий debug-only data-dir override. Реальная пользовательская БД и models/keys не затронуты.

Через настоящее окно NoteFlow открыта rich canonical note, выбран формат и native Save: MD, TXT, DOCX, PDF успешно созданы в `releases/phase-e-qa`. Видны правильные filters/default Cyrillic names, loading и success с reveal action. Native cancellation повторно проверена: UI закрывается тихо, SHA-256 существующего MD до/после одинаковый.

Содержимое MD/TXT прочитано программно; Word XML/ZIP relationships/images провалидированы; PDF прочитан и отрендерен PDFium без OCR. Повторный финальный native PDF `phase-e-final-native.pdf` (30764 bytes) имеет 4 страницы, русские заголовки, checklists, details body, table/image; нет `<details>` leakage и internal asset URI. Первая страница визуально просмотрена; compiled production fixture также отрендерен и просмотрен на нескольких страницах.

DOCX открыт из Explorer в Microsoft Word, PDF в Adobe Reader: приложения запустились с именами документов. Но доступ computer-use к этим приложениям не был подтверждён, поэтому отсутствие Word repair warning и визуальная проверка в системном PDF viewer **не подтверждены**. MD/TXT в отдельном native text editor также не проверялись. Эти пункты остаются для user smoke; structural/render validation выполнена.

## 25. Native Project ZIP QA

В изолированном профиле экспортирован `EXPORT TEST.zip` с 3 notes, двумя одинаковыми названиями и общим изображением. Native Save, success и файлы в Explorer подтверждены.

ZIP CRC и contents проверены: `Документация API.md`, `Документация API (2).md`, `Третья заметка.md`, один `assets/Схема.png`; относительные ссылки корректны, unrelated notes/JSON/internal URIs отсутствуют. Внутренности ZIP прочитаны программно; просмотр ZIP folder внутри Explorer отдельно не утверждается.

## 26. Native TOC QA

Реальные H1/H2/H3, правильная hierarchy, повторяющиеся `Результаты` и navigation в конец длинной заметки подтверждены при 100% и 160% Tauri/WebView zoom. Internal `#таблица` click прокручивает к заголовку, без внешнего браузера. Native long fixture details действительно отображает summary/body, а не HTML.

Live rename/removal/silent restore, document/selection/no-autosave invariants проверены behavioral tests с настоящим TipTap. Отдельный native rename+restart цикл в Phase E не выполнялся. P0 save/load не переделывался.

## 27. Responsive QA

Playwright/Edge geometry: **8/8 PASS** для 1100x700 и 1440x900, 100%/160%, light/dark. Использованы настоящие export dialog/outline components, long headings, nested levels; проверены viewport bounds и отсутствие horizontal overflow, сохранены 16 screenshots. Light modal и dark TOC screenshots визуально просмотрены.

Native Tauri 160%: проверены Settings/Data, редактор, TOC portal, переход к duplicate heading, меню и export modal; bounds корректны. Native Settings в 100%: отсутствует language/current Note/Project export; backup/import и Models/RAG остаются. Native window не переставлялось последовательно точно в оба заданных физических размера: размерная матрица покрыта browser geometry, не выдается за native resize matrix.

## 28. Ограничения и технические границы

- Word/Adobe native visual QA и native text-editor inspection остаются для пользователя; запуск приложений не равен визуальной проверке документов.
- macOS build/runtime в этой Windows среде не выполнены; архитектура не использует Office install, OS font path или Windows-only генератор.
- DOCX/PDF не являются pixel-perfect копиями редактора. Callout/details readable, но без interactive collapse. Formula/date/text fallback не превращён в новую формульную typesetting систему.
- Неуправляемые удалённые изображения не скачиваются автоматически; placeholder сохраняет offline/privacy policy. Managed images/drawings экспортируются встроенными.
- Roboto покрывает кириллицу, но не гарантирует весь emoji/Unicode catalogue. Чек-листы специально не зависят от checkbox glyph.
- Word field TOC, PDF outline и активные Word/PDF internal bookmarks не реализованы (optional scope). Internal Markdown links сохраняются.
- Worker timeout 120 s; max output 256 MiB; managed images: максимум 500, 32 MiB на image, 256 MiB суммарно, 64 million decoded pixels. Tauri binary IPC использует number arrays, с временными копиями; это не streaming export.
- Re-export MD может оставлять старые asset directories, чтобы не уничтожить ранее сохранённый документ. Для переноса MD с изображениями нужен файл вместе с его соседней assets folder.
- Safe write защищает прежний файл при обычной ошибке; полной crash-atomic transaction между MD и assets filesystem не заявляется. Directory fsync/cross-filesystem durability не добавлялись.
- Unwritable native destination не моделировался изменением реальных permissions; fault safety проверена настоящими temp filesystem tests.
- Seven old local reports/QA files не удалялись и не включались в Phase E.

## 29. Финальные проверки и build

`git diff --check`: PASS; только стандартные LF/CRLF notices Git, без whitespace errors.

`npm run tauri dev`: PASS startup/native QA; после проверки остановлен. Exit code 1 при Ctrl+C относится к intentional dev shutdown, не к проваленной проверке startup.

`npm run tauri build`: PASS с финальными исходниками. Windows artifacts текущей версии:

- `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`

Это проверочная сборка Phase E, не публикация новой RC. Артефакты/QA outputs/logs остаются Git-ignored, release staging/publication не выполнялись. Нет лога содержимого заметок в новых production paths; failures показываются безопасным текстом.

## 30. Git status и список файлов

Состояние до разрешённого commit: branch/HEAD/version неизменны. Staged files: 0. Modified tracked: 16. Untracked individual files: 26 (включая этот отчёт); из них 7 существовавших ранее и 19 новых Phase E. Согласованный состав commit: ровно 35 файлов из двух списков ниже.

Modified tracked Phase E:

```text
package.json
package-lock.json
src-tauri/src/data.rs
src-tauri/src/lib.rs
src/app/AppShell.tsx
src/features/editor/EditorArea.tsx
src/features/editor/NoteMenuPopover.tsx
src/features/editor/editorInteractions.ts
src/features/editor/editorLinkClick.ts
src/features/projects/ProjectsPage.tsx
src/features/settings/SettingsPage.tsx
src/styles/editor.css
tests/editorUiPolish.test.ts
tests/p13FinalUxPolish.test.ts
tests/userSmokeCorrections.test.ts
vite.config.ts
```

New Phase E:

```text
docs/tasks/phase-e-export-outline-report.md
public/licenses/document-export.txt
scripts/qa/phase-e-fixture.html
scripts/qa/phase-e-fixture.tsx
scripts/qa/phase-e-geometry.mjs
scripts/qa/phase-e-production-worker.mjs
src-tauri/src/document_export.rs
src/features/editor/NoteOutline.tsx
src/features/editor/headingAnchors.ts
src/features/export/NoteExportDialog.tsx
src/features/export/export.worker.ts
src/features/export/exportDocument.ts
src/features/export/exportWorker.ts
src/features/export/generateDocx.ts
src/features/export/generatePdf.ts
src/features/export/savedExportFlow.ts
src/services/noteExportService.ts
tests/phaseEBehavior.test.ts
tests/phaseEExport.test.ts
```

Old intentional untracked, не изменены/не удалены/не staged:

```text
docs/tasks/phase-b-rag-responsive-report.md
docs/tasks/phase-b-smoke-corrective-report.md
docs/tasks/phase-b-standalone-scope-report.md
docs/tasks/phase-c-editor-correctness-report.md
docs/tasks/phase-c-settings-layout-corrective-report.md
scripts/qa/phase-b-provider.mjs
docs/tasks/phase-d-image-insert-calendar-report.md
```

## 31. Пользовательская приёмка и финальная микроправка

Пользователь сообщил о полной приёмке Phase E после smoke-test и отдельно разрешил один commit с subject `feat: complete rc3 product polish phase E` и заданным body. Предыдущий запрет commit заменён этим явным разрешением; tag/push/version bump/release по-прежнему запрещены.

Финальная микроправка меняет только label в `ProjectsPage.tsx`: `Экспортировать проект` -> `Экспортировать`. Handler, ZIP generation, native Save и соседние пункты меню не изменены. Archived Project menu не предоставляет export action.

После микроправки: typecheck PASS, frontend **452/452 PASS**, 70 suites, 10624.5097 ms, build PASS (12.79 s), `git diff --check` PASS. Browser QA реальных Projects/Archive компонентов при 100%/160% подтверждает label без лишнего переноса и неизменность соседних действий. Полные Rust/Tauri/FTS проверки выше выполнены ранее в Phase E, не выдаются за повторно запущенные на commit-only этапе.

## 32. Pre-commit audit и исключения

Проверены diff всех 16 modified tracked и 19 новых Phase E файлов, reusable QA, синтетические fixtures, consolidated report и dependency lockfile. Production source, tests, QA source и license notices включаются; generated документы, screenshots, logs, QA databases/profiles, `dist`, `node_modules`, `src-tauri/target` и установщики не включаются. Семь прежних локальных файлов из раздела 30 остаются untracked, без редактирования или удаления.

Lockfile соответствует новым export dependencies. Все новые resolved URLs ведут на публичный npm registry. Обновление `@types/node` до 26.6.4 требуется dependency `docx`; снятие dev flag у него и `undici-types` отражает dependency graph, а не добавление runtime imports этих typings. `@types/pdfmake` остаётся dev dependency. Генераторы работают в browser worker без Windows-only Office/COM или системных font paths; macOS native validation остаётся отдельным этапом.

Повторный `npm audit --omit=dev --json` на этапе подготовки commit: **0 vulnerabilities**. Это не отменяет ранее отмеченные dev/tooling findings и transitive deprecation notices в разделе 20. Direct libraries MIT; bundled Roboto OFL 1.1. License notices включены в production assets.

Candidate diff не содержит секретных значений, private provider endpoints, пользовательской БД/заметок/чатов или персональных файлов. Fixture данные синтетические; `D:/QA/...` в IPC tests является mock path, а не реальным пользовательским destination. QA scripts получают runtime location через `NOTEFLOW_QA_NODE_MODULES`, outputs остаются Git-ignored.

Экспорт использует только выбранные notes/project и необходимые managed assets; не выгружает model configs, credentials, hidden JSON/cache/sidecar dumps. Имена sanitised/collision-safe, ZIP entries проверяются на enclosed paths; portable references относительные. Fault tests подтверждают сохранение прежнего destination при validation/asset failure. Границы crash durability и office/native QA честно перечислены в разделе 28.

После согласованной фиксации остановиться. Следующий самостоятельный этап: **RC3 FULL REGRESSION / RELEASE HARDENING**, без автоматического tag/push/release.
