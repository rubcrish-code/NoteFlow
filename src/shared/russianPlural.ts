export type RussianPluralForms = readonly [one: string, few: string, many: string];

export const FILE_COUNT_FORMS = ["файл", "файла", "файлов"] as const;
export const FRAGMENT_COUNT_FORMS = ["фрагмент", "фрагмента", "фрагментов"] as const;
export const NOTE_COUNT_FORMS = ["заметка", "заметки", "заметок"] as const;

export function selectRussianPlural(count: number, forms: RussianPluralForms) {
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
  return `${count} ${selectRussianPlural(count, forms)}`;
}
