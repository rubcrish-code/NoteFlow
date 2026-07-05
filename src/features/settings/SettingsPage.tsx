import { useEffect, useMemo, useRef, useState } from "react";
import type { AppLanguage, AppSection, SettingsPanel, ThemeMode } from "../../app/types";
import { PageShell } from "../navigation/PageShell";
import { APP_ZOOM_MAX, APP_ZOOM_MIN } from "../../shared/appZoom";
import * as llmProviderService from "../../services/llmProviderService";
import type { LlmProvider, LlmProviderType } from "../../services/llmProviderService";
import {
  createLlmNetworkOperation,
  getVisibleLlmNetworkAction,
  isLlmNetworkOperationActiveById,
  shouldClearLlmNetworkOperationForTarget,
} from "./llmNetworkOperation";
import type { LlmNetworkAction, LlmNetworkOperation } from "./llmNetworkOperation";

interface SettingsPageProps {
  appZoomPercent: number;
  language: AppLanguage;
  theme: ThemeMode;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onBackupCreate: () => void;
  onExportCurrentNote: () => void;
  onExportCurrentProject: () => void;
  onImportBackup: (file: File) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onToast: (message: string) => void;
  onZoomDecrease: () => void;
  onZoomIncrease: () => void;
  onZoomReset: () => void;
}

const settingsPanels: Array<{ id: SettingsPanel; label: string }> = [
  { id: "models", label: "Модели ИИ" },
  { id: "appearance", label: "Внешний вид" },
  { id: "language", label: "Язык" },
  { id: "data", label: "Данные и экспорт" },
  { id: "shortcuts", label: "Горячие клавиши" },
];

const providerPresets = [
  {
    id: "openai",
    label: "OpenAI",
    detail: "Публичный API с ключом",
    icon: "◎",
    url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    modelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    embeddingsEndpoint: "/embeddings",
  },
  {
    id: "ollama",
    label: "Ollama",
    detail: "Локально на компьютере",
    icon: "◉",
    url: "http://127.0.0.1:11434",
    model: "qwen3-4b-local:latest",
    modelsEndpoint: "/api/tags",
    chatEndpoint: "/api/generate",
    embeddingsEndpoint: "/api/embeddings",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    detail: "Локальный OpenAI API",
    icon: "▣",
    url: "http://localhost:1234/v1",
    model: "local-model",
    modelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    embeddingsEndpoint: "/embeddings",
  },
  {
    id: "custom",
    label: "OpenAI-compatible",
    detail: "Свой сервер или другой API",
    icon: "</>",
    url: "http://localhost:8000/v1",
    model: "custom-model",
    modelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    embeddingsEndpoint: "/embeddings",
  },
] as const;

type ProviderPreset = (typeof providerPresets)[number];
type StorageAction = "default" | "delete" | "key" | "save" | null;
type MessageTone = "neutral" | "error";
type DraftMode = "new" | "edit";

interface ProviderFormState {
  id?: string;
  name: string;
  providerType: LlmProviderType;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  modelsEndpoint: string;
  chatEndpoint: string;
  embeddingsEndpoint: string;
  timeoutSec: string;
  contextSize: string;
  temperature: string;
  streamingEnabled: boolean;
  customHeadersJson: string;
  isDefault: boolean;
}

export function SettingsPage({
  appZoomPercent,
  language,
  theme,
  onBackupCreate,
  onExportCurrentNote,
  onExportCurrentProject,
  onImportBackup,
  onLanguageChange,
  onNavigate,
  onNewNote,
  onThemeChange,
  onToast,
  onZoomDecrease,
  onZoomIncrease,
  onZoomReset,
}: SettingsPageProps) {
  const [activePanel, setActivePanel] = useState<SettingsPanel>("models");

  return (
    <PageShell activeSection="settings" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <div className="settings-layout-inner">
        <aside className="settings-nav-col">
          <div className="nav-sec">НАСТРОЙКИ</div>
          {settingsPanels.map((panel) => (
            <button className={`nav-i settings-nav ${activePanel === panel.id ? "on" : ""}`} key={panel.id} onClick={() => setActivePanel(panel.id)} type="button">
              <span>{panel.label}</span>
            </button>
          ))}
        </aside>

        <section className="settings-content">
          {activePanel === "models" ? <ModelsSettings onToast={onToast} /> : null}
          {activePanel === "appearance" ? (
            <AppearanceSettings
              appZoomPercent={appZoomPercent}
              onThemeChange={onThemeChange}
              onToast={onToast}
              onZoomDecrease={onZoomDecrease}
              onZoomIncrease={onZoomIncrease}
              onZoomReset={onZoomReset}
              theme={theme}
            />
          ) : null}
          {activePanel === "language" ? <LanguageSettings language={language} onLanguageChange={onLanguageChange} onToast={onToast} /> : null}
          {activePanel === "data" ? (
            <DataSettings onBackupCreate={onBackupCreate} onExportCurrentNote={onExportCurrentNote} onExportCurrentProject={onExportCurrentProject} onImportBackup={onImportBackup} />
          ) : null}
          {activePanel === "shortcuts" ? <ShortcutsSettings /> : null}
        </section>
      </div>
    </PageShell>
  );
}

interface ModelsSettingsProps {
  onToast: (message: string) => void;
}

function getProviderPreset(providerType: LlmProviderType): ProviderPreset {
  return providerPresets.find((preset) => preset.id === providerType) ?? providerPresets[0];
}

function createProviderForm(preset: ProviderPreset = providerPresets[0]): ProviderFormState {
  return {
    name: preset.id === "ollama" ? "Ollama локально" : preset.id === "lmstudio" ? "LM Studio локально" : "Основная модель",
    providerType: preset.id,
    baseUrl: preset.url,
    apiKey: "",
    chatModel: preset.model,
    embeddingModel: "",
    modelsEndpoint: preset.modelsEndpoint,
    chatEndpoint: preset.chatEndpoint,
    embeddingsEndpoint: preset.embeddingsEndpoint,
    timeoutSec: "120",
    contextSize: "16384",
    temperature: "0.3",
    streamingEnabled: true,
    customHeadersJson: "{}",
    isDefault: true,
  };
}

function formFromProvider(provider: LlmProvider): ProviderFormState {
  return {
    id: provider.id,
    name: provider.name,
    providerType: provider.providerType,
    baseUrl: provider.baseUrl,
    apiKey: "",
    chatModel: provider.chatModel,
    embeddingModel: provider.embeddingModel,
    modelsEndpoint: provider.modelsEndpoint,
    chatEndpoint: provider.chatEndpoint,
    embeddingsEndpoint: provider.embeddingsEndpoint,
    timeoutSec: String(Math.round(provider.timeoutMs / 1000)),
    contextSize: String(provider.contextSize),
    temperature: String(provider.temperature),
    streamingEnabled: provider.streamingEnabled,
    customHeadersJson: provider.customHeadersJson,
    isDefault: provider.isDefault,
  };
}

function isLocalEndpoint(baseUrl: string) {
  const normalized = baseUrl.toLowerCase();
  return normalized.includes("localhost") || normalized.includes("127.0.0.1") || normalized.includes("[::1]");
}

function statusLabel(status: LlmProvider["lastStatus"]) {
  if (status === "success") {
    return "Работает";
  }
  if (status === "error") {
    return "Ошибка";
  }
  return "Не проверялось";
}

function sortProviders(providers: LlmProvider[]) {
  return [...providers].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name, "ru"));
}

function formSignature(form: ProviderFormState) {
  return JSON.stringify({
    ...form,
    apiKey: form.apiKey.trim().length > 0 ? "provided" : "",
  });
}

function createDraftId() {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftTargetId(form: ProviderFormState, draftId: string) {
  return form.id ? `provider:${form.id}` : `draft:${draftId}`;
}

function isLocalProviderType(providerType: LlmProviderType) {
  return providerType === "ollama" || providerType === "lmstudio";
}

function parseProviderNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeUrlForDiagnostics(url: string) {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.split("?")[0]?.split("#")[0] ?? "";
  }
}

function draftInputFromForm(form: ProviderFormState): llmProviderService.DraftLlmProviderInput {
  return {
    providerType: form.providerType,
    baseUrl: form.baseUrl,
    apiKey: form.apiKey,
    chatModel: form.chatModel,
    embeddingModel: form.embeddingModel,
    modelsEndpoint: form.modelsEndpoint,
    chatEndpoint: form.chatEndpoint,
    embeddingsEndpoint: form.embeddingsEndpoint,
    timeoutMs: parseProviderNumber(form.timeoutSec, 120) * 1000,
    contextSize: parseProviderNumber(form.contextSize, 16384),
    temperature: parseProviderNumber(form.temperature, 0.3),
    streamingEnabled: form.streamingEnabled,
    customHeadersJson: form.customHeadersJson,
  };
}

function validateDraftForm(form: ProviderFormState, action: "listModels" | "save" | "testConnection", hasSavedApiKey = false) {
  const errors: string[] = [];
  const baseUrl = form.baseUrl.trim();
  if (action === "save" && !form.name.trim()) {
    errors.push("Укажите название подключения.");
  }
  if (!baseUrl) {
    errors.push("Укажите Base URL.");
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    errors.push("Base URL должен начинаться с http:// или https://.");
  }
  if (form.providerType === "ollama" && /\/v1\/?$/i.test(baseUrl)) {
    errors.push("Для Ollama используйте адрес без /v1, например http://127.0.0.1:11434.");
  }
  if (action === "save" && !form.chatModel.trim()) {
    errors.push("Выберите или введите chat model.");
  }
  if (action === "save" && !isLocalProviderType(form.providerType) && !form.apiKey.trim() && !hasSavedApiKey) {
    errors.push("Для внешнего provider нужен API key.");
  }
  return errors;
}

function LoadingInline({ label }: { label: string }) {
  return (
    <span className="loading-inline">
      <span aria-hidden="true" className="button-spinner" />
      {label}
    </span>
  );
}

function ModelsSettings({ onToast }: ModelsSettingsProps) {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>();
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<DraftMode>("new");
  const [draftId, setDraftId] = useState(() => createDraftId());
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [form, setForm] = useState<ProviderFormState>(() => createProviderForm());
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [storageAction, setStorageAction] = useState<StorageAction>(null);
  const [networkOperation, setNetworkOperation] = useState<LlmNetworkOperation | null>(null);
  const [message, setMessage] = useState("Подключения пока не проверялись.");
  const [messageTone, setMessageTone] = useState<MessageTone>("neutral");
  const [showSecret, setShowSecret] = useState(false);
  const latestNetworkRequestIdRef = useRef(0);
  const currentFormRef = useRef(form);
  const draftIdRef = useRef(draftId);
  const deletedTargetIdsRef = useRef<Set<string>>(new Set());
  const networkOperationRef = useRef<LlmNetworkOperation | null>(null);
  const providersRef = useRef(providers);
  const selectedProviderIdRef = useRef(selectedProviderId);
  const isMountedRef = useRef(true);
  const modalInitialFocusRef = useRef<HTMLButtonElement>(null);

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === selectedProviderId), [providers, selectedProviderId]);
  const activePreset = getProviderPreset(form.providerType);
  const currentTargetId = draftTargetId(form, draftId);
  const visibleNetworkAction = isProviderModalOpen ? getVisibleLlmNetworkAction(networkOperation, currentTargetId) : null;
  const checkingProviderId = networkOperation?.action === "testConnection" ? networkOperation.targetId : undefined;
  const loadingModelsProviderId = networkOperation?.action === "listModels" ? networkOperation.targetId : undefined;
  const isTestingConnection = visibleNetworkAction === "testConnection" && (checkingProviderId === undefined || checkingProviderId === currentTargetId);
  const isLoadingModels = visibleNetworkAction === "listModels" && (loadingModelsProviderId === undefined || loadingModelsProviderId === currentTargetId);
  const showApiKeyField = !isLocalProviderType(form.providerType);
  const showBaseUrlField = form.providerType !== "openai";
  const hasSavedApiKey = Boolean(selectedProvider && selectedProvider.id === form.id && selectedProvider.hasApiKey);
  const keyLabel = selectedProvider?.hasApiKey ? "Ключ сохранён" : "Ключ не задан";
  const privacyNotice = selectedProvider?.privacyNotice ?? (isLocalEndpoint(form.baseUrl) ? "Локальный endpoint: данные остаются на устройстве, если сервер действительно запущен локально." : "Внешний endpoint: при использовании модели выбранный контекст будет отправлен провайдеру.");
  const modalTitle = draftMode === "edit" ? "Изменить подключение" : "Добавить подключение";
  const activeOperationMessage = isLoadingProviders
    ? "Загружаем подключения…"
    : isTestingConnection
      ? "Проверяем подключение… Можно продолжать работу с настройками."
      : isLoadingModels
        ? "Загружаем модели… Можно менять поля и переключать разделы."
        : storageAction === "save"
          ? "Сохраняем подключение…"
          : storageAction === "delete"
            ? "Удаляем подключение…"
            : storageAction === "default"
              ? "Назначаем основное подключение…"
              : storageAction === "key"
                ? "Удаляем API key…"
                : null;
  const connectionNoteClass = ["connection-note", !activeOperationMessage && (messageTone === "error" || selectedProvider?.lastStatus === "error") ? "error" : "", activeOperationMessage ? "pending" : ""]
    .filter(Boolean)
    .join(" ");
  const shouldShowConnectionNote = Boolean(activeOperationMessage || messageTone === "error" || providers.length > 0 || isProviderModalOpen);

  useEffect(() => {
    currentFormRef.current = form;
  }, [form]);

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);

  useEffect(() => {
    selectedProviderIdRef.current = selectedProviderId;
  }, [selectedProviderId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      latestNetworkRequestIdRef.current += 1;
      networkOperationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isProviderModalOpen) {
      return;
    }
    modalInitialFocusRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeProviderModal();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProviderModalOpen, draftId]);

  useEffect(() => {
    if (!networkOperation) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      if (!isNetworkOperationActive(networkOperation)) {
        llmProviderService.logLlmDiagnostic("ui_timeout_ignored_inactive", {
          operationId: networkOperation.id,
          targetId: networkOperation.targetId,
        });
        return;
      }
      const isStillCurrent =
        networkOperation.targetKind === "provider"
          ? isProviderOperationResultCurrent(networkOperation, { ignoreTimeout: true })
          : isNetworkResultCurrent(networkOperation, { ignoreTimeout: true });
      llmProviderService.logLlmDiagnostic("ui_timeout_fired", {
        operationId: networkOperation.id,
        targetId: networkOperation.targetId,
        action: networkOperation.action,
        isStillCurrent,
      });
      const text =
        networkOperation.action === "listModels"
          ? "Timeout: список моделей не был получен вовремя. Проверьте Base URL, endpoint и состояние локального сервера."
          : "Timeout: проверка подключения не завершилась вовремя. Проверьте, запущена ли локальная модель и доступен ли endpoint.";
      updateMessage(text, "error");
      finishNetworkOperation(networkOperation);
    }, networkOperation.timeoutMs + 250);

    return () => window.clearTimeout(timeoutId);
  }, [networkOperation]);

  useEffect(() => {
    let cancelled = false;
    async function loadProviders() {
      setIsLoadingProviders(true);
      try {
        const loadedProviders = sortProviders(await llmProviderService.listLlmProviders());
        if (cancelled) {
          return;
        }
        providersRef.current = loadedProviders;
        setProviders(loadedProviders);
        updateMessage(loadedProviders.length > 0 ? "Подключения загружены из локальной базы." : "Подключений пока нет.");
      } catch (error) {
        if (!cancelled) {
          updateMessage(error instanceof Error ? error.message : "Не удалось загрузить подключения LLM", "error");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProviders(false);
        }
      }
    }
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateMessage(text: string, tone: MessageTone = "neutral") {
    setMessage(text);
    setMessageTone(tone);
  }

  function beginNetworkOperation(action: LlmNetworkAction, snapshot: ProviderFormState) {
    const requestId = latestNetworkRequestIdRef.current + 1;
    latestNetworkRequestIdRef.current = requestId;
    const operation = createLlmNetworkOperation(
      action,
      requestId,
      snapshot.id ? "provider" : "draft",
      draftTargetId(snapshot, draftIdRef.current),
      formSignature(snapshot),
      action === "listModels" ? llmProviderService.LLM_MODEL_LIST_TIMEOUT_MS : llmProviderService.LLM_TEST_CONNECTION_TIMEOUT_MS,
    );
    networkOperationRef.current = operation;
    setNetworkOperation(operation);
    llmProviderService.logLlmDiagnostic("operation_started", {
      action,
      operationId: operation.id,
      targetId: operation.targetId,
      draftId: draftIdRef.current,
      fingerprint: operation.fingerprint,
      providerType: snapshot.providerType,
      baseUrl: safeUrlForDiagnostics(snapshot.baseUrl),
      modelsEndpoint: snapshot.modelsEndpoint,
    });
    return operation;
  }

  function traceContext(operation: LlmNetworkOperation): llmProviderService.LlmNetworkTraceContext {
    return {
      operationId: operation.id,
      targetId: operation.targetId,
      draftId: draftIdRef.current,
      fingerprint: operation.fingerprint,
    };
  }

  function isNetworkOperationActive(operation: LlmNetworkOperation) {
    return isLlmNetworkOperationActiveById(operation, networkOperationRef.current, isMountedRef.current);
  }

  function cancelNetworkOperation() {
    latestNetworkRequestIdRef.current += 1;
    if (networkOperationRef.current) {
      llmProviderService.logLlmDiagnostic("operation_cancelled", {
        operationId: networkOperationRef.current.id,
        targetId: networkOperationRef.current.targetId,
      });
    }
    networkOperationRef.current = null;
    setNetworkOperation(null);
  }

  function cancelNetworkOperationForTarget(targetId: string, options: { markDeleted?: boolean } = {}) {
    if (options.markDeleted) {
      deletedTargetIdsRef.current.add(targetId);
    }
    if (shouldClearLlmNetworkOperationForTarget(networkOperationRef.current, targetId)) {
      cancelNetworkOperation();
    }
  }

  function finishNetworkOperation(operation: LlmNetworkOperation) {
    if (!isMountedRef.current) {
      return;
    }
    llmProviderService.logLlmDiagnostic("cleanup_loading_called", {
      operationId: operation.id,
      targetId: operation.targetId,
      currentOperationId: networkOperationRef.current?.id ?? null,
    });
    if (networkOperationRef.current?.id === operation.id) {
      networkOperationRef.current = null;
    }
    setNetworkOperation((currentOperation) => (currentOperation?.id === operation.id ? null : currentOperation));
  }

  function replaceForm(nextForm: ProviderFormState, options: { preserveNetworkOperation?: boolean; markDirty?: boolean } = {}) {
    if (!options.preserveNetworkOperation && networkOperationRef.current && formSignature(currentFormRef.current) !== formSignature(nextForm)) {
      cancelNetworkOperation();
    }
    currentFormRef.current = nextForm;
    setForm(nextForm);
    if (options.markDirty !== undefined) {
      setIsDraftDirty(options.markDirty);
    }
  }

  function mergeProviderInState(provider: LlmProvider) {
    setProviders((currentProviders) => {
      const nextProviders = currentProviders.some((item) => item.id === provider.id)
        ? currentProviders.map((item) => (item.id === provider.id ? provider : provider.isDefault ? { ...item, isDefault: false } : item))
        : [...currentProviders.map((item) => (provider.isDefault ? { ...item, isDefault: false } : item)), provider];
      const sortedProviders = sortProviders(nextProviders);
      providersRef.current = sortedProviders;
      return sortedProviders;
    });
  }

  function updateProviderInState(provider: LlmProvider) {
    mergeProviderInState(provider);
    if (isProviderModalOpen && currentFormRef.current.id === provider.id) {
      selectedProviderIdRef.current = provider.id;
      setSelectedProviderId(provider.id);
      setDraftMode("edit");
      replaceForm(formFromProvider(provider), { preserveNetworkOperation: true, markDirty: false });
    }
  }

  function openAddProvider(preset: ProviderPreset = providerPresets[1]) {
    cancelNetworkOperation();
    selectedProviderIdRef.current = undefined;
    setSelectedProviderId(undefined);
    const nextDraftId = createDraftId();
    setDraftId(nextDraftId);
    draftIdRef.current = nextDraftId;
    setDraftMode("new");
    setModelOptions([]);
    setShowSecret(false);
    replaceForm(
      {
        ...createProviderForm(preset),
        isDefault: providersRef.current.length === 0,
      },
      { markDirty: false },
    );
    setIsProviderModalOpen(true);
    updateMessage("Выберите тип провайдера и заполните минимальные параметры.");
  }

  function openEditProvider(provider: LlmProvider) {
    cancelNetworkOperation();
    selectedProviderIdRef.current = provider.id;
    setSelectedProviderId(provider.id);
    const nextDraftId = createDraftId();
    setDraftId(nextDraftId);
    draftIdRef.current = nextDraftId;
    setDraftMode("edit");
    setModelOptions([]);
    setShowSecret(false);
    replaceForm(formFromProvider(provider), { markDirty: false });
    setIsProviderModalOpen(true);
    updateMessage(provider.statusMessage ?? "Подключение открыто для редактирования.", provider.lastStatus === "error" ? "error" : "neutral");
  }

  function closeProviderModal() {
    cancelNetworkOperationForTarget(draftTargetId(currentFormRef.current, draftIdRef.current), { markDeleted: !currentFormRef.current.id });
    selectedProviderIdRef.current = undefined;
    setSelectedProviderId(undefined);
    setIsProviderModalOpen(false);
    setDraftMode("new");
    setModelOptions([]);
    setShowSecret(false);
    const nextDraftId = createDraftId();
    setDraftId(nextDraftId);
    draftIdRef.current = nextDraftId;
    replaceForm(createProviderForm(providerPresets[1]), { markDirty: false });
  }

  function isNetworkResultCurrent(operation: LlmNetworkOperation, options: { ignoreTimeout?: boolean } = {}) {
    if (!isNetworkOperationActive(operation)) {
      return false;
    }
    if (deletedTargetIdsRef.current.has(operation.targetId)) {
      return false;
    }
    if (draftTargetId(currentFormRef.current, draftIdRef.current) !== operation.targetId) {
      return false;
    }
    if (!options.ignoreTimeout && Date.now() - operation.startedAt > operation.timeoutMs) {
      return false;
    }
    return true;
  }

  function isProviderOperationResultCurrent(operation: LlmNetworkOperation, options: { ignoreTimeout?: boolean } = {}) {
    if (!isNetworkOperationActive(operation)) {
      return false;
    }
    if (deletedTargetIdsRef.current.has(operation.targetId)) {
      return false;
    }
    if (!options.ignoreTimeout && Date.now() - operation.startedAt > operation.timeoutMs) {
      return false;
    }
    return true;
  }

  async function persistProvider(providerForm: ProviderFormState) {
    const timeoutSec = Number.parseInt(providerForm.timeoutSec, 10);
    const contextSize = Number.parseInt(providerForm.contextSize, 10);
    const temperature = Number.parseFloat(providerForm.temperature);
    return await llmProviderService.saveLlmProvider({
      id: providerForm.id,
      name: providerForm.name,
      providerType: providerForm.providerType,
      baseUrl: providerForm.baseUrl,
      apiKey: providerForm.apiKey,
      chatModel: providerForm.chatModel,
      embeddingModel: providerForm.embeddingModel,
      modelsEndpoint: providerForm.modelsEndpoint,
      chatEndpoint: providerForm.chatEndpoint,
      embeddingsEndpoint: providerForm.embeddingsEndpoint,
      timeoutMs: Number.isFinite(timeoutSec) ? timeoutSec * 1000 : 120000,
      contextSize: Number.isFinite(contextSize) ? contextSize : 16384,
      temperature: Number.isFinite(temperature) ? temperature : 0.3,
      streamingEnabled: providerForm.streamingEnabled,
      customHeadersJson: providerForm.customHeadersJson,
      isDefault: providerForm.isDefault,
    });
  }

  async function saveCurrentProvider() {
    const savedProvider = await persistProvider(currentFormRef.current);
    mergeProviderInState(savedProvider);
    setShowSecret(false);
    return savedProvider;
  }

  async function handleSave() {
    const validationErrors = validateDraftForm(currentFormRef.current, "save", hasSavedApiKey);
    if (validationErrors.length > 0) {
      const text = validationErrors.join(" ");
      updateMessage(text, "error");
      onToast(text);
      return;
    }
    setStorageAction("save");
    try {
      const savedProvider = await saveCurrentProvider();
      closeProviderModal();
      updateMessage(savedProvider.hasApiKey ? "Подключение сохранено. API key находится в защищённом хранилище ОС." : "Подключение сохранено без API key.");
      onToast("Подключение LLM сохранено");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось сохранить подключение";
      updateMessage(text, "error");
      onToast(text);
    } finally {
      setStorageAction(null);
    }
  }

  async function handleLoadModels() {
    const snapshot = currentFormRef.current;
    llmProviderService.logLlmDiagnostic("button_click", {
      action: "listModels",
      providerType: snapshot.providerType,
      baseUrl: safeUrlForDiagnostics(snapshot.baseUrl),
      modelsEndpoint: snapshot.modelsEndpoint,
      draftId: draftIdRef.current,
    });
    const validationErrors = validateDraftForm(snapshot, "listModels", hasSavedApiKey);
    if (validationErrors.length > 0) {
      const text = validationErrors.join(" ");
      updateMessage(text, "error");
      onToast(text);
      return;
    }
    const operation = beginNetworkOperation("listModels", snapshot);
    updateMessage("Загружаем модели…");
    try {
      const result = await llmProviderService.listLlmModelsForDraft(draftInputFromForm(snapshot), traceContext(operation));
      if (!isNetworkResultCurrent(operation)) {
        llmProviderService.logLlmDiagnostic("result_ignored_stale", {
          operationId: operation.id,
          targetId: operation.targetId,
          action: operation.action,
        });
        return;
      }
      const nextForm = result.status === "success" && result.models.length > 0 && !snapshot.chatModel ? { ...currentFormRef.current, chatModel: result.models[0] ?? "" } : currentFormRef.current;
      replaceForm(nextForm, { preserveNetworkOperation: true, markDirty: true });
      setModelOptions(result.models);
      updateMessage(result.message, result.status === "error" ? "error" : "neutral");
      onToast(result.message);
    } catch (error) {
      if (isNetworkOperationActive(operation)) {
        const text = error instanceof Error ? error.message : "Не удалось получить список моделей";
        updateMessage(text, "error");
        onToast(text);
      } else {
        llmProviderService.logLlmDiagnostic("error_ignored_inactive", {
          operationId: operation.id,
          targetId: operation.targetId,
          action: operation.action,
        });
      }
    } finally {
      finishNetworkOperation(operation);
    }
  }

  async function handleTestConnection() {
    const snapshot = currentFormRef.current;
    llmProviderService.logLlmDiagnostic("button_click", {
      action: "testConnection",
      providerType: snapshot.providerType,
      baseUrl: safeUrlForDiagnostics(snapshot.baseUrl),
      modelsEndpoint: snapshot.modelsEndpoint,
      draftId: draftIdRef.current,
    });
    const validationErrors = validateDraftForm(snapshot, "testConnection", hasSavedApiKey);
    if (validationErrors.length > 0) {
      const text = validationErrors.join(" ");
      updateMessage(text, "error");
      onToast(text);
      return;
    }
    const operation = beginNetworkOperation("testConnection", snapshot);
    updateMessage("Проверяем подключение…");
    try {
      const result = await llmProviderService.testLlmProviderDraft(draftInputFromForm(snapshot), traceContext(operation));
      if (!isNetworkResultCurrent(operation)) {
        llmProviderService.logLlmDiagnostic("result_ignored_stale", {
          operationId: operation.id,
          targetId: operation.targetId,
          action: operation.action,
        });
        return;
      }
      setModelOptions(result.models);
      updateMessage(result.message, result.status === "error" ? "error" : "neutral");
      onToast(result.message);
    } catch (error) {
      if (isNetworkOperationActive(operation)) {
        const text = error instanceof Error ? error.message : "Не удалось проверить подключение";
        updateMessage(text, "error");
        onToast(text);
      } else {
        llmProviderService.logLlmDiagnostic("error_ignored_inactive", {
          operationId: operation.id,
          targetId: operation.targetId,
          action: operation.action,
        });
      }
    } finally {
      finishNetworkOperation(operation);
    }
  }

  async function handleCheckSavedProvider(provider: LlmProvider) {
    const snapshot = formFromProvider(provider);
    const operation = beginNetworkOperation("testConnection", snapshot);
    updateMessage(`Проверяем подключение ${provider.name}…`);
    try {
      const result = await llmProviderService.testLlmProvider(provider.id, traceContext(operation));
      if (!isProviderOperationResultCurrent(operation)) {
        llmProviderService.logLlmDiagnostic("result_ignored_stale", {
          operationId: operation.id,
          targetId: operation.targetId,
          action: operation.action,
        });
        return;
      }
      mergeProviderInState({
        ...provider,
        lastStatus: result.status,
        statusMessage: result.message,
        lastCheckedAt: result.checkedAt,
      });
      updateMessage(result.message, result.status === "error" ? "error" : "neutral");
      onToast(result.message);
    } catch (error) {
      if (isNetworkOperationActive(operation)) {
        const text = error instanceof Error ? error.message : "Не удалось проверить подключение";
        updateMessage(text, "error");
        onToast(text);
      } else {
        llmProviderService.logLlmDiagnostic("error_ignored_inactive", {
          operationId: operation.id,
          targetId: operation.targetId,
          action: operation.action,
        });
      }
    } finally {
      finishNetworkOperation(operation);
    }
  }

  async function handleDeleteKey() {
    if (!form.id) {
      return;
    }
    setStorageAction("key");
    try {
      const updatedProvider = await llmProviderService.deleteLlmProviderKey(form.id);
      updateProviderInState(updatedProvider);
      updateMessage("API key удалён из защищённого хранилища.");
      onToast("API key удалён");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось удалить API key";
      updateMessage(text, "error");
      onToast(text);
    } finally {
      setStorageAction(null);
    }
  }

  async function deleteProvider(providerId: string) {
    cancelNetworkOperationForTarget(`provider:${providerId}`, { markDeleted: true });
    setStorageAction("delete");
    try {
      await llmProviderService.deleteLlmProvider(providerId);
      const nextProviders = providersRef.current.filter((provider) => provider.id !== providerId);
      providersRef.current = nextProviders;
      setProviders(nextProviders);
      if (currentFormRef.current.id === providerId) {
        closeProviderModal();
      }
      updateMessage("Подключение удалено.");
      onToast("Подключение LLM удалено");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось удалить подключение";
      updateMessage(text, "error");
      onToast(text);
    } finally {
      setStorageAction(null);
    }
  }

  async function handleDeleteProvider() {
    if (!form.id) {
      return;
    }
    await deleteProvider(form.id);
  }

  async function setDefaultProvider(providerId: string) {
    setStorageAction("default");
    try {
      const updatedProvider = await llmProviderService.setDefaultLlmProvider(providerId);
      updateProviderInState(updatedProvider);
      updateMessage("Подключение назначено основным.");
      onToast("Основная модель обновлена");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось назначить основное подключение";
      updateMessage(text, "error");
      onToast(text);
    } finally {
      setStorageAction(null);
    }
  }

  function applyPreset(preset: ProviderPreset) {
    cancelNetworkOperationForTarget(draftTargetId(currentFormRef.current, draftIdRef.current), { markDeleted: !currentFormRef.current.id });
    const nextDraftId = createDraftId();
    setDraftId(nextDraftId);
    draftIdRef.current = nextDraftId;
    setModelOptions([]);
    setShowSecret(false);
    const current = currentFormRef.current;
    const presetForm = createProviderForm(preset);
    replaceForm(
      {
        ...presetForm,
        id: current.id,
        name: current.id ? current.name : presetForm.name,
        isDefault: current.isDefault || providersRef.current.length === 0,
      },
      { markDirty: Boolean(current.id) || isDraftDirty },
    );
    setDraftMode(current.id ? "edit" : "new");
    updateMessage("Заполните параметры и сохраните подключение.");
  }

  function handleCancelDraft() {
    closeProviderModal();
    updateMessage("Черновик подключения отменён.");
  }

  function updateDraft(values: Partial<ProviderFormState>) {
    replaceForm({ ...currentFormRef.current, ...values }, { markDirty: true });
    if ("providerType" in values || "baseUrl" in values || "apiKey" in values || "modelsEndpoint" in values) {
      setModelOptions([]);
    }
  }

  return (
    <div>
      <div className="settings-title">Модели ИИ</div>
      <div className="settings-subtitle">Подключите локальную или облачную модель для работы с заметками.</div>
      <div className="settings-card llm-provider-list-card">
        <div className="settings-section-head">
          <div>
            <b>Подключения</b>
            <div className="field-help">Метаданные хранятся в SQLite, API key — только в защищённом хранилище ОС.</div>
          </div>
          {providers.length > 0 ? (
            <button className="primary-btn compact" disabled={isLoadingProviders || storageAction !== null} onClick={() => openAddProvider()} type="button">
              Добавить подключение
            </button>
          ) : null}
        </div>
        {providers.length === 0 && !isLoadingProviders ? (
          <div className="llm-empty-state-card">
            <div className="llm-empty-icon" aria-hidden="true">✦</div>
            <b>Подключений пока нет</b>
            <p>Добавьте Ollama, LM Studio, OpenAI или совместимый API.</p>
            <button className="primary-btn" onClick={() => openAddProvider()} type="button">
              Добавить подключение
            </button>
          </div>
        ) : null}
        {providers.length > 0 ? (
          <div className="llm-provider-cards">
            {providers.map((provider) => {
              const preset = getProviderPreset(provider.providerType);
              const providerTargetId = `provider:${provider.id}`;
              const isProviderTesting = networkOperation?.action === "testConnection" && networkOperation.targetId === providerTargetId;
              return (
                <article className="llm-provider-card" key={provider.id}>
                  <div className="llm-provider-card-main">
                    <span className="provider-icon">{preset.icon}</span>
                    <div>
                      <div className="llm-provider-card-title">
                        <b>{provider.name}</b>
                        {provider.isDefault ? <span className="llm-default-badge">Основное</span> : null}
                      </div>
                      <small>{preset.label} · {provider.chatModel || "модель не выбрана"}</small>
                    </div>
                    <span className={`status-pill ${provider.lastStatus === "success" ? "ok" : provider.lastStatus === "error" ? "error" : ""}`}>{isProviderTesting ? "Проверяем…" : statusLabel(provider.lastStatus)}</span>
                  </div>
                  <div className="llm-provider-card-meta">
                    <span>{provider.baseUrl}</span>
                    {provider.statusMessage ? <span>{provider.statusMessage}</span> : null}
                  </div>
                  <div className="llm-provider-card-actions">
                    <button className="secondary-btn compact" disabled={isProviderTesting || storageAction !== null} onClick={() => void handleCheckSavedProvider(provider)} type="button">
                      {isProviderTesting ? <LoadingInline label="Проверяем…" /> : "Проверить"}
                    </button>
                    <button className="secondary-btn compact" disabled={storageAction !== null} onClick={() => openEditProvider(provider)} type="button">
                      Изменить
                    </button>
                    <button className="secondary-btn compact" disabled={provider.isDefault || storageAction === "default"} onClick={() => void setDefaultProvider(provider.id)} type="button">
                      {storageAction === "default" ? <LoadingInline label="Назначение…" /> : "Сделать основным"}
                    </button>
                    <button className="danger-btn compact" disabled={storageAction === "delete"} onClick={() => void deleteProvider(provider.id)} type="button">
                      {storageAction === "delete" ? <LoadingInline label="Удаление…" /> : "Удалить"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        {shouldShowConnectionNote ? <div className={connectionNoteClass}>{activeOperationMessage ? <LoadingInline label={activeOperationMessage} /> : message}</div> : null}
      </div>
      {isProviderModalOpen ? (
        <div className="modal-backdrop llm-provider-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && closeProviderModal()} role="presentation">
          <section aria-labelledby="llm-provider-modal-title" aria-modal="true" className="llm-provider-modal" role="dialog">
            <div className="llm-provider-modal-head">
              <div>
                <span className="llm-modal-eyebrow">{draftMode === "edit" ? "Редактирование" : "Новое подключение"}</span>
                <h2 id="llm-provider-modal-title">{modalTitle}</h2>
                <p>{privacyNotice}</p>
              </div>
              <button aria-label="Закрыть окно подключения" className="llm-modal-close" onClick={closeProviderModal} type="button">×</button>
            </div>
            <div className="provider-presets llm-provider-type-grid">
              {providerPresets.map((provider, index) => (
                <button
                  className={`provider-preset ${activePreset.id === provider.id ? "active" : ""}`}
                  key={provider.id}
                  onClick={() => {
                    applyPreset(provider);
                    onToast(`Выбран провайдер: ${provider.label}`);
                  }}
                  ref={index === 0 ? modalInitialFocusRef : undefined}
                  type="button"
                >
                  <span className="provider-icon">{provider.icon}</span>
                  <b>{provider.label}</b>
                  <small>{provider.detail}</small>
                </button>
              ))}
            </div>
            <div className="form-grid llm-provider-modal-form">
              <label className="field full">
                Название подключения
                <input onChange={(event) => updateDraft({ name: event.currentTarget.value })} placeholder="Например, Ollama Local" value={form.name} />
              </label>
              {showBaseUrlField ? (
                <label className="field full">
                  Base URL
                  <input onChange={(event) => updateDraft({ baseUrl: event.currentTarget.value })} placeholder={form.providerType === "ollama" ? "http://127.0.0.1:11434" : "https://…/v1"} value={form.baseUrl} />
                  <span className="field-help">
                    {form.providerType === "ollama"
                      ? "Для Ollama используйте адрес без /v1: http://127.0.0.1:11434."
                      : form.providerType === "lmstudio"
                        ? "Для LM Studio обычно используется http://localhost:1234/v1."
                        : "Например: http://localhost:1234/v1 или https://api.example.com/v1."}
                  </span>
                </label>
              ) : null}
              {showApiKeyField ? (
                <label className="field full">
                  API key
                  <div className="secret-wrap">
                    <input
                      autoComplete="off"
                      onChange={(event) => updateDraft({ apiKey: event.currentTarget.value })}
                      placeholder={hasSavedApiKey ? "Введите новый ключ, чтобы заменить сохранённый" : "Введите ключ, если он требуется"}
                      type={showSecret ? "text" : "password"}
                      value={form.apiKey}
                    />
                    <button onClick={() => setShowSecret((current) => !current)} type="button">
                      {showSecret ? "Скрыть" : "Показать"}
                    </button>
                    <button disabled={!hasSavedApiKey || storageAction === "key"} onClick={() => void handleDeleteKey()} type="button">
                      {storageAction === "key" ? <LoadingInline label="Удаляем…" /> : "Удалить ключ"}
                    </button>
                  </div>
                  <span className={`field-help key-state ${hasSavedApiKey ? "ok" : "warn"}`}>{keyLabel}. Реальный ключ не возвращается в форму после сохранения.</span>
                </label>
              ) : null}
              <label className="field full">
                Модель чата
                <div className="input-action">
                  <input list="llm-chat-model-options" onChange={(event) => updateDraft({ chatModel: event.currentTarget.value })} placeholder="Введите ID модели" value={form.chatModel} />
                  <button disabled={isLoadingModels} onClick={() => void handleLoadModels()} type="button">
                    {isLoadingModels ? <LoadingInline label="Загружаем модели…" /> : "Получить модели"}
                  </button>
                </div>
                <datalist id="llm-chat-model-options">
                  {modelOptions.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              {modelOptions.length > 0 ? (
                <div className="llm-model-options">
                  {modelOptions.map((model) => (
                    <button className={form.chatModel === model ? "active" : ""} key={model} onClick={() => updateDraft({ chatModel: model })} type="button">
                      {model}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="field switch-field full">
                <span>
                  <b>Основное подключение</b>
                  <small>Использовать по умолчанию для AI-функций</small>
                </span>
                <input checked={form.isDefault} onChange={(event) => updateDraft({ isDefault: event.currentTarget.checked })} type="checkbox" />
              </label>
            </div>
            <details className="advanced-settings">
              <summary>Дополнительные параметры</summary>
              <div className="form-grid advanced-grid llm-provider-modal-form">
                {!showBaseUrlField ? (
                  <label className="field full">
                    Base URL
                    <input onChange={(event) => updateDraft({ baseUrl: event.currentTarget.value })} value={form.baseUrl} />
                    <span className="field-help">Стандартный OpenAI endpoint обычно не нужно менять.</span>
                  </label>
                ) : null}
                <label className="field full">
                  Embedding-модель
                  <input list="llm-chat-model-options" onChange={(event) => updateDraft({ embeddingModel: event.currentTarget.value })} placeholder="Необязательно, для RAG" value={form.embeddingModel} />
                </label>
                <label className="field">
                  Тайм-аут, сек.
                  <input max="600" min="5" onChange={(event) => updateDraft({ timeoutSec: event.currentTarget.value })} type="number" value={form.timeoutSec} />
                </label>
                <label className="field">
                  Контекст, токенов
                  <input min="1024" onChange={(event) => updateDraft({ contextSize: event.currentTarget.value })} step="1024" type="number" value={form.contextSize} />
                </label>
                <label className="field">
                  Температура
                  <input max="2" min="0" onChange={(event) => updateDraft({ temperature: event.currentTarget.value })} step="0.1" type="number" value={form.temperature} />
                </label>
                <label className="field switch-field">
                  <span>
                    <b>Потоковая выдача</b>
                    <small>Показывать ответ по мере генерации</small>
                  </span>
                  <input checked={form.streamingEnabled} onChange={(event) => updateDraft({ streamingEnabled: event.currentTarget.checked })} type="checkbox" />
                </label>
                <label className="field full">
                  Дополнительные HTTP-заголовки
                  <textarea onChange={(event) => updateDraft({ customHeadersJson: event.currentTarget.value })} placeholder='{"X-Organization":"example"}' rows={3} value={form.customHeadersJson} />
                  <span className="field-help">Секретные заголовки вроде Authorization или X-API-Key запрещены. Используйте поле API key.</span>
                </label>
                <label className="field">
                  Путь списка моделей
                  <input onChange={(event) => updateDraft({ modelsEndpoint: event.currentTarget.value })} value={form.modelsEndpoint} />
                </label>
                <label className="field">
                  Путь чата
                  <input onChange={(event) => updateDraft({ chatEndpoint: event.currentTarget.value })} value={form.chatEndpoint} />
                </label>
                <label className="field">
                  Путь embeddings
                  <input onChange={(event) => updateDraft({ embeddingsEndpoint: event.currentTarget.value })} value={form.embeddingsEndpoint} />
                </label>
              </div>
            </details>
            <div className="llm-action-bar">
              <div className="llm-danger-actions">
                {form.id ? (
                  <button className="danger-btn" disabled={storageAction === "delete"} onClick={() => void handleDeleteProvider()} type="button">
                    {storageAction === "delete" ? <LoadingInline label="Удаление…" /> : "Удалить подключение"}
                  </button>
                ) : null}
                <button className="secondary-btn" disabled={storageAction !== null} onClick={handleCancelDraft} type="button">
                  Отменить
                </button>
              </div>
              <div className="llm-main-actions">
                <button className="secondary-btn" disabled={isTestingConnection} onClick={() => void handleTestConnection()} type="button">
                  {isTestingConnection ? <LoadingInline label="Проверяем…" /> : form.providerType === "ollama" ? "Проверить Ollama" : "Проверить"}
                </button>
                <button className="primary-btn" disabled={storageAction === "save"} onClick={() => void handleSave()} type="button">
                  {storageAction === "save" ? <LoadingInline label="Сохранение…" /> : draftMode === "edit" ? "Сохранить изменения" : "Сохранить подключение"}
                </button>
              </div>
            </div>
            <div className={connectionNoteClass}>{activeOperationMessage ? <LoadingInline label={activeOperationMessage} /> : message}</div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

interface AppearanceSettingsProps {
  appZoomPercent: number;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onToast: (message: string) => void;
  onZoomDecrease: () => void;
  onZoomIncrease: () => void;
  onZoomReset: () => void;
}

function AppearanceSettings({ appZoomPercent, theme, onThemeChange, onToast, onZoomDecrease, onZoomIncrease, onZoomReset }: AppearanceSettingsProps) {
  const options: Array<{ id: ThemeMode; label: string }> = [
    { id: "light", label: "Светлая" },
    { id: "dark", label: "Тёмная" },
    { id: "system", label: "Как в системе" },
  ];

  return (
    <div>
      <div className="settings-title">Внешний вид</div>
      <div className="settings-subtitle">Тема приложения настраивается только в этом разделе.</div>
      <div className="settings-card">
        <div className="theme-options">
          {options.map((option) => (
            <button
              className={`theme-option ${theme === option.id ? "active" : ""}`}
              key={option.id}
              onClick={() => {
                onThemeChange(option.id);
                onToast(option.id === "dark" ? "Включена тёмная тема" : option.id === "system" ? "Тема синхронизирована с системой" : "Включена светлая тема");
              }}
              type="button"
            >
              <div className={`theme-preview preview-${option.id}`}>
                <div className="p-side" />
                <div className="p-main">
                  <div className="line" />
                  <div className="line short" />
                </div>
              </div>
              <b>{option.label}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-card zoom-settings-card">
        <div className="settings-section-head">
          <div>
            <b>Масштаб интерфейса</b>
          </div>
          <span className="zoom-current">{appZoomPercent}%</span>
        </div>
        <div className="zoom-settings-row">
          <button className="zoom-step-btn" data-tooltip="Уменьшить масштаб" disabled={appZoomPercent <= APP_ZOOM_MIN} onClick={onZoomDecrease} type="button">
            −
          </button>
          <button className="zoom-reset-btn" data-tooltip="Сбросить масштаб" onClick={onZoomReset} type="button">
            100%
          </button>
          <button className="zoom-step-btn" data-tooltip="Увеличить масштаб" disabled={appZoomPercent >= APP_ZOOM_MAX} onClick={onZoomIncrease} type="button">
            +
          </button>
        </div>
      </div>
    </div>
  );
}

interface LanguageSettingsProps {
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  onToast: (message: string) => void;
}

function LanguageSettings({ language, onLanguageChange, onToast }: LanguageSettingsProps) {
  return (
    <div>
      <div className="settings-title">Язык</div>
      <div className="settings-subtitle">Русский используется по умолчанию.</div>
      <div className="settings-card">
        <label className="field">
          Язык интерфейса
          <select
            onChange={(event) => {
              onLanguageChange(event.currentTarget.value === "en" ? "en" : "ru");
              onToast("Смена языка пока демонстрационная");
            }}
            value={language}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </div>
  );
}

interface DataSettingsProps {
  onBackupCreate: () => void;
  onExportCurrentNote: () => void;
  onExportCurrentProject: () => void;
  onImportBackup: (file: File) => void;
}

function DataSettings({ onBackupCreate, onExportCurrentNote, onExportCurrentProject, onImportBackup }: DataSettingsProps) {
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="settings-title">Данные и экспорт</div>
      <div className="settings-subtitle">Выгрузите одну заметку, проект или всю базу.</div>
      <div className="settings-card export-card">
        <button className="tb wide" onClick={onExportCurrentNote} type="button">
          Экспорт текущей заметки
        </button>
        <button className="tb wide" onClick={onExportCurrentProject} type="button">
          Экспорт проекта
        </button>
        <button className="tb wide" onClick={onBackupCreate} type="button">
          Экспорт всей базы и вложений
        </button>
        <button className="tb wide" onClick={() => importInputRef.current?.click()} type="button">
          Импорт резервной копии
        </button>
        <input
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              onImportBackup(file);
            }
            event.currentTarget.value = "";
          }}
          ref={importInputRef}
          type="file"
        />
      </div>
    </div>
  );
}

function ShortcutsSettings() {
  const shortcuts = [
    ["Новая заметка", "Ctrl + N"],
    ["Поиск и команды", "Ctrl + K"],
    ["Свернуть сайдбар", "Ctrl + B"],
    ["Режим фокуса", "Ctrl + \\"],
  ] as const;

  return (
    <div>
      <div className="settings-title">Горячие клавиши</div>
      <div className="settings-subtitle">Основные сочетания для быстрой работы.</div>
      <div className="settings-card shortcuts-card">
        {shortcuts.map(([label, keys]) => (
          <div className="archive-row" key={label}>
            <span>{label}</span>
            <kbd>{keys}</kbd>
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
