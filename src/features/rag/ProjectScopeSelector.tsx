import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectCard } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { InfoHint } from "../../shared/InfoHint";
import { useFloatingPopoverPosition } from "../../shared/useFloatingPopoverPosition";
import { formatRussianCount } from "../../shared/russianPlural";

interface Props {
  projects: ProjectCard[];
  selectedIds: string[] | null;
  includeStandalone?: boolean;
  busy: boolean;
  onChange: (ids: string[] | null, includeStandalone: boolean) => Promise<void>;
}

export function ProjectScopeSelector({ projects, selectedIds, includeStandalone = false, busy, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const style = useFloatingPopoverPosition({ anchorRef, popoverRef, isOpen: open, preferredWidth: 300, maxHeight: 360 });
  const activeProjects = projects.filter((project) => !project.archivedAt);
  const shown = activeProjects.filter((project) => project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const standaloneChecked = selectedIds === null || includeStandalone;
  const label = !selectedIds ? "Все заметки" : selectedIds.length === 0 ? includeStandalone ? "Вне проектов" : "Выберите область поиска" : includeStandalone ? `${formatRussianCount(selectedIds.length, ["проект", "проекта", "проектов"])} + вне проектов` : selectedIds.length === 1
    ? activeProjects.find((project) => project.id === selectedIds[0])?.title ?? "Недоступный проект"
    : formatRussianCount(selectedIds.length, ["проект", "проекта", "проектов"]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLElement>("input, button")?.focus());
    function outside(event: Event) {
      if (event.target instanceof Node && !popoverRef.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); anchorRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function change(ids: string[] | null, standalone: boolean) {
    setError("");
    try { await onChange(ids, standalone); } catch { setError("Не удалось применить фильтр проектов."); }
  }

  return <>
    <button aria-expanded={open} aria-haspopup="dialog" aria-label={`Область поиска: ${label}`} className="secondary-btn compact rag-project-trigger" data-tooltip="Выбрать область поиска для этого чата" onClick={() => { setOpen((value) => !value); setQuery(""); }} ref={anchorRef} type="button">
      <Icon name="folder" /><span>{label}</span><Icon name="caret" />
    </button>
    {open ? createPortal(<div aria-label="Проекты для ИИ-поиска" className="nf-popover rag-project-popover" ref={popoverRef} role="dialog" style={{ ...style, visibility: style ? "visible" : "hidden" }}>
      <div className="field-help">Область поиска <InfoHint text="Ограничивает источники этого чата. Все заметки включают активные проекты и заметки вне проектов." /></div>
      {activeProjects.length > 7 ? <input aria-label="Поиск проекта" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Найти проект…" type="search" value={query} /> : null}
      <button aria-pressed={!selectedIds} className="ghost-btn" disabled={busy} onClick={() => void change(null, true)} type="button"><Icon name={!selectedIds ? "check" : "folder"} /> Все заметки</button>
      <div className="rag-project-options">
        <label><input checked={standaloneChecked} disabled={busy} onChange={() => void change(selectedIds ?? activeProjects.map((item) => item.id), !standaloneChecked)} type="checkbox" /><span>Заметки вне проектов</span></label>
        {shown.map((project) => <label key={project.id}><input checked={selectedIds === null || selectedIds.includes(project.id)} disabled={busy} onChange={() => {
          const selected = selectedIds ?? activeProjects.map((item) => item.id);
          const next = selected.includes(project.id) ? selected.filter((id) => id !== project.id) : [...selected, project.id];
          void change(next, standaloneChecked);
        }} type="checkbox" /><span>{project.title}</span></label>)}
        {!shown.length ? <span className="rag-project-empty">{query ? "Проекты не найдены" : "Активных проектов пока нет"}</span> : null}
      </div>
      {selectedIds?.length === 0 && !includeStandalone ? <p className="rag-project-empty" role="status">Выберите хотя бы один проект или заметки вне проектов.</p> : null}
      {selectedIds?.some((id) => !activeProjects.some((project) => project.id === id)) ? <p className="rag-project-empty">Часть выбранных проектов недоступна. Их заметки не участвуют в поиске.</p> : null}
      {busy ? <span role="status">Сохраняем фильтр…</span> : null}
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </div>, document.body) : null}
  </>;
}
