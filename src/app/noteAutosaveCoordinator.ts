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

export class PendingNoteSaves<T extends PendingSaveVersion> {
  private readonly pending = new Map<string, T>();
  private inFlight: Promise<void> | null = null;
  private generation = 0;
  private suspended = false;

  enqueue(save: T) {
    const current = this.pending.get(save.noteId);
    if (!current || current.sequence <= save.sequence) {
      this.pending.set(save.noteId, save);
    }
  }

  get(noteId: string) {
    return this.pending.get(noteId) ?? null;
  }

  hasPending() {
    return this.pending.size > 0 || this.inFlight !== null;
  }

  clear() {
    this.pending.clear();
    this.generation += 1;
  }

  async deleteAfterInFlight<TResult>(remove: () => Promise<TResult>, noteIds?: readonly string[]): Promise<TResult> {
    if (this.suspended) throw new Error("Операция с заметками уже выполняется");
    this.suspended = true;
    try {
      // Do not flush unsent drafts. Settle only the write already dispatched.
      await this.inFlight?.catch(() => undefined);
      const result = await remove();
      if (noteIds) {
        noteIds.forEach((id) => this.pending.delete(id));
      } else {
        this.clear();
      }
      return result;
    } finally {
      this.suspended = false;
    }
  }

  flush<Saved extends { contentVersion: number }>(
    persist: (save: T) => Promise<Saved>,
    onSaved: (save: T, saved: Saved, hasNewerSave: boolean) => void,
  ): Promise<void> {
    if (this.suspended) return Promise.resolve();
    if (this.inFlight) {
      return this.inFlight;
    }

    const run = this.drain(persist, onSaved);
    this.inFlight = run;
    void run.finally(() => {
      if (this.inFlight === run) {
        this.inFlight = null;
      }
    }).catch(() => undefined);
    return run;
  }

  private async drain<Saved extends { contentVersion: number }>(
    persist: (save: T) => Promise<Saved>,
    onSaved: (save: T, saved: Saved, hasNewerSave: boolean) => void,
  ) {
    const generation = this.generation;
    while (!this.suspended && generation === this.generation && this.pending.size > 0) {
      const save = [...this.pending.values()].reduce((first, next) =>
        next.sequence < first.sequence ? next : first,
      );
      this.pending.delete(save.noteId);

      let saved: Saved;
      try {
        saved = await persist(save);
      } catch (error) {
        if (generation !== this.generation) return;
        if (shouldRestoreFailedSave(this.get(save.noteId), save)) {
          this.pending.set(save.noteId, save);
        }
        throw error;
      }

      if (generation !== this.generation) return;

      const pending = this.get(save.noteId);
      const hasNewerSave = hasNewerPendingSave(pending, save.noteId, save.sequence);
      const advanced = advancePendingSaveVersion(pending, save.noteId, save.sequence, saved.contentVersion);
      if (advanced) {
        this.pending.set(save.noteId, advanced);
      }
      onSaved(save, saved, hasNewerSave);
    }
  }
}
