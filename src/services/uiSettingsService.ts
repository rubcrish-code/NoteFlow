import { invoke } from "@tauri-apps/api/core";
import type { AppLanguage, AppSection, ThemeMode } from "../app/types";
import { normalizeAppZoom } from "../shared/appZoom";

export interface UiSettings {
  appZoomPercent: number;
  chatWidth: number;
  language: AppLanguage;
  lastSection: AppSection;
  listWidth: number;
  ragConversationWidth: number;
  ragSourcesCollapsed: boolean;
  ragSourcesWidth: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  theme: ThemeMode;
}

type UiSettingsDto = UiSettings;

const themeModes: readonly ThemeMode[] = ["light", "dark", "system"];
const appSections: readonly AppSection[] = ["notes", "projects", "rag", "tags", "archive", "settings"];
const appLanguages: readonly AppLanguage[] = ["ru", "en"];

export const DEFAULT_UI_SETTINGS: UiSettings = {
  appZoomPercent: 100,
  chatWidth: 380,
  language: "ru",
  lastSection: "notes",
  listWidth: 376,
  ragConversationWidth: 280,
  ragSourcesCollapsed: false,
  ragSourcesWidth: 320,
  sidebarCollapsed: false,
  sidebarWidth: 250,
  theme: "light",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeChoice<T extends string>(value: string, allowedValues: readonly T[], fallback: T): T {
  return allowedValues.includes(value as T) ? (value as T) : fallback;
}

export function normalizeUiSettings(settings: UiSettings): UiSettings {
  return {
    appZoomPercent: normalizeAppZoom(settings.appZoomPercent),
    chatWidth: clamp(settings.chatWidth, 300, 620),
    language: normalizeChoice(settings.language, appLanguages, DEFAULT_UI_SETTINGS.language),
    lastSection: normalizeChoice(settings.lastSection, appSections, DEFAULT_UI_SETTINGS.lastSection),
    listWidth: clamp(settings.listWidth, 260, 560),
    ragConversationWidth: clamp(settings.ragConversationWidth, 220, 380),
    ragSourcesCollapsed: settings.ragSourcesCollapsed,
    ragSourcesWidth: clamp(settings.ragSourcesWidth, 260, 460),
    sidebarCollapsed: settings.sidebarCollapsed,
    sidebarWidth: clamp(settings.sidebarWidth, 190, 360),
    theme: normalizeChoice(settings.theme, themeModes, DEFAULT_UI_SETTINGS.theme),
  };
}

export async function getUiSettings() {
  return normalizeUiSettings(await invoke<UiSettingsDto>("get_ui_settings"));
}

export async function updateUiSettings(settings: UiSettings) {
  return normalizeUiSettings(
    await invoke<UiSettingsDto>("update_ui_settings", {
      request: normalizeUiSettings(settings),
    }),
  );
}
