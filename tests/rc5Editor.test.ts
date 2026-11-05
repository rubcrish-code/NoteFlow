import assert from "node:assert/strict";
import { after, afterEach, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h, Profiler, useState } from "react";
import { MenuPopover } from "../src/shared/MenuPopover";
import { Editor } from "@tiptap/core";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { closeHistory } from "@tiptap/pm/history";
import { toggleSelectedTableHeader } from "../src/features/editor/tableSelectionHeaders";
import { captureMarkdownImportSelection, insertImportedMarkdown } from "../src/features/editor/insertImportedMarkdown";
import { prepareMarkdownText } from "../src/features/settings/markdownImport";
import { noteSearchKey } from "../src/features/editor/noteSearch";
import { paragraphIndentLimit } from "../src/features/editor/editorInteractions";
import { imageResizeStart, resizeImageBox } from "../src/features/imageEditor/imageGeometry";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../src/features/editor/editorContentSerializer";
import { runEditorFormattingCommand } from "../src/features/editor/editorFormattingCommands";
import { scrollToSearchMatch } from "../src/features/editor/scrollToSearchMatch";
import { droppedFileKind, nativeDropPoint } from "../src/features/editor/editorNativeDrop";
import type { EditorDocument } from "../src/app/types";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
previous.set("ResizeObserver", Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"));
Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, DOMParser: dom.window.DOMParser, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const { createEditorExtensions } = await import("../src/features/editor/EditorArea");
const { createRoot } = await import("react-dom/client");
const { NoteSearchBar } = await import("../src/features/editor/NoteSearchBar");
const { NoteMenuPopover } = await import("../src/features/editor/NoteMenuPopover");
const editors: Editor[] = [];
function create(content = "<p>Текст</p>") {
  const element = document.createElement("div"); document.body.append(element);
  const editor = new Editor({ element, extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content });
  editors.push(editor); return editor;
}
function reload(editor: Editor) {
  const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
  editor.commands.setContent(buildEditorDocumentFromStoredNoteContent({ contentJson: { type: "doc", content: [] }, contentMarkdown: stored.contentMarkdown, plainText: stored.plainText, contentSidecars: stored.contentSidecars.map((sidecar) => ({ ...sidecar, createdAt: "", updatedAt: "" })) }, { warn: () => assert.fail("fallback") }).editorDocument);
  return stored;
}
afterEach(() => { editors.splice(0).forEach((editor) => editor.destroy()); document.body.replaceChildren(); });
after(() => { dom.window.close(); for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); } });

for (const scale of [1, 1.6]) it(`image resize uses layout coordinates with no initial jump at ${scale * 100}%`, () => {
  const start = imageResizeStart({ width: 400 * scale, height: 200 * scale }, { width: 400, height: 200 });
  assert.deepEqual(start.size, { width: 400, height: 200 });
  assert.deepEqual(resizeImageBox(start.size, "se", 32 * scale / start.scaleX, 0, { minWidth: 120, minHeight: 72, maxWidth: 800, maxHeight: 800 }), { width: 432, height: 216 });
});
it("in-note search crosses mark boundaries and does not mutate Markdown, sidecar, selection or autosave", () => {
  const editor = create("<p><strong>Прив</strong>ет ПРИВЕТ привет</p>");
  const before = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
  const selection = editor.state.selection.toJSON(); let updates = 0; editor.on("update", () => updates++);
  editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: "привет" }));
  assert.equal(noteSearchKey.getState(editor.state)?.matches.length, 3);
  assert.equal(editor.view.dom.querySelectorAll(".note-search-match").length, 4, "one match spans two marked DOM nodes");
  editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { index: 2 }));
  assert.equal(noteSearchKey.getState(editor.state)?.index, 2);
  assert.deepEqual(serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument), before);
  assert.deepEqual(editor.state.selection.toJSON(), selection); assert.equal(updates, 0);
  editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: "" }));
  assert.equal(editor.view.dom.querySelector(".note-search-match"), null);
});
it("clear formatting uses a plain SVG X and preserves the existing command and undo/redo", () => {
  const editor = create("<p><strong>Форматирование</strong></p>");
  editor.commands.selectAll(); const before = editor.getJSON();
  assert.equal(runEditorFormattingCommand(editor, "clear"), true);
  assert.equal(editor.view.dom.querySelector("strong"), null);
  editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
  editor.commands.redo(); assert.equal(editor.view.dom.querySelector("strong"), null);
});
it("top note menu includes compact action icons without changing handlers or order", async () => {
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const { Icon } = await import("../src/shared/Icon");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const clear = renderToStaticMarkup(h(Icon, { name: "clear" }));
  assert.match(clear, /d="M6 6l12 12M18 6 6 18"/); assert.equal((clear.match(/<path /g) ?? []).length, 1);
  let duplicate = ""; let closed = 0; const noop = () => {};
  try {
    await act(async () => root.render(h(NoteMenuPopover, { note: { id: "qa", title: "QA", pinned: false, projectId: "project" } as import("../src/app/types").Note, onArchive: noop, onClose: () => { closed++; }, onDelete: noop, onDuplicate: (id) => { duplicate = id; }, onExportMarkdown: noop, onImportMarkdown: noop, onMove: async () => {}, onCreateProject: noop, onRemoveFromProject: async () => {}, onTogglePin: noop, projectOptions: [] })));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".note-menu-actions-list button")];
    assert.deepEqual(buttons.map((button) => button.textContent), ["Дублировать", "Закрепить заметку", "Добавить в проект", "Убрать из проекта", "Импортировать Markdown", "Архивировать", "Экспортировать", "Удалить"]);
    buttons.forEach((button) => assert.equal(button.querySelectorAll("svg").length, 1));
    await act(async () => buttons[0].click()); assert.equal(duplicate, "qa"); assert.equal(closed, 1);
  } finally { await act(async () => root.unmount()); }
});
it("search updates after typing and undo, supports partial Russian matches", () => {
  const editor = create("<p>Модель</p>");
  editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: "мод" }));
  assert.equal(noteSearchKey.getState(editor.state)?.matches.length, 1);
  editor.commands.insertContent("модель "); assert.equal(noteSearchKey.getState(editor.state)?.matches.length, 2);
  editor.commands.undo(); assert.equal(noteSearchKey.getState(editor.state)?.matches.length, 1);
});
it("search tracks more than 100 matches, remaps its active position and resets on a new query", () => {
  const editor = create(`<p>${"слово ".repeat(120)}другое</p>`);
  editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: "слово" }));
  assert.equal(noteSearchKey.getState(editor.state)?.matches.length, 120);
  editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { index: 100 }));
  const before = noteSearchKey.getState(editor.state)!.matches[100].from;
  editor.commands.setTextSelection(1); editor.commands.insertContent("слово ");
  assert.equal(noteSearchKey.getState(editor.state)?.index, 101);
  assert.equal(noteSearchKey.getState(editor.state)!.matches[101].from, before + 6);
  editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: "другое" }));
  assert.equal(noteSearchKey.getState(editor.state)?.index, 0);
});
it("F3 navigation wraps in the editor, ignores unrelated inputs and Escape clears decorations", async () => {
  const editor = create("<p>Текст текст</p>"); const before = editor.getJSON();
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const other = document.createElement("input"); document.body.append(other);
  try {
    await act(async () => root.render(h(NoteSearchBar, { editor, initialQuery: "текст" })));
    const key = async (target: Element, value: string, shiftKey = false) => act(async () => target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true })));
    await key(other, "F3"); assert.equal(noteSearchKey.getState(editor.state)?.index, 0);
    await key(editor.view.dom, "F3"); assert.equal(noteSearchKey.getState(editor.state)?.index, 1);
    await key(editor.view.dom, "F3"); assert.equal(noteSearchKey.getState(editor.state)?.index, 0);
    await key(editor.view.dom, "F3", true); assert.equal(noteSearchKey.getState(editor.state)?.index, 1);
    await key(editor.view.dom, "Escape"); assert.equal(editor.view.dom.querySelector(".note-search-match"), null);
    assert.deepEqual(editor.getJSON(), before);
  } finally { await act(async () => root.unmount()); }
});
it("FTS-driven search keeps query focus and navigates matches without changing the document", async () => {
  const editor = create("<p>Поиск ПОИСК поиск</p>");
  const before = editor.getJSON();
  const globalQuery = document.createElement("input"); document.body.append(globalQuery); globalQuery.focus();
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(h(NoteSearchBar, { editor, initialQuery: "по" })));
    assert.equal(document.activeElement, globalQuery);
    await act(async () => root.render(h(NoteSearchBar, { editor, initialQuery: "поиск" })));
    assert.equal(document.activeElement, globalQuery);
    assert.equal(container.querySelector<HTMLInputElement>("input")?.value, "поиск");
    assert.ok(container.querySelector("input")?.classList.contains("nf-input"));
    assert.equal(container.querySelector('[role="status"]')?.textContent, "1 из 3");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Следующее совпадение"]')!.click());
    assert.equal(container.querySelector('[role="status"]')?.textContent, "2 из 3");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Предыдущее совпадение"]')!.click());
    assert.equal(container.querySelector('[role="status"]')?.textContent, "1 из 3");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Закрыть поиск в заметке"]')!.click());
    assert.equal(container.querySelector('[role="search"]'), null);
    assert.equal(editor.view.dom.querySelector(".note-search-match"), null);
    assert.deepEqual(editor.getJSON(), before);
  } finally { await act(async () => root.unmount()); }
});
it("search counter does not rerender for position-only changes and reads fresh ranges when navigating", async () => {
  const editor = create("<p>слово слово</p>");
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  let commits = 0;
  try {
    await act(async () => root.render(h(Profiler, { id: "search", onRender: () => { commits++; } }, h(NoteSearchBar, { editor, initialQuery: "слово" }))));
    commits = 0;
    await act(async () => { editor.commands.insertContentAt(1, "префикс "); });
    assert.equal(commits, 0, "unchanged count/index must not compare/render the DecorationSet");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Следующее совпадение"]')!.click());
    assert.equal(noteSearchKey.getState(editor.state)!.index, 1);
    assert.equal(container.querySelector('[role="status"]')?.textContent, "2 из 2");
    await act(async () => { editor.commands.insertContentAt(1, "слово "); });
    assert.equal(container.querySelector('[role="status"]')?.textContent, "3 из 3");
  } finally { await act(async () => root.unmount()); }
});
it("physical Ctrl+F opens NoteFlow search in a Russian keyboard layout and ignores other fields", async () => {
  const editor = create("<p>Текст</p>");
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const other = document.createElement("input"); document.body.append(other);
  try {
    await act(async () => root.render(h(NoteSearchBar, { editor })));
    const unrelated = new dom.window.KeyboardEvent("keydown", { key: "а", code: "KeyF", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { other.dispatchEvent(unrelated); });
    assert.equal(unrelated.defaultPrevented, false);
    assert.equal(container.querySelector('[role="search"]'), null);
    const find = new dom.window.KeyboardEvent("keydown", { key: "а", code: "KeyF", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { editor.view.dom.dispatchEvent(find); });
    assert.equal(find.defaultPrevented, true);
    assert.ok(container.querySelector('[role="search"]'));
  } finally { await act(async () => root.unmount()); }
});
it("Enter and Shift+Enter navigate in opposite directions without changing the document", async () => {
  const editor = create("<p>Текст текст текст</p>"), before = editor.getJSON();
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(h(NoteSearchBar, { editor, initialQuery: "текст" })));
    const input = container.querySelector("input")!;
    for (const [shiftKey, expected] of [[false, 1], [true, 0], [true, 2]] as const) {
      const event = new dom.window.KeyboardEvent("keydown", { key: "Enter", shiftKey, bubbles: true, cancelable: true });
      await act(async () => { input.dispatchEvent(event); });
      assert.equal(event.defaultPrevented, true);
      assert.equal(noteSearchKey.getState(editor.state)!.index, expected);
    }
    assert.deepEqual(editor.getJSON(), before);
  } finally { await act(async () => root.unmount()); }
});
it("find shortcuts do not consume an active IME composition", async () => {
  const editor = create("<p>Текст</p>");
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(h(NoteSearchBar, { editor })));
    const event = new dom.window.KeyboardEvent("keydown", { key: "Process", code: "KeyF", ctrlKey: true, isComposing: true, bubbles: true, cancelable: true });
    await act(async () => { editor.view.dom.dispatchEvent(event); });
    assert.equal(event.defaultPrevented, false);
    assert.equal(container.querySelector('[role="search"]'), null);
  } finally { await act(async () => root.unmount()); }
});

it("Escape closes a formatting popover before find when the editor retains focus", async () => {
  const editor = create("<p>Текст Текст</p>");
  const before = editor.getJSON(); let updates = 0; editor.on("update", () => updates++);
  const anchor = document.body.appendChild(document.createElement("button"));
  const anchorRef = { current: anchor };
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  function Harness() {
    const [open, setOpen] = useState(true);
    return h("div", null,
      h(NoteSearchBar, { editor, initialQuery: "Текст" }),
      h(MenuPopover, { anchorRef, ariaLabel: "Formatting", isOpen: open, onClose: () => setOpen(false), role: "dialog" }, h("button", null, "Action")));
  }
  try {
    await act(async () => root.render(h(Harness)));
    await act(async () => { editor.view.focus(); editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector(".nf-popover"), null);
    assert.ok(document.querySelector('[role="search"]'));
    await act(async () => { editor.view.focus(); editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector('[role="search"]'), null);
    assert.deepEqual(editor.getJSON(), before);
    assert.equal(updates, 0);
  } finally { await act(async () => root.unmount()); }
});
it("Escape closes only note search and restores editor focus and selection without autosave", async () => {
  const editor = create("<p>Текст текст</p>"); editor.commands.setTextSelection({ from: 2, to: 5 });
  const before = editor.getJSON(), selection = editor.state.selection.toJSON(); let updates = 0, bubbled = 0;
  editor.on("update", () => updates++);
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const listener = () => { bubbled++; }; document.addEventListener("keydown", listener);
  try {
    await act(async () => root.render(h(NoteSearchBar, { editor, initialQuery: "текст" })));
    const input = container.querySelector("input")!; input.focus();
    await act(async () => {
      input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await new Promise<void>(resolve => dom.window.requestAnimationFrame(() => dom.window.requestAnimationFrame(() => resolve())));
    });
    assert.equal(container.querySelector('[role="search"]'), null);
    assert.equal(editor.view.hasFocus(), true);
    assert.equal(bubbled, 0);
    assert.equal(updates, 0);
    assert.deepEqual(editor.getJSON(), before);
    assert.deepEqual(editor.state.selection.toJSON(), selection);
  } finally { document.removeEventListener("keydown", listener); await act(async () => root.unmount()); }
});
it("Ctrl+F reveals an FTS-driven query and refocuses the already open input", async () => {
  const editor = create("<p>Текст текст</p>");
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(h(NoteSearchBar, { editor, initialQuery: "текст" })));
    assert.ok(container.querySelector(".from-list"));
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "а", code: "KeyF", ctrlKey: true, bubbles: true, cancelable: true }));
        await new Promise<void>(resolve => dom.window.requestAnimationFrame(() => resolve()));
      });
      assert.equal(container.querySelector(".from-list"), null);
      assert.equal(document.activeElement, container.querySelector("input"));
      assert.equal(container.querySelector<HTMLInputElement>("input")!.value, "текст");
    }
  } finally { await act(async () => root.unmount()); }
});
for (const scale of [1, 1.6]) it(`search uses word coordinates in its own scroll container at ${scale * 100}% and recomputes after resize`, async () => {
  const editor = create(`<p>${"совпадение ".repeat(120)}</p>`);
  const scroll = document.createElement("div"); scroll.className = "ed-scroll";
  editor.view.dom.parentElement!.replaceWith(scroll); scroll.append(editor.view.dom);
  let height = 400; let wordTop = 1000; let target = 0; let behavior: ScrollBehavior | undefined;
  Object.defineProperties(scroll, { offsetHeight: { get: () => height }, clientHeight: { get: () => height }, scrollHeight: { value: 3000 } });
  scroll.getBoundingClientRect = () => new dom.window.DOMRect(0, 100, 600, height * scale);
  scroll.scrollTo = (options: ScrollToOptions | number, _y?: number) => { assert.equal(typeof options, "object"); const value = options as ScrollToOptions; target = value.top!; behavior = value.behavior; };
  editor.view.coordsAtPos = () => ({ top: wordTop, bottom: wordTop + 20 * scale, left: 20, right: 40 });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
  const before = editor.getJSON(); const selection = editor.state.selection.toJSON(); let updates = 0; editor.on("update", () => updates++);
  scrollToSearchMatch(editor.view, { from: 1, to: 11 }, null);
  assert.equal(target, (wordTop + 10 * scale - (100 + height * scale / 2)) / scale);
  assert.equal(behavior, "instant");
  height = 200;
  scrollToSearchMatch(editor.view, { from: 1, to: 11 }, null);
  assert.equal(target, (wordTop + 10 * scale - (100 + height * scale / 2)) / scale);
  wordTop = -100; scrollToSearchMatch(editor.view, { from: 1, to: 11 }, null); assert.equal(target, 0);
  wordTop = 10000; scrollToSearchMatch(editor.view, { from: 1, to: 11 }, null); assert.equal(target, 2800);
  assert.deepEqual(editor.getJSON(), before); assert.deepEqual(editor.state.selection.toJSON(), selection); assert.equal(updates, 0);
});
for (const axis of ["row", "column"] as const) it(`header ${axis} changes the selected middle cells, not the first, and survives canonical reload`, () => {
  const editor = create(); editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false });
  const table = editor.state.doc.firstChild!; const map = TableMap.get(table); const start = 1;
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, start + map.map[4])));
  assert.equal(toggleSelectedTableHeader(axis, editor.state, (tr) => editor.view.dispatch(tr)), true);
  const cells = editor.state.doc.firstChild!;
  assert.equal(cells.child(0).child(0).type.name, "tableCell");
  assert.equal(cells.child(1).child(1).type.name, "tableHeader");
  assert.equal(cells.child(axis === "row" ? 1 : 2).child(axis === "row" ? 2 : 1).type.name, "tableHeader");
  const before = editor.getJSON(); const stored = reload(editor);
  assert.deepEqual(editor.getJSON(), before); assert.doesNotMatch(stored.contentMarkdown, /sidecar|tableHeader|backgroundColor/);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, 1 + TableMap.get(editor.state.doc.firstChild!).map[4])));
  assert.equal(toggleSelectedTableHeader(axis, editor.state, (tr) => editor.view.dispatch(tr)), true);
  assert.equal(editor.state.doc.firstChild!.child(1).child(1).type.name, "tableCell");
});
it("multi-row selection chooses one header row and transforms each merged cell once", () => {
  const editor = create(); editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false });
  let map = TableMap.get(editor.state.doc.firstChild!);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, 1 + map.map[3], 1 + map.map[4]))); editor.commands.mergeCells();
  map = TableMap.get(editor.state.doc.firstChild!);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, 1 + map.map[3], 1 + map.map[8])));
  assert.equal(toggleSelectedTableHeader("row", editor.state, (tr) => editor.view.dispatch(tr)), true);
  assert.equal(editor.state.doc.firstChild!.child(1).child(0).attrs.colspan, 2);
  assert.equal(editor.state.doc.firstChild!.child(2).child(0).type.name, "tableCell");
  assert.equal(editor.state.doc.firstChild!.attrs.headerRow, 1);
});

it("moving and toggling header axes preserves their intersection, undo and Markdown reload", () => {
  const editor = create(); editor.commands.insertTable({ rows: 4, cols: 4, withHeaderRow: true });
  function toggle(axis: "row" | "column", row: number, column: number) {
    const map = TableMap.get(editor.state.doc.firstChild!);
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, 1 + map.map[row * map.width + column])));
    editor.view.dispatch(closeHistory(editor.state.tr));
    toggleSelectedTableHeader(axis, editor.state, (tr) => editor.view.dispatch(tr));
  }
  toggle("column", 1, 2); toggle("row", 3, 0);
  const table = editor.state.doc.firstChild!;
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    assert.equal(table.child(row).child(column).type.name, row === 3 || column === 2 ? "tableHeader" : "tableCell");
  }
  reload(editor);
  assert.equal(editor.state.doc.firstChild!.attrs.headerRow, 3);
  assert.equal(editor.state.doc.firstChild!.attrs.headerColumn, 2);
  toggle("row", 3, 1);
  assert.equal(editor.state.doc.firstChild!.child(3).child(1).type.name, "tableCell");
  assert.equal(editor.state.doc.firstChild!.child(3).child(2).type.name, "tableHeader");
  editor.commands.undo(); assert.equal(editor.state.doc.firstChild!.attrs.headerRow, 3);
  editor.commands.redo(); assert.equal(editor.state.doc.firstChild!.attrs.headerRow, null);
  toggle("column", 0, 1);
  assert.equal(editor.state.doc.firstChild!.child(0).child(2).type.name, "tableCell");
  assert.equal(editor.state.doc.firstChild!.child(0).child(1).type.name, "tableHeader");
});

it("structural edits keep a single managed header row and column", () => {
  const editor = create(); editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false });
  const select = (row: number, column: number) => {
    const map = TableMap.get(editor.state.doc.firstChild!);
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, 1 + map.map[row * map.width + column])));
  };
  select(1, 1);
  toggleSelectedTableHeader("row", editor.state, (tr) => editor.view.dispatch(tr));
  toggleSelectedTableHeader("column", editor.state, (tr) => editor.view.dispatch(tr));
  editor.commands.addRowBefore();
  const table = editor.state.doc.firstChild!;
  assert.equal(table.attrs.headerRow, 2);
  assert.equal(table.attrs.headerColumn, 1);
  for (let row = 0; row < table.childCount; row++) for (let column = 0; column < table.child(row).childCount; column++) {
    assert.equal(table.child(row).child(column).type.name, row === 2 || column === 1 ? "tableHeader" : "tableCell");
  }
  select(0, 0); editor.commands.addColumnBefore();
  assert.equal(editor.state.doc.firstChild!.attrs.headerColumn, 2);
  select(2, 0); editor.commands.deleteRow();
  assert.equal(editor.state.doc.firstChild!.attrs.headerRow, null);
  reload(editor);
  assert.equal(editor.state.doc.firstChild!.attrs.headerColumn, 2);
});

it("Markdown import fills the current empty editor without renaming or creating notes and is undoable", () => {
  const editor = create("<p></p>");
  const prepared = prepareMarkdownText("Имя файла не становится названием заметки.md", "# Заголовок\n\n**Текст** и <u>подчёркивание</u>\n\n- [ ] Задача\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");
  insertImportedMarkdown(editor, [prepared], captureMarkdownImportSelection(editor));
  assert.equal(editor.view.dom.querySelector("h1")?.textContent, "Заголовок");
  assert.equal(editor.view.dom.querySelector("strong")?.textContent, "Текст");
  assert.ok(editor.view.dom.querySelector("table"));
  assert.ok(editor.view.dom.querySelector('[data-type="taskList"]'));
  const before = editor.getJSON(); reload(editor); assert.deepEqual(editor.getJSON(), before);
});
it("Markdown import inserts at the captured cursor without replacing selection and supports undo/redo", () => {
  const editor = create("<p>До После</p>"); editor.commands.setTextSelection({ from: 4, to: 9 });
  const before = editor.getJSON();
  insertImportedMarkdown(editor, [prepareMarkdownText("example.md", "**Вставка**")], captureMarkdownImportSelection(editor));
  assert.match(editor.getText(), /До/); assert.match(editor.getText(), /После/); assert.match(editor.getText(), /Вставка/);
  assert.ok(editor.view.dom.querySelector("strong"));
  editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
  editor.commands.redo(); assert.match(editor.getText(), /Вставка/);
});
it("Markdown import appends safely when the captured document changed and batches files in order", () => {
  const editor = create("<p>Исходное</p>"); const selection = captureMarkdownImportSelection(editor);
  editor.commands.insertContent("Новое ");
  insertImportedMarkdown(editor, [prepareMarkdownText("1.md", "Первый"), prepareMarkdownText("2.md", "Второй")], selection);
  assert.equal(editor.getText(), "Новое Исходное\n\nПервый\n\nВторой");
});
it("read-only Markdown import cannot mutate the document", () => {
  const editor = create(); const before = editor.getJSON(); editor.setEditable(false);
  assert.throws(() => insertImportedMarkdown(editor, [prepareMarkdownText("1.md", "Нельзя")], null));
  assert.deepEqual(editor.getJSON(), before);
});
it("Tab goes beyond six levels, is layout bounded, and survives sidecar roundtrip", () => {
  const editor = create(); editor.commands.setTextSelection(2);
  Object.defineProperty(editor.view.dom, "clientWidth", { configurable: true, value: 600 });
  for (let index = 0; index < 30; index++) editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  assert.equal(editor.getAttributes("paragraph").indent, paragraphIndentLimit(600)); assert.equal(paragraphIndentLimit(600), 20);
  const stored = reload(editor); assert.equal(stored.contentMarkdown, "Текст"); assert.equal(editor.state.doc.firstChild!.attrs.indent, 20);
  editor.commands.setTextSelection(2); editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(editor.getAttributes("paragraph").indent, 19);
});
it("justify persists only as formatting sidecar, not as a new Markdown text source", () => {
  const editor = create("<p><strong>Стоимость следующая -</strong></p>");
  assert.equal(runEditorFormattingCommand(editor, "align-justify"), true);
  const stored = reload(editor); assert.equal(editor.state.doc.firstChild!.attrs.textAlign, "justify");
  assert.equal(stored.contentMarkdown, "**Стоимость следующая -**");
});
it("unlink preserves visible text and other marks and can be undone", () => {
  const editor = create('<p><a href="https://example.test"><strong>Текст</strong></a></p>'); editor.commands.setTextSelection(3);
  editor.chain().extendMarkRange("link").unsetLink().run();
  assert.equal(editor.view.dom.querySelector("a"), null); assert.equal(editor.view.dom.querySelector("strong")?.textContent, "Текст");
  editor.commands.undo(); assert.equal(editor.view.dom.querySelector("a")?.textContent, "Текст");
});
it("drop uses the writing viewport including blank space and keeps generic file policy", () => {
  const bounds = { left: 100, right: 900, top: 50, bottom: 800 };
  assert.deepEqual(nativeDropPoint({ x: 800, y: 1100 }, 1.6, bounds), { left: 500, top: 687.5 });
  for (const extension of ["PNG", "JPG", "JPEG", "WEBP"]) assert.equal(droppedFileKind(`C:/QA/Фото ${extension}.${extension}`), "image");
  for (const extension of ["PDF", "DOCX", "XLSX", "TXT", "ZIP", "unlisted"]) assert.equal(droppedFileKind(`C:/QA/Документ.${extension}`), "file");
});
