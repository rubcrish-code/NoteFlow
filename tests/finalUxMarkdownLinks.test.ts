import assert from "node:assert/strict";
import { it } from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { entityNameLength, validateEntityName } from "../src/shared/entityName";
import { TAG_COLOR_PALETTE, findTagPaletteItem, getTagDisplayColor, tagColorStyle } from "../src/features/tags/tagPalette";
import { validateTagName } from "../src/features/tags/tagEditor";
import { internalNoteHref, parseInternalNoteLink } from "../src/shared/internalNoteLink";
import { classifyEditorLink } from "../src/features/editor/editorLinkClick";
import { sanitizeMarkdownLinkHref, safeExternalLinkHref } from "../src/shared/safeLinkHref";
import { captureFragmentAnchor, documentTextMap, resolveDocumentFragment, sourceSnapshotIsCurrent } from "../src/features/editor/fragmentNavigation";
import { markdownToTiptapDoc, tiptapJsonToMarkdown, type EditorDocument, type EditorNode } from "../src/features/editor/markdownService";
import { serializeEditorDocumentForStorage } from "../src/features/editor/editorContentSerializer";
import { prepareMarkdownText } from "../src/features/settings/markdownImport";

for (const symbol of ["я", "a", "😀", "👩🏽‍💻", "🇷🇺", "e\u0301", "👨‍👩‍👧‍👦"]) {
  it(`counts 25 graphemes and rejects 26 without truncation: ${symbol}`, () => {
    assert.equal(entityNameLength(symbol.repeat(25)), 25);
    assert.equal(validateEntityName(symbol.repeat(25)), "");
    assert.match(validateEntityName(symbol.repeat(26)), /25/);
    assert.match(validateTagName([], undefined, symbol.repeat(26)), /25/);
  });
}
it("normalizes entity whitespace before counting and rejects blank names", () => {
  assert.equal(entityNameLength("  Мой   проект  "), 10);
  assert.ok(validateEntityName(" \n\t "));
});
it("palette identifiers and exact persisted HEX values are unique", () => {
  assert.equal(new Set(TAG_COLOR_PALETTE.map((color) => color.id)).size, 10);
  assert.equal(new Set(TAG_COLOR_PALETTE.map((color) => color.hex.toUpperCase())).size, 10);
});
for (const color of TAG_COLOR_PALETTE) {
  it(`preserves palette mapping for ${color.id} across every shared display consumer`, () => {
    const stored = { color: color.color, customColor: color.hex };
    assert.equal(getTagDisplayColor(stored), color.hex);
    assert.equal(findTagPaletteItem(stored).id, color.id);
    assert.equal(tagColorStyle(stored)["--tag-color" as keyof ReturnType<typeof tagColorStyle>], color.hex);
  });
}
it("legacy green keeps green rather than the first teal family entry", () => assert.equal(getTagDisplayColor({ color: "green" }), "#1EA463"));
it("editing a legacy custom tag never silently replaces its color", () => assert.equal(findTagPaletteItem({ color: "green", customColor: "#65A30D" }).hex, "#65A30D"));
it("an unchanged historical long tag can change appearance but cannot be renamed over the limit", () => {
  const tag = { id: "legacy", color: "blue" as const, name: "я".repeat(40), count: 1 };
  assert.equal(validateTagName([tag], "legacy", tag.name), "");
  assert.match(validateTagName([tag], "legacy", "x".repeat(26)), /25/);
});

function styleSignature(doc: EditorNode): unknown[] {
  if (doc.type === "text") return Array.from(doc.text ?? "", (text) => ({ text, marks: (doc.marks ?? []).map((mark) => mark.type === "link" ? `link:${mark.attrs?.href}` : mark.type === "highlight" && mark.attrs?.color ? `highlight:${mark.attrs.color}` : mark.type).sort() }));
  return (doc.content ?? []).flatMap(styleSignature);
}
function roundtrip(doc: EditorDocument) {
  const markdown = serializeEditorDocumentForStorage(doc).contentMarkdown;
  const imported = prepareMarkdownText("Roundtrip.md", markdown).contentJson;
  assert.deepEqual(styleSignature(imported), styleSignature(doc), markdown);
  return markdown;
}
for (const type of ["bold", "italic", "strike", "code", "underline", "highlight"]) {
  it(`Markdown file export/import preserves partial ${type}`, () => {
    const doc: EditorDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Это обычный текст, а это " }, { type: "text", text: "жирный фрагмент", marks: [{ type }] }, { type: "text", text: ", затем снова обычный текст" }] }] };
    const markdown = roundtrip(doc);
    if (type === "bold") assert.ok(markdown.includes("**жирный фрагмент**"));
    if (type === "underline") assert.ok(markdown.includes("<u>"));
  });
}
it("reproduces and fixes loss of every mark when a marked selection includes edge spaces", () => {
  roundtrip({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "До" }, { type: "text", text: " жирный фрагмент ", marks: [{ type: "bold" }] }, { type: "text", text: "после" }] }] });
});
it("crossing, nested, adjacent marks, entities and code/bold preserve exact formatting", () => {
  roundtrip({ type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "a & <b> ", marks: [{ type: "bold" }] },
    { type: "text", text: "bold/italic", marks: [{ type: "bold" }, { type: "italic" }] },
    { type: "text", text: " italic ", marks: [{ type: "italic" }] },
    { type: "text", text: "a **code** & x", marks: [{ type: "bold" }, { type: "code" }] },
    { type: "text", text: "colour", marks: [{ type: "highlight", attrs: { color: "#ffee00" } }] },
  ] }] });
});
it("keeps empty paragraphs, lists, tables, callouts, images and code blocks", () => {
  const markdown = "# Тест\n\n<p></p>\n\n- **пункт**\n  - *вложенный*\n\n| A | B |\n| --- | --- |\n| ~~x~~ | **y** |\n\n:::info\nважно **здесь**\n:::\n\n![alt](https://example.org/image.png)\n\n```js\nconst x = 1;\n```";
  const doc = markdownToTiptapDoc(markdown);
  const output = markdownToTiptapDoc(tiptapJsonToMarkdown(doc));
  assert.deepEqual(styleSignature(output), styleSignature(doc));
  assert.deepEqual(output.content?.map((node) => node.type), doc.content?.map((node) => node.type));
});
it("bold plus partial underline P0 survives ten Markdown-only cycles without delimiter corruption", () => {
  let doc: EditorDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Стоимость следующа", marks: [{ type: "bold" }] }, { type: "text", text: "я", marks: [{ type: "bold" }, { type: "underline" }] }, { type: "text", text: " -", marks: [{ type: "bold" }] }] }] };
  const expected = styleSignature(doc);
  for (let i = 0; i < 10; i++) { const md = tiptapJsonToMarkdown(doc); assert.ok(!md.includes("****")); doc = markdownToTiptapDoc(md); assert.deepEqual(styleSignature(doc), expected); }
});
it("HTML extensions are inert data, never scripts, events or arbitrary styles", () => {
  const doc = markdownToTiptapDoc('<u onclick="alert(1)">Текст</u> <script>alert(1)</script> [x](javascript:alert%281%29)');
  assert.ok(!JSON.stringify(doc).includes('"href":"javascript:'));
  assert.ok(!JSON.stringify(doc).includes('"attrs":{"onclick"'));
  assert.ok(!JSON.stringify(doc).includes('"type":"script"'));
});

const schema = new Schema({ nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*", group: "block" }, text: { group: "inline" } } });
function documentOf(...paragraphs: string[]) { return schema.node("doc", null, paragraphs.map((text) => schema.node("paragraph", null, text ? schema.text(text) : null))); }
it("note links roundtrip Markdown/import without becoming an external URL", () => {
  const href = internalNoteHref({ noteId: "stable-note-id" });
  assert.equal(sanitizeMarkdownLinkHref(href), href);
  assert.equal(safeExternalLinkHref(href), undefined);
  assert.equal(classifyEditorLink(href).kind, "internal-note");
  const imported = prepareMarkdownText("Ссылка.md", `[Старое название](${href})`);
  assert.equal(imported.skippedReferences, 0);
  assert.equal(imported.contentJson.content?.[0].content?.[0].marks?.[0].attrs?.href, href);
});
for (const href of ["noteflow://other/id", "noteflow://note/a?unknown=1", "noteflow://user:password@note/a", "noteflow://note/C:/file", "noteflow://note/a?quote=x", "javascript:alert(1)"]) {
  it(`rejects invalid internal link: ${href}`, () => assert.equal(parseInternalNoteLink(href), null));
}
it("fragment copy stores selected quote and context hashes, not neighboring private text", async () => {
  const doc = documentOf("PRIVATE_NEIGHBOR selected fragment after");
  const anchor = await captureFragmentAnchor(doc, 18, 35);
  assert.ok(anchor); const href = internalNoteHref({ noteId: "same-id", fragment: anchor });
  assert.ok(!decodeURIComponent(href).includes("PRIVATE_NEIGHBOR"));
  assert.deepEqual(parseInternalNoteLink(href), { noteId: "same-id", fragment: anchor });
});
it("fragment keeps identity after rename, move and inserting paragraphs before it", async () => {
  const doc = documentOf("prefix target fragment suffix");
  const anchor = await captureFragmentAnchor(doc, 8, 23); assert.ok(anchor);
  const shifted = documentOf("New paragraph", "prefix target fragment suffix");
  const range = await resolveDocumentFragment(shifted, anchor.quote, anchor);
  assert.ok(range); assert.equal(shifted.textBetween(range.from, range.to), anchor.quote);
});
it("disambiguates repeated text using context, never absolute offsets", async () => {
  const doc = documentOf("First repeated target alpha", "Second repeated target beta");
  const index = documentTextMap(doc).positions[documentTextMap(doc).text.lastIndexOf("repeated target")];
  const anchor = await captureFragmentAnchor(doc, index, index + 15); assert.ok(anchor);
  const range = await resolveDocumentFragment(doc, anchor.quote, anchor); assert.ok(range);
  assert.equal(range.from, index);
  assert.equal(await resolveDocumentFragment(doc, "repeated target"), null);
});
it("editing both neighboring blocks does not invalidate an unchanged fragment block", async () => {
  const doc = documentOf("Before", "whole selected fragment block", "After");
  const map = documentTextMap(doc);
  const from = map.positions[map.text.indexOf("whole")];
  const anchor = await captureFragmentAnchor(doc, from, from + 29); assert.ok(anchor);
  assert.ok(await resolveDocumentFragment(documentOf("Completely rewritten preceding block", "whole selected fragment block", "Different following block"), anchor.quote, anchor));
});
it("stale fragments and short word coincidences never produce a false highlight", async () => {
  const doc = documentOf("prefix original target suffix");
  const anchor = await captureFragmentAnchor(doc, 8, 23); assert.ok(anchor);
  assert.equal(await resolveDocumentFragment(documentOf("completely different"), anchor.quote, anchor), null);
  assert.equal(await resolveDocumentFragment(doc, "prefix"), null);
});
it("RAG exact quotes cross block boundaries without mutating the document", async () => {
  const doc = documentOf("Start of a long cited", "fragment across two paragraphs");
  const before = JSON.stringify(doc.toJSON());
  const range = await resolveDocumentFragment(doc, "long cited fragment across two");
  assert.ok(range); assert.equal(JSON.stringify(doc.toJSON()), before);
  assert.equal(EditorState.create({ doc }).doc.eq(doc), true);
});
it("RAG snapshots reject changed or invalid note timestamps instead of highlighting another occurrence", () => {
  assert.equal(sourceSnapshotIsCurrent("2026-10-25T12:00:00Z", "2026-10-25T12:01:00Z"), false);
  assert.equal(sourceSnapshotIsCurrent("invalid", "invalid"), false);
});
it("RAG snapshots accept equivalent timezone-aware timestamp representations", () => {
  assert.equal(sourceSnapshotIsCurrent("2026-10-25T12:00:00Z", "2026-10-25T15:00:00+03:00"), true);
});
