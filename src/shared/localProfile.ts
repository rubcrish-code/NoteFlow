export const DEFAULT_LOCAL_PROFILE_NAME = "Локальный профиль";
export const LOCAL_PROFILE_NAME_MAX_LENGTH = 48;

export function normalizeLocalProfileName(value: string) {
  return Array.from(value.trim().replace(/\s+/gu, " "))
    .slice(0, LOCAL_PROFILE_NAME_MAX_LENGTH)
    .join("");
}

export function validateLocalProfileName(value: string) {
  const normalized = normalizeLocalProfileName(value);
  if (!normalized) {
    return "Введите имя локального профиля";
  }
  if (Array.from(value.trim().replace(/\s+/gu, " ")).length > LOCAL_PROFILE_NAME_MAX_LENGTH) {
    return `Не больше ${LOCAL_PROFILE_NAME_MAX_LENGTH} символов`;
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
