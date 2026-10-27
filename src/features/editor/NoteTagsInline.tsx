import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NoteTag, TagRow } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { useFloatingPopoverPosition } from "../../shared/useFloatingPopoverPosition";
import { TagEditorModal, type TagEditorValue } from "../tags/TagEditorModal";
import { getTagDisplayColor, tagColorStyle } from "../tags/tagPalette";

interface NoteTagsInlineProps {
  noteId: string;
  noteDate?: string;
  onCreateTag: (noteId: string, value: TagEditorValue) => Promise<void>;
  onSetTag: (noteId: string, tagId: string, assigned: boolean) => Promise<void>;
  onMakePrimary: (noteId: string, tagId: string) => Promise<void>;
  options: TagRow[];
  tags: NoteTag[];
}

export function NoteTagsInline({ noteId, noteDate, onCreateTag, onSetTag, onMakePrimary, options, tags }: NoteTagsInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingTagId, setPendingTagId] = useState("");
  const [error, setError] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closePopover = useCallback(() => setIsOpen(false), []);
  const position = useFloatingPopoverPosition({ anchorRef, isOpen, maxHeight: 360, popoverRef, preferredWidth: 270 });
  const assignedIds = useMemo(() => new Set(tags.map((tag) => tag.id)), [tags]);
  const matchingOptions = options.filter((tag) => tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !anchorRef.current?.contains(target) && !popoverRef.current?.contains(target)) closePopover();
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePopover();
        anchorRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePopover, isOpen]);

  useEffect(() => {
    setIsOpen(false);
    setIsCreating(false);
    setQuery("");
  }, [noteId]);

  async function changeTag(tagId: string, assigned: boolean) {
    if (pendingTagId) return;
    setPendingTagId(tagId);
    setError("");
    try {
      await onSetTag(noteId, tagId, assigned);
    } catch {
      setError("Не удалось изменить теги заметки.");
    } finally {
      setPendingTagId("");
    }
  }

  async function makePrimary(tagId: string) {
    if (pendingTagId) return;
    setPendingTagId(tagId);
    setError("");
    try {
      await onMakePrimary(noteId, tagId);
    } catch {
      setError("Не удалось изменить порядок тегов.");
    } finally {
      setPendingTagId("");
    }
  }

  return (
    <>
      <div className="ed-tags">
        {tags.map((tag) => (
          <span className={`tag tag-${tag.color} ed-tag-chip`} key={tag.id} style={tagColorStyle(tag)}>
            <span>{tag.name}</span>
            <button
              aria-label={`Убрать тег «${tag.name}» с этой заметки`}
              disabled={Boolean(pendingTagId)}
              onClick={() => void changeTag(tag.id, false)}
              title="Убрать с этой заметки"
              type="button"
            ><Icon name="x" /></button>
          </span>
        ))}
        {noteDate ? <span className="note-date-chip">{noteDate}</span> : null}
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label="Добавить тег к заметке"
          className="ed-tag-add"
          onClick={() => { setError(""); setQuery(""); setIsOpen((current) => !current); }}
          ref={anchorRef}
          title="Добавить тег"
          type="button"
        ><Icon name="plus" /></button>
      </div>
      {isOpen ? createPortal(
        <div
          aria-label="Теги заметки"
          className="nf-popover ed-tag-popover"
          ref={popoverRef}
          role="dialog"
          style={{ ...position, visibility: position ? "visible" : "hidden" }}
        >
          <label className="ed-tag-search">
            <Icon name="search" />
            <input onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Найти тег…" ref={searchRef} value={query} />
          </label>
          <div className="ed-tag-options">
            {matchingOptions.map((tag) => (
              <div className="ed-tag-option-row" key={tag.id}>
                <button
                  aria-pressed={assignedIds.has(tag.id)}
                  disabled={Boolean(pendingTagId)}
                  onClick={() => void changeTag(tag.id, !assignedIds.has(tag.id))}
                  type="button"
                >
                  <span className="tag-dot" style={{ backgroundColor: getTagDisplayColor(tag) }} />
                  <span>{tag.name}</span>
                  {assignedIds.has(tag.id) ? <Icon name="check" /> : null}
                </button>
                {assignedIds.has(tag.id) && tags[0]?.id !== tag.id ? (
                  <button className="ed-tag-primary-action" disabled={Boolean(pendingTagId)} onClick={() => void makePrimary(tag.id)} type="button">Сделать основным</button>
                ) : null}
              </div>
            ))}
            {matchingOptions.length === 0 ? <span className="ed-tag-empty">Теги не найдены</span> : null}
          </div>
          {error ? <span className="field-error" role="alert">{error}</span> : null}
          <button className="ed-tag-create" onClick={() => { setIsOpen(false); setIsCreating(true); }} type="button">
            <Icon name="plus" /> Новый тег
          </button>
        </div>,
        document.body,
      ) : null}
      {isCreating ? (
        <TagEditorModal mode="create" onClose={() => setIsCreating(false)} onSubmit={(value) => onCreateTag(noteId, value)} open tags={options} />
      ) : null}
    </>
  );
}
