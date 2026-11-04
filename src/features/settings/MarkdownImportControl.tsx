import { localizeUiMessage } from "../../shared/uiMessages";
import { translate, getInterfaceLanguage } from "../../shared/i18n";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Icon } from "../../shared/Icon";
import { ModalShell } from "../../shared/ModalShell";
import { validateEntityName } from "../../shared/entityName";
import { EntityNameCounter } from "../../shared/EntityNameCounter";
import { prepareMarkdownFiles, type PreparedMarkdownNote } from "./markdownImport";

interface MarkdownImportControlProps {
  onImport: (notes: readonly PreparedMarkdownNote[]) => Promise<number>;
  showTrigger?: boolean;
  targetNoteTitle?: string;
}

export interface MarkdownImportControlHandle {
  open: () => void;
}

type ImportPhase = "closed" | "preparing" | "ready" | "importing" | "error";

export const MarkdownImportControl = forwardRef<MarkdownImportControlHandle, MarkdownImportControlProps>(function MarkdownImportControl({ onImport, showTrigger = true, targetNoteTitle }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const [phase, setPhase] = useState<ImportPhase>("closed");
  const [notes, setNotes] = useState<PreparedMarkdownNote[]>([]);
  const [error, setError] = useState("");

  useImperativeHandle(ref, () => ({ open: () => inputRef.current?.click() }), []);

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
      setError(cause instanceof Error ? cause.message : translate("ui.dbfd05078139"));
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
    const validation = notes.map((note) => validateEntityName(note.title)).find(Boolean);
    if (targetNoteTitle === undefined && validation) { setError(validation); return; }
    setPhase("importing");
    setError("");
    try {
      await onImport(notes.map((note) => ({ ...note, title: note.title.trim() })));
      setPhase("closed");
    } catch {
      setError(translate("ui.157ddf49890c"));
      setPhase("ready");
    }
  }

  const skippedReferences = notes.reduce((count, note) => count + note.skippedReferences, 0);

  return (
    <>
      {showTrigger ? <button className="export-action secondary" onClick={() => inputRef.current?.click()} type="button"><Icon name="doc" /> {" " + translate("ui.2675bd162de5")}</button> : null}
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
          description={targetNoteTitle === undefined ? translate("ui.1d70a18dd28b") : translate("ui.c94fa99b7479")}
          footer={(
            <div className="new-note-actions">
              <button className="secondary-btn" disabled={phase === "importing"} onClick={close} type="button">{translate("ui.8fbe9b75cbdf")}</button>
              {phase === "error" ? <button className="secondary-btn" onClick={() => inputRef.current?.click()} type="button">{translate("ui.02faf42b36a7")}</button> : null}
              {phase === "ready" || phase === "importing" ? (
                <button className="primary-btn" disabled={phase !== "ready"} onClick={() => void importNotes()} type="button">
                  {phase === "importing" ? <span aria-hidden="true" className="button-spinner" /> : null}
                  {phase === "importing" ? translate("ui.ff9eb633b0c8") : translate("ui.848ed368817d")}
                </button>
              ) : null}
            </div>
          )}
          onClose={close}
          open
          size="compact"
          title={translate("ui.2675bd162de5")}
          titleId="markdown-import-title"
        >
          {phase === "preparing" ? <p className="markdown-import-status" role="status">{translate("ui.6ee9ffc48a95")}</p> : null}
          {notes.length > 0 ? (
            <div className="markdown-import-preview">
              <b>{targetNoteTitle !== undefined ? translate("ui.b789913adb5f", { p0: targetNoteTitle, p1: notes.length }) : notes.length === 1 ? translate("ui.5787d1624143") : translate("ui.ccb4cbfa8d58", { p0: notes.length })}</b>
              {targetNoteTitle === undefined ? <div className="new-note-form">{notes.map((note, index) => (
                <label key={index}>{translate("ui.40023f7ec93f")}<input aria-invalid={Boolean(validateEntityName(note.title))} disabled={phase === "importing"} onChange={(event) => {
                    const title = event.currentTarget.value;
                    setNotes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title } : item));
                    setError("");
                  }} value={note.title} />
                  <EntityNameCounter value={note.title} />
                  {validateEntityName(note.title) ? <span className="field-error">{validateEntityName(note.title)}</span> : null}
                </label>
              ))}</div> : null}
              {skippedReferences > 0 ? (
                <p className="markdown-import-warning" role="status">
                  {translate("ui.fc52de14a3ef")}{skippedReferences}{translate("ui.a57b389826e0")}</p>
              ) : null}
            </div>
          ) : null}
          {error ? <div className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</div> : null}
        </ModalShell>
      ) : null}
    </>
  );
});
