import { Channel, isTauri } from "@tauri-apps/api/core";
import { invoke } from "./safeInvoke";

export interface AiStreamChunk { text: string; reset: boolean }
export interface AiRequestControl { requestId: string; onChunk: (chunk: AiStreamChunk) => void }
export function streamArguments(control?: AiRequestControl) {
  if (!control || !isTauri()) return {};
  const onDelta = new Channel<AiStreamChunk>(); onDelta.onmessage = control.onChunk;
  return { requestId: control.requestId, onDelta };
}
export interface AiJob<T> {
  requestId: string; phase: "retrieving" | "generating" | "stopping" | "success" | "error" | "stopped";
  question: string; userMessageId: string; text: string; error: string; result?: T;
}
export interface AiJobContext {
  control: AiRequestControl;
  check: () => void;
  update: (patch: Partial<Pick<AiJob<unknown>, "phase" | "userMessageId">>) => void;
}

export class AiBackground<T> {
  private jobs = new Map<string, AiJob<T>>();
  private tokens = new Map<string, AbortController>();
  private listeners = new Set<() => void>();
  private pending = new Set<Promise<boolean>>();
  private suspended = false;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get(key: string) { return this.jobs.get(key) ?? null; }
  busy(key: string) { const phase = this.get(key)?.phase; return phase === "retrieving" || phase === "generating" || phase === "stopping"; }
  private update(key: string, requestId: string, patch: Partial<AiJob<T>>) {
    const current = this.jobs.get(key); if (!current || current.requestId !== requestId) return;
    this.jobs.set(key, { ...current, ...patch }); this.listeners.forEach((listener) => listener());
  }
  start(key: string, question: string, task: (context: AiJobContext) => Promise<T>, userMessageId = ""): Promise<boolean> {
    const request = this.run(key, question, task, userMessageId);
    this.pending.add(request); void request.finally(() => this.pending.delete(request));
    return request;
  }
  private async run(key: string, question: string, task: (context: AiJobContext) => Promise<T>, userMessageId: string): Promise<boolean> {
    if (this.suspended || this.busy(key)) return false;
    const requestId = crypto.randomUUID(); const token = new AbortController(); this.tokens.set(key, token);
    this.jobs.set(key, { requestId, phase: "retrieving", question, userMessageId, text: "", error: "" });
    this.listeners.forEach((listener) => listener());
    const check = () => { if (token.signal.aborted || this.get(key)?.requestId !== requestId) throw new Error("Запрос ИИ остановлен"); };
    try {
      const result = await task({ check, update: (patch) => this.update(key, requestId, patch), control: { requestId, onChunk: (chunk) => {
        if (!token.signal.aborted) this.update(key, requestId, { text: chunk.reset ? chunk.text : (this.get(key)?.text ?? "") + chunk.text });
      } } });
      check(); this.update(key, requestId, { phase: "success", result });
    } catch (error) {
      this.update(key, requestId, { phase: token.signal.aborted ? "stopped" : "error", text: "", error: token.signal.aborted ? "Запрос ИИ остановлен" : error instanceof Error ? error.message : "Не удалось получить ответ модели" });
    } finally { if (this.get(key)?.requestId === requestId) this.tokens.delete(key); }
    return true;
  }
  async stop(key: string) {
    const job = this.get(key); if (!job || !this.busy(key)) return;
    this.tokens.get(key)?.abort(); this.update(key, job.requestId, { phase: "stopping" });
    if (isTauri()) { try { await invoke<void>("cancel_ai_operation", { requestId: job.requestId }); } catch { /* The bounded transport still terminates; do not mark completion before it settles. */ } }
  }
  forget(key: string) { void this.stop(key); this.tokens.delete(key); this.jobs.delete(key); this.listeners.forEach((listener) => listener()); }
  reset() { for (const key of [...this.jobs.keys()]) this.forget(key); }
  async stopAllAndWait() { this.suspended = true; await Promise.all([...this.jobs.keys()].map((key) => this.stop(key))); await Promise.all([...this.pending]); this.reset(); }
  resume() { this.suspended = false; }
}
