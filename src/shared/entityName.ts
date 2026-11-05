import { translate } from "./i18n";
import { graphemeLength } from "./graphemes";

export const ENTITY_NAME_MAX_LENGTH = 25;

export function normalizeEntityName(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

export function entityNameLength(value: string) {
  return graphemeLength(normalizeEntityName(value));
}

export function validateEntityName(value: string) {
  if (!value.trim()) return translate("ui.bce24a210886");
  if (entityNameLength(value) > ENTITY_NAME_MAX_LENGTH) return translate("ui.2a3e66d775e2");
  return "";
}
