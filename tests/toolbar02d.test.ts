import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EDITOR_TOOLBAR_ACTIONS } from "../src/features/editor/editorToolbarLayout";

const blockInsertMenuSource = readFileSync("src/features/editor/BlockInsertMenu.tsx", "utf8");
const formattingToolbarSource = readFileSync("src/features/editor/FormattingToolbar.tsx", "utf8");
const fontFormatPopoverSource = readFileSync("src/features/editor/FontFormatPopover.tsx", "utf8");
const fontFormatOptionsSource = readFileSync("src/features/editor/fontFormatOptions.ts", "utf8");
const customExtensionsSource = readFileSync("src/features/editor/customExtensions.ts", "utf8");
const dataServiceSource = readFileSync("src/services/dataService.ts", "utf8");
const imageCropToolSource = readFileSync("src/features/imageEditor/ImageCropTool.tsx", "utf8");
const imageGeometrySource = readFileSync("src/features/imageEditor/imageGeometry.ts", "utf8");
const imageNodeViewSource = readFileSync("src/features/imageEditor/ImageNodeView.tsx", "utf8");
const imageEditorModalSource = readFileSync("src/features/imageEditor/ImageEditorModal.tsx", "utf8");
const noteListPanelSource = readFileSync("src/features/notes/NoteListPanel.tsx", "utf8");
const noteMenuPopoverSource = readFileSync("src/features/editor/NoteMenuPopover.tsx", "utf8");
const pageShellSource = readFileSync("src/features/navigation/PageShell.tsx", "utf8");
const ragChatPageSource = readFileSync("src/features/rag/RagChatPage.tsx", "utf8");
const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");
const legacyUiSettingsMigrationSource = readFileSync("src/services/legacyUiSettingsMigration.ts", "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1);
  assert.notEqual(endIndex, -1);
  return source.slice(startIndex, endIndex);
}

describe("toolbar and block insert menu contract", () => {
  it("keeps simple formatting out of the bottom insert menu", () => {
    const blockItemsSource = sourceBetween(blockInsertMenuSource, "const blockMenuItems", "const calloutVariants");

    for (const duplicateCommand of ["paragraph", "h1", "h2", "h3", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock"]) {
      assert.doesNotMatch(blockItemsSource, new RegExp(`command: "${duplicateCommand}"`));
    }

    for (const complexCommand of ["table", "callout", "details", "divider"]) {
      assert.match(blockItemsSource, new RegExp(`command: "${complexCommand}"`));
    }
  });

  it("uses a compact Aa popover for font family, font size and reset", () => {
    assert.match(formattingToolbarSource, /data-toolbar-font-trigger/);
    assert.equal(EDITOR_TOOLBAR_ACTIONS.find((action) => action.id === "font")?.label, "Aa");
    assert.doesNotMatch(formattingToolbarSource, /data-toolbar-font-family/);
    assert.doesNotMatch(formattingToolbarSource, /data-toolbar-font-size/);
    assert.doesNotMatch(formattingToolbarSource, /data-toolbar-font-reset/);
    assert.doesNotMatch(formattingToolbarSource, /<select/);
    assert.match(fontFormatPopoverSource, /Шрифт и размер/);
    assert.match(fontFormatPopoverSource, /Сбросить/);
    assert.match(fontFormatPopoverSource, /Отмена/);
    assert.match(fontFormatPopoverSource, /Применить/);
    assert.match(fontFormatOptionsSource, /"12", "14", "16", "18", "20", "24", "28", "32", "36"/);
    assert.match(customExtensionsSource, /setFontFamily/);
    assert.match(customExtensionsSource, /setFontSize/);
    assert.match(customExtensionsSource, /unsetFontFormat/);
  });

  it("keeps AI clickable when no model is connected", () => {
    assert.match(formattingToolbarSource, /ИИ-модель не подключена/);
    assert.match(formattingToolbarSource, /Подключить модель/);
    assert.match(formattingToolbarSource, /onOpenAiSettings/);
  });

  it("uses the shared sidebar width state on the RAG page", () => {
    assert.match(pageShellSource, /sidebar\?\.width/);
    assert.match(pageShellSource, /page-resize-sb/);
    assert.match(ragChatPageSource, /sidebar: PageShellSidebarProps/);
    assert.match(ragChatPageSource, /sidebar=\{sidebar\}/);
    assert.match(legacyUiSettingsMigrationSource, /noteflow\.sidebarWidth/);
    assert.doesNotMatch(appShellSource, /localStorage/);
    assert.match(appShellSource, /<RagChatPage[\s\S]*sidebar=\{sharedPageSidebar\}/);
  });

  it("exposes note pinning explicitly", () => {
    assert.match(noteMenuPopoverSource, /Закрепить заметку/);
    assert.match(noteMenuPopoverSource, /Открепить заметку/);
    assert.match(noteListPanelSource, /pin-action/);
    assert.match(noteListPanelSource, /onTogglePin/);
    assert.match(dataServiceSource, /toggle_note_pin/);
  });

  it("keeps image editing in a dedicated feature module", () => {
    assert.match(imageNodeViewSource, /Изменить размер/);
    assert.match(imageNodeViewSource, /Обрезать/);
    assert.match(imageNodeViewSource, /Рисовать/);
    assert.match(imageEditorModalSource, /ImageCropTool/);
    assert.match(imageEditorModalSource, /ImageAnnotationCanvas/);
  });

  it("uses production image resize handles instead of caret buttons", () => {
    for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      assert.match(imageGeometrySource, new RegExp(`"${handle}"`));
      assert.match(imageNodeViewSource, new RegExp(`image-resize-handle-\\$\\{handle\\}`));
    }
    assert.match(imageNodeViewSource, /setPointerCapture/);
    assert.match(imageNodeViewSource, /resizeImageBox/);
    assert.doesNotMatch(imageNodeViewSource, /Icon name="caret"/);
    assert.doesNotMatch(imageNodeViewSource, /className="image-resize-handle left"/);
  });

  it("keeps crop interactions precise and handle based", () => {
    assert.match(imageCropToolSource, /image-crop-canvas/);
    assert.match(imageCropToolSource, /image-crop-layer/);
    assert.match(imageCropToolSource, /moveRectWithinBounds/);
    assert.match(imageCropToolSource, /resizeRectWithinBounds/);
    assert.match(imageCropToolSource, /createRectFromPoints/);
    assert.match(imageCropToolSource, /setPointerCapture/);
    assert.match(imageCropToolSource, /image-crop-handle-/);
    assert.doesNotMatch(imageCropToolSource, /image-crop-overlay/);
  });
});
