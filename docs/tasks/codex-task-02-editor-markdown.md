# NoteFlow — задача 2. Настоящий редактор и Markdown

Начинать только после завершения задачи 1. Перед началом прочитай `AGENTS.md`, актуальный HTML-макет и `product-spec.md`. Git commit не выполняй.

## Цель

Подключить TipTap/ProseMirror, сделать рабочими кнопки панели форматирования и реализовать автоматическое распознавание Markdown при вставке.

## Требования

1. **TipTap**
   - React + TypeScript strict;
   - без `any` и `document.execCommand`;
   - сохранить текущий дизайн;
   - toolbar только над заметкой;
   - без плавающей панели;
   - данные пока в in-memory state;
   - SQLite не подключать.

2. **Рабочие команды toolbar**
   - undo/redo;
   - H1/H2/H3/абзац;
   - bold, italic, underline, strike;
   - inline code;
   - highlight и цвет текста;
   - superscript/subscript;
   - маркированный, нумерованный и task list;
   - quote, code block, table, horizontal rule;
   - align left/center/right;
   - link, image URL, clear formatting.

   Active-состояния должны отражать реальное состояние редактора. Недоступные команды — disabled.

3. **Параметрические действия**
   - ссылка: URL и текст;
   - изображение: URL;
   - таблица: строки и столбцы;
   - цвет текста и выделения: палитра + HEX.

4. **Отложенные кнопки**
   - вложение, упоминание, AI, формула, дата;
   - не имитировать фальшивую работу;
   - показывать toast о будущем этапе.

5. **Автоматическое распознавание Markdown при вставке**
   - читать `text/plain` из clipboard;
   - определять, похож ли текст на Markdown;
   - Markdown вставлять как структурированный WYSIWYG-документ;
   - обычный текст вставлять как обычный текст;
   - не требовать отдельной кнопки;
   - не показывать исходные маркеры `#`, `**`, `-`, тройные обратные кавычки как обычный текст.

   Минимально поддержать: H1–H3, bold/italic/strike, списки, task list, quote, inline code, fenced code block, links, horizontal rule, tables.

6. **Markdown service**
   - получить TipTap JSON;
   - получить HTML;
   - сериализовать в Markdown;
   - загрузить Markdown обратно;
   - проверить цикл `Markdown → Editor → Markdown`.

7. **Автосохранение в UI-state**
   - debounce;
   - статус «Сохранение…» → «Сохранено»;
   - без записи на диск.

8. **Совместимость**
   - toolbar работает в обычном и focus mode;
   - чат сдвигает редактор;
   - resize не ломает редактор;
   - таблицы/code block не ломают layout;
   - тёмная тема корректна.

## Тесты

Добавить минимальные unit-тесты для определения Markdown, Markdown → editor, editor → Markdown, обычного текста, одного дефиса, URL, списка, таблицы, fenced code block и смешанного Markdown.

## Проверки

```bash
npm run build
npm run tauri dev
```

В конце сообщи: установленные TipTap-пакеты, работающие и отложенные кнопки, реализацию Markdown-вставки, расположение serializer, результаты тестов/build/tauri dev, ограничения и изменённые файлы.
