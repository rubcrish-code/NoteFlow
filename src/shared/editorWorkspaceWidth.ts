import { EDITOR_TOOLBAR_MIN_WIDTH } from "../features/editor/editorToolbarLayout";

export interface EditorWorkspaceWidths {
  sidebarWidth: number;
  listWidth: number;
  chatWidth: number;
  sidebarCollapsed: boolean;
  chatOpen: boolean;
  focus: boolean;
  zoomPercent: number;
}

export function minimumEditorWindowWidth(layout: EditorWorkspaceWidths) {
  return Math.ceil(EDITOR_TOOLBAR_MIN_WIDTH * layout.zoomPercent / 100
    + (layout.focus ? 0 : (layout.sidebarCollapsed ? 74 : 190) + 260 + (layout.chatOpen ? 300 : 0)));
}

export function minimumCompactEditorWindowWidth(layout: EditorWorkspaceWidths) {
  return Math.ceil(EDITOR_TOOLBAR_MIN_WIDTH * layout.zoomPercent / 100
    + (layout.focus ? 0 : 74 + (layout.chatOpen ? 300 : 0)));
}

// User preferences remain stored unchanged when a smaller window temporarily
// needs narrower panels. No panel is closed to make room for the toolbar.
export function fitEditorWorkspaceWidths(layout: EditorWorkspaceWidths, viewportWidth: number) {
  const widths = { sidebarWidth: layout.sidebarCollapsed ? 74 : layout.sidebarWidth, listWidth: layout.listWidth, chatWidth: layout.chatOpen ? layout.chatWidth : 0 };
  if (layout.focus) return { sidebarWidth: 0, listWidth: 0, chatWidth: 0 };
  let deficit = widths.sidebarWidth + widths.listWidth + widths.chatWidth + EDITOR_TOOLBAR_MIN_WIDTH * layout.zoomPercent / 100 - viewportWidth;
  for (const [key, minimum] of [["listWidth", 260], ["chatWidth", layout.chatOpen ? 300 : 0], ["sidebarWidth", layout.sidebarCollapsed ? 74 : 190]] as const) {
    const reduction = Math.min(Math.max(0, deficit), Math.max(0, widths[key] - minimum));
    widths[key] -= reduction; deficit -= reduction;
  }
  return widths;
}

// Compact presentation is temporary: it never overwrites the user's panel sizes.
// The editor stays mounted, and the chat keeps the same conversation subtree.
export function resolveEditorWorkspacePresentation(layout: EditorWorkspaceWidths, viewportWidth: number) {
  const ribbon = EDITOR_TOOLBAR_MIN_WIDTH * layout.zoomPercent / 100;
  const widths = fitEditorWorkspaceWidths(layout, viewportWidth);
  let sidebarCollapsed = layout.sidebarCollapsed;
  let hideList = false;
  if (!layout.focus && widths.sidebarWidth + widths.listWidth + widths.chatWidth + ribbon > viewportWidth) {
    widths.listWidth = 0;
    hideList = true;
    widths.sidebarWidth = layout.sidebarCollapsed ? 74 : 190;
    const fitChat = () => layout.chatOpen ? Math.min(layout.chatWidth, Math.max(300, viewportWidth - ribbon - widths.sidebarWidth)) : 0;
    widths.chatWidth = fitChat();
    if (widths.sidebarWidth + widths.chatWidth + ribbon > viewportWidth) {
      widths.sidebarWidth = 74;
      sidebarCollapsed = true;
      widths.chatWidth = fitChat();
    }
    if (!sidebarCollapsed) widths.sidebarWidth = Math.min(layout.sidebarWidth, Math.max(190, viewportWidth - ribbon - widths.chatWidth));
  }
  return { widths, sidebarCollapsed, hideList,
    ribbonFits: viewportWidth >= ribbon + widths.sidebarWidth + widths.listWidth + widths.chatWidth };
}
