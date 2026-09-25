import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Root } from "react-dom/client";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";

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
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
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

describe("RAG workspace generation flow", () => {
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
    assert.equal(assistantCopy.getAttribute("title"), "Скопировать");
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
    assert.equal(container.querySelector<HTMLButtonElement>(".chat-composer-send")?.disabled, true);
    assert.ok(container.querySelector(".chat-composer-send .button-spinner"));

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
});

function installBaseIpc(
  commands: string[],
  behavior: {
    hybridSearch: () => unknown[] | Promise<unknown[]>;
    runGeneration: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  },
) {
  let chatTitle = "Новый чат";
  let savedMessageCount = 0;
  mockIPC((command, args) => {
    commands.push(command);
    if (command === "list_rag_chats") return [chat(chatTitle)];
    if (command === "list_rag_chat_messages") return [];
    if (command === "list_embedding_profiles") return [embeddingProfile];
    if (command === "get_embedding_index_status") return embeddingIndexStatus;
    if (command === "get_note_ai_status") return noteAiStatus;
    if (command === "save_rag_chat_message") {
      const request = (args as { request: { content: string } }).request;
      return { ...userMessage, content: request.content, id: `user-${++savedMessageCount}` };
    }
    if (command === "rename_rag_chat") {
      chatTitle = "Когда запуск?";
      return chat(chatTitle);
    }
    if (command === "hybrid_search") return behavior.hybridSearch();
    if (command === "run_rag_generation") return behavior.runGeneration();
    throw new Error(`Unexpected RAG test IPC: ${command}`);
  });
}

async function renderWorkspace(onOpenResult: (source: typeof semanticSource) => void) {
  await act(async () => root.render(h(RagChatWorkspace, {
    conversationWidth: 260,
    dataReloadGeneration: 0,
    layoutMode: "wide",
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
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Сообщение по всей базе заметок"]');
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
