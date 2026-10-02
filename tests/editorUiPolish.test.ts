import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function getThemeColor(css: string, theme: "dark" | "light", variableName: string) {
  const blockPattern = theme === "dark" ? /\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/ : /:root\s*\{([\s\S]*?)\n\}/;
  const block = css.match(blockPattern)?.[1];
  if (!block) {
    throw new Error(`Theme block not found: ${theme}`);
  }
  const value = block.match(new RegExp(`--${variableName}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  if (!value) {
    throw new Error(`Color token not found: ${variableName}`);
  }
  return value;
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

describe("editor UI polish contract", () => {
  it("keeps checklist items inline with modern checkbox styling", () => {
    const css = readFileSync("src/styles/app.css", "utf8");
    const editorArea = readFileSync("src/features/editor/EditorArea.tsx", "utf8");
    const taskExtensions = readFileSync("src/features/editor/taskExtensions.ts", "utf8");

    assert.match(editorArea, /NoteFlowTaskItem\.configure\(\{ nested: true \}\)/);
    assert.match(taskExtensions, /className = "noteflow-task-checkbox"/);
    assert.match(taskExtensions, /className = "noteflow-task-content"/);
    assert.match(taskExtensions, /tr\.setNodeMarkup\(position, undefined/);
    assert.match(css, /\.noteflow-task-item[\s\S]*display:\s*flex !important/);
    assert.match(css, /\.noteflow-task-checkbox[\s\S]*flex:\s*0 0 22px/);
    assert.match(css, /\.noteflow-task-content[\s\S]*flex:\s*1 1 auto/);
    assert.match(css, /li\[data-type="taskItem"\]\s*>\s*label span\s*\{[\s\S]*display:\s*none/);
    assert.match(css, /li\[data-type="taskItem"\]\s*input\s*\{[\s\S]*border-radius:\s*50%/);
  });

  it("keeps image filenames out of the editor surface and exposes alignment actions", () => {
    const imageNodeView = readFileSync("src/features/imageEditor/ImageNodeView.tsx", "utf8");
    const css = readFileSync("src/styles/app.css", "utf8");

    assert.doesNotMatch(imageNodeView, /<figcaption/);
    assert.match(imageNodeView, /image-align-actions/);
    assert.match(imageNodeView, /alignLeft/);
    assert.match(imageNodeView, /alignCenter/);
    assert.match(imageNodeView, /alignRight/);
    assert.match(imageNodeView, /setAlignment/);
    assert.match(css, /\.note-image-node\.align-left/);
    assert.match(css, /\.note-image-node\.align-center figure/);
    assert.match(css, /\.note-image-node\.align-right figure/);
  });

  it("adds table tools without leaking sidecar styling into Markdown export", () => {
    const editorArea = readFileSync("src/features/editor/EditorArea.tsx", "utf8");
    const tableTools = readFileSync("src/features/editor/TableToolsPopover.tsx", "utf8");
    const tableExtensions = readFileSync("src/features/editor/tableExtensions.ts", "utf8");
    const serializer = readFileSync("src/features/editor/editorContentSerializer.ts", "utf8");
    const css = readFileSync("src/styles/app.css", "utf8");

    assert.match(editorArea, /<TableToolsPopover editor=\{editor\} onToast=\{onToast\} \/>/);
    assert.match(editorArea, /NoteFlowTable\.configure\(\{ resizable: true, View: NoteFlowTableView \}\)/);
    assert.match(editorArea, /TableToolsAnchor/);
    assert.match(tableExtensions, /Decoration\.widget/);
    assert.match(tableExtensions, /dataset\.noteflowTableToolsAnchor/);
    assert.match(tableExtensions, /function handleTableDelete/);
    assert.match(tableExtensions, /class NoteFlowTableView extends TableView/);
    assert.match(tableExtensions, /syncTableBorderDomAttribute\(this\.table, node\.attrs\.emphasizedBorders\)/);
    assert.match(tableExtensions, /selection\.isRowSelection\(\)/);
    assert.match(tableExtensions, /selection\.isColSelection\(\)/);
    assert.match(tableExtensions, /clearSelectedTableCells/);
    assert.match(tableTools, /table-tools-trigger/);
    assert.match(tableTools, /table-tools-menu/);
    assert.match(tableTools, /createPortal/);
    assert.match(tableTools, /querySelector<HTMLElement>\('\[data-noteflow-table-tools-anchor="true"\]'\)/);
    assert.match(tableTools, /aria-expanded=\{isMenuOpen\}/);
    assert.match(tableTools, /setIsMenuOpen\(\(currentValue\) => !currentValue\)/);
    assert.match(tableTools, /setCellAttribute\("backgroundColor"/);
    assert.match(tableTools, /setActiveTableEmphasizedBorders/);
    assert.match(tableTools, /getActiveTableEmphasizedBorders/);
    assert.match(tableTools, /Толстые границы/);
    assert.doesNotMatch(tableTools, /Заметные границы/);
    assert.match(tableTools, /document\.body/);
    assert.match(tableTools, /style=\{popoverStyle\}/);
    assert.match(tableTools, /addRowBefore/);
    assert.match(tableTools, /addColumnAfter/);
    assert.match(tableTools, /deleteTable/);
    assert.doesNotMatch(css, /position:\s*sticky/);
    assert.match(css, /\.table-tools-anchor\s*\{[\s\S]*height:\s*0[\s\S]*margin:\s*0/);
    assert.match(css, /\.table-tools-popover\s*\{[\s\S]*position:\s*fixed/);
    assert.match(css, /table\[data-table-borders="strong"\]/);
    assert.match(css, /table\[data-table-borders="strong"\]\s*\{[\s\S]*border:\s*2px solid var\(--table-border-emphasized\)/);
    assert.match(css, /table\[data-table-borders="strong"\][\s\S]*border-width:\s*2px/);
    assert.match(serializer, /tables: extractNodeEntries/);
    assert.match(serializer, /tableCells: extractNodeEntries/);
    assert.match(serializer, /tableHeaders: extractNodeEntries/);
  });

  it("keeps table tool clicks inside the popover and preserves table selection before running commands", () => {
    const tableTools = readFileSync("src/features/editor/TableToolsPopover.tsx", "utf8");

    assert.match(tableTools, /lastTableSelectionRef/);
    assert.match(tableTools, /function captureTableSelection/);
    assert.match(tableTools, /function restoreTableSelection/);
    assert.match(tableTools, /function preserveTableToolSelection/);
    assert.match(tableTools, /event\.preventDefault\(\)/);
    assert.match(tableTools, /event\.stopPropagation\(\)/);
    assert.match(tableTools, /onMouseDown=\{preserveTableToolSelection\}/);
    assert.match(tableTools, /onPointerDown=\{stopInternalTableToolPointer\}/);
    assert.match(tableTools, /isTableToolsEventTarget\(event\.target, popoverRef\.current\)/);
    assert.match(tableTools, /closest\('\[data-noteflow-table-tools-anchor="true"\]'\)/);
    assert.match(tableTools, /document\.addEventListener\("keydown", handleKeyDown, true\)/);
    assert.match(tableTools, /event\.key === "Escape"/);
  });

  it("wires table menu actions to TipTap commands without closing the menu first", () => {
    const tableTools = readFileSync("src/features/editor/TableToolsPopover.tsx", "utf8");

    assert.match(tableTools, /onClick=\{\(\) => runCommand\("addRowAfter"\)\}/);
    assert.match(tableTools, /onClick=\{\(\) => runCommand\("addColumnAfter"\)\}/);
    assert.match(tableTools, /onClick=\{toggleEmphasizedBorders\}/);
    assert.match(tableTools, /restoreTableSelection\(\);\s*const chain = editor\.chain\(\)\.focus\(\)/);
    assert.match(tableTools, /setCellAttribute\("backgroundColor", color\)\.run\(\)/);
    assert.match(tableTools, /onClick=\{\(\) => applyCellBackground\(item\.color\)\}/);
    assert.match(tableTools, /onClick=\{\(\) => applyCellBackground\(null\)\}/);
    assert.match(tableTools, /command === "deleteRow"/);
    assert.match(tableTools, /command === "deleteColumn"/);
    assert.match(tableTools, /command === "deleteTable"/);
    assert.match(tableTools, /command === "mergeCells"/);
    assert.match(tableTools, /command === "splitCell"/);
    assert.match(tableTools, /chain\.toggleHeaderRow\(\)\.run\(\)/);
    assert.match(tableTools, /if \(didRun\) \{\s*captureTableSelection\(\);/);
  });

  it("uses shared lightweight button tokens for compact actions across editor surfaces", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");
    const css = readFileSync("src/styles/app.css", "utf8");

    assert.match(tokens, /--radius-pill:\s*999px/);
    assert.match(tokens, /--button-radius:\s*var\(--radius-button\)/);
    assert.match(tokens, /--button-height-sm:\s*32px/);
    assert.match(tokens, /--button-height-md:\s*38px/);
    assert.match(tokens, /--button-primary-bg:\s*var\(--accent\)/);
    assert.match(tokens, /--button-danger-bg:/);
    assert.match(css, /border-radius:\s*var\(--button-radius\)/);
    assert.match(css, /:where\([\s\S]*\.tag-action[\s\S]*\.archive-action[\s\S]*\.table-tools-trigger[\s\S]*\.table-border-toggle[\s\S]*\.file-attachment-action[\s\S]*\.export-action[\s\S]*\.note-chat-copy[\s\S]*\.font-action[\s\S]*\.new-note-actions button/);
    assert.match(css, /:where\([\s\S]*\.editor-command-actions button[\s\S]*\.ai-editor-panel-actions button[\s\S]*\.note-menu-actions-list button[\s\S]*\.tag-color-actions button[\s\S]*\.rag-top-actions button/);
    assert.match(css, /\.primary-btn\s*\{[\s\S]*background:\s*var\(--button-primary-bg\)/);
    assert.match(css, /\.danger-btn\s*\{[\s\S]*background:\s*var\(--button-danger-bg\)/);
    assert.match(css, /\.table-delete-button\s*\{[\s\S]*background:\s*var\(--button-danger-bg\)/);
  });

  it("keeps tags and archive rows compact with shared action styles", () => {
    const tagsPage = readFileSync("src/features/tags/TagsPage.tsx", "utf8");
    const archivePage = readFileSync("src/features/archive/ArchivePage.tsx", "utf8");
    const legacyActionsCss = readFileSync("src/styles/app.css", "utf8");
    const pageLayoutCss = readFileSync("src/styles/pages.css", "utf8");

    assert.match(tagsPage, /tag-row-main/);
    assert.match(tagsPage, /tag-row-actions/);
    assert.match(archivePage, /archive-row-main/);
    assert.match(archivePage, /archive-row-actions/);
    assert.match(pageLayoutCss, /\.tag-row,\s*\.archive-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
    assert.match(legacyActionsCss, /:where\(\.tag-action, \.archive-action/);
    assert.match(legacyActionsCss, /\.tag-row \.tag-action\s*\{[\s\S]*border-radius:\s*var\(--button-radius\)/);
  });

  it("keeps primary, secondary, and supporting text readable in both themes", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");

    for (const variableName of ["text", "tsoft", "tfaint"]) {
      assert.ok(contrastRatio(getThemeColor(tokens, "light", variableName), "#ffffff") >= 4.5);
      assert.ok(contrastRatio(getThemeColor(tokens, "dark", variableName), "#1a1d22") >= 4.5);
    }
  });

  it("communicates Markdown export path and exposes reveal action", () => {
    const appShell = readFileSync("src/app/AppShell.tsx", "utf8");
    const dataService = readFileSync("src/services/dataService.ts", "utf8");
    const toast = readFileSync("src/shared/Toast.tsx", "utf8");

    assert.match(appShell, /Markdown экспортирован: \$\{result\.path\}/);
    assert.match(appShell, /Показать в проводнике/);
    assert.match(appShell, /revealExportedItem\(result\.path\)/);
    assert.match(dataService, /revealItemInDir/);
    assert.match(toast, /interface ToastAction/);
    assert.match(toast, /action\.label/);
  });

  it("renders managed file attachments with open and reveal actions", () => {
    const nodeView = readFileSync("src/features/editor/FileAttachmentNodeView.tsx", "utf8");
    const editorArea = readFileSync("src/features/editor/EditorArea.tsx", "utf8");
    const dataService = readFileSync("src/services/dataService.ts", "utf8");
    const backend = readFileSync("src-tauri/src/data.rs", "utf8");

    assert.match(nodeView, /file-attachment-card/);
    assert.match(nodeView, /Открыть/);
    assert.match(nodeView, /Показать файл в проводнике/);
    assert.match(nodeView, /getAttachmentTypeLabel/);
    assert.match(nodeView, /Файл недоступен/);
    assert.match(editorArea, /InteractiveFileAttachment\.configure/);
    assert.match(dataService, /invoke<void>\("open_attachment", \{ attachmentId \}\)/);
    assert.match(dataService, /invoke<void>\("reveal_attachment", \{ attachmentId \}\)/);
    assert.doesNotMatch(dataService, /openPath\(path\)/);
    assert.match(backend, /fn open_attachment/);
    assert.match(backend, /fn reveal_attachment/);
    assert.match(backend, /materialize_attachment_view/);
  });

  it("removes the formula insertion UI while retaining inline dates", () => {
    const blockMenu = readFileSync("src/features/editor/BlockInsertMenu.tsx", "utf8");
    assert.doesNotMatch(blockMenu, /formulaDraft|insertFormula|Формула/);
    assert.match(blockMenu, /insertInlineDate/);
  });

  it("uses clear grouped actions in Data and Export settings", () => {
    const settings = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
    const css = readFileSync("src/styles/app.css", "utf8");

    assert.match(settings, /export-action-group/);
    assert.match(settings, /export-action primary/);
    assert.match(settings, /export-action secondary/);
    assert.match(settings, /Импорт и восстановление/);
    assert.match(css, /\.export-action\s*\{[\s\S]*min-height:\s*var\(--button-height-md\)/);
    assert.match(css, /\.export-action\.primary\s*\{[\s\S]*background:\s*var\(--button-primary-bg\)/);
  });

  it("shows model settings instead of connect when an AI provider is active", () => {
    const toolbar = readFileSync("src/features/editor/FormattingToolbar.tsx", "utf8");

    assert.match(toolbar, /aiStatus\.hasProvider \? "Настройки моделей" : "Подключить модель"/);
    assert.match(toolbar, /aiStatus\.hasProvider \? "model-settings" : ""/);
    assert.match(toolbar, /\{aiStatus \? \(/);
  });
});
