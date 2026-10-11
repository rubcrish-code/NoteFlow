import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { entityNameLength, validateEntityName } from "../../shared/entityName";

interface InlineNoteTitleProps {
  noteId: string;
  onRename: (noteId: string, title: string) => Promise<void>;
  title: string;
}

export function InlineNoteTitle({ noteId, onRename, title }: InlineNoteTitleProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cancelledRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draftLength, setDraftLength] = useState(entityNameLength(title));

  useEffect(() => {
    if (titleRef.current && document.activeElement !== titleRef.current) {
      titleRef.current.textContent = title;
    }
  }, [noteId, title]);

  async function commit() {
    const element = titleRef.current;
    if (!element || cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const nextTitle = (element.textContent ?? "").replace(/\s+/g, " ").trim() || "Без названия";
    element.textContent = nextTitle;
    if (nextTitle === title) return;
    const validation = validateEntityName(nextTitle);
    if (validation) { setError(validation); element.textContent = title; return; }
    setError("");
    setIsSaving(true);
    try {
      await onRename(noteId, nextTitle);
    } catch {
      if (titleRef.current) titleRef.current.textContent = title;
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLHeadingElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelledRef.current = true;
      if (titleRef.current) titleRef.current.textContent = title;
      titleRef.current?.blur();
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
      event.preventDefault();
      titleRef.current?.blur();
    }
  }

  return (
    <><h1
      aria-label="Название заметки"
      className="ed-title ed-title-editable"
      contentEditable={!isSaving ? "plaintext-only" : false}
      onBlur={() => { setIsEditing(false); void commit(); }}
      onFocus={() => { setIsEditing(true); setDraftLength(entityNameLength(titleRef.current?.textContent ?? title)); }}
      onInput={() => { setDraftLength(entityNameLength(titleRef.current?.textContent ?? "")); setError(""); }}
      onKeyDown={handleKeyDown}
      ref={titleRef}
      role="textbox"
      suppressContentEditableWarning
    >
      {title}
    </h1>{isEditing ? <small className="entity-name-counter" aria-live="polite">{draftLength}/25</small> : null}{error ? <span className="field-error" role="alert">{error}</span> : null}</>
  );
}
