import assert from "node:assert/strict";
import { it } from "node:test";
import { getSchema, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { AttrStep } from "@tiptap/pm/transform";
import { history, redo, undo } from "@tiptap/pm/history";
import { liftListItem, splitListItem, wrapInList } from "@tiptap/pm/schema-list";
import { createNoteSearchPlugin, noteSearchKey, noteSearchMatches } from "../src/features/editor/noteSearch";
import { markdownToTiptapDoc } from "../src/features/editor/markdownService";

const schema = getSchema([StarterKit, Table, TableRow, TableHeader, TableCell,
  Node.create({ name: "searchAtom", inline: true, group: "inline", atom: true, addAttributes: () => ({ value: { default: "" } }) }),
]);
const paragraph = (text: string) => schema.node("paragraph", null, text ? [schema.text(text)] : []);
function create(texts: string[], query = "слово") {
  let state = EditorState.create({ schema, doc: schema.node("doc", null, texts.map(paragraph)), plugins: [createNoteSearchPlugin()] });
  state = state.apply(state.tr.setMeta(noteSearchKey, { query }));
  return state;
}
function apply(state: EditorState, transaction: Transaction) {
  const next = state.apply(transaction), search = noteSearchKey.getState(next)!;
  assert.deepEqual(search.matches, noteSearchMatches(next, search.query), "incremental matches must equal an independent full scan");
  assert.deepEqual(search.decorations.find().map(({ from, to }) => ({ from, to })), search.matches);
  assert.equal(search.decorations.find().filter((decoration) => decoration.spec.current).length, search.matches.length ? 1 : 0);
  const current = search.decorations.find().find((decoration) => decoration.spec.current);
  if (current) assert.deepEqual({ from: current.from, to: current.to }, search.matches[search.index]);
  return next;
}
function countScans(run: () => void) {
  const original = String.prototype.matchAll;
  let count = 0;
  String.prototype.matchAll = function (regexp) { count++; return original.call(this, regexp); };
  try { run(); return count; } finally { String.prototype.matchAll = original; }
}

it("closed and empty search reuse empty state without document scans", () => {
  const state = create(["слово", "слово"], ""), before = noteSearchKey.getState(state);
  let next!: EditorState;
  assert.equal(countScans(() => { next = state.apply(state.tr.insertText("я", 1)); }), 0);
  assert.equal(noteSearchKey.getState(next), before);
});
it("navigation reuses results and changes only the current decoration without rescanning", () => {
  const state = create(Array(1000).fill("слово текст")), before = noteSearchKey.getState(state)!;
  let next!: EditorState;
  assert.equal(countScans(() => { next = state.apply(state.tr.setMeta(noteSearchKey, { index: 700 })); }), 0);
  assert.equal(noteSearchKey.getState(next)!.matches, before.matches);
  assert.equal(noteSearchKey.getState(next)!.pattern, before.pattern);
  apply(state, state.tr.setMeta(noteSearchKey, { index: 700 }));
});
it("one character edit scans one affected textblock rather than all 1000 paragraphs", () => {
  const state = create(Array(1000).fill("слово текст"));
  assert.equal(countScans(() => state.apply(state.tr.insertText("я", 2))), 1);
  apply(state, state.tr.insertText("я", 2));
});
it("marks do not rescan unchanged text, including matches across mark boundaries", () => {
  const state = create(["слово слово"]);
  assert.equal(countScans(() => state.apply(state.tr.addMark(1, 4, schema.marks.bold.create()))), 0);
  apply(state, state.tr.addMark(1, 4, schema.marks.bold.create()));
});
it("split, join, paste, deletion and multi-step mappings agree with full search", () => {
  let state = create(["слово текст", "слово слово", "другое"]);
  state = apply(state, state.tr.split(4));
  state = apply(state, state.tr.join(5));
  state = apply(state, state.tr.insertText("слово ", 2).insertText(" слово", 15).delete(4, 7));
  state = apply(state, state.tr.delete(1, state.doc.content.size - 1));
  apply(state, state.tr.replaceWith(0, state.doc.content.size, [paragraph("слово"), paragraph("ещё слово")]));
});
it("Unicode offsets, inline atoms, hard breaks and adjacent marks stay correct", () => {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("😀 При", [schema.marks.bold.create()]), schema.text("вет ПРИВЕТ "), schema.node("searchAtom"), schema.text(" привет"), schema.node("hardBreak"), schema.text("привет")])]);
  let state = EditorState.create({ schema, doc, plugins: [createNoteSearchPlugin()] });
  state = apply(state, state.tr.setMeta(noteSearchKey, { query: "привет" }));
  assert.equal(noteSearchKey.getState(state)!.matches.length, 4);
  state = apply(state, state.tr.insertText("🧑‍💻", 1));
  apply(state, state.tr.delete(1, 6));
});
it("table cells and structural replacements update only valid ranges", () => {
  const row = () => schema.node("tableRow", null, [schema.node("tableCell", null, [paragraph("слово")]), schema.node("tableCell", null, [paragraph("слово")])]);
  const doc = schema.node("doc", null, [schema.node("table", null, [row(), row()]), paragraph("слово")]);
  let state = EditorState.create({ schema, doc, plugins: [createNoteSearchPlugin()] });
  state = apply(state, state.tr.setMeta(noteSearchKey, { query: "слово" }));
  state = apply(state, state.tr.insertText("слово ", 4));
  apply(state, state.tr.replaceWith(0, state.doc.child(0).nodeSize, paragraph("слово")));
});
it("unknown zero-map document steps use a conservative full-search fallback", () => {
  const state = create(["слово", "слово"]);
  const step = new AttrStep(0, "qa", "value");
  assert.equal(countScans(() => state.apply(state.tr.step(step))), 2);
  apply(state, state.tr.step(step));
});
it("active match follows mapped positions, resets for a query and handles no results", () => {
  let state = create(["слово слово", "слово"]);
  state = apply(state, state.tr.setMeta(noteSearchKey, { index: 2 }));
  state = apply(state, state.tr.insertText("слово ", 1));
  assert.equal(noteSearchKey.getState(state)!.index, 3);
  state = apply(state, state.tr.setMeta(noteSearchKey, { query: "нетсовпадений" }));
  state = apply(state, state.tr.setMeta(noteSearchKey, { query: "слово" }));
  assert.equal(noteSearchKey.getState(state)!.index, 0);
});
it("selection and search metadata do not mutate document or emit a content transaction", () => {
  const state = create(["слово слово"]), doc = state.doc;
  const transaction = state.tr.setSelection(TextSelection.create(doc, 2)).setMeta(noteSearchKey, { index: 1 });
  assert.equal(transaction.docChanged, false);
  assert.equal(apply(state, transaction).doc, doc);
});
it("deterministic edit sequences remain equivalent to full search on repeated text", () => {
  let state = create(Array.from({ length: 40 }, (_, i) => `слово ${i} слово 😀 текст`)), random = 19;
  for (let i = 0; i < 240; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const blocks: number[] = [];
    state.doc.descendants((node, pos) => { if (node.isTextblock) { blocks.push(pos); return false; } });
    const pos = blocks[random % blocks.length], node = state.doc.nodeAt(pos)!;
    const offset = pos + 1 + (random % (node.content.size + 1));
    let tr = state.tr;
    if (i % 7 === 0 && node.content.size > 1) tr = tr.delete(pos + 1, pos + 2);
    else if (i % 11 === 0) tr = tr.split(offset);
    else if (i % 13 === 0 && node.content.size > 1) tr = tr.addMark(pos + 1, pos + 2, schema.marks.bold.create());
    else tr = tr.insertText(i % 3 === 0 ? "слово " : "я", offset);
    state = apply(state, tr);
  }
});

it("1200 repeated matches stay exact after split, join and deletion of many paragraphs", () => {
  let state = create(Array(400).fill("слово слово слово"));
  assert.equal(noteSearchKey.getState(state)!.matches.length, 1200);
  state = apply(state, state.tr.split(7));
  state = apply(state, state.tr.join(8));
  const end = state.doc.child(0).nodeSize * 150;
  state = apply(state, state.tr.delete(0, end));
  assert.equal(noteSearchKey.getState(state)!.matches.length, 750);
  apply(state, state.tr.setMeta(noteSearchKey, { index: 749 }));
});
it("multiline Markdown insertion matches a full scan across headings lists tables and code", () => {
  let state = create(["слово", "прежнее слово"]);
  const doc = schema.nodeFromJSON(markdownToTiptapDoc("# слово 😀\n\n- слово\n- **слово**\n\n| A | B |\n| --- | --- |\n| слово | слово |\n\n```text\nслово слово\n```"));
  state = apply(state, state.tr.replaceWith(0, state.doc.content.size, doc.content));
  assert.equal(noteSearchKey.getState(state)!.matches.length, 7);
  state = apply(state, state.tr.insertText("слово ", 3));
  apply(state, state.tr.setMeta(noteSearchKey, { query: "😀 слово" }));
});
it("real history Undo and Redo preserve the full-search oracle", () => {
  let state = EditorState.create({ schema, doc: schema.node("doc", null, [paragraph("слово текст")]), plugins: [history(), createNoteSearchPlugin()] });
  state = apply(state, state.tr.setMeta(noteSearchKey, { query: "слово" }));
  const before = state.doc;
  state = apply(state, state.tr.insertText("слово ", 1));
  const after = state.doc;
  assert.equal(undo(state, transaction => { state = apply(state, transaction); }), true);
  assert.ok(state.doc.eq(before));
  assert.equal(redo(state, transaction => { state = apply(state, transaction); }), true);
  assert.ok(state.doc.eq(after));
});
it("wrapping splitting and lifting list items keep ranges and order exact", () => {
  let state = create(["слово текст", "ещё слово"]);
  state = apply(state, state.tr.setSelection(TextSelection.create(state.doc, 2, state.doc.content.size - 2)));
  assert.equal(wrapInList(schema.nodes.bulletList)(state, transaction => { state = apply(state, transaction); }), true);
  state = apply(state, state.tr.setSelection(TextSelection.create(state.doc, 9)));
  assert.equal(splitListItem(schema.nodes.listItem)(state, transaction => { state = apply(state, transaction); }), true);
  state = apply(state, state.tr.setSelection(TextSelection.create(state.doc, 4)));
  assert.equal(liftListItem(schema.nodes.listItem)(state, transaction => { state = apply(state, transaction); }), true);
});
it("code-block conversion and Unicode edits do not leave old decorations", () => {
  let state = create(["слово 😀 слово", "СЛОВО"]);
  state = apply(state, state.tr.setBlockType(0, state.doc.content.size, schema.nodes.codeBlock));
  state = apply(state, state.tr.insertText("👩🏽‍💻 слово\n", 1));
  state = apply(state, state.tr.delete(1, 8));
  apply(state, state.tr.setMeta(noteSearchKey, { query: "слово" }));
});
it("replacing the active note clears obsolete ranges before searching the new note", () => {
  let state = create(Array(1000).fill("слово слово"));
  state = apply(state, state.tr.setMeta(noteSearchKey, { index: 1900 }));
  state = apply(state, state.tr.replaceWith(0, state.doc.content.size, paragraph("Другая заметка 😀")));
  assert.equal(noteSearchKey.getState(state)!.matches.length, 0);
  state = apply(state, state.tr.setMeta(noteSearchKey, { query: "заметка" }));
  assert.equal(noteSearchKey.getState(state)!.matches.length, 1);
  assert.equal(noteSearchKey.getState(state)!.index, 0);
});
