import type { TagRow } from "../../app/types";

export const TAG_NAME_MAX_LENGTH = 80;

export function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

export function validateTagName(tags: TagRow[], sourceTagId: string | undefined, draft: string) {
  const name = normalizeTagName(draft);
  if (!name) return "Введите название тега";
  if (Array.from(name).length > TAG_NAME_MAX_LENGTH) return `Не больше ${TAG_NAME_MAX_LENGTH} символов`;
  const duplicate = tags.some((tag) => tag.id !== sourceTagId && tag.name.trim().toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"));
  return duplicate ? "Тег с таким названием уже существует" : "";
}
