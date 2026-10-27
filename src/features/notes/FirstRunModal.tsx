import { useRef, useState, type FormEvent } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { Icon, type IconName } from "../../shared/Icon";
import { normalizeLocalProfileName, validateLocalProfileName } from "../../shared/localProfile";

interface FirstRunModalProps {
  onClose: () => void | Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onSaveProfile?: (name: string) => Promise<void>;
  open: boolean;
  replay?: boolean;
  needsProfileName?: boolean;
  initialName?: string;
}

export const onboardingSteps: { title: string; text: string; icon: IconName }[] = [
  { title: "Добро пожаловать в NoteFlow", text: "Заметки, проекты и ИИ — в одном приложении. Заметки хранятся на этом устройстве. Регистрация и интернет не нужны.", icon: "logo" },
  { title: "Заметки", text: "Создавайте заметки, форматируйте текст, добавляйте изображения и файлы.", icon: "doc" },
  { title: "Организация", text: "Объединяйте заметки в проекты и используйте теги.", icon: "folder" },
  { title: "ИИ по заметке", text: "ИИ может работать с содержимым текущей заметки: отвечать на вопросы и помогать с текстом.", icon: "bulb" },
  { title: "ИИ-чат по базе", text: "Задавайте вопросы по всей базе заметок или только по выбранным проектам. Ответы ссылаются на ваши заметки.", icon: "chat" },
  { title: "Ваши данные — ваш выбор", text: "Вы сами выбираете ИИ-модель: локальную или внешнюю. Перед облачной обработкой NoteFlow запросит ваше согласие.", icon: "gear" },
];

export function FirstRunModal({ onClose, onCreate, onSaveProfile, open, replay = false, needsProfileName = true, initialName = "" }: FirstRunModalProps) {
  const [profileReady, setProfileReady] = useState(replay || !needsProfileName);
  const [name, setName] = useState(needsProfileName && !replay ? "" : initialName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<ReadonlySet<number>>(new Set());
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const lastStep = step === onboardingSteps.length - 1;

  async function finish() {
    if (busy || !profileReady) return;
    setBusy(true); setError("");
    try { await (replay ? onClose() : onCreate(normalizeLocalProfileName(name))); }
    catch { setError("Не удалось завершить знакомство. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const validation = validateLocalProfileName(name);
    if (validation) { setError(validation); return; }
    setBusy(true); setError("");
    try {
      if (!onSaveProfile) throw new Error("Profile persistence unavailable");
      await onSaveProfile(normalizeLocalProfileName(name));
      setProfileReady(true);
    } catch { setError("Не удалось сохранить локальный профиль. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }

  return <ModalShell backdropClassName="modal-backdrop" className="first-run-dialog" closeButtonClassName="onboarding-close" closeDisabled dismissOnBackdrop={false}
    description={profileReady ? onboardingSteps[step].text : "Ваше имя используется только в локальном профиле. Регистрация не нужна."}
    initialFocusRef={profileReady ? nextButtonRef : nameInputRef} onClose={() => { if (replay) void finish(); }}
    onEscapeKeyDown={() => { if (replay && !busy) void finish(); return true; }} open={open} size="compact"
    title={profileReady ? onboardingSteps[step].title : "Создайте локальный профиль"} titleId="first-run-title"
    footer={<div className="new-note-actions">
      {profileReady ? <>
        <button className="ghost-btn" disabled={busy} onClick={() => void finish()} type="button">Пропустить</button>
        {step > 0 ? <button className="secondary-btn" disabled={busy} onClick={() => setStep((current) => current - 1)} type="button">Назад</button> : null}
        <button className="primary-btn" disabled={busy} onClick={() => { if (lastStep) void finish(); else { setCompleted((current) => new Set([...current, step])); setStep((current) => current + 1); } }} ref={nextButtonRef} type="button">{busy ? "Сохраняем…" : lastStep ? replay ? "Завершить" : "Создать первую заметку" : "Далее"}</button>
      </> : <button className="primary-btn" disabled={busy || Boolean(validateLocalProfileName(name))} form="first-run-profile" type="submit">{busy ? "Сохраняем…" : "Продолжить"}</button>}
    </div>}>
    {profileReady ? <ol className="onboarding-steps" aria-label="Этапы знакомства">
      {onboardingSteps.map((item, index) => <li key={item.title} className={completed.has(index) ? "completed" : ""}>
        <button aria-current={index === step ? "step" : undefined} aria-label={`${item.title}${index === step ? ", текущий" : completed.has(index) ? ", завершён" : ", ещё не пройден"}`} data-tooltip={item.title}
          disabled={busy || index !== step && !completed.has(index)} onClick={() => setStep(index)} type="button"><Icon name={item.icon} /></button>
      </li>)}
    </ol> : <form className="new-note-form" id="first-run-profile" onSubmit={(event) => void saveProfile(event)}>
      <label>Как к вам обращаться?<input aria-invalid={Boolean(error)} autoComplete="name" onChange={(event) => { setName(event.currentTarget.value); setError(""); }} placeholder="Ваше имя" ref={nameInputRef} value={name} /></label>
    </form>}
    {error ? <div className="field-error" role="alert">{error}</div> : null}
  </ModalShell>;
}
