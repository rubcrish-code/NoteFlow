import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it } from "node:test";
import { Marked } from "marked";
import { parseCodecMarkdown, serializeCodecMarkdown } from "../src/features/editor/markdownCodec";
import { markdownToTiptapDoc, type EditorDocument, type EditorMark, type EditorNode } from "../src/features/editor/markdownService";
import { buildEditorDocumentFromStoredNoteContent, serializeEditorDocumentForStorage } from "../src/features/editor/editorContentSerializer";
import { prepareMarkdownText } from "../src/features/settings/markdownImport";

const text = (value: string, marks: EditorMark[] = []): EditorNode => ({ type: "text", text: value, marks });
const paragraph = (content: EditorNode[], attrs?: Record<string, unknown>): EditorNode => ({ type: "paragraph", content, attrs });
const document = (...content: EditorNode[]): EditorDocument => ({ type: "doc", content });
const orderedAttrs = (attrs: Record<string, unknown> = {}) => Object.fromEntries(Object.entries(attrs).filter(([, value]) => value != null).sort(([a], [b]) => a.localeCompare(b)));
function signature(node: EditorNode): unknown {
  const attrs = orderedAttrs(Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([key, value]) => !(["indent", "textAlign"].includes(key) && (value === 0 || value === "left")) && !(["colspan", "rowspan"].includes(key) && value === 1))));
  if (["paragraph", "heading"].includes(node.type) && (node.content ?? []).every(child => child.type === "text" || child.type === "hardBreak")) {
    return { type: node.type, attrs, text: (node.content ?? []).flatMap(child => Array.from(child.type === "hardBreak" ? "\n" : child.text ?? "", char => ({ char,
      marks: (child.marks ?? []).map(mark => [mark.type, orderedAttrs(mark.attrs)]).sort(([a], [b]) => String(a).localeCompare(String(b))) }))) };
  }
  return { type: node.type, attrs, ...(node.text !== undefined ? { text: node.text } : {}), content: node.content?.map(signature) ?? [] };
}
function reopen(input: EditorDocument) {
  const saved = serializeEditorDocumentForStorage(input);
  return buildEditorDocumentFromStoredNoteContent({ contentJson: saved.editorDocument, contentMarkdown: saved.contentMarkdown, plainText: saved.plainText,
    contentSidecars: saved.contentSidecars.map(sidecar => ({ ...sidecar, id: "test", noteId: "qa", createdAt: "", updatedAt: "" })) }).editorDocument;
}
const cases: Array<[string, EditorMark[]]> = [
  ["bold", [{ type: "bold" }]], ["italic", [{ type: "italic" }]], ["strike", [{ type: "strike" }]], ["code", [{ type: "code" }]],
  ["link", [{ type: "link", attrs: { href: "https://example.com" } }]], ["underline", [{ type: "underline" }]],
  ["bold underline", [{ type: "bold" }, { type: "underline" }]], ["italic underline", [{ type: "italic" }, { type: "underline" }]],
  ["bold italic underline", [{ type: "bold" }, { type: "italic" }, { type: "underline" }]],
  ["color", [{ type: "textStyle", attrs: { color: "#315F97" } }]],
  ["highlight", [{ type: "highlight", attrs: { color: "#fff176" } }]], ["default highlight", [{ type: "highlight", attrs: { color: null } }]],
  ["family", [{ type: "fontFormat", attrs: { fontFamily: '"Times New Roman", Times, serif' } }]],
  ["size", [{ type: "fontFormat", attrs: { fontSize: "18px" } }]],
  ["family size", [{ type: "fontFormat", attrs: { fontFamily: "Georgia, serif", fontSize: "24px" } }]],
  ["superscript", [{ type: "superscript" }]], ["subscript", [{ type: "subscript" }]],
  ["code bold underline", [{ type: "code" }, { type: "bold" }, { type: "underline" }]],
  ["colored code", [{ type: "code" }, { type: "textStyle", attrs: { color: "#315F97" } }]],
  ["all inline styles", [{ type: "bold" }, { type: "italic" }, { type: "underline" }, { type: "textStyle", attrs: { color: "#A02825" } }, { type: "fontFormat", attrs: { fontFamily: "Arial, sans-serif", fontSize: "20px" } }, { type: "highlight", attrs: { color: "#fff176" } }]],
];
for (const [name, marks] of cases) it(`extended Markdown preserves partial ${name} through file parse and storage reload`, () => {
  const input = document(paragraph([text("Обычный текст, "), text("фрагмент", marks), text(" и Unicode 🧪.")]));
  const snapshot = JSON.stringify(input);
  const exported = serializeCodecMarkdown(input, false, true);
  assert.doesNotMatch(exported, /<\/?(?:span|u|mark|strong|em|sup|sub|p)\b/);
  if (name.includes("underline")) assert.match(exported, /\+\+/);
  let current = markdownToTiptapDoc(exported);
  assert.deepEqual(signature(current), signature(input), exported);
  for (let cycle = 0; cycle < 3; cycle++) { current = reopen(current); assert.deepEqual(signature(current), signature(input)); }
  assert.equal(JSON.stringify(input), snapshot);
});
for (const textAlign of ["left", "center", "right", "justify"]) it(`extended Markdown preserves ${textAlign} alignment and indent`, () => {
  const input = document(paragraph([text("Выравнивание", [{ type: "underline" }])], { textAlign, indent: 2 }));
  assert.deepEqual(signature(markdownToTiptapDoc(serializeCodecMarkdown(input, false, true))), signature(input));
});
for (const literal of ["C++", "++", "++++", "a++b++c", "++обычный текст++", "{{nf:{\"color\":\"#123456\"}}}text{{/nf}}", ":::nf-block {\"textAlign\":\"center\"}"]) it(`escapes literal extension syntax ${literal}`, () => {
  const input = document(paragraph([text(literal)]));
  for (const portable of [false, true]) assert.deepEqual(signature(markdownToTiptapDoc(serializeCodecMarkdown(input, portable, !portable))), signature(input));
});
it("keeps literal plus pairs in existing canonical storage without reinterpreting old notes", () => {
  const parsed = parseCodecMarkdown("++literal++");
  assert.equal(parsed.content?.[0].content?.[0].marks?.length ?? 0, 0);
  assert.deepEqual(signature(reopen(document(paragraph([text("++literal++")])))), signature(document(paragraph([text("++literal++")]))));
});
it("does not interpret extensions inside inline code or fenced code", () => {
  const parsed = markdownToTiptapDoc('`++literal++`\n\n```text\n{{nf:{"color":"#123456"}}}x{{/nf}}\n```');
  assert.equal(parsed.content?.[0].content?.[0].marks?.[0].type, "code");
  assert.equal(parsed.content?.[1].content?.[0].text, '{{nf:{"color":"#123456"}}}x{{/nf}}');
});
it("rejects unsafe or malformed style directives without injecting style or HTML", () => {
  for (const attrs of [{ color: "red;display:none" }, { fontFamily: "Arial; background:url(https://x)" }, { script: "script" }, { textAlign: "fixed" }, { unknown: "x" }, { color: "#12345" }]) {
    const source = `{{nf:${JSON.stringify(attrs)}}}text{{/nf}}`;
    const parsed = markdownToTiptapDoc(source);
    assert.equal((parsed.content?.[0].content ?? []).some(n => n.marks?.some(mark => ["textStyle", "fontFormat", "nfStyle"].includes(mark.type))), false);
  }
});
it("keeps GFM portable while extended Markdown retains styles", () => {
  const input = document(paragraph([text("Жирный", [{ type: "bold" }, { type: "underline" }, { type: "fontFormat", attrs: { fontSize: "24px" } }])]));
  const gfm = serializeCodecMarkdown(input, true);
  assert.equal(gfm, "**Жирный**"); assert.doesNotMatch(gfm, /\+\+|\{\{nf|<u|<span/);
  assert.match(new Marked({ gfm: true }).parse(gfm) as string, /<strong>Жирный<\/strong>/);
});
for (const value of ["C++ и ++текст++", "a | b", "<текст>", "слово_и_текст", "Стоимость следующая -", "a`b", " x "]) it(`preserves underlined escaped text ${value}`, () => {
  const input = document(paragraph([text("До "), text(value, [{ type: "bold" }, { type: "underline" }]), text(" после")]));
  const output = serializeCodecMarkdown(input, false, true);
  assert.deepEqual(signature(markdownToTiptapDoc(output)), signature(input), output);
});
it("preserves crossing styles and adjacent font variants", () => {
  const input = document(paragraph([text("Первый", [{ type: "bold" }, { type: "underline" }]), text("второй", [{ type: "underline" }, { type: "italic" }]), text("третий", [{ type: "italic" }, { type: "textStyle", attrs: { color: "#123456" } }]), text("четвёртый", [{ type: "fontFormat", attrs: { fontSize: "18px" } }]), text("пятый", [{ type: "fontFormat", attrs: { fontSize: "24px" } }])]));
  const output = serializeCodecMarkdown(input, false, true);
  assert.deepEqual(signature(markdownToTiptapDoc(output)), signature(input), output);
});

it("retains exact partial-mark trailing spaces from the actual UI-authored native paragraph", () => {
  const input = document(paragraph([text("Обычный текст. "), text("Жирный фрагмент ", [{ type: "bold" }]), text("и "), text("курсивный фрагмент ", [{ type: "italic" }]), text("оба стиля ", [{ type: "bold" }, { type: "italic" }]), text("зачёркнутый фрагмент", [{ type: "strike" }])]));
  const output = serializeCodecMarkdown(input, false, true);
  assert.deepEqual(signature(markdownToTiptapDoc(output)), signature(input), output);
  assert.doesNotMatch(output, /<\/?(?:span|strong|em)/);
  assert.match(serializeCodecMarkdown(input, true), /\*\*Жирный фрагмент\*\*/);
});
it("uses the exact user's reference document across raw codec, GFM export and file import", async () => {
  const reference = await readFile(new URL("./fixtures/user-markdown-reference.md", import.meta.url), "utf8");
  const input = markdownToTiptapDoc(reference);
  const exported = serializeCodecMarkdown(input, true);
  assert.deepEqual(signature(markdownToTiptapDoc(exported)), signature(input));
  assert.match(exported, /\*\*жирный шрифт\*\*/); assert.match(exported, /\*курсив\*/); assert.match(exported, /~~зачёркнутый текст~~/);
  assert.match(exported, /```python\ndef hello\(\):\n    print\("Привет, мир!"\)\n```/);
  assert.match(exported, /!\[Альтернативный текст\]\(https:\/\/example\.com\/?\)/);
  const imported = prepareMarkdownText("пп.md", exported);
  assert.deepEqual(signature(imported.contentJson), signature(reopen(input)));
  assert.equal(imported.skippedReferences, 0);
});

it("restores table appearance and cell formatting from an actual extended Markdown string", () => {
  const input = document({ type: "table", attrs: { emphasizedBorders: true, headerAxesManaged: true, headerRow: true, headerColumn: false }, content: [
    { type: "tableRow", content: ["A", "Б"].map(value => ({ type: "tableHeader", content: [paragraph([text(value)])] })) },
    { type: "tableRow", content: ["В", "Г"].map(value => ({ type: "tableCell", attrs: { backgroundColor: "#E5EFFC", colwidth: [160] }, content: [paragraph([text(value, [{ type: "underline" }])], { textAlign: "right", indent: 1 })] })) },
  ] });
  const output = serializeCodecMarkdown(input, false, true);
  assert.match(output, /^:::nf-table /); assert.match(output, /\|/);
  assert.deepEqual(signature(markdownToTiptapDoc(output)), signature(input), output);
  assert.deepEqual(signature(reopen(markdownToTiptapDoc(output))), signature(reopen(input)));
});

it("restores image size and alignment without embedding private editor metadata", () => {
  const input = document({ type: "image", attrs: { src: "https://example.com/image.png", alt: "Картинка", width: 320, height: 180, alignment: "right" } });
  const output = serializeCodecMarkdown(input, false, true);
  assert.match(output, /^:::nf-image /); assert.match(output, /!\[Картинка\]/);
  assert.deepEqual(signature(markdownToTiptapDoc(output)), signature(input), output);
  const imported = prepareMarkdownText("image.md", output);
  assert.deepEqual(signature(imported.contentJson), signature(reopen(input)));
});

it("does not accept arbitrary object metadata, paths or CSS in extension headers", () => {
  for (const source of [
    ':::nf-image {"src":"file:///private/key"}\n![x](https://example.com/image.png)\n:::',
    ':::nf-image {"width":10001}\n![x](https://example.com/image.png)\n:::',
    ':::nf-table {"attrs":{"onclick":true}}\n| A |\n| --- |\n| B |\n:::',
    ':::nf-table {"layout":{"width":1,"rows":[[{"column":0,"type":"tableCell","colspan":1,"rowspan":9007199254740991,"blockLengths":[1]}]]}}\n| A |\n| --- |\n:::',
    ':::nf-table {"cells":[{"row":0,"cell":0,"attrs":{"backgroundColor":"red;display:none"},"blocks":[]}]}\n| A |\n| --- |\n| B |\n:::',
  ]) {
    const parsed = markdownToTiptapDoc(source);
    const attributes = (node: EditorNode): unknown[] => [node.attrs ?? {}, ...(node.content ?? []).flatMap(attributes)];
    assert.doesNotMatch(JSON.stringify(attributes(parsed)), /private\/key|onclick|display:none|10001/);
  }
});

for (const prefix of [":::nf-table", ":::nf-image"]) it(`escapes a literal ${prefix} directive`, () => {
  const input = document(paragraph([text(`${prefix} {}`)]));
  assert.deepEqual(signature(markdownToTiptapDoc(serializeCodecMarkdown(input, false, true))), signature(input));
});

it("fails closed for complex table cells rather than reporting a lossy extended export as complete", () => {
  const input = document({ type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [paragraph([text("A")]), paragraph([text("B")])] }] }] });
  const snapshot = JSON.stringify(input);
  assert.throws(() => serializeCodecMarkdown(input, false, true), /резервную копию/);
  assert.equal(JSON.stringify(input), snapshot);
});

for (const kind of ["bulletList", "orderedList", "taskList", "blockquote", "callout"]) it(`retains rich inline and block styles inside ${kind}`, () => {
  const block = paragraph([text("Вложенный", [{ type: "underline" }, { type: "bold" }, { type: "textStyle", attrs: { color: "#315F97" } }])], { textAlign: "right", indent: 1 });
  const list = kind.endsWith("List");
  const input = document({ type: kind, ...(kind === "callout" ? { attrs: { variant: "info" } } : kind === "orderedList" ? { attrs: { start: 3 } } : {}), content: list ? [{ type: kind === "taskList" ? "taskItem" : "listItem", ...(kind === "taskList" ? { attrs: { checked: true } } : {}), content: [block] }] : [block] });
  const output = serializeCodecMarkdown(input, false, true);
  assert.deepEqual(signature(markdownToTiptapDoc(output)), signature(input), output);
});
