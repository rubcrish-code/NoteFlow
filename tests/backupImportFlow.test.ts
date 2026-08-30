import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BackupPreview, ImportBackupResult } from "../src/services/dataService.ts";
import {
  getBackupPreviewErrorMessage,
  getBackupRestoreErrorMessage,
  getBackupSummaryRows,
  getLegacyBackupHistoryNotice,
  initialBackupImportState,
  reduceBackupImportState,
} from "../src/features/settings/backupImportFlow.ts";
import { restoreWorkspaceBackup } from "../src/app/backupImportCoordinator.ts";

const contents = {
  attachments: 4,
  messages: 9,
  noteAiChats: 2,
  notes: 7,
  projects: 3,
  ragChats: 1,
  tags: 5,
};

function preview(overrides: Partial<BackupPreview> = {}): BackupPreview {
  return {
    appVersion: "0.9.0",
    contents,
    exportedAt: "2026-08-26T10:30:00Z",
    formatVersion: 5,
    includesAiHistory: true,
    missingAttachmentFiles: 0,
    preservesExistingAiHistory: false,
    ...overrides,
  };
}

function result(): ImportBackupResult {
  return {
    contents,
    indexesUpdating: false,
    preservedLegacyChats: 0,
    workspace: {
      archiveItems: [],
      dataLocation: { dataDir: "managed", databasePath: "managed" },
      notes: [],
      projects: [],
      tags: [],
    },
  };
}

describe("backup import UI flow", () => {
  it("shows the user-facing preview counts", () => {
    assert.deepEqual(getBackupSummaryRows(contents), [
      ["Заметки", 7],
      ["Проекты", 3],
      ["Теги", 5],
      ["Вложения", 4],
      ["Чаты ИИ", 2],
      ["Чаты по базе", 1],
    ]);
  });

  it("warns that an old backup does not define AI history replacement", () => {
    const warning = getLegacyBackupHistoryNotice(preview({
      formatVersion: 4,
      includesAiHistory: false,
      preservesExistingAiHistory: true,
    }));
    assert.match(warning ?? "", /не содержит историю ИИ-чатов/);
    assert.match(warning ?? "", /не будут удалены/);
  });

  it("cancel returns to a closed state without a restore result", () => {
    const ready = reduceBackupImportState(
      reduceBackupImportState(initialBackupImportState, { type: "previewStarted", requestId: 1 }),
      { type: "previewReady", preview: preview(), requestId: 1 },
    );
    assert.deepEqual(reduceBackupImportState(ready, { type: "close" }), initialBackupImportState);
  });

  it("ignores stale preview results", () => {
    const waiting = reduceBackupImportState(initialBackupImportState, { type: "previewStarted", requestId: 2 });
    assert.equal(
      reduceBackupImportState(waiting, { type: "previewReady", preview: preview(), requestId: 1 }),
      waiting,
    );
  });

  it("prevents a duplicate restore transition while loading", () => {
    const ready = reduceBackupImportState(
      reduceBackupImportState(initialBackupImportState, { type: "previewStarted", requestId: 1 }),
      { type: "previewReady", preview: preview(), requestId: 1 },
    );
    const restoring = reduceBackupImportState(ready, { type: "restoreStarted" });
    assert.equal(restoring.phase, "restoring");
    assert.equal(reduceBackupImportState(restoring, { type: "restoreStarted" }), restoring);
  });

  it("represents refresh success for notes and chats", () => {
    const ready = reduceBackupImportState(
      reduceBackupImportState(initialBackupImportState, { type: "previewStarted", requestId: 1 }),
      { type: "previewReady", preview: preview(), requestId: 1 },
    );
    const restored = reduceBackupImportState(
      reduceBackupImportState(ready, { type: "restoreStarted" }),
      { type: "restoreSucceeded", result: result() },
    );
    assert.equal(restored.phase, "success");
    assert.equal(restored.result?.contents.noteAiChats, 2);
    assert.equal(restored.result?.contents.ragChats, 1);
  });

  it("uses safe failure messages without SQL or filesystem paths", () => {
    const messages = [
      getBackupPreviewErrorMessage(),
      getBackupRestoreErrorMessage(false),
      getBackupRestoreErrorMessage(true),
    ].join(" ");
    assert.doesNotMatch(messages, /SELECT|INSERT|UPDATE|DELETE\s+FROM|[A-Z]:\\|\.sqlite/i);
  });

  it("does not offer a second restore after data was applied but the UI reload failed", () => {
    const restoring = reduceBackupImportState(
      { ...initialBackupImportState, phase: "ready", preview: preview(), requestId: 1 },
      { type: "restoreStarted" },
    );
    const applied = reduceBackupImportState(restoring, {
      type: "restoreAppliedButReloadFailed",
      message: getBackupRestoreErrorMessage(true),
    });

    assert.equal(applied.phase, "applied");
    assert.match(applied.errorMessage, /восстановлена/i);
    assert.match(applied.errorMessage, /перезапустите/i);
    assert.equal(reduceBackupImportState(applied, { type: "restoreStarted" }), applied);
  });

  it("flushes autosave before import and then refreshes the active editor and chat views", async () => {
    const events: string[] = [];
    const file = { name: "backup.zip" } as File;
    const imported = result();
    const restored = await restoreWorkspaceBackup({
      applyWorkspace: () => events.push("workspace"),
      file,
      flushPendingSave: async () => { events.push("flush"); },
      importBackup: async (receivedFile) => {
        assert.equal(receivedFile, file);
        events.push("import");
        return imported;
      },
      invalidatePendingSaves: () => events.push("invalidate"),
      refreshExternalViews: () => events.push("chats"),
    });
    assert.equal(restored, imported);
    assert.deepEqual(events, ["flush", "import", "invalidate", "workspace", "chats"]);
  });

  it("does not start import when pending autosave cannot be flushed", async () => {
    let importCalled = false;
    await assert.rejects(() => restoreWorkspaceBackup({
      applyWorkspace: () => undefined,
      file: { name: "backup.zip" } as File,
      flushPendingSave: async () => { throw new Error("save failed"); },
      importBackup: async () => {
        importCalled = true;
        return result();
      },
      invalidatePendingSaves: () => undefined,
      refreshExternalViews: () => undefined,
    }));
    assert.equal(importCalled, false);
  });
});
