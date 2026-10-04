# Phase D: итоговый отчёт принятого этапа

Первоначальные проверки: 03.10.2026. Финальная правка и подготовка фиксации: 04.10.2026.

- Ветка: `feature/rc3-product-polish`.
- Базовый HEAD Phase C: `09eb056fe3aa14cf1770447c3c883744adecd7ca`.
- Версия: `1.0.0-rc.2`, без изменений.
- Identity: `NoteFlow`, `com.noteflow.desktop`, без изменений.
- MSI mapping: `0.99.2`, без изменений.
- Scope: crop/canonical assets, annotation editor/blank drawing, insertion validation/reset, общие callout/calendar UI и их corrective pass.
- Пользователь полностью принял Phase D после final smoke и разрешил один scope-only commit. Tag, push, release, новая версия и Phase E не входят в эту фиксацию.

## 0. Первоначальный Phase D: crop, assets и вставка

Crop bug имел три причины: canvas не мог безопасно читать asset protocol без согласованного CORS, преобразование data URL через fetch зависело от CSP, а Apply callback запускал persistence fire-and-forget. Теперь загрузчик использует anonymous crossOrigin, protocol разрешает canvas CORS только точным origins приложения (локальный dev origin только в debug), PNG декодируется локально без fetch, Apply ожидает сохранение attachment и обновляет TipTap attrs. При ошибке draft остаётся открытым с безопасным сообщением. Устаревшая фиксированная высота image сбрасывается, чтобы crop не растягивался.

`imageEditorDocument.ts` объединяет original bitmap, crop projection и intrinsic annotations. Реальная обрезка создаёт PNG с новыми bitmap dimensions, не CSS clipping. Все существующие инструменты используют одну coordinate model; text input появляется в месте клика, отрицательный drag нормализуется, preview использует RAF. Crop preview кодируется на checkpoints, конечный PNG на Apply.

Edited image проходит прежний SHA256 content-addressed ingest: новый bytes hash получает новый `noteflow-asset://<hash>`. Существующий blob проверяется, а не перезаписывается. `originalAttachmentId` проверяется через `note_attachment_refs`, поэтому связанный shared original можно редактировать в duplicate, а чужой original отклоняется до ingest. Reference-aware GC, revision references, backup/restore и MIME/nosniff safeguards сохранены. Rust integration test проверяет неизменность shared original, независимость edited duplicate, GC, reopen и реальный ZIP backup/restore.

В «+» добавлен «Создать рисунок»: тот же editor, белый холст 1200x800. Apply создаёт managed PNG в captured selection; Cancel до Apply не вызывает storage. Модальное окно и image node reset используют ModalShell confirmation. Guard note ID/reload generation и image node identity запрещает применять результат к изменившемуся документу.

Typed `get_attachment_policy` возвращает authoritative Rust limits: PNG/JPEG/WebP до 25 МБ, generic file любого типа до 512 МБ; пустые файлы запрещены. Requirements показаны до выбора файла. Frontend проверяет размер до полного bytes payload и signature; backend остаётся authoritative. Native path ingest сохранён. Public errors EMPTY/TOO_LARGE/UNSUPPORTED не показывают paths или raw backend details.

NewNoteModal и insert/edit inline date используют одну `src/shared/DatePicker.tsx`; NoteDatePicker оставлен только compatibility re-export. Русские месяцы, Monday-first, общий DD.MM.YYYY display, ISO storage и captured selection сохранены. Migrations, sidecar schema, production dependencies и export formats не изменены.

## 1. Рисование: причина и исправление

До corrective pass canvas поддерживал только создание объекта: pointer down всегда начинал новый stroke/shape/text. Отдельных selection, hit testing и операции изменения существующего объекта не было. Поэтому повторный drag создавал новую фигуру вместо перемещения.

Теперь `ImageAnnotationCanvas` разделяет `create` и `move` через типизированный pointer draft. В toolbar добавлена рука: название «Перемещение», tooltip «Перемещение элементов». Hit testing идёт от последнего объекта к первому, то есть выбирается верхний объект. Прямоугольник и текст используют bounds, линия/стрелка/свободный штрих проверяются по расстоянию до сегментов; учитываются stroke width и наконечник стрелки. Текст измеряется тем же шрифтом, которым рисуется.

Pointer capture удерживает drag. Client position преобразуется через фактический canvas bounds в intrinsic coordinates с учётом crop. Delta считается от начального pointer и применяется к исходному объекту, а не накапливается по экранным пикселям. Все точки получают одинаковый delta; размер, угол, стиль, цвет, толщина и текст сохраняются. Preview перерисовывается через requestAnimationFrame без PNG encoding на каждом pointer move. Pointer up заменяет существующий объект и создаёт одну undoable operation. Pointer cancellation отбрасывает draft.

Перемещаются все шесть реально существующих типов: `rect`, `line`, `arrow`, `text`, `pen`, `marker`. Ellipse в текущем наборе инструментов и annotation model отсутствует: новый инструмент в corrective pass не добавлялся.

Selection показывает тонкий dashed outline только в editor preview. Empty click снимает selection и ничего не создаёт. Переключение tool ничего не добавляет. Cursor — grab/grabbing. Первый Escape снимает selection, следующий закрывает editor. Apply использует общий render pipeline без selection outline и по-прежнему ждёт persistence; Cancel не сохраняет draft, Reset возвращает первоначальный bitmap/crop и удаляет изменения текущей сессии. Undo/redo работают и для move.

Важное ограничение принятой Phase D architecture: Apply сохраняет PNG, а не отдельный векторный документ. Новые позиции переживают перезапуск в итоговом изображении. Уже запечённые в ранее сохранённый PNG фигуры нельзя снова выбрать по отдельности; movable objects существуют в текущей сессии редактора. Новый format annotations/sidecar здесь не вводился.

Основные файлы: `annotationGeometry.ts`, `imageEditorDocument.ts`, `ImageAnnotationCanvas.tsx`, `ImageEditorModal.tsx`, `Icon.tsx`.

## 2. Reset footer и цвет толщины

Причина слипания кнопок: в общем `.nf-modal-footer` отсутствовал gap для footer с непосредственными children-кнопками. Добавлены `gap: var(--space-3)` и flex-wrap. Используется существующий 12px spacing token, без локальных margin-left. Изменение находится в `src/styles/foundation.css`.

Причина синего slider: global accent-color не был связан с drawing state. Теперь wrapper толщины задаёт только `--drawing-color`, а соответствующий range использует эту переменную как accent-color. Цвет track/thumb следует за текущим stroke color. Numeric output остаётся видимым, global accent/focus tokens не изменяются. Реализация: `ImageAnnotationCanvas.tsx`, `src/styles/app.css`.

## 3. Выноска

Применён паттерн из задания: одна сущность «Выноска» и компактный выбор реального вида блока, вместо четырёх разнесённых кругов в insert panel. Это локальное переиспользование существующих primitives, не копирование чужой дизайн-системы и не новая data model.

Одна tile «Выноска / Информационный блок» открывает `CalloutColorPalette`. В ней 2x2 labelled mini-callout previews: синяя `info`, зелёная `tip`, жёлтая `warning`, красная `important`. Background соответствует существующим выноскам, есть subtle border, icon, selected checkmark и keyboard focus. Новых persisted цветов нет.

Для новой выноски default — синяя `info`, она выбрана и получает initial focus: Enter выбирает default без смены цвета. Escape/outside click отменяют выбор, без неожиданной вставки блока. Для существующей выноски та же palette показывает текущий variant и меняет его на месте, сохраняя содержимое. Используется существующее восстановление captured TipTap selection. Markdown-first/sidecar semantics не менялись.

`MenuPopover` обслуживает portal positioning, outside click, Escape и menu keyboard navigation. Браузерная проверка выявила, что initial focus мог выполняться до снятия visibility:hidden. Общий primitive теперь фокусирует content только после готового positioning; calendar caption использует тот же механизм. Это проверено actual-browser assertion и mounted DOM test, а не source regex.

Основные файлы: `CalloutColorPalette.tsx`, `BlockInsertMenu.tsx`, `MenuPopover.tsx`, `src/styles/app.css`.

## 4. Общий календарь

Причина визуального несоответствия: native month select и plain numeric year input в header shared DatePicker. Они заменены `CalendarCaption` со styled month/year buttons и NoteFlow MenuPopover.

- Header сохраняет prev / month / year / next, единую высоту и shared tokens.
- Month picker: 12 русских месяцев, compact 3-column grid, current month selected.
- Year picker: 24 года на страницу, 4-column grid, текущий год selected, navigation страницами и стилизованный переход к введённому году.
- Сохраняется ранее существующий диапазон 100–9999; 2022 и 2030 доступны одним кликом в текущей странице.
- Один controlled month state управляет caption, prev/next и day grid; второй calendar engine не добавлен.
- Monday-first, today, selected day, DD.MM.YYYY display и persisted ISO не изменены.
- Arrow/Home/End работают в caption grid; Tab/Shift+Tab остаются в верхнем calendar layer, Enter выбирает; Escape возвращает focus на anchor.
- Portal flip/shift использует существующий shared positioning и остаётся внутри viewport.
- Оба entry points — insert/edit inline date и NewNoteModal — используют один DatePicker и один CalendarCaption.

Дополнительно исправлен тот же autofocus-before-positioning для выбранного дня. Поздний autofocus календаря не перехватывает focus у уже открытого month/year layer. Родительские ModalShell/BlockInsertMenu закрывают только верхний слой по первому Escape через typed imperative handle.

Основные файлы: `DatePicker.tsx`, `CalendarCaption.tsx`, `NewNoteModal.tsx`, `BlockInsertMenu.tsx`, `MenuPopover.tsx`, `src/styles/app.css`.

## 5. Automated regression

До финального alignment pass в `tests/phaseDImageEditor.test.ts` было 50 focused-тестов; с двумя alignment tests теперь 52. Canvas rendering в mounted DOM tests замокан явно; pixel correctness проверяется отдельно в настоящем браузере.

Добавлены проверки всех шести movable types, immutable translation и отрицательного delta, topmost/path/text hit testing, empty click, tool switching, pointer cancellation, двух уровней Escape, Apply/Cancel/Reset, отсутствия selection в result, undo/redo, цвета/numeric thickness. Проверяются custom caption, 2022/2030, дальний год, keyboard navigation, nested Escape, shared entry points, labelled/default palette, focus после positioning, existing recolor и настоящий TipTap/Markdown/sidecar roundtrip.

Существующий source contract в `toolbar02d.test.ts` получил новую границу извлекаемого списка после переноса callout variants в отдельный component; запрет simple formatting в bottom insert menu сохранён.

Playwright/Edge fixture проверил 16 сценариев: 12 combinations 1100x700 и 1440x900, zoom 100/125/160%, light/dark; ещё 4 aspect/size cases 800x1200, 800x800, 4096x3072 и 64x48 с повторной обрезкой после reopen. Это настоящий canvas, не mock.

Pixel checks подтверждают Apply с moved rectangle и отсутствием старого дубликата. Проверены text drag, first Escape, ненулевой общий reset gap, actual computed accent-color зелёного/красного slider, неизменность focus token, четыре различных callout preview backgrounds, keyboard selection, viewport bounds палитры и month/year dialogs, selected-day autofocus, Tab/Shift+Tab, nested NewNoteModal Escape, отсутствие horizontal overflow editor. Screenshots находятся вне repo, не входят в commit.

| Проверка | Результат |
| --- | --- |
| npm run typecheck | PASS |
| npm run test | PASS, 423/423, 67 suites, 13.87 s |
| focused Phase D tests | PASS, 50/50 |
| npm run build | PASS; финальная повторная сборка входит в tauri beforeBuildCommand |
| cargo fmt --check | PASS |
| cargo check | PASS |
| cargo test | PASS, 242 passed / 5 ignored / 0 failed, 20.86 s |
| cargo clippy --all-targets --all-features -- -D warnings | PASS |
| FTS isolated benchmark | PASS, 1/1; 10,000 notes, indexing 12.9908903 s, query 647 us, test 13.00 s |
| npm run tauri dev | Запущен, настоящий native QA и restart выполнены; окно штатно закрыто, watcher остановлен |
| npm run tauri build | PASS; EXE, NSIS, ru-RU MSI и en-US MSI созданы, версия 1.0.0-rc.2 |
| git diff --check | PASS; только предупреждения Git о будущей конвертации LF в CRLF, без whitespace errors |

Два связанных focus edge cases были обнаружены расширенной проверкой и исправлены. Финальный полный frontend run зелёный. FTS benchmark выполнялся отдельно после закрытия dev/browser QA, без одновременно выполняющейся сборки или другого test suite.

## 6. Реальный Tauri QA

Использован отдельный временный профиль через existing NOTEFLOW_DEV_DATA_DIR. Реальная пользовательская база, модели и credentials не использовались.

- 100%: создан новый рисунок, вручную перемещены rectangle, arrow и text «Move QA», без дубликатов; Apply дождался сохранения.
- После настоящего close/restart: итоговое изображение с новыми позициями, зелёная выноска и inline date 22.12.2030 сохранились.
- 160%: вручную создан и перемещён rectangle; toolbar hand доступен, selection/grab корректны; Cancel отбрасывает draft.
- Reset confirmation открыта при 100% и 160%: кнопки явно разделены и не пересекаются; Cancel сохраняет draft.
- Существующая выноска изменена с жёлтой на зелёную через общую palette, без второй выноски и потери текста/изображения; palette проверена при 160% и не обрезается.
- Inline date: реальный выбор March 2022 / December 2030 у нижнего края editor; итоговая дата 22.12.2030 и autosave.
- NewNoteModal: тот же month/year chooser, включая 160%; первый Escape закрывает year/month layer, второй calendar, parent modal остаётся открыта; Cancel не создаёт заметку.
- На финальном коде повторно проверен keyboard flow NewNoteModal: initial focus на текущем месяце, ArrowRight переводит focus на следующий, Enter меняет отображаемый месяц; Escape закрывает календарь, но не parent modal. Создание отменено.
- QA zoom возвращён к 100%, native dev process завершён.

Разработческая native проверка не была exhaustive для каждого типа при каждом zoom: pen/marker drag, destructive Reset и native смена цвета отдельно автоматизацией не подтверждены. Зелёный/красный state и реальный CSS accent проверены DOM/Edge. Эти ограничения не выдаются за выполненные native тесты. Последующий пользовательский final smoke полностью принят; приёмка является отдельным свидетельством, не расширяет автоматически покрытие инструментальных тестов. Новая ellipse не добавлялась.

Dev HMR показывал сообщения о full-refresh для mixed component/helper exports; при штатном закрытии WebView2 вывел `Failed to unregister class Chrome_WidgetWin_0` (1412). Процесс NoteFlow после закрытия отсутствовал. Это не ошибка production build; dev watcher остановлен вручную, его exit 1 не выдаётся за автоматический successful termination.

## 7. Рабочее дерево и ограничения scope

Незакоммиченный базовый Phase D сохранён, Rust/backend в этом corrective pass дополнительно не изменялся. Сохранены asset/CORS safeguards, канонический cropped PNG, blank canvas, Apply-awaits-persistence, upload policy и существующая Markdown/sidecar pipeline. Новые production dependencies, migrations и export features не добавлялись.

Новые source modules: `annotationGeometry.ts`, `imageEditorDocument.ts`, `attachmentPolicy.ts`, `CalloutColorPalette.tsx`, `DatePicker.tsx`, `CalendarCaption.tsx`; новые tests: `phaseDImageEditor.test.ts`. Обновлены shared primitives и focused/browser tests.

Старые локальные файлы предыдущих фаз отдельно, не изменены и не staged:

1. `docs/tasks/phase-b-rag-responsive-report.md`
2. `docs/tasks/phase-b-smoke-corrective-report.md`
3. `docs/tasks/phase-b-standalone-scope-report.md`
4. `docs/tasks/phase-c-editor-correctness-report.md`
5. `docs/tasks/phase-c-settings-layout-corrective-report.md`
6. `scripts/qa/phase-b-provider.mjs`

Перед подготовкой commit: `feature/rc3-product-polish`, 19 tracked modified и 18 untracked, staged-файлов нет. Для одного commit выбраны 30 файлов: 19 modified и 11 новых. Помимо шести старых файлов исключён промежуточный `docs/tasks/phase-d-image-insert-calendar-report.md`: его актуальные сведения объединены в этом отчёте, старые показатели и ограничения не дублируются. Он остаётся локальным untracked, не удаляется.

## 8. Финальные артефакты и вердикт

`npm run tauri build` завершился успешно. Артефакты проверены на диске:

- `src-tauri/target/release/noteflow.exe`
- `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi`

Release staging и публикация не выполнялись. Отдельный QA-профиль закрыт штатно; процесса NoteFlow нет, dev watcher остановлен. Пользовательские данные и credentials не затронуты.

Это артефакты предыдущего corrective build, не финальный release с последующей calendar alignment правкой. Они не входят в commit и не предназначены для публикации в рамках этой задачи.

## 9. Финальная правка calendar header после принятого re-smoke

Дата завершения: 04.10.2026. Остальной Phase D подтверждён пользователем; эта правка ограничена vertical alignment month/year triggers.

Root cause воспроизведён в настоящем Edge DOM: у flex-кнопок отсутствовали `align-items: center`, явный line-height и определённая раскладка label/icon. При высоте 32px computed `align-items`, `justify-content` и `line-height` оставались `normal`; центр текста был примерно на 4.5px, SVG на 7px выше центра кнопки. SVG также наследовал `margin: 0 auto` из общего nav-правила.

Изменения:

- `src/shared/CalendarCaption.tsx`: обе кнопки используют общий `date-picker-caption-trigger`, текст выделен в `date-picker-caption-label`; label и SVG — соседние flex items. Обработчики и состояние календаря не изменены.
- `src/styles/app.css`: `inline-flex`, `align-items: center`, `justify-content: space-between`, существующий horizontal spacing и explicit `line-height: 1.2`; SVG — block, без auto margin, без flex shrink. Его фактический размер 16px сохранён. Vertical offsets, transforms и случайные padding-top не добавлялись.
- `tests/phaseDImageEditor.test.ts`: два mounted regression tests проверяют общую структуру month/year, корректный label и сохранение структуры при открытом popover.
- `scripts/qa/phase-d-image-geometry.mjs`: actual computed CSS и geometry assertions для обоих entry points, одинаковая высота четырёх header controls, centered label/icon, отсутствие наложений; проверяются закрытый и открытый caption popover. Computed `flex` допускается наряду с `inline-flex`: браузер blockifies flex items.

Prev/next, border/radius, hover/focus, keyboard navigation, nested Escape, ISO storage, date parsing и календарная business logic не менялись.

Проверки этого alignment pass:

| Проверка | Результат |
| --- | --- |
| npm run typecheck | PASS |
| npm run test | PASS, 425/425, 67 suites, 13.17 s |
| npm run build | PASS, 233 modules, без chunk-size warning |
| existing Edge geometry QA | PASS, 16/16; 1100x700 и 1440x900, 100/125/160%, light/dark, оба calendar entry points |
| npm run tauri dev | Реальное QA-окно, оба entry points визуально проверены при 100% и 160% |
| git diff --check | PASS; только Git LF/CRLF conversion warnings |

Native QA выполнен в прежнем отдельном временном профиле. Month/year label и chevron центрированы, при открытии chooser не прыгают; Escape/focus restoration сохранены. При 160% insert menu прокручен до даты, caption помещается и текст не обрезается. Даты в заметку не вставлялись, создание новой заметки отменено. После обновления runtime QA-профиль повторно открыт безопасно, zoom восстановился; в конце zoom возвращён к 100%, окно закрыто и dev watcher остановлен. Реальная база и credentials не использовались.

Rust, FTS и Tauri release build в этом узком CSS/component pass повторно не запускались согласно текущему gate; результаты раздела 5 относятся к предыдущему corrective pass. Backend, версия и release artifacts не обновлялись.

## 10. Финальная приёмка и commit scope

Пользователь подтвердил полный final smoke Phase D. Перед фиксацией проверены working diff, version sources, asset ingest/GC/backup/protocol и reusable QA. Candidate содержит только принятый Phase D, без Phase E, version bump, новых dependencies или migrations. API keys, реальные Authorization values, credentials, private endpoints, реальные заметки/чаты/изображения, пользовательские пути, базы и QA captures в него не входят. Test error strings и цветные canvas fixtures синтетические; loopback URL и вычисление output directory из TEMP нужны reusable QA, не являются пользовательскими данными.

Три QA-файла включаются только как source: `scripts/qa/phase-d-image-fixture.html`, `scripts/qa/phase-d-image-fixture.tsx`, `scripts/qa/phase-d-image-geometry.mjs`. Скриншоты, profiles, logs, databases, generated PNG, installers, dist/target/node_modules и локальные configs не включаются.

Сохраняются ограничения: растровый PNG после Apply, отсутствие object editing для ранее запечённых annotations, crop undo, macOS native QA и pixel-memory budget для больших decoded bitmap. Если ingest успешен, но применение отклонено из-за смены документа, provisional asset очищается существующим GC grace period. Никакой новый формат или cleanup policy не вводится.

Этот consolidated report сопровождает разрешённый commit `feat: complete rc3 product polish phase D`. Проверки разделов 5 и 9 выполнены на соответствующих этапах. На стадии фиксации production code не менялся; дополнительно повторены `npm run typecheck` (PASS), `npm run test` (425/425, 67 suites, 28.14 s), `npm run build` (PASS, Vite 2.88 s, 233 modules, без chunk-size warning). Rust/native/FTS/release build повторно не заявляются. `git diff --check` PASS. Версия остаётся `1.0.0-rc.2`, mapping `0.99.2`. Tag/push/release не разрешены; Phase E не начинается в этой задаче.
