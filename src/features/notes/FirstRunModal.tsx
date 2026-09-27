import { useRef, useState, type FormEvent } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { LOCAL_PROFILE_NAME_MAX_LENGTH, normalizeLocalProfileName, validateLocalProfileName } from "../../shared/localProfile";

interface FirstRunModalProps {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  open: boolean;
}

export function FirstRunModal({ onClose, onCreate, open }: FirstRunModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateLocalProfileName(name);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate(normalizeLocalProfileName(name));
    } catch {
      setError("Не удалось создать локальный профиль. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      backdropClassName="modal-backdrop"
      className="first-run-dialog"
      closeDisabled={busy}
      description="Заметки хранятся на этом устройстве. Регистрация и интернет не нужны."
      dismissOnBackdrop={false}
      footer={(
        <div className="new-note-actions">
          <button className="secondary-btn" disabled={busy} onClick={onClose} type="button">Позже</button>
          <button className="primary-btn" disabled={busy} form="first-run-form" type="submit">
            {busy ? <span aria-hidden="true" className="button-spinner" /> : null}
            {busy ? "Создаём…" : "Создать первую заметку"}
          </button>
        </div>
      )}
      initialFocusRef={nameInputRef}
      onClose={onClose}
      open={open}
      size="compact"
      title="Добро пожаловать в NoteFlow"
      titleId="first-run-title"
    >
      <form className="new-note-form" id="first-run-form" onSubmit={(event) => void submit(event)}>
        <label>
          Как к вам обращаться?
          <input
            aria-invalid={Boolean(error)}
            autoComplete="name"
            maxLength={LOCAL_PROFILE_NAME_MAX_LENGTH}
            onChange={(event) => { setName(event.currentTarget.value); setError(""); }}
            placeholder="Ваше имя"
            ref={nameInputRef}
            value={name}
          />
        </label>
        <p className="first-run-note">ИИ-модели можно подключить позже в Настройках.</p>
        {error ? <div className="field-error" role="alert">{error}</div> : null}
      </form>
    </ModalShell>
  );
}
