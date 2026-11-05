import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { AppLanguage, AppSection, SettingsPanel, ThemeMode } from "../../app/types";
import * as dataService from "../../services/dataService";
import type { BackupPreview, ExportResult, ImportBackupResult } from "../../services/dataService";
import { Icon } from "../../shared/Icon";
import { InfoHint } from "../../shared/InfoHint";
import { formatDisplayDateTime, formatDisplayTime } from "../../shared/displayDate";
import { PageShell, type PageShellSidebarProps } from "../navigation/PageShell";
import { APP_ZOOM_MAX, APP_ZOOM_MIN, getNextAppZoom } from "../../shared/appZoom";
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
import { DeleteAllNotesControl } from "./DeleteAllNotesControl";
import { uiMessage, localizeUiMessage } from "../../shared/uiMessages";
import { InterfaceLanguageControl } from "./InterfaceLanguageControl";
import type { PreparedMarkdownNote } from "./markdownImport";
import {
  formatBackupDate,
  getBackupPreviewErrorMessage,
  getBackupRestoreErrorMessage,
  wasBackupRestoreApplied,
  getBackupSummaryRows,
  getLegacyBackupHistoryNotice,
  initialBackupImportState,
  reduceBackupImportState,
} from "./backupImportFlow";

interface SettingsPageProps {
  language?: AppLanguage;
  onLanguageChange?: (language: AppLanguage) => void;
  initialTarget?: "semantic-search";
  appZoomPercent: number;
  onApplyZoom?: (percent: number) => void;
  onReplayTraining?: () => void;
  localProfileName: string;
  theme: ThemeMode;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onBackupCreate: () => Promise<ExportResult | null>;
  onBackupPreview: (file: File) => Promise<BackupPreview>;
  onImportBackup: (file: File) => Promise<ImportBackupResult>;
  onImportMarkdown: (notes: readonly PreparedMarkdownNote[]) => Promise<number>;
  onDeleteAllNotes: () => Promise<dataService.DeleteAllNotesResult>;
  onEditLocalProfile: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onToast: (message: string) => void;
  onZoomDecrease: () => void;
  onZoomIncrease: () => void;
  onZoomReset: () => void;
  sidebar: PageShellSidebarProps;
}

const settingsPanels: Array<{ id: SettingsPanel; label: string }> = [
  { id: "general", get label() { return translate("ui.d40de76d56d7"); } },
  { id: "models", get label() { return translate("ui.05045a31fa7f"); } },
  { id: "appearance", get label() { return translate("ui.c407960b916f"); } },
  { id: "data", get label() { return translate("ui.6c32ef0d0712"); } },
  { id: "shortcuts", get label() { return translate("ui.13b0a5cc9afc"); } },
  { id: "about", get label() { return translate("ui.eca626bab07b"); } },
];

const providerPresets = [
  {
    id: "openai",
    label: "OpenAI",
    get detail() { return translate("ui.95c1647cbf3f"); },
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
    get detail() { return translate("ui.b7608054c1a4"); },
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
    get detail() { return translate("ui.e87192b5413e"); },
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
    get detail() { return translate("ui.61b74f44cede"); },
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
  language = getInterfaceLanguage(),
  onLanguageChange,
  initialTarget,
  appZoomPercent,
  onApplyZoom,
  onReplayTraining,
  localProfileName,
  theme,
  onBackupCreate,
  onBackupPreview,
  onImportBackup,
  onImportMarkdown,
  onDeleteAllNotes,
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
  useInterfaceLanguage();
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
        <aside aria-label={translate("ui.2d73b4c38491")} className="settings-nav-col">
          <div className="nav-sec">{translate("ui.985b5e0f2ccf")}</div>
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
          {activePanel === "general" ? <GeneralSettings language={language} onLanguageChange={onLanguageChange} localProfileName={localProfileName} onEditLocalProfile={onEditLocalProfile} onReplayTraining={onReplayTraining} /> : null}
          {activePanel === "models" ? <ModelsSettings onToast={onToast} /> : null}
          {activePanel === "appearance" ? (
            <AppearanceSettings
              appZoomPercent={appZoomPercent}
              onApplyZoom={onApplyZoom}
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
              onDeleteAllNotes={onDeleteAllNotes}
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
  language: AppLanguage;
  onLanguageChange?: (language: AppLanguage) => void;
  localProfileName: string;
  onEditLocalProfile: () => void;
  onReplayTraining?: () => void;
}

function GeneralSettings({ language, onLanguageChange, localProfileName, onEditLocalProfile, onReplayTraining }: GeneralSettingsProps) {
  useInterfaceLanguage();
  return (
    <div>
      <div className="settings-title">{translate("ui.d40de76d56d7")}</div>
      <div className="settings-subtitle">{translate("ui.b1a30806c4a9")}</div>
      <section className="settings-preference-group" aria-labelledby="general-profile-heading">
        <div className="settings-preference-label" id="general-profile-heading">{translate("ui.359497aff53e")}</div>
        <div className="settings-preference-list settings-profile-preferences">
          <div className="settings-preference-row">
            <span className="settings-info-icon"><Icon name="person" /></span>
            <span className="settings-preference-copy"><b>{localProfileName}</b><small>{translate("ui.3f71fc9d8719")}</small></span>
            <button className="secondary-btn compact" onClick={onEditLocalProfile} type="button">{translate("ui.02e4f11754bc")}</button>
          </div>
          <div className="settings-preference-row">
            <span className="settings-info-icon"><Icon name="bulb" /></span>
            <span className="settings-preference-copy"><b>{translate("ui.53cf22f872f0")}</b></span>
            <button className="secondary-btn compact" onClick={onReplayTraining} type="button">{translate("ui.65cb604f8c5c")}</button>
          </div>
          <div className="settings-preference-row settings-preference-row--language">
            <span className="settings-info-icon"><Icon name="gear" /></span>
            <span className="settings-preference-copy" id="interface-language-label"><b>{uiMessage(language, "interfaceLanguage")}</b></span>
            <InterfaceLanguageControl language={language} labelledBy="interface-language-label" onChange={onLanguageChange} />
          </div>
        </div>
      </section>
      <section className="settings-preference-group" aria-labelledby="general-app-heading">
        <div className="settings-preference-label" id="general-app-heading">{translate("ui.26b855cc1660")}</div>
        <div className="settings-preference-list">
          <div className="settings-preference-row">
            <span className="settings-info-icon"><Icon name="doc" /></span>
            <span className="settings-preference-copy"><b>{translate("ui.47e443cadb08")}</b><small>{translate("ui.b76c0c496730")}</small></span>
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
    name: preset.id === "ollama" ? translate("ui.272279d699f8") : preset.id === "lmstudio" ? translate("ui.454877947c87") : translate("ui.e04ce307babb"),
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
    return translate("ui.0232a305412b");
  }
  if (status === "error") {
    return translate("ui.bf22dfeeba8b");
  }
  return translate("ui.ce3074ea2225");
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
    errors.push(translate("ui.e79a81a9713e"));
  }
  if (!baseUrl) {
    errors.push(translate("ui.ad199dabfd5a"));
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    errors.push(translate("ui.6f80a2ae433f"));
  }
  if (form.providerType === "ollama" && /\/v1\/?$/i.test(baseUrl)) {
    errors.push(translate("ui.787542b8b893"));
  }
  if (action === "save" && !form.chatModel.trim()) {
    errors.push(uiMessage(getInterfaceLanguage(), "chatModelRequired"));
  }
  if (action === "save" && !isLocalProviderType(form.providerType) && !form.apiKey.trim() && !hasSavedApiKey) {
    errors.push(uiMessage(getInterfaceLanguage(), "externalProviderKeyRequired"));
  }
  return errors;
}

function LoadingInline({ label }: { label: string }) {
  useInterfaceLanguage();
  return <span className="loading-inline">{label}</span>;
}

function ModelsSettings({ onToast }: ModelsSettingsProps) {
  useInterfaceLanguage();
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
  const [message, setMessage] = useState(translate("ui.93924c612310"));
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
  const keyLabel = selectedProvider?.hasApiKey ? translate("ui.4ac7196e286c") : translate("ui.8e407985cc2b");
  const privacyNotice = selectedProvider?.privacyNotice ?? uiMessage(getInterfaceLanguage(), isLocalEndpoint(form.baseUrl) ? "localProviderPrivacy" : "externalProviderPrivacy");
  const modalTitle = draftMode === "edit" ? translate("ui.a89464c13454") : translate("ui.2df38a36b3c0");
  const activeOperationMessage = isLoadingProviders
    ? translate("ui.bb746d54d7ac")
    : isTestingConnection
      ? translate("ui.56d56768c4aa")
      : isLoadingModels
        ? translate("ui.1d2aba977c86")
        : storageAction === "save"
          ? translate("ui.fc93a302861b")
          : storageAction === "delete"
            ? translate("ui.308d737388a9")
            : storageAction === "default"
              ? translate("ui.bd32d3f7c071")
              : storageAction === "key"
                ? uiMessage(getInterfaceLanguage(), "apiKeyDeleting")
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
          ? uiMessage(getInterfaceLanguage(), "modelsListTimeout")
          : uiMessage(getInterfaceLanguage(), "connectionTestTimeout");
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
        updateMessage(loadedProviders.length > 0 ? translate("ui.a7c6ed51b199") : translate("ui.4e2e09c964c4"));
      } catch (error) {
        if (!cancelled) {
          updateMessage(error instanceof Error ? error.message : uiMessage(getInterfaceLanguage(), "providerConnectionsLoadFailed"), "error");
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
    updateMessage(translate("ui.cfa6d10630a7"));
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
    updateMessage(provider.statusMessage ?? translate("ui.e36839c21a2b"), provider.lastStatus === "error" ? "error" : "neutral");
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
      updateMessage(uiMessage(getInterfaceLanguage(), savedProvider.hasApiKey ? "providerSavedWithKey" : "providerSavedWithoutKey"));
      onToast(uiMessage(getInterfaceLanguage(), "providerConnectionSaved"));
    } catch (error) {
      const text = error instanceof Error ? error.message : translate("ui.6b43eddb211f");
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
    setModelDiscoveryMessage(translate("ui.69e52b16892b"));
    updateMessage(translate("ui.954eb9132da8"));
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
        const text = error instanceof Error ? error.message : translate("ui.df3da8c2f928");
        setModelOptions([]);
        setModelDiscoveryState("error");
        setModelDiscoveryMessage(translate("ui.aa69dc88b895", { p0: text }));
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
    updateMessage(translate("ui.a4ef42e083b8"));
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
        const text = error instanceof Error ? error.message : translate("ui.52d1b618953f");
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
    updateMessage(translate("ui.15da91161dd5", { p0: provider.name }));
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
        const text = error instanceof Error ? error.message : translate("ui.52d1b618953f");
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
      updateMessage(uiMessage(getInterfaceLanguage(), "apiKeyDeletedSecurely"));
      onToast(uiMessage(getInterfaceLanguage(), "apiKeyDeleted"));
    } catch (error) {
      const text = error instanceof Error ? error.message : uiMessage(getInterfaceLanguage(), "apiKeyDeleteFailed");
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
      updateMessage(translate("ui.8627d8457c53"));
      onToast(uiMessage(getInterfaceLanguage(), "providerConnectionDeleted"));
    } catch (error) {
      const text = error instanceof Error ? error.message : translate("ui.ac75bdf507d4");
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
      updateMessage(translate("ui.18b3424dddfb"));
      onToast(translate("ui.4b9029f23efe"));
    } catch (error) {
      const text = error instanceof Error ? error.message : translate("ui.de7f43faf7f9");
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
    updateMessage(translate("ui.ab68977ea3c7"));
  }

  function handleCancelDraft() {
    closeProviderModal();
    updateMessage(translate("ui.66a0b84e605d"));
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
      <div className="settings-title">{translate("ui.05045a31fa7f")}</div>
      <div className="settings-subtitle">{translate("ui.3e26154bf418")}</div>
      <section className="model-settings-section">
        <SettingsSectionHeader
          action={providers.length > 0 ? (
            <button className="primary-btn compact" disabled={isLoadingProviders || storageAction !== null} onClick={() => openAddProvider()} type="button">
              {translate("ui.2df38a36b3c0")}</button>
          ) : null}
          description={translate("ui.b9e32c887ff1")}
          info={uiMessage(getInterfaceLanguage(), "generativeModelsInfo")}
          title={translate("ui.d2481f60ed6b")}
        />
        <div className="settings-card llm-provider-list-card model-settings-card">
        {providers.length === 0 && !isLoadingProviders ? (
          <div className="llm-empty-state-card model-empty-state">
            <div className="llm-empty-icon" aria-hidden="true"><Icon name="logo" /></div>
            <b>{translate("ui.a4e5e8b1abd0")}</b>
            <p>{translate("ui.ce77c555ef32")}</p>
            <button className="primary-btn" onClick={() => openAddProvider()} type="button">
              {translate("ui.2df38a36b3c0")}</button>
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
                        {provider.isDefault ? <span className="llm-default-badge">{translate("ui.11355a292cbb")}</span> : null}
                      </div>
                      <small>{preset.label} · {provider.chatModel || translate("ui.1e7c1d7c478a")}</small>
                    </div>
                    <ModelStatusBadge
                      busy={isProviderTesting}
                      label={isProviderTesting ? translate("ui.349423c80f2d") : statusLabel(provider.lastStatus)}
                      tone={provider.lastStatus === "success" ? "success" : provider.lastStatus === "error" ? "error" : "neutral"}
                    />
                  </div>
                  <div className="llm-provider-card-meta">
                    <span>{provider.baseUrl}</span>
                    {provider.statusMessage ? <span>{localizeUiMessage(getInterfaceLanguage(), provider.statusMessage)}</span> : null}
                  </div>
                  <div className="llm-provider-card-actions model-profile-actions">
                    <button className="secondary-btn compact" disabled={isProviderTesting || storageAction !== null} onClick={() => void handleCheckSavedProvider(provider)} type="button">
                      {isProviderTesting ? <LoadingInline label={translate("ui.62ed32eb225c")} /> : translate("ui.d6d828dc8806")}
                    </button>
                    <button className="secondary-btn compact" disabled={storageAction !== null} onClick={() => openEditProvider(provider)} type="button">
                      {translate("ui.b8b151d41743")}</button>
                    <details className="model-card-more">
                      <summary aria-label={translate("ui.551a138fd76c", { p0: provider.name })} className="row-menu-trigger"><Icon name="dots" /></summary>
                      <div className="model-card-more-menu">
                        <button disabled={provider.isDefault || storageAction === "default"} onClick={() => void setDefaultProvider(provider.id)} type="button">
                          {storageAction === "default" ? <LoadingInline label={translate("ui.63354cdf0114")} /> : translate("ui.12606cfe703d")}
                        </button>
                        <button className="danger" disabled={storageAction === "delete"} onClick={() => setProviderDeleteRequest({ id: provider.id, name: provider.name })} type="button">
                          {storageAction === "delete" ? <LoadingInline label={translate("ui.987b4d34bbaf")} /> : translate("ui.be99b1361201")}
                        </button>
                      </div>
                    </details>
                  </div>
                  <div aria-live="polite" className={`model-card-operation ${isProviderTesting ? "visible" : ""}`}>
                    {isProviderTesting ? translate("ui.a4ef42e083b8") : "\u00A0"}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        {shouldShowConnectionNote ? <div className={connectionNoteClass}>{activeOperationMessage ? <LoadingInline label={activeOperationMessage} /> : localizeUiMessage(getInterfaceLanguage(), message)}</div> : null}
        </div>
      </section>
      <div id="semantic-search-settings">
        <SemanticSearchSettings onToast={onToast} />
      </div>
      {isProviderModalOpen && !providerDeleteRequest ? (
        <SettingsModalShell
          className="llm-provider-modal"
          description={privacyNotice === uiMessage(getInterfaceLanguage(), "localProviderPrivacy") ? translate("ui.ea9b94efa0a4") : privacyNotice}
          eyebrow={draftMode === "edit" ? translate("ui.c547312308d6") : translate("ui.9e2f48ac11ac")}
          footer={(
            <div className="settings-modal-footer-layout">
              <div className="settings-modal-footer-leading">
                {form.id ? (
                  <button className="danger-btn" disabled={storageAction === "delete"} onClick={handleDeleteProvider} type="button">
                    {storageAction === "delete" ? <LoadingInline label={translate("ui.987b4d34bbaf")} /> : translate("ui.46cb5952c6b3")}
                  </button>
                ) : null}
              </div>
              <div className="settings-modal-footer-actions">
                <button className="ghost-btn" disabled={storageAction !== null} onClick={handleCancelDraft} type="button">{translate("ui.8fbe9b75cbdf")}</button>
                <button className="secondary-btn" disabled={isTestingConnection} onClick={() => void handleTestConnection()} type="button">
                  {isTestingConnection ? <LoadingInline label={translate("ui.62ed32eb225c")} /> : translate("ui.d6d828dc8806")}
                </button>
                <button className="primary-btn" disabled={storageAction === "save"} onClick={() => void handleSave()} type="button">
                  {storageAction === "save" ? <LoadingInline label={translate("ui.bd97450c8556")} /> : draftMode === "edit" ? translate("ui.744cf2b21999") : translate("ui.1fc49b9d5038")}
                </button>
              </div>
            </div>
          )}
          onClose={closeProviderModal}
          size="wide"
          status={shouldShowConnectionNote ? <div className={connectionNoteClass}>{activeOperationMessage ? <LoadingInline label={activeOperationMessage} /> : localizeUiMessage(getInterfaceLanguage(), message)}</div> : null}
          title={modalTitle}
          titleId="llm-provider-modal-title"
        >
            <ProviderTypeSelector
              ariaLabel={translate("ui.48e1ed23281f")}
              initialFocusRef={modalInitialFocusRef}
              onChange={(providerType) => {
                const provider = getProviderPreset(providerType);
                applyPreset(provider);
                onToast(translate("ui.29d06b3ce4c4", { p0: provider.label }));
              }}
              options={providerPresets}
              value={form.providerType}
            />
            <div className="form-grid llm-provider-modal-form">
              <label className="field full">
                <span className="field-label">{translate("ui.8c96c91a7c22") + " "}<InfoHint text={translate("ui.ea22ec2b9cb0")} /></span>
                <input onChange={(event) => updateDraft({ name: event.currentTarget.value })} placeholder={translate("ui.e8934501fc37")} value={form.name} />
              </label>
              {showBaseUrlField ? (
                <label className="field full">
                  <span className="field-label">Base URL <InfoHint text={translate("ui.6d65e1dbbeca")} /></span>
                  <input onChange={(event) => updateDraft({ baseUrl: event.currentTarget.value })} placeholder={form.providerType === "ollama" ? "http://127.0.0.1:11434" : "https://…/v1"} value={form.baseUrl} />
                  <span className="field-help">
                    {form.providerType === "ollama"
                      ? translate("ui.1799ad123045")
                      : form.providerType === "lmstudio"
                        ? translate("ui.e1ca904a862b")
                        : translate("ui.77f0b06d1142")}
                  </span>
                </label>
              ) : null}
              {showApiKeyField ? (
                <label className="field full">
                  <span className="field-label">{uiMessage(getInterfaceLanguage(), "apiKeyLabel")} <InfoHint text={translate("ui.99564ced5a72")} /></span>
                  <div className="secret-wrap">
                    <input
                      autoComplete="off"
                      onChange={(event) => updateDraft({ apiKey: event.currentTarget.value })}
                      placeholder={hasSavedApiKey ? translate("ui.f7be614de448") : translate("ui.0d297d1988cc")}
                      type={showSecret ? "text" : "password"}
                      value={form.apiKey}
                    />
                    <button onClick={() => setShowSecret((current) => !current)} type="button">
                      {showSecret ? translate("ui.0a2a4b837761") : translate("ui.1e5bec3aab1c")}
                    </button>
                    <button disabled={!hasSavedApiKey || storageAction === "key"} onClick={() => void handleDeleteKey()} type="button">
                      {storageAction === "key" ? <LoadingInline label={translate("ui.044870c94eb5")} /> : translate("ui.43c89af66bce")}
                    </button>
                  </div>
                  <span className={`field-help key-state ${hasSavedApiKey ? "ok" : "warn"}`}>{keyLabel}{translate("ui.3373780883a6")}</span>
                </label>
              ) : null}
              <ModelDiscoveryField
                label={translate("ui.0b7e1c1fd95e")}
                manualPlaceholder={translate("ui.b794e5d9029e")}
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
                  <b>{translate("ui.6479b9c3faad")}</b>
                  <small>{translate("ui.082a0ee0cbd0")}</small>
                </span>
                <input checked={form.isDefault} onChange={(event) => updateDraft({ isDefault: event.currentTarget.checked })} type="checkbox" />
              </label>
            </div>
            <details className="advanced-settings">
              <summary>{translate("ui.e0e021a0411e")}</summary>
              <div className="form-grid advanced-grid llm-provider-modal-form">
                {!showBaseUrlField ? (
                  <label className="field full">
                    <span className="field-label">Base URL <InfoHint text={translate("ui.97a56b72893c")} /></span>
                    <input onChange={(event) => updateDraft({ baseUrl: event.currentTarget.value })} value={form.baseUrl} />
                    <span className="field-help">{uiMessage(getInterfaceLanguage(), "defaultEndpointHelp")}</span>
                  </label>
                ) : null}
                <label className="field">
                  <span className="field-label">{translate("ui.0aa98568e37c") + " "}<InfoHint text={translate("ui.63b0e2e185ae")} /></span>
                  <input max="600" min="5" onChange={(event) => updateDraft({ timeoutSec: event.currentTarget.value })} type="number" value={form.timeoutSec} />
                </label>
                <label className="field">
                  <span className="field-label">{translate("ui.5d96e2525119") + " "}<InfoHint text={translate("ui.e8bec986518f")} /></span>
                  <input min="1024" onChange={(event) => updateDraft({ contextSize: event.currentTarget.value })} step="1024" type="number" value={form.contextSize} />
                </label>
                <label className="field">
                  <span className="field-label">{translate("ui.8aa1d054af3f") + " "}<InfoHint text={translate("ui.2cb32055ae4d")} /></span>
                  <input max="2" min="0" onChange={(event) => updateDraft({ temperature: event.currentTarget.value })} step="0.1" type="number" value={form.temperature} />
                </label>
                <label className="field full">
                  <span className="field-label">{translate("ui.f0bedc374fcf") + " "}<InfoHint text={translate("ui.553f1c8ed039")} /></span>
                  <textarea onChange={(event) => updateDraft({ customHeadersJson: event.currentTarget.value })} placeholder='{"X-Organization":"example"}' rows={3} value={form.customHeadersJson} />
                  <span className="field-help">{uiMessage(getInterfaceLanguage(), "secretHeadersHelp")}</span>
                </label>
                <label className="field">
                  <span className="field-label">{translate("ui.fce2f8b5665b") + " "}<InfoHint text={translate("ui.b470098e65bc")} /></span>
                  <input onChange={(event) => updateDraft({ modelsEndpoint: event.currentTarget.value })} value={form.modelsEndpoint} />
                </label>
                <label className="field">
                  <span className="field-label">{translate("ui.adc8f764c722") + " "}<InfoHint text={translate("ui.9c0a4e9f0d29")} /></span>
                  <input onChange={(event) => updateDraft({ chatEndpoint: event.currentTarget.value })} value={form.chatEndpoint} />
                </label>
                <label className="field">
                  {translate("ui.45d6cf54d1fc")}<input onChange={(event) => updateDraft({ embeddingsEndpoint: event.currentTarget.value })} value={form.embeddingsEndpoint} />
                </label>
              </div>
            </details>
        </SettingsModalShell>
      ) : null}
      {providerDeleteRequest ? (
        <SettingsModalShell
          description={translate("ui.feb7654f9c00", { p0: providerDeleteRequest.name })}
          dismissOnBackdrop={false}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="ghost-btn" disabled={storageAction === "delete"} onClick={() => setProviderDeleteRequest(null)} type="button">{translate("ui.8fbe9b75cbdf")}</button>
              <button className="danger-btn" disabled={storageAction === "delete"} onClick={() => void deleteProvider(providerDeleteRequest.id)} type="button">
                {storageAction === "delete" ? <LoadingInline label={translate("ui.987b4d34bbaf")} /> : translate("ui.46cb5952c6b3")}
              </button>
            </div>
          )}
          onClose={() => setProviderDeleteRequest(null)}
          size="compact"
          title={translate("ui.6463a4301723")}
          titleId="llm-provider-delete-title"
        >
          <div className="settings-confirm-note">{uiMessage(getInterfaceLanguage(), "deletedKeyInfo")}</div>
        </SettingsModalShell>
      ) : null}
    </div>
  );
}

interface AppearanceSettingsProps {
  appZoomPercent: number;
  onApplyZoom?: (percent: number) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onToast: (message: string) => void;
  onZoomDecrease: () => void;
  onZoomIncrease: () => void;
  onZoomReset: () => void;
}

export function AppearanceSettings({ appZoomPercent, theme, onThemeChange, onToast, onApplyZoom }: AppearanceSettingsProps) {
  useInterfaceLanguage();
  const [draftZoom, setDraftZoom] = useState(appZoomPercent);
  useEffect(() => setDraftZoom(appZoomPercent), [appZoomPercent]);
  const options: Array<{ id: ThemeMode; label: string }> = [
    { id: "light", label: translate("ui.f0cd3a603372") },
    { id: "dark", label: translate("ui.1eecfcaa7bdb") },
    { id: "system", label: translate("ui.29e4a4bd7a17") },
  ];

  return (
    <div>
      <div className="settings-title">{translate("ui.c407960b916f")}</div>
      <div className="settings-subtitle">{translate("ui.ca5da33efa1a")}</div>
      <div className="settings-card">
        <div className="theme-options">
          {options.map((option) => (
            <button
              aria-pressed={theme === option.id}
              className={`theme-option ${theme === option.id ? "active" : ""}`}
              key={option.id}
              onClick={() => {
                onThemeChange(option.id);
                onToast(option.id === "dark" ? translate("ui.3d89357ed715") : option.id === "system" ? translate("ui.5697406a1712") : translate("ui.d99d8a179999"));
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
            <b>{translate("ui.be517dba6cd0")}</b>
          </div>
        </div>
        <div className="zoom-settings-row">
          <button className="zoom-step-btn" data-tooltip={translate("ui.47e0cda1709b")} disabled={draftZoom <= APP_ZOOM_MIN} onClick={() => setDraftZoom((value) => getNextAppZoom(value, "decrease"))} type="button">
            <Icon name="minus" />
          </button>
          <button className="zoom-reset-btn" data-tooltip={translate("ui.b40f0749a663")} onClick={() => setDraftZoom(getNextAppZoom(draftZoom, "reset"))} type="button">
            {draftZoom}%
          </button>
          <button className="zoom-step-btn" data-tooltip={translate("ui.08235006182d")} disabled={draftZoom >= APP_ZOOM_MAX} onClick={() => setDraftZoom((value) => getNextAppZoom(value, "increase"))} type="button">
            <Icon name="plus" />
          </button>
          <button className="primary-btn compact" disabled={draftZoom === appZoomPercent || !onApplyZoom} onClick={() => onApplyZoom?.(draftZoom)} type="button">{translate("ui.e15f960d93eb")}</button>
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
  onDeleteAllNotes: () => Promise<dataService.DeleteAllNotesResult>;
  onToast: (message: string) => void;
}

const knowledgeStatusLabels: Record<KnowledgeIndexStatusCode, string> = {
  get current() { return translate("ui.f161093e0e41"); },
  get failed() { return translate("ui.34dc848e1848"); },
  get needs_update() { return translate("ui.b4cc048b12d7"); },
  get pending() { return translate("ui.6fa6aaf4897b"); },
};

export function getKnowledgeStatusLabel(status: KnowledgeIndexStatusCode) {
  return knowledgeStatusLabels[status];
}

export function formatKnowledgeCheckedAt(value?: string | null, now = new Date()) {
  if (!value) {
    return translate("ui.7f6f82b6ee5d");
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return translate("ui.0deee1b2df75");
  }
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return isToday ? translate("ui.0d21785a18ed", { p0: formatDisplayTime(date) }) : formatDisplayDateTime(date);
}

function DataSettings({ onBackupCreate, onBackupPreview, onImportBackup, onDeleteAllNotes, onToast }: DataSettingsProps) {
  useInterfaceLanguage();
  const importInputRef = useRef<HTMLInputElement>(null);
  const importRequestIdRef = useRef(0);
  const knowledgeMoreRef = useRef<HTMLDetailsElement>(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeIndexStatus | null>(null);
  const [knowledgeOperation, setKnowledgeOperation] = useState<KnowledgeIndexOperation | null>(null);
  const [knowledgeMessage, setKnowledgeMessage] = useState(translate("ui.e774b94c6323"));
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
      onToast(translate("ui.c48a81becc83"));
    } catch {
      setBackupExportState("error");
      onToast(translate("ui.91774126930e"));
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
      const appliedButNotReloaded = wasBackupRestoreApplied(error);
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
          setKnowledgeMessage(translate("ui.0837825fdbfd"));
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
    setKnowledgeMessage(operation === "rebuild" ? translate("ui.3d19942efa9b") : translate("ui.69c879d21eee"));
    try {
      const result = await knowledgeService.runKnowledgeIndexOperation(operation);
      const status = await knowledgeService.getKnowledgeIndexStatus();
      setKnowledgeStatus(status);
      const message =
        result.errors > 0
          ? translate("ui.c2ab74da81fb")
          : operation === "rebuild"
            ? translate("ui.4bf4ad5d9ecd", { p0: result.processedNotes, p1: result.createdChunks, p2: (result.durationMs / 1000).toFixed(1) })
            : result.processedNotes === 0
              ? translate("ui.ec271fe4e5c1")
              : translate("ui.d16e3995f2ff", { p0: result.processedNotes, p1: result.createdChunks });
      setKnowledgeMessage(message);
      setKnowledgeHasError(result.errors > 0);
      onToast(message);
    } catch {
      setKnowledgeMessage(translate("ui.70af1f098abb"));
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
      <div className="settings-title">{translate("ui.6c32ef0d0712")}</div>
      <div className="settings-subtitle">{translate("ui.cf5cf7e8cc84")}</div>
      <div className="settings-card knowledge-index-card">
        <div className="settings-section-head knowledge-index-head">
          <div>
            <b>{translate("ui.0e708d91b542") + " "}<InfoHint text={translate("ui.86871f98874d")} /></b>
            <span>{translate("ui.e3e26fcf82e9")}</span>
          </div>
          <span className={`status-pill ${visibleKnowledgeStatus === "current" ? "ok" : visibleKnowledgeStatus === "failed" ? "error" : ""}`}>
            {knowledgeOperation ? <span aria-hidden="true" className="button-spinner" /> : null}
            {getKnowledgeStatusLabel(visibleKnowledgeStatus)}
          </span>
        </div>
        <div className="knowledge-index-metrics">
          <div><span>{translate("ui.04a18b51cdc2")}</span><b>{knowledgeStatus?.indexedNotes ?? 0} {" " + translate("ui.7f4adf318ef3") + " "}{knowledgeStatus?.totalNotes ?? 0}</b></div>
          <div><span>{translate("ui.7740a339bb23") + " "}<InfoHint text={translate("ui.2be259278cb2")} /></span><b>{knowledgeStatus?.chunkCount ?? 0}</b></div>
          <div><span>{translate("ui.9be8166876fa")}</span><b>{formatKnowledgeCheckedAt(knowledgeStatus?.lastCheckedAt)}</b></div>
        </div>
        <div aria-live="polite" className={`knowledge-index-message ${knowledgeHasError || visibleKnowledgeStatus === "failed" ? "error" : ""}`}>
          {knowledgeMessage || translate("ui.8f310ac36e2e")}
        </div>
        <div className="knowledge-index-actions">
          <details className="knowledge-index-more" ref={knowledgeMoreRef}>
            <summary>{translate("ui.3e016b2f8764")}</summary>
            <div className="knowledge-repair-action">
              <b>{translate("ui.f33d9e4ff8c3") + " "}<InfoHint text={translate("ui.4f2aedbda5ee")} /></b>
              <span>{translate("ui.7f760981901a")}</span>
              <button
                className="export-action secondary"
                disabled={knowledgeOperation !== null}
                onClick={() => setIsRebuildConfirmationOpen(true)}
                type="button"
              >
                {translate("ui.275baebeba46")}</button>
            </div>
          </details>
        </div>
      </div>
      <div className="settings-card export-card">
        <div className="export-action-group">
          <div className="export-action-head">
            <b>{translate("ui.9eb508eda2fc") + " "}<InfoHint text={translate("ui.f601bae90b23")} /></b>
            <span>{translate("ui.7b8fbb035299")}</span>
          </div>
          <div className="export-action-list">
            <button className="export-action primary" disabled={backupExportState === "creating"} onClick={() => void createExternalBackup()} type="button">
              {backupExportState === "creating" ? <span aria-hidden="true" className="button-spinner" /> : <Icon name="archive" />}
              {backupExportState === "creating" ? translate("ui.c0ee8274f4aa") : translate("ui.3470dda3c733")}
            </button>
          </div>
          {backupExportState === "success" && backupExportResult ? (
            <div aria-live="polite" className="backup-export-status">
              <span>{translate("ui.e75dac20814d") + " "}{backupExportResult.path}</span>
              <button className="export-action secondary" onClick={() => void dataService.revealExportedItem(backupExportResult.path).catch(() => onToast(translate("ui.7918fe1f67bc")))} type="button">{translate("ui.36f0db3dc1f9")}</button>
            </div>
          ) : null}
          {backupExportState === "error" ? <p className="backup-export-error" role="alert">{translate("ui.fcb2802c9d53")}</p> : null}
        </div>
        <div className="export-action-group recovery">
          <div className="export-action-head">
            <b>{translate("ui.8cba0e421a68") + " "}<InfoHint text={translate("ui.46206bedc908")} /></b>
            <span>{translate("ui.212d147a222b")}</span>
          </div>
          <button
            className="export-action secondary"
            disabled={importState.phase === "previewing" || importState.phase === "restoring"}
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            {importState.phase === "previewing" ? <span aria-hidden="true" className="button-spinner" /> : <Icon name="attach" />}
            {importState.phase === "previewing" ? translate("ui.f937d971148d") : translate("ui.98ae9a5c79b9")}
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
      <DeleteAllNotesControl
        disabled={backupExportState === "creating" || importState.phase !== "closed" || knowledgeOperation !== null}
        onDelete={onDeleteAllNotes}
        onToast={onToast}
      />
      {importState.phase !== "closed" ? (
        <SettingsModalShell
          className="backup-import-modal"
          closeDisabled={importState.phase === "restoring"}
          description={importState.phase === "success" || importState.phase === "applied"
            ? translate("ui.1d43b5e8b51f")
            : translate("ui.430e28240206")}
          dismissOnBackdrop={false}
          footer={(
            <div className="settings-modal-footer-layout">
              <div className="settings-modal-footer-leading" />
              <div className="settings-modal-footer-actions">
                {importState.phase === "success" || importState.phase === "applied" ? (
                  <button className="primary-btn" onClick={closeBackupImport} type="button">{translate("ui.a7a4033657e8")}</button>
                ) : (
                  <>
                    <button className="secondary-btn" disabled={importState.phase === "restoring"} onClick={closeBackupImport} type="button">{translate("ui.8fbe9b75cbdf")}</button>
                    {importState.preview ? (
                      <button
                        className="primary-btn"
                        disabled={importState.phase === "restoring" || importState.phase === "previewing"}
                        onClick={() => void restoreSelectedBackup()}
                        type="button"
                      >
                        {importState.phase === "restoring" ? <span aria-hidden="true" className="button-spinner" /> : null}
                        {importState.phase === "restoring" ? translate("ui.61e4c28148ff") : importState.phase === "error" ? translate("ui.89dbfb95162f") : translate("ui.76f55a988f8a")}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}
          onClose={closeBackupImport}
          size="compact"
          title={importState.phase === "success" || importState.phase === "applied" ? translate("ui.05d9a7026a3c") : translate("ui.53fe536b4f9b")}
          titleId="backup-import-title"
        >
          {importState.phase === "previewing" ? (
            <div aria-live="polite" className="backup-import-loading">
              <span aria-hidden="true" className="button-spinner" />
              <span>{translate("ui.007bde39e781")}</span>
            </div>
          ) : null}
          {importState.preview && importState.phase !== "success" && importState.phase !== "applied" ? (
            <div className="backup-import-preview">
              <div className="backup-import-meta">
                <b>{translate("ui.c12cce23cc10") + " "}{formatBackupDate(importState.preview.exportedAt)}</b>
                <span>{importState.preview.appVersion ? translate("ui.a06b8c215702", { p0: importState.preview.appVersion }) : translate("ui.9cf00b5e6f90", { p0: importState.preview.formatVersion })}</span>
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
                  {translate("ui.38b99fcacab2")}{importState.preview.missingAttachmentFiles}.
                </div>
              ) : null}
              <div className="backup-import-notice danger">
                {translate("ui.fdc7f5693f30")}</div>
            </div>
          ) : null}
          {importState.phase === "restoring" ? (
            <div aria-live="polite" className="backup-import-loading">
              <span aria-hidden="true" className="button-spinner" />
              <span>{translate("ui.a601db1372ff")}</span>
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
                  ? translate("ui.ac55946f40b3")
                  : translate("ui.55e76aca03e4")}
              </div>
            </div>
          ) : null}
        </SettingsModalShell>
      ) : null}
      {isRebuildConfirmationOpen ? (
        <SettingsModalShell
          description={translate("ui.f61a7ff1e912")}
          dismissOnBackdrop={false}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="secondary-btn" onClick={() => setIsRebuildConfirmationOpen(false)} type="button">{translate("ui.8fbe9b75cbdf")}</button>
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
                {translate("ui.669f46232d41")}</button>
            </div>
          )}
          onClose={() => setIsRebuildConfirmationOpen(false)}
          size="compact"
          title={translate("ui.7eb178875491")}
          titleId="knowledge-rebuild-title"
        >
          <div className="settings-confirm-note">{translate("ui.86537d2db4b4")}</div>
        </SettingsModalShell>
      ) : null}
    </div>
  );
}

function ShortcutsSettings() {
  useInterfaceLanguage();
  return (
    <div>
      <div className="settings-title">{translate("ui.13b0a5cc9afc")}</div>
      <div className="settings-subtitle">{translate("ui.47b253e71085")}</div>
      <ShortcutGroup label={translate("ui.e638fc3afbee")} shortcuts={APP_SHORTCUTS} />
      <ShortcutGroup label={translate("ui.119d528f623e")} shortcuts={EDITOR_SHORTCUTS} />
    </div>
  );
}

function ShortcutGroup({ label, shortcuts }: { label: string; shortcuts: readonly ShortcutReference[] }) {
  useInterfaceLanguage();
  return (
    <section className="settings-preference-group shortcuts-group" aria-label={label}>
      <div className="settings-preference-label">{label}</div>
      <div className="shortcut-list">
        {shortcuts.map((shortcut) => (
          <div className="shortcut-row" key={shortcut.id}>
            <span>{shortcut.label}</span>
            <span className="shortcut-keys" aria-label={shortcut.keys.join(translate("ui.b21dc376bc9b"))}>
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
  useInterfaceLanguage();
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
      <div className="settings-title">{translate("ui.eca626bab07b")}</div>
      <div className="settings-subtitle">{translate("ui.4dee7bd999d8")}</div>
      <div className="settings-card about-card">
        <span className="about-mark"><Icon name="logo" /></span>
        <span>
          <b>NoteFlow</b>
          <small aria-live="polite">{version === null ? translate("ui.9a1dab606e38") : version ? translate("ui.b75044b0b24d", { p0: version }) : translate("ui.4715357cba83")}</small>
        </span>
      </div>
    </div>
  );
}
