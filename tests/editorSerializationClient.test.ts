import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { createEditorSerializationClient } from "../src/features/editor/editorSerializationClient";
import { markdownToTiptapDoc } from "../src/features/editor/markdownService";
import { serializeEditorDocumentForStorage } from "../src/features/editor/editorContentSerializer";
import type { EditorSerializationRequest, EditorSerializationResponse } from "../src/features/editor/editorSerializationProtocol";

const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent<EditorSerializationResponse>) => void) | null = null;
  onerror: (() => void) | null = null; onmessageerror: (() => void) | null = null;
  requests: EditorSerializationRequest[] = []; terminated = false;
  constructor() { instances.push(this); }
  postMessage(request: EditorSerializationRequest) { this.requests.push(request); }
  terminate() { this.terminated = true; }
  respond(index = 0) { const { id, snapshot } = this.requests[index]; this.onmessage?.({ data: { id, result: serializeEditorDocumentForStorage(snapshot.document, snapshot.contentHtml) } } as MessageEvent<EditorSerializationResponse>); }
}
function install(value: typeof FakeWorker | undefined) { Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value }); }
function snapshot(text = "Русский **текст**") { return { noteId: "qa", document: markdownToTiptapDoc(text), contentHtml: "<p>HTML cache</p>" }; }
afterEach(() => { if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor); else Reflect.deleteProperty(globalThis, "Worker"); instances.length = 0; });
it("uses one worker and preserves byte-identical canonical output with the supplied HTML cache", async () => {
  install(FakeWorker); const client = createEditorSerializationClient();
  assert.equal(client.usesMainThreadFallback(), false);
  for (const text of ["Текст", "Стоимость **следующая -**", "- [ ] Задача"]) {
    const input = snapshot(text), pending = client.prepare(input), worker = instances[0]; worker.respond(worker.requests.length - 1);
    assert.deepEqual(await pending, serializeEditorDocumentForStorage(input.document, input.contentHtml));
  }
  assert.equal(instances.length, 1); client.dispose(); assert.equal(instances[0].terminated, true);
});
it("unavailable Worker falls back without changing the serializer", async () => {
  install(undefined); const client = createEditorSerializationClient(), input = snapshot();
  assert.equal(client.usesMainThreadFallback(), true);
  assert.deepEqual(await client.prepare(input), serializeEditorDocumentForStorage(input.document, input.contentHtml)); client.dispose();
});
it("worker errors are private-safe and the next explicit retry can save through the fallback", async () => {
  install(FakeWorker); const client = createEditorSerializationClient(), input = snapshot("private note");
  const pending = client.prepare(input); const failure = assert.rejects(pending, error => error instanceof Error && !error.message.includes("private note"));
  instances[0].onerror?.(); await failure;
  assert.equal(client.usesMainThreadFallback(), true);
  assert.deepEqual(await client.prepare(input), serializeEditorDocumentForStorage(input.document, input.contentHtml)); client.dispose();
});
it("dispose rejects pending work safely and no later message can resurrect it", async () => {
  install(FakeWorker); const client = createEditorSerializationClient(), pending = client.prepare(snapshot());
  const failure = assert.rejects(pending, /Не удалось подготовить/); client.dispose(); instances[0].respond(); await failure;
  await assert.rejects(client.prepare(snapshot()), /Не удалось подготовить/);
});
it("message decoding failure rejects safely and exposes deferred fallback mode", async () => {
  install(FakeWorker); const client = createEditorSerializationClient(), pending = client.prepare(snapshot());
  const failure = assert.rejects(pending, /Не удалось подготовить/);
  instances[0].onmessageerror?.(); await failure;
  assert.equal(client.usesMainThreadFallback(), true);
  assert.deepEqual(await client.prepare(snapshot()), serializeEditorDocumentForStorage(snapshot().document, snapshot().contentHtml));
  client.dispose();
});
it("a nonresponsive Worker is bounded and can recover saving without an infinite retry", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  install(FakeWorker); const client = createEditorSerializationClient(), pending = client.prepare(snapshot());
  const failure = assert.rejects(pending, /Не удалось подготовить/);
  context.mock.timers.tick(30000); await failure;
  assert.equal(instances[0].terminated, true);
  assert.equal(client.usesMainThreadFallback(), true);
  await client.prepare(snapshot());
  assert.equal(instances.length, 1, "fallback must not recreate a failing Worker in a loop");
  client.dispose();
});
