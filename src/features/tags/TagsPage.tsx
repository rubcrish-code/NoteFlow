import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { AppSection, TagColor, TagRow } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { PageShell } from "../navigation/PageShell";
import { TagColorPopover, tagColorPalette } from "./TagColorPopover";

interface TagsPageProps {
  tags: TagRow[];
  onCreateTag: () => void;
  onDeleteTag: (tagId: string) => void;
  onMergeTags: (sourceTagId: string, targetTagId: string) => void;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onOpenTag: (tagName: string) => void;
  onRenameTag: (tagId: string, name: string) => void;
  onToast: (message: string) => void;
  onUpdateTagColor: (tagId: string, color: TagColor, customColor?: string) => void;
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

export function TagsPage({ tags, onCreateTag, onDeleteTag, onMergeTags, onNavigate, onNewNote, onOpenTag, onRenameTag, onToast, onUpdateTagColor }: TagsPageProps) {
  const [query, setQuery] = useState("");
  const [colorEditor, setColorEditor] = useState<ColorEditorState | null>(null);

  const filteredTags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return tags;
    }
    return tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery));
  }, [query, tags]);

  function openColorPopover(tagId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    setColorEditor({ tagId, position: getPopoverPosition(event.currentTarget.getBoundingClientRect()) });
  }

  function applyTagColor(hex: string) {
    if (!colorEditor) {
      return;
    }

    const preset = tagColorPalette.find((paletteItem) => paletteItem.hex.toUpperCase() === hex.toUpperCase());
    onUpdateTagColor(colorEditor.tagId, preset?.color ?? "blue", hex);
    setColorEditor(null);
  }

  function renameTag(tag: TagRow) {
    const nextName = window.prompt("Новое название тега", tag.name)?.trim();
    if (nextName) {
      onRenameTag(tag.id, nextName);
    }
  }

  function mergeTag(tag: TagRow) {
    const targetName = window.prompt(`С каким тегом объединить «${tag.name}»?`)?.trim().toLowerCase();
    if (!targetName) {
      return;
    }
    const targetTag = tags.find((currentTag) => currentTag.name.toLowerCase() === targetName);
    if (!targetTag) {
      onToast("Целевой тег не найден");
      return;
    }
    onMergeTags(tag.id, targetTag.id);
  }

  const editedTag = colorEditor ? tags.find((tag) => tag.id === colorEditor.tagId) : undefined;

  return (
    <PageShell activeSection="tags" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <div className="tags-head">
        <div>
          <div className="page-title">Теги</div>
          <div className="page-subtitle">Создавайте, переименовывайте, объединяйте и удаляйте теги. Нажмите на тег, чтобы увидеть связанные заметки.</div>
        </div>
        <button className="new-btn tags-new" onClick={onCreateTag} type="button">
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
            <div className="tag-row-main">
              <span className={`tag-dot ${tag.color}`} style={{ backgroundColor: getTagHex(tag) }} />
              <div>
                <b>{tag.name}</b>
                <small>{tag.count} заметок</small>
              </div>
            </div>
            <div className="tag-row-actions">
              <button className="tag-action primary" onClick={() => onOpenTag(tag.name)} type="button">
                Открыть
              </button>
            <button className="tag-action secondary" onClick={() => renameTag(tag)} type="button">
              Переименовать
            </button>
            <button className="tag-action secondary" onClick={(event) => openColorPopover(tag.id, event)} type="button">
              Цвет
            </button>
            <button className="tag-action secondary" onClick={() => mergeTag(tag)} type="button">
              Объединить
            </button>
            <button className="tag-action danger" onClick={() => onDeleteTag(tag.id)} type="button">
              Удалить
            </button>
            </div>
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
