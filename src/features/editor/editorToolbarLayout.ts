import type { IconName } from "../../shared/Icon";

export type EditorToolbarLayoutMode = "compact" | "narrow" | "wide";
export type EditorSurfaceLayoutMode = "compact" | "wide";

export type EditorToolbarActionId =
  | "ai"
  | "align-center"
  | "align-left"
  | "align-right"
  | "bold"
  | "clear"
  | "code-block"
  | "color"
  | "font"
  | "h1"
  | "h2"
  | "h3"
  | "highlight"
  | "inline-code"
  | "italic"
  | "link"
  | "ol"
  | "p"
  | "quote"
  | "redo"
  | "strike"
  | "sub"
  | "sup"
  | "task"
  | "ul"
  | "underline"
  | "undo";

export type EditorToolbarActionGroup = "ai" | "alignment" | "block" | "history" | "insert" | "list" | "mark" | "style";

export interface EditorToolbarAction {
  group: EditorToolbarActionGroup;
  icon?: IconName;
  id: EditorToolbarActionId;
  label?: string;
  priority: number;
  tip: string;
}

export interface EditorToolbarActionLayout {
  overflowActions: EditorToolbarAction[];
  visibleActions: EditorToolbarAction[];
}

export const EDITOR_TOOLBAR_ACTIONS: readonly EditorToolbarAction[] = [
  { group: "history", id: "undo", tip: "Отменить (Ctrl+Z)", icon: "undo", priority: 100 },
  { group: "history", id: "redo", tip: "Повторить (Ctrl+Y)", icon: "redo", priority: 76 },
  { group: "block", id: "h1", tip: "Заголовок 1", label: "H1", priority: 92 },
  { group: "block", id: "h2", tip: "Заголовок 2", label: "H2", priority: 75 },
  { group: "block", id: "h3", tip: "Заголовок 3", label: "H3", priority: 74 },
  { group: "block", id: "p", tip: "Обычный текст", label: "¶", priority: 98 },
  { group: "style", id: "font", tip: "Шрифт и размер", label: "Aa", priority: 97 },
  { group: "mark", id: "bold", tip: "Жирный (Ctrl+B)", icon: "bold", priority: 96 },
  { group: "mark", id: "italic", tip: "Курсив (Ctrl+I)", icon: "italic", priority: 90 },
  { group: "mark", id: "underline", tip: "Подчёркнутый (Ctrl+U)", icon: "underline", priority: 88 },
  { group: "mark", id: "strike", tip: "Зачёркнутый", icon: "strike", priority: 64 },
  { group: "mark", id: "inline-code", tip: "Моноширинный код", icon: "code", priority: 63 },
  { group: "mark", id: "highlight", tip: "Выделение", icon: "highlight", priority: 62 },
  { group: "mark", id: "color", tip: "Цвет текста", icon: "color", priority: 61 },
  { group: "mark", id: "sup", tip: "Надстрочный", icon: "sup", priority: 54 },
  { group: "mark", id: "sub", tip: "Подстрочный", icon: "sub", priority: 53 },
  { group: "list", id: "ul", tip: "Маркированный список", icon: "ul", priority: 95 },
  { group: "list", id: "ol", tip: "Нумерованный список", icon: "ol", priority: 86 },
  { group: "list", id: "task", tip: "Чек-лист", icon: "task", priority: 84 },
  { group: "block", id: "quote", tip: "Цитата", icon: "quote", priority: 60 },
  { group: "block", id: "code-block", tip: "Блок кода", icon: "codeBlock", priority: 58 },
  { group: "alignment", id: "align-left", tip: "По левому краю", icon: "alignLeft", priority: 57 },
  { group: "alignment", id: "align-center", tip: "По центру", icon: "alignCenter", priority: 56 },
  { group: "alignment", id: "align-right", tip: "По правому краю", icon: "alignRight", priority: 55 },
  { group: "insert", id: "link", tip: "Ссылка", icon: "link", priority: 59 },
  { group: "style", id: "clear", tip: "Очистить форматирование", icon: "clear", priority: 52 },
  { group: "ai", id: "ai", tip: "ИИ-помощник", label: "AI", priority: 99 },
];

export const EDITOR_TOOLBAR_COMPACT_BREAKPOINT = 980;
export const EDITOR_TOOLBAR_NARROW_BREAKPOINT = 560;
export const EDITOR_SURFACE_COMPACT_BREAKPOINT = 560;

const TOOLBAR_GAP = 1;
const TOOLBAR_LAYOUT_SAFETY_WIDTH = 8;

function orderedActions(actions: readonly EditorToolbarAction[], selectedIds: ReadonlySet<EditorToolbarActionId>) {
  return actions.filter((action) => selectedIds.has(action.id));
}

function estimateToolbarWidth(actions: readonly EditorToolbarAction[], includesOverflow: boolean, mode: EditorToolbarLayoutMode) {
  const groupSeparators = actions.reduce((count, action, index) => {
    const nextAction = actions[index + 1];
    return count + (nextAction && nextAction.group !== action.group ? 1 : 0);
  }, 0);
  const itemCount = actions.length + (includesOverflow ? 1 : 0);
  const gaps = Math.max(0, itemCount - 1);

  const narrow = mode === "narrow";
  return (narrow ? 16 : 24)
    + actions.length * (narrow ? 29 : 30)
    + gaps * TOOLBAR_GAP
    + groupSeparators * (narrow ? 5 : 7)
    + (includesOverflow ? 30 : 0)
    + TOOLBAR_LAYOUT_SAFETY_WIDTH;
}

export function resolveEditorToolbarActions(
  availableWidth: number,
  actions: readonly EditorToolbarAction[] = EDITOR_TOOLBAR_ACTIONS,
  mode: EditorToolbarLayoutMode = getEditorToolbarLayoutMode(availableWidth),
): EditorToolbarActionLayout {
  const safeWidth = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : EDITOR_TOOLBAR_NARROW_BREAKPOINT;
  const allActions = [...actions];
  if (estimateToolbarWidth(allActions, false, mode) <= safeWidth) {
    return { overflowActions: [], visibleActions: allActions };
  }

  const selectedIds = new Set<EditorToolbarActionId>();
  const candidates = allActions
    .map((action, sourceIndex) => ({ action, sourceIndex }))
    .sort((left, right) => right.action.priority - left.action.priority || left.sourceIndex - right.sourceIndex);

  for (const { action } of candidates) {
    const candidateIds = new Set(selectedIds);
    candidateIds.add(action.id);
    if (estimateToolbarWidth(orderedActions(allActions, candidateIds), true, mode) <= safeWidth) {
      selectedIds.add(action.id);
    }
  }

  return {
    overflowActions: allActions.filter((action) => !selectedIds.has(action.id)),
    visibleActions: orderedActions(allActions, selectedIds),
  };
}

export function getEditorToolbarLayoutMode(physicalWidth: number): EditorToolbarLayoutMode {
  if (physicalWidth <= EDITOR_TOOLBAR_NARROW_BREAKPOINT) {
    return "narrow";
  }
  if (physicalWidth <= EDITOR_TOOLBAR_COMPACT_BREAKPOINT) {
    return "compact";
  }
  return "wide";
}

export function getEditorSurfaceLayoutMode(physicalWidth: number): EditorSurfaceLayoutMode {
  return physicalWidth <= EDITOR_SURFACE_COMPACT_BREAKPOINT ? "compact" : "wide";
}
