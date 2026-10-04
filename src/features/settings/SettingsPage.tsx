import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { AppSection, SettingsPanel, ThemeMode } from "../../app/types";
import * as dataService from "../../services/dataService";
import type { BackupPreview, ExportResult, ImportBackupResult } from "../../services/dataService";
import { Icon } from "../../shared/Icon";
import { formatDisplayDateTime, formatDisplayTime } from "../../shared/displayDate";
import { PageShell, type PageShellSidebarProps } from "../navigation/PageShell";
import { APP_ZOOM_MAX, APP_ZOOM_MIN } from "../../shared/appZoom";
import { APP_SHORTCUTS, EDITOR_SHORTCUTS, type ShortcutReference } from "../../shared/appShortcuts";
import { useObservedPhysicalElementWidth } from "../../shared/useObservedPhysicalElementWidth";
import * as llmProviderService from "../../services/llmProviderService";
import type { LlmProvider, LlmProviderType } from "../../services/llmProviderService";
import * as knowledgeService from "../../services/knowledgeService";
import type { KnowledgeIndexOperation, KnowledgeIndexStatus, KnowledgeIndexStatusCode } from "../../services/knowledgeService";
import {
  createLlmNetworkOperation,
  getVisibleLlmNetworkAction,
  isLlmNetworkOperationActiveById,
  modelDiscoveryFeedbackFromConnectionTest,
  shouldClearLlmNetworkOperationForTarget,
} from "./llmNetworkOperation";
import type { LlmNetworkAction, LlmNetworkOperation } from "./llmNetworkOperation";
import {
  ModelDiscoveryField,
  ModelStatusBadge,
  ProviderTypeSelector,
  SettingsModalShell,
  SettingsSectionHeader,
} from "./ModelSettingsUi";
import type { ModelDiscoveryOption, ModelDiscoveryState } from "./ModelSettingsUi";
import { SemanticSearchSettings } from "./SemanticSearchSettings";
import { getSettingsLayoutMode } from "./settingsResponsive";
import { MarkdownImportControl } from "./MarkdownImportControl";
import type { PreparedMarkdownNote } from "./markdownImport";
import {
  formatBackupDate,
  getBackupPreviewErrorMessage,
  getBackupRestoreErrorMessage,
  getBackupSummaryRows,
  getLegacyBackupHistoryNotice,
  initialBackupImportState,
  reduceBackupImportState,
} from "./backupImportFlow";

interface SettingsPageProps {
  initialTarget?: "semantic-search";
  appZoomPercent: number;
  localProfileName: string;
  theme: ThemeMode;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onBackupCreate: () => Promise<ExportResult | null>;
  onBackupPreview: (file: File) => Promise<BackupPreview>;
  onImportBackup: (file: File) => Promise<ImportBackupResult>;
  onImportMarkdown: (notes: readonly PreparedMarkdownNote[]) => Promise<number>;
  onEditLocalProfile: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onToast: (message: string) => void;
  onZoomDecrease: () => void;
  onZoomIncrease: () => void;
  onZoomReset: () => void;
  sidebar: PageShellSidebarProps;
}

const settingsPanels: Array<{ id: SettingsPanel; label: string }> = [
  { id: "general", label: "Основные" },
  { id: "models", label: "Модели ИИ" },
  { id: "appearance", label: "Внешний вид" },
  { id: "data", label: "Данные и экспорт" },
  { id: "shortcuts", label: "Горячие клавиши" },
  { id: "about", label: "О приложении" },
];

const providerPresets = [
  {
    id: "openai",
    label: "OpenAI",
    detail: "Публичный API с ключом",
    icon: <Icon aria-hidden="true" name="bulb" />,
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
    icon: <Icon aria-hidden="true" name="gear" />,
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
    icon: <Icon aria-hidden="true" name="chat" />,
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
    icon: <Icon aria-hidden="true" name="code" />,
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
  customHeadersJson: string;
  isDefault: boolean;
}

export function SettingsPage({
  initialTarget,
  appZoomPercent,
  localProfileName,
  theme,
  onBackupCreate,
  onBackupPreview,
  onImportBackup,
  onImportMarkdown,
  onEditLocalProfile,
  onNavigate,
  onNewNote,
  onThemeChange,
  onToast,
  onZoomDecrease,
  onZoomIncrease,
  onZoomReset,
  sidebar,
}: SettingsPageProps) {
  const [activePanel, setActivePanel] = useState<SettingsPanel>("models");
  const layoutRef = useRef<HTMLDivElement>(null);
  const layoutMode = getSettingsLayoutMode(useObservedPhysicalElementWidth(layoutRef));

  useEffect(() => {
    if (initialTarget === "semantic-search") {
      document.getElementById("semantic-search-settings")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialTarget]);

  return (
    <PageShell activeSection="settings" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast} sidebar={sidebar}>
      <div className={`settings-layout-inner settings-layout-${layoutMode}`} data-layout={layoutMode} ref={layoutRef}>
        <aside aria-label="Разделы настроек" className="settings-nav-col">
          <div className="nav-sec">Настройки</div>
          {settingsPanels.map((panel) => (
            <button
              aria-current={activePanel === panel.id ? "page" : undefined}
              className={`nav-i settings-nav ${activePanel === panel.id ? "on" : ""}`}
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              type="button"
            >
              <span>{panel.label}</span>
            </button>
          ))}
        </aside>

        <section className={`settings-content settings-content--${activePanel}`}>
          {activePanel === "general" ? <GeneralSettings localProfileName={localProfileName} onEditLocalProfile={onEditLocalProfile} /> : null}
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
          {activePanel === "data" ? (
            <DataSettings
              onBackupCreate={onBackupCreate}
              onBackupPreview={onBackupPreview}
              onImportBackup={onImportBackup}
              onImportMarkdown={onImportMarkdown}
              onToast={onToast}
            />
          ) : null}
          {activePanel === "shortcuts" ? <ShortcutsSettings /> : null}
          {activePanel === "about" ? <AboutSettings /> : null}
        </section>
      </div>
    </PageShell>
  );
}

interface GeneralSettingsProps {
  localProfileName: string;
  onEditLocalProfile: () => void;
}

function GeneralSettings({ localProfileName, onEditLocalProfile }: GeneralSettingsProps) {
  return (
    <div>
      <div className="settings-title">Основные</div>
      <div className="settings-subtitle">Профиль и основные сведения о локальной работе NoteFlow.</div>
      <section className="settings-preference-group" aria-labelledby="general-profile-heading">
        <div className="settings-preference-label" id="general-profile-heading">Профиль</div>
        <div className="settings-preference-list">
          <div className="settings-preference-row">
            <span className="settings-info-icon"><Icon name="person" /></span>
            <span className="settings-preference-copy"><b>{localProfileName}</b><small>Локальный профиль · на этом устройстве</small></span>
            <button className="secondary-btn compact" onClick={onEditLocalProfile} type="button">Изменить имя</button>
          </div>
        </div>
      </section>
      <section className="settings-preference-group" aria-labelledby="general-app-heading">
        <div className="settings-preference-label" id="general-app-heading">Приложение</div>
        <div className="settings-preference-list">
          <div className="settings-preference-row">
            <span className="settings-info-icon"><Icon name="doc" /></span>
            <span className="settings-preference-copy"><b>Данные на устройстве</b><small>Заметки и настройки хранятся локально. Регистрация не требуется.</small></span>
          </div>
        </div>
      </section>
    </div>
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
    providerId: form.id,
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
    streamingEnabled: false,
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
  return <span className="loading-inline">{label}</span>;
}

function ModelsSettings({ onToast }: ModelsSettingsProps) {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>();
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<DraftMode>("new");
  const [draftId, setDraftId] = useState(() => createDraftId());
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [form, setForm] = useState<ProviderFormState>(() => createProviderForm());
  const [modelOptions, setModelOptions] = useState<ModelDiscoveryOption[]>([]);
  const [modelDiscoveryState, setModelDiscoveryState] = useState<ModelDiscoveryState>("idle");
  const [modelDiscoveryMessage, setModelDiscoveryMessage] = useState("");
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [storageAction, setStorageAction] = useState<StorageAction>(null);
  const [networkOperation, setNetworkOperation] = useState<LlmNetworkOperation | null>(null);
  const [message, setMessage] = useState("Подключения пока не проверялись.");
  const [messageTone, setMessageTone] = useState<MessageTone>("neutral");
  const [showSecret, setShowSecret] = useState(false);
  const [providerDeleteRequest, setProviderDeleteRequest] = useState<{ id: string; name: string } | null>(null);
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
  const modalTitle = draftMode === "edit" ? "Изменить модель" : "Добавить модель";
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
  const shouldShowConnectionNote = Boolean(activeOperationMessage || messageTone === "error" || isProviderModalOpen);

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
    setModelDiscoveryState("idle");
    setModelDiscoveryMessage("");
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
    setModelDiscoveryState("idle");
    setModelDiscoveryMessage("");
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
    setModelDiscoveryState("idle");
    setModelDiscoveryMessage("");
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
      streamingEnabled: false,
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
    setModelDiscoveryState("loading");
    setModelDiscoveryMessage("Загружаем актуальный список моделей…");
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
      setModelOptions(result.options);
      setModelDiscoveryState(result.status === "error" ? "error" : result.options.length > 0 ? "success" : "empty");
      setModelDiscoveryMessage(result.message);
      updateMessage(result.message, result.status === "error" ? "error" : "neutral");
      onToast(result.message);
    } catch (error) {
      if (isNetworkOperationActive(operation)) {
        const text = error instanceof Error ? error.message : "Не удалось получить список моделей";
        setModelOptions([]);
        setModelDiscoveryState("error");
        setModelDiscoveryMessage(`${text}. Можно указать Model ID вручную.`);
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
      const discoveryFeedback = modelDiscoveryFeedbackFromConnectionTest(result);
      setModelOptions(result.models.map((id) => ({ id, supportsChat: null, supportsEmbeddings: null })));
      setModelDiscoveryState(discoveryFeedback.state);
      setModelDiscoveryMessage(discoveryFeedback.message);
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
      setProviderDeleteRequest(null);
    }
  }

  function handleDeleteProvider() {
    if (!form.id) {
      return;
    }
    setProviderDeleteRequest({ id: form.id, name: form.name });
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
    setModelDiscoveryState("idle");
    setModelDiscoveryMessage("");
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
      setModelDiscoveryState("idle");
      setModelDiscoveryMessage("");
    }
  }

  return (
    <div className="model-settings-page">
      <div className="settings-title">Модели ИИ</div>
      <div className="settings-subtitle">Подключайте модели для генерации текста и смыслового поиска по базе заметок.</div>
      <section className="model-settings-section">
        <SettingsSectionHeader
          action={providers.length > 0 ? (
            <button className="primary-btn compact" disabled={isLoadingProviders || storageAction !== null} onClick={() => openAddProvider()} type="button">
              Добавить модель
            </button>
          ) : null}
          description="Генерируют и редактируют текст, отвечают на вопросы и используются в ИИ-помощнике."
          info="Эти модели создают текст: отвечают на вопросы, редактируют заметки, сокращают, объясняют и выполняют другие действия ИИ-помощника. API key хранится только в защищённом хранилище операционной системы."
          title="Модели для ИИ-помощника"
        />
        <div className="settings-card llm-provider-list-card model-settings-card">
        {providers.length === 0 && !isLoadingProviders ? (
          <div className="llm-empty-state-card model-empty-state">
            <div className="llm-empty-icon" aria-hidden="true"><Icon name="logo" /></div>
            <b>Модель ИИ пока не подключена</b>
            <p>Подключите модель для работы ИИ-помощника и чата.</p>
            <button className="primary-btn" onClick={() => openAddProvider()} type="button">
              Добавить модель
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
                <article className="llm-provider-card model-profile-card" key={provider.id}>
                  <div className="llm-provider-card-main model-profile-head">
                    <span className="provider-icon">{preset.icon}</span>
                    <div>
                      <div className="llm-provider-card-title">
                        <b>{provider.name}</b>
                        {provider.isDefault ? <span className="llm-default-badge">Основное</span> : null}
                      </div>
                      <small>{preset.label} · {provider.chatModel || "модель не выбрана"}</small>
                    </div>
                    <ModelStatusBadge
                      busy={isProviderTesting}
                      label={isProviderTesting ? "Проверяем" : statusLabel(provider.lastStatus)}
                      tone={provider.lastStatus === "success" ? "success" : provider.lastStatus === "error" ? "error" : "neutral"}
                    />
                  </div>
                  <div className="llm-provider-card-meta">
                    <span>{provider.baseUrl}</span>
                    {provider.statusMessage ? <span>{provider.statusMessage}</span> : null}
                  </div>
                  <div className="llm-provider-card-actions model-profile-actions">
                    <button className="secondary-btn compact" disabled={isProviderTesting || storageAction !== null} onClick={() => void handleCheckSavedProvider(provider)} type="button">
                      {isProviderTesting ? <LoadingInline label="Проверяем…" /> : "Проверить подключение"}
                    </button>
                    <button className="secondary-btn compact" disabled={storageAction !== null} onClick={() => openEditProvider(provider)} type="button">
                      Изменить
                    </button>
                    <details className="model-card-more">
                      <summary aria-label={`Дополнительные действия: ${provider.name}`} className="row-menu-trigger"><Icon name="dots" /></summary>
                      <div className="model-card-more-menu">
                        <button disabled={provider.isDefault || storageAction === "default"} onClick={() => void setDefaultProvider(provider.id)} type="button">
                          {storageAction === "default" ? <LoadingInline label="Назначение…" /> : "Сделать основным"}
                        </button>
                        <button className="danger" disabled={storageAction === "delete"} onClick={() => setProviderDeleteRequest({ id: provider.id, name: provider.name })} type="button">
                          {storageAction === "delete" ? <LoadingInline label="Удаление…" /> : "Удалить"}
                        </button>
                      </div>
                    </details>
                  </div>
                  <div aria-live="polite" className={`model-card-operation ${isProviderTesting ? "visible" : ""}`}>
                    {isProviderTesting ? "Проверяем подключение…" : "\u00A0"}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        {shouldShowConnectionNote ? <div className={connectionNoteClass}>{activeOperationMessage ? <LoadingInline label={activeOperationMessage} /> : message}</div> : null}
        </div>
      </section>
      <div id="semantic-search-settings">
        <SemanticSearchSettings onToast={onToast} />
      </div>
      {isProviderModalOpen && !providerDeleteRequest ? (
        <SettingsModalShell
          className="llm-provider-modal"
          description={privacyNotice}
          eyebrow={draftMode === "edit" ? "Редактирование" : "Новая модель"}
          footer={(
            <div className="settings-modal-footer-layout">
              <div className="settings-modal-footer-leading">
                {form.id ? (
                  <button className="danger-btn" disabled={storageAction === "delete"} onClick={handleDeleteProvider} type="button">
                    {storageAction === "delete" ? <LoadingInline label="Удаление…" /> : "Удалить модель"}
                  </button>
                ) : null}
              </div>
              <div className="settings-modal-footer-actions">
                <button className="ghost-btn" disabled={storageAction !== null} onClick={handleCancelDraft} type="button">Отмена</button>
                <button className="secondary-btn" disabled={isTestingConnection} onClick={() => void handleTestConnection()} type="button">
                  {isTestingConnection ? <LoadingInline label="Проверяем…" /> : "Проверить подключение"}
                </button>
                <button className="primary-btn" disabled={storageAction === "save"} onClick={() => void handleSave()} type="button">
                  {storageAction === "save" ? <LoadingInline label="Сохранение…" /> : draftMode === "edit" ? "Сохранить изменения" : "Сохранить модель"}
                </button>
              </div>
            </div>
          )}
          onClose={closeProviderModal}
          size="wide"
          status={shouldShowConnectionNote ? <div className={connectionNoteClass}>{activeOperationMessage ? <LoadingInline label={activeOperationMessage} /> : message}</div> : null}
          title={modalTitle}
          titleId="llm-provider-modal-title"
        >
            <ProviderTypeSelector
              ariaLabel="Тип подключения модели ИИ"
              initialFocusRef={modalInitialFocusRef}
              onChange={(providerType) => {
                const provider = getProviderPreset(providerType);
                applyPreset(provider);
                onToast(`Выбран провайдер: ${provider.label}`);
              }}
              options={providerPresets}
              value={form.providerType}
            />
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
              <ModelDiscoveryField
                label="Модель чата"
                manualPlaceholder="Введите ID модели"
                manualValue={form.chatModel}
                onDiscover={() => void handleLoadModels()}
                onManualChange={(chatModel) => updateDraft({ chatModel })}
                onSelect={(chatModel) => updateDraft({ chatModel })}
                options={modelOptions}
                purpose="chat"
                state={modelDiscoveryState}
                statusMessage={modelDiscoveryMessage}
              />
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
        </SettingsModalShell>
      ) : null}
      {providerDeleteRequest ? (
        <SettingsModalShell
          description={`Модель «${providerDeleteRequest.name}» и её настройки будут удалены. Это действие не удаляет заметки.`}
          dismissOnBackdrop={false}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="ghost-btn" disabled={storageAction === "delete"} onClick={() => setProviderDeleteRequest(null)} type="button">Отмена</button>
              <button className="danger-btn" disabled={storageAction === "delete"} onClick={() => void deleteProvider(providerDeleteRequest.id)} type="button">
                {storageAction === "delete" ? <LoadingInline label="Удаление…" /> : "Удалить модель"}
              </button>
            </div>
          )}
          onClose={() => setProviderDeleteRequest(null)}
          size="compact"
          title="Удалить модель?"
          titleId="llm-provider-delete-title"
        >
          <div className="settings-confirm-note">Сохранённый API key будет удалён из защищённого хранилища операционной системы.</div>
        </SettingsModalShell>
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
              aria-pressed={theme === option.id}
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
        </div>
        <div className="zoom-settings-row">
          <button className="zoom-step-btn" data-tooltip="Уменьшить масштаб" disabled={appZoomPercent <= APP_ZOOM_MIN} onClick={onZoomDecrease} type="button">
            <Icon name="minus" />
          </button>
          <button className="zoom-reset-btn" data-tooltip="Сбросить масштаб" onClick={onZoomReset} type="button">
            {appZoomPercent}%
          </button>
          <button className="zoom-step-btn" data-tooltip="Увеличить масштаб" disabled={appZoomPercent >= APP_ZOOM_MAX} onClick={onZoomIncrease} type="button">
            <Icon name="plus" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface DataSettingsProps {
  onBackupCreate: () => Promise<ExportResult | null>;
  onBackupPreview: (file: File) => Promise<BackupPreview>;
  onImportBackup: (file: File) => Promise<ImportBackupResult>;
  onImportMarkdown: (notes: readonly PreparedMarkdownNote[]) => Promise<number>;
  onToast: (message: string) => void;
}

const knowledgeStatusLabels: Record<KnowledgeIndexStatusCode, string> = {
  current: "Актуальна",
  failed: "Требует внимания",
  needs_update: "Ожидает обработки",
  pending: "Обновляется",
};

export function getKnowledgeStatusLabel(status: KnowledgeIndexStatusCode) {
  return knowledgeStatusLabels[status];
}

export function formatKnowledgeCheckedAt(value?: string | null, now = new Date()) {
  if (!value) {
    return "Ещё не проверялась";
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "Время проверки недоступно";
  }
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return isToday ? `сегодня, ${formatDisplayTime(date)}` : formatDisplayDateTime(date);
}

function DataSettings({ onBackupCreate, onBackupPreview, onImportBackup, onImportMarkdown, onToast }: DataSettingsProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const importRequestIdRef = useRef(0);
  const knowledgeMoreRef = useRef<HTMLDetailsElement>(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeIndexStatus | null>(null);
  const [knowledgeOperation, setKnowledgeOperation] = useState<KnowledgeIndexOperation | null>(null);
  const [knowledgeMessage, setKnowledgeMessage] = useState("Загружаем состояние базы знаний…");
  const [knowledgeHasError, setKnowledgeHasError] = useState(false);
  const [isRebuildConfirmationOpen, setIsRebuildConfirmationOpen] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [backupExportState, setBackupExportState] = useState<"idle" | "creating" | "success" | "error">("idle");
  const [backupExportResult, setBackupExportResult] = useState<ExportResult | null>(null);
  const [importState, dispatchImport] = useReducer(reduceBackupImportState, initialBackupImportState);

  async function createExternalBackup() {
    if (backupExportState === "creating") return;
    setBackupExportState("creating");
    setBackupExportResult(null);
    try {
      const result = await onBackupCreate();
      if (!result) {
        setBackupExportState("idle");
        return;
      }
      setBackupExportResult(result);
      setBackupExportState("success");
      onToast("Резервная копия создана");
    } catch {
      setBackupExportState("error");
      onToast("Не удалось создать резервную копию");
    }
  }

  async function prepareBackupImport(file: File) {
    const requestId = importRequestIdRef.current + 1;
    importRequestIdRef.current = requestId;
    setSelectedBackupFile(file);
    dispatchImport({ type: "previewStarted", requestId });
    try {
      const preview = await onBackupPreview(file);
      dispatchImport({ type: "previewReady", preview, requestId });
    } catch {
      dispatchImport({
        type: "previewFailed",
        message: getBackupPreviewErrorMessage(),
        requestId,
      });
    }
  }

  function closeBackupImport() {
    if (importState.phase === "restoring") return;
    importRequestIdRef.current += 1;
    setSelectedBackupFile(null);
    dispatchImport({ type: "close" });
  }

  async function restoreSelectedBackup() {
    if (!selectedBackupFile || (importState.phase !== "ready" && importState.phase !== "error") || !importState.preview) return;
    dispatchImport({ type: "restoreStarted" });
    try {
      const result = await onImportBackup(selectedBackupFile);
      dispatchImport({ type: "restoreSucceeded", result });
    } catch (error) {
      const appliedButNotReloaded = String(error).includes("интерфейс не удалось обновить");
      dispatchImport({
        type: appliedButNotReloaded ? "restoreAppliedButReloadFailed" : "restoreFailed",
        message: getBackupRestoreErrorMessage(appliedButNotReloaded),
      });
    }
  }

  useEffect(() => {
    let isActive = true;
    let timer: number;
    function poll() { void knowledgeService.getKnowledgeIndexStatus().then(
      (status) => {
        if (isActive) {
          setKnowledgeStatus(status);
          setKnowledgeMessage("");
          setKnowledgeHasError(false);
        }
      },
      () => {
        if (isActive) {
          setKnowledgeMessage("Не удалось получить состояние базы знаний");
          setKnowledgeHasError(true);
        }
      },
    ).finally(() => { if (isActive) timer = window.setTimeout(poll, 3000); }); }
    poll();
    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, []);

  async function updateKnowledgeIndex(operation: KnowledgeIndexOperation) {
    if (knowledgeOperation !== null) {
      return;
    }
    setKnowledgeOperation(operation);
    setKnowledgeHasError(false);
    setKnowledgeMessage(operation === "rebuild" ? "Заново обрабатываем все заметки…" : "Проверяем новые и изменённые заметки…");
    try {
      const result = await knowledgeService.runKnowledgeIndexOperation(operation);
      const status = await knowledgeService.getKnowledgeIndexStatus();
      setKnowledgeStatus(status);
      const message =
        result.errors > 0
          ? "Не удалось обновить базу знаний полностью. Попробуйте ещё раз"
          : operation === "rebuild"
            ? `База знаний успешно пересоздана · Обработано заметок: ${result.processedNotes} · Создано фрагментов: ${result.createdChunks} · ${(result.durationMs / 1000).toFixed(1)} с`
            : result.processedNotes === 0
              ? "Всё уже актуально · изменений не найдено"
              : `База знаний обновлена · Обновлено заметок: ${result.processedNotes} · Создано фрагментов: ${result.createdChunks}`;
      setKnowledgeMessage(message);
      setKnowledgeHasError(result.errors > 0);
      onToast(message);
    } catch {
      setKnowledgeMessage("Не удалось обновить базу знаний. Попробуйте ещё раз");
      setKnowledgeHasError(true);
    } finally {
      setKnowledgeOperation(null);
    }
  }

  const visibleKnowledgeStatus: KnowledgeIndexStatusCode = knowledgeOperation
    ? "pending"
    : knowledgeStatus?.status ?? "needs_update";

  return (
    <div>
      <div className="settings-title">Данные и экспорт</div>
      <div className="settings-subtitle">Резервные копии профиля, импорт и восстановление данных.</div>
      <div className="settings-card knowledge-index-card">
        <div className="settings-section-head knowledge-index-head">
          <div>
            <b>База знаний</b>
            <span>NoteFlow делит длинные заметки на небольшие части, чтобы точнее находить нужную информацию при ИИ-поиске.</span>
          </div>
          <span className={`status-pill ${visibleKnowledgeStatus === "current" ? "ok" : visibleKnowledgeStatus === "failed" ? "error" : ""}`}>
            {knowledgeOperation ? <span aria-hidden="true" className="button-spinner" /> : null}
            {getKnowledgeStatusLabel(visibleKnowledgeStatus)}
          </span>
        </div>
        <div className="knowledge-index-metrics">
          <div><span>Заметки</span><b>{knowledgeStatus?.indexedNotes ?? 0} из {knowledgeStatus?.totalNotes ?? 0}</b></div>
          <div><span>Фрагменты заметок для ИИ-поиска</span><b>{knowledgeStatus?.chunkCount ?? 0}</b></div>
          <div><span>Последняя проверка</span><b>{formatKnowledgeCheckedAt(knowledgeStatus?.lastCheckedAt)}</b></div>
        </div>
        <div aria-live="polite" className={`knowledge-index-message ${knowledgeHasError || visibleKnowledgeStatus === "failed" ? "error" : ""}`}>
          {knowledgeMessage || "Новые и изменённые заметки добавляются автоматически"}
        </div>
        <div className="knowledge-index-actions">
          <details className="knowledge-index-more" ref={knowledgeMoreRef}>
            <summary>Восстановление индекса</summary>
            <div className="knowledge-repair-action">
              <b>Исправление проблем</b>
              <span>Удаляет служебные данные базы знаний и создаёт их заново. Ваши заметки не изменятся.</span>
              <button
                className="export-action secondary"
                disabled={knowledgeOperation !== null}
                onClick={() => setIsRebuildConfirmationOpen(true)}
                type="button"
              >
                Пересоздать базу знаний
              </button>
            </div>
          </details>
        </div>
      </div>
      <div className="settings-card export-card">
        <div className="export-action-group">
          <div className="export-action-head">
            <b>Резервная копия</b>
            <span>Все данные профиля</span>
          </div>
          <div className="export-action-list">
            <button className="export-action primary" disabled={backupExportState === "creating"} onClick={() => void createExternalBackup()} type="button">
              {backupExportState === "creating" ? <span aria-hidden="true" className="button-spinner" /> : <Icon name="archive" />}
              {backupExportState === "creating" ? "Создаём копию…" : "Создать резервную копию"}
            </button>
          </div>
          {backupExportState === "success" && backupExportResult ? (
            <div aria-live="polite" className="backup-export-status">
              <span>Резервная копия создана: {backupExportResult.path}</span>
              <button className="export-action secondary" onClick={() => void dataService.revealExportedItem(backupExportResult.path).catch(() => onToast("Не удалось показать файл в Проводнике"))} type="button">Показать в Проводнике</button>
            </div>
          ) : null}
          {backupExportState === "error" ? <p className="backup-export-error" role="alert">Не удалось создать резервную копию. Проверьте доступность выбранной папки и повторите попытку.</p> : null}
        </div>
        <div className="export-action-group recovery">
          <div className="export-action-head">
            <b>Импорт и восстановление</b>
            <span>Markdown-файлы или резервная копия NoteFlow</span>
          </div>
          <MarkdownImportControl onImport={onImportMarkdown} />
          <button
            className="export-action secondary"
            disabled={importState.phase === "previewing" || importState.phase === "restoring"}
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            {importState.phase === "previewing" ? <span aria-hidden="true" className="button-spinner" /> : <Icon name="attach" />}
            {importState.phase === "previewing" ? "Проверяем копию…" : "Импорт резервной копии"}
          </button>
        </div>
        <input
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void prepareBackupImport(file);
            }
            event.currentTarget.value = "";
          }}
          ref={importInputRef}
          type="file"
        />
      </div>
      {importState.phase !== "closed" ? (
        <SettingsModalShell
          className="backup-import-modal"
          closeDisabled={importState.phase === "restoring"}
          description={importState.phase === "success" || importState.phase === "applied"
            ? "Данные профиля заменены содержимым выбранной резервной копии."
            : "Проверьте содержимое перед восстановлением данных профиля."}
          dismissOnBackdrop={false}
          footer={(
            <div className="settings-modal-footer-layout">
              <div className="settings-modal-footer-leading" />
              <div className="settings-modal-footer-actions">
                {importState.phase === "success" || importState.phase === "applied" ? (
                  <button className="primary-btn" onClick={closeBackupImport} type="button">Закрыть</button>
                ) : (
                  <>
                    <button className="secondary-btn" disabled={importState.phase === "restoring"} onClick={closeBackupImport} type="button">Отмена</button>
                    {importState.preview ? (
                      <button
                        className="primary-btn"
                        disabled={importState.phase === "restoring" || importState.phase === "previewing"}
                        onClick={() => void restoreSelectedBackup()}
                        type="button"
                      >
                        {importState.phase === "restoring" ? <span aria-hidden="true" className="button-spinner" /> : null}
                        {importState.phase === "restoring" ? "Восстанавливаем…" : importState.phase === "error" ? "Попробовать снова" : "Восстановить"}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}
          onClose={closeBackupImport}
          size="compact"
          title={importState.phase === "success" || importState.phase === "applied" ? "Резервная копия восстановлена" : "Восстановить резервную копию?"}
          titleId="backup-import-title"
        >
          {importState.phase === "previewing" ? (
            <div aria-live="polite" className="backup-import-loading">
              <span aria-hidden="true" className="button-spinner" />
              <span>Проверяем файл и вложения. Текущие данные пока не изменяются.</span>
            </div>
          ) : null}
          {importState.preview && importState.phase !== "success" && importState.phase !== "applied" ? (
            <div className="backup-import-preview">
              <div className="backup-import-meta">
                <b>Резервная копия от {formatBackupDate(importState.preview.exportedAt)}</b>
                <span>{importState.preview.appVersion ? `Создана в NoteFlow ${importState.preview.appVersion}` : `Формат резервной копии ${importState.preview.formatVersion}`}</span>
              </div>
              <div className="backup-import-counts">
                {getBackupSummaryRows(importState.preview.contents).map(([label, count]) => (
                  <div key={label}><span>{label}</span><b>{count}</b></div>
                ))}
              </div>
              {getLegacyBackupHistoryNotice(importState.preview) ? (
                <div className="backup-import-notice warning">{getLegacyBackupHistoryNotice(importState.preview)}</div>
              ) : null}
              {importState.preview.missingAttachmentFiles > 0 ? (
                <div className="backup-import-notice warning">
                  В старой резервной копии недоступны некоторые файлы вложений: {importState.preview.missingAttachmentFiles}.
                </div>
              ) : null}
              <div className="backup-import-notice danger">
                Восстановление заменит заметки, проекты, теги, вложения и поддерживаемую историю чатов данными из резервной копии.
              </div>
            </div>
          ) : null}
          {importState.phase === "restoring" ? (
            <div aria-live="polite" className="backup-import-loading">
              <span aria-hidden="true" className="button-spinner" />
              <span>Восстанавливаем данные и проверяем поиск. Не закрывайте NoteFlow.</span>
            </div>
          ) : null}
          {importState.phase === "error" ? (
            <div aria-live="assertive" className="backup-import-error" role="alert">{importState.errorMessage}</div>
          ) : null}
          {importState.phase === "applied" ? (
            <div aria-live="assertive" className="backup-import-error" role="alert">{importState.errorMessage}</div>
          ) : null}
          {importState.phase === "success" && importState.result ? (
            <div className="backup-import-result">
              <div className="backup-import-counts">
                {getBackupSummaryRows(importState.result.contents).map(([label, count]) => (
                  <div key={label}><span>{label}</span><b>{count}</b></div>
                ))}
              </div>
              <div className="backup-import-notice success">
                {importState.result.indexesUpdating
                  ? "Заметки и чаты восстановлены. Базу знаний нужно обновить в этом разделе."
                  : "Заметки, чаты, поиск и база знаний находятся в согласованном состоянии."}
              </div>
            </div>
          ) : null}
        </SettingsModalShell>
      ) : null}
      {isRebuildConfirmationOpen ? (
        <SettingsModalShell
          description="NoteFlow заново обработает все заметки. Сами заметки и их форматирование не изменятся. Операция может занять некоторое время."
          dismissOnBackdrop={false}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="secondary-btn" onClick={() => setIsRebuildConfirmationOpen(false)} type="button">Отмена</button>
              <button
                className="primary-btn"
                onClick={() => {
                  setIsRebuildConfirmationOpen(false);
                  if (knowledgeMoreRef.current) {
                    knowledgeMoreRef.current.open = false;
                  }
                  void updateKnowledgeIndex("rebuild");
                }}
                type="button"
              >
                Пересоздать
              </button>
            </div>
          )}
          onClose={() => setIsRebuildConfirmationOpen(false)}
          size="compact"
          title="Пересоздать базу знаний?"
          titleId="knowledge-rebuild-title"
        >
          <div className="settings-confirm-note">Поиск продолжит работать во время обновления базы знаний.</div>
        </SettingsModalShell>
      ) : null}
    </div>
  );
}

function ShortcutsSettings() {
  return (
    <div>
      <div className="settings-title">Горячие клавиши</div>
      <div className="settings-subtitle">Сочетания, которые уже работают в приложении. На macOS используйте ⌘ вместо Ctrl.</div>
      <ShortcutGroup label="Навигация" shortcuts={APP_SHORTCUTS} />
      <ShortcutGroup label="Редактор" shortcuts={EDITOR_SHORTCUTS} />
    </div>
  );
}

function ShortcutGroup({ label, shortcuts }: { label: string; shortcuts: readonly ShortcutReference[] }) {
  return (
    <section className="settings-preference-group shortcuts-group" aria-label={label}>
      <div className="settings-preference-label">{label}</div>
      <div className="shortcut-list">
        {shortcuts.map((shortcut) => (
          <div className="shortcut-row" key={shortcut.id}>
            <span>{shortcut.label}</span>
            <span className="shortcut-keys" aria-label={shortcut.keys.join(" плюс ")}>
              {shortcut.keys.map((key, index) => (
                <span className="shortcut-key-part" key={`${shortcut.id}-${key}`}>
                  {index > 0 ? <span aria-hidden="true" className="shortcut-plus">+</span> : null}
                  <kbd>{key}</kbd>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AboutSettings() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    void getVersion()
      .then((value) => {
        if (isActive) setVersion(value);
      })
      .catch(() => {
        if (isActive) setVersion("");
      });
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div>
      <div className="settings-title">О приложении</div>
      <div className="settings-subtitle">Локальные заметки, Markdown-first редактор и ИИ-инструменты с контролем приватности.</div>
      <div className="settings-card about-card">
        <span className="about-mark"><Icon name="logo" /></span>
        <span>
          <b>NoteFlow</b>
          <small aria-live="polite">{version === null ? "Получаем версию…" : version ? `Версия ${version}` : "Версия недоступна"}</small>
        </span>
      </div>
    </div>
  );
}
