import { useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Icon } from "./Icon";
import { MenuPopover } from "./MenuPopover";
import { getFocusableElements } from "./uiA11y";

export const calendarMonths = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MIN_YEAR = 100, MAX_YEAR = 9999, YEAR_PAGE_SIZE = 24;
export interface CalendarCaptionHandle { dismiss: () => boolean; isOpen: () => boolean }
interface CalendarCaptionProps {
  monthIndex: number;
  year: number;
  onChange: (year: number, monthIndex: number) => void;
  ref?: Ref<CalendarCaptionHandle>;
}

export function CalendarCaption({ monthIndex, year, onChange, ref }: CalendarCaptionProps) {
  const [open, setOpen] = useState<"month" | "year" | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const monthRef = useRef<HTMLButtonElement>(null), yearRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [yearStart, setYearStart] = useState(0);
  const [yearQuery, setYearQuery] = useState("");
  const clampPage = (start: number) => Math.max(MIN_YEAR, Math.min(MAX_YEAR - YEAR_PAGE_SIZE + 1, start));
  function close() {
    const anchor = openRef.current === "month" ? monthRef : yearRef;
    openRef.current = null; setOpen(null); anchor.current?.focus();
  }
  useImperativeHandle(ref, () => ({ isOpen: () => openRef.current !== null, dismiss: () => { if (!openRef.current) return false; close(); return true; } }));
  function toggle(kind: "month" | "year") {
    if (open === kind) { close(); return; }
    setYearStart(clampPage(Math.floor(year / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE));
    setYearQuery(""); openRef.current = kind; setOpen(kind);
  }
  function choose(value: number) { onChange(open === "year" ? value : year, open === "month" ? value : monthIndex); close(); }
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keep keyboard navigation in the topmost calendar layer, including inside modals.
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    const target = event.target as HTMLElement;
    if (event.key === "Tab") {
      event.preventDefault();
      const controls = getFocusableElements(event.currentTarget).filter((control) => control.tabIndex >= 0);
      const next = controls[controls.indexOf(target) + (event.shiftKey ? -1 : 1)];
      if (next) next.focus(); else close();
      return;
    }
    if (!target.hasAttribute("data-choice")) return;
    const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-choice]")];
    const index = choices.indexOf(target as HTMLButtonElement);
    const columns = open === "month" ? 3 : 4;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : delta === undefined ? null : (index + delta + choices.length) % choices.length;
    if (nextIndex !== null) { event.preventDefault(); choices[nextIndex]?.focus(); }
  }
  const validQuery = /^\d{3,4}$/.test(yearQuery) && Number(yearQuery) >= MIN_YEAR && Number(yearQuery) <= MAX_YEAR;
  return <>
    <div className="date-picker-month-year">
      <button className="date-picker-caption-trigger" aria-label="Месяц" aria-expanded={open === "month"} aria-haspopup="dialog" ref={monthRef} type="button" onClick={() => toggle("month")}><span className="date-picker-caption-label">{calendarMonths[monthIndex]}</span><Icon name="caret" /></button>
      <button className="date-picker-caption-trigger" aria-label="Год" aria-expanded={open === "year"} aria-haspopup="dialog" ref={yearRef} type="button" onClick={() => toggle("year")}><span className="date-picker-caption-label">{year}</span><Icon name="caret" /></button>
    </div>
    <MenuPopover anchorRef={open === "month" ? monthRef : yearRef} ariaLabel={open === "month" ? "Выбор месяца" : "Выбор года"}
      className="date-caption-popover" role="dialog" isOpen={open !== null} onClose={close} preferredWidth={300} maxHeight={390}
      initialFocusSelector={`button[data-choice="${open === "month" ? monthIndex : year >= yearStart && year < yearStart + YEAR_PAGE_SIZE ? year : yearStart}"]`}>
      <div data-date-picker="true" ref={gridRef} onKeyDown={handleKeyDown}>
        <div className="calendar-caption-title">{open === "month" ? "Месяц" : "Год"}</div>
        {open === "year" ? <>
          <div className="calendar-year-navigation">
            <button aria-label="Предыдущие годы" className="secondary-btn" disabled={yearStart === MIN_YEAR} type="button" onClick={() => setYearStart(clampPage(yearStart - YEAR_PAGE_SIZE))}><Icon name="back" /></button>
            <span>{yearStart}–{yearStart + YEAR_PAGE_SIZE - 1}</span>
            <button aria-label="Следующие годы" className="secondary-btn" disabled={yearStart + YEAR_PAGE_SIZE - 1 === MAX_YEAR} type="button" onClick={() => setYearStart(clampPage(yearStart + YEAR_PAGE_SIZE))}><Icon name="forward" /></button>
          </div>
          <form className="calendar-year-search" onSubmit={(event) => { event.preventDefault(); if (validQuery) choose(Number(yearQuery)); }}>
            <input aria-label="Перейти к году" placeholder="Перейти к году" inputMode="numeric" maxLength={4} value={yearQuery} onChange={(event) => setYearQuery(event.currentTarget.value)} />
            <button aria-label="Выбрать год" className="secondary-btn" disabled={!validQuery} type="submit"><Icon name="forward" /></button>
          </form>
        </> : null}
        <div className={`calendar-caption-grid ${open === "year" ? "years" : "months"}`}>
          {(open === "month" ? calendarMonths.map((name, value) => ({ name, value })) : Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => ({ name: String(yearStart + index), value: yearStart + index }))).map(({ name, value }) =>
            <button data-choice={value} aria-pressed={value === (open === "month" ? monthIndex : year)} key={value} type="button" onClick={() => choose(value)}>{name}</button>)}
        </div>
      </div>
    </MenuPopover>
  </>;
}
