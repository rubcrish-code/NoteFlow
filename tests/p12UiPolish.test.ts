import assert from "node:assert/strict";
import { readLocalizedSource as readFileSync } from "./helpers/readLocalizedSource";
import { describe, it } from "node:test";
import { EDITOR_TOOLBAR_ACTIONS, resolveEditorToolbarActions } from "../src/features/editor/editorToolbarLayout";

const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");
const toolbarSource = readFileSync("src/features/editor/FormattingToolbar.tsx", "utf8");
const tagsSource = readFileSync("src/features/tags/TagsPage.tsx", "utf8");
const archiveSource = readFileSync("src/features/archive/ArchivePage.tsx", "utf8");
const pagesCss = readFileSync("src/styles/pages.css", "utf8");
const editorCss = readFileSync("src/styles/editor.css", "utf8");
const ragCss = readFileSync("src/styles/rag.css", "utf8");

describe("P1.2 page-by-page UI polish", () => {
  it("keeps every editor tool direct without an overflow menu", () => {
    const layout = resolveEditorToolbarActions(560);
    const allIds = EDITOR_TOOLBAR_ACTIONS.map((action) => action.id);
    assert.deepEqual(new Set([...layout.visibleActions, ...layout.overflowActions].map((action) => action.id)), new Set(allIds));
    assert.equal(layout.visibleActions.some((action) => action.id === "ai"), true);
    assert.equal(layout.overflowActions.length, 0);
    assert.deepEqual(layout.visibleActions.map((action) => action.id), allIds);
    assert.doesNotMatch(toolbarSource, /useObservedElementWidth|toolbar-overflow-action|Дополнительные инструменты форматирования/);
    assert.match(toolbarSource, /EDITOR_TOOLBAR_ACTIONS/);
    assert.doesNotMatch(editorCss, /toolbar-slot-(?:adaptive|narrow)/);
    assert.match(editorCss, /\.toolbar\s*\{[^}]*overflow: visible/);
  });

  it("uses physical space and a right-docked chat with an explicit window minimum", () => {
    assert.match(appShellSource, /usePhysicalViewportWidth\(appZoom\.zoomPercent, appZoom\.useCssZoomFallback\)/);
    assert.match(appShellSource, /resolveEditorWorkspacePresentation/);
    assert.match(appShellSource, /useEditorWindowMinimum/);
    assert.doesNotMatch(appShellSource, /prepareEditorWindowWidth|ensureEditorSpace/);
    assert.doesNotMatch(editorCss, /workspace-chat-overlay|workspace-compact-list-open/);
    assert.match(appShellSource, /minimumCompactEditorWindowWidth/);
    assert.doesNotMatch(appShellSource, /app-zoom-(?:high|elevated)/);
    assert.doesNotMatch(pagesCss, /app-zoom-(?:high|elevated)/);
    assert.match(pagesCss, /\.workspace\.workspace-hide-list-for-chat \.list,[\s\S]*display: none/);
    assert.doesNotMatch(pagesCss, /\.note-chat\s*\{[^}]*position:\s*(?:absolute|fixed)/);
  });

  it("uses shared popovers for compact row and toolbar actions", () => {
    assert.match(tagsSource, /<MenuPopover/);
    assert.match(archiveSource, /<MenuPopover/);
    assert.match(toolbarSource, /<FontFormatPopover/);
    assert.match(tagsSource, /aria-label=\{`Действия с тегом/);
    assert.match(archiveSource, /aria-label=\{`Действия с «/);
  });

  it("keeps RAG conversation space dominant at narrow widths", () => {
    assert.match(ragCss, /:is\(\.rag-layout-narrow, \.rag-layout-tight\) :is\(\.rag-chat-scroll, \.rag-input-wrap\)[\s\S]*padding-inline: var\(--space-4\)/);
    assert.match(ragCss, /\.rag-layout-compact \.rag-model-summary > \.rag-generator-summary[\s\S]*display: none/);
    assert.match(ragCss, /\.rag-layout-tight :is\([\s\S]*\.rag-stage-note[\s\S]*display: none/);
  });
});
