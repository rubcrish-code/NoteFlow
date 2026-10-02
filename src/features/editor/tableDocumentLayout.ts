import { Schema } from "@tiptap/pm/model";
import { TableMap, tableNodes } from "@tiptap/pm/tables";
import type { EditorNode } from "./markdownService";

export interface TableCellLayout {
  column: number;
  type: "tableCell" | "tableHeader";
  colspan: number;
  rowspan: number;
  blockLengths: number[];
}
export interface TableLayout { width: number; rows: TableCellLayout[][] }

const definitions = tableNodes({ tableGroup: "block", cellContent: "paragraph+", cellAttributes: {} });
const schema = new Schema({ nodes: {
  doc: { content: "block+" }, text: { group: "inline" },
  paragraph: { group: "block", content: "inline*" }, ...definitions,
} });

function textLength(node: EditorNode): number {
  if (node.type === "text") return node.text?.length ?? 0;
  if (["hardBreak", "inlineDate", "noteMention"].includes(node.type)) return 1;
  return (node.content ?? []).reduce((sum, child) => sum + textLength(child), 0);
}

export function projectTable(table: EditorNode) {
  const rows = table.content ?? [];
  const geometry = schema.nodes.table.create(null, rows.map((row) => schema.nodes.table_row.create(null,
    (row.content ?? []).map((cell) => schema.nodes[cell.type === "tableHeader" ? "table_header" : "table_cell"].create(
      { colspan: cell.attrs?.colspan ?? 1, rowspan: cell.attrs?.rowspan ?? 1, colwidth: null },
      schema.nodes.paragraph.create(),
    )),
  )));
  const map = TableMap.get(geometry);
  if (map.problems?.length) throw new Error("Некорректная структура таблицы");
  const cells = new Map<number, EditorNode>();
  const layout: TableLayout = { width: map.width, rows: [] };
  geometry.forEach((row, rowOffset, rowIndex) => {
    const rowLayout: TableCellLayout[] = [];
    row.forEach((_cell, cellOffset, cellIndex) => {
      const position = rowOffset + cellOffset + 1;
      const original = rows[rowIndex].content![cellIndex];
      cells.set(position, original);
      const rectangle = map.findCell(position);
      rowLayout.push({ column: rectangle.left, type: original.type === "tableHeader" ? "tableHeader" : "tableCell",
        colspan: rectangle.right - rectangle.left, rowspan: rectangle.bottom - rectangle.top,
        blockLengths: (original.content ?? []).map(textLength) });
    });
    layout.rows.push(rowLayout);
  });
  const grid = Array.from({ length: map.height }, (_, row) => Array.from({ length: map.width }, (_, column) => {
    const position = map.map[row * map.width + column];
    const rectangle = map.findCell(position);
    return rectangle.top === row && rectangle.left === column ? cells.get(position) ?? null : null;
  }));
  return { grid, layout };
}

export function restoreTableLayout(table: EditorNode, layout: TableLayout): boolean {
  const rows = table.content ?? [];
  if (layout.rows.length !== rows.length || rows.some((row) => row.content?.length !== layout.width)) return false;
  const restored = rows.map((row, rowIndex) => ({ ...row, content: layout.rows[rowIndex].map((cell) => {
    const canonical = row.content![cell.column];
    const inline = canonical.content?.flatMap((block) => block.content ?? []) ?? [];
    const total = inline.reduce((sum, node) => sum + textLength(node), 0);
    // Edited Markdown wins over a sidecar whose old paragraph boundaries no longer match.
    const lengths = cell.blockLengths.reduce((sum, length) => sum + length, 0) === total ? cell.blockLengths : [total];
    let offset = 0;
    const content = lengths.map((length) => {
      let cursor = 0;
      const slice: EditorNode[] = [];
      for (const node of inline) {
        const size = textLength(node);
        if (cursor < offset + length && cursor + size > offset) {
          if (node.type === "text") slice.push({ ...node, text: (node.text ?? "").slice(Math.max(0, offset - cursor), Math.min(size, offset + length - cursor)) });
          else slice.push(node);
        }
        cursor += size;
      }
      offset += length;
      return { type: "paragraph", ...(slice.length ? { content: slice } : {}) };
    });
    return { ...canonical, type: cell.type, attrs: { ...canonical.attrs, colspan: cell.colspan, rowspan: cell.rowspan }, content };
  }) }));
  const candidate = { ...table, content: restored };
  try {
    const { grid } = projectTable(candidate);
    // Never discard text added to a covered placeholder by an external Markdown edit.
    if (grid.some((row, rowIndex) => row.some((cell, column) => !cell && textLength(rows[rowIndex].content![column]) > 0))) return false;
  } catch { return false; }
  table.content = restored;
  return true;
}

export function readTableLayouts(value: unknown): Array<{ index: number; layout: TableLayout }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const { index, layout } = entry as { index?: unknown; layout?: unknown };
    if (!Number.isInteger(index) || Number(index) < 0 || !layout || typeof layout !== "object") return [];
    const candidate = layout as TableLayout;
    if (!Number.isInteger(candidate.width) || candidate.width < 1 || candidate.width > 1000 || !Array.isArray(candidate.rows)) return [];
    if (!candidate.rows.every((row) => Array.isArray(row) && row.every((cell) => cell &&
      (cell.type === "tableCell" || cell.type === "tableHeader") && Number.isInteger(cell.column) && cell.column >= 0 && cell.column < candidate.width &&
      Number.isInteger(cell.colspan) && cell.colspan > 0 && cell.column + cell.colspan <= candidate.width && Number.isInteger(cell.rowspan) && cell.rowspan > 0 &&
      Array.isArray(cell.blockLengths) && cell.blockLengths.length > 0 && cell.blockLengths.every((length) => Number.isInteger(length) && length >= 0)))) return [];
    return [{ index: Number(index), layout: candidate }];
  });
}
