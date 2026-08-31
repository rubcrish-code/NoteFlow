import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("LLM provider frontend contract", () => {
  it("routes provider access through typed Tauri commands", () => {
    const source = readFileSync("src/services/llmProviderService.ts", "utf8");

    assert.match(source, /from "@tauri-apps\/api\/core"/);
    assert.match(source, /invoke<LlmProviderDto\[]>\("list_llm_providers"/);
    assert.match(source, /invoke<LlmProviderDto>\("save_llm_provider"/);
    assert.match(source, /const command = "test_llm_provider"/);
    assert.match(source, /const command = "list_llm_models"/);
    assert.match(source, /const command = "test_llm_provider_draft"/);
    assert.match(source, /const command = "list_llm_models_for_draft"/);
    assert.match(source, /traceInvoke<LlmConnectionTestResultDto>\(command/);
    assert.match(source, /traceInvoke<LlmModelsResultDto>\(command/);
    assert.match(source, /DraftLlmProviderInput/);
    assert.match(source, /withInvokeTimeout/);
    assert.match(source, /validateModelsResultDto/);
    assert.match(source, /validateConnectionTestResultDto/);
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

    assert.match(source, /Проверить/);
    assert.match(source, /Получить модели/);
    assert.match(source, /Не удалось проверить подключение/);
    assert.match(source, /connection-note/);
  });

  it("keeps LLM network loading local instead of globally blocking settings", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
    const operationSource = readFileSync("src/features/settings/llmNetworkOperation.ts", "utf8");

    assert.match(operationSource, /export type LlmNetworkAction = "listModels" \| "testConnection"/);
    assert.match(operationSource, /targetKind/);
    assert.match(operationSource, /targetId/);
    assert.match(operationSource, /fingerprint/);
    assert.match(source, /networkOperation/);
    assert.match(source, /checkingProviderId/);
    assert.match(source, /loadingModelsProviderId/);
    assert.match(source, /type StorageAction = "default" \| "delete" \| "key" \| "save" \| null/);
    assert.match(source, /disabled=\{isTestingConnection\}/);
    assert.match(source, /disabled=\{isLoadingModels\}/);
    assert.match(source, /networkOperation\.timeoutMs \+ 250/);
    assert.match(source, /ignoreTimeout: true/);
    assert.match(source, /isLlmNetworkOperationActiveById/);
    assert.match(source, /ui_timeout_fired/);
    assert.match(source, /cleanup_loading_called/);
    assert.match(source, /finishNetworkOperation\(networkOperation\)/);
    assert.match(source, /Проверяем…/);
    assert.match(source, /Загружаем модели…/);
    assert.match(source, /button-spinner/);
    assert.doesNotMatch(source, /disabled=\{isBusy\}/);
    assert.doesNotMatch(source, /const isBusy =/);
    assert.doesNotMatch(source, /setNetworkAction/);
  });

  it("ignores stale LLM operation results when provider fields change", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
    const operationSource = readFileSync("src/features/settings/llmNetworkOperation.ts", "utf8");

    assert.match(source, /latestNetworkRequestIdRef/);
    assert.match(source, /currentFormRef/);
    assert.match(source, /formSignature/);
    assert.match(source, /isNetworkResultCurrent/);
    assert.match(source, /isMountedRef/);
    assert.match(operationSource, /isLlmNetworkOperationCurrent/);
    assert.match(operationSource, /currentTargetId/);
    assert.match(operationSource, /deletedTargetIds/);
  });

  it("clears pending LLM operations on provider deletion, switch and unmount", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");

    assert.match(source, /cancelNetworkOperationForTarget\(`provider:\$\{providerId\}`,\s*\{ markDeleted: true \}\)/);
    assert.match(source, /markDeleted: !currentFormRef\.current\.id/);
    assert.match(source, /function closeProviderModal\(\)/);
    assert.match(source, /window\.addEventListener\("keydown", handleKeyDown\)/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /networkOperationRef\.current = null/);
    assert.match(source, /finishNetworkOperation\(operation\)/);
    assert.match(source, /preserveNetworkOperation: true/);
  });

  it("keeps mounted refs valid after React dev strict-mode effect remounts", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");

    assert.match(source, /useEffect\(\(\) => \{\s*isMountedRef\.current = true;[\s\S]*?isMountedRef\.current = false;/);
  });

  it("does not persist draft state while listing models or testing connection", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
    const loadModelsBlock = source.match(/async function handleLoadModels\(\) \{[\s\S]*?async function handleTestConnection/);
    const testConnectionBlock = source.match(/async function handleTestConnection\(\) \{[\s\S]*?async function handleDeleteKey/);

    assert.ok(loadModelsBlock);
    assert.ok(testConnectionBlock);
    assert.match(loadModelsBlock[0], /listLlmModelsForDraft\(draftInputFromForm\(snapshot\), traceContext\(operation\)\)/);
    assert.match(testConnectionBlock[0], /testLlmProviderDraft\(draftInputFromForm\(snapshot\), traceContext\(operation\)\)/);
    assert.match(loadModelsBlock[0], /isNetworkResultCurrent\(operation\)/);
    assert.match(testConnectionBlock[0], /isNetworkResultCurrent\(operation\)/);
    assert.doesNotMatch(loadModelsBlock[0], /persistProvider|saveCurrentProvider|saveLlmProvider|updateProviderInState|setSelectedProviderId/);
    assert.doesNotMatch(testConnectionBlock[0], /persistProvider|saveCurrentProvider|saveLlmProvider|updateProviderInState|setSelectedProviderId/);
  });

  it("keeps the OpenAI-compatible Bridge API contract in the backend", () => {
    const llmSource = readFileSync("src-tauri/src/llm.rs", "utf8");

    assert.match(llmSource, /OPENAI_COMPATIBLE_USER_AGENT: &str =/);
    assert.match(llmSource, /Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36/);
    assert.match(llmSource, /OPENAI_COMPATIBLE_TEST_MAX_TOKENS: i64 = 512/);
    assert.match(llmSource, /OPENAI_COMPATIBLE_NOTE_AI_MAX_TOKENS: i64 = 2048/);
    assert.match(llmSource, /strip_endpoint_suffix\(&normalized, "\/chat\/completions"\)/);
    assert.match(llmSource, /fn test_openai_compatible_connection/);
    assert.match(llmSource, /openai_compatible_connection_test_body/);
    assert.match(llmSource, /join_url\(&provider\.base_url, &provider\.chat_endpoint\)/);
    assert.match(llmSource, /has_header\(&headers, "Authorization"\)/);
    assert.match(llmSource, /has_header\(&headers, "User-Agent"\)/);
    assert.match(llmSource, /"Не удалось получить список моделей\. Введите название модели вручную\."/);
    assert.match(llmSource, /403 Forbidden: запрос заблокирован WAF или провайдером\. Проверьте доступ, API key и User-Agent\./);
    assert.match(llmSource, /choice\.pointer\("\/message\/content"\)/);
    assert.match(llmSource, /choice\.pointer\("\/message\/reasoning"\)/);
    assert.doesNotMatch(llmSource, /choice\.pointer\("\/message\/reasoning"\)[\s\S]{0,240}\.unwrap_or_default\(\)[\s\S]{0,120}\.to_string\(\)/);
  });

  it("keeps LLM diagnostics out of production and away from secrets or prompts", () => {
    const frontendSource = readFileSync("src/services/llmProviderService.ts", "utf8");
    const llmSource = readFileSync("src-tauri/src/llm.rs", "utf8");

    assert.match(frontendSource, /if \(!import\.meta\.env\.DEV\) \{\s*return;\s*\}/);
    assert.match(frontendSource, /console\.debug\("\[NoteFlow LLM\]", event, fields\)/);
    assert.match(frontendSource, /hasApiKey: Boolean\(input\.apiKey\?\.trim\(\)\)/);
    assert.doesNotMatch(frontendSource, /console\.(?:debug|log|info|warn|error)\([^)]*input\.apiKey/);

    assert.match(llmSource, /#\[cfg\(debug_assertions\)\][\s\S]*eprintln!\("\[NoteFlow LLM\] \{event\} \{rendered\}"\)/);
    assert.match(llmSource, /#\[cfg\(not\(debug_assertions\)\)\][\s\S]*let _ = event;[\s\S]*let _ = fields;/);
    assert.match(llmSource, /has_header\(&headers, "Authorization"\)\.to_string\(\)/);
    assert.match(llmSource, /has_header\(&headers, "User-Agent"\)\.to_string\(\)/);
    assert.doesNotMatch(llmSource, /eprintln!\([^)]*api_key|println!\([^)]*api_key|dbg!\(/);
    const diagnosticCalls = (llmSource.match(/log_llm_diagnostic\([\s\S]*?\n\s*\);/g) ?? []).filter(
      (diagnosticCall) => !diagnosticCall.startsWith("log_llm_diagnostic(event"),
    );
    assert.ok(diagnosticCalls.length > 0);
    for (const diagnosticCall of diagnosticCalls) {
      assert.doesNotMatch(diagnosticCall, /prompt\.system|prompt\.user|request\.context|selected_text|plain_text|content_markdown|api_key|message\.reasoning|\/message\/reasoning/i);
      assert.doesNotMatch(diagnosticCall, /Authorization"\s*,\s*format!|Bearer \{\}|response\.body|request\.body/);
    }
  });

  it("persists provider state only through explicit save", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
    const saveBlock = source.match(/async function handleSave\(\) \{[\s\S]*?async function handleLoadModels/);
    const persistBlock = source.match(/async function persistProvider\(providerForm: ProviderFormState\) \{[\s\S]*?async function saveCurrentProvider/);

    assert.ok(saveBlock);
    assert.ok(persistBlock);
    assert.match(saveBlock[0], /saveCurrentProvider\(\)/);
    assert.match(persistBlock[0], /saveLlmProvider/);
    assert.match(persistBlock[0], /apiKey: providerForm\.apiKey/);
  });

  it("keeps provider-specific defaults and hides API keys for local providers", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");

    assert.match(source, /id: "ollama"[\s\S]*url: "http:\/\/127\.0\.0\.1:11434"[\s\S]*modelsEndpoint: "\/api\/tags"/);
    assert.match(source, /id: "lmstudio"[\s\S]*url: "http:\/\/localhost:1234\/v1"/);
    assert.match(source, /showApiKeyField = !isLocalProviderType\(form\.providerType\)/);
    assert.match(source, /showBaseUrlField = form\.providerType !== "openai"/);
    assert.match(source, /form\.providerType === "ollama" && \/\\\/v1\\\/\?\$\/i\.test\(baseUrl\)/);
  });

  it("renders the provider list as the main page and moves add/edit into a modal", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
    const modalSource = readFileSync("src/features/settings/ModelSettingsUi.tsx", "utf8");
    const styles = readFileSync("src/styles/app.css", "utf8");

    assert.match(source, /llm-empty-state-card/);
    assert.match(source, /llm-provider-card/);
    assert.match(source, /onClick=\{\(\) => openAddProvider\(\)\}/);
    assert.match(source, /onClick=\{\(\) => openEditProvider\(provider\)\}/);
    assert.match(source, /<SettingsModalShell[\s\S]*className="llm-provider-modal"/);
    assert.match(modalSource, /backdropClassName="modal-backdrop settings-modal-backdrop"/);
    assert.match(modalSource, /<ModalShell/);
    const sharedModalSource = readFileSync("src/shared/ModalShell.tsx", "utf8");
    assert.match(sharedModalSource, /role="dialog"/);
    assert.match(sharedModalSource, /aria-modal="true"/);
    assert.match(source, /<ProviderTypeSelector/);
    assert.doesNotMatch(source, /llm-provider-manager-grid/);
    assert.match(styles, /\.llm-provider-modal/);
    assert.match(styles, /\.llm-provider-cards/);
    assert.match(styles, /\.llm-empty-state-card/);
  });

  it("keeps the empty state to one visible add connection action", () => {
    const source = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");

    assert.match(source, /providers\.length > 0 \? \(/);
    assert.match(source, /providers\.length === 0 && !isLoadingProviders/);
    assert.match(source, /llm-empty-state-card/);
    assert.match(source, /shouldShowConnectionNote/);
  });
});
