import { localizeUiMessage } from "./uiMessages";
import { translate, useInterfaceLanguage, getInterfaceLanguage } from "./i18n";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ModalShell } from "./ModalShell";
import { normalizeLocalProfileName, validateLocalProfileName } from "./localProfile";

interface LocalProfileModalProps {
  name: string;
  onClose: () => void;
  onSave: (name: string) => void;
  open: boolean;
}

export function LocalProfileModal({ name, onClose, onSave, open }: LocalProfileModalProps) {
  useInterfaceLanguage();
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(name);
    setError("");
    const frame = window.requestAnimationFrame(() => inputRef.current?.select());
    return () => window.cancelAnimationFrame(frame);
  }, [name, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateLocalProfileName(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    onSave(normalizeLocalProfileName(draft));
  }

  return (
    <ModalShell
      backdropClassName="modal-backdrop"
      className="local-profile-modal"
      description={translate("ui.789534f2eadb")}
      footer={(
        <div className="new-note-actions">
          <button className="secondary-btn" onClick={onClose} type="button">{translate("ui.8fbe9b75cbdf")}</button>
          <button className="primary-btn" form="local-profile-form" type="submit">{translate("ui.b4d30cae5289")}</button>
        </div>
      )}
      initialFocusRef={inputRef}
      onClose={onClose}
      open={open}
      size="compact"
      title={translate("ui.afe0984a7827")}
      titleId="local-profile-title"
    >
      <form id="local-profile-form" onSubmit={handleSubmit}>
        <label className="field">
          {translate("ui.1da7e9372e2f")}<input
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setError("");
            }}
            ref={inputRef}
            value={draft}
          />
        </label>
        {error ? <div className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</div> : null}
      </form>
    </ModalShell>
  );
}
