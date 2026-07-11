import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import {
  getActiveTableEmphasizedBorders,
  setActiveTableEmphasizedBorders,
  syncTableBorderDomAttribute,
} from "../src/features/editor/tableExtensions";

const tableSchema = new Schema({
  nodes: {
    doc: { content: "table" },
    paragraph: { content: "text*" },
    table: {
      attrs: { emphasizedBorders: { default: false } },
      content: "tableRow+",
      tableRole: "table",
    },
    tableCell: { content: "paragraph+", tableRole: "cell" },
    tableRow: { content: "tableCell+", tableRole: "row" },
    text: { group: "inline" },
  },
});

function createTableEditor() {
  const paragraph = tableSchema.nodes.paragraph.create(null, tableSchema.text("Ячейка"));
  const cell = tableSchema.nodes.tableCell.create(null, paragraph);
  const row = tableSchema.nodes.tableRow.create(null, cell);
  const table = tableSchema.nodes.table.create({ emphasizedBorders: false }, row);
  const doc = tableSchema.nodes.doc.create(null, table);
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 4),
  });
  const editor = {
    get state() {
      return state;
    },
    view: {
      dispatch(transaction: Transaction) {
        state = state.apply(transaction);
      },
    },
  } as unknown as Editor;

  return editor;
}

describe("table border mode", () => {
  it("toggles the active table attribute on and off", () => {
    const editor = createTableEditor();

    assert.equal(getActiveTableEmphasizedBorders(editor.state), false);
    assert.equal(setActiveTableEmphasizedBorders(editor, true), true);
    assert.equal(getActiveTableEmphasizedBorders(editor.state), true);
    assert.equal(setActiveTableEmphasizedBorders(editor, false), true);
    assert.equal(getActiveTableEmphasizedBorders(editor.state), false);
  });

  it("synchronizes the strong border marker on the rendered table", () => {
    const attributes = new Map<string, string>();
    const tableElement = {
      removeAttribute(name: string) {
        attributes.delete(name);
      },
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
    };

    syncTableBorderDomAttribute(tableElement, true);
    assert.equal(attributes.get("data-table-borders"), "strong");

    syncTableBorderDomAttribute(tableElement, false);
    assert.equal(attributes.has("data-table-borders"), false);
  });
});
