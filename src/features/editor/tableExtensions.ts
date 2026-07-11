import { Extension } from "@tiptap/core";
import { Table, TableView } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

const tableToolsAnchorPluginKey = new PluginKey("noteflow-table-tools-anchor");

function normalizeCellBackground(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : null;
}

function normalizeEmphasizedBorders(value: unknown) {
  return value === true || value === "true" || value === "strong";
}

interface TableBorderDomTarget {
  removeAttribute: (name: string) => void;
  setAttribute: (name: string, value: string) => void;
}

export function syncTableBorderDomAttribute(tableElement: TableBorderDomTarget, value: unknown) {
  if (normalizeEmphasizedBorders(value)) {
    tableElement.setAttribute("data-table-borders", "strong");
    return;
  }
  tableElement.removeAttribute("data-table-borders");
}

function findActiveTablePosition(state: EditorState) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      return $from.before(depth);
    }
  }
  return null;
}

export function getActiveTableEmphasizedBorders(state: EditorState) {
  const tablePosition = findActiveTablePosition(state);
  if (tablePosition === null) {
    return false;
  }

  const tableNode = state.doc.nodeAt(tablePosition);
  return Boolean(tableNode?.type.name === "table" && normalizeEmphasizedBorders(tableNode.attrs.emphasizedBorders));
}

function countTableCells(tableNode: ProseMirrorNode) {
  let cellCount = 0;
  tableNode.descendants((node) => {
    if (node.type.name === "table" && node !== tableNode) {
      return false;
    }
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      cellCount += 1;
    }
    return undefined;
  });
  return cellCount;
}

function findCellSelectionTable(selection: CellSelection) {
  const { $from } = selection.ranges[0];
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "table") {
      return node;
    }
  }
  return null;
}

function isEntireTableSelected(selection: CellSelection) {
  const tableNode = findCellSelectionTable(selection);
  return Boolean(tableNode && countTableCells(tableNode) === selection.ranges.length);
}

function clearSelectedTableCells(editor: Editor, selection: CellSelection) {
  const paragraphType = editor.state.schema.nodes.paragraph;
  if (!paragraphType) {
    return false;
  }

  const selectedCells: Array<{ node: ProseMirrorNode; pos: number }> = [];
  selection.forEachCell((node, pos) => {
    selectedCells.push({ node, pos });
  });

  if (selectedCells.length === 0) {
    return false;
  }

  const tr = editor.state.tr;
  selectedCells
    .sort((firstCell, secondCell) => secondCell.pos - firstCell.pos)
    .forEach(({ node, pos }) => {
      const emptyParagraph = paragraphType.createAndFill();
      if (!emptyParagraph) {
        return;
      }
      tr.replaceWith(pos + 1, pos + node.nodeSize - 1, emptyParagraph);
    });

  if (!tr.docChanged) {
    return false;
  }

  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function handleTableDelete(editor: Editor) {
  const { selection } = editor.state;
  if (!(selection instanceof CellSelection)) {
    return false;
  }

  if (isEntireTableSelected(selection)) {
    return editor.commands.deleteTable();
  }

  if (selection.isRowSelection()) {
    return editor.commands.deleteRow();
  }

  if (selection.isColSelection()) {
    return editor.commands.deleteColumn();
  }

  return clearSelectedTableCells(editor, selection);
}

export function setActiveTableEmphasizedBorders(editor: Editor, emphasizedBorders: boolean) {
  const tablePosition = findActiveTablePosition(editor.state);
  if (tablePosition === null) {
    return false;
  }

  const tableNode = editor.state.doc.nodeAt(tablePosition);
  if (!tableNode || tableNode.type.name !== "table") {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(tablePosition, undefined, {
      ...tableNode.attrs,
      emphasizedBorders,
    }).scrollIntoView(),
  );
  return true;
}

export class NoteFlowTableView extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number, view: EditorView, HTMLAttributes: Record<string, unknown> = {}) {
    super(node, cellMinWidth, view, HTMLAttributes);
    syncTableBorderDomAttribute(this.table, node.attrs.emphasizedBorders);
  }

  override update(node: ProseMirrorNode) {
    const didUpdate = super.update(node);
    if (didUpdate) {
      syncTableBorderDomAttribute(this.table, node.attrs.emphasizedBorders);
    }
    return didUpdate;
  }
}

const tableCellBackgroundAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => normalizeCellBackground(element.getAttribute("data-cell-background") ?? element.style.backgroundColor),
  renderHTML: (attributes: Record<string, unknown>) => {
    const backgroundColor = normalizeCellBackground(attributes.backgroundColor);
    return backgroundColor
      ? {
          "data-cell-background": backgroundColor,
          style: `background-color: ${backgroundColor}`,
        }
      : {};
  },
};

export const NoteFlowTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: tableCellBackgroundAttribute,
    };
  },
});

export const NoteFlowTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: tableCellBackgroundAttribute,
    };
  },
});

export const NoteFlowTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      emphasizedBorders: {
        default: false,
        parseHTML: (element) => normalizeEmphasizedBorders(element.getAttribute("data-table-borders")),
        renderHTML: (attributes) => (normalizeEmphasizedBorders(attributes.emphasizedBorders) ? { "data-table-borders": "strong" } : {}),
      },
    };
  },

  addKeyboardShortcuts() {
    const parentShortcuts = this.parent?.() ?? {};
    return {
      ...parentShortcuts,
      Backspace: () => handleTableDelete(this.editor),
      Delete: () => handleTableDelete(this.editor),
    };
  },
});

export const TableToolsAnchor = Extension.create({
  name: "tableToolsAnchor",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableToolsAnchorPluginKey,
        props: {
          decorations(state) {
            const tablePosition = findActiveTablePosition(state);
            if (tablePosition === null) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(state.doc, [
              Decoration.widget(
                tablePosition,
                () => {
                  const anchor = document.createElement("div");
                  anchor.className = "table-tools-anchor";
                  anchor.contentEditable = "false";
                  anchor.dataset.noteflowTableToolsAnchor = "true";
                  return anchor;
                },
                {
                  key: `noteflow-table-tools-${tablePosition}`,
                  side: -1,
                },
              ),
            ]);
          },
        },
      }),
    ];
  },
});
