import { useRef, useState } from "react";
import { Icon } from "../../shared/Icon";
import { ModalShell } from "../../shared/ModalShell";
import { prepareMarkdownFiles, type PreparedMarkdownNote } from "./markdownImport";

interface MarkdownImportControlProps {
  onImport: (notes: readonly PreparedMarkdownNote[]) => Promise<number>;
}

type ImportPhase = "closed" | "preparing" | "ready" | "importing" | "error";

export function MarkdownImportControl({ onImport }: MarkdownImportControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const [phase, setPhase] = useState<ImportPhase>("closed");
  const [notes, setNotes] = useState<PreparedMarkdownNote[]>([]);
  const [error, setError] = useState("");

  async function selectFiles(files: File[]) {
    const requestId = ++requestIdRef.current;
    setPhase("preparing");
    setError("");
    try {
      const prepared = await prepareMarkdownFiles(files);
      if (requestId !== requestIdRef.current) return;
      setNotes(prepared);
      setPhase("ready");
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      setNotes([]);
      setError(cause instanceof Error ? cause.message : "Не удалось прочитать Markdown-файлы");
      setPhase("error");
    }
  }

  function close() {
    if (phase === "importing") return;
    requestIdRef.current += 1;
    setPhase("closed");
  }

  async function importNotes() {
    if (phase !== "ready" || notes.length === 0) return;
    setPhase("importing");
    setError("");
    try {
      await onImport(notes);
      setPhase("closed");
    } catch {
      setError("Не удалось импортировать Markdown. Проверьте файлы и повторите попытку.");
      setPhase("ready");
    }
  }

  const skippedReferences = notes.reduce((count, note) => count + note.skippedReferences, 0);

  return (
    <>
      <button className="export-action secondary" onClick={() => inputRef.current?.click()} type="button">
        <Icon name="doc" /> Импорт Markdown
      </button>
      <input
        accept=".md,text/markdown"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length) void selectFiles(files);
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      {phase !== "closed" ? (
        <ModalShell
          backdropClassName="modal-backdrop"
          className="markdown-import-dialog"
          closeDisabled={phase === "importing"}
          description="Выбранные файлы станут новыми заметками. Существующие заметки не изменятся."
          footer={(
            <div className="new-note-actions">
              <button className="secondary-btn" disabled={phase === "importing"} onClick={close} type="button">Отмена</button>
              {phase === "error" ? <button className="secondary-btn" onClick={() => inputRef.current?.click()} type="button">Выбрать снова</button> : null}
              {phase === "ready" || phase === "importing" ? (
                <button className="primary-btn" disabled={phase !== "ready"} onClick={() => void importNotes()} type="button">
                  {phase === "importing" ? <span aria-hidden="true" className="button-spinner" /> : null}
                  {phase === "importing" ? "Импортируем…" : `Импортировать ${notes.length}`}
                </button>
              ) : null}
            </div>
          )}
          onClose={close}
          open
          size="compact"
          title="Импорт Markdown"
          titleId="markdown-import-title"
        >
          {phase === "preparing" ? <p className="markdown-import-status" role="status">Проверяем файлы…</p> : null}
          {notes.length > 0 ? (
            <div className="markdown-import-preview">
              <b>{notes.length === 1 ? "Будет создана 1 заметка" : `Будет создано заметок: ${notes.length}`}</b>
              <ul>{notes.map((note, index) => <li key={`${note.title}-${index}`}>{note.title}</li>)}</ul>
              {skippedReferences > 0 ? (
                <p className="markdown-import-warning" role="status">
                  Ссылки на файлы и изображения не перенесены ({skippedReferences}). Текст заметок сохранится.
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? <div className="field-error" role="alert">{error}</div> : null}
        </ModalShell>
      ) : null}
    </>
  );
}
