import { translate } from "../../shared/i18n";
import type { TagRow } from "../../app/types";
import { ENTITY_NAME_MAX_LENGTH, entityNameLength, normalizeEntityName } from "../../shared/entityName";

export const TAG_NAME_MAX_LENGTH = ENTITY_NAME_MAX_LENGTH;

export function normalizeTagName(value: string) {
  return normalizeEntityName(value).normalize("NFC");
}

function tagNameKey(value: string) {
  return normalizeTagName(value).toLocaleLowerCase("ru-RU").normalize("NFC");
}

export function validateTagName(tags: TagRow[], sourceTagId: string | undefined, draft: string) {
  const name = normalizeTagName(draft);
  if (!name) return translate("ui.b58e7bfc23ec");
  const current = tags.find((tag) => tag.id === sourceTagId);
  if (draft !== current?.name && entityNameLength(name) > TAG_NAME_MAX_LENGTH) return translate("ui.cc5c3166b9e5", { p0: TAG_NAME_MAX_LENGTH });
  const key = tagNameKey(name);
  const duplicate = tags.some((tag) => tag.id !== sourceTagId && tagNameKey(tag.name) === key);
  return duplicate ? translate("ui.e1c7d27e2582") : "";
}
