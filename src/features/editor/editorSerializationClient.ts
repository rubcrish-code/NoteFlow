import { translate } from "../../shared/i18n";
import type { EditorContentSerializeResult } from "./editorContentSerializer";
import type { EditorSerializationRequest, EditorSerializationResponse, EditorSerializationSnapshot } from "./editorSerializationProtocol";

export function createEditorSerializationClient() {
  let worker: Worker | null = null;
  let nextId = 0;
  let disposed = false;
  let unavailable = false;
  const pending = new Map<number, { resolve: (value: EditorContentSerializeResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const error = () => new Error(translate("ui.f8d78486eb77"));
  const stop = () => {
    worker?.terminate(); worker = null;
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error()); }
    pending.clear();
  };
  const start = () => {
    if (worker) return worker;
    worker = new Worker(new URL("./editorSerialization.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<EditorSerializationResponse>) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id); clearTimeout(job.timer);
      if ("result" in data) job.resolve(data.result); else job.reject(error());
    };
    worker.onerror = () => { unavailable = true; stop(); };
    worker.onmessageerror = () => { unavailable = true; stop(); };
    return worker;
  };
  return {
    usesMainThreadFallback() { return typeof Worker === "undefined" || unavailable; },
    async prepare(snapshot: EditorSerializationSnapshot): Promise<EditorContentSerializeResult> {
      if (disposed) throw error();
      const fallback = async () => {
        const { serializeEditorDocumentForStorage } = await import("./editorContentSerializer");
        return serializeEditorDocumentForStorage(snapshot.document, snapshot.contentHtml);
      };
      if (typeof Worker === "undefined" || unavailable) return fallback();
      let target: Worker;
      try { target = start(); } catch { unavailable = true; return fallback(); }
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { unavailable = true; stop(); }, 30000);
        pending.set(id, { resolve, reject, timer });
        try { target.postMessage({ id, snapshot } satisfies EditorSerializationRequest); }
        catch { stop(); }
      });
    },
    dispose() { disposed = true; stop(); },
  };
}
