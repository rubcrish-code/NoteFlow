import assert from "node:assert/strict";
import { it } from "node:test";
import { EditorSavePreparation, flushPreparedEditorSaves } from "../src/features/editor/editorSavePreparation";
import { PendingNoteSaves } from "../src/app/noteAutosaveCoordinator";
import { markdownToTiptapDoc } from "../src/features/editor/markdownService";
import { serializeEditorDocumentForStorage } from "../src/features/editor/editorContentSerializer";

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function scheduler() { const jobs = new Set<() => void>(); return { schedule(run: () => void) { jobs.add(run); return () => { jobs.delete(run); }; }, run() { const next = jobs.values().next().value; if (next) { jobs.delete(next); next(); } }, get count() { return jobs.size; } }; }
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

it("defers snapshot creation, coalesces rapid edits, and flushes the actual latest document", async () => {
  const queue = scheduler(); const delivered: string[] = []; let reads = 0;
  const state = new EditorSavePreparation(async (snapshot: string) => snapshot, (value) => delivered.push(value), assert.fail, queue.schedule);
  state.enqueue(() => { reads++; return "A"; }); state.enqueue(() => { reads++; return "B"; });
  assert.equal(reads, 0); assert.equal(queue.count, 1); assert.equal(state.hasPending(), true);
  await state.flush(); assert.equal(reads, 1); assert.deepEqual(delivered, ["B"]); assert.equal(queue.count, 0); assert.equal(state.hasPending(), false);
});
it("deferred main-thread fallback coalesces edits and reads only at the existing autosave/close flush", async () => {
  let reads = 0; const delivered: string[] = [];
  const state = new EditorSavePreparation(async (value: string) => value, value => delivered.push(value), assert.fail, () => () => undefined);
  for (let i = 0; i < 50; i++) state.enqueue(() => { reads++; return "latest"; });
  await settle(); assert.equal(reads, 0); assert.equal(state.hasPending(), true);
  await state.flush(); assert.equal(reads, 1); assert.deepEqual(delivered, ["latest"]);
});
it("out-of-order preparation A cannot deliver over a newer edit B", async () => {
  const queue = scheduler(); const a = deferred<string>(); const delivered: string[] = []; const reads: string[] = [];
  const state = new EditorSavePreparation((value: string) => { reads.push(value); return value === "A" ? a.promise : Promise.resolve(value); }, value => delivered.push(value), assert.fail, queue.schedule);
  state.enqueue(() => "A"); queue.run(); await settle(); state.enqueue(() => "B"); state.enqueue(() => "C");
  a.resolve("A"); await state.flush(); assert.deepEqual(reads, ["A", "C"]); assert.deepEqual(delivered, ["C"]);
});
it("restore/import generation discards a worker response and reloads the same note safely", async () => {
  const queue = scheduler(); const old = deferred<string>(); const delivered: string[] = [];
  const state = new EditorSavePreparation((value: string) => value === "old" ? old.promise : Promise.resolve(value), value => delivered.push(value), assert.fail, queue.schedule);
  state.enqueue(() => "old"); queue.run(); await settle(); state.discard();
  state.enqueue(() => "restored edit"); old.resolve("old"); await state.flush(); assert.deepEqual(delivered, ["restored edit"]);
});
it("unmount/delete cancellation never delivers or retries an obsolete snapshot", async () => {
  const queue = scheduler(); const pending = deferred<string>(); const delivered: string[] = [];
  const state = new EditorSavePreparation(() => pending.promise, value => delivered.push(value), assert.fail, queue.schedule);
  state.enqueue(() => "deleted"); queue.run(); await settle(); state.discard(); pending.reject(new Error("worker stopped")); await settle();
  await state.flush(); assert.deepEqual(delivered, []); assert.equal(state.hasPending(), false);
});
it("failed bulk deletion preserves a worker draft and resumes it without writing during deletion", async () => {
  const queue = scheduler(), worker = deferred<string>(); const delivered: string[] = [];
  const state = new EditorSavePreparation(() => worker.promise, value => delivered.push(value), assert.fail, queue.schedule);
  state.enqueue(() => "unsaved draft"); queue.run(); await settle(); state.suspend(); worker.resolve("unsaved draft"); await settle();
  assert.deepEqual(delivered, []); assert.equal(state.hasPending(), true);
  await assert.rejects(state.flush(), /приостановлено/);
  state.resume(); await state.flush(); assert.deepEqual(delivered, ["unsaved draft"]);
});
it("successful bulk deletion discards a suspended draft and its late worker response", async () => {
  const queue = scheduler(), worker = deferred<string>(); const delivered: string[] = [];
  const state = new EditorSavePreparation(() => worker.promise, value => delivered.push(value), assert.fail, queue.schedule);
  state.enqueue(() => "removed draft"); queue.run(); await settle(); state.suspend(); state.discard(); state.resume(); worker.resolve("removed draft"); await settle();
  await state.flush(); assert.deepEqual(delivered, []); assert.equal(state.hasPending(), false);
});
it("serialization failure keeps the previous committed content and supports explicit retry", async () => {
  const queue = scheduler(); let fail = true, errors = 0, committed = "previous";
  const state = new EditorSavePreparation(async (value: string) => { if (fail) throw new Error("private input"); return value; }, value => { committed = value; }, () => { errors++; }, queue.schedule);
  state.enqueue(() => "next"); await assert.rejects(state.flush(), /private input/); assert.equal(committed, "previous"); assert.equal(errors, 1);
  fail = false; await state.flush(); assert.equal(committed, "next");
});
it("navigation/close flush awaits preparation before the existing CAS queue", async () => {
  const queue = scheduler(); const worker = deferred<string>(); const persisted: string[] = [];
  const saves = new PendingNoteSaves<{ noteId: string; expectedContentVersion: number; sequence: number; text: string }>();
  const state = new EditorSavePreparation(() => worker.promise, text => saves.enqueue({ noteId: "note", expectedContentVersion: 7, sequence: 1, text }), assert.fail, queue.schedule);
  state.enqueue(() => "latest"); const flush = (async () => { await state.flush(); await saves.flush(async save => { assert.equal(save.expectedContentVersion, 7); persisted.push(save.text); return { contentVersion: 8 }; }, () => undefined); })();
  await settle(); assert.deepEqual(persisted, []); worker.resolve("latest"); await flush; assert.deepEqual(persisted, ["latest"]);
});
it("close/navigation drain includes edits made while a previous SQLite write is in flight", async () => {
  const queue = scheduler(), firstWrite = deferred<void>(); const persisted: string[] = [];
  const saves = new PendingNoteSaves<{ noteId: string; expectedContentVersion: number; sequence: number; text: string }>();
  let sequence = 0, version = 3;
  const state = new EditorSavePreparation(async (value: string) => value, text => saves.enqueue({ noteId: "note", sequence: ++sequence, expectedContentVersion: version, text }), assert.fail, queue.schedule);
  const persist = () => saves.flush(async save => { persisted.push(save.text); if (save.text === "A") await firstWrite.promise; return { contentVersion: ++version }; }, () => undefined);
  state.enqueue(() => "A"); const closing = flushPreparedEditorSaves(() => state, persist, () => saves.hasPending());
  await settle(); state.enqueue(() => "B"); firstWrite.resolve(); await closing;
  assert.deepEqual(persisted, ["A", "B"]); assert.equal(state.getStatus(), "idle"); assert.equal(saves.hasPending(), false);
});
for (const source of ["Стоимость **следующая -**", "Русский **текст**\n\n- [ ] Задача", "| A | B |\n| --- | --- |\n| **Ячейка** | Текст |", "# Заголовок\n\n[Ссылка](noteflow://note/target)"]) {
  it(`prepared canonical output is byte-identical to the existing serializer: ${source.slice(0, 22)}`, async () => {
    const queue = scheduler(); const document = markdownToTiptapDoc(source); const expected = serializeEditorDocumentForStorage(document);
    let actual: typeof expected | undefined;
    const state = new EditorSavePreparation(async (input: typeof document) => serializeEditorDocumentForStorage(input), value => { actual = value; }, assert.fail, queue.schedule);
    state.enqueue(() => document); await state.flush(); assert.deepEqual(actual, expected);
  });
}
