import { useEffect, useRef, useState } from "react";
import type { TagColor } from "../../app/types";

export const tagColorPalette: Array<{ color: TagColor; hex: string; label: string }> = [
  { color: "blue", hex: "#3B6EF2", label: "Синий" },
  { color: "purple", hex: "#7C5CF0", label: "Фиолетовый" },
  { color: "green", hex: "#1EA463", label: "Зелёный" },
  { color: "amber", hex: "#D98A14", label: "Янтарный" },
  { color: "pink", hex: "#E0529A", label: "Розовый" },
];

interface PopoverPosition {
  left: number;
  top: number;
}

interface TagColorPopoverProps {
  currentHex: string;
  onApply: (hex: string) => void;
  onCancel: () => void;
  position: PopoverPosition;
  tagName: string;
}

export function normalizeHex(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  return trimmedValue.startsWith("#") ? trimmedValue.toUpperCase() : `#${trimmedValue.toUpperCase()}`;
}

export function isValidHexColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(normalizeHex(value));
}

export function TagColorPopover({ currentHex, onApply, onCancel, position, tagName }: TagColorPopoverProps) {
  const [draftHex, setDraftHex] = useState(normalizeHex(currentHex));
  const popoverRef = useRef<HTMLDivElement>(null);
  const normalizedDraft = normalizeHex(draftHex);
  const isValid = isValidHexColor(normalizedDraft);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && popoverRef.current && !popoverRef.current.contains(target)) {
        onCancel();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onCancel]);

  return (
    <div className="tag-color-popover" ref={popoverRef} role="dialog" style={{ left: position.left, top: position.top }}>
      <div className="tag-color-head">
        <div>
          <b>Цвет тега</b>
          <span>{tagName}</span>
        </div>
        <div className="tag-color-preview" style={{ backgroundColor: isValid ? normalizedDraft : currentHex }} />
      </div>

      <div className="tag-color-palette" aria-label="Палитра цветов">
        {tagColorPalette.map((item) => (
          <button
            aria-label={item.label}
            className={normalizeHex(item.hex) === normalizedDraft ? "active" : ""}
            key={item.color}
            onClick={() => setDraftHex(item.hex)}
            style={{ backgroundColor: item.hex }}
            type="button"
          />
        ))}
      </div>

      <label className="tag-color-input">
        HEX
        <input aria-invalid={!isValid} onChange={(event) => setDraftHex(event.currentTarget.value)} placeholder="#3B6EF2" value={draftHex} />
      </label>
      {!isValid ? <div className="tag-color-error">Введите цвет в формате #RRGGBB</div> : null}

      <div className="tag-color-actions">
        <button className="secondary-btn" onClick={onCancel} type="button">
          Отмена
        </button>
        <button className="primary-btn" disabled={!isValid} onClick={() => onApply(normalizedDraft)} type="button">
          Применить
        </button>
      </div>
    </div>
  );
}
