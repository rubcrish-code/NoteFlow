import type { ExportDocument, NoteExportFormat } from "./exportDocument";

export function generateInWorker(format: Exclude<NoteExportFormat, "md">, input: ExportDocument): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
    const timer = window.setTimeout(() => finish(), 120_000);
    function finish(bytes?: Uint8Array) {
      window.clearTimeout(timer);
      worker.terminate();
      if (bytes) resolve(bytes);
      else reject(new Error(`Не удалось создать ${format.toUpperCase()}.`));
    }
    worker.onmessage = (event: MessageEvent<{ bytes?: Uint8Array; error?: boolean }>) => finish(event.data.bytes);
    worker.onerror = () => finish();
    worker.postMessage({ format, input }, input.images.map((image) => image.bytes.buffer));
  });
}
