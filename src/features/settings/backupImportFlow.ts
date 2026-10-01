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
  return formatDisplayDateTime(value) || "Дата создания недоступна";
}

export function getLegacyBackupHistoryNotice(preview: BackupPreview) {
  if (!preview.preservesExistingAiHistory) return null;
  return "Эта резервная копия создана старой версией NoteFlow и не содержит историю ИИ-чатов. Существующие чаты по базе и чаты заметок, которые останутся в профиле, не будут удалены.";
}

export function getBackupSummaryRows(contents: BackupPreview["contents"]) {
  return [
    ["Заметки", contents.notes],
    ["Проекты", contents.projects],
    ["Теги", contents.tags],
    ["Вложения", contents.attachments],
    ["Чаты ИИ", contents.noteAiChats],
    ["Чаты по базе", contents.ragChats],
  ] as const;
}

export function getBackupPreviewErrorMessage() {
  return "Не удалось прочитать резервную копию. Убедитесь, что выбран корректный ZIP-файл NoteFlow.";
}

export function getBackupRestoreErrorMessage(appliedButNotReloaded: boolean) {
  return appliedButNotReloaded
    ? "Резервная копия восстановлена, но интерфейс не удалось обновить. Перезапустите NoteFlow."
    : "Не удалось восстановить резервную копию. Текущие данные не изменены.";
}
