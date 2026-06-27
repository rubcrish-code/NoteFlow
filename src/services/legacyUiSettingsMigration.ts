import type { AppLanguage, AppSection, ThemeMode } from "../app/types";
import { normalizeAppZoom } from "../shared/appZoom";
import { normalizeUiSettings, type UiSettings } from "./uiSettingsService";

interface LegacyStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
}

interface LegacyReadResult<T> {
  found: boolean;
  value: T | null;
}

interface LegacyMigrationResult {
  migrated: boolean;
  settings: UiSettings;
}

const legacyUiSettingKeys = [
  "noteflow.theme",
  "noteflow.appZoom",
  "noteflow.zoom",
  "noteflow.sidebarWidth",
  "noteflow.listWidth",
  "noteflow.noteListWidth",
  "noteflow.chatWidth",
  "noteflow.sidebarCollapsed",
  "noteflow.ragConversationWidth",
  "noteflow.ragSourcesWidth",
  "noteflow.ragSourcesPanelCollapsed",
  "noteflow.ragSourcesCollapsed",
  "noteflow.lastSection",
  "noteflow.language",
] as const;

const themeModes: readonly ThemeMode[] = ["light", "dark", "system"];
const appSections: readonly AppSection[] = ["notes", "projects", "rag", "tags", "archive", "settings"];
const appLanguages: readonly AppLanguage[] = ["ru", "en"];

function getLegacyStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function readFirstNumber(storage: LegacyStorage, keys: readonly string[], min: number, max: number): LegacyReadResult<number> {
  let found = false;
  for (const key of keys) {
    const storedValue = storage.getItem(key);
    if (storedValue === null) {
      continue;
    }

    found = true;
    const parsedValue = Number(storedValue);
    if (Number.isFinite(parsedValue)) {
      return {
        found,
        value: Math.min(max, Math.max(min, parsedValue)),
      };
    }
  }

  return { found, value: null };
}

function readFirstBoolean(storage: LegacyStorage, keys: readonly string[]): LegacyReadResult<boolean> {
  let found = false;
  for (const key of keys) {
    const storedValue = storage.getItem(key);
    if (storedValue === null) {
      continue;
    }

    found = true;
    if (storedValue === "true") {
      return { found, value: true };
    }
    if (storedValue === "false") {
      return { found, value: false };
    }
  }

  return { found, value: null };
}

function readFirstChoice<T extends string>(storage: LegacyStorage, keys: readonly string[], allowedValues: readonly T[]): LegacyReadResult<T> {
  let found = false;
  for (const key of keys) {
    const storedValue = storage.getItem(key);
    if (storedValue === null) {
      continue;
    }

    found = true;
    const matchedValue = allowedValues.find((allowedValue) => allowedValue === storedValue);
    if (matchedValue) {
      return { found, value: matchedValue };
    }
  }

  return { found, value: null };
}

function applyLegacyValue<T>(result: LegacyReadResult<T>, apply: (value: T) => void) {
  if (result.value !== null) {
    apply(result.value);
  }
  return result.found;
}

export function migrateLegacyUiSettings(currentSettings: UiSettings, storage: LegacyStorage | null = getLegacyStorage()): LegacyMigrationResult {
  if (!storage) {
    return {
      migrated: false,
      settings: currentSettings,
    };
  }

  let migrated = false;
  const nextSettings: UiSettings = { ...currentSettings };

  migrated = applyLegacyValue(readFirstChoice(storage, ["noteflow.theme"], themeModes), (theme) => {
    nextSettings.theme = theme;
  }) || migrated;

  migrated = applyLegacyValue(readFirstNumber(storage, ["noteflow.appZoom", "noteflow.zoom"], 80, 160), (appZoomPercent) => {
    nextSettings.appZoomPercent = normalizeAppZoom(appZoomPercent);
  }) || migrated;

  migrated = applyLegacyValue(readFirstNumber(storage, ["noteflow.sidebarWidth"], 190, 360), (sidebarWidth) => {
    nextSettings.sidebarWidth = sidebarWidth;
  }) || migrated;

  migrated = applyLegacyValue(readFirstNumber(storage, ["noteflow.listWidth", "noteflow.noteListWidth"], 260, 560), (listWidth) => {
    nextSettings.listWidth = listWidth;
  }) || migrated;

  migrated = applyLegacyValue(readFirstNumber(storage, ["noteflow.chatWidth"], 300, 620), (chatWidth) => {
    nextSettings.chatWidth = chatWidth;
  }) || migrated;

  migrated = applyLegacyValue(readFirstBoolean(storage, ["noteflow.sidebarCollapsed"]), (sidebarCollapsed) => {
    nextSettings.sidebarCollapsed = sidebarCollapsed;
  }) || migrated;

  migrated = applyLegacyValue(readFirstNumber(storage, ["noteflow.ragConversationWidth"], 220, 380), (ragConversationWidth) => {
    nextSettings.ragConversationWidth = ragConversationWidth;
  }) || migrated;

  migrated = applyLegacyValue(readFirstNumber(storage, ["noteflow.ragSourcesWidth"], 260, 460), (ragSourcesWidth) => {
    nextSettings.ragSourcesWidth = ragSourcesWidth;
  }) || migrated;

  migrated = applyLegacyValue(readFirstBoolean(storage, ["noteflow.ragSourcesPanelCollapsed", "noteflow.ragSourcesCollapsed"]), (ragSourcesCollapsed) => {
    nextSettings.ragSourcesCollapsed = ragSourcesCollapsed;
  }) || migrated;

  migrated = applyLegacyValue(readFirstChoice(storage, ["noteflow.lastSection"], appSections), (lastSection) => {
    nextSettings.lastSection = lastSection;
  }) || migrated;

  migrated = applyLegacyValue(readFirstChoice(storage, ["noteflow.language"], appLanguages), (language) => {
    nextSettings.language = language;
  }) || migrated;

  return {
    migrated,
    settings: normalizeUiSettings(nextSettings),
  };
}

export function clearLegacyUiSettings(storage: LegacyStorage | null = getLegacyStorage()) {
  if (!storage) {
    return;
  }

  legacyUiSettingKeys.forEach((key) => storage.removeItem(key));
}
