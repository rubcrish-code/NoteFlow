import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EDITOR_TOOLBAR_ACTIONS, getEditorToolbarLayoutMode, resolveEditorToolbarActions } from "../src/features/editor/editorToolbarLayout";
import { getRagLayoutMode, resolveRagPanelVisibility } from "../src/features/rag/ragResponsiveLayout";

function occupiedToolbarWidth(actions: ReturnType<typeof resolveEditorToolbarActions>, narrow: boolean) {
  const separators = actions.visibleActions.filter((action, index) =>
    index < actions.visibleActions.length - 1 && action.group !== actions.visibleActions[index + 1].group,
  ).length;
  const itemCount = actions.visibleActions.length + Number(actions.overflowActions.length > 0);
  return (narrow ? 16 : 24) + actions.visibleActions.length * (narrow ? 29 : 30)
    + separators * (narrow ? 5 : 7) + Math.max(0, itemCount - 1)
    + (actions.overflowActions.length > 0 ? 30 : 0);
}

describe("production layout regressions", () => {
  it("keeps the complete toolbar, including AI, within its measured width", () => {
    for (const width of [100, 160, 240, 320, 480, 560, 720, 980, 1100]) {
      const layout = resolveEditorToolbarActions(width);
      assert.ok(occupiedToolbarWidth(layout, getEditorToolbarLayoutMode(width) === "narrow") <= width, `toolbar clipped at ${width}px`);
      assert.deepEqual(
        new Set([...layout.visibleActions, ...layout.overflowActions].map((action) => action.id)),
        new Set(EDITOR_TOOLBAR_ACTIONS.map((action) => action.id)),
      );
      if (width >= 280) assert.ok(layout.visibleActions.some((action) => action.id === "ai"));
    }
  });

  it("moves wide RAG panels into overlays before they squeeze the chat", () => {
    const panels = { conversationWidth: 380, sourcesWidth: 460, sourcesCollapsed: false };
    assert.equal(getRagLayoutMode(1100, panels), "compact");
    assert.equal(getRagLayoutMode(1280, panels), "compact");
    assert.equal(getRagLayoutMode(1281, panels), "wide");
    const compact = resolveRagPanelVisibility({
      historyOverlayOpen: false,
      layoutMode: getRagLayoutMode(1100, panels),
      preferredHistoryCollapsed: false,
      preferredSourcesCollapsed: false,
      sourcesOverlayOpen: false,
    });
    assert.equal(compact.historyVisible, false);
    assert.equal(compact.sourcesVisible, false);
  });
});
