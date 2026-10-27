import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { normalizeEntityName, validateEntityName } from "../../shared/entityName";
import { EntityNameCounter } from "../../shared/EntityNameCounter";
import { DatePicker as NoteDatePicker, todayIsoDate, type DatePickerHandle } from "../../shared/DatePicker";

interface NewNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, noteDate: string) => void;
}

export function NewNoteModal({ isOpen, onClose, onCreate }: NewNoteModalProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [noteDate, setNoteDate] = useState(todayIsoDate);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const datePickerRef = useRef<DatePickerHandle>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setError("");
      setNoteDate(todayIsoDate());
      setIsDatePickerOpen(false);
    }
  }, [isOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateEntityName(title);
    if (validation) { setError(validation); return; }
    onCreate(normalizeEntityName(title), noteDate || todayIsoDate());
  }

  const handleEscapeKeyDown = useCallback(() => {
    if (!isDatePickerOpen) {
      return false;
    }
    if (datePickerRef.current) datePickerRef.current.dismissTopLayer();
    else { setIsDatePickerOpen(false); window.requestAnimationFrame(() => dateTriggerRef.current?.focus()); }
    return true;
  }, [isDatePickerOpen]);

  return (
    <ModalShell
      backdropClassName="modal-backdrop"
      className="new-note-dialog"
      description="Укажите название и дату заметки. После создания откроется пустой редактор с поддержкой Markdown."
      footer={(
        <div className="new-note-actions">
          <button className="cancel secondary-btn" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="create primary-btn" disabled={Boolean(validateEntityName(title))} form="new-note-form" type="submit">
            Создать заметку
          </button>
        </div>
      )}
      initialFocusRef={titleInputRef}
      onClose={onClose}
      onEscapeKeyDown={handleEscapeKeyDown}
      open={isOpen}
      size="compact"
      title="Создать заметку"
      titleId="new-note-title"
    >
      <form className="new-note-form" id="new-note-form" onSubmit={handleSubmit}>
        <label>
          Название заметки
          <input aria-invalid={Boolean(error)} onChange={(event) => { setTitle(event.currentTarget.value); setError(""); }} placeholder="Например, Итоги встречи" ref={titleInputRef} type="text" value={title} />
          <EntityNameCounter value={title} />
          {error ? <span className="field-error" role="alert">{error}</span> : null}
        </label>
        <label>
          Дата заметки
          <NoteDatePicker ref={datePickerRef} isOpen={isDatePickerOpen} onChange={setNoteDate} onOpenChange={setIsDatePickerOpen} triggerRef={dateTriggerRef} value={noteDate} />
        </label>
      </form>
    </ModalShell>
  );
}
