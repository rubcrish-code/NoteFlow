import assert from "node:assert/strict";
import { it } from "node:test";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../src/features/editor/editorContentSerializer";
import { markdownToTiptapDoc, type EditorDocument, type EditorNode } from "../src/features/editor/markdownService";
import { serializeCodecMarkdown } from "../src/features/editor/markdownCodec";

const paragraph = (text?: string, underline = false): EditorNode => ({ type: "paragraph", ...(text === undefined ? {} : { content: [{ type: "text", text, ...(underline ? { marks: [{ type: "underline" }] } : {}) }] }) });
const item = (text: string): EditorNode => ({ type: "listItem", content: [paragraph(text)] });
function shape(node: EditorNode): unknown {
  return { type: node.type, ...(node.text !== undefined ? { text: node.text } : {}), ...(node.marks?.length ? { marks: node.marks } : {}),
    ...(node.type === "orderedList" ? { start: node.attrs?.start ?? 1 } : {}), ...(node.type === "taskItem" ? { checked: node.attrs?.checked ?? false } : {}),
    ...(node.content?.length ? { content: node.content.map(shape) } : {}) };
}
function reopen(document: EditorDocument) {
  const saved = serializeEditorDocumentForStorage(document);
  return buildEditorDocumentFromStoredNoteContent({ ...saved, contentJson: saved.editorDocument, contentSidecars: saved.contentSidecars.map(sidecar => ({ ...sidecar, id: "qa", noteId: "qa", createdAt: "", updatedAt: "" })) }).editorDocument;
}
for (const value of ["---", "- - -", "#", ">", "1.", "- [ ] literal", ":::info", ":::details Title", "{{date:2026-11-03}}", "@[[Заметка]]", "[file:manual](noteflow-file://qa)", "<u>literal</u>", "==literal=="]) {
  it(`keeps literal ${JSON.stringify(value)} as text in storage and portable file import`, () => {
    const document: EditorDocument = { type: "doc", content: [paragraph(value)] };
    let current = document;
    for (let cycle = 0; cycle < 3; cycle++) { current = reopen(current); assert.deepEqual(shape(current), shape(document)); }
    assert.deepEqual(shape(markdownToTiptapDoc(serializeCodecMarkdown(document, true))), shape(document));
  });
}
const layoutCases: Record<string, EditorDocument> = {
  "root whitespace does not shift subsequent underline ranges": { type: "doc", content: [paragraph("Before"), paragraph(" \t"), paragraph("After", true)] },
  "nested list empty paragraphs": { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [paragraph("Before"), paragraph(), paragraph("After", true)] }] }] },
  "callout whitespace paragraphs": { type: "doc", content: [{ type: "callout", attrs: { variant: "info" }, content: [paragraph("Before"), paragraph(" "), paragraph("After", true)] }] },
  "details empty paragraphs": { type: "doc", content: [{ type: "detailsBlock", content: [{ type: "detailsSummary", content: [{ type: "text", text: "Summary" }] }, { type: "detailsContent", content: [paragraph("Before"), paragraph(), paragraph("After", true)] }] }] },
  "whitespace and terminal hard breaks": { type: "doc", content: [paragraph("Before"), { type: "paragraph", content: [{ type: "text", text: " " }, { type: "hardBreak" }, { type: "text", text: "\t" }, { type: "hardBreak" }] }, paragraph("After", true)] },
};
for (const type of ["bulletList", "orderedList"]) layoutCases[`separate adjacent ${type} containers`] = { type: "doc", content: [{ type, content: [item("First")] }, paragraph(), { type, content: [item("Second")] }] };
layoutCases["separate task lists"] = { type: "doc", content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("First")] }] }, paragraph(), { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [paragraph("Second")] }] }] };
for (const [name, document] of Object.entries(layoutCases)) it(`retains ${name} for three canonical cycles`, () => {
  let current = document;
  for (let cycle = 0; cycle < 3; cycle++) { current = reopen(current); assert.deepEqual(shape(current), shape(document)); }
});
for (const content of [[paragraph("First"), paragraph(), paragraph("Second")], [paragraph(" ")], [{ type: "paragraph", content: [{ type: "text", text: "First" }, { type: "hardBreak" }, { type: "text", text: "Second" }] }] as EditorNode[]]) {
  it(`retains nonportable table cell content ${JSON.stringify(shape({ type: "tableCell", content }))} without shifting later marks`, () => {
    const document: EditorDocument = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [paragraph("Header")] }] }, { type: "tableRow", content: [{ type: "tableCell", content }] }] }, paragraph("After", true)] };
    let current = document;
    for (let cycle = 0; cycle < 3; cycle++) { current = reopen(current); assert.deepEqual(shape(current), shape(document)); }
  });
}
it("does not restore old rich cell snapshots after authoritative Markdown has changed", () => {
  const document: EditorDocument = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [paragraph("Header")] }] }, { type: "tableRow", content: [{ type: "tableCell", content: [paragraph("Old"), paragraph("Value")] }] }] }] };
  const saved = serializeEditorDocumentForStorage(document);
  const loaded = buildEditorDocumentFromStoredNoteContent({ ...saved, contentJson: saved.editorDocument, contentMarkdown: saved.contentMarkdown.replace("Old Value", "New Value"), contentSidecars: saved.contentSidecars.map(sidecar => ({ ...sidecar, id: "qa", noteId: "qa", createdAt: "", updatedAt: "" })) }).editorDocument;
  assert.ok(JSON.stringify(loaded).includes("New")); assert.ok(!JSON.stringify(loaded).includes('"text":"Old"'));
});
