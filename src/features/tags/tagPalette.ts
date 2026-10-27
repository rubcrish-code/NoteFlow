import type { TagColor, TagRow } from "../../app/types";
import type { CSSProperties } from "react";

export interface TagPaletteItem {
  color: TagColor;
  hex: string;
  id: string;
  label: string;
}

export const TAG_COLOR_PALETTE: readonly TagPaletteItem[] = [
  { id: "blue", color: "blue", hex: "#3B6EF2", label: "Синий" },
  { id: "sky", color: "blue", hex: "#0284C7", label: "Голубой" },
  { id: "teal", color: "green", hex: "#0B8E82", label: "Бирюзовый" },
  { id: "green", color: "green", hex: "#188F56", label: "Зелёный" },
  { id: "red", color: "pink", hex: "#C83F45", label: "Красный" },
  { id: "amber", color: "amber", hex: "#A97B0E", label: "Янтарный" },
  { id: "orange", color: "amber", hex: "#D15C15", label: "Оранжевый" },
  { id: "rose", color: "pink", hex: "#D13C91", label: "Розовый" },
  { id: "violet", color: "purple", hex: "#7C5CF0", label: "Фиолетовый" },
  { id: "slate", color: "blue", hex: "#64748B", label: "Графитовый" },
];

export const DEFAULT_TAG_PALETTE_ITEM = TAG_COLOR_PALETTE[0];
const legacyColors: Record<TagColor, string> = { blue: "#3B6EF2", green: "#1EA463", purple: "#7C5CF0", amber: "#D98A14", pink: "#E05272" };

export function getTagDisplayColor(tag: Pick<TagRow, "color" | "customColor">) {
  return tag.customColor && /^#[\da-f]{6}$/i.test(tag.customColor) ? tag.customColor : legacyColors[tag.color];
}

export function tagColorStyle(tag: Pick<TagRow, "color" | "customColor">): CSSProperties {
  return { "--tag-color": getTagDisplayColor(tag) } as CSSProperties;
}

export function findTagPaletteItem(tag: Pick<TagRow, "color" | "customColor">) {
  const hex = getTagDisplayColor(tag);
  return TAG_COLOR_PALETTE.find((item) => item.hex.toUpperCase() === hex.toUpperCase())
    ?? { id: "current", color: tag.color, hex, label: "Текущий цвет" };
}
