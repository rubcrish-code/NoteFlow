import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Icon } from "../../shared/Icon";
import { noteSearchKey } from "./noteSearch";
import { scrollToSearchMatch } from "./scrollToSearchMatch";

export function NoteSearchBar({ editor, initialQuery = "" }: { editor: Editor | null; initialQuery?: string }) {
  useInterfaceLanguage();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(Boolean(initialQuery));
  const [manualFind, setManualFind] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const search = useEditorState({ editor, selector: ({ editor: current }) => {
    const state = current ? noteSearchKey.getState(current.state) : undefined;
    return { count: state?.matches.length ?? 0, index: state?.index ?? 0 };
  } });
  useEffect(() => { setQuery(initialQuery); setOpen(Boolean(initialQuery)); setManualFind(false); }, [initialQuery]);
  useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: open ? query : "" })); }, [editor, query, open]);
  function closeFind() {
    setOpen(false);
    editor?.commands.focus(undefined, { scrollIntoView: false });
  }
  function move(delta: number) {
    const current = editor ? noteSearchKey.getState(editor.state) : undefined;
    if (!editor || !current?.matches.length) return;
    const index = (current.index + delta + current.matches.length) % current.matches.length;
    editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { index }));
    scrollToSearchMatch(editor.view, current.matches[index], rootRef.current);
  }
  useEffect(() => {
    if (!editor) return;
    const find = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      // Formatting popovers intentionally retain the editor selection/focus.
      // Let the top-level menu/modal consume Escape before closing find.
      if (event.key === "Escape" && document.querySelector(".nf-popover, .nf-modal-backdrop")) return;
      const inEditor = event.target instanceof Node && editor.view.dom.contains(event.target);
      const inSearch = event.target instanceof Node && rootRef.current?.contains(event.target);
      if (!inEditor && !inSearch) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.code === "KeyF" || event.key.toLowerCase() === "f")) {
        event.preventDefault(); event.stopPropagation(); setManualFind(true); setOpen(true);
        window.requestAnimationFrame(() => queryRef.current?.focus());
      }
      if (open && event.key === "F3" && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); event.stopPropagation(); move(event.shiftKey ? -1 : 1); }
      if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeFind(); }
    };
    document.addEventListener("keydown", find, true);
    return () => document.removeEventListener("keydown", find, true);
  }, [editor, open, search]);
  if (!open) return null;
  return <div className={`note-editor-search ${initialQuery && !manualFind ? "from-list" : ""}`} role="search" aria-label={translate("ui.5aa7db3e417a")} ref={rootRef}>
    <label className="note-editor-search-query"><Icon name="search" /><input ref={queryRef} className="nf-input" autoFocus={!initialQuery} aria-label={translate("ui.4964228da715")} value={query} onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); } }} /></label>
    <button aria-label={translate("ui.bff46c40e8c2")} disabled={!search?.count} onClick={() => move(-1)} type="button"><Icon name="back" className="search-previous-icon" /></button>
    <span role="status">{search?.count ? translate("ui.872e50273d01", { p0: search.index + 1, p1: search.count }) : translate("ui.a3876a5d9bfc")}</span>
    <button aria-label={translate("ui.7a5ce21fed83")} disabled={!search?.count} onClick={() => move(1)} type="button"><Icon name="forward" className="search-next-icon" /></button>
    <button aria-label={translate("ui.a91f60a51d0f")} onClick={closeFind} type="button"><Icon name="x" /></button>
  </div>;
}
