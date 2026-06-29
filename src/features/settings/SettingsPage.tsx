import { useEffect, useMemo, useRef, useState } from "react";
import type { AppLanguage, AppSection, SettingsPanel, ThemeMode } from "../../app/types";
import { PageShell } from "../navigation/PageShell";
import { APP_ZOOM_MAX, APP_ZOOM_MIN } from "../../shared/appZoom";
import * as llmProviderService from "../../services/llmProviderService";
import type { LlmProvider, LlmProviderType } from "../../services/llmProviderService";

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
    label: "OpenAI-совместимый",
    detail: "Облачный или свой сервер",
    icon: "◎",
    url: "https://api.example.com/v1",
    model: "model-name",
    modelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    embeddingsEndpoint: "/embeddings",
  },
  {
    id: "ollama",
    label: "Ollama",
    detail: "Локально на компьютере",
    icon: "◉",
    url: "http://localhost:11434",
    model: "qwen3:8b",
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
    label: "Свой API",
    detail: "Настраиваемые заголовки",
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
type NetworkAction = "models" | "test" | null;
type MessageTone = "neutral" | "error";

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
    return "Подключено";
  }
  if (status === "error") {
    return "Ошибка подключения";
  }
  return "Не настроено";
}

function sortProviders(providers: LlmProvider[]) {
  return [...providers].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name, "ru"));
}

function formSignature(form: ProviderFormState) {
  return JSON.stringify(form);
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
  const [form, setForm] = useState<ProviderFormState>(() => createProviderForm());
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [storageAction, setStorageAction] = useState<StorageAction>(null);
  const [networkAction, setNetworkAction] = useState<NetworkAction>(null);
  const [message, setMessage] = useState("Подключения пока не проверялись.");
  const [messageTone, setMessageTone] = useState<MessageTone>("neutral");
  const [showSecret, setShowSecret] = useState(false);
  const latestNetworkRequestIdRef = useRef(0);
  const currentFormRef = useRef(form);
  const isMountedRef = useRef(true);

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === selectedProviderId), [providers, selectedProviderId]);
  const activePreset = getProviderPreset(form.providerType);
  const isTestingConnection = networkAction === "test";
  const isLoadingModels = networkAction === "models";
  const statusClass = selectedProvider?.lastStatus === "success" ? "ok" : selectedProvider?.lastStatus === "error" ? "error" : "";
  const keyLabel = selectedProvider?.hasApiKey ? "Ключ сохранён" : "Ключ не задан";
  const privacyNotice = selectedProvider?.privacyNotice ?? (isLocalEndpoint(form.baseUrl) ? "Локальный endpoint: данные остаются на устройстве, если сервер действительно запущен локально." : "Внешний endpoint: при использовании модели выбранный контекст будет отправлен провайдеру.");
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

  useEffect(() => {
    currentFormRef.current = form;
  }, [form]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      latestNetworkRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProviders() {
      setIsLoadingProviders(true);
      try {
        const loadedProviders = sortProviders(await llmProviderService.listLlmProviders());
        if (cancelled) {
          return;
        }
        setProviders(loadedProviders);
        if (loadedProviders[0]) {
          setSelectedProviderId(loadedProviders[0].id);
          replaceForm(formFromProvider(loadedProviders[0]));
          updateMessage(loadedProviders[0].statusMessage ?? "Подключение загружено из локальной базы.");
        }
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

  function replaceForm(nextForm: ProviderFormState) {
    currentFormRef.current = nextForm;
    setForm(nextForm);
  }

  function mergeProviderInState(provider: LlmProvider) {
    setProviders((currentProviders) => {
      const nextProviders = currentProviders.some((item) => item.id === provider.id)
        ? currentProviders.map((item) => (item.id === provider.id ? provider : provider.isDefault ? { ...item, isDefault: false } : item))
        : [...currentProviders.map((item) => (provider.isDefault ? { ...item, isDefault: false } : item)), provider];
      return sortProviders(nextProviders);
    });
  }

  function updateProviderInState(provider: LlmProvider) {
    mergeProviderInState(provider);
    setSelectedProviderId(provider.id);
    replaceForm(formFromProvider(provider));
  }

  async function refreshProviders(preferredId: string, requestId?: number, signature?: string) {
    const loadedProviders = sortProviders(await llmProviderService.listLlmProviders());
    if (requestId !== undefined && signature !== undefined && !isNetworkResultCurrent(requestId, signature)) {
      return;
    }
    setProviders(loadedProviders);
    const selected = loadedProviders.find((provider) => provider.id === preferredId) ?? loadedProviders[0];
    if (selected) {
      setSelectedProviderId(selected.id);
      replaceForm(formFromProvider(selected));
    }
  }

  function isNetworkResultCurrent(requestId: number, signature: string) {
    return isMountedRef.current && latestNetworkRequestIdRef.current === requestId && formSignature(currentFormRef.current) === signature;
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
    updateProviderInState(savedProvider);
    setShowSecret(false);
    return savedProvider;
  }

  async function handleSave() {
    setStorageAction("save");
    try {
      const savedProvider = await saveCurrentProvider();
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
    const signature = formSignature(snapshot);
    const requestId = latestNetworkRequestIdRef.current + 1;
    latestNetworkRequestIdRef.current = requestId;
    setNetworkAction("models");
    updateMessage("Загружаем модели…");
    try {
      const savedProvider = await persistProvider(snapshot);
      mergeProviderInState(savedProvider);
      const result = await llmProviderService.listLlmModels(savedProvider.id);
      if (!isNetworkResultCurrent(requestId, signature)) {
        return;
      }
      setSelectedProviderId(savedProvider.id);
      const nextForm = result.status === "success" && result.models.length > 0 && !savedProvider.chatModel ? { ...formFromProvider(savedProvider), chatModel: result.models[0] ?? "" } : formFromProvider(savedProvider);
      replaceForm(nextForm);
      setModelOptions(result.models);
      updateMessage(result.message, result.status === "error" ? "error" : "neutral");
      onToast(result.message);
    } catch (error) {
      if (isNetworkResultCurrent(requestId, signature)) {
        const text = error instanceof Error ? error.message : "Не удалось получить список моделей";
        updateMessage(text, "error");
        onToast(text);
      }
    } finally {
      if (isMountedRef.current && latestNetworkRequestIdRef.current === requestId) {
        setNetworkAction(null);
      }
    }
  }

  async function handleTestConnection() {
    const snapshot = currentFormRef.current;
    const signature = formSignature(snapshot);
    const requestId = latestNetworkRequestIdRef.current + 1;
    latestNetworkRequestIdRef.current = requestId;
    setNetworkAction("test");
    updateMessage("Проверяем подключение…");
    try {
      const savedProvider = await persistProvider(snapshot);
      mergeProviderInState(savedProvider);
      const result = await llmProviderService.testLlmProvider(savedProvider.id);
      if (!isNetworkResultCurrent(requestId, signature)) {
        return;
      }
      setModelOptions(result.models);
      updateMessage(result.message, result.status === "error" ? "error" : "neutral");
      await refreshProviders(savedProvider.id, requestId, signature);
      onToast(result.message);
    } catch (error) {
      if (isNetworkResultCurrent(requestId, signature)) {
        const text = error instanceof Error ? error.message : "Не удалось проверить подключение";
        updateMessage(text, "error");
        onToast(text);
      }
    } finally {
      if (isMountedRef.current && latestNetworkRequestIdRef.current === requestId) {
        setNetworkAction(null);
      }
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

  async function handleDeleteProvider() {
    if (!form.id) {
      return;
    }
    setStorageAction("delete");
    try {
      await llmProviderService.deleteLlmProvider(form.id);
      const nextProviders = providers.filter((provider) => provider.id !== form.id);
      setProviders(nextProviders);
      const nextSelected = nextProviders[0];
      if (nextSelected) {
        setSelectedProviderId(nextSelected.id);
        replaceForm(formFromProvider(nextSelected));
      } else {
        setSelectedProviderId(undefined);
        replaceForm(createProviderForm());
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

  async function handleSetDefault() {
    if (!form.id) {
      return;
    }
    setStorageAction("default");
    try {
      const updatedProvider = await llmProviderService.setDefaultLlmProvider(form.id);
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
    latestNetworkRequestIdRef.current += 1;
    setSelectedProviderId(undefined);
    setModelOptions([]);
    setShowSecret(false);
    replaceForm({
      ...createProviderForm(preset),
      name: form.id ? createProviderForm(preset).name : form.name || createProviderForm(preset).name,
      isDefault: providers.length === 0,
    });
    updateMessage("Заполните параметры и сохраните подключение.");
  }

  return (
    <div>
      <div className="settings-title">Модели ИИ</div>
      <div className="settings-subtitle">Подключите локальную или публичную модель. NoteFlow поддерживает OpenAI-совместимые API, Ollama, LM Studio и пользовательские HTTP-endpoint.</div>
      <div className="settings-card llm-provider-list-card">
        <div className="settings-section-head">
          <div>
            <b>Подключения</b>
            <div className="field-help">Метаданные хранятся в SQLite, API key — только в защищённом хранилище ОС.</div>
          </div>
          <button className="secondary-btn compact" disabled={isLoadingProviders || storageAction !== null} onClick={() => applyPreset(providerPresets[0])} type="button">
            Новое подключение
          </button>
        </div>
        <div className="llm-provider-list">
          {providers.length === 0 ? <div className="llm-empty-state">Подключений пока нет. Выберите тип провайдера и сохраните первое подключение.</div> : null}
          {providers.map((provider) => (
            <button
              className={`llm-provider-row ${selectedProviderId === provider.id ? "active" : ""}`}
              key={provider.id}
              onClick={() => {
                latestNetworkRequestIdRef.current += 1;
                setSelectedProviderId(provider.id);
                replaceForm(formFromProvider(provider));
                setModelOptions([]);
                setShowSecret(false);
                updateMessage(provider.statusMessage ?? "Подключение выбрано.", provider.lastStatus === "error" ? "error" : "neutral");
              }}
              type="button"
            >
              <span className="provider-icon">{getProviderPreset(provider.providerType).icon}</span>
              <span>
                <b>{provider.name}</b>
                <small>{getProviderPreset(provider.providerType).label} · {provider.chatModel || "модель не выбрана"}</small>
              </span>
              {provider.isDefault ? <span className="llm-default-badge">По умолчанию</span> : null}
              <span className={`status-pill ${provider.lastStatus === "success" ? "ok" : provider.lastStatus === "error" ? "error" : ""}`}>{statusLabel(provider.lastStatus)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-card provider-card">
        <div className="settings-section-head">
          <div>
            <b>Подключение к LLM</b>
            <div className="field-help">{privacyNotice}</div>
          </div>
          <span className={`status-pill ${statusClass}`}>{selectedProvider ? statusLabel(selectedProvider.lastStatus) : "Новое подключение"}</span>
        </div>
        <div className="provider-presets">
          {providerPresets.map((provider) => (
            <button
              className={`provider-preset ${activePreset.id === provider.id ? "active" : ""}`}
              key={provider.id}
              onClick={() => {
                applyPreset(provider);
                onToast(`Выбран провайдер: ${provider.label}`);
              }}
              type="button"
            >
              <span className="provider-icon">{provider.icon}</span>
              <b>{provider.label}</b>
              <small>{provider.detail}</small>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="field full">
            Название подключения
            <input onChange={(event) => replaceForm({ ...currentFormRef.current, name: event.currentTarget.value })} placeholder="Например, Рабочий сервер" value={form.name} />
          </label>
          <label className="field full">
            Base URL
            <input onChange={(event) => replaceForm({ ...currentFormRef.current, baseUrl: event.currentTarget.value })} placeholder="https://…/v1" value={form.baseUrl} />
            <span className="field-help">Для локальных моделей обычно используется localhost. Для OpenAI-совместимых сервисов укажите корневой URL API.</span>
          </label>
          <label className="field full">
            API key
            <div className="secret-wrap">
              <input
                autoComplete="off"
                onChange={(event) => replaceForm({ ...currentFormRef.current, apiKey: event.currentTarget.value })}
                placeholder={selectedProvider?.hasApiKey ? "Введите новый ключ, чтобы заменить сохранённый" : "Введите ключ, если он требуется"}
                type={showSecret ? "text" : "password"}
                value={form.apiKey}
              />
              <button onClick={() => setShowSecret((current) => !current)} type="button">
                {showSecret ? "Скрыть" : "Показать"}
              </button>
              <button disabled={!selectedProvider?.hasApiKey || storageAction === "key"} onClick={() => void handleDeleteKey()} type="button">
                {storageAction === "key" ? <LoadingInline label="Удаляем…" /> : "Удалить ключ"}
              </button>
            </div>
            <span className={`field-help key-state ${selectedProvider?.hasApiKey ? "ok" : "warn"}`}>{keyLabel}. Реальный ключ не возвращается в форму после сохранения.</span>
          </label>
          <label className="field">
            Модель чата
            <div className="input-action">
              <input list="llm-chat-model-options" onChange={(event) => replaceForm({ ...currentFormRef.current, chatModel: event.currentTarget.value })} placeholder="Введите ID модели" value={form.chatModel} />
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
          <label className="field">
            Embedding-модель
            <input list="llm-chat-model-options" onChange={(event) => replaceForm({ ...currentFormRef.current, embeddingModel: event.currentTarget.value })} placeholder="Необязательно, для RAG" value={form.embeddingModel} />
          </label>
          <label className="field">
            Тайм-аут, сек.
            <input max="600" min="5" onChange={(event) => replaceForm({ ...currentFormRef.current, timeoutSec: event.currentTarget.value })} type="number" value={form.timeoutSec} />
          </label>
          <label className="field">
            Контекст, токенов
            <input min="1024" onChange={(event) => replaceForm({ ...currentFormRef.current, contextSize: event.currentTarget.value })} step="1024" type="number" value={form.contextSize} />
          </label>
          <label className="field">
            Температура
            <input max="2" min="0" onChange={(event) => replaceForm({ ...currentFormRef.current, temperature: event.currentTarget.value })} step="0.1" type="number" value={form.temperature} />
          </label>
          <label className="field switch-field">
            <span>
              <b>Потоковая выдача</b>
              <small>Показывать ответ по мере генерации</small>
            </span>
            <input checked={form.streamingEnabled} onChange={(event) => replaceForm({ ...currentFormRef.current, streamingEnabled: event.currentTarget.checked })} type="checkbox" />
          </label>
          <label className="field switch-field">
            <span>
              <b>Основное подключение</b>
              <small>Использовать по умолчанию для будущих AI-функций</small>
            </span>
            <input checked={form.isDefault} onChange={(event) => replaceForm({ ...currentFormRef.current, isDefault: event.currentTarget.checked })} type="checkbox" />
          </label>
        </div>
        <details className="advanced-settings">
          <summary>Дополнительные параметры</summary>
          <div className="form-grid advanced-grid">
            <label className="field full">
              Дополнительные HTTP-заголовки
              <textarea onChange={(event) => replaceForm({ ...currentFormRef.current, customHeadersJson: event.currentTarget.value })} placeholder='{"X-Organization":"example"}' rows={3} value={form.customHeadersJson} />
              <span className="field-help">Секретные заголовки вроде Authorization или X-API-Key на этом этапе запрещены. Используйте поле API key.</span>
            </label>
            <label className="field">
              Путь списка моделей
              <input onChange={(event) => replaceForm({ ...currentFormRef.current, modelsEndpoint: event.currentTarget.value })} value={form.modelsEndpoint} />
            </label>
            <label className="field">
              Путь чата
              <input onChange={(event) => replaceForm({ ...currentFormRef.current, chatEndpoint: event.currentTarget.value })} value={form.chatEndpoint} />
            </label>
            <label className="field">
              Путь embeddings
              <input onChange={(event) => replaceForm({ ...currentFormRef.current, embeddingsEndpoint: event.currentTarget.value })} value={form.embeddingsEndpoint} />
            </label>
          </div>
        </details>
        <div className="llm-action-bar">
          <div className="llm-danger-actions">
            <button className="danger-btn" disabled={!form.id || storageAction === "delete"} onClick={() => void handleDeleteProvider()} type="button">
              {storageAction === "delete" ? <LoadingInline label="Удаление…" /> : "Удалить подключение"}
            </button>
          </div>
          <div className="llm-main-actions">
            <button className="secondary-btn" disabled={!form.id || storageAction === "default"} onClick={() => void handleSetDefault()} type="button">
              {storageAction === "default" ? <LoadingInline label="Назначение…" /> : "Сделать основным"}
            </button>
            <button className="secondary-btn" disabled={isTestingConnection} onClick={() => void handleTestConnection()} type="button">
              {isTestingConnection ? <LoadingInline label="Проверяем…" /> : "Проверить подключение"}
            </button>
            <button className="primary-btn" disabled={storageAction === "save"} onClick={() => void handleSave()} type="button">
              {storageAction === "save" ? <LoadingInline label="Сохранение…" /> : "Сохранить подключение"}
            </button>
          </div>
        </div>
        <div className={connectionNoteClass}>{activeOperationMessage ? <LoadingInline label={activeOperationMessage} /> : message}</div>
      </div>
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
