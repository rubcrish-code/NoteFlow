import { localizeUiMessage } from "../../shared/uiMessages";
import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
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
  useInterfaceLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const style = useFloatingPopoverPosition({ anchorRef, popoverRef, isOpen: open, preferredWidth: 300, maxHeight: 360 });
  const activeProjects = projects.filter((project) => !project.archivedAt);
  const shown = activeProjects.filter((project) => project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const standaloneChecked = selectedIds === null || includeStandalone;
  const label = !selectedIds ? translate("ui.4bcfa3fb168f") : selectedIds.length === 0 ? includeStandalone ? translate("ui.9fa19f377db8") : translate("ui.9b59e7ab7d49") : includeStandalone ? translate("ui.99ee61abdb31", { p0: formatRussianCount(selectedIds.length, ["проект", "проекта", "проектов"]) }) : selectedIds.length === 1
    ? activeProjects.find((project) => project.id === selectedIds[0])?.title ?? translate("ui.bd483181a6cf")
    : formatRussianCount(selectedIds.length, [translate("ui.dfb992e6d06a"), translate("ui.4933a8f07c63"), translate("ui.469cca22e1ba")]);

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
    try { await onChange(ids, standalone); } catch { setError(translate("ui.ad4e51b68234")); }
  }

  return <>
    <button aria-expanded={open} aria-haspopup="dialog" aria-label={translate("ui.ea046562d406", { p0: label })} className="secondary-btn compact rag-project-trigger" data-tooltip={translate("ui.9715bfcbb66e")} onClick={() => { setOpen((value) => !value); setQuery(""); }} ref={anchorRef} type="button">
      <Icon name="folder" /><span>{label}</span><Icon name="caret" />
    </button>
    {open ? createPortal(<div aria-label={translate("ui.7e3bd757ea57")} className="nf-popover rag-project-popover" ref={popoverRef} role="dialog" style={{ ...style, visibility: style ? "visible" : "hidden" }}>
      <div className="field-help">{translate("ui.87038a34d05b") + " "}<InfoHint text={translate("ui.1bd828e11112")} /></div>
      {activeProjects.length > 7 ? <input aria-label={translate("ui.f89c51bde67e")} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={translate("ui.679ba83a4cf8")} type="search" value={query} /> : null}
      <button aria-pressed={!selectedIds} className="ghost-btn" disabled={busy} onClick={() => void change(null, true)} type="button"><Icon name={!selectedIds ? "check" : "folder"} /> {" " + translate("ui.4bcfa3fb168f")}</button>
      <div className="rag-project-options">
        <label><input checked={standaloneChecked} disabled={busy} onChange={() => void change(selectedIds ?? activeProjects.map((item) => item.id), !standaloneChecked)} type="checkbox" /><span>{translate("ui.de07697568c5")}</span></label>
        {shown.map((project) => <label key={project.id}><input checked={selectedIds === null || selectedIds.includes(project.id)} disabled={busy} onChange={() => {
          const selected = selectedIds ?? activeProjects.map((item) => item.id);
          const next = selected.includes(project.id) ? selected.filter((id) => id !== project.id) : [...selected, project.id];
          void change(next, standaloneChecked);
        }} type="checkbox" /><span>{project.title}</span></label>)}
        {!shown.length ? <span className="rag-project-empty">{query ? translate("ui.c81b603514ba") : translate("ui.386135ed46d5")}</span> : null}
      </div>
      {selectedIds?.length === 0 && !includeStandalone ? <p className="rag-project-empty" role="status">{translate("ui.4f8579f7ae46")}</p> : null}
      {selectedIds?.some((id) => !activeProjects.some((project) => project.id === id)) ? <p className="rag-project-empty">{translate("ui.ebbf91fca196")}</p> : null}
      {busy ? <span role="status">{translate("ui.4809cf579500")}</span> : null}
      {error ? <span className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), error)}</span> : null}
    </div>, document.body) : null}
  </>;
}
