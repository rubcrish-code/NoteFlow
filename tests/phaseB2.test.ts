import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runBackupExport } from "../src/features/settings/backupExportFlow";

describe("Phase B2 backup export", () => {
  it("does not start a backup when the native save dialog is cancelled", async () => {
    let writes = 0;
    const result = await runBackupExport(async () => null, async () => {
      writes += 1;
      return "saved";
    });
    assert.equal(result, null);
    assert.equal(writes, 0);
  });

  it("writes only to the selected destination and returns its result", async () => {
    const destination = "C:\\Users\\QA\\Documents\\NoteFlow-backup.zip";
    const result = await runBackupExport(async () => destination, async (path) => {
      assert.equal(path, destination);
      return { path, message: "Резервная копия создана" };
    });
    assert.deepEqual(result, { path: destination, message: "Резервная копия создана" });
  });

  it("propagates backup failure without reporting success", async () => {
    await assert.rejects(
      runBackupExport(async () => "C:\\missing\\backup.zip", async () => {
        throw new Error("destination unavailable");
      }),
      /destination unavailable/,
    );
  });
});

describe("Phase B2 non-streaming AI", () => {
  it("does not offer a streaming switch while retaining the compatible provider field", () => {
    const settings = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
    const service = readFileSync("src/services/llmProviderService.ts", "utf8");
    const backend = readFileSync("src-tauri/src/llm.rs", "utf8");
    assert.doesNotMatch(settings, /Потоковая выдача|Показывать ответ по мере генерации/);
    assert.match(settings, /streamingEnabled: false/);
    assert.match(service, /streamingEnabled: boolean/);
    assert.match(backend, /"stream": false/);
  });
});
