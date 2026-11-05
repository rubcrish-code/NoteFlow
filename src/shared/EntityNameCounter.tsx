import { translate, useInterfaceLanguage } from "./i18n";
import { localizeUiMessage } from "./uiMessages";
import { ENTITY_NAME_MAX_LENGTH, entityNameLength } from "./entityName";

export function EntityNameCounter({ value, error = "", legacy = false, id }: { value: string; error?: string; legacy?: boolean; id?: string }) {
  const language = useInterfaceLanguage();
  const count = entityNameLength(value);
  const exceeded = count > ENTITY_NAME_MAX_LENGTH && !legacy;
  const feedback = localizeUiMessage(language, error || (exceeded ? translate("ui.cc5c3166b9e5", { p0: ENTITY_NAME_MAX_LENGTH }) : ""));
  return <small id={id} className={`entity-name-counter${exceeded ? " exceeded" : ""}`} aria-live="polite">
    <span className="entity-name-count">{count} / {ENTITY_NAME_MAX_LENGTH}</span><span className="entity-name-feedback field-error" aria-hidden={!feedback} role={feedback ? "alert" : undefined}>{feedback}</span>
  </small>;
}
