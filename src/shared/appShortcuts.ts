export type AppShortcutId = "focus" | "newNote" | "search" | "sidebar";

export interface ShortcutReference {
  id: string;
  keys: readonly string[];
  label: string;
}

interface RegisteredAppShortcut extends ShortcutReference {
  id: AppShortcutId;
  key: string;
  localizedKey?: string;
}

export const APP_SHORTCUTS: readonly RegisteredAppShortcut[] = [
  { id: "newNote", key: "n", localizedKey: "т", keys: ["Ctrl", "N"], label: "Создать заметку" },
  { id: "search", key: "k", localizedKey: "л", keys: ["Ctrl", "K"], label: "Перейти к поиску" },
  { id: "sidebar", key: "b", localizedKey: "и", keys: ["Ctrl", "B"], label: "Свернуть или развернуть сайдбар" },
  { id: "focus", key: "\\", keys: ["Ctrl", "\\"], label: "Режим фокуса" },
];

export const EDITOR_SHORTCUTS: readonly ShortcutReference[] = [
  { id: "bold", keys: ["Ctrl", "B"], label: "Жирный" },
  { id: "italic", keys: ["Ctrl", "I"], label: "Курсив" },
  { id: "underline", keys: ["Ctrl", "U"], label: "Подчёркнутый" },
  { id: "undo", keys: ["Ctrl", "Z"], label: "Отменить" },
  { id: "redo", keys: ["Ctrl", "Y"], label: "Повторить" },
];

export function matchesAppShortcut(event: KeyboardEvent, shortcutId: AppShortcutId) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return false;
  }
  const shortcut = APP_SHORTCUTS.find((item) => item.id === shortcutId);
  if (!shortcut) {
    return false;
  }
  const key = event.key.toLocaleLowerCase("ru-RU");
  return key === shortcut.key || key === shortcut.localizedKey;
}
