import { translate } from "../../shared/i18n";
import type { TagColor, TagRow } from "../../app/types";
import type { CSSProperties } from "react";

export interface TagPaletteItem {
  color: TagColor;
  hex: string;
  foreground: string;
  darkBackground: string;
  darkForeground: string;
  id: string;
  label: string;
}

export const TAG_COLOR_PALETTE: readonly TagPaletteItem[] = [
  { id: "blue", color: "blue", hex: "#60A5FA", foreground: "#153E85", darkBackground: "#253F68", darkForeground: "#93C5FD", get label() { return translate("ui.66d12fb99282"); } },
  { id: "red", color: "pink", hex: "#F87171", foreground: "#5C1111", darkBackground: "#5F282C", darkForeground: "#FCA5A5", get label() { return translate("ui.21b4d916f326"); } },
  { id: "orange", color: "amber", hex: "#FDBA74", foreground: "#71330B", darkBackground: "#5E3B23", darkForeground: "#FED7AA", get label() { return translate("ui.b381c35c9f19"); } },
  { id: "yellow", color: "amber", hex: "#FDE68A", foreground: "#71500A", darkBackground: "#51441D", darkForeground: "#FDE68A", get label() { return translate("ui.faf8c4a14f74"); } },
  { id: "lime", color: "green", hex: "#D9F99D", foreground: "#405E10", darkBackground: "#3A4C21", darkForeground: "#D9F99D", get label() { return translate("ui.5c1ee3d309cf"); } },
  { id: "green", color: "green", hex: "#86EFAC", foreground: "#166534", darkBackground: "#214E35", darkForeground: "#86EFAC", get label() { return translate("ui.a4bb19e1436f"); } },
  { id: "teal", color: "green", hex: "#5EEAD4", foreground: "#115E59", darkBackground: "#1B4D48", darkForeground: "#5EEAD4", get label() { return translate("ui.1174a37a5ab4"); } },
  { id: "violet", color: "purple", hex: "#A78BFA", foreground: "#4C1D95", darkBackground: "#453266", darkForeground: "#C4B5FD", get label() { return translate("ui.4aed2cd288de"); } },
  { id: "fuchsia", color: "purple", hex: "#E879F9", foreground: "#701A75", darkBackground: "#542D5C", darkForeground: "#F0ABFC", get label() { return translate("ui.96a53fec3e50"); } },
  { id: "pink", color: "pink", hex: "#F472B6", foreground: "#831843", darkBackground: "#592A43", darkForeground: "#F9A8D4", get label() { return translate("ui.6b64572a4b37"); } },
];

export const DEFAULT_TAG_PALETTE_ITEM = TAG_COLOR_PALETTE[0];
const legacyColors: Record<TagColor, string> = { blue: "#3B6EF2", green: "#1EA463", purple: "#7C5CF0", amber: "#D98A14", pink: "#E05272" };
// Resolve historical swatches by family, never by their position in the palette.
// Unrelated custom colours (including historical graphite) remain custom.
const legacyPaletteIds: Readonly<Record<string, string>> = {
  "#3B6EF2": "blue", "#2563EB": "blue", "#3B82F6": "blue",
  "#0EA5E9": "blue", "#0284C7": "blue", "#0095DD": "blue",
  "#0F9F8F": "teal", "#0B8E82": "teal", "#009688": "teal",
  "#1EA463": "green", "#188F56": "green", "#16A34A": "green",
  "#65A30D": "lime", "#C83F45": "red", "#E53935": "red",
  "#D98A14": "yellow", "#A97B0E": "yellow", "#B77900": "yellow",
  "#EA6A18": "orange", "#D15C15": "orange", "#EA580C": "orange",
  "#E05272": "pink", "#E0529A": "pink", "#D13C91": "pink", "#EC4899": "pink",
  "#7C5CF0": "violet", "#7C3AED": "violet", "#B520C9": "fuchsia",
};

function storedTagColor(tag: Pick<TagRow, "color" | "customColor">) {
  return tag.customColor && /^#[\da-f]{6}$/i.test(tag.customColor) ? tag.customColor : legacyColors[tag.color];
}

function paletteItemForColor(color: string) {
  const hex = color.toUpperCase();
  return TAG_COLOR_PALETTE.find(item => item.hex === hex || item.id === legacyPaletteIds[hex]);
}

export function getTagDisplayColor(tag: Pick<TagRow, "color" | "customColor">) {
  const color = storedTagColor(tag);
  return paletteItemForColor(color)?.hex ?? color;
}

function mixColor(first: string, second: string, amount: number) {
  return "#" + [1, 3, 5].map(offset => Math.round(Number.parseInt(first.slice(offset, offset + 2), 16) * (1 - amount)
    + Number.parseInt(second.slice(offset, offset + 2), 16) * amount).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function luminance(color: string) {
  const channels = [1, 3, 5].map(offset => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function getTagChipColors(tag: Pick<TagRow, "color" | "customColor">, dark = false) {
  const color = getTagDisplayColor(tag);
  const item = paletteItemForColor(color);
  if (item) return { background: dark ? item.darkBackground : item.hex, foreground: dark ? item.darkForeground : item.foreground };
  const background = mixColor(color, dark ? "#191C23" : "#FFFFFF", dark ? .66 : .76);
  const target = dark ? "#FFFFFF" : "#000000";
  let foreground = mixColor(color, target, dark ? .54 : .24);
  const contrast = () => (Math.max(luminance(background), luminance(foreground)) + .05) / (Math.min(luminance(background), luminance(foreground)) + .05);
  // Also protect legacy/custom colours, without changing the persisted identity.
  for (let step = 0; contrast() < 4.5 && step < 20; step++) foreground = mixColor(foreground, target, .15);
  return { background, foreground };
}

export function tagColorStyle(tag: Pick<TagRow, "color" | "customColor">): CSSProperties {
  const light = getTagChipColors(tag), dark = getTagChipColors(tag, true);
  return { "--tag-color": getTagDisplayColor(tag), "--tag-background": light.background, "--tag-foreground": light.foreground,
    "--tag-dark-background": dark.background, "--tag-dark-foreground": dark.foreground } as CSSProperties;
}

export function findTagPaletteItem(tag: Pick<TagRow, "color" | "customColor">) {
  const hex = getTagDisplayColor(tag);
  const light = getTagChipColors(tag), dark = getTagChipColors(tag, true);
  return paletteItemForColor(hex)
    ?? { id: "current", color: tag.color, hex, foreground: light.foreground, darkBackground: dark.background, darkForeground: dark.foreground, label: translate("ui.144e27726246") };
}
