# Phase C: editor correctness

Дата финального прогона: 02.10.2026.

Проект: `D:\Projects\NoteFlow`. Ветка: `feature/rc3-product-polish`.
HEAD: `b53d8a171feb9e0f245127d7fb24d06f3baf008a`.
Версия приложения не менялась: `1.0.0-rc.2`.
ProductName: `NoteFlow`; identifier: `com.noteflow.desktop`.
Commit, tag, push и release не выполнялись. Phase D не начата.

## 1. Причина скачка курсора

`shouldReloadEditorDocument` разрешал повторную загрузку при изменении contentVersion
и отличии сохранённого документа от текущего документа редактора. Ответ собственного
autosave мог содержать отличающийся Markdown-round-trip/cache. Это приводило к
`setContent`, хотя пользователь продолжал редактировать актуальный ProseMirror doc.
Обновление документа сбрасывало selection и могло затирать более свежий локальный ввод.

## 2. Синхронизация редактора

Загрузка теперь разрешена при первом открытии, смене noteId или explicit
reloadGeneration. Обычный save acknowledgement не вызывает `setContent`, даже если
переданные cache/Markdown данные отличаются от текущего документа.
Restore/import с тем же ID продолжает использовать существующий explicit generation.
Не добавлены cursor timers, принудительный remount или key на основе времени.

## 3. Влияние на autosave safety

Не изменены AppShell, note persistence queue, CAS/content_version, backend transactions,
failed-flush navigation guard, retry, import и close coordination. Изменена только
политика повторной загрузки активного EditorArea. Existing persistence tests проходят.
Mounted behavioral tests проверяют собственный lossy save ack, десять последовательных
правок/ack, explicit same-ID restore и переключение на другую заметку.

## 4. Архитектура совместимых marks

StarterKit больше не регистрирует второй экземпляр явно подключённых Link, Underline
и Code. Inline parsing использует lexer `marked`, а не последовательность regex для
вложенных emphasis. Проверены bold/italic, bold/underline, italic/strike,
bold/superscript, italic/subscript, bold/code и совмещённые bold/italic/code.
Расширенные marks сохраняются через существующий sidecar.

## 5. Monospace / code

Используется настоящий TipTap Code mark с `excludes: ""`. Внутри редактора он может
сосуществовать с совместимыми marks. Portable Markdown содержит semantic code span;
дополнительные визуальные marks на этом же диапазоне сохраняются в sidecar.
Это не перевод редактора в JSON-only storage.

`@tiptap/extension-code` объявлен прямой зависимостью, поскольку используется напрямую.
Версия уже присутствовала транзитивно через StarterKit. `marked` добавлен как
небольшой production lexer для корректной вложенности inline marks и списков.
Новая UI-библиотека и дополнительные production browser runtimes не добавлены.

## 6. Highlight и text color

Marks остаются независимыми. Sidecar marks объединяются по типу mark, чтобы цветной
highlight заменял стандартный highlight из Markdown, а не создавал второй mark.
Команда установки highlight задаёт цвет вместо toggle, поэтому повторный выбор
цвета не снимает выделение. CSS code/mark наследует цвет текста.
«Убрать выделение» снимает только highlight; очистка text color снимает только цвет.
Тесты проверяют замену цвета, оба независимых reset и сохранение bold после reset.

## 7. Причина нарушения геометрии merge

Предыдущий Markdown serializer проходил физические клетки строки, не учитывая
логические слоты colspan/rowspan. Markdown parser создавал прямоугольную таблицу,
а старые span attrs из sidecar применялись к уже иначе расположенным клеткам.
Table normalization затем исправлял противоречивую геометрию, в том числе добавлением
слотов/колонок. Исправлять это ручным изменением количества столбцов было бы неверно.

Новый helper использует ProseMirror TableMap. Markdown проекция всегда имеет
логическую ширину таблицы, а covered slots остаются пустыми.

## 8. Таблица и Markdown после сохранения

Устранён ненужный save -> setContent -> Markdown parse цикл активной editing session.
Markdown остаётся persistence/export representation, а не способом перерисовывать
таблицу после команды. При настоящей загрузке sidecar восстанавливает валидированную
геометрию до применения cell appearance и text marks.

Подтверждены tests для horizontal/vertical merge, split, трёх повторных циклов
merge/split, add/delete row/column, цвета клеток и thick borders.
При внешнем изменении Markdown непустой covered placeholder не удаляется: старый
layout отвергается. При наличии нового layout span attrs не применяются второй раз.

## 9. Details

Добавлен editable NodeView с отдельной non-editable toggle button. Кнопка меняет
существующий open attr, имеет aria-expanded и понятный aria-label. CSS действительно
скрывает content, но не удаляет его из документа. Summary остаётся редактируемым.
При collapse selection внутри скрываемого body переводится к summary.
NodeView освобождает handlers при destroy. Open/closed state использует existing sidecar.

## 10. Divider

HorizontalRule остаётся полноценным узлом StarterKit и сериализуется как `---`.
Save acknowledgement больше не заменяет активный документ с divider.
Behavioral test вставляет divider, печатает рядом и проверяет Markdown reopen.
Отдельный reproducible сценарий потери из-за Backspace не установлен; обычное
намеренное удаление узла клавишей Backspace не блокировалось.

## 11. Context menu

`EditorContextMenu` подключён только к actual editor DOM. Обычные input/textarea/button
не перехватываются. Перед вторичным pointer action сохраняется SelectionBookmark.
Меню использует existing toolbar registry и общий `editorFormattingCommands`,
переиспользованный также FormattingToolbar. Color/highlight/link используют existing
EditorCommandPopover, а позиционирование, Escape и navigation - existing MenuPopover.

Bookmark восстанавливается только пока document snapshot актуален. Изменение текста
закрывает меню; asynchronous clipboard операции защищены operation token и проверкой
document equality. Clipboard failure показывает короткий toast. Copy/cut/paste доступны
только при доступном API; системные Ctrl+C/V/X не заменялись.

## 12. Tab по контекстам

Lists: стандартные sinkListItem/liftListItem; обработаны bullet, numbered и task items.
Code block: двухпробельный отступ/снятие отступа выбранных строк с mapping selection.
Paragraph/heading: indent attr 0..6, визуально через CSS и persistence через sidecar.
Raw leading tab не записывается в prose Markdown и не превращает paragraph в code.
Tables: обработчик уступает стандартной TipTap навигации между ячейками.
Не-editor inputs сохраняют обычное поведение Tab.

Дополнительный тест обнаружил неправильный шестипробельный отступ nested checklist:
checkbox marker ошибочно учитывался как ширина list prefix. Используется нормальный
двухпробельный list indent. Также сохранены несколько paragraphs, code/quote и
вложенные списки внутри list item; служебный lexer checkbox token не становится текстом.

## 13. Перенос текста

Normal prose имеет min-width:0, pre-wrap и overflow-wrap:anywhere без break-all.
Длинные URL/tokens не создают scroll всей области редактора. Code block сохраняет
pre formatting и собственную горизонтальную прокрутку с max-width:100%.
Browser geometry checks измеряют page/editor/prose overflow, а не только screenshot.

## 14. URL tooltip

NoteFlowLink расширяет existing TipTap Link renderHTML и сохраняет parent URI validation.
Безопасные anchors получают data-tooltip с URL. Используется общий TooltipPortal,
его существующая задержка и viewport positioning; длинный URL может переноситься.
Нет metadata fetch, favicon, OpenGraph или site preview.
Existing safe Ctrl/Cmd+Click opener flow не изменён; его regression tests проходят.

## 15. Formula removal

Удалены Formula nodes, commands, declarations, imports, click editing, insert form,
icon, serializer/parser branches, ChatMarkdown branches и CSS.
Production src не содержит Formula feature. `$$`, `$x$` и `$100` остаются обычным текстом.
Date nodes сохранены. Formula-only tests заменены проверкой обычных dollar strings
и отсутствия Formula commands. Не добавлена destructive migration.

## 16. Schema / sidecar

SQLite schema и Rust models не менялись.
Existing `editor_node_attrs_v1` получает optional tableLayouts; version/schemaVersion
остаётся 1, старые payload без нового поля продолжают читаться.
Layout содержит logical geometry, cell types и paragraph lengths, но не тексты клеток.
Markdown остаётся текстовым источником истины. Сохраняются indent, companion code marks,
цвета, Details open и существующие appearance attrs. Sidecar не попадает в clean .md.

## 17. Frontend tests

Последний `npm run test`: **372 passed, 0 failed**, 62 suites, 15.8118 s.
Новый `tests/phaseCEditor.test.ts`: 27 behavioral tests на actual editor extensions
и mounted EditorArea. Это не source-regex замена проверки DOM behavior.
Existing suites скорректированы только под новые legitimate contracts: explicit restore
generation, shared formatting commands, dynamic menu role и Formula removal.

Во время расширения tests были найдены и исправлены nested task indentation и служебный
checkbox token. Последний полный run после исправлений зелёный.
Первый sandbox test run не мог spawn Node workers (EPERM); полный run выполнен с
разрешённым запуском дочерних процессов. EPERM не скрыт как ошибка продукта.

## 18. Rust tests и полные проверки

Последний `cargo test`: **239 passed, 0 failed, 5 ignored**, 21.56 s.
Специально ignored: isolated Phase B seed, две real Bridge проверки, knowledge-agent
metadata benchmark и FTS benchmark. FTS отдельно выполнен и прошёл.
Bridge integration tests не запускались: editor scope не требует credentials/network.
Новые Rust tests не добавлены: backend persistence/schema не изменены.

| Проверка | Результат |
| --- | --- |
| npm run typecheck | PASS |
| npm run test | PASS, 372/372 |
| npm run build | PASS, Vite 3.79 s |
| cargo fmt --check | PASS |
| cargo check | PASS |
| cargo test | PASS, 239; 5 штатно ignored |
| cargo clippy --all-targets --all-features -- -D warnings | PASS |
| isolated FTS benchmark | PASS |
| npm run tauri dev | PASS startup/native QA, штатное закрытие |
| npm run tauri build | PASS, release Rust compile 2 min 11 s; NSIS и оба MSI созданы |
| git diff --check | PASS |

Frontend build: index 297.57 KB / gzip 87.91 KB; editor-runtime 478.98 KB / gzip 149.85 KB.
Финальные desktop build outputs (не опубликованы и не скопированы в release staging):

```text
D:\Projects\NoteFlow\src-tauri\target\release\noteflow.exe
D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.2_x64-setup.exe
D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.2_x64_ru-RU.msi
D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.2_x64_en-US.msi
```

MSI mapping остаётся `0.99.2`, конфигурация release не менялась.
Предупреждения Vite о chunk >500 KB нет. Cargo warnings в check/test/clippy нет.
Dev HMR при изменении экспортов пересоздавал модули; это dev-only поведение, не runtime
autosave. WebView2 при закрытии сообщил unregister Chrome_WidgetWin_0 error 1412,
но процесс и tauri dev завершились с code 0. Это отмечено, а не выдано за отсутствие logs.

## 19. FTS benchmark

Команда: `cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --exact --nocapture --test-threads=1`.
Запущен отдельно, без tauri dev, build и одновременно выполняющихся tests.
10 000 notes: database setup 2.3678 ms; schema 4.8831 ms; fixtures 5.5157 ms;
indexing **12.4585467 s**; query **975 microseconds**. PASS, 12.48 s total test time.

## 20. Native cursor QA

Настоящее debug Tauri/WebView2 окно, отдельный временный профиль:
`%TEMP%\noteflow-phase-c-20261001` через existing debug-only NOTEFLOW_DEV_DATA_DIR.
Пользовательская SQLite, реальные notes и credentials не затрагивались.
Создана QA-заметка с 45 абзацами. В середине строки 26 введён QA1, дождались Saved,
затем без повторного позиционирования введён QA2. Оба фрагмента остались рядом в середине
строки и сохранились после restart. Selection при formatting/context actions сохранилась.
Десять native edit/save циклов отдельно не выполнены; десять cycles покрыты mounted test.

## 21. Native formatting QA

В реальном окне применены bold + italic + monospace + underline к MULTI STYLE TEST.
Нет случайных Markdown markers. После restart сочетание отображается корректно.
К COLOR TEST применены pink text и blue highlight; после снятия selection оба цвета
видны. «Убрать выделение» убрало только фон. После второго restart pink text сохранился.

## 22. Native table / Details / divider QA

В таблице 3x3 выделены две верхние adjacent cells, выполнены merge, split, merge.
После restart верхняя merged cell занимает два логических столбца, остальные строки
содержат три столбца; A/B content присутствует. Raw Markdown table не появилась.
Divider между таблицей и последующим контентом сохранился после restart.
Настоящий Details вставлен через существующее меню: collapse/expand работает.
Closed state сохранён, после второго restart body скрыт; expand снова показал содержимое.
Сырая HTML `<details>` строка в начальном paste fixture намеренно не считается native
Details: existing paste policy показывает её буквально. NoteFlow block использует :::details.
Vertical merge и add/delete row/column проверены actual TipTap tests, не полностью native.

## 23. Native context menu / Tab QA

Custom right-click menu открыт по actual selected text, команда underline применена к
сохранённой selection. Обычные inputs не заменяются editor menu.
Native Tab в paragraph дал визуальный отступ, не перевёл focus в toolbar.
Все пять контекстов Tab проверены behavioral tests; полная native матрица не завершена.
Все четыре крайних положения context menu в native окне отдельно не пройдены.

## 24. Responsive QA

Playwright/Edge fixture монтирует настоящий EditorArea с mock Tauri IPC, без пользовательской
БД. 1100x700 и 1440x900, zoom 100/160, light/dark: **8/8 PASS**.
В каждом случае: page overflow 0, editor overflow 0, prose overflow 0;
code overflow только внутри pre. Details hide/show, context menu viewport bounds/Escape,
delayed long URL tooltip bounds/text и отсутствие pageerrors проверены.
Screenshots: `%TEMP%\noteflow-phase-c-geometry`.
Это browser geometry QA, не native resize proof. Actual native окно было maximized
1536x816; exact native 1100x700/1440x900 @160 не проверены.

## 25. Ограничения и границы

- Полная пользовательская native smoke матрица остаётся необходимой перед приёмкой.
- Произвольный HTML не становится поддерживаемым NoteFlow block при paste.
- Table Markdown fallback не обещает перенос arbitrary nested non-paragraph cell blocks;
  проверены обычные/merged paragraph cells, их marks и existing appearance attrs.
- Collapsed Details сохраняет текст; summary click редактирует summary, отдельный toggle
  управляет раскрытием. Это предотвращает конфликт редактирования заголовка и collapse.
- Generic full CommonMark block-parser rewrite не выполнялся; existing callout/details/
  attachment syntax сохранён. Marked применяется к inline/list grammar.
- Clipboard permission/availability зависит от WebView. При недоступности работают
  native shortcuts и понятная ошибка; clipboard не подменяется скрытым execCommand.
- Новые API/network requests, images/crop/drawing, calendars, callout colors, exports,
  settings redesign, TOC и Phase D не реализованы.
- QA-профиль находится только в TEMP и не включается в installers/repository.

## 26. git diff --check

PASS. Git предупреждает о future LF -> CRLF conversion по настройке рабочей копии;
это не whitespace error. Автоматического cleanup/переформатирования не выполнялось.

## 27. git status / файлы

20 modified tracked files Phase C:

```text
package.json
package-lock.json
src/features/editor/BlockInsertMenu.tsx
src/features/editor/EditorArea.tsx
src/features/editor/EditorCommandPopover.tsx
src/features/editor/FormattingToolbar.tsx
src/features/editor/customExtensions.ts
src/features/editor/editorContentSerializer.ts
src/features/editor/editorDocumentReload.ts
src/features/editor/markdownService.ts
src/features/note-chat/ChatMarkdown.tsx
src/shared/Icon.tsx
src/shared/MenuPopover.tsx
src/styles/app.css
tests/editorInlineAtoms.test.ts
tests/editorUiPolish.test.ts
tests/markdownService.test.ts
tests/notePersistenceState.test.ts
tests/rcResponsiveUi.test.ts
tests/uiFoundation.test.ts
```

10 new untracked Phase C files, включая этот отчёт:

```text
docs/tasks/phase-c-editor-correctness-report.md
scripts/qa/phase-c-editor-fixture.html
scripts/qa/phase-c-editor-fixture.tsx
scripts/qa/phase-c-editor-geometry.mjs
src/features/editor/EditorContextMenu.tsx
src/features/editor/editorFormattingCommands.ts
src/features/editor/editorInteractions.ts
src/features/editor/markdownInline.ts
src/features/editor/tableDocumentLayout.ts
tests/phaseCEditor.test.ts
```

Существующие 4 untracked Phase B files отдельно; не редактировались, не удалялись,
не stage-ились и не относятся к изменениям Phase C:

```text
docs/tasks/phase-b-rag-responsive-report.md
docs/tasks/phase-b-smoke-corrective-report.md
docs/tasks/phase-b-standalone-scope-report.md
scripts/qa/phase-b-provider.mjs
```

Итого: 20 modified tracked + 10 новых Phase C + 4 существующих Phase B untracked.
Staged changes отсутствуют. HEAD и версия не изменились.

**READY FOR USER PHASE C SMOKE**

Это готовность к пользовательской проверке, не заявление о полной ручной приёмке:
оставшаяся native матрица явно перечислена в разделах 20-25.
