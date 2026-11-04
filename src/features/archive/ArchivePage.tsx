import { localizeUiMessage } from "../../shared/uiMessages";
import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AppSection, ArchiveItem } from "../../app/types";
import type { Note } from "../../app/types";
import { getNote, listArchivedProjectNotes, type ArchivedProjectNote } from "../../services/dataService";
import { Icon } from "../../shared/Icon";
import { ChatMarkdown } from "../note-chat/ChatMarkdown";
import { MenuPopover } from "../../shared/MenuPopover";
import { ModalShell } from "../../shared/ModalShell";
import { PageShell, type PageShellSidebarProps } from "../navigation/PageShell";
import { getTagDisplayColor } from "../tags/tagPalette";
import type { TagColor } from "../../app/types";
import { formatRussianCount, NOTE_COUNT_FORMS } from "../../shared/russianPlural";
import { formatDisplayDate } from "../../shared/displayDate";
import { ProjectDeleteDialog } from "../projects/ProjectDeleteDialog";

interface ArchivePageProps {
  archiveItems: ArchiveItem[];
  onDeleteItem: (item: ArchiveItem) => Promise<void>;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onRestoreItem: (item: ArchiveItem) => Promise<void>;
  onToast: (message: string) => void;
  sidebar: PageShellSidebarProps;
}

export function ArchivePage({ archiveItems, onDeleteItem, onNavigate, onNewNote, onRestoreItem, onToast, sidebar }: ArchivePageProps) {
  useInterfaceLanguage();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "projects" | "notes">("all");
  const [openProject, setOpenProject] = useState<ArchiveItem | null>(null);
  const [projectNotes, setProjectNotes] = useState<ArchivedProjectNote[]>([]);
  const [previewNote, setPreviewNote] = useState<Note | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ArchiveItem | null>(null);
  const [openItemMenuId, setOpenItemMenuId] = useState("");
  const itemMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const viewRequestRef = useRef(0);
  const closeItemMenu = useCallback(() => setOpenItemMenuId(""), []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return archiveItems.filter((item) => (filter === "all" || (filter === "projects" ? item.kind === "Проект" : item.kind === "Заметка"))
      && (!normalizedQuery || [item.title, item.kind, item.archivedAt].join(" ").toLowerCase().includes(normalizedQuery)));
  }, [archiveItems, filter, query]);
  const emptyTitle = query ? translate("ui.480fae1c4bc9") : filter === "projects" ? translate("ui.d04a67f86bad") : filter === "notes" ? translate("ui.2d1bdb49eb93") : translate("ui.4129619c52e8");
  const emptyDescription = query ? translate("ui.02caa7ff5aa7") : filter === "projects" ? translate("ui.04cdffd5d24a") : filter === "notes" ? translate("ui.dd70255ddf8f") : translate("ui.1d37b11e582b");

  async function showProject(item: ArchiveItem) {
    const requestId = ++viewRequestRef.current;
    setOpenProject(item);
    setPreviewNote(null);
    setLoadingProject(true);
    setActionError("");
    try {
      const loaded = await listArchivedProjectNotes(item.id);
      if (requestId === viewRequestRef.current) setProjectNotes(loaded);
    } catch {
      if (requestId === viewRequestRef.current) setActionError(translate("ui.b34b531bc3f3"));
    } finally {
      if (requestId === viewRequestRef.current) setLoadingProject(false);
    }
  }

  async function showNote(noteId: string) {
    const requestId = ++viewRequestRef.current;
    setActionError("");
    try {
      const loaded = await getNote(noteId);
      if (requestId === viewRequestRef.current) setPreviewNote(loaded);
    } catch {
      if (requestId === viewRequestRef.current) setActionError(translate("ui.67782d762a73"));
    }
  }

  async function restoreItem(item: ArchiveItem) {
    setActionBusy(true);
    setActionError("");
    try {
      await onRestoreItem(item);
      if (openProject?.id === item.id) { setOpenProject(null); setPreviewNote(null); }
    } catch {
      setActionError(translate("ui.5d60aa5095e7"));
    } finally {
      setActionBusy(false);
    }
  }

  async function deletePermanently() {
    if (!pendingDelete) {
      return;
    }
    setActionBusy(true);
    setActionError("");
    try {
      await onDeleteItem(pendingDelete);
      if (openProject?.id === pendingDelete.id) { setOpenProject(null); setPreviewNote(null); }
      setPendingDelete(null);
    } catch {
      setActionError(translate("ui.7264e525df9f"));
    } finally {
      setActionBusy(false);
    }
  }

  const deleteDescription = pendingDelete?.kind === "Проект"
    ? (pendingDelete.noteCount ?? 0) > 0
      ? translate("ui.278c9110fb7d", { p0: formatRussianCount(pendingDelete.noteCount ?? 0, NOTE_COUNT_FORMS) })
      : translate("ui.fd96b5c1050d")
    : translate("ui.2c9af9829beb");

  return (
    <PageShell activeSection="archive" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast} sidebar={sidebar}>
      <div className="archive-page-content">
        <div className="page-title">{translate("ui.3c54b5e783ef")}</div>
        <div className="page-subtitle">{translate("ui.f7543843b53e")}</div>
        <label className="search archive-search">
          <Icon name="search" />
          <input onChange={(event) => setQuery(event.currentTarget.value)} placeholder={translate("ui.5a1f39aa4d55")} type="search" value={query} />
        </label>
        <div aria-label={translate("ui.d2424853632d")} className="archive-filters" role="group">
          {([ ["all", translate("ui.215816bf4210")], ["projects", translate("ui.5029f02d0a94")], ["notes", translate("ui.04a18b51cdc2")] ] as const).map(([value, label]) => (
            <button aria-pressed={filter === value} className={filter === value ? "active" : ""} key={value} onClick={() => { viewRequestRef.current += 1; setFilter(value); setOpenProject(null); setPreviewNote(null); }} type="button">{label}</button>
          ))}
        </div>
        {actionError && !pendingDelete ? <div className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), actionError)}</div> : null}
        {openProject || previewNote ? (
          <div className="archive-project-view">
            <button className="secondary-btn compact" onClick={() => { viewRequestRef.current += 1; if (previewNote) setPreviewNote(null); else setOpenProject(null); }} type="button"><Icon name="back" /> {" " + translate("ui.1a9fb1f3cf8e")}</button>
            <div className="archive-project-heading"><b>{previewNote?.title ?? openProject?.title}</b><span>{translate("ui.eb18a38275f3")}</span></div>
            {previewNote ? <div className="archive-note-preview"><ChatMarkdown content={previewNote.contentMarkdown || previewNote.plainText} /></div> : (
              <div className="archive-project-notes">
                {loadingProject ? <span role="status">{translate("ui.220afb988b40")}</span> : projectNotes.map((note) => (
                  <button key={note.id} onClick={() => void showNote(note.id)} style={archiveAccent(note.tagColor, note.tagCustomColor)} type="button"><Icon name="doc" /><span>{note.title}</span><Icon name="forward" /></button>
                ))}
                {!loadingProject && projectNotes.length === 0 ? <span>{translate("ui.cd08b118b6be")}</span> : null}
              </div>
            )}
          </div>
        ) : (
        <div className="archive-list">
        {filteredItems.map((item) => (
          <div className="archive-row" key={item.id} style={archiveAccent(item.tagColor, item.tagCustomColor)}>
            <button className="archive-row-main archive-row-open" onClick={() => item.kind === "Проект" ? void showProject(item) : void showNote(item.id)} type="button">
              <span className="archive-row-icon"><Icon name={item.kind === "Проект" ? "folder" : "doc"} /></span>
              <div>
                <b>{item.title}</b>
                <div className="archive-date">{item.kind === "Проект" ? translate("ui.f45edf006851") : translate("ui.025e14681a4c")} {" " + translate("ui.4681c061351d") + " "}{formatDisplayDate(item.archivedAt)}{item.kind === "Проект" ? ` · ${formatRussianCount(item.noteCount ?? 0, NOTE_COUNT_FORMS)}` : ""}</div>
              </div>
            </button>
            <div className="archive-row-actions">
              <button
                aria-expanded={openItemMenuId === item.id}
                aria-haspopup="menu"
                aria-label={translate("ui.58d81050aa29", { p0: item.title })}
                className="row-menu-trigger"
                onClick={(event) => {
                  itemMenuAnchorRef.current = event.currentTarget;
                  setOpenItemMenuId((current) => current === item.id ? "" : item.id);
                }}
                type="button"
              >
                <Icon name="dots" />
              </button>
              <MenuPopover
                anchorRef={itemMenuAnchorRef}
                ariaLabel={translate("ui.58d81050aa29", { p0: item.title })}
                className="row-actions-menu"
                isOpen={openItemMenuId === item.id}
                onClose={closeItemMenu}
                preferredWidth={210}
              >
                <button disabled={actionBusy} onClick={() => { closeItemMenu(); void restoreItem(item); }} role="menuitem" type="button">{translate("ui.76f55a988f8a")}</button>
                <button className="danger" onClick={() => { setOpenItemMenuId(""); setPendingDelete(item); }} role="menuitem" type="button">{translate("ui.be99b1361201")}</button>
              </MenuPopover>
            </div>
          </div>
        ))}
        {filteredItems.length === 0 ? (
          <div className="page-empty-state panel-empty-state">
            <span className="page-empty-icon"><Icon name="archive" /></span>
            <div><b>{emptyTitle}</b><span>{emptyDescription}</span></div>
          </div>
        ) : null}
        </div>
        )}
      </div>

      {pendingDelete?.kind === "Проект" ? <ProjectDeleteDialog title={pendingDelete.title} notes={pendingDelete.noteCount ?? 0} onClose={() => { setPendingDelete(null); setActionError(""); }} onDelete={() => onDeleteItem(pendingDelete).then(() => { if (openProject?.id === pendingDelete.id) { setOpenProject(null); setPreviewNote(null); } })} /> : pendingDelete ? (
        <ModalShell
          backdropClassName="confirm-backdrop"
          className="confirm-dialog"
          description={deleteDescription}
          dismissOnBackdrop={false}
          closeDisabled={actionBusy}
          footer={(
            <div className="new-note-actions">
              <button className="secondary-btn" disabled={actionBusy} onClick={() => setPendingDelete(null)} type="button">
                {translate("ui.8fbe9b75cbdf")}</button>
              <button className="danger-btn" disabled={actionBusy} onClick={() => void deletePermanently()} type="button">
                {translate("ui.be99b1361201")}</button>
            </div>
          )}
          onClose={() => { setPendingDelete(null); setActionError(""); }}
          open
          size="compact"
          title={translate("ui.55390b546ba2", { p0: pendingDelete.title })}
          titleId="delete-archive-title"
        >
          {actionError ? <div className="field-error" role="alert">{localizeUiMessage(getInterfaceLanguage(), actionError)}</div> : null}
        </ModalShell>
      ) : null}
    </PageShell>
  );
}

function archiveAccent(color?: string | null, customColor?: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  const tagColor: TagColor = color === "green" || color === "purple" || color === "amber" || color === "pink" ? color : "blue";
  return { "--note-accent": getTagDisplayColor({ color: tagColor, customColor: customColor ?? undefined }) } as CSSProperties;
}
