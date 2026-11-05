# Phase C: Settings sidebar corrective pass

Дата: 02.10.2026.

## Состояние и scope

- Branch: `feature/rc3-product-polish`.
- HEAD: `b53d8a171feb9e0f245127d7fb24d06f3baf008a`.
- Версия: `1.0.0-rc.2`, не менялась.
- ProductName: `NoteFlow`; identifier: `com.noteflow.desktop`.
- MSI mapping `0.99.2` не менялся.
- Только исправление взаимодействия MainSidebar collapse с Settings navigation.
- Принятые Phase C editor fixes, Rust/backend, persistence и настройки моделей в этом pass не изменялись.
- Commit/tag/push/stage не выполнялись. Phase D не начиналась.

## 1. Root cause

SettingsPage использует общие классы `.nav-i` и `.nav-sec`. Правила
`.collapse-sb .nav-i span` / `.collapse-sb .nav-sec` скрывали подписи и заголовок
не только MainSidebar, но и внутренней навигации Settings. Другие глобальные
collapse selectors центрировали `.nav-i` и задавали размеры icon-only rail.
Это превращало Settings navigation в почти пустую колонку и создавало впечатление
сохранённого expanded offset.

Геометрический сценарий до исправления воспроизвёл ошибку после первого collapse:
`All Settings navigation labels must remain visible`, actual `false`.

Причина не в hardcoded expanded margin-left и не в неправильном AppShell zoom.

## 2. Связь ширин и исправление

PageShell уже передаёт реальную ширину MainSidebar через `--page-sbw`:
74 physical px в collapsed state, пользовательскую ширину (250 px в QA) в expanded.
Grid использует `calc(var(--page-sbw) / var(--app-zoom, 1)) minmax(0, 1fr)`.
Settings находится в обычном flow внутри второй колонки.

Все MainSidebar collapse selectors в `app.css` и `pages.css` ограничены `.sb`.
Декларации MainSidebar не переписаны; Settings больше не наследует icon-only
поведение от родительского `.collapse-sb`.

Не добавлены отрицательные margins, absolute offsets, новые production width/zoom
calculations или дублирующие sidebar tokens. AppShell, MainSidebar, PageShell,
SettingsPage и settings.css не требовали изменений.

Live collapse/expand теперь автоматически перераспределяет пространство через
существующий grid. Settings navigation сохраняет 190 CSS px в wide layout;
существующая compact/narrow navigation и max-width форм сохранены.

## 3. Файлы этого corrective pass

Изменены production styles:

- `src/styles/app.css`: scope collapse selectors через `.sb`.
- `src/styles/pages.css`: scope collapse rail controls/profile selectors через `.sb`.

Добавлены:

- `tests/settingsSidebarLayout.test.ts`: настоящий SettingsPage в JSDOM, пять
  collapse/expand циклов, все шесть разделов, проверка видимости Settings labels
  и скрытия только MainSidebar labels.
- `scripts/qa/phase-c-settings-fixture.html`.
- `scripts/qa/phase-c-settings-fixture.tsx`: настоящий SettingsPage/PageShell/MainSidebar,
  безопасный mock IPC без пользовательских данных и network calls.
- `scripts/qa/phase-c-settings-geometry.mjs`: Playwright geometry regression.
- Этот отчёт.

Остальные изменения в рабочем дереве принадлежат ранее выполненному Phase C.
Четыре указанных пользователем локальных Phase B файла не редактировались,
не удалялись и не stage-ились.

## 4. Zoom и responsive geometry

Повторная, усиленная матрица: **24/24 PASS**.

Размеры: 1100x700, 1440x900, 1920x1080, 2560x1440.
Zoom: 100%, 125%, 160%. Темы: light/dark.
На каждое сочетание: пять live collapse/expand циклов; на первом collapse
переход по всем шести фактическим Settings sections:
Основные, Модели ИИ, Внешний вид, Данные и экспорт, Горячие клавиши, О приложении.

Проверены geometry assertions, не pixel-perfect snapshots:

- QA shell заполняет физическую ширину и высоту viewport при каждом zoom.
- Нет горизонтального overflow страницы (допуск 1 px).
- Settings labels и SettingsContent доступны.
- SettingsSidebar начинается после фактического MainSidebar и page padding.
- SettingsContent не перекрывает navigation.
- Wide gutter не превышает существующий design spacing.
- Wide SettingsSidebar не растягивается при collapse.
- Compact navigation остаётся над content.
- MainSidebar collapsed width остаётся 74 physical px, его labels скрыты.
- Смещение Settings соответствует освобождённой ширине MainSidebar.
- Нет browser page errors.

Settings navigation X в physical px:

| Zoom | Expanded | Collapsed | Смещение |
| --- | ---: | ---: | ---: |
| 100% | 290 | 114 | 176 |
| 125% | 300 | 124 | 176 |
| 160% | 314 | 138 | 176 |

QA fixture сначала имела неточное percentage sizing при CSS zoom. Это обнаружено
при просмотре скриншотов, исправлено только в fixture, затем матрица полностью
повторена с assertions на заполнение viewport. Production zoom не менялся.

Скриншоты вне repository:
`%TEMP%\noteflow-phase-c-settings-geometry`.

## 5. Native QA

`npm run tauri dev` выполнен с `NOTEFLOW_DEV_DATA_DIR`:
`%TEMP%\noteflow-phase-c-20261001`.
Пользовательский профиль/SQLite/credentials не использовались.

В настоящем максимизированном Tauri окне 1536x816:

- Settings -> Модели ИИ: пять полных collapse/expand циклов при 100%.
- Settings -> Модели ИИ: пять полных collapse/expand циклов при 160%.
- Без refresh/restart/navigation away для самих циклов.
- При collapsed MainSidebar и 160% открыты все шесть Settings sections.
- Подписи сохраняются, второй sidebar сдвигается, content не перекрывается.
- Zoom QA-профиля возвращён к 100%.
- Открыты Projects, Tags, Archive, RAG, Notes/editor со свёрнутым MainSidebar:
  basic navigation/layout smoke прошёл. Новые пользовательские данные не создавались.
- Иконки, active indicator, avatar и collapse/expand control основного rail видимы.
- App закрыт обычным системным крестиком; dev command завершился с exit 0.

Ограничения: native проверка выполнялась на доступном размере окна, а вся матрица
размеров/тем/zoom проверена в Edge/Playwright на реальных React компонентах.
Это не повтор полного пользовательского editor/AI smoke: принятые editor fixes
не изменялись и не подвергались новой destructive проверке.

При закрытии WebView вывел diagnostic `Failed to unregister class Chrome_WidgetWin_0`,
Windows error 1412. Закрытие завершилось, exit 0; это не ошибка CSS/layout tests.

## 6. Полные проверки

| Команда | Результат |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test` | PASS, 373/373, 62 suites, 0 skipped, 0 failed; 13.474 s |
| `npm run build` | PASS, Vite 4.48 s; chunk-size warning отсутствует |
| `cargo fmt --check` | PASS |
| `cargo check` | PASS |
| `cargo test` | PASS, 239 passed, 5 ignored, 0 failed; 19.83 s |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| `npm run tauri dev` | PASS, native QA выполнен |
| `npm run tauri build` | PASS, release compilation 1m45s, MSI/NSIS созданы |
| `git diff --check` | PASS |
| Усиленная Settings geometry matrix | PASS, 24 cases |

Lint script отсутствует. Ignored Rust tests не объявляются пройденными.
Git выводит предупреждения LF -> CRLF для файлов текущего рабочего дерева;
whitespace errors `git diff --check` не выявлены. Line-ending cleanup не выполнялся.

Созданы в target/release, без staging/publishing:

- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\nsis\NoteFlow_1.0.0-rc.2_x64-setup.exe`.
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.2_x64_ru-RU.msi`.
- `D:\Projects\NoteFlow\src-tauri\target\release\bundle\msi\NoteFlow_1.0.0-rc.2_x64_en-US.msi`.

## 7. Git status и verdict

Рабочее дерево остаётся незакоммиченным: 21 tracked modified и 19 untracked файлов
с учётом этого отчёта. Index пуст; HEAD и branch неизменны.
В общий diff входят прежние принятые Phase C editor changes; этот pass их не
откатывал и не дополнял. Только два CSS scope changes и regression QA/report.

**READY FOR USER PHASE C RE-SMOKE**

Commit/tag/push не выполнялись. Версия не менялась. Phase D не начиналась.
