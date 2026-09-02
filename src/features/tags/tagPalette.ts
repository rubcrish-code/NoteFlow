import type { TagColor, TagRow } from "../../app/types";

export interface TagPaletteItem {
  color: TagColor;
  hex: string;
  id: string;
  label: string;
}

export const TAG_COLOR_PALETTE: readonly TagPaletteItem[] = [
  { id: "blue", color: "blue", hex: "#3B6EF2", label: "Синий" },
  { id: "sky", color: "blue", hex: "#0EA5E9", label: "Небесный" },
  { id: "teal", color: "green", hex: "#0F9F8F", label: "Бирюзовый" },
  { id: "green", color: "green", hex: "#1EA463", label: "Зелёный" },
  { id: "lime", color: "green", hex: "#65A30D", label: "Лаймовый" },
  { id: "amber", color: "amber", hex: "#D98A14", label: "Янтарный" },
  { id: "orange", color: "amber", hex: "#EA6A18", label: "Оранжевый" },
  { id: "rose", color: "pink", hex: "#E05272", label: "Розовый" },
  { id: "violet", color: "purple", hex: "#7C5CF0", label: "Фиолетовый" },
  { id: "slate", color: "blue", hex: "#64748B", label: "Графитовый" },
];

export const DEFAULT_TAG_PALETTE_ITEM = TAG_COLOR_PALETTE[0];

export function getTagDisplayColor(tag: Pick<TagRow, "color" | "customColor">) {
  return tag.customColor ?? TAG_COLOR_PALETTE.find((item) => item.color === tag.color)?.hex ?? DEFAULT_TAG_PALETTE_ITEM.hex;
}

export function findTagPaletteItem(tag: Pick<TagRow, "color" | "customColor">) {
  const customColor = tag.customColor?.toUpperCase();
  return TAG_COLOR_PALETTE.find((item) => item.hex.toUpperCase() === customColor)
    ?? TAG_COLOR_PALETTE.find((item) => item.color === tag.color)
    ?? DEFAULT_TAG_PALETTE_ITEM;
}
