import assert from "node:assert/strict";
import { after, afterEach, it } from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { Editor } from "@tiptap/core";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { marked } from "marked";
import { standardMarkdownUserDocument, deadlineCode } from "./fixtures/standardMarkdownUser";
import { markdownToTiptapDoc, tiptapJsonToStandardMarkdown, type EditorNode, type EditorDocument } from "../src/features/editor/markdownService";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../src/features/editor/editorContentSerializer";
import { exportAfterFlush } from "../src/features/export/savedExportFlow";
import { serializeCodecMarkdown } from "../src/features/editor/markdownCodec";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, DOMParser: dom.window.DOMParser, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const { createEditorExtensions } = await import("../src/features/editor/EditorArea");
const service = await import("../src/services/noteExportService");
const { runEditorFormattingCommand, applyEditorFormattingValue } = await import("../src/features/editor/editorFormattingCommands");
const expected = await readFile(new URL("./fixtures/standard-markdown-user.expected.md", import.meta.url), "utf8");
const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach((editor) => editor.destroy()); clearMocks(); document.body.replaceChildren(); });
after(() => { dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

function editor(content: EditorDocument) {
  const element = document.createElement("div"); document.body.append(element);
  const instance = new Editor({ element, content, extensions: createEditorExtensions({ onEditImage() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {}, onToast() {} }) });
  editors.push(instance); return instance;
}

for (const eol of ["\n", "\r\n"]) it(`mounts the exact user's reference with block images using ${eol.length === 1 ? "LF" : "Windows CRLF"}`, async () => {
  const reference = (await readFile(new URL("./fixtures/user-markdown-reference.md", import.meta.url), "utf8")).replace(/\r?\n/g, eol);
  const parsed = markdownToTiptapDoc(reference);
  const instance = editor(parsed);
  instance.state.doc.check();
  assert.equal(instance.state.doc.childCount, parsed.content?.length);
  assert.equal(instance.state.doc.content.content.filter(node => node.type.name === "image").length, 1);
  // The example URI is not an image host. Validate schema/alt, not loaded pixels.
  assert.equal(instance.state.doc.content.content.find(node => node.type.name === "image")?.attrs.alt, "Альтернативный текст");
  assert.equal(instance.commands.setContent(reference, { contentType: "markdown" }), true);
  instance.state.doc.check();
  assert.equal(instance.state.doc.content.content.filter(node => node.type.name === "image").length, 1);
  const snapshot = instance.getJSON() as EditorDocument;
  const saved = serializeEditorDocumentForStorage(snapshot);
  const reopened = buildEditorDocumentFromStoredNoteContent({contentJson:saved.editorDocument,contentMarkdown:saved.contentMarkdown,plainText:saved.plainText,contentSidecars:saved.contentSidecars.map(sidecar=>({...sidecar,id:"qa",noteId:"qa",createdAt:"",updatedAt:""}))}).editorDocument;
  assert.deepEqual(editor(reopened).getJSON(), snapshot);
});

it("official editor Markdown commands share the storage codec without serialization document mutations", () => {
  const instance = editor({ type: "doc", content: [{ type: "paragraph" }] });
  instance.commands.setContent("# Заголовок\n\nОбычный и **жирный** текст, *курсив*.\n\n- [x] Готово", { contentType: "markdown" });
  assert.equal(instance.getJSON().content?.[0].type, "heading");
  const snapshot = JSON.stringify(instance.getJSON());
  let updates = 0; instance.on("update", () => { updates++; });
  const markdown = instance.getMarkdown();
  assert.match(markdown, /\*\*жирный\*\*/);
  assert.match(markdown, /- \[x\] Готово/);
  assert.equal(markdown, serializeEditorDocumentForStorage(instance.getJSON() as EditorDocument).contentMarkdown);
  assert.equal(JSON.stringify(instance.getJSON()), snapshot);
  assert.equal(updates, 0);
  assert.equal(instance.markdown?.parse(markdown).content?.[0].type, "heading");
});

// Whitespace outside code blocks may differ; actual code bytes and parsed block
// structure are asserted independently, not normalized into a passing result.
const nonblankLines = (source: string) => source.trim().split(/\r?\n/).filter((line) => line.trim().length).join("\n");
function structure(node: EditorNode): unknown {
  const attrs = Object.fromEntries(["level", "language", "checked", "align"].flatMap((key) => node.attrs?.[key] == null ? [] : [[key, node.attrs[key]]]));
  if (node.type === "orderedList") attrs.start = node.attrs?.start ?? 1;
  const children: EditorNode[] = [];
  for (const [index, child] of (node.content ?? []).entries()) {
    if (index === node.content!.length - 1 && child.type === "paragraph" && !child.content?.length) continue;
    const previous = children.at(-1);
    if (child.type === "text" && previous?.type === "text") previous.text += child.text ?? "";
    else children.push({ ...child });
  }
  return { type: node.type, attrs, ...(node.text !== undefined ? { text: node.text } : {}), ...(node.content ? { content: children.map(structure) } : {}) };
}
function visibleMarks(node: EditorNode): unknown[] {
  if (node.type === "text") return Array.from(node.text ?? "", (text) => ({ text, marks: (node.marks ?? []).filter((mark) => !(/\s/u.test(text) && ["bold", "italic", "strike"].includes(mark.type))).map((mark) => mark.type === "link" ? `link:${mark.attrs?.href}` : mark.type).sort() }));
  return (node.content ?? []).flatMap(visibleMarks);
}

it("golden user document survives WYSIWYG normalization, autosave/load and standard export with no ordinary HTML", () => {
  const instance = editor(standardMarkdownUserDocument());
  const saved = serializeEditorDocumentForStorage(instance.getJSON() as EditorDocument, instance.getHTML());
  assert.match(saved.contentMarkdown, /\*\*Правильное планирование\*\*/, "new canonical writer uses standard marks");
  assert.ok(JSON.stringify(saved.contentSidecars).includes('"markdownCodec":"tiptap-markdown-v1"'));
  const snapshot = JSON.stringify(saved);
  const loaded = buildEditorDocumentFromStoredNoteContent({ contentJson: saved.editorDocument, contentMarkdown: saved.contentMarkdown, plainText: saved.plainText, contentSidecars: saved.contentSidecars.map((sidecar) => ({ ...sidecar, id: "test", noteId: "note", createdAt: "", updatedAt: "" })) }).editorDocument;
  const actual = tiptapJsonToStandardMarkdown(loaded);
  assert.equal(nonblankLines(actual), nonblankLines(expected));
  assert.doesNotMatch(actual, /<\/?(?:strong|em|p|h[1-6]|ul|ol|li|blockquote|pre|code|table|tr|td|th)\b/i);
  assert.ok(actual.includes("```javascript\n" + deadlineCode + "\n```"));
  const imported = markdownToTiptapDoc(actual);
  assert.deepEqual(structure(imported), structure(markdownToTiptapDoc(expected)));
  assert.deepEqual(structure(imported), structure(standardMarkdownUserDocument()), "full block structure matches the independent editor model");
  assert.deepEqual(visibleMarks(imported), visibleMarks(standardMarkdownUserDocument()));
  assert.equal(JSON.stringify(saved), snapshot, "export does not mutate canonical Markdown, cache or sidecars");
  assert.match(marked.parse(actual) as string, /<th align="center">Платформа<\/th>/);
});

it("single Markdown export reads saved state after flush without rewriting the note", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noteflow-standard-md-"));
  const path = join(directory, "Планирование QA.md");
  const saved = serializeEditorDocumentForStorage(editor(standardMarkdownUserDocument()).getJSON() as EditorDocument);
  const authoritative = buildEditorDocumentFromStoredNoteContent({ contentJson: saved.editorDocument, contentMarkdown: saved.contentMarkdown, plainText: saved.plainText, contentSidecars: saved.contentSidecars.map(sidecar => ({ ...sidecar, id: "qa", noteId: "note", createdAt: "", updatedAt: "" })) }).editorDocument;
  const exportMarkdown = serializeCodecMarkdown(authoritative, false, true);
  let version = 4; const calls: string[] = [];
  mockIPC(async (command, args) => {
    calls.push(command);
    if (command === "get_note") return { id: "note", title: "Планирование QA", contentVersion: version, contentMarkdown: saved.contentMarkdown, contentJson: saved.editorDocument, contentSidecars: saved.contentSidecars, contentHtml: "<p>STALE HTML</p>", plainText: saved.plainText, tags: [], attachments: [], noteDate: "2026-10-27", createdAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z" };
    if (command === "plugin:dialog|save") { assert.equal((args?.options as { defaultPath: string }).defaultPath, "Планирование QA.md"); return path; }
    assert.equal(command, "export_note_markdown_at_path"); assert.equal(args?.contentVersion, 5);
    assert.equal(String(args?.markdown), exportMarkdown);
    assert.match(String(args?.markdown), /Правильное планирование/);
    assert.doesNotMatch(String(args?.markdown), /<\/?(?:strong|span|p|table)\b/);
    await writeFile(path, String(args?.markdown), "utf8"); return { path, message: "Заметка сохранена.", relativePath: "" };
  });
  try {
    await exportAfterFlush(async () => { version++; }, () => service.exportNote("note", "md"));
    assert.equal(await readFile(path, "utf8"), exportMarkdown);
    assert.deepEqual(visibleMarks(markdownToTiptapDoc(exportMarkdown)), visibleMarks(authoritative));
    assert.deepEqual(calls, ["get_note", "plugin:dialog|save", "export_note_markdown_at_path"]);
    assert.equal(version, 5);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("noteflow-standard-md-"));
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [mark, delimiter] of [["bold", "**"], ["italic", "*"], ["strike", "~~"]]) {
  it(`normalizes only portable edge-space ${mark}, preserving text and lossless storage`, () => {
    const input: EditorDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "До" }, { type: "text", text: "  фрагмент  ", marks: [{ type: mark }] }, { type: "text", text: ", после 😀" }] }] };
    const saved = serializeEditorDocumentForStorage(input);
    assert.equal(tiptapJsonToStandardMarkdown(input), `До  ${delimiter}фрагмент${delimiter}  , после 😀`);
    assert.deepEqual(serializeEditorDocumentForStorage(input), saved);
  });
}
it("retains table column alignment through canonical save and reload, including right alignment", () => {
  const input = markdownToTiptapDoc("| L | C | R |\n| :--- | :---: | ---: |\n| **a** | `b` | [c](https://example.com) |");
  const saved = serializeEditorDocumentForStorage(editor(input).getJSON() as EditorDocument);
  assert.match(saved.contentMarkdown, /\| :--- \| :---: \| ---: \|/);
  assert.equal(tiptapJsonToStandardMarkdown(markdownToTiptapDoc(saved.contentMarkdown)), tiptapJsonToStandardMarkdown(input));
});
it("exports a toolbar alignment edit rather than the cell's older imported alignment", () => {
  const instance = editor(markdownToTiptapDoc("| L | C | R |\n| :--- | :---: | ---: |\n| a | b | c |"));
  let firstHeader = 0;
  instance.state.doc.descendants((node, position, parent) => {
    if (!firstHeader && node.type.name === "paragraph" && parent?.type.name === "tableHeader") firstHeader = position + 1;
  });
  assert.ok(firstHeader);
  assert.equal(instance.commands.setTextSelection(firstHeader), true);
  assert.equal(instance.commands.setTextAlign("right"), true);
  const document = instance.getJSON() as EditorDocument;
  const snapshot = JSON.stringify(document);
  assert.match(tiptapJsonToStandardMarkdown(document), /\| ---: \| :---: \| ---: \|/);
  const saved = serializeEditorDocumentForStorage(document);
  assert.match(saved.contentMarkdown, /\| ---: \| :---: \| ---: \|/);
  assert.equal(JSON.stringify(document), snapshot);
});
it("keeps quote paragraph/list structure rather than joining it into a single inline paragraph", () => {
  const input: EditorDocument = { type: "doc", content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Вступление" }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Пункт" }] }] }] }] }] };
  const actual = tiptapJsonToStandardMarkdown(input);
  assert.equal(actual, "> Вступление\n>\n> - Пункт"); assert.deepEqual(structure(markdownToTiptapDoc(actual)), structure(input));
});
it("bounds pathological quote nesting without dropping its text or overflowing the stack", () => {
  const input = "> ".repeat(10_000) + "Содержимое";
  const imported = markdownToTiptapDoc(input);
  assert.equal(imported.content?.[0].type, "blockquote");
  assert.ok(JSON.stringify(imported).includes("Содержимое"));
});
it("does not synthesize a title H1, duplicate explicit headings or invent content for empty notes", () => {
  for (const input of [{ type: "doc", content: [] }, { type: "doc", content: [{ type: "paragraph" }, { type: "paragraph" }] }] satisfies EditorDocument[]) assert.equal(tiptapJsonToStandardMarkdown(input), "");
  assert.equal(tiptapJsonToStandardMarkdown(markdownToTiptapDoc("# Название\n\n# Другой H1")), "# Название\n\n# Другой H1");
});
it("exports a large ordinary document without falling back to HTML or mutating its blocks", () => {
  const input: EditorDocument = { type: "doc", content: Array.from({ length: 1_000 }, () => ({ type: "paragraph", content: [{ type: "text", text: "Текст " }, { type: "text", text: "жирный ", marks: [{ type: "bold" }] }, { type: "text", text: "и обычный." }] })) };
  const before = JSON.stringify(input), actual = tiptapJsonToStandardMarkdown(input);
  assert.equal(actual.split("\n\n").length, 1_000); assert.doesNotMatch(actual, /<strong/); assert.equal(JSON.stringify(input), before);
});

it("real editor commands survive saved-sidecar service export to a physical extended file and import", async () => {
  const instance = editor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "До фрагмент после" }] }] });
  instance.commands.setTextSelection({ from: 4, to: 12 });
  assert.equal(runEditorFormattingCommand(instance, "bold"), true);
  assert.equal(runEditorFormattingCommand(instance, "italic"), true);
  assert.equal(runEditorFormattingCommand(instance, "underline"), true);
  assert.equal(applyEditorFormattingValue(instance, { mode: "color", color: "#315F97" }), true);
  assert.equal(applyEditorFormattingValue(instance, { mode: "highlight", color: "#fff176" }), true);
  assert.equal(instance.commands.setMark("fontFormat", { fontFamily: "Georgia, serif", fontSize: "20px" }), true);
  assert.equal(runEditorFormattingCommand(instance, "align-center"), true);
  const original = instance.getJSON() as EditorDocument;
  const saved = serializeEditorDocumentForStorage(original);
  const directory = await mkdtemp(join(tmpdir(), "noteflow-extended-md-"));
  const path = join(directory, "UI commands.md");
  let updates = 0; instance.on("update", () => updates++);
  const calls: string[] = [];
  mockIPC(async (command, args) => {
    calls.push(command);
    if (command === "get_note") return { id: "note", title: "UI commands", contentVersion: 8, contentMarkdown: saved.contentMarkdown, contentJson: saved.editorDocument, contentSidecars: saved.contentSidecars, plainText: saved.plainText, tags: [], attachments: [], createdAt: "2026-11-03T00:00:00Z", updatedAt: "2026-11-03T00:00:00Z" };
    if (command === "plugin:dialog|save") return path;
    assert.equal(command, "export_note_markdown_at_path"); assert.equal(args?.contentVersion, 8);
    await writeFile(path, String(args?.markdown));
    return { path, message: "Заметка сохранена.", relativePath: "" };
  });
  try {
    await service.exportNote("note", "md");
    const physical = await readFile(path, "utf8");
    assert.match(physical, /\+\+/); assert.match(physical, /:::nf-block/); assert.match(physical, /fontFamily/);
    const restored = editor(markdownToTiptapDoc(physical));
    assert.deepEqual(restored.getJSON(), original);
    assert.equal(updates, 0); assert.deepEqual(instance.getJSON(), original);
    assert.deepEqual(calls, ["get_note", "plugin:dialog|save", "export_note_markdown_at_path"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
