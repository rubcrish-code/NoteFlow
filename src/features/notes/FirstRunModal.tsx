import { useRef, useState, type FormEvent } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { Icon, type IconName } from "../../shared/Icon";
import { LOCAL_PROFILE_NAME_MAX_LENGTH, normalizeLocalProfileName, validateLocalProfileName } from "../../shared/localProfile";

interface FirstRunModalProps {
  onClose: () => void | Promise<void>;
  onCreate: (name: string) => Promise<void>;
  open: boolean;
  replay?: boolean;
}

const steps: { title: string; text: string; icon: IconName }[] = [
  { title: "Добро пожаловать в NoteFlow", text: "Заметки, проекты и ИИ — в одном приложении. Заметки хранятся на этом устройстве. Регистрация и интернет не нужны.", icon: "logo" },
  { title: "Заметки", text: "Создавайте заметки, форматируйте текст, добавляйте изображения и файлы.", icon: "doc" },
  { title: "Организация", text: "Объединяйте заметки в проекты и используйте теги.", icon: "folder" },
  { title: "ИИ по заметке", text: "ИИ может работать с содержимым текущей заметки: отвечать на вопросы и помогать с текстом.", icon: "bulb" },
  { title: "ИИ-чат по базе", text: "Задавайте вопросы по всей базе заметок или только по выбранным проектам. Ответы ссылаются на ваши заметки.", icon: "chat" },
  { title: "Ваши данные — ваш выбор", text: "Вы сами выбираете ИИ-модель: локальную или внешнюю. Перед облачной обработкой NoteFlow запросит ваше согласие.", icon: "gear" },
];

export function FirstRunModal({ onClose, onCreate, open, replay = false }: FirstRunModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const lastStep = step === steps.length - 1;
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function skip() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await onClose(); } catch { setError("Не удалось завершить знакомство. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (replay) { await skip(); return; }
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
      closeButtonClassName="onboarding-close"
      closeDisabled
      description={steps[step].text}
      dismissOnBackdrop={false}
      footer={(
        <div className="new-note-actions">
          <button className="ghost-btn" disabled={busy} onClick={() => void skip()} type="button">Пропустить</button>
          {step > 0 ? <button className="secondary-btn" disabled={busy} onClick={() => setStep((current) => current - 1)} type="button">Назад</button> : null}
          <button className="primary-btn" disabled={busy} form={lastStep ? "first-run-form" : undefined} onClick={lastStep ? undefined : (event) => { event.preventDefault(); setStep((current) => current + 1); }} ref={nextButtonRef} type={lastStep ? "submit" : "button"}>
            {busy ? <span aria-hidden="true" className="button-spinner" /> : null}
            {busy ? "Сохраняем…" : lastStep ? replay ? "Завершить" : "Создать первую заметку" : "Далее"}
          </button>
        </div>
      )}
      initialFocusRef={nextButtonRef}
      onClose={() => void skip()}
      onEscapeKeyDown={() => { void skip(); return true; }}
      open={open}
      size="compact"
      title={steps[step].title}
      titleId="first-run-title"
    >
      <div className="onboarding-progress" aria-label={`Шаг ${step + 1} из ${steps.length}`}>
        <span className="onboarding-step-icon" aria-hidden="true"><Icon name={steps[step].icon} /></span>
        <span className="onboarding-dots" aria-hidden="true">{steps.map((_, index) => <i className={index === step ? "active" : ""} key={index} />)}</span>
      </div>
      {lastStep ? <form className="new-note-form" id="first-run-form" onSubmit={(event) => void submit(event)}>
        {!replay ? <label>
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
        </label> : null}
        <p className="first-run-note">ИИ-модели можно подключить позже в Настройках.</p>
      </form> : null}
      {error ? <div className="field-error" role="alert">{error}</div> : null}
    </ModalShell>
  );
}
