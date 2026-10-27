import { graphemeLength } from "./graphemes";

export const ENTITY_NAME_MAX_LENGTH = 25;

export function normalizeEntityName(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

export function entityNameLength(value: string) {
  return graphemeLength(normalizeEntityName(value));
}

export function validateEntityName(value: string) {
  if (!value.trim()) return "Введите название";
  if (entityNameLength(value) > ENTITY_NAME_MAX_LENGTH) return "Максимум 25 символов";
  return "";
}
