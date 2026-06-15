import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Note } from "../../app/types";
import { Icon, type IconName } from "../../shared/Icon";
import type { CalloutVariant } from "./customExtensions";

type SimpleBlockCommand =
  | "blockquote"
  | "bulletList"
  | "callout"
  | "codeBlock"
  | "details"
  | "divider"
  | "h1"
  | "h2"
  | "h3"
  | "orderedList"
  | "paragraph"
  | "table"
  | "taskList";

interface BlockInsertMenuProps {
  editor: Editor | null;
  notes: Note[];
  onClose: () => void;
  onToast: (message: string) => void;
}

interface BlockMenuItem {
  command: SimpleBlockCommand;
  icon: IconName;
  title: string;
  description: string;
}

const blockMenuItems: BlockMenuItem[] = [
  { command: "paragraph", icon: "doc", title: "Абзац", description: "Обычный текстовый блок" },
  { command: "h1", icon: "doc", title: "Заголовок 1", description: "Крупный раздел заметки" },
  { command: "h2", icon: "doc", title: "Заголовок 2", description: "Подраздел" },
  { command: "h3", icon: "doc", title: "Заголовок 3", description: "Малый заголовок" },
  { command: "bulletList", icon: "ul", title: "Список", description: "Маркированные пункты" },
  { command: "orderedList", icon: "ol", title: "Нумерация", description: "Последовательные шаги" },
  { command: "taskList", icon: "task", title: "Чек-лист", description: "Задачи с отметками" },
  { command: "blockquote", icon: "quote", title: "Цитата", description: "Выделенный фрагмент" },
  { command: "codeBlock", icon: "codeBlock", title: "Код", description: "Моноширинный блок" },
  { command: "table", icon: "table", title: "Таблица", description: "3 строки и 3 колонки" },
  { command: "callout", icon: "callout", title: "Выноска", description: "Информационный блок" },
  { command: "details", icon: "toggle", title: "Сворачиваемый блок", description: "Summary/details" },
  { command: "divider", icon: "divider", title: "Разделитель", description: "Горизонтальная линия" },
];

const calloutVariants: Array<{ label: string; value: CalloutVariant }> = [
  { label: "Info", value: "info" },
  { label: "Tip", value: "tip" },
  { label: "Warning", value: "warning" },
  { label: "Important", value: "important" },
];

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} Б`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} КБ`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Файл не удалось прочитать как data URL"));
      }
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Файл не удалось прочитать")));
    reader.readAsDataURL(file);
  });
}

export function BlockInsertMenu({ editor, notes, onClose, onToast }: BlockInsertMenuProps) {
  const [dateDraft, setDateDraft] = useState(getTodayIsoDate());
  const [formulaDraft, setFormulaDraft] = useState("a^2 + b^2 = c^2");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  function runSimpleCommand(command: SimpleBlockCommand) {
    if (!editor) {
      return;
    }

    const chain = editor.chain().focus();
    if (command === "paragraph") {
      chain.setParagraph().run();
    }
    if (command === "h1" || command === "h2" || command === "h3") {
      chain.toggleHeading({ level: Number(command.slice(1)) as 1 | 2 | 3 }).run();
    }
    if (command === "bulletList") {
      chain.toggleBulletList().run();
    }
    if (command === "orderedList") {
      chain.toggleOrderedList().run();
    }
    if (command === "taskList") {
      chain.toggleTaskList().run();
    }
    if (command === "blockquote") {
      chain.toggleBlockquote().run();
    }
    if (command === "codeBlock") {
      chain.toggleCodeBlock().run();
    }
    if (command === "table") {
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }
    if (command === "callout") {
      chain.insertCallout({ variant: "info" }).run();
    }
    if (command === "details") {
      chain.insertDetailsBlock().run();
    }
    if (command === "divider") {
      chain.setHorizontalRule().run();
    }

    onClose();
  }

  async function insertImage(file: File | undefined) {
    if (!file || !editor) {
      return;
    }

    try {
      const src = await readFileAsDataUrl(file);
      editor.chain().focus().setImage({ src, alt: file.name, title: file.name }).run();
      onToast("Изображение добавлено в мок-документ");
      onClose();
    } catch {
      onToast("Не удалось прочитать изображение");
    }
  }

  function insertFile(file: File | undefined) {
    if (!file || !editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertFileAttachment({
        name: file.name,
        size: formatFileSize(file.size),
        storageId: `memory-${Date.now()}-${file.name}`,
        type: file.type || "file",
      })
      .run();
    onToast("Файл добавлен как локальное вложение в памяти");
    onClose();
  }

  function insertDate() {
    if (!editor || !dateDraft) {
      return;
    }
    editor.chain().focus().insertInlineDate({ value: dateDraft }).run();
    onClose();
  }

  function insertFormula(block: boolean) {
    if (!editor) {
      return;
    }
    const latex = formulaDraft.trim() || "a^2 + b^2 = c^2";
    const chain = editor.chain().focus();
    if (block) {
      chain.insertFormulaBlock({ latex }).run();
    } else {
      chain.insertFormulaInline({ latex }).run();
    }
    onClose();
  }

  function insertCalloutVariant(variant: CalloutVariant) {
    if (!editor) {
      return;
    }
    editor.chain().focus().insertCallout({ variant }).run();
    onClose();
  }

  function insertMention(note: Note) {
    if (!editor) {
      return;
    }
    editor.chain().focus().insertNoteMention({ label: note.title, noteId: note.id }).run();
    onClose();
  }

  return (
    <div className="block-insert-menu" ref={menuRef} role="dialog">
      <div className="block-menu-head">
        <b>Вставить блок</b>
        <button aria-label="Закрыть" className="editor-popover-close" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>

      <div className="block-menu-grid">
        {blockMenuItems.map((item) => (
          <button className="block-menu-item" key={item.command} onClick={() => runSimpleCommand(item.command)} type="button">
            <Icon name={item.icon} />
            <span>
              <b>{item.title}</b>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="block-menu-tools">
        <button className="block-menu-item" onClick={() => imageInputRef.current?.click()} type="button">
          <Icon name="image" />
          <span>
            <b>Изображение</b>
            <small>Локальный файл без абсолютного пути</small>
          </span>
        </button>
        <button className="block-menu-item" onClick={() => fileInputRef.current?.click()} type="button">
          <Icon name="attach" />
          <span>
            <b>Файл</b>
            <small>Мок-вложение для будущего managed storage</small>
          </span>
        </button>
      </div>

      <div className="block-callout-variants">
        <div className="block-menu-section-title">Вариант выноски</div>
        {calloutVariants.map((variant) => (
          <button className={`callout-variant-btn ${variant.value}`} key={variant.value} onClick={() => insertCalloutVariant(variant.value)} type="button">
            {variant.label}
          </button>
        ))}
      </div>

      <div className="block-menu-inline">
        <label>
          Дата
          <input onChange={(event) => setDateDraft(event.currentTarget.value)} type="date" value={dateDraft} />
        </label>
        <button className="secondary-btn" onClick={insertDate} type="button">
          Вставить дату
        </button>
      </div>

      <div className="block-menu-inline">
        <label>
          Формула LaTeX
          <input onChange={(event) => setFormulaDraft(event.currentTarget.value)} value={formulaDraft} />
        </label>
        <button className="secondary-btn" onClick={() => insertFormula(false)} type="button">
          Inline
        </button>
        <button className="secondary-btn" onClick={() => insertFormula(true)} type="button">
          Блок
        </button>
      </div>

      <div className="block-menu-mentions">
        <div className="block-menu-section-title">Упоминание заметки</div>
        {notes.slice(0, 5).map((note) => (
          <button className="block-menu-note" key={note.id} onClick={() => insertMention(note)} type="button">
            @{note.title}
          </button>
        ))}
      </div>

      <input accept="image/*" hidden onChange={(event) => void insertImage(event.currentTarget.files?.[0])} ref={imageInputRef} type="file" />
      <input hidden onChange={(event) => insertFile(event.currentTarget.files?.[0])} ref={fileInputRef} type="file" />
    </div>
  );
}
