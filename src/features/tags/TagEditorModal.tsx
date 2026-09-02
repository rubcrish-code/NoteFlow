import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { TagColor, TagRow } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { ModalShell } from "../../shared/ModalShell";
import { DEFAULT_TAG_PALETTE_ITEM, findTagPaletteItem, TAG_COLOR_PALETTE } from "./tagPalette";
import { normalizeTagName, TAG_NAME_MAX_LENGTH, validateTagName } from "./tagEditor";

export interface TagEditorValue {
  color: TagColor;
  customColor: string;
  name: string;
}

interface TagEditorModalProps {
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (value: TagEditorValue) => Promise<void>;
  open: boolean;
  tag?: TagRow;
  tags: TagRow[];
}

export function TagEditorModal({ mode, onClose, onSubmit, open, tag, tags }: TagEditorModalProps) {
  const initialPaletteItem = useMemo(() => tag ? findTagPaletteItem(tag) : DEFAULT_TAG_PALETTE_ITEM, [tag]);
  const [draftName, setDraftName] = useState(tag?.name ?? "");
  const [selectedColorId, setSelectedColorId] = useState(initialPaletteItem.id);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraftName(tag?.name ?? "");
    setSelectedColorId(initialPaletteItem.id);
    setError("");
    setIsSaving(false);
    const frame = window.requestAnimationFrame(() => inputRef.current?.select());
    return () => window.cancelAnimationFrame(frame);
  }, [initialPaletteItem.id, open, tag?.name]);

  const selectedColor = TAG_COLOR_PALETTE.find((item) => item.id === selectedColorId) ?? DEFAULT_TAG_PALETTE_ITEM;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const validationError = validateTagName(tags, tag?.id, draftName);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        color: selectedColor.color,
        customColor: selectedColor.hex,
        name: normalizeTagName(draftName),
      });
      onClose();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError);
      setError(message.includes("существует") ? "Тег с таким названием уже существует" : "Не удалось сохранить тег. Попробуйте ещё раз.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell
      backdropClassName="modal-backdrop"
      className="tag-editor-dialog"
      closeDisabled={isSaving}
      description={mode === "create" ? "Название и цвет помогут быстро находить связанные заметки." : "Изменения применятся ко всем заметкам с этим тегом."}
      footer={(
        <div className="new-note-actions">
          <button className="secondary-btn" disabled={isSaving} onClick={onClose} type="button">Отмена</button>
          <button className="primary-btn" disabled={isSaving} form="tag-editor-form" type="submit">
            {isSaving ? "Сохраняем…" : mode === "create" ? "Создать тег" : "Сохранить"}
          </button>
        </div>
      )}
      initialFocusRef={inputRef}
      onClose={onClose}
      open={open}
      size="compact"
      title={mode === "create" ? "Новый тег" : "Редактировать тег"}
      titleId="tag-editor-title"
    >
      <form className="tag-editor-form" id="tag-editor-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field">
          Название
          <input
            aria-invalid={Boolean(error)}
            maxLength={TAG_NAME_MAX_LENGTH}
            onChange={(event) => {
              setDraftName(event.currentTarget.value);
              setError("");
            }}
            ref={inputRef}
            value={draftName}
          />
        </label>
        <fieldset className="tag-editor-colors">
          <legend>Цвет</legend>
          <div aria-label="Цвет тега" className="tag-editor-palette" role="radiogroup">
            {TAG_COLOR_PALETTE.map((item) => {
              const selected = item.id === selectedColor.id;
              return (
                <button
                  aria-checked={selected}
                  aria-label={item.label}
                  className={selected ? "selected" : ""}
                  data-tooltip={item.label}
                  key={item.id}
                  onClick={() => {
                    setSelectedColorId(item.id);
                    setError("");
                  }}
                  role="radio"
                  style={{ "--tag-swatch-color": item.hex } as CSSProperties}
                  type="button"
                >
                  {selected ? <Icon name="check" /> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
        {error ? <div className="field-error" role="alert">{error}</div> : null}
      </form>
    </ModalShell>
  );
}
