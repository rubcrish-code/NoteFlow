import { APP_ZOOM_DEFAULT, normalizeAppZoom } from "./appZoom";

export type PageLayoutMode = "compact" | "tight" | "wide";

export const PAGE_COMPACT_BREAKPOINT = 720;
export const PAGE_TIGHT_BREAKPOINT = 520;
export const MIN_EDITOR_WITH_CHAT_WIDTH = 420;

export function toPhysicalLayoutPixels(cssPixels: number, zoomPercent: number) {
  if (!Number.isFinite(cssPixels)) {
    return cssPixels;
  }

  return cssPixels * (normalizeAppZoom(zoomPercent) / APP_ZOOM_DEFAULT);
}

export function getPageLayoutMode(physicalWidth: number): PageLayoutMode {
  if (physicalWidth <= PAGE_TIGHT_BREAKPOINT) {
    return "tight";
  }
  if (physicalWidth <= PAGE_COMPACT_BREAKPOINT) {
    return "compact";
  }
  return "wide";
}

interface NoteWorkspaceLayoutInput {
  chatOpen: boolean;
  chatWidth: number;
  listWidth: number;
  physicalWidth: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
}

export function shouldTemporarilyHideNoteList({
  chatOpen,
  chatWidth,
  listWidth,
  physicalWidth,
  sidebarCollapsed,
  sidebarWidth,
}: NoteWorkspaceLayoutInput) {
  if (!chatOpen || !Number.isFinite(physicalWidth)) {
    return false;
  }

  const effectiveSidebarWidth = sidebarCollapsed ? 74 : sidebarWidth;
  return physicalWidth < effectiveSidebarWidth + listWidth + chatWidth + MIN_EDITOR_WITH_CHAT_WIDTH;
}
