import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interceptCloseRequest, waitForCloseFlush } from "../src/app/closeFlush.ts";
import { PendingNoteSaves } from "../src/app/noteAutosaveCoordinator.ts";

interface Draft {
  expectedContentVersion: number;
  noteId: string;
  sequence: number;
  text: string;
}

function draft(noteId: string, sequence: number, text: string, expectedContentVersion = 0): Draft {
  return { expectedContentVersion, noteId, sequence, text };
}

function memoryPersistence() {
  const stored = new Map<string, { contentVersion: number; text: string }>();
  const revisions: string[] = [];
  let failNext = false;
  const persist = async (save: Draft) => {
    if (failNext) {
      failNext = false;
      throw new Error("forced transaction failure");
    }
    const previous = stored.get(save.noteId);
    if ((previous?.contentVersion ?? 0) !== save.expectedContentVersion) {
      throw new Error("stale_write");
    }
    const contentVersion = save.expectedContentVersion + 1;
    stored.set(save.noteId, { contentVersion, text: save.text });
    revisions.push(save.noteId);
    return { contentVersion };
  };
  return { failOnce: () => { failNext = true; }, persist, revisions, stored };
}

describe("autosave failure safety", () => {
  it("project deletion invalidates only its own queued drafts and preserves unrelated edits", async () => {
    const saves = new PendingNoteSaves<Draft>();
    saves.enqueue(draft("project-note", 1, "to delete"));
    saves.enqueue(draft("other-note", 2, "must save"));
    await saves.deleteAfterInFlight(async () => {}, ["project-note"]);
    assert.equal(saves.get("project-note"), null);
    assert.equal(saves.get("other-note")?.text, "must save");
    const db = memoryPersistence();
    await saves.flush(db.persist, () => {});
    assert.equal(db.stored.get("other-note")?.text, "must save");
  });
  it("blocks an A to B switch after a failed flush and retains A until retry", async () => {
    const saves = new PendingNoteSaves<Draft>();
    const db = memoryPersistence();
    let activeNoteId = "A";
    saves.enqueue(draft("A", 1, "Несохранённый текст A"));
    db.failOnce();
    await assert.rejects(() => saves.flush(db.persist, () => undefined));
    if (!saves.hasPending()) activeNoteId = "B";
    assert.equal(activeNoteId, "A");
    assert.equal(saves.get("A")?.text, "Несохранённый текст A");
    assert.equal(db.stored.has("A"), false);
    assert.deepEqual(db.revisions, []);

    await saves.flush(db.persist, () => undefined);
    activeNoteId = "B";
    assert.equal(db.stored.get("A")?.text, "Несохранённый текст A");
    assert.equal(activeNoteId, "B");
    assert.equal(saves.hasPending(), false);
  });

  it("keeps A, B and C drafts isolated after a failed A write", async () => {
    const saves = new PendingNoteSaves<Draft>();
    const db = memoryPersistence();
    saves.enqueue(draft("A", 1, "A initial"));
    db.failOnce();
    await assert.rejects(() => saves.flush(db.persist, () => undefined));
    saves.enqueue(draft("B", 2, "B dirty"));
    saves.enqueue(draft("C", 3, "C dirty"));
    saves.enqueue(draft("A", 4, "A latest"));
    assert.equal(saves.get("A")?.text, "A latest");
    assert.equal(saves.get("B")?.text, "B dirty");
    assert.equal(saves.get("C")?.text, "C dirty");

    await saves.flush(db.persist, () => undefined);
    assert.deepEqual([...db.stored].map(([id, value]) => [id, value.text]), [
      ["B", "B dirty"], ["C", "C dirty"], ["A", "A latest"],
    ]);
    assert.equal(saves.hasPending(), false);
  });

  it("advances a newer draft after an in-flight save without losing edits", async () => {
    const saves = new PendingNoteSaves<Draft>();
    const db = memoryPersistence();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    saves.enqueue(draft("A", 1, "first"));
    const flush = saves.flush(async (save) => {
      if (save.sequence === 1) await gate;
      return db.persist(save);
    }, () => undefined);
    saves.enqueue(draft("A", 2, "latest"));
    release?.();
    await flush;
    assert.equal(db.stored.get("A")?.text, "latest");
    assert.equal(db.stored.get("A")?.contentVersion, 2);
  });

  it("does not report a stale-write conflict as saved or overwrite newer content", async () => {
    const saves = new PendingNoteSaves<Draft>();
    const db = memoryPersistence();
    await db.persist(draft("A", 1, "server version"));
    saves.enqueue(draft("A", 2, "local conflict", 0));
    await assert.rejects(() => saves.flush(db.persist, () => undefined), /stale_write/);
    assert.equal(db.stored.get("A")?.text, "server version");
    assert.equal(saves.get("A")?.text, "local conflict");
  });

  it("does not close after a failed flush and allows retry then restart", async () => {
    const saves = new PendingNoteSaves<Draft>();
    const db = memoryPersistence();
    saves.enqueue(draft("A", 1, "recover me"));
    db.failOnce();
    const failedClose = await waitForCloseFlush(() => saves.flush(db.persist, () => undefined), 50);
    assert.equal(failedClose, "failed");
    assert.equal(saves.get("A")?.text, "recover me");
    assert.equal(db.stored.has("A"), false);

    const successfulClose = await waitForCloseFlush(() => saves.flush(db.persist, () => undefined), 50);
    assert.equal(successfulClose, "completed");
    assert.equal(db.stored.get("A")?.text, "recover me");
    const reopened = db.stored.get("A");
    assert.equal(reopened?.text, "recover me");
  });

  it("bounds a hung close without treating it as success", async () => {
    const outcome = await waitForCloseFlush(() => new Promise<void>(() => undefined), 5);
    assert.equal(outcome, "timeout");
  });

  it("prevents a second native close request while the first flush is running", () => {
    let closing = false;
    let started = 0;
    let prevented = 0;
    const event = { preventDefault: () => { prevented += 1; } };
    const start = () => { closing = true; started += 1; };
    interceptCloseRequest(event, closing, start);
    interceptCloseRequest(event, closing, start);
    assert.equal(prevented, 2);
    assert.equal(started, 1);
  });
});
