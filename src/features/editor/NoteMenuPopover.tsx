import { localizeUiMessage } from "../../shared/uiMessages";
import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
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
  useInterfaceLanguage();
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
      {mode === "move" ? (
        <div className="note-menu-projects">
          <p className="field-help">{translate("ui.2a308587981e")}{note.projectId ? translate("ui.a10d18af4c48") : ""}</p>
          {projectOptions.map((project) => (
            <button
              className={project === note.project ? "active" : ""}
              key={project}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void onMove(note.id, project).then(onClose).catch(() => setError(translate("ui.834d1f27c6ec"))).finally(() => setBusy(false));
              }}
              type="button"
            >
              <Icon name="folder" />
              <span>{project}</span>
            </button>
          ))}
          <button onClick={() => { onCreateProject(); onClose(); }} type="button"><Icon name="plus" /><span>{translate("ui.c0f4e8571e85")}</span></button>
          {error ? <span className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</span> : null}
          <button className="secondary-btn" onClick={() => setMode("actions")} type="button">
            {translate("ui.1a9fb1f3cf8e")}</button>
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
            <Icon name="copy" /><span>{translate("ui.00fea8a656bd")}</span>
          </button>
          <button
            onClick={() => {
              onTogglePin(note.id);
              onClose();
            }}
            type="button"
          >
            <Icon name="pin" /><span>{note.pinned ? translate("ui.bc3100baaade") : translate("ui.7d73457be08e")}</span>
          </button>
          <button onClick={() => setMode("move")} type="button">
            <Icon name="folder" /><span>{translate("ui.b50e40a352c2")}</span>
          </button>
          {note.projectId ? <button disabled={busy} onClick={() => {
            setBusy(true);
            setError("");
            void onRemoveFromProject(note.id).then(onClose).catch(() => setError(translate("ui.5c39716a546d"))).finally(() => setBusy(false));
          }} type="button"><Icon name="folder" /><span>{translate("ui.ba5a59519e29")}</span></button> : null}
          <button
            onClick={() => { onImportMarkdown(); onClose(); }}
            type="button"
          >
            <Icon name="doc" /><span>{translate("ui.d3ec04fc6b43")}</span>
          </button>
          <button
            onClick={() => {
              onArchive(note.id);
              onClose();
            }}
            type="button"
          >
            <Icon name="archive" /><span>{translate("ui.1137508af8ff")}</span>
          </button>
          <button
            onClick={() => {
              onExportMarkdown(note.id);
              onClose();
            }}
            type="button"
          >
            <Icon name="doc" /><span>{translate("ui.78dfcef11633")}</span>
          </button>
          <button
            className="danger"
            onClick={() => {
              onDelete(note.id);
              onClose();
            }}
            type="button"
          >
            <Icon name="x" /><span>{translate("ui.be99b1361201")}</span>
          </button>
          {error ? <span className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
