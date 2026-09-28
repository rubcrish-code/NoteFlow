export type RagLayoutMode = "compact" | "narrow" | "tight" | "wide";

export const RAG_COMPACT_BREAKPOINT = 1040;
export const RAG_NARROW_BREAKPOINT = 720;
export const RAG_TIGHT_BREAKPOINT = 560;
export const RAG_MIN_CHAT_WIDTH = 440;

interface RagPanelWidths {
  conversationWidth: number;
  sourcesWidth: number;
  sourcesCollapsed: boolean;
}

export function getRagLayoutMode(containerWidth: number, panels: RagPanelWidths = {
  conversationWidth: 280,
  sourcesWidth: 320,
  sourcesCollapsed: false,
}): RagLayoutMode {
  if (containerWidth <= RAG_TIGHT_BREAKPOINT) {
    return "tight";
  }
  if (containerWidth <= RAG_NARROW_BREAKPOINT) {
    return "narrow";
  }
  const wideMinimum = Math.max(
    RAG_COMPACT_BREAKPOINT,
    panels.conversationWidth + (panels.sourcesCollapsed ? 0 : panels.sourcesWidth) + RAG_MIN_CHAT_WIDTH,
  );
  if (containerWidth <= wideMinimum) {
    return "compact";
  }
  return "wide";
}

export function isRagHistoryOverlayMode(layoutMode: RagLayoutMode) {
  return layoutMode !== "wide";
}

interface RagPanelVisibilityInput {
  historyOverlayOpen: boolean;
  layoutMode: RagLayoutMode;
  preferredHistoryCollapsed: boolean;
  preferredSourcesCollapsed: boolean;
  sourcesOverlayOpen: boolean;
}

export interface RagPanelVisibility {
  historyIsOverlay: boolean;
  historyVisible: boolean;
  sourcesIsOverlay: boolean;
  sourcesVisible: boolean;
}

export function resolveRagPanelVisibility({
  historyOverlayOpen,
  layoutMode,
  preferredHistoryCollapsed,
  preferredSourcesCollapsed,
  sourcesOverlayOpen,
}: RagPanelVisibilityInput): RagPanelVisibility {
  const historyUsesOverlay = isRagHistoryOverlayMode(layoutMode);
  return {
    historyIsOverlay: historyUsesOverlay && historyOverlayOpen,
    historyVisible: historyUsesOverlay ? historyOverlayOpen : !preferredHistoryCollapsed,
    sourcesIsOverlay: layoutMode !== "wide" && sourcesOverlayOpen,
    sourcesVisible: layoutMode === "wide" ? !preferredSourcesCollapsed : sourcesOverlayOpen,
  };
}
