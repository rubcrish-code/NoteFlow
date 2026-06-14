import { useEffect, useState, type FormEvent } from "react";

interface NewNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, noteDate: string) => void;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function NewNoteModal({ isOpen, onClose, onCreate }: NewNoteModalProps) {
  const [title, setTitle] = useState("");
  const [noteDate, setNoteDate] = useState(todayIsoDate);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setNoteDate(todayIsoDate());
    }
  }, [isOpen]);

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
          <input onChange={(event) => setNoteDate(event.currentTarget.value)} type="date" value={noteDate} />
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
