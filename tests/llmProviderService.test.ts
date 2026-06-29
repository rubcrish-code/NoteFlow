import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("LLM provider frontend contract", () => {
  it("routes provider access through typed Tauri commands", () => {
    const source = readFileSync("src/services/llmProviderService.ts", "utf8");

    assert.match(source, /from "@tauri-apps\/api\/core"/);
    assert.match(source, /invoke<LlmProviderDto\[]>\("list_llm_providers"/);
    assert.match(source, /invoke<LlmProviderDto>\("save_llm_provider"/);
    assert.match(source, /invoke<LlmConnectionTestResultDto>\("test_llm_provider"/);
    assert.match(source, /invoke<LlmModelsResultDto>\("list_llm_models"/);
    assert.match(source, /withInvokeTimeout/);
    assert.match(source, /LLM_TEST_CONNECTION_TIMEOUT_MS = 10_000/);
    assert.match(source, /LLM_MODEL_LIST_TIMEOUT_MS = 15_000/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /XMLHttpRequest/);
  });

  it("does not render saved API keys back into the settings form", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");

    assert.match(source, /apiKey: ""/);
    assert.match(source, /Ключ сохранён/);
    assert.match(source, /Реальный ключ не возвращается в форму после сохранения/);
    assert.doesNotMatch(source, /provider\.apiKey/);
    assert.doesNotMatch(source, /localStorage/);
  });

  it("shows connection status and safe error surface in the settings page", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");

    assert.match(source, /Проверить подключение/);
    assert.match(source, /Получить модели/);
    assert.match(source, /Ошибка подключения/);
    assert.match(source, /connection-note/);
  });

  it("keeps LLM network loading local instead of globally blocking settings", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");

    assert.match(source, /type NetworkAction = "models" \| "test" \| null/);
    assert.match(source, /type StorageAction = "default" \| "delete" \| "key" \| "save" \| null/);
    assert.match(source, /disabled=\{isTestingConnection\}/);
    assert.match(source, /disabled=\{isLoadingModels\}/);
    assert.match(source, /Проверяем…/);
    assert.match(source, /Загружаем модели…/);
    assert.match(source, /button-spinner/);
    assert.doesNotMatch(source, /disabled=\{isBusy\}/);
    assert.doesNotMatch(source, /const isBusy =/);
  });

  it("ignores stale LLM operation results when provider fields change", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");

    assert.match(source, /latestNetworkRequestIdRef/);
    assert.match(source, /currentFormRef/);
    assert.match(source, /formSignature/);
    assert.match(source, /isNetworkResultCurrent/);
    assert.match(source, /isMountedRef/);
  });
});
