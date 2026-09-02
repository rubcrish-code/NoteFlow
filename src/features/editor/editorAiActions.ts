import type { NoteAiActionId } from "../../services/noteAiService";

export interface EditorAiActionItem {
  id: NoteAiActionId;
  label: string;
}

export interface EditorAiActionGroup {
  id: string;
  items: EditorAiActionItem[];
}

export const EDITOR_AI_ACTION_GROUPS: readonly EditorAiActionGroup[] = [
  {
    id: "rewrite",
    items: [
      { id: "improve", label: "Улучшить текст" },
      { id: "fix", label: "Исправить ошибки" },
      { id: "shorten", label: "Сократить" },
      { id: "expand", label: "Расписать подробнее" },
    ],
  },
  {
    id: "transform",
    items: [
      { id: "tone", label: "Изменить тон" },
      { id: "tasks", label: "Сделать список задач" },
      { id: "translate", label: "Перевести" },
      { id: "explain", label: "Объяснить простыми словами" },
    ],
  },
];
