import assert from "node:assert/strict";
import { it } from "node:test";
import { Marked } from "marked";
import { parseCodecMarkdown, serializeCodecMarkdown } from "../src/features/editor/markdownCodec";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../src/features/editor/editorContentSerializer";
import { tiptapJsonToPlainText, type EditorDocument } from "../src/features/editor/markdownService";

it("uses standard marks in canonical/portable Markdown while retaining underline in the sidecar", () => {
  const document: EditorDocument = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "Стоимость следующая -", marks: [{ type: "bold" }] },
    { type: "text", text: " далее", marks: [{ type: "italic" }, { type: "underline" }] },
  ] }] };
  const before = JSON.stringify(document);
  const saved = serializeEditorDocumentForStorage(document);
  assert.match(saved.contentMarkdown, /Стоимость следующая -/);
  assert.equal(serializeCodecMarkdown(document, true), "**Стоимость следующая -** *далее*");
  assert.doesNotMatch(saved.contentMarkdown, /<\/?(?:u|em|strong|span)\b/);
  const restored = buildEditorDocumentFromStoredNoteContent({ ...saved, contentJson: saved.editorDocument, contentSidecars: saved.contentSidecars.map(sidecar => ({ ...sidecar, id: "qa", noteId: "qa", createdAt: "", updatedAt: "" })) }).editorDocument;
  assert.equal(tiptapJsonToPlainText(restored), tiptapJsonToPlainText(document));
  assert.ok(JSON.stringify(restored).includes('"underline"'));
  assert.equal(JSON.stringify(document), before);
});

it("keeps long URL-free text, GFM strike, escapes and real autolinks semantically intact", () => {
  const padding = "0123456789".repeat(600);
  for (const suffix of ["~~удалено~~", "literal \\~value", "www.example.com", "user@example.com", "https://example.com/путь"]) {
    const input = `${padding} ${suffix}`;
    const parsed = parseCodecMarkdown(input);
    const markdown = serializeCodecMarkdown(parsed, true);
    assert.equal(tiptapJsonToPlainText(parseCodecMarkdown(markdown)), tiptapJsonToPlainText(parsed));
    const rendered = new Marked({ gfm: true }).parse(markdown) as string;
    if (suffix.startsWith("~~")) assert.match(rendered, /<del>удалено<\/del>/);
    if (suffix.includes("example")) assert.match(rendered, /<a href=/);
  }
});

it("never silently exports unrepresentable standard emphasis as plain text", () => {
  const document: EditorDocument = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "before " }, { type: "text", text: "*", marks: [{ type: "italic" }] }, { type: "text", text: " after" },
  ] }] };
  try {
    const result = serializeCodecMarkdown(document, true);
    assert.match(new Marked().parse(result) as string, /<em>/);
  } catch (error) { assert.match(String(error), /Не удалось преобразовать форматирование Markdown/); }
});

it("keeps leading/interior/trailing empty paragraphs and break-only paragraphs in bound sidecars", () => {
  let document: EditorDocument = { type: "doc", content: [
    { type: "paragraph", content: [] }, { type: "paragraph", content: [{ type: "text", text: "Первая" }] },
    { type: "paragraph", content: [{ type: "hardBreak" }, { type: "hardBreak" }] },
    { type: "paragraph", content: [{ type: "text", text: "Вторая" }, { type: "hardBreak" }] },
    { type: "paragraph", content: [] },
  ] };
  const expected = JSON.stringify(document);
  for (let cycle = 0; cycle < 3; cycle++) {
    const saved = serializeEditorDocumentForStorage(document);
    document = buildEditorDocumentFromStoredNoteContent({ ...saved, contentJson: saved.editorDocument, contentSidecars: saved.contentSidecars.map(sidecar => ({ ...sidecar, id: "qa", noteId: "qa", createdAt: "", updatedAt: "" })) }).editorDocument;
    assert.equal(JSON.stringify(document), expected);
  }
});

it("does not send new canonical literal highlight punctuation through the legacy compatibility reader", () => {
  const document: EditorDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "literal ==value== stays literal" }] }] };
  const saved = serializeEditorDocumentForStorage(document);
  const loaded = buildEditorDocumentFromStoredNoteContent({ ...saved, contentJson: saved.editorDocument, contentSidecars: saved.contentSidecars.map(sidecar => ({ ...sidecar, id: "qa", noteId: "qa", createdAt: "", updatedAt: "" })) }).editorDocument;
  assert.equal(tiptapJsonToPlainText(loaded), "literal ==value== stays literal");
  assert.doesNotMatch(JSON.stringify(loaded), /"highlight"/);
});

it("parses a thousand separate mixed lists without reinterpreting subsequent paragraphs as list contents", () => {
  const markdown = Array.from({ length: 1000 }, (_, index) => `- [ ] Задача ${index}\n\nАбзац ${index}`).join("\n\n");
  const document = parseCodecMarkdown(markdown);
  assert.equal(document.content?.length, 2000);
  assert.equal(document.content?.filter(node => node.type === "taskList").length, 1000);
  assert.ok(tiptapJsonToPlainText(document).endsWith("Абзац 999"));
});
