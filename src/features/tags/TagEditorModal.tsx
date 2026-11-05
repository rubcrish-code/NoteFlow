import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { TagColor, TagRow } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { ModalShell } from "../../shared/ModalShell";
import { DEFAULT_TAG_PALETTE_ITEM, findTagPaletteItem, TAG_COLOR_PALETTE } from "./tagPalette";
import { normalizeTagName, validateTagName } from "./tagEditor";
import { EntityNameCounter } from "../../shared/EntityNameCounter";

export interface TagEditorValue {
  color: TagColor;
  customColor?: string;
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
  useInterfaceLanguage();
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

  const palette = initialPaletteItem.id === "current" ? [initialPaletteItem, ...TAG_COLOR_PALETTE] : TAG_COLOR_PALETTE;
  const selectedColor = palette.find((item) => item.id === selectedColorId) ?? initialPaletteItem;
  const validationError = validateTagName(tags, tag?.id, draftName);
  const visibleError = error || (draftName.trim() ? validationError : "");

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
        color: tag && selectedColor.id === initialPaletteItem.id ? tag.color : selectedColor.color,
        customColor: tag && selectedColor.id === initialPaletteItem.id ? tag.customColor : selectedColor.hex,
        name: draftName === tag?.name ? draftName : normalizeTagName(draftName),
      });
      onClose();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError);
      setError(message.includes("существует") ? translate("ui.e1c7d27e2582") : translate("ui.ab436ee04db5"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell
      backdropClassName="modal-backdrop"
      className="tag-editor-dialog"
      closeDisabled={isSaving}
      description={mode === "create" ? translate("ui.287280941c16") : translate("ui.58fcf6d444e1")}
      footer={(
        <div className="new-note-actions">
          <button className="secondary-btn" disabled={isSaving} onClick={onClose} type="button">{translate("ui.8fbe9b75cbdf")}</button>
          <button className="primary-btn" disabled={isSaving || Boolean(validationError)} form="tag-editor-form" type="submit">
            {isSaving ? translate("ui.9c27c381dd8b") : mode === "create" ? translate("ui.cddfa0cf8597") : translate("ui.b4d30cae5289")}
          </button>
        </div>
      )}
      initialFocusRef={inputRef}
      onClose={onClose}
      open={open}
      size="compact"
      title={mode === "create" ? translate("ui.764e4b9bd472") : translate("ui.f9ffa8578a42")}
      titleId="tag-editor-title"
    >
      <form className="tag-editor-form" id="tag-editor-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="field">
          <label htmlFor="tag-editor-name">{translate("ui.0918b4ba9268")}</label>
          <input
            id="tag-editor-name"
            aria-describedby="tag-editor-feedback"
            aria-invalid={Boolean(visibleError)}
            disabled={isSaving}
            onChange={(event) => {
              setDraftName(event.currentTarget.value);
              setError("");
            }}
            ref={inputRef}
            value={draftName}
          />
          <EntityNameCounter id="tag-editor-feedback" value={draftName} error={visibleError} legacy={draftName === tag?.name} />
        </div>
        <fieldset className="tag-editor-colors">
          <legend>{translate("ui.92ab62ad6f3c")}</legend>
          <div aria-label={translate("ui.5e834ad6e28b")} className="tag-editor-palette" role="radiogroup">
            {palette.map((item) => {
              const selected = item.id === selectedColor.id;
              return (
                <button
                  aria-checked={selected}
                  aria-label={item.label}
                  className={selected ? "selected" : ""}
                  data-tooltip={item.label}
                  disabled={isSaving}
                  key={item.id}
                  onClick={() => {
                    setSelectedColorId(item.id);
                  }}
                  role="radio"
                  style={{ "--tag-swatch-light-color": item.hex, "--tag-swatch-text": item.foreground,
                    "--tag-swatch-dark-color": item.darkBackground, "--tag-swatch-dark-text": item.darkForeground } as CSSProperties}
                  type="button"
                >
                  {selected ? <Icon name="check" /> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>
    </ModalShell>
  );
}
