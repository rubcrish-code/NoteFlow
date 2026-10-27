import { ENTITY_NAME_MAX_LENGTH, entityNameLength } from "./entityName";

export function EntityNameCounter({ value }: { value: string }) {
  const count = entityNameLength(value);
  const exceeded = count > ENTITY_NAME_MAX_LENGTH;
  return <small className={`entity-name-counter${exceeded ? " exceeded" : ""}`} aria-live="polite">
    {count} / {ENTITY_NAME_MAX_LENGTH}{exceeded ? <span className="field-error" role="alert">Максимум 25 символов</span> : null}
  </small>;
}
