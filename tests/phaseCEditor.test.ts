import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import type { EditorDocument, Note } from "../src/app/types";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../src/features/editor/editorContentSerializer";
import { markdownToTiptapDoc } from "../src/features/editor/markdownService";
import { applyEditorFormattingValue, runEditorFormattingCommand } from "../src/features/editor/editorFormattingCommands";
import type { EditorToolbarActionId } from "../src/features/editor/editorToolbarLayout";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
  MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent,
  MutationObserver: dom.window.MutationObserver, DOMParser: dom.window.DOMParser,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
const { createEditorExtensions, EditorArea } = await import("../src/features/editor/EditorArea");
const editors: Editor[] = [];
let root: Root | undefined;
afterEach(async () => {
  if (root) { await act(async () => root!.unmount()); root = undefined; await new Promise((resolve) => setTimeout(resolve, 25)); }
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.replaceChildren(); clearMocks();
});
after(() => {
  dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function editorFor(content: EditorDocument | string) {
  const element = document.createElement("div"); document.body.append(element);
  const editor = new Editor({ element, extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content });
  editors.push(editor); return editor;
}
function reload(document: EditorDocument) {
  const stored = serializeEditorDocumentForStorage(document);
  return buildEditorDocumentFromStoredNoteContent({ contentJson: { type: "doc", content: [{ type: "paragraph" }] },
    contentMarkdown: stored.contentMarkdown, plainText: stored.plainText,
    contentSidecars: stored.contentSidecars.map((sidecar) => ({ ...sidecar, createdAt: "", updatedAt: "" })),
  }, { warn: () => assert.fail("Canonical load must not fall back") }).editorDocument;
}
function tab(editor: Editor, shiftKey = false) {
  const event = new dom.window.KeyboardEvent("keydown", { key: "Tab", code: "Tab", shiftKey, bubbles: true, cancelable: true });
  editor.view.dom.dispatchEvent(event); return event;
}

describe("Phase C actual editor behavior", () => {
  it("keeps multiple paragraphs, nested code and quotes inside list items on reopen", () => {
    const editor = editorFor(markdownToTiptapDoc("- First\n\n  Second paragraph\n\n  > Quote inside list\n\n  ```js\n  const value = 42;\n  ```\n\n- Last"));
    assert.equal(editor.view.dom.querySelectorAll("li").length, 2);
    assert.ok(editor.view.dom.querySelector("li blockquote"));
    assert.ok(editor.view.dom.querySelector("li pre"));
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    assert.equal(editor.view.dom.querySelectorAll("li").length, 2);
    assert.ok(editor.view.dom.querySelector("li blockquote"));
    assert.ok(editor.view.dom.querySelector("li pre"));
    for (const text of ["First", "Second paragraph", "Quote inside list", "const value = 42;", "Last"]) assert.ok(editor.getText().includes(text));
  });
  const combinations: EditorToolbarActionId[][] = [["bold", "italic"], ["bold", "underline"], ["italic", "strike"],
    ["bold", "inline-code"], ["bold", "sup"], ["italic", "sub"]];
  for (const commands of combinations) it(`round-trips compatible marks: ${commands.join(" + ")}`, () => {
    const editor = editorFor("<p>Стили</p>"); editor.commands.selectAll();
    commands.forEach((command) => assert.equal(runEditorFormattingCommand(editor, command), true));
    const marks = editor.getJSON().content![0].content![0].marks;
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    assert.equal(editor.getText(), "Стили");
    assert.deepEqual(editor.getJSON().content![0].content![0].marks, marks);
  });
  it("keeps bold, italic and monospace together without raw Markdown on reopen", () => {
    const editor = editorFor("<p>Сочетание</p>");
    editor.commands.selectAll();
    for (const command of ["bold", "italic", "inline-code", "underline", "strike"] as const) assert.equal(runEditorFormattingCommand(editor, command), true);
    const types = editor.getJSON().content![0].content![0].marks!.map((mark) => mark.type).sort();
    assert.deepEqual(types, ["bold", "code", "italic", "strike", "underline"]);
    assert.equal(serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument).contentMarkdown, "`Сочетание`");
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    assert.equal(editor.getText(), "Сочетание");
    assert.deepEqual(editor.getJSON().content![0].content![0].marks!.map((mark) => mark.type).sort(), types);
    assert.ok(editor.view.dom.querySelector("code strong, strong code"));
  });
  it("parses nested Markdown marks immediately", () => {
    const editor = editorFor(markdownToTiptapDoc("# Заголовок\n\n***Жирный курсив*** и **_ещё_**"));
    assert.ok(editor.view.dom.querySelector("h1"));
    assert.ok(editor.view.dom.querySelector("strong em, em strong"));
    assert.equal(editor.getText().includes("*"), false);
  });
  it("keeps text color and background independent across replace, clear and reload", () => {
    const editor = editorFor("<p>Акцент</p>"); editor.commands.selectAll();
    editor.commands.setBold();
    applyEditorFormattingValue(editor, { mode: "color", color: "#d6336c" });
    applyEditorFormattingValue(editor, { mode: "highlight", color: "#3b6ef2" });
    applyEditorFormattingValue(editor, { mode: "highlight", color: "#1e9e6f" });
    assert.equal(editor.getAttributes("highlight").color, "#1e9e6f");
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument)); editor.commands.selectAll();
    assert.equal(editor.getAttributes("textStyle").color, "#d6336c");
    assert.equal(editor.getAttributes("highlight").color, "#1e9e6f");
    assert.equal(editor.getJSON().content![0].content![0].marks!.filter((mark) => mark.type === "highlight").length, 1);
    applyEditorFormattingValue(editor, { mode: "highlight", color: null });
    assert.equal(editor.isActive("highlight"), false); assert.equal(editor.getAttributes("textStyle").color, "#d6336c");
    applyEditorFormattingValue(editor, { mode: "highlight", color: "#3b6ef2" });
    applyEditorFormattingValue(editor, { mode: "color", color: null });
    assert.equal(editor.isActive("highlight"), true); assert.equal(editor.getAttributes("textStyle").color, undefined);
    assert.equal(editor.isActive("bold"), true);
  });
  for (const vertical of [false, true]) it(`preserves ${vertical ? "rowspan" : "colspan"} geometry and cell content after merge/reopen/split`, () => {
    const editor = editorFor("<table><tr><th>А</th><th>Б</th><th>В</th></tr><tr><td>Г</td><td>Д</td><td>Е</td></tr><tr><td>Ж</td><td>З</td><td>И</td></tr></table>");
    let position = 0; editor.state.doc.descendants((node, pos) => { if (node.type.name === "table") position = pos; });
    const table = editor.state.doc.nodeAt(position)!; const map = TableMap.get(table);
    const start = position + 1;
    editor.view.dispatch(editor.state.tr.setSelection(new CellSelection(editor.state.doc.resolve(start + map.map[0]), editor.state.doc.resolve(start + map.map[vertical ? 3 : 1]))));
    assert.equal(editor.commands.mergeCells(), true);
    editor.commands.setCellAttribute("backgroundColor", "#c7d9ff");
    editor.commands.updateAttributes("table", { emphasizedBorders: true });
    const merged = editor.getJSON() as EditorDocument;
    assert.equal(TableMap.get(editor.state.doc.nodeAt(position)!).width, 3);
    const stored = serializeEditorDocumentForStorage(merged);
    assert.doesNotMatch(stored.contentMarkdown, /<table|colspan|rowspan|backgroundColor|payloadJson/);
    editor.commands.setContent(reload(merged));
    let restoredPosition = 0; editor.state.doc.descendants((node, pos) => { if (node.type.name === "table") restoredPosition = pos; });
    const restored = editor.state.doc.nodeAt(restoredPosition)!;
    assert.equal(TableMap.get(restored).width, 3); assert.equal(TableMap.get(restored).height, 3); assert.equal(TableMap.get(restored).problems, null);
    editor.commands.setTextSelection(restoredPosition + 3);
    assert.equal(editor.getAttributes("tableHeader").backgroundColor, "#c7d9ff");
    for (const text of ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И"]) assert.ok(editor.getText().includes(text));
    assert.equal(editor.commands.splitCell(), true);
    assert.equal(TableMap.get(editor.state.doc.nodeAt(restoredPosition)!).width, 3);
  });
  it("collapses details through a real button, preserves editable summary/body and reopens state", () => {
    const editor = editorFor("<p></p>"); editor.commands.insertDetailsBlock();
    const button = editor.view.dom.querySelector<HTMLButtonElement>(".details-toggle")!;
    assert.ok(button); assert.equal(button.getAttribute("aria-expanded"), "true");
    const before = editor.getText(); button.click();
    assert.equal(button.getAttribute("aria-expanded"), "false"); assert.equal(editor.view.dom.querySelector(".details-nodeview")?.getAttribute("data-open"), "false");
    assert.equal(editor.getText(), before);
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    assert.equal(editor.view.dom.querySelector(".details-toggle")?.getAttribute("aria-expanded"), "false");
    editor.view.dom.querySelector<HTMLButtonElement>(".details-toggle")!.click();
    assert.equal(editor.view.dom.querySelector(".details-toggle")?.getAttribute("aria-expanded"), "true");
  });
  it("never lets old merged-cell metadata discard externally added Markdown text", () => {
    const editor = editorFor("<table><tr><th colspan='2'>Merged</th><th>Third</th></tr><tr><td>A</td><td>B</td><td>C</td></tr></table>");
    const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
    const contentMarkdown = stored.contentMarkdown.replace("| Merged |  | Third |", "| Merged | New text | Third |");
    assert.notEqual(contentMarkdown, stored.contentMarkdown);
    const loaded = buildEditorDocumentFromStoredNoteContent({ contentJson: editor.getJSON() as EditorDocument,
      contentMarkdown, plainText: stored.plainText, contentSidecars: stored.contentSidecars.map((sidecar) => ({ ...sidecar, createdAt: "", updatedAt: "" })),
    }).editorDocument;
    editor.commands.setContent(loaded);
    assert.match(editor.getText(), /New text/);
    const table = editor.state.doc.firstChild!;
    assert.equal(TableMap.get(table).width, 3);
    assert.equal(TableMap.get(table).problems, null);
  });
  it("keeps table geometry through repeated merge/split and row/column operations", () => {
    const editor = editorFor("<p></p>"); editor.commands.insertTable({ rows: 3, cols: 3 });
    for (let index = 0; index < 3; index++) {
      let position = 0; editor.state.doc.descendants((node, pos) => { if (node.type.name === "table") position = pos; });
      const map = TableMap.get(editor.state.doc.nodeAt(position)!);
      editor.view.dispatch(editor.state.tr.setSelection(new CellSelection(editor.state.doc.resolve(position + 1 + map.map[0]), editor.state.doc.resolve(position + 1 + map.map[1]))));
      assert.equal(editor.commands.mergeCells(), true); assert.equal(editor.commands.splitCell(), true);
      editor.commands.setTextSelection(position + 3);
      assert.equal(editor.commands.addRowAfter(), true); assert.equal(editor.commands.deleteRow(), true);
      assert.equal(editor.commands.addColumnAfter(), true); assert.equal(editor.commands.deleteColumn(), true);
      editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
      const table = editor.state.doc.firstChild!;
      assert.equal(TableMap.get(table).width, 3); assert.equal(TableMap.get(table).height, 3); assert.equal(TableMap.get(table).problems, null);
    }
  });
  it("keeps a divider while typing after it and through Markdown reopen", () => {
    const editor = editorFor("<p>Верх</p>"); editor.commands.setTextSelection(5); editor.commands.setHorizontalRule(); editor.commands.insertContent("Низ");
    assert.ok(editor.view.dom.querySelector("hr"));
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    assert.ok(editor.view.dom.querySelector("hr")); assert.match(editor.getText(), /Низ/);
  });
  it("indents a paragraph only in sidecar, clamps it and reverses with Shift-Tab", () => {
    const editor = editorFor("<p>Текст</p>"); editor.commands.setTextSelection(2);
    for (let index = 0; index < 10; index++) assert.equal(tab(editor).defaultPrevented, true);
    assert.equal(editor.getAttributes("paragraph").indent, 6);
    const saved = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument); assert.equal(saved.contentMarkdown, "Текст");
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument)); editor.commands.setTextSelection(2);
    assert.equal(editor.getAttributes("paragraph").indent, 6); tab(editor, true); assert.equal(editor.getAttributes("paragraph").indent, 5);
  });
  it("indents and outdents multiple code lines without leaving the editor", () => {
    const editor = editorFor("<pre><code>one\ntwo</code></pre>"); editor.commands.setTextSelection({ from: 1, to: 8 });
    tab(editor); assert.equal(editor.state.doc.firstChild!.textContent, "  one\n  two"); tab(editor, true); assert.equal(editor.state.doc.firstChild!.textContent, "one\ntwo");
  });
  it("uses list sink/lift and preserves nested Markdown on reopen", () => {
    const editor = editorFor(markdownToTiptapDoc("- Первый\n- Второй"));
    let second = 0; editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === "Второй") second = pos; });
    editor.commands.setTextSelection(second + 1); tab(editor);
    assert.ok(editor.view.dom.querySelector("ul ul"));
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument)); assert.ok(editor.view.dom.querySelector("ul ul"));
  });
  it("retains standard table Tab navigation", () => {
    const editor = editorFor("<p></p>"); editor.commands.insertTable({ rows: 2, cols: 2 });
    const before = editor.state.selection.from; tab(editor); assert.notEqual(editor.state.selection.from, before);
    assert.equal(editor.getAttributes("paragraph").indent, 0);
  });
  for (const source of ["1. Первый\n2. Второй", "- [ ] Первый\n- [x] Второй"]) it(`indents and outdents ${source.startsWith("1.") ? "numbered" : "task"} items without losing persistence`, () => {
    const editor = editorFor(markdownToTiptapDoc(source));
    let position = 0; editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === "Второй") position = pos; });
    editor.commands.setTextSelection(position + 1); tab(editor);
    const listType = source.startsWith("1.") ? "orderedList" : "taskList";
    assert.equal(editor.getJSON().content![0].content![0].content!.some((node) => node.type === listType), true);
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    position = 0; editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === "Второй") position = pos; });
    editor.commands.setTextSelection(position + 1); tab(editor, true);
    assert.equal(editor.getJSON().content![0].content!.length, 2, JSON.stringify(editor.getJSON()));
    assert.match(editor.getText(), /Второй/);
  });
  it("shows actual URL metadata for the shared tooltip and contains no Formula commands", () => {
    const editor = editorFor(markdownToTiptapDoc("[Ссылка](https://example.com/very-long) и $100 и $x$"));
    assert.equal(editor.view.dom.querySelector("[data-tooltip]")?.getAttribute("data-tooltip"), "https://example.com/very-long");
    assert.equal(editor.schema.nodes.formulaInline, undefined); assert.equal(editor.schema.nodes.formulaBlock, undefined);
    assert.equal("insertFormulaInline" in editor.commands, false); assert.match(editor.getText(), /\$100 и \$x\$/);
  });
});

function noteWith(text: string, id = "phase-c"): Note {
  return { id, title: "Phase C", editorDocument: markdownToTiptapDoc(text), contentMarkdown: text, plainText: text, contentHtml: "", contentVersion: 1,
    contentSidecars: [], attachments: [], createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", summary: text, dateLabel: "01.10.2026", noteDate: "2026-10-01", project: "", tags: [], wordCount: 1 };
}

describe("Phase C mounted EditorArea synchronization and context menu", () => {
  async function mount() {
    mockIPC((command) => command === "get_note_ai_status" ? { available: false, privacyAccepted: false, reason: "no_provider" } : []);
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    const noop = () => {}; const asyncNoop = async () => {};
    const props: ComponentProps<typeof EditorArea> = {
      note: noteWith("Первая строка\n\nПоследняя строка"), documentReloadGeneration: 0, editorContentWidth: 840, editorContentOffset: 0, isFocusMode: false,
      onEditorChange: noop, onArchiveNote: noop, onDeleteNote: noop, onDuplicateNote: noop, onEditorPageLayoutChange: noop, onEditorPageLayoutReset: noop,
      onExitFocus: noop, onExportMarkdown: noop, onMoveNote: asyncNoop, onCreateProjectForNote: asyncNoop, onRemoveNoteFromProject: asyncNoop,
      onMakeNoteTagPrimary: asyncNoop, onImportMarkdown: async () => 0, onOpenChat: noop, onOpenAttachment: asyncNoop, onOpenNote: noop,
      onOpenSettingsModels: noop, onCreateNoteTag: asyncNoop, onPickAndStoreAttachment: async () => null, onRenameNote: asyncNoop, onRetrySave: noop,
      onSetNoteTag: asyncNoop, onRevealAttachment: asyncNoop, onSelectionTextChange: noop, onStoreAttachment: async () => { throw new Error("Not used"); },
      onTogglePin: noop, onToggleFocus: noop, onToast: noop, projectOptions: [], saveStatus: "saved", semanticOpenTarget: null, tagOptions: [],
    };
    const render = async () => { await act(async () => root!.render(h(EditorArea, props))); };
    await render();
    const editor = (container.querySelector(".tiptap") as HTMLElement & { editor: Editor }).editor;
    return { props, editor, container, render };
  }
  it("does not reload a newer live document or move selection on a lossy save acknowledgement", async () => {
    const { props, editor, container, render } = await mount(); const element = container.querySelector(".tiptap");
    await act(async () => { editor.commands.setTextSelection({ from: 2, to: 5 }); editor.commands.setBold(); });
    const selection = editor.state.selection.toJSON(); const document = editor.getJSON();
    props.note = { ...props.note, contentVersion: 2, editorDocument: markdownToTiptapDoc("Older server text") }; await render();
    assert.deepEqual(editor.state.selection.toJSON(), selection); assert.deepEqual(editor.getJSON(), document); assert.equal(container.querySelector(".tiptap"), element);
    props.note = { ...props.note, contentVersion: 3 }; await render(); assert.deepEqual(editor.state.selection.toJSON(), selection);
  });
  it("reloads same-ID restore only on an explicit generation and still switches notes", async () => {
    const { props, editor, render } = await mount();
    props.note = { ...props.note, contentVersion: 2, editorDocument: markdownToTiptapDoc("Восстановлено") }; props.documentReloadGeneration++; await render();
    assert.equal(editor.getText(), "Восстановлено");
    props.note = noteWith("Другая", "other"); await render(); assert.equal(editor.getText(), "Другая");
  });
  it("keeps the live caret and document during ten rapid edits and save acknowledgements", async () => {
    const { props, editor, render } = await mount();
    for (let index = 0; index < 10; index++) {
      await act(async () => { editor.commands.setTextSelection(4); editor.commands.insertContent(String(index)); });
      const document = editor.getJSON(); const selection = editor.state.selection.toJSON();
      props.note = { ...props.note, contentVersion: index + 2, editorDocument: markdownToTiptapDoc("Server acknowledgement") };
      await render();
      assert.deepEqual(editor.getJSON(), document); assert.deepEqual(editor.state.selection.toJSON(), selection);
    }
  });
  it("formats the saved selection through a real right-click menu and leaves normal inputs native", async () => {
    const { editor, container } = await mount();
    await act(async () => editor.commands.setTextSelection({ from: 1, to: 6 }));
    const selection = editor.state.selection.toJSON();
    await act(async () => editor.view.dom.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 900, clientY: 600 })));
    const menu = document.querySelector('[aria-label="Форматирование текста"]'); assert.ok(menu);
    await act(async () => (menu.querySelector('[data-context-action="bold"]') as HTMLButtonElement).click());
    assert.deepEqual(editor.state.selection.toJSON(), selection); assert.equal(editor.isActive("bold"), true); assert.equal(document.querySelector('[aria-label="Форматирование текста"]'), null);
    const input = container.querySelector("input")!;
    const event = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }); input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false); assert.equal(document.querySelector('[aria-label="Форматирование текста"]'), null);
  });
});
