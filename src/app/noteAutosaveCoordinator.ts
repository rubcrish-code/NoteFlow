export interface PendingSaveVersion {
  expectedContentVersion: number;
  noteId: string;
  sequence: number;
}

export function hasNewerPendingSave(
  pendingSave: PendingSaveVersion | null,
  completedNoteId: string,
  completedSequence: number,
) {
  return Boolean(
    pendingSave &&
      pendingSave.noteId === completedNoteId &&
      pendingSave.sequence > completedSequence,
  );
}

export function advancePendingSaveVersion<T extends PendingSaveVersion>(
  pendingSave: T | null,
  completedNoteId: string,
  completedSequence: number,
  savedContentVersion: number,
): T | null {
  if (!hasNewerPendingSave(pendingSave, completedNoteId, completedSequence) || !pendingSave) {
    return pendingSave;
  }
  return { ...pendingSave, expectedContentVersion: savedContentVersion };
}

export function shouldRestoreFailedSave<T extends PendingSaveVersion>(
  pendingSave: T | null,
  failedSave: T,
) {
  return !pendingSave || pendingSave.sequence <= failedSave.sequence;
}
