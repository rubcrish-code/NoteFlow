import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor, Node as TiptapNode } from "@tiptap/core";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { Slice } from "@tiptap/pm/model";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import type { EditorDocument, Note } from "../src/app/types";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../src/features/editor/editorContentSerializer";
import { markdownToTiptapDoc } from "../src/features/editor/markdownService";
import { applyEditorFormattingValue, runEditorFormattingCommand } from "../src/features/editor/editorFormattingCommands";
import type { EditorToolbarActionId } from "../src/features/editor/editorToolbarLayout";
import { scrollToNoteHeading } from "../src/features/editor/headingAnchors";

// Only synthetic fixtures run here; an executable sentinel avoids a false XSS pass from disabled scripts.
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true, runScripts: "dangerously" });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node,
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
  const mixedLists = [
    { name: "loose bullet and task siblings", source: "- обычный\n- второй\n\n- [ ] задача\n- [x] готово", tasks: ["задача", "готово"] },
    { name: "bullet to nested task", source: "- обычный\n  - [ ] задача A\n  - [x] задача B\n- конец", tasks: ["задача A", "задача B"] },
    { name: "task to nested bullet", source: "- [ ] задача A\n  - обычный\n  - второй\n- [x] задача B", tasks: ["задача A", "задача B"] },
    { name: "numbered to nested task", source: "3. обычный\n   - [ ] задача A\n   - [x] задача B\n4. конец", tasks: ["задача A", "задача B"] },
    { name: "task to nested numbered", source: "- [ ] задача A\n  3. обычный\n  4. второй\n- [x] задача B", tasks: ["задача A", "задача B"] },
    { name: "loose formatted tasks with links", source: "- обычный\n\n- [ ] **задача A**\n- [x] _задача B_ [ссылка](https://example.com/)", tasks: ["задача A", "задача B ссылка"] },
    { name: "multiple mixed nesting levels", source: "- обычный\n  - [ ] задача A\n    2. второй\n       - [x] задача B", tasks: ["задача A", "задача B"] },
  ];
  for (const fixture of mixedLists) it(`keeps ${fixture.name} canonical over three storage/reopen cycles`, () => {
    const editor = editorFor(markdownToTiptapDoc(fixture.source));
    const taskTexts: string[] = [];
    editor.state.doc.descendants((node) => { if (node.type.name === "taskItem") taskTexts.push(node.firstChild!.textContent); });
    assert.deepEqual(taskTexts, fixture.tasks);
    const document = editor.getJSON() as EditorDocument;
    const listStructure = (doc: EditorDocument) => doc.content?.filter((node) => ["bulletList", "orderedList", "taskList"].includes(node.type));
    const initial = serializeEditorDocumentForStorage(document);
    for (let cycle = 0; cycle < 3; cycle++) {
      editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
      assert.deepEqual(listStructure(editor.getJSON() as EditorDocument), listStructure(document), `document cycle ${cycle}`);
      const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
      assert.equal(stored.contentMarkdown, initial.contentMarkdown, `Markdown cycle ${cycle}`);
      assert.equal(stored.plainText, initial.plainText);
      assert.doesNotMatch(stored.contentMarkdown, /\[[ x]\] \[[ x]\]/);
    }
  });
  for (const fixture of mixedLists.slice(1, 3)) it(`persists Tab/Shift+Tab in ${fixture.name}`, () => {
    const editor = editorFor(markdownToTiptapDoc(fixture.source));
    const text = fixture.name.startsWith("bullet") ? "задача B" : "второй";
    const nodeType = fixture.name.startsWith("bullet") ? "taskItem" : "listItem";
    const before = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument).contentMarkdown;
    let position = 0;
    editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) position = pos; });
    editor.commands.setTextSelection(position + 1);
    assert.equal(tab(editor).defaultPrevented, true);
    assert.ok(editor.state.selection.$from.depth > 4);
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    position = 0;
    editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) position = pos; });
    editor.commands.setTextSelection(position + 1);
    assert.equal(editor.state.selection.$from.node(-1).type.name, nodeType);
    assert.equal(tab(editor, true).defaultPrevented, true);
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    assert.equal(serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument).contentMarkdown, before);
  });
  it("retains literal checkbox-looking text outside structural task tokens", () => {
    const source = "Обычный текст [ ] и [x].\n\n- обычный\n\n- [ ] \\[ \\] намеренный текст\n- [x] код `[x]`";
    const editor = editorFor(markdownToTiptapDoc(source));
    assert.match(editor.getText(), /Обычный текст \[ \] и \[x\]/);
    assert.match(editor.getText(), /\[ \] намеренный текст/);
    assert.match(editor.getText(), /код \[x\]/);
    const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
    editor.commands.setContent(reload(editor.getJSON() as EditorDocument));
    assert.equal(serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument).contentMarkdown, stored.contentMarkdown);
  });
  it("reopens a rich Markdown-first document after the patched Tiptap update", () => {
    const editor = editorFor(markdownToTiptapDoc("# Раздел\n\n**_Сочетание_** и [Внутри](#раздел)\n\n- [ ] Проверка\n- [x] Готово\n\n| А | Б |\n| --- | --- |\n| 1 | 2 |\n\n:::details Подробнее\nТекст внутри\n:::\n\n:::tip\nПодсказка\n:::\n\n---\n\n![Диаграмма](noteflow-image://diagram)"));
    const before = editor.getJSON() as EditorDocument;
    const stored = serializeEditorDocumentForStorage(before);
    editor.commands.setContent(reload(before));
    const after = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
    assert.equal(after.contentMarkdown, stored.contentMarkdown);
    assert.equal(after.plainText, stored.plainText);
    assert.ok(editor.view.dom.querySelector("h1"));
    assert.ok(editor.view.dom.querySelector("strong em, em strong"));
    assert.equal(editor.view.dom.querySelector('a[href="#раздел"]')?.textContent, "Внутри");
    assert.equal(editor.view.dom.querySelectorAll('li[data-type="taskItem"]').length, 2);
    assert.equal(editor.view.dom.querySelectorAll("tr").length, 2);
    assert.equal(editor.view.dom.querySelectorAll("th, td").length, 4);
    assert.ok(editor.view.dom.querySelector(".details-nodeview"));
    assert.ok(editor.view.dom.querySelector(".callout-tip"));
    assert.ok(editor.view.dom.querySelector("hr"));
    assert.equal(editor.getJSON().content?.find((node) => node.type === "image")?.attrs?.alt, "Диаграмма");
  });
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
  for (const modifier of [{}, { ctrlKey: true }, { metaKey: true }]) it(`cancels the real DOM anchor click before native opener: ${JSON.stringify(modifier)}`, async () => {
    const { props, editor, render } = await mount();
    let saves = 0;
    props.onEditorChange = () => saves++;
    props.note = noteWith("# Раздел один\n\nтекст\n\n## Раздел два\n\nещё текст\n\n[Перейти](#раздел-два)");
    props.documentReloadGeneration++;
    await render();
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>("a")!;
    const documentBefore = editor.getJSON();
    const selectionBefore = editor.state.selection.toJSON();
    const scrolled: string[] = [];
    const previous = dom.window.HTMLElement.prototype.scrollIntoView;
    dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
    let nativeOpens = 0;
    const nativeListener = (event: MouseEvent) => {
      // The native opener's window-level listener sees the DOM click, not ProseMirror's mouseup.
      if (!event.defaultPrevented && event.button === 0 && (anchor.target === "_blank" || event.ctrlKey)) nativeOpens++;
    };
    window.addEventListener("click", nativeListener);
    try {
      const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...modifier });
      await act(async () => { anchor.dispatchEvent(event); });
      assert.equal(event.defaultPrevented, true);
      assert.equal(nativeOpens, 0);
      assert.deepEqual(scrolled, ["раздел-два"]);
      assert.deepEqual(editor.getJSON(), documentBefore);
      assert.deepEqual(editor.state.selection.toJSON(), selectionBefore);
      assert.equal(saves, 0);
      await act(async () => { anchor.click(); anchor.click(); });
      assert.equal(scrolled.length, 3);
      assert.equal(nativeOpens, 0);
      anchor.setAttribute("href", "#missing");
      const missing = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
      await act(async () => { anchor.dispatchEvent(missing); });
      assert.equal(missing.defaultPrevented, true);
      assert.equal(nativeOpens, 0);
    } finally {
      window.removeEventListener("click", nativeListener);
      dom.window.HTMLElement.prototype.scrollIntoView = previous;
    }
  });
  it("routes duplicate heading anchors to the exact generated TOC target", async () => {
    const { props, editor, render } = await mount();
    props.note = noteWith("# Раздел\n\n## Раздел\n\n[Второй](#раздел-1)");
    props.documentReloadGeneration++;
    await render();
    let target = "";
    const previous = dom.window.HTMLElement.prototype.scrollIntoView;
    dom.window.HTMLElement.prototype.scrollIntoView = function () { target = this.id; };
    try {
      await act(async () => { editor.view.dom.querySelector<HTMLAnchorElement>("a")!.click(); });
      assert.equal(target, "раздел-1");
      assert.equal(scrollToNoteHeading(editor.view, "#%invalid"), false);
    } finally { dom.window.HTMLElement.prototype.scrollIntoView = previous; }
  });
  for (const href of ["https://example.com/", "http://example.com/", "javascript:alert(1)"]) it(`keeps live editor external-link policy for ${href}`, async () => {
    const { editor } = await mount();
    await act(async () => { editor.commands.setContent(markdownToTiptapDoc("[Ссылка](https://example.com/)")); });
    const anchor = editor.view.dom.querySelector<HTMLAnchorElement>("a")!;
    anchor.setAttribute("href", href);
    const opened: unknown[] = [];
    mockIPC((command, args) => { if (command === "plugin:opener|open_url") opened.push(args?.url); return []; });
    for (const modifier of [{}, { ctrlKey: true }, { metaKey: true }]) {
      const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, ...modifier });
      await act(async () => { anchor.dispatchEvent(event); });
      assert.equal(event.defaultPrevented, true);
    }
    assert.deepEqual(opened, href.startsWith("http") ? [href, href] : []);
  });
  async function paste(editor: Editor, text: string, html = "") {
    const event = new dom.window.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: {
      files: [], items: [], types: html ? ["text/plain", "text/html"] : ["text/plain"],
      getData: (type: string) => type === "text/html" ? html : type === "text/plain" ? text : "",
    } });
    await act(async () => { editor.commands.selectAll(); editor.view.dom.dispatchEvent(event); });
    return event;
  }
  it("pastes mixed Markdown, toggles tasks and saves canonical state without a caret resync", async () => {
    const { props, editor, container, render } = await mount();
    let saved: ReturnType<typeof serializeEditorDocumentForStorage> | undefined;
    props.onEditorChange = (_id, document) => { saved = serializeEditorDocumentForStorage(document); };
    await render();
    await paste(editor, "- обычный\n\n- [ ] задача A\n- [x] задача B");
    assert.equal(editor.view.dom.querySelectorAll('input[type="checkbox"]').length, 2);
    assert.doesNotMatch(editor.getText(), /\[[ x]\]/);
    const element = container.querySelector(".tiptap");
    await act(async () => { editor.view.dom.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    assert.ok(saved);
    assert.match(saved.contentMarkdown, /- \[x\] задача A/);
    let position = 0;
    editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === "задача A") position = pos; });
    await act(async () => { editor.commands.setTextSelection(position + 3); editor.commands.insertContent("!"); });
    const selection = editor.state.selection.toJSON();
    props.note = { ...props.note, contentVersion: 2, editorDocument: saved.editorDocument, contentMarkdown: saved.contentMarkdown };
    await render();
    assert.equal(container.querySelector(".tiptap"), element);
    assert.deepEqual(editor.state.selection.toJSON(), selection);
    const markdown = saved.contentMarkdown;
    for (let cycle = 0; cycle < 3; cycle++) {
      await act(async () => { editor.commands.setContent(reload(editor.getJSON() as EditorDocument)); });
      assert.equal(serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument).contentMarkdown, markdown);
      assert.deepEqual([...editor.view.dom.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map((input) => input.checked), [true, true]);
    }
  });
  it("rejects executable clipboard HTML and slice context without breaking the live editor", { timeout: 5_000 }, async () => {
    const sentinel = "__NOTEFLOW_XSS_TEST__";
    const probe = document.createElement("button");
    probe.setAttribute("onclick", `window.${sentinel} = true`);
    probe.click();
    assert.equal(Reflect.get(dom.window, sentinel), true, "The isolated DOM must actually execute a benign handler");
    Reflect.deleteProperty(dom.window, sentinel);
    const { editor } = await mount();
    const html = `<p data-pm-slice='0 0 ["blockquote",{"onerror":"window.${sentinel} = true"}]'>Безопасный текст</p>`
      + `<img src="data:," onerror="window.${sentinel} = true">`
      + `<script>window.${sentinel} = true</script>`;
    await paste(editor, "Безопасный текст", html);
    assert.match(editor.getText(), /Безопасный текст/);
    assert.equal(editor.view.dom.querySelector("script, [onerror], [onclick]"), null);
    assert.equal(Reflect.get(dom.window, sentinel), undefined);
    const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
    assert.doesNotMatch(stored.contentMarkdown, /__NOTEFLOW_XSS_TEST__|onerror|<script/);
    await act(async () => { editor.commands.insertContent(" Продолжение"); });
    assert.match(editor.getText(), /Продолжение/);
    assert.equal(Reflect.get(dom.window, sentinel), undefined);
  });
  for (const fixture of [
    { name: "plain text", text: "Обычная строка", selector: "p" },
    { name: "formatted HTML", text: "Жирный и курсив", html: "<p><strong>Жирный</strong> и <em>курсив</em></p>", selector: "strong", extra: "em" },
    { name: "Markdown", text: "# Сразу заголовок\n\n**Жирный**", selector: "h1", extra: "strong" },
    { name: "link", text: "Ссылка", html: '<p><a href="https://example.com/">Ссылка</a></p>', selector: 'a[href="https://example.com/"]' },
    { name: "list", text: "Первый Второй", html: "<ul><li><p>Первый</p></li><li><p>Второй</p></li></ul>", selector: "ul li" },
    { name: "table", text: "Ячейка", html: "<table><tbody><tr><th><p>А</p></th><th><p>Б</p></th></tr><tr><td><p>Ячейка</p></td><td><p>Значение</p></td></tr></tbody></table>", selector: "table td" },
  ]) it(`pastes ${fixture.name} through the mounted NoteFlow editor`, { timeout: 5_000 }, async () => {
    const { editor } = await mount();
    const event = await paste(editor, fixture.text, fixture.html);
    assert.equal(event.defaultPrevented, true);
    assert.ok(editor.view.dom.querySelector(fixture.selector));
    if (fixture.extra) assert.ok(editor.view.dom.querySelector(fixture.extra));
    assert.match(editor.getText(), fixture.name === "Markdown" ? /Сразу заголовок/ : new RegExp(fixture.text.split(" ")[0]));
    const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
    await act(async () => { editor.commands.setContent(reload(editor.getJSON() as EditorDocument)); });
    assert.equal(serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument).contentMarkdown, stored.contentMarkdown);
  });
  it("validates attributes reconstructed from clipboard slice context", { timeout: 5_000 }, () => {
    // Test-only validator probes the advisory's exact context reconstruction boundary.
    const contextNode = TiptapNode.create({
      name: "securityContext", group: "block", content: "block+",
      addAttributes: () => ({ label: { default: "safe", validate: "string" } }),
      parseHTML: () => [{ tag: "section[data-security-context]" }],
      renderHTML: ({ node }) => ["section", { "data-security-context": node.attrs.label }, 0],
    });
    const element = document.createElement("div"); document.body.append(element);
    const editor = new Editor({ element, extensions: [...createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), contextNode], content: "<p></p>" });
    editors.push(editor);
    let pasted: Slice | undefined;
    editor.view.setProps({ handlePaste: (_view, _event, slice) => { pasted = slice; return true; } });
    const event = new dom.window.Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    assert.equal(editor.view.pasteHTML(`<p data-pm-slice='0 0 ["securityContext",{"label":["img",{"onerror":"window.__NOTEFLOW_XSS_TEST__ = true"}]}]'>Текст</p>`, event), true);
    assert.equal(pasted?.content.firstChild?.type.name, "paragraph");
    assert.equal(pasted?.content.firstChild?.textContent, "Текст");
    assert.equal(editor.view.dom.querySelector("section[data-security-context], [onerror]"), null);
    assert.equal(Reflect.get(dom.window, "__NOTEFLOW_XSS_TEST__"), undefined);
    assert.equal(editor.view.pasteHTML(`<p data-pm-slice='0 0 ["securityContext",{"label":"valid"}]'>Текст</p>`, event), true);
    assert.equal(pasted?.content.firstChild?.type.name, "securityContext");
    assert.equal(pasted?.content.firstChild?.attrs.label, "valid");
  });
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
    const children = Array.from(menu.children);
    assert.deepEqual(children.slice(0, 3).map((child) => child.textContent), ["Вырезать", "Копировать", "Вставить"]);
    assert.equal(children[3].getAttribute("role"), "separator");
    assert.ok(children[4].querySelector("[data-context-action]"));
    assert.deepEqual(editor.state.selection.toJSON(), selection);
    const escape = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => document.dispatchEvent(escape));
    assert.equal(escape.defaultPrevented, true);
    assert.equal(document.querySelector('[aria-label="Форматирование текста"]'), null);
    assert.deepEqual(editor.state.selection.toJSON(), selection);
    await act(async () => editor.view.dom.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    const reopened = document.querySelector('[aria-label="Форматирование текста"]')!;
    await act(async () => (reopened.querySelector('[data-context-action="bold"]') as HTMLButtonElement).click());
    assert.deepEqual(editor.state.selection.toJSON(), selection); assert.equal(editor.isActive("bold"), true); assert.equal(document.querySelector('[aria-label="Форматирование текста"]'), null);
    const input = container.querySelector("input")!;
    const event = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }); input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false); assert.equal(document.querySelector('[aria-label="Форматирование текста"]'), null);
  });
  for (const label of ["Вырезать", "Копировать", "Вставить"]) it(`reuses the existing context-menu clipboard behavior: ${label}`, async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writes: string[] = []; let reads = 0;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { writes.push(text); },
      readText: async () => { reads++; return "**Буфер**"; },
    } });
    try {
      const { editor } = await mount();
      await act(async () => editor.commands.setTextSelection({ from: 1, to: 6 }));
      const before = editor.getJSON(); const selection = editor.state.selection.toJSON();
      await act(async () => editor.view.dom.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.editor-context-menu [role="menuitem"]'));
      const button = buttons.find((item) => item.textContent === label)!;
      assert.equal(button.disabled, false);
      await act(async () => button.click());
      assert.equal(document.querySelector(".editor-context-menu"), null);
      assert.deepEqual(writes, label === "Вставить" ? [] : ["Перва"]);
      assert.equal(reads, label === "Вставить" ? 1 : 0);
      if (label === "Копировать") {
        assert.deepEqual(editor.getJSON(), before);
        assert.deepEqual(editor.state.selection.toJSON(), selection);
      } else if (label === "Вырезать") assert.ok(editor.getText().startsWith("я строка"));
      else {
        assert.equal(editor.getText(), "Буфер\n\nя строка\n\nПоследняя строка");
        assert.equal(editor.view.dom.querySelector("strong")?.textContent, "Буфер");
      }
    } finally {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
  it("preserves context-menu availability for empty selection and missing clipboard API", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    try {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      const { editor } = await mount();
      await act(async () => editor.view.dom.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
      const editButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.editor-context-menu [role="menuitem"]')).slice(0, 3);
      assert.deepEqual(editButtons().map((button) => button.disabled), [true, true, true]);
      await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {}, readText: async () => "" } });
      await act(async () => {
        editor.commands.setTextSelection(1);
        editor.view.dom.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      });
      assert.deepEqual(editButtons().map((button) => button.disabled), [true, true, false]);
    } finally {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
