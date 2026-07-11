import { useEffect, useMemo, useState } from "react";
import type { AppSection, ArchiveItem } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { PageShell } from "../navigation/PageShell";

interface ArchivePageProps {
  archiveItems: ArchiveItem[];
  onDeleteItem: (item: ArchiveItem) => void;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onRestoreItem: (item: ArchiveItem) => void;
  onToast: (message: string) => void;
}

export function ArchivePage({ archiveItems, onDeleteItem, onNavigate, onNewNote, onRestoreItem, onToast }: ArchivePageProps) {
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ArchiveItem | null>(null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return archiveItems;
    }

    return archiveItems.filter((item) => [item.title, item.kind, item.archivedAt].join(" ").toLowerCase().includes(normalizedQuery));
  }, [archiveItems, query]);

  useEffect(() => {
    if (!pendingDelete) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setPendingDelete(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [pendingDelete]);

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
    <PageShell activeSection="archive" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
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
              <div>
                <b>{item.title}</b>
                <div className="archive-date">{item.archivedAt}</div>
              </div>
              <span className="archive-kind">{item.kind}</span>
            </div>
            <div className="archive-row-actions">
              <button className="archive-action primary" onClick={() => restoreItem(item)} type="button">
                Восстановить
              </button>
              <button className="archive-action danger" onClick={() => setPendingDelete(item)} type="button">
                Удалить окончательно
              </button>
            </div>
          </div>
        ))}
        {filteredItems.length === 0 ? <div className="archive-empty">В архиве нет элементов по этому запросу.</div> : null}
      </div>

      {pendingDelete ? (
        <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setPendingDelete(null)}>
          <div aria-labelledby="delete-archive-title" aria-modal="true" className="confirm-dialog" role="dialog">
            <h2 id="delete-archive-title">Удалить окончательно?</h2>
            <p>
              «{pendingDelete.title}» будет {pendingDeleteVerb} из локальной базы NoteFlow.
            </p>
            <div className="new-note-actions">
              <button className="cancel" onClick={() => setPendingDelete(null)} type="button">
                Отмена
              </button>
              <button className="danger-solid" onClick={deletePermanently} type="button">
                Удалить окончательно
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
