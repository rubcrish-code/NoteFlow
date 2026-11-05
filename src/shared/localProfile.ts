import { translate } from "./i18n";
import { graphemeLength, takeGraphemes } from "./graphemes";

export const DEFAULT_LOCAL_PROFILE_NAME = "Пользователь";
export const LOCAL_PROFILE_NAME_MAX_LENGTH = 48;

export function normalizeLocalProfileName(value: string) {
  return takeGraphemes(value.trim().replace(/\s+/gu, " "), LOCAL_PROFILE_NAME_MAX_LENGTH);
}

export function validateLocalProfileName(value: string) {
  const normalized = normalizeLocalProfileName(value);
  if (!normalized) {
    return translate("ui.d22800573a2a");
  }
  if (graphemeLength(value.trim().replace(/\s+/gu, " ")) > LOCAL_PROFILE_NAME_MAX_LENGTH) {
    return translate("ui.f79030ac0813", { p0: LOCAL_PROFILE_NAME_MAX_LENGTH });
  }
  return "";
}

export function getLocalProfileInitial(value: string) {
  const symbols = Array.from(normalizeLocalProfileName(value));
  if (symbols.length === 0) {
    return "Л";
  }

  let initial = symbols[0];
  for (let index = 1; index < symbols.length; index += 1) {
    const symbol = symbols[index];
    const previous = symbols[index - 1];
    if (/^[\p{Mark}\uFE0E\uFE0F]$/u.test(symbol) || symbol === "\u200D" || previous === "\u200D") {
      initial += symbol;
      continue;
    }
    break;
  }
  return initial.toLocaleUpperCase("ru-RU");
}
