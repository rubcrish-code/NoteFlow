import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EDITOR_TOOLBAR_ACTIONS, resolveEditorToolbarActions } from "../src/features/editor/editorToolbarLayout";

const tokensCss = readFileSync("src/styles/tokens.css", "utf8");
const appCss = readFileSync("src/styles/app.css", "utf8");
const foundationCss = readFileSync("src/styles/foundation.css", "utf8");
const sidebarCss = readFileSync("src/styles/pages.css", "utf8");
const physicalLayoutSource = readFileSync("src/shared/physicalLayout.ts", "utf8");
const pageShellSource = readFileSync("src/features/navigation/PageShell.tsx", "utf8");
const lazyFeaturesSource = readFileSync("src/app/lazyFeatures.ts", "utf8");

function token(name: string): string {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `Missing --${name}`);
  return match[1].trim();
}

describe("P2.0A lightweight visual foundation", () => {
  it("uses semantic lightweight control, radius and elevation tokens", () => {
    assert.equal(token("accent"), "#3b82f6");
    assert.equal(token("surface-app"), "var(--bg)");
    assert.equal(token("button-radius"), "var(--radius-button)");
    assert.equal(token("radius-button"), "14px");
    assert.equal(token("radius-popover"), "20px");
    assert.equal(token("control-height-default"), "38px");
    assert.equal(token("control-height-compact"), "32px");
    assert.equal(token("font-weight-medium"), "500");
    assert.equal(token("font-weight-semibold"), "600");
    assert.match(token("shadow-card"), /0 1px 2px/);
    assert.match(token("shadow-popover"), /18px 44px/);
    assert.match(tokensCss, /\[data-theme="dark"\][\s\S]*--surface-hover:/);
  });

  it("preserves the complete toolbar registry and one-row overflow partition", () => {
    assert.equal(EDITOR_TOOLBAR_ACTIONS.length, 27);
    for (const width of [280, 560, 980, 1440]) {
      const layout = resolveEditorToolbarActions(width);
      const actionIds = [...layout.visibleActions, ...layout.overflowActions].map((action) => action.id);
      assert.equal(actionIds.length, EDITOR_TOOLBAR_ACTIONS.length);
      assert.deepEqual(new Set(actionIds), new Set(EDITOR_TOOLBAR_ACTIONS.map((action) => action.id)));
    }
  });

  it("keeps collapsed sidebar controls accessible while icons remain compact", () => {
    assert.match(sidebarCss, /--collapsed-rail-control-size:\s*44px/);
    assert.match(sidebarCss, /--collapsed-rail-icon-size:\s*18px/);
    assert.match(sidebarCss, /min-height:\s*var\(--collapsed-rail-control-size\)/);
    assert.match(sidebarCss, /width:\s*var\(--collapsed-rail-control-size\)/);
  });

  it("uses one inset rounded indicator for selected notes instead of a clipped border", () => {
    assert.match(appCss, /\.card\.on::before,\s*\.search-result-card\.on::before/);
    assert.match(appCss, /background:\s*var\(--accent\)/);
    assert.match(appCss, /left:\s*3px/);
    assert.match(appCss, /width:\s*3px/);
    assert.match(appCss, /top:\s*8px/);
    assert.match(appCss, /bottom:\s*8px/);
    assert.doesNotMatch(sidebarCss, /box-shadow:\s*inset\s+2px\s+0\s+0\s+var\(--accent\)/);
  });

  it("keeps physical responsive decisions independent from CSS viewport queries", () => {
    assert.doesNotMatch(physicalLayoutSource, /window\.(?:innerWidth|matchMedia)/);
    assert.match(pageShellSource, /useObservedPhysicalElementWidth/);
    assert.match(pageShellSource, /getPageLayoutMode/);
  });

  it("preserves feature-level lazy imports outside the initial bundle", () => {
    for (const feature of ["SettingsPage", "RagChatPage", "ImageEditorModal", "ProjectsPage", "TagsPage", "ArchivePage"]) {
      assert.match(lazyFeaturesSource, new RegExp(`import\\(.*${feature}`));
    }
  });

  it("retains a global reduced-motion fallback", () => {
    assert.match(foundationCss, /@media \(prefers-reduced-motion:\s*reduce\)/);
    assert.match(foundationCss, /transition-duration:\s*1ms\s*!important/);
    assert.match(foundationCss, /animation-duration:\s*1ms\s*!important/);
  });
});
