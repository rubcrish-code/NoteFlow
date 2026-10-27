import assert from "node:assert/strict";
import { it } from "node:test";
import { marked } from "marked";
import { markdownToTiptapDoc, tiptapJsonToMarkdown, tiptapJsonToStandardMarkdown, type EditorNode, type EditorMark, type EditorDocument } from "../src/features/editor/markdownService";
import { serializeEditorDocumentForStorage } from "../src/features/editor/editorContentSerializer";

const text = (value: string, ...marks: EditorMark[]): EditorNode => ({ type: "text", text: value, ...(marks.length ? { marks } : {}) });
const doc = (...content: EditorNode[]): EditorDocument => ({ type: "doc", content: [{ type: "paragraph", content }] });
function signature(node: EditorNode): unknown[] {
  if (node.type === "text") return Array.from(node.text ?? "", (text) => ({ text, marks: (node.marks ?? []).map((mark) => JSON.stringify([mark.type, mark.attrs ?? {}])).sort() }));
  return (node.content ?? []).flatMap(signature);
}
function roundtrip(input: EditorDocument) {
  const before = JSON.stringify(input);
  const storage = serializeEditorDocumentForStorage(input);
  const md = tiptapJsonToStandardMarkdown(input);
  assert.deepEqual(signature(markdownToTiptapDoc(md)), signature(input), md);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(serializeEditorDocumentForStorage(input), storage, "export cannot mutate canonical Markdown/sidecars");
  return md;
}
for (const [mark, syntax] of [["bold", "**фрагмент**"], ["italic", "*фрагмент*"], ["strike", "~~фрагмент~~"], ["code", "`фрагмент`"]]) {
  it(`exports partial ${mark} as readable standard syntax, not HTML`, () => {
    assert.equal(roundtrip(doc(text("Обычный текст, "), text("фрагмент", { type: mark }), text(", снова текст."))), `Обычный текст, ${syntax}, снова текст.`);
  });
}
it("exports nested bold/italic and bold/code with standard delimiters", () => {
  assert.equal(roundtrip(doc(text("жирный курсив", { type: "italic" }, { type: "bold" }), text(" и "), text("код", { type: "bold" }, { type: "code" }))), "***жирный курсив*** и **`код`**");
});
it("one unsupported range does not turn unrelated bold, italic or links into HTML", () => {
  const md = roundtrip(doc(text("До "), text("жирный", { type: "bold" }), text(" и "), text(" подчёркнутый ", { type: "underline" }), text(" затем "), text("курсив", { type: "italic" }), text(" "), text("сайт", { type: "link", attrs: { href: "https://example.com" } })));
  assert.ok(md.includes("**жирный**")); assert.ok(md.includes("*курсив*")); assert.ok(md.includes("[сайт](https://example.com)")); assert.ok(md.includes("<u>"));
});
it("uses allowlisted HTML for highlight, never invented Markdown markers", () => {
  const md = roundtrip(doc(text("Цвет", { type: "highlight", attrs: { color: "#ffee00" } })));
  assert.equal(md, '<mark style="background-color: #ffee00">Цвет</mark>'); assert.ok(!md.includes("=="));
});
it("P0 partial bold + underline retains every character through ten standard file cycles", () => {
  let input = doc(text("Стоимость следующа", { type: "bold" }), text("я", { type: "bold" }, { type: "underline" }), text(" -", { type: "bold" }));
  const expected = signature(input);
  assert.equal(tiptapJsonToStandardMarkdown(input), "**Стоимость следующа<u>я</u> -**");
  for (let index = 0; index < 10; index++) {
    const md = roundtrip(input); assert.ok(!md.includes("****")); assert.ok(!md.includes("следующа****я"));
    input = markdownToTiptapDoc(md); assert.deepEqual(signature(input), expected);
  }
});
for (const value of ["Привет, мир 😀", "слово", "*literal* [link] & <tag>", "`a` и **b**", "скобки (тест)"]) {
  it(`escapes literal text and preserves adjacent word-boundary marks: ${value}`, () => {
    roundtrip(doc(text(value), text("начало", { type: "bold" }), text("конец", { type: "italic" }), text("!")));
  });
}
it("exports standard block syntax and is rendered by an independent GFM parser", () => {
  const source = "# Заголовок\n\n## Раздел\n\n### Детали\n\n- **Один**\n- *Два*\n\n1. Первый\n2. Второй\n\n- [ ] Задача\n- [x] Готово\n\n> Цитата\n\n```javascript\nconst x = 1;\n```\n\n| A | B |\n| --- | --- |\n| **ключ** | `код` |\n\n---";
  const md = roundtrip(markdownToTiptapDoc(source));
  for (const expected of ["# Заголовок", "## Раздел", "### Детали", "- **Один**", "1. Первый\n2. Второй", "- [x] Готово", "> Цитата", "```javascript", "| **ключ** | `код` |", "---"]) assert.ok(md.includes(expected), expected);
  const html = marked.parse(md) as string;
  for (const tag of ["<strong>", "<em>", "<table>", "<blockquote>", "<h1>", "language-javascript"]) assert.ok(html.includes(tag));
});
it("backtick code fences cannot accidentally terminate a block on file import", () => {
  const input: EditorDocument = { type: "doc", content: [{ type: "codeBlock", attrs: { language: "md" }, content: [text("```js\nconst x = 1;\n```")] }] };
  const md = roundtrip(input); assert.ok(md.startsWith("````md\n")); assert.equal(markdownToTiptapDoc(md).content?.[0].attrs?.language, "md");
});
it("GFM table import removes table pipe escaping even inside inline code", () => {
  const cell = (value: EditorNode, header = false): EditorNode => ({ type: header ? "tableHeader" : "tableCell", content: [{ type: "paragraph", content: [value] }] });
  const input: EditorDocument = { type: "doc", content: [{ type: "table", content: [
    { type: "tableRow", content: [cell(text("Код"), true), cell(text("Текст"), true)] },
    { type: "tableRow", content: [cell(text("a|b", { type: "code" })), cell(text("x|y", { type: "bold" }))] },
  ] }] };
  const md = roundtrip(input); assert.ok(md.includes("`a\\|b`")); assert.ok(md.includes("**x\\|y**"));
});
it("standard file export never includes appearance sidecars or debug/cache fields", () => {
  const input = doc(text("Стиль", { type: "bold" }, { type: "textStyle", attrs: { color: "#123456" } }));
  const stored = serializeEditorDocumentForStorage(input);
  assert.ok(stored.contentSidecars.length > 0);
  assert.equal(tiptapJsonToStandardMarkdown(input), "**Стиль**");
  assert.doesNotMatch(tiptapJsonToStandardMarkdown(input), /sidecar|payload|content_json|123456|<span|style=/);
});
it("old safe HTML exports remain importable and standardize without rewriting source storage", () => {
  const old = 'До <em><strong>жирный курсив</strong></em> и <strong><code>код</code></strong>.';
  const input = markdownToTiptapDoc(old), stored = tiptapJsonToMarkdown(input);
  assert.equal(roundtrip(input), "До ***жирный курсив*** и **`код`**."); assert.equal(tiptapJsonToMarkdown(input), stored);
});
it("internal note and fragment URIs stay ordinary links, not external navigation", () => {
  const href = "noteflow://note/stable-id";
  assert.equal(roundtrip(doc(text("Заметка", { type: "link", attrs: { href } }))), `[Заметка](${href})`);
});
