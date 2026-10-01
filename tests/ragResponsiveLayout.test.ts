import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRagLayoutMode, RAG_MIN_CHAT_WIDTH, transitionRagOverlays } from "../src/features/rag/ragResponsiveLayout";
import { toPhysicalLayoutPixels } from "../src/shared/physicalLayout";

const panels = { conversationWidth: 280, sourcesWidth: 320, sourcesCollapsed: false };
const open = {
  historyOverlayOpen: false, sourcesOverlayOpen: false,
  preferredHistoryCollapsed: false, preferredSourcesCollapsed: false,
};

describe("RAG zoom-aware conversation budget", () => {
  it("moves both panels out of the grid before zoom shrinks the chat below 440 CSS pixels", () => {
    assert.equal(getRagLayoutMode(1110, panels, 100), "wide");
    assert.equal(getRagLayoutMode(1110, panels, 125), "compact");
    assert.equal(getRagLayoutMode(1110, panels, 160), "compact");
    assert.equal(getRagLayoutMode(1598, panels, 160), "wide");
  });

  it("keeps a safe conversation budget across window sizes, zoom and panel widths", () => {
    for (const viewport of [1100, 1440, 1920, 2560]) {
      for (const zoom of [80, 100, 125, 160]) {
        for (const widths of [panels, { ...panels, conversationWidth: 380, sourcesWidth: 460 }]) {
          for (const sourcesCollapsed of [true, false]) {
            const physicalWidth = viewport - 250 - 80;
            const cssWidth = physicalWidth / (zoom / 100);
            const measured = toPhysicalLayoutPixels(cssWidth, zoom);
            const mode = getRagLayoutMode(measured, { ...widths, sourcesCollapsed }, zoom);
            const occupied = mode === "wide" ? widths.conversationWidth + (sourcesCollapsed ? 0 : widths.sourcesWidth) : 0;
            assert.ok((measured - occupied) / (zoom / 100) >= RAG_MIN_CHAT_WIDTH,
              `${viewport}px @ ${zoom}% with ${JSON.stringify(widths)}`);
          }
        }
      }
    }
  });

  it("counts preferred panel widths in physical pixels without multiplying them by zoom", () => {
    assert.equal(getRagLayoutMode(1304, panels, 160), "compact");
    assert.equal(getRagLayoutMode(1305, panels, 160), "wide");
    assert.equal(getRagLayoutMode(1100, { ...panels, sourcesCollapsed: true }, 160), "wide");
  });

  it("uses Sources as the single overlay when zooming away from three docked columns", () => {
    assert.deepEqual(transitionRagOverlays("wide", "compact", open), {
      historyOverlayOpen: false, sourcesOverlayOpen: true,
    });
  });

  it("keeps history accessible when it was the only preferred docked panel", () => {
    assert.deepEqual(transitionRagOverlays("wide", "compact", { ...open, preferredSourcesCollapsed: true }), {
      historyOverlayOpen: true, sourcesOverlayOpen: false,
    });
  });

  it("does not open a panel that the user had closed", () => {
    assert.deepEqual(transitionRagOverlays("wide", "tight", {
      ...open, preferredHistoryCollapsed: true, preferredSourcesCollapsed: true,
    }), { historyOverlayOpen: false, sourcesOverlayOpen: false });
  });

  it("keeps the current drawer between compact and narrow modes", () => {
    assert.deepEqual(transitionRagOverlays("compact", "narrow", { ...open, historyOverlayOpen: true }), {
      historyOverlayOpen: true, sourcesOverlayOpen: false,
    });
  });

  it("clears only transient overlays on returning to wide mode", () => {
    assert.deepEqual(transitionRagOverlays("compact", "wide", { ...open, sourcesOverlayOpen: true }), {
      historyOverlayOpen: false, sourcesOverlayOpen: false,
    });
    assert.equal(open.preferredSourcesCollapsed, false);
  });
});
