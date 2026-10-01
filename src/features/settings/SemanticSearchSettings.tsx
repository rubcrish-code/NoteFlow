import { useEffect, useRef, useState } from "react";
import * as embeddingService from "../../services/embeddingService";
import type {
  EmbeddingIndexStatus,
  EmbeddingIndexUpdateResult,
  EmbeddingLocality,
  EmbeddingProfile,
  EmbeddingProviderType,
  SaveEmbeddingProfileInput,
} from "../../services/embeddingService";
import { Icon } from "../../shared/Icon";
import { formatDisplayDateTime } from "../../shared/displayDate";
import {
  ModelDiscoveryField,
  ModelStatusBadge,
  ProviderTypeSelector,
  SettingsModalShell,
  SettingsSectionHeader,
} from "./ModelSettingsUi";
import type { ModelDiscoveryOption, ModelDiscoveryState } from "./ModelSettingsUi";

interface SemanticSearchSettingsProps {
  onToast: (message: string) => void;
}

interface ProfileForm {
  id?: string;
  name: string;
  providerType: EmbeddingProviderType;
  baseUrl: string;
  embeddingsEndpoint: string;
  model: string;
  batchSize: string;
  timeoutSeconds: string;
  locality: EmbeddingLocality;
  apiKey: string;
  deleteApiKey: boolean;
  enabled: boolean;
}

type IndexOperation = "update" | "rebuild";
type Confirmation = { type: "delete"; profile: EmbeddingProfile } | { type: "rebuild"; profile: EmbeddingProfile } | null;

const presets: Record<EmbeddingProviderType, Omit<ProfileForm, "id" | "apiKey" | "deleteApiKey" | "enabled">> = {
  ollama: {
    name: "Ollama локально",
    providerType: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    embeddingsEndpoint: "/api/embed",
    model: "nomic-embed-text",
    batchSize: "16",
    timeoutSeconds: "30",
    locality: "local",
  },
  openai: {
    name: "OpenAI смысловой поиск (RAG)",
    providerType: "openai",
    baseUrl: "https://api.openai.com/v1",
    embeddingsEndpoint: "/embeddings",
    model: "text-embedding-3-small",
    batchSize: "64",
    timeoutSeconds: "30",
    locality: "cloud",
  },
  custom: {
    name: "Своя модель смыслового поиска (RAG)",
    providerType: "custom",
    baseUrl: "http://localhost:8000/v1",
    embeddingsEndpoint: "/embeddings",
    model: "embedding-model",
    batchSize: "16",
    timeoutSeconds: "30",
    locality: "local",
  },
};

const semanticProviderOptions = [
  { id: "ollama", label: "Ollama", detail: "Локально на компьютере", icon: <Icon aria-hidden="true" name="gear" /> },
  { id: "openai", label: "OpenAI-compatible", detail: "Совместимый облачный API", icon: <Icon aria-hidden="true" name="search" /> },
  { id: "custom", label: "Свой API", detail: "Локальный или внешний endpoint", icon: <Icon aria-hidden="true" name="code" /> },
] as const;

function emptyForm(providerType: EmbeddingProviderType = "ollama"): ProfileForm {
  return { ...presets[providerType], apiKey: "", deleteApiKey: false, enabled: true };
}

function profileForm(profile: EmbeddingProfile): ProfileForm {
  return {
    id: profile.id,
    name: profile.name,
    providerType: profile.providerType,
    baseUrl: profile.baseUrl,
    embeddingsEndpoint: profile.embeddingsEndpoint,
    model: profile.model,
    batchSize: String(profile.batchSize),
    timeoutSeconds: String(profile.timeoutSeconds),
    locality: profile.locality,
    apiKey: "",
    deleteApiKey: false,
    enabled: profile.enabled,
  };
}

export function SemanticSearchSettings({ onToast }: SemanticSearchSettingsProps) {
  const [profiles, setProfiles] = useState<EmbeddingProfile[]>([]);
  const [statuses, setStatuses] = useState<Record<string, EmbeddingIndexStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelDiscoveryOption[]>([]);
  const [modelDiscoveryState, setModelDiscoveryState] = useState<ModelDiscoveryState>("idle");
  const [modelDiscoveryMessage, setModelDiscoveryMessage] = useState("");
  const [indexOperation, setIndexOperation] = useState<{ profileId: string; type: IndexOperation } | null>(null);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [consentRequest, setConsentRequest] = useState<{ profile: EmbeddingProfile; operation: IndexOperation } | null>(null);
  const testOperationIdRef = useRef(0);
  const indexOperationIdRef = useRef(0);
  const modelListOperationIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void embeddingService.listEmbeddingProfiles().then(
      async (loadedProfiles) => {
        if (cancelled) return;
        setProfiles(loadedProfiles);
        const nextStatuses: Record<string, EmbeddingIndexStatus> = {};
        await Promise.all(
          loadedProfiles.map(async (profile) => {
            try {
              nextStatuses[profile.id] = await embeddingService.getEmbeddingIndexStatus(profile.id);
            } catch {
              // A profile remains editable even when its derived index is unavailable.
            }
          }),
        );
        if (!cancelled) setStatuses(nextStatuses);
      },
      () => {
        if (!cancelled) showMessage("Не удалось загрузить настройки смыслового поиска (RAG)", true);
      },
    ).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
      testOperationIdRef.current += 1;
      indexOperationIdRef.current += 1;
      modelListOperationIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!indexOperation) return;
    const intervalId = window.setInterval(() => {
      void refreshStatus(indexOperation.profileId);
    }, 700);
    return () => window.clearInterval(intervalId);
  }, [indexOperation]);

  function showMessage(text: string, error = false) {
    setMessage(text);
    setMessageError(error);
  }

  async function refreshProfiles() {
    const loadedProfiles = await embeddingService.listEmbeddingProfiles();
    setProfiles(loadedProfiles);
    return loadedProfiles;
  }

  async function refreshStatus(profileId: string) {
    try {
      const status = await embeddingService.getEmbeddingIndexStatus(profileId);
      setStatuses((current) => ({ ...current, [profileId]: status }));
    } catch {
      // Polling errors are surfaced by the owning operation instead of flashing the whole page.
    }
  }

  function openNewProfile() {
    setForm(emptyForm());
    setModelOptions([]);
    setModelDiscoveryState("idle");
    setModelDiscoveryMessage("");
    setIsFormOpen(true);
    showMessage("");
  }

  function openProfile(profile: EmbeddingProfile) {
    setForm(profileForm(profile));
    setModelOptions([]);
    setModelDiscoveryState("idle");
    setModelDiscoveryMessage("");
    setIsFormOpen(true);
    showMessage("");
  }

  function updateForm(values: Partial<ProfileForm>) {
    if ("providerType" in values || "baseUrl" in values || "apiKey" in values) {
      modelListOperationIdRef.current += 1;
      setModelOptions([]);
      setModelDiscoveryState("idle");
      setModelDiscoveryMessage("");
    }
    setForm((current) => ({ ...current, ...values }));
  }

  function changeProviderType(providerType: EmbeddingProviderType) {
    modelListOperationIdRef.current += 1;
    setModelOptions([]);
    setModelDiscoveryState("idle");
    setModelDiscoveryMessage("");
    const next = emptyForm(providerType);
    setForm((current) => ({
      ...next,
      id: current.id,
      name: current.id ? current.name : next.name,
      apiKey: "",
      deleteApiKey: current.deleteApiKey,
      enabled: current.enabled,
    }));
  }

  async function loadModels() {
    if (!form.baseUrl.trim()) {
      showMessage("Укажите адрес подключения", true);
      return;
    }
    const operationId = ++modelListOperationIdRef.current;
    const snapshot = form;
    setModelDiscoveryState("loading");
    setModelDiscoveryMessage("Загружаем актуальный список моделей…");
    showMessage("Загружаем модели…");
    try {
      const result = await embeddingService.listEmbeddingModels({
        profileId: snapshot.id,
        providerType: snapshot.providerType,
        baseUrl: snapshot.baseUrl.trim(),
        timeoutSeconds: Number(snapshot.timeoutSeconds) || 15,
        apiKey: snapshot.apiKey.trim() || undefined,
      });
      if (modelListOperationIdRef.current !== operationId) return;
      setModelOptions(result.options);
      setModelDiscoveryState(result.status === "manual" ? "error" : result.options.length > 0 ? "success" : "empty");
      setModelDiscoveryMessage(result.message);
      showMessage(result.message, result.status === "manual");
    } catch {
      if (modelListOperationIdRef.current === operationId) {
        setModelOptions([]);
        setModelDiscoveryState("error");
        setModelDiscoveryMessage("Не удалось получить список моделей. Можно указать Model ID вручную.");
        showMessage("Не удалось получить список моделей. Укажите название вручную.", true);
      }
    }
  }

  async function saveProfile() {
    const input = formInput(form);
    if (!input) {
      showMessage("Заполните название, адрес и модель смыслового поиска (RAG)", true);
      return;
    }
    setSaving(true);
    try {
      const saved = await embeddingService.saveEmbeddingProfile(input);
      await refreshProfiles();
      await refreshStatus(saved.id);
      setIsFormOpen(false);
      showMessage("Настройки смыслового поиска (RAG) сохранены");
      onToast("Настройки смыслового поиска (RAG) сохранены");
    } catch (error) {
      showMessage(errorText(error, "Не удалось сохранить настройки"), true);
    } finally {
      setSaving(false);
    }
  }

  async function testProfile(profile: EmbeddingProfile) {
    const operationId = ++testOperationIdRef.current;
    setTestingProfileId(profile.id);
    showMessage(`Проверяем ${profile.name}…`);
    try {
      const result = await embeddingService.testEmbeddingProvider(profile.id);
      if (testOperationIdRef.current !== operationId) return;
      await refreshProfiles();
      await refreshStatus(profile.id);
      showMessage(result.message, result.status === "error");
      onToast(result.message);
    } catch (error) {
      if (testOperationIdRef.current === operationId) {
        showMessage(errorText(error, "Не удалось проверить подключение"), true);
      }
    } finally {
      if (testOperationIdRef.current === operationId) setTestingProfileId(null);
    }
  }

  function requestIndexOperation(profile: EmbeddingProfile, operation: IndexOperation) {
    if (profile.locality === "cloud" && !profile.hasCloudConsent) {
      setConsentRequest({ profile, operation });
      return;
    }
    if (operation === "rebuild") {
      setConfirmation({ type: "rebuild", profile });
      return;
    }
    void runIndexOperation(profile, operation);
  }

  async function acceptConsent() {
    if (!consentRequest) return;
    try {
      const updated = await embeddingService.acceptEmbeddingCloudConsent(consentRequest.profile.id);
      setProfiles((current) => current.map((profile) => (profile.id === updated.id ? updated : profile)));
      const operation = consentRequest.operation;
      setConsentRequest(null);
      if (operation === "rebuild") {
        setConfirmation({ type: "rebuild", profile: updated });
      } else {
        void runIndexOperation(updated, operation);
      }
    } catch (error) {
      showMessage(errorText(error, "Не удалось сохранить согласие"), true);
    }
  }

  async function runIndexOperation(profile: EmbeddingProfile, operation: IndexOperation) {
    const operationId = ++indexOperationIdRef.current;
    setIndexOperation({ profileId: profile.id, type: operation });
    showMessage(operation === "rebuild" ? "Пересоздаём смысловой поиск (RAG)…" : "Обновляем смысловой поиск (RAG)…");
    try {
      const result = operation === "rebuild"
        ? await embeddingService.rebuildEmbeddingIndex(profile.id)
        : await embeddingService.updateEmbeddingIndex(profile.id);
      if (indexOperationIdRef.current !== operationId) return;
      await refreshStatus(profile.id);
      const text = resultMessage(result);
      showMessage(text, result.failedChunks > 0);
      onToast(text);
    } catch (error) {
      if (indexOperationIdRef.current === operationId) {
        showMessage(errorText(error, "Не удалось обновить смысловой поиск (RAG)"), true);
        await refreshStatus(profile.id);
      }
    } finally {
      if (indexOperationIdRef.current === operationId) setIndexOperation(null);
    }
  }

  async function cancelIndexing(profileId: string) {
    try {
      const accepted = await embeddingService.cancelEmbeddingIndexing(profileId);
      showMessage(accepted ? "Останавливаем после текущей группы фрагментов…" : "Активное обновление уже завершено");
    } catch (error) {
      showMessage(errorText(error, "Не удалось остановить обновление"), true);
    }
  }

  async function deleteProfile(profile: EmbeddingProfile) {
    try {
      await embeddingService.deleteEmbeddingProfile(profile.id);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      setStatuses((current) => {
        const next = { ...current };
        delete next[profile.id];
        return next;
      });
      setConfirmation(null);
      showMessage("Настройки смыслового поиска (RAG) удалены");
      onToast("Настройки смыслового поиска (RAG) удалены");
    } catch (error) {
      showMessage(errorText(error, "Не удалось удалить настройки"), true);
    }
  }

  return (
    <section className="semantic-settings-block model-settings-section">
      <SettingsSectionHeader
        action={profiles.length > 0 ? (
          <button className="primary-btn compact" disabled={isLoading} onClick={openNewProfile} type="button">
            Добавить модель
          </button>
        ) : null}
        description="Находит связанные по смыслу фрагменты заметок и используется для поиска по базе знаний."
        info="Модель смыслового поиска не создаёт ответы. Она находит связанные по смыслу фрагменты во всей базе заметок. В RAG найденные фрагменты используются как источники для ответа ИИ."
        title="Смысловой поиск (RAG)"
      />

      <div className="settings-card semantic-profile-list-card model-settings-card">
        {isLoading ? <div className="semantic-empty-state">Загружаем настройки…</div> : null}
        {!isLoading && profiles.length === 0 ? (
          <div className="semantic-empty-state model-empty-state">
            <span className="semantic-empty-icon"><Icon name="search" /></span>
            <b>Смысловой поиск (RAG) пока не настроен</b>
            <p>Подключите локальную или облачную модель, чтобы искать заметки по смыслу.</p>
            <button className="primary-btn" onClick={openNewProfile} type="button">Добавить модель</button>
          </div>
        ) : null}
        {profiles.map((profile) => {
          const status = statuses[profile.id];
          const operation = indexOperation?.profileId === profile.id ? indexOperation : null;
          const testing = testingProfileId === profile.id;
          return (
            <article className="semantic-profile-card model-profile-card" key={profile.id}>
              <div className="semantic-profile-head model-profile-head">
                <span className="semantic-profile-icon"><Icon name="search" /></span>
                <div className="semantic-profile-title">
                  <div><b>{profile.name}</b><span className={`locality-badge ${profile.locality}`}>{profile.locality === "local" ? "Локально" : "Облачно"}</span></div>
                  <small>{providerLabel(profile.providerType)} · {profile.model}</small>
                </div>
                <ModelStatusBadge
                  busy={Boolean(operation || testing)}
                  label={operation ? "Обновляется" : testing ? "Проверяем" : indexStatusLabel(status?.status, profile.lastStatus)}
                  tone={status?.status === "current" || profile.lastStatus === "success" ? "success" : status?.status === "failed" || profile.lastStatus === "error" ? "error" : status?.status === "partial" ? "warning" : "neutral"}
                />
              </div>
              <div className="semantic-profile-metrics">
                <span><small>Модель</small><b>{profile.model}</b></span>
                <span><small>Обработано</small><b>{status ? `${status.indexedChunks} из ${status.totalChunks}` : "—"}</b></span>
                <span><small>Осталось</small><b>{status?.pendingChunks ?? "—"}</b></span>
                <span><small>Последняя проверка</small><b>{formatDate(status?.lastCheckedAt ?? profile.lastCheckedAt)}</b></span>
              </div>
              {operation && status ? (
                <div className="semantic-progress" aria-label="Прогресс обновления">
                  <span style={{ width: `${progressPercent(status)}%` }} />
                </div>
              ) : null}
              <div className="semantic-profile-actions model-profile-actions">
                <button className="secondary-btn compact" disabled={testing || Boolean(operation)} onClick={() => void testProfile(profile)} type="button">
                  {testing ? "Проверяем…" : "Проверить подключение"}
                </button>
                <button className="secondary-btn compact" disabled={Boolean(operation)} onClick={() => openProfile(profile)} type="button">Изменить</button>
                {operation ? (
                  <button className="secondary-btn compact" onClick={() => void cancelIndexing(profile.id)} type="button">Остановить</button>
                ) : (
                  <button className="primary-btn compact" disabled={profile.lastStatus !== "success"} onClick={() => requestIndexOperation(profile, "update")} type="button">
                    Обновить смысловой поиск (RAG)
                  </button>
                )}
                <details className="semantic-more-actions model-card-more">
                  <summary aria-label={`Дополнительные действия: ${profile.name}`} className="row-menu-trigger"><Icon name="dots" /></summary>
                  <div className="semantic-more-menu">
                    <button disabled={Boolean(operation)} onClick={() => requestIndexOperation(profile, "rebuild")} type="button">Пересоздать смысловой поиск (RAG)</button>
                    <button className="danger" disabled={Boolean(operation)} onClick={() => setConfirmation({ type: "delete", profile })} type="button">Удалить модель</button>
                  </div>
                </details>
              </div>
              <div aria-live="polite" className={`model-card-operation ${operation || testing ? "visible" : ""}`}>
                {operation ? "Обновляем смысловой поиск (RAG)…" : testing ? "Проверяем подключение…" : "\u00A0"}
              </div>
            </article>
          );
        })}
        {message ? <div aria-live="polite" className={`semantic-settings-message ${messageError ? "error" : ""}`}>{message}</div> : null}
      </div>

      {isFormOpen ? (
        <SettingsModalShell
          className="semantic-profile-modal"
          description="Настройте отдельную модель для поиска заметок по смыслу. Подключение не меняет модель ИИ-помощника."
          eyebrow={form.id ? "Редактирование" : "Новая модель"}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="ghost-btn" disabled={saving} onClick={() => setIsFormOpen(false)} type="button">Отмена</button>
              <button className="primary-btn" disabled={saving} onClick={() => void saveProfile()} type="button">{saving ? "Сохраняем…" : "Сохранить модель"}</button>
            </div>
          )}
          onClose={() => setIsFormOpen(false)}
          size="standard"
          status={message ? <div aria-live="polite" className={`semantic-settings-message ${messageError ? "error" : ""}`}>{message}</div> : null}
          title={form.id ? "Изменить модель смыслового поиска (RAG)" : "Новая модель смыслового поиска (RAG)"}
          titleId="semantic-form-title"
        >
            <ProviderTypeSelector
              ariaLabel="Тип подключения смыслового поиска (RAG)"
              onChange={changeProviderType}
              options={semanticProviderOptions}
              value={form.providerType}
            />
            <div className="form-grid semantic-profile-form">
              <label className="field full">Название<input onChange={(event) => updateForm({ name: event.currentTarget.value })} value={form.name} /></label>
              <label className="field full">Адрес подключения<input onChange={(event) => updateForm({ baseUrl: event.currentTarget.value })} spellCheck={false} value={form.baseUrl} /></label>
              <ModelDiscoveryField
                label="Модель смыслового поиска (RAG)"
                manualPlaceholder="Укажите Model ID"
                manualValue={form.model}
                onDiscover={() => void loadModels()}
                onManualChange={(model) => updateForm({ model })}
                onSelect={(model) => updateForm({ model })}
                options={modelOptions}
                purpose="embedding"
                state={modelDiscoveryState}
                statusMessage={modelDiscoveryMessage}
              />
              <label className="field full">Режим<select onChange={(event) => updateForm({ locality: event.currentTarget.value === "cloud" ? "cloud" : "local" })} value={form.locality}><option value="local">Локально</option><option value="cloud">Облачно</option></select></label>
              <label className="field full">Путь смыслового поиска (RAG)<input onChange={(event) => updateForm({ embeddingsEndpoint: event.currentTarget.value })} spellCheck={false} value={form.embeddingsEndpoint} /></label>
              <label className="field">Размер группы<input min="1" max="128" onChange={(event) => updateForm({ batchSize: event.currentTarget.value })} type="number" value={form.batchSize} /></label>
              <label className="field">Ожидание ответа, сек.<input min="5" max="300" onChange={(event) => updateForm({ timeoutSeconds: event.currentTarget.value })} type="number" value={form.timeoutSeconds} /></label>
              <label className="field full">API key<input autoComplete="off" onChange={(event) => updateForm({ apiKey: event.currentTarget.value, deleteApiKey: false })} placeholder={form.id ? "Оставьте пустым, чтобы сохранить текущий ключ" : "Не нужен для локальной Ollama"} type="password" value={form.apiKey} /></label>
              {form.id ? <button className="text-danger-action" onClick={() => updateForm({ apiKey: "", deleteApiKey: true })} type="button">{form.deleteApiKey ? "Сохранённый ключ будет удалён" : "Удалить сохранённый ключ"}</button> : null}
              {profiles.find((profile) => profile.id === form.id)?.dimensions ? (
                <details className="semantic-technical-details full">
                  <summary>Технические сведения</summary>
                  <span>Размерность модели: {profiles.find((profile) => profile.id === form.id)?.dimensions}</span>
                </details>
              ) : null}
            </div>
        </SettingsModalShell>
      ) : null}

      {consentRequest ? (
        <SettingsModalShell
          description="Для смыслового поиска (RAG) NoteFlow отправит текст смысловых фрагментов выбранному провайдеру. API-ключ хранится в защищённом системном хранилище."
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="ghost-btn" onClick={() => setConsentRequest(null)} type="button">Отмена</button>
              <button className="primary-btn" onClick={() => void acceptConsent()} type="button">Разрешить и продолжить</button>
            </div>
          )}
          onClose={() => setConsentRequest(null)}
          size="compact"
          title="Разрешить обработку заметок облачной моделью?"
          titleId="cloud-consent-title"
        >
          <div className="settings-confirm-note">Разрешение действует только для выбранной модели смыслового поиска (RAG).</div>
        </SettingsModalShell>
      ) : null}

      {confirmation ? (
        <SettingsModalShell
          description={confirmation.type === "delete" ? "Модель смыслового поиска (RAG) и её производный индекс будут удалены. Заметки и другие подключения не изменятся." : "NoteFlow удалит только производные данные выбранной модели и создаст их заново. Заметки останутся без изменений."}
          dismissOnBackdrop={false}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="ghost-btn" onClick={() => setConfirmation(null)} type="button">Отмена</button>
              <button className={confirmation.type === "delete" ? "danger-btn" : "primary-btn"} onClick={() => {
                const current = confirmation;
                setConfirmation(null);
                if (current.type === "delete") void deleteProfile(current.profile);
                else void runIndexOperation(current.profile, "rebuild");
              }} type="button">{confirmation.type === "delete" ? "Удалить модель" : "Пересоздать"}</button>
            </div>
          )}
          onClose={() => setConfirmation(null)}
          size="compact"
          title={confirmation.type === "delete" ? "Удалить модель смыслового поиска (RAG)?" : "Пересоздать смысловой поиск (RAG)?"}
          titleId="semantic-confirm-title"
        >
          <div className="settings-confirm-note">{confirmation.type === "delete" ? "Операция необратима для настроек модели." : "Во время пересоздания обычный поиск продолжит работать."}</div>
        </SettingsModalShell>
      ) : null}
    </section>
  );
}

function formInput(form: ProfileForm): SaveEmbeddingProfileInput | null {
  const batchSize = Number(form.batchSize);
  const timeoutSeconds = Number(form.timeoutSeconds);
  if (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim() || !form.embeddingsEndpoint.trim() || !Number.isFinite(batchSize) || !Number.isFinite(timeoutSeconds)) return null;
  return {
    id: form.id,
    name: form.name.trim(),
    providerType: form.providerType,
    baseUrl: form.baseUrl.trim(),
    embeddingsEndpoint: form.embeddingsEndpoint.trim(),
    model: form.model.trim(),
    batchSize,
    timeoutSeconds,
    locality: form.locality,
    apiKey: form.apiKey.trim() || undefined,
    deleteApiKey: form.deleteApiKey,
    enabled: form.enabled,
  };
}

function providerLabel(providerType: EmbeddingProviderType) {
  if (providerType === "ollama") return "Ollama";
  if (providerType === "openai") return "OpenAI-compatible";
  return "Свой API";
}

function indexStatusLabel(status: EmbeddingIndexStatus["status"] | undefined, providerStatus: EmbeddingProfile["lastStatus"]) {
  if (status === "current") return "Актуален";
  if (status === "partial") return "Частично готов";
  if (status === "failed") return "Требует внимания";
  if (status === "indexing") return "Обновляется";
  if (status === "pending") return "Нужно обновить";
  if (providerStatus === "success") return "Готов к обновлению";
  if (providerStatus === "error") return "Ошибка подключения";
  return "Не проверено";
}

function progressPercent(status: EmbeddingIndexStatus) {
  if (status.totalChunks <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((status.indexedChunks / status.totalChunks) * 100)));
}

function formatDate(value?: string | null) {
  if (!value) return "Ещё не проверялся";
  return formatDisplayDateTime(value) || "Ещё не проверялся";
}

function resultMessage(result: EmbeddingIndexUpdateResult) {
  if (result.cancelled) return `Обновление остановлено. Готово фрагментов: ${result.indexedChunks}`;
  if (result.failedChunks > 0) return `Обновление завершено частично. Не обработано: ${result.failedChunks}`;
  if (result.indexedChunks === 0) return "Смысловой поиск (RAG) уже актуален";
  return `Смысловой поиск (RAG) обновлён: ${result.indexedChunks} фрагментов`;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : typeof error === "string" && error ? error : fallback;
}
