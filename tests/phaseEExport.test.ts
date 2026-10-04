import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { exportFilename, generateTxt, managedImageUris, type ExportDocument } from "../src/features/export/exportDocument";
import { generateDocx } from "../src/features/export/generateDocx";
import { generatePdf } from "../src/features/export/generatePdf";

const uri = `noteflow-asset://localhost/${"a".repeat(64)}`;
export const fixture: ExportDocument = { title: "Заголовок заметки", images: [{ uri, mime: "image/png", bytes: new Uint8Array(readFileSync("src-tauri/icons/32x32.png")), width: 32, height: 32 }], document: { type: "doc", content: [
  { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Документация API" }] },
  { type: "paragraph", content: [{ type: "text", text: "Съешь ещё этих мягких французских булок. Ёжик 🙂", marks: [{ type: "bold" }, { type: "italic" }, { type: "underline" }, { type: "textStyle", attrs: { color: "#123456" } }, { type: "highlight", attrs: { color: "#ffeebb" } }] }] },
  { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "пункт один" }] }] }] },
  { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "второй список" }] }] }] },
  { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Готово" }] }] }] },
  { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Цитата" }] }] },
  { type: "paragraph", content: [{ type: "text", text: "Ссылка", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }, { type: "text", text: "Раздел", marks: [{ type: "link", attrs: { href: "#документация-api" } }] }] },
  { type: "table", attrs: { emphasizedBorders: true }, content: Array.from({ length: 3 }, (_, row) => ({ type: "tableRow", content: Array.from({ length: 2 }, (_, col) => ({ type: row === 0 ? "tableHeader" : "tableCell", attrs: { backgroundColor: "#eeeeff" }, content: [{ type: "paragraph", content: [{ type: "text", text: `Ячейка ${row}:${col}` }] }] })) })) },
  { type: "callout", content: [{ type: "paragraph", content: [{ type: "text", text: "Важное примечание" }] }] },
  { type: "detailsBlock", content: [{ type: "detailsSummary", content: [{ type: "text", text: "Подробности" }] }, { type: "detailsContent", content: [{ type: "paragraph", content: [{ type: "text", text: "Скрытое содержимое" }] }] }] },
  { type: "horizontalRule" }, { type: "image", attrs: { src: uri, alt: "Схема", width: 9000 } },
] } };

describe("Phase E portable documents", () => {
  it("TXT exports readable content, not Markdown or a sidecar dump", () => {
    const text = new TextDecoder().decode(generateTxt(fixture));
    for (const expected of [fixture.title, "Документация API", "Съешь ещё", "• пункт один", "1. второй список", "[x] Готово", "Цитата", "https://example.com", "Ячейка 2:1", "Подробности", "Скрытое содержимое", "[Изображение: Схема]"]) assert.ok(text.includes(expected), expected);
    assert.doesNotMatch(text, /\*\*|##|<p>|sidecar|noteflow-asset:/);
  });
  it("materializes only displayed managed images and deduplicates their URI", () => {
    assert.deepEqual(managedImageUris({ type: "doc", content: [...fixture.document.content!, { type: "image", attrs: { src: uri, originalSrc: "noteflow-asset://private" } }, { type: "image", attrs: { src: "https://example.com/image" } }] }), [uri]);
  });
  it("keeps long Unicode filenames within portable byte limits", () => {
    for (const title of ["文".repeat(200), "🙂".repeat(200), "я".repeat(200)]) {
      const result = exportFilename(title, "docx");
      assert.ok(new TextEncoder().encode(result).length <= 185);
      assert.ok(!result.includes("\ufffd"));
    }
  });
  for (const [title, expected] of [["Документация API", "Документация API.pdf"], ["A/B: *?\"<>|", "A_B_ ______.pdf"], ["CON", "_CON.pdf"], ["COM9", "_COM9.pdf"], ["name. ", "name.pdf"], ["...", "Заметка.pdf"]]) it(`sanitizes filename ${title}`, () => assert.equal(exportFilename(title, "pdf"), expected));
  it("creates actual OOXML with Cyrillic, marks, tables, relationships and embedded images", async () => {
    const bytes = await generateDocx(fixture);
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    for (const path of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels"]) assert.ok(zip.file(path), path);
    const xml = await zip.file("word/document.xml")!.async("string");
    const document = new JSDOM(xml, { contentType: "text/xml" });
    assert.equal(document.window.document.querySelector("parsererror"), null);
    for (const text of ["Ёжик", "Подробности", "Ячейка 2:1", "Скрытое содержимое"]) assert.ok(xml.includes(text), text);
    assert.match(xml, /<w:tbl>/); assert.match(xml, /<w:b\/>/); assert.match(xml, /<w:i\/>/); assert.match(xml, /Heading1/);
    const borders = document.window.document.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "tblBorders")[0];
    assert.equal(borders.children.length, 6);
    for (const edge of borders.children) { assert.equal(edge.getAttribute("w:sz"), "12"); assert.equal(edge.getAttribute("w:color"), "000000"); }
    assert.ok(Object.keys(zip.files).some((path) => path.startsWith("word/media/") && path.endsWith(".png")));
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    assert.match(rels, /https:\/\/example.com/);
    assert.doesNotMatch(xml + rels, /noteflow-asset:|sidecar|apiKey/);
    document.window.close();
  });
  it("keeps separate DOCX ordered lists independent and preserves the starting number", async () => {
    const list = fixture.document.content!.find(node => node.type === "orderedList")!;
    const zip = await JSZip.loadAsync(await generateDocx({ ...fixture, document: { type: "doc", content: [list, { ...list, attrs: { start: 5 } }] } }));
    const xml = new JSDOM(await zip.file("word/document.xml")!.async("string"), { contentType: "text/xml" });
    const ids = [...xml.window.document.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "numId")].map(node => node.getAttribute("w:val"));
    assert.equal(new Set(ids).size, 2);
    assert.match(await zip.file("word/numbering.xml")!.async("string"), /w:start w:val="5"/);
    xml.window.close();
  });
  it("creates a real multipage PDF with embedded Unicode font and image, not a screenshot", async () => {
    const bytes = await generatePdf({ ...fixture, document: { type: "doc", content: [...fixture.document.content!, ...Array.from({ length: 100 }, () => ({ type: "paragraph", content: [{ type: "text", text: "Длинная заметка: русский текст, ёжик, проект, заметка." }] }))] } });
    const pdf = Buffer.from(bytes).toString("latin1");
    assert.ok(pdf.startsWith("%PDF-")); assert.ok(pdf.includes("%%EOF"));
    assert.ok((pdf.match(/\/Type \/Page\b/g) ?? []).length > 1);
    assert.match(pdf, /\/ToUnicode/); assert.match(pdf, /\/Subtype \/Image/); assert.match(pdf, /\/FontFile2/);
    assert.doesNotMatch(pdf, /noteflow-asset:|sidecar|apiKey/);
  });
});
