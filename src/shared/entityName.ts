export const ENTITY_NAME_MAX_LENGTH = 25;

export function entityNameLength(value: string) {
  return Array.from(value.trim()).length;
}

export function validateEntityName(value: string) {
  if (!value.trim()) return "Введите название";
  if (entityNameLength(value) > ENTITY_NAME_MAX_LENGTH) return "Название не должно превышать 25 символов.";
  return "";
}
