export type SettingsLayoutMode = "compact" | "narrow" | "wide";

export const SETTINGS_COMPACT_BREAKPOINT = 920;
export const SETTINGS_NARROW_BREAKPOINT = 620;

export function getSettingsLayoutMode(containerWidth: number): SettingsLayoutMode {
  if (containerWidth <= SETTINGS_NARROW_BREAKPOINT) {
    return "narrow";
  }
  return containerWidth <= SETTINGS_COMPACT_BREAKPOINT ? "compact" : "wide";
}
