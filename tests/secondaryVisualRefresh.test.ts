import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const tokensCss = readFileSync("src/styles/tokens.css", "utf8");
const pagesCss = readFileSync("src/styles/pages.css", "utf8");
const settingsCss = readFileSync("src/styles/settings.css", "utf8");
const ragCss = readFileSync("src/styles/rag.css", "utf8");
const foundationCss = readFileSync("src/styles/foundation.css", "utf8");
const physicalLayoutSource = readFileSync("src/shared/physicalLayout.ts", "utf8");
const lazyFeaturesSource = readFileSync("src/app/lazyFeatures.ts", "utf8");

describe("P2.0B secondary screens visual refresh", () => {
  it("keeps the accepted P2.0A visual language as the shared source of truth", () => {
    assert.match(tokensCss, /--accent:\s*#3b82f6/);
    assert.match(tokensCss, /--bg:\s*#f3f3f3/);
    assert.match(tokensCss, /--radius-button:\s*14px/);
    assert.match(tokensCss, /--radius-popover:\s*20px/);
    assert.match(tokensCss, /--control-height-default:\s*38px/);
  });

  it("renders projects, tags and archive as calm lists rather than card dashboards", () => {
    assert.match(pagesCss, /\.project-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(pagesCss, /\.project-card\s*\{[\s\S]*border-bottom:\s*1px solid var\(--border-subtle\)[\s\S]*min-height:\s*78px/);
    assert.match(pagesCss, /\.tag-row,\s*\.archive-row\s*\{[\s\S]*min-height:\s*60px/);
    assert.doesNotMatch(pagesCss, /\.project-card:hover,[\s\S]*transform:\s*translateY\(-1px\)/);
  });

  it("uses a dedicated selected marker and lightweight hierarchy in settings", () => {
    assert.match(settingsCss, /\.settings-nav-col \.settings-nav\.on::before/);
    assert.match(settingsCss, /\.settings-nav-col \.settings-nav\.on\s*\{[\s\S]*box-shadow:\s*none/);
    assert.match(settingsCss, /\.settings-preference-row,[\s\S]*grid-template-columns:\s*36px minmax\(0, 1fr\) auto/);
    assert.match(settingsCss, /\.semantic-profile-metrics > span\s*\{[\s\S]*border-left:\s*1px solid var\(--border-subtle\)/);
    assert.match(settingsCss, /\.model-card-more-menu,[\s\S]*border-radius:\s*var\(--radius-popover\)/);
  });

  it("uses one lightweight empty and error treatment for model settings", () => {
    assert.match(settingsCss, /:is\(\.llm-empty-state-card, \.semantic-empty-state\)[\s\S]*min-height:\s*164px/);
    assert.match(settingsCss, /:is\(\.connection-note, \.semantic-settings-message\)\.error[\s\S]*var\(--danger-soft\)/);
  });

  it("keeps data and export information in sections instead of nested heavy cards", () => {
    assert.match(settingsCss, /\.export-card\s*\{[\s\S]*border-radius:\s*0[\s\S]*box-shadow:\s*none/);
    assert.match(settingsCss, /\.knowledge-index-card\s*\{[\s\S]*border-radius:\s*0/);
    assert.match(settingsCss, /\.knowledge-index-metrics > div\s*\{[\s\S]*background:\s*transparent[\s\S]*border-radius:\s*0/);
  });

  it("uses the same quiet active indicator and list treatment in RAG", () => {
    assert.match(ragCss, /\.rag-history-item\.active::before/);
    assert.match(ragCss, /\.rag-history-item\.active\s*\{[\s\S]*box-shadow:\s*none/);
    assert.match(ragCss, /\.rag-source-list\s*\{[\s\S]*border-top:\s*1px solid var\(--border-subtle\)/);
    assert.match(ragCss, /\.rag-source-card\s*\{[\s\S]*border-radius:\s*0/);
  });

  it("preserves shared modal motion, reduced motion and physical responsive behavior", () => {
    assert.match(foundationCss, /\.nf-modal-shell\s*\{[\s\S]*border-radius:\s*var\(--radius-modal\)/);
    assert.match(foundationCss, /@media \(prefers-reduced-motion:\s*reduce\)/);
    assert.doesNotMatch(physicalLayoutSource, /window\.(?:innerWidth|matchMedia)/);
    for (const feature of ["SettingsPage", "RagChatPage", "ProjectsPage", "TagsPage", "ArchivePage"]) {
      assert.match(lazyFeaturesSource, new RegExp(`import\\(.*${feature}`));
    }
  });
});
