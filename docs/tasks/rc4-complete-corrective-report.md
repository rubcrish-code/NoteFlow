# RC4 complete corrective report

**Актуальный статус 09.10.2026: RC4 USER SMOKE ACCEPTED; FINAL RELEASE GATES PASS.** Пользователь сообщил, что финальное тестирование RC4 прошло, и явно разрешил commit/tag/push/prerelease. После bump до **1.0.0-rc.4** повторены frontend **565/565**, Rust **267 PASS / 10 intentional ignored**, production audit **0 vulnerabilities**, P0/CAS, isolated FTS, live Bridge/Ollama и production build. Версия MSI **0.99.4**, identifier и UpgradeCode сохранены. Последние результаты находятся в **RC4 RELEASE CANDIDATE GATE — 1.0.0-rc.4** в конце. Исторические PENDING/401 checkpoints сохранены; пользовательская приёмка не выдаётся за native automation Codex или clean-install/upgrade/uninstall QA новых пакетов.

## Historical initial stop on confirmed P0

Текущий статус отдельного P0 corrective pass приведён в конце, в разделе **P0 MARKDOWN FORMATTING DATA INTEGRITY CORRECTIVE**. Разделы 1–43 ниже сохранены как историческая диагностика первоначального stop-gate, а не как результаты новой проверки. Остальные направления RC4 не продолжались.

Дата: 08.10.2026. Вердикт: **NEEDS MORE WORK**.

Это отчёт об остановке, а не отчёт о завершении RC4. Пункт 61 задания требует остановить работу при обнаружении persisted content corruption. Подтверждён дефект канонического storage roundtrip; native/SQLite воспроизведение на пользовательских данных не выполнялось. Production-исправления семи направлений не начинались.

## 1. Git baseline

- Проект: `D:\Projects\NoteFlow`.
- HEAD: `ed311a5c64961223b36db17e60f45ad6581b2b90` (опубликованный rc.3).
- Выполнен `git fetch origin`; исходная release-ветка совпадала с origin, ahead/behind: 0/0.
- Создана запрошенная ветка `fix/rc4-clipboard-and-dragdrop` от `origin/release/windows-hardening`.
- Перед сборкой tracked-дерево было чистым; существовали семь intentional untracked QA-файлов. Они сохранены.
- Версия приложения: `1.0.0-rc.3`; productName: `NoteFlow`; identifier: `com.noteflow.desktop`.
- Commit/tag/push/merge/release не выполнялись. Опубликованные rc.3 assets не изменялись.

## 2. Scope

Задание включает clipboard, native drag/drop, image copy/save, drafts RAG, formatting corruption, background AI и полноценную AI-регрессию. До feature-изменений проведено чтение актуальных требований, существующего persistence/editor/AI/assets кода и проверка наиболее опасного storage roundtrip.

## 3. Clipboard root cause

**Не установлен для физического Ctrl+V.** В `src/features/editor/EditorContextMenu.tsx:68` ПКМ Paste использует только `navigator.clipboard.readText()`. Это конкретный браузерный dependency, но без native воспроизведения нельзя объявлять его единственной причиной всех paste-сбоев. Обычный Ctrl+V передаётся ProseMirror, кроме Markdown-пасты, перехватываемой EditorArea.

## 4. Clipboard fixes

Не реализованы: stop-gate сработал раньше. Нет фиктивного native PASS и нет глобального обхода Ctrl+V.

## 5. Tauri clipboard permissions

Clipboard plugin не добавлен; capabilities не менялись. Изучена официальная документация Tauri Clipboard Manager. Выбор dependency и конкретных разрешений остаётся частью реализации после снятия P0 stop-gate.

## 6. Native Drag & Drop implementation

Не реализована. Планируемая точка интеграции: штатный Tauri `onDragDropEvent`, а не имитация OS drop DOM-событием. Существующий безопасный backend import-from-path необходимо переиспользовать.

## 7. Images/documents/multi-file

PNG/JPG/WEBP, PDF/DOCX и multi-file drop в этой итерации не проверены. Нет новых способов записи файлов и нет копирования внешних путей в документ.

## 8. Insertion position

Drop-position mapping, проверка границ editor content и защита от двойных native/DOM событий не реализованы. Нужны отдельные native и автоматизированные проверки после исправления P0.

## 9. Managed asset storage

Изучены существующие `store_attachment`, `store_attachment_from_path`, canonical asset URI, content-addressed blobs и reference-aware GC. Они не изменялись. Пользовательские assets не открывались и не удалялись.

## 10. Image Copy

Копирование pixels не реализовано. Не выдаётся копирование URI или Markdown за image clipboard. Проверок NoteFlow -> Paint/Word/Telegram нет.

## 11. Image Save As

Не реализовано. Изучены существующие destination validation и atomic export write; их можно переиспользовать для сохранения текущего managed edited asset, без изменения документа/revisions.

## 12. Exact image menu order

Существующее меню не изменено. Требуемый порядок из задания остаётся acceptance criterion: Рисовать / Описание изображения / Сбросить изменения / Копировать изображение / Сохранить изображение… / separator / Удалить изображение.

## 13. RAG drafts

В `src/features/rag/RagChatWorkspace.tsx:85` draft находится в локальном `useState("")`. Это не application-level draft store. Реализация сохранения черновиков не начата.

## 14. Conversation isolation

Текущее локальное поле не является хранилищем drafts по conversation ID. A/B/A, navigation, delete/bulk cleanup и restart не проверены в native UI. Не добавлялось хранение в localStorage или новое persistence schema.

## 15. Rare editor bug

**Подтверждён P0: изменение текста при canonical Markdown-first save/load.**

Исходный `1.mp4` в указанном каталоге attachment отсутствует: доступен `Pasted text.txt`. Видео не просматривалось. Установлен воспроизводимый механизм, совпадающий с описанным симптомом; идентичность полного пользовательского сценария без видео не утверждается.

Проведены две независимые диагностические проверки через `npx tsx -e`:

1. Синтетический валидный document JSON -> существующий serializer -> существующий canonical loader, пять циклов.
2. Настоящий TipTap `Editor` в JSDOM со штатными `createEditorExtensions` из EditorArea; выделения и форматирование через `setTextSelection`, `setBold`, `setUnderline`; пять циклов `getJSON -> serialize -> load -> setContent`.

Вторая проверка исключает объяснение «дефект вручную составленного JSON».

### Минимальный сценарий через TipTap

1. Ordered list, один пункт: `Стоимость следующая -`.
2. Жирным выделить первые 19 символов: `Стоимость следующая`.
3. Подчеркнуть первые 18 символов: `Стоимость следующа` (последняя `я` остаётся только bold).
4. Выполнить штатный serializer и canonical loader, передав sidecars и JSON cache.
5. Повторить пять раз; сравнивать `getText()` до и после без нормализации или удаления звёздочек.

### Фактический результат

| Этап | Markdown | Основной текст |
| --- | --- | --- |
| Первое сохранение | `1. **Стоимость следующа****я** -` | `Стоимость следующая -` |
| Первый reload и повторное сохранение | `1. **Стоимость следующа********я** -` | `Стоимость следующа****я -` |
| Циклы 2-5 | То же повреждённое состояние | `Стоимость следующа****я -` |

Во всех пяти циклах `textPreserved: false`. Loader сообщил `source: "markdown"`; fallback не использовался. В TipTap `getText()` содержит также list block separators; они одинаковы до/после и не являются причиной несовпадения.

Оба диагностических процесса завершились exit code 0: это вывод наблюдений, **не прошедшие regression tests**. Проверка acceptance condition в них дала отрицательный результат.

## 16. Formatting data integrity

Точная причина обнаруженного механизма:

- `src/features/editor/markdownService.ts:356`: `inlineToMarkdown` сериализует каждый text node отдельно.
- `src/features/editor/markdownService.ts:371`: каждый bold node независимо получает `**` delimiters.
- Частичный underline разбивает text run на соседние nodes с общей bold mark; underline сам хранится в sidecar и не выражается в Markdown.
- Между nodes возникают соседние delimiters `****`; loader разбирает их не как один непрерывный bold span, и часть delimiters становится пользовательским текстом.
- `src/features/editor/editorContentSerializer.ts:126` записывает результат в канонический `contentMarkdown`.
- `src/features/editor/editorContentSerializer.ts:111` возвращает распарсенный Markdown с sidecars; JSON cache не подменяет успешно распарсенный, но повреждённый результат.
- `src/features/editor/EditorArea.tsx:348` использует именно этот serializer в `onUpdate`, передавая результат существующему autosave.

CAS и SQLite atomicity защищают порядок/целостность записи, но не исправляют некорректную сериализацию. Sidecar не должен становиться альтернативным источником текста.

**Граница доказательства:** production serializer/loader и реальные TipTap-команды проверены; SQLite/native restart, autosave race и исходное видео для этого дефекта не проверены. Пользовательская база не использовалась. Дефект канонического roundtrip достаточен для P0 остановки, но не доказывает повреждение всех существующих заметок.

Рекомендуемый следующий узкий corrective pass: mark-aware сериализация непрерывных Markdown mark spans через boundaries text nodes, проверка delimiter flanking/whitespace и literal punctuation, сохранение sidecar ranges. Нельзя удалять `****` regex-ом, переписывать старые заметки массовой миграцией или менять Markdown-first источник истины.

Нужны regression tests: этот точный ordered-list сценарий, частичное underline, соседние mark combinations, кириллица, пробелы, намеренные `*`, пять и более циклов, mounted note switching, CAS/autosave/reopen на временной DB. Исправление и новые tests пока не выполнены: работа остановлена по заданию.

## 17. Background AI architecture

Изучены NoteChatPanel и RagChatWorkspace. У note-chat backend result может сохраняться до проверки mounted state; поэтому неверно утверждать, что любое закрытие обязательно отменяет transport. Но UI pending lifecycle и request identity локальны компонентам. В RAG cleanup увеличивает generation request ID, инвалидируя продолжение frontend pipeline. Application-level coordinator не реализован.

## 18. Streaming lifecycle

Streaming implementation/regression не выполнены. Нет simulated streaming, заявленного как real provider stream. Сохранение существующего non-stream fallback остаётся обязательным.

## 19. Cancellation/deletion safety

Не менялись существующие deletion guards и persistence. Explicit Cancel, поздние ответы, bulk deletion и listener leaks в RC4 не тестировались.

## 20. Provider configuration

Профили, credentials, secure storage и provider logic не менялись. Реальные ключи не запрашивались, не читались и не переносились во frontend.

## 21. Actual model discovery

Bridge `/models` в этой итерации не вызывался. Актуальные модельные IDs/capabilities не установлены; никакой hardcoded catalog не добавлен.

## 22. Real Bridge chat

NOT TESTED. Live `/chat/completions` не вызывался.

## 23. Real embeddings

NOT TESTED. Live `/embeddings`, HTTP 201 compatibility, размерность и actual model IDs не проверены.

## 24. WAF/403 diagnostics

Новых HTTP ошибок не получено; выводов о WAF по одному 403 нет. Никаких обходов, ротации proxy/User-Agent, отключения TLS или повторов без лимита не добавлено.

## 25. User-Agent compatibility

Существующий provider layer не изменён. Полноценная UA-regression на реальном Bridge не проводилась.

## 26. Auto-index

Knowledge sync/indexing не менялись. После drop, deletion, restore или background AI новые RC4 integration tests не выполнялись.

## 27. RAG scopes

Scope logic не менялась. Изоляция retrieval по scopes в RC4 не подтверждена live-тестом; исходные данные и существующие scope настройки не трогались.

## 28. Sources/citations

Snapshot semantics и citations не менялись. Нет новых live evidence для scope leakage, перехода к фрагменту или background response identity.

## 29. Global Knowledge

Никакие новые Global Knowledge features не добавлялись. Структурированные metadata и retrieval не объявлены RC4 PASS без проверки.

## 30. AI error matrix

401/403/429/5xx, timeout, unavailable local provider и cancellation matrix не запускались. Причина: остановка до AI implementation/regression, а не положительный результат.

## 31. Mock test evidence

Новые mock-тесты не добавлялись и не запускались. JSDOM formatting diagnosis использует настоящие TipTap-команды и штатный serializer, не mocked conversion.

## 32. Integration test evidence

Пять storage roundtrip циклов на synthetic JSON и пять циклов на реальном TipTap document воспроизвели нарушение text preservation. Это frontend integration diagnosis, не SQLite fault test, не native paste и не live AI.

## 33. Live provider evidence

Нет. Ни один provider не получает RC4 live PASS на основании предыдущих smoke или этой сборки.

## 34. Native Windows QA

Доступность Windows automation проверена инвентаризацией окон. NoteFlow и Notepad не были открыты для этого smoke; чужие приложения не автоматизировались. Пользовательская NoteFlow DB не открывалась. Native clipboard/drop/image/save/restart сценарии NOT TESTED после P0 stop-gate.

## 35. Packaged QA

Выполнено `npm run tauri build -- --debug --no-bundle`: exit code 0, приложение создано в `src-tauri/target/debug/noteflow.exe`.

Команда запустила штатный `npm run build` (`tsc && vite build`), затем Rust debug compilation. Vite: 243 modules, 13.74 s; Rust dev build: 1m 25s.

Это debug executable с embedded frontend, **не production installer**, не итоговый `npm run tauri build` и не packaged native PASS. Приложение не запускалось на реальном профиле. MSI/NSIS RC4 не создавались.

## 36. Security audit

Production `npm audit --omit=dev --offline=false` в этой итерации не запускался. Dependencies не обновлялись, capabilities не расширялись. Secrets, notes, chat history и пользовательские пути не выводились; воспроизведение использует только приведённую synthetic fixture. Это не заменяет полный security gate.

## 37. Frontend tests

Baseline из задания: 505 tests. Текущий полный `npm run test` не запускался; 505/505 не заявляется заново. Два диагностических запуска выявили FAIL text preservation. Добавленных test cases: 0. Штатная frontend compilation/build прошла как beforeBuildCommand Tauri; отдельный `npm run typecheck` не запускался.

## 38. Rust tests

Baseline из задания: 255 passed, 7 intentional ignored. Текущие fmt/check/test/clippy gates не выполнялись; эти baseline числа не являются новым PASS. Rust debug compile прошёл. Rust production logic вручную не менялась.

## 39. FTS

10,000-note isolated benchmark не запускался. Поиск не менялся. Нет оснований заявлять regression PASS или regression FAIL по времени без измерения.

## 40. Remaining manual actions

USER ACTIONS STILL REQUIRED:

- Прикрепить исходный `1.mp4`, если нужно сравнить воспроизведённый механизм с полной последовательностью пользовательских действий.
- После отдельного исправления P0 и завершения оставшихся направлений выполнить недоступные автоматизации native external-app smoke. Сейчас RC4 не готов для этого acceptance smoke.

Требуемые автоматические gates и ещё не реализованные features - ответственность разработки, не перекладываются на пользователя.

## 41. Changed files

- Добавлен этот report: `docs/tasks/rc4-complete-corrective-report.md`.
- Tauri CLI оставил `src-tauri/Cargo.toml` отмеченным modified. Содержимое сравнили с HEAD после нормализации line endings: совпадает полностью. Текущий файл LF; Git предупреждает об ожидаемой CRLF-конверсии. Semantic diff отсутствует, dependencies/version вручную не менялись. Файл не откатывался.
- Семь исходных untracked QA-файлов сохранены без правок.
- Generated `dist`/`target` не добавлялись в Git. Диагностические команды не создали test files или пользовательские DB fixtures.

## 42. Git status

Ветка: `fix/rc4-clipboard-and-dragdrop`; HEAD не изменён.

Проверенное итоговое состояние: один tracked-файл отмечен modified без semantic diff (`Cargo.toml`), восемь untracked файлов (семь исходных плюс этот report), staged files отсутствуют. `git diff --check` завершился exit code 0, с предупреждением LF -> CRLF для Cargo.toml. Отдельный `git diff --no-index --check -- NUL docs/tasks/rc4-complete-corrective-report.md` не вывел whitespace errors; exit code 1 соответствует наличию нового файла в no-index comparison, не утверждается как обычный exit-code-0 gate.

Нет commit/tag/push. Версия осталась `1.0.0-rc.3`. Ничего не было опубликовано.

## 43. Final verdict

**NEEDS MORE WORK**: подтверждён P0 formatting/storage roundtrip corruption. Работа остановлена согласно explicit release stop-gate, до исправления features и до полного RC4 regression.

Следующий этап должен сначала устранить этот конкретный P0 с behavioral regression tests и безопасным temporary-DB reopen evidence; затем можно продолжить остальные шесть направлений. Зелёная compilation не означает data-integrity PASS.

### Матрица семи направлений

| Направление | Implemented | Automated tests | Integration tests | Native QA | Packaged QA | Live API QA | User smoke | Remaining blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Clipboard Paste | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PENDING USER SMOKE | Исправление не реализовано; native root cause не установлен |
| B. Drag & Drop | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PENDING USER SMOKE | Native hook и position/duplicate guards не реализованы |
| C. Image Copy / Save | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PENDING USER SMOKE | Pixel clipboard и Save As не реализованы |
| D. RAG Draft Persistence | FAIL | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PENDING USER SMOKE | Локальный state не удовлетворяет application-level persistence |
| E. Rare Editor Formatting Bug | FAIL | FAIL | FAIL | NOT TESTED | NOT TESTED | NOT TESTED | PENDING USER SMOKE | P0: текст меняется при первом canonical reload; video отсутствует |
| F. Background AI Execution | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PENDING USER SMOKE | Application-level lifecycle/cancel/streaming не реализованы |
| G. Full AI Integration Regression | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PENDING USER SMOKE | Нет новых live provider evidence |

`NOT TESTED` в Implemented не означает «реализовано»: новые RC4 changes для этих направлений не начаты. `FAIL` у E отражает диагностические проверки acceptance condition, а не запуск полного node:test suite. Нет преждевременного READY и нет запроса пользователю принимать незавершённый RC4.

## P0 MARKDOWN FORMATTING DATA INTEGRITY CORRECTIVE

Дата: 08.10.2026. Scope: только предотвращение нового повреждения при форматировании/Markdown-first roundtrip. Ветка `fix/rc4-clipboard-and-dragdrop`, HEAD `ed311a5c64961223b36db17e60f45ad6581b2b90`, версия `1.0.0-rc.3`. Product identifier, dependencies, migrations, storage contracts, revision policy и опубликованный RC3 не менялись.

### 1. Original reproduction

Настоящий TipTap Editor с `createEditorExtensions`, нумерованным списком и текстом `Стоимость следующая -`. Команда bold применена к фразе, underline — к последней букве, середине слова или префиксу. Тест сохраняет документ через production serializer и загружает только canonical Markdown + appearance sidecar; JSON cache заменён пустым документом, fallback запрещён assertion.

До исправления первые восемь новых regression cases дали **3 PASS / 5 FAIL**. Первоначальное воспроизведение сохранено в `tests/phaseCEditor.test.ts`. Проверялся реальный текст/документ, не regexp по исходникам. Последующие дополнительные fixtures обнаружили проблемы с неоднозначными emphasis ranges и завершающим hard break; они также исправлены и проверены заново.

### 2. Exact root cause

Сериализация раньше независимо оборачивала каждый text node delimiters. Underline или color разделяют ProseMirror text nodes, хотя Markdown bold остаётся общим диапазоном. Закрытие `**` непосредственно перед следующим открытием `**` создаёт `****`; CommonMark parser воспринимает эту последовательность иначе и возвращает звёздочки в пользовательский текст. Проблема не в SQLite и не в отображении underline.

Также block parsing отбрасывал edge whitespace и line-break syntax; inline emphasis не может однозначно выразить некоторые intraword/crossing ranges. Эти случаи учитываются тем же существующим pipeline, а не отдельным serializer.

### 3. Affected components

- `markdownService.ts`: inline projection, mark transitions, literal escaping, whitespace/code fences/hard breaks, paragraph line joining.
- `markdownInline.ts`: существующий typed inline parser, soft-line semantics и ограниченное декодирование numeric whitespace entities.
- `editorContentSerializer.ts`: извлечение appearance mark ranges из того же документа.
- `EditorArea`, CAS/pending coordinator и production Rust save path не переписывались.

### 4. Structural fix

Смежные текстовые runs нормализуются по Markdown marks. Sidecar-only marks не разрывают общий bold/italic span. Mark stack сохраняет общий внешний диапазон, закрывает/открывает только изменившиеся marks и использует детерминированную нормализацию.

Literal Markdown punctuation экранируется при сериализации текста; звёздочки не удаляются и не «ремонтируются» глобальными regexp. Code delimiters выбираются по длине содержащихся backticks. Значимые edge whitespace кодируются как numeric entities и восстанавливаются parser; hard breaks остаются структурными nodes.

Кандидат проверяется существующим inline parser на эквивалентность text/Markdown marks. Если конкретный inline container не представим однозначно в используемом Markdown dialect, его текст сохраняется безопасным Markdown, а форматирование диапазонов — существующим appearance sidecar. Это не JSON-only fallback: ни одна буква не берётся из cache/sidecar вместо Markdown. Для такого редкого контейнера standalone `.md` не содержит весь rich appearance; это честное ограничение переносимости произвольных ProseMirror ranges.

### 5. Underline and sidecars

Underline по-прежнему хранится в существующем appearance sidecar по UTF-16 ranges. Schema v1 не менялась. Bold остаётся в Markdown, когда диапазон представим; расширенные/неоднозначные комбинации сохраняются appearance ranges. Границы проверяются exact semantic document comparison, включая emoji и combining characters.

Sidecar не содержит альтернативный текстовый документ. Backend compatibility `legacy_tiptap_json` cache остаётся прежним; тест проверяет его согласованность, но canonical reload намеренно не использует JSON cache как источник текста.

### 6. Before/after Markdown

Для частичного underline внутри общей жирной фразы:

```markdown
Before: 1. **Стоимость следующа****я** -
After:  1. **Стоимость следующая** \-
```

Экранированный dash отображается как обычный `-`. Видимый текст остаётся `Стоимость следующая -`. В native fixture с bold на всей строке canonical output — `1. **Стоимость следующая -**`, underline первого слова отдельно в sidecar.

### 7. Plain-text integrity

На каждом cycle сравниваются exact `editor.getText()` и semantic JSON, без удаления звёздочек/нормализации потерь перед assertion. Проверены намеренные `****`, `**`, `*важно*`, `[ ]`, `[x]`, backslashes, backticks, numeric entity literals, кириллица, emoji, combining characters, punctuation, tabs/NBSP/thin space и hard breaks.

Существующая derived `plain_text` normalization для поиска не менялась. Exact whitespace WYSIWYG восстанавливается из Markdown, а не из поискового plain text. Callout regression assertion усилен до точного сравнения: прежний тест допускал потерю пробелов перед переносом, новый — нет.

### 8. Semantic mark integrity

Exact normalized TipTap JSON до/после сохраняет списки, bold, italic, partial underline, strike, code, textStyle/color, sup/sub и их комбинации. Shared-bold nodes с разными appearance marks и crossing bold/italic проверяются отдельно. Пустые text nodes не создают delimiters; TipTap сам не допускает пустой text node в валидном документе.

Полный существующий suite дополнительно проверяет headings, links, highlight, quotations, tables, Details, Callout, formulas/date, images и nested/mixed checklists. Это automated regression evidence, не заявление о новом полном native smoke всех инструментов.

### 9. Ten-cycle roundtrip

Добавлено **15 frontend behavioral tests**: 3 partial-underline ranges, 6 text/mark fixtures, 5 structural edge fixtures, 1 mounted autosave/navigation test. Первые 14 выполняют минимум 10 canonical load/save cycles с exact text/JSON/Markdown assertions. Canonical representation стабильна, delimiters и символы не накапливаются.

Существующие mixed-list/checklist tests также прошли повторный полный запуск; их own loop остаётся 3 cycles, не переименован в 10-cycle evidence.

### 10. Real SQLite persistence

`scripts/qa/rc4-formatting-sqlite.mts` создаёт реальный TipTap документ, 10 typed snapshots и новую temporary profile DB. Explicit Rust bridge `data::tests::rc4_formatting_sqlite_bridge` использует штатные migrations, `update_note_content`, transaction, sidecars/revisions и `get_note` после закрытия/reopen SQLite на каждом cycle.

Проверяются Markdown, JSON cache, HTML cache, derived plain text, appearance sidecar, compatibility sidecar и `content_version` 1–10. Все 10 stale CAS writes отклоняются. Сохранённые записи возвращаются обратно в TypeScript, загружаются с пустым JSON cache, и actual TipTap text/JSON сравниваются с оригиналом. Результат: **PASS**, 10 cycles / 10 rejected conflicts. Fault/rollback production behavior P0.1 не менялось.

Первый запуск bridge выявил ошибочное предположение теста об одном sidecar: штатный backend добавляет compatibility cache. Assertion исправлен на проверку обоих слоёв, не изменён backend.

Финальный повтор `npx tsx scripts/qa/rc4-formatting-sqlite.mts` после native QA также PASS: новая fixture `%TEMP%\noteflow-rc4-formatting-Ca22a9`, 10 cycles / 10 rejected conflicts. В sandbox повтор сначала завершился `spawn EPERM` при запуске локального esbuild; после разрешённого unsandboxed запуска тест завершился успешно. Этот runner выводит `nativeQA: NOT TESTED` именно для своей новой fixture, не приписывает ей UI smoke предыдущего профиля.

### 11. Autosave/navigation

Mounted `EditorArea` integration использует настоящий `PendingNoteSaves` coordinator. Первый write удерживается in-flight, следующая partial-underline правка enqueue-ится, затем flush завершает записи в CAS порядке. Acknowledgement не remount-ит TipTap, не меняет DOM node, caret, selection или более новый live document. Десять переключений A/B/A сохраняют исходный текст/marks.

Existing same-ID restore generation, failed flush, stale save и caret tests прошли полный suite. Они не заменены source-regex contract tests. Production autosave/navigation handlers в этой задаче не менялись.

### 12. Native QA

Открыт настоящий `target/debug/noteflow.exe` с embedded production frontend на отдельном synthetic profile:
`%TEMP%\noteflow-rc4-formatting-8H1Fbv`.

Через Windows UI создана новая `RC4 Native Formatting`, введён исходный текст, включён numbered list, bold всей фразы и underline первого слова. После autosave выполнено переключение на `Navigation Fixture` и возврат: текст/форматирование визуально сохранены, `****` отсутствует. Сохранённая native запись дополнительно прочитана read-only из этой QA SQLite: exact исходный plain text, canonical Markdown, content_version=4 — PASS.

Через штатную настройку масштаба проверены 100% и 160%; formatted list читается, partial underline остаётся на первом слове. Загруженная bridge fixture отдельно отображает underline на исходном диапазоне.

Штатное Alt+F4 завершило первый процесс. **Native restart verification PENDING**: при последующем запуске QA процесс существовал, но Computer Use не предоставлял доступного NoteFlow окна. Проверка через `list_windows`/`list_apps` повторена; состояние перезапущенного документа визуально не наблюдалось, поэтому restart PASS не заявляется. Завершены только собственные недоступные QA-процессы; чужие/user-profile процессы не затрагивались. SQLite reopen evidence из пункта 10 — отдельная проверка, не подмена native restart.

### 13. Packaged QA

Production MSI/NSIS/executable собраны. Native smoke выше использует debug executable с **embedded production Vite build**, без Vite dev server. Это максимально близкий безопасный профиль, но не installed release build.

**Strict packaged Windows QA: PENDING USER SMOKE.** Release executable намеренно не запускался с реальной пользовательской базой: существующий production policy не принимает debug data-directory override. Эта защита не ослаблялась. Пользовательский smoke не объявлен PASS.

### 14. Frontend gates

| Команда | Результат |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **520/520 PASS**, 73 suites, 0 fail; 12.790 s |
| `npm run build` | PASS; Vite 7.3.5, 243 modules; 12.43 s отдельный build |

Baseline 505 + 15 новых cases = 520. Full suite был запущен заново после окончательных parser/serializer изменений. Промежуточные FAIL не объявляются текущим green gate.

### 15. Rust gates

| Команда | Результат |
| --- | --- |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS; 14.10 s |
| `cargo test` | **255 PASS, 8 intentional ignored**, 0 fail; 17.76 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS; 12.42 s |
| explicit SQLite bridge | **1 PASS**, invoked with `--ignored --nocapture` by TypeScript runner |

Новый bridge intentional ignored в обычном suite, поскольку требует typed synthetic input; он реально выполнен отдельно, не считается обычным 256-м passing unit test. Production Rust logic не менялась, diff находится только в test module.

Isolated 10,000-note FTS benchmark: **PASS**, indexing **11.2249734 s**, query **626.3 µs** (0.6263 ms). Чистый запуск отдельно, без одновременно работающего tauri dev/build/test и без сторонних тяжёлых jobs, запущенных этим task.

### 16. Production audit

`npm audit --omit=dev --offline=false`: **0 vulnerabilities**, PASS. TipTap 3.30.5, prosemirror-model 1.25.12 и prosemirror-view 1.42.6 не откатывались; package/lock dependencies не менялись. Existing paste/HTML/link/prototype pollution/ReDoS security tests прошли повторный suite.

Новые diagnostic snapshots выводятся только explicit test-only bridge для synthetic note. Нет production note-content logging, API/network обращения и credential access не добавлялись. Numeric entity decoding принимает только bounded numeric whitespace, не создаёт HTML nodes и не выполняет markup.

### 17. Tauri build

`npm run tauri build`: **PASS**, Rust release compilation 1m 41s, installers:

- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.3_x64-setup.exe`.
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.3_x64_en-US.msi`.
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.3_x64_ru-RU.msi`.

Existing MSI mapping 0.99.3 не менялся. Это новые **local candidate outputs**, не замена опубликованных assets. Staged release directories и GitHub Release не затрагивались.

Дополнительный `npm run tauri build -- --debug --no-bundle`: PASS; embedded frontend, debug executable для isolated native QA. `npm run tauri dev` не требовался заданием P0 и не использовался как substitute production build.

### 18. Diff validation

`git diff --check`: PASS, exit code 0. LF→CRLF warnings отражают repository line-ending policy, не whitespace failures. Новые report/QA script отдельно проверены через `git diff --no-index --check -- NUL <file>`; отсутствие whitespace diagnostics, exit code 1 для нового файла ожидаем в no-index comparison.

### 19. Changed files

- `src/features/editor/markdownService.ts`: structural inline serialization и block whitespace/line-break handling.
- `src/features/editor/markdownInline.ts`: whitespace entities и soft lines.
- `src/features/editor/editorContentSerializer.ts`: существующий appearance sidecar extraction.
- `tests/phaseCEditor.test.ts`: 15 actual behavioral regression cases.
- `tests/phaseDImageEditor.test.ts`: stronger exact Callout text assertion.
- `src-tauri/src/data.rs`: explicit test-only SQLite integration bridge.
- `scripts/qa/rc4-formatting-sqlite.mts`: synthetic TS/Rust persistence runner.
- `docs/tasks/rc4-complete-corrective-report.md`: этот appended раздел и ссылка на текущий статус; старые результаты сохранены.
- `src-tauri/Cargo.toml`: Tauri CLI line-ending-only modified status, semantic content matches HEAD; version/dependencies не менялись.

Семь исходных untracked файлов не изменялись. Нет новой migration, UI feature, attachment representation, revision retention или provider change. Массового изменения старых заметок нет. Уже повреждённые заметки автоматически не «очищаются»: восстановление возможно отдельно из исправной revision/backup после анализа, не удалением намеренных Markdown markers.

### 20. Git status and verdict

HEAD и ветка прежние; staged files отсутствуют. **7 tracked modified**, из них Cargo.toml только EOL; **9 untracked**, из них 7 исходных + report + SQLite runner. `git diff --stat` substantive tracked changes: 6 files, 337 insertions / 57 deletions; untracked docs/runner не входят в этот stat.

Commit/tag/push/merge/version bump/release **не выполнялись**. Версия остаётся `1.0.0-rc.3`. Реальные пользовательские заметки/DB/API keys не использовались.

**READY FOR USER P0 FORMATTING SMOKE**

Automated formatting/persistence gates зелёные; native restart и installed packaged smoke честно остаются PENDING. Дальнейшая работа над остальными шестью RC4 направлениями остановлена до пользовательского подтверждения этого P0.

## RC4 continuation after accepted P0

Пользователь подтвердил P0 formatting smoke новым заданием от 08.10.2026; stop-gate снят. Исторический P0 corrective section выше не удаляется. Commit/tag/push/version bump по-прежнему запрещены.

### A. Clipboard checkpoint

Root cause в исследованном ПКМ path: browser `readText` исключал rich HTML и зависел от разрешений WebView. Native Ctrl+V теперь явно читает OS clipboard через typed async Rust commands; ПКМ использует тот же service. Добавлен `arboard = 3.6.1` для text/HTML/image clipboard; `image` понадобится для bounded pixel decoding в C. Native commands выполняются в background blocking task, payload ограничен 4 MiB на формат, содержимое не логируется.

HTML проходит через `EditorView.pasteHTML` и существующую schema/clipboard validation, plain text через `pasteText`; plain Markdown использует принятый parser. Rich HTML имеет приоритет над эвристикой plain Markdown. Ctrl+Shift+V остаётся plain. Bookmark, note ID/reload generation/document guard и request identity защищают от stale вставки. Context menu меняет lifecycle только при реальной смене документа, не при ordinary autosave.

Targeted gate: **81/81 actual editor tests PASS**, включая 8 новых clipboard cases, accepted P0 ten-cycle tests и existing security/checklist tests. Rust clipboard limits: **1/1 PASS**. Typecheck и cargo check PASS после новых dependency install. Native Telegram/Word/Chrome/Edge/Notepad и installed-build smoke пока **PENDING**, а не PASS по jsdom tests. Далее B–F; полный final regression ещё не выполнен.

### B. Native drag/drop checkpoint

Добавлен Tauri webview drop listener с physical-to-CSS coordinate conversion, проверкой actual editor hit target и `posAtCoords`. События вне редактора игнорируются. Busy guard исключает конкурентную обработку; пути дедуплицируются в одном событии. До 32 файлов хранятся через существующий managed ingest; PNG/JPEG/WEBP становятся image nodes, остальные разрешённые backend policy файлы — attachment nodes. Batch вставляется одной editor transaction после успешной подготовки; одна undo operation. Note ID, reload generation и document guard отменяют устаревшую вставку. Listener корректно снимается, включая позднюю async registration.

`store_attachment_from_path` переведён в async blocking task без изменения storage policy. Backend всё ещё сериализует ingestion через store mutex; filesystem ownership/GC не перерабатываются. При ошибке позднего файла уже подготовленные managed records могут остаться у заметки, но документ не получает половину batch; это не обещание filesystem batch atomicity.

**84/84 editor tests PASS**, включая 3 новых multi-file/position/zoom/stale/limit/undo cases. **6/6 attachment-focused Rust tests PASS**; typecheck PASS. Реальный Explorer/Desktop drop, restart и packaged QA пока PENDING.

### C. Image transfer checkpoint

В существующее image overflow menu добавлены команды строго после reset: «Копировать изображение», «Сохранить изображение…», затем separator/delete. Используется captured current `attrs.src`, не originalSrc; crop/drawing output уже является этим src. PNG rasterization ограничена 16M pixels/25MiB; Rust повторно проверяет encoded payload и bounded decode, clipboard получает RGBA pixels через arboard, не URL/text. Save As предлагает PNG и безопасное имя, backend проверяет destination вне профиля и использует существующий temporary-file/fsync/rename export helper. Cancel не пишет файл, busy guard исключает duplicate click, ошибки не раскрывают paths/pixels.

**53/53 image tests PASS**, включая новый current-bitmap clipboard/Save As/cancel/failure test; **2/2 Rust clipboard tests PASS**, включая real PNG pixel decode/invalid/oversize cases. Native Paint/Word/Telegram и packaged image transfer пока PENDING.

### D. RAG drafts checkpoint

Root cause: composer draft/active conversation жили только в local React state, терялись при unmount, а общий `setDraft("")` мог очистить другой разговор. Добавлен application-lifetime typed draft store по chat ID, отдельный provisional new-chat key и сохранение active conversation. Scope/layout changes не меняют draft. Очистка происходит только если отправленный текст всё ещё актуален; failed send восстанавливает текст только в пустой draft, не перетирая новый ввод. Удаление чистит только draft удалённого чата; import reload generation очищает session data. Черновики не пишутся в localStorage/SQLite и автоматически не уходят модели; restart-draft persistence не заявляется.

**12/12 mounted RAG tests PASS**, включая 3 новых remount/no-send/failure/isolation cases. Typecheck PASS. Native/package navigation draft QA пока PENDING.

### E. Investigation

Подтверждено по текущему backend: note/chat completion bodies используют `stream: false`; предыдущий compatibility test специально отключал legacy streaming preference. Настоящего Stop в composer нет. Следовательно нельзя заявить «streaming/Stop сохранены». Для требования E нужен новый opt-in controlled transport, application-owned request lifecycle и cancellation, не имитация streaming анимацией готового ответа.

### E. Background lifecycle and controlled streaming implementation

Добавлены application-owned `AiBackground`, `noteChatJobs` и `ragJobs`. React подписывается на immutable job snapshots по note/chat ID; unmount, переключение заметки или раздела не отменяют запрос. User message сохраняется один раз, assistant message — после успешного результата; повторный Send для busy conversation отклоняется. Другие conversations независимы. При повторном mount UI загружает историю и показывает актуальный job. Note scope/selection захватываются при отправке; RAG использует существующий backend plan и original user-message scope. Final citations сохраняются существующим authoritative RAG pipeline, не генерируются frontend.

Новые opt-in Tauri commands `run_note_ai_stream` / `run_rag_generation_stream` передают content deltas через typed Channel. Старые commands сохранены. `ControlledHttpClient` использует существующие URL/header validation, browser-compatible User-Agent и curl config через stdin: Authorization не попадает в argv. Настоящие OpenAI SSE и Ollama NDJSON обрабатываются по мере поступления. Reasoning fields и provider envelopes не отправляются через Channel. Обычный JSON fallback не превращается в искусственный поток. Неполный stream / token-limit termination отвергается, а не сохраняется как готовый ответ. Ограничения: response 16 MiB, line 1 MiB, stderr 64 KiB, bounded provider timeout.

Stop адресован request UUID. Во время generation token вызывает kill + wait дочернего curl, reader threads завершаются. Backend проверяет cancellation перед сохранением RAG answer; note job проверяет её перед записью assistant. Во время retrieval Stop отменяет продолжение workflow, но уже запущенный embedding request заканчивается по своему bounded timeout: немедленная отмена embedding curl здесь не добавлялась. До завершения такого запроса UI честно показывает stopping. Закрытие панели не является Stop. Поддержка генерации после полного выхода из приложения не заявляется.

Перед backup import оба job store приостанавливают новые запросы, останавливают активные и ждут их завершения; затем выполняется существующий P0.1 restore coordinator и refresh generation. В finally stores разрешают новые jobs. Клиентский 45-second timeout note chat дополнительно отправляет native cancel. Empty/error provider result не сохраняется как успешный assistant message. Не менялись Markdown-first, migrations, revision retention или attachment ownership.

Новые behavioral tests: subscriberless stream/completion, duplicate send, scoped Stop, import drain/suspension, RAG unmount during retrieval/generation, no duplicate request on remount, Stop before generation, mounted note-chat switch A→B→unmount→reopen A с единственной записью ответа. Targeted background/RAG gate: **19/19 PASS**. Rust tests реально используют loopback HTTP и curl для Unicode SSE, discarded reasoning, cancellation/reaping и truncated stream; отдельный operation identity test. Полный gate ниже включает эти тесты. Native live panel/background/Stop и installed UI **не подтверждены** по одним unit tests.

### F. Live AI Results — 08.10.2026

Live fixture `data::tests::rc4_live_ai_integration` intentional ignored в обычном suite; запускается отдельно и использует только synthetic temporary notes/projects/chats. Bridge profile metadata открываются READ ONLY; секрет получается внутри Rust из существующего SystemSecretStorage. Реальные заметки/история пользователя не читаются, provider configuration/credentials не изменяются. Diagnostic output содержит model ID/status/counts, не тексты, ключи, response body или vectors. QA cloud consent относится только к synthetic temp profile.

| Provider / endpoint | Actual result |
| --- | --- |
| Bridge `GET <configured Bridge base URL>/models` | HTTP 200; OpenAI-compatible catalog; 2 IDs: `cifra48/agent`, `cifra48/llm`; capability metadata нет; `cifra48/embedding` в catalog отсутствует |
| Bridge `POST .../chat/completions`, `cifra48/agent` | HTTP 401 и при stream=false, и при stream=true; content chunks 0 |
| Bridge `POST .../chat/completions`, `cifra48/llm` | HTTP 401 и при stream=false, и при stream=true; content chunks 0 |
| Bridge `POST .../embeddings`, saved `cifra48/embedding` | unauthorized; dimensions не получены |
| Ollama `GET http://127.0.0.1:11434/api/tags` | 2 actual IDs; `/api/show` сообщает completion/tools для `qwen3-4b-local:latest`, embedding для `bge-m3:latest` |
| Ollama `POST /api/generate`, `qwen3-4b-local:latest` | HTTP 200 в обоих режимах; настоящий stream — 6 content chunks |
| Ollama `POST /api/embed`, `bge-m3:latest` | success; dimensions 1024; indexed chunks 3, failed 0 |
| Ollama hybrid + grounded RAG, all | grounded; 3 sources; citations не требовали repair |
| Ollama hybrid + grounded RAG, project | grounded; 1 source; все retrieval sources из выбранного проекта |
| Ollama hybrid + grounded RAG, standalone | grounded; 1 source; только standalone note |
| Ollama real Stop after first content delta | final result rejected; elapsed 195 ms, включая запрос до первого delta |
| Global Knowledge Agent, SQLite inventory | реальный count 3, ответ сохранён; structured metadata path не требует HTTP |

Ollama explicit live gate **PASS**, 4.68 s в финальном warmed run. Models выбраны из реально обнаруженного catalog и `/api/show`, не добавлены как production hardcoded options. Direct fixture вызывает existing index update, hybrid retrieval и grounded generation; automatic scheduling coverage — существующие `auto_knowledge` integration tests, не native auto-index smoke. Reopen DB проверяет 3 synthetic notes; durable chat/messages/sources дополнительно покрыты existing Rust persistence tests. Native restart открытого чата в этом continuation не проверен.

Финальный explicit Bridge gate **FAIL** (0 pass / 1 fail, 1.36 s): намеренно требует реальный final answer и vectors, не считает диагностический 401 успехом. Нет HTTP 403; доказательств WAF blockage нет. User-Agent не гарантирует authorization. Нужна проверка актуальности сохранённого ключа/прав на стороне пользователя/Bridge, затем повторный smoke. Вопрос пользователю отправлен; ключ в чат не запрашивался. Ни фиктивных ответов, ни fallback на выдуманный catalog, ни retries/обходов WAF не добавлено. Bridge RAG/citations/streaming остаются **BLOCKED BY AUTHORIZATION**.

Latest successful synthetic Ollama fixture: `%TEMP%\noteflow-test-63e4d527-f2eb-4e46-89ba-33b385f8cbee`. Failed Bridge diagnostic fixture: `%TEMP%\noteflow-test-23b3f4b9-3b02-4249-acb2-2f18c78a7143`. Они не являются production profiles и не включаются в release.

### Native Windows QA limitation

`npm run tauri dev` реально запущен с `NOTEFLOW_DEV_DATA_DIR=%TEMP%\noteflow-rc4-formatting-tENXCs`. Открыто настоящее окно с synthetic profile `RC4 Formatting QA`, 3 notes; screenshot и accessibility tree показывают принятое bold + partial underline без лишних Markdown markers. После dev watcher rebuild новый native window вновь показывает то же сохранённое содержимое. Это подтверждает launch/read/reload этой synthetic fixture, но не native ручное редактирование.

Input automation не заработала: первый click сообщил `coordinate input geometry is unavailable`; после refresh/reselection/activation следующий screenshot-backed click сообщил `point ... is outside window bounds { originX: 0, originY: 0, width: 14, height: 14 }`. Изображение окна при этом было 1536×816. Recovery выполнен один раз согласно Computer Use guidance; дальнейшие guessed inputs не выполнялись. Dev session остановлена; пользовательское приложение/DB не затрагивались. Это automation limitation, не доказанный дефект приложения.

Не подтверждены и требуют ручного smoke: Ctrl+V/ПКМ из Telegram/Word/Chrome/Edge/Notepad; Explorer/Desktop multi-file drop и placement при 100%/160%; отсутствие duplicate/outside drop; копирование actual cropped/drawn bitmap в Paint/Word/Telegram; native Save As/cancel; drafts при навигации/scope changes; background note/RAG после закрытия панели; UI Stop; restart сохранённых attachments/images и AI history. Installed production-like QA также PENDING: release не поддерживает debug data-dir override, поэтому запуск на real user profile ради destructive checks не выполнялся. Security guard ради QA не ослаблен.

### Final regression checkpoint

| Check | Current result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **542/542 PASS**, 74 suites, 15.916 s |
| `npm run build` | PASS, Vite 12.55 s |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS, 4.44 s |
| `cargo test` | **261 PASS, 9 intentional ignored**, 0 fail; 18.91 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS, 5.14 s |
| `npm audit --omit=dev --offline=false` | PASS, **0 vulnerabilities** |
| explicit live Ollama fixture | PASS; chat, streaming, embeddings, scoped RAG, Stop, Global Agent |
| explicit live Bridge fixture | FAIL: authorization 401; external acceptance gate not closed |
| `git diff --check` | PASS; repository LF→CRLF warnings, no whitespace errors |

Первый sandboxed npm test attempt упал на `spawn EPERM`, не на assertion failures. Повтор обычной команды вне sandbox реально выполнил все 542 теста. Full Rust suite содержит real backup/version compatibility/fault rollback/path traversal tests, export/asset GC/search/security и Markdown/CAS coverage. Existing test assertions не удалялись ради green state. Итог 542 = принятые 520 + 22 new behavioral cases; Rust 261 = прежние 255 + 6 new unit/process cases; live fixture — отдельный intentional ignored test.

Main frontend chunk 334.53 kB (gzip 99.62), editor-runtime 473.82 kB; export PDF остаётся lazy worker 2,287.91 kB. New runtime services не добавляют npm dependencies. Rust dependencies `arboard = 3.6.1` и `image 0.25` нужны для настоящего OS HTML/bitmap clipboard и bounded PNG decoding; Cargo.lock обновлён без version bump.

New modules не содержат payload logging. Existing LLM diagnostics остаются под `cfg(debug_assertions)` и не выводят key/prompt/content/reasoning. HTTP Authorization хранится только backend-side, не в frontend/SQLite/localStorage/backup; subprocess config передаётся stdin. В raw stream IPC передаются только content/reset; provider response envelope не экспортируется. Это проверка новых code paths и existing regression, не обещание абсолютно полного независимого security audit всего продукта.

Known remaining implementation limitation: multi-file ingestion готовит managed records последовательно; при поздней ошибке документы не получают partial insertion, но уже подготовленный managed record может остаться owned note. Completed job snapshots/drafts живут в RAM текущего приложения, не являются новым persistent storage; crash/restart-resume generation не добавлялись. Формулы, revision retention, attachment canonical storage и другие RC4 задачи не перерабатывались.

Final build/isolated FTS/explicit TS→SQLite gate и final Git snapshot будут дописаны ниже после завершения команд, без удаления предыдущих результатов.

### Completed final build, P0 persistence and Git gates

`npm run tauri build`: **PASS**, release compilation **1m 41s**, NSIS + English/Russian MSI созданы; actual outputs проверены на наличие и актуальное время записи:

- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.3_x64-setup.exe` — 5,987,255 bytes.
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.3_x64_en-US.msi` — 8,073,216 bytes.
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.3_x64_ru-RU.msi` — 8,073,216 bytes.
- `D:\Projects\NoteFlow\src-tauri\target\release\noteflow.exe` — 20,841,472 bytes.

Только локальные candidate outputs; published RC3/release staging/GitHub assets не заменялись. Version во всех canonical sources остаётся `1.0.0-rc.3`, MSI mapping `0.99.3`, productName `NoteFlow`, identifier `com.noteflow.desktop`. Install/run release build на пользовательском профиле не выполнялись; наличие installers не равно installed QA PASS.

Финальный **isolated** `cargo test search_performance_on_ten_thousand_notes -- --ignored --nocapture --test-threads=1`: PASS, fixture 10,000 notes; indexing **11.6791985 s**, query **654.4 µs (0.6544 ms)**; test total 11.70 s. Перед этим tauri dev остановлен, frontend/Rust builds и tests завершены; во время этого benchmark другие команды не запускались. Ранний overlapping benchmark не используется как final clean measurement.

`npx tsx scripts/qa/rc4-formatting-sqlite.mts`: **PASS** после всех A–F изменений. Настоящий TipTap serializer → SQLite logical saves → reopen → canonical Markdown/sidecar load, **10 cycles**, **10 stale CAS conflicts rejected**. Exact text/document и partial underline сохранены, load не использует JSON cache fallback. Canonical Markdown `1. **Стоимость следующая** \\-`; лишних `****` нет. New synthetic fixture `%TEMP%\noteflow-rc4-formatting-kkWO0Y`. Native QA в machine result честно `NOT TESTED`.

Final Git: branch `fix/rc4-clipboard-and-dragdrop`; HEAD `ed311a5c64961223b36db17e60f45ad6581b2b90`; **24 tracked modified / 21 untracked**, staged changes отсутствуют. В untracked входят 7 ранее существовавших QA files, они не удалялись. `git diff --check`: PASS; отдельный `git -c core.autocrlf=false diff --no-index --check -- NUL <file>` для всех **21 untracked file: PASS**, whitespace diagnostics отсутствуют. Commit/tag/push/merge/version bump/GitHub Release не выполнялись.

**NEEDS MORE WORK**

Осталось не исправление принятого P0, а acceptance gates: рабочая Bridge authorization и повторный live chat/stream/embeddings/RAG smoke; native clipboard/drop/image/background/draft checks; безопасный installed production-like smoke и restart persistence новых UI сценариев. Только после фактического подтверждения этих пунктов допустим `READY FOR USER RC4 FULL SMOKE`. Никакой отсутствующий native/Bridge результат не заменён зелёными unit tests. На этом continuation остановлен без release actions.

## Final Blockers Investigation & Native QA — 08.10.2026

### Scope and changes

До обновления ключа проведено отдельное расследование, после ответа пользователя «ключ обновил» повторены live requests. Production transport, frontend, P0 serialization/CAS, migrations, версии и дизайн в этом corrective checkpoint не менялись. Изменения только в test modules:

- `src-tauri/src/llm.rs`: explicit ignored authorization investigation.
- `src-tauri/src/llm_transport.rs`: real loopback TCP/curl wire regression для Bearer, JSON Content-Type, browser-compatible User-Agent и `stream` flag.
- `src-tauri/src/data.rs`: расширен существующий synthetic live fixture: Bridge Stop, note-scoped generation/history/reopen, новый autosave generation и реальные automatic-worker functions.
- Этот отчёт дополнен без удаления прежней диагностики.

### Bridge 401 root cause

Read-only metadata открывались из существующего профиля; ключ получался только Rust `SystemSecretStorage` через Windows Credential Manager. Заметки и history пользователя не читались и не отправлялись. В output нет ключей, Authorization values, prompt/content, reasoning, vectors или response body; assertions с реальным ключом проверяют boolean, не печатают сравниваемые secrets. Test-only diagnostics не компилируются в production executable.

До обновления: credential присутствует; нет outer/internal whitespace или embedded `Bearer ` prefix; JWT expiry hint отсутствует (не доказательство действительности). Для каждого запроса verified exact `Bearer {saved key}` и один Authorization header, корректный host/base/path, User-Agent; тело POST — JSON object. Сервер отвечал на generation/embedding HTTP 401, safe response classification — `invalid_credential`. Каталог отвечал 200 даже **без** Authorization, поэтому `/models` не является auth acceptance test.

После обновления ключа тем же кодом получены chat 200 и embedding 201, и в debug, и в optimized release test binary. Это подтверждает credential-side причину прежнего 401, а не потерянный header или необходимость WAF bypass. Почему именно прежний ключ стал invalid (отзыв, старый/ошибочный ключ и т. п.), без server audit определить нельзя; expiry или недостаток scope не объявляются установленным фактом.

| Hypothesis | Evidence / verdict |
| --- | --- |
| A: Authorization не передан | исключено: header присутствует на уровне provider request и реального curl wire regression |
| B: клиент подменил/исказил saved key | исключено: exact match + отсутствие whitespace/double prefix; первоначально неверный stored credential этим не исключался |
| C: credential недействителен | подтверждена server classification до update; после user update успешные requests |
| D: insufficient scope | отдельного подтверждения нет; новый ключ имеет доступ к проверенным endpoints |
| E/F: extra gateway auth / changed contract | нет подтверждения: существующий Bearer и JSON contract работают после обновления |

Content-Type проверен на реальном loopback POST обоих transports. URL assembly проверен для `/api/v1/models`, `/api/v1/chat/completions`, `/api/v1/embeddings`. Tauri capabilities/CSP не являются источником 401: network выполняет Rust curl, не WebView fetch. Windows secure-storage code path общий для debug/release. HTTP 403 не получен; TLS verification, redirects policy, bounded timeouts и server access policies не ослаблены. Не добавлены retries, выдуманный catalog, fallback answers или frontend keys.

Diagnostic wrapper показывает `input_stream_flag` **до** ControlledHttpClient mutation. Wire test отдельно подтверждает, что actual streaming POST содержит `stream: true`; real content chunks ниже не являются имитацией готового ответа.

### Live retest after user credential update

Base URL: `<configured Bridge base URL>`.

| Real operation | Result |
| --- | --- |
| `GET /models` | HTTP 200; OpenAI-compatible model catalog, 2 IDs: `cifra48/agent`, `cifra48/llm`; capability metadata отсутствует |
| Catalog embedding presence | `cifra48/embedding` отсутствует в catalog; используется существующий saved embedding profile, не hardcoded discovery list |
| `POST /chat/completions`, both catalog models, normal | HTTP 200; non-empty final content |
| `POST /chat/completions`, both models, stream=true | HTTP 200; 4 actual content chunks для каждой модели в final fixture |
| `POST /embeddings`, saved `cifra48/embedding` | HTTP 201 в auth probe; embedding test success, 1024 dimensions |
| Temporary 3-note index | indexed 3, failed 0 |
| All / Project / Standalone hybrid + grounded generation | sources 3 / 1 / 1; scope assertions PASS; grounded, citation repair не требовался |
| Backend Stop after first actual content delta | cancellation observed, no final answer accepted; 628 ms от начала запроса, **не** отдельное измерение cancel-to-exit latency |
| Note-scoped AI | actual `run_note_ai_request` success; user+assistant history 2, unrelated note history empty; preserved after DB reopen |
| Automatic knowledge update | real autosave queues changed content generation; worker `drain_local_queue` + `update_profiles` PASS with actual embedding provider; profiles current |

Auth probe debug: PASS, 8.87 s. Auth probe optimized release (`debug_assertions=false`): PASS, 18.26 s. Initial basic scoped Bridge fixture: PASS, 10.57 s. Final expanded fixture: **PASS, 11.49 s**; synthetic profile `%TEMP%\noteflow-test-ff35cfcf-d5b6-42ec-afff-9cb0b6e2ab2d`.

Между этими запусками один expanded fixture **FAIL**: Stop ожидал первый delta для запроса с 200 именами, но content delta не поступил. Этот запуск не зачтён как Stop PASS; auth/RAG до Stop работали. Test input заменён на короткий уже наблюдавшийся streaming scenario; строгие проверки real delta, cancellation и rejection final result сохранены. Точная причина отсутствия content для длинного синтетического запроса не установлена; это не доказательство auth regression и не подтверждение безусловной streaming availability для любого prompt. Native long-response smoke остаётся необходимым.

Automatic-worker functions здесь реально выполнили network/index flow на temporary profile; timing/debounce background thread и automatic state в реальном UI отдельно не подтверждены. Background request ownership, UI unmount/reopen и scoped Stop покрыты mounted behavioral/loopback tests, **но live native panel navigation не объявляется PASS**. Backend note smoke использует существующий production note request/history persistence, а не заменяет полный Tauri IPC/UI flow.

### Native and packaged Windows QA

Успешно собран embedded-frontend candidate: `npm run tauri build -- --debug --no-bundle`, frontend 34.01 s (параллельно с release compile), Rust 1m 09s. Он реально запущен с debug-only `NOTEFLOW_DEV_DATA_DIR=%TEMP%\noteflow-rc4-formatting-kkWO0Y`; адрес frontend `http://tauri.localhost/`, не dev server. Screenshot 1536×816 и accessibility tree показывают профиль `RC4 Formatting QA`, три synthetic notes, сохранённый bold + partial underline без `****`. Это launch/read-formatting observation, не native editing PASS и не installed production PASS.

Первый accessibility click не изменил выбранную заметку; после свежих window selection/activation/screenshot единственный coordinate retry снова вернул `outside window bounds { originX: 0, originY: 0, width: 14, height: 14 }`. Дальнейшие inputs остановлены, DOM imitation не использовалась. Только собственный QA-process закрыт перед финальной сборкой; существующий пользовательский процесс/профиль не затронут. Ошибка automation geometry не объявлена дефектом NoteFlow.

Release build игнорирует debug data-dir override. Ради QA этот privacy/security guard не ослаблялся; запуск installed release на real user profile не выполнялся. Для настоящего isolated installed candidate нужен отдельный Windows test user/environment либо безопасная уже согласованная QA-процедура; debug embedded launch этого не заменяет.

### Remaining user smoke checklist — native NOT TESTED

На отдельном QA-профиле, только с временными заметками и тестовыми файлами:

1. Telegram/Word/Notepad → rich text/plain text через Ctrl+V и ПКМ → «Вставить»: форматирование, один insert, autosave.
2. Explorer/Desktop → несколько изображений и документов: правильная позиция, без дублей, ignored drop вне editor; 100% и 160%.
3. Edited/cropped image → «Копировать изображение» → Paint/Word/Telegram: bitmap текущего изображения, не URL и не original.
4. «Сохранить изображение…»: native Save As/cancel, actual PNG и текущий crop/drawing result.
5. RAG draft → Notes → возврат; переключить chats/scopes: текст не потерян, не отправлен автоматически, conversations не смешаны.
6. Bridge и Ollama generation → закрыть sidebar/сменить раздел/вернуться: реальный stream и полный ответ; проверить длинный ответ; Stop не сохраняет late assistant result.
7. Auto-index после правки temporary note; all/project/standalone sources и citations открывают правильные fragments, note chat не смешивает notes.
8. Restart: notes/images/attachments/chat history и bold + partial underline сохранены, `****` не появился; проверить на installed isolated candidate отдельно.

### Final regression checkpoint

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **542/542 PASS**, 74 suites; 15.930 s |
| `npm run build` | PASS; Vite 12.71 s |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS; 3.06 s |
| `cargo test` | **262 PASS, 10 intentional ignored, 0 fail**; 19.86 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS; 4.79 s |
| `npm audit --omit=dev --offline=false` | PASS; **0 vulnerabilities** |
| explicit Bridge debug/release auth probes | PASS after user key update; actual chat 200 / embeddings 201 |
| expanded Bridge synthetic live fixture | PASS; actual stream, embeddings, RAG, note chat, worker update, backend Stop |

Один sandbox `npm run build` attempt завершился `spawn EPERM` при запуске esbuild. Повтор той же команды с разрешённым subprocess execution PASS; это не скрытый source/build assertion failure. Добавлен один regular Rust wire test и один explicit ignored investigation; frontend test count не изменён. Все diagnostic/live additions находятся под `cfg(test)`, production payload logging не добавлялось.

### Git / release boundaries

Branch `fix/rc4-clipboard-and-dragdrop`, HEAD `ed311a5c64961223b36db17e60f45ad6581b2b90`. **24 modified tracked / 21 untracked**, staged 0. Canonical package/package-lock/root lock package/Cargo.toml/Cargo.lock/tauri.conf versions: **1.0.0-rc.3**. `productName=NoteFlow`, `identifier=com.noteflow.desktop`, MSI mapping `0.99.3`. Принятый P0 и все уже внесённые A–F изменения сохранены. Commit/tag/push/merge/release/version bump не выполнялись.

### Completed candidate and final verdict

`npm run tauri build`: **PASS**, frontend 12.55 s, optimized Rust compilation 1m 18s. Actual final files существуют и проверены по времени записи 08.10.2026 23:56–23:57:

- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.3_x64-setup.exe`: 5,986,016 bytes.
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.3_x64_en-US.msi`: 8,073,216 bytes.
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.3_x64_ru-RU.msi`: 8,073,216 bytes.
- `D:\Projects\NoteFlow\src-tauri\target\release\noteflow.exe`: 20,841,472 bytes.

Это только локальные outputs: существующий опубликованный RC3, staging и GitHub assets не заменялись. Installed isolated QA остаётся NOT TESTED.

Повторный isolated FTS benchmark после завершения всех сборок/tests и закрытия собственного QA-процесса: **PASS**, 10,000 notes, indexing **11.6277829 s**, query **650.1 µs**, total test 11.64 s. Во время измерения другие команды не запускались.

`git diff --check`: **PASS**, whitespace errors отсутствуют; Git предупреждает только о существующей LF→CRLF policy. Дополнительная no-index whitespace проверка всех **21 untracked file**: diagnostics отсутствуют, PASS. Для `--no-index` exit code 1 означает различающиеся файлы, не whitespace failure; первоначальная wrapper-проверка ошибочно считала этот код failure и была исправлена без изменения проверяемых files. Final working tree: **24 tracked modified / 21 untracked / staged 0**; HEAD/branch/version не изменены.

**READY FOR USER RC4 FULL SMOKE**

401 blocker закрыт credential update и подтверждён actual debug/release requests; production client patch не потребовался. Реальные backend live gates и полный automated regression зелёные. Следующий шаг — выполнить восемь пунктов native checklist выше на безопасном QA-профиле, включая isolated installed candidate. Clipboard/drop/native dialogs/background panel navigation/restart UI **не** объявляются пройденными. Вердикт означает готовность к **пользовательскому smoke**, а не полную приёмку RC4 или разрешение release. На этом этапе работа остановлена, Git/release actions не выполнены.

## RC4 FINAL USER FEEDBACK CORRECTIVE

Дата: **09.10.2026**. Задание: native clipboard files/images, image-menu labels, note AI drafts и повторная проверка background AI. Все предыдущие RC4/P0 изменения сохранены. Ниже результаты именно этого pass; более ранние counts и native automation errors выше являются историческими.

### 1. Image menu

Точные пункты: **Рисовать → Описание изображения → Сбросить изменения → Копировать → Сохранить… → разделитель → Удалить изображение**. Изменены только два idle label в `ImageNodeView.tsx`. Существующие copy/save handlers, native Save As, processed image, размеры, иконки и destructive semantics сохранены. Mounted TipTap/React regression проверяет все шесть labels, порядок, separator и последний danger action. Реальный menu при 100%/160% пока PENDING USER SMOKE.

### 2. Clipboard architecture and priority

`read_editor_clipboard` выполняет native snapshot в Rust `spawn_blocking`, затем использует существующий managed attachment import. Frontend получает typed text/HTML/attachment DTO, не произвольный filesystem API. Ctrl+V и существующий context-menu Paste вызывают один editor pipeline; Ctrl+Shift+V сохраняет plain-text semantics. Повтор клавиши/одновременный paste не создаёт второй batch.

Windows file-list читается через **CF_HDROP / DragQueryFileW**. Bitmap: registered PNG/JPEG formats, затем **CF_DIBV5 / CF_DIB**. Unicode/HTML fallback использует существующий arboard. Очерёдность: подтверждённые files → настоящие image bytes → HTML → plain text. Files/image подавляют их текстовое и HTML-представление, поэтому путь и дублирующая картинка не вставляются. Clipboard sequence guard отклоняет сменившийся clipboard snapshot. Не используются PowerShell/cmd, поиск файла по текстовому пути или hardcoded content.

Native clipboard lock закрывается RAII до decode/import. На других платформах сохранён arboard path для file-list/image/text; реальный macOS smoke не выполнялся.

### 3. Bitmap and image handling

PNG/JPEG/WEBP декодируются существующей `image` library и нормализуются в managed PNG. Добавлена только BMP feature этой же зависимости. Для packed DIB применяется bounded BMP-header adapter: pixel decoding остаётся библиотечным. Реальный DIBV5 fixture обнаружил неверный offset при прямом `new_without_file_header` для embedded bit masks; adapter задаёт правильный offset без ручного pixel decoder.

Проверены обычный DIB, DIBV5 с alpha, encoded PNG/JPEG и ошибочные/слишком большие payloads. Поддержаны INFO/V4/V5 headers; unsupported core/metafile formats и DIBV5 с внешним ICC profile не имитируются и безопасно отклоняются. Browser Copy Image / Snipping Tool / Paint используют этот путь, если приложение предоставляет поддержанный bitmap. Реальные передачи из этих программ, Telegram и Word пока **PENDING USER SMOKE**.

### 4. Shared assets and multi-file batch

Clipboard использует те же `store_attachment_from_path` / `store_attachment`, что existing drag/drop: attachmentPolicy, signature/extension/size validation, sanitized filename, SHA-256 managed assets, references/GC, autosave/CAS, backup/restore. PNG/JPEG/WEBP становятся editor images; PDF/DOCX/XLSX/TXT/ZIP и другие разрешённые документы используют существующую attachment card. Нового storage/attachment UI нет.

Порядок CF_HDROP сохраняется, повторные paths deduplicate-ятся; Windows comparison case-insensitive. Один frontend insert transaction заменяет текущую selection всем batch и поддерживает undo/redo. Ошибка отдельного файла не удаляет успешные импорты; показан безопасный partial-failure toast.

Настоящий temporary SQLite/filesystem integration fixture импортирует PNG/JPEG/PDF/DOCX/TXT, сохраняет canonical document, удаляет original files, reopen-ит DB, выполняет backup/restore и сравнивает bytes всех managed files. Это подтверждает storage persistence и независимость от originals, но не заменяет Explorer/native app restart smoke.

### 5. Clipboard security and text regression

Именованные limits: **32 files**, text/HTML **4 MiB**, encoded image/output PNG **25 MiB**, raw DIB **128 MiB**, decode allocation **128 MiB**, **16 million pixels**, dimensions до **8192×8192**. Документы сохраняют existing attachmentPolicy limit **512 MiB**. До импорта проверяются absolute local path, отсутствие parent traversal, UNC/device paths; directory/symlink/type/size checks выполняет общий assets layer. File-list не превращается в plain paths при ошибке.

HTML разбирается в inert document. Remote/file/data `<img>` заменяются alt text; допускается только canonical managed asset image, `srcset` удаляется. Внешние изображения автоматически не скачиваются. Strong/link/table/text parsing остаётся через существующий ProseMirror schema/paste sanitization; plain text/Markdown input не заменён новым serializer.

Проверены Cyrillic/emoji/multiline, Markdown, rich text, selection, undo/redo, clipboard read failure, HTML/image precedence, canonical reload, oversized/invalid/missing files и empty payload. Async paste запоминает note ID/reload generation/document/selection; при смене note/focus/document/selection или destroy не вставляет результат в случайный editor. Импортированные до stale check assets проходят существующий reference cleanup; это не обещание rollback всего asset ingest при проигнорированном paste.

Новые clipboard/draft/background modules не содержат console/log/println diagnostics. Пути/clipboard bytes/текст заметок/keys не добавлены в logs. Tauri capabilities не расширялись wildcard; secrets не выходят во frontend; clipboard не вызывает AI/network upload. Это scoped audit изменений, не заявление о проверке всех внешних программ.

### 6. Note AI drafts

Existing RAG draft store вынесен в общий `ChatDrafts`; `RagDrafts` сохраняет прежний API. `noteChatDrafts` имеет отдельный singleton и стабильный `noteId`. SQLite сейчас содержит **один note-scoped conversation на заметку**; выдуманных multiple conversations не добавлено. RAG по-прежнему использует conversation IDs.

`NoteChatPanel` подписывается через `useSyncExternalStore`. Draft переживает close/reopen, unmount, navigation и A/B note switching без постоянно mounted sidebar. Сохраняются точные пробелы, переносы, Cyrillic/English/emoji. Набор draft не вызывает provider API и не создаёт history message.

Clear происходит после принятия user message send pipeline, при manual clear и успешном удалении note/workspace. Error/Stop восстанавливает исходный текст только для актуального request и неизменённого draft revision: новый текст не перезаписывается, manual clear и deleted conversation не воскресают. При accepted workspace import/reset drafts очищаются после authoritative workspace apply; существующие stop/drain/CAS guards сохранены. Import DB success с последующей UI reload failure остаётся recovery concern существующего workspace flow, не решается новым parallel restore mechanism.

Оба draft store **session-only**, как прежний RAG: process restart не сохраняет неотправленные drafts. Это не регрессия обещанного RAG persistence и не новая SQLite/localStorage база.

### 7. Background ownership, Stop and cleanup

Note/RAG jobs остаются application-owned, не привязаны к panel mount. Note context и исходный RAG scope фиксируются до async work. Mounted behavioral tests с реальными Tauri Channel objects и deterministic invoke mocks проверяют partial → unmount/navigation → remount → partial/full, original binding, citations/sources, один provider call и один assistant message.

Stop после remount передаёт original backend request ID; поздние результаты игнорируются. Две note jobs изолированы; drafts других notes не меняются. Delete/forget/reset отменяют и забывают job, late response не сохраняет assistant и не восстанавливает draft. Исправлена очистка abort-controller token в `AiBackground.forget`, чтобы forgotten job не оставляла token. Unsubscribe и Tauri channel end-marker cleanup проверены автоматически. Это deterministic streaming integration, **не физическая native navigation**.

### 8. Real Bridge and Ollama

Использованы синтетические temporary profiles; существующая Bridge configuration прочитана read-only, credential остаётся в Rust SystemSecretStorage. Реальные keys/notes/models пользователя не изменялись. Ненужные повторные дорогие запросы не запускались.

| Live backend fixture | Bridge | Ollama |
| --- | --- | --- |
| Model discovery | HTTP 200; 2 chat IDs: `cifra48/agent`, `cifra48/llm` | `/api/tags` 200; 2 local models |
| Chat normal + actual stream | HTTP 200 для обоих IDs; по 4 content chunks | HTTP 200; 6 content chunks |
| Embeddings | saved `cifra48/embedding`, success, 1024 dims | `bge-m3:latest`, success, 1024 dims |
| Synthetic index | indexed 3 / failed 0 | indexed 3 / failed 0 |
| All/project/standalone grounded RAG | sources 3/1/1; correct scope, no repair | sources 3/1/1; correct scope, no repair |
| Backend Stop after actual delta | final result rejected; 620 ms | final result rejected; 191 ms |
| Note history/worker/reopen | PASS; unrelated note history empty | PASS; unrelated note history empty |
| Fixture total | 41.35 s | 16.00 s |

Stop цифры выше измерены **от начала запроса**, не cancel-to-exit latency. Embedding fixture подтверждает success/dimensions; wire status 201 установлен в предыдущем auth probe, а не повторно выдуман для этого запуска. Live fixtures подтверждают transport/backend persistence на синтетических данных; panel navigation и длинный ответ в реальном UI остаются user smoke.

### 9. Automated gates and P0 repeat

| Check | Final result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **565/565**, 75 suites, 0 fail/skip; **15.573 s** |
| `npm run build` | PASS; standalone 12.47 s; latest final beforeBuild 17.27 s |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS; 2.28 s |
| `cargo test` | **267 PASS / 10 intentional ignored / 0 fail**, 18.13 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS; 4.26 s |
| `npm audit --omit=dev --offline=false` | PASS; **0 production vulnerabilities**, repeated after final build |
| `npm run tauri build -- --debug --no-bundle` | PASS; final embedded candidate includes HTML image guard |
| `npm run tauri build` | PASS; Vite 17.27 s, optimized Rust 2m 49s; NSIS + 2 MSI |
| isolated FTS 10,000 notes | PASS; indexing **12.7075304 s**, query **492.3 µs**, test 12.72 s |
| `git diff --check` | PASS; no whitespace errors |

FTS запущен отдельно после сборки, без dev/build/QA app overlap. Прежний isolated checkpoint был 11.628 s / 650.1 µs; новый query быстрее, indexing примерно на 9% дольше. Это разные wall-clock прогоны, не controlled before/after attribution clipboard code; strict benchmark assertions PASS.

Added regular cases: **23 frontend** и **5 Rust**, относительно предыдущих 542/262. `aiBackground.test.ts`, `phaseCEditor.test.ts`, `ragWorkspace.test.ts` проверяют mounted interaction, real TipTap document, async races и mock Channel; Rust clipboard/data tests используют actual decoder, migrations, DB и filesystem, не source-regex. Explicit live/performance probes выполняются отдельно от regular suite.

Принятый P0 повторён через `npx tsx scripts/qa/rc4-formatting-sqlite.mts`: **10 cycles / 10 stale writes rejected**, real TipTap serialize → SQLite save → authoritative Markdown/sidecar reload → DB reopen. Canonical output `1. **Стоимость следующая** \-`, без `****` и duplicated letters; JSON cache fallback не использовался. Checklist/table/formula, backup/export, native drop и existing image transforms входят в full regression, без переписывания serializer/storage.

Sandbox-only попытки Node spawn/Cargo path access были отклонены окружением; те же команды после разрешённого execution PASS. Ошибки окружения не объявлены source-test failures и не скрыты как успешные первые попытки.

### 10. Actual Windows / packaged / restart evidence

Собственный debug embedded candidate действительно открыт с temporary `NOTEFLOW_DEV_DATA_DIR` (`noteflow-rc4-formatting-Bmfydq`). Screenshot/accessibility показывают `http://tauri.localhost/`, профиль `RC4 Formatting QA`, три synthetic notes и корректный bold/partial underline. Это **реальное launch/read observation**; не DOM imitation.

Accessibility click по другой заметке не изменил selection; после свежего screenshot coordinate retry дал hover, но переход не произошёл. Несмотря на успешный API return, input не засчитан PASS; дальнейшая native automation остановлена. В отличие от прошлого checkpoint, новый запуск **не** вернул ошибку 14×14 bounds. Собственный QA-process закрыт через Alt+F4, отсутствие процесса проверено; пользовательское окно/профиль не закрывались и не мутировались.

Release ignores debug-only data-dir override: guard не ослаблен. **Installed isolated production QA NOT TESTED**; нужна отдельная безопасная Windows environment/profile процедура. DB reopen/assets backup/history tests PASS, но физический close/restart/native attachments/history UI **PENDING USER SMOKE**. Native source-program clipboard formats и image-menu zoom также пока не приняты.

### 11. Final local artifacts

Final files действительно созданы 09.10.2026 09:25 local time:

| File | Bytes |
| --- | ---: |
| `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.3_x64-setup.exe` | 6,040,538 |
| `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.3_x64_en-US.msi` | 8,151,040 |
| `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.3_x64_ru-RU.msi` | 8,151,040 |
| `src-tauri/target/release/noteflow.exe` | 21,037,056 |

Корень этих paths: `D:\Projects\NoteFlow`. Только локальная пересборка candidate; опубликованный RC3, release staging и GitHub assets не заменялись. Signing/release acceptance этим pass не объявляются.

### 12. Remaining mandatory user smoke

Все действия ниже на безопасном QA-профиле с временными заметками и файлами:

1. Explorer image, PDF/DOCX и mixed multi-files → Ctrl+C → Ctrl+V и ПКМ Paste; caret/selection, один batch, undo/redo; удалить originals, проверить assets.
2. Browser Copy Image, Snipping Tool screenshot, Paint, Telegram/Word supported image → paste. Обычный Telegram/Word/Chrome/Notepad rich/plain text, links/tables/Cyrillic/emoji продолжают работать.
3. Image overflow: точный новый порядок/labels, 100% и 160%; Copy актуального cropped/drawn bitmap, Save As/cancel.
4. Note A draft → close/reopen/navigation; A/B isolation; manual clear; accepted Send/error; без автоматического запроса. Session restart draft persistence не обещается.
5. Note A real stream → sidebar close/Note B/navigation → A до и после completion; original context, partial/full, no duplicate; Stop после возврата. При возможности параллельная Note B job.
6. Global RAG stream → Notes/Settings → return; original scope, sources/citations, no duplicate; explicit Stop. Bridge и Ollama, включая длинный ответ.
7. Delete только temporary note/conversation во время stream; late result не восстанавливает данные.
8. Close/restart: saved notes/files/images/history доступны, originals не нужны, P0 bold/partial underline без `****`; installed isolated candidate отдельно.

### 13. Changed files and Git boundaries

Изменения этого pass находятся в:

- `src-tauri/Cargo.toml`, `src-tauri/src/clipboard.rs`, `src-tauri/src/data.rs`, `src-tauri/src/lib.rs`.
- `src/features/editor/EditorArea.tsx`, `EditorContextMenu.tsx`, `editorPaste.ts`; `src/features/imageEditor/ImageNodeView.tsx`.
- `src/shared/ChatDrafts.ts`, `src/features/rag/ragDrafts.ts`, `src/features/note-chat/NoteChatPanel.tsx`, `src/app/AppShell.tsx`.
- `src/services/clipboardService.ts`, `dataService.ts`, `aiBackground.ts`, `noteChatBackground.ts`, `ragBackground.ts`.
- `tests/aiBackground.test.ts`, `tests/phaseCEditor.test.ts`, `tests/ragWorkspace.test.ts`, этот отчёт.

Некоторые перечисленные файлы уже были modified/untracked до pass. Другие dirty files, включая прежние Cargo.lock/serializer/RAG/transport changes и QA reports, сохранены. Новый отдельный untracked source file этого pass: `src/shared/ChatDrafts.ts`.

Final working tree: **24 tracked modified / 22 untracked / staged 0**. Branch **`fix/rc4-clipboard-and-dragdrop`**, HEAD **`ed311a5c64961223b36db17e60f45ad6581b2b90`**. Package/package-lock/Cargo/tauri versions **1.0.0-rc.3**, MSI mapping **0.99.3**, product **NoteFlow**, identifier **com.noteflow.desktop**. Version source не изменён. Commit/tag/push/merge/release/git add не выполнялись.

`git diff --check` и дополнительная no-index whitespace проверка всех **22 untracked files** PASS. Имеются только существующие Git LF→CRLF policy warnings; whitespace errors отсутствуют. No-index exit 1 означает наличие diff, не ошибку whitespace.

**READY FOR USER RC4 FINAL SMOKE**

Вердикт означает завершённые code/automated/backend live gates и готовность к указанному пользовательскому native smoke, **не native PASS и не разрешение выпуска RC4**. Следующий этап только пользовательская проверка; никаких release/Git действий до отдельного подтверждения.

## RC4 RELEASE CANDIDATE GATE — 1.0.0-rc.4

Дата: **09.10.2026**. Этот раздел заменяет историческое ожидание user smoke как актуальный статус, не удаляя предыдущую диагностику.

### Acceptance and release scope

Пользователь явно подтвердил final RC4 functional smoke: «Всё работает, можно сохранять, коммитить и заливать на GitHub». Разрешены version bump, selective commits, release-branch fast-forward, annotated tag и отдельный GitHub prerelease **v1.0.0-rc.4**. Это пользовательское подтверждение, не заявление о новых native inputs через automation Codex.

В этом release pass business logic и UI не изменялись. Изменены canonical app versions, MSI mapping, README/release checklist/notes и существующий version-mapping test (теперь проверяет каждый `1.0.0-rc.N`, а не только rc.1). Предыдущие RC4 changes и P0 сохранены. Старые семь intentional local QA-файлов не включаются в commit; fingerprints сохранены для финальной проверки. Public report обезличивает temporary profile paths и configured server address, сохраняя результаты.

### Fresh final gates after version bump

| Gate | New run on rc.4 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | **565/565**, 75 suites, 0 fail/skip; **34.421 s** |
| `npm run build` | PASS; Vite **12.94 s** |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS; **28.75 s** |
| `cargo test` | **267 PASS / 10 intentional ignored / 0 fail**; **22.13 s** |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS; **13.11 s** |
| `npm audit --omit=dev --offline=false` | **0 production vulnerabilities** |
| P0 real TipTap serializer → SQLite/reopen | **10 cycles / 10 stale CAS writes rejected**, exact marks/text; no `****` |
| Isolated FTS 10,000 notes | indexing **11.4161427 s**, query **660.1 µs**, test **11.43 s** |
| Bridge synthetic live | **PASS, 13.45 s**; actual HTTP 200 normal/stream, embeddings 1024 dims, grounded scopes, Stop, history/reopen/worker |
| Ollama synthetic live | **PASS, 18.41 s**; actual HTTP 200 normal/stream, embeddings 1024 dims, grounded scopes, Stop, history/reopen/worker |
| `npm run tauri build` | **PASS**; Vite **13.02 s**, optimized Rust **1m 35s**, bilingual MSI + NSIS |

FTS не запускался одновременно с Rust/Tauri build или dev/QA app. Live requests использовали синтетические temporary notes, read-only provider metadata и существующий разрешённый OS credential; пользовательские notes/keys/settings не изменялись. Stop reject-final evidence: Bridge **622 ms**, Ollama **194 ms** от начала запроса, не cancel-to-exit latency. Никакой обход WAF/401/403 policies не добавлен.

Regular tests повторно покрывают text/rich paste, native payload parsing, PNG/JPEG/DIB, mixed batch, selection/undo, policy/asset validation, originals deletion, backup/reopen, GC, drafts/background mock Channels, original identity/scope, sources/citations, cancellation и late-response protection. Physical native сценарии ранее приняты пользователем; новый automated run не выдаётся за повтор той же ручной проверки.

### Version and installer metadata

Package/package-lock root/Cargo/Tauri: **1.0.0-rc.4**. About продолжает получать версию динамически через `getVersion`; UI не переписан. Actual application PE ProductVersion и NSIS ProductVersion: **1.0.0-rc.4**; app machine **AMD64 0x8664**. About нового native окна отдельно не открывался.

Read-only Windows Installer API подтвердил для обоих MSI:

- ProductName **NoteFlow**; ProductVersion **0.99.4**; Template **x64;0**.
- Language **1033 en-US** / **1049 ru-RU**.
- UpgradeCode **ff9d3de5-b119-5cb0-9873-43e30a097afa**, как у rc.3.
- MSI file table содержит только `noteflow.exe`, 21,037,056 bytes; пользовательские DB/QA files не включены.

NSIS generated config: `VERSION=1.0.0-rc.4`, `ARCH=x64`, `BUNDLEID=com.noteflow.desktop`. NSIS bootstrapper PE **0x014c** (обычный 32-bit installer stub) устанавливает **x64 application**, это не x86 NoteFlow build. Authenticode для EXE/NSIS/обоих MSI: **NotSigned**.

Upgrade ordering: **0.99.3 < 0.99.4 < 1.0.0**. Источник версии и UpgradeCode не переименовывались. Новая clean-install/upgrade/uninstall матрица на isolated Windows environment **NOT RUN**; реальные пользовательские данные ради installer QA не затрагивались. Предыдущая installer acceptance и новая functional acceptance не подменяют эту матрицу.

### Artifacts and checksums

Новые actual outputs скопированы в Git-ignored `releases/windows/1.0.0-rc.4/`. Публичная root-папка содержит только три installers и `SHA256SUMS.txt` (300 bytes). Existing staging script также сохранил standalone EXE и отдельный QA manifest в подпапке `qa/`; они **не** предназначены для GitHub upload.

| Public installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `NoteFlow_1.0.0-rc.4_x64-setup.exe` | 6,038,636 | `e53b0ba15313e0b92f8012ee1f3ba22672b88b08827db30acd841eab9c085aba` |
| `NoteFlow_1.0.0-rc.4_x64_ru-RU.msi` | 8,155,136 | `493c0b89c1cfce6529da478597e3d63cfd6a9fa2b6ab975ce914215f4ba2301c` |
| `NoteFlow_1.0.0-rc.4_x64_en-US.msi` | 8,155,136 | `e8d3942fb0a5c9c099b780c32e469adb27cdb145244456e33c45979b7bca3368` |

SHA-256 сверены между staged files и final build outputs. Remote downloads/checksum verification выполняются отдельным publication gate после upload; local hashes выше не выдаются за уже проверенные remote bytes.

### Selective staging and privacy checks

Предназначены для commits **40 functional files** (включая RC4 report, runtime modules/tests и P0 fixture runner) и **8 release files**, из которых Cargo.toml/lock пересекаются: dependency changes входят в functional commit, version-only изменения — в release commit. Всего **46 unique files**. Никакого `git add .`.

Сохраняются вне Git: шесть старых Phase B/C/D task reports и `scripts/qa/phase-b-provider.mjs`; references из runtime/tests/release workflow не найдены. Новые dependencies только уже принятые RC4 arboard/image; unrelated dependency versions не обновлялись.

Sensitive-literal scan intended files и tracked textual repository не обнаружил real keys/Bearer tokens/private keys. Первоначальный broad `sk-` pattern совпал с частью `task-...` filenames в старых README planning docs; word-boundary classification подтвердил false positive, файлы не изменялись. Старые installers, уже tracked до RC4, остаются историческим долгом репозитория: они не добавлены/изменены этим release pass; незапрошенный history cleanup не выполнялся.

Нет новых DB/backups/logs/.env/QA profiles в planned commit. Production dist не содержит source maps/dev server URLs. Production diagnostics содержимого clipboard/notes/prompts/reasoning/keys не добавлены; existing debug diagnostics и live probes ограничены debug/test code. Release notes не содержат server endpoints, credentials или персональных paths.

### Publication boundary

Release notes: `docs/release/rc-1.0.0-rc.4-notes.md`. README и Windows checklist обновлены. Выпуск должен быть **prerelease=true / draft=false / latest=false** с annotated `v1.0.0-rc.4` на проверенном release HEAD. RC3 remote tag/release/asset IDs, digests и notes сохранены read-only для сравнения после выпуска. До успешных push/upload/download/checksum gates статус **RELEASED не объявляется**.

Остаются честные ограничения: unsigned Windows, macOS production not validated, Windows 10 not separately validated, session-only AI drafts, no updater; new installer lifecycle QA not performed. Они явно перечислены в public notes.
