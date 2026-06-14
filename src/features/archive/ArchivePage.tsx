import type { AppSection } from "../../app/types";
import { mockArchive } from "../../data/mockData";
import { Icon } from "../../shared/Icon";
import { PageShell } from "../navigation/PageShell";

interface ArchivePageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

export function ArchivePage({ onNavigate, onNewNote, onToast }: ArchivePageProps) {
  return (
    <PageShell activeSection="archive" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <div className="page-title">Архив</div>
      <div className="page-subtitle">Завершённые и неактуальные материалы. Их можно восстановить в любой момент.</div>
      <label className="search archive-search">
        <Icon name="search" />
        <input placeholder="Поиск в архиве…" type="search" />
      </label>
      <div className="archive-list">
        {mockArchive.map((item) => {
          const restoreMessage = item.kind === "Проект" ? "Проект восстановлен" : "Заметка восстановлена";

          return (
          <div className="archive-row" key={item.id}>
            <div>
              <b>{item.title}</b>
              <div className="archive-date">{item.archivedAt}</div>
            </div>
            <span>{item.kind}</span>
            <button className="tb wide" onClick={() => onToast(restoreMessage)} type="button">
              Восстановить
            </button>
          </div>
          );
        })}
      </div>
    </PageShell>
  );
}
