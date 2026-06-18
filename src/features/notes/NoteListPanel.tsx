import type { Note } from "../../app/types";
import { Icon } from "../../shared/Icon";

interface NoteListPanelProps {
  activeNoteId: string;
  notes: Note[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelectNote: (noteId: string) => void;
}

export function NoteListPanel({ activeNoteId, notes, query, onQueryChange, onSelectNote }: NoteListPanelProps) {
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
          return (
            <button className={`card ${activeNoteId === note.id ? "on" : ""}`} key={note.id} onClick={() => onSelectNote(note.id)} type="button">
              {note.pinned ? (
                <span className="pin" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 4h6l-1 6 3 3v2h-4v5l-1 1-1-1v-5H6v-2l3-3z" />
                  </svg>
                </span>
              ) : null}
              <span className={`ic tag-bg-${primaryTag.color}`}>
                <Icon name={note.icon} />
              </span>
              <span className="body">
                <span className="ct">{note.title}</span>
                <span className="cs">{note.summary}</span>
                <span className="cf">
                  <span className={`tag tag-${primaryTag.color}`}>{primaryTag.name}</span>
                  <span className="date">{note.dateLabel}</span>
                </span>
              </span>
            </button>
          );
        })}
        {notes.length === 0 ? <div className="note-list-empty">Нет заметок по этому запросу.</div> : null}
      </div>
    </section>
  );
}
