import type { ArchiveItem, ChatMessage, Note, ProjectCard, TagRow } from "../app/types";
import { markdownToTiptapDoc, tiptapJsonToHtml, tiptapJsonToMarkdown, tiptapJsonToPlainText } from "../features/editor/markdownService";
import { createNotePreview } from "../features/notes/notePreview";

export function createEditorStateFromMarkdown(markdown: string) {
  const editorDocument = markdownToTiptapDoc(markdown);
  return {
    contentHtml: tiptapJsonToHtml(editorDocument),
    contentMarkdown: tiptapJsonToMarkdown(editorDocument),
    editorDocument,
    plainText: tiptapJsonToPlainText(editorDocument),
  };
}

const architectureMarkdown = `Обзор структуры приложения NoteFlow, ключевых модулей и принципов взаимодействия между ними. ==Выделите любой текст==, чтобы проверить визуальное поведение редактора, или используйте панель сверху.

## 1. Общая структура

Приложение построено по модульному принципу с разделением на клиентскую часть, локальный бэкенд и слой хранения данных. Такой подход обеспечивает скорость, приватность и работу офлайн.

## 2. Ключевые модули

- **Редактор заметок** — будущий быстрый Markdown с WYSIWYG-представлением.
- **База знаний** — организация заметок в проекты и связи.
- **ИИ-ассистент** — правка текста, чат по заметке и чат по базе.
- **Поиск** — полнотекстовый поиск и фильтрация.

## 3. Принципы

- [x] Скорость и плавность интерфейса
- [x] Локальное хранение и приватность
- [ ] Минималистичный, мягкий дизайн

> Хорошая заметка — та, которую легко записать и легко найти.

\`\`\`ts
const note = { title: "NoteFlow", local: true };
\`\`\``;

const defaultNoteMarkdown = `Эта демонстрационная заметка показывает выбранный элемент списка. На этом этапе NoteFlow хранит такие данные только в памяти и использует их для проверки редактора, навигации и поиска.

## Рабочий контекст

- Заголовок и тело можно редактировать в TipTap.
- Лента форматирования теперь выполняет реальные команды.
- Реальное сохранение в SQLite появится на следующем этапе данных.`;

export const mockNotes: Note[] = [
  {
    id: "architecture",
    ...createEditorStateFromMarkdown(architectureMarkdown),
    title: "Архитектура проекта",
    summary: createNotePreview(tiptapJsonToPlainText(markdownToTiptapDoc(architectureMarkdown))),
    dateLabel: "10:24",
    noteDate: "2026-06-14",
    project: "NoteFlow",
    pinned: true,
    icon: "doc",
    tags: [
      { name: "проект", color: "blue" },
      { name: "архитектура", color: "purple" },
      { name: "документация", color: "blue" },
    ],
    wordCount: 126,
  },
  {
    id: "sprint",
    ...createEditorStateFromMarkdown(`${defaultNoteMarkdown}\n\n1. Уточнить критерии готовности\n2. Проверить риски\n3. Подготовить демо`),
    title: "Планирование спринта",
    summary: createNotePreview(tiptapJsonToPlainText(markdownToTiptapDoc(`${defaultNoteMarkdown}\n\n1. Уточнить критерии готовности\n2. Проверить риски\n3. Подготовить демо`))),
    dateLabel: "Вчера",
    noteDate: "2026-06-13",
    project: "NoteFlow",
    icon: "check",
    tags: [{ name: "планирование", color: "green" }],
    wordCount: 84,
  },
  {
    id: "research",
    ...createEditorStateFromMarkdown(`${defaultNoteMarkdown}\n\n| Сегмент | Боль |\n| --- | --- |\n| Исследователи | Сложно быстро находить старые выводы |\n| Команды | Заметки разбросаны по инструментам |`),
    title: "Исследование пользователей",
    summary: createNotePreview(tiptapJsonToPlainText(markdownToTiptapDoc(`${defaultNoteMarkdown}\n\n| Сегмент | Боль |\n| --- | --- |\n| Исследователи | Сложно быстро находить старые выводы |\n| Команды | Заметки разбросаны по инструментам |`))),
    dateLabel: "22 мая",
    noteDate: "2026-05-22",
    project: "Исследование рынка",
    icon: "person",
    tags: [{ name: "исследования", color: "purple" }],
    wordCount: 142,
  },
  {
    id: "ideas",
    ...createEditorStateFromMarkdown(defaultNoteMarkdown),
    title: "Идеи для улучшения",
    summary: createNotePreview(tiptapJsonToPlainText(markdownToTiptapDoc(defaultNoteMarkdown))),
    dateLabel: "20 мая",
    noteDate: "2026-05-20",
    project: "Исследование рынка",
    icon: "bulb",
    tags: [{ name: "идеи", color: "amber" }],
    wordCount: 73,
  },
  {
    id: "api",
    ...createEditorStateFromMarkdown(`${defaultNoteMarkdown}\n\n\`\`\`http\nGET /notes?query=markdown\n\`\`\``),
    title: "Документация API",
    summary: createNotePreview(tiptapJsonToPlainText(markdownToTiptapDoc(`${defaultNoteMarkdown}\n\n\`\`\`http\nGET /notes?query=markdown\n\`\`\``))),
    dateLabel: "18 мая",
    noteDate: "2026-05-18",
    project: "NoteFlow",
    icon: "code",
    tags: [{ name: "документация", color: "blue" }],
    wordCount: 211,
  },
  {
    id: "retro",
    ...createEditorStateFromMarkdown(defaultNoteMarkdown),
    title: "Ретроспектива команды",
    summary: createNotePreview(tiptapJsonToPlainText(markdownToTiptapDoc(defaultNoteMarkdown))),
    dateLabel: "15 мая",
    noteDate: "2026-05-15",
    project: "NoteFlow",
    icon: "person",
    tags: [{ name: "ретроспектива", color: "pink" }],
    wordCount: 95,
  },
  {
    id: "garden",
    ...createEditorStateFromMarkdown(`${defaultNoteMarkdown}\n\n> Ирисы лучше делить после цветения, когда корневища видно и проще оценить состояние.`),
    title: "Заметки по саду",
    summary: createNotePreview(tiptapJsonToPlainText(markdownToTiptapDoc(`${defaultNoteMarkdown}\n\n> Ирисы лучше делить после цветения, когда корневища видно и проще оценить состояние.`))),
    dateLabel: "12 мая",
    noteDate: "2026-05-12",
    project: "Личные заметки",
    icon: "bulb",
    tags: [{ name: "личное", color: "green" }],
    wordCount: 67,
  },
];

export const mockProjects: ProjectCard[] = [
  {
    id: "noteflow",
    title: "NoteFlow",
    description: "Приложение для заметок и базы знаний",
    notes: 24,
    tasks: 12,
    files: 8,
  },
  {
    id: "market",
    title: "Исследование рынка",
    description: "Конкуренты, пользователи и идеи развития",
    notes: 11,
    tasks: 5,
    files: 3,
  },
  {
    id: "personal",
    title: "Личные заметки",
    description: "Идеи, обучение и личные планы",
    notes: 18,
    tasks: 4,
  },
];

export const mockTags: TagRow[] = [
  { id: "project", name: "проект", count: 28, color: "blue" },
  { id: "architecture", name: "архитектура", count: 14, color: "purple" },
  { id: "docs", name: "документация", count: 19, color: "green" },
  { id: "ideas", name: "идеи", count: 11, color: "amber" },
  { id: "personal", name: "личное", count: 7, color: "pink" },
];

export const mockArchive: ArchiveItem[] = [
  { id: "launch-v2", title: "План запуска версии 2.0", archivedAt: "Архивировано 25 мая", kind: "Заметка" },
  { id: "market-q1", title: "Исследование рынка Q1", archivedAt: "Архивировано 18 мая", kind: "Заметка" },
  { id: "old-redesign", title: "Старый проект редизайна", archivedAt: "Архивировано 10 мая", kind: "Проект" },
];

export const noteChatSeed: ChatMessage[] = [
  { id: "u-1", role: "user", text: "Сделай краткое саммари этой заметки." },
  {
    id: "a-1",
    role: "assistant",
    text: "Заметка описывает архитектуру NoteFlow: модульная структура, локальный бэкенд и слой хранения. Ключевое — скорость, приватность и офлайн-работа.",
  },
];

export const ragHistory = ["Что я писал про RAG?", "Связи: сад и заметки", "Дедлайны Q3", "Идеи для речи"];
