import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { Note, ProjectCard } from "../../app/types";
import type { SearchNoteResult } from "../../services/searchService";
import { Icon } from "../../shared/Icon";
import { resolveNoteIcon, type ResolvedNoteIcon } from "../../shared/noteIconRegistry";
import { getNextSearchResultIndex, splitSearchText } from "./searchText";

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
}: NoteListPanelProps) {
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const isSearchActive = query.trim().length > 0;
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
    if (event.key === "Enter" && searchResults[selectedSearchIndex]) {
      event.preventDefault();
      onSelectNote(searchResults[selectedSearchIndex].noteId);
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
        <span className="t">{isSearchActive ? "Результаты" : "Все заметки"}</span>
        <span className="c">{isSearchActive ? searchResults.length : notes.length}</span>
      </div>
      <div className="cards">
        {isSearchActive
          ? searchResults.map((result, index) => (
              <SearchResultCard
                active={selectedSearchIndex === index}
                key={result.noteId}
                onSelect={() => onSelectNote(result.noteId)}
                query={query}
                result={result}
              />
            ))
          : notes.map((note) => {
              const primaryTag = note.tags[0];
              const project = (note.projectId ? projectByKey.get(note.projectId) : undefined) ?? projectByKey.get(note.project);
              const resolvedIcon = resolveNoteIcon(note, project);
              return (
                <div className={`card ${activeNoteId === note.id ? "on" : ""} ${note.pinned ? "pinned" : ""}`} key={note.id}>
                  <button className="card-hit" onClick={() => onSelectNote(note.id)} type="button">
                    <span className={`ic tag-bg-${resolvedIcon.color}`} style={getCustomIconStyle(resolvedIcon)}>
                      <Icon name={resolvedIcon.iconName} />
                    </span>
                    <span className="body">
                      <span className="card-main-row">
                        <span className="ct">{note.title}</span>
                        <span className="date">{note.dateLabel}</span>
                      </span>
                      <span className="cs">{note.summary}</span>
                      <span className="cf">
                        <span className={`tag tag-${primaryTag.color}`}>{primaryTag.name}</span>
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
    </section>
  );
}

function SearchResultCard({ active, onSelect, query, result }: { active: boolean; onSelect: () => void; query: string; result: SearchNoteResult }) {
  return (
    <button className={`search-result-card ${active ? "on" : ""}`} onClick={onSelect} type="button">
      <span className="search-result-title"><HighlightedText query={query} text={result.title} /></span>
      <span className="search-result-snippet"><HighlightedText query={query} text={result.snippet} /></span>
      <span className="search-result-meta">
        <span>{result.project}</span>
        {result.tags.slice(0, 2).map((tag) => <span className={`tag tag-${tag.color}`} key={tag.id}>{tag.name}</span>)}
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

function getCustomIconStyle(resolvedIcon: ResolvedNoteIcon): CSSProperties | undefined {
  if (!resolvedIcon.customColor) {
    return undefined;
  }

  return {
    backgroundColor: resolvedIcon.customColor,
    color: "#fff",
  };
}
