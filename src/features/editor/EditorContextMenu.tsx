import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { SelectionBookmark } from "@tiptap/pm/state";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import { MenuPopover } from "../../shared/MenuPopover";
import { Icon } from "../../shared/Icon";
import { EDITOR_TOOLBAR_ACTIONS, type EditorToolbarActionId } from "./editorToolbarLayout";
import { applyEditorFormattingValue, runEditorFormattingCommand } from "./editorFormattingCommands";
import { EditorCommandPopover, type EditorCommandPopoverMode } from "./EditorCommandPopover";
import { canReadEditorClipboard, canWriteEditorClipboard, readEditorClipboard, writeEditorClipboard } from "../../services/clipboardService";
import { pasteEditorContent } from "./editorPaste";

interface ContextTarget { x: number; y: number; bookmark: SelectionBookmark; document: DocumentNode }

export function EditorContextMenu({ editor, onToast, onPaste }: { editor: Editor | null; onToast: (text: string) => void; onPaste?: () => Promise<boolean> }) {
  const [target, setTarget] = useState<ContextTarget | null>(null);
  const [mode, setMode] = useState<EditorCommandPopoverMode | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const savedSelectionRef = useRef<ContextTarget | null>(null);
  const operationRef = useRef(0);

  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    const snapshot = (x: number, y: number): ContextTarget => ({ x, y, bookmark: editor.state.selection.getBookmark(), document: editor.state.doc });
    const capture = (event: PointerEvent) => {
      if (event.button === 2) savedSelectionRef.current = snapshot(event.clientX, event.clientY);
    };
    const open = (event: MouseEvent) => {
      if ((event.target as Element).closest("button, input, textarea")) return;
      event.preventDefault();
      const saved = savedSelectionRef.current;
      setTarget(saved && saved.document.eq(editor.state.doc) ? saved : snapshot(event.clientX, event.clientY));
      savedSelectionRef.current = null;
      setMode(null);
    };
    element.addEventListener("pointerdown", capture, true);
    element.addEventListener("contextmenu", open);
    const closeOnChange = () => { setTarget(null); operationRef.current += 1; };
    editor.on("update", closeOnChange);
    return () => {
      element.removeEventListener("pointerdown", capture, true);
      element.removeEventListener("contextmenu", open);
      editor.off("update", closeOnChange);
      operationRef.current += 1;
    };
  }, [editor]);

  function close() { setTarget(null); setMode(null); operationRef.current += 1; }
  function restoreSelection() {
    if (!editor || !target || !target.document.eq(editor.state.doc)) return false;
    editor.view.dispatch(editor.state.tr.setSelection(target.bookmark.resolve(editor.state.doc)));
    return true;
  }
  function command(id: EditorToolbarActionId) {
    if (!restoreSelection() || !editor) { close(); return; }
    if (id === "color" || id === "highlight" || id === "link") { setMode(id); return; }
    runEditorFormattingCommand(editor, id);
    close();
  }
  async function clipboard(action: "copy" | "cut" | "paste") {
    if (!editor || !restoreSelection()) return;
    const token = ++operationRef.current;
    const document = editor.state.doc;
    const { from, to } = editor.state.selection;
    try {
      if (action === "paste") {
        if (onPaste) {
          const inserted = await onPaste();
          if (inserted && !editor.isDestroyed) { close(); editor.view.focus(); }
          return;
        }
        const content = await readEditorClipboard();
        if (token !== operationRef.current || !document.eq(editor.state.doc) || editor.isDestroyed) return;
        pasteEditorContent(editor, content);
      } else {
        await writeEditorClipboard(document.textBetween(from, to, "\n"));
        if (token !== operationRef.current || !document.eq(editor.state.doc) || editor.isDestroyed) return;
        if (action === "cut") editor.commands.deleteRange({ from, to });
      }
      close(); editor.view.focus();
    } catch { onToast("Не удалось обратиться к буферу обмена. Используйте сочетание клавиш."); }
  }

  if (!target || !editor) return null;
  const actions = EDITOR_TOOLBAR_ACTIONS.filter((action) => !["ai", "font", "undo", "redo"].includes(action.id));
  const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ");
  return createPortal(<>
    <span className="editor-context-anchor" ref={anchorRef} style={{ left: target.x, top: target.y }} tabIndex={-1} />
    <MenuPopover anchorRef={anchorRef} ariaLabel="Форматирование текста" className="editor-context-menu" role={mode ? "dialog" : "menu"} isOpen onClose={() => { close(); editor.view.focus(); }} preferredWidth={mode ? 306 : 252} maxHeight={540}>
      {mode ? <EditorCommandPopover key={mode} mode={mode} initialText={selectedText} initialHref={String(editor.getAttributes("link").href ?? "")}
        currentColor={editor.getAttributes(mode === "color" ? "textStyle" : "highlight").color as string | undefined}
        onClose={() => setMode(null)} onSubmit={(value) => { if (restoreSelection()) applyEditorFormattingValue(editor, value); close(); }} /> : <>
        {(["cut", "copy", "paste"] as const).map((action) => <button role="menuitem" type="button" key={action}
          disabled={action === "paste" ? !canReadEditorClipboard() : !canWriteEditorClipboard() || editor.state.selection.empty}
          onClick={() => void clipboard(action)}>{action === "copy" ? "Копировать" : action === "cut" ? "Вырезать" : "Вставить"}</button>)}
        <span className="toolbar-overflow-separator" role="separator" />
        {actions.map((action, index) => <div key={action.id}>
          {index > 0 && actions[index - 1].group !== action.group ? <span className="toolbar-overflow-separator" role="separator" /> : null}
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => command(action.id)} role="menuitem" type="button" data-context-action={action.id}>
            {action.icon ? <Icon name={action.icon} /> : <span className="toolbar-menu-action-label">{action.label}</span>}
            <span>{action.tip.replace(/\s*\(Ctrl\+[^)]+\)/, "")}</span>
          </button>
        </div>)}
        {editor.isActive("link") ? <button role="menuitem" type="button" onClick={() => { if (restoreSelection()) editor.chain().focus().extendMarkRange("link").unsetLink().run(); close(); }}>Убрать ссылку</button> : null}
      </>}
    </MenuPopover>
  </>, document.body);
}
