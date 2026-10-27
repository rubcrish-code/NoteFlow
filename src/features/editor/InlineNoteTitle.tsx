import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { normalizeEntityName, validateEntityName } from "../../shared/entityName";
import { EntityNameCounter } from "../../shared/EntityNameCounter";

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
  const [draft, setDraft] = useState(title);

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
    const nextTitle = normalizeEntityName(element.textContent ?? "");
    if (nextTitle === title) return;
    const validation = validateEntityName(nextTitle);
    if (validation) { setError(validation); return; }
    element.textContent = nextTitle;
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
      onFocus={() => { setIsEditing(true); setDraft(titleRef.current?.textContent ?? title); }}
      onInput={() => { const value = titleRef.current?.textContent ?? ""; setDraft(value); setError(validateEntityName(value)); }}
      onKeyDown={handleKeyDown}
      ref={titleRef}
      role="textbox"
      suppressContentEditableWarning
    >
      {title}
    </h1>{isEditing || error ? <EntityNameCounter value={draft} /> : null}{error ? <span className="field-error" role="alert">{error}</span> : null}</>
  );
}
