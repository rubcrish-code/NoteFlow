import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiBackground } from "../src/services/aiBackground";

function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }

describe("RC4 application-owned AI requests", () => {
  it("streams parallel notes independently, reattaches partial state and removes subscribers", async () => {
    const jobs = new AiBackground<string>(); const a = deferred(); const b = deferred();
    let notifications = 0;
    const unsubscribe = jobs.subscribe(() => notifications++);
    const run = (id: string, gate: ReturnType<typeof deferred>) => jobs.start(id, id, async (job) => {
      job.update({ phase: "generating" }); job.control.onChunk({ text: `${id} partial`, reset: false });
      await gate.promise; job.check(); job.control.onChunk({ text: " complete", reset: false }); return id;
    });
    const first = run("A", a); const second = run("B", b);
    assert.equal(jobs.get("A")?.text, "A partial"); assert.equal(jobs.get("B")?.text, "B partial");
    unsubscribe(); const previous = notifications;
    b.resolve(); await second; assert.equal(jobs.get("B")?.result, "B");
    assert.equal(jobs.busy("A"), true); a.resolve(); await first;
    assert.equal(jobs.get("A")?.text, "A partial complete"); assert.equal(notifications, previous);
  });
  it("forget/reset reject late chunks and writes without resurrecting a deleted conversation", async () => {
    for (const removeAll of [false, true]) {
      const jobs = new AiBackground<string>(); const gate = deferred(); let writes = 0;
      const request = jobs.start("deleted", "question", async (job) => {
        job.control.onChunk({ text: "partial", reset: false }); await gate.promise;
        job.control.onChunk({ text: "late", reset: false }); job.check(); writes++; return "Wrong";
      });
      if (removeAll) jobs.reset(); else jobs.forget("deleted");
      gate.resolve(); await request; assert.equal(jobs.get("deleted"), null); assert.equal(writes, 0);
      await jobs.start("deleted", "fresh", async () => "New"); assert.equal(jobs.get("deleted")?.result, "New");
    }
  });
  it("keeps streamed content and completion with no UI subscribers and rejects duplicate sends", async () => {
    const jobs = new AiBackground<string>(); const gate = deferred(); let requests = 0;
    const request = jobs.start("note-A", "question", async ({ control }) => { requests++; control.onChunk({ text: "Русский ", reset: false }); await gate.promise; control.onChunk({ text: "🙂", reset: false }); return "Saved"; });
    assert.equal(jobs.get("note-A")?.text, "Русский ");
    assert.equal(await jobs.start("note-A", "duplicate", async () => "Wrong"), false);
    gate.resolve(); await request;
    assert.equal(jobs.get("note-A")?.text, "Русский 🙂"); assert.equal(jobs.get("note-A")?.result, "Saved"); assert.equal(requests, 1);
  });
  it("isolates conversation identity and rejects stopped late results before persistence", async () => {
    const jobs = new AiBackground<string>(); const gate = deferred(); let writes = 0;
    const a = jobs.start("A", "A question", async (job) => { await gate.promise; job.check(); writes++; return "A"; });
    await jobs.start("B", "B question", async () => "B"); await jobs.stop("A"); gate.resolve(); await a;
    assert.equal(writes, 0); assert.equal(jobs.get("A")?.phase, "stopped"); assert.equal(jobs.get("B")?.result, "B");
  });
  it("drains and suspends requests before restore, then permits only fresh jobs", async () => {
    const jobs = new AiBackground<string>(); const gate = deferred();
    const old = jobs.start("same-ID", "Before import", async (job) => { await gate.promise; job.check(); return "Old"; });
    const restore = jobs.stopAllAndWait();
    assert.equal(await jobs.start("same-ID", "Conflict", async () => "Wrong"), false);
    gate.resolve(); await old; await restore; assert.equal(jobs.get("same-ID"), null);
    jobs.resume(); await jobs.start("same-ID", "After import", async () => "New"); assert.equal(jobs.get("same-ID")?.result, "New");
  });
});
