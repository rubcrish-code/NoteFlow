import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const blockInsertMenuSource = readFileSync("src/features/editor/BlockInsertMenu.tsx", "utf8");
const formattingToolbarSource = readFileSync("src/features/editor/FormattingToolbar.tsx", "utf8");
const fontFormatPopoverSource = readFileSync("src/features/editor/FontFormatPopover.tsx", "utf8");
const fontFormatOptionsSource = readFileSync("src/features/editor/fontFormatOptions.ts", "utf8");
const customExtensionsSource = readFileSync("src/features/editor/customExtensions.ts", "utf8");
const pageShellSource = readFileSync("src/features/navigation/PageShell.tsx", "utf8");
const ragChatPageSource = readFileSync("src/features/rag/RagChatPage.tsx", "utf8");
const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");

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
    assert.match(formattingToolbarSource, /font-trigger-label">Aa</);
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
    assert.match(pageShellSource, /sidebarWidth/);
    assert.match(pageShellSource, /page-resize-sb/);
    assert.match(ragChatPageSource, /onSidebarResize/);
    assert.match(ragChatPageSource, /sidebarCollapsed/);
    assert.match(appShellSource, /noteflow\.sidebarWidth/);
    assert.match(appShellSource, /<RagChatPage[\s\S]*sidebarWidth=\{sidebarWidth\}/);
  });
});
