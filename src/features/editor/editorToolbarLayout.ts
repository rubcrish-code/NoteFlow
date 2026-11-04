import { translate } from "../../shared/i18n";
import type { IconName } from "../../shared/Icon";

export type EditorToolbarLayoutMode = "compact" | "narrow" | "wide";
export type EditorSurfaceLayoutMode = "compact" | "wide";

export type EditorToolbarActionId =
  | "ai"
  | "align-center"
  | "align-left"
  | "align-right"
  | "align-justify"
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
  | "note-link"
  | "fragment-link"
  | "ol"
  | "p"
  | "quote"
  | "redo"
  | "strike"
  | "sub"
  | "sup"
  | "task"
  | "table"
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
  { group: "history", id: "undo", get tip() { return translate("ui.0273b95e0ee7"); }, icon: "undo", priority: 100 },
  { group: "history", id: "redo", get tip() { return translate("ui.3a8599bd655f"); }, icon: "redo", priority: 76 },
  { group: "block", id: "h1", get tip() { return translate("ui.9b648fc3d4c9"); }, label: "H1", priority: 92 },
  { group: "block", id: "h2", get tip() { return translate("ui.92f86031cfe2"); }, label: "H2", priority: 75 },
  { group: "block", id: "h3", get tip() { return translate("ui.7d74ef06aff8"); }, label: "H3", priority: 74 },
  { group: "block", id: "p", get tip() { return translate("ui.7e3d6dafc9da"); }, label: "¶", priority: 98 },
  { group: "style", id: "font", get tip() { return translate("ui.9161c26f391b"); }, label: "Aa", priority: 97 },
  { group: "mark", id: "bold", get tip() { return translate("ui.409cfd9b8da2"); }, icon: "bold", priority: 96 },
  { group: "mark", id: "italic", get tip() { return translate("ui.4e6a593700e5"); }, icon: "italic", priority: 90 },
  { group: "mark", id: "underline", get tip() { return translate("ui.fe3296308f64"); }, icon: "underline", priority: 88 },
  { group: "mark", id: "strike", get tip() { return translate("ui.1502f9139139"); }, icon: "strike", priority: 64 },
  { group: "mark", id: "inline-code", get tip() { return translate("ui.2b9c82b346cb"); }, icon: "code", priority: 63 },
  { group: "mark", id: "highlight", get tip() { return translate("ui.0e6188e48389"); }, icon: "highlight", priority: 62 },
  { group: "mark", id: "color", get tip() { return translate("ui.d76a10ce552f"); }, icon: "color", priority: 61 },
  { group: "mark", id: "sup", get tip() { return translate("ui.f411eda8ee68"); }, icon: "sup", priority: 54 },
  { group: "mark", id: "sub", get tip() { return translate("ui.2ff9d2682f92"); }, icon: "sub", priority: 53 },
  { group: "list", id: "ul", get tip() { return translate("ui.0f692541444d"); }, icon: "ul", priority: 95 },
  { group: "list", id: "ol", get tip() { return translate("ui.0c9aa6652865"); }, icon: "ol", priority: 86 },
  { group: "list", id: "task", get tip() { return translate("ui.bf791e3daf9a"); }, icon: "task", priority: 84 },
  { group: "block", id: "quote", get tip() { return translate("ui.4880d7ed2105"); }, icon: "quote", priority: 60 },
  { group: "block", id: "code-block", get tip() { return translate("ui.d4fe8c09649e"); }, icon: "codeBlock", priority: 58 },
  { group: "alignment", id: "align-left", get tip() { return translate("ui.d4e4ed0ba1f8"); }, icon: "alignLeft", priority: 57 },
  { group: "alignment", id: "align-center", get tip() { return translate("ui.93f3d6b8dc12"); }, icon: "alignCenter", priority: 56 },
  { group: "alignment", id: "align-right", get tip() { return translate("ui.73173c8ac456"); }, icon: "alignRight", priority: 55 },
  { group: "alignment", id: "align-justify", get tip() { return translate("ui.286067e3109c"); }, icon: "alignJustify", priority: 55 },
  { group: "insert", id: "link", get tip() { return translate("ui.4c34086988aa"); }, icon: "link", priority: 59 },
  { group: "insert", id: "table", get tip() { return translate("ui.b7f18dd0a994"); }, icon: "table", priority: 59 },
  { group: "insert", id: "note-link", get tip() { return translate("ui.33b49d4149c0"); }, icon: "noteLink", priority: 94 },
  { group: "insert", id: "fragment-link", get tip() { return translate("ui.b2352ddb98f5"); }, icon: "copy", priority: 91 },
  { group: "style", id: "clear", get tip() { return translate("ui.f0a342064853"); }, icon: "clear", priority: 52 },
  { group: "ai", id: "ai", get tip() { return translate("ui.66a1be70103c"); }, label: "AI", priority: 99 },
];

export const EDITOR_TOOLBAR_COMPACT_BREAKPOINT = 1130;
export const EDITOR_TOOLBAR_NARROW_BREAKPOINT = 1000;
// 31 targets at 24px, 14 group dividers at 3px, and 16px outer padding.
// Kept slightly above the measured minimum to leave focus outlines unobstructed.
export const EDITOR_TOOLBAR_MIN_WIDTH = 820;
export const EDITOR_SURFACE_COMPACT_BREAKPOINT = 560;

export function resolveEditorToolbarActions(
  _availableWidth: number,
  actions: readonly EditorToolbarAction[] = EDITOR_TOOLBAR_ACTIONS,
  _mode?: EditorToolbarLayoutMode,
): EditorToolbarActionLayout {
  return { overflowActions: [], visibleActions: [...actions] };
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
