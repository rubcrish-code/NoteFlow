# Phase D — image editing, insert menu and shared calendar

Дата завершения проверок: 03.10.2026.

Ветка: `feature/rc3-product-polish`. HEAD: `09eb056fe3aa14cf1770447c3c883744adecd7ca`.
Версия осталась `1.0.0-rc.2`; productName — `NoteFlow`; identifier — `com.noteflow.desktop`.
MSI mapping остался `0.99.2`. Commit/tag/push/release не выполнялись. Phase E не начата.

## 1. Причины crop bug

Цепочка применения имела несколько независимых проблем:

- Изображение custom asset protocol могло отображаться, но не быть доступным для безопасного чтения пикселей canvas: отсутствовал согласованный CORS response, а загрузчик не устанавливал `crossOrigin`.
- Преобразование результата `data:image/png` через `fetch()` зависело от сетевой CSP. Текущая CSP не разрешает такой запрос через `connect-src`.
- Родительский callback запускал сохранение fire-and-forget. Модальное окно не ожидало persistence, закрывалось, а ошибка выводилась отдельно.

Исправление не является CSS clipping: результат — новый PNG с реальными размерами обрезанного bitmap.

## 2. Новый crop/apply flow

`ImageEditorModal` хранит исходный bitmap, нормализованный crop и историю аннотаций одной сессии.
На Apply: rasterization → локальное декодирование PNG в `File` → существующий `storeAttachment` → новый canonical asset → обновление атрибутов TipTap image → обычный autosave заметки.
Apply ожидает Promise сохранения. Повторное нажатие и закрытие во время persistence заблокированы.
При ошибке draft остаётся открытым, отображается безопасное сообщение без путей или raw backend error.
У изображения сбрасывается устаревшая фиксированная высота, чтобы новый crop не растягивался в старое соотношение сторон.

## 3. Hash/reference safety

Существующий SHA256 content-addressed pipeline сохранён. Редактирование не перезаписывает старый файл; новые bytes получают собственный hash/URI.
Проверка `originalAttachmentId` использует актуальную связь `note_attachment_refs`, а не только owner field attachment.
Чужой, не связанный с заметкой original отклоняется до создания нового asset.
Backend integration test доказывает независимость edited duplicate, неизменность original bytes, сохранность после GC, reopen DB и backup/restore.
Duplicate уже переписывал attachment IDs до этой задачи: отдельный прежний duplicate bug не заявляется.

## 4. Причины проблем рисования

Прежние crop и drawing sessions не разделяли один document state. Для текста отсутствовал полноценный ввод непосредственно в месте клика; baseline и presentation scale создавали непредсказуемое ощущение размещения.
Старое рисование уже использовало intrinsic bitmap dimensions в некоторых местах — утверждение, что все прежние координаты были screen pixels, было бы неверным.
Теперь crop projection, точки, толщина, текст и стрелки используют одну систему координат, включая маленькие bitmap.

## 5. Annotation coordinate model

Pointer client coordinates преобразуются через фактический `getBoundingClientRect()` поверхности и текущий crop в координаты исходного bitmap.
Аннотации хранятся как vector draft в памяти; на Apply растеризуются в PNG, как и прежний product direction.
Поддержаны pen, marker, line, arrow, rectangle, text. Ellipse и object move/selection ранее не существовали и не добавлялись.
Отрицательный drag нормализуется. Pointer capture, pointer ID, cancel/lost capture и RAF cleanup обрабатываются явно.
Текст вводится после клика и подтверждается отдельно; logical anchor не смещается ради размещения input у края.
Preview рисуется через RAF; PNG не кодируется на каждом pointermove. Crop preview кодируется на контролируемых checkpoints, финальный asset — на Apply.

## 6. Footer и reset

Footer: reset слева, cancel/apply справа, одинаковые высоты и вертикальное выравнивание через scoped CSS и существующие tokens.
Reset открывает `ModalShell`; отмена сохраняет draft, подтверждение возвращает initial session state.
Для чистого draft reset disabled. В меню image node восстановление original тоже требует `ModalShell` confirmation.
Undo/redo относится к штрихам; полноценная история crop операций не добавлялась.

## 7. Реальные ограничения изображений

PNG, JPEG (JPG/JPEG), WebP; максимум `25 * 1024 * 1024` bytes, UI: `25 МБ`.
Backend проверяет signature, не доверяет только MIME/расширению. Пустой файл отклоняется.
Ограничения не изменены и не придуманы заново.

## 8. Реальные ограничения файлов

Generic attachment допускает любой тип/расширение, максимум `512 * 1024 * 1024` bytes, UI: `512 МБ`.
Пустой файл отклоняется. Нового запрета executable extensions не добавлено: его не было в существующей policy.
Typed `get_attachment_policy` отдаёт frontend актуальные Rust constants/formats. UI и frontend validation используют этот контракт, backend остаётся authoritative.
Для `File` размер проверяется до выделения полного bytes payload; native path ingest продолжает использовать существующий backend flow.
Public attachment errors имеют безопасные коды EMPTY / TOO_LARGE / UNSUPPORTED и понятный русский текст.

## 9. Blank drawing

В «+» добавлено «Создать рисунок». Используется тот же editor, не вторая drawing implementation.
Default canvas: 1200×800, нейтральный белый фон. Без отдельного selector размеров.
Apply создаёт обычный managed PNG и вставляет его в сохранённую selection. Cancel до Apply не вызывает storage.
После вставки доступны прежние resize/crop/reopen механизмы.

## 10. Callout UI

В «+» один пункт «Выноска», затем компактная палитра четырёх существующих вариантов.
Отдельных цветных insert actions больше нет. Внутри существующей выноски палитра меняет variant текущего блока, не добавляет ещё одну выноску и не заменяет текст.

## 11. Callout persistence

Используется прежний Markdown-first serializer/sidecar. Нового хранилища цвета нет.
Behavioral test создаёт/recolors настоящий TipTap callout, сериализует Markdown + sidecar, загружает обратно и проверяет variant/content.
Native QA подтвердил сохранение после restart и recolor существующей выноски без замены её текста.
Полные существующие duplicate/backup/sidecar tests также проходят; отдельный native duplicate+backup callout smoke не выполнялся.

## 12. Shared DatePicker

Единственная implementation — `src/shared/DatePicker.tsx`.
`NewNoteModal` и «+» → Дата используют её напрямую. `NoteDatePicker.tsx` оставлен как compatibility re-export, без второго календаря.
Portal positioning переиспользует `useFloatingPopoverPosition`.

## 13. Месяц и год

Есть предыдущий/следующий месяц, прямой select месяца и editable year.
Year draft допускает промежуточные значения при наборе; valid year обновляет календарь, blur возвращает корректное значение для невалидного draft.
Проверены переходы к 2022 и 2030.
Tab/Shift+Tab перемещают фокус между controls календаря; при выходе за его границы он закрывается и возвращает фокус trigger.
Это устраняет прежнее немедленное закрытие календаря на любом Tab.

## 14. Locale и даты

Русские месяцы, Пн–Вс, Monday-first, шесть недель, selected/today indication, дни соседних месяцев.
Display — общий `formatDisplayDate`, DD.MM.YYYY. Storage остаётся ISO; created_at и пользовательская дата заметки не смешиваются.
Escape/outside click сохраняют выбранное значение. «+» вставляет дату в captured selection, не в конец документа.

## 15. Schema / sidecar

Новых migrations, таблиц или схем sidecar нет. Image attrs остаются совместимыми с существующей canonical asset/sidecar моделью.
Crop/annotations после Apply находятся в bytes PNG, а не в новом vector sidecar. Callout variant/date representation используют существующий serializer.
Версия и package dependencies не менялись.

## 16. Backup / Markdown export

Edited PNG и blank drawings — стандартные canonical attachments; backup продолжает сохранять blob bytes и references.
Новый backend test делает реальный ZIP roundtrip edited+original assets и reopen временной БД.
Portable Markdown export использует существующую asset policy; отдельного формата экспорта не добавлено. Его существующие tests проходят.
Native destructive restore не выполнялся на реальном пользовательском профиле.

## 17. Frontend tests

Финальные два полных `npm run test`: **401/401**, 67 suites, 12.060 с и 11.026 с.
Новый `tests/phaseDImageEditor.test.ts`: 28 behavioral/geometry/policy tests.
Покрытие: intrinsic projection и zoom, crop bitmap bounds, отрицательный rect, text anchor/baseline/scale, arrow scale, local PNG decode, cancel/reset, no encoding on pointermove, async Apply/failure/duplicate guard, pointer cancel, limits/magic/error privacy, month/year/keyboard/outside/Escape, настоящий TipTap callout/date и sidecar roundtrip.
Canvas в JSDOM interaction tests mocked; доказательство реальных пикселей отдельно обеспечено browser QA.
Новый keyboard test первоначально конфликтовал с initial RAF focus; direct DOM-object assert дополнительно раздувал error diff. Тест теперь ждёт initial frame и проверяет semantic label, после чего два полных suite зелёные.
`tests/userSmokeCorrections.test.ts` изменён только для пути shared calendar implementation.

## 18. Rust tests / полные checks

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | PASS, 401/401, два финальных прогона |
| `npm run build` | PASS, 230 modules, последний отдельный Vite build 3.74 с |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS |
| `cargo test` | PASS, 242 passed, 5 ignored, 247 total, 19.57 с выполнения tests |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| `npm run tauri dev` | Запущен; native QA на отдельном профиле выполнен |
| `npm run tauri build` | PASS, optimized Rust build 2 мин 01 с; NSIS + en-US/ru-RU MSI созданы |
| `git diff --check` | PASS; только предупреждения Git о LF→CRLF |

Пять ignored tests — явные benchmark/native fixtures/external Bridge smoke, не скрытые failures; FTS из них выполнен отдельно.
Новые Rust tests: image duplicate/edit/hash/GC/reopen/backup safety; unreferenced original rejection; exact-origin canvas CORS. Public error test дополнен attachment cases.
Sandbox блокировал spawn Node/Edge/esbuild через EPERM; проверки успешно выполнены с разрешением запуска дочерних процессов.
При shutdown debug WebView выводил framework diagnostic `Failed to unregister class Chrome_WidgetWin_0` (1412). В нём нет пользовательского содержимого; после закрытия процесс NoteFlow отсутствовал.

Проверено фактическое наличие финальных outputs (03.10.2026):

```text
D:\Projects\NoteFlow\src-tauri\target\release\noteflow.exe
D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.2_x64-setup.exe
D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.2_x64_ru-RU.msi
D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.2_x64_en-US.msi
```

Установщики не устанавливались, не публиковались и не копировались в releases в рамках Phase D.

## 19. FTS benchmark

Отдельно, без запущенного tauri dev и наших build/test процессов:
`cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --exact --nocapture --test-threads=1`.

PASS: 10 000 notes; database setup 6.674 мс; search schema 3.140 мс; generation 7.430 мс; indexing **12.1064088 с**; query **17.6551 мс**.
Более ранний отдельный прогон этого этапа: indexing 11.3863277 с; query 0.6983 мс. Это разные измерения окружения, а не замена финального результата лучшим значением. Production search не менялся.

## 20. Native image QA

Профиль: `%TEMP%/noteflow-phase-d-qa-20261002`; пользовательская БД/credentials не использовались.
Созданная QA-note содержит настоящий PNG из blank drawing, сохранённый canonical asset pipeline.
Изображение открыто в crop editor, правая область обрезана, Apply дал изменённый результат. После restart результат и ранее изменённая resize width сохранились.
Проверен существующий resize handle и пропорции; сам механизм восьми handles не переписывался.
Не выполнялась отдельная вставка внешнего JPG через native file picker или native двух-note shared-original сценарий; shared safety/reopen/backup доказаны временными backend integration tests.

## 21. Native drawing QA

В реальном Tauri: blank drawing → отрицательный rectangle drag → текст «Схема» у клика → Apply → обычное note image.
Reopen/crop/restart сохраняют результат. При 160% выполнены pen и arrow, их endpoints соответствовали pointer; Apply/restart сохранил их.
Reset открыл отдельное ModalShell confirmation; Cancel сохранил аннотации. Confirm проверен mounted behavioral test, но не отдельным финальным native нажатием.
Нативно не перебраны все инструменты и все восемь resize handles; line/marker покрываются общим implementation, без заявления полного ручного покрытия.

## 22. Native insert menu QA

«+» → Изображение показывает PNG/JPG/JPEG/WebP и 25 МБ до выбора файла.
«+» → Файл показывает любые типы, 512 МБ и nonempty requirement.
«Создать рисунок» открывает общий canvas и вставляет managed image в заметку.
Неподдерживаемый/oversized файл отдельно через native picker не отправлялся; signature/size/failure checks покрыты tests.

## 23. Native callout/calendar QA

Один callout action с палитрой, создание зелёной выноски; restart; изменение той же выноски на жёлтую при сохранённом тексте.
«+» → Дата: direct year 2022, выбор 22.10.2022, insert именно в середину текущего текста; результат пережил restart.
New Note: общий calendar, direct year 2030, Escape закрывает только calendar, modal остаётся.
После финального keyboard fix дополнительно проверены native Shift+Tab год→месяц и Tab месяц→год: popup остаётся открыт; Escape возвращает фокус date trigger.
Новая заметка во время последнего calendar-only smoke не создавалась.

## 24. Responsive / реальные canvas pixels

`scripts/qa/phase-d-image-geometry.mjs`: **12/12 PASS**, финальный повтор после keyboard fix.
8 комбинаций 1100×700 / 1440×900, 100% / 160%, light / dark. Browser fixture моделирует CSS viewport + deviceScaleFactor; это не объявляется native Tauri zoom.
Проверены реальные canvas pixels, actual crop output dimensions, red original region, blue annotation pixels, negative drag, text, reset cancel, calendar month/year и Tab/Shift+Tab, отсутствие horizontal overflow.
4 bitmap aspect/size cases: 800×1200, 800×800, 4096×3072, 64×48: draw→crop→apply→reopen→repeat crop.
Скриншоты находятся во временном `noteflow-phase-d-geometry`; light 1100×700@160 и dark 1440×900@100 дополнительно просмотрены глазами.
Native окно на этой машине: 1536×816, actual Tauri zoom 100% и 160%. Footer выровнен, изображение загружается, controls доступны. На минимальном окне при 160% canvas закономерно меньше, но layout не выходит горизонтально за viewport.

## 25. Known limitations

- Полноценные object selection/move, vector persistence, ellipse, crop undo, multiple blank sizes не добавлялись.
- PNG rasterization на Apply/checkpoints остаётся в frontend canvas. Very large decoded bitmap требует памяти; 25 МБ compressed size не является жёстким pixel-memory budget.
- Длинный текст у bitmap edge клипуется canvas: anchor внутри bitmap, но автоматического wrap/move текста нет.
- Cancel до Apply не создаёт asset. Если storage уже успешно завершился, а insertion затем отклонён из-за смены документа, provisional asset освобождается существующим GC grace period, не мгновенным новым rollback. Не заявляется отсутствие всех provisional files при любой ошибке.
- Не выполнены macOS/WebKit native QA, native JPG upload, exhaustive 8-handle check и native destructive backup restore. Существующие user models/credentials не менялись.
- QA-профиль оставлен отдельно для re-smoke; реальные пользовательские заметки не изменены. Dev-приложение и наш dev server закрыты.

## 26. Diff / scope

`git diff --check` PASS. Нет migrations, новых production dependencies, изменений AI/RAG/provider/business logic вне image/insert/calendar Phase D.
Package files, версия, product identity, installer mapping не изменены. Existing portable export/backup architecture сохранена.

## 27. Git status и файлы

Изменённые tracked Phase D files (16):

```text
src-tauri/src/assets.rs
src-tauri/src/data.rs
src-tauri/src/lib.rs
src/features/editor/BlockInsertMenu.tsx
src/features/editor/EditorArea.tsx
src/features/imageEditor/ImageAnnotationCanvas.tsx
src/features/imageEditor/ImageCropTool.tsx
src/features/imageEditor/ImageEditorModal.tsx
src/features/imageEditor/ImageNodeView.tsx
src/features/imageEditor/imageEditService.ts
src/features/notes/NewNoteModal.tsx
src/features/notes/NoteDatePicker.tsx
src/services/dataService.ts
src/shared/Icon.tsx
src/styles/app.css
tests/userSmokeCorrections.test.ts
```

Новые Phase D files (8):

```text
docs/tasks/phase-d-image-insert-calendar-report.md
scripts/qa/phase-d-image-fixture.html
scripts/qa/phase-d-image-fixture.tsx
scripts/qa/phase-d-image-geometry.mjs
src/features/imageEditor/imageEditorDocument.ts
src/services/attachmentPolicy.ts
src/shared/DatePicker.tsx
tests/phaseDImageEditor.test.ts
```

Существовавшие до Phase D untracked files (6), не редактировались/удалялись/stage:

```text
docs/tasks/phase-b-rag-responsive-report.md
docs/tasks/phase-b-smoke-corrective-report.md
docs/tasks/phase-b-standalone-scope-report.md
docs/tasks/phase-c-editor-correctness-report.md
docs/tasks/phase-c-settings-layout-corrective-report.md
scripts/qa/phase-b-provider.mjs
```

Финальный status: 16 modified tracked files, 14 untracked files (8 Phase D + 6 прежних локальных файлов).
Рабочее дерево остаётся незакоммиченным; ничего не stage. Diff canonical version files пустой.

## Verdict

**READY FOR USER PHASE D SMOKE**

Это готовность к пользовательской приёмке Phase D, не заявление о полном exhaustive native покрытии: ограничения разделов 20–25 остаются явно обозначенными.
Следующее действие — пользовательский Phase D smoke, без перехода к Phase E до его приёмки.
