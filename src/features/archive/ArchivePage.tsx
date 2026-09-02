import { useCallback, useMemo, useRef, useState } from "react";
import type { AppSection, ArchiveItem } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { ModalShell } from "../../shared/ModalShell";
import { PageShell, type PageShellSidebarProps } from "../navigation/PageShell";

interface ArchivePageProps {
  archiveItems: ArchiveItem[];
  onDeleteItem: (item: ArchiveItem) => void;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onRestoreItem: (item: ArchiveItem) => void;
  onToast: (message: string) => void;
  sidebar: PageShellSidebarProps;
}

export function ArchivePage({ archiveItems, onDeleteItem, onNavigate, onNewNote, onRestoreItem, onToast, sidebar }: ArchivePageProps) {
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ArchiveItem | null>(null);
  const [openItemMenuId, setOpenItemMenuId] = useState("");
  const itemMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const closeItemMenu = useCallback(() => setOpenItemMenuId(""), []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return archiveItems;
    }

    return archiveItems.filter((item) => [item.title, item.kind, item.archivedAt].join(" ").toLowerCase().includes(normalizedQuery));
  }, [archiveItems, query]);

  function restoreItem(item: ArchiveItem) {
    onRestoreItem(item);
  }

  function deletePermanently() {
    if (!pendingDelete) {
      return;
    }

    onDeleteItem(pendingDelete);
    setPendingDelete(null);
  }

  const pendingDeleteVerb = pendingDelete?.kind === "Проект" ? "удалён" : "удалена";

  return (
    <PageShell activeSection="archive" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast} sidebar={sidebar}>
      <div className="archive-page-content">
        <div className="page-title">Архив</div>
        <div className="page-subtitle">Завершённые и неактуальные материалы. Их можно восстановить в любой момент.</div>
        <label className="search archive-search">
          <Icon name="search" />
          <input onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Поиск в архиве…" type="search" value={query} />
        </label>
        <div className="archive-list">
        {filteredItems.map((item) => (
          <div className="archive-row" key={item.id}>
            <div className="archive-row-main">
              <span className="archive-row-icon"><Icon name={item.kind === "Проект" ? "folder" : "doc"} /></span>
              <div>
                <b>{item.title}</b>
                <div className="archive-date">{item.kind} · {item.archivedAt}</div>
              </div>
            </div>
            <div className="archive-row-actions">
              <button className="archive-action secondary-btn compact" onClick={() => restoreItem(item)} type="button">
                Восстановить
              </button>
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
                <button className="danger" onClick={() => { setOpenItemMenuId(""); setPendingDelete(item); }} role="menuitem" type="button">Удалить окончательно</button>
              </MenuPopover>
            </div>
          </div>
        ))}
        {filteredItems.length === 0 ? (
          <div className="page-empty-state panel-empty-state">
            <span className="page-empty-icon"><Icon name="archive" /></span>
            <div><b>{query ? "Ничего не найдено" : "Архив пуст"}</b><span>{query ? "Попробуйте изменить запрос." : "Здесь появятся архивированные заметки и проекты."}</span></div>
          </div>
        ) : null}
        </div>
      </div>

      {pendingDelete ? (
        <ModalShell
          backdropClassName="confirm-backdrop"
          className="confirm-dialog"
          description={`«${pendingDelete.title}» будет ${pendingDeleteVerb} из локальной базы NoteFlow.`}
          dismissOnBackdrop={false}
          footer={(
            <div className="new-note-actions">
              <button className="secondary-btn" onClick={() => setPendingDelete(null)} type="button">
                Отмена
              </button>
              <button className="danger-btn" onClick={deletePermanently} type="button">
                Удалить окончательно
              </button>
            </div>
          )}
          onClose={() => setPendingDelete(null)}
          open
          size="compact"
          title="Удалить окончательно?"
          titleId="delete-archive-title"
        >
          <div className="settings-confirm-note">Это действие нельзя отменить.</div>
        </ModalShell>
      ) : null}
    </PageShell>
  );
}
