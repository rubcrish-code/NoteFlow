import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { Note, ProjectCard } from "../../app/types";
import type { SearchNoteResult } from "../../services/searchService";
import { Icon } from "../../shared/Icon";
import { getTagDisplayColor } from "../tags/tagPalette";
import { getNextSearchResultIndex, splitSearchText } from "./searchText";
import { MenuPopover } from "../../shared/MenuPopover";
import { ModalShell } from "../../shared/ModalShell";
import { NoteExportDialog } from "../export/NoteExportDialog";
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
  onDuplicateNote, onArchiveNote, onRestoreNote, onDeleteNote, onExportNote,
}: NoteListPanelProps) {
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const isSearchActive = query.trim().length > 0;
  const orderedResults = useMemo(() => [...searchResults.filter((result) => !result.archived), ...searchResults.filter((result) => result.archived)], [searchResults]);
  const [context, setContext] = useState<{ id: string; title: string; pinned: boolean; archived: boolean; x: number; y: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const contextAnchor = useRef<HTMLSpanElement>(null);
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
            placeholder="Поиск по заметкам и тегам…"
            type="search"
            value={query}
          />
        </label>
      </div>
      {projectScope ? (
        <div className="note-project-scope">
          <button aria-label={`Выйти из проекта «${projectScope.title}»`} onClick={onClearProjectScope} type="button">
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
            Архив
          </button>
          {searchStatus === "searching" ? <span className="note-search-progress">Поиск…</span> : null}
        </div>
      ) : null}
      <div className="list-head">
        <span className="t">{isSearchActive ? "Результаты" : projectScope ? "Заметки проекта" : "Все заметки"}</span>
        <span className="c">{isSearchActive ? searchResults.length : notes.length}</span>
      </div>
      <div className="cards">
        {isSearchActive
          ? orderedResults.map((result, index) => (
            <div key={result.noteId} onContextMenu={(event) => { event.preventDefault(); setContext({ id: result.noteId, title: result.title, pinned: notes.find((note) => note.id === result.noteId)?.pinned ?? false, archived: result.archived, x: event.clientX, y: event.clientY }); }}>
              {index === 0 || result.archived !== orderedResults[index - 1].archived ? <div className="note-search-group">{result.archived ? "Архив" : "Заметки"}</div> : null}
              <SearchResultCard
                active={selectedSearchIndex === index}
                key={result.noteId}
                onSelect={() => onSelectNote(result.noteId)}
                query={query}
                result={result}
              />
            </div>
            ))
          : notes.map((note) => {
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
                        {note.tags.map((tag) => <span className={`tag tag-${tag.color}`} key={tag.id}>{tag.name}</span>)}
                      </span>
                    </span>
                  </button>
                  <button
                    aria-label={note.pinned ? "Открепить заметку" : "Закрепить заметку"}
                    className="pin-action"
                    data-tooltip={note.pinned ? "Открепить заметку" : "Закрепить заметку"}
                    onClick={() => onTogglePin(note.id)}
                    type="button"
                  >
                    <Icon name="pin" />
                  </button>
                </div>
              );
            })}
        {searchStatus === "empty" ? <div className="note-list-empty">Ничего не найдено. Попробуйте изменить запрос.</div> : null}
        {searchStatus === "error" ? <div className="note-list-empty error">Не удалось выполнить поиск. Попробуйте ещё раз.</div> : null}
        {!isSearchActive && notes.length === 0 ? <div className="note-list-empty">Заметок пока нет.</div> : null}
      </div>
      {context ? <>
        <span className="editor-context-anchor" style={{ left: context.x, top: context.y }} tabIndex={-1} ref={contextAnchor} />
        <MenuPopover anchorRef={contextAnchor} ariaLabel={`Действия с заметкой «${context.title}»`} isOpen onClose={() => setContext(null)} className="row-actions-menu">
          <button role="menuitem" type="button" onClick={() => { onDuplicateNote?.(context.id); setContext(null); }}><Icon name="copy" />Дублировать</button>
          <button role="menuitem" type="button" onClick={() => { onTogglePin(context.id); setContext(null); }}><Icon name="pin" />{context.pinned ? "Открепить" : "Закрепить"}</button>
          <button role="menuitem" type="button" onClick={() => { if (context.archived) onRestoreNote?.(context.id); else onArchiveNote?.(context.id); setContext(null); }}><Icon name="archive" />{context.archived ? "Восстановить" : "Архивировать"}</button>
          <button role="menuitem" type="button" onClick={() => { setExportId(context.id); setContext(null); }}><Icon name="doc" />Экспортировать</button>
          <span className="toolbar-overflow-separator" role="separator" />
          <button className="danger" role="menuitem" type="button" onClick={() => { setPendingDelete(context); setContext(null); }}><Icon name="x" />Удалить</button>
        </MenuPopover>
      </> : null}
      {exportId && onExportNote ? <NoteExportDialog onClose={() => setExportId(null)} onExport={(format) => onExportNote(exportId, format)} /> : null}
      {pendingDelete ? <ModalShell className="note-delete-dialog" open title={`Удалить заметку «${pendingDelete.title}»?`} titleId="list-delete-note-title" description="После удаления заметку не получится восстановить." size="compact" onClose={() => setPendingDelete(null)} footer={<div className="new-note-actions"><button className="secondary-btn" onClick={() => setPendingDelete(null)} type="button">Отмена</button><button className="danger-btn" onClick={() => { onDeleteNote?.(pendingDelete.id); setPendingDelete(null); }} type="button">Удалить</button></div>}>{null}</ModalShell> : null}
    </section>
  );
}

function SearchResultCard({ active, onSelect, query, result }: { active: boolean; onSelect: () => void; query: string; result: SearchNoteResult }) {
  const primaryTag = result.tags[0];
  const accentStyle = primaryTag ? { "--note-accent": getTagDisplayColor({ color: primaryTag.color, customColor: primaryTag.customColor ?? undefined }) } as CSSProperties : undefined;
  return (
    <button className={`search-result-card ${active ? "on" : ""}`} onClick={onSelect} style={accentStyle} type="button">
      <span className="search-result-title"><HighlightedText query={query} text={result.title} /></span>
      <span className="search-result-snippet"><HighlightedText query={query} text={result.snippet} /></span>
      <span className="search-result-meta">
        {result.projectId ? <span>{result.project}</span> : null}
        {result.tags.map((tag) => <span className={`tag tag-${tag.color}`} key={tag.id}>{tag.name}</span>)}
        {result.archived ? <span className="search-result-archived">Архив</span> : null}
      </span>
    </button>
  );
}

function HighlightedText({ query, text }: { query: string; text: string }) {
  return splitSearchText(text, query).map<ReactNode>((segment, index) =>
    segment.highlighted ? <mark key={`${segment.text}-${index}`}>{segment.text}</mark> : segment.text,
  );
}
