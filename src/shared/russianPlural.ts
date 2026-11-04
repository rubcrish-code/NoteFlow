import { getInterfaceLanguage, getInterfaceLocale } from "./i18n";
import { COUNT_NOUNS } from "./i18n/countNouns";

export type RussianPluralForms = readonly [one: string, few: string, many: string];

export const FILE_COUNT_FORMS = ["файл", "файла", "файлов"] as const;
export const FRAGMENT_COUNT_FORMS = ["фрагмент", "фрагмента", "фрагментов"] as const;
export const NOTE_COUNT_FORMS = ["заметка", "заметки", "заметок"] as const;
export const WORD_COUNT_FORMS = COUNT_NOUNS.word.ru;

export function selectRussianPlural(count: number, forms: RussianPluralForms) {
  if (getInterfaceLanguage() === "en") {
    const english = Object.values(COUNT_NOUNS).find(noun => noun.ru[0] === forms[0] || noun.en[0] === forms[0])?.en;
    return english ? english[new Intl.PluralRules("en").select(count) === "one" ? 0 : 1] : forms[Math.abs(count) === 1 ? 0 : 2];
  }
  const absoluteCount = Math.abs(Math.trunc(count));
  const mod100 = absoluteCount % 100;
  if (mod100 >= 11 && mod100 <= 14) {
    return forms[2];
  }

  const mod10 = absoluteCount % 10;
  if (mod10 === 1) {
    return forms[0];
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return forms[1];
  }
  return forms[2];
}
export function formatRussianCount(count: number, forms: RussianPluralForms) {
  return `${new Intl.NumberFormat(getInterfaceLocale()).format(count)} ${selectRussianPlural(count, forms)}`;
}
