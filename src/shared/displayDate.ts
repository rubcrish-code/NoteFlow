const displayDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const displayTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

function parseDisplayDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value;
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (calendarDate) {
    const year = Number(calendarDate[1]);
    const month = Number(calendarDate[2]);
    const day = Number(calendarDate[3]);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function formatDisplayDate(value: string | Date): string {
  const date = parseDisplayDate(value);
  if (!date) return "";
  const parts = Object.fromEntries(displayDateFormatter.formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.day}.${parts.month}.${parts.year}`;
}

export function formatDisplayTime(value: string | Date): string {
  const date = parseDisplayDate(value);
  return date ? displayTimeFormatter.format(date) : "";
}

export function formatDisplayDateTime(value: string | Date): string {
  const date = formatDisplayDate(value);
  const time = formatDisplayTime(value);
  return date && time ? `${date}, ${time}` : date;
}
