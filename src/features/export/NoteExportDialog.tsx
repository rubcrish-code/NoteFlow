import { localizeUiMessage } from "../../shared/uiMessages";
import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { useRef, useState } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { exportFormatLabels } from "../../services/noteExportService";
import type { NoteExportFormat } from "./exportDocument";
import type { EditorDocument } from "../editor/markdownService";

export function NoteExportDialog({ onClose, onExport, initialFormat = "md" }: { onClose: () => void; onExport: (format: NoteExportFormat) => Promise<void>; document?: EditorDocument; initialFormat?: NoteExportFormat }) {
  useInterfaceLanguage();
  const [format, setFormat] = useState<NoteExportFormat>(initialFormat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  async function submit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError("");
    try { await onExport(format); onClose(); }
    catch (error) { setError(error instanceof Error && error.message === translate("ui.c93e1d253df2") ? error.message : translate("ui.471743aba762", { p0: format.toUpperCase() })); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <ModalShell closeDisabled={busy} onClose={onClose} open size="compact" title={translate("ui.28faf17cf8e7")}
    footer={<div className="new-note-actions"><button className="secondary-btn" disabled={busy} onClick={onClose} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="primary-btn" disabled={busy} onClick={() => void submit()} type="button">{busy ? <span aria-hidden="true" className="button-spinner" /> : null}{busy ? translate("ui.9c27c381dd8b") : translate("ui.b4d30cae5289")}</button></div>}>
    <fieldset className="note-export-formats" disabled={busy}><legend>{translate("ui.7cba873cedb2")}</legend>{(Object.keys(exportFormatLabels) as NoteExportFormat[]).map((value) => <label key={value}><input aria-label={exportFormatLabels[value]} aria-describedby={value === "md" ? "markdown-export-hint" : undefined} checked={format === value} name="note-export-format" onChange={() => setFormat(value)} type="radio" value={value} /><span><span>{exportFormatLabels[value]}</span>{value === "md" ? <small className="markdown-export-hint" id="markdown-export-hint">{translate("ui.f6cd18bd7792")}</small> : null}</span></label>)}</fieldset>
    {error ? <p className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</p> : null}
  </ModalShell>;
}
