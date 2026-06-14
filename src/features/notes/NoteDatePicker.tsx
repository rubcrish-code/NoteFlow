import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../shared/Icon";

const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface DateParts {
  day: number;
  monthIndex: number;
  year: number;
}

interface CalendarDay extends DateParts {
  inCurrentMonth: boolean;
  iso: string;
}

interface NoteDatePickerProps {
  isOpen: boolean;
  onChange: (value: string) => void;
  onOpenChange: (isOpen: boolean) => void;
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

function parseIsoDate(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return parseIsoDate(todayIsoDate());
  }

  return {
    day: Number(match[3]),
    monthIndex: Number(match[2]) - 1,
    year: Number(match[1]),
  };
}

export function formatDisplayDate(value: string) {
  const date = parseIsoDate(value);
  return `${padDatePart(date.day)}.${padDatePart(date.monthIndex + 1)}.${date.year}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildCalendarDays(year: number, monthIndex: number): CalendarDay[] {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const leadingDays = (firstDay + 6) % 7;
  const previousMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const previousMonthYear = monthIndex === 0 ? year - 1 : year;
  const previousMonthDays = daysInMonth(previousMonthYear, previousMonthIndex);
  const currentMonthDays = daysInMonth(year, monthIndex);
  const days: CalendarDay[] = [];

  for (let index = leadingDays - 1; index >= 0; index -= 1) {
    const day = previousMonthDays - index;
    days.push({
      day,
      monthIndex: previousMonthIndex,
      year: previousMonthYear,
      inCurrentMonth: false,
      iso: toIsoDate({ day, monthIndex: previousMonthIndex, year: previousMonthYear }),
    });
  }

  for (let day = 1; day <= currentMonthDays; day += 1) {
    days.push({
      day,
      monthIndex,
      year,
      inCurrentMonth: true,
      iso: toIsoDate({ day, monthIndex, year }),
    });
  }

  const trailingDays = 42 - days.length;
  const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextMonthYear = monthIndex === 11 ? year + 1 : year;

  for (let day = 1; day <= trailingDays; day += 1) {
    days.push({
      day,
      monthIndex: nextMonthIndex,
      year: nextMonthYear,
      inCurrentMonth: false,
      iso: toIsoDate({ day, monthIndex: nextMonthIndex, year: nextMonthYear }),
    });
  }

  return days;
}

export function NoteDatePicker({ isOpen, onChange, onOpenChange, value }: NoteDatePickerProps) {
  const selectedDate = parseIsoDate(value);
  const [visibleYear, setVisibleYear] = useState(selectedDate.year);
  const [visibleMonthIndex, setVisibleMonthIndex] = useState(selectedDate.monthIndex);
  const pickerRef = useRef<HTMLDivElement>(null);
  const today = todayIsoDate();

  useEffect(() => {
    if (isOpen) {
      const nextDate = parseIsoDate(value);
      setVisibleYear(nextDate.year);
      setVisibleMonthIndex(nextDate.monthIndex);
    }
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && pickerRef.current && !pickerRef.current.contains(target)) {
        onOpenChange(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, onOpenChange]);

  const calendarDays = useMemo(() => buildCalendarDays(visibleYear, visibleMonthIndex), [visibleMonthIndex, visibleYear]);

  function moveMonth(delta: number) {
    const nextDate = new Date(visibleYear, visibleMonthIndex + delta, 1);
    setVisibleYear(nextDate.getFullYear());
    setVisibleMonthIndex(nextDate.getMonth());
  }

  function chooseDate(isoDate: string) {
    onChange(isoDate);
    onOpenChange(false);
  }

  return (
    <div className="date-picker-field" ref={pickerRef}>
      <button aria-expanded={isOpen} className="date-picker-trigger" onClick={() => onOpenChange(!isOpen)} type="button">
        <Icon name="date" />
        <span>{formatDisplayDate(value)}</span>
      </button>

      {isOpen ? (
        <div className="date-picker-popover" role="dialog" aria-label="Выбор даты заметки">
          <div className="date-picker-nav">
            <button data-tooltip="Предыдущий год" onClick={() => setVisibleYear((year) => year - 1)} type="button">
              ‹‹
            </button>
            <button data-tooltip="Предыдущий месяц" onClick={() => moveMonth(-1)} type="button">
              <Icon name="back" />
            </button>
            <div className="date-picker-title">
              {monthNames[visibleMonthIndex]} {visibleYear}
            </div>
            <button className="next-month" data-tooltip="Следующий месяц" onClick={() => moveMonth(1)} type="button">
              <Icon name="back" />
            </button>
            <button data-tooltip="Следующий год" onClick={() => setVisibleYear((year) => year + 1)} type="button">
              ››
            </button>
          </div>

          <div className="date-picker-weekdays">
            {dayNames.map((dayName) => (
              <span key={dayName}>{dayName}</span>
            ))}
          </div>

          <div className="date-picker-grid">
            {calendarDays.map((day) => (
              <button
                className={`${day.inCurrentMonth ? "" : "muted"} ${day.iso === value ? "selected" : ""} ${day.iso === today ? "today" : ""}`}
                key={day.iso}
                onClick={() => chooseDate(day.iso)}
                type="button"
              >
                {day.day}
              </button>
            ))}
          </div>

          <div className="date-picker-footer">
            <button onClick={() => chooseDate(today)} type="button">
              Сегодня
            </button>
            <span>{formatDisplayDate(value)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
