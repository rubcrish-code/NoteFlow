import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { act, createElement as h } from "react";
import { JSDOM } from "jsdom";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { PendingNoteSaves } from "../src/app/noteAutosaveCoordinator";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
  Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  DOMParser: dom.window.DOMParser, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
})) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
const { createRoot } = await import("react-dom/client");
Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const { DeleteAllNotesControl } = await import("../src/features/settings/DeleteAllNotesControl");
const service = await import("../src/services/dataService");
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); clearMocks(); });
after(() => { dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
const summary = { notes: 5, archivedNotes: 2, revisions: 11, noteChats: 1, ragChats: 2 };
const result = { deletedNotes: 5, cleanupPending: false };
function button(label: string) { const value = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label); assert.ok(value, label); return value; }
async function click(label: string) { await act(async () => button(label).click()); }
async function type(value: string) {
  const input = document.querySelector('input[aria-label="Подтверждение удаления всех заметок"]'); assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function mount(onDelete: () => Promise<typeof result> = async () => result, count = summary, onToast = (_message: string) => {}) {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(h(DeleteAllNotesControl, { getSummary: async () => count, onDelete, onToast })));
}
async function confirm() { await click("Удалить все заметки"); await click("Продолжить"); await type("УДАЛИТЬ ВСЕ ЗАМЕТКИ"); }
describe("bulk delete actual confirmation UI", () => {
  it("renders only a cross without the clear-formatting icon's underline, including when disabled", async () => {
    for (const count of [summary, { ...summary, notes: 0 }]) {
      await mount(undefined, count);
      const control = button("Удалить все заметки");
      const svg = control.querySelector("svg");
      assert.ok(svg);
      assert.equal(svg.children.length, 1);
      assert.equal(svg.firstElementChild?.tagName.toLowerCase(), "path");
      assert.match(svg.firstElementChild?.getAttribute("d") ?? "", /^M\d+ \d+l\d+ \d+M\d+ \d+L\d+ \d+$/);
      assert.equal(control.disabled, count.notes === 0);
      await act(async () => root!.unmount());
      root = undefined;
      document.body.replaceChildren();
    }
  });
  it("shows real inclusive counts and the preserved profile, cancel first step is a no-op", async () => {
    let calls = 0; await mount(async () => { calls++; return result; }); await click("Удалить все заметки");
    assert.match(document.body.textContent ?? "", /5 заметок.*в архиве: 2/s);
    assert.match(document.body.textContent ?? "", /чатов: 3/); assert.match(document.body.textContent ?? "", /несохранённых изменений/);
    assert.match(document.body.textContent ?? "", /проекты и теги/); await click("Отмена"); assert.equal(calls, 0); assert.equal(document.querySelector('[role="dialog"]'), null);
  });
  it("requires the exact case-sensitive phrase; second cancel does not mutate", async () => {
    let calls = 0; await mount(async () => { calls++; return result; }); await click("Удалить все заметки"); await click("Продолжить");
    for (const value of ["", "удалить все заметки", "УДАЛИТЬ ВСЕ", "УДАЛИТЬ ВСЕ ЗАМЕТКИ!"]) { await type(value); assert.equal(button("Удалить").disabled, true); }
    await type(" УДАЛИТЬ ВСЕ ЗАМЕТКИ "); assert.equal(button("Удалить").disabled, false); await click("Отмена"); assert.equal(calls, 0);
  });
  it("Esc dismisses the second confirmation without deleting", async () => {
    let calls = 0; await mount(async () => { calls++; return result; }); await confirm();
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 150)); });
    assert.equal(calls, 0); assert.equal(document.querySelector('[role="dialog"]'), null);
  });
  it("loading prevents duplicate deletion and success updates empty state", async () => {
    let calls = 0; let finish!: (value: typeof result) => void; const gate = new Promise<typeof result>((resolve) => { finish = resolve; }); const toasts: string[] = [];
    await mount(() => { calls++; return gate; }, summary, (message) => toasts.push(message)); await confirm(); await click("Удалить");
    assert.equal(button("Удаляем…").disabled, true); await click("Удаляем…"); assert.equal(calls, 1); assert.equal(button("Отмена").disabled, true);
    await act(async () => finish(result)); assert.equal(button("Удалить все заметки").disabled, true); assert.match(document.body.textContent ?? "", /Заметок пока нет/); assert.deepEqual(toasts, ["Все заметки удалены."]);
  });
  it("failure stays retryable and does not expose SQL, paths or contents", async () => {
    let calls = 0; await mount(async () => { if (++calls === 1) throw new Error("SQL DELETE D:/private note text"); return result; }); await confirm(); await click("Удалить");
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /Не удалось удалить заметки/);
    assert.doesNotMatch(document.body.textContent ?? "", /SQL|D:\/private|note text/); assert.equal(button("Удалить").disabled, false); await click("Удалить"); assert.equal(calls, 2);
  });
  it("zero notes cannot open destructive flow", async () => { await mount(undefined, { ...summary, notes: 0 }); await click("Удалить все заметки"); assert.equal(document.querySelector('[role="dialog"]'), null); });
  it("reports post-commit GC retry honestly without treating deletion as failure", async () => { const toasts: string[] = []; await mount(async () => ({ ...result, cleanupPending: true }), summary, (message) => toasts.push(message)); await confirm(); await click("Удалить"); assert.match(toasts[0], /заметки удалены.*следующем запуске/); });
  it("uses typed backend-owned bulk commands, never a per-note loop", async () => { const calls: string[] = []; mockIPC((command) => { calls.push(command); return command === "delete_all_notes" ? result : summary; }); assert.deepEqual(await service.getDeleteAllNotesSummary(), summary); assert.deepEqual(await service.deleteAllNotes(), result); assert.deepEqual(calls, ["get_delete_all_notes_summary", "delete_all_notes"]); });
});

function queue() { const saves = new PendingNoteSaves<{ noteId: string; sequence: number; expectedContentVersion: number }>(); saves.enqueue({ noteId: "A", sequence: 1, expectedContentVersion: 0 }); return saves; }
describe("bulk delete autosave coordination", () => {
  it("does not flush unsent drafts, invalidates them only after successful delete", async () => { const saves = queue(); let writes = 0; await saves.deleteAfterInFlight(async () => { await saves.flush(async () => { writes++; return { contentVersion: 1 }; }, () => assert.fail("saved")); return result; }); assert.equal(writes, 0); assert.equal(saves.hasPending(), false); });
  it("failed deletion retains the draft and resumes saving", async () => { const saves = queue(); await assert.rejects(saves.deleteAfterInFlight(async () => { throw new Error("rollback"); })); assert.equal(saves.get("A")?.sequence, 1); let writes = 0; await saves.flush(async () => { writes++; return { contentVersion: 1 }; }, () => {}); assert.equal(writes, 1); });
  it("settles an in-flight write before delete, without sending the next draft", async () => {
    const saves = queue(); let finish!: () => void; const gate = new Promise<void>((resolve) => { finish = resolve; }); const events: string[] = [];
    const flush = saves.flush(async () => { events.push("write"); await gate; return { contentVersion: 1 }; }, () => events.push("saved")); saves.enqueue({ noteId: "A", sequence: 2, expectedContentVersion: 0 });
    const remove = saves.deleteAfterInFlight(async () => { events.push("delete"); return result; }); finish(); await flush; await remove;
    assert.deepEqual(events, ["write", "saved", "delete"]); assert.equal(saves.hasPending(), false);
  });
  it("invalidated late successes cannot update UI or advance a new generation", async () => { const saves = queue(); let finish!: () => void; const gate = new Promise<void>((resolve) => { finish = resolve; }); let callbacks = 0; const flush = saves.flush(async () => { await gate; return { contentVersion: 1 }; }, () => callbacks++); saves.clear(); finish(); await flush; assert.equal(callbacks, 0); assert.equal(saves.hasPending(), false); });
  it("invalidated late failures cannot restore a deleted draft", async () => { const saves = queue(); let finish!: () => void; const gate = new Promise<void>((resolve) => { finish = resolve; }); const flush = saves.flush(async () => { await gate; throw new Error("missing note"); }, () => {}); saves.clear(); finish(); await flush; assert.equal(saves.hasPending(), false); });
});

it("actual AppShell clears the editor and reloads preserved projects/tags and RAG history without restart", async () => {
  const { AppShell } = await import("../src/app/AppShell");
  const { DEFAULT_UI_SETTINGS } = await import("../src/services/uiSettingsService");
  let deleted = false;
  let ragLoads = 0;
  const unknown = new Set<string>();
  const note = { id: "bulk-note", title: "Old note", contentMarkdown: "Old text", plainText: "Old text", contentHtml: "<p>Old text</p>", contentJson: { type: "doc", content: [] }, contentVersion: 1, contentSidecars: [], attachments: [], tags: [], project: "", isFavorite: false, isPinned: false, noteDate: "2026-09-13", wordCount: 2, createdAt: "2026-09-13T12:00:00Z", updatedAt: "2026-09-13T12:00:00Z" };
  const project = { id: "project", title: "Preserved project", description: "", color: "blue", notes: 1, tasks: 0 };
  const tag = { id: "tag", name: "Preserved tag", count: 1, color: "blue" };
  mockIPC((command) => {
    if (command === "load_workspace") return { notes: [note], projects: [project], tags: [tag], archiveItems: [], dataLocation: { dataDir: "", databasePath: "" } };
    if (command === "get_first_run_state") return { required: false };
    if (command === "get_ui_settings" || command === "update_ui_settings") return DEFAULT_UI_SETTINGS;
    if (command === "get_delete_all_notes_summary") return { ...summary, notes: deleted ? 0 : 1 };
    if (command === "delete_all_notes") { deleted = true; return { ...result, deletedNotes: 1 }; }
    if (command === "list_projects") return [{ ...project, notes: deleted ? 0 : 1 }];
    if (command === "list_tags") return [{ ...tag, count: deleted ? 0 : 1 }];
    if (["list_llm_providers", "list_embedding_profiles", "list_note_chat_messages", "list_archive"].includes(command)) return [];
    if (command === "list_rag_chats") { ragLoads++; return []; }
    if (command === "get_note_ai_status") return { available: false, privacyAccepted: false, reason: "no_provider" };
    if (command === "get_knowledge_index_status") return { chunkCount: 0, chunkerVersion: 1, failedNotes: 0, indexedNotes: 0, pendingNotes: 0, totalNotes: deleted ? 0 : 1, status: "current" };
    if (command.startsWith("plugin:")) return null;
    unknown.add(command); throw new Error(command);
  });
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  async function wait(predicate: () => boolean) { for (let i = 0; i < 100; i++) { if (predicate()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); } assert.fail("DOM did not update"); }
  await act(async () => root!.render(h(AppShell)));
  await wait(() => Boolean(container.querySelector(".tiptap")));
  await click("Настройки"); await wait(() => Boolean(container.querySelector(".settings-layout-inner")));
  await click("Данные и экспорт"); await wait(() => Boolean(container.querySelector(".bulk-delete-zone")));
  await confirm(); await click("Удалить"); assert.equal(deleted, true);
  await click("Все заметки"); await wait(() => !container.querySelector(".tiptap"));
  assert.equal(container.querySelector(".note-item"), null); assert.doesNotMatch(container.textContent ?? "", /Old note|Old text/);
  await click("Проекты"); await wait(() => (container.textContent ?? "").includes("Preserved project"));
  await click("Теги"); await wait(() => (container.textContent ?? "").includes("Preserved tag"));
  await click("ИИ-чат по базе"); await wait(() => ragLoads > 0);
  assert.doesNotMatch(container.textContent ?? "", /Old note|Old text/); assert.deepEqual([...unknown], []);
});
