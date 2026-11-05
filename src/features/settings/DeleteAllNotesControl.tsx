import { localizeUiMessage } from "../../shared/uiMessages";
import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useRef, useState } from "react";
import { getDeleteAllNotesSummary, type DeleteAllNotesResult, type DeleteAllNotesSummary } from "../../services/dataService";
import { Icon } from "../../shared/Icon";
import { InfoHint } from "../../shared/InfoHint";
import { formatRussianCount, NOTE_COUNT_FORMS } from "../../shared/russianPlural";
import { SettingsModalShell } from "./ModelSettingsUi";



interface Props {
  disabled?: boolean;
  getSummary?: () => Promise<DeleteAllNotesSummary>;
  onDelete: () => Promise<DeleteAllNotesResult>;
  onToast: (message: string) => void;
}

export function DeleteAllNotesControl({ disabled = false, getSummary = getDeleteAllNotesSummary, onDelete, onToast }: Props) {
  useInterfaceLanguage();
  const CONFIRMATION = translate("ui.9b588e8c0890");
  const [summary, setSummary] = useState<DeleteAllNotesSummary | null>(null);
  const [phase, setPhase] = useState<"closed" | "review" | "confirm" | "deleting">("closed");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: number;
    function poll() {
      if (busy.current) { timer = window.setTimeout(poll, 3000); return; }
      const id = ++requestId.current;
      void getSummary().then((value) => {
        if (active && requestId.current === id) setSummary(value);
      }).catch(() => {
        if (active && requestId.current === id) setError(translate("ui.c331da77538e"));
      }).finally(() => { if (active) timer = window.setTimeout(poll, 3000); });
    }
    poll();
    return () => { active = false; requestId.current++; window.clearTimeout(timer); };
  }, [disabled, getSummary]);

  async function review() {
    if (busy.current) return;
    busy.current = true;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const value = await getSummary();
      if (requestId.current !== id) return;
      setSummary(value);
      if (value.notes > 0) setPhase("review");
    } catch {
      if (requestId.current === id) setError(translate("ui.82349265d035"));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function close() {
    if (busy.current) return;
    setPhase("closed");
    setPhrase("");
    setError("");
  }

  async function remove() {
    if (busy.current || phase !== "confirm" || phrase.trim() !== CONFIRMATION) return;
    busy.current = true;
    setPhase("deleting");
    setError("");
    try {
      const result = await onDelete();
      requestId.current++;
      setSummary({ notes: 0, archivedNotes: 0, revisions: 0, noteChats: 0, ragChats: 0 });
      setPhrase("");
      setPhase("closed");
      onToast(result.cleanupPending
        ? translate("ui.37ec684d380d")
        : translate("ui.d8937cda5b19"));
    } catch {
      setPhase("confirm");
      setError(translate("ui.f164e4baee25"));
    } finally {
      busy.current = false;
    }
  }

  const confirming = phase === "confirm" || phase === "deleting";
  return (
    <section className="settings-card bulk-delete-zone" aria-labelledby="bulk-delete-heading">
      <div className="settings-section-head">
        <div>
          <b id="bulk-delete-heading">{translate("ui.43f7b7e18c3b") + " "}<InfoHint text={translate("ui.8eee6c736a78")} /></b>
          <span>{translate("ui.055d158dd026")}</span>
        </div>
      </div>
      <button className="danger-btn" disabled={disabled || loading || summary?.notes === 0} onClick={() => void review()} type="button">
        {loading ? <span aria-hidden="true" className="button-spinner" /> : <Icon name="x" />}
        {translate("ui.c91ca7f68fb7")}</button>
      {summary?.notes === 0 ? <p className="bulk-delete-hint">{translate("ui.17bf3dc235de")}</p> : null}
      {error && phase === "closed" ? <p role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</p> : null}
      {phase !== "closed" ? <SettingsModalShell
        className="bulk-delete-modal"
        titleId="bulk-delete-title"
        closeDisabled={phase === "deleting"}
        onClose={close}
        title={confirming ? translate("ui.a4b0a3ad7381") : translate("ui.994b12b5b53b")}
        footer={(
          <div className="settings-modal-footer-actions">
            <button className="secondary-btn" disabled={phase === "deleting"} onClick={close} type="button">{translate("ui.8fbe9b75cbdf")}</button>
            {confirming ? (
              <button className="danger-btn" disabled={phase === "deleting" || phrase.trim() !== CONFIRMATION} onClick={() => void remove()} type="button">
                {phase === "deleting" ? <span aria-hidden="true" className="button-spinner" /> : null}
                {phase === "deleting" ? translate("ui.044870c94eb5") : translate("ui.be99b1361201")}
              </button>
            ) : <button className="secondary-btn" onClick={() => { setPhrase(""); setPhase("confirm"); }} type="button">{translate("ui.a42aee58d60a")}</button>}
          </div>
        )}
      >
        {confirming ? (
          <label className="field full bulk-delete-confirmation">
            <span>{translate("ui.e40cb25b4b3c") + " "}<b>{CONFIRMATION}</b></span>
            <input aria-label={translate("ui.9ab1e8020b28")} autoComplete="off" disabled={phase === "deleting"} onChange={(event) => setPhrase(event.target.value)} value={phrase} />
          </label>
        ) : (
          <div>
            <b>{translate("ui.6d11ff776220")}</b>
            <ul>
              <li>{formatRussianCount(summary?.notes ?? 0, NOTE_COUNT_FORMS)} {" " + translate("ui.6691aec4c3ce") + " "}{summary?.archivedNotes ?? 0});</li>
              <li>{translate("ui.a0d3d9ee5eca") + " "}{(summary?.noteChats ?? 0) + (summary?.ragChats ?? 0)});</li>
              <li>{translate("ui.3506ba5d3bf5")}{summary?.revisions ?? 0}{translate("ui.793ea1ec0fd2")}</li>
              <li>{translate("ui.8a4613d66550")}</li>
            </ul>
            <b>{translate("ui.6966dba1717a")}</b>
            <ul><li>{translate("ui.2ff814546da1")}</li><li>{translate("ui.385ec54711dd")}</li><li>{translate("ui.d166d536354f")}</li></ul>
            <p>{translate("ui.0041e4732c11")}</p>
            <p>{translate("ui.6d5ef864762d")}</p>
          </div>
        )}
        {error ? <p role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</p> : null}
      </SettingsModalShell> : null}
    </section>
  );
}
