import { invoke } from "./safeInvoke";

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

export interface DraftLlmProviderInput {
  providerId?: string;
  providerType: LlmProviderType;
  baseUrl: string;
  apiKey?: string;
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
}

export interface LlmKeyStatus {
  hasApiKey: boolean;
}

export interface LlmModelsResult {
  status: LlmActionStatus;
  message: string;
  models: string[];
  options: ModelDiscoveryOption[];
}

export interface ModelDiscoveryOption {
  id: string;
  supportsChat: boolean | null;
  supportsEmbeddings: boolean | null;
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

export interface LlmNetworkTraceContext {
  operationId?: number;
  targetId?: string;
  draftId?: string;
  fingerprint?: string;
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
  options?: ModelDiscoveryOptionDto[];
}

interface ModelDiscoveryOptionDto {
  id: string;
  supportsChat?: boolean | null;
  supportsEmbeddings?: boolean | null;
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

type LlmDiagnosticValue = string | number | boolean | null | undefined;

const providerTypes: readonly LlmProviderType[] = ["openai", "ollama", "lmstudio", "custom"];

function safeUrlForDiagnostics(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return "<invalid-provider-url>";
  }
}

function diagnosticProviderInput(input: DraftLlmProviderInput | SaveLlmProviderInput) {
  return {
    providerType: input.providerType,
    baseUrl: safeUrlForDiagnostics(input.baseUrl),
    modelsEndpoint: input.modelsEndpoint,
    chatEndpoint: input.chatEndpoint,
    embeddingsEndpoint: input.embeddingsEndpoint,
    chatModel: input.chatModel,
    embeddingModel: input.embeddingModel,
    hasApiKey: Boolean(input.apiKey?.trim()),
    timeoutMs: input.timeoutMs,
  };
}

export function logLlmDiagnostic(event: string, fields: Record<string, LlmDiagnosticValue> = {}) {
  if (!import.meta.env?.DEV) {
    return;
  }
  const allowed = new Set(["command", "providerType", "status", "modelsCount", "chatOk", "embeddingsOk", "timeoutMs", "maxTokens", "operationId"]);
  const safeFields = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.has(key)));
  console.debug("[NoteFlow LLM]", event, safeFields);
}

function safeErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeProviderType(value: string): LlmProviderType {
  return providerTypes.includes(value as LlmProviderType) ? (value as LlmProviderType) : "openai";
}

function normalizeProviderStatus(value: string): LlmProviderStatus {
  return value === "success" || value === "error" ? value : "not_configured";
}

function normalizeActionStatus(value: string): LlmActionStatus {
  return value === "success" ? "success" : "error";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateModelsResultDto(value: unknown): LlmModelsResultDto {
  const dto = value as Partial<LlmModelsResultDto> | null;
  if (!dto || typeof dto.status !== "string" || typeof dto.message !== "string" || !isStringArray(dto.models)) {
    throw new Error("LLM provider returned an unexpected models DTO.");
  }
  return {
    status: dto.status,
    message: dto.message,
    models: dto.models,
    options: Array.isArray(dto.options)
      ? dto.options.filter(isModelDiscoveryOptionDto)
      : undefined,
  };
}

function isModelDiscoveryOptionDto(value: unknown): value is ModelDiscoveryOptionDto {
  const option = value as Partial<ModelDiscoveryOptionDto> | null;
  return Boolean(
    option
      && typeof option.id === "string"
      && (option.supportsChat == null || typeof option.supportsChat === "boolean")
      && (option.supportsEmbeddings == null || typeof option.supportsEmbeddings === "boolean"),
  );
}

function validateConnectionTestResultDto(value: unknown): LlmConnectionTestResultDto {
  const dto = value as Partial<LlmConnectionTestResultDto> | null;
  if (
    !dto ||
    typeof dto.status !== "string" ||
    typeof dto.message !== "string" ||
    typeof dto.checkedAt !== "string" ||
    !isStringArray(dto.models) ||
    typeof dto.chatOk !== "boolean" ||
    typeof dto.embeddingsOk !== "boolean" ||
    typeof dto.isLocal !== "boolean"
  ) {
    throw new Error("LLM provider returned an unexpected connection-test DTO.");
  }
  return {
    status: dto.status,
    message: dto.message,
    checkedAt: dto.checkedAt,
    models: dto.models,
    chatOk: dto.chatOk,
    embeddingsOk: dto.embeddingsOk,
    isLocal: dto.isLocal,
  };
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

function mapModelsResult(value: unknown): LlmModelsResult {
  const dto = validateModelsResultDto(value);
  const options = dto.options?.map((option) => ({
    id: option.id,
    supportsChat: option.supportsChat ?? null,
    supportsEmbeddings: option.supportsEmbeddings ?? null,
  })) ?? dto.models.map((id) => ({ id, supportsChat: null, supportsEmbeddings: null }));
  return {
    status: normalizeActionStatus(dto.status),
    message: dto.message,
    models: dto.models,
    options,
  };
}

function mapTestResult(value: unknown): LlmConnectionTestResult {
  const dto = validateConnectionTestResultDto(value);
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

function withInvokeTimeout<T>(
  request: Promise<T>,
  timeoutMs: number,
  message: string,
  trace?: LlmNetworkTraceContext,
  command = "unknown",
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      logLlmDiagnostic("tauri_invoke_timed_out", {
        command,
        operationId: trace?.operationId,
        targetId: trace?.targetId,
        timeoutMs,
      });
      reject(timeoutError(message));
    }, timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

function traceInvoke<T>(command: string, args: Record<string, unknown>, trace?: LlmNetworkTraceContext) {
  logLlmDiagnostic("tauri_invoke_started", {
    command,
    operationId: trace?.operationId,
    targetId: trace?.targetId,
    draftId: trace?.draftId,
  });
  return invoke<T>(command, args)
    .then((result) => {
      logLlmDiagnostic("tauri_invoke_resolved", {
        command,
        operationId: trace?.operationId,
        targetId: trace?.targetId,
        draftId: trace?.draftId,
      });
      return result;
    })
    .catch((error: unknown) => {
      logLlmDiagnostic("tauri_invoke_rejected", {
        command,
        operationId: trace?.operationId,
        targetId: trace?.targetId,
        draftId: trace?.draftId,
        error: safeErrorMessage(error, "invoke rejected"),
      });
      throw error;
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

export async function listLlmModels(providerId: string, trace?: LlmNetworkTraceContext) {
  const command = "list_llm_models";
  logLlmDiagnostic("frontend_service_called", {
    command,
    providerId,
    operationId: trace?.operationId,
    targetId: trace?.targetId,
  });
  return mapModelsResult(
    await withInvokeTimeout(
      traceInvoke<LlmModelsResultDto>(command, { providerId }, trace),
      LLM_MODEL_LIST_TIMEOUT_MS,
      "Timeout: список моделей не был получен за 15 секунд. Проверьте Base URL, endpoint и состояние локального сервера.",
    ),
  );
}

function draftRequest(input: DraftLlmProviderInput) {
  return {
    providerId: input.providerId ?? null,
    providerType: input.providerType,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey?.trim() ? input.apiKey : null,
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
  };
}

export async function listLlmModelsForDraft(input: DraftLlmProviderInput, trace?: LlmNetworkTraceContext) {
  const command = "list_llm_models_for_draft";
  logLlmDiagnostic("frontend_service_called", {
    command,
    operationId: trace?.operationId,
    targetId: trace?.targetId,
    draftId: trace?.draftId,
    fingerprint: trace?.fingerprint,
    ...diagnosticProviderInput(input),
  });
  return mapModelsResult(
    await withInvokeTimeout(
      traceInvoke<LlmModelsResultDto>(command, { request: draftRequest(input) }, trace),
      LLM_MODEL_LIST_TIMEOUT_MS,
      "Timeout: список моделей не был получен за 15 секунд. Проверьте Base URL, endpoint и состояние локального сервера.",
    ),
  );
}

export async function testLlmProvider(providerId: string, trace?: LlmNetworkTraceContext) {
  const command = "test_llm_provider";
  logLlmDiagnostic("frontend_service_called", {
    command,
    providerId,
    operationId: trace?.operationId,
    targetId: trace?.targetId,
  });
  return mapTestResult(
    await withInvokeTimeout(
      traceInvoke<LlmConnectionTestResultDto>(command, { providerId }, trace),
      LLM_TEST_CONNECTION_TIMEOUT_MS,
      "Timeout: проверка подключения не завершилась за 10 секунд. Проверьте, запущена ли локальная модель и доступен ли endpoint.",
    ),
  );
}

export async function testLlmProviderDraft(input: DraftLlmProviderInput, trace?: LlmNetworkTraceContext) {
  const command = "test_llm_provider_draft";
  logLlmDiagnostic("frontend_service_called", {
    command,
    operationId: trace?.operationId,
    targetId: trace?.targetId,
    draftId: trace?.draftId,
    fingerprint: trace?.fingerprint,
    ...diagnosticProviderInput(input),
  });
  return mapTestResult(
    await withInvokeTimeout(
      traceInvoke<LlmConnectionTestResultDto>(command, { request: draftRequest(input) }, trace),
      LLM_TEST_CONNECTION_TIMEOUT_MS,
      "Timeout: проверка подключения не завершилась за 10 секунд. Проверьте, запущена ли локальная модель и доступен ли endpoint.",
    ),
  );
}
