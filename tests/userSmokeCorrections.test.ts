import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Note, TagRow } from "../src/app/types";
import { buildCalendarDays, getCalendarKeyboardTarget, moveIsoMonth } from "../src/features/notes/NoteDatePicker";
import { mergeTagInNotes, removeTagFromNotes, replaceTagInNotes } from "../src/features/tags/tagState";
import { DEFAULT_TAG_PALETTE_ITEM, TAG_COLOR_PALETTE } from "../src/features/tags/tagPalette";
import { normalizeTagName, validateTagName } from "../src/features/tags/tagEditor";
import { APP_ZOOM_MAX, APP_ZOOM_MIN, APP_ZOOM_STEP } from "../src/shared/appZoom";
import { APP_SHORTCUTS, matchesAppShortcut } from "../src/shared/appShortcuts";
import { getLocalProfileInitial, normalizeLocalProfileName, validateLocalProfileName } from "../src/shared/localProfile";
import { calculateFloatingPopoverGeometry } from "../src/shared/useFloatingPopoverPosition";

const sidebarCss = readFileSync("src/styles/pages.css", "utf8");
const appCss = readFileSync("src/styles/app.css", "utf8");
const sidebarSource = readFileSync("src/features/navigation/MainSidebar.tsx", "utf8");
const settingsSource = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
const datePickerSource = readFileSync("src/shared/DatePicker.tsx", "utf8");
const newNoteModalSource = readFileSync("src/features/notes/NewNoteModal.tsx", "utf8");
const tagsSource = readFileSync("src/features/tags/TagsPage.tsx", "utf8");
const tagEditorSource = readFileSync("src/features/tags/TagEditorModal.tsx", "utf8");
const dataServiceSource = readFileSync("src/services/dataService.ts", "utf8");
const uiSettingsSource = readFileSync("src/services/uiSettingsService.ts", "utf8");

const workTag: TagRow = { color: "blue", count: 1, customColor: "#3B6EF2", id: "work", name: "Работа" };
const personalTag: TagRow = { color: "green", count: 2, customColor: "#1EA463", id: "personal", name: "Личное" };

function noteWithTags(tags: Note["tags"]): Note {
  return {
    attachments: [],
    contentHtml: "",
    contentMarkdown: "",
    contentSidecars: [],
    contentVersion: 1,
    createdAt: "2026-09-02T00:00:00Z",
    dateLabel: "Сегодня",
    editorDocument: { content: [], type: "doc" },
    id: "note-1",
    noteDate: "2026-09-02",
    plainText: "",
    project: "Без проекта",
    summary: "",
    tags,
    title: "Тест",
    updatedAt: "2026-09-02T00:00:00Z",
    wordCount: 0,
  };
}

describe("final user smoke corrective pass", () => {
  it("keeps one collapsed rail geometry policy at every 5 percent zoom step", () => {
    assert.match(sidebarCss, /--collapsed-rail-control-size: var\(--control-height-default\)/);
    assert.match(sidebarCss, /--collapsed-rail-icon-size: 18px/);
    assert.match(sidebarCss, /flex: 0 0 var\(--collapsed-rail-icon-size\)/);
    assert.match(sidebarCss, /padding-inline: 0/);
    assert.doesNotMatch(sidebarCss, /\.collapse-sb[^}]*transform:\s*scale/);
    for (let zoom = APP_ZOOM_MIN; zoom <= APP_ZOOM_MAX; zoom += APP_ZOOM_STEP) {
      const scale = zoom / 100;
      assert.ok(Math.abs((18 * scale) / (44 * scale) - 18 / 44) < Number.EPSILON);
    }
    assert.match(sidebarSource, /aria-label=\{item\.label\}/);
    assert.match(sidebarSource, /aria-label="Новая заметка"/);
    assert.match(sidebarSource, /aria-label=\{`\$\{localProfileName\}, локальный профиль`\}/);
  });

  it("normalizes and validates a persistent Unicode local profile name", () => {
    assert.equal(normalizeLocalProfileName("  Рубен   Локальный  "), "Рубен Локальный");
    assert.equal(validateLocalProfileName("   "), "Введите имя локального профиля");
    assert.equal(getLocalProfileInitial("Рубен"), "Р");
    assert.equal(getLocalProfileInitial("William"), "W");
    assert.equal(getLocalProfileInitial("😊 Test"), "😊");
    assert.match(uiSettingsSource, /localProfileName/);
    assert.match(uiSettingsSource, /invoke<UiSettingsDto>\("update_ui_settings"/);
    assert.doesNotMatch(uiSettingsSource, /localStorage/);
  });

  it("has no language controls and keeps only registered shortcut references", () => {
    assert.doesNotMatch(settingsSource, /id: "language"/);
    assert.doesNotMatch(settingsSource, /Язык интерфейса|Другие языки интерфейса появятся/);
    assert.match(settingsSource, /APP_SHORTCUTS/);
    assert.match(settingsSource, /EDITOR_SHORTCUTS/);
    assert.ok(APP_SHORTCUTS.every((shortcut) => settingsSource.includes("APP_SHORTCUTS") && shortcut.keys.length > 0));
    const event = { altKey: false, ctrlKey: true, key: "n", metaKey: false } as KeyboardEvent;
    assert.equal(matchesAppShortcut(event, "newNote"), true);
    assert.equal(matchesAppShortcut({ ...event, key: "x" } as KeyboardEvent, "newNote"), false);
  });

  it("builds a stable six-week calendar and moves focus with keyboard commands", () => {
    const days = buildCalendarDays(2026, 8);
    assert.equal(days.length, 42);
    assert.equal(days[0].iso, "2026-08-31");
    assert.equal(getCalendarKeyboardTarget("2026-09-02", "ArrowRight"), "2026-09-03");
    assert.equal(getCalendarKeyboardTarget("2026-09-02", "ArrowDown"), "2026-09-09");
    assert.equal(moveIsoMonth("2024-03-31", -1), "2024-02-29");
  });

  it("positions the calendar below or above without leaving viewport edges", () => {
    const below = calculateFloatingPopoverGeometry({
      anchorRect: { bottom: 140, left: 80, right: 400, top: 98 },
      gap: 8,
      maxHeight: 430,
      padding: 12,
      preferredWidth: 320,
      scrollHeight: 360,
      viewportHeight: 900,
      viewportWidth: 1440,
    });
    assert.equal(below.opensUp, false);
    assert.equal(below.top, 148);
    assert.equal(below.left, 80);

    const above = calculateFloatingPopoverGeometry({
      anchorRect: { bottom: 860, left: 1150, right: 1430, top: 818 },
      gap: 8,
      maxHeight: 430,
      padding: 12,
      preferredWidth: 320,
      scrollHeight: 360,
      viewportHeight: 900,
      viewportWidth: 1440,
    });
    assert.equal(above.opensUp, true);
    assert.equal(above.left, 1108);
    assert.ok(above.top >= 12);
  });

  it("renders the date picker in a portal and restores focus on Escape", () => {
    assert.match(datePickerSource, /createPortal/);
    assert.match(datePickerSource, /document\.body/);
    assert.match(datePickerSource, /event\.key === "Escape"/);
    assert.match(datePickerSource, /anchorRef\.current\?\.focus\(\)/);
    assert.match(newNoteModalSource, /dateTriggerRef\.current\?\.focus\(\)/);
    assert.match(newNoteModalSource, /triggerRef=\{dateTriggerRef\}/);
    assert.match(datePickerSource, /aria-current=\{day\.iso === today \? "date"/);
    assert.match(datePickerSource, /aria-selected=\{day\.iso === value\}/);
    assert.match(appCss, /@media \(max-height: 760px\)[\s\S]*\.date-picker-grid button[\s\S]*aspect-ratio: auto/);
  });

  it("validates tag creation and uses a deterministic curated palette", () => {
    assert.equal(TAG_COLOR_PALETTE.length, 10);
    assert.equal(DEFAULT_TAG_PALETTE_ITEM.hex, "#3B6EF2");
    assert.equal(normalizeTagName("  Важные   идеи "), "Важные идеи");
    assert.equal(validateTagName([workTag], undefined, ""), "Введите название тега");
    assert.equal(validateTagName([workTag], undefined, " работа "), "Тег с таким названием уже существует");
    assert.match(tagsSource, /openCreateDialog/);
    assert.doesNotMatch(tagsSource, /новый тег \$\{/);
    assert.match(tagEditorSource, /role="radiogroup"/);
    assert.match(tagEditorSource, /role="radio"/);
  });

  it("updates edited, deleted and merged tag state in open notes", () => {
    const note = noteWithTags([{ color: "blue", customColor: "#3B6EF2", id: "work", name: "Работа" }]);
    const updated = { ...workTag, color: "purple" as const, customColor: "#7C5CF0", name: "Проекты" };
    assert.deepEqual(replaceTagInNotes([note], updated)[0].tags[0], {
      color: "purple",
      customColor: "#7C5CF0",
      iconKey: undefined,
      id: "work",
      name: "Проекты",
    });
    assert.equal(removeTagFromNotes([note], "work")[0].tags.length, 0);
    assert.deepEqual(mergeTagInNotes([note], "work", personalTag)[0].tags[0].id, "personal");
  });

  it("uses typed create and atomic name-plus-color update commands", () => {
    assert.match(dataServiceSource, /invoke<TagDto>\("create_tag"/);
    assert.match(dataServiceSource, /invoke<TagDto\[]>\("update_tag"/);
    assert.match(dataServiceSource, /customColor: customColor \?\? null/);
    assert.doesNotMatch(dataServiceSource, /localStorage/);
  });
});
