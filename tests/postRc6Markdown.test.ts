import assert from "node:assert/strict";
import { after, afterEach, it } from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { Editor } from "@tiptap/core";
import { marked, type Token } from "marked";
import { isMarkdownLike, markdownToTiptapDoc, tiptapJsonToStandardMarkdown, tiptapJsonToMarkdown, type EditorDocument, type EditorNode } from "../src/features/editor/markdownService";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../src/features/editor/editorContentSerializer";
import { handleEditorPasteEvent, pasteEditorContent, pasteClipboardIntoEditor, filterClipboardHtml } from "../src/features/editor/editorPaste";
import { preparePortableDocument } from "../src/features/editor/portableMarkdown";
import { prepareMarkdownText } from "../src/features/settings/markdownImport";
import { editorClipboardMarkdown } from "../src/features/editor/editorClipboardMarkdown";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, ClipboardEvent: dom.window.Event, DOMParser: dom.window.DOMParser, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const { createEditorExtensions } = await import("../src/features/editor/EditorArea");
const source = await readFile(new URL("./fixtures/post-rc6-user.md", import.meta.url), "utf8");
const editors: Editor[] = [];
function editor(content: EditorDocument = { type: "doc", content: [{ type: "paragraph" }] }) {
  let instance: Editor;
  instance = new Editor({ element: document.body.appendChild(document.createElement("div")), content,
    extensions: createEditorExtensions({ onEditImage() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {}, onToast() {} }),
    editorProps: { handlePaste: (_view, event) => handleEditorPasteEvent(instance, event, () => assert.fail("paste error")) } });
  editors.push(instance); return instance;
}
function paste(instance: Editor, formats: Record<string, string>) {
  const event = new dom.window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files: [], types: Object.keys(formats), getData: (type: string) => formats[type] ?? "" } });
  instance.view.dom.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
}
const encode = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function normalized(instance: Editor) { return tiptapJsonToStandardMarkdown(instance.getJSON() as EditorDocument).trim(); }
function noRawHtml(markdown: string) {
  const html: Token[] = [];
  marked.walkTokens(marked.lexer(markdown), (token) => { if (token.type === "html") html.push(token); });
  assert.deepEqual(html, []);
}

for (const terminalBreak of [false, true]) it(`UI commands retain mixed marks across Shift+Enter through save/export/import (terminal=${terminalBreak})`, () => {
  const instance = editor();
  instance.commands.insertContent("Native bold");
  instance.commands.selectAll();
  instance.commands.toggleBold();
  instance.commands.setTextSelection(instance.state.doc.content.size - 1);
  instance.commands.setHardBreak();
  instance.commands.unsetBold();
  instance.commands.insertContent("Курсив и конец");
  const start = instance.state.doc.textBetween(0, instance.state.doc.content.size, "\n").indexOf("Курсив");
  instance.commands.setTextSelection({ from: start + 2, to: start + 8 });
  instance.commands.toggleItalic();
  if (terminalBreak) {
    instance.commands.setTextSelection(instance.state.doc.content.size - 1);
    instance.commands.setHardBreak();
  }
  const saved = serializeEditorDocumentForStorage(instance.getJSON() as EditorDocument);
  const before = JSON.stringify(saved);
  const loaded = buildEditorDocumentFromStoredNoteContent({ contentJson: saved.editorDocument, contentMarkdown: saved.contentMarkdown, plainText: saved.plainText,
    contentSidecars: saved.contentSidecars.map(sidecar => ({ ...sidecar, createdAt: "", updatedAt: "" })) });
  const output = tiptapJsonToStandardMarkdown(loaded.editorDocument);
  assert.match(output, /^\*\*Native bold\*\* {2}\n/);
  assert.match(output, /\*Курсив\*/);
  assert.doesNotMatch(output, /&#32;|&#10;|<strong>/);
  const imported = editor(markdownToTiptapDoc(output));
  assert.equal(imported.view.dom.querySelector("strong")?.textContent, "Native bold");
  assert.equal(imported.view.dom.querySelector("em")?.textContent, "Курсив");
  assert.equal(JSON.stringify(saved), before);
});

it("terminal marked soft break cannot erase the only bold span in a portable file", () => {
  const input: EditorDocument = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "Native bold", marks: [{ type: "bold" }] }, { type: "hardBreak", marks: [{ type: "bold" }] },
  ] }] };
  assert.equal(tiptapJsonToStandardMarkdown(input), "**Native bold**");
  assert.deepEqual(input.content?.[0].content?.[1].marks, [{ type: "bold" }]);
});

for (const level of [1, 2, 3, 4, 5, 6]) it(`preserves heading H${level} through actual paste, save/reopen and portable export`, () => {
  const md = `${"#".repeat(level)} Заголовок\n\nКонец`;
  const instance = editor(); paste(instance, { "text/plain": md });
  assert.equal(instance.view.dom.querySelector(`h${level}`)?.textContent, "Заголовок");
  const stored = serializeEditorDocumentForStorage(instance.getJSON() as EditorDocument);
  const loaded = buildEditorDocumentFromStoredNoteContent({ contentJson: stored.editorDocument, contentMarkdown: stored.contentMarkdown, plainText: stored.plainText,
    contentSidecars: stored.contentSidecars.map(sidecar => ({ ...sidecar, createdAt: "", updatedAt: "" })) });
  assert.equal(loaded.source, "markdown");
  const restored = editor(loaded.editorDocument);
  assert.equal(restored.view.dom.querySelector(`h${level}`)?.textContent, "Заголовок");
  assert.equal(tiptapJsonToStandardMarkdown(loaded.editorDocument), md);
});
afterEach(() => { for (const instance of editors.splice(0)) instance.destroy(); document.body.replaceChildren(); });
after(() => { dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

for (const html of ["", `<pre><code>${encode(source)}</code></pre>`, `<div style="font-family:monospace"><span>${encode(source)}</span></div>`]) {
  it(`full user fixture via actual DOM paste agrees with context paste (${html ? html.slice(0, 12) : "plain"})`, async () => {
    const keyboard = editor(), context = editor();
    let updates = 0; keyboard.on("update", () => updates++);
    paste(keyboard, { "text/plain": source, ...(html ? { "text/html": html } : {}) });
    await pasteClipboardIntoEditor(context, async () => ({ text: source, html }), () => true, assert.fail);
    assert.deepEqual(keyboard.getJSON(), context.getJSON());
    assert.equal(updates, 1, "only one document-changing paste transaction");
    assert.deepEqual(keyboard.getJSON().content?.map((node) => node.type).slice(0, 4), ["heading", "paragraph", "heading", "orderedList"]);
    assert.equal(keyboard.view.dom.querySelectorAll("pre").length, 1);
    assert.equal(keyboard.view.dom.querySelectorAll("table").length, 1);
    const saved = serializeEditorDocumentForStorage(keyboard.getJSON() as EditorDocument);
    const snapshot = JSON.stringify(saved);
    const loaded = buildEditorDocumentFromStoredNoteContent({ contentJson: saved.editorDocument, contentMarkdown: saved.contentMarkdown, plainText: saved.plainText, contentSidecars: saved.contentSidecars.map((sidecar) => ({ ...sidecar, id: "qa", noteId: "note", createdAt: "", updatedAt: "" })) });
    const exported = tiptapJsonToStandardMarkdown(loaded.editorDocument); noRawHtml(exported);
    assert.equal(exported.trim(), normalized(keyboard));
    const imported = editor(markdownToTiptapDoc(exported));
    assert.equal(normalized(imported), normalized(keyboard));
    assert.deepEqual(imported.getJSON(), editor(markdownToTiptapDoc(source)).getJSON(), "all supported block/mark semantics, not only text");
    assert.equal(JSON.stringify(saved), snapshot, "export leaves canonical bytes and sidecars unchanged");
    assert.match(exported, /\*\*Правильное планирование\*\*/); assert.match(exported, /\*больше\*/); assert.match(exported, /- \[x\]/); assert.match(exported, /```javascript\nfunction getDaysLeft/);
  });
}
it("explicit text/markdown takes precedence while real rich HTML keeps its semantics", () => {
  const explicit = editor(); paste(explicit, { "text/markdown": "# Заголовок\n\n**Да**", "text/html": "<pre>wrong</pre>" });
  assert.equal(explicit.view.dom.querySelector("h1")?.textContent, "Заголовок");
  const rich = editor(); paste(rich, { "text/plain": "**literal**", "text/html": "<p><strong>Настоящий rich text</strong></p>" });
  assert.equal(rich.view.dom.querySelector("strong")?.textContent, "Настоящий rich text");
});
it("plain ambiguous text stays text, and existing code blocks keep pasted Markdown verbatim", () => {
  const plain = editor(); paste(plain, { "text/plain": "Цена #1 * 2 = 10" });
  assert.equal(plain.getText(), "Цена #1 * 2 = 10"); assert.equal(plain.view.dom.querySelector("pre,h1,strong"), null);
  const code = editor({ type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "const a = 1;\n" }] }] });
  code.commands.setTextSelection(1); paste(code, { "text/plain": "# Не заголовок", "text/html": "<h1>Не заголовок</h1>" });
  assert.equal(code.view.dom.querySelector("h1"), null); assert.match(code.view.dom.querySelector("pre")?.textContent ?? "", /# Не заголовок/);
});
for (const location of ["start", "middle", "selection", "end", "list", "table"] as const) {
  it(`paste preserves surrounding content at ${location}, and Undo/Redo are one operation`, () => {
    const block: EditorNode = { type: "paragraph", content: [{ type: "text", text: "before after" }] };
    const input: EditorDocument = { type: "doc", content: location === "list" ? [{ type: "bulletList", content: [{ type: "listItem", content: [block] }] }, { type: "paragraph" }] : location === "table" ? [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [block] }] }] }, { type: "paragraph" }] : [block] };
    const instance = editor(input); const before = instance.getJSON();
    const from = location === "list" || location === "table" ? 4 : location === "end" ? 13 : location === "start" ? 1 : 7;
    instance.commands.setTextSelection({ from, to: location === "selection" ? 8 : from });
    paste(instance, { "text/plain": "# Вставка\n\n**Фрагмент**" });
    assert.match(instance.getText(), /Вставка/); assert.match(instance.getText(), /Фрагмент/);
    const after = instance.getJSON(); assert.equal(instance.commands.undo(), true); assert.deepEqual(instance.getJSON(), before);
    assert.equal(instance.commands.redo(), true); assert.deepEqual(instance.getJSON(), after);
  });
}
it("async clipboard failure/stale selection cannot mutate a document", async () => {
  const instance = editor(markdownToTiptapDoc("Прежний текст")); const before = instance.getJSON();
  await assert.rejects(pasteClipboardIntoEditor(instance, async () => { throw new Error("denied"); }, () => true, assert.fail)); assert.deepEqual(instance.getJSON(), before);
  const pending = pasteClipboardIntoEditor(instance, async () => { instance.commands.setTextSelection(2); return { text: source, html: "" }; }, () => true, assert.fail);
  assert.equal(await pending, false); assert.deepEqual(instance.getJSON(), before);
});
it("unsupported rich formatting warns but emits no HTML/wrappers; source stays lossless", () => {
  const input: EditorDocument = { type: "doc", content: [{ type: "callout", content: [{ type: "paragraph", content: [{ type: "text", text: "Текст", marks: [{ type: "underline" }, { type: "bold" }, { type: "highlight" }] }] }] }, { type: "detailsBlock", content: [{ type: "detailsSummary", content: [{ type: "text", text: "Детали" }] }, { type: "detailsContent", content: [{ type: "paragraph", content: [{ type: "inlineDate", attrs: { value: "2026-10-28" } }] }] }] }] };
  const canonical = serializeEditorDocumentForStorage(input); const snapshot = JSON.stringify(canonical);
  const projected = preparePortableDocument(input); assert.ok(projected.warnings.length >= 3);
  const exported = tiptapJsonToStandardMarkdown(input); noRawHtml(exported); assert.doesNotMatch(exported, /:::|\{\{date:|sidecar/); assert.match(exported, /> \*\*Текст\*\*/);
  assert.equal(JSON.stringify(serializeEditorDocumentForStorage(input)), snapshot);
  assert.doesNotMatch(tiptapJsonToMarkdown(input), /<u>|==/);
  const loaded = buildEditorDocumentFromStoredNoteContent({ contentJson: canonical.editorDocument, contentMarkdown: canonical.contentMarkdown, plainText: canonical.plainText,
    contentSidecars: canonical.contentSidecars.map(sidecar => ({ ...sidecar, createdAt: "", updatedAt: "" })) });
  assert.deepEqual(editor(loaded.editorDocument).getJSON(), editor(input).getJSON(), "sidecars preserve underline/highlight and the custom document structure");
});
it("sanitizes malicious HTML/URLs and rejects oversized clipboard before insertion", () => {
  const instance = editor();
  paste(instance, { "text/html": '<p onclick="alert(1)">safe<script>alert(1)</script><a href="javascript:alert(1)">link</a><img src="https://private.test/image" onerror="alert(1)"></p>', "text/plain": "safe" });
  assert.doesNotMatch(instance.getHTML(), /script|onclick|onerror|javascript:|private\.test/);
  assert.doesNotMatch(filterClipboardHtml('<iframe src="https://private.test"></iframe>'), /iframe/);
  const before = instance.getJSON(); assert.throws(() => pasteEditorContent(instance, { text: "я".repeat(3 * 1024 * 1024), html: "" }), /слишком большое/); assert.deepEqual(instance.getJSON(), before);
});
it("per-save inline projection cache has identical canonical output and never survives edits", () => {
  const input = markdownToTiptapDoc("Обычный **жирный** и *курсив*.");
  const first = serializeEditorDocumentForStorage(input);
  assert.equal(first.contentMarkdown, tiptapJsonToMarkdown(first.editorDocument));
  input.content![0].content![0].text = "Изменение ";
  const second = serializeEditorDocumentForStorage(input); assert.notEqual(second.contentMarkdown, first.contentMarkdown);
});
it("portable table cells separate paragraphs, and attachments retain managed export references", () => {
  const input: EditorDocument = { type: "doc", content: [
    { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Первая" }] }, { type: "paragraph", content: [{ type: "text", text: "Вторая", marks: [{ type: "bold" }] }] }] }] }] },
    { type: "fileAttachment", attrs: { storageId: "qa-resource-1", name: "Файл.txt" } },
    { type: "image", attrs: { src: "javascript:alert(1)", alt: "Изображение" } },
  ] };
  const before = JSON.stringify(input);
  const output = tiptapJsonToStandardMarkdown(input);
  assert.match(output, /Первая \*\*Вторая\*\*/);
  assert.match(output, /\[Файл\.txt\]\(noteflow-file:\/\/qa-resource-1\)/);
  assert.doesNotMatch(output, /javascript:/); noRawHtml(output);
  assert.equal(JSON.stringify(input), before);
});
it("portable code fences cannot be broken by language attributes", () => {
  const input: EditorDocument = { type: "doc", content: [{ type: "codeBlock", attrs: { language: "js\n<script>" }, content: [{ type: "text", text: "const x = `ok`;" }] }] };
  const output = tiptapJsonToStandardMarkdown(input); noRawHtml(output);
  assert.match(output, /^```jsscript\nconst/);
});

it("crossing bold/italic ranges survive real editor export/import/paste and repeated file cycles", () => {
  const input: EditorDocument = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "жирный", marks: [{ type: "bold" }] },
    { type: "text", text: "оба", marks: [{ type: "bold" }, { type: "italic" }] },
    { type: "text", text: "курсив", marks: [{ type: "italic" }] },
    { type: "text", text: " и " },
    { type: "text", text: "ссылка", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
  ] }] };
  let instance = editor(input);
  const expected = instance.getJSON();
  const original = JSON.stringify(input);
  for (let cycle = 0; cycle < 5; cycle++) {
    const saved = JSON.parse(JSON.stringify(serializeEditorDocumentForStorage(instance.getJSON() as EditorDocument))) as ReturnType<typeof serializeEditorDocumentForStorage>;
    const loaded = buildEditorDocumentFromStoredNoteContent({ contentJson: saved.editorDocument, contentMarkdown: saved.contentMarkdown, plainText: saved.plainText, contentSidecars: saved.contentSidecars });
    assert.deepEqual(editor(loaded.editorDocument).getJSON(), expected, `save/reopen cycle ${cycle}`);
    const md = tiptapJsonToStandardMarkdown(loaded.editorDocument);
    noRawHtml(md);
    const file = prepareMarkdownText("roundtrip.md", md);
    instance = editor(file.contentJson);
    assert.deepEqual(instance.getJSON(), expected, `file import cycle ${cycle}: ${md}`);
    const pasted = editor();
    paste(pasted, { "text/plain": md, "text/html": `<pre><code>${encode(md)}</code></pre>` });
    assert.deepEqual(pasted.getJSON(), expected, `VS Code source paste cycle ${cycle}`);
  }
  assert.equal(JSON.stringify(input), original);
});

for (const fence of ["~~~", "````"]) {
  it(`a ${fence} fence after text starts a code block, without interpreting its contents`, () => {
    const raw = "**not bold**\n```\nconst value = 'Юникод 😀';";
    const md = `До\r\n${fence}js\r\n${raw.replaceAll("\n", "\r\n")}\r\n${fence}\r\n\r\nПосле`;
    const imported = editor(prepareMarkdownText("code.md", md).contentJson);
    assert.deepEqual(imported.getJSON().content?.map((node) => node.type), ["paragraph", "codeBlock", "paragraph"]);
    assert.equal(imported.view.dom.querySelector("pre")?.textContent, raw);
    const pasted = editor(); paste(pasted, { "text/plain": md });
    assert.deepEqual(pasted.getJSON(), imported.getJSON());
    const reimported = editor(prepareMarkdownText("code.md", tiptapJsonToStandardMarkdown(imported.getJSON() as EditorDocument)).contentJson);
    assert.deepEqual(reimported.getJSON(), imported.getJSON());
  });
}

it("detects a tilde fence even when its code has no inline Markdown signals", () => {
  const md = "Before\n  ~~~js\nconst x = 1;\n  ~~~\nAfter";
  assert.equal(isMarkdownLike(md), true);
  const instance = editor(); paste(instance, { "text/plain": md });
  assert.deepEqual(instance.getJSON().content?.map((node) => node.type), ["paragraph", "codeBlock", "paragraph"]);
  assert.equal(instance.view.dom.querySelector("pre")?.textContent, "const x = 1;");
});

for (const md of ["*курсив*", "_курсив_", "__жирный__"]) {
  it(`recognizes standalone inline Markdown source ${md}, without requiring another block signal`, () => {
    const imported = editor(prepareMarkdownText("inline.md", md).contentJson);
    assert.equal(isMarkdownLike(md), true);
    const pasted = editor(); paste(pasted, { "text/plain": md });
    assert.deepEqual(pasted.getJSON(), imported.getJSON());
  });
}

it("escaped emphasis and ordinary intraword underscores stay literal on paste", () => {
  for (const value of ["Цена * 2 = 10", "snake_case_value", "\\*literal\\*", "\\_literal\\_", "C++", "++"]) {
    const instance = editor(); paste(instance, { "text/plain": value });
    assert.equal(instance.getText(), value);
    assert.equal(instance.view.dom.querySelector("em,strong,u"), null);
  }
});

it("explicit Markdown paste overrides highlighted source HTML without interpreting code-block contents", async () => {
  const instance = editor();
  await pasteClipboardIntoEditor(instance, async () => ({ text: "**Жирный**", html: "<p>**Жирный**</p>" }), () => true, () => assert.fail("toast"), false, true);
  assert.equal(instance.view.dom.querySelector("strong")?.textContent, "Жирный");
  const code = editor({ type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "code" }] }] });
  code.commands.setTextSelection(5);
  await pasteClipboardIntoEditor(code, async () => ({ text: "**literal**", html: "" }), () => true, () => assert.fail("toast"), false, true);
  assert.equal(code.view.dom.querySelector("strong"), null);
  assert.ok(code.getText().includes("**literal**"));
});

it("copy uses portable Markdown while normal clipboard HTML remains available to ProseMirror", () => {
  const instance = editor(markdownToTiptapDoc("# Заголовок\n\nТекст **жирный** и *курсив*.\n\n- пункт\n- второй\n\n> Цитата\n\nКонец"));
  instance.commands.selectAll();
  const copied = editorClipboardMarkdown(instance.state.selection.content());
  noRawHtml(copied);
  assert.match(copied, /\*\*жирный\*\*/);
  assert.match(copied, /\*курсив\*/);
  assert.match(copied, /^- пункт/m);
  assert.match(copied, /^> Цитата/m);
  const target = editor(); paste(target, { "text/plain": copied });
  assert.deepEqual(target.getJSON(), instance.getJSON());
});

it("native smoke structure with NBSP, blank lines, list and long quote survives repeated portable cycles", () => {
  const value = "Начало\nЕщё строка\nТекст перед списком\u00a0 \n\u00a0 \n- у\n- к\n- е\n> " + "е".repeat(140);
  let current = editor(markdownToTiptapDoc(value));
  const expected = current.getText();
  for (let cycle = 0; cycle < 3; cycle++) {
    const md = tiptapJsonToStandardMarkdown(current.getJSON() as EditorDocument);
    noRawHtml(md);
    assert.match(md, /^- у/m);
    assert.match(md, /^> е/m);
    current = editor(prepareMarkdownText("native.md", md).contentJson);
    assert.equal(current.getText(), expected);
    assert.equal(current.view.dom.querySelectorAll("li").length, 3);
  }
});

it("quoted headings, nested lists and code survive save/reopen before portable export", () => {
  const md = "> ## Заголовок\n>\n> - **Пункт**\n>   - *Вложенный*\n>\n> ```js\n> const x = 1;\n> ```\n>\n> Последний абзац";
  let instance = editor(markdownToTiptapDoc(md));
  const expected = instance.getJSON();
  for (let cycle = 0; cycle < 3; cycle++) {
    const saved = serializeEditorDocumentForStorage(instance.getJSON() as EditorDocument);
    const loaded = buildEditorDocumentFromStoredNoteContent({ contentJson: saved.editorDocument, contentMarkdown: saved.contentMarkdown, plainText: saved.plainText, contentSidecars: saved.contentSidecars.map((sidecar) => ({ ...sidecar, createdAt: "", updatedAt: "" })) });
    instance = editor(loaded.editorDocument);
    assert.deepEqual(instance.getJSON(), expected, `quoted save/reopen cycle ${cycle}`);
    const exported = tiptapJsonToStandardMarkdown(loaded.editorDocument);
    assert.deepEqual(editor(prepareMarkdownText("quote.md", exported).contentJson).getJSON(), expected);
  }
});
