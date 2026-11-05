import { translate } from "./i18n";
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
  { id: "newNote", key: "n", localizedKey: "т", keys: ["Ctrl", "N"], get label() { return translate("ui.6c929f117cf6"); } },
  { id: "search", key: "k", localizedKey: "л", keys: ["Ctrl", "K"], get label() { return translate("ui.5027ce55f494"); } },
  { id: "sidebar", key: "b", localizedKey: "и", keys: ["Ctrl", "B"], get label() { return translate("ui.dc5a9e15bb26"); } },
  { id: "focus", key: "\\", keys: ["Ctrl", "\\"], get label() { return translate("ui.92b9fcc46d13"); } },
];

export const EDITOR_SHORTCUTS: readonly ShortcutReference[] = [
  { id: "bold", keys: ["Ctrl", "B"], get label() { return translate("ui.00a3cbfbbccb"); } },
  { id: "italic", keys: ["Ctrl", "I"], get label() { return translate("ui.c05eb6bbb430"); } },
  { id: "underline", keys: ["Ctrl", "U"], get label() { return translate("ui.5cca865d2a07"); } },
  { id: "undo", keys: ["Ctrl", "Z"], get label() { return translate("ui.7c47f7292ba4"); } },
  { id: "redo", keys: ["Ctrl", "Y"], get label() { return translate("ui.5189135a6110"); } },
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
