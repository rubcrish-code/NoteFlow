import { translate } from "../../shared/i18n";
export interface EditorSavePreparationControl {
  flush(): Promise<void>;
  discard(): void;
  suspend(): void;
  resume(): void;
  hasPending(): boolean;
  getStatus(): "idle" | "pending" | "error";
}

export type PreparationScheduler = (run: () => void) => () => void;

// At most one preparation runs; newer edits replace only the unsent snapshot.
export class EditorSavePreparation<Snapshot, Prepared> implements EditorSavePreparationControl {
  private latest: { sequence: number; read: () => Snapshot } | null = null;
  private active: { generation: number; promise: Promise<void> } | null = null;
  private generation = 0;
  private sequence = 0;
  private cancelScheduled: (() => void) | null = null;
  private error: unknown;
  private suspended = false;

  constructor(
    private readonly prepare: (snapshot: Snapshot) => Promise<Prepared>,
    private readonly deliver: (prepared: Prepared, snapshot: Snapshot) => void,
    private readonly onError: () => void,
    private readonly schedule: PreparationScheduler,
  ) {}

  enqueue(read: () => Snapshot) {
    this.latest = { sequence: ++this.sequence, read };
    this.error = undefined;
    this.scheduleLatest();
  }

  hasPending() { return Boolean(this.latest || this.active?.generation === this.generation); }
  getStatus(): "idle" | "pending" | "error" { return this.error ? "error" : this.hasPending() ? "pending" : "idle"; }
  suspend() { this.suspended = true; this.cancelScheduled?.(); this.cancelScheduled = null; }
  resume() { this.suspended = false; this.scheduleLatest(); }

  discard() {
    this.generation += 1;
    this.latest = null;
    this.error = undefined;
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }

  async flush() {
    if (this.suspended) throw new Error(translate("ui.6161231bcf29"));
    this.error = undefined;
    while (this.hasPending()) {
      if (this.error) throw this.error;
      this.cancelScheduled?.();
      this.cancelScheduled = null;
      if (!this.active) this.start();
      const active = this.active;
      if (active) await active.promise.catch((error: unknown) => { if (active.generation === this.generation) throw error; });
    }
  }

  private scheduleLatest() {
    if (this.suspended || this.cancelScheduled || this.active || !this.latest || this.error) return;
    this.cancelScheduled = this.schedule(() => { this.cancelScheduled = null; this.start(); });
  }

  private start() {
    const job = this.latest;
    if (this.suspended || this.active || !job) return;
    const generation = this.generation;
    const promise = Promise.resolve().then(async () => {
      const snapshot = job.read();
      const prepared = await this.prepare(snapshot);
      if (this.suspended || generation !== this.generation || job.sequence !== this.latest?.sequence) return;
      this.deliver(prepared, snapshot);
      if (this.latest?.sequence === job.sequence) this.latest = null;
    }).catch((error: unknown) => {
      if (generation === this.generation && job.sequence === this.latest?.sequence) {
        this.error = error;
        this.onError();
        throw error;
      }
    });
    this.active = { generation, promise };
    void promise.finally(() => {
      if (this.active?.promise === promise) this.active = null;
      this.scheduleLatest();
    }).catch(() => undefined);
  }
}

export async function flushPreparedEditorSaves(
  current: () => EditorSavePreparationControl | null,
  persist: () => Promise<void>,
  hasPendingWrites: () => boolean,
) {
  do {
    await current()?.flush();
    await persist();
  } while (current()?.hasPending() || hasPendingWrites());
}

export const scheduleEditorPreparation: PreparationScheduler = (run) => {
  let timeout: number | undefined;
  const frame = window.requestAnimationFrame(() => { timeout = window.setTimeout(run, 0); });
  return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timeout); };
};
