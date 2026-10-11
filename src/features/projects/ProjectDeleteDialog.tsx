import { useRef, useState } from "react";
import { SettingsModalShell } from "../settings/ModelSettingsUi";
import { formatRussianCount, NOTE_COUNT_FORMS } from "../../shared/russianPlural";

export function ProjectDeleteDialog({ title, notes, onClose, onDelete }: { title: string; notes: number; onClose: () => void; onDelete: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  async function remove() {
    if (busyRef.current || name !== title) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await onDelete(); onClose(); }
    catch { setError("Не удалось удалить проект. Попробуйте ещё раз."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <SettingsModalShell title="Удалить проект?" titleId="project-delete-title" size="compact" closeDisabled={busy} dismissOnBackdrop={false} onClose={onClose}
    description={notes > 0 ? `Вместе с проектом «${title}» будут удалены все заметки внутри него: ${formatRussianCount(notes, NOTE_COUNT_FORMS)}. Это действие нельзя отменить.` : `Проект «${title}» не содержит заметок. Это действие нельзя отменить.`}
    footer={<div className="new-note-actions"><button className="secondary-btn" disabled={busy} onClick={onClose} type="button">Отмена</button><button className="danger-btn" disabled={busy || name !== title} onClick={() => void remove()} type="button">{busy ? "Удаляем…" : "Удалить проект"}</button></div>}>
    <label className="archive-delete-name">Чтобы подтвердить удаление, введите название проекта: <b>{title}</b><input className="nf-input" autoComplete="off" disabled={busy} onChange={(event) => setName(event.currentTarget.value)} value={name} /></label>
    {error ? <div className="field-error" role="alert">{error}</div> : null}
  </SettingsModalShell>;
}
