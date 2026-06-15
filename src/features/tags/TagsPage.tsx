import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { AppSection, TagRow } from "../../app/types";
import { mockTags } from "../../data/mockData";
import { Icon } from "../../shared/Icon";
import { PageShell } from "../navigation/PageShell";
import { TagColorPopover, tagColorPalette } from "./TagColorPopover";

interface TagsPageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

interface ColorEditorState {
  position: {
    left: number;
    top: number;
  };
  tagId: string;
}

function getTagHex(tag: TagRow) {
  return tag.customColor ?? tagColorPalette.find((paletteItem) => paletteItem.color === tag.color)?.hex ?? tagColorPalette[0].hex;
}

function getPopoverPosition(rect: DOMRect) {
  const popoverWidth = 300;
  const popoverHeight = 380;
  const padding = 12;
  const left = Math.min(window.innerWidth - popoverWidth - padding, Math.max(padding, rect.left));
  const preferredTop = rect.bottom + 8;
  const top = preferredTop + popoverHeight > window.innerHeight - padding ? Math.max(padding, rect.top - popoverHeight - 8) : preferredTop;

  return { left, top };
}

export function TagsPage({ onNavigate, onNewNote, onToast }: TagsPageProps) {
  const [tags, setTags] = useState<TagRow[]>(mockTags);
  const [query, setQuery] = useState("");
  const [colorEditor, setColorEditor] = useState<ColorEditorState | null>(null);

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

  function openColorPopover(tagId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    setColorEditor({ tagId, position: getPopoverPosition(event.currentTarget.getBoundingClientRect()) });
  }

  function applyTagColor(hex: string) {
    if (!colorEditor) {
      return;
    }

    const preset = tagColorPalette.find((paletteItem) => paletteItem.hex.toUpperCase() === hex.toUpperCase());
    setTags((currentTags) =>
      currentTags.map((tag) =>
        tag.id === colorEditor.tagId
          ? {
              ...tag,
              color: preset?.color ?? tag.color,
              customColor: hex,
            }
          : tag,
      ),
    );
    setColorEditor(null);
    onToast("Цвет тега изменён");
  }

  const editedTag = colorEditor ? tags.find((tag) => tag.id === colorEditor.tagId) : undefined;

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
            <span className={`tag-dot ${tag.color}`} style={{ backgroundColor: getTagHex(tag) }} />
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
            <button onClick={(event) => openColorPopover(tag.id, event)} type="button">
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
      {colorEditor && editedTag ? (
        <TagColorPopover
          currentHex={getTagHex(editedTag)}
          onApply={applyTagColor}
          onCancel={() => setColorEditor(null)}
          position={colorEditor.position}
          tagName={editedTag.name}
        />
      ) : null}
    </PageShell>
  );
}
