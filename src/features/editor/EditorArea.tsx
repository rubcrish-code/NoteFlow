import type { Note } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { FormattingToolbar } from "./FormattingToolbar";

interface EditorAreaProps {
  isFocusMode: boolean;
  note: Note;
  onExitFocus: () => void;
  onOpenChat: () => void;
  onToggleFocus: () => void;
  onToast: (message: string) => void;
}

export function EditorArea({ isFocusMode, note, onExitFocus, onOpenChat, onToggleFocus, onToast }: EditorAreaProps) {
  return (
    <section className="editor-col">
      {!isFocusMode ? (
        <div className="ed-top">
          <div className="crumb">
            <Icon name="folder" />
            <span>Проекты</span>
            <span className="sep">/</span>
            <span>{note.project}</span>
          </div>
          <div className="ed-act">
            <div className="saved">
              <Icon name="check" />
              <span>Сохранено</span>
            </div>
            <button className="ibtn ai" onClick={onOpenChat} type="button">
              <Icon name="chat" />
              <span>Чат по заметке</span>
            </button>
            <button className="ibtn" data-tooltip="Фокус-режим (Ctrl+\)" onClick={onToggleFocus} type="button">
              <Icon name="focus" />
            </button>
            <button className="ibtn" data-tooltip="Меню заметки" onClick={() => onToast("Меню заметки пока демонстрационное")} type="button">
              <Icon name="dots" />
            </button>
          </div>
        </div>
      ) : (
        <div className="focus-strip">
          <button className="focus-exit" data-tooltip="Выйти из режима фокуса" onClick={onExitFocus} type="button">
            <Icon name="focus" />
            <span>Выйти из режима фокуса</span>
            <kbd>Esc</kbd>
          </button>
        </div>
      )}

      <FormattingToolbar />

      <div className="ed-scroll">
        <div className="ed-inner">
          <h1 className="ed-title" contentEditable suppressContentEditableWarning>
            {note.title}
          </h1>
          <div className="ed-tags">
            {note.tags.map((tag) => (
              <span className={`tag tag-${tag.color}`} key={tag.name}>
                {tag.name}
              </span>
            ))}
            {note.isNew ? <span className="note-date-chip">{note.noteDate}</span> : null}
            <button className="add" data-tooltip="Добавить тег" onClick={() => onToast("Добавление тегов появится на следующем этапе данных")} type="button">
              +
            </button>
          </div>
          <div className={`ed-body ${note.isNew ? "empty-note" : ""}`} contentEditable suppressContentEditableWarning>
            {note.isNew ? <NewNoteBody /> : <DemoNoteBody noteId={note.id} />}
          </div>
        </div>
      </div>

      <div className="ed-bottom">
        <button className="ibtn" data-tooltip="Вставить блок" onClick={() => onToast("Вставка блоков пока визуальная")} type="button">
          <Icon name="plus" />
        </button>
        <span className="words">{note.wordCount} слов</span>
      </div>
    </section>
  );
}

function NewNoteBody() {
  return (
    <div className="new-note-helper">
      <b>Новая заметка создана.</b>
      <br />
      Начните писать здесь или вставьте Markdown. На первом этапе это только демонстрационный редактор без сохранения.
    </div>
  );
}

function DemoNoteBody({ noteId }: { noteId: string }) {
  if (noteId !== "architecture") {
    return (
      <>
        <p>
          Эта демонстрационная заметка показывает выбранный элемент списка. На первом этапе NoteFlow хранит такие данные только в памяти и использует их для проверки
          навигации, поиска, панелей и визуального состояния редактора.
        </p>
        <h2>Рабочий контекст</h2>
        <ul>
          <li>Заголовок и тело можно выделить и редактировать визуально.</li>
          <li>Лента форматирования пока переключает только active-состояния.</li>
          <li>Реальное сохранение и Markdown появятся на следующих этапах.</li>
        </ul>
      </>
    );
  }

  return (
    <>
      <p>
        Обзор структуры приложения NoteFlow, ключевых модулей и принципов взаимодействия между ними. <mark>Выделите любой текст</mark>, чтобы проверить визуальное
        поведение редактора, или используйте панель сверху — там собраны все инструменты форматирования.
      </p>
      <h2>1. Общая структура</h2>
      <p>
        Приложение построено по модульному принципу с разделением на клиентскую часть, локальный бэкенд и слой хранения данных. Такой подход обеспечивает скорость,
        приватность и работу офлайн.
      </p>
      <div className="callout">
        <span className="em">i</span>
        <div>
          Совет: на первом этапе это UI-каркас. Полноценная Markdown-семантика будет добавлена вместе с TipTap/ProseMirror.
        </div>
      </div>
      <h2>2. Ключевые модули</h2>
      <ul>
        <li>
          <b>Редактор заметок</b> — будущий быстрый Markdown с WYSIWYG-представлением.
        </li>
        <li>
          <b>База знаний</b> — организация заметок в проекты и связи.
        </li>
        <li>
          <b>ИИ-ассистент</b> — правка текста, чат по заметке и чат по базе.
        </li>
        <li>
          <b>Поиск</b> — полнотекстовый поиск и фильтрация.
        </li>
      </ul>
      <h2>3. Принципы</h2>
      <ul className="task">
        <li>
          <input checked readOnly type="checkbox" />
          Скорость и плавность интерфейса
        </li>
        <li>
          <input checked readOnly type="checkbox" />
          Локальное хранение и приватность
        </li>
        <li>
          <input readOnly type="checkbox" />
          Минималистичный, мягкий дизайн
        </li>
      </ul>
      <blockquote>Хорошая заметка — та, которую легко записать и легко найти.</blockquote>
      <pre>
        <code>{'const note = { title: "NoteFlow", local: true };'}</code>
      </pre>
    </>
  );
}
