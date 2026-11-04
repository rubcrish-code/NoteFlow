import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorDocument } from "../src/features/editor/markdownService";
import { runEditorFormattingCommand } from "../src/features/editor/editorFormattingCommands";
import { buildEditorDocumentFromStoredNoteContent, serializeEditorDocumentForStorage } from "../src/features/editor/editorContentSerializer";
import { CODE_BLOCK_SOURCE_ATTR } from "../src/features/editor/codeBlockSource";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver, DOMParser: dom.window.DOMParser,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const { createEditorExtensions } = await import("../src/features/editor/EditorArea");
const editors: Editor[] = [];

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren();
});
after(() => {
  dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function editorFor(content: string | EditorDocument) {
  const element = document.createElement("div"); document.body.append(element);
  const editor = new Editor({ element, content, extensions: createEditorExtensions({
    onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {},
  }) });
  editors.push(editor); return editor;
}
function positionOf(editor: Editor, text: string) {
  let result = -1;
  editor.state.doc.descendants((node, position) => {
    if (!node.isTextblock || result >= 0) return;
    const offset = node.textContent.indexOf(text);
    if (offset >= 0) result = position + 1 + offset;
    return false;
  });
  assert.ok(result >= 0, `Missing fixture text: ${text}`);
  return result;
}
function select(editor: Editor, text: string) {
  const from = positionOf(editor, text);
  editor.commands.setTextSelection({ from, to: from + text.length });
}
function reopen(editor: Editor, markdown?: string) {
  const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
  const loaded = buildEditorDocumentFromStoredNoteContent({
    contentJson: { type: "doc", content: [{ type: "paragraph" }] },
    contentMarkdown: markdown ?? stored.contentMarkdown, plainText: stored.plainText,
    contentSidecars: JSON.parse(JSON.stringify(stored.contentSidecars)).map((sidecar: object) => ({ ...sidecar, createdAt: "", updatedAt: "" })),
  }, { warn: () => assert.fail("Unexpected fallback") });
  assert.equal(loaded.source, "markdown");
  return editorFor(loaded.editorDocument);
}
function structure(editor: Editor) {
  return editor.getJSON().content?.map((node) => ({ type: node.type, text: editor.state.schema.nodeFromJSON(node).textContent }));
}

describe("Actual quote/code selection commands", () => {
  for (const command of ["quote", "code-block"] as const) {
    const type = command === "quote" ? "blockquote" : "codeBlock";
    it(`${command}: isolates a selected fragment and preserves both rich siblings`, () => {
      const editor = editorFor("<p><strong>Before </strong><em>selected</em><u> after</u></p><h2>Neighbour</h2><ul><li>Untouched</li></ul><p>End</p>");
      select(editor, "selected");
      assert.equal(runEditorFormattingCommand(editor, command), true);
      assert.deepEqual(structure(editor), [
        { type: "paragraph", text: "Before " }, { type, text: "selected" }, { type: "paragraph", text: " after" },
        { type: "heading", text: "Neighbour" }, { type: "bulletList", text: "Untouched" }, { type: "paragraph", text: "End" },
      ]);
      assert.equal(editor.view.dom.querySelector("p strong")?.textContent, "Before ");
      assert.equal(editor.view.dom.querySelector("p u")?.textContent, " after");
      assert.equal(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n"), "selected");
    });
    for (const offset of [0, 3, 6]) it(`${command}: empty selection at offset ${offset} inserts an empty focused block without losing suffix`, () => {
      const editor = editorFor("<p><strong>abcdef</strong></p><p>Neighbour</p>");
      editor.commands.setTextSelection(1 + offset);
      assert.equal(runEditorFormattingCommand(editor, command), true);
      const expected = [];
      if (offset) expected.push({ type: "paragraph", text: "abcdef".slice(0, offset) });
      expected.push({ type, text: "" });
      if (offset < 6) expected.push({ type: "paragraph", text: "abcdef".slice(offset) });
      expected.push({ type: "paragraph", text: "Neighbour" });
      assert.deepEqual(structure(editor), expected);
      assert.equal(editor.state.selection.empty, true);
      assert.equal(editor.isActive(type), true);
      assert.equal(editor.view.dom.querySelectorAll("strong").length, offset === 3 ? 2 : 1);
    });
    it(`${command}: isolates multiline/reversed selection without changing outer paragraphs`, () => {
      const editor = editorFor("<p>before ONE</p><h2>TWO after</h2><p>Neighbour</p>");
      const from = positionOf(editor, "ONE"); const to = positionOf(editor, "TWO") + 3;
      editor.commands.setTextSelection({ from: to, to: from });
      assert.equal(runEditorFormattingCommand(editor, command), true);
      assert.deepEqual(structure(editor), [
        { type: "paragraph", text: "before " }, { type, text: command === "quote" ? "ONETWO" : "ONE\nTWO" },
        { type: "heading", text: " after" }, { type: "paragraph", text: "Neighbour" },
      ]);
    });
    it(`${command}: has one-step Undo/Redo including rich metadata`, () => {
      const editor = editorFor("<p>before <strong>selected</strong> after</p><p>End</p>");
      select(editor, "selected"); const original = editor.getJSON();
      editor.view.dispatch(closeHistory(editor.state.tr));
      runEditorFormattingCommand(editor, command); const converted = editor.getJSON();
      assert.equal(editor.commands.undo(), true); assert.deepEqual(editor.getJSON(), original);
      assert.equal(editor.commands.redo(), true); assert.deepEqual(editor.getJSON(), converted);
    });
  }
  it("quote: lifting only a selected middle fragment retains marks and surrounding quotes", () => {
    const editor = editorFor("<blockquote><p><strong>before selected after</strong></p></blockquote><p>End</p>");
    select(editor, "selected");
    assert.equal(runEditorFormattingCommand(editor, "quote"), true);
    assert.deepEqual(structure(editor), [
      { type: "blockquote", text: "before " }, { type: "paragraph", text: "selected" },
      { type: "blockquote", text: " after" }, { type: "paragraph", text: "End" },
    ]);
    assert.equal(editor.view.dom.querySelector("body > p"), null);
    assert.equal(editor.view.dom.querySelectorAll("strong").length, 3);
  });
  it("quote: toggles selected rich content back after save/reopen", () => {
    const editor = editorFor("<p><strong>bold</strong> <em>italic</em></p><p>End</p>");
    select(editor, "bold italic"); const original = editor.getJSON();
    runEditorFormattingCommand(editor, "quote");
    const loaded = reopen(editor); select(loaded, "bold italic");
    assert.equal(runEditorFormattingCommand(loaded, "quote"), true);
    assert.deepEqual(loaded.getJSON(), original);
  });
  it("code: restores bold/italic/link marks and heading/list structure after multiple save/reopen cycles", () => {
    const editor = editorFor('<h2><strong>Title</strong></h2><ul><li><p><em>Item</em> <a href="https://example.test/">link</a></p></li></ul><p>End</p>');
    const original = editor.getJSON();
    editor.commands.setTextSelection({ from: positionOf(editor, "Title"), to: positionOf(editor, "link") + 4 });
    assert.equal(runEditorFormattingCommand(editor, "code-block"), true);
    assert.equal(editor.view.dom.querySelector("pre strong, pre em, pre a"), null);
    assert.equal(editor.getHTML().includes(CODE_BLOCK_SOURCE_ATTR), false);
    let loaded = reopen(editor);
    loaded = reopen(loaded);
    loaded.commands.setTextSelection(positionOf(loaded, "Title"));
    assert.equal(runEditorFormattingCommand(loaded, "code-block"), true);
    assert.deepEqual(loaded.getJSON(), original);
  });
  it("code: partial paragraph restoration never absorbs its rich siblings", () => {
    const editor = editorFor("<p><u>before </u><strong>bold</strong> <em>italic</em><s> after</s></p><p>End</p>");
    select(editor, "bold italic"); runEditorFormattingCommand(editor, "code-block");
    const loaded = reopen(editor); loaded.commands.setTextSelection(positionOf(loaded, "bold"));
    runEditorFormattingCommand(loaded, "code-block");
    assert.deepEqual(structure(loaded), [
      { type: "paragraph", text: "before " }, { type: "paragraph", text: "bold italic" },
      { type: "paragraph", text: " after" }, { type: "paragraph", text: "End" },
    ]);
    assert.equal(loaded.view.dom.querySelector("strong")?.textContent, "bold");
    assert.equal(loaded.view.dom.querySelector("em")?.textContent, "italic");
    assert.equal(loaded.view.dom.querySelector("u")?.textContent, "before ");
    assert.equal(loaded.view.dom.querySelector("s")?.textContent, " after");
  });
  it("code: safe in-block edits update the restorable rich fragment and survive save/reopen", () => {
    const editor = editorFor("<h2><strong>bold</strong> <em>italic</em></h2><p>End</p>");
    select(editor, "bold italic"); runEditorFormattingCommand(editor, "code-block");
    editor.commands.insertContentAt(positionOf(editor, "bold") + 2, "X");
    editor.commands.insertContentAt(positionOf(editor, "italic") + 3, "Y");
    const loaded = reopen(editor); loaded.commands.setTextSelection(positionOf(loaded, "boXld"));
    runEditorFormattingCommand(loaded, "code-block");
    assert.equal(loaded.view.dom.querySelector("h2 strong")?.textContent, "boXld");
    assert.equal(loaded.view.dom.querySelector("h2 em")?.textContent, "itaYlic");
  });
  it("code: ambiguous structural edits cannot resurrect old text/structure after reopening", () => {
    const editor = editorFor("<h2><strong>First</strong></h2><p><em>Second</em></p><p>End</p>");
    editor.commands.setTextSelection({ from: positionOf(editor, "First"), to: positionOf(editor, "Second") + 6 });
    runEditorFormattingCommand(editor, "code-block");
    const from = positionOf(editor, "First") + 2;
    editor.commands.insertContentAt({ from, to: positionOf(editor, "Second") + 3 }, "changed");
    const text = editor.state.doc.firstChild!.textContent;
    const loaded = reopen(editor); loaded.commands.setTextSelection(1);
    runEditorFormattingCommand(loaded, "code-block");
    assert.equal(loaded.state.doc.firstChild!.textContent, text);
    assert.equal(loaded.view.dom.querySelector("h2"), null);
    assert.equal(loaded.getText().includes("First"), false);
  });
  it("code: stale sidecars never restore rich text into externally changed Markdown", () => {
    const editor = editorFor("<p><strong>original</strong></p><p>End</p>");
    select(editor, "original"); runEditorFormattingCommand(editor, "code-block");
    const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
    const loaded = reopen(editor, stored.contentMarkdown.replace("End", "Changed outside code"));
    assert.equal(loaded.state.doc.firstChild!.attrs[CODE_BLOCK_SOURCE_ATTR], null);
    loaded.commands.setTextSelection(positionOf(loaded, "original"));
    runEditorFormattingCommand(loaded, "code-block");
    assert.equal(loaded.view.dom.querySelector("strong"), null);
    assert.ok(loaded.getText().includes("Changed outside code"));
  });
  it("code: malformed source cannot replace the current code text", () => {
    const editor = editorFor("<pre><code>current</code></pre><p>End</p>");
    editor.commands.setTextSelection(1);
    editor.commands.updateAttributes("codeBlock", { [CODE_BLOCK_SOURCE_ATTR]: {
      version: 1, text: "current", content: [{ type: "paragraph", content: [{ type: "text", text: "obsolete", marks: [{ type: "bold" }] }] }],
    } });
    runEditorFormattingCommand(editor, "code-block");
    assert.equal(editor.state.doc.firstChild!.textContent, "current");
    assert.equal(editor.view.dom.querySelector("strong"), null);
  });
});
