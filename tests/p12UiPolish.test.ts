import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");
const toolbarSource = readFileSync("src/features/editor/FormattingToolbar.tsx", "utf8");
const tagsSource = readFileSync("src/features/tags/TagsPage.tsx", "utf8");
const archiveSource = readFileSync("src/features/archive/ArchivePage.tsx", "utf8");
const pagesCss = readFileSync("src/styles/pages.css", "utf8");
const editorCss = readFileSync("src/styles/editor.css", "utf8");
const ragCss = readFileSync("src/styles/rag.css", "utf8");

describe("P1.2 page-by-page UI polish", () => {
  it("keeps frequent editor tools direct and moves adaptive tools into an accessible overflow", () => {
    assert.match(toolbarSource, /const adaptiveToolbarTools = new Set<ToolId>/);
    assert.match(toolbarSource, /const narrowToolbarTools = new Set<ToolId>/);
    assert.match(toolbarSource, /new ResizeObserver/);
    assert.match(toolbarSource, /entry\.contentRect\.width <= 560/);
    assert.match(toolbarSource, /aria-label="Дополнительные инструменты форматирования"/);
    assert.match(toolbarSource, /role="menuitemcheckbox"/);
    assert.match(editorCss, /@container editor-toolbar \(max-width: 980px\)[\s\S]*\.toolbar-slot-adaptive[\s\S]*display: none/);
    assert.match(editorCss, /@container editor-toolbar \(max-width: 560px\)[\s\S]*\.toolbar-slot-narrow[\s\S]*display: none/);
    assert.match(editorCss, /\.toolbar\s*\{[\s\S]*overflow: hidden/);
  });

  it("uses zoom-aware panel states without overlaying the editor and note chat", () => {
    assert.match(appShellSource, /zoomPercent >= 150 \? "app-zoom-high" : zoomPercent >= 125 \? "app-zoom-elevated"/);
    assert.match(pagesCss, /\.app-zoom-elevated \.workspace\.chat-open,[\s\S]*\.app-zoom-high \.workspace\.chat-open[\s\S]*grid-template-columns:/);
    assert.match(pagesCss, /\.app-zoom-elevated \.workspace\.chat-open \.list[\s\S]*display: none/);
    assert.match(pagesCss, /calc\(74px \/ var\(--app-zoom, 1\)\)/);
    assert.doesNotMatch(pagesCss, /\.note-chat\s*\{[^}]*position:\s*(?:absolute|fixed)/);
  });

  it("uses shared popovers for compact row and toolbar actions", () => {
    assert.match(tagsSource, /<MenuPopover/);
    assert.match(archiveSource, /<MenuPopover/);
    assert.match(toolbarSource, /<MenuPopover/);
    assert.match(tagsSource, /aria-label=\{`Действия с тегом/);
    assert.match(archiveSource, /aria-label=\{`Действия с «/);
  });

  it("keeps RAG conversation space dominant at narrow widths", () => {
    assert.match(ragCss, /@container rag-chat \(max-width: 760px\)/);
    assert.match(ragCss, /\.rag-chat-scroll,[\s\S]*\.rag-input-wrap[\s\S]*padding-inline: var\(--space-4\)/);
    assert.match(ragCss, /\.rag-model-summary > \.rag-generator-summary[\s\S]*display: none/);
    assert.match(ragCss, /@container rag-chat \(max-width: 560px\)[\s\S]*\.rag-stage-note[\s\S]*display: none/);
  });
});
