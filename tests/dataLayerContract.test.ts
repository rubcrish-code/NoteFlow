import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        return sourceFiles(path);
      }
      return /\.(ts|tsx)$/.test(path) ? [path] : [];
    });
}

describe("production data layer contract", () => {
  it("keeps SQL out of the React frontend", () => {
    const sqlPattern = /\b(?:CREATE\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|SELECT\s+.+\s+FROM|UPDATE\s+\w+\s+SET)\b/i;
    const offenders = sourceFiles("src")
      .map((path) => [path, readFileSync(path, "utf8")] as const)
      .filter(([path, source]) => path !== join("src", "services", "dataService.ts") && sqlPattern.test(source))
      .map(([path]) => path);

    assert.deepEqual(offenders, []);
  });

  it("routes data access through typed Tauri invoke services", () => {
    const source = readFileSync("src/services/dataService.ts", "utf8");
    const uiSettingsSource = readFileSync("src/services/uiSettingsService.ts", "utf8");
    const llmProviderSource = readFileSync("src/services/llmProviderService.ts", "utf8");

    assert.match(source, /from "@tauri-apps\/api\/core"/);
    assert.match(source, /invoke<WorkspaceSnapshotDto>\("load_workspace"/);
    assert.match(source, /invoke<NoteDto>\("update_note_content"/);
    assert.match(source, /invoke<ExportResultDto>\("create_backup"/);
    assert.match(source, /invoke<string>\("resolve_attachment_path", \{ attachmentId \}\)/);
    assert.match(source, /openPath\(path\)/);
    assert.match(source, /revealItemInDir\(path\)/);
    assert.match(source, /buildEditorDocumentFromStoredNoteContent/);
    assert.match(source, /contentSidecars: note\.contentSidecars\.map\(mapNoteContentSidecarInput\)/);
    assert.doesNotMatch(source, /editorDocument: note\.contentJson/);
    assert.doesNotMatch(source, /localStorage/);

    assert.match(uiSettingsSource, /from "@tauri-apps\/api\/core"/);
    assert.match(uiSettingsSource, /invoke<UiSettingsDto>\("get_ui_settings"/);
    assert.match(uiSettingsSource, /invoke<UiSettingsDto>\("update_ui_settings"/);
    assert.doesNotMatch(uiSettingsSource, /localStorage/);

    assert.match(llmProviderSource, /from "@tauri-apps\/api\/core"/);
    assert.match(llmProviderSource, /invoke<LlmProviderDto\[]>\("list_llm_providers"/);
    assert.match(llmProviderSource, /invoke<LlmProviderDto>\("save_llm_provider"/);
    assert.doesNotMatch(llmProviderSource, /localStorage/);
  });

  it("limits localStorage to one-time UI settings migration", () => {
    const allowedPath = join("src", "services", "legacyUiSettingsMigration.ts");
    const offenders = sourceFiles("src")
      .map((path) => [path, readFileSync(path, "utf8")] as const)
      .filter(([path, source]) => path !== allowedPath && /localStorage/.test(source))
      .map(([path]) => path);

    assert.deepEqual(offenders, []);
  });

  it("normalizes UI settings dimensions to safe integers before Tauri invoke", () => {
    const source = readFileSync("src/services/uiSettingsService.ts", "utf8");

    assert.match(source, /function clampInteger/);
    assert.match(source, /Math\.round/);
    assert.match(source, /Number\.isFinite/);
    assert.match(source, /chatWidth: clampInteger/);
    assert.match(source, /listWidth: clampInteger/);
    assert.match(source, /ragConversationWidth: clampInteger/);
    assert.match(source, /ragSourcesWidth: clampInteger/);
    assert.match(source, /sidebarWidth: clampInteger/);
    assert.match(source, /request: normalizeUiSettings\(settings\)/);
  });
});
