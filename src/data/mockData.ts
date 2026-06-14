import type { ArchiveItem, ChatMessage, Note, ProjectCard, TagRow } from "../app/types";

export const mockNotes: Note[] = [
  {
    id: "architecture",
    title: "Архитектура проекта",
    summary: "Обзор структуры приложения, основные компоненты и их взаимодействие.",
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
    title: "Планирование спринта",
    summary: "Цели спринта, задачи, оценки и приоритеты команды.",
    dateLabel: "Вчера",
    noteDate: "2026-06-13",
    project: "NoteFlow",
    icon: "check",
    tags: [{ name: "планирование", color: "green" }],
    wordCount: 84,
  },
  {
    id: "research",
    title: "Исследование пользователей",
    summary: "Интервью, боли, инсайты и ключевые выводы.",
    dateLabel: "22 мая",
    noteDate: "2026-05-22",
    project: "Исследование рынка",
    icon: "person",
    tags: [{ name: "исследования", color: "purple" }],
    wordCount: 142,
  },
  {
    id: "ideas",
    title: "Идеи для улучшения",
    summary: "Список идей по улучшению продукта на основе фидбэка.",
    dateLabel: "20 мая",
    noteDate: "2026-05-20",
    project: "Исследование рынка",
    icon: "bulb",
    tags: [{ name: "идеи", color: "amber" }],
    wordCount: 73,
  },
  {
    id: "api",
    title: "Документация API",
    summary: "Эндпоинты, параметры, примеры запросов и ответов.",
    dateLabel: "18 мая",
    noteDate: "2026-05-18",
    project: "NoteFlow",
    icon: "code",
    tags: [{ name: "документация", color: "blue" }],
    wordCount: 211,
  },
  {
    id: "retro",
    title: "Ретроспектива команды",
    summary: "Что прошло хорошо, что можно улучшить, действия.",
    dateLabel: "15 мая",
    noteDate: "2026-05-15",
    project: "NoteFlow",
    icon: "person",
    tags: [{ name: "ретроспектива", color: "pink" }],
    wordCount: 95,
  },
  {
    id: "garden",
    title: "Заметки по саду",
    summary: "Ирисы бородатые — пересадка, деление корневищ, сроки.",
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
