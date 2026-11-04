import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { Note, ProjectCard } from "../../app/types";
import type { SearchNoteResult } from "../../services/searchService";
import { Icon } from "../../shared/Icon";
import { getTagDisplayColor, tagColorStyle } from "../tags/tagPalette";
import { getNextSearchResultIndex, splitSearchText } from "./searchText";
import { MenuPopover } from "../../shared/MenuPopover";
import { ModalShell } from "../../shared/ModalShell";
import { NoteExportDialog } from "../export/NoteExportDialog";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { NoteExportFormat } from "../export/exportDocument";

export type NoteSearchStatus = "idle" | "searching" | "results" | "empty" | "error";

interface NoteListPanelProps {
  activeNoteId: string;
  notes: Note[];
  projects: ProjectCard[];
  query: string;
  searchResults: SearchNoteResult[];
  searchStatus: NoteSearchStatus;
  includeArchivedSearch: boolean;
  onQueryChange: (query: string) => void;
  onToggleArchivedSearch: () => void;
  onSelectNote: (noteId: string) => void;
  onTogglePin: (noteId: string) => void;
  projectScope: { id: string; title: string } | null;
  onClearProjectScope: () => void;
  onDuplicateNote?: (noteId: string) => void;
  onArchiveNote?: (noteId: string) => void;
  onRestoreNote?: (noteId: string) => void;
  onDeleteNote?: (noteId: string) => void;
  onExportNote?: (noteId: string, format: NoteExportFormat) => Promise<void>;
  exportFormat?: NoteExportFormat;
}

export function NoteListPanel({
  activeNoteId,
  notes,
  projects,
  query,
  searchResults,
  searchStatus,
  includeArchivedSearch,
  onQueryChange,
  onToggleArchivedSearch,
  onSelectNote,
  onTogglePin,
  projectScope,
  onClearProjectScope,
  onDuplicateNote, onArchiveNote, onRestoreNote, onDeleteNote, onExportNote, exportFormat,
}: NoteListPanelProps) {
  useInterfaceLanguage();
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const isSearchActive = query.trim().length > 0;
  const orderedResults = useMemo(() => [...searchResults.filter((result) => !result.archived), ...searchResults.filter((result) => result.archived)], [searchResults]);
  const [context, setContext] = useState<{ id: string; title: string; pinned: boolean; archived: boolean; x: number; y: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const contextAnchor = useRef<HTMLSpanElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const virtualized = !isSearchActive && notes.length > 200;
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: virtualized ? notes.length : 0,
    enabled: virtualized,
    getScrollElement: () => cardsRef.current,
    getItemKey: (index) => notes[index].id,
    estimateSize: () => 118,
    overscan: 8,
    useFlushSync: false,
    rangeExtractor: (range) => {
      const visible = defaultRangeExtractor(range);
      const focused = focusedNoteId ? notes.findIndex((note) => note.id === focusedNoteId) : -1;
      return focused < 0 ? visible : [...new Set([...visible, focused])].sort((a, b) => a - b);
    },
  });
  const activeIndex = notes.findIndex((note) => note.id === activeNoteId);
  useEffect(() => {
    if (virtualized && activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, virtualized, virtualizer]);
  const projectByKey = useMemo(() => {
    const nextProjectByKey = new Map<string, ProjectCard>();
    projects.forEach((project) => {
      nextProjectByKey.set(project.id, project);
      nextProjectByKey.set(project.title, project);
    });
    return nextProjectByKey;
  }, [projects]);

  useEffect(() => {
    setSelectedSearchIndex(0);
  }, [query, searchResults]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onQueryChange("");
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedSearchIndex((currentIndex) => getNextSearchResultIndex(currentIndex, searchResults.length, event.key));
      return;
    }
    const selectedResult = orderedResults[selectedSearchIndex];
    if (event.key === "Enter" && selectedResult) {
      event.preventDefault();
      onSelectNote(selectedResult.noteId);
    }
  }

  return (
    <section className="list">
      <div className="list-top">
        <label className="search" htmlFor="note-search">
          <Icon name="search" />
          <input
            autoComplete="off"
            id="note-search"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={translate("ui.d9dfc5b86bce")}
            type="search"
            value={query}
          />
        </label>
      </div>
      {projectScope ? (
        <div className="note-project-scope">
          <button aria-label={translate("ui.0786f802cda8", { p0: projectScope.title })} onClick={onClearProjectScope} type="button">
            <Icon name="folder" /><span>{projectScope.title}</span><Icon name="x" />
          </button>
        </div>
      ) : null}
      {isSearchActive ? (
        <div className="note-search-controls">
          <button
            aria-pressed={includeArchivedSearch}
            className={`note-search-filter ${includeArchivedSearch ? "on" : ""}`}
            onClick={onToggleArchivedSearch}
            type="button"
          >
            <Icon name="archive" />
            {translate("ui.3c54b5e783ef")}</button>
          {searchStatus === "searching" ? <span className="note-search-progress">{translate("ui.cf30e3d13493")}</span> : null}
        </div>
      ) : null}
      <div className="list-head">
        <span className="t">{isSearchActive ? translate("ui.24735a7161d9") : projectScope ? translate("ui.9f904c6f2808") : translate("ui.4bcfa3fb168f")}</span>
        <span className="c">{isSearchActive ? searchResults.length : notes.length}</span>
      </div>
      <div className="cards" ref={cardsRef} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedNoteId(null); }} onKeyDown={(event) => {
        if (!virtualized || !(event.target instanceof Element) || !event.target.closest(".card-hit") || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        const current = Number(event.target.closest<HTMLElement>("[data-index]")?.dataset.index ?? 0);
        const next = event.key === "Home" ? 0 : event.key === "End" ? notes.length - 1 : Math.max(0, Math.min(notes.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
        event.preventDefault(); setFocusedNoteId(notes[next].id);
        virtualizer.scrollToIndex(next, { align: "auto" });
        window.requestAnimationFrame(() => cardsRef.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"] .card-hit`)?.focus());
      }}>
        {isSearchActive
          ? orderedResults.map((result, index) => (
            <div key={result.noteId} onContextMenu={(event) => { event.preventDefault(); setContext({ id: result.noteId, title: result.title, pinned: notes.find((note) => note.id === result.noteId)?.pinned ?? false, archived: result.archived, x: event.clientX, y: event.clientY }); }}>
              {index === 0 || result.archived !== orderedResults[index - 1].archived ? <div className="note-search-group">{result.archived ? translate("ui.3c54b5e783ef") : translate("ui.04a18b51cdc2")}</div> : null}
              <SearchResultCard
                active={selectedSearchIndex === index}
                key={result.noteId}
                onSelect={() => onSelectNote(result.noteId)}
                query={query}
                result={result}
              />
            </div>
            ))
          : virtualized ? <div className="virtual-note-list" role="list" aria-label={translate("ui.04a18b51cdc2")} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => <div className="virtual-note-row" key={item.key} data-index={item.index} ref={virtualizer.measureElement} role="listitem" aria-posinset={item.index + 1} aria-setsize={notes.length} onFocusCapture={() => setFocusedNoteId(notes[item.index].id)} style={{ transform: `translateY(${item.start}px)` }}>{renderNote(notes[item.index])}</div>)}
          </div> : notes.map(renderNote)}
        {searchStatus === "empty" ? <div className="note-list-empty">{translate("ui.23fdaa4c2b85")}</div> : null}
        {searchStatus === "error" ? <div className="note-list-empty error">{translate("ui.7d75f9922dec")}</div> : null}
        {!isSearchActive && notes.length === 0 ? <div className="note-list-empty">{translate("ui.17bf3dc235de")}</div> : null}
      </div>
      {context ? <>
        <span className="editor-context-anchor" style={{ left: context.x, top: context.y }} tabIndex={-1} ref={contextAnchor} />
        <MenuPopover anchorRef={contextAnchor} ariaLabel={translate("ui.6e85be15dc5c", { p0: context.title })} isOpen onClose={() => setContext(null)} className="row-actions-menu">
          <button role="menuitem" type="button" onClick={() => { onDuplicateNote?.(context.id); setContext(null); }}><Icon name="copy" />{translate("ui.00fea8a656bd")}</button>
          <button role="menuitem" type="button" onClick={() => { onTogglePin(context.id); setContext(null); }}><Icon name="pin" />{context.pinned ? translate("ui.9fb423fbc918") : translate("ui.340e3c751299")}</button>
          <button role="menuitem" type="button" onClick={() => { if (context.archived) onRestoreNote?.(context.id); else onArchiveNote?.(context.id); setContext(null); }}><Icon name="archive" />{context.archived ? translate("ui.76f55a988f8a") : translate("ui.1137508af8ff")}</button>
          <button role="menuitem" type="button" onClick={() => { setExportId(context.id); setContext(null); }}><Icon name="doc" />{translate("ui.78dfcef11633")}</button>
          <span className="toolbar-overflow-separator" role="separator" />
          <button className="danger" role="menuitem" type="button" onClick={() => { setPendingDelete(context); setContext(null); }}><Icon name="x" />{translate("ui.be99b1361201")}</button>
        </MenuPopover>
      </> : null}
      {pendingDelete ? <ModalShell className="note-delete-dialog" open title={translate("ui.55390b546ba2", { p0: pendingDelete.title })} titleId="list-delete-note-title" description={translate("ui.2c9af9829beb")} size="compact" onClose={() => setPendingDelete(null)} footer={<div className="new-note-actions"><button className="secondary-btn" onClick={() => setPendingDelete(null)} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="danger-btn" onClick={() => { onDeleteNote?.(pendingDelete.id); setPendingDelete(null); }} type="button">{translate("ui.be99b1361201")}</button></div>}>{null}</ModalShell> : null}
      {exportId && onExportNote ? <NoteExportDialog initialFormat={exportFormat} document={notes.find((note) => note.id === exportId)?.editorDocument} onClose={() => setExportId(null)} onExport={(format) => onExportNote(exportId, format)} /> : null}
    </section>
  );

  function renderNote(note: Note) {
              const primaryTag = note.tags[0];
              const project = note.projectId ? projectByKey.get(note.projectId) : undefined;
              const accentStyle = primaryTag ? { "--note-accent": getTagDisplayColor(primaryTag) } as CSSProperties : undefined;
              return (
                <div className={`card ${activeNoteId === note.id ? "on" : ""} ${note.pinned ? "pinned" : ""}`} key={note.id} style={accentStyle} onContextMenu={(event) => { event.preventDefault(); setContext({ id: note.id, title: note.title, pinned: Boolean(note.pinned), archived: false, x: event.clientX, y: event.clientY }); }}>
                  <button className="card-hit" onClick={() => onSelectNote(note.id)} type="button">
                    <span className="body">
                      <span className="card-main-row">
                        <span className="ct">{note.title}</span>
                        <span className="date">{note.dateLabel}</span>
                      </span>
                      <span className="cs">{note.summary}</span>
                      {project ? <span className="card-project">{project.title}</span> : null}
                      <span className="cf">
                        {note.tags.map((tag) => <span className={`tag tag-${tag.color}`} key={tag.id} style={tagColorStyle(tag)}>{tag.name}</span>)}
                      </span>
                    </span>
                  </button>
                  <button
                    aria-label={note.pinned ? translate("ui.bc3100baaade") : translate("ui.7d73457be08e")}
                    className="pin-action"
                    data-tooltip={note.pinned ? translate("ui.bc3100baaade") : translate("ui.7d73457be08e")}
                    onClick={() => onTogglePin(note.id)}
                    type="button"
                  >
                    <Icon name="pin" />
                  </button>
                </div>
              );
  }
}

function SearchResultCard({ active, onSelect, query, result }: { active: boolean; onSelect: () => void; query: string; result: SearchNoteResult }) {
  useInterfaceLanguage();
  const primaryTag = result.tags[0];
  const accentStyle = primaryTag ? { "--note-accent": getTagDisplayColor({ color: primaryTag.color, customColor: primaryTag.customColor ?? undefined }) } as CSSProperties : undefined;
  return (
    <button className={`search-result-card ${active ? "on" : ""}`} onClick={onSelect} style={accentStyle} type="button">
      <span className="search-result-title"><HighlightedText query={query} text={result.title} /></span>
      <span className="search-result-snippet"><HighlightedText query={query} text={result.snippet} /></span>
      <span className="search-result-meta">
        {result.projectId ? <span>{result.project}</span> : null}
        {result.tags.map((tag) => <span className={`tag tag-${tag.color}`} key={tag.id} style={tagColorStyle({ color: tag.color, customColor: tag.customColor ?? undefined })}>{tag.name}</span>)}
        {result.archived ? <span className="search-result-archived">{translate("ui.3c54b5e783ef")}</span> : null}
      </span>
    </button>
  );
}

function HighlightedText({ query, text }: { query: string; text: string }) {
  useInterfaceLanguage();
  return splitSearchText(text, query).map<ReactNode>((segment, index) =>
    segment.highlighted ? <mark key={`${segment.text}-${index}`}>{segment.text}</mark> : segment.text,
  );
}
