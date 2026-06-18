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

    assert.match(source, /from "@tauri-apps\/api\/core"/);
    assert.match(source, /invoke<WorkspaceSnapshotDto>\("load_workspace"/);
    assert.match(source, /invoke<NoteDto>\("update_note_content"/);
    assert.match(source, /invoke<ExportResultDto>\("create_backup"/);
    assert.doesNotMatch(source, /localStorage/);
  });
});
