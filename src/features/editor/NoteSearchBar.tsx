import { useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Icon } from "../../shared/Icon";
import { noteSearchKey } from "./noteSearch";
import { scrollToSearchMatch } from "./scrollToSearchMatch";

export function NoteSearchBar({ editor, initialQuery = "" }: { editor: Editor | null; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(Boolean(initialQuery));
  const rootRef = useRef<HTMLDivElement>(null);
  const search = useEditorState({ editor, selector: ({ editor: current }) => current ? noteSearchKey.getState(current.state) : undefined });
  useEffect(() => { setQuery(initialQuery); setOpen(Boolean(initialQuery)); }, [initialQuery]);
  useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: open ? query : "" })); }, [editor, query, open]);
  function move(delta: number) {
    if (!editor || !search?.matches.length) return;
    const index = (search.index + delta + search.matches.length) % search.matches.length;
    editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { index }));
    scrollToSearchMatch(editor.view, search.matches[index], rootRef.current);
  }
  useEffect(() => {
    if (!editor) return;
    const find = (event: KeyboardEvent) => {
      const inEditor = event.target instanceof Node && editor.view.dom.contains(event.target);
      const inSearch = event.target instanceof Node && rootRef.current?.contains(event.target);
      if (!inEditor && !inSearch) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); setOpen(true); }
      if (open && event.key === "F3") { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
      if (open && event.key === "Escape") { event.preventDefault(); setOpen(false); }
    };
    document.addEventListener("keydown", find);
    return () => document.removeEventListener("keydown", find);
  }, [editor, open, search]);
  if (!open) return null;
  return <div className={`note-editor-search ${initialQuery ? "from-list" : ""}`} role="search" aria-label="Поиск в заметке" ref={rootRef}>
    <label className="note-editor-search-query"><Icon name="search" /><input className="nf-input" autoFocus={!initialQuery} aria-label="Найти в заметке" value={query} onChange={(event) => setQuery(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter") move(event.shiftKey ? -1 : 1); }} /></label>
    <button aria-label="Предыдущее совпадение" disabled={!search?.matches.length} onClick={() => move(-1)} type="button"><Icon name="back" className="search-previous-icon" /></button>
    <span role="status">{search?.matches.length ? `${search.index + 1} из ${search.matches.length}` : "Нет совпадений"}</span>
    <button aria-label="Следующее совпадение" disabled={!search?.matches.length} onClick={() => move(1)} type="button"><Icon name="forward" className="search-next-icon" /></button>
    <button aria-label="Закрыть поиск в заметке" onClick={() => setOpen(false)} type="button"><Icon name="x" /></button>
  </div>;
}
