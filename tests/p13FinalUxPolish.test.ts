import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { TagRow } from "../src/app/types";
import { getRagLayoutMode, resolveRagPanelVisibility } from "../src/features/rag/ragResponsiveLayout";
import { getSettingsLayoutMode } from "../src/features/settings/settingsResponsive";
import { getEditorSurfaceLayoutMode, getEditorToolbarLayoutMode } from "../src/features/editor/editorToolbarLayout";
import { getPageLayoutMode, toPhysicalLayoutPixels } from "../src/shared/physicalLayout";
import { validateTagRename } from "../src/features/tags/TagsPage";
import { FILE_COUNT_FORMS, formatRussianCount, NOTE_COUNT_FORMS } from "../src/shared/russianPlural";

const settingsSource = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
const settingsCss = readFileSync("src/styles/settings.css", "utf8");
const ragPageSource = readFileSync("src/features/rag/RagChatPage.tsx", "utf8");
const ragWorkspaceSource = readFileSync("src/features/rag/RagChatWorkspace.tsx", "utf8");
const ragCss = readFileSync("src/styles/rag.css", "utf8");
const sidebarSource = readFileSync("src/features/navigation/MainSidebar.tsx", "utf8");
const editorSource = readFileSync("src/features/editor/EditorArea.tsx", "utf8");
const imageSource = readFileSync("src/features/imageEditor/ImageNodeView.tsx", "utf8");
const tagsSource = readFileSync("src/features/tags/TagsPage.tsx", "utf8");
const tooltipSource = readFileSync("src/shared/TooltipPortal.tsx", "utf8");

const tags: TagRow[] = [
  { color: "blue", count: 1, id: "alpha", name: "Работа" },
  { color: "green", count: 2, id: "beta", name: "Личное" },
];

describe("P1.3 final UX polish", () => {
  it("switches Settings to a compact, navigation-preserving mode at constrained widths", () => {
    assert.equal(getSettingsLayoutMode(1160), "wide");
    assert.equal(getSettingsLayoutMode(921), "wide");
    assert.equal(getSettingsLayoutMode(920), "compact");
    assert.equal(getSettingsLayoutMode(680), "compact");
    assert.equal(getSettingsLayoutMode(620), "narrow");
    assert.match(settingsSource, /data-layout=\{layoutMode\}/);
    assert.match(settingsSource, /aria-label="Разделы настроек"/);
    assert.match(settingsCss, /\.settings-layout-inner:is\(\.settings-layout-compact, \.settings-layout-narrow\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(settingsCss, /:is\(\.settings-layout-compact, \.settings-layout-narrow\) \.settings-nav-col[\s\S]*overflow-x: auto/);
    assert.doesNotMatch(settingsCss, /\.settings-layout-compact[\s\S]{0,180}grid-template-columns:\s*(?:168px|190px|210px)/);
  });

  it("keeps Settings content bounded on wide screens and fluid in compact mode", () => {
    assert.match(settingsCss, /\.settings-layout-inner[\s\S]*max-width: 1160px/);
    assert.match(settingsCss, /\.settings-content--appearance[\s\S]*max-width: 820px/);
    assert.match(settingsCss, /:is\(\.settings-layout-compact, \.settings-layout-narrow\) \.settings-content[\s\S]*max-width: 100%/);
    assert.match(settingsCss, /\.provider-type-selector[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(settingsCss, /\.export-card[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  });

  it("prioritizes the RAG conversation while preserving preferred source state", () => {
    assert.equal(getRagLayoutMode(1200), "wide");
    assert.equal(getRagLayoutMode(900), "compact");
    assert.equal(getRagLayoutMode(650), "narrow");
    assert.equal(getRagLayoutMode(540), "tight");

    const preferredOpen = {
      historyOverlayOpen: false,
      preferredHistoryCollapsed: false,
      preferredSourcesCollapsed: false,
      sourcesOverlayOpen: false,
    } as const;
    assert.deepEqual(resolveRagPanelVisibility({ ...preferredOpen, layoutMode: "wide" }), {
      historyIsOverlay: false,
      historyVisible: true,
      sourcesIsOverlay: false,
      sourcesVisible: true,
    });
    assert.deepEqual(resolveRagPanelVisibility({ ...preferredOpen, layoutMode: "compact" }), {
      historyIsOverlay: false,
      historyVisible: false,
      sourcesIsOverlay: false,
      sourcesVisible: false,
    });
    assert.equal(resolveRagPanelVisibility({ ...preferredOpen, layoutMode: "wide" }).sourcesVisible, true);
  });

  it("uses temporary overlays for requested secondary RAG panels at compact and narrow widths", () => {
    const compactHistory = resolveRagPanelVisibility({
      historyOverlayOpen: true,
      layoutMode: "compact",
      preferredHistoryCollapsed: false,
      preferredSourcesCollapsed: false,
      sourcesOverlayOpen: false,
    });
    assert.deepEqual(compactHistory, {
      historyIsOverlay: true,
      historyVisible: true,
      sourcesIsOverlay: false,
      sourcesVisible: false,
    });
    const narrow = resolveRagPanelVisibility({
      historyOverlayOpen: false,
      layoutMode: "narrow",
      preferredHistoryCollapsed: false,
      preferredSourcesCollapsed: false,
      sourcesOverlayOpen: true,
    });
    assert.deepEqual(narrow, {
      historyIsOverlay: false,
      historyVisible: false,
      sourcesIsOverlay: true,
      sourcesVisible: true,
    });
    assert.match(ragPageSource, /useObservedPhysicalElementWidth/);
    assert.match(ragWorkspaceSource, /preferredSourcesCollapsed/);
    assert.match(ragWorkspaceSource, /historyOverlayOpen/);
    assert.match(ragCss, /\.rag-page\.rag-layout-narrow[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(ragCss, /\.rag-page\.rag-layout-compact,[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(ragCss, /\.rag-sources-panel\.rag-panel-overlay/);
    assert.match(ragWorkspaceSource, /rag-input-wrap/);
    assert.match(ragWorkspaceSource, /aria-label="Состояние моделей и базы"/);
  });

  it("keeps responsive decisions stable when CSS pixels change only because of zoom", () => {
    for (const zoomPercent of [80, 90, 100, 110, 125, 150, 160]) {
      const cssViewportWidth = 1440 / (zoomPercent / 100);
      const physicalWidth = toPhysicalLayoutPixels(cssViewportWidth, zoomPercent);
      assert.equal(Math.round(physicalWidth), 1440);
      assert.equal(getPageLayoutMode(physicalWidth), "wide");
      assert.equal(getSettingsLayoutMode(physicalWidth), "wide");
      assert.equal(getRagLayoutMode(physicalWidth), "wide");
      assert.equal(getEditorToolbarLayoutMode(physicalWidth), "wide");
      assert.equal(getEditorSurfaceLayoutMode(physicalWidth), "wide");
    }
  });

  it("uses correct Russian count forms", () => {
    for (const [count, expected] of [
      [1, "1 заметка"],
      [2, "2 заметки"],
      [5, "5 заметок"],
      [11, "11 заметок"],
      [21, "21 заметка"],
      [22, "22 заметки"],
      [25, "25 заметок"],
    ] as const) {
      assert.equal(formatRussianCount(count, NOTE_COUNT_FORMS), expected);
    }
    assert.equal(formatRussianCount(1, FILE_COUNT_FORMS), "1 файл");
    assert.equal(formatRussianCount(24, FILE_COUNT_FORMS), "24 файла");
  });

  it("validates tag names and uses one accessible edit flow with a separate merge dialog", () => {
    assert.equal(validateTagRename(tags, "alpha", ""), "Введите название тега");
    assert.equal(validateTagRename(tags, "alpha", "  личное  "), "Тег с таким названием уже существует");
    assert.equal(validateTagRename(tags, "alpha", "Работа"), "");
    assert.equal(validateTagRename(tags, "alpha", "Идеи"), "");
    assert.match(tagsSource, /<TagEditorModal mode="create"/);
    assert.match(tagsSource, /<TagEditorModal mode="edit"/);
    assert.match(tagsSource, />Редактировать</);
    assert.match(tagsSource, /title="Объединить теги\?"/);
    assert.match(tagsSource, /<select[\s\S]*mergeTargets\.map/);
    assert.doesNotMatch(tagsSource, />Переименовать</);
    assert.doesNotMatch(tagsSource, />Изменить цвет</);
  });

  it("removes false production affordances", () => {
    assert.doesNotMatch(sidebarSource, /Уильям|noteflow@local|>\s*Выйти\s*</);
    assert.match(sidebarSource, /Локальный профиль/);
    assert.doesNotMatch(settingsSource, /onLanguageChange|Смена языка пока демонстрационная/);
    assert.doesNotMatch(settingsSource, /Язык интерфейса|Другие языки интерфейса/);
    assert.doesNotMatch(editorSource, /Добавление тегов появится|data-tooltip="Добавить тег"/);
  });

  it("dismisses image context predictably and keeps rare actions in overflow", () => {
    assert.match(editorSource, /clearImageNodeSelection/);
    assert.match(editorSource, /event\.key !== "Escape"/);
    assert.match(editorSource, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
    assert.match(editorSource, /clearImageNodeSelection\(editor\);[\s\S]*editor\.commands\.setContent/);
    assert.match(imageSource, /className="image-more-actions"/);
    assert.match(imageSource, /<MenuPopover/);
    assert.match(imageSource, /openEditor\("crop"\)/);
    assert.match(imageSource, /setAlignment\(item\)/);
    assert.match(imageSource, /startResize/);
  });

  it("uses ModalShell for image description and no native prompt in production source", () => {
    assert.match(imageSource, /title="Описание изображения"/);
    assert.match(imageSource, /form=\{descriptionFormId\}/);
    assert.doesNotMatch(`${tagsSource}\n${imageSource}`, /window\.prompt\s*\(/);
  });

  it("closes tooltips on interaction and when their trigger changes", () => {
    assert.match(
      tooltipSource,
      /addEventListener\("pointerdown", handlePointerInteraction, true\)/,
    );
    assert.match(
      tooltipSource,
      /addEventListener\("click", handlePointerInteraction, true\)/,
    );
    assert.match(tooltipSource, /let suppressedPointerTooltip: string \| null = null/);
    assert.match(
      tooltipSource,
      /function handleFocusIn[\s\S]*suppressedPointerTooltip/,
    );
    assert.match(tooltipSource, /addEventListener\("pointermove", handlePointerMove\)/);
    assert.match(tooltipSource, /new MutationObserver/);
    assert.match(tooltipSource, /dataset\.tooltip !== text/);
    assert.match(tooltipSource, /event\.key === "Escape"/);
    assert.match(tooltipSource, /clearTimeout\(showTimer\)/);
  });

  it("keeps About version tied to the Tauri runtime and avoids duplicate zoom values", () => {
    assert.match(settingsSource, /getVersion\(\)/);
    assert.match(settingsSource, /title="О приложении"|>О приложении</);
    assert.doesNotMatch(settingsSource, /<span className="zoom-current">/);
    assert.match(settingsSource, /className="zoom-reset-btn"[\s\S]*\{appZoomPercent\}%/);
  });
});
