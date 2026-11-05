import { localizeUiMessage } from "../../shared/uiMessages";
import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
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
  { get title() { return translate("ui.6f60bf2ade32"); }, get text() { return translate("ui.a78d8471871c"); }, icon: "logo" },
  { get title() { return translate("ui.04a18b51cdc2"); }, get text() { return translate("ui.c99e516c2080"); }, icon: "doc" },
  { get title() { return translate("ui.3ca614ad8576"); }, get text() { return translate("ui.3a486ad671e8"); }, icon: "folder" },
  { get title() { return translate("ui.d42dc93ded58"); }, get text() { return translate("ui.2a8dd061143d"); }, icon: "bulb" },
  { get title() { return translate("ui.ea00b57395d6"); }, get text() { return translate("ui.3f0b845a7b2f"); }, icon: "chat" },
  { get title() { return translate("ui.c1866a721a17"); }, get text() { return translate("ui.c003ff16c2ce"); }, icon: "gear" },
];

export function FirstRunModal({ onClose, onCreate, onSaveProfile, open, replay = false, needsProfileName = true, initialName = "" }: FirstRunModalProps) {
  useInterfaceLanguage();
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
    catch { setError(translate("ui.0dde292e652e")); }
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
    } catch { setError(translate("ui.309282dc83ab")); }
    finally { setBusy(false); }
  }

  return <ModalShell backdropClassName="modal-backdrop" className="first-run-dialog" closeButtonClassName="onboarding-close" closeDisabled dismissOnBackdrop={false}
    description={profileReady ? onboardingSteps[step].text : translate("ui.8dc831e3de79")}
    initialFocusRef={profileReady ? nextButtonRef : nameInputRef} onClose={() => { if (replay) void finish(); }}
    onEscapeKeyDown={() => { if (replay && !busy) void finish(); return true; }} open={open} size="compact"
    title={profileReady ? onboardingSteps[step].title : translate("ui.a92b290f9d9e")} titleId="first-run-title"
    footer={<div className="new-note-actions">
      {profileReady ? <>
        <button className="ghost-btn" disabled={busy} onClick={() => void finish()} type="button">{translate("ui.35716d53aa28")}</button>
        {step > 0 ? <button className="secondary-btn" disabled={busy} onClick={() => setStep((current) => current - 1)} type="button">{translate("ui.1a9fb1f3cf8e")}</button> : null}
        <button className="primary-btn" disabled={busy} onClick={() => { if (lastStep) void finish(); else { setCompleted((current) => new Set([...current, step])); setStep((current) => current + 1); } }} ref={nextButtonRef} type="button">{busy ? translate("ui.9c27c381dd8b") : lastStep ? replay ? translate("ui.8be2bbf39a83") : translate("ui.f91dd6849421") : translate("ui.dc9450d2c273")}</button>
      </> : <button className="primary-btn" disabled={busy || Boolean(validateLocalProfileName(name))} form="first-run-profile" type="submit">{busy ? translate("ui.9c27c381dd8b") : translate("ui.a42aee58d60a")}</button>}
    </div>}>
    {profileReady ? <ol className="onboarding-steps" aria-label={translate("ui.610626a9b64c")}>
      {onboardingSteps.map((item, index) => <li key={item.icon} className={completed.has(index) ? "completed" : ""}>
        <button aria-current={index === step ? "step" : undefined} aria-label={`${item.title}${index === step ? translate("ui.700821061b72") : completed.has(index) ? translate("ui.3a511209b4f4") : translate("ui.829b540ed445")}`} data-tooltip={item.title}
          disabled={busy || index !== step && !completed.has(index)} onClick={() => setStep(index)} type="button"><Icon name={item.icon} /></button>
      </li>)}
    </ol> : <form className="new-note-form" id="first-run-profile" onSubmit={(event) => void saveProfile(event)}>
      <label>{translate("ui.e8fd0234ef1c")}<input aria-invalid={Boolean(error)} autoComplete="name" onChange={(event) => { setName(event.currentTarget.value); setError(""); }} placeholder={translate("ui.429db4c662c3")} ref={nameInputRef} value={name} /></label>
    </form>}
    {error ? <div className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</div> : null}
  </ModalShell>;
}
