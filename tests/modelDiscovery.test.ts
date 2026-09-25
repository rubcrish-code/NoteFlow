import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Root } from "react-dom/client";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ModelDiscoveryOption } from "../src/features/settings/ModelSettingsUi";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

const { createRoot } = await import("react-dom/client");
const { ModelDiscoveryField, filterModelDiscoveryOptions } = await import("../src/features/settings/ModelSettingsUi");
const llmProviderService = await import("../src/services/llmProviderService");
const embeddingService = await import("../src/services/embeddingService");
let root: Root;
let container: HTMLDivElement;

const catalog: ModelDiscoveryOption[] = [
  { id: "chat-only", supportsChat: true, supportsEmbeddings: false },
  { id: "embed-only", supportsChat: false, supportsEmbeddings: true },
  { id: "unknown", supportsChat: null, supportsEmbeddings: null },
];

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

describe("model discovery field", () => {
  it("renders a real selectable catalog and keeps unknown-capability models for both purposes", async () => {
    let selected = "";
    await renderField({
      options: catalog,
      purpose: "chat",
      state: "success",
      onSelect: (value) => { selected = value; },
    });

    const select = container.querySelector("select");
    assert.ok(select);
    assert.deepEqual(Array.from(select.options).map((option) => option.value), ["", "chat-only", "unknown"]);
    select.value = "chat-only";
    await act(async () => select.dispatchEvent(new Event("change", { bubbles: true })));
    assert.equal(selected, "chat-only");
    assert.deepEqual(filterModelDiscoveryOptions(catalog, "embedding").map((option) => option.id), ["embed-only", "unknown"]);
  });

  it("shows stable loading, empty and retry actions without removing manual fallback", async () => {
    await renderField({ state: "loading", statusMessage: "Загружаем актуальный список моделей…" });
    let action = container.querySelector<HTMLButtonElement>("button");
    assert.equal(action?.disabled, true);
    assert.match(action?.textContent ?? "", /Загружаем модели/);
    assert.ok(container.querySelector("input"));

    await renderField({ state: "empty", statusMessage: "Endpoint доступен, но список моделей пуст" });
    action = container.querySelector("button");
    assert.equal(action?.textContent?.trim(), "Обновить список");
    assert.equal(container.querySelector("select"), null);

    let retries = 0;
    await renderField({ state: "error", statusMessage: "Не удалось получить список моделей", onDiscover: () => { retries += 1; } });
    action = container.querySelector("button");
    assert.equal(action?.textContent?.trim(), "Повторить");
    await act(async () => action?.click());
    assert.equal(retries, 1);
  });

  it("keeps Model ID editable as a fallback", async () => {
    let manual = "";
    await renderField({ manualValue: "saved-model", onManualChange: (value) => { manual = value; } });
    const input = container.querySelector<HTMLInputElement>("input");
    assert.equal(input?.value, "saved-model");
    if (!input) assert.fail("manual model input exists");
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set?.call(input, "manual-model");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    assert.equal(manual, "manual-model");
  });
});

describe("model discovery service contract", () => {
  it("maps capability metadata and sends the saved provider id without exposing a key", async () => {
    let request: Record<string, unknown> | undefined;
    mockIPC((command, args) => {
      assert.equal(command, "list_llm_models_for_draft");
      request = args.request as Record<string, unknown>;
      return {
        status: "success",
        message: "Получено моделей: 2",
        models: ["chat-model", "unknown-model"],
        options: [
          { id: "chat-model", supportsChat: true, supportsEmbeddings: false },
          { id: "unknown-model", supportsChat: null, supportsEmbeddings: null },
        ],
      };
    });

    const result = await llmProviderService.listLlmModelsForDraft({
      providerId: "provider-1",
      providerType: "custom",
      baseUrl: "https://bridge.example.test/api/v1",
      chatModel: "",
      embeddingModel: "",
      modelsEndpoint: "/models",
      chatEndpoint: "/chat/completions",
      embeddingsEndpoint: "/embeddings",
      timeoutMs: 15_000,
      contextSize: 16_384,
      temperature: 0.3,
      streamingEnabled: true,
      customHeadersJson: "{}",
    });

    assert.equal(request?.providerId, "provider-1");
    assert.equal(request?.apiKey, null);
    assert.deepEqual(result.options, [
      { id: "chat-model", supportsChat: true, supportsEmbeddings: false },
      { id: "unknown-model", supportsChat: null, supportsEmbeddings: null },
    ]);
  });

  it("uses the same catalog contract for embedding profiles and persists the chosen model", async () => {
    const requests: Array<{ command: string; request?: Record<string, unknown> }> = [];
    mockIPC((command, args) => {
      requests.push({ command, request: args.request as Record<string, unknown> | undefined });
      if (command === "list_embedding_models") {
        return {
          status: "success",
          message: "Найдено моделей: 2",
          models: ["embed-model", "unknown-model"],
          options: [
            { id: "embed-model", supportsChat: false, supportsEmbeddings: true },
            { id: "unknown-model", supportsChat: null, supportsEmbeddings: null },
          ],
        };
      }
      if (command === "save_embedding_profile") {
        return { id: "profile-1", ...(args.request as Record<string, unknown>) };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = await embeddingService.listEmbeddingModels({
      profileId: "profile-1",
      providerType: "custom",
      baseUrl: "https://bridge.example.test/api/v1",
      timeoutSeconds: 15,
    });
    assert.deepEqual(result.options.map((option) => option.id), ["embed-model", "unknown-model"]);

    await embeddingService.saveEmbeddingProfile({
      id: "profile-1",
      name: "Bridge embedding",
      providerType: "custom",
      baseUrl: "https://bridge.example.test/api/v1",
      embeddingsEndpoint: "/embeddings",
      model: "embed-model",
      batchSize: 16,
      timeoutSeconds: 15,
      locality: "cloud",
    });
    assert.equal(requests[0]?.request?.profileId, "profile-1");
    assert.equal(requests[1]?.request?.model, "embed-model");
  });
});

async function renderField(overrides: Partial<Parameters<typeof ModelDiscoveryField>[0]>) {
  const props: Parameters<typeof ModelDiscoveryField>[0] = {
    label: "Модель",
    manualPlaceholder: "Введите Model ID",
    manualValue: "",
    onDiscover: () => {},
    onManualChange: () => {},
    onSelect: () => {},
    options: [],
    purpose: "chat",
    state: "idle",
    ...overrides,
  };
  await act(async () => root.render(h(ModelDiscoveryField, props)));
}
