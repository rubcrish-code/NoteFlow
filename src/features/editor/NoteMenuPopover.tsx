import { useEffect, useRef, useState } from "react";
import type { Note } from "../../app/types";
import { Icon } from "../../shared/Icon";

interface NoteMenuPopoverProps {
  note: Note;
  onArchive: (noteId: string) => void;
  onClose: () => void;
  onDelete: (noteId: string) => void;
  onDuplicate: (noteId: string) => void;
  onExportMarkdown: (noteId: string) => void;
  onImportMarkdown: () => void;
  onMove: (noteId: string, project: string) => Promise<void>;
  onCreateProject: () => void;
  onRemoveFromProject: (noteId: string) => Promise<void>;
  onTogglePin: (noteId: string) => void;
  projectOptions: string[];
}

type NoteMenuMode = "actions" | "move";

export function NoteMenuPopover({
  note,
  onArchive,
  onClose,
  onDelete,
  onDuplicate,
  onExportMarkdown,
  onImportMarkdown,
  onMove,
  onCreateProject,
  onRemoveFromProject,
  onTogglePin,
  projectOptions,
}: NoteMenuPopoverProps) {
  const [mode, setMode] = useState<NoteMenuMode>("actions");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && popoverRef.current && !popoverRef.current.contains(target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  return (
    <div className="note-menu-popover" ref={popoverRef} role="menu">
      <div className="note-menu-head">
        <div>
          <b>Меню заметки</b>
          <span>{note.title}</span>
        </div>
        <button aria-label="Закрыть" className="editor-popover-close" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>

      {mode === "move" ? (
        <div className="note-menu-projects">
          {projectOptions.map((project) => (
            <button
              className={project === note.project ? "active" : ""}
              key={project}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void onMove(note.id, project).then(onClose).catch(() => setError("Не удалось добавить заметку в проект.")).finally(() => setBusy(false));
              }}
              type="button"
            >
              <Icon name="folder" />
              <span>{project}</span>
            </button>
          ))}
          <button onClick={() => { onCreateProject(); onClose(); }} type="button"><Icon name="plus" /><span>Создать новый проект</span></button>
          {error ? <span className="field-error" role="alert">{error}</span> : null}
          <button className="secondary-btn" onClick={() => setMode("actions")} type="button">
            Назад
          </button>
        </div>
      ) : null}

      {mode === "actions" ? (
        <div className="note-menu-actions-list">
          <button
            onClick={() => {
              onDuplicate(note.id);
              onClose();
            }}
            type="button"
          >
            Дублировать
          </button>
          <button
            onClick={() => {
              onTogglePin(note.id);
              onClose();
            }}
            type="button"
          >
            {note.pinned ? "Открепить заметку" : "Закрепить заметку"}
          </button>
          <button onClick={() => setMode("move")} type="button">
            Добавить в проект
          </button>
          {note.projectId ? <button disabled={busy} onClick={() => {
            setBusy(true);
            setError("");
            void onRemoveFromProject(note.id).then(onClose).catch(() => setError("Не удалось убрать заметку из проекта.")).finally(() => setBusy(false));
          }} type="button">Убрать из проекта</button> : null}
          <button
            onClick={() => { onImportMarkdown(); onClose(); }}
            type="button"
          >
            Импортировать Markdown
          </button>
          <button
            onClick={() => {
              onArchive(note.id);
              onClose();
            }}
            type="button"
          >
            Архивировать
          </button>
          <button
            onClick={() => {
              onExportMarkdown(note.id);
              onClose();
            }}
            type="button"
          >
            Экспортировать
          </button>
          <button
            className="danger"
            onClick={() => {
              onDelete(note.id);
              onClose();
            }}
            type="button"
          >
            Удалить
          </button>
          {error ? <span className="field-error" role="alert">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
