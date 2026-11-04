import assert from 'node:assert/strict';

export const classicVibrant = [
  ['Синий', '#60A5FA', '#153E85', '#253F68', '#93C5FD'],
  ['Красный', '#F87171', '#5C1111', '#5F282C', '#FCA5A5'],
  ['Оранжевый', '#FDBA74', '#71330B', '#5E3B23', '#FED7AA'],
  ['Жёлтый', '#FDE68A', '#71500A', '#51441D', '#FDE68A'],
  ['Лаймовый', '#D9F99D', '#405E10', '#3A4C21', '#D9F99D'],
  ['Зелёный', '#86EFAC', '#166534', '#214E35', '#86EFAC'],
  ['Бирюзовый', '#5EEAD4', '#115E59', '#1B4D48', '#5EEAD4'],
  ['Фиолетовый', '#A78BFA', '#4C1D95', '#453266', '#C4B5FD'],
  ['Фуксия', '#E879F9', '#701A75', '#542D5C', '#F0ABFC'],
  ['Розовый', '#F472B6', '#831843', '#592A43', '#F9A8D4'],
];

export function colorHex(color) {
  if (/^#[\da-f]{6}$/i.test(color)) return color.toUpperCase();
  const rgb = color.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:[, /]+\s*1)?\s*\)$/);
  assert.ok(rgb, `Expected opaque RGB: ${color}`);
  return '#' + rgb.slice(1, 4).map(value => Number(value).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function assertClassicContrast(background, foreground, theme, ratio) {
  if (ratio >= 4.5) return { ratio, wcagAa: true };
  // User explicitly retained these exact four pairs after receiving their AA results.
  // This is an acknowledged accessibility exception, not an AA PASS or a lower threshold.
  const pair = classicVibrant.find(row => row[1] === colorHex(background) && row[2] === colorHex(foreground));
  assert.equal(theme, 'light', `Unexpected dark contrast failure: ${ratio}`);
  assert.ok(pair && ['Синий', 'Фиолетовый', 'Фуксия', 'Розовый'].includes(pair[0]), `Unapproved contrast failure: ${background}/${foreground} ${ratio}`);
  assert.ok(ratio >= 3.64 && ratio < 4.5);
  return { ratio, wcagAa: false, exception: 'Exact light pair explicitly retained by user' };
}
