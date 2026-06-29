import { invoke } from "@tauri-apps/api/core";

export const LLM_MODEL_LIST_TIMEOUT_MS = 15_000;
export const LLM_TEST_CONNECTION_TIMEOUT_MS = 10_000;

export type LlmProviderType = "openai" | "ollama" | "lmstudio" | "custom";
export type LlmProviderStatus = "not_configured" | "success" | "error";
export type LlmActionStatus = "success" | "error";

export interface LlmProvider {
  id: string;
  name: string;
  providerType: LlmProviderType;
  baseUrl: string;
  hasApiKey: boolean;
  chatModel: string;
  embeddingModel: string;
  modelsEndpoint: string;
  chatEndpoint: string;
  embeddingsEndpoint: string;
  timeoutMs: number;
  contextSize: number;
  temperature: number;
  streamingEnabled: boolean;
  customHeadersJson: string;
  isDefault: boolean;
  lastStatus: LlmProviderStatus;
  statusMessage?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
  isLocal: boolean;
  privacyNotice: string;
}

export interface SaveLlmProviderInput {
  id?: string;
  name: string;
  providerType: LlmProviderType;
  baseUrl: string;
  apiKey?: string;
  deleteApiKey?: boolean;
  chatModel: string;
  embeddingModel: string;
  modelsEndpoint: string;
  chatEndpoint: string;
  embeddingsEndpoint: string;
  timeoutMs: number;
  contextSize: number;
  temperature: number;
  streamingEnabled: boolean;
  customHeadersJson: string;
  isDefault: boolean;
}

export interface LlmKeyStatus {
  hasApiKey: boolean;
}

export interface LlmModelsResult {
  status: LlmActionStatus;
  message: string;
  models: string[];
}

export interface LlmConnectionTestResult {
  status: LlmActionStatus;
  message: string;
  checkedAt: string;
  models: string[];
  chatOk: boolean;
  embeddingsOk: boolean;
  isLocal: boolean;
}

interface LlmProviderDto {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  hasApiKey: boolean;
  chatModel: string;
  embeddingModel: string;
  modelsEndpoint: string;
  chatEndpoint: string;
  embeddingsEndpoint: string;
  timeoutMs: number;
  contextSize: number;
  temperature: number;
  streamingEnabled: boolean;
  customHeadersJson: string;
  isDefault: boolean;
  lastStatus: string;
  statusMessage?: string | null;
  lastCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  isLocal: boolean;
  privacyNotice: string;
}

interface LlmModelsResultDto {
  status: string;
  message: string;
  models: string[];
}

interface LlmConnectionTestResultDto {
  status: string;
  message: string;
  checkedAt: string;
  models: string[];
  chatOk: boolean;
  embeddingsOk: boolean;
  isLocal: boolean;
}

const providerTypes: readonly LlmProviderType[] = ["openai", "ollama", "lmstudio", "custom"];

function normalizeProviderType(value: string): LlmProviderType {
  return providerTypes.includes(value as LlmProviderType) ? (value as LlmProviderType) : "openai";
}

function normalizeProviderStatus(value: string): LlmProviderStatus {
  return value === "success" || value === "error" ? value : "not_configured";
}

function normalizeActionStatus(value: string): LlmActionStatus {
  return value === "success" ? "success" : "error";
}

function mapProvider(dto: LlmProviderDto): LlmProvider {
  return {
    id: dto.id,
    name: dto.name,
    providerType: normalizeProviderType(dto.providerType),
    baseUrl: dto.baseUrl,
    hasApiKey: dto.hasApiKey,
    chatModel: dto.chatModel,
    embeddingModel: dto.embeddingModel,
    modelsEndpoint: dto.modelsEndpoint,
    chatEndpoint: dto.chatEndpoint,
    embeddingsEndpoint: dto.embeddingsEndpoint,
    timeoutMs: dto.timeoutMs,
    contextSize: dto.contextSize,
    temperature: dto.temperature,
    streamingEnabled: dto.streamingEnabled,
    customHeadersJson: dto.customHeadersJson,
    isDefault: dto.isDefault,
    lastStatus: normalizeProviderStatus(dto.lastStatus),
    statusMessage: dto.statusMessage ?? undefined,
    lastCheckedAt: dto.lastCheckedAt ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    isLocal: dto.isLocal,
    privacyNotice: dto.privacyNotice,
  };
}

function mapModelsResult(dto: LlmModelsResultDto): LlmModelsResult {
  return {
    status: normalizeActionStatus(dto.status),
    message: dto.message,
    models: dto.models,
  };
}

function mapTestResult(dto: LlmConnectionTestResultDto): LlmConnectionTestResult {
  return {
    status: normalizeActionStatus(dto.status),
    message: dto.message,
    checkedAt: dto.checkedAt,
    models: dto.models,
    chatOk: dto.chatOk,
    embeddingsOk: dto.embeddingsOk,
    isLocal: dto.isLocal,
  };
}

function timeoutError(message: string) {
  return new Error(message);
}

function withInvokeTimeout<T>(request: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(timeoutError(message)), timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

export async function listLlmProviders() {
  const providers = await invoke<LlmProviderDto[]>("list_llm_providers");
  return providers.map(mapProvider);
}

export async function saveLlmProvider(input: SaveLlmProviderInput) {
  return mapProvider(
    await invoke<LlmProviderDto>("save_llm_provider", {
      request: {
        id: input.id ?? null,
        name: input.name,
        providerType: input.providerType,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey?.trim() ? input.apiKey : null,
        deleteApiKey: input.deleteApiKey ?? false,
        chatModel: input.chatModel,
        embeddingModel: input.embeddingModel,
        modelsEndpoint: input.modelsEndpoint,
        chatEndpoint: input.chatEndpoint,
        embeddingsEndpoint: input.embeddingsEndpoint,
        timeoutMs: input.timeoutMs,
        contextSize: input.contextSize,
        temperature: input.temperature,
        streamingEnabled: input.streamingEnabled,
        customHeadersJson: input.customHeadersJson,
        isDefault: input.isDefault,
      },
    }),
  );
}

export async function deleteLlmProvider(providerId: string) {
  await invoke<void>("delete_llm_provider", { providerId });
}

export async function setDefaultLlmProvider(providerId: string) {
  return mapProvider(await invoke<LlmProviderDto>("set_default_llm_provider", { providerId }));
}

export async function deleteLlmProviderKey(providerId: string) {
  return mapProvider(await invoke<LlmProviderDto>("delete_llm_provider_key", { providerId }));
}

export async function checkLlmProviderKey(providerId: string) {
  return await invoke<LlmKeyStatus>("check_llm_provider_key", { providerId });
}

export async function listLlmModels(providerId: string) {
  return mapModelsResult(
    await withInvokeTimeout(
      invoke<LlmModelsResultDto>("list_llm_models", { providerId }),
      LLM_MODEL_LIST_TIMEOUT_MS,
      "Timeout: список моделей не был получен за 15 секунд. Проверьте Base URL, endpoint и состояние локального сервера.",
    ),
  );
}

export async function testLlmProvider(providerId: string) {
  return mapTestResult(
    await withInvokeTimeout(
      invoke<LlmConnectionTestResultDto>("test_llm_provider", { providerId }),
      LLM_TEST_CONNECTION_TIMEOUT_MS,
      "Timeout: проверка подключения не завершилась за 10 секунд. Проверьте, запущена ли локальная модель и доступен ли endpoint.",
    ),
  );
}
