import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { AppSection, TagColor, TagRow } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
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
  trigger: HTMLButtonElement;
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
  const [openTagMenuId, setOpenTagMenuId] = useState("");
  const tagMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const closeTagMenu = useCallback(() => setOpenTagMenuId(""), []);

  const filteredTags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return tags;
    }
    return tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery));
  }, [query, tags]);

  function openColorPopover(tagId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    setColorEditor({
      tagId,
      position: getPopoverPosition(event.currentTarget.getBoundingClientRect()),
      trigger: tagMenuAnchorRef.current ?? event.currentTarget,
    });
    setOpenTagMenuId("");
  }

  function applyTagColor(hex: string) {
    if (!colorEditor) {
      return;
    }

    const preset = tagColorPalette.find((paletteItem) => paletteItem.hex.toUpperCase() === hex.toUpperCase());
    onUpdateTagColor(colorEditor.tagId, preset?.color ?? "blue", hex);
    colorEditor.trigger.focus();
    setColorEditor(null);
  }

  function closeColorPopover() {
    colorEditor?.trigger.focus();
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
        <button className="primary-btn tags-new" onClick={onCreateTag} type="button">
          <Icon name="plus" />
          Новый тег
        </button>
      </div>

      <label className="search tags-search">
        <Icon name="search" />
        <input onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Поиск тегов…" type="search" value={query} />
      </label>

      <div className="tags-table">
        {filteredTags.map((tag) => (
          <div className="tag-row" key={tag.id}>
            <button className="tag-row-main" onClick={() => onOpenTag(tag.name)} type="button">
              <span className={`tag-dot ${tag.color}`} style={{ backgroundColor: getTagHex(tag) }} />
              <div>
                <b>{tag.name}</b>
                <small>{tag.count} заметок</small>
              </div>
            </button>
            <div className="tag-row-actions">
              <button
                aria-expanded={openTagMenuId === tag.id}
                aria-haspopup="menu"
                aria-label={`Действия с тегом «${tag.name}»`}
                className="row-menu-trigger"
                onClick={(event) => {
                  tagMenuAnchorRef.current = event.currentTarget;
                  setOpenTagMenuId((current) => current === tag.id ? "" : tag.id);
                }}
                type="button"
              >
                <Icon name="dots" />
              </button>
              <MenuPopover
                anchorRef={tagMenuAnchorRef}
                ariaLabel={`Действия с тегом «${tag.name}»`}
                className="row-actions-menu"
                isOpen={openTagMenuId === tag.id}
                onClose={closeTagMenu}
                preferredWidth={190}
              >
                <button onClick={() => { setOpenTagMenuId(""); renameTag(tag); }} role="menuitem" type="button">Переименовать</button>
                <button onClick={(event) => openColorPopover(tag.id, event)} role="menuitem" type="button">Изменить цвет</button>
                <button onClick={() => { setOpenTagMenuId(""); mergeTag(tag); }} role="menuitem" type="button">Объединить</button>
                <div className="nf-menu-separator" />
                <button className="danger" onClick={() => { setOpenTagMenuId(""); onDeleteTag(tag.id); }} role="menuitem" type="button">Удалить</button>
              </MenuPopover>
            </div>
          </div>
        ))}
        {filteredTags.length === 0 ? (
          <div className="page-empty-state panel-empty-state">
            <span className="page-empty-icon"><Icon name="tag" /></span>
            <div><b>Теги не найдены</b><span>Измените запрос или создайте новый тег.</span></div>
          </div>
        ) : null}
      </div>
      {colorEditor && editedTag ? (
        <TagColorPopover
          currentHex={getTagHex(editedTag)}
          onApply={applyTagColor}
          onCancel={closeColorPopover}
          position={colorEditor.position}
          tagName={editedTag.name}
        />
      ) : null}
    </PageShell>
  );
}
