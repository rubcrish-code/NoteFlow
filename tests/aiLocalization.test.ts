import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, afterEach, it } from "node:test";
import { act, createElement } from "react";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { UI_MESSAGES, localizeUiMessage, uiMessage } from "../src/shared/uiMessages";
import { getNoteAiStatus, runNoteAi } from "../src/services/noteAiService";
import * as llm from "../src/services/llmProviderService";
import * as embeddings from "../src/services/embeddingService";
import { RagGenerationError } from "../src/services/ragChatService";
import { invoke } from "../src/services/safeInvoke";

const untranslated = /\b(?:default\s+(?:llm\s+)?provider|(?:llm|ai)\s+provider|AI\s+privacy|API key|chat model|Timeout:|Endpoint|provider)\b/i;
it("has complete Russian/English resources and no untranslated provider terminology in Russian", () => {
  assert.equal(uiMessage("ru", "defaultProviderNotSelected"), "Провайдер ИИ-модели по умолчанию не выбран");
  assert.equal(uiMessage("en", "defaultProviderNotSelected"), "No default AI model provider selected");
  for (const [key, entry] of Object.entries(UI_MESSAGES)) {
    assert.ok(entry.ru.trim() && entry.en.trim(), key);
    assert.doesNotMatch(entry.ru, untranslated, key);
    assert.doesNotMatch(entry.en, /[А-Яа-яЁё]/, key);
    for (const language of ["ru", "en"] as const) {
      assert.equal(localizeUiMessage(language, entry.ru), entry[language], key);
      assert.equal(localizeUiMessage(language, entry.en), entry[language], key);
      if ("legacy" in entry) for (const legacy of entry.legacy) assert.equal(localizeUiMessage(language, legacy), entry[language], key);
    }
  }
});

it("guards all frontend UI literals against reintroduced mixed-language provider messages", () => {
  const failures: string[] = [];
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) scan(path);
      else if (/\.tsx?$/.test(path) && path !== "src/shared/uiMessages.ts") {
        const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
        function visit(node: ts.Node) {
          if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
            const value = node.text, isUiAttribute = ts.isJsxAttribute(node.parent)
              && /^(?:title|aria-label|description|placeholder|label|info)$/.test(node.parent.name.getText(source));
            const isError = ts.isNewExpression(node.parent) && node.parent.expression.getText(source) === "Error";
            if ((/[А-Яа-яЁё]/.test(value) || ts.isJsxText(node) || isUiAttribute || isError) && untranslated.test(value)) {
              failures.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${value}`);
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  scan("src"); assert.deepEqual(failures, []);
});

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, DOMParser: dom.window.DOMParser,
  MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const { createRoot } = await import("react-dom/client");
const { Editor } = await import("@tiptap/core");
const { default: StarterKit } = await import("@tiptap/starter-kit");
const { FormattingToolbar } = await import("../src/features/editor/FormattingToolbar");
let root: ReturnType<typeof createRoot> | undefined;
let editor: InstanceType<typeof Editor> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount()); root = undefined;
  editor?.destroy(); editor = undefined; clearMocks(); document.body.replaceChildren();
});
after(() => {
  dom.window.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});

const disconnected = { hasProvider: false, providerName: null, model: null, isLocal: true, privacyScope: "local",
  privacyAccepted: false, privacyNotice: "Выберите default LLM provider в настройках моделей.", canUse: false, message: "Default LLM provider не выбран" };
it("localizes actual IPC status DTOs while preserving identifiers and English locale", async () => {
  mockIPC(command => { assert.equal(command, "get_note_ai_status"); return disconnected; });
  assert.equal((await getNoteAiStatus()).message, uiMessage("ru", "defaultProviderNotSelected"));
  assert.equal((await getNoteAiStatus("en")).message, uiMessage("en", "defaultProviderNotSelected"));
  assert.equal((await getNoteAiStatus()).privacyNotice, uiMessage("ru", "chooseDefaultProvider"));
  mockIPC(() => ({ ...disconnected, hasProvider: true, providerName: "Default LLM provider", model: "cifra48/agent", message: "Для внешнего провайдера нужен API key" }));
  const status = await getNoteAiStatus();
  assert.equal(status.providerName, "Default LLM provider"); assert.equal(status.model, "cifra48/agent");
  assert.equal(status.message, uiMessage("ru", "externalProviderKeyRequired"));
});

it("does not translate model responses or note/chat contents", async () => {
  const content = "Default LLM provider — это текст пользователя, а не статус";
  mockIPC(command => { assert.equal(command, "run_note_ai"); return { status: "success", message: "Ответ модели получен", response: content, providerName: "LLM provider", model: "custom-model", isLocal: true }; });
  const result = await runNoteAi({ kind: "chat", scope: "note", question: content,
    context: { noteId: "qa", title: "QA", noteDate: "2026-11-04", project: "", tags: [], plainText: content, contentMarkdown: content } });
  assert.equal(result.response, content); assert.equal(result.providerName, "LLM provider"); assert.equal(result.model, "custom-model");
});

it("localizes model discovery and connection feedback without changing models/configuration", async () => {
  const models = ["cifra48/agent", "default provider/custom", "cifra48/embedding"];
  mockIPC(command => command === "list_llm_models"
    ? { status: "success", message: "Endpoint доступен, список моделей получен", models }
    : { status: "success", message: "Chat endpoint доступен. Выбранная модель проверена запросом, но не найдена в /models.", checkedAt: "2026-11-04T00:00:00Z", models, chatOk: true, embeddingsOk: false, isLocal: true });
  const result = await llm.listLlmModels("qa"); assert.deepEqual(result.models, models);
  assert.equal(result.message, uiMessage("ru", "modelListReceived"));
  assert.equal((await llm.testLlmProvider("qa")).message, uiMessage("ru", "chatVerifiedModelNotListed"));
});

it("localizes malformed provider replies and preserves public error codes/retry flags", async () => {
  mockIPC(() => ({}));
  await assert.rejects(llm.listLlmModels("qa"), { message: uiMessage("ru", "invalidModelsResponse") });
  await assert.rejects(llm.testLlmProvider("qa"), { message: uiMessage("ru", "invalidConnectionResponse") });
  mockIPC(() => { throw { code: "PROVIDER_UNAVAILABLE", message: "Модель или endpoint недоступны.", retryable: false }; });
  await assert.rejects(invoke("test_llm_provider"), error => error instanceof Error
    && error.message === uiMessage("ru", "providerUnavailable") && "code" in error && error.code === "PROVIDER_UNAVAILABLE"
    && "retryable" in error && error.retryable === false);
});

it("localizes embedding and global-chat errors through the same resources", async () => {
  mockIPC(() => ({ status: "error", message: "API key не принят провайдером", model: "cifra48/embedding", locality: "cloud", checkedAt: "2026-11-04T00:00:00Z" }));
  const result = await embeddings.testEmbeddingProvider("qa");
  assert.equal(result.message, uiMessage("ru", "apiKeyRejected")); assert.equal(result.model, "cifra48/embedding");
  const error = new RagGenerationError("provider_unauthorized", "Провайдер отклонил авторизацию. Проверьте API key.", false);
  assert.equal(error.message, uiMessage("ru", "providerAuthorizationFailed"));
  assert.equal(error.code, "provider_unauthorized"); assert.equal(error.retryable, false);
});

for (const language of ["ru", "en"] as const) it(`renders the actual disconnected AI toolbar message in ${language}`, async () => {
  editor = new Editor({ extensions: [StarterKit], content: "<p>Синтетический текст</p>" });
  root = createRoot(document.body.appendChild(document.createElement("div")));
  const before = JSON.stringify(editor.getJSON());
  await act(async () => root!.render(createElement(FormattingToolbar, { language, editor: editor!,
    aiStatus: { ...disconnected, providerName: undefined, model: undefined, privacyScope: "local" }, onAiAction() {}, onOpenAiSettings() {}, onToast() {} })));
  await act(async () => document.querySelector<HTMLButtonElement>('[data-toolbar-action="ai"]')!.click());
  assert.equal(document.querySelector(".ai-disconnected-state span")?.textContent, uiMessage(language, "defaultProviderNotSelected"));
  assert.equal(JSON.stringify(editor.getJSON()), before, "Opening localized AI UI cannot mutate the editor");
});
