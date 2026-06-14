import { useEffect, useMemo, useState } from "react";
import type { AppSection, ArchiveItem } from "../../app/types";
import { mockArchive } from "../../data/mockData";
import { Icon } from "../../shared/Icon";
import { PageShell } from "../navigation/PageShell";

interface ArchivePageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

export function ArchivePage({ onNavigate, onNewNote, onToast }: ArchivePageProps) {
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>(mockArchive);
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
    setArchiveItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== item.id));
    onToast(item.kind === "Проект" ? "Проект восстановлен" : "Заметка восстановлена");
  }

  function deletePermanently() {
    if (!pendingDelete) {
      return;
    }

    setArchiveItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== pendingDelete.id));
    onToast(pendingDelete.kind === "Проект" ? "Проект удалён из мок-архива" : "Заметка удалена из мок-архива");
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
            <div>
              <b>{item.title}</b>
              <div className="archive-date">{item.archivedAt}</div>
            </div>
            <span>{item.kind}</span>
            <button className="tb wide" onClick={() => restoreItem(item)} type="button">
              Восстановить
            </button>
            <button className="tb wide danger-outline" onClick={() => setPendingDelete(item)} type="button">
              Удалить окончательно
            </button>
          </div>
        ))}
        {filteredItems.length === 0 ? <div className="archive-empty">В архиве нет элементов по этому запросу.</div> : null}
      </div>

      {pendingDelete ? (
        <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setPendingDelete(null)}>
          <div aria-labelledby="delete-archive-title" aria-modal="true" className="confirm-dialog" role="dialog">
            <h2 id="delete-archive-title">Удалить окончательно?</h2>
            <p>
              «{pendingDelete.title}» будет {pendingDeleteVerb} из мок-архива текущего сеанса. Это демонстрационное действие без записи в базу.
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
