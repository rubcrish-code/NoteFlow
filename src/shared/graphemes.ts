/// <reference lib="es2022.intl" />
const segmenter = new Intl.Segmenter("ru", { granularity: "grapheme" });

export function graphemeLength(value: string) {
  let count = 0;
  for (const _part of segmenter.segment(value)) count++;
  return count;
}

export function takeGraphemes(value: string, count: number) {
  let text = "";
  let seen = 0;
  for (const part of segmenter.segment(value)) { if (seen++ >= count) break; text += part.segment; }
  return text;
}
