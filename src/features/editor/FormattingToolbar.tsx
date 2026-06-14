import { useState } from "react";
import { Icon, type IconName } from "../../shared/Icon";

interface ToolbarTool {
  id: string;
  tip: string;
  icon?: IconName;
  label?: string;
  groupAfter?: boolean;
}

const toolbarTools: ToolbarTool[] = [
  { id: "undo", tip: "Отменить (Ctrl+Z)", icon: "undo" },
  { id: "redo", tip: "Повторить (Ctrl+Y)", icon: "redo", groupAfter: true },
  { id: "h1", tip: "Заголовок 1", label: "H1" },
  { id: "h2", tip: "Заголовок 2", label: "H2" },
  { id: "h3", tip: "Заголовок 3", label: "H3" },
  { id: "p", tip: "Обычный текст", label: "¶", groupAfter: true },
  { id: "bold", tip: "Жирный (Ctrl+B)", icon: "bold" },
  { id: "italic", tip: "Курсив (Ctrl+I)", icon: "italic" },
  { id: "underline", tip: "Подчёркнутый (Ctrl+U)", icon: "underline" },
  { id: "strike", tip: "Зачёркнутый", icon: "strike" },
  { id: "inline-code", tip: "Моноширинный код", icon: "code" },
  { id: "highlight", tip: "Выделение", icon: "highlight" },
  { id: "color", tip: "Цвет текста", icon: "color" },
  { id: "sup", tip: "Надстрочный", icon: "sup" },
  { id: "sub", tip: "Подстрочный", icon: "sub", groupAfter: true },
  { id: "ul", tip: "Маркированный список", icon: "ul" },
  { id: "ol", tip: "Нумерованный список", icon: "ol" },
  { id: "task", tip: "Чек-лист", icon: "task" },
  { id: "quote", tip: "Цитата", icon: "quote" },
  { id: "code-block", tip: "Блок кода", icon: "codeBlock" },
  { id: "callout", tip: "Выноска", icon: "callout" },
  { id: "toggle", tip: "Сворачиваемый блок", icon: "toggle" },
  { id: "table", tip: "Таблица", icon: "table" },
  { id: "divider", tip: "Разделитель", icon: "divider", groupAfter: true },
  { id: "align-left", tip: "По левому краю", icon: "alignLeft" },
  { id: "align-center", tip: "По центру", icon: "alignCenter" },
  { id: "align-right", tip: "По правому краю", icon: "alignRight", groupAfter: true },
  { id: "link", tip: "Ссылка", icon: "link" },
  { id: "note-link", tip: "Ссылка на заметку [[ ]]", icon: "noteLink" },
  { id: "image", tip: "Изображение", icon: "image" },
  { id: "attach", tip: "Файл", icon: "attach" },
  { id: "mention", tip: "Упоминание @", icon: "mention" },
  { id: "date", tip: "Дата", icon: "date" },
  { id: "formula", tip: "Формула", icon: "formula", groupAfter: true },
  { id: "clear", tip: "Очистить форматирование", icon: "clear" },
  { id: "ai", tip: "ИИ-помощник", label: "AI" },
];

export function FormattingToolbar() {
  const [activeToolId, setActiveToolId] = useState("p");

  return (
    <div aria-label="Лента форматирования" className="toolbar" role="toolbar">
      {toolbarTools.map((tool) => (
        <span className="toolbar-slot" key={tool.id}>
          <button
            aria-label={tool.tip}
            className={`tb ${activeToolId === tool.id ? "active" : ""} ${tool.id === "ai" ? "ai" : ""}`}
            data-tooltip={tool.tip}
            onClick={() => setActiveToolId(tool.id)}
            type="button"
          >
            {tool.icon ? <Icon name={tool.icon} /> : <span className="lbl">{tool.label}</span>}
          </button>
          {tool.groupAfter ? <span className="tb-sep" /> : null}
        </span>
      ))}
    </div>
  );
}
