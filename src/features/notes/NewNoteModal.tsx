import { useEffect, useState, type FormEvent } from "react";
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

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setNoteDate(todayIsoDate());
      setIsDatePickerOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.stopPropagation();
      if (isDatePickerOpen) {
        setIsDatePickerOpen(false);
        return;
      }
      onClose();
    }

    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [isDatePickerOpen, isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(title.trim() || "Без названия", noteDate || todayIsoDate());
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <form aria-labelledby="new-note-title" className="new-note-dialog" onSubmit={handleSubmit}>
        <h2 id="new-note-title">Создать заметку</h2>
        <p>Укажите название и дату заметки. После создания откроется пустой редактор с поддержкой Markdown.</p>
        <label>
          Название заметки
          <input autoFocus onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Например, Итоги встречи" type="text" value={title} />
        </label>
        <label>
          Дата заметки
          <NoteDatePicker isOpen={isDatePickerOpen} onChange={setNoteDate} onOpenChange={setIsDatePickerOpen} value={noteDate} />
          <span className="date-picker-readable">Выбрана дата: {formatDisplayDate(noteDate)}</span>
        </label>
        <div className="new-note-actions">
          <button className="cancel" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="create" type="submit">
            Создать заметку
          </button>
        </div>
      </form>
    </div>
  );
}
