import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { formatDisplayDate, NoteDatePicker, todayIsoDate } from "./NoteDatePicker";

interface NewNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, noteDate: string) => void;
}

export function NewNoteModal({ isOpen, onClose, onCreate }: NewNoteModalProps) {
  const [title, setTitle] = useState("");
  const [noteDate, setNoteDate] = useState(todayIsoDate);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setNoteDate(todayIsoDate());
      setIsDatePickerOpen(false);
    }
  }, [isOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(title.trim() || "Без названия", noteDate || todayIsoDate());
  }

  const handleEscapeKeyDown = useCallback(() => {
    if (!isDatePickerOpen) {
      return false;
    }
    setIsDatePickerOpen(false);
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
          <input onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Например, Итоги встречи" ref={titleInputRef} type="text" value={title} />
        </label>
        <label>
          Дата заметки
          <NoteDatePicker isOpen={isDatePickerOpen} onChange={setNoteDate} onOpenChange={setIsDatePickerOpen} value={noteDate} />
          <span className="date-picker-readable">Выбрана дата: {formatDisplayDate(noteDate)}</span>
        </label>
      </form>
    </ModalShell>
  );
}
