# RC3 Full Regression / Release Readiness

Актуальная приёмка: **06.10.2026, раздел 39 — Final User Acceptance And RC3 Release Gate**, accepted pre-bump HEAD `714532f117313fcbd61d20334cd1d58f68c62834`. Финальный пользовательский smoke **PASS**; подготовка `1.0.0-rc.3` / MSI `0.99.3` описана в 39. Полная матрица из 98 требований — 38.13 с явными обновлениями user evidence; прежний список ручных действий 38.17 исторический и не запрашивается повторно.

Разделы 1-37 сохранены как история. Их counts, HEAD, Git status и verdict НЕ являются текущими результатами. Security remediation, internal links, mixed lists/checklists и порядок context menu приняты пользовательским smoke; повторная проверка этих четырёх исправлений не запрашивается. Старые FAIL/BLOCKED/NOT TESTED из предыдущих матриц заменены текущими статусами в 38.13 на основании перечисленных доказательств. Ограничение Computer Use и ошибка Acrobat до открытия PDF не классифицируются как дефекты NoteFlow.

## 1. Environment

Проект: `D:/Projects/NoteFlow`. Windows NT 10.0.26200.0, X64; Node v24.15.0; Cargo 1.96.0.
OS metadata через CIM недоступны (Access denied); версия получена через System.Environment, без заявления о тестировании Windows 10.
Источники требований: текущее RC3-задание (пункты 0, 81-84, 88-90), исходный product-polish запрос, актуальные HTML/product-spec/technical-spec/user-guide.
Поздние явные пользовательские решения имеют приоритет над старой project-delete preserve-policy, display-date и export/language controls.
Пользовательская SQLite DB, credentials, модели и данные не открывались и не изменялись. На исходном preflight QA profile не создавался; отдельный синтетический профиль corrective pass описан в разделе 33.

## 2. Git Baseline

Branch: `feature/rc3-product-polish`.
HEAD: `a5fc1976bdfc9740052581d78da638c49f73c446`, `feat: complete rc3 product polish phase E`.
Tracked tree clean; index empty. `git status`, `git log -6 --oneline`, `git diff --check` выполнены, baseline соответствует заданию.

Последние commits:

```text
a5fc197 feat: complete rc3 product polish phase E
5415204 feat: complete rc3 product polish phase D
09eb056 feat: complete rc3 product polish phase C
b53d8a1 feat: complete rc3 product polish phase B
3811753 feat: complete rc3 product polish phase A
83d98f9 fix: improve wide-screen UI for 1.0.0-rc.2
```

Canonical versions package.json/package-lock/root package/Cargo.toml/Cargo.lock/Tauri: `1.0.0-rc.2`.
MSI: `0.99.2`; productName: `NoteFlow`; identifier: `com.noteflow.desktop`. Не изменены.

До начала было ровно 7 разрешённых untracked:
```text
docs/tasks/phase-b-rag-responsive-report.md
docs/tasks/phase-b-smoke-corrective-report.md
docs/tasks/phase-b-standalone-scope-report.md
docs/tasks/phase-c-editor-correctness-report.md
docs/tasks/phase-c-settings-layout-corrective-report.md
docs/tasks/phase-d-image-insert-calendar-report.md
scripts/qa/phase-b-provider.mjs
```
Они не stage/не редактировались/не удалялись; SHA-256 snapshot проверяется после подготовки отчёта.

## 3. Automated Frontend

**NOT RUN в этом regression**: npm ci/typecheck/test/build.
Ожидаемый исторический baseline: 452 tests / 70 suites. Новое количество pass/fail и duration не измерены.
Причина: до запуска test suites проверен явно обязательный stop-gate пункта 83; подтверждён product gap.
Не выдавать предыдущие green checks или пользовательскую приёмку A-E за текущий интеграционный regression.
После разрешения blocker: проверить lockfile environment, выполнить полный frontend gate, записать counts/duration/bundle warnings.

## 4. Automated Rust

**NOT RUN**: cargo fmt --check/check/test/clippy.
Исторический baseline 249 passed / 6 intentional ignored, не результат текущего прогона.
Ни failures, ни отсутствие failures заново не установлены. Rust production code не менялся.

## 5. FTS

**NOT RUN**. Indexing/query latency текущего regression отсутствуют.
Запланирован существующий `search::tests::search_performance_on_ten_thousand_notes`: 10,000 notes, debug test profile, отдельно без dev/build/browser QA/heavy suites.
Threshold не менялся. Старые 10-15 s / low-ms результаты не используются как текущие измерения.

## 6. npm Security

**NOT RUN** в этом regression. Исторические 0 production vulnerabilities не являются новым npm audit.
После unblock отдельно выполнить `npm audit --omit=dev`, отделить dev findings от production.

## 7. First Run

**NOT RUN**. Clean isolated NOTEFLOW_DEV_DATA_DIR profile, steps/Skip/Complete/once-after-restart и отсутствие demo garbage остаются checklist.
Native Tauri окно в этой задаче не открывалось. Визуальная проверка не заявляется.

## 8. Upgrade / Migrations

**NOT RUN**. Legacy compatible fixture -> migration chain/15 -> reopen -> Notes/Projects/Tags/provenance/assets/chats/index state.
Не создавалась копия реальной DB и не фабриковались historical backup files.
Согласованность старых данных заново не доказана.

## 9. Notes / Autosave

**NOT RUN**: CRUD/pin/duplicate/archive/restore/delete/restart; 10+ cursor/selection cycles; rapid edits; immediate navigation/close; failed flush.
P0 atomicity/CAS/reload implementation не менялась. Existing unit/integration coverage отмечено в matrix как кандидаты для прогона, не доказательство нового PASS.

## 10. Projects / Archive / Tags

**NOT RUN**: typed-name Project deletion, zero/multi-note cases, atomic cascade/index/GC; archive provenance and nested count/filter; tag order/primary/color/backup/restart.
Старая исходная рекомендация preserve Notes при Project delete явно заменена последующим пользовательским cascade решением. Это не классифицируется как новый дефект.

## 11. Search

**NOT RUN**: UI exact/prefix/body/Cyrillic/no-results/stale deleted Notes.
Production FTS не изменялся.

## 12. AI Providers

**NOT RUN**: existing/new/edit/provider connection/model discovery/secret UX.
Real Bridge/Ollama availability и user-approved access не проверялись; реальные API requests не отправлялись.
Нельзя заявлять coverage cifra48/agent или cifra48/embedding в этом regression.

## 13. Auto Indexing

**NOT RUN**: AUTO_RC3_001 -> AUTO_RC3_002; V1/V2/V3/FINAL; safe provider failure/recovery; pending restart/reconcile.
Note persistence vs index failure isolation остаётся обязательной частью продолжения.

## 14. RAG Scopes

**NOT RUN**: All/standalone/mixed/empty, move/remove Project, Retry original scope, persist/restart, no silent fallback/no scope leakage.
Selector UI и retrieval backend не менялись.

## 15. Global Knowledge

**NOT RUN**: latest/first/counts/date queries under All/A/standalone/mixed; metadata/content scope agreement.

## 16. Editor

**NOT RUN**: basic/combined marks, highlight-only removal, Tab, right-click preserved selection, wrapping, external-link tooltip/opener, Formula removal.
Не выполнялись scripted editor interactions или native save/restart cycles.

## 17. Tables / Details / Divider

**NOT RUN**: actual 3x3 merge/split/row/column edits, no phantom columns, background/thick borders; details summary/body; divider placement/restart.

## 18. Images / Drawing / Files

**NOT RUN**: real PNG/JPG/WebP ingestion, shared-original crop safety, all drawing tools/undo/redo/reset/color indicator, blank drawing, generic files/open/reveal/restart.
Не менялись image/canonical attachment/GC policies.

## 19. Callout / Calendar

**NOT RUN**: compact palette/recolor existing/restart; shared calendar both entry points, year 2022/2030, Monday-first/locale/Esc/Tab and 100%/160%.

## 20. Exports

**NOT RUN в этом regression**: native MD/TXT/DOCX/PDF save/cancel/flush/latest edit, actual Word/PDF viewer, Project ZIP portable/collisions/path-safety.
Previous Phase E user acceptance не засчитана как новый regression.
Никакие экспортированные документы, ZIP, screenshots/logs/runtime databases не создавались.

## 21. TOC / Internal Links

**NOT RUN**: H1-H3/hierarchy/duplicates/live rename/removal/click/reduced motion/unknown anchor/no autosave mutation.

## 22. Settings

**На исходном preflight подтверждён PRODUCT GAP RG-001 / P1 BLOCKER**. Теперь реализован, ожидает пользовательский smoke; см. раздел 33. Историческое evidence до реализации:
нет `Удалить все заметки` с двумя явными подтверждениями.

Доказательства текущего кода:
- `src/features/settings/SettingsPage.tsx:1389`: DataSettingsProps содержит callbacks backup/create/preview/import/Markdown/toast, без bulk-delete callback.
- `src/features/settings/SettingsPage.tsx:1417`: DataSettings state/handlers не содержат bulk-delete flow.
- `src/features/settings/SettingsPage.tsx:1551`: весь DataSettings UI содержит knowledge repair, backup и import/restore; кнопки массового удаления и двух подтверждений нет.
- `src/services/dataService.ts:516`: deletion APIs только для конкретного noteId (`deleteNote`, `deleteNotePermanently`).
- `src-tauri/src/lib.rs:105`: invoke_handler регистрирует per-note deletion и archive-item deletion, но не команду bulk Notes deletion.
- Поиск `удалить все заметки|удаление всех заметок|delete_all_notes|deleteAllNotes|clear_all_notes|clearAllNotes|purge_notes|reset_profile|resetProfile` по src/src-tauri/src/tests/scripts/qa дал 0 совпадений (rg exit 1 означает no matches, не упавшие tests).
- Проверка полного DataSettings JSX, service APIs и registry исключает только rename-label объяснение: отсутствует сама операция.

Не путать с `src-tauri/src/data.rs:3501` (`import_backup`) и `:3592` (`DELETE FROM notes`).
Эти строки принадлежат replacement restore backup: также заменяются Projects/Tags/Chats/provider metadata. Это **не** безопасная реализации удаления только Notes и не допустимый fallback.

Двойное подтверждение не существует, поэтому cancel/typed text/duplicate-click safety bulk deletion нельзя протестировать.
Намеренная семантика Projects/Tags/Chats/Assets для отсутствующей функции **НЕ ОПРЕДЕЛЕНА**; не выдумана во время regression.
Правило сохранения credentials/provider configs/application закреплено в текущем задании, но реализация отсутствует.

## 23. Backup / Restore

**NOT RUN**: current external ZIP, manifest/assets/chats/source snapshots/tag order/restore/reopen и реальные supported older fixtures.
Import код прочитан только для разграничения операции с bulk delete. Это не полный backup audit и не evidence rollback PASS.
Destructive restore на пользовательской DB не выполнялся.

## 24. Assets / Revisions

**NOT RUN**: shared asset reference GC/last reference; revision cadence/retention/restore/export invariants.
Bulk deletion policy требует согласовать сохранение исторических snapshots и удаление связанных refs, прежде чем писать новый flow.

## 25. Security / Errors

Full repository/artifact credential scan, CSP/error-boundary/fault QA и key-log audit **NOT RUN**.
Новых production paths нет, реальные ключи не читались, в отчёт не включены Notes/chats/secrets.
Никакой общей гарантии security/privacy green по этому незавершённому проходу не заявляется.

## 26. Responsive

**NOT RUN**: 1100x700/1440x900/1920x1080/2560x1440 × 100%/160%, light/dark, Notes/Projects/RAG/Tags/Archive/Settings/Editor/Export/Image/Calendar/TOC.
Исторические phase geometry screenshots не используются как новый coverage.

## 27. Installer Lifecycle

**NOT RUN**: clean NSIS/MSI ru-RU/en-US install, upgrade/reinstall, coexistence, shortcuts, WebView2, uninstall data policy.
Нет безопасной VM/second-PC проверки в этом проходе; установка/удаление на рабочей машине не выполнялись.
Windows 10: **NOT TESTED**. Real second PC: **NOT TESTED**. macOS: **NOT production-validated**.
Существующий `src-tauri/target/release/noteflow.exe` проверен через Get-AuthenticodeSignature: **NotSigned**. Это старый локальный output, не свежая candidate build.
Signing/updater/release architecture не менялись; unsigned RC остаётся известным ограничением, не новой P0 находкой.

## 28. Requirement-by-Requirement Audit / Regression Matrix

Матрица составлена для будущего интеграционного выполнения A-E. Начальный static stop-gate найден до automated/native testing.
Статус исторической приёмки **не равен** current implementation audit/PASS.
Каждый item исходного product-polish списка сведён в строки ниже; общие technical/compatibility/acceptance пункты представлены cross-cutting G/A rows, а не пропущены.
Текущее RC3-задание добавляет явный stop-gate G02/G03, независимо от того, был ли bulk delete однозначно назначен конкретной прошлой Phase.

Обозначения test candidates (файлы существуют; их содержимое/покрытие каждой строки заново полностью не оценивалось):
- A: phaseAOrganization.test.ts + Rust data tests.
- B: phaseBPolish.test.ts, ragWorkspace.test.ts, ragResponsiveLayout.test.ts, globalKnowledgeAgent.test.ts + Rust auto_knowledge/knowledge_agent/retrieval.
- AB: A + B + searchFoundation.test.ts/semanticRetrieval.test.ts.
- C: phaseCEditor.test.ts, tableExtensions.test.ts, editorContentSerializer.test.ts, editorLinkSecurity.test.ts.
- D: phaseDImageEditor.test.ts, canonicalAssets.test.ts + Rust assets/data.
- E: phaseEBehavior.test.ts, phaseEExport.test.ts + Rust document_export/data.
- P0: notePersistenceState.test.ts, autosaveFailureSafety.test.ts, backupImportFlow.test.ts, canonicalAssets.test.ts + Rust integration/fault tests.
- DATE: displayDate.test.ts.
- SEC: securityHardening.test.ts, windowsRelease.test.ts + Rust public error/link validation.
- LAYOUT: settingsSidebarLayout.test.ts, rcResponsiveUi.test.ts + existing QA geometry.
- INSTALL: native safe-machine installer lifecycle; existing installer contract tests не заменяют его.

| ID | Requirement | Phase | Implemented / evidence | Automated test | Native / user smoke в текущем проходе | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Archive: Все / Проекты / Заметки, без верхнеуровневых дублей дочерних Notes | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A02 | Atomic archive Project вместе с active Notes | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A03 | Persisted archive provenance; вручную archived Note не восстанавливается с Project | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A04 | Архивный Project: настоящие count/date/title/restore/overflow | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A05 | Открытие nested Notes архивного Project, возврат, read-only policy | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A06 | Atomic restore Project без сброса tags/revisions/relations | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A07 | Archive filter: existing page-state policy или default Все, без случайной новой setting | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A08 | Project delete: exact Unicode typed name, wrong name/cancel/empty Project | A corrective | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A09 | Project delete policy: предупреждение и atomic cascade Notes; исходная preserve-policy явно заменена поздним требованием | A corrective | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A10 | Note delete: ModalShell, Cancel/Esc и явное подтверждение, без window.confirm | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A11 | Archived Projects отсутствуют в Note project picker | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A12 | Create Project из picker: empty/non-empty list, existing backend, auto-assign Note | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A13 | Убрать Note из Project без удаления/архивации/сброса tags/revisions | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A14 | Project chip на Note card; no fake Без проекта | A corrective | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A15 | No decorative Note card icon; title/preview/tag/pin alignment и gap от accent bar | A corrective | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A16 | Current Project scope chip вне search; выход из scope | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A17 | No Editor breadcrumb; header/save/chat/focus/toolbar сохраняются | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A18 | No Библиотека label в раскрытом/свёрнутом sidebar | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A19 | Несколько Tags на Note, persisted deterministic order и migration existing relations | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A20 | Сделать основным/reorder; first tag.color единственный visual color source | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A21 | Удаление first Tag продвигает next; zero Tags neutral, без без тега | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A22 | No auto-creation/assignment новая; существующий пользовательский Tag не удаляется | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A23 | First-tag color во всех Note/Search/Project/Archive/duplicate/import surfaces | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A24 | Tag order сохраняется в duplicate и backup/restore | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A25 | Note menu Import Markdown переиспользует existing safe flow | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A26 | Single/multiple MD, Cyrillic/empty/duplicate titles, no overwrite, результат и restart | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A27 | Backup versions совместимы; provenance/tag order сохраняются | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A28 | FTS/semantic/RRF/Global Knowledge/tag/date scope не изменены visual color | A/B | Исторически принято; заново не подтверждено | AB (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A29 | Transactions/CAS/content_version/autosave/revisions/assets/startup recovery не регрессируют | A-E/P0 | Исторически принято; заново не подтверждено | P0 (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A30 | Additive transactional migration 15, deterministic legacy upgrade/repeated startup | A | Исторически принято; заново не подтверждено | A (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A31 | Safe frontend errors: no SQL/stack/private paths, retry где уместен | A-E | Исторически принято; заново не подтверждено | SEC (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| A32 | User display dates DD.MM.YYYY; storage ISO и chronology прежние | A corrective | Исторически принято; заново не подтверждено | DATE (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B01 | RAG Project selector: All, multiple Projects и persist/restart | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B02 | Standalone Notes scope, mixed A + standalone, no B leakage | B corrective | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B03 | Empty scope blocks send; no silent All fallback | B corrective | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B04 | Project move/remove/archive/delete обновляют retrieval и metadata scope | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B05 | Retry использует original scope, а не текущий selector | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B06 | Global Knowledge counts/latest/first/date questions согласованы со scope | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B07 | Automatic KB update после autosave/debounce; rapid V1/V2/V3/FINAL latest wins | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B08 | Index failure recovery и pending reconcile after restart без cloud calls вне consent | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B09 | Manual repair остаётся recovery flow, не нужен при обычном save | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B10 | First-run onboarding steps/Skip/Complete, русский профиль, once/restart и no demo garbage | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B11 | Tooltips sidebar/toolbar/Sources/AI/pin/archive/focus/fullscreen без clipping | B | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B12 | RAG responsive history/Sources drawers, title/composer/scroll при 100%/160% | B corrective | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| B13 | Source snapshots читаемы после Note deletion; citations/history/scope сохраняются | B/P0 | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C01 | Cursor/selection после autosave не сбрасываются; 10+ cycles/list/table/marks | C/P0 | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C02 | Rapid typing, switch/close after typing, failed flush protections | C/P0 | Исторически принято; заново не подтверждено | P0 (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C03 | Basic marks/headings/lists/checklist/quote/code/alignment без unexpected raw Markdown | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C04 | Combined bold/italic/underline/monospace сохраняются после restart | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C05 | Highlight + text color; Убрать выделение удаляет только highlight | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C06 | Right-click formatting: captured selection, viewport/Escape, обычные fields не затронуты | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C07 | Tab/Shift+Tab для lists/checklist/code/paragraph; restart | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C08 | Long Cyrillic/URL/token wrap; intentional code-block policy | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C09 | External URL tooltip без network preview; safe Ctrl/Cmd+Click | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C10 | Formula полностью отсутствует в toolbar/overflow/+/context/help; no empty gaps | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C11 | Tables 3x3 merge/split/rows/columns/colors/borders без phantom columns; restart | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C12 | Details summary/body edit/collapse/expand/restart | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C13 | Divider между paragraphs/after list/before heading; autosave/restart | C | Исторически принято; заново не подтверждено | C (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| C14 | Settings nested sidebar/responsive collapse и save-location UX | C | Исторически принято; заново не подтверждено | LAYOUT (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D01 | PNG/JPG/WebP по policy, validation copy/size/signature/storage/resize | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D02 | Crop Apply/restart; shared original во второй Note не меняется | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D03 | Drawing pen/marker/line/arrow/rectangle/text, undo/redo при 100%/160% | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D04 | Reset: confirmation/cancel/confirm, initial state и footer spacing | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D05 | Drawing thickness indicator follows chosen color; focus ring blue | D corrective | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D06 | Blank drawing -> managed image -> save/restart | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D07 | Files: Unicode, policy/size/nonempty, open/reveal, path safety | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D08 | Single Callout entry/palette; insert/recolor existing content/restart | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D09 | Shared calendar обе точки входа, month/year/2022/2030/prev-next/keyboard/Esc | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| D10 | Calendar Monday-first/Russian/DD.MM.YYYY при 100%/160% | D | Исторически принято; заново не подтверждено | D (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E01 | Native Save location/filter/default-name/success/reveal/cancel | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E02 | Note MD: canonical Markdown, Cyrillic/headings/lists/tables/relative assets | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E03 | Note TXT: readable UTF-8 без Markdown/HTML/JSON garbage | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E04 | Note DOCX: real OOXML, Word repair warning/readability/styles/images/table/links | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E05 | Note PDF: selectable Cyrillic/pages/images/table/links, actual viewer | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E06 | Latest unsaved edit включён after flush; failed flush blocks export | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E07 | Project ZIP: selected Project only, unique Unicode MD filenames/deduplicated assets | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E08 | ZIP names ../ : / CON trailing dot безопасны; temp failure preserves destination | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E09 | Live H1/H2/H3 TOC, unique anchors, rename/removal/click navigation | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E10 | Internal # links safe; unknown anchors no crash, no autosave mutation | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E11 | Settings language UI removed; no contextual current Note/Project export; Backup/Restore/Models remain | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| E12 | Final Project menu label Экспортировать, остальные пункты прежние | E | Исторически принято; заново не подтверждено | E (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| G01 | Clear chunks copy: Фрагменты заметок для ИИ-поиска | B/Settings | Исторически принято; заново не подтверждено | B (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| G02 | Settings Удалить все заметки с DOUBLE confirmation | RG-001 corrective pass | DeleteAllNotesControl + typed delete_all_notes | tests/deleteAllNotes.test.ts: mounted confirmations, exact phrase, cancel/Esc/loading/error | Отдельный QA profile, см. раздел 33 | IMPLEMENTED — PENDING USER SMOKE |
| G03 | Bulk delete не затрагивает credentials/provider configs/application; Projects/Tags/Chats/Assets policy согласована | Явное пользовательское bulk-only решение | Одна SQLite transaction + post-commit reference-aware GC; профиль сохранён | data.rs bulk_delete integration/fault/race/backup tests, AppShell behavioral test | Отдельный QA profile, см. раздел 33 | IMPLEMENTED — PENDING USER SMOKE |
| G04 | Current/old backup integrity, corrupt/traversal/fault rollback, safe autosave/reload coordination | P0/A-E | Исторически принято; заново не подтверждено | P0 (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| G05 | Reference-aware asset GC и revision cadence/retention/restore не регрессируют | P0/D | Исторически принято; заново не подтверждено | P0 (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| G06 | Single instance, safe schemes/CSP/error boundary/privacy | Release hardening | Исторически принято; заново не подтверждено | SEC (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| G07 | Global viewport/theme matrix, все основные screens и overlays | A-E | Исторически принято; заново не подтверждено | LAYOUT (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| G08 | Clean NSIS/MSI install/upgrade/reinstall/uninstall/coexistence/data preservation | Release hardening | Исторически принято; заново не подтверждено | INSTALL (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |
| G09 | Windows 10 / second PC / macOS release claims правдивы | Release hardening | Исторически принято; заново не подтверждено | INSTALL (план, NOT RUN) | Предыдущая приёмка не засчитана | NOT RUN |

Original correction list provenance:
- исходный user attachment product-polish (Phase A requirements 1-35, acceptance 47 и future decisions 45-46);
- последующие явно принятые A corrective policies (cascade delete, spacing/chip, Archive rows, DD.MM.YYYY);
- RC3 current requirements minimum list (пункт 82), plus workflow/native/release gates.
Archive filter persistence A07 не получает новую обязательную setting автоматически.
Original Formula legacy-support оговорка учтена C10; migration только ради пустого поля не предлагается.
Нет обещания, что каждый candidate test уже честно покрывает каждый subcase.

README/docs краткий static review, без edits:
- Current release 1.0.0-rc.2 корректен сейчас, bump только на отдельном release этапе.
- README описывает преимущественно MD export; при подготовке RC3 отразить MD/TXT/DOCX/PDF, contextual menu/Project ZIP и TOC.
- Перед RC3 согласовать docs о scope/auto-index/onboarding/language с принятой реализацией и требованиями; полная проверка ещё не выполнена.
- Фраза GitHub Release появится после публикации владельцем требует сверки с фактической публикацией RC2 (интернет в этом проходе не проверялся).
- Windows/macOS/signing/installer ограничения нельзя снимать на основании текущего STOP.
- Старые reference/docx export-placement/language descriptions не выдаются за текущий UI contract: позже явно согласованы cleanup decisions. Документы не переписывались.

## 29. Blockers

| ID | Severity | Finding | Evidence | Required next decision |
| --- | --- | --- | --- | --- |
| RG-001 | IMPLEMENTED — PENDING USER SMOKE | Удалить все заметки + double confirmation реализованы после согласования bulk-only policy | Раздел 33, backend/frontend behavioral tests | Пользовательский smoke только bulk-delete flow |
| RG-002 | P1 release gate NOT COMPLETED, не подтверждённый implementation bug | Полный RC3 regression ещё не выполнен из-за stop-gate | Sections 3-27 NOT RUN | После RG-001 заново весь gate и native coverage |
| INFO-001 | INFO | Unsigned existing EXE | Authenticode NotSigned | Сохранить правдивые release limitations |
| INFO-002 | INFO / external QA pending | Windows 10, second PC, macOS, installer lifecycle не тестировались здесь | Не выполнялись | Безопасная native/VM/second-PC validation |

P0: новых подтверждённых data-loss/security/corruption bugs в этом ограниченном preflight не установлено; это **не** отсутствие P0 во всём продукте.
P2: новых воспроизведённых UI bugs не установлено; README coverage follow-ups не замаскированы под completed QA.
Missing destructive feature не объявляется P0 только потому, что речь об удалении данных.

## 30. Known Limitations / Resume Plan

Полный regression остаётся остановленным. Последующим запросом пользователь согласовал policy и разрешил реализацию только массового удаления; раздел 33 фиксирует этот отдельный corrective pass.
Ни один предыдущий PASS A-E не превращён в current regression PASS.
Чтобы возобновить:
1. Policy уже согласована: все Notes и note/RAG histories удаляются, Projects/Tags/settings/providers/credentials/backups сохраняются.
2. Double confirmation и точная фраза реализованы; backend-owned transaction, без empty-backup restore.
3. Выполнить пользовательский bulk-delete smoke и отдельно разрешить продолжение RC3 regression.
4. Возобновить полный RC3 frontend/Rust/FTS/security/native/installer regression на актуальном HEAD, с safe isolated profiles.
5. Только после настоящего green и user final smoke рассматривать отдельный version/build/staging/release этап.

Это перечень необходимых решений, не новая product architecture и не молчаливое внедрение функции.

## 31. Changed Files During Regression

На исходном preflight единственный новый файл: `docs/tasks/rc3-full-regression-report.md`. Изменения последующего corrective pass перечислены в разделе 33.
Production code, UI, tests, dependencies, schema, README/release docs, version и старые local files не менялись.
Staging остаётся пустым; 7 прежних untracked + этот новый отчёт.
Commit/tag/push/merge/release/version bump не выполнялись.
`git diff --check`: исходный PASS; после создания отчёта выполняется повторно. New untracked report дополнительно проверяется напрямую на whitespace.

## 32. Final Verdict

**NEEDS MORE WORK**.

Исходный blocker RG-001 реализован, пользовательская приёмка ожидается. RG-002 (полный RC3 regression) всё ещё не выполнен.
Это preflight-stop report, **не завершённый RC3 FULL REGRESSION**.
Нельзя утверждать READY FOR USER RC3 FINAL SMOKE на основании прежней приёмки A-E.
После отчёта остановиться; не выполнять автоматический commit/tag/push/release/version bump.

## 33. RG-001 Bulk Delete Corrective Pass

Scope: только Settings -> «Удалить все заметки». Полный RC3 regression и остальные findings не продолжались. G02/G03: **IMPLEMENTED — PENDING USER SMOKE**.

### Согласованная policy

- Удаляются все строки Notes, включая active/archived/soft-deleted, их Markdown/cache/sidecars/revisions, связи с Projects/Tags, attachment/asset references, legacy/current FTS, knowledge chunks/state, vectors/failures/queue.
- Удаляются ВСЕ note AI и global RAG chats/messages/source snapshots. Это специальная bulk-only policy: обычное удаление одной заметки и сохранение historical source snapshots не менялись.
- Projects (в том числе archived), Tags, provider configs, embedding profiles, secure credentials, app/UI/theme/onboarding settings, external backups и сам SQLite profile сохраняются. Счётчики заметок Projects/Tags становятся 0.
- Резервная копия автоматически не создаётся. Backup format, attachment representation/ownership, revision retention/cadence, RAG generation и прочие UX flows не менялись.

### UI и lifecycle

Новая отдельная `DeleteAllNotesControl` внизу DataSettings использует существующие SettingsModalShell/ModalShell, button variants и field styling.

1. Первый modal загружает реальные inclusive counts, сообщает о notes/history/revisions/assets, оставляемых данных, необратимости и удалении независимо от несохранённых правок. Cancel/close ничего не меняют.
2. Второй modal требует точное case-sensitive `УДАЛИТЬ ВСЕ ЗАМЕТКИ` (только trim по краям допустим). Неверный регистр/неполная фраза оставляют «Удалить» disabled. Cancel/Esc ничего не меняют.
3. Loading/busy guard предотвращает повторный запрос; при 0 Notes action disabled и показывается «Заметок пока нет.»; при ошибке доступен retry с безопасным текстом без SQL/path/contents.
4. После commit сразу очищаются active Note/list/search/source highlight/editor selection, закрывается note chat; Projects/Tags/Archive counters обновляются, editor/workspace reload generations инвалидируют предыдущий документ и RAG state. Restart для UI refresh не нужен.
5. Toast: «Все заметки удалены.» Если post-commit file GC не завершился, сообщение честно говорит о повторной очистке при следующем запуске, не о failed deletion.

### Backend atomicity и GC

Typed async commands `get_delete_all_notes_summary` / `delete_all_notes` работают через существующий `with_store_blocking`, без frontend per-note loop.

Одна настоящая SQLite transaction: bulk-only удаление ai_chats -> DELETE notes (существующие FK CASCADE очищают связанные данные) -> deterministic cleanup трёх FTS таблиц -> empty/current embedding index counters -> COMMIT. Ошибка любого DB шага вызывает rollback всей transaction.

Физические файлы очищаются только ПОСЛЕ commit через существующий reference-aware `assets::collect_garbage`. Каталог assets не удаляется целиком. Учитываются note/revision/attachment refs; в текущей схеме нет самостоятельного non-note владельца asset. Оставшиеся orphan blob rows служат существующему startup/reconcile retry. GC failure возвращает `cleanupPending`, а не откатывает уже удалённые Notes. Backend bulk error содержит только фиксированный безопасный public error.

### Защита от поздних операций

- `PendingNoteSaves.deleteAfterInFlight` приостанавливает drain, ждёт только уже отправленный write, НЕ сохраняет несент drafts. Очередь инвалидируется только после успешного удаления; при DB failure drafts остаются и обычный autosave возобновляется.
- Queue generation отсекает старые success/failure continuations. AppShell очищает versions/search/save generations и игнорирует устаревшие secondary/list/note callbacks. Отсутствующая Note не может быть recreated обычным update/autosave.
- После удаления отменяются зарегистрированные embedding operations. Существующие chunk existence/content guards сохраняются: integration test доставляет старый HTTP result после bulk delete через вторую реальную SQLite connection; vectors/chunks не появляются снова.
- Сохранение позднего note chat требует существующей Note; существующие RAG chat/request guards не позволяют старому generation сохранить удалённый chat. Single-instance architecture не менялась.

### Новые automated tests

`tests/deleteAllNotes.test.ts`: 14 behavioral/service tests, не source-regex имитация. Реально монтируются confirmation component и AppShell: counts/preserved copy, обе отмены, exact phrase, Esc, busy/duplicate, safe error/retry, zero Notes, GC warning; typed commands; unsent/in-flight/failed/late autosave; немедленный editor/list/counters/RAG refresh.

`data.rs`: 6 integration/fault tests на временных DB/filesystem + 1 явно ignored native seed helper. Fixture: 2 Projects (один archived), 2 Tags, 5 Notes (3 archived), revision/sidecars, две ссылки на общий image blob, chunks/vectors/failures, note/RAG histories/source snapshot, synthetic provider и disabled local embedding profile.

- Commit очищает 20 note-owned tables; FK check и reopening подтверждают отсутствие orphan data; Projects/Tags/profiles/settings сохраняются.
- Test-only SQLite trigger вызывает failure на последней удаляемой Note: Notes/chats/relations/FTS/chunks/vectors/assets остаются в предыдущем состоянии.
- Старый autosave и поздний note chat write отклоняются после удаления.
- Backup до удаления восстанавливает 5 Notes, 2 chats и asset; backup после удаления содержит 0 Notes и сохранённые Projects/Tags.
- Simulated filesystem failure оставляет DB deletion valid, orphan blob retryable; последующий GC завершает очистку.
- Late embedding HTTP response не воссоздаёт chunk/vector.

### Выполненные gates corrective pass

| Gate | Результат |
| --- | --- |
| npm run typecheck | PASS |
| npm run test | PASS: 466 tests / 72 suites, 0 fail/skip; финальный прогон 27.565 s |
| npm run build | PASS: 241 modules; Vite 24.72 s |
| cargo fmt --check | PASS |
| cargo check | PASS: 7.94 s |
| cargo test | PASS: 255 passed / 0 failed / 7 intentional ignored; финальный прогон 65.61 s (с QA dev/build нагрузкой, не benchmark) |
| cargo clippy --all-targets --all-features -- -D warnings | PASS: 9.02 s |
| isolated FTS 10,000 Notes | PASS: indexing 11.7071926 s, query 601.2 microseconds; отдельно без tauri dev/build/heavy suites |
| npm run tauri dev | PASS: реальное QA окно, затем закрыто; process завершился |
| npm run tauri build | PASS: release Rust compilation 1m 45s; NSIS + ru-RU/en-US MSI созданы, версия 1.0.0-rc.2 |
| git diff --check | PASS; только Git LF/CRLF advisory, не whitespace errors |

Новая production dependency/migration не добавлялась. Vite chunks: initial index 316.38 KB, editor 478.98 KB, Settings 78.98 KB; существующий PDF worker 2288.00 KB. В compiler/clippy проверках warnings нет. При закрытии dev WebView вывел `Failed to unregister class Chrome_WidgetWin_0 / 1412`; Tauri exit 0, процесс завершился. Это не скрыто под утверждением о полностью бесшумном native запуске.

### Native QA: реально выполнено / ещё не выполнено

Только синтетический профиль `noteflow-bulk-qa-80f9fd66-7559-4431-9179-ace6e891e327` в Windows temp, заданный через NOTEFLOW_DEV_DATA_DIR. Пользовательская база/реальные secrets не использовались. Fixture backup создан до запуска UI. Никаких реальных provider requests не отправлялось.

Реальное Tauri окно открыто, Settings/Data и обе ModalShell просмотрены при 100% и 160%, с expanded/collapsed main sidebar. Counts: 5 Notes / 3 archived / 2 chats / 1 revision. Проверены Cancel первого, Cancel второго, Esc, неправильная lowercase фраза -> disabled Delete и точная uppercase -> enabled Delete. При 160% первый modal имеет body scroll и доступный footer; второй помещается целиком.

Native финальное Delete, проверка пустых экранов без restart, native restart после удаления и native restore QA backup пока **NOT RUN**: запрошено action-time подтверждение пользователя на destructive UI click только в этом QA profile. Пока подтверждение не получено, удаление не выполняется. Эти сценарии покрыты automated integration/behavioral tests, но это НЕ substitute for native completion. После завершения native QA раздел будет дополнен; до этого финальный blocker verdict **NEEDS MORE WORK**.

Image fixture проходит managed storage validation и реально участвует в refs/GC/backup, но её минимальные magic bytes не являются полноценной визуально декодируемой картинкой. Отображение/редактирование изображения в этом corrective pass не считается повторно проверенным.

### Git и remaining user smoke

7 tracked files изменены: `src-tauri/src/data.rs`, `src-tauri/src/lib.rs`, `src/app/AppShell.tsx`, `src/app/noteAutosaveCoordinator.ts`, `src/features/settings/SettingsPage.tsx`, `src/services/dataService.ts`, `src/styles/app.css`.
Новые source/test files: `src/features/settings/DeleteAllNotesControl.tsx`, `tests/deleteAllNotes.test.ts`. Этот отчёт остаётся untracked. Итого 7 modified + 10 untracked (7 прежних intentional + report + component + tests), index пустой. SHA-256 всех 7 прежних local files совпали с исходным snapshot.

Branch/HEAD/version/productName/identifier/MSI unchanged. Commit/tag/push/release не создавались. Требуется пользовательский bulk-delete smoke на безопасном профиле; затем отдельное разрешение на возобновление полного RC3 regression. Остальные requirement rows остаются NOT RUN.

Проверенные build outputs (не staging/release публикация):

- `src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`
- `src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi`

Итог текущего прохода: **NEEDS MORE WORK** только из-за незавершённого native destructive QA (ожидается подтверждение на тестовые данные). Implementation и все automated/build gates зелёные. Native окно/dev завершены, пользовательские процессы не завершались принудительно. QA profile/fixture backup оставлены в temp для безопасного продолжения теста.

## 34. Fresh RC3 Regression

Это новый запуск по заданию `fc82f59b-9e07-4b8b-9feb-c9f01b6694cd`, не перенос старых PASS. Проверялся интегрированный кандидат после bulk-delete commit. Ничего не исправлялось: единственное ручное изменение в repository за этот прогон -- этот отчёт. Несоответствие security gate и пробелы native coverage не маскируются зелёными unit tests.

### 1. Environment

Windows NT `10.0.26200.0`, x64, Windows 11 build 26200. Это НЕ Windows 10. CIM metadata недоступны; версия получена через `System.Environment`. Node `24.15.0`, npm `11.12.0`, Cargo/Rust `1.96.0`. Браузерные fixtures выполнены через существующие QA scripts и установленный Edge; новые зависимости не устанавливались. Microsoft Word установлен и использован для просмотра свежего DOCX.

Native automation работала только с QA NoteFlow и созданным DOCX в Word. Реальные пользовательские Notes, DB и credentials не читались/не изменялись. Ранее запущенные сторонние приложения не закрывались. Использованы два новых временных профиля:

- `noteflow-rc3-regression-af19b3dd-a248-410c-8e02-f5c87af85900`: чистый первый запуск, заметка, restart, локальный Ollama.
- `noteflow-bulk-qa-51ece4c3-6293-46e2-a5ce-24f7cf9db1be`: существующий test-only seed с пятью синтетическими Notes, archive, chats, assets и backup.

Оба находятся вне repository, в Windows Temp; не включаются в release artifacts. QA profile override работает только в debug. Release EXE намеренно не запускался с этим override: release использует настоящий app_data_dir, поэтому такой запуск не был бы безопасной изоляцией.

### 2. Git Baseline

Branch `feature/rc3-product-polish`; HEAD `542a0e64a78dccbd00fd69d47c4b1d69bdaa0670`, `fix: add safe bulk note deletion for rc3`. Последние семь commits: `542a0e6`, `a5fc197`, `5415204`, `09eb056`, `b53d8a1`, `3811753`, `83d98f9`. Tracked tree clean, index empty. В начале и конце восемь intentional untracked, включая этот отчёт. Никаких unexplained source files.

Canonical version в package.json, package-lock.json (root и package entry), Cargo.toml, Cargo.lock и tauri.conf.json: `1.0.0-rc.2`. ProductName `NoteFlow`, identifier `com.noteflow.desktop`, MSI ProductVersion `0.99.2`. About получает версию динамически. Версия, UpgradeCode и package files не изменялись. SHA-256 семи защищённых local source/report files сохранены и сверены; их содержимое не менялось.

### 3. Frontend

| Свежая команда | Результат |
| --- | --- |
| npm run typecheck | PASS; 5.244 s |
| npm run test | PASS; 467 tests, 72 suites; 0 failed/cancelled/skipped/todo; 11026.438 ms |
| npm run build | PASS; 241 modules, Vite 12.77 s, без build warnings |

Первый sandbox-запуск tests не смог spawn process: EPERM до выполнения suites. Разрешённый повтор полностью прошёл; это инфраструктурная ошибка, не test failure. Не менялись lockfile, thresholds, test expectations или concurrency для получения PASS.

Тяжёлые frontend группы: Phase C около 1.529 s, mounted EditorArea около 0.883 s, Phase D около 1.636 s, tooltip около 1.421 s, Windows fixture/staging tests около 1.375 s. Их синтетические временные artifacts не являются release staging. В текущем test count нет расхождения с ожидаемыми 467.

Build chunks: initial index 316.38 KB (gzip 93.57 KB), React 192.54 KB, editor 478.98 KB (gzip 149.85 KB), Settings 78.98 KB, CSS 221.93 KB. DOCX worker 392.30 KB, PDF worker 2288 KB отдельно. Sourcemaps в dist отсутствуют. Эти значения не означают измеренный native startup или large-note FPS.

### 4. Rust

| Свежая команда | Результат |
| --- | --- |
| cargo fmt --check | PASS; 0.69 s |
| cargo check | PASS; 0.64 s |
| cargo test | PASS; 255 passed, 0 failed, 7 intentional ignored; 17.99 s; main/doc tests 0 |
| cargo clippy --all-targets --all-features -- -D warnings | PASS; 0.54 s; warnings нет |

В suite 262 tests, но НЕ 262 passed. Из семи ignored отдельно выполнены FTS benchmark и bulk native fixture seed. Не запускались: metadata benchmark, два real Bridge credential-dependent tests и два других native fixture seed tests. Игнорирование real Bridge не выдаётся за реальную интеграционную проверку провайдера.

### 5. FTS

Перед benchmark проверено отсутствие NoteFlow/tauri dev/cargo/rustc/browser QA/heavy test suites. Выполнено отдельно:

```text
cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --nocapture
```

PASS, 1 passed / 261 filtered, debug test profile. 10,000 Notes: setup 1.0381 ms, schema 1.2176 ms, fixture 3.3632 ms, **indexing 11.6876484 s**, **query 656.8 microseconds = 0.6568 ms**; test duration 11.70 s. Existing limits 30 s indexing / 5 s query не менялись. Не подменено metadata performance test и не перенесено старое измерение.

### 6. Security Audit

Последующая remediation и свежий online production audit: раздел 35 ниже. Этот подраздел фиксирует состояние ДО исправления и не является текущим npm verdict.

**FAIL:** `npm audit --omit=dev --json` вернул exit 1: 39 affected dependency packages, 38 moderate и 1 high. Это две независимые advisory в TipTap core плюс зависимые packages, а НЕ 39 независимых CVE. В текущем lockfile TipTap core `3.26.1`.

| Advisory | Что подтверждено | Ограничение вывода |
| --- | --- | --- |
| [GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh), moderate; исправлено в 3.30.4 | Benign local JSON with own __proto__ + mergeAttributes создаёт inherited data-regression-canary attribute | Воспроизведён библиотечный primitive; global Object.prototype не менялся; end-to-end NoteFlow XSS НЕ доказан |
| [GHSA-j95f-988m-3j2f](https://github.com/advisories/GHSA-j95f-988m-3j2f), high; исправлено в 3.30.5 | Installed version входит в affected range; advisory о квадратичном Markdown-spec parsing | NoteFlow paste использует собственный markdownToTiptapDoc; affected spec helpers не найдены в production src. UI DoS НЕ воспроизводился |

Проверены официальные GitHub advisories. Fixed-attribute extensions/sidecar whitelist и CSP снижают достижимость первого primitive, но не обнуляют failed dependency gate. Приоритет **P1 security/release gate**, а не выдуманный доказанный P0 exploit. Не выполнялись npm audit fix, version bump или silent TipTap upgrade. Для закрытия нужен отдельный согласованный coherent TipTap update минимум с обеими исправлениями, reachability review и повтор всего editor/import/export/security regression.

Tracked text scan: literal token/API key/private key/Bearer secret patterns не найдены. Tracked DB/sqlite/ZIP/log/.env/credential/QA-profile contents отсутствуют. Один абсолютный путь в data.rs -- синтетический privacy error fixture, не пользовательская DB. Dist scan не обнаружил test-secret/QA override/debug diagnostic markers или source maps. Это ограниченный статический audit, не универсальное доказательство отсутствия любого секрета.

### 7. First Run

Native PASS для проверенного clean-profile flow: launch, русские шесть шагов onboarding, Next каждого шага, ошибка пустого имени, completion с локальным именем `RC3 Regression QA`, создание `Первая заметка`, restart без повторного onboarding. Existing seeded profile также открылся без onboarding. Native Skip/Back не выполнялись; их свежие mounted behavioral tests прошли. Поэтому весь first-run requirement не объявляется полностью native PASS.

### 8. Migrations

Текущая chain 1-20 изучена. Свежие Rust tests проходят для seed once, старых JSON/Markdown/sidecar, content_version, retention, canonical assets, knowledge backfill, semantic profiles и archive/tag order/scope. Migration 15 хранит archive provenance/tag ordering; 16 request/source scope snapshots; 17-18 automatic queue/update relevance; 19 live scope; 20 standalone scope.

Чистая native DB прошла chain при startup; seeded existing synthetic DB открылась без loops/onboarding. Native запуск именно pre-polish compatible DB с последующей migration 15-20 не выполнен. Его заменять тестом current-schema seed нельзя. Данные реальной пользовательской DB для миграции не использовались.

### 9. Notes / Autosave

Native: Markdown paste сразу создал H1/H2, bold, круглый checklist и таблицу; после двух сохранений добавлен новый suffix, затем X/restart. Последний текст, структура и формат сохранились; видимые Saving/Saved состояния корректны. Никакие прежние пользовательские Notes не редактировались.

Свежие mounted EditorArea tests проверяют 10 rapid edit/save acknowledgements, caret, live document, same-ID reloadGeneration restore и смену ID. Coordinator/backend tests проверяют stale writes, failures, flush/navigation/close protection и атомарность note/sidecar/revision. Native 10-cycle paragraph/list/table/marks matrix, immediate-close failure injection и полный CRUD с duplicate/pin/revision restore не завершены. Сохранность двух native saves не считается их эквивалентом.

### 10. Projects / Archive / Tags

В seeded native profile видны 2 активные Notes, project chip `Bulk A`, цвет первого тега и комфортный gap без decorative Note icon. Archive содержит standalone `Bulk N4` и одну строку `Bulk B` с двумя Notes; children не дублируются. Фильтр Projects показывает только проект, nested read-only view показывает Bulk N2/N5 и Back. Clean rows, dividers и DD.MM.YYYY просмотрены.

Свежие Phase A UI и Rust tests проверяют typed-name confirmation/cancel/zero notes, atomic cascade project deletion, rollback, archive provenance (manually archived остаётся archived), active project picker, remove/create project action и ordered first-tag persistence/duplicate/backup. Native archive/restore cycle, destructive project delete/restart, tag reorder/promote/zero/merge не выполнялись. Историческая пользовательская приёмка Phase A не переиспользуется как текущий native PASS.

### 11. Search

Свежие searchFoundation contract и Rust FTS behavioral tests проходят: Cyrillic/case/title/body/tags/project/archive/update/delete/special symbols; isolated benchmark выше. Backend cleanup после project/bulk deletion покрыт integration tests. Native поисковый сценарий exact/prefix/body/Cyrillic/no-results/deleted/archive после restart ещё NOT TESTED. Нормальный список Notes использует FTS, а не embedding search.

### 12. Models / Providers

Native **real Ollama**: существующий локальный сервер вернул ровно 2 модели (`bge-m3:latest`, `qwen3-4b-local:latest`); кнопка получения списка реально запросила сервер, dropdown показал обе. Выбрана qwen3-4b-local, connection test завершился успехом HTTP 200, профиль сохранён только в QA DB. API keys не использовались. Test loading был слишком быстрым для наблюдения; loading/stale/timeout/error tests прошли отдельно.

Note chat открывается и сдвигает editor, но остановлен перед privacy consent «Локальная модель / Подтвердить». Изменение consent через automation не выполнялось; запрошен hand-off пользователю. Native generation/copy/history/RAG/embedding flow не закрыты. Bridge real chat/embedding/citations/auto-index **NOT TESTED**: изолированный доступ к реальному credential не предоставлен. Реальный профиль/ключ не переносились в QA. LM Studio/Custom unavailable-provider native scenarios тоже NOT TESTED.

### 13. Auto Indexing

Свежие Rust tests покрывают relevance, queue, reconcile, provider failure, stale embedding completion, cloud consent и deletion cleanup; frontend Phase B tests покрывают scope/persistence/disabled states. Native Settings показывает automatic-index copy, current 5/5 Notes и 5 fragments, repair action вместо normal manual Update.

Полный real flow AUTO_RC3_001 -> AUTO_RC3_002 -> rapid FINAL_RC3 -> semantic search без manual refresh, unavailable embedding provider/recovery/restart pending queue не выполнен. Fake seeded vectors не являются настоящей generation или proof of real embedding provider. Cloud calls автоматически для QA не включались.

### 14. RAG Scopes

Phase B mounted selector и Rust scope tests PASS: ALL включает standalone и projects, explicit empty не превращается в ALL, missing IDs не расширяют scope, mixed/standalone metadata фильтруются, move/remove/archive/delete reconcile, retry хранит исходный request snapshot. Новые response sources не смешиваются с текущим UI scope.

Native реальные retrieval/generation и все ALL/standalone/mixed/empty/move/retry acceptance scenarios не выполнены. Browser geometry с синтетическими messages/sources проверяет layout, не retrieval correctness или Bridge качество.

### 15. Global Knowledge

Fresh globalKnowledgeAgent tests и Rust metadata/scope tests PASS. Structured count/first/last/updated/date routing не заменяется semantic top-k и уважает тот же effective scope. Нет нового placeholder reply в этом проходе. Реальные вопросы обо всей базе и датах через локальную/Bridge LLM NOT TESTED. Отдельный ignored metadata benchmark не запускался; FTS цифры к нему не относятся.

### 16. Editor

Fresh Phase C serializer/actual ProseMirror/mounted EditorArea tests PASS: combined marks, independent text/background colors, right-click selection, explicit generation, paragraph/code/list Tab/Shift-Tab, table Tab, safe links, wrapping, removed Formula actions. Browser geometry 8 cases: 1100/1440, 100/160%, light/dark; long text/URL/token не создают editor-wide overflow, code retains intentional local horizontal scroll. Context-menu bounds и link tooltip проверены.

Native rich paste/restart выполнен, но каждый toolbar action и right-click flow не нажимались в Tauri заново. Formula compatibility для старых документов остаётся в serializer, но новая Formula UI отсутствует; это не повод удалять старые данные. «Убрать выделение» убирает только background в свежем behavioral test, text color сохраняется. Полный native combined-marks restart ещё NOT TESTED.

### 17. Tables / Details / Divider

Actual ProseMirror tests повторяют merge/split/row/column operations и Markdown-first reload, гарантируют отсутствие потери externally added Markdown из stale merge sidecar, сохраняют borders/colors. Details summary/body/collapse и divider/list/heading roundtrip tests PASS. Browser details collapse PASS. Native pasted table/restart PASS только для простой таблицы. Native repeated 3x3 tools/thick-border toggle/colors/restart/details/divider acceptance matrix не закрыта.

### 18. Images / Drawing / Files

Fresh Phase D browser script PASS, **16 real-canvas cases**: 1100/1440 при 100/125/160% light/dark плюс intrinsic 800x1200, 800x800, 4096x3072, 64x48. Crop/apply/reopen и pixel checks подтверждают framing и annotation placement. Это реальные canvas pixels, не пустой screenshot или mocked renderer.

Mounted unit canvas rendering отдельно mocked; interaction tests проверяют six tools, topmost object hit-test, moving as one undoable operation, Escape, reset/cancel, safe retry. Не выдавать mocked canvas за визуальную проверку. В bulk seed asset -- минимальные valid magic bytes для refs/GC, НЕ полноценное декодируемое изображение; broken preview этой fixture не классифицируется как продуктовая image regression.

Policy: PNG/JPEG/WebP, image 25 MB, generic file 512 MB; generic file extension допускается, но empty/oversize/path invalid rejected. Canonical assets/ref-aware GC/fault tests PASS. Native real image upload, drawing six-tool edit/restart, shared-original crop, file Open/Reveal/Unicode/oversize flows NOT TESTED.

### 19. Callout / Calendar

Fresh mounted shared calendar tests PASS: years/month search, 2022/2030 range, Monday/Russian display, captured cursor insertion, keyboard/focus/nested Escape; callout one action/palette/recolor/sidecar roundtrip. Browser geometry включает editor panels, но не полный dedicated native calendar/callout matrix. Native оба entry points, reset/recolor/restart и month/year alignment на 160% NOT TESTED.

### 20. Exports

Fresh Phase E geometry PASS, 8 cases: 1100/1440, 100/160%, light/dark, four radio formats/TOC/export modal/Cancel. Fresh worker/service tests cover saved authoritative snapshot, flush failure blocks export, safe retry, sanitized filename, cancellation and typed backend write. Rust MD/project ZIP tests cover portable relative assets, duplicate titles and destination failure.

Дополнительно **compiled production worker** реально сформировал TXT (7893 bytes), DOCX (12548 bytes), PDF (24456 bytes) из synthetic Cyrillic/headings/checklist/details/table/image/100-paragraph fixture. Files только в Git-ignored `releases/phase-e-qa/compiled-worker.*`, НЕ version release staging. Production CSP соблюдён; генерация не сводится к unit mock.

DOCX открыт в настоящем Microsoft Word: без repair warning, русские headings/text, checklist text, details, 6 table cells с заливкой и thick borders, image; Ctrl-End показал 4 pages / 531 words и readable tail. Word закрыт без редактирования/Save. Native correctness каждого link/combined mark/ordered-list style не проверялась этим ограниченным fixture.

PDF структурно/multipage проверен tests/worker, но в реальном установленном PDF viewer не открывался: **NOT TESTED native PDF visual QA**. Native NoteFlow Save dialog/overwrite/cancel/last-keystroke flush для MD/TXT/DOCX/PDF и project ZIP всех трёх Notes не выполнены; Word просмотр generated file не подменяет этот flow.

### 21. TOC / Internal Links

Fresh actual ProseMirror tests PASS: H1/H2/H3 hierarchy, Unicode deterministic unique duplicate anchors, live rename/level/remove, same-ID silent replacement, click scroll without document update/selection change/autosave, unknown anchor safety. Phase E browser geometry confirms panel bounds. Native TOC click/edit/restart and safe external Ctrl-click not performed; no claim of complete native PASS.

### 22. Settings

Native visited Settings / Models / Data and export: Backup/Restore, knowledge status and bulk delete present; Formula/Language/contextual Note/Project export controls not added. Shared DD.MM.YYYY preview/archive dates viewed; relative Сегодня/HH:MM presentation intentionally remains relative, internal ISO unchanged.

Settings geometry full retry **PASS 24 cases**, 1100/1440/1920/2560 x 100/125/160% x light/dark, six subpages, five collapse/expand cycles per case. First script run interrupted by QA server restart after seven cases (ERR_CONNECTION_REFUSED); full rerun passed. This was test orchestration, not app network defect. All actual native Settings controls not toggled; privacy controls intentionally untouched.

### 23. Bulk Deletion

Test-only existing seed run PASS (1 test, 0.23 s) in a new isolated profile. Fixture: 5 Notes including 3 archived, 2 projects, 2 tags, 2 chats (note + RAG), 2 revisions, canonical asset refs, 5 chunks and seeded vectors; pre-delete backup created. Native first-stage counts/warnings/preserved data viewed; Cancel leaves 5/5 current. Second-stage lowercase phrase disables Delete; exact `УДАЛИТЬ ВСЕ ЗАМЕТКИ` enables it. Red cross has no stray underline. Second-stage Cancel also leaves 5/5.

Native final Delete **BLOCKED** pending explicit action-time confirmation on these synthetic records. General «продолжай» не считалось однозначным разрешением на финальное удаление. Не нажималась финальная кнопка; 10-second empty-state observation, restart-zero и UI restore-backup after delete **NOT TESTED**. Native 160% этого нового bulk pass не выполнялся (старое 160% из раздела 33 не переносится).

Fresh 15 frontend behavioral tests cover actual dialogs, exact case, Esc/Cancel/loading/failure/no raw paths, coordinator settle/invalidate and actual AppShell refresh. Six Rust integration/fault tests cover profile preservation, zero notes/chats/FTS/chunks/vectors/jobs, reopen, DB rollback, late save/chat/embedding response, post-commit reference-aware GC retry and backup/restore. Они важны, но не заменяют обязательное native final-delete acceptance.

### 24. Backup / Restore

Current format **v6**: Notes/Markdown/cache/sidecar/revisions, project/tag order/provenance, canonical asset blobs/refs, attachments, AI/RAG chats/messages/source snapshots, safe settings/provider metadata. Secrets/credential refs/vector contents/derived chunks не backup truth. Genuine versions 1-4 without historical chat schema не удаляют compatible local history; v5 optional fields/canonical conversion and v6 tested. Не создавался invented unsupported format.

Fresh temp-DB/filesystem integration tests cover malformed JSON, duplicate IDs, corruption, traversal/absolute paths, count/size/ratio limits, DB/chat/sidecar faults, staging/swap journal/recovery before/after commit, previous archive preservation, refs/FTS/chunk reconcile. Frontend coordinator tests cover pending flush/failure, same-ID contentVersion/reloadGeneration. Extraction precedes DB write transaction; filesystem swap journal repairs interrupted restore. Нельзя утверждать, что filesystem+SQLite имеют одну физическую atomic transaction.

Native normal file picker выбран только seed backup `noteflow-backup-20261004-162139.zip`. Preview реально показал **5 Notes / 2 projects / 2 tags / 2 attachments / 1 note chat / 1 RAG chat**, date **04.10.2026, 19:21**, app `1.0.0-rc.2` и предупреждение о замене данных. Cancel вернул текущие 5/5 Notes. **Native Restore не нажимался.** Full rich backup with new native drawing/callout/table и restart restoration не проверен.

Limits: archive 4 GiB, manifest 128 MiB, individual entry 4 GiB, uncompressed total 64 GiB, 25,000 entries, compression ratio 1000. Path normalization/managed roots enforced before staging. API keys and OS Credential Manager не читались при QA backup.

### 25. Assets / Revisions

Fresh Rust asset tests PASS: refs note/revision, duplicate/shared blob, delete one retains surviving ref, final reference GC, canonical protocol/path validation, backup dedup/tamper rejection. Revisions cadence/retention/mandatory history protection/scoped pruning/fault tests PASS. No new retention policy in this task. Native cadence/pruning/revision restore/shared-asset deletion matrix NOT TESTED. Full authored attachment visual fixture required before claiming native assets acceptance.

### 26. Security / Error Boundary

Production CSP enabled: script-src self, no connect-src wildcard, object/frame none, base-uri/form-action constrained; style unsafe-inline scoped to renderer needs. Image-src allows remote http/https images: known privacy/network boundary, not proof that all notes are offline under every pasted image. Canonical asset protocol limits active formats and origin; unsafe schemes/user-info/control characters filtered.

LLM Rust diagnostic output is debug_assertions gated, frontend diagnostics are import.meta.env.DEV gated, allowlist status/count/type/boolean/timing only. PublicCommandError and safeInvoke convert unexpected raw failures to safe messages; log/content tests PASS. Curl auth via stdin config, bounded timeout/cancellation, secret not command arguments. No actual keys/prompts/notes/reasoning dumped by QA.

Single-instance plugin is present and covered statically/tests; **native double-launch focus and absence of second writer NOT TESTED**. Controlled raw-error leakage tests are automated; native forced disk/SQL/provider failure not induced. Dependency advisory FAIL remains independent of these safeguards.

### 27. Responsive / Theme

Fresh browser runs: RAG **76 geometry checks + 6 source stress checks**, editor **8 cases**, image **16 cases**, export/TOC **8 cases**, Settings **24 cases**. Existing scripts use fixtures/actual components, not screenshots of guessed DOM. RAG covers 1100x700 and 1440x900 at 100/160%, 1920x1080 and 2560x1440 at 100%, scroll/draft/source panel bounds. High-resolution 160% RAG not included in that script. Image tests add 125%.

Observed native QA window at initial capture 1536x816 and later a resized non-maximized window; do not call either a full physical 1920/2560 matrix. Light native interface checked; dark/100-160% native all-page matrix not completed. Browser fixture green does not prove native WebView/input geometry on every page. Notes/Projects/Archive/Tags/Calendar/bulk modals all dimensions/themes still NOT TESTED as a complete global matrix.

### 28. Installer Lifecycle

`npm run tauri build` **PASS**: frontend Vite 12.50 s, release Rust compilation 1m10s; NSIS and both MSIs created from current unchanged rc.2 version. No release staging script/copy/publish executed. Outputs:

- `D:/Projects/NoteFlow/src-tauri/target/release/noteflow.exe`
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe`
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi`

| Installer | Bytes | SHA-256 current output |
| --- | ---: | --- |
| NSIS | 5635623 | 62CCADCF4329EF680EF95C568C0E0E87AD198E440F451E74B34BBEA0A1A4535B |
| ru-RU MSI | 7581696 | 9E7440C70929C50BB528DBDE1571DCC5BFA3F46AF3CEF3B654EA9BAC0A3E9BA5 |
| en-US MSI | 7581696 | C8C5F2FB8308FF4C53E97E812AE5D1FFD108F1ECB6D3820AB16E90D2DACED422 |

Static generated installer inspection: NSIS currentUser / RequestExecutionLevel user; WiX perMachine, ProductVersion 0.99.2, existing UpgradeCode `ff9d3de5-b119-5cb0-9873-43e30a097afa`. MajorUpgrade AllowDowngrades=yes noted for lifecycle testing; no installer rewrite. NSIS VERSIONWITHBUILD 1.0.0.0 does not prove prerelease upgrade behavior.

NSIS clean install, MSI install/launch/uninstall (ru/en), WebView2 bootstrap, shortcuts/profile path, reinstall data preservation, uninstall policy and NSIS/MSI coexistence **BLOCKED**: no safe second PC/isolated Windows VM available. Installing on the main machine could collide with real installed profile and does not satisfy safety requirement. Static scope mismatch is a test obligation, not a fabricated confirmed coexistence defect. All three installers and standalone EXE: Authenticode **UNSIGNED**.

### 29. Second PC / Windows Versions

| Claim | Actual coverage |
| --- | --- |
| Windows 11 current machine | TESTED only debug isolated profiles and build/browser portions above |
| Windows 10 | NOT TESTED |
| Second PC | NOT TESTED |
| Authenticode | UNSIGNED |
| macOS | NOT PRODUCTION VALIDATED |

No unsupported assertion about installer lifecycle or Windows 10 compatibility. VM tooling commands not found; this is not proof that a future isolated VM cannot be provisioned. No attempts to weaken OS security/SmartScreen or add signing/updater.

### 30. Original Requirement Audit / Matrix

Matrix recreated against the latest explicit Phase A-E/corrective requirements and current 87-section regression task. Current task supersedes initial prototype-only docs and old date/project-delete/formula/export/language wording. Implemented PASS means source/contract exists; Automated PASS means listed relevant checks passed, NOT every acceptance step is simulated. Native NOT TESTED may include a partial fresh observation, named in Notes. User coverage is NOT TESTED for this integrated HEAD in this run: historical Phase acceptance is not recycled. A row requiring native acceptance remains NOT TESTED/BLOCKED despite Automated PASS.

Evidence abbreviations: FA=phaseAOrganization + Rust data; FB=phaseBPolish + scoped RAG/embedding/knowledge Rust; FC=phaseCEditor + serializer + mounted EditorArea; FD=phaseDImageEditor + imageGeometry + assets; FE=phaseEBehavior/Export + Rust export; BD=deleteAllNotes + six Rust bulk tests; BI=backupImportFlow + Rust backup/fault; GEO=existing fresh browser scripts described above. All mentioned suites are part of current green run unless explicitly NOT TESTED.

| Requirement | Origin/Phase | Implemented | Automated coverage | Native coverage | User coverage | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A01 Archive All/Projects/Notes, no duplicate children | A / task 14 | PASS | PASS FA/Rust | NOT TESTED | NOT TESTED | NOT TESTED | Native All/Projects/nested viewed; Notes filter not repeated |
| A02 Project archive is atomic | A / 13 | PASS | PASS Rust rollback | NOT TESTED | NOT TESTED | NOT TESTED | No fresh native archive operation |
| A03 Manually archived note survives project restore | A corrective / 13 | PASS | PASS Rust provenance/reopen | NOT TESTED | NOT TESTED | NOT TESTED | Current-schema archive viewed, cycle not run |
| A04 Archive count/date/actions clean rows | A corrective / 14 | PASS | PASS FA/displayDate | PASS | NOT TESTED | PASS | Native date/project count/dividers/actions viewed at current size |
| A05 Nested archive notes read-only, Back | A / 14 | PASS | PASS FA/Rust | PASS | NOT TESTED | PASS | Bulk B with two children opened and Back used |
| A06 Atomic project restore | A / 13 | PASS | PASS Rust rollback | NOT TESTED | NOT TESTED | NOT TESTED | Native restore not executed |
| A07 Archive filter/page ownership policy | A / 14 | PASS | PASS FA | NOT TESTED | NOT TESTED | NOT TESTED | Partial filters only |
| A08 Exact project-name cancel/zero notes | A corrective / 12 | PASS | PASS FA | NOT TESTED | NOT TESTED | NOT TESTED | Mounted dialog proof, not native delete |
| A09 Project+notes deletion count warning/atomic | A corrective / 12 | PASS | PASS FA/Rust cascade | NOT TESTED | NOT TESTED | NOT TESTED | No destructive project native action |
| A10 Note ModalShell delete wording | A corrective / 9 | PASS | PASS FA | NOT TESTED | NOT TESTED | NOT TESTED | No fresh note delete modal |
| A11 Archived projects excluded from assign picker | A / 12 | PASS | PASS FA | NOT TESTED | NOT TESTED | NOT TESTED | Native picker not opened |
| A12 Create project from note menu | A / 12 | PASS | PASS FA | NOT TESTED | NOT TESTED | NOT TESTED | No native creation through menu |
| A13 Remove note from project | A / 12 | PASS | PASS FA/Rust | NOT TESTED | NOT TESTED | NOT TESTED | Scope tests not native action |
| A14 Project displayed as chip, not preview | A corrective / 16 | PASS | PASS FA | PASS | NOT TESTED | PASS | Bulk A real chip observed; long/narrow variants separately not tested |
| A15 Note card first-tag gap, no decorative icon | A corrective / 16 | PASS | PASS FA/style | PASS | NOT TESTED | PASS | Current native list visual inspected |
| A16 Project scope chip clear navigation | A / 16 | PASS | PASS FA | NOT TESTED | NOT TESTED | NOT TESTED | Mounted handler proof |
| A17 No breadcrumb | A / 16 | PASS | PASS contracts | PASS | NOT TESTED | PASS | Native layout inspected |
| A18 No Library heading | A / 16 | PASS | PASS contracts | PASS | NOT TESTED | PASS | Native layout inspected |
| A19 Multiple tags ordered after restart | A / 15 | PASS | PASS Rust/order/FA | NOT TESTED | NOT TESTED | NOT TESTED | Native reorder/restart missing |
| A20 Reorder first tag changes all accent surfaces | A / 15 | PASS | PASS FA/Rust | NOT TESTED | NOT TESTED | NOT TESTED | Native first-tag reorder missing |
| A21 Remove first promotes next; neutral zero | A / 15 | PASS | PASS FA/Rust | NOT TESTED | NOT TESTED | NOT TESTED | No native removal |
| A22 No auto new tag | A / 15 | PASS | PASS FA/contracts | NOT TESTED | NOT TESTED | NOT TESTED | Full new-note/tag default native flow missing |
| A23 Tag color consistent list/editor/source surfaces | A / 15 | PASS | PASS tag/UI tests | NOT TESTED | NOT TESTED | NOT TESTED | Only list accent viewed |
| A24 Tag order duplicate/backup persistence | A / 15,27 | PASS | PASS Rust roundtrip | NOT TESTED | NOT TESTED | NOT TESTED | No native duplicate/restore |
| A25 Markdown import in note overflow | A / 17 | PASS | PASS service/UI contracts | NOT TESTED | NOT TESTED | NOT TESTED | Native file import not performed |
| A26 Multi-file/Cyrillic/empty/duplicate-safe import | A / 17 | PASS | PASS Rust fixtures | NOT TESTED | NOT TESTED | NOT TESTED | Native paste is not file import |
| A27 Backup order/provenance compatibility | A / 8,64 | PASS | PASS BI/Rust versions | NOT TESTED | NOT TESTED | NOT TESTED | Native preview only |
| A28 Tag color/metadata change keeps FTS/RAG current | A / 18 | PASS | PASS Rust relevance/search | NOT TESTED | NOT TESTED | NOT TESTED | No native query after tag color change |
| A29 P0 save/CAS/sidecar/revision/asset safeguards | P0 / 10 | PASS | PASS Rust/FC/coordinator | NOT TESTED | NOT TESTED | NOT TESTED | Two saves/restart only, fault scenarios automated |
| A30 Migration 15 ordered tags/provenance | A / 8 | PASS | PASS Rust | NOT TESTED | NOT TESTED | NOT TESTED | Current-schema seed not old DB upgrade |
| A31 Safe public persistence errors | P0 / 69 | PASS | PASS security/error tests | NOT TESTED | NOT TESTED | NOT TESTED | No native forced persistence failure |
| A32 DD.MM.YYYY display, persisted ISO untouched | A final / 14 | PASS | PASS displayDate/local calendar | PASS | NOT TESTED | PASS | Archive and backup actual dates viewed; shared helper audited |
| B01 ALL/multiple project selector persisted | B / 23 | PASS | PASS FB/Rust | NOT TESTED | NOT TESTED | NOT TESTED | No native real request |
| B02 Standalone/mixed scope without leakage | B corrective / 24,25 | PASS | PASS FB/Rust | NOT TESTED | NOT TESTED | NOT TESTED | Synthetic geometry not retrieval proof |
| B03 Explicit empty blocks Send, not fallback ALL | B / 26 | PASS | PASS FB | NOT TESTED | NOT TESTED | NOT TESTED | No native scope click |
| B04 Move/remove/archive/delete scope reconcile | B / 27 | PASS | PASS Rust | NOT TESTED | NOT TESTED | NOT TESTED | No fresh native semantic query cycle |
| B05 Retry uses original request scope | B / 28 | PASS | PASS FB/Rust | NOT TESTED | NOT TESTED | NOT TESTED | Native retry absent |
| B06 Knowledge counts/chronology/date agree with scope | B / 29 | PASS | PASS globalKnowledgeAgent/Rust | NOT TESTED | NOT TESTED | NOT TESTED | Native model questions absent |
| B07 Automatic coalesced indexing final content | B / 21 | PASS | PASS Rust queue/stale tests | NOT TESTED | NOT TESTED | NOT TESTED | No real AUTO_RC3/FINAL_RC3 flow |
| B08 Provider retry/restart pending/consent | B / 22 | PASS | PASS Rust/LLM tests | BLOCKED | NOT TESTED | BLOCKED | Privacy consent hand-off; no real embedding job |
| B09 Manual repair only, no normal Update | B corrective / 60 | PASS | PASS contracts | PASS | NOT TESTED | PASS | Native Data screen viewed |
| B10 Six steps/Skip/Back/once | B / 7,32 | PASS | PASS FB | NOT TESTED | NOT TESTED | NOT TESTED | Native six steps/complete/restart PASS; Skip/Back missing |
| B11 Unified tooltips focus/Esc/no clipping | B / 32 | PASS | PASS FB/GEO | NOT TESTED | NOT TESTED | NOT TESTED | Native complete sidebar/toolbar/sources matrix missing |
| B12 History/sources responsive panels | B corrective / 31 | PASS | PASS RAG GEO | NOT TESTED | NOT TESTED | NOT TESTED | Native 1100/160 acceptance missing |
| B13 Historical source snapshots remain after note deletion | B / 30 | PASS | PASS Rust/RAG tests | NOT TESTED | NOT TESTED | NOT TESTED | Native single-note delete not run |
| C01 Caret ten saves paragraph/list/table/marks | C / 10,11 | PASS | PASS FC mounted | NOT TESTED | NOT TESTED | NOT TESTED | Native two-save paste/restart only |
| C02 Immediate switch/close/failure protected | C / 10 | PASS | PASS coordinator/Rust | NOT TESTED | NOT TESTED | NOT TESTED | Native settled close only |
| C03 Basic formatting complete toolbar | C / 33 | PASS | PASS editor tests | NOT TESTED | NOT TESTED | NOT TESTED | Native subset from paste |
| C04 Combined marks survive restart | C / 34 | PASS | PASS FC/serializer | NOT TESTED | NOT TESTED | NOT TESTED | Combined native restart missing |
| C05 Highlight and text color independent | C / 34 | PASS | PASS FC | NOT TESTED | NOT TESTED | NOT TESTED | Native colors not selected |
| C06 Right-click captured selection/Esc/input context | C / 35 | PASS | PASS FC/GEO | NOT TESTED | NOT TESTED | NOT TESTED | Browser bounds/mounted action, not native |
| C07 Tab/Shift-Tab list/code/paragraph/table | C / 36 | PASS | PASS actual ProseMirror FC | NOT TESTED | NOT TESTED | NOT TESTED | Native restart indentation missing |
| C08 Russian/URL/no-space wrapping | C / 37 | PASS | PASS editor GEO | NOT TESTED | NOT TESTED | NOT TESTED | Native long-note acceptance missing |
| C09 URL-only tooltip/safe opener/internal anchor | C / 38 | PASS | PASS link/FE/GEO | NOT TESTED | NOT TESTED | NOT TESTED | No native Ctrl-click |
| C10 Formula UI removed, old data compatible | C / 39 | PASS | PASS FC/contracts | NOT TESTED | NOT TESTED | NOT TESTED | All native menus/help not traversed |
| C11 Repeated table geometry/colors/thick borders | C / 40 | PASS | PASS FC/table/serializer | NOT TESTED | NOT TESTED | NOT TESTED | Native simple table only |
| C12 Editable details summary/body/collapse/restart | C / 41 | PASS | PASS FC/GEO | NOT TESTED | NOT TESTED | NOT TESTED | Native details not created |
| C13 Divider locations survive reload | C / 42 | PASS | PASS FC | NOT TESTED | NOT TESTED | NOT TESTED | Native divider not inserted |
| C14 Nested Settings sidebar no gaps | C corrective / 60 | PASS | PASS Settings GEO 24 cases | NOT TESTED | NOT TESTED | NOT TESTED | Native collapse/repeat not completed |
| D01 Image real formats/limits/canonical/resize | D / 43 | PASS | PASS FD/assets | NOT TESTED | NOT TESTED | NOT TESTED | Native image upload missing |
| D02 Crop/apply/restart keeps shared original | D / 44 | PASS | PASS FD/GEO/assets | NOT TESTED | NOT TESTED | NOT TESTED | Browser real pixels, not native restart |
| D03 Six drawing tools/Undo/Redo/zoom | D / 45 | PASS | PASS FD mounted/GEO subset | NOT TESTED | NOT TESTED | NOT TESTED | Native all six tools missing |
| D04 Reset confirmation cancel/reset | D / 46 | PASS | PASS FD | NOT TESTED | NOT TESTED | NOT TESTED | No native Reset |
| D05 Drawing color/thickness, blue focus | D corrective / 46 | PASS | PASS FD/style checks | NOT TESTED | NOT TESTED | NOT TESTED | Native control states not compared |
| D06 Blank drawing Apply/resize/restart | D / 47 | PASS | PASS FD | NOT TESTED | NOT TESTED | NOT TESTED | No native blank drawing |
| D07 Files Unicode/Open/Reveal/limits/path | D / 48 | PASS | PASS FD/Rust assets | NOT TESTED | NOT TESTED | NOT TESTED | No native external open/reveal |
| D08 One callout palette/recolor/restart | D / 49 | PASS | PASS FD/serializer | NOT TESTED | NOT TESTED | NOT TESTED | Native palette not visited |
| D09 Both calendars/month/year/keys/Escape | D / 50 | PASS | PASS FD | NOT TESTED | NOT TESTED | NOT TESTED | Native calendars not exercised |
| D10 Monday/Russian/DD.MM/centered calendar zoom | D corrective / 50 | PASS | PASS FD/displayDate | NOT TESTED | NOT TESTED | NOT TESTED | Not complete native visual matrix |
| D11 Move existing drawing object, not duplicate | D corrective / 45 | PASS | PASS FD actual interaction/GEO pixels | NOT TESTED | NOT TESTED | NOT TESTED | Native move/restart missing |
| E01 Native Save location/Cancel/status/overwrite | E / 51,56 | PASS | PASS FE service/dialog mocks | NOT TESTED | NOT TESTED | NOT TESTED | Actual backup Open dialog is not export Save |
| E02 Clean MD relative assets/no internal URI | E / 51 | PASS | PASS Rust MD/assets | NOT TESTED | NOT TESTED | NOT TESTED | Native exported MD file absent |
| E03 TXT UTF-8 no HTML/JSON/MD garbage | E / 52 | PASS | PASS FE + compiled worker | NOT TESTED | NOT TESTED | NOT TESTED | Generated file; no native Notepad/Save flow |
| E04 Real DOCX/Word/Cyrillic/styles/pagination | E / 53 | PASS | PASS FE + compiled worker | NOT TESTED | NOT TESTED | NOT TESTED | Word opened limited fixture, 4 pages/no repair; full marks/links not observed |
| E05 Real PDF multipage/Cyrillic/viewer | E / 54 | PASS | PASS FE + compiled worker | NOT TESTED | NOT TESTED | NOT TESTED | No actual PDF viewer visual check |
| E06 Export flush latest content/failure blocks | E / 55 | PASS | PASS FE/coordinator | NOT TESTED | NOT TESTED | NOT TESTED | No native last-keystroke export |
| E07 Project ZIP 3 unique Notes/Cyrillic/assets | E / 57 | PASS | PASS Rust export tests | NOT TESTED | NOT TESTED | NOT TESTED | No native project Save/ZIP inspection |
| E08 ZIP path safety/atomic destination failure | E / 58 | PASS | PASS Rust faults/sanitize | NOT TESTED | NOT TESTED | NOT TESTED | Native failure not induced |
| E09 TOC hierarchy/duplicates/live updates | E / 59 | PASS | PASS FE actual ProseMirror/GEO | NOT TESTED | NOT TESTED | NOT TESTED | Native TOC lifecycle not run |
| E10 Anchor navigation no autosave/unknown safe | E / 38,59 | PASS | PASS FE | NOT TESTED | NOT TESTED | NOT TESTED | Native anchor click not run |
| E11 Settings only profile backup/models/status | E / 60 | PASS | PASS contracts/GEO | PASS | NOT TESTED | PASS | Actual Data/Models visible; contextual export absent |
| E12 Project label Export, not Export Project | E micro-fix | PASS | PASS exact label tests | NOT TESTED | NOT TESTED | NOT TESTED | Native project overflow not reopened |
| E13 Russian-only UI, no language setting | E / 60 | PASS | PASS contracts/GEO | NOT TESTED | NOT TESTED | NOT TESTED | Native tested screens Russian; all labels not enumerated |
| E14 Clear highlight label/action only background | C/E corrective / 34 | PASS | PASS FC | NOT TESTED | NOT TESTED | NOT TESTED | Native “Убрать выделение” not clicked |
| G01 Knowledge chunks wording understandable | task 60 | PASS | PASS contracts | PASS | NOT TESTED | PASS | Native copy explains parts of long notes |
| G02 Bulk two-stage/exact phrase/Cancel/Esc/loading | bulk / 61 | PASS | PASS BD | NOT TESTED | NOT TESTED | NOT TESTED | Two Cancel and case checks native; Esc/loading not repeated |
| G03 Bulk zero all indexes/chats/jobs, profile remains | bulk / 61 | PASS | PASS BD/Rust | BLOCKED | NOT TESTED | BLOCKED | Final native deletion lacks action-time confirmation |
| G04 Backup before bulk/restore/restart; old versions | P0.2 / 62-64 | PASS | PASS BI/BD/Rust | BLOCKED | NOT TESTED | BLOCKED | Native preview/Cancel PASS; final Restore not performed |
| G05 Ref-aware GC/revision retention persistence | P0.3/P0.4 / 65,66 | PASS | PASS Rust/asset/retention | NOT TESTED | NOT TESTED | NOT TESTED | Native shared asset/cadence flows missing |
| G06 Single instance/CSP/public error boundaries | security / 67-69 | PASS | PASS static + behavioral | NOT TESTED | NOT TESTED | NOT TESTED | Native double-launch/forced failure missing |
| G07 All pages dimensions/themes/global geometry | task 70,71 | PASS | PASS GEO subsets | NOT TESTED | NOT TESTED | NOT TESTED | Notes/Projects/Archive/Tags/Calendar/bulk complete matrix missing |
| G08 NSIS/MSI install/reinstall/uninstall/coexistence | release / 73-76 | PASS | PASS build/config; NOT TESTED lifecycle | BLOCKED | NOT TESTED | BLOCKED | No safe isolated Windows environment |
| G09 Windows10/second PC/macOS production claim | release / 77-80 | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | Win11 dev only; unsigned/macos separately limited |
| G10 Zero production npm vulnerabilities | security / 6 | FAIL | FAIL npm audit | NOT TESTED | NOT TESTED | FAIL | 2 TipTap advisories, 39 affected packages |
| G11 New bulk icon clean in all states/160% | bulk corrective | PASS | PASS BD style regression | NOT TESTED | NOT TESTED | NOT TESTED | Fresh native 100% default observed, no new 160% proof |
| G12 Current candidate built unchanged rc.2 | release / 72 | PASS | PASS tauri build/version/config | NOT TESTED | NOT TESTED | PASS | Outputs exist, not installer lifecycle PASS |
| G13 No published staging/commit/tag/version changes | task safety | PASS | PASS Git/files verification | NOT TESTED | NOT TESTED | PASS | Only report edited; ignored QA worker outputs are not release staging |
| G14 Unsigned RC/macOS/updater limitations honest | release limits | PASS | PASS signature/config review | NOT TESTED | NOT TESTED | KNOWN LIMITATION | Signing/updater not introduced; macOS not validated |

Итого **98 rows: 12 PASS / 80 NOT TESTED / 4 BLOCKED / 1 FAIL / 1 KNOWN LIMITATION**. Все current Status используют только разрешённый словарь; отдельная проверка отчёта не нашла trailing whitespace/conflict markers. Исторические статусы разделов 1-33 не включены в эти числа.

Матрица не полностью green. Native gaps нельзя закрывать изменением Status на PASS на основании unit/source-regex tests. Missing evidence записано отдельно от confirmed defect: NOT TESTED не означает FAIL бизнес-логики. Полная матрица остаётся обязательной после устранения security gate.

### 31. P0 / P1 / P2 / INFO

| ID | Priority | Finding | Evidence / next action |
| --- | --- | --- | --- |
| RG-SEC-001 | P1 | Production dependency security gate FAIL | Две TipTap core advisory; benign inherited-attribute primitive reproduced, no app exploit claim. Controlled package update + full gates required |
| RG-QA-002 | P1 release evidence | Mandatory native bulk deletion/restore incomplete | Confirmation/cancel preview proved; final deletion/zero/restart/restore not. Requires explicit safe-profile action-time confirmation |
| RG-QA-003 | P1 release evidence | Installer lifecycle/reinstall/coexistence not validated | Builds/static scope inspected only; provide isolated Windows VM/second PC before release readiness |
| RG-QA-004 | P1 acceptance coverage | Integrated A-E native matrix incomplete | Missing destructive/project/tag/model/index/editor/export flows enumerated above; no old user PASS carry |
| RG-QA-005 | INFO | Bridge not tested; Ollama limited to discovery/test | No safe isolated real credential; consent hand-off blocks local generation |
| RG-DOC-006 | P2 | README under-describes current candidate and mentions removed Formula UI | Future approved docs update only; no README edit during regression |
| RG-ENV-007 | INFO | WebView shutdown class-unregister warning | Error 1412 on dev close; process exit 0, no observed stuck process. Not promoted to crash without evidence |

No newly proven P0 data-loss/exploitable security defect. This is not a guarantee that none exists in untested flows. Old missing bulk feature blocker is implemented in HEAD; the remaining gate is fresh native acceptance, not reimplementing it. No new visual redesign or feature creep proposed.

### 32. Known Limitations

Unsigned installers/EXE; possible SmartScreen warning. No updater or signing changes. macOS production not validated. Windows 10/second PC/installer lifecycle unavailable in this environment. Real Bridge and full real local generation coverage missing. Browser fixtures are not native WebView and synthetic messages are not LLM outputs. New TipTap advisory failure is NOT merely a known limitation that may be waived silently. Full streaming/reranker/other unrelated roadmap features are outside this task.

### 33. README Updates Required

README not edited. Before an approved release-doc pass: remove implication of new Formula insertion; document four note export formats and project ZIP, drawing/TOC, current automatic indexing/repair-only UI and ALL/standalone/mixed scopes; make Russian-only current UI explicit. Published-current-release wording should be reconciled with actual GitHub release at that time. Keep unsigned/SmartScreen/macOS/updater/lifecycle caveats. Do not declare Windows 10 tested or native installer verified from this report.

### 34. Changed Files During Regression

Only manually edited file: `docs/tasks/rc3-full-regression-report.md` (already intentional untracked). No production/test/CSS/migration/package/README edits. Build refreshed ignored dist/target installer outputs; existing QA scripts generated ignored synthetic `releases/phase-e-qa` worker/geometry artifacts and Windows Temp fixtures, not versioned release staging. Protected seven local files unchanged by hash.

`git diff --check` PASS. Tracked diff and staged diff empty; untracked report is not inspected by Git whitespace diff, so it is also checked separately for trailing whitespace/conflict markers. Final `git status`: same eight intentional untracked, no modified/deleted tracked files. No commit/tag/push/merge/GitHub release/version bump. QA dev sessions finished after X close; Word closed without Save. Temporary QA data and seed backup retained outside repository for reproducible continuation, not mixed with real user data.

### 35. Final Verdict

**NEEDS MORE WORK**

Fresh 467 frontend tests and 255 Rust tests, isolated FTS and builds pass. Production npm audit FAIL, native destructive/restore and installer lifecycle not complete, and original requirement matrix has substantial NOT TESTED/BLOCKED rows. Поэтому **READY FOR USER RC3 FINAL SMOKE** не выдаётся.

Следующая последовательность без version bump: согласованное исправление TipTap advisories; полный повтор green/security gates; подтверждённый native bulk/backup loop на этом временном профиле; real local/Bridge provider/index/scope и remaining A-E native acceptance; isolated NSIS/MSI reinstall/uninstall/coexistence. Утверждение Windows 10/second-PC readiness только после настоящих испытаний. После этого -- новый final user smoke, не автоматический release.

## 35. TipTap Security Remediation

### 35.1. Scope And Baseline

Отдельный согласованный проход 04-05.10.2026 (сборка завершена после полуночи), не продолжение remaining RC3 matrix. Branch `feature/rc3-product-polish`, HEAD `542a0e64a78dccbd00fd69d47c4b1d69bdaa0670`. На входе tracked tree clean, index empty; восемь intentional untracked сохранены. Версия остаётся `1.0.0-rc.2`; productName `NoteFlow`, identifier `com.noteflow.desktop`, MSI mapping `0.99.2` не менялись.

До обновления установлены **41 TipTap package версии 3.26.1**, из них 18 direct; это уже v3, major migration не требовалась. После обновления те же 41 package версии **3.30.5**, 20 direct. Core/pm уже импортировались приложением напрямую, но были только transitive dependencies; теперь они явно объявлены, без добавления новой библиотеки.

Изменены только `package.json`, `package-lock.json`, `tests/phaseCEditor.test.ts`, новый `tests/tiptapSecurity.test.ts` и этот ранее untracked report. Production `src`, Rust, CSS, migrations, README, business logic и storage не редактировались. Не выполнялись stage/commit/tag/push/release/version bump. Installer lifecycle, Windows 10, second PC, Bridge и оставшаяся full-regression matrix намеренно не запускались.

### 35.2. Exact Online Audit

В окружении npm по умолчанию `offline=true`. Поэтому начальный ответ offline audit `0` НЕ засчитан как security evidence. Все результаты ниже получены с явным `--offline=false` против npm registry, в human-readable и JSON формах.

| Gate | До | После |
| --- | --- | --- |
| `npm audit --omit=dev --offline=false` | exit 1; 39 affected packages | exit 0; found 0 vulnerabilities |
| `npm audit --omit=dev --offline=false --json` | 38 moderate, 1 high | vulnerabilities `{}`, all severity counts 0 |
| TipTap core/pm/starter-kit tree | 3.26.1, deduplicated | 3.30.5, deduplicated; `npm ls` exit 0 |
| Остальные production advisories | отсутствуют | отсутствуют |

Baseline дополнительно повторно online-аудирован из отдельной копии неизменённых HEAD manifests в Windows Temp, без возврата старых dependencies в рабочий проект: результат снова 39. Это **две root advisory**, а не 39 независимых CVE. Audit metadata: prod 140 / dev 196 / optional 94 / total 340; metadata categories не следует складывать как отдельные установленные packages.

| Код | Root advisory | Affected core range | First patched | Aligned installed fix |
| --- | --- | --- | --- | --- |
| A | [GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh): own `__proto__` в mergeAttributes; moderate | `>=2.0.0-alpha.0 <3.30.4` | 3.30.4 | 3.30.5 |
| B | [GHSA-j95f-988m-3j2f](https://github.com/advisories/GHSA-j95f-988m-3j2f): block/inline Markdown attribute parsing ReDoS; high | `>=3.7.0 <3.30.5` | 3.30.5 | 3.30.5 |

Официальные release notes: [3.30.4](https://github.com/ueberdosis/tiptap/releases/tag/v3.30.4), [3.30.5](https://github.com/ueberdosis/tiptap/releases/tag/v3.30.5). Installed 3.26.1 входит в оба affected core ranges. Reachability не преувеличена: library mergeAttributes primitive доказан; end-to-end NoteFlow XSS не заявляется. Production NoteFlow paste использует свой Markdown converter; vulnerable public spec helpers не вызываются в `src`.

При install полный, не `omit=dev`, audit сообщил 5 findings: 1 low / 1 moderate / 3 high. Это отдельный **dev dependency** scope; ноль production vulnerabilities не равен нулю vulnerabilities во всём toolchain. Unrelated upgrades для их устранения не выполнялись.

### 35.3. Complete TipTap Inventory And Paths

Все строки ниже: installed **3.26.1 -> 3.30.5**, license **MIT**, patched aligned version **3.30.5**. Полные имена имеют префикс `@tiptap/`; installed path каждой строки `node_modules/@tiptap/<package>`, nested copies отсутствуют. `root` означает direct NoteFlow dependency, стрелки также учитывают wrapper imports/peer dependencies, а не только npm `dependencies`.

Audit aggregate range codes: C = core `<=3.30.4`; D = `<=3.0.0-next.8 || 3.22.4 - 3.30.3`; W = `3.0.0-beta.0 - 3.0.0-next.8 || 3.22.4 - 3.30.3`. D/W являются npm propagated package ranges, НЕ отдельными root advisory ranges. Для root A/B точные диапазоны приведены выше. Audit baseline отметил 39 packages; pm и starter-kit не имели самостоятельного finding.

| Package | Direct/transitive после | Dependency path (representative) | Baseline advisory | Audit range |
| --- | --- | --- | --- | --- |
| core | direct; ранее transitive | root / react, starter-kit, extensions -> core | A + B | C |
| pm | direct; ранее transitive | root / core -> pm | нет собственного finding | -- |
| starter-kit | direct | root -> starter-kit | нет собственного finding; содержит affected dependencies | -- |
| react | direct | root -> react -> core | A через core | D |
| extension-code | direct | root -> extension-code -> core | A | D |
| extension-color | direct | root -> extension-color -> extension-text-style -> core | A | D |
| extension-highlight | direct | root -> extension-highlight -> core | A | D |
| extension-image | direct | root -> extension-image -> core | A | D |
| extension-link | direct | root -> extension-link -> core | A | D |
| extension-subscript | direct | root -> extension-subscript -> core | A | D |
| extension-superscript | direct | root -> extension-superscript -> core | A | D |
| extension-table | direct | root -> extension-table -> core | A | D |
| extension-table-cell | direct | root -> extension-table-cell -> extension-table -> core | A | W |
| extension-table-header | direct | root -> extension-table-header -> extension-table -> core | A | W |
| extension-table-row | direct | root -> extension-table-row -> extension-table -> core | A | W |
| extension-task-item | direct | root -> extension-task-item -> extension-list -> core | A | W |
| extension-task-list | direct | root -> extension-task-list -> extension-list -> core | A | W |
| extension-text-align | direct | root -> extension-text-align -> core | A | D |
| extension-text-style | direct | root -> extension-text-style -> core | A | D |
| extension-underline | direct | root -> extension-underline -> core | A | D |
| extension-blockquote | transitive | root -> starter-kit -> extension-blockquote -> core | A | D |
| extension-bold | transitive | root -> starter-kit -> extension-bold -> core | A | D |
| extension-bubble-menu | transitive; override | root -> react -> extension-bubble-menu -> core | A | D |
| extension-bullet-list | transitive | root -> starter-kit -> extension-bullet-list -> extension-list -> core | A | W |
| extension-code-block | transitive | root -> starter-kit -> extension-code-block -> core | A | D |
| extension-document | transitive | root -> starter-kit -> extension-document -> core | A | D |
| extension-dropcursor | transitive | root -> starter-kit -> extension-dropcursor -> extensions -> core | A | W |
| extension-floating-menu | transitive; override | root -> react -> extension-floating-menu -> core | A | D |
| extension-gapcursor | transitive | root -> starter-kit -> extension-gapcursor -> extensions -> core | A | W |
| extension-hard-break | transitive | root -> starter-kit -> extension-hard-break -> core | A | D |
| extension-heading | transitive | root -> starter-kit -> extension-heading -> core | A | D |
| extension-horizontal-rule | transitive | root -> starter-kit -> extension-horizontal-rule -> core | A | D |
| extension-italic | transitive | root -> starter-kit -> extension-italic -> core | A | D |
| extension-list | transitive | root -> task-item/task-list/starter-kit -> extension-list -> core | A | D |
| extension-list-item | transitive | root -> starter-kit -> extension-list-item -> extension-list -> core | A | W |
| extension-list-keymap | transitive | root -> starter-kit -> extension-list-keymap -> extension-list -> core | A | W |
| extension-ordered-list | transitive | root -> starter-kit -> extension-ordered-list -> extension-list -> core | A | W |
| extension-paragraph | transitive | root -> starter-kit -> extension-paragraph -> core | A | D |
| extension-strike | transitive | root -> starter-kit -> extension-strike -> core | A | D |
| extension-text | transitive | root -> starter-kit -> extension-text -> core | A | D |
| extensions | transitive | root -> starter-kit -> extensions -> core | A | D |

`extension-collaboration-caret`, collaboration, Yjs, y-prosemirror и y-protocols не установлены; collaborative editing не добавлялся. Pro/paid packages не добавлены. Поэтому отдельная CollaborationCaret advisory не является finding этого tree.

### 35.4. Minimal Lockfile Remediation

18 прежних direct TipTap ranges заменены exact pins; добавлены явные core/pm. Для optional react menus добавлены два exact overrides. Без них npm выбирал menus 3.31.4 с несовместимыми exact peers core/pm; такой промежуточный lockfile не принят.

Обычный in-place install и targeted update сначала отказались с ERESOLVE из-за старого strict peer graph. Решение: в temporary dependency snapshot сохранить исходные non-TipTap locks, удалить из snapshot только старые TipTap entries и штатным npm пересчитать lock с новыми pins/overrides; затем проверить diff и установить его в проект. Финальный `npm install --offline=false --ignore-scripts` прошёл без peer warnings. Не использовались `--force`, `--legacy-peer-deps` или `npm audit fix`.

Единственное non-TipTap version/integrity изменение: `prosemirror-model 1.25.9 -> 1.25.12`; новый `@tiptap/pm` требует `^1.25.11`. React, Vite, Tauri, marked, docx, pdfmake и остальные unrelated locked versions/integrities сохранены. Полный structural comparison old/new lock выполнен; count TipTap остаётся 41, ровно одна core и одна pm copy.

### 35.5. Security And Editor Tests

Добавлены **6 frontend tests**, baseline 467 -> **473**:

- Пять в `tests/tiptapSecurity.test.ts`: aligned patched MIT release; JSON own `__proto__` через public mergeAttributes и public DOMSerializer; bounded block, inline и application Markdown parsing probes.
- Один в `tests/phaseCEditor.test.ts`: actual editor -> Markdown/sidecar -> canonical reopen -> actual editor; русский heading, combined marks, internal link, checklist, table geometry, Details, callout, divider и image JSON attrs.

Prototype test не копирует library internals: benign canary и inert onerror input не становятся inherited DOM attrs; Object.prototype и результат имеют ожидаемый prototype; нормальные CSS classes продолжают merge-иться. До обновления benign local probe получил inherited canary, после обновления test PASS. Global Object.prototype mutation не воспроизведена до обновления и не приписывается advisory.

ReDoS tests используют public `createAtomBlockMarkdownSpec` / `createInlineMarkdownSpec`. Каждая synchronous CPU probe в отдельном Worker: startup deadline 10 s, CPU deadline 2 s, actual parse assertion <1 s, `finally` terminate; test timeout 15 s. Public stress: block около 82 KB, inline около 131 KB. NoteFlow application probe около 53 KB. Существующие test timers/thresholds не ослаблялись.

Одинаковые небольшие synthetic inputs, реальные local timings, не стабильный CI benchmark:

| Probe | Repeats / bytes | 3.26.1 parse ms | 3.30.5 parse ms |
| --- | --- | --- | --- |
| block | 256 / 2588 | 13.14 | 0.42 |
| inline | 256 / 4104 | 13.35 | 0.42 |
| block | 512 / 5148 | 32.91 | 0.75 |
| inline | 512 / 8200 | 20.72 | 0.21 |
| block | 1024 / 10268 | 102.63 | 0.26 |
| inline | 1024 / 16392 | 84.16 | 1.21 |

Не скрывается ограничение: первая новая application probe использовала около 213 KB adversarial input и превысила 2 s в **собственном** NoteFlow Markdown pipeline уже после TipTap patch. Размер только этой новой fixture уменьшен до published-PoC-sized около 53 KB; direct local parse на нём 139 ms. Public library stress остался большим, Worker deadline и assertion прежние. Обновление TipTap НЕ доказывает линейность собственного NoteFlow converter на произвольно больших входах. Это separate performance follow-up; production parser не переписывался.

Свежий полный suite проверил существующие реальные editor behaviors: H1-H3, combined bold/italic/underline/code/sup/sub, safe links/anchors, lists/checklist, Details, divider/callout, image serialization/resize/crop, context menu, Tab, live outline/duplicate headings, same-ID restore и 10 rapid edit/save acknowledgements с caret/selection preservation. Existing 3x3 TableMap тест повторяет merge/split и row/column add/delete через Markdown reopen без phantom columns. Не утверждается, что каждый automated test является native action.

Промежуточные failures новых fixture исправлены только в новых tests: selector Details соответствует реальному div NodeView; callout синтаксис `:::tip`; legacy image URI проверяется через JSON attrs, не несуществующий loaded bitmap. Последний полный suite PASS, не selective filtering.

### 35.6. Native QA And Observations

Реальное `npm run tauri dev`, отдельный профиль: `%TEMP%/noteflow-tiptap-security-qa-20261004`. Debug-only `NOTEFLOW_DEV_DATA_DIR`; real user profile/credentials не открывались. Создана только синтетическая Note `TipTap security QA`; приложения закрывались через X, оба dev sessions завершились exit 0, noteflow process после закрытия отсутствует. User-specific absolute path редактирован перед публикацией отчёта; само evidence не менялось.

| Проверка | Реальная evidence | Результат |
| --- | --- | --- |
| Create note | Native modal, synthetic title, empty editor | PASS |
| Markdown formatting | Заголовки, bold/italic/combined/code, lists, table, callout, Details, divider видны в native window | PASS с mixed-list caveat ниже |
| Настоящий clipboard paste | Literal Markdown в новой scratch-вкладке Блокнота, Ctrl+A/C, затем явный Ctrl+V в NoteFlow | PASS: heading/combined marks, отдельный checklist без raw markers, 3x3 table |
| Autosave | Native статус Сохранение -> Сохранено; после wait следующий символ добавлен на том же месте: `ПервыйX` -> `ПервыйXY раздел.` | PASS |
| Native table tools | Cursor в таблице; menu открыт; row below и column right добавлены и затем Undo; вернулась исходная 3x3 geometry | PASS; merge/split покрыты actual-editor tests, не выдаются за native actions |
| 100% / 160% | Реальный app zoom через Ctrl+plus до toast 160%, затем Ctrl+0; editor и menu просмотрены | PASS для scoped smoke, не full responsive matrix |
| Native TOC | Outline с двумя Duplicate и уникальными DOM IDs `duplicate`, `duplicate-1`; click прокручивает; после restart outline содержит pasted headings | PASS |
| Restart | Закрыт/заново открыт тот же QA profile; content, table, callout/Details, pasted clean checklist, headings и 160% восстановились | PASS с mixed-list caveat |
| Internal link | NoteFlow прокручивает к #duplicate, но одновременно возникла внешняя Chrome-вкладка с local dev URL #duplicate | OBSERVED ISSUE; чистый native PASS не засчитан |

Важное уточнение checklist observation: первый ввод через automation `type_text` не был доказан как Ctrl+V. Но причина raw markers независимо локализована без TipTap: `markdownToTiptapDoc("- пункт\n- второй\n\n- [ ] задача\n- [x] готово")` уже возвращает task text `[ ] задача` / `[x] готово`. Отдельный checklist converter возвращает чистый text. На restart у mixed fixture маркеры удвоились. Это defect существующего mixed-list Markdown path; `markdownInline.ts`, `markdownService.ts` и locked marked dependency в данном проходе неизменны. Не замаскировано PASS и не исправлялось вне согласованного dependency scope.

Internal link observation требует отдельного воспроизведения/triage в native WebView. Scroll действительно произошёл; одновременно Chrome открыл local URL. Не заявляется доказанная регрессия именно 3.30.5 или доказанный XSS. Existing helper/actual-editor tests для anchors проходят, но не обнаружили этот native side effect. Поэтому user security smoke readiness пока НЕ выдана.

На закрытии dev снова выводится известное WebView `Failed to unregister class Chrome_WidgetWin_0`, Error 1412. Exit 0, зависшего NoteFlow процесса не обнаружено; warning не скрыт и не назван crash. QA data сохранены в Temp для воспроизведения, не добавлены в Git/backup/release. Существующие вкладки Блокнота не редактировались; синтетическая scratch-вкладка не сохранена в repository.

Дополнительно существующий `scripts/qa/phase-c-editor-geometry.mjs` прошёл **8/8 browser fixture cases**: 1100x700 / 1440x900, 100% / 160%, light / dark; Details, context menu, link tooltip, overflow. Это actual browser DOM, не native WebView и не весь full RC3 regression. Скрипт не изменён.

### 35.7. Automated Gates, FTS And Bundle

| Command | Результат |
| --- | --- |
| npm run typecheck | PASS, 6.55 s |
| npm run test | PASS, **473/473**, 73 suites, 0 failed/cancelled/skipped/todo; 11.365 s runner duration |
| npm run build | PASS, Vite 13.36 s, 243 modules; no Vite warnings |
| cargo fmt --check | PASS |
| cargo check | PASS, 33.10 s reported Rust build |
| cargo test | PASS, **255 passed / 7 ignored / 0 failed**, 18.33 s tests; 262 registered |
| cargo clippy --all-targets --all-features -- -D warnings | PASS, no warnings |
| Isolated FTS benchmark | PASS, 1/1; details below |
| npm audit --omit=dev --offline=false | PASS, **0 production vulnerabilities**, repeated online JSON confirms |
| npm run tauri dev | Native QA sessions launched and closed; issue/coverage detailed above |
| npm run tauri build | PASS, exit 0; optimized Rust build 7m 04s; frontend rebuilt, both MSI locales and NSIS created |
| git diff --check | PASS; only Git informational LF -> CRLF warnings for package.json and phaseCEditor test |

FTS command unchanged: `cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --nocapture`. Запущен отдельно ДО tauri dev, без cargo/rustc/NoteFlow/heavy QA browser processes; background Codex runtimes не уничтожались. Database setup 859 us, schema 1.1137 ms, fixture generation 3.2475 ms, indexing **11.7480497 s**, query **629.5 us**, test total 11.76 s. Thresholds и production FTS не менялись.

| Bundle | До | После |
| --- | --- | --- |
| editor-runtime | 478.98 KB / gzip 149.85 KB | **473.33 KB / gzip 148.30 KB** |
| initial index | 316.38 KB / gzip 93.57 KB | 316.38 KB / gzip 93.58 KB |
| react-runtime | 192.54 KB | 192.54 KB |
| Settings | 78.98 KB | 78.98 KB |
| CSS | 221.93 KB | 221.93 KB |
| DOCX worker | 392.30 KB | 392.30 KB |
| PDF worker | about 2288 KB | 2287.91 KB |

Unexpected bundle growth отсутствует. Наличие production bundle с patched dependencies подтверждается свежим build и exact installed/lock tree; runtime instrumentation/native injection не добавлялись.

Свежие outputs, версия не поднималась:

- `D:/Projects/NoteFlow/src-tauri/target/release/noteflow.exe`.
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi`.
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`.
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe`.

Generated WiX ProductVersion остаётся `0.99.2`, UpgradeCode не менялся. Build artifacts не копировались в release staging и не публиковались. Installer installation/upgrade/uninstall НЕ проверялись в этом проходе.

### 35.8. Final State And Verdict

**SECURITY BLOCKER RESOLVED**: обе root TipTap advisory закрыты aligned 3.30.5, live production npm audit zero. Это не отменяет неполную RC3 matrix и не означает, что все developer dependencies безопасны.

**NEEDS MORE WORK**: нельзя назвать native internal-link smoke чистым PASS, а mixed-list pipeline также имеет independently reproduced pre-existing defect. Следующая работа должна быть согласованным точечным triage этих observations, не молчаливым продолжением installer/Bridge/remaining full regression и не расширением текущей dependency правки.

Git tracked changes: только три файла package.json / package-lock.json / tests/phaseCEditor.test.ts. Untracked: прежние восемь intentional files плюс новый tests/tiptapSecurity.test.ts. Index empty. Остальные семь intentional untracked сравнивались по SHA-256 и не изменены. Версия/HEAD/branch прежние. Commit/tag/push/release/stage не выполнялись.

`git diff --check` PASS. Поскольку untracked files не входят в Git diff, новый security test и report отдельно проверены на trailing whitespace и conflict markers: PASS. Все запущенные required test/build/dev sessions завершены; фонового NoteFlow QA процесса не оставлено. Остальные RC3 native/installer/provider проверки остановлены согласно текущему заданию.

## 36. ProseMirror Security Completion

Дата: 06.10.2026. Branch `feature/rc3-product-polish`; HEAD `542a0e64a78dccbd00fd69d47c4b1d69bdaa0670`. App version `1.0.0-rc.2`; MSI ProductVersion `0.99.2`; productName `NoteFlow`; identifier `com.noteflow.desktop`. Security-only scope: зависимости, regression tests, этот локальный незавершённый report и подготовка отдельного manual QA profile. Production application code и два известных product bugs не менялись. Stage/commit/tag/push/release не выполнялись.

### 36.1. Dependency Resolution And Audit

| Package | До remediation | Текущее принятое состояние |
| --- | --- | --- |
| Все 41 @tiptap/* | 3.26.1 | 3.30.5, aligned MIT family |
| prosemirror-model | 1.25.9 | 1.25.12, deduped |
| prosemirror-view | 1.41.9 | 1.42.6, одна deduped production copy, MIT |

Старый dependency path: root `@tiptap/pm@3.30.5` -> `prosemirror-view@^1.41.9`; consumers также `prosemirror-dropcursor@^1.1.0`, `prosemirror-gapcursor@^1.0.0`, `prosemirror-history@^1.31.0`, `prosemirror-state@^1.27.0`, `prosemirror-tables@^1.41.4`. Ranges совместимы с одной patched copy.

Использован обычный `npm update prosemirror-view --ignore-scripts --offline=false`: registry/resolution выбрал 1.42.6. Сравнение package-lock до/после этого update подтвердило изменение только записи `node_modules/prosemirror-view`. Package.json в данном продолжении не менялся; новый direct dependency или override для prosemirror-view не добавлялись. Существующие TipTap menu overrides сохранены. Ранее принятые TipTap/model changes не откатывались. React/Vite/Tauri/docx/pdfmake и прочие unrelated packages не обновлялись. Downgrade на 1.42.3 не выполнялся.

Повторены `npm ls @tiptap/core`, `npm ls @tiptap/pm`, `npm ls prosemirror-model`, `npm ls prosemirror-view`: exit 0; nested vulnerable view copies и несовместимые core trees отсутствуют. Lock содержит ровно 41 TipTap package на 3.30.5 и единственную `node_modules/prosemirror-view` на 1.42.6.

| Advisory | Статус |
| --- | --- |
| [GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh), mergeAttributes / own __proto__ | CLOSED: TipTap 3.30.5; benign DOM regression PASS |
| [GHSA-j95f-988m-3j2f](https://github.com/advisories/GHSA-j95f-988m-3j2f), Markdown parser ReDoS | CLOSED: TipTap 3.30.5; bounded worker tests PASS |
| [GHSA-c8x8-7fp4-3x9w](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w), pasted HTML slice-context XSS | CLOSED: prosemirror-view 1.42.6; first patched 1.42.3; application paste/context tests PASS |

Прежний zero audit не использован как текущий результат: 06.10.2026 до view update свежий audit обнаружил 1 high production vulnerability. После update, а затем повторно в текущем завершении, `npm audit --omit=dev --offline=false` -> exit 0, `found 0 vulnerabilities`; `npm audit --omit=dev --json --offline=false` -> exit 0, `vulnerabilities: {}`, summary total/high/critical/moderate/low/info = 0. Offline mode явно отключён. Это production gate, не утверждение об отсутствии devDependency findings.

### 36.2. Automated Security And Editor Evidence

Предыдущий фактически выполненный полный frontend run с нынешними неизменёнными dependencies/tests: **482/482**, 73 suites, 0 failed/cancelled/skipped/todo, runner 13.694 s. Rust: **255 passed / 7 intentionally ignored / 0 failed**, tests 18.65 s. В текущем завершении эти принятые suites повторно не запускались; counts не выданы за новый run. Typecheck, frontend build, cargo fmt --check, cargo check и strict clippy ранее PASS с этим resolution. Production Tauri build в текущем завершении повторно запускает frontend build.

Девять новых tests сверх baseline 473: одна проверка single patched MIT view resolution; mounted EditorArea harmless executable sentinel; шесть обычных paste fixtures (plain text, formatted HTML, Markdown, link, list, portable 2x2 table); одна точная проверка reconstruction clipboard slice context с test-only validator. Focused security/editor run **42/42 PASS**.

JSDOM разрешает исполнение только в изолированном synthetic test окружении; calibration button действительно устанавливает sentinel, после чего sentinel очищается. После настоящего paste event в mounted EditorArea sentinel остаётся undefined, в editor DOM нет script/onerror/onclick, в serialized Markdown нет sentinel/script-handler текста, дальнейший ввод работает. Test-only node проверяет отказ от array-valued context attribute и принятие корректного string-valued attribute до нормализации вставки. Patch библиотеки не копировался в production code. Это ограниченная regression coverage, не доказательство воспроизведённой эксплуатации старого приложения и не native WebView evidence.

Обычный paste проходит через настоящий mounted EditorArea, включая собственный Markdown handler и ProseMirror HTML path. Reopen сохраняет стандартные fixtures. Existing actual-editor tests остаются зелёными: combined marks, standalone checklist, nested lists, merge/split/geometry tables, Details, callouts/divider, image attrs, selection/caret при save acknowledgements, context menu, Tab и heading/link helpers. Native действия этим не подменяются.

Первоначальная новая 1x1 HTML table fixture выявила ограничение собственного Markdown roundtrip: одна строка/колонка не восстановилась как table. Тест обычного поддерживаемого table paste использует стандартную 2x2 fixture. Production parser и existing assertions не менялись; этот edge case не объявлен исправленным и не включён в security-only scope.

FTS выполнен отдельно до tauri dev и heavy QA: `cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --nocapture`, PASS 1/1. Database setup 1.5671 ms; schema 1.4938 ms; fixtures 3.5004 ms; **indexing 11.7171844 s; query 1.0151 ms; total 11.73 s**. Performance thresholds и FTS production code не менялись. В текущем завершении benchmark повторно не запускался.

### 36.3. Current Completion Gates

| Gate | Результат текущего завершения |
| --- | --- |
| Online production npm audit | PASS, 0 vulnerabilities |
| Online production npm JSON audit | PASS, summary total = 0 |
| Installed dependency tree / lock alignment | PASS, exact accepted versions, one view copy |
| Production Tauri build | PASS, exit 0; Vite 13.66 s, optimized Rust 1m 49s; обе MSI локали и NSIS созданы |
| git diff --check | PASS; только informational LF -> CRLF warnings для package.json и tests/phaseCEditor.test.ts |
| Native paste | **PENDING USER SMOKE**, не PASS |

Свежие outputs от 06.10.2026, версия приложения не менялась:

- `D:/Projects/NoteFlow/src-tauri/target/release/noteflow.exe` (19,512,320 bytes).
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi` (7,581,696 bytes).
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi` (7,581,696 bytes).
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe` (5,637,995 bytes).

Generated WiX `main.wxs` подтверждает ProductVersion `0.99.2` и прежний UpgradeCode `ff9d3de5-b119-5cb0-9873-43e30a097afa`. Установщики не stage-ились, не копировались в release staging, не публиковались и не устанавливались. Vite warnings отсутствуют; editor-runtime 473.82 KB / gzip 148.62 KB, initial index 316.38 KB / gzip 93.57 KB.

### 36.4. Manual Native Paste Smoke

Отдельный debug QA profile: `%TEMP%/noteflow-prosemirror-security-qa-20261006`, передаётся через `NOTEFLOW_DEV_DATA_DIR`. В нём уже создана одна синтетическая заметка **ProseMirror paste security QA**. Реальный пользовательский profile не открывается и не меняется. Debug-only override не используется как способ тестирования release executable с перенаправлением данных: release игнорирует этот env override.

В предыдущей попытке native Tauri дошёл до создания этой пустой заметки. До проверки paste Computer Use остановился: невозможно надёжно определить Chrome URL для применения policy. Native Ctrl+V, rich/Markdown paste, sentinel, restart и save данного прохода **не проверены**. Предыдущие native результаты раздела 35 нельзя считать новым native PASS после view update.

Для пользователя сейчас запущены debug NoteFlow (PID 18288) и QA Vite на `127.0.0.1:1420` (PID 31176). CLI проверка подтвердила живые процессы, frontend HTTP 200 и наличие пустой synthetic note в отдельной QA базе; это не визуальная проверка текущего окна и не paste PASS. Приложение и frontend намеренно оставлены для manual smoke.

Для повторного запуска после закрытия QA окна подготовлен Git-ignored helper `D:/Projects/NoteFlow/releases/qa/reopen-prosemirror-security-smoke.ps1`. Он проверяет наличие debug executable, QA frontend и существующей QA database, затем запускает debug app с тем же `NOTEFLOW_DEV_DATA_DIR`; установленный release не запускает. QA frontend нужно оставить работающим:

```powershell
& 'D:\Projects\NoteFlow\releases\qa\reopen-prosemirror-security-smoke.ps1'
```

Ручные действия пользователя, при 100% и 160%, только в QA profile:

1. Открыть заметку ProseMirror paste security QA.
2. Вставить обычный текст через Ctrl+V; дописать несколько символов.
3. Вставить rich text с bold/italic из обычного документа или безопасной web-страницы.
4. Вставить Markdown с heading, bold/italic и отдельным checklist; форматирование должно появиться сразу.
5. Вставить безопасную HTTP(S) ссылку, обычный list и стандартную 2x2 table там, где source application предоставляет rich HTML.
6. Проверить отсутствие crash/unexpected window непосредственно при paste; editor пригоден для дальнейшего ввода; дождаться Сохранено.
7. Закрыть QA окно и перезапустить именно тот же debug QA profile, не установленный release NoteFlow. Проверить persisted content.

Real malicious payload пользователю не предлагается. Crafted HTML condition уже покрыт automated harmless sentinel test, но пользовательский native smoke остаётся отдельным acceptance evidence. После пользовательского подтверждения статус можно изменить; до него только **PENDING USER SMOKE**.

Known product blockers намеренно сохранены отдельно: internal # link scrolls, но дополнительно открывает Chrome; mixed bullet/checklist markers дублируются после restart. Они не исправлялись, не скрывались и не являются основанием назвать full RC3 готовым. Для checklist smoke использовать самостоятельный checklist; смешанный case известен как отдельный corrective item, не security acceptance PASS.

### 36.5. Final State

**READY FOR USER NATIVE PASTE SECURITY SMOKE**. Все non-manual completion gates PASS. Native paste остаётся **PENDING USER SMOKE**, не PASS. Это не full RC3 readiness и не разрешение публиковать release; два известных product bugs остаются отдельными незакрытыми задачами.

Report обновлён и остаётся untracked/local. В этом завершении dependency/test files не менялись: их SHA-256 совпадают с состоянием до повторных audits/build. Семь прежних intentional untracked source/report files также проверены по SHA-256 и неизменны. Stage/commit/tag/push/release/version bump не выполнялись; index empty, branch/HEAD прежние. Полный RC3 regression не перезапускался.

Итоговый `git diff --stat`:

```text
 package-lock.json          | 471 +++++++++++++++++++++++----------------------
 package.json               |  42 ++--
 tests/phaseCEditor.test.ts |  96 ++++++++-
 3 files changed, 355 insertions(+), 254 deletions(-)
```

Итоговый `git status --short --branch`: 3 modified tracked, 9 untracked, 0 staged:

```text
## feature/rc3-product-polish
 M package-lock.json
 M package.json
 M tests/phaseCEditor.test.ts
?? docs/tasks/phase-b-rag-responsive-report.md
?? docs/tasks/phase-b-smoke-corrective-report.md
?? docs/tasks/phase-b-standalone-scope-report.md
?? docs/tasks/phase-c-editor-correctness-report.md
?? docs/tasks/phase-c-settings-layout-corrective-report.md
?? docs/tasks/phase-d-image-insert-calendar-report.md
?? docs/tasks/rc3-full-regression-report.md
?? scripts/qa/phase-b-provider.mjs
?? tests/tiptapSecurity.test.ts
```

Поскольку untracked files не входят в Git diff, security test и report дополнительно проверяются на trailing whitespace и conflict markers. Все required audit/build exec sessions завершены; только запрошенные manual QA frontend/app намеренно продолжают работать.

## 37. RC3 Editor Corrective Pass

Дата: 06.10.2026. Internal-anchor routing и mixed list/checklist roundtrip, включая связанное поведение Tab/Shift+Tab, приняты пользователем. Последующее точечное изменение касается только порядка editor context menu; статус приведён в 37.6. Полный RC3 regression не продолжался. Native paste security smoke предыдущего этапа принят пользователем; это отдельное подтверждение, не автоматический PASS последующих изменений.

### 37.1. Baseline And Scope

- Branch: `feature/rc3-product-polish`.
- HEAD: `f0073c47fd2abc453fa9f3afe73f8266918a3ac3`, `fix: patch editor dependencies for rc3 security`.
- До изменений: tracked tree clean, index empty, ровно восемь прежних intentional untracked files. Выполнены git status, git log -5 --oneline, git diff --check.
- Canonical app version: `1.0.0-rc.2`; MSI mapping `0.99.2`; productName `NoteFlow`; identifier `com.noteflow.desktop`.
- Dependencies сохранены: TipTap family `3.30.5`, prosemirror-model `1.25.12`, одна deduped prosemirror-view `1.42.6`. `npm ls` exit 0. SHA-256 package.json, package-lock.json и tests/tiptapSecurity.test.ts совпадает с baseline.
- Rust, SQLite migrations, Markdown serializer/storage policy, retention, UI layout, AI/providers и exports не менялись. Нет dependency update, bulk normalization или очистки пользовательских заметок.

### 37.2. Bug 1: Internal Link Opens Browser

**Reproduction.** Добавлен тест настоящего DOM click в mounted EditorArea с `[Перейти](#раздел-два)`. Window-level listener наблюдает событие по той же политике, что native opener: defaultPrevented, left button, target `_blank` / Ctrl. До исправления plain/Ctrl/Cmd cases не отменяли DOM click; navigation и отдельное browser opening были возможны одновременно. Старый helper test не проверял реальный порядок DOM событий.

**Root cause.** `editorProps.handleClick` вызывается ProseMirror на mouseup, а не на последующем DOM click. preventDefault у mouseup не отменяет click. NoteFlow Link наследует target `_blank`; `openOnClick: false` отключает Link plugin, но не window-level listener Tauri opener. Последний читает абсолютный `a.href`: относительный `#...` уже выглядит как HTTP URL приложения и может уйти в браузер. Проверены реальные installed `prosemirror-view/src/input.ts` и `tauri-plugin-opener-2.5.4/src/init-iife.js`, не только предположение по JSX.

**Implementation.** EditorArea использует `editorProps.handleDOMEvents.click`. Минимальный typed `classifyEditorLink` различает `internal-anchor`, `external-http`, `blocked`. Actual anchor DOM click отменяется до window-level opener. Для `#...` вызывается только существующий scrollToNoteHeading; нет external IPC, stopPropagation или глобального listener reset. Unknown/malformed targets безопасны, используется существующее сообщение о ненайденном заголовке. Generated duplicate heading anchors используют прежний TOC алгоритм.

**External behavior.** Сохранена явно заданная editable-editor policy: ordinary HTTP(S) click оставляет ссылку редактируемой; Ctrl/Cmd + left click вызывает существующий безопасный `openUrl`. Browser default также отменяется, чтобы native listener не обходил policy и не открывал URL второй раз. Unsafe schemes blocked. Это исправление accidental `_blank` opening, не новая link UX.

**Automated evidence.** Mounted DOM tests для plain/Ctrl/Cmd, повторных clicks, missing anchor, duplicate-heading `раздел-1`, malformed anchor и HTTP/HTTPS/JavaScript. Assert actual defaultPrevented, точный scroll target, zero native opens для internal, unchanged document/selection и zero content-change callbacks от navigation. Safe external Ctrl/Cmd calls проходят через mocked реальную Tauri IPC команду `plugin:opener|open_url`, unsafe/ordinary calls отсутствуют.

**Native evidence.** Настоящий debug Tauri QA profile, 100% и 160%: internal link прокручивает к «Второй раздел», Chrome не активируется/не получает новое видимое окно; существующее Chrome окно остаётся «Новая вкладка». Повторная navigation после restart/смены масштаба работает. `#missing` показывает понятный toast, не открывает браузер, не падает. Save indicator остаётся «Сохранено», content не меняется. Ordinary HTTPS click сохраняет editable policy, без неожиданного browser opening.

**Native limitation.** Физический Ctrl+mouse click / Cmd+click не выполнен: доступный native click API не предоставляет модификатор, macOS здесь не запускался. Native открытие внешнего HTTPS через modifier остаётся пунктом user smoke; automated mounted DOM/IPC cases выполнены. Нельзя выдавать их за native PASS.

**Issue status: USER-SMOKE PASS.** Пользователь в запросе следующего точечного прохода 06.10.2026 подтвердил, что internal # links больше не открывают Chrome. Это отдельное пользовательское подтверждение после developer checks выше.

### 37.3. Bug 2: Mixed Checklist Marker Growth

**Reproduction.** Новые storage/reopen fixtures подтвердили raw markers внутри task text в loose mixed lists, bullet-to-task и numbered-to-task. До fix строка task paragraph повторно интерпретировалась как текст `[ ] задача`, одновременно с semantic taskItem. При следующей serialization новый semantic marker добавлялся перед уже literal marker. В первом targeted run было 11 failures: не все относятся к marker bug; часть была DOM-click reproduction, часть первоначально сравнивала unrelated trailing empty root paragraph. Проверка list subtree затем отделена от существующего trailing-node поведения, без ослабления assertions Markdown/plain text/task structure.

**Root cause.** Marked GFM loose item хранит task metadata и структурный `checkbox` token внутри paragraph.tokens; paragraph.text при этом ещё содержит raw marker. Старый convertListGroup повторно парсил child.text вместо уже разобранных inline tokens. JSON cache/sidecar не были первичным источником marker growth.

**Structural fix.** Для list paragraph/text используется существующий child.tokens, если присутствует; convertTokens пропускает только настоящий token.type `checkbox`. Checked state остаётся semantic taskItem.attrs.checked и чистым Markdown `- [ ]` / `- [x]`. Никакого replace/regex stripping пользовательского текста, второго serializer, sidecar-only task semantics или destructive migration.

**Associated mixed-list Tab fix.** Новый behavioral test обнаружил выбор outer taskItem через editor.isActive при cursor внутри вложенного обычного listItem. Tab/Shift+Tab теперь выбирает ближайший listItem/taskItem из selection.$from ancestors. Это маленькое исправление того же mixed-list сценария; table Tab и paragraph indentation не переделывались. Отдельные regressions подтверждают sink, reopen, lift, reopen и возврат исходного Markdown для обоих направлений task/bullet.

**Idempotence.** Семь fixtures проходят три последовательных цикла actual Editor -> Markdown/sidecars -> canonical load -> actual Editor. Проверяются exact canonical Markdown/plain text, complete list subtree (nesting, task checked attrs, numbering, text, marks), отсутствие marker growth. Покрыты bullet -> task, task -> bullet, numbered -> task, task -> numbered со start=3, loose siblings, Cyrillic, bold/italic/link внутри task, multiple nesting levels. Обычные list/code/quote fixtures не ослаблены.

Literal `[ ]` / `[x]` вне tasks, намеренный escaped literal внутри task и inline code `[x]` сохраняются. Уже испорченные пользовательские заметки не переписываются автоматически: fix прекращает появление новых structural duplicates, а не угадывает намерение пользователя в старом тексте.

**Autosave evidence.** Mounted EditorArea получает настоящий paste, click checkbox и ввод в середине task text. onEditorChange сериализует canonical Markdown; acknowledgement не remount-ит editor и не сдвигает selection. После трёх reload циклов Markdown и checked states стабильны. Existing ten-rapid-edits, same-ID restore, security paste, table/Details/callout/divider/image-attrs/combined-formatting tests также PASS.

**Native evidence.** В новом отдельном профиле вручную через native editor создана synthetic Note `RC3 editor corrective QA` с bullet -> tasks, task -> bullets, numbered start=3 -> tasks. Многострочный Markdown немедленно форматируется. Toggle «задача A» сохраняет checked=true; «задача B» checked=true, «задача 1» false, «задача 2» true, numbered nested tasks false/true. Проверены Tab и Shift+Tab для task внутри bullet и bullet внутри task, parent checkbox не теряется.

После «Сохранено» приложение полностью закрыто системным X; `npm run tauri dev` session завершился exit 0. Первый restart того же профиля: нет raw markers, структура/состояния сохранены. В середину первого task text введено `QA`, cursor остаётся у ввода; autosave завершён. Второе полное X-close/restart: новый текст `задQAача A`, все шесть checkbox controls, вложенность и numbering сохранены без duplicates. Нижние task/bullet/numbered nodes просмотрены в реальном окне при 160%.

**Native limitation.** Отдельный native Markdown file import, native image/table/Details/Callout interactions и direct UI inspection export не выполнялись в этом точечном проходе. Их parser/storage/actual-editor regressions выполнены автоматически; это не новый native/full RC3 PASS.

**Issue status: USER-SMOKE PASS.** Пользователь в запросе следующего точечного прохода 06.10.2026 подтвердил, что mixed checklist/list больше не дублирует markers после restart. Это отдельное пользовательское подтверждение после developer checks выше.

### 37.4. Fresh Checks

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| Targeted phaseCEditor/editorLinkSecurity/tiptapSecurity | PASS, 64/64, 4.418 s |
| npm run test | PASS, 501/501, 73 suites, 0 failed/skipped/cancelled, 13.120 s |
| npm run build | PASS, Vite 13.37 s |
| cargo fmt --check | PASS |
| cargo check | PASS, 0.51 s |
| cargo test | PASS, 255 passed, 7 intentionally ignored, 0 failed, 18.71 s |
| cargo clippy --all-targets --all-features -- -D warnings | PASS, 0.56 s |
| npm audit --omit=dev --offline=false | PASS, fresh online audit, 0 vulnerabilities |
| npm ls accepted editor dependencies | PASS, aligned/deduped accepted versions |
| Isolated FTS benchmark | PASS, 1/1 |
| npm run tauri dev | PASS, isolated real Tauri UI, two complete restarts |
| npm run tauri build | PASS, exit 0; Vite 17.26 s, optimized Rust 2m 09s; NSIS и обе MSI локали |
| git diff --check | PASS; informational LF -> CRLF warnings only |

FTS command: `cargo test search::tests::search_performance_on_ten_thousand_notes -- --ignored --nocapture`. Перед ним закрыт старый QA Vite и проверено отсутствие NoteFlow/cargo/rustc heavy processes. Database setup 2.0758 ms; schema 1.9109 ms; fixtures 3.6034 ms; **indexing 11.8981267 s; query 637.9 microseconds; total 11.91 s**. Соответствует baseline 11-12 s / около 1 ms. FTS implementation/thresholds не менялись.

Native QA использует `%TEMP%/noteflow-rc3-editor-corrective-20261006`, env `NOTEFLOW_DEV_DATA_DIR`, только debug app. Реальная пользовательская SQLite database, notes и credentials не открывались. QA note оставлена только в отдельном temporary profile для воспроизводимости. Все три dev sessions завершены после X-close, exit 0. WebView2 печатал при закрытии diagnostic `Failed to unregister class Chrome_WidgetWin_0. Error = 1412`; shutdown завершался, app не оставался висеть. Это observed runtime diagnostic, не замалчиваемое утверждение «никаких warnings».

Свежие production outputs от 06.10.2026:

- `D:/Projects/NoteFlow/src-tauri/target/release/noteflow.exe`, 19,512,320 bytes, 12:21:10 local.
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi`, 7,581,696 bytes, 12:20:37 local.
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`, 7,581,696 bytes, 12:20:47 local.
- `D:/Projects/NoteFlow/src-tauri/target/release/bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe`, 5,639,886 bytes, 12:21:10 local.

Generated WiX `main.wxs`: ProductVersion `0.99.2`, UpgradeCode `ff9d3de5-b119-5cb0-9873-43e30a097afa`, неизменны. Bundles не копировались в release staging, не публиковались и не устанавливались. Vite build без warnings; initial index 316.75 KB / gzip 93.75 KB, editor-runtime 473.82 KB / gzip 148.62 KB. Все required dev/build/test exec sessions завершены.

### 37.5. Changed Files And User Smoke

Modified tracked: ровно шесть файлов:

- `src/features/editor/EditorArea.tsx` — actual DOM click routing.
- `src/features/editor/editorLinkClick.ts` — typed link classification и actual-event cancellation.
- `src/features/editor/markdownInline.ts` — structural checkbox-token conversion.
- `src/features/editor/editorInteractions.ts` — nearest-list ancestor для mixed Tab/Shift+Tab.
- `tests/editorLinkSecurity.test.ts` — classification и editable external policy regressions.
- `tests/phaseCEditor.test.ts` — mounted DOM/paste/autosave и multi-cycle mixed-list tests.

Также обновлён этот прежний untracked report. Остальные семь intentional untracked files проверены SHA-256 и неизменны. Новых untracked source/test файлов нет. Git diff --stat: 6 files, 197 insertions, 21 deletions. Index empty; branch/HEAD/version/identifier прежние. Stage/commit/tag/push/release не выполнялись; installers не stage-ились. Full RC3 matrix не возобновлялась.

Короткий user smoke, только две исправленные проблемы:

1. В тестовой заметке вставить heading «Первый раздел», heading «Второй раздел» и `[Перейти](#второй-раздел)`. Проверить обычный/повторный/Ctrl+click при 100% и 160%: переход внутри Note, без Chrome. `#missing` должен показать toast. Для обычной HTTPS ссылки проверить существующий Ctrl+click safe-open flow.
2. Вставить mixed bullet/numbered/checklist документ, переключить checkbox, выполнить Tab/Shift+Tab, дождаться «Сохранено». Полностью закрыть и открыть NoteFlow. Проверить текст/checked/nesting без literal markers. Изменить task text и повторить второй save/restart.

Исторический verdict этого прохода: **READY FOR USER EDITOR CORRECTIVE SMOKE**. Последующий запрос пользователя подтвердил оба issue как **USER-SMOKE PASS**. Следующий точечный проход ниже не меняет эти исправления. Это не full RC3 readiness и не разрешение на commit/release.

### 37.6. Context Menu Ordering

**Status: IMPLEMENTED — PENDING USER SMOKE.** Дата: 06.10.2026. Только перестановка JSX в `src/features/editor/EditorContextMenu.tsx`: **Вырезать → Копировать → Вставить → separator → прежние formatting groups**. Порядок внутри formatting groups и остальные подписи сохранены.

Clipboard handler, Markdown paste/security semantics, availability checks, selection bookmarks, operation guards, Escape и keyboard shortcuts не менялись. Остальные context menus не менялись. SHA-256 пяти прежних production/test файлов исправления links/checklists и обоих package files совпадает с baseline данного прохода; предыдущие исправления не перерабатывались. В этом проходе изменены только EditorContextMenu.tsx, существующий tests/phaseCEditor.test.ts и этот report.

**Behavioral regression tests.** Mounted EditorArea / actual TipTap DOM проверяют точный порядок первых трёх menuitems, separator перед formatting, right-click opening, сохранение selection, Escape/defaultPrevented, закрытие/reopen и применение Bold. Четыре новых tests проверяют реальные существующие Cut/Copy/Paste handlers через scoped clipboard mock и empty-selection/missing-API availability. Markdown paste проверяется по существующей block insertion semantics, не по новому handler. Non-editor input сохраняет native contextmenu semantics. Первый targeted run до JSX перестановки воспроизвёл неправильный порядок; после исправления targeted 5/5 PASS.

| Check этого прохода | Result |
| --- | --- |
| npm run typecheck | PASS, exit 0 |
| npm run test | PASS, 505/505, 73 suites, 0 failed/skipped/cancelled, 13.874 s |
| npm run build | PASS, exit 0, Vite 13.48 s, без Vite warnings |
| git diff --check | PASS, только informational LF -> CRLF warnings |
| Rust gate | Не повторялся: Rust/backend не менялись; разрешено scope задачи. Результаты 37.4 относятся к предыдущему проходу |

**Native evidence.** Запущен настоящий `npm run tauri dev` с debug-only `NOTEFLOW_DEV_DATA_DIR=%TEMP%/noteflow-rc3-editor-corrective-20261006`. Создан отдельный synthetic document `RC3 context menu QA` с текстом «Буфер меню тест». При 100% и 160% проверены actual right-click, первые Cut/Copy/Paste, separator, сохранение selection, Cut с исчезновением текста и Undo с восстановлением, Copy без изменения текста. Bold/Italic через то же меню реально меняют оформление и сохраняют selection; при 160% formatting доступен через scroll. Escape проверен при обоих масштабах: меню закрывается, выделение остаётся. Autosave приходит к «Сохранено». Реальный пользовательский profile/credentials не открывались. QA окно закрыто системным X, dev session завершился exit 0. При закрытии повторился известный WebView diagnostic `Failed to unregister class Chrome_WidgetWin_0. Error = 1412`; это не failure frontend gates. Synthetic note остаётся только в temporary QA profile, не в пользовательском профиле.

**Native Paste limitation.** Нажатие «Вставить» при 100% вызвало настоящий WebView permission prompt на чтение clipboard. Разрешение автоматически не принималось и не менялось; запрошено действие пользователя. Поэтому завершённая native вставка при 100%/160% не объявляется PASS. Paste handler/Markdown formatting подтверждены mounted behavioral test; окончательный native clipboard smoke остаётся за пользователем. Это ограничение QA, не основание менять clipboard security в задаче перестановки меню.

**Git state.** `feature/rc3-product-polish`, HEAD `f0073c47fd2abc453fa9f3afe73f8266918a3ac3`, версия `1.0.0-rc.2`. Семь modified tracked files, восемь прежних intentional untracked, index empty. Tracked diff: 7 files, 266 insertions, 26 deletions, включая предыдущие принятые незакоммиченные исправления. Нет новых untracked source/test files. Stage/commit/tag/push/release/version bump не выполнялись. Full RC3 regression/release workflow не возобновлялся.

**READY FOR USER CONTEXT MENU SMOKE.** Предыдущие internal-link и mixed-checklist issues остаются USER-SMOKE PASS. Перестановка context menu остаётся IMPLEMENTED — PENDING USER SMOKE.

## 38. Continued RC3 Full Regression

### 38.1. Scope, Baseline And Evidence Policy

Дата: 06.10.2026. Branch: `feature/rc3-product-polish`. HEAD: `714532f117313fcbd61d20334cd1d58f68c62834`, `fix: resolve rc3 editor interaction regressions`.

Версия package/package-lock/Cargo/Cargo.lock/Tauri: **1.0.0-rc.2**. MSI mapping: **0.99.2**. ProductName: **NoteFlow**. Identifier: **com.noteflow.desktop**. Ни один version source, production source, dependency, migration, README или UI-файл в этом regression pass не изменён.

Этот раздел объединяет свежий full gate на текущем HEAD, принятый в последнем запросе пользователя, и дополнительные проверки после остановки Computer Use. Принятый gate не запускался повторно без причины. Дополнительные targeted tests — повторная проверка подмножеств, а не увеличение числа уникальных frontend/Rust tests.

Работа велась только с синтетическими temporary profiles, без открытия реальной пользовательской БД и без переноса credentials. В репозитории изменён только этот прежний untracked report. Остальные семь intentional untracked файлов сохранены. Сборки не устанавливались и не публиковались, release staging не создавался. Commit/tag/push/release/merge/version bump не выполнялись.

Computer Use остановился, потому что не смог надёжно определить URL окна Edge. Ограничение не обходилось. Дополнительный headless Playwright использует известный localhost URL существующих QA fixtures и отдельный ephemeral browser profile; это не управление неизвестным пользовательским окном Edge и не попытка продолжить запрещённое native взаимодействие.

Acrobat завершился с ошибкой FontCapture до фактического открытия PDF. Это **не подтверждённый NoteFlow PDF defect**. Ни успешное создание файла, ни pypdf parsing ниже не выдаются за visual viewer validation.

В матрице **PASS** означает, что реализация подтверждена указанным автоматизированным/integration evidence, а также доступным native/user evidence. Это не означает native-прохождение каждого действия строки: такой evidence явно отмечен отдельно. Для viewer, consent, final destructive UI actions и installer lifecycle оставлен **PENDING USER QA**, а не FAIL/BLOCKED. Отсутствующая Windows 10 среда — **NOT TESTED**. Подпись/macOS/updater — **KNOWN LIMITATION**.

### 38.2. Fresh Automated Gates

| Gate на текущем HEAD | Result | Time / notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | 5.485 s |
| `npm run test` | PASS | **505/505**, 73 suites, 0 failures/skips/cancellations; 14.289 s |
| `npm run build` | PASS | 243 modules; Vite 14.15 s; без Vite warnings |
| `cargo fmt --check` | PASS | Без форматирования файлов |
| `cargo check` | PASS | 0.61 s |
| `cargo test` | PASS | **255 passed / 7 intentionally ignored**, 0 failed; 18.67 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS | 0.60 s |
| `npm audit --omit=dev --offline=false` | PASS | Fresh online production audit: **0 vulnerabilities**, 1.988 s |
| Isolated FTS benchmark | PASS | Index **12.0156294 s**, query **690.9 microseconds / 0.6909 ms**, test total 12.03 s |
| `npm run tauri dev` | PASS startup / isolated native work | Только debug QA data dir; human-only remainder указан ниже |
| `npm run tauri build` | PASS | Vite 13.69 s; optimized Rust 4m 23s; NSIS + en-US/ru-RU MSI |
| Browser geometry | PASS | Принятые **132/132** cases; отдельные новые calendar cases **16/16** |
| `git diff --check` | PASS | Также отдельно проверен untracked report, который обычный Git diff не включает |

FTS выполнялся отдельно, без работающего `tauri dev` и других тяжёлых QA/build процессов. Индекс/threshold/search implementation не менялись. Это измерение синтетических 10 000 заметок, не обещание конкретной скорости пользовательской базы на другом ПК.

Семь ignored Rust tests намеренно не входят в обычный gate. В продолженном проходе один из них, `seed_bulk_delete_native_qa`, отдельно успешно запущен для создания нового QA fixture; FTS также отдельно запущен явно. Это не «257 уникальных Rust tests»: основной результат остаётся 255/7.

Дополнительные targeted runs после Computer Use: document export **6/6** (0.03 s), backup-prefixed **9/9** (0.69 s), bulk delete **6/6** (0.37 s), RAG **30/30** (1.47 s), final-wins autosave/queue/recovery/reopen **1/1** (0.14 s), mixed/standalone retrieval **1/1** (0.03 s), DB/filesystem restore fault rollback **1/1** (0.31 s), deduplicated asset backup/restore refs **1/1** (0.21 s), isolated QA seed **1/1** (0.32 s). Все PASS. Это настоящие SQLite/filesystem/HTTP test-provider tests там, где требуется backend behavior; не source-regex замена поведения.

### 38.3. Native Profile And Existing User Acceptance

Native dev использовал `%TEMP%/noteflow-rc3-integration-20261006`, env `NOTEFLOW_DEV_DATA_DIR`. Только синтетические Scratch/RC3 QA notes; в профиле нет chat providers и embedding profiles, нет реальных API keys. Созданы пять Markdown fixtures с русским текстом, headings, обычными и task lists, таблицей, links, callout, Details, divider и duplicate headings.

Свежие native наблюдения, уже принятые пользователем в последнем запросе:

- Настоящий file picker выбрал пять Markdown файлов; preview и import success доступны, документы сразу форматируются.
- Богатая заметка показывает headings/lists/checklist/table/callout/Details/divider.
- PNG 128x128 вставлен в редактор, crop реально применён на bitmap; архивирование/восстановление заметки не потеряло image attrs.
- Четыре настоящих Save dialogs создали MD/TXT/DOCX/PDF; success feedback и действие показать расположение доступны.
- DOCX открыт Microsoft Word без repair warning; русский текст, списки и таблица отображались. Это basic native Word proof, не просмотр каждого форматирования каждого длинного документа.

Четыре отдельные пользовательские проверки принятого corrective HEAD остаются **USER-SMOKE PASS**: native paste security, internal # links без внешнего Chrome, mixed lists/checklists без marker growth, context-menu ordering/clipboard. Их не требуется повторять в final checklist. Остальные исторические acceptance Phase A-E не подменяют новую native evidence на текущем HEAD.

После завершения проверок QA dev session остановлена через Ctrl+C (session exit 1 вследствие намеренного прерывания, не crash приложения). Проверено: **0 процессов NoteFlow**, нет LISTENING на порту 1420. Это не новый тест системного X-close при pending save.

Independent readonly reopen native QA DB после остановки: `PRAGMA integrity_check = ok`, `foreign_key_check` пуст, 6 заметок, 11 content sidecars, 0 LLM providers, 0 embedding profiles. Эти temporary profiles сохранены для безопасного последующего user smoke; существующие пользовательские данные не затронуты.

### 38.4. Actual Exported Files

Все четыре файла находятся только в `%TEMP%/noteflow-rc3-integration-20261006-input/` и содержат synthetic QA data:

| File | Bytes | Actual validation | Status |
| --- | --- | --- | --- |
| `native-export.md` | 1 005 | UTF-8/Cyrillic, headings, bullet/numbered/checklist, table, links, Details; relative PNG существует; без internal asset URI/sidecar/system paths | PASS |
| `native-export.txt` | 944 | Читаемый UTF-8, русский текст, task text; без HTML/sidecar JSON/Markdown mark dump | PASS |
| `native-export.docx` | 19 907 | ZIP CRC, все XML/relationships parse, Heading1, table, Cyrillic, HTTPS link и PNG; дополнительно реальный Word opening без repair | PASS |
| `native-export.pdf` | 31 029 | `%PDF-`, strict pypdf parse, 2 pages, page tree и nonempty Contents, 4 font references, embedded Unicode fonts/ToUnicode, русский текст extractable, 1 PNG, без encryption | Generation + structure PASS; viewer PENDING USER QA |

Использован readonly validator `validate-exports.py` с pypdf 6.10.0. Проверялся **реально созданный native PDF**, не только unit-test buffer. Embedded fonts и извлекаемый русский текст не доказывают отсутствие clipping/pagination/layout дефектов в PDF viewer; визуальная проверка остаётся отдельно.

Export failure/cancel/flush tests в `phaseEBehavior.test.ts` подтверждают, что cancel не пишет файл, duplicate clicks заблокированы на время generation, export ждёт успешного autosave, failed save не экспортирует устаревший документ, raw SQL/paths не показываются. Native overwrite/cancel и last-keystroke race отдельно не выполнялись; это не заявляется как native PASS.

### 38.5. Project ZIP

Во temporary directory собран небольшой QA harness, вызывающий **production `document_export::write_project`** через `#[path]`, с существующими Rust zip/uuid dependencies; заглушён только crate-boundary error type. Нет второй независимой ZIP implementation, новых dependencies или изменений source files.

`project-three-notes.zip`: 3 заметки, две с title `Same title`, третья с Cyrillic; файлы `Same title.md` / `Same title (2).md` уникальны; одна deduplicated `assets/Схема.png`; relative image references разрешаются. `project-safe-names.zip`: 5 заметок с `../evil`, `A/B`, `CON`, `trailing dot.` и Cyrillic; безопасные названия, в том числе `_CON.md` / `trailing dot.md`.

Проверены CRC, exact note counts, unique filenames без case collision, UTF-8, relative assets, отсутствие `..`/absolute/backslash/drive-colon paths, JSON sidecar/internal asset URI. Все PASS. Отсутствие unrelated/archived notes подтверждено дополнительно существующим production project snapshot/filtering Rust test, а не предположением по harness input. Atomic destination/failure/path sanitization покрыты `document_export::tests` (6/6 PASS).

**Project ZIP: PASS automated/actual-file validation.** Native project Save dialog click отдельно не выполнен; Save/cancel IPC behavior проверен frontend integration tests.

### 38.6. Backup Structure, Restore And Bulk Delete

Отдельно запущен существующий ignored seed test с новым `%TEMP%/noteflow-bulk-qa-rc3-continued-20261006`. Перед запуском каталог/БД отсутствовали. Seed использует synthetic fixture и MemorySecretStorage, не OS credentials и не пользовательский профиль.

Создан `backups/noteflow-backup-20261006-140911.zip` production backup flow. Текущий **backup format version 6**, appVersion `1.0.0-rc.2`; слово v5 в нескольких исторических test names не означает текущую version 5. Реальные ZIP entries: `noteflow-backup.json` и один canonical blob под `files/assets/72/e9/...`.

| Manifest data | Count |
| --- | --- |
| Notes / projects / tags | 5 / 2 / 2 |
| Note revisions / content sidecars / revision sidecars | 1 / 7 / 1 |
| Note-tag relations | 1 |
| Attachments / physical asset blobs | 2 / 1 |
| Note asset refs / note attachment refs | 2 / 2 |
| Revision asset/attachment refs | 0 / 0 |
| AI chats (note / RAG) / messages | 2 (1 / 1) / 2 |
| LLM metadata / embedding profiles / app settings | 1 / 1 / 0 |

Readonly ZIP/manifest validator проверил CRC, exact entries, safe relative paths, note/chat/message/ref integrity, presence of saved sources, archive state и sidecars. Размер и SHA-256 каждого blob совпадают с manifest и live synthetic managed file. Нет credentials/test-only key, Authorization/Bearer, secret refs, reasoning, vectors/knowledge/FTS payloads или temp artifacts. Независимый readonly SQLite reopen fixture: integrity/FK checks PASS, counts совпадают с manifest.

Restore доказан real integration tests: notes/projects/tags/history/sidecars/files, canonical blob/ref dedup, staged filesystem и DB rollback при faults, corruption/traversal rejection, versions 1-4 compatible-history policy, v5 compatibility, v6 current format, reopen. `database_restore_faults_roll_back_notes_sidecars_chats_and_live_files` PASS: note/sidecar/chat fault не оставляет частично изменённые live DB/files. Cloud embeddings не запускаются без consent; derivative state reconciles/pending согласно policy. Это настоящий restore на temporary DB/filesystem, но **не завершённый native confirmation click**.

Bulk delete backend **6/6 PASS**: атомарная очистка notes/revisions/relations/chunks/vectors/jobs/chats, сохранение profile/projects/tags/models/settings, rollback при injected failure, stale autosave/late chat rejection, in-flight embeddings не воскрешают удалённые данные, GC failure допускает retry, backup-before/after и restore/reopen возвращают 5 заметок. `deleteAllNotes.test.ts` дополнительно проверяет mounted two-stage modal, exact case-sensitive phrase, Cancel/Esc/no-op, loading и actual AppShell refresh после удаления.

**Backup/restore: automated PASS; native final restore PENDING USER QA. Bulk delete: automated PASS; native final destructive action PENDING USER FINAL CLICK.** Не объявляется реальное удаление в native profile, если оно не выполнялось. Это не P1 defect и не основание обходить action-time confirmation.

### 38.7. RAG Scope, Queue And Real Providers

Synthetic/test-provider evidence PASS для ALL, standalone-only, Project A, A+standalone, explicit empty scope, note move/remove/archive/delete, original-scope retry, counts/first/latest/date facts, persisted source snapshots и citations. `rag::tests` 30/30 PASS; `standalone_mixed_scopes_filter_all_retrieval_paths_and_follow_project_moves` 1/1 PASS.

`real_atomic_autosave_queue_recovery_restart_and_retrieval_use_final_content` 1/1 PASS: настоящий atomic CAS save обновляет durable queue; V1/V2/V3/FINAL coalesce в FINAL; derivative/cache-only update не создаёт лишний embedding job; title change создаёт; synthetic provider failure не откатывает сохранённый Markdown; reopen/retry/index и retrieval используют последнее состояние. Это реальная SQLite + synthetic HTTP операция, не mock assertion только вызова команды и не real Bridge model quality test.

**Real Bridge (`cifra48/agent`, `cifra48/embedding`): PENDING USER QA.** В isolated native profile нет credentials; реальные ключи не переносились в source/scripts/log/report и не извлекались из другого профиля. Discovery/remediation implementation и synthetic provider contracts covered, actual Bridge smoke не заявляется.

**Ollama discovery/service connectivity: PASS частично.** Readonly GET `http://127.0.0.1:11434/api/tags` реально вернул две модели: `bge-m3:latest`, `qwen3-4b-local:latest`; GET `/api/version` вернул `0.35.1`. Это только наличие сервиса/list endpoint, не NoteFlow UI connection test и не generation. **NoteFlow consent + embedding/generation/retrieval: PENDING USER QA.** Согласие на обработку данных автоматически не принималось.

### 38.8. Organization And Editor Integrated Evidence

FA mounted UI tests проверяют archive filters/nested read-only rows, exact project-name confirmation/cancel/zero-note copy, project picker/new project/remove, chip и card spacing. Real Rust tests подтверждают atomic project archive/restore и provenance, cascade delete вместе с index cleanup, shared assets и readable historical RAG source snapshots, ordered tags через duplicate/backup/reopen, Markdown multi-import duplicates/Cyrillic/rollback, migration chain и FTS refresh. Fresh native subset — five-file import и note archive/restore; остальных destructive UI operations не было.

FC real TipTap/mounted EditorArea tests подтверждают ten-save caret stability, same-ID content reload/CAS/stale coordinator, captured context selection, Tab/Shift-Tab list/code/paragraph/table, combined marks, independent highlight/text color, table colors/thick borders и sidecars, Details, divider, callout/image attrs, safe links и outline navigation. Accepted user smokes links/lists/contextmenu/security приведены в 38.3. Нет повторного corrective investigation или изменений этих реализаций.

TOC behavioral tests работают с настоящим ProseMirror document: duplicate Unicode anchors, hierarchy/live updates, silent same-ID replacement, scroll без изменения document/selection/extra autosave, unknown-anchor feedback. Formula UI удалён по product policy; old formula/date storage compatibility сохраняется. Display dates используют общий formatter DD.MM.YYYY; storage остаётся ISO. Native full toolbar/restart каждого элемента на текущем HEAD не заявляется.

### 38.9. Image, Drawing, Calendar And Responsive Evidence

Image/canonical asset tests: real format/signature/size checks, ref-aware GC, crop preservation of original/shared blob, alignment/attrs/sidecar reload. Fresh native PNG crop/archive/restore already PASS. Mounted drawing tests проверяют все шесть инструментов, move без duplicate/style loss, one-step undo/redo, reset/cancel, blank apply, color/thickness, pointer cancellation и failed persistence. Canvas mock в mounted tests **не выдаётся за actual bitmap proof**: отдельные browser cases используют настоящий canvas и pixel checks, crop/output dimensions, moved rectangle old/new positions и text output.

Принятые **132 geometry cases**: 24 Settings, 76 RAG layouts, 8 export/TOC, 8 editor, 16 image/drawing/canvas. Использовались light/dark, 100/125/160%, 1100x700 / 1440x900 / 1920x1080 / 2560x1440 согласно конкретному suite. Не каждый suite содержит полный cross-product всех размеров; это не native матрица всех страниц.

Дополнительный readonly browser fixture pass **16/16**: 1100x700 и 1440x900 x 100/160% x light/dark x два date entry points (inline control fixture + NewNoteModal). Проверены September/August/September, month/year popovers inside viewport, 2022 и 2030, Monday-first Russian labels, immediate `22.09.2030`, nested Escape (year -> calendar -> modal), no page errors. Совокупно **148/148 browser QA cases**, из них 16 новые; не 148 native tests.

Первый draft этого temporary calendar script ошибочно искал day через role=button, хотя production DatePicker использует role=gridcell. Исправлен только QA locator, assertion сохранён, rerun 16/16 PASS. Дополнительный sandbox `spawn EPERM` при старте headless Edge был разрешён approved escalation для localhost fixture; ни он, ни ошибка locator не являются NoteFlow regression.

Полная native window/zoom matrix Notes/Projects/Tags/Archive и installed WebView на втором ПК не выполнялась после остановки Computer Use. Статус PENDING USER QA, без утверждения о визуальном PASS неоткрытых экранов.

### 38.10. Installer Metadata And Lifecycle

Фактические outputs текущего accepted build перепроверены по размеру/SHA-256/signature:

| Artifact under `D:/Projects/NoteFlow/src-tauri/target/release/` | Bytes | SHA-256 |
| --- | --- | --- |
| `noteflow.exe` | 19 512 320 | `233665E3F354DBEFBF8475280FB5DC3272010D6CA2CFE0BC340054EB949D0D21` |
| `bundle/nsis/NoteFlow_1.0.0-rc.2_x64-setup.exe` | 5 637 106 | `02A3E29608C9D19171B58C32A4BEB3C32B603D48C50D44C372FF322B369C9A14` |
| `bundle/msi/NoteFlow_1.0.0-rc.2_x64_en-US.msi` | 7 581 696 | `550EF51A7048CC25A51B6CF499438A15CA6F2C57FCB7B479F116FAAFBAC85C41` |
| `bundle/msi/NoteFlow_1.0.0-rc.2_x64_ru-RU.msi` | 7 581 696 | `F2C59CE20D25FD5EE9202CF0C9E8E1B07B61061409F4F7988513524FC6124407` |

Metadata прочитаны **не только из конфигурации**, но и из обоих MSI через readonly Windows Installer database COM:

- ProductName `NoteFlow`, ProductVersion `0.99.2`, ALLUSERS `1`.
- ProductLanguage en-US `1033`, ru-RU `1049`.
- UpgradeCode `{FF9D3DE5-B119-5CB0-9873-43E30A097AFA}` совпадает в обоих пакетах и не менялся.
- Generated WiX: InstallScope perMachine, AllowDowngrades=yes (текущее Tauri packaging behavior; downgrade фактически не проверен).
- Generated NSIS: display VERSION `1.0.0-rc.2`, INSTALLMODE currentUser, RequestExecutionLevel user, install root LOCALAPPDATA/NoteFlow. Numeric PE version не используется как доказательство prerelease ordering.

Все четыре артефакта **NotSigned / UNSIGNED** по Get-AuthenticodeSignature. RC3 candidate по-прежнему rc.2; RC3 version bump/tag/release не выполнялись.

Install/launch/reinstall/upgrade/uninstall/data-preservation и NSIS/MSI coexistence **PENDING USER / SECOND-PC QA**: нет предоставленной безопасной admin VM/второго ПК. Не выполнялась установка поверх реального installed profile. Нельзя подтвердить duplicate entries/shortcuts, выбранный executable или состояние второго installer после удаления первого из metadata alone. Scope mismatch — важная QA обязанность, не автоматически подтверждённый bug.

Generated NSIS удаляет app data только при отмеченном DeleteAppData checkbox и не в update mode; наличие этого условного кода **не доказывает фактический результат uninstall**. Current actual uninstall-data result: **NOT OBSERVED**, ни PRESERVED, ни REMOVED. Пользователь должен зафиксировать результат до ручного удаления QA data directory.

Windows 10: **NOT TESTED**. Второй ПК: **NOT TESTED / PENDING USER QA**. macOS: **NOT PRODUCTION VALIDATED**. Unsigned/SmartScreen possibility/updater absence остаются известными ограничениями, а не исправляются в regression pass.

### 38.11. Security And README Review

Fresh production npm audit 0 закрывает прежний RG-SEC-001. Принятые editor paste regressions входят в текущий green suite и user smoke. Rust LLM diagnostics ограничены `cfg(debug_assertions)` и allowlist безопасных status/count/type/timeout fields, release branch no-op. Frontend diagnostic вывод требует DEV и filtered allowlist. Ни note/prompt/reasoning/key/Authorization/response body/sidecar, ни полные provider URLs не разрешены diagnostic allowlist.

CSP в текущей Tauri configuration: script self, connect self/ipc, object/frame none, base-uri self/form-action none; frontend не получает секреты из credential storage. Generated backup проверен отдельно на исключение secrets, derived vectors и internal markers; QA data остаются вне repo и не stage-ятся. Это scoped code/test/artifact review, не обещание абсолютной безопасности неизвестного внешнего provider или всех возможных dependencies.

README **не изменён**. Требуемые будущие RC3 edits после согласования:

- Заменить explicit release/version/artifact links только при фактическом RC3 bump/publication, не заранее.
- Убрать Formula из списка доступных UI tools, оставив legacy-document compatibility без ложного обещания нового formula UI.
- Указать новые MD/TXT/DOCX/PDF exports, project ZIP и live TOC, bulk-delete two-stage warning и backup-before-delete рекомендацию.
- Кратко описать RAG project/standalone scope и auto-index/retry behavior, не обещая cloud без consent.
- Сохранить честные unsigned/macOS/Windows10/updater/installer coexistence ограничения; добавить реальные installed RC screenshots, не макеты.

Это один существующий **P2 documentation gap**, не новый product blocker и не разрешение менять README в текущем scope.

### 38.12. Matrix Evidence Legend

Все paths относительно `D:/Projects/NoteFlow/`. FA=`tests/phaseAOrganization.test.ts` + real `src-tauri/src/data.rs` tests; FB=`phaseBPolish` + data/knowledge/embedding/rag tests; FC=`phaseCEditor`/editor interactions/serializer + real TipTap/mounted EditorArea; FD=`phaseDImageEditor`/imageGeometry + canonical assets Rust; FE=`phaseEBehavior`/`phaseEExport` + `document_export::tests`; BD=`deleteAllNotes` + six bulk Rust integration tests; BI=`backupImportFlow` + backup/fault/version/reopen Rust tests; SEC=security/paste/link/error tests; DATE=`displayDate.test.ts`; GEO=132 accepted +16 calendar browser cases; FILE=actual native-export/production ZIP/backup validators выше.

`Native: —` и `User: —` означают **NOT TESTED в этой строке**, не подразумеваемый PASS. «Часть» прямо ограничивает наблюдение. «Принят corrective» относится только к четырём явным пользовательским smokes, а не всей фазе. PASS при таком native gap основан на перечисленной automated behavior/real integration evidence. Human-critical acceptance отдельно оставлена PENDING; простая source assertion названа contract, не DOM behavior.

### 38.13. Current Original Requirements Matrix — 98 Rows

| Requirement | Implementation evidence | Automated evidence | Native evidence | User evidence | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A01 Archive All/Projects/Notes, no duplicate children | ArchivePage/data archive DTO | FA mounted filters + Rust nested grouping | Часть: archive/nested viewed | — | PASS | Не новый native полный filter cycle |
| A02 Atomic project archive | data project archive transaction | Rust injected failure rollback | — | — | PASS | Notes/project rollback доказан на temporary DB |
| A03 Manual archive survives project restore | archived_by_project_id provenance | Rust archive/restore/reopen | — | — | PASS | Не выводится из одного текущего списка |
| A04 Archive counts/date/actions clean rows | ArchivePage/shared DATE tokens | FA/DATE | Часть: actual rows/date/actions | — | PASS | Full native sizes отдельно G07 |
| A05 Nested read-only notes and Back | archived project note view | FA/data | PASS previously observed nested/Back | — | PASS | Нельзя редактировать archived document |
| A06 Atomic project restore | data restore transaction | Rust rollback + provenance | — | — | PASS | Native note restore не подменяет project restore |
| A07 Archive filter/page ownership | ArchivePage controlled filters | FA mounted filters | Часть | — | PASS | No duplicate parent/children verified |
| A08 Exact project-name confirmation, cancel, zero notes | project ModalShell | FA mounted typed-name/cancel/zero | — | — | PASS | Destructive SQL tested отдельно A09 |
| A09 Project+notes delete count warning/atomic | shared note deletion transaction | FA + real Rust cascade/fault/index | — | — | PASS | Full rollback, other projects kept |
| A10 Note deletion wording/modal | note destructive ModalShell | FA mounted action routing | — | — | PASS | Button «Удалить», no final-delete wording |
| A11 Archived projects excluded from assign picker | project picker service/filter | FA mounted options | — | — | PASS | No stale archived assignment |
| A12 Create project from picker, assign note | note project action | FA handler/state test | — | — | PASS | No invented new backend flow |
| A13 Remove note from project | existing move/remove service | FA + Rust relations/retrieval | — | — | PASS | Standalone becomes eligible correctly |
| A14 Project chip distinct from preview | NoteCard project chip | FA mounted card | Часть: actual project chip | — | PASS | Narrow/long visuals not universal native proof |
| A15 Comfortable first-tag spacing, aligned content | NoteCard scoped styles | FA card/style regression | Часть: native note list | — | PASS | Title/preview/chip/tags aligned |
| A16 Project scope chip and clear | notes project navigation state | FA mounted clear action | — | — | PASS | Selection/navigation kept |
| A17 No breadcrumb | current shell/editor layout | contract/layout coverage | PASS layout observed | — | PASS | Absence checked, not feature behavior claim |
| A18 No Library heading | current sidebar/layout | contract coverage | PASS layout observed | — | PASS | No obsolete section introduced |
| A19 Ordered multiple tags survive reopen | note_tags position | FA + real Rust reopen | — | — | PASS | Persisted order, not only array display |
| A20 First-tag reorder changes accents | shared primary tag mapping | FA + Rust primary reorder | — | — | PASS | List/editor/source mapping verified |
| A21 Remove first promotes next, neutral zero | tag relation reducer/data | FA + Rust relation/order | — | — | PASS | No random replacement accent |
| A22 No automatic new tag | create-note defaults | FA/contracts + data creation | Native note created, tag flow not repeated | — | PASS | Default does not insert auto tag |
| A23 Consistent tag colors across surfaces | shared tag color helpers | tag/UI mapping tests | Часть: note accent | — | PASS | Not every surface visually visited |
| A24 Duplicate/backup preserve tag order | duplicate/backup ordered relations | Rust roundtrip/reopen | — | — | PASS | Primary tag unchanged |
| A25 Markdown import in note overflow | note menu + native import service | FA/service contracts | PASS real file picker/import | — | PASS | Not only paste evidence |
| A26 Multi/Cyrillic/empty/duplicate import | production batch import | real Rust fixtures/rollback | Часть: five actual files | — | PASS | Empty/duplicate edge cases automated |
| A27 Backup order/provenance compatibility | backup schema/version readers | BI/Rust v1-v6 + FILE | Preview subset; final restore pending | — | PASS | Compatibility not claimed from native preview |
| A28 Metadata/tag/project updates keep FTS/RAG current | index update/reconcile path | data/search/knowledge tests | — | — | PASS | Search stale deleted results tested |
| A29 CAS/note/sidecar/revision/autosave/assets | P0 atomic persistence and coordinator | real fault/CAS/FC/coordinator tests | Часть: saves and readonly reopen | — | PASS | No P0 rewrite; stale/fault proof automated |
| A30 Migration 15 tag order/provenance | migration chain | legacy relations/migration Rust tests | — | — | PASS | Current-schema seed not called old-DB native upgrade |
| A31 Safe public persistence errors | typed public error mapping | SEC/data/FC failure tests | — | — | PASS | No note text/SQL/paths exposed |
| A32 DD.MM.YYYY UI, persisted ISO | shared displayDate | DATE local calendar/timezone | PASS real archive/backup dates | — | PASS | Storage/chronology unchanged |
| B01 ALL/multiple projects and persistence | RAG scope selector/contracts | FB mounted + Rust reopen/backup | — | — | PASS | Real Bridge inference separately pending |
| B02 Standalone/mixed scope no leakage | scoped retrieval SQL/filtering | FB + real embedding/RAG scope tests | — | — | PASS | Three retrieval paths and moves covered |
| B03 Explicit empty blocks Send, never ALL fallback | typed empty scope | FB mounted + Rust scope validation | — | — | PASS | Empty is distinct from ALL with zero projects |
| B04 Move/remove/archive/delete scope reconcile | active-note filters/index sync | real Rust retrieval/reconcile | — | — | PASS | No active orphan chunks/vectors |
| B05 Retry original scope | persisted request snapshot | FB/RAG retry tests | — | — | PASS | Current selector cannot widen old request |
| B06 Counts/first/latest/date facts agree with scope | Global Knowledge Agent query rules | real DB + 30 RAG tests | — | — | PASS | Synthetic provider, not Bridge answer-quality proof |
| B07 Auto-index final-wins coalescing | durable queue/CAS generations | real atomic save/HTTP/reopen/retrieval | — | — | PASS | Only FINAL indexed; cache-only update skips work |
| B08 Failure/retry/restart and privacy consent | worker failure/pending + consent | Rust recovery/LLM tests PASS | Developer consent not accepted | Final user Ollama smoke PASS | PASS | User-confirmed real generation, not automated acceptance of consent |
| B09 Manual repair only, no normal Update burden | current knowledge settings UX | contracts/FB | PASS Data screen | — | PASS | Automatic normal flow exists |
| B10 Six onboarding steps/Back/Skip/once | persisted onboarding state | FB mounted Back/Skip/failure | Часть: native completion/restart, isolated Skip | — | PASS | Not all branches native |
| B11 Unified tooltips/focus/Esc/bounds | shared tooltip portal | FB mounted keyboard + GEO | — | — | PASS | Browser fixtures, not every native tooltip |
| B12 History/source panel responsive | RAG panel layout | 76 browser cases + FB | — | — | PASS | Native installed full matrix separately G07 |
| B13 Historical source snapshots after deletion | snapshot persistence policy | real data/RAG deletion tests | — | — | PASS | Historical readable; active retrieval excludes deleted |
| C01 Caret stable across ten autosaves | EditorArea acknowledgement path | FC mounted real TipTap | Часть: accepted editing/restarts | Mixed-list corrective accepted | PASS | Selection not reset by ordinary save |
| C02 Immediate switch/close/failure protected | autosave coordinator generations | FC/coordinator/Rust CAS | Settled closes only | — | PASS | No new native pending-X-close claim |
| C03 Full basic formatting toolbar | actual extensions/toolbar | FC/editor tests | Часть: native rich Markdown | Mixed lists accepted only | PASS | Full toolbar click matrix not asserted |
| C04 Combined marks persist/reload | canonical serializer/sidecars | FC real editor roundtrips | — | — | PASS | Marks independently checked |
| C05 Highlight and text color independent | separate mark commands | FC behavioral tests | — | — | PASS | No color loss when highlight cleared |
| C06 Context captured selection/order/Esc/input | EditorContextMenu/selection bookmark | FC mounted handlers/clipboard | PASS corrective native 100/160 subset | Corrective accepted | PASS | Original native Paste consent gap closed by user smoke |
| C07 Tab/Shift-Tab list/code/paragraph/table | nearest-list/keyboard handlers | FC actual ProseMirror tests | PASS corrective mixed list subset | Mixed-list corrective accepted | PASS | Table/code branches automated |
| C08 Russian/URL/no-space wrap | editor overflow rules | 8 editor GEO cases | — | — | PASS | No complete native long-note matrix |
| C09 Safe links/tooltips/internal anchors | link classifier/editor DOM routing | SEC/FC/FE/GEO | Internal links corrective native subset | Internal # correction accepted | PASS | No new native external Ctrl-click claim |
| C10 Formula UI removed, legacy data compatible | current toolbar and extension compatibility | FC/contracts/serializer | — | — | PASS | No destructive conversion of old content |
| C11 Table menus/geometry/colors/thick borders | contextual tools/sidecars | FC/table/serializer/GEO | Часть: native table renders | — | PASS | Full native manipulation/restart not repeated |
| C12 Details editable/collapse/reload | Details extension + sidecar | FC actual editor roundtrip/GEO | Часть: native imported Details | — | PASS | No new native summary/body typing claim |
| C13 Divider survives reload | canonical HR serialization | FC roundtrip | Часть: native import rendering | — | PASS | Current content source remains Markdown |
| C14 Nested Settings sidebar no gaps | responsive Settings shell | 24 GEO cases | — | — | PASS | Browser collapse/expand, not native complete sequence |
| D01 Image formats/limits/canonical/resize | backend attachment policy/image node | FD/Rust canonical assets | Часть: native PNG insertion | — | PASS | Formats/limits/resize branches automated |
| D02 Crop/apply preserve shared original | immutable blob/edit metadata | FD/real pixels/Rust shared assets | PASS native PNG crop; archive/restore | — | PASS | Shared-original proof from real DB test |
| D03 Six drawing tools/Undo/Redo/zoom | annotation reducer/ImageEditorModal | FD mounted + actual canvas subset | — | — | PASS | Pixel proof covers subset, six tools mounted behavior |
| D04 Reset confirm/cancel/reset | existing ModalShell/reset action | FD mounted + browser cancel | — | — | PASS | No silent reset |
| D05 Color/thickness/blue focus | drawing vars/controls | FD + real browser computed styles | — | — | PASS | Accent changes do not replace focus token |
| D06 Blank Apply/resize/persistence | drawing output/canonical asset save | FD/Rust reload tests | — | — | PASS | Not new native blank-canvas restart |
| D07 Files Unicode/Open/Reveal/limits/path | managed attachment contracts/opener | FD/Rust validation/public errors | — | — | PASS | External target app/reveal not physically exercised |
| D08 Single callout palette/colors/reload | shared palette/sidecar | FD actual keyboard/editor + pixels/styles | Часть: native rendered callout | — | PASS | Palette branches browser/mounted |
| D09 Both date entries/month/year/Escape | DatePicker/CalendarCaption/NewNote | FD + new 16 browser cases | — | — | PASS | 2022/2030 + nested Escape verified |
| D10 Monday/Russian/DD.MM/centered 100/160 | shared DATE/calendar styles | DATE/FD/GEO/new calendar | — | — | PASS | Exact local day, viewport bounds checked |
| D11 Move object without duplicate | existing annotation move reducer | six FD tool cases + actual pixel output | — | — | PASS | Old-position empty, new-position painted |
| E01 Save/cancel/status/overwrite semantics | dialog/dataService/export worker | FE dialog/flush/fault integration | PASS real Save/file/status subset | — | PASS | Native cancel/overwrite not separately executed |
| E02 Portable Markdown and relative assets | single backend canonical exporter | Rust MD/asset + FILE | PASS real MD file | — | PASS | No sidecar/debug/noteflow-asset URI |
| E03 Readable UTF-8 TXT without HTML/JSON | export document model/TXT worker | FE + FILE | PASS native file created | — | PASS | Structural read, not Notepad visual opening |
| E04 Real DOCX/Word/Cyrillic/marks/table | docx export worker | real OOXML/relationships + FILE | PASS Word opening/no repair/basic content | — | PASS | Long-doc pagination/marks validated automated, not all visually |
| E05 Real PDF multipage/Unicode/viewer | PDF worker/font resources | FE actual PDF + native file strict parse | Developer Acrobat failed pre-open | Final user PDF viewer smoke PASS | PASS | Viewer acceptance supplied by user; no invented Acrobat retest |
| E06 Export waits latest save/failure blocks | export coordinator | FE/coordinator behavioral tests | — | — | PASS | No stale last-keystroke export after failed save |
| E07 Project ZIP 3 notes/duplicates/Cyrillic/assets | production write_project/snapshot | Rust + actual 3/5-note ZIP FILE | — | — | PASS | Not native project Save click |
| E08 ZIP safe paths/atomic failure | exporter sanitization/temp commit | real Rust fault + FILE traversal/name checks | — | — | PASS | No unrelated/archived records in snapshot |
| E09 Live TOC hierarchy/duplicate anchors | ProseMirror outline | FE actual document/GEO | — | — | PASS | Same-ID silent reload updates outline |
| E10 Internal anchors safe/no autosave | editor anchor navigation | FE scroll/document invariants | Corrective native internal link subset | Internal-link correction accepted | PASS | Unknown anchors safe feedback |
| E11 Settings contextual exports removed | current Data/Models Settings | contracts/GEO | PASS Data/Models observed | — | PASS | Profile backup/status remain |
| E12 Project menu label «Экспортировать» | ordinary/archived menu copy | exact-label/FE contracts | — | — | PASS | Handler/ZIP logic unchanged |
| E13 Russian UI, language control absent | current settings/product policy | copy/contracts/GEO | Часть: observed screens Russian | — | PASS | Not exhaustively every native label |
| E14 Clear highlight changes background only | existing highlight command | FC combined mark behavior | — | — | PASS | Text color retained |
| G01 Knowledge chunk explanation user-friendly | Knowledge/Data copy | contract copy checks | PASS actual explanatory copy | — | PASS | No new raw technical controls |
| G02 Bulk two-step/exact phrase/Cancel/Esc/loading | DeleteAllNotesModal | BD mounted two-step/case/Cancel/Esc/loading | Developer preview/Cancel subset | Final user bulk-delete smoke PASS | PASS | Final destructive action confirmed by user |
| G03 Bulk zero indexes/chats/jobs, profile kept | shared transactional bulk delete | 6 real Rust + AppShell refresh tests | Developer final click not done | Final user delete/restart smoke PASS | PASS | Automated cleanup proof + user lifecycle acceptance |
| G04 Backup/bulk/restore/reopen/old versions | staged restore/version policy | BI/BD + real v1-v6/fault/reopen | Developer preview/Cancel only | Final user restart/restore smoke PASS | PASS | Old-version faults remain real integration evidence |
| G05 Ref-aware GC/revision policy persistence | existing P0.3/P0.4 | real assets/retention tests | — | — | PASS | No retention/ownership rewrite in regression |
| G06 Single instance/CSP/public error boundaries | Rust plugin/CSP/ErrorBoundary | SEC/static + behavioral boundary tests | Native double-launch not repeated | — | PASS | Implementation/gates, not installer lifecycle proof |
| G07 Complete pages/window sizes/themes | current responsive layout | 132+16 GEO subsets PASS | Complete native matrix not done | — | PENDING USER QA | Installed/native 1100/160 check still useful; no confirmed overflow |
| G08 Install/reinstall/uninstall/coexistence | NSIS currentUser/MSI perMachine | Build + actual MSI metadata PASS | Developer safe machine unavailable | Final user second-PC lifecycle/coexistence PASS | PASS | Exact OS build/data-checkbox results not supplied; not invented |
| G09 Windows10/second-PC/macOS validation | platform code/build config | No cross-platform runtime proof | Developer no Windows10/macOS run | Second-PC user PASS; exact Windows version unspecified | NOT TESTED | Windows10/macOS validation remains unclaimed |
| G10 Zero production npm vulnerabilities | accepted security remediation | fresh online audit = 0; SEC suite | Accepted native paste security | Paste security accepted | PASS | Previous audit FAIL closed, no new dependency edits |
| G11 Destructive cross no stray underline/focus retained | scoped icon/SVG/control styles | BD rendered SVG/style/focus regression | Earlier 100% subset | Prior corrective accepted, not new full-head matrix | PASS | 160/all states automated; no brittle screenshot test |
| G12 Built unchanged rc.2 candidate | canonical versions/Tauri config | actual outputs/hashes/build/MSI COM | No installer launch | — | PASS | Not permission to publish RC3 |
| G13 No Git/release/version mutation | current repo safety boundary | status/diff/hash verification | — | — | PASS | Only existing untracked report updated |
| G14 Unsigned/macOS/updater limitations | existing packaging policy | signatures/config/README review | No macOS lifecycle | — | KNOWN LIMITATION | All artifacts unsigned; macOS not validated; no updater |

После явного final user smoke 06.10.2026: **98 rows — 95 PASS / 1 PENDING USER QA / 1 NOT TESTED / 1 KNOWN LIMITATION / 0 FAIL / 0 BLOCKED**. G07 не превращается в доказательство полного cross-product всех native размеров/тем на основании общего smoke; это INFO coverage limitation, не подтверждённый P1. Windows10/macOS/signing results не придуманы. Counts относятся только к текущей таблице.

Исторические pending для Bridge/Ollama/PDF/bulk/installer в 38.7/38.17 закрыты явным final user smoke, записанным в 39. Automated RAG evidence по-прежнему synthetic; реальные модели подтверждены пользователем отдельно, не подменены этим evidence. Полная native dimensions matrix и непроверенные платформы остаются честно ограниченными.

### 38.14. Findings And Current Severity

| Finding | Current classification | Reason |
| --- | --- | --- |
| Prior RG-SEC-001 dependency gate | CLOSED | Accepted remediation, fresh production audit 0 + 505/255 gates |
| Prior internal links/mixed list/context menu issues | CLOSED, USER-SMOKE PASS | Explicit user acceptance; fresh integrated tests remain green |
| Prior missing bulk delete product gap | IMPLEMENTED; final native QA pending | Real transaction/rollback/resurrection/backup tests PASS |
| Missing PDF viewer / Bridge / consent / installer evidence | PENDING USER QA, not P1 defect | No confirmed release-critical malfunction |
| Computer Use URL limitation / Acrobat pre-open failure | ENVIRONMENT LIMITATION | Not reproduced as NoteFlow behavior |
| README Formula/outdated feature description | Existing P2 documentation gap | Correct after approved RC3 docs/version work, no edits now |

Current confirmed **P0: 0; P1: 0; P2: 1 (existing README documentation gap)**. No new confirmed product bug after continued regression. Counts are not a guarantee about still untested viewers/providers/installers. WebView2 class-unregister diagnostic from earlier native shutdown remains INFO without observed stuck process; not silently reclassified as crash or ignored as nonexistent.

### 38.15. Final Git And Cleanup

QA dev closed, no NoteFlow process and no listener 1420. All targeted tests/harness/browser validators completed. Temporary fixtures contain only synthetic data outside repo; not removed because final user smoke needs them. No user/profile data directories cleaned, no intentional reports removed.

Tracked worktree clean; staged diff empty; branch/HEAD unchanged. Canonical version files and the seven other intentional untracked files checked against recorded SHA-256 baseline, unchanged. `git diff --check` PASS; untracked report checked separately for trailing whitespace/conflict markers and matrix completeness. This report remains untracked, as originally.

Expected final `git status --short --branch`:

```text
## feature/rc3-product-polish
?? docs/tasks/phase-b-rag-responsive-report.md
?? docs/tasks/phase-b-smoke-corrective-report.md
?? docs/tasks/phase-b-standalone-scope-report.md
?? docs/tasks/phase-c-editor-correctness-report.md
?? docs/tasks/phase-c-settings-layout-corrective-report.md
?? docs/tasks/phase-d-image-insert-calendar-report.md
?? docs/tasks/rc3-full-regression-report.md
?? scripts/qa/phase-b-provider.mjs
```

### 38.16. Verdict

**READY FOR USER RC3 FINAL SMOKE**.

0 confirmed P0/P1, all accepted fresh gates green, production audit 0, all 98 original rows reviewed against current evidence. Remaining checks need real viewer/provider consent/credentials, human final confirmation or safe physical Windows environment. This is **not READY TO RELEASE**, not approval to install over valuable data, not authority to create commit/tag/push/release. Version remains **1.0.0-rc.2**.

### 38.17. USER ACTIONS STILL REQUIRED

1. Открыть `%TEMP%/noteflow-rc3-integration-20261006-input/native-export.pdf` в рабочем PDF viewer: проверить обе страницы, кириллицу, таблицу и изображение без обрезки.
2. В безопасном профиле выполнить real Bridge smoke через существующее secure storage: discovery/connection для `cifra48/agent` и `cifra48/embedding`, запрос с реальными sources и повторный запрос после изменения заметки; ключи не отправлять в отчёт/чат.
3. В том же безопасном профиле самостоятельно подтвердить подходящий privacy consent и проверить Ollama embedding/generation/retrieval. GET списка моделей уже подтверждён и сам по себе не заменяет генерацию.
4. Только в synthetic `%TEMP%/noteflow-bulk-qa-rc3-continued-20261006` выполнить финальный bulk-delete click, проверить empty/search/RAG после restart, затем восстановить созданный backup и проверить notes/history/sources/assets и active editor. Не использовать пользовательский профиль.
5. На отдельном QA ПК/VM проверить NSIS install -> launch -> update/reinstall -> uninstall, app-data результат до ручной очистки, повторный запуск и installed native layout при 1100x700/160%; Windows 10 дополнительно, если такая среда доступна.
6. Там же отдельно проверить NSIS currentUser + MSI perMachine coexistence: entries/shortcuts/actual executable, uninstall одного и сохранность второго/QA данных; MSI ru-RU/en-US в доступной безопасной среде.

Не запрашиваются повторно paste security, internal links, mixed checklist, context menu или basic Word opening. После отчёта работа останавливается без commit/tag/push/release/version bump.

## 39. Final User Acceptance And RC3 Release Gate

### 39.1. Accepted Source And User Smoke

Дата: 06.10.2026. Accepted pre-bump HEAD **714532f117313fcbd61d20334cd1d58f68c62834**, branch `feature/rc3-product-polish`. Tracked tree и index до изменений clean; восемь intentional untracked. Пользователь явно разрешил ONE release commit, обычный merge/push, annotated `v1.0.0-rc.3` и GitHub prerelease после всех gates.

Приняты ранее: product polish A-E, bulk-delete corrective (`542a0e6`), TipTap/ProseMirror security remediation (`f0073c4`), editor interaction corrective (`714532f`), fresh 505/255 regression и 132+16 browser cases. Final user smoke **PASS**: actual PDF viewer, Markdown import/exports/Word/PNG crop/archive, editor/security, bulk-delete/restart/restore, real Bridge и Ollama, second-PC installer lifecycle и NSIS/MSI coexistence. Это пользовательское подтверждение, не новое developer/native действие. Реальные endpoints/keys не включены в публичные release notes.

Подтверждённые **P0 = 0, P1 = 0**. README gap исправляется текущей документацией. Exact second-PC Windows build, Windows 10, macOS и exhaustive native size/theme matrix не зафиксированы и не объявляются проверенными. Unsigned Windows, no updater/streaming/reranker и macOS not production validated остаются Known Limitations/INFO.

### 39.2. Release Branch And Version Policy

Canonical Windows release branch: **release/windows-hardening**. Основание: это единственная tracked remote release branch; оба annotated rc.1/rc.2 tags находятся в её истории; `main` остался на раннем UI shell. На preflight release target является предком accepted HEAD (0 target-only commits / 8 feature-only); стратегия не придумана заново. Перед merge требуется fetch и повторная проверка remote delta; conflicts/unexpected target commits останавливают публикацию.

Все пять canonical files обновлены до **1.0.0-rc.3** (package-lock root и own Cargo.lock package включены), MSI mapping **0.99.3**, productName **NoteFlow**, identifier **com.noteflow.desktop**. About остаётся динамическим `getVersion()`. UpgradeCode должен остаться **ff9d3de5-b119-5cb0-9873-43e30a097afa**. Исторические rc.2 reports/notes и synthetic version fixtures не переписаны как активные version sources.

Release README/notes/checklists актуализированы без изменений UI/handlers/provider/persistence/export logic. Остальные семь local reports/QA script не stage-ятся. `release-windows.ps1` изучен: его clean-tree guard включает untracked и конфликтует с явно разрешённым pre-commit staging; gates выполняются напрямую, guard не ослабляется. Для artifacts используется существующий staging script. Standalone EXE остаётся local QA, не public asset.

### 39.3. Fresh Release-Bumped Gate

Fresh release-bumped checks completed 06.10.2026:

| Gate | Result | Measured evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | 7.532 s |
| `npm run test` | PASS | 505/505, 73 suites, 0 failed/skipped/cancelled; 31.442 s |
| `npm run build` | PASS | 243 modules, Vite 12.87 s; no build warnings |
| `cargo fmt --check` | PASS | 1.207 s; no automatic formatting |
| `cargo check` | PASS | 1 min 06 s |
| `cargo test` | PASS | 255 passed / 7 intentional ignored; test execution 18.38 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS | 10.83 s; warnings denied |
| Online `npm audit --omit=dev --offline=false` + JSON | PASS | 0 production vulnerabilities; both commands exit 0 |
| Isolated 10,000-note FTS benchmark | PASS | Index 11.703483 s; query 841.9 microseconds (0.8419 ms); test 11.71 s |
| `npm run tauri build` | PASS | Production frontend 12.83 s; optimized Rust 1 min 48 s; NSIS + both MSI locales |
| `git diff --check` | PASS | No whitespace errors; Git LF-to-CRLF notices are informational |

FTS ran without NoteFlow/dev/cargo/rustc workloads in parallel. Accepted baseline: indexing 12.0156294 s, query 690.9 microseconds. New query remains sub-millisecond; no clear severe regression. Seven ignored Rust tests were not silently reclassified as passed. Initial sandbox `npm run test` could not spawn a process (`EPERM`) before tests ran; the permitted rerun completed all 505 tests. No test failure was fixed or concealed.

### 39.4. Actual RC3 Packages And Public Staging

Actual Windows Installer COM inspection: both MSI files parse correctly, ProductName **NoteFlow**, ProductVersion **0.99.3**, UpgradeCode **{FF9D3DE5-B119-5CB0-9873-43E30A097AFA}**, x64, `ALLUSERS=1`; languages 1033 (en-US) / 1049 (ru-RU). Both contain file/media records and cabinet streams. NSIS generated metadata identifies **com.noteflow.desktop**, current-user scope and rc.3; actual NSIS/standalone ProductVersion and FileVersion are **1.0.0-rc.3**. MSI upgrade ordering remains 0.99.1 < 0.99.2 < 0.99.3 < 1.0.0. All actual EXE/MSI signatures report **NotSigned**.

Public staging: `releases/windows/1.0.0-rc.3/`, exactly four files, Git-ignored:

| Public file | Bytes | SHA-256 |
| --- | --- | --- |
| `NoteFlow_1.0.0-rc.3_x64-setup.exe` | 5,635,899 | `39452d18dbc9f277bad135b68c12214430b30328eadea87ee9dd53c0e94f39b2` |
| `NoteFlow_1.0.0-rc.3_x64_ru-RU.msi` | 7,585,792 | `dc11188e921d3304850bb72db482dfeb63a580ebbaa9cebe553367856faa928f` |
| `NoteFlow_1.0.0-rc.3_x64_en-US.msi` | 7,585,792 | `d66cf4adda646b3b02d21afd4db30c436f4583282246bde8daab773feccb5181` |
| `SHA256SUMS.txt` | 300 | `a0675669bd01af8c76ab3966fafedb522ec8245da33740ffbd42e75975f587d4` |

Manifest lists only the three public installers. Staged installer hashes match final build outputs 3/3; manifest readback matches staged files 3/3. Standalone `NoteFlow_1.0.0-rc.3_x64-standalone.exe` is separate in Git-ignored `releases/qa/1.0.0-rc.3/`: 19,513,344 bytes, SHA-256 `9ec8181e8fbb009a52dcafadcfe8acd6bec2c0f4eaa04cbcb672aef079d8d0e6`; matches release `noteflow.exe`. It must not be uploaded as a normal user asset. Prior rc.2 outputs/staging were not removed.

New packages were checked for existence, non-zero size, package parsing, identity, version and hashes. No unsafe synthetic install over the real profile was attempted. Earlier explicit user installer lifecycle smoke remains its own evidence, not a claim that every newly rebuilt installer was installed.

### 39.5. Source Security And Publication Boundary

Release source audit considered 355 candidate files, including the two newly approved documents, and scanned 283 text files: no prohibited tracked profile/DB/credential/log/archive artifacts or detected secret tokens/private keys/personal absolute user paths. Existing private endpoint examples are confined to Rust test modules; they are not public release notes or active production endpoint configuration. This is a scoped static audit, not a proof of absence of every conceivable secret.

Production `dist` contains 20 files, no source maps, QA data-directory markers, fixture secrets or private Bridge host. Public staging contains only the four intended files, no QA profiles, databases, logs, debug binaries or private config. The seven unrelated intentional local files were verified unchanged and are excluded from the release commit. No UI, provider, persistence, export handlers or dependency versions were changed in this release-preparation pass.

Local release gates are green. Commit/merge/tag are separate authorized operations, followed by post-merge typecheck/test/online audit. Publication is not inferred from a successful build: authenticated GitHub CLI, normal remote push, prerelease upload, remote tag and exact four-asset verification remain mandatory. The GitHub CLI authentication check currently reports no logged-in host. Browser login requests authorization scopes and must receive explicit human approval; no token extraction, credential reuse workaround or partial remote publication is permitted. Actual Git and publication outcomes belong in the final execution report, not a fabricated release URL here.
