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
      description="Это имя видно только в NoteFlow на вашем устройстве."
      footer={(
        <div className="new-note-actions">
          <button className="secondary-btn" onClick={onClose} type="button">Отмена</button>
          <button className="primary-btn" form="local-profile-form" type="submit">Сохранить</button>
        </div>
      )}
      initialFocusRef={inputRef}
      onClose={onClose}
      open={open}
      size="compact"
      title="Имя локального профиля"
      titleId="local-profile-title"
    >
      <form id="local-profile-form" onSubmit={handleSubmit}>
        <label className="field">
          Имя
          <input
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setError("");
            }}
            ref={inputRef}
            value={draft}
          />
        </label>
        {error ? <div className="field-error" role="alert">{error}</div> : null}
      </form>
    </ModalShell>
  );
}
