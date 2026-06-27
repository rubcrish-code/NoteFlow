import { useMemo, type CSSProperties } from "react";
import type { Note, ProjectCard } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { resolveNoteIcon, type ResolvedNoteIcon } from "../../shared/noteIconRegistry";

interface NoteListPanelProps {
  activeNoteId: string;
  notes: Note[];
  projects: ProjectCard[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelectNote: (noteId: string) => void;
  onTogglePin: (noteId: string) => void;
}

export function NoteListPanel({ activeNoteId, notes, projects, query, onQueryChange, onSelectNote, onTogglePin }: NoteListPanelProps) {
  const projectByKey = useMemo(() => {
    const nextProjectByKey = new Map<string, ProjectCard>();
    projects.forEach((project) => {
      nextProjectByKey.set(project.id, project);
      nextProjectByKey.set(project.title, project);
    });
    return nextProjectByKey;
  }, [projects]);

  return (
    <section className="list">
      <div className="list-top">
        <label className="search" htmlFor="note-search">
          <Icon name="search" />
          <input
            autoComplete="off"
            id="note-search"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Поиск по заметкам и тегам…"
            type="search"
            value={query}
          />
        </label>
      </div>
      <div className="list-head">
        <span className="t">Все заметки</span>
        <span className="c">{notes.length}</span>
      </div>
      <div className="cards">
        {notes.map((note) => {
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
        {notes.length === 0 ? <div className="note-list-empty">Нет заметок по этому запросу.</div> : null}
      </div>
    </section>
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
