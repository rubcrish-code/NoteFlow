import { useRef, useState } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { exportFormatLabels } from "../../services/noteExportService";
import type { NoteExportFormat } from "./exportDocument";

export function NoteExportDialog({ onClose, onExport }: { onClose: () => void; onExport: (format: NoteExportFormat) => Promise<void> }) {
  const [format, setFormat] = useState<NoteExportFormat>("md");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  async function submit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try { await onExport(format); onClose(); }
    catch (error) { setError(error instanceof Error && error.message === "Не удалось сохранить изменения перед экспортом." ? error.message : `Не удалось сохранить ${format.toUpperCase()}. Попробуйте ещё раз.`); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <ModalShell closeDisabled={busy} onClose={onClose} open size="compact" title="Экспортировать заметку"
    footer={<div className="new-note-actions"><button className="secondary-btn" disabled={busy} onClick={onClose} type="button">Отмена</button><button className="primary-btn" disabled={busy} onClick={() => void submit()} type="button">{busy ? <span aria-hidden="true" className="button-spinner" /> : null}{busy ? "Сохраняем…" : "Сохранить"}</button></div>}>
    <fieldset className="note-export-formats" disabled={busy}><legend>Формат файла</legend>{(Object.keys(exportFormatLabels) as NoteExportFormat[]).map((value) => <label key={value}><input checked={format === value} name="note-export-format" onChange={() => setFormat(value)} type="radio" value={value} /><span>{exportFormatLabels[value]}</span></label>)}</fieldset>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
  </ModalShell>;
}
