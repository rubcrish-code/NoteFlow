import assert from "node:assert/strict";
import { it } from "node:test";
import { fitEditorWorkspaceWidths, minimumCompactEditorWindowWidth, minimumEditorWindowWidth, resolveEditorWorkspacePresentation, type EditorWorkspaceWidths } from "../src/shared/editorWorkspaceWidth";
import { EDITOR_TOOLBAR_ACTIONS, EDITOR_TOOLBAR_MIN_WIDTH, resolveEditorToolbarActions } from "../src/features/editor/editorToolbarLayout";

it("keeps all 31 commands direct, ordered and unique in every density", () => {
  for (const width of [820, 900, 1000, 1100, 1130, 1200, 1920]) {
    const result = resolveEditorToolbarActions(width);
    assert.deepEqual(result.visibleActions, EDITOR_TOOLBAR_ACTIONS);
    assert.equal(result.overflowActions.length, 0);
    assert.equal(new Set(result.visibleActions.map((action) => action.id)).size, 31);
    assert.ok(result.visibleActions.every((action) => action.tip));
  }
});
it("reserves the complete ribbon at every supported zoom without closing panels or mutating preferences", () => {
  for (const zoomPercent of [100, 125, 150, 160]) for (const sidebarCollapsed of [false, true]) for (const chatOpen of [false, true]) {
    const layout: EditorWorkspaceWidths = { zoomPercent, sidebarCollapsed, chatOpen, focus: false, sidebarWidth: 360, listWidth: 560, chatWidth: 620 };
    const original = structuredClone(layout);
    for (const extra of [0, 1, 100, 500, 1000]) {
      const viewport = minimumEditorWindowWidth(layout) + extra;
      const fitted = fitEditorWorkspaceWidths(layout, viewport);
      assert.ok(viewport - fitted.sidebarWidth - fitted.listWidth - fitted.chatWidth >= EDITOR_TOOLBAR_MIN_WIDTH * zoomPercent / 100 - .001);
      assert.ok(fitted.sidebarWidth >= (sidebarCollapsed ? 74 : 190));
      assert.ok(fitted.listWidth >= 260);
      assert.ok(fitted.chatWidth >= (chatOpen ? 300 : 0));
      assert.deepEqual(layout, original);
    }
  }
});
it("restores preferred widths when room returns and has an explicit focus-mode minimum", () => {
  const layout: EditorWorkspaceWidths = { zoomPercent: 160, sidebarCollapsed: false, chatOpen: true, focus: false, sidebarWidth: 360, listWidth: 560, chatWidth: 620 };
  assert.equal(minimumEditorWindowWidth(layout), 2062);
  assert.deepEqual(fitEditorWorkspaceWidths(layout, 3000), { sidebarWidth: 360, listWidth: 560, chatWidth: 620 });
  assert.equal(minimumEditorWindowWidth({ ...layout, focus: true }), 1312);
  assert.deepEqual(fitEditorWorkspaceWidths({ ...layout, focus: true }, 1312), { sidebarWidth: 0, listWidth: 0, chatWidth: 0 });
});

it("keeps note chat docked and reports the approved physical minimum honestly", () => {
  for (const physicalWidth of [1366, 1600, 1920]) for (const scale of [1, 1.25, 1.5]) for (const zoomPercent of [100, 160]) {
    const layout: EditorWorkspaceWidths = { zoomPercent, sidebarCollapsed: false, chatOpen: true, focus: false, sidebarWidth: 360, listWidth: 560, chatWidth: 620 };
    const before = structuredClone(layout), viewport = physicalWidth / scale;
    const result = resolveEditorWorkspacePresentation(layout, viewport);
    assert.deepEqual(layout, before);
    if (viewport >= minimumCompactEditorWindowWidth(layout)) {
      assert.equal(result.ribbonFits, true);
      assert.ok(result.widths.sidebarWidth + result.widths.listWidth + result.widths.chatWidth + 820 * zoomPercent / 100 <= viewport + .001);
    } else assert.equal(result.ribbonFits, false, "physical ribbon limit must be reported honestly");
    assert.ok(result.widths.chatWidth >= 300, "chat always owns a real grid column");
    assert.equal(Object.hasOwn(result, "chatOverlay"), false);
  }
});

it("requires 1686 logical pixels for a right chat plus 160% ribbon and navigation rail", () => {
  const layout: EditorWorkspaceWidths = { zoomPercent: 160, sidebarCollapsed: false, chatOpen: true, focus: false, sidebarWidth: 360, listWidth: 560, chatWidth: 620 };
  assert.equal(minimumCompactEditorWindowWidth(layout), 1686);
  assert.equal(resolveEditorWorkspacePresentation(layout, 1685).ribbonFits, false);
  const result = resolveEditorWorkspacePresentation(layout, 1686);
  assert.equal(result.ribbonFits, true);
  assert.equal(result.hideList, true);
  assert.deepEqual(result.widths, { sidebarWidth: 74, listWidth: 0, chatWidth: 300 });
});

it("restores the chosen chat width after the note list temporarily closes", () => {
  const layout: EditorWorkspaceWidths = { zoomPercent: 100, sidebarCollapsed: false, chatOpen: true, focus: false, sidebarWidth: 277, listWidth: 315, chatWidth: 380 };
  const result = resolveEditorWorkspacePresentation(layout, 1440);
  assert.equal(result.hideList, true);
  assert.equal(result.ribbonFits, true);
  assert.deepEqual(result.widths, { sidebarWidth: 240, listWidth: 0, chatWidth: 380 });
  assert.equal(resolveEditorWorkspacePresentation({ ...layout, chatOpen: false }, 1440).hideList, false);
  assert.deepEqual(resolveEditorWorkspacePresentation({ ...layout }, 1440), result);
  assert.equal(layout.chatWidth, 380);
});

it("reuses space recovered by the navigation rail without changing stored widths", () => {
  const layout: EditorWorkspaceWidths = { zoomPercent: 160, sidebarCollapsed: false, chatOpen: true, focus: false, sidebarWidth: 360, listWidth: 560, chatWidth: 620 };
  const result = resolveEditorWorkspacePresentation(layout, 1775);
  assert.equal(result.ribbonFits, true);
  assert.deepEqual(result.widths, { sidebarWidth: 74, listWidth: 0, chatWidth: 389 });
  assert.equal(layout.chatWidth, 620);
});
