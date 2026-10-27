import type { TagRow } from "../../app/types";
import { ENTITY_NAME_MAX_LENGTH, entityNameLength, normalizeEntityName } from "../../shared/entityName";

export const TAG_NAME_MAX_LENGTH = ENTITY_NAME_MAX_LENGTH;

export function normalizeTagName(value: string) {
  return normalizeEntityName(value);
}

export function validateTagName(tags: TagRow[], sourceTagId: string | undefined, draft: string) {
  const name = normalizeTagName(draft);
  if (!name) return "Введите название тега";
  const current = tags.find((tag) => tag.id === sourceTagId);
  if (name !== current?.name && entityNameLength(name) > TAG_NAME_MAX_LENGTH) return `Максимум ${TAG_NAME_MAX_LENGTH} символов`;
  const duplicate = tags.some((tag) => tag.id !== sourceTagId && tag.name.trim().toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"));
  return duplicate ? "Тег с таким названием уже существует" : "";
}
