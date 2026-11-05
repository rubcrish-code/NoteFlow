import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useRef, useState } from "react";
import { searchNotes, type SearchNoteResult } from "../../services/searchService";
import { ModalShell } from "../../shared/ModalShell";
import { Icon } from "../../shared/Icon";

const PAGE_SIZE = 80;

export function NoteLinkPicker({ onClose, onChoose }: { onClose: () => void; onChoose: (noteId: string, title: string) => void }) {
  useInterfaceLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchNoteResult[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    const timer = window.setTimeout(() => {
      void searchNotes({ query, includeArchived: true, titleOnly: true, offset, limit: PAGE_SIZE + 1 }).then((notes) => {
        if (cancelled) return;
        setHasMore(notes.length > PAGE_SIZE);
        setResults(notes.slice(0, PAGE_SIZE)); setIndex(0);
      }).catch(() => { if (!cancelled) { setError(true); setResults([]); } }).finally(() => { if (!cancelled) setLoading(false); });
    }, query.trim() ? 150 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, attempt, offset]);
  useEffect(() => {
    const option = document.getElementById(`note-link-${index}`);
    const list = option?.parentElement;
    if (!option || !list) return;
    // Do not scroll the modal body (and its input) when navigating the inner list.
    const item = option.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    const scale = list.clientHeight ? bounds.height / list.clientHeight : 1;
    if (item.top < bounds.top) list.scrollTop -= (bounds.top - item.top) / scale;
    else if (item.bottom > bounds.bottom) list.scrollTop += (item.bottom - bounds.bottom) / scale;
  }, [index, results]);
  return <ModalShell open onClose={onClose} title={translate("ui.33b49d4149c0")} titleId="note-link-title" size="compact" initialFocusRef={inputRef} className="note-link-picker">
    <input className="nf-input" placeholder={translate("ui.07c22eb2d932")} aria-label={translate("ui.07c22eb2d932")} aria-controls="note-link-options" aria-activedescendant={!loading && results[index] ? `note-link-${index}` : undefined} role="combobox" aria-autocomplete="list" aria-expanded="true" autoComplete="off" ref={inputRef} value={query}
      onChange={(event) => { setQuery(event.currentTarget.value); setOffset(0); setLoading(true); }} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex((current) => results.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0); }
        if (event.key === "Enter" && !event.nativeEvent.isComposing && !loading && results[index]) { event.preventDefault(); onChoose(results[index].noteId, results[index].title); }
      }} />
    <div id="note-link-options" role="listbox" aria-label={translate("ui.04a18b51cdc2")} aria-busy={loading} className="note-link-options">
      {loading ? <p role="status">{translate("ui.fad3da441611")}</p> : error ? <div role="alert">{translate("ui.b00a30205a1b") + " "}<button className="secondary-btn" onClick={() => setAttempt((value) => value + 1)} type="button">{translate("ui.5189135a6110")}</button></div>
        : !results.length ? <p role="status">{query.trim() ? translate("ui.d304bc63bf3c") : translate("ui.7a3a768564d7")}</p> : results.map((note, offset) => <div role="option" aria-selected={offset === index} id={`note-link-${offset}`} key={note.noteId} onClick={() => onChoose(note.noteId, note.title)} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setIndex(offset)}>
          <Icon name="doc" /><span>{note.title}{note.projectId && note.project ? <small>{note.project}</small> : null}{note.archived ? <small>{translate("ui.34886925697b")}</small> : null}</span>
        </div>)}
    </div>
    {offset > 0 || hasMore ? <nav className="note-link-pagination" aria-label={translate("ui.841eaf65f549")}>
      <button type="button" className="secondary-btn" disabled={loading || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>{translate("ui.1a9fb1f3cf8e")}</button>
      <span aria-live="polite">{offset + 1}–{offset + results.length}</span>
      <button type="button" className="secondary-btn" disabled={loading || !hasMore} onClick={() => setOffset((value) => value + PAGE_SIZE)}>{translate("ui.dc9450d2c273")}</button>
    </nav> : null}
  </ModalShell>;
}
