import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { isInTable, selectedRect, TableMap } from "@tiptap/pm/tables";
import { Mapping } from "@tiptap/pm/transform";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

function validAxis(value: unknown, limit: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < limit ? value : null;
}

export function tableHeaderAxesPlugin() {
  return new Plugin({
    key: new PluginKey("noteflow-table-header-axes"),
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      const mapping = new Mapping();
      transactions.forEach((transaction) => mapping.appendMapping(transaction.mapping));
      const oldTables = new Map<number, { node: ProseMirrorNode; position: number }>();
      oldState.doc.descendants((node, position) => {
        if (node.type.name !== "table") return;
        const mapped = mapping.mapResult(position, 1);
        if (!mapped.deleted) oldTables.set(mapped.pos, { node, position });
      });
      const transaction = newState.tr;
      newState.doc.descendants((table, position) => {
        if (table.type.name !== "table" || table.attrs.headerAxesManaged !== true) return;
        const previous = oldTables.get(position);
        if (previous?.node.eq(table)) return;
        const map = TableMap.get(table);
        let row = validAxis(table.attrs.headerRow, map.height);
        let column = validAxis(table.attrs.headerColumn, map.width);
        if (previous?.node.attrs.headerAxesManaged === true
          && previous.node.attrs.headerRow === table.attrs.headerRow
          && previous.node.attrs.headerColumn === table.attrs.headerColumn) {
          const oldMap = TableMap.get(previous.node);
          // Map surviving cells, not numeric indexes: deleting one column must not lose a row header.
          const remapAxis = (axis: "row" | "column", value: unknown) => {
            const index = validAxis(value, axis === "row" ? oldMap.height : oldMap.width);
            if (index === null) return null;
            for (const cellPosition of new Set(oldMap.map)) {
              const bounds = oldMap.findCell(cellPosition);
              if ((axis === "row" ? bounds.top : bounds.left) !== index) continue;
              const mapped = mapping.mapResult(previous.position + 1 + cellPosition, 1);
              const relative = mapped.pos - position - 1;
              if (mapped.deleted || !map.map.includes(relative)) continue;
              const nextBounds = map.findCell(relative);
              return axis === "row" ? nextBounds.top : nextBounds.left;
            }
            return null;
          };
          row = remapAxis("row", previous.node.attrs.headerRow);
          column = remapAxis("column", previous.node.attrs.headerColumn);
        }
        for (const cellPosition of new Set(map.map)) {
          const node = table.nodeAt(cellPosition);
          const bounds = map.findCell(cellPosition);
          const type = bounds.top === row || bounds.left === column ? newState.schema.nodes.tableHeader : newState.schema.nodes.tableCell;
          if (node && node.type !== type) transaction.setNodeMarkup(position + 1 + cellPosition, type, node.attrs, node.marks);
        }
        if (row !== table.attrs.headerRow || column !== table.attrs.headerColumn) {
          transaction.setNodeMarkup(position, undefined, { ...table.attrs, headerRow: row, headerColumn: column });
        }
      });
      return transaction.docChanged ? transaction : null;
    },
  });
}

export function toggleSelectedTableHeader(axis: "row" | "column", state: EditorState, dispatch?: (transaction: Transaction) => void) {
  if (!isInTable(state)) return false;
  const rect = selectedRect(state);
  const header = state.schema.nodes.tableHeader;
  const cell = state.schema.nodes.tableCell;
  if (!header || !cell) return false;
  const positions = [...new Set(rect.map.map)];
  const isHeader = (position: number) => rect.table.nodeAt(position)?.type === header;
  const fullRow = Array.from({ length: rect.map.height }, (_, index) => index)
    .find((row) => rect.map.map.slice(row * rect.map.width, (row + 1) * rect.map.width).every(isHeader)) ?? null;
  const fullColumn = rect.map.height > 1 ? Array.from({ length: rect.map.width }, (_, index) => index)
    .find((column) => Array.from({ length: rect.map.height }, (_, row) => rect.map.map[row * rect.map.width + column]).every(isHeader)) ?? null : null;
  const managed = rect.table.attrs.headerAxesManaged === true;
  let row = managed ? rect.table.attrs.headerRow as number | null : fullRow;
  let column = managed ? rect.table.attrs.headerColumn as number | null : fullColumn;
  // A multi-cell selection chooses its top/left axis, not multiple new headers.
  if (axis === "row") row = row === rect.top ? null : rect.top;
  else column = column === rect.left ? null : rect.left;
  const transaction = state.tr;
  for (const position of positions) {
    const node = rect.table.nodeAt(position);
    const bounds = rect.map.findCell(position);
    const type = bounds.top === row || bounds.left === column ? header : cell;
    if (node && node.type !== type) transaction.setNodeMarkup(rect.tableStart + position, type, node.attrs, node.marks);
  }
  transaction.setNodeMarkup(rect.tableStart - 1, undefined, { ...rect.table.attrs, headerAxesManaged: true, headerRow: row, headerColumn: column });
  dispatch?.(transaction);
  return true;
}
