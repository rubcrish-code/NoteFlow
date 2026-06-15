import { useEffect, useRef, useState } from "react";
import type { TagColor } from "../../app/types";

interface TagColorPaletteItem {
  color: TagColor;
  hex: string;
  id: string;
  label: string;
}

export const tagColorPalette: TagColorPaletteItem[] = [
  { id: "blue-500", color: "blue", hex: "#3B6EF2", label: "Синий" },
  { id: "sky-500", color: "blue", hex: "#0EA5E9", label: "Небесный" },
  { id: "cyan-500", color: "blue", hex: "#06B6D4", label: "Циан" },
  { id: "indigo-500", color: "blue", hex: "#4F46E5", label: "Индиго" },
  { id: "violet-500", color: "purple", hex: "#7C5CF0", label: "Фиолетовый" },
  { id: "purple-500", color: "purple", hex: "#A855F7", label: "Пурпурный" },
  { id: "fuchsia-500", color: "purple", hex: "#D946EF", label: "Фуксия" },
  { id: "grape-500", color: "purple", hex: "#8B5CF6", label: "Виноградный" },
  { id: "green-500", color: "green", hex: "#1EA463", label: "Зелёный" },
  { id: "emerald-500", color: "green", hex: "#10B981", label: "Изумрудный" },
  { id: "teal-500", color: "green", hex: "#14B8A6", label: "Бирюзовый" },
  { id: "lime-600", color: "green", hex: "#65A30D", label: "Лайм" },
  { id: "amber-500", color: "amber", hex: "#D98A14", label: "Янтарный" },
  { id: "yellow-500", color: "amber", hex: "#EAB308", label: "Жёлтый" },
  { id: "orange-500", color: "amber", hex: "#F97316", label: "Оранжевый" },
  { id: "gold-500", color: "amber", hex: "#CA8A04", label: "Золотой" },
  { id: "pink-500", color: "pink", hex: "#E0529A", label: "Розовый" },
  { id: "rose-500", color: "pink", hex: "#F43F5E", label: "Роза" },
  { id: "red-500", color: "pink", hex: "#EF4444", label: "Красный" },
  { id: "coral-500", color: "pink", hex: "#F0625D", label: "Коралловый" },
  { id: "slate-500", color: "blue", hex: "#64748B", label: "Сланцевый" },
  { id: "zinc-500", color: "blue", hex: "#71717A", label: "Графитовый" },
  { id: "stone-500", color: "amber", hex: "#78716C", label: "Каменный" },
  { id: "neutral-800", color: "purple", hex: "#27272A", label: "Тёмный" },
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

function hexToRgb(hex: string) {
  const normalizedHex = normalizeHex(hex);
  if (!isValidHexColor(normalizedHex)) {
    return null;
  }
  return {
    b: Number.parseInt(normalizedHex.slice(5, 7), 16),
    g: Number.parseInt(normalizedHex.slice(3, 5), 16),
    r: Number.parseInt(normalizedHex.slice(1, 3), 16),
  };
}

function getRelativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return 0;
  }

  function convert(channel: number) {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  return 0.2126 * convert(rgb.r) + 0.7152 * convert(rgb.g) + 0.0722 * convert(rgb.b);
}

function getContrastRatio(firstHex: string, secondHex: string) {
  const first = getRelativeLuminance(firstHex);
  const second = getRelativeLuminance(secondHex);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function formatContrast(hex: string) {
  const lightRatio = getContrastRatio(hex, "#FFFFFF");
  const darkRatio = getContrastRatio(hex, "#111318");
  const bestText = lightRatio > darkRatio ? "тёмной теме" : "светлой теме";
  return `Контраст: ${lightRatio.toFixed(1)}:1 / ${darkRatio.toFixed(1)}:1, лучше на ${bestText}`;
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
            key={item.id}
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
      {isValid ? <div className="tag-color-contrast">{formatContrast(normalizedDraft)}</div> : null}

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
