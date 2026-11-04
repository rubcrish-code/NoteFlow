import { translate } from "../../shared/i18n";
import { interfaceCatalogs } from "../../shared/i18n";
import type { BackupPreview, ImportBackupResult } from "../../services/dataService";
import { formatDisplayDateTime } from "../../shared/displayDate";

export type BackupImportPhase = "applied" | "closed" | "error" | "previewing" | "ready" | "restoring" | "success";

export interface BackupImportState {
  errorMessage: string;
  phase: BackupImportPhase;
  preview: BackupPreview | null;
  requestId: number;
  result: ImportBackupResult | null;
}

export type BackupImportAction =
  | { type: "close" }
  | { type: "previewStarted"; requestId: number }
  | { type: "previewReady"; preview: BackupPreview; requestId: number }
  | { type: "previewFailed"; message: string; requestId: number }
  | { type: "restoreStarted" }
  | { type: "restoreSucceeded"; result: ImportBackupResult }
  | { type: "restoreAppliedButReloadFailed"; message: string }
  | { type: "restoreFailed"; message: string };

export const initialBackupImportState: BackupImportState = {
  errorMessage: "",
  phase: "closed",
  preview: null,
  requestId: 0,
  result: null,
};

export function reduceBackupImportState(
  state: BackupImportState,
  action: BackupImportAction,
): BackupImportState {
  switch (action.type) {
    case "close":
      return initialBackupImportState;
    case "previewStarted":
      return {
        errorMessage: "",
        phase: "previewing",
        preview: null,
        requestId: action.requestId,
        result: null,
      };
    case "previewReady":
      return state.phase === "previewing" && state.requestId === action.requestId
        ? { ...state, phase: "ready", preview: action.preview }
        : state;
    case "previewFailed":
      return state.phase === "previewing" && state.requestId === action.requestId
        ? { ...state, errorMessage: action.message, phase: "error" }
        : state;
    case "restoreStarted":
      return (state.phase === "ready" || state.phase === "error") && state.preview
        ? { ...state, errorMessage: "", phase: "restoring" }
        : state;
    case "restoreSucceeded":
      return state.phase === "restoring"
        ? { ...state, phase: "success", result: action.result }
        : state;
    case "restoreAppliedButReloadFailed":
      return state.phase === "restoring"
        ? { ...state, errorMessage: action.message, phase: "applied" }
        : state;
    case "restoreFailed":
      return state.phase === "restoring"
        ? { ...state, errorMessage: action.message, phase: "error" }
        : state;
  }
}

export function formatBackupDate(value: string) {
  return formatDisplayDateTime(value) || translate("ui.bbaa3a37913d");
}

export function getLegacyBackupHistoryNotice(preview: BackupPreview) {
  if (!preview.preservesExistingAiHistory) return null;
  return translate("ui.d9b2c0c4b17b");
}

export function getBackupSummaryRows(contents: BackupPreview["contents"]) {
  return [
    [translate("ui.04a18b51cdc2"), contents.notes],
    [translate("ui.5029f02d0a94"), contents.projects],
    [translate("ui.a2800083983f"), contents.tags],
    [translate("ui.6d356a0d7273"), contents.attachments],
    [translate("ui.0dc82d95028a"), contents.noteAiChats],
    [translate("ui.3199a83d2f9c"), contents.ragChats],
  ] as const;
}

export function getBackupPreviewErrorMessage() {
  return translate("ui.fd25614d14c6");
}

export function getBackupRestoreErrorMessage(appliedButNotReloaded: boolean) {
  return appliedButNotReloaded
    ? translate("ui.baadf0fc682d")
    : translate("ui.8427e3f82b94");
}

export function wasBackupRestoreApplied(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) return error.code === "RESTORE_APPLIED";
  const message = error instanceof Error ? error.message : String(error);
  // Compatibility for old UI-only callers; command results use the stable code.
  return message.includes("интерфейс не удалось обновить")
    || message.includes(interfaceCatalogs.en["ui.baadf0fc682d"]);
}
