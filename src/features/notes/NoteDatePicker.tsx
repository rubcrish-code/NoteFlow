import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../shared/Icon";
import { useFloatingPopoverPosition } from "../../shared/useFloatingPopoverPosition";

const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface DateParts {
  day: number;
  monthIndex: number;
  year: number;
}

export interface CalendarDay extends DateParts {
  inCurrentMonth: boolean;
  iso: string;
}

interface NoteDatePickerProps {
  isOpen: boolean;
  onChange: (value: string) => void;
  onOpenChange: (isOpen: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  value: string;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function todayIsoDate() {
  const today = new Date();
  return toIsoDate({ day: today.getDate(), monthIndex: today.getMonth(), year: today.getFullYear() });
}

export function toIsoDate(parts: DateParts) {
  return `${parts.year}-${padDatePart(parts.monthIndex + 1)}-${padDatePart(parts.day)}`;
}

export function parseIsoDate(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return parseIsoDate(todayIsoDate());
  return { day: Number(match[3]), monthIndex: Number(match[2]) - 1, year: Number(match[1]) };
}

export function formatDisplayDate(value: string) {
  const date = parseIsoDate(value);
  return `${padDatePart(date.day)}.${padDatePart(date.monthIndex + 1)}.${date.year}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function buildCalendarDays(year: number, monthIndex: number): CalendarDay[] {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const leadingDays = (firstDay + 6) % 7;
  const previousMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const previousMonthYear = monthIndex === 0 ? year - 1 : year;
  const previousMonthDays = daysInMonth(previousMonthYear, previousMonthIndex);
  const currentMonthDays = daysInMonth(year, monthIndex);
  const days: CalendarDay[] = [];

  for (let index = leadingDays - 1; index >= 0; index -= 1) {
    const day = previousMonthDays - index;
    days.push({ day, monthIndex: previousMonthIndex, year: previousMonthYear, inCurrentMonth: false, iso: toIsoDate({ day, monthIndex: previousMonthIndex, year: previousMonthYear }) });
  }
  for (let day = 1; day <= currentMonthDays; day += 1) {
    days.push({ day, monthIndex, year, inCurrentMonth: true, iso: toIsoDate({ day, monthIndex, year }) });
  }
  const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextMonthYear = monthIndex === 11 ? year + 1 : year;
  for (let day = 1; days.length < 42; day += 1) {
    days.push({ day, monthIndex: nextMonthIndex, year: nextMonthYear, inCurrentMonth: false, iso: toIsoDate({ day, monthIndex: nextMonthIndex, year: nextMonthYear }) });
  }
  return days;
}

export function moveIsoDate(value: string, dayDelta: number) {
  const parts = parseIsoDate(value);
  const date = new Date(parts.year, parts.monthIndex, parts.day + dayDelta);
  return toIsoDate({ day: date.getDate(), monthIndex: date.getMonth(), year: date.getFullYear() });
}

export function moveIsoMonth(value: string, monthDelta: number) {
  const parts = parseIsoDate(value);
  const targetMonth = new Date(parts.year, parts.monthIndex + monthDelta, 1);
  return toIsoDate({
    day: Math.min(parts.day, daysInMonth(targetMonth.getFullYear(), targetMonth.getMonth())),
    monthIndex: targetMonth.getMonth(),
    year: targetMonth.getFullYear(),
  });
}

export function getCalendarKeyboardTarget(value: string, key: string) {
  if (key === "ArrowLeft") return moveIsoDate(value, -1);
  if (key === "ArrowRight") return moveIsoDate(value, 1);
  if (key === "ArrowUp") return moveIsoDate(value, -7);
  if (key === "ArrowDown") return moveIsoDate(value, 7);
  if (key === "PageUp") return moveIsoMonth(value, -1);
  if (key === "PageDown") return moveIsoMonth(value, 1);
  return null;
}

export function NoteDatePicker({ isOpen, onChange, onOpenChange, triggerRef, value }: NoteDatePickerProps) {
  const selectedDate = parseIsoDate(value);
  const [focusedDate, setFocusedDate] = useState(value);
  const [visibleYear, setVisibleYear] = useState(selectedDate.year);
  const [visibleMonthIndex, setVisibleMonthIndex] = useState(selectedDate.monthIndex);
  const internalAnchorRef = useRef<HTMLButtonElement>(null);
  const anchorRef = triggerRef ?? internalAnchorRef;
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = todayIsoDate();
  const popoverStyle = useFloatingPopoverPosition({ anchorRef, gap: 8, isOpen, maxHeight: 430, padding: 12, popoverRef, preferredWidth: 320 });
  const calendarDays = useMemo(() => buildCalendarDays(visibleYear, visibleMonthIndex), [visibleMonthIndex, visibleYear]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const nextDate = parseIsoDate(value);
    setFocusedDate(value);
    setVisibleYear(nextDate.year);
    setVisibleMonthIndex(nextDate.monthIndex);
    const frame = window.requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLButtonElement>(`[data-date="${value}"]`)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !anchorRef.current?.contains(target) && !popoverRef.current?.contains(target)) onOpenChange(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, onOpenChange]);

  function focusDate(isoDate: string) {
    const date = parseIsoDate(isoDate);
    setFocusedDate(isoDate);
    setVisibleYear(date.year);
    setVisibleMonthIndex(date.monthIndex);
    window.requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLButtonElement>(`[data-date="${isoDate}"]`)?.focus());
  }

  function chooseDate(isoDate: string) {
    onChange(isoDate);
    onOpenChange(false);
    window.requestAnimationFrame(() => anchorRef.current?.focus());
  }

  function handleCalendarKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      anchorRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      event.stopPropagation();
      onOpenChange(false);
      anchorRef.current?.focus();
      return;
    }
    const target = getCalendarKeyboardTarget(focusedDate, event.key);
    if (target) {
      event.preventDefault();
      event.stopPropagation();
      focusDate(target);
    }
  }

  const calendar = isOpen ? createPortal(
    <div
      aria-label="Выбор даты заметки"
      className="date-picker-popover nf-popover"
      onKeyDown={handleCalendarKeyDown}
      ref={popoverRef}
      role="dialog"
      style={{ ...popoverStyle, visibility: popoverStyle ? "visible" : "hidden" }}
    >
      <div className="date-picker-nav">
        <button aria-label="Предыдущий месяц" data-tooltip="Предыдущий месяц" onClick={() => focusDate(moveIsoMonth(focusedDate, -1))} type="button"><Icon name="back" /></button>
        <div aria-live="polite" className="date-picker-title">{monthNames[visibleMonthIndex]} {visibleYear}</div>
        <button aria-label="Следующий месяц" className="next-month" data-tooltip="Следующий месяц" onClick={() => focusDate(moveIsoMonth(focusedDate, 1))} type="button"><Icon name="back" /></button>
      </div>
      <div aria-hidden="true" className="date-picker-weekdays">{dayNames.map((dayName) => <span key={dayName}>{dayName}</span>)}</div>
      <div aria-label={`${monthNames[visibleMonthIndex]} ${visibleYear}`} className="date-picker-grid" role="grid">
        {calendarDays.map((day) => (
          <button
            aria-current={day.iso === today ? "date" : undefined}
            aria-label={new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(day.year, day.monthIndex, day.day))}
            aria-selected={day.iso === value}
            className={`${day.inCurrentMonth ? "" : "muted"} ${day.iso === value ? "selected" : ""} ${day.iso === today ? "today" : ""}`}
            data-date={day.iso}
            key={day.iso}
            onClick={() => chooseDate(day.iso)}
            onFocus={() => setFocusedDate(day.iso)}
            role="gridcell"
            tabIndex={day.iso === focusedDate ? 0 : -1}
            type="button"
          >{day.day}</button>
        ))}
      </div>
      <div className="date-picker-footer">
        <button onClick={() => chooseDate(today)} type="button">Сегодня</button>
        <span>{formatDisplayDate(value)}</span>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="date-picker-field">
      <button aria-expanded={isOpen} aria-haspopup="dialog" className="date-picker-trigger" onClick={() => onOpenChange(!isOpen)} ref={anchorRef} type="button">
        <Icon name="date" />
        <span>{formatDisplayDate(value)}</span>
      </button>
      {calendar}
    </div>
  );
}
