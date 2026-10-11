import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { act, createElement as h } from "react";
import { JSDOM } from "jsdom";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { HeadingAnchors, noteHeadings, scrollToNoteHeading } from "../src/features/editor/headingAnchors";
import { handleEditorLinkClick } from "../src/features/editor/editorLinkClick";
import { exportAfterFlush } from "../src/features/export/savedExportFlow";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
const workerRequests: unknown[] = [];
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
  Node: dom.window.Node, DOMParser: dom.window.DOMParser, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
  Worker: class { onmessage?: (event: { data: { bytes: Uint8Array } }) => void; onerror?: () => void; terminate() {} postMessage(request: unknown) { workerRequests.push(request); queueMicrotask(() => this.onmessage?.({ data: { bytes: new TextEncoder().encode("Заметка") } })); } },
})) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
const scrolled: Element[] = [];
dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this); };
const { createRoot } = await import("react-dom/client");
const { NoteOutline } = await import("../src/features/editor/NoteOutline");
const { NoteExportDialog } = await import("../src/features/export/NoteExportDialog");
const service = await import("../src/services/noteExportService");
let root: ReturnType<typeof createRoot> | undefined;
const editors: Editor[] = [];
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; editors.splice(0).forEach((editor) => editor.destroy()); document.body.replaceChildren(); clearMocks(); scrolled.length = 0; workerRequests.length = 0; });
after(() => { dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
async function mount(element: ReturnType<typeof h>) { const container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => root!.render(element)); }
async function click(label: string) { const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label); assert.ok(button, label); await act(async () => button.click()); return button; }
function editorWithHeadings() {
  const element = document.createElement("div"); document.body.append(element);
  const editor = new Editor({ element, content: "<h1>A</h1><h2>B</h2><h3>C</h3><h2>D</h2><h2>D</h2><h1>Результаты!</h1>", extensions: [StarterKit, HeadingAnchors] });
  editors.push(editor); return editor;
}
describe("Phase E actual heading navigation", () => {
  it("derives deterministic Unicode anchors and hierarchy directly from ProseMirror", () => {
    const editor = editorWithHeadings();
    assert.deepEqual(noteHeadings(editor.state.doc).map(({ id, level }) => [id, level]), [["a", 1], ["b", 2], ["c", 3], ["d", 2], ["d-1", 2], ["результаты", 1]]);
    assert.equal(editor.view.dom.querySelector("h3")?.id, "c");
    assert.ok(!JSON.stringify(editor.getJSON()).includes('"id"'));
  });
  it("TOC click scrolls without changing document, selection or firing an update", async () => {
    const editor = editorWithHeadings(); await mount(h(NoteOutline, { editor }));
    const document = editor.getJSON(); const selection = editor.state.selection.toJSON(); let updates = 0; editor.on("update", () => updates++);
    await click("Оглавление"); await click("C");
    assert.equal(scrolled.at(-1)?.id, "c"); assert.deepEqual(editor.getJSON(), document); assert.deepEqual(editor.state.selection.toJSON(), selection); assert.equal(updates, 0);
  });
  it("updates the live outline after rename, level change, removal and same-ID silent replacement", async () => {
    const editor = editorWithHeadings(); await mount(h(NoteOutline, { editor })); await click("Оглавление");
    await act(async () => editor.commands.setContent("<h1>Новый</h1><h3>Третий</h3><p>D</p>", { emitUpdate: false }));
    assert.ok(document.querySelector(".note-outline-level-3")?.textContent?.includes("Третий"));
    assert.equal(document.querySelector(".note-outline-level-2"), null); assert.ok(document.body.textContent?.includes("Новый"));
  });
  it("shows a real empty state without including metadata title or bold paragraphs", async () => {
    const editor = editorWithHeadings(); editor.commands.setContent("<p><strong>Не заголовок</strong></p>"); await mount(h(NoteOutline, { editor })); await click("Оглавление");
    assert.match(document.body.textContent ?? "", /В заметке пока нет заголовков/);
  });
  it("routes # links internally and leaves unknown/malformed anchors safe", () => {
    const editor = editorWithHeadings(); const anchor = document.createElement("a"); anchor.href = "#результаты"; document.body.append(anchor);
    let external = 0;
    anchor.addEventListener("click", (event) => handleEditorLinkClick(event, () => external++, (id) => { scrollToNoteHeading(editor.view, id); }));
    const event = new dom.window.MouseEvent("click", { button: 0, bubbles: true, cancelable: true }); anchor.dispatchEvent(event);
    assert.equal(external, 0); assert.equal(event.defaultPrevented, true); assert.equal(scrolled.at(-1)?.id, "результаты");
    assert.equal(scrollToNoteHeading(editor.view, "#missing"), false); assert.equal(scrollToNoteHeading(editor.view, "#%invalid"), false);
  });
});

const dto = { id: "note", title: "Документация API", contentVersion: 3, contentMarkdown: "# Канонический текст", contentJson: { type: "doc", content: [] }, contentHtml: "<p>STALE HTML</p>", plainText: "Канонический текст", noteDate: "2026-10-04", createdAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z", tags: [], attachments: [], isPinned: false, isFavorite: false, project: "", wordCount: 2 };
describe("Phase E export workflow", () => {
  for (const format of ["md", "txt", "docx", "pdf"] as const) it(`uses a native ${format} Save dialog and cancellation performs no generation or write`, async () => {
    const calls: string[] = [];
    mockIPC((command, args) => {
      calls.push(command); if (command === "get_note") return dto;
      if (command === "plugin:dialog|save") { const options = args?.options as { defaultPath: string; filters: Array<{ extensions: string[] }> }; assert.equal(options.defaultPath, `Документация API.${format}`); assert.deepEqual(options.filters[0].extensions, [format]); return null; }
      assert.fail(command);
    });
    assert.equal(await service.exportNote("note", format), null); assert.deepEqual(calls, ["get_note", "plugin:dialog|save"]); assert.equal(workerRequests.length, 0);
  });
  it("native Project Save dialog has a sanitized ZIP name and cancels safely", async () => {
    mockIPC((command, args) => { assert.equal(command, "plugin:dialog|save"); const options = args?.options as { defaultPath: string; filters: { name: string; extensions: string[] }[] }; assert.equal(options.defaultPath, "_CON.zip"); assert.deepEqual(options.filters, [{ name: "ZIP-архив (*.zip)", extensions: ["zip"] }]); return null; });
    assert.equal(await service.exportProject("project", "CON"), null);
  });
  it("writes portable Markdown through the backend rather than a second serializer", async () => {
    mockIPC((command, args) => { if (command === "get_note") return dto; if (command === "plugin:dialog|save") return "D:/QA/note.md"; assert.equal(command, "export_note_markdown_at_path"); assert.deepEqual(args, { noteId: "note", path: "D:/QA/note.md" }); return { path: "D:/QA/note.md", message: "Заметка сохранена.", relativePath: "" }; });
    assert.equal((await service.exportNote("note", "md"))?.path, "D:/QA/note.md");
  });
  it("passes only a canonical saved document to the worker and writes returned bytes", async () => {
    mockIPC((command, args) => { if (command === "get_note") return dto; if (command === "plugin:dialog|save") return "D:/QA/note.txt"; assert.equal(command, "write_note_export_file"); assert.equal(args?.format, "txt"); assert.deepEqual(args?.bytes, Array.from(new TextEncoder().encode("Заметка"))); return { path: "D:/QA/note.txt" }; });
    await service.exportNote("note", "txt"); assert.equal(workerRequests.length, 1); const request = JSON.stringify(workerRequests[0]); assert.match(request, /Канонический текст/); assert.doesNotMatch(request, /STALE HTML|contentSidecars|apiKey|contentJson/);
  });
  it("waits for a successful pending save and never exports after failed persistence", async () => {
    const order: string[] = []; let version = 1;
    assert.equal(await exportAfterFlush(async () => { await Promise.resolve(); version = 2; order.push("saved"); }, async () => { order.push("export"); return version; }), 2);
    assert.deepEqual(order, ["saved", "export"]);
    await assert.rejects(exportAfterFlush(async () => { throw new Error("SQL private path"); }, async () => { assert.fail("must not export"); }), /Не удалось сохранить изменения перед экспортом/);
  });
  it("keeps format selection compact and duplicate clicks disabled during generation", async () => {
    let resolve!: () => void; let calls = 0; let closed = false;
    await mount(h(NoteExportDialog, { onClose: () => { closed = true; }, onExport: async () => { calls++; await new Promise<void>((done) => { resolve = done; }); } }));
    assert.equal(document.querySelectorAll('input[type="radio"]').length, 4);
    await click("Сохранить"); assert.equal((document.querySelector("fieldset") as HTMLFieldSetElement).disabled, true);
    const button = await click("Сохраняем…"); assert.equal(button.disabled, true); assert.equal(calls, 1); assert.equal(closed, false);
    await act(async () => resolve()); assert.equal(closed, true);
  });
  it("shows safe errors and leaves the export dialog available for retry", async () => {
    await mount(h(NoteExportDialog, { onClose() { assert.fail("do not close on failure"); }, onExport: async () => { throw new Error("SQL D:/private/api-key"); } }));
    await click("Сохранить"); assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /Не удалось сохранить MD/); assert.doesNotMatch(document.body.textContent ?? "", /SQL|private|api-key/); assert.equal((document.querySelector("fieldset") as HTMLFieldSetElement).disabled, false);
  });
});
