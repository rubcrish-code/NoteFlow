import { translate, useInterfaceLanguage } from "../../shared/i18n";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Selection } from "@tiptap/pm/state";
import { useEditorState, type Editor } from "@tiptap/react";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { getActiveTableEmphasizedBorders, setActiveTableEmphasizedBorders } from "./tableExtensions";
import { toggleSelectedTableHeader } from "./tableSelectionHeaders";

type TableCommand =
  | "addColumnAfter"
  | "addColumnBefore"
  | "addRowAfter"
  | "addRowBefore"
  | "deleteColumn"
  | "deleteRow"
  | "deleteTable"
  | "mergeCells"
  | "splitCell"
  | "toggleHeaderCell"
  | "toggleHeaderColumn"
  | "toggleHeaderRow";

interface TableToolsPopoverProps {
  editor: Editor | null;
  onToast: (message: string) => void;
}

interface TableToolsState {
  cellBackground: string;
  emphasizedBorders: boolean;
  isInTable: boolean;
}

const emptyTableToolsState: TableToolsState = {
  cellBackground: "",
  emphasizedBorders: false,
  isInTable: false,
};

interface TableToolsPosition {
  maxWidth: number;
  right: number;
  top: number;
}

type TableRect = Pick<DOMRect, "bottom" | "right" | "top" | "width">;

const tableToolsViewportGutter = 12;

export function calculateTableToolsPosition(tableRect: TableRect, viewportWidth: number, viewportHeight: number): TableToolsPosition | null {
  if (tableRect.bottom <= 0 || tableRect.top >= viewportHeight || viewportWidth <= tableToolsViewportGutter * 2) {
    return null;
  }

  const availableWidth = viewportWidth - tableToolsViewportGutter * 2;
  const clampedRightEdge = Math.min(viewportWidth - tableToolsViewportGutter, Math.max(tableToolsViewportGutter, tableRect.right));
  return {
    maxWidth: Math.min(availableWidth, Math.max(280, Math.min(480, tableRect.width))),
    right: viewportWidth - clampedRightEdge,
    top: Math.max(tableToolsViewportGutter, Math.min(viewportHeight - 48, tableRect.top - 42)),
  };
}

const unavailableTableActionMessage = () => translate("ui.d5d7b9b89537");

const cellPalette: Array<{ color: string; key: string }> = [
  { color: "#f8fafc", key: "slate" },
  { color: "#e8f0ff", key: "blue" },
  { color: "#e8f7f0", key: "green" },
  { color: "#fff4d8", key: "amber" },
  { color: "#ffe8ef", key: "pink" },
  { color: "#eee9ff", key: "purple" },
  { color: "#ffffff", key: "white" },
  { color: "#1f2937", key: "dark" },
];

const rowColumnCommands: Array<{ command: TableCommand; label: string }> = [
  { command: "addRowBefore", get label() { return translate("ui.39ebeecb0e49"); } },
  { command: "addRowAfter", get label() { return translate("ui.2719e217f51d"); } },
  { command: "addColumnBefore", get label() { return translate("ui.68e6b57cd287"); } },
  { command: "addColumnAfter", get label() { return translate("ui.46e34abdde4d"); } },
];

const structureCommands: Array<{ command: TableCommand; label: string }> = [
  { command: "deleteRow", get label() { return translate("ui.21e358333395"); } },
  { command: "deleteColumn", get label() { return translate("ui.b10dca9c1529"); } },
  { command: "mergeCells", get label() { return translate("ui.8f27f05ca87a"); } },
  { command: "splitCell", get label() { return translate("ui.b2c5d2870723"); } },
  { command: "toggleHeaderRow", get label() { return translate("ui.d68f35fe3424"); } },
  { command: "toggleHeaderColumn", get label() { return translate("ui.9e271f5d13fc"); } },
  { command: "toggleHeaderCell", get label() { return translate("ui.8078faf31e6c"); } },
];

export function TableToolsPopover({ editor, onToast }: TableToolsPopoverProps) {
  useInterfaceLanguage();
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<TableToolsPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastTableSelectionRef = useRef<Selection | null>(null);
  const tableState =
    useEditorState({
      editor,
      selector: ({ editor: currentEditor }) => {
        if (!currentEditor) {
          return emptyTableToolsState;
        }
        const attrs = currentEditor.getAttributes("tableCell");
        const headerAttrs = currentEditor.getAttributes("tableHeader");
        const cellBackground = typeof attrs.backgroundColor === "string" ? attrs.backgroundColor : typeof headerAttrs.backgroundColor === "string" ? headerAttrs.backgroundColor : "";
        return {
          cellBackground,
          emphasizedBorders: getActiveTableEmphasizedBorders(currentEditor.state),
          isInTable: currentEditor.isActive("table"),
        };
      },
    }) ?? emptyTableToolsState;

  useEffect(() => {
    if (!tableState.isInTable) {
      setIsMenuOpen(false);
      setAnchorElement(null);
      setPopoverPosition(null);
      lastTableSelectionRef.current = null;
    }
  }, [tableState.isInTable]);

  useEffect(() => {
    if (!editor || !tableState.isInTable) {
      setAnchorElement(null);
      return undefined;
    }

    const currentEditor = editor;
    let frame = 0;
    function updateAnchor() {
      if (currentEditor.isActive("table")) {
        lastTableSelectionRef.current = currentEditor.state.selection;
      }
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setAnchorElement(currentEditor.view.dom.querySelector<HTMLElement>('[data-noteflow-table-tools-anchor="true"]'));
      });
    }

    updateAnchor();
    currentEditor.on("selectionUpdate", updateAnchor);
    currentEditor.on("transaction", updateAnchor);
    return () => {
      window.cancelAnimationFrame(frame);
      currentEditor.off("selectionUpdate", updateAnchor);
      currentEditor.off("transaction", updateAnchor);
    };
  }, [editor, tableState.isInTable]);

  useEffect(() => {
    if (!anchorElement) {
      setPopoverPosition(null);
      return undefined;
    }

    const tableElement = findAnchoredTableElement(anchorElement);
    if (!tableElement) {
      setPopoverPosition(null);
      return undefined;
    }
    const currentTableElement = tableElement;

    let frame = 0;
    function updatePosition() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setPopoverPosition(calculateTableToolsPosition(currentTableElement.getBoundingClientRect(), window.innerWidth, window.innerHeight));
      });
    }

    updatePosition();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    resizeObserver?.observe(currentTableElement);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement]);

  if (!editor || !tableState.isInTable || !anchorElement || !popoverPosition) {
    return null;
  }

  function captureTableSelection() {
    if (editor?.isActive("table")) {
      lastTableSelectionRef.current = editor.state.selection;
    }
  }

  function restoreTableSelection() {
    if (!editor || !lastTableSelectionRef.current) {
      return;
    }

    const selection = lastTableSelectionRef.current;
    const docSize = editor.state.doc.content.size;
    try {
      if (selection.from <= docSize && selection.to <= docSize) {
        editor.view.dispatch(editor.state.tr.setSelection(selection));
      }
    } catch {
      lastTableSelectionRef.current = null;
    }
    editor.view.focus();
  }

  function preserveTableToolSelection(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    captureTableSelection();
  }

  function stopInternalTableToolPointer(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function applyCellBackground(color: string | null) {
    if (!editor) {
      return;
    }
    restoreTableSelection();
    const didRun = editor.chain().focus().setCellAttribute("backgroundColor", color).run();
    if (didRun) {
      captureTableSelection();
      return;
    }
    onToast(unavailableTableActionMessage());
  }

  function runCommand(command: TableCommand) {
    if (!editor) {
      return;
    }
    restoreTableSelection();
    const chain = editor.chain().focus();
    const didRun =
      command === "addColumnAfter"
        ? chain.addColumnAfter().run()
        : command === "addColumnBefore"
          ? chain.addColumnBefore().run()
          : command === "addRowAfter"
            ? chain.addRowAfter().run()
            : command === "addRowBefore"
              ? chain.addRowBefore().run()
              : command === "deleteColumn"
                ? chain.deleteColumn().run()
                : command === "deleteRow"
                  ? chain.deleteRow().run()
                  : command === "deleteTable"
                    ? chain.deleteTable().run()
                    : command === "mergeCells"
                      ? chain.mergeCells().run()
                      : command === "splitCell"
                        ? chain.splitCell().run()
                        : command === "toggleHeaderCell"
                          ? chain.toggleHeaderCell().run()
                          : command === "toggleHeaderColumn"
                            ? toggleSelectedTableHeader("column", editor.state, (tr) => editor.view.dispatch(tr))
                            : toggleSelectedTableHeader("row", editor.state, (tr) => editor.view.dispatch(tr));

    if (!didRun) {
      onToast(unavailableTableActionMessage());
      return;
    }
    captureTableSelection();
  }

  function toggleEmphasizedBorders() {
    if (!editor) {
      return;
    }
    restoreTableSelection();
    const didRun = setActiveTableEmphasizedBorders(editor, !getActiveTableEmphasizedBorders(editor.state));
    if (!didRun) {
      onToast(unavailableTableActionMessage());
      return;
    }
    captureTableSelection();
  }

  const popoverStyle = {
    "--table-tools-max-width": `${popoverPosition.maxWidth}px`,
    "--table-tools-right": `${popoverPosition.right}px`,
    "--table-tools-top": `${popoverPosition.top}px`,
  } as CSSProperties;

  return createPortal(
    <div
      className={`table-tools-popover ${isMenuOpen ? "open" : ""}`}
      contentEditable={false}
      onMouseDown={preserveTableToolSelection}
      onPointerDown={stopInternalTableToolPointer}
      style={popoverStyle}
    >
      <div className="table-tools-mini" role="toolbar" aria-label={translate("ui.738a980ee878")}>
        <button ref={triggerRef} className="table-tools-trigger" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen((currentValue) => !currentValue)} type="button">
          <Icon name="table" />
          <span>{translate("ui.b7f18dd0a994")}</span>
          <Icon name="caret" />
        </button>
        <button className="table-tools-quick" onClick={() => runCommand("addRowAfter")} type="button">
          {translate("ui.e44558338102")}</button>
        <button className="table-tools-quick" onClick={() => runCommand("addColumnAfter")} type="button">
          {translate("ui.4aeb4d064ba3")}</button>
      </div>

      {isMenuOpen ? (
        <MenuPopover anchorRef={triggerRef} ariaLabel={translate("ui.17e6bc3430e7")} className="table-tools-menu" isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} preferredWidth={380} maxHeight={520} role="dialog" initialFocusSelector="button:not([disabled])">
        <div className="table-tools-content" onMouseDown={preserveTableToolSelection} onPointerDown={stopInternalTableToolPointer}>
          <div className="table-tools-section">
            <button
              aria-pressed={tableState.emphasizedBorders}
              className={`table-border-toggle ${tableState.emphasizedBorders ? "active" : ""}`}
              onClick={toggleEmphasizedBorders}
              type="button"
            >
              <span>{translate("ui.04f3942380ae")}</span>
              <span aria-hidden="true" className="table-border-toggle-track">
                <span />
              </span>
            </button>
          </div>
          <div className="table-tools-section">
            <span className="table-tools-label">{translate("ui.9820e0f28414")}</span>
            <div className="table-cell-colors">
              {cellPalette.map((item) => (
                <button
                  aria-label={translate("ui.8031102b5f2c", { p0: item.color })}
                  className={`table-color-swatch swatch-${item.key} ${tableState.cellBackground.toLowerCase() === item.color.toLowerCase() ? "active" : ""}`}
                  key={item.key}
                  onClick={() => applyCellBackground(item.color)}
                  type="button"
                />
              ))}
              <button className="table-color-clear" onClick={() => applyCellBackground(null)} type="button">
                {translate("ui.14b4afa6ab38")}</button>
            </div>
          </div>
          <div className="table-tools-section">
            <span className="table-tools-label">{translate("ui.9db12f4215e1")}</span>
            <div className="table-tools-grid">
              {rowColumnCommands.map((item) => (
                <button key={item.command} onClick={() => runCommand(item.command)} type="button">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="table-tools-section">
            <span className="table-tools-label">{translate("ui.816655bd716f")}</span>
            <div className="table-tools-grid compact">
              {structureCommands.map((item) => (
                <button key={item.command} onClick={() => runCommand(item.command)} type="button">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <button className="table-delete-button" onClick={() => runCommand("deleteTable")} type="button">
            {translate("ui.877c9e9c0cba")}</button>
        </div>
        </MenuPopover>
      ) : null}
    </div>,
    document.body,
  );
}

function findAnchoredTableElement(anchorElement: HTMLElement) {
  let sibling = anchorElement.nextElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLElement) {
      if (sibling.matches("table")) {
        return sibling;
      }
      const nestedTable = sibling.querySelector<HTMLElement>("table");
      if (nestedTable) {
        return nestedTable;
      }
    }
    sibling = sibling.nextElementSibling;
  }
  return null;
}
