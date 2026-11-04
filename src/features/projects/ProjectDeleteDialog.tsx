import { localizeUiMessage } from "../../shared/uiMessages";
import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { useRef, useState } from "react";
import { SettingsModalShell } from "../settings/ModelSettingsUi";
import { formatRussianCount, NOTE_COUNT_FORMS } from "../../shared/russianPlural";

export function ProjectDeleteDialog({ title, notes, onClose, onDelete }: { title: string; notes: number; onClose: () => void; onDelete: () => Promise<void> }) {
  useInterfaceLanguage();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  async function remove() {
    if (busyRef.current || name !== title) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await onDelete(); onClose(); }
    catch { setError(translate("ui.0a4e3fba0f13")); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <SettingsModalShell title={translate("ui.1ee9d9ef5ed0")} titleId="project-delete-title" size="compact" closeDisabled={busy} dismissOnBackdrop={false} onClose={onClose}
    description={notes > 0 ? translate("ui.f4ab367f9777", { p0: title, p1: formatRussianCount(notes, NOTE_COUNT_FORMS) }) : translate("ui.71fb4f5b4242", { p0: title })}
    footer={<div className="new-note-actions"><button className="secondary-btn" disabled={busy} onClick={onClose} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="danger-btn" disabled={busy || name !== title} onClick={() => void remove()} type="button">{busy ? translate("ui.044870c94eb5") : translate("ui.b8d719c6e9a4")}</button></div>}>
    <label className="archive-delete-name">{translate("ui.f3fa4d2622c5") + " "}<b>{title}</b><input className="nf-input" autoComplete="off" disabled={busy} onChange={(event) => setName(event.currentTarget.value)} value={name} /></label>
    {error ? <div className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</div> : null}
  </SettingsModalShell>;
}
