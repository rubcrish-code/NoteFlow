import { useMemo, useState } from "react";
import type { AppSection, TagColor, TagRow } from "../../app/types";
import { mockTags } from "../../data/mockData";
import { Icon } from "../../shared/Icon";
import { PageShell } from "../navigation/PageShell";

const tagColorOrder: TagColor[] = ["blue", "purple", "green", "amber", "pink"];

interface TagsPageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

export function TagsPage({ onNavigate, onNewNote, onToast }: TagsPageProps) {
  const [tags, setTags] = useState<TagRow[]>(mockTags);
  const [query, setQuery] = useState("");

  const filteredTags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return tags;
    }
    return tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery));
  }, [query, tags]);

  function createTag() {
    const nextNumber = tags.length + 1;
    setTags((currentTags) => [
      ...currentTags,
      {
        id: `tag-${Date.now()}`,
        name: `новый тег ${nextNumber}`,
        count: 0,
        color: "blue",
      },
    ]);
    onToast("Тег создан в мок-данных");
  }

  function cycleColor(tagId: string) {
    setTags((currentTags) =>
      currentTags.map((tag) => {
        if (tag.id !== tagId) {
          return tag;
        }
        const currentIndex = tagColorOrder.indexOf(tag.color);
        const nextColor = tagColorOrder[(currentIndex + 1) % tagColorOrder.length];
        return { ...tag, color: nextColor };
      }),
    );
    onToast("Цвет тега изменён");
  }

  return (
    <PageShell activeSection="tags" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <div className="tags-head">
        <div>
          <div className="page-title">Теги</div>
          <div className="page-subtitle">Создавайте, переименовывайте, объединяйте и удаляйте теги. Нажмите на тег, чтобы увидеть связанные заметки.</div>
        </div>
        <button className="new-btn tags-new" onClick={createTag} type="button">
          + Новый тег
        </button>
      </div>

      <label className="search tags-search">
        <Icon name="search" />
        <input onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Поиск тегов…" type="search" value={query} />
      </label>

      <div className="tags-table">
        {filteredTags.map((tag) => (
          <div className="tag-row" key={tag.id}>
            <span className={`tag-dot ${tag.color}`} />
            <div>
              <b>{tag.name}</b>
              <small>{tag.count} заметок</small>
            </div>
            <button
              onClick={() => {
                onNavigate("notes");
                onToast(`Открыты заметки с тегом «${tag.name}»`);
              }}
              type="button"
            >
              Открыть
            </button>
            <button onClick={() => onToast("Переименование тега будет подключено к базе на следующем этапе")} type="button">
              Переименовать
            </button>
            <button onClick={() => cycleColor(tag.id)} type="button">
              Цвет
            </button>
            <button onClick={() => onToast("Объединение тегов пока демонстрационное")} type="button">
              Объединить
            </button>
            <button className="danger" onClick={() => setTags((currentTags) => currentTags.filter((currentTag) => currentTag.id !== tag.id))} type="button">
              Удалить
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
