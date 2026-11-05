import { translate } from "../../shared/i18n";
export interface FontFamilyOption {
  label: string;
  preview: string;
  value: string;
}

export const fontFamilyOptions: FontFamilyOption[] = [
  { get label() { return translate("ui.bb86915009ae"); }, preview: "-apple-system, BlinkMacSystemFont, \"Inter\", \"Segoe UI\", sans-serif", value: "" },
  { label: "Arial", preview: "Arial, sans-serif", value: "Arial, sans-serif" },
  { label: "Georgia", preview: "Georgia, serif", value: "Georgia, serif" },
  { label: "Times New Roman", preview: "\"Times New Roman\", Times, serif", value: "\"Times New Roman\", Times, serif" },
  { label: "Verdana", preview: "Verdana, sans-serif", value: "Verdana, sans-serif" },
  { label: "Courier New", preview: "\"Courier New\", Courier, monospace", value: "\"Courier New\", Courier, monospace" },
];

export const fontSizeOptions = ["12", "14", "16", "18", "20", "24", "28", "32", "36"] as const;

export type FontSizeOption = (typeof fontSizeOptions)[number];

export function formatFontSize(fontSize: string) {
  return fontSize.replace(/px$/i, "");
}

export function findFontFamilyValue(fontFamily: string) {
  return fontFamilyOptions.find((option) => option.value === fontFamily)?.value ?? "";
}

export function getFontFamilyLabel(fontFamily: string) {
  return fontFamilyOptions.find((option) => option.value === fontFamily)?.label ?? translate("ui.bb86915009ae");
}

export function normalizeFontSizeValue(fontSize: string) {
  const size = formatFontSize(fontSize).trim();
  return /^\d+$/.test(size) ? `${size}px` : "";
}
