import { invoke } from "./safeInvoke";
import type { AppLanguage, AppSection, ThemeMode } from "../app/types";
import { normalizeAppZoom } from "../shared/appZoom";
import { EDITOR_CONTENT_DEFAULT_OFFSET, EDITOR_CONTENT_DEFAULT_WIDTH, clampEditorContentOffset, clampEditorContentWidth } from "../shared/editorPageLayout";
import { DEFAULT_LOCAL_PROFILE_NAME, normalizeLocalProfileName } from "../shared/localProfile";

export interface UiSettings {
  appZoomPercent: number;
  chatWidth: number;
  editorContentOffset: number;
  editorContentWidth: number;
  language: AppLanguage;
  lastSection: AppSection;
  listWidth: number;
  localProfileName: string;
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
  editorContentOffset: EDITOR_CONTENT_DEFAULT_OFFSET,
  editorContentWidth: EDITOR_CONTENT_DEFAULT_WIDTH,
  language: "ru",
  lastSection: "notes",
  listWidth: 376,
  localProfileName: DEFAULT_LOCAL_PROFILE_NAME,
  ragConversationWidth: 280,
  ragSourcesCollapsed: false,
  ragSourcesWidth: 320,
  sidebarCollapsed: false,
  sidebarWidth: 250,
  theme: "light",
};

function finiteOrFallback(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  return Math.round(clamp(finiteOrFallback(value, fallback), min, max));
}

function normalizeChoice<T extends string>(value: string, allowedValues: readonly T[], fallback: T): T {
  return allowedValues.includes(value as T) ? (value as T) : fallback;
}

export function normalizeUiSettings(settings: UiSettings): UiSettings {
  return {
    appZoomPercent: normalizeAppZoom(settings.appZoomPercent),
    chatWidth: clampInteger(settings.chatWidth, 300, 620, DEFAULT_UI_SETTINGS.chatWidth),
    editorContentOffset: clampEditorContentOffset(settings.editorContentOffset),
    editorContentWidth: clampEditorContentWidth(settings.editorContentWidth),
    language: normalizeChoice(settings.language, appLanguages, DEFAULT_UI_SETTINGS.language),
    lastSection: normalizeChoice(settings.lastSection, appSections, DEFAULT_UI_SETTINGS.lastSection),
    listWidth: clampInteger(settings.listWidth, 260, 560, DEFAULT_UI_SETTINGS.listWidth),
    localProfileName: normalizeLocalProfileName(settings.localProfileName) || DEFAULT_LOCAL_PROFILE_NAME,
    ragConversationWidth: clampInteger(settings.ragConversationWidth, 220, 380, DEFAULT_UI_SETTINGS.ragConversationWidth),
    ragSourcesCollapsed: settings.ragSourcesCollapsed,
    ragSourcesWidth: clampInteger(settings.ragSourcesWidth, 260, 460, DEFAULT_UI_SETTINGS.ragSourcesWidth),
    sidebarCollapsed: settings.sidebarCollapsed,
    sidebarWidth: clampInteger(settings.sidebarWidth, 190, 360, DEFAULT_UI_SETTINGS.sidebarWidth),
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
