import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { entityNameLength, validateEntityName } from "../../shared/entityName";
import { formatDisplayDate, DatePicker as NoteDatePicker, todayIsoDate, type DatePickerHandle } from "../../shared/DatePicker";

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
    const validation = validateEntityName(title.trim() || "Без названия");
    if (validation) { setError(validation); return; }
    onCreate(title.trim() || "Без названия", noteDate || todayIsoDate());
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
          <button className="create primary-btn" form="new-note-form" type="submit">
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
          <small>{entityNameLength(title)}/25</small>
          {error ? <span className="field-error" role="alert">{error}</span> : null}
        </label>
        <label>
          Дата заметки
          <NoteDatePicker ref={datePickerRef} isOpen={isDatePickerOpen} onChange={setNoteDate} onOpenChange={setIsDatePickerOpen} triggerRef={dateTriggerRef} value={noteDate} />
          <span className="date-picker-readable">Выбрана дата: {formatDisplayDate(noteDate)}</span>
        </label>
      </form>
    </ModalShell>
  );
}
