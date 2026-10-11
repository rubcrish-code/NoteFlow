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
  const emptyTitle = query ? "Ничего не найдено" : filter === "projects" ? "Архивных проектов нет" : filter === "notes" ? "Архивных заметок нет" : "Архив пуст";
  const emptyDescription = query ? "Попробуйте изменить запрос." : filter === "projects" ? "Архивированные проекты появятся здесь." : filter === "notes" ? "Архивированные заметки появятся здесь." : "Здесь появятся архивированные заметки и проекты.";

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
      if (requestId === viewRequestRef.current) setActionError("Не удалось открыть архивный проект.");
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
      if (requestId === viewRequestRef.current) setActionError("Не удалось открыть заметку.");
    }
  }

  async function restoreItem(item: ArchiveItem) {
    setActionBusy(true);
    setActionError("");
    try {
      await onRestoreItem(item);
      if (openProject?.id === item.id) { setOpenProject(null); setPreviewNote(null); }
    } catch {
      setActionError("Не удалось восстановить элемент архива.");
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
      setActionError("Не удалось удалить элемент архива.");
    } finally {
      setActionBusy(false);
    }
  }

  const deleteDescription = pendingDelete?.kind === "Проект"
    ? (pendingDelete.noteCount ?? 0) > 0
      ? `Вместе с проектом будут удалены все заметки внутри него: ${formatRussianCount(pendingDelete.noteCount ?? 0, NOTE_COUNT_FORMS)}. Это действие нельзя отменить.`
      : "Проект не содержит заметок. Это действие нельзя отменить."
    : "После удаления заметку не получится восстановить.";

  return (
    <PageShell activeSection="archive" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast} sidebar={sidebar}>
      <div className="archive-page-content">
        <div className="page-title">Архив</div>
        <div className="page-subtitle">Архивные заметки можно восстановить в любой момент</div>
        <label className="search archive-search">
          <Icon name="search" />
          <input onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Поиск в архиве…" type="search" value={query} />
        </label>
        <div aria-label="Фильтр архива" className="archive-filters" role="group">
          {([ ["all", "Все"], ["projects", "Проекты"], ["notes", "Заметки"] ] as const).map(([value, label]) => (
            <button aria-pressed={filter === value} className={filter === value ? "active" : ""} key={value} onClick={() => { viewRequestRef.current += 1; setFilter(value); setOpenProject(null); setPreviewNote(null); }} type="button">{label}</button>
          ))}
        </div>
        {actionError && !pendingDelete ? <div className="field-error" role="alert">{actionError}</div> : null}
        {openProject || previewNote ? (
          <div className="archive-project-view">
            <button className="secondary-btn compact" onClick={() => { viewRequestRef.current += 1; if (previewNote) setPreviewNote(null); else setOpenProject(null); }} type="button"><Icon name="back" /> Назад</button>
            <div className="archive-project-heading"><b>{previewNote?.title ?? openProject?.title}</b><span>Архив · только просмотр</span></div>
            {previewNote ? <div className="archive-note-preview"><ChatMarkdown content={previewNote.contentMarkdown || previewNote.plainText} /></div> : (
              <div className="archive-project-notes">
                {loadingProject ? <span role="status">Загружаем заметки…</span> : projectNotes.map((note) => (
                  <button key={note.id} onClick={() => void showNote(note.id)} style={archiveAccent(note.tagColor, note.tagCustomColor)} type="button"><Icon name="doc" /><span>{note.title}</span><Icon name="forward" /></button>
                ))}
                {!loadingProject && projectNotes.length === 0 ? <span>В проекте нет заметок.</span> : null}
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
                <div className="archive-date">{item.kind} · Архивировано {formatDisplayDate(item.archivedAt)}{item.kind === "Проект" ? ` · ${formatRussianCount(item.noteCount ?? 0, NOTE_COUNT_FORMS)}` : ""}</div>
              </div>
            </button>
            <div className="archive-row-actions">
              <button
                aria-expanded={openItemMenuId === item.id}
                aria-haspopup="menu"
                aria-label={`Действия с «${item.title}»`}
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
                ariaLabel={`Действия с «${item.title}»`}
                className="row-actions-menu"
                isOpen={openItemMenuId === item.id}
                onClose={closeItemMenu}
                preferredWidth={210}
              >
                <button disabled={actionBusy} onClick={() => { closeItemMenu(); void restoreItem(item); }} role="menuitem" type="button">Восстановить</button>
                <button className="danger" onClick={() => { setOpenItemMenuId(""); setPendingDelete(item); }} role="menuitem" type="button">Удалить</button>
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
                Отмена
              </button>
              <button className="danger-btn" disabled={actionBusy} onClick={() => void deletePermanently()} type="button">
                Удалить
              </button>
            </div>
          )}
          onClose={() => { setPendingDelete(null); setActionError(""); }}
          open
          size="compact"
          title={`Удалить заметку «${pendingDelete.title}»?`}
          titleId="delete-archive-title"
        >
          {actionError ? <div className="field-error" role="alert">{actionError}</div> : null}
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
