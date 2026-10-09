import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Root } from "react-dom/client";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { Channel } from "@tauri-apps/api/core";
import type { AiStreamChunk } from "../src/services/aiBackground";
import type { RagLayoutMode } from "../src/features/rag/ragResponsiveLayout";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  DOMParser: dom.window.DOMParser,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
Object.defineProperty(dom.window, "matchMedia", {
  value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});

const { createRoot } = await import("react-dom/client");
const { RagChatWorkspace } = await import("../src/features/rag/RagChatWorkspace");
const { ragDrafts } = await import("../src/features/rag/ragDrafts");
const { ragJobs } = await import("../src/services/ragBackground");
const { NoteChatPanel } = await import("../src/features/note-chat/NoteChatPanel");
const { noteChatJobs, noteChatDrafts, forgetNoteChat, sendNoteChatInBackground } = await import("../src/services/noteChatBackground");
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  ragDrafts.reset();
  ragJobs.reset();
  noteChatJobs.reset();
  noteChatDrafts.reset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container, { onCaughtError() {} });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clearMocks();
});

after(() => {
  dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function syntheticNote(id: string) {
  return { id, title: id, plainText: "Synthetic note", contentMarkdown: "Synthetic note", noteDate: "2026-10-09", project: "", tags: [], attachments: [], contentSidecars: [], contentVersion: 0, editorDocument: { type: "doc" }, contentHtml: "", createdAt: timestamp, updatedAt: timestamp, dateLabel: "", summary: "", wordCount: 2 };
}
async function renderNote(id: string) {
  await act(async () => root.render(h(NoteChatPanel, { note: syntheticNote(id), onClose: () => root.render(null), onOpenAiSettings() {}, onResize() {}, onResetWidth() {}, onToast() {} })));
  await until(() => container.querySelector<HTMLTextAreaElement>("textarea")?.disabled === false);
}
function noteIpc(behavior: { saveUser?: () => unknown; answer?: () => unknown } = {}) {
  const history = new Map<string, Array<{ id: string; noteId: string; role: string; content: string; createdAt: string }>>();
  const commands: string[] = [];
  mockIPC((command, args) => {
    commands.push(command);
    if (command === "get_note_ai_status") return noteAiStatus;
    if (command === "list_note_chat_messages") return history.get((args as { noteId: string }).noteId) ?? [];
    if (command === "save_note_chat_message") {
      const request = (args as { request: { noteId: string; role: string; content: string } }).request;
      if (request.role === "user" && behavior.saveUser) behavior.saveUser();
      const messages = history.get(request.noteId) ?? [];
      const message = { ...request, id: `${request.noteId}-${messages.length}`, createdAt: timestamp };
      history.set(request.noteId, [...messages, message]); return message;
    }
    if (command === "run_note_ai") return behavior.answer?.() ?? { status: "success", response: "Ответ 🙂", message: "", model: "QA", providerName: "QA", isLocal: true };
    throw new Error(`Unexpected note IPC: ${command}`);
  });
  return { commands, history };
}

describe("RC4 note chat session drafts", () => {
  for (const stop of [false, true]) it(`restores note streaming after unmount and ${stop ? "stops its backend request" : "completes once"}`, async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
    Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
    const answer = deferred<Record<string, unknown>>(); let channel: Channel<AiStreamChunk> | undefined;
    let calls = 0; let cancelledId = ""; const messages: Array<{ id: string; noteId: string; role: string; content: string; createdAt: string }> = [];
    mockIPC((command, args) => {
      if (command === "get_note_ai_status") return noteAiStatus;
      if (command === "list_note_chat_messages") return (args as { noteId: string }).noteId === "A" ? messages : [];
      if (command === "save_note_chat_message") { const request = (args as { request: { noteId: string; role: string; content: string } }).request; const message = { ...request, id: `m-${messages.length}`, createdAt: timestamp }; messages.push(message); return message; }
      if (command === "run_note_ai_stream") {
        assert.equal((args as { request: { context: { noteId: string } } }).request.context.noteId, "A");
        calls++; channel = (args as { onDelta: Channel<AiStreamChunk> }).onDelta;
        channel.onmessage({ text: "Частичный ответ A", reset: false }); return answer.promise;
      }
      if (command === "cancel_ai_operation") { cancelledId = (args as { requestId: string }).requestId; answer.resolve({ status: "error", message: "Stopped", response: "" }); return undefined; }
      throw new Error(`Unexpected stream IPC: ${command}`);
    });
    try {
      await renderNote("A"); await setComposerValue("Вопрос A"); await click("Отправить");
      await until(() => calls === 1); await renderNote("B"); await setComposerValue("Черновик B");
      await act(async () => root.render(null)); await renderNote("A");
      assert.ok(container.textContent?.includes("Частичный ответ A")); assert.equal(calls, 1);
      if (stop) { await click("Остановить"); await until(() => noteChatJobs.get("A")?.phase === "stopped"); assert.equal(cancelledId, noteChatJobs.get("A")?.requestId); }
      else { await act(async () => { channel!.onmessage({ text: " завершён", reset: false }); answer.resolve({ status: "success", response: "Частичный ответ A завершён", message: "", model: "QA", providerName: "QA", isLocal: true }); }); await until(() => noteChatJobs.get("A")?.phase === "success"); }
      assert.equal(calls, 1); assert.equal(messages.filter((m) => m.role === "assistant").length, stop ? 0 : 1);
      assert.equal(noteChatDrafts.get("B"), "Черновик B");
      // Real Channel end marker releases its registered IPC callback.
      const internals = (window as unknown as { __TAURI_INTERNALS__: { runCallback(id: number, value: unknown): void; callbacks: Map<number, unknown> } }).__TAURI_INTERNALS__;
      internals.runCallback(channel!.id, { index: 0, end: true }); assert.equal(internals.callbacks.has(channel!.id), false);
    } finally { if (descriptor) Object.defineProperty(globalThis, "isTauri", descriptor); else Reflect.deleteProperty(globalThis, "isTauri"); }
  });
  it("preserves exact Unicode/whitespace through rapid close, navigation and A/B switches without sending", async () => {
    const { commands } = noteIpc(); const a = "  Русский English 🙂\n\n  пробелы  "; const b = "Другой черновик B";
    await renderNote("A"); await setComposerValue(a);
    await act(async () => container.querySelector<HTMLButtonElement>(".nc-top .x")!.click());
    await renderNote("A"); assert.equal(composer().value, a);
    await renderNote("B"); assert.equal(composer().value, ""); await setComposerValue(b);
    await act(async () => root.render(h("main", null, "Settings")));
    await renderNote("A"); assert.equal(composer().value, a);
    await renderNote("B"); assert.equal(composer().value, b);
    assert.equal(commands.includes("run_note_ai"), false); assert.equal(commands.includes("save_note_chat_message"), false);
    assert.equal(ragDrafts.get("A"), "");
  });
  it("clears only an accepted send, retains history once and allows manual draft clear", async () => {
    const { commands, history } = noteIpc();
    await renderNote("A"); await setComposerValue("  Отправленный вопрос 🙂  "); await click("Отправить");
    await until(() => noteChatJobs.get("A")?.phase === "success");
    assert.equal(composer().value, ""); assert.equal(history.get("A")?.length, 2);
    assert.equal(commands.filter((c) => c === "run_note_ai").length, 1);
    await setComposerValue("Новый"); await setComposerValue("");
    await act(async () => root.render(null)); await renderNote("A"); assert.equal(composer().value, "");
  });
  for (const failure of ["save", "provider"]) it(`preserves original draft after ${failure} error`, async () => {
    noteIpc(failure === "save" ? { saveUser: () => { throw new Error("Save unavailable"); } } : { answer: () => { throw new Error("Provider unavailable"); } });
    const draft = "  Ошибка не теряет\n  черновик 🙂  ";
    await renderNote("A"); await setComposerValue(draft); await click("Отправить");
    await until(() => noteChatJobs.get("A")?.phase === "error"); assert.equal(composer().value, draft);
    await act(async () => root.render(null)); await renderNote("A"); assert.equal(composer().value, draft);
  });
  it("keeps a newer draft during failed background generation and cleans deleted notes/all notes", async () => {
    const answer = deferred<Record<string, unknown>>(); noteIpc({ answer: () => answer.promise });
    await renderNote("A"); await setComposerValue("Старый вопрос"); await click("Отправить");
    await until(() => noteChatJobs.get("A")?.phase === "generating");
    await setComposerValue("Новый черновик"); await act(async () => root.render(null));
    await act(async () => answer.resolve({ status: "error", response: "", message: "Unavailable" }));
    await renderNote("A"); assert.equal(composer().value, "Новый черновик");
    noteChatDrafts.set("B", "Другой");
    await act(async () => forgetNoteChat("A")); assert.equal(noteChatDrafts.get("A"), ""); assert.equal(noteChatDrafts.get("B"), "Другой");
    await act(async () => { noteChatJobs.reset(); noteChatDrafts.reset(); }); assert.equal(composer().value, ""); assert.equal(noteChatDrafts.get("B"), "");
  });
  it("a deleted pending request cannot recover its draft or persist an assistant response", async () => {
    const answer = deferred<Record<string, unknown>>(); const { history } = noteIpc({ answer: () => answer.promise });
    noteChatDrafts.set("A", "Удалённый вопрос");
    const request = sendNoteChatInBackground(syntheticNote("A"), "Удалённый вопрос", "");
    await until(() => noteChatJobs.get("A")?.phase === "generating"); forgetNoteChat("A");
    answer.resolve({ status: "success", response: "Late", message: "" }); await request;
    assert.equal(noteChatJobs.get("A"), null); assert.equal(noteChatDrafts.get("A"), "");
    assert.equal(history.get("A")?.filter((m) => m.role === "assistant").length, 0);
  });
  it("does not resurrect a manually cleared draft on a late provider error", async () => {
    const answer = deferred<Record<string, unknown>>(); noteIpc({ answer: () => answer.promise });
    await renderNote("A"); await setComposerValue("Отправленный вопрос"); await click("Отправить");
    await until(() => noteChatJobs.get("A")?.phase === "generating");
    await setComposerValue("Новый текст"); await setComposerValue("");
    await act(async () => answer.resolve({ status: "error", message: "Unavailable", response: "" }));
    await until(() => noteChatJobs.get("A")?.phase === "error"); assert.equal(composer().value, "");
  });
});

describe("RAG workspace generation flow", () => {
  it("stops a reattached RAG stream by its original request ID and rejects a late completion", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
    Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
    const answer = deferred<Record<string, unknown>>(); const commands: string[] = []; let cancelledId = "";
    let channel: Channel<AiStreamChunk> | undefined;
    installBaseIpc(commands, { hybridSearch: () => [semanticSource], onCancel: (id) => { cancelledId = id; }, runGeneration: (stream) => { channel = stream; channel!.onmessage({ text: "Частичный ответ", reset: false }); return answer.promise; } });
    try {
      await renderWorkspace(() => {}); await until(() => !composer().disabled); await setComposerValue("Вопрос"); await click("Отправить");
      await until(() => Boolean(channel)); const requestId = ragJobs.get("chat-a")!.requestId;
      await act(async () => root.render(null)); await renderWorkspace(() => {}); await click("Остановить");
      assert.equal(cancelledId, requestId);
      await act(async () => answer.resolve(generationResult("Late reply. [[S1]]")));
      await until(() => ragJobs.get("chat-a")?.phase === "stopped"); assert.equal(ragJobs.get("chat-a")?.result, undefined);
      assert.equal(commands.filter((c) => c === "run_rag_generation_stream").length, 1);
      const internals = (window as unknown as { __TAURI_INTERNALS__: { runCallback(id: number, value: unknown): void } }).__TAURI_INTERNALS__;
      internals.runCallback(channel!.id, { index: 0, end: true });
    } finally { if (descriptor) Object.defineProperty(globalThis, "isTauri", descriptor); else Reflect.deleteProperty(globalThis, "isTauri"); }
  });
  it("reattaches streamed RAG partial content and completes with the original sources/citations once", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
    Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
    const answer = deferred<Record<string, unknown>>(); const commands: string[] = [];
    let channel: Channel<AiStreamChunk> | undefined;
    installBaseIpc(commands, { hybridSearch: () => [semanticSource], runGeneration: (stream) => { channel = stream; assert.ok(channel); channel.onmessage({ text: "Частичный RAG", reset: false }); return answer.promise; } });
    try {
      await renderWorkspace(() => {}); await until(() => !composer().disabled);
      await setComposerValue("Вопрос по базе"); await click("Отправить"); await until(() => Boolean(channel));
      await act(async () => root.render(h("main", null, "Settings")));
      await renderWorkspace(() => {}); await until(() => container.textContent?.includes("Частичный RAG") ?? false);
      await act(async () => answer.resolve(generationResult("Завершённый RAG. [[S1]]")));
      await until(() => Boolean(container.querySelector(".rag-citation")));
      assert.equal(commands.filter((c) => c === "run_rag_generation_stream").length, 1);
      assert.equal(commands.filter((c) => c === "save_rag_chat_message").length, 1);
      assert.match(container.querySelector(".rag-source-list")?.textContent ?? "", /Проект Альфа/);
      const internals = (window as unknown as { __TAURI_INTERNALS__: { runCallback(id: number, value: unknown): void; callbacks: Map<number, unknown> } }).__TAURI_INTERNALS__;
      internals.runCallback(channel!.id, { index: 0, end: true }); assert.equal(internals.callbacks.has(channel!.id), false);
    } finally { if (descriptor) Object.defineProperty(globalThis, "isTauri", descriptor); else Reflect.deleteProperty(globalThis, "isTauri"); }
  });
  it("RC4 keeps a real note-chat request bound to its note across navigation/unmount and saves once", async () => {
    const answer = deferred<Record<string, unknown>>();
    const history = new Map<string, Array<{ id: string; noteId: string; role: string; content: string; createdAt: string }>>();
    let requests = 0; const scopes: string[] = [];
    mockIPC((command, args) => {
      if (command === "get_note_ai_status") return noteAiStatus;
      if (command === "list_note_chat_messages") return history.get((args as { noteId: string }).noteId) ?? [];
      if (command === "save_note_chat_message") {
        const request = (args as { request: { noteId: string; role: string; content: string } }).request;
        const messages = history.get(request.noteId) ?? [];
        const message = { ...request, id: `m-${messages.length}`, createdAt: timestamp };
        history.set(request.noteId, [...messages, message]); return message;
      }
      if (command === "run_note_ai") { requests++; scopes.push((args as { request: { context: { noteId: string } } }).request.context.noteId); return answer.promise; }
      throw new Error(`Unexpected note IPC: ${command}`);
    });
    const note = (id: string) => ({ id, title: id, plainText: "Synthetic note", contentMarkdown: "Synthetic note", noteDate: "2026-10-08", project: "", tags: [], attachments: [], contentSidecars: [], contentVersion: 0, editorDocument: { type: "doc" }, contentHtml: "", createdAt: timestamp, updatedAt: timestamp, dateLabel: "", summary: "", wordCount: 2 });
    const renderNote = async (id: string) => act(async () => root.render(h(NoteChatPanel, { note: note(id), onClose() {}, onOpenAiSettings() {}, onResize() {}, onResetWidth() {}, onToast() {} })));
    await renderNote("A");
    await until(() => container.querySelector<HTMLTextAreaElement>("textarea")?.disabled === false);
    await act(async () => container.querySelector<HTMLButtonElement>(".note-chat-suggestions button")!.click());
    await until(() => requests === 1); await renderNote("B");
    assert.equal(noteChatJobs.busy("A"), true); assert.equal(noteChatJobs.busy("B"), false);
    await act(async () => root.render(null));
    await act(async () => answer.resolve({ status: "success", message: "", response: "Ответ для A", providerName: "QA", model: "QA", isLocal: true }));
    await renderNote("A"); await until(() => container.textContent?.includes("Ответ для A") ?? false);
    assert.equal(requests, 1); assert.deepEqual(scopes, ["A"]); assert.equal(history.get("A")?.length, 2);
    assert.equal(history.get("B"), undefined);
  });
  for (const stage of ["retrieval", "generation"] as const) it(`RC4 continues ${stage} after UI unmount and reattaches without duplicate requests`, async () => {
    const retrieval = deferred<unknown[]>(); const answer = deferred<Record<string, unknown>>(); const commands: string[] = [];
    installBaseIpc(commands, { hybridSearch: () => stage === "retrieval" ? retrieval.promise : [semanticSource], runGeneration: () => answer.promise });
    await renderWorkspace(() => {}); await until(() => !composer().disabled);
    await setComposerValue("Фоновый вопрос"); await click("Отправить");
    await until(() => container.textContent?.includes(stage === "retrieval" ? "Ищу по базе" : "Формирую ответ") ?? false);
    await act(async () => root.render(null));
    if (stage === "retrieval") await act(async () => retrieval.resolve([semanticSource]));
    await act(async () => answer.resolve(generationResult("Фоновый ответ. [[S1]]")));
    await renderWorkspace(() => {}); await until(() => container.textContent?.includes("Фоновый ответ") ?? false);
    assert.equal(commands.filter((command) => command === "run_rag_generation").length, 1);
    assert.equal(commands.filter((command) => command === "save_rag_chat_message").length, 1);
    assert.ok(container.querySelector(".rag-citation")); assert.ok(button("Отправить"));
  });
  it("RC4 Stop during retrieval prevents generation and preserves the question", async () => {
    const retrieval = deferred<unknown[]>(); const commands: string[] = [];
    installBaseIpc(commands, { hybridSearch: () => retrieval.promise, runGeneration: () => generationResult("Must not run") });
    await renderWorkspace(() => {}); await until(() => !composer().disabled);
    await setComposerValue("Остановленный вопрос"); await click("Отправить"); await click("Остановить");
    await act(async () => retrieval.resolve([semanticSource]));
    await until(() => container.textContent?.includes("Запрос ИИ остановлен") ?? false);
    assert.equal(commands.includes("run_rag_generation"), false); assert.equal(composer().value, "Остановленный вопрос");
  });
  it("RC4 preserves an unsent draft across UI unmount/remount without sending it", async () => {
    const commands: string[] = [];
    installBaseIpc(commands, { hybridSearch: () => [], runGeneration: () => generationResult("Unused") });
    await renderWorkspace(() => {}); await until(() => !composer().disabled);
    await setComposerValue("Неотправленный русский черновик 🙂");
    await act(async () => root.render(null));
    await renderWorkspace(() => {}); await until(() => !composer().disabled);
    assert.equal(composer().value, "Неотправленный русский черновик 🙂");
    assert.equal(commands.includes("save_rag_chat_message"), false);
    assert.equal(commands.includes("run_rag_generation"), false);
  });
  it("RC4 retains a failed question without overwriting a newer draft", async () => {
    installBaseIpc([], { hybridSearch: () => [], runGeneration: () => { throw new Error("Network error"); } });
    await renderWorkspace(() => {}); await until(() => !composer().disabled);
    await setComposerValue("Не терять вопрос"); await click("Отправить");
    await until(() => container.textContent?.includes("Не удалось") ?? false);
    assert.equal(composer().value, "Не терять вопрос");
  });
  it("RC4 isolates conversations and only clears the submitted version of a draft", async () => {
    const { RagDrafts } = await import("../src/features/rag/ragDrafts");
    const store = new RagDrafts(); let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    store.set("A", "Первый"); store.set("B", "Второй"); store.setActive("A");
    store.setActive("B"); assert.equal(store.get(store.activeId()), "Второй");
    store.clearIfUnchanged("A", "Первый"); assert.equal(store.get("A"), "");
    store.recoverIfEmpty("A", "Первый"); store.set("A", "Новый"); store.clearIfUnchanged("A", "Первый");
    store.recoverIfEmpty("A", "Первый"); assert.equal(store.get("A"), "Новый");
    store.set("", "До создания"); store.transferNewChat("C"); assert.equal(store.get("C"), "До создания");
    store.delete("B"); assert.equal(store.get("A"), "Новый");
    store.reconcileGeneration(0); store.reconcileGeneration(1); assert.equal(store.get("A"), "");
    unsubscribe(); const count = notifications; store.set("A", "No listener"); assert.equal(notifications, count);
  });
  it("preserves the composer, answer, sources and scope while changing responsive modes", async () => {
    const commands: string[] = [];
    installBaseIpc(commands, { hybridSearch: () => [semanticSource], runGeneration: () => generationResult("Ответ сохранён. [[S1]]") });
    await renderWorkspace(() => {});
    await until(() => !composer().disabled);
    await setComposerValue("Первый вопрос");
    await click("Отправить");
    await until(() => Boolean(container.querySelector(".rag-citation")));
    await setComposerValue("Неотправленный черновик");
    const input = composer();
    const citation = container.querySelector(".rag-citation");
    const initialCommands = commands.length;
    for (const mode of ["compact", "narrow", "wide"] as const) {
      await renderWorkspace(() => {}, mode);
      assert.equal(composer(), input);
      assert.equal(composer().value, "Неотправленный черновик");
      assert.equal(container.querySelector(".rag-citation"), citation);
      assert.equal(button("Область поиска: Вся база")?.getAttribute("aria-expanded"), "false");
    }
    assert.equal(commands.length, initialCommands);
    assert.match(container.querySelector(".rag-source-list")?.textContent ?? "", /Проект Альфа/);
  });

  it("shows only one drawer at a time and restores both docked preferences", async () => {
    installBaseIpc([], { hybridSearch: () => [], runGeneration: () => generationResult("Ответ") });
    await renderWorkspace(() => {});
    await until(() => !composer().disabled);
    await renderWorkspace(() => {}, "compact");
    assert.ok(container.querySelector(".rag-sources-panel.rag-panel-overlay"));
    assert.equal(container.querySelector(".rag-conversations"), null);
    await click("Показать историю чатов");
    assert.ok(container.querySelector(".rag-conversations.rag-panel-overlay"));
    assert.equal(container.querySelector(".rag-sources-panel"), null);
    await click("Источники ответа");
    assert.ok(container.querySelector(".rag-sources-panel.rag-panel-overlay"));
    assert.equal(container.querySelector(".rag-conversations"), null);
    await renderWorkspace(() => {}, "wide");
    assert.ok(container.querySelector(".rag-conversations:not(.rag-panel-overlay)"));
    assert.ok(container.querySelector(".rag-sources-panel:not(.rag-panel-overlay)"));
  });

  it("blocks an empty explicit scope without saving or retrieving and recovers to standalone-only", async () => {
    const commands: string[] = [];
    installBaseIpc(commands, { hybridSearch: () => [semanticSource], runGeneration: () => generationResult("Standalone answer. [[S1]]") });
    await renderWorkspace(() => {});
    await until(() => !composer().disabled);
    await click("Область поиска: Вся база");
    const standalone = document.querySelector<HTMLInputElement>('.rag-project-popover input[type="checkbox"]');
    assert.ok(standalone);
    await act(async () => standalone.click());
    await until(() => composer().disabled);
    assert.match(document.body.textContent ?? "", /Выберите хотя бы один проект или заметки вне проектов/);
    assert.equal(container.querySelector<HTMLButtonElement>(".chat-composer-send")?.disabled, true);
    assert.equal(commands.includes("save_rag_chat_message"), false);
    assert.equal(commands.includes("hybrid_search"), false);
    await act(async () => standalone.click());
    await until(() => !composer().disabled);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await setComposerValue("Standalone question");
    await click("Отправить");
    await until(() => container.textContent?.includes("Standalone answer") ?? false);
    assert.equal(commands.filter((c) => c === "save_rag_chat_message").length, 1);
  });

  it("uses a recovered current index despite a stale connection-test error", async () => {
    let retrieved = false;
    installBaseIpc([], {
      connectionStatus: "error",
      hybridSearch: () => { retrieved = true; return [semanticSource]; },
      runGeneration: () => generationResult("Recovered answer. [[S1]]"),
    });
    await renderWorkspace(() => {});
    await until(() => !composer().disabled);
    await setComposerValue("Recovered query");
    await click("Отправить");
    await until(() => container.textContent?.includes("Recovered answer") ?? false);
    assert.equal(retrieved, true);
  });
  it("copies user text and a clean assistant answer from icon-only actions", async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { copied.push(value); } },
    });
    installBaseIpc([], {
      hybridSearch: () => [semanticSource],
      runGeneration: () => generationResult("Ответ **готов**. [[S1]] [[NO_EVIDENCE]]"),
    });
    await renderWorkspace(() => {});
    await until(() => !composer().disabled);
    await setComposerValue("Вопрос **в Markdown**");
    await click("Отправить");
    await until(() => Boolean(container.querySelector(".rag-answer .chat-copy-icon")));
    const userCopy = container.querySelector<HTMLButtonElement>(".rag-user .chat-copy-icon");
    const assistantCopy = container.querySelector<HTMLButtonElement>(".rag-answer .chat-copy-icon");
    assert.ok(userCopy);
    assert.ok(assistantCopy);
    assert.equal(userCopy.textContent?.trim(), "");
    assert.equal(assistantCopy.textContent?.trim(), "");
    assert.equal(userCopy.getAttribute("aria-label"), "Скопировать сообщение");
    assert.equal(assistantCopy.getAttribute("data-tooltip"), "Скопировать");
    await act(async () => userCopy.click());
    await act(async () => assistantCopy.click());
    assert.deepEqual(copied, ["Вопрос **в Markdown**", "Ответ **готов**. [1]"]);
  });

  it("keeps the composer sendable through three answers when the parent rerenders during retrieval", async () => {
    const retrieval = deferred<unknown[]>();
    const commands: string[] = [];
    let answers = 0;
    installBaseIpc(commands, {
      hybridSearch: () => answers === 0 ? retrieval.promise : [semanticSource],
      runGeneration: () => generationResult(`Ответ ${++answers}. [[S1]]`),
    });

    await renderWorkspace(() => {});
    await until(() => !composer().disabled);
    await setComposerValue("Вопрос 1");
    await click("Отправить");
    await until(() => (container.textContent ?? "").includes("Ищу по базе…"));
    await renderWorkspace(() => {});
    await act(async () => retrieval.resolve([semanticSource]));
    await until(() => (container.textContent ?? "").includes("Ответ 1."));

    for (const number of [2, 3]) {
      await setComposerValue(`Вопрос ${number}`);
      await until(() => container.querySelector<HTMLButtonElement>(".chat-composer-send")?.disabled === false);
      await click("Отправить");
      await until(() => (container.textContent ?? "").includes(`Ответ ${number}.`));
    }
    assert.equal(answers, 3);
    assert.equal(commands.filter((command) => command === "run_rag_generation").length, 3);
  });
  it("moves through retrieval and generation, then renders a clickable grounded citation", async () => {
    const retrieval = deferred<unknown[]>();
    const generation = deferred<Record<string, unknown>>();
    const commands: string[] = [];
    let openedNoteId = "";
    installBaseIpc(commands, {
      hybridSearch: () => retrieval.promise,
      runGeneration: () => generation.promise,
    });

    await renderWorkspace((source) => { openedNoteId = source.noteId; });
    await until(() => Boolean(container.querySelector('textarea[aria-label="Сообщение по всей базе заметок"]')) && !composer().disabled);
    await setComposerValue("Когда запуск?");
    assert.equal(container.querySelector<HTMLButtonElement>('.chat-composer-send')?.disabled, false);
    await click("Отправить");
    await until(() => (container.textContent ?? "").includes("Ищу по базе…"));
    assert.equal(container.querySelector<HTMLButtonElement>(".chat-composer-send")?.disabled, false);
    assert.ok(button("Остановить"));
    assert.equal(composer().disabled, false);

    await act(async () => retrieval.resolve([semanticSource]));
    await until(() => (container.textContent ?? "").includes("Формирую ответ…"));

    await act(async () => generation.resolve(generationResult("Проект запускается **12 октября**. [[S1]]")));
    await until(() => (container.textContent ?? "").includes("12 октября"));
    const citation = container.querySelector<HTMLButtonElement>('[aria-label="Источник 1: Проект Альфа"]');
    assert.ok(citation);
    assert.equal(citation.textContent, "1");
    await act(async () => citation.click());
    assert.equal(openedNoteId, "note-1");
    assert.match(container.querySelector(".rag-source-list")?.textContent ?? "", /Проект Альфа/);
    assert.deepEqual(commands.filter((command) => command === "save_rag_chat_message"), ["save_rag_chat_message"]);
    assert.ok(commands.includes("hybrid_search"));
    assert.ok(commands.includes("run_rag_generation"));
  });

  it("retries a provider timeout without duplicating the persisted user message", async () => {
    const commands: string[] = [];
    let generationAttempts = 0;
    installBaseIpc(commands, {
      hybridSearch: () => [semanticSource],
      runGeneration: () => {
        generationAttempts += 1;
        if (generationAttempts === 1) {
          throw { code: "provider_timeout", message: "Модель не ответила вовремя.", retryable: true };
        }
        return generationResult("Повторный ответ. [[S1]]");
      },
    });

    await renderWorkspace(() => {});
    await until(() => Boolean(container.querySelector('textarea[aria-label="Сообщение по всей базе заметок"]')) && !composer().disabled);
    await setComposerValue("Повтори запрос");
    assert.equal(container.querySelector<HTMLButtonElement>('.chat-composer-send')?.disabled, false);
    await click("Отправить");
    await until(() => (container.textContent ?? "").includes("Модель не ответила вовремя."));
    assert.ok(button("Повторить"));
    await click("Повторить");
    await until(() => (container.textContent ?? "").includes("Повторный ответ."));
    assert.equal(generationAttempts, 2);
    assert.equal(commands.filter((command) => command === "save_rag_chat_message").length, 1);
    assert.equal(commands.filter((command) => command === "hybrid_search").length, 2);
  });

  it("persists the chosen projects and retries the original request scope after switching to all", async () => {
    const scopes: unknown[] = [];
    let attempts = 0;
    installBaseIpc([], {
      projects: [{ id: "a", title: "ALPHA", color: "blue", notes: 1, tasks: 0, description: "" }, { id: "b", title: "BETA", color: "blue", notes: 1, tasks: 0, description: "" }],
      onRetrieve: (scope) => scopes.push(scope),
      hybridSearch: () => [semanticSource],
      runGeneration: () => {
        if (++attempts === 1) throw { code: "provider_timeout", message: "Модель не ответила вовремя.", retryable: true };
        return generationResult("Ответ ALPHA. [[S1]]");
      },
    });
    await renderWorkspace(() => {});
    await until(() => !composer().disabled);
    await click("Область поиска: Вся база");
    const check = document.querySelectorAll<HTMLInputElement>('.rag-project-options input')[2]!;
    await act(async () => check.click());
    await until(() => (container.querySelector('.rag-project-trigger')?.textContent ?? "").includes("1 проект + вне проектов"));
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await setComposerValue("Где сервер?");
    await click("Отправить");
    await until(() => Boolean(button("Повторить")));
    await click("Область поиска: 1 проект + вне проектов");
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>('.rag-project-popover button')).find((item) => item.textContent?.includes("Вся база"))!.click());
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await click("Повторить");
    await until(() => (container.textContent ?? "").includes("Ответ ALPHA"));
    assert.deepEqual(scopes, [{ projectIds: ["a"], includeStandalone: true }, { projectIds: ["a"], includeStandalone: true }]);
  });
});

function installBaseIpc(
  commands: string[],
  behavior: {
    hybridSearch: () => unknown[] | Promise<unknown[]>;
    runGeneration: (channel?: Channel<AiStreamChunk>) => Record<string, unknown> | Promise<Record<string, unknown>>;
    onCancel?: (requestId: string) => void;
    projects?: unknown[];
    onRetrieve?: (scope: unknown) => void;
    connectionStatus?: "success" | "error";
  },
) {
  let chatTitle = "Новый чат";
  let savedMessageCount = 0;
  let projectIds: string[] | null = null;
  let includeStandalone = false;
  const requestScopes = new Map<string, { projectIds: string[] | null; includeStandalone: boolean }>();
  mockIPC((command, args) => {
    commands.push(command);
    if (command === "cancel_ai_operation") return behavior.onCancel?.((args as { requestId: string }).requestId);
    if (command === "list_rag_chats") return [{ ...chat(chatTitle), projectIds, includeStandalone }];
    if (command === "list_rag_chat_messages") return [];
    if (command === "list_projects") return behavior.projects ?? [];
    if (command === "set_rag_chat_projects") {
      projectIds = (args as { projectIds: string[] | null }).projectIds;
      includeStandalone = (args as { includeStandalone: boolean }).includeStandalone;
      return { ...chat(chatTitle), projectIds, includeStandalone };
    }
    if (command === "list_embedding_profiles") return [{ ...embeddingProfile, lastStatus: behavior.connectionStatus ?? embeddingProfile.lastStatus }];
    if (command === "get_embedding_index_status") return embeddingIndexStatus;
    if (command === "get_note_ai_status") return noteAiStatus;
    if (command === "save_rag_chat_message") {
      const request = (args as { request: { content: string } }).request;
      const id = `user-${++savedMessageCount}`;
      requestScopes.set(id, { projectIds: projectIds?.slice() ?? null, includeStandalone });
      return { ...userMessage, content: request.content, id, projectIds, includeStandalone };
    }
    if (command === "rename_rag_chat") {
      chatTitle = "Когда запуск?";
      return { ...chat(chatTitle), projectIds, includeStandalone };
    }
    if (command === "plan_rag_question") return {
      needsHybridRetrieval: true,
      searchQuery: "Когда запуск?",
      projectId: null,
      projectIds: requestScopes.get((args as { userMessageId: string }).userMessageId)?.projectIds ?? null,
      includeStandalone: requestScopes.get((args as { userMessageId: string }).userMessageId)?.includeStandalone ?? false,
      tagId: null,
    };
    if (command === "hybrid_search") { const request = (args as { request: { projectIds: unknown; includeStandalone: boolean } }).request; behavior.onRetrieve?.({ projectIds: request.projectIds, includeStandalone: request.includeStandalone }); return behavior.hybridSearch(); }
    if (command === "run_rag_generation" || command === "run_rag_generation_stream") return behavior.runGeneration((args as { onDelta?: Channel<AiStreamChunk> }).onDelta);
    throw new Error(`Unexpected RAG test IPC: ${command}`);
  });
}

async function renderWorkspace(onOpenResult: (source: typeof semanticSource) => void, layoutMode: RagLayoutMode = "wide") {
  await act(async () => root.render(h(RagChatWorkspace, {
    conversationWidth: 260,
    dataReloadGeneration: 0,
    layoutMode,
    onConversationReset() {},
    onConversationResize() {},
    onOpenModelSettings() {},
    onOpenResult,
    onSourcesCollapsedChange() {},
    onSourcesReset() {},
    onSourcesResize() {},
    onToast() {},
    preferredSourcesCollapsed: false,
    sourcesWidth: 320,
  })));
}

async function setComposerValue(value: string) {
  const textarea = composer();
  const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")?.set;
  assert.ok(valueSetter);
  await act(async () => {
    valueSetter.call(textarea, value);
    textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    textarea.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function click(label: string) {
  const target = button(label);
  assert.ok(target, `Button ${label} exists`);
  await act(async () => target.click());
}

function button(label: string) {
  return Array.from(container.querySelectorAll("button")).find((item) => (
    item.getAttribute("aria-label") ?? item.textContent?.trim()
  ) === label);
}

function composer() {
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Сообщение по всей базе заметок"], textarea[aria-label="Сообщение по текущей заметке"]');
  assert.ok(textarea);
  return textarea;
}

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => { await delay(10); });
  }
  assert.fail(`DOM condition timed out: ${container.textContent?.slice(0, 600)}`);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function chat(title: string) {
  return { id: "chat-a", title, createdAt: timestamp, updatedAt: timestamp };
}

function generationResult(content: string) {
  return {
    answerStatus: "grounded",
    assistantMessage: {
      id: `assistant-${content}`,
      chatId: "chat-a",
      role: "assistant",
      content,
      sources: [{ ...semanticSource, sourceId: "S1", citationNumber: 1 }],
      createdAt: timestamp,
    },
    contextSourceCount: 1,
    isLocal: true,
    model: "local-chat",
    providerName: "Local model",
    repairedCitations: false,
    retrievalCount: 1,
    timings: { contextMs: 1, persistenceMs: 1, providerMs: 2, totalMs: 4 },
  };
}

const timestamp = "2026-09-19T12:00:00Z";
const embeddingProfile = {
  id: "embedding-1", name: "Local embeddings", providerType: "ollama", baseUrl: "http://127.0.0.1:11434",
  embeddingsEndpoint: "/api/embed", model: "bge-m3", dimensions: 1024, batchSize: 8, timeoutSeconds: 30,
  locality: "local", hasApiKey: false, hasCloudConsent: true, enabled: true, lastStatus: "success",
  lastCheckedAt: timestamp, lastErrorCode: null, createdAt: timestamp, updatedAt: timestamp,
};
const embeddingIndexStatus = {
  profileId: "embedding-1", status: "current", totalChunks: 1, indexedChunks: 1, pendingChunks: 0,
  failedChunks: 0, lastCheckedAt: timestamp, lastIndexedAt: timestamp, lastErrorCode: null, updatedAt: timestamp,
};
const noteAiStatus = {
  hasProvider: true, providerName: "Local model", model: "local-chat", isLocal: true, privacyScope: "local",
  privacyAccepted: true, privacyNotice: "Локальная обработка", canUse: true, message: "Готово",
};
const semanticSource = {
  chunkId: "chunk-1", noteId: "note-1", noteTitle: "Проект Альфа", headingPath: ["План"],
  snippet: "Проект запускается 12 октября.", project: "Проекты", projectId: "project-1", tags: [],
  archived: false, favorite: false, updatedAt: timestamp, semanticScore: 0.93, matchType: "hybrid",
  neighboringChunkIds: [],
} as const;
const userMessage = {
  id: "user-1", chatId: "chat-a", role: "user", content: "Когда запуск?", sources: [], createdAt: timestamp,
};
