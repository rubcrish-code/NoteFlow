import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { act, createElement as h, lazy, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import type { Editor } from "@tiptap/core";
import { DEFAULT_UI_SETTINGS } from "../src/services/uiSettingsService";
import { FeatureLoadState, LazyFeatureBoundary } from "../src/shared/LazyFeatureBoundary";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
  MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent,
  MutationObserver: dom.window.MutationObserver, DOMParser: dom.window.DOMParser,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
const scrolledTargets: string[] = [];
dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolledTargets.push(this.id); };
const { AppShell } = await import("../src/app/AppShell");
const { loadSettingsFeature, loadRagFeature, loadImageEditorFeature } = await import("../src/app/lazyFeatures");
let root: Root;
let container: HTMLDivElement;
const domErrors: string[] = [];
dom.window.addEventListener("error", (event) => { domErrors.push(event.message); });
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container, { onCaughtError() {} });
});
afterEach(async () => {
  await act(async () => root.unmount());
  // TipTap defers editor destruction by a timer after React unmounts.
  await act(async () => { await delay(20); });
  container.remove();
  clearMocks();
  assert.deepEqual(domErrors.splice(0), [], "No unhandled browser errors");
});
after(() => {
  dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
async function render(element: ReturnType<typeof h>) {
  await act(async () => root.render(element));
}
async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => { await delay(20); });
  }
  assert.fail(`DOM condition timed out: ${container.textContent?.slice(0, 500)}`);
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === label);
  assert.ok(button, `Button ${label} exists`);
  await act(async () => button.click());
}
function boundary(child: ReturnType<typeof h>, key = "settings") {
  return h("div", { "data-shell": true }, h("nav", null, "NoteFlow"), h(LazyFeatureBoundary, {
    key, children: child,
    errorFallback: h(FeatureLoadState, { kind: "error", label: key }),
    loadingFallback: h(FeatureLoadState, { kind: "loading", label: key }),
  }));
}

describe("P1.4 lazy loading behavior", () => {
  it("keeps the shell mounted while a feature suspends, delays feedback, then renders the feature", async () => {
    let resolve!: (module: { default: ComponentType }) => void;
    const Feature = lazy(() => new Promise<{ default: ComponentType }>((done) => { resolve = done; }));
    await render(boundary(h(Feature)));
    const shell = container.querySelector("[data-shell]");
    assert.ok(shell);
    assert.equal(container.querySelector(".button-spinner"), null);
    await act(async () => { await delay(180); });
    assert.match(container.textContent ?? "", /Открываем settings/);
    assert.ok(container.querySelector('[role="status"] .button-spinner'));
    await act(async () => resolve({ default: () => h("article", null, "Loaded feature") }));
    assert.match(container.textContent ?? "", /Loaded feature/);
    assert.equal(container.querySelector("[data-shell]"), shell);
    assert.equal(container.querySelector('[role="status"]'), null);
  });
  it("shows a safe chunk failure and navigates to another feature without remounting the shell", async () => {
    const Broken = lazy(async () => { throw new Error("D:/private/chunk.js?secret=private"); });
    await render(boundary(h(Broken)));
    const shell = container.querySelector("[data-shell]");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Не удалось открыть/);
    assert.doesNotMatch(container.textContent ?? "", /private|secret|chunk\.js/);
    const Working = lazy(async () => ({ default: () => h("article", null, "RAG loaded") }));
    await render(boundary(h(Working), "rag"));
    assert.equal(container.querySelector("[data-shell]"), shell);
    assert.match(container.textContent ?? "", /RAG loaded/);
    assert.equal(container.querySelector('[role="alert"]'), null);
  });
  it("does not flash feedback when a chunk is immediately available", async () => {
    const Fast = lazy(async () => ({ default: () => h("article", null, "Ready") }));
    await render(boundary(h(Fast)));
    assert.match(container.textContent ?? "", /Ready/);
    assert.equal(container.querySelector(".button-spinner"), null);
  });
  it("reuses actual imported Settings, RAG and image modules on subsequent opens", async () => {
    for (const load of [loadSettingsFeature, loadRagFeature, loadImageEditorFeature]) {
      const first = await load();
      assert.equal(first.default, (await load()).default);
    }
  });
  it("navigates real AppShell and lazy Settings/RAG twice without losing edited TipTap content or chat history", async () => {
    let note = {
      id: "p14-note", title: "P1.4 test", contentMarkdown: "Initial text", plainText: "Initial text",
      contentHtml: "<p>Initial text</p>", contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Initial text" }] }] },
      contentVersion: 1, contentSidecars: [], attachments: [], tags: [], project: "",
      isFavorite: false, isPinned: false, noteDate: "2026-09-13", wordCount: 2,
      createdAt: "2026-09-13T12:00:00Z", updatedAt: "2026-09-13T12:00:00Z",
    };
    let workspaceLoads = 0;
    let saves = 0;
    const unknownCommands = new Set<string>();
    mockIPC((command, args) => {
      if (command === "load_workspace") {
        workspaceLoads += 1;
        return { notes: [note], projects: [], tags: [], archiveItems: [], dataLocation: { dataDir: "", databasePath: "" } };
      }
      if (command === "get_first_run_state") return { required: false };
      if (command === "get_ui_settings" || command === "update_ui_settings") return DEFAULT_UI_SETTINGS;
      if (command === "update_note_content") {
        saves += 1;
        const request = (args as { request: Partial<typeof note> }).request;
        note = { ...note, ...request, contentVersion: note.contentVersion + 1 };
        return note;
      }
      if (["list_llm_providers", "list_embedding_profiles", "list_note_chat_messages", "list_projects"].includes(command)) return [];
      if (command === "list_rag_chats") return [{ id: "rag-one", title: "Saved conversation", createdAt: note.createdAt, updatedAt: note.updatedAt }];
      if (command === "list_rag_chat_messages") return [{ id: "message-one", chatId: "rag-one", role: "user", content: "Saved RAG history", sources: [], createdAt: note.createdAt }];
      if (command === "get_note_ai_status") return { available: false, privacyAccepted: false, reason: "no_provider" };
      if (command.startsWith("plugin:")) return null;
      unknownCommands.add(command);
      throw new Error(`Unexpected test IPC: ${command}`);
    });
    await render(h(AppShell));
    await until(() => Boolean(container.querySelector(".tiptap")));
    const appFrame = container.firstElementChild;
    const editor = (container.querySelector(".tiptap") as HTMLElement & { editor: Editor }).editor;
    assert.ok(editor);
    await act(async () => { editor.commands.setContent("<p>Edited before navigation</p>"); });
    for (let open = 0; open < 2; open += 1) {
      await click("Настройки");
      await until(() => Boolean(container.querySelector(".settings-layout-inner")));
      assert.match(container.textContent ?? "", /Модели для ИИ-помощника/);
      await click("Внешний вид");
      assert.ok(container.querySelector(".settings-content--appearance"));
      await click("Все заметки");
      await until(() => Boolean(container.querySelector(".tiptap")));
      assert.match(container.querySelector(".tiptap")?.textContent ?? "", /Edited before navigation/);
      await click("ИИ-чат по базе");
      await until(() => (container.textContent ?? "").includes("Saved RAG history"));
      assert.match(container.textContent ?? "", /Saved conversation/);
      if (open === 0) {
        await click("Настроить модели");
        await until(() => Boolean(container.querySelector(".settings-layout-inner")));
        assert.ok(scrolledTargets.includes("semantic-search-settings"), "Scroll target is handled after lazy Settings mounts");
      }
      await click("Все заметки");
      await until(() => Boolean(container.querySelector(".tiptap")));
      assert.match(container.querySelector(".tiptap")?.textContent ?? "", /Edited before navigation/);
      assert.equal(container.firstElementChild, appFrame);
    }
    await until(() => saves > 0);
    assert.match(note.contentMarkdown, /Edited before navigation/);
    assert.equal(workspaceLoads, 1, "AppShell did not remount");
    assert.deepEqual([...unknownCommands], []);
  });
});
