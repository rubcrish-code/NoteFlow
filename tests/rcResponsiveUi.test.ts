import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EDITOR_TOOLBAR_ACTIONS, resolveEditorToolbarActions } from "../src/features/editor/editorToolbarLayout";
import { EDITOR_CONTENT_DEFAULT_WIDTH, EDITOR_CONTENT_MAX_WIDTH, clampEditorContentWidth } from "../src/shared/editorPageLayout";

const pagesCss = readFileSync("src/styles/pages.css", "utf8");
const appCss = readFileSync("src/styles/app.css", "utf8");
const editorCss = readFileSync("src/styles/editor.css", "utf8");
const ragCss = readFileSync("src/styles/rag.css", "utf8");
const chatCss = readFileSync("src/styles/chat.css", "utf8");
const settingsCss = readFileSync("src/styles/settings.css", "utf8");
const tagsSource = readFileSync("src/features/tags/TagsPage.tsx", "utf8");
const toolbarSource = readFileSync("src/features/editor/FormattingToolbar.tsx", "utf8");

describe("RC responsive UI contracts", () => {
  it("keeps every empty-state icon centered instead of applying block display to all spans", () => {
    assert.match(pagesCss, /\.page-empty-state \.page-empty-icon\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/);
    assert.doesNotMatch(pagesCss, /\.page-empty-state b,\s*\.page-empty-state span\s*\{/);
    assert.match(pagesCss, /\.page-empty-state > div > span\s*\{\s*display:\s*block;/);
    assert.match(appCss, /\.semantic-empty-icon\s*\{[^}]*align-items:\s*center;[^}]*display:\s*inline-flex;[^}]*justify-content:\s*center;/);
  });

  it("preserves bounded reading, chat and settings widths independently of viewport width", () => {
    assert.equal(EDITOR_CONTENT_DEFAULT_WIDTH, 840);
    assert.equal(clampEditorContentWidth(10000), EDITOR_CONTENT_MAX_WIDTH);
    assert.match(appCss, /\.ed-page-frame\s*\{[^}]*max-width:\s*100%;[^}]*width:\s*var\(--editor-page-width,\s*840px\)/);
    assert.match(ragCss, /\.rag-thread\s*\{[^}]*max-width:\s*780px/);
    assert.match(ragCss, /\.rag-input\s*\{[^}]*max-width:\s*780px/);
    assert.match(chatCss, /\.chat-composer\s*\{[^}]*max-width:\s*100%;[^}]*min-width:\s*0/);
    assert.match(settingsCss, /\.settings-layout-inner\s*\{[^}]*max-width:\s*1160px/);
    assert.match(settingsCss, /\.settings-content--models,\s*\.settings-content--data\s*\{[^}]*max-width:\s*920px/);
    assert.match(pagesCss, /\.projects-page-content,\s*\.tags-page-content\s*\{[^}]*max-width:\s*1080px/);
    assert.match(tagsSource, /className="tags-page-content"/);
  });

  it("keeps the toolbar registry complete and exposes its popovers outside the clipped toolbar", () => {
    const commandSource = toolbarSource.slice(toolbarSource.indexOf("function runCommand("), toolbarSource.indexOf("function applyPopoverCommand("));
    for (const action of EDITOR_TOOLBAR_ACTIONS) {
      assert.ok(action.tip.trim(), `${action.id} needs a tooltip`);
      assert.match(commandSource + readFileSync("src/features/editor/editorFormattingCommands.ts", "utf8"), new RegExp(`"${action.id}"`), `${action.id} needs an executable command branch`);
    }
    for (const width of [240, 280, 560, 980, 1440, 2560, 3440]) {
      const { visibleActions, overflowActions } = resolveEditorToolbarActions(width);
      assert.deepEqual(
        new Set([...visibleActions, ...overflowActions].map((action) => action.id)),
        new Set(EDITOR_TOOLBAR_ACTIONS.map((action) => action.id)),
      );
    }
    assert.match(editorCss, /\.toolbar\s*\{[^}]*overflow:\s*hidden/);
    assert.match(toolbarSource, /isFontMenuOpen \? createPortal\(/);
    assert.match(appCss, /\.font-format-popover\s*\{[^}]*position:\s*fixed/);
    assert.match(toolbarSource, /onClick=\{toggleFontMenu\}/);
    assert.match(toolbarSource, /onClick=\{\(\) => runCommand\(tool\.id\)\}/);
    assert.match(toolbarSource, /if \(toolId === "font"\)/);
  });
});

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const originalGetBoundingClientRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
let toolbarWidth = 980;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  if (this.classList.contains("toolbar-wrap")) {
    return new dom.window.DOMRect(0, 0, toolbarWidth, 45);
  }
  return originalGetBoundingClientRect.call(this);
};
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  MutationObserver: dom.window.MutationObserver,
  DOMParser: dom.window.DOMParser,
  ResizeObserver: class { observe() {} disconnect() {} },
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

const { Editor } = await import("@tiptap/react");
const { default: StarterKit } = await import("@tiptap/starter-kit");
const { FontFormat } = await import("../src/features/editor/customExtensions");
const { FormattingToolbar } = await import("../src/features/editor/FormattingToolbar");
let root: Root;
let container: HTMLDivElement;
let editor: InstanceType<typeof Editor>;

beforeEach(() => {
  toolbarWidth = 980;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = new Editor({ content: "<p>Test text</p>", extensions: [StarterKit, FontFormat] });
});
afterEach(async () => {
  await act(async () => root.unmount());
  editor.destroy();
  container.remove();
  document.querySelectorAll(".font-format-popover").forEach((element) => element.remove());
});
after(() => {
  dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("Aa toolbar behavior", () => {
  function renderToolbar() {
    return act(async () => root.render(h(FormattingToolbar, {
      aiStatus: null,
      editor,
      onAiAction() {},
      onOpenAiSettings() {},
      onToast() {},
    })));
  }

  it("opens an accessible portal and applies the selected font format", async () => {
    await renderToolbar();
    const trigger = container.querySelector<HTMLButtonElement>("[data-toolbar-font-trigger]");
    assert.ok(trigger);
    await act(async () => trigger.click());
    const popover = document.querySelector<HTMLElement>('.font-format-popover[role="dialog"]');
    assert.ok(popover);
    assert.equal(container.contains(popover), false);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    const size = popover.querySelector<HTMLButtonElement>(".font-size-choice");
    assert.ok(size);
    await act(async () => size.click());
    await act(async () => popover.querySelector<HTMLButtonElement>(".font-action.primary")!.click());
    assert.equal(editor.getAttributes("fontFormat").fontSize, size.textContent?.trim() + "px");
    assert.equal(document.querySelector(".font-format-popover"), null);
  });

  it("opens the same font controls from overflow at narrow widths", async () => {
    toolbarWidth = 60;
    await renderToolbar();
    const overflow = container.querySelector<HTMLButtonElement>('[aria-label="Дополнительные инструменты форматирования"]');
    assert.ok(overflow);
    await act(async () => overflow.click());
    const fontAction = document.querySelector<HTMLButtonElement>('[data-toolbar-overflow-action="font"]');
    assert.ok(fontAction);
    await act(async () => fontAction.click());
    assert.ok(document.querySelector('.font-format-popover[role="dialog"]'));
    assert.equal(document.querySelector('[data-toolbar-overflow-action="font"]'), null);
    await act(async () => document.querySelector<HTMLButtonElement>('.font-popover-head button')!.click());
    assert.equal(document.querySelector(".font-format-popover"), null);
  });

  it("runs visible formatting commands instead of leaving dead toolbar controls", async () => {
    await renderToolbar();
    await act(async () => editor.commands.setTextSelection({ from: 1, to: 5 }));
    const bold = container.querySelector<HTMLButtonElement>('[data-toolbar-action="bold"]');
    assert.ok(bold);
    await act(async () => bold.click());
    assert.equal(editor.isActive("bold"), true);
    await act(async () => bold.click());
    assert.equal(editor.isActive("bold"), false);
    const heading = container.querySelector<HTMLButtonElement>('[data-toolbar-action="h1"]');
    assert.ok(heading);
    await act(async () => heading.click());
    assert.equal(editor.isActive("heading", { level: 1 }), true);
  });
});
