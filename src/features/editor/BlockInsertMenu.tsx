import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Editor } from "@tiptap/react";
import type { NoteAttachment } from "../../app/types";
import { Icon, type IconName } from "../../shared/Icon";
import type { CalloutVariant } from "./customExtensions";

type SimpleBlockCommand =
  | "callout"
  | "details"
  | "divider"
  | "table";

interface BlockInsertMenuProps {
  editTarget: EditorInsertTarget | null;
  editor: Editor | null;
  onClose: () => void;
  onPickAndStoreAttachment: (kind: "file" | "image") => Promise<{ attachment: NoteAttachment; sizeLabel: string } | null>;
  onToast: (message: string) => void;
  selection: EditorInsertSelection | null;
}

export interface EditorInsertSelection {
  from: number;
  to: number;
}

export type EditorInsertTarget =
  | { kind: "date"; position: number; value: string }
  | { kind: "formula-block" | "formula-inline"; latex: string; position: number };

interface BlockMenuItem {
  command: SimpleBlockCommand;
  icon: IconName;
  title: string;
  description: string;
}

const blockMenuItems: BlockMenuItem[] = [
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
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export function BlockInsertMenu({ editTarget, editor, onClose, onPickAndStoreAttachment, onToast, selection }: BlockInsertMenuProps) {
  const [dateDraft, setDateDraft] = useState(editTarget?.kind === "date" ? editTarget.value : getTodayIsoDate());
  const [formulaDraft, setFormulaDraft] = useState(editTarget && editTarget.kind !== "date" ? editTarget.latex : "a^2 + b^2 = c^2");
  const [insertError, setInsertError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editTarget?.kind === "date") {
      setDateDraft(editTarget.value);
    } else if (editTarget) {
      setFormulaDraft(editTarget.latex);
    }
    setInsertError("");
  }, [editTarget]);

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

  async function insertImage() {
    if (!editor) {
      return;
    }

    try {
      const stored = await onPickAndStoreAttachment("image");
      if (!stored?.attachment.assetUri) {
        return;
      }
      const imageAttrs = {
        alt: stored.attachment.originalName,
        attachmentId: stored.attachment.id,
        originalAttachmentId: stored.attachment.id,
        originalSrc: stored.attachment.assetUri,
        src: stored.attachment.assetUri,
        title: stored.attachment.originalName,
      };
      editor
        .chain()
        .focus()
        .setImage(imageAttrs)
        .run();
      onToast("Изображение сохранено во вложениях");
      onClose();
    } catch {
      onToast("Не удалось сохранить изображение");
    }
  }

  async function insertFile() {
    if (!editor) {
      return;
    }

    try {
      const stored = await onPickAndStoreAttachment("file");
      if (!stored) {
        return;
      }
      editor
        .chain()
        .focus()
        .insertFileAttachment({
          name: stored.attachment.originalName,
          size: stored.sizeLabel || formatFileSize(stored.attachment.sizeBytes),
          storageId: stored.attachment.id,
          type: stored.attachment.mimeType || "file",
        })
        .run();
      onToast("Файл сохранён во вложениях");
      onClose();
    } catch {
      onToast("Не удалось сохранить файл");
    }
  }

  function restoreInsertionSelection() {
    if (!editor || editTarget || !selection) {
      return editor?.chain().focus();
    }
    const maxPosition = editor.state.doc.content.size;
    return editor
      .chain()
      .focus()
      .setTextSelection({
        from: Math.min(selection.from, maxPosition),
        to: Math.min(selection.to, maxPosition),
      });
  }

  function insertDate() {
    const value = dateDraft.trim();
    if (!editor || !value) {
      return;
    }
    setInsertError("");
    const didRun = editTarget?.kind === "date"
      ? editor
          .chain()
          .focus()
          .setNodeSelection(editTarget.position)
          .updateAttributes("inlineDate", { value })
          .setTextSelection(Math.min(editTarget.position + 1, editor.state.doc.content.size))
          .run()
      : restoreInsertionSelection()?.insertInlineDate({ value }).run() ?? false;
    if (didRun) {
      onClose();
    } else {
      setInsertError("Не удалось вставить дату. Поставьте курсор в текст и повторите.");
    }
  }

  function insertFormula(block: boolean) {
    const latex = formulaDraft.trim();
    if (!editor || !latex) {
      return;
    }
    setInsertError("");
    let didRun: boolean;
    if (editTarget?.kind === "formula-inline" || editTarget?.kind === "formula-block") {
      const isBlockTarget = editTarget.kind === "formula-block";
      const cursorPosition = Math.min(editTarget.position + (isBlockTarget ? 2 : 1), editor.state.doc.content.size);
      didRun = editor
        .chain()
        .focus()
        .setNodeSelection(editTarget.position)
        .updateAttributes(isBlockTarget ? "formulaBlock" : "formulaInline", { latex })
        .setTextSelection(cursorPosition)
        .run();
    } else {
      const chain = restoreInsertionSelection();
      didRun = block ? chain?.insertFormulaBlock({ latex }).run() ?? false : chain?.insertFormulaInline({ latex }).run() ?? false;
    }
    if (didRun) {
      onClose();
    } else {
      setInsertError("Не удалось вставить формулу. Поставьте курсор в текст и повторите.");
    }
  }

  function preserveEditorSelection(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function insertCalloutVariant(variant: CalloutVariant) {
    if (!editor) {
      return;
    }
    editor.chain().focus().insertCallout({ variant }).run();
    onClose();
  }

  return (
    <div className="block-insert-menu" ref={menuRef} role="dialog">
      <div className="block-menu-head">
        <div>
          <b>Вставить сложный блок</b>
          <span>Заголовки, списки, цитата и код форматируются верхней панелью.</span>
        </div>
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
        <button className="block-menu-item" onClick={() => void insertImage()} type="button">
          <Icon name="image" />
          <span>
            <b>Изображение</b>
            <small>Сохраняется локально во вложениях заметки</small>
          </span>
        </button>
        <button className="block-menu-item" onClick={() => void insertFile()} type="button">
          <Icon name="attach" />
          <span>
            <b>Файл</b>
            <small>Открывается из локального хранилища NoteFlow</small>
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

      {!editTarget || editTarget.kind === "date" ? (
        <div className="block-menu-inline">
          <label>
            Дата
            <input onChange={(event) => setDateDraft(event.currentTarget.value)} type="date" value={dateDraft} />
          </label>
          <button className="secondary-btn" disabled={!dateDraft.trim()} onClick={insertDate} onMouseDown={preserveEditorSelection} type="button">
            {editTarget?.kind === "date" ? "Сохранить дату" : "Вставить дату"}
          </button>
        </div>
      ) : null}

      {!editTarget || editTarget.kind !== "date" ? (
        <div className="block-menu-inline">
          <label>
            Формула
            <input
              aria-label="Выражение формулы"
              onChange={(event) => setFormulaDraft(event.currentTarget.value)}
              placeholder="Например: a^2 + b^2 = c^2"
              value={formulaDraft}
            />
          </label>
          {editTarget ? (
            <button className="secondary-btn" disabled={!formulaDraft.trim()} onClick={() => insertFormula(editTarget.kind === "formula-block")} onMouseDown={preserveEditorSelection} type="button">
              Сохранить формулу
            </button>
          ) : (
            <>
              <button className="secondary-btn" disabled={!formulaDraft.trim()} onClick={() => insertFormula(false)} onMouseDown={preserveEditorSelection} type="button">
                В строке
              </button>
              <button className="secondary-btn" disabled={!formulaDraft.trim()} onClick={() => insertFormula(true)} onMouseDown={preserveEditorSelection} type="button">
                Отдельным блоком
              </button>
            </>
          )}
        </div>
      ) : null}

      {insertError ? <div aria-live="polite" className="block-menu-error">{insertError}</div> : null}

    </div>
  );
}
