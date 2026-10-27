import type { EditorDocument, EditorNode, EditorMark } from "../../src/features/editor/markdownService";

const text = (value: string, ...marks: EditorMark[]): EditorNode => ({ type: "text", text: value, ...(marks.length ? { marks } : {}) });
const bold = (value: string) => text(value, { type: "bold" });
const italic = (value: string) => text(value, { type: "italic" });
const paragraph = (...content: EditorNode[]): EditorNode => ({ type: "paragraph", content });
const heading = (level: number, value: string): EditorNode => ({ type: "heading", attrs: { level }, content: [text(value)] });
const item = (label: string, rest: string): EditorNode => ({ type: "listItem", content: [paragraph(bold(label), text(rest))] });
const task = (checked: boolean, value: string): EditorNode => ({ type: "taskItem", attrs: { checked }, content: [paragraph(text(value))] });
const row = (values: EditorNode[], header = false): EditorNode => ({ type: "tableRow", content: values.map((value, column) => ({
  type: header ? "tableHeader" : "tableCell", attrs: { align: column === 1 ? "center" : "left" }, content: [paragraph(value)],
})) });

export const deadlineCode = 'function getDaysLeft(deadline) {\n  const diff = Date.parse(deadline) - Date.now();\n  return Math.floor(diff / (1000 * 60 * 60 * 24));\n}';

// Construct the editor model independently of the Markdown importer. The bold
// range includes the trailing space, as reproduced with the native mouse selection.
export function standardMarkdownUserDocument(): EditorDocument {
  return { type: "doc", content: [
    heading(1, "Как эффективно планировать свой день"),
    paragraph(text("В современном мире очень легко потерять фокус. Постоянные уведомления, бесконечные списки дел и внезапные задачи часто приводят к выгоранию. "), bold("Правильное планирование "), text("— это не про то, как делать "), italic("больше"), text(", а про то, как делать "), italic("главное"), text(".")),
    heading(2, "3 правила успешного тайм-менеджмента"),
    { type: "orderedList", attrs: { start: 1 }, content: [
      item("Приоритезация.", " Начинайте день с самой сложной и важной задачи."),
      item("Фокусировка.", " Отключайте уведомления на время глубокой работы."),
      item("Отдых.", " Делайте регулярные небольшие перерывы."),
    ] },
    heading(3, "Метод Помодоро (Pomodoro)"),
    { type: "blockquote", content: [paragraph(text("Суть метода проста: вы работаете "), bold("25 минут"), text(", а затем отдыхаете "), bold("5 минут"), text(". Каждые четыре цикла делайте длинный перерыв на "), italic("15–30 минут"), text("."))] },
    { type: "horizontalRule" },
    heading(2, "Чек-лист на сегодня"),
    { type: "taskList", content: [task(true, "Проверить рабочую почту"), task(false, "Написать черновик отчета"), task(false, "Провести созвон с командой (в 15:00)")] },
    { type: "horizontalRule" },
    heading(2, "Инструменты для работы"),
    paragraph(text("Для автоматизации рутины часто используют простые скрипты. Например, вот функция на "), text("JavaScript", { type: "code" }), text(" для подсчета оставшегося времени до дедлайна:")),
    { type: "codeBlock", attrs: { language: "javascript" }, content: [text(deadlineCode)] },
    heading(3, "Сравнение популярных приложений"),
    { type: "table", content: [
      row([text("Название"), text("Платформа"), text("Стоимость")], true),
      row([bold("Todoist"), text("Web, iOS, Android"), text("Бесплатно / Подписка")]),
      row([bold("Notion"), text("Web, Desktop, Mobile"), text("Бесплатно для личного пользования")]),
      row([bold("Obsidian"), text("Desktop, Mobile"), text("Бесплатно (хранение локально)")]),
    ] },
    paragraph(text("Подробнее о принципах продуктивности можно почитать в "), text("этой статье", { type: "link", attrs: { href: "https://example.com" } }), text(".")),
  ] };
}
