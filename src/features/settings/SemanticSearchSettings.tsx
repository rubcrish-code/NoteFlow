import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useRef, useState } from "react";
import * as embeddingService from "../../services/embeddingService";
import { uiMessage } from "../../shared/uiMessages";
import type {
  EmbeddingIndexStatus,
  EmbeddingIndexUpdateResult,
  EmbeddingLocality,
  EmbeddingProfile,
  EmbeddingProviderType,
  SaveEmbeddingProfileInput,
} from "../../services/embeddingService";
import { Icon } from "../../shared/Icon";
import { InfoHint } from "../../shared/InfoHint";
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
    get name() { return translate("ui.272279d699f8"); },
    providerType: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    embeddingsEndpoint: "/api/embed",
    model: "nomic-embed-text",
    batchSize: "16",
    timeoutSeconds: "30",
    locality: "local",
  },
  openai: {
    get name() { return translate("ui.7c5b738b475f"); },
    providerType: "openai",
    baseUrl: "https://api.openai.com/v1",
    embeddingsEndpoint: "/embeddings",
    model: "text-embedding-3-small",
    batchSize: "64",
    timeoutSeconds: "30",
    locality: "cloud",
  },
  custom: {
    get name() { return translate("ui.f4de47941760"); },
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
  { id: "ollama", label: "Ollama", get detail() { return translate("ui.b7608054c1a4"); }, icon: <Icon aria-hidden="true" name="gear" /> },
  { id: "openai", label: "OpenAI-compatible", get detail() { return translate("ui.d3d9b4e13912"); }, icon: <Icon aria-hidden="true" name="search" /> },
  { id: "custom", get label() { return translate("ui.e4c7fed82824"); }, get detail() { return uiMessage(getInterfaceLanguage(), "customProviderDetail"); }, icon: <Icon aria-hidden="true" name="code" /> },
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
  useInterfaceLanguage();
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
        if (!cancelled) showMessage(translate("ui.9ded97d82e67"), true);
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
    let cancelled = false;
    let timer: number;
    async function poll() {
      await Promise.all(profiles.map(async (profile) => {
        try {
          const status = await embeddingService.getEmbeddingIndexStatus(profile.id);
          if (!cancelled) setStatuses((current) => ({ ...current, [profile.id]: status }));
        } catch { /* Retain last known status while a profile remains editable. */ }
      }));
      if (!cancelled) timer = window.setTimeout(() => void poll(), 3000);
    }
    timer = window.setTimeout(() => void poll(), 3000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [profiles]);

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
      showMessage(translate("ui.4f1baea6134f"), true);
      return;
    }
    const operationId = ++modelListOperationIdRef.current;
    const snapshot = form;
    setModelDiscoveryState("loading");
    setModelDiscoveryMessage(translate("ui.69e52b16892b"));
    showMessage(translate("ui.954eb9132da8"));
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
        setModelDiscoveryMessage(translate("ui.5d8255fee6d7"));
        showMessage(translate("ui.dc58ae9a561f"), true);
      }
    }
  }

  async function saveProfile() {
    const input = formInput(form);
    if (!input) {
      showMessage(translate("ui.695ca8a885ef"), true);
      return;
    }
    setSaving(true);
    try {
      const saved = await embeddingService.saveEmbeddingProfile(input);
      await refreshProfiles();
      await refreshStatus(saved.id);
      setIsFormOpen(false);
      showMessage(translate("ui.aee0b3e51f8b"));
      onToast(translate("ui.aee0b3e51f8b"));
    } catch (error) {
      showMessage(errorText(error, translate("ui.6e7ee8b60e28")), true);
    } finally {
      setSaving(false);
    }
  }

  async function testProfile(profile: EmbeddingProfile) {
    const operationId = ++testOperationIdRef.current;
    setTestingProfileId(profile.id);
    showMessage(translate("ui.007dce40df5c", { p0: profile.name }));
    try {
      const result = await embeddingService.testEmbeddingProvider(profile.id);
      if (testOperationIdRef.current !== operationId) return;
      await refreshProfiles();
      await refreshStatus(profile.id);
      showMessage(result.message, result.status === "error");
      onToast(result.message);
    } catch (error) {
      if (testOperationIdRef.current === operationId) {
        showMessage(errorText(error, translate("ui.52d1b618953f")), true);
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
        showMessage(translate("ui.b9caefce9693"));
      }
    } catch (error) {
      showMessage(errorText(error, translate("ui.696ef5b57226")), true);
    }
  }

  async function runIndexOperation(profile: EmbeddingProfile, operation: IndexOperation) {
    const operationId = ++indexOperationIdRef.current;
    setIndexOperation({ profileId: profile.id, type: operation });
    showMessage(operation === "rebuild" ? translate("ui.b93b7b6423b7") : translate("ui.7a106076bb28"));
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
        showMessage(errorText(error, translate("ui.7dc39a687b6e")), true);
        await refreshStatus(profile.id);
      }
    } finally {
      if (indexOperationIdRef.current === operationId) setIndexOperation(null);
    }
  }

  async function cancelIndexing(profileId: string) {
    try {
      const accepted = await embeddingService.cancelEmbeddingIndexing(profileId);
      showMessage(accepted ? translate("ui.8fe5792daa88") : translate("ui.ee5bd5098508"));
    } catch (error) {
      showMessage(errorText(error, translate("ui.fa8ef520ad8e")), true);
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
      showMessage(translate("ui.a439a92f7a83"));
      onToast(translate("ui.a439a92f7a83"));
    } catch (error) {
      showMessage(errorText(error, translate("ui.5c18cceeaa8a")), true);
    }
  }

  return (
    <section className="semantic-settings-block model-settings-section">
      <SettingsSectionHeader
        action={profiles.length > 0 ? (
          <button className="primary-btn compact" disabled={isLoading} onClick={openNewProfile} type="button">
            {translate("ui.2df38a36b3c0")}</button>
        ) : null}
        description={translate("ui.eec9c58998a8")}
        info={translate("ui.8f2fccf325bd")}
        title={translate("ui.56451952c80c")}
      />

      <div className="settings-card semantic-profile-list-card model-settings-card">
        {isLoading ? <div className="semantic-empty-state">{translate("ui.a709de0bacba")}</div> : null}
        {!isLoading && profiles.length === 0 ? (
          <div className="semantic-empty-state model-empty-state">
            <span className="semantic-empty-icon"><Icon name="search" /></span>
            <b>{translate("ui.8582d8af4783")}</b>
            <p>{translate("ui.cf159cb36ac8")}</p>
            <button className="primary-btn" onClick={openNewProfile} type="button">{translate("ui.2df38a36b3c0")}</button>
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
                  <div><b>{profile.name}</b><span className={`locality-badge ${profile.locality}`}>{profile.locality === "local" ? translate("ui.bbf7909a971c") : translate("ui.702517297fb6")}</span></div>
                  <small>{providerLabel(profile.providerType)} · {profile.model}</small>
                </div>
                <ModelStatusBadge
                  busy={Boolean(operation || testing || status?.status === "indexing")}
                  label={operation ? translate("ui.6fa6aaf4897b") : testing ? translate("ui.349423c80f2d") : indexStatusLabel(status?.status, profile.lastStatus)}
                  tone={status?.status === "failed" ? "error" : status?.status === "partial" ? "warning" : status?.status === "current" ? "success" : profile.lastStatus === "error" ? "error" : "neutral"}
                />
              </div>
              <div className="semantic-profile-metrics">
                <span><small>{translate("ui.f3bdf7cce355")}</small><b>{profile.model}</b></span>
                <span><small>{translate("ui.e8aff9df9a4f")}</small><b>{status ? translate("ui.872e50273d01", { p0: status.indexedChunks, p1: status.totalChunks }) : "—"}</b></span>
                <span><small>{translate("ui.0246a2516cda")}</small><b>{status?.pendingChunks ?? "—"}</b></span>
                <span><small>{translate("ui.9be8166876fa")}</small><b>{formatDate(status?.lastCheckedAt ?? profile.lastCheckedAt)}</b></span>
              </div>
              {(operation || status?.status === "indexing") && status ? (
                <div className="semantic-progress" aria-label={translate("ui.e504f5e074b1")}>
                  <span style={{ width: `${progressPercent(status)}%` }} />
                </div>
              ) : null}
              <div className="semantic-profile-actions model-profile-actions">
                <button className="secondary-btn compact" disabled={testing || Boolean(operation)} onClick={() => void testProfile(profile)} type="button">
                  {testing ? translate("ui.62ed32eb225c") : translate("ui.d6d828dc8806")}
                </button>
                <button className="secondary-btn compact" disabled={Boolean(operation)} onClick={() => openProfile(profile)} type="button">{translate("ui.b8b151d41743")}</button>
                {operation ? (
                  <button className="secondary-btn compact" onClick={() => void cancelIndexing(profile.id)} type="button">{translate("ui.3396400da0c4")}</button>
                ) : profile.locality === "cloud" && !profile.hasCloudConsent ? <button className="primary-btn compact" onClick={() => setConsentRequest({ profile, operation: "update" })} type="button">{translate("ui.9049012a92bd")}</button> : null}
                <details className="semantic-more-actions model-card-more">
                  <summary aria-label={translate("ui.551a138fd76c", { p0: profile.name })} className="row-menu-trigger"><Icon name="dots" /></summary>
                  <div className="semantic-more-menu">
                    <button disabled={Boolean(operation)} onClick={() => requestIndexOperation(profile, "rebuild")} type="button">{translate("ui.145e3d43dcad")}</button>
                    <button className="danger" disabled={Boolean(operation)} onClick={() => setConfirmation({ type: "delete", profile })} type="button">{translate("ui.46cb5952c6b3")}</button>
                  </div>
                </details>
              </div>
              <div aria-live="polite" className={`model-card-operation ${operation || testing ? "visible" : ""}`}>
                {operation ? translate("ui.7a106076bb28") : testing ? translate("ui.a4ef42e083b8") : "\u00A0"}
              </div>
            </article>
          );
        })}
        {message ? <div aria-live="polite" className={`semantic-settings-message ${messageError ? "error" : ""}`}>{message}</div> : null}
      </div>

      {isFormOpen ? (
        <SettingsModalShell
          className="semantic-profile-modal"
          description={translate("ui.5818dc61c42e")}
          eyebrow={form.id ? translate("ui.c547312308d6") : translate("ui.9e2f48ac11ac")}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="ghost-btn" disabled={saving} onClick={() => setIsFormOpen(false)} type="button">{translate("ui.8fbe9b75cbdf")}</button>
              <button className="primary-btn" disabled={saving} onClick={() => void saveProfile()} type="button">{saving ? translate("ui.9c27c381dd8b") : translate("ui.1fc49b9d5038")}</button>
            </div>
          )}
          onClose={() => setIsFormOpen(false)}
          size="standard"
          status={message ? <div aria-live="polite" className={`semantic-settings-message ${messageError ? "error" : ""}`}>{message}</div> : null}
          title={form.id ? translate("ui.fa8fc1f354c6") : translate("ui.2f036e2a8b12")}
          titleId="semantic-form-title"
        >
            <ProviderTypeSelector
              ariaLabel={translate("ui.413dab73ea59")}
              onChange={changeProviderType}
              options={semanticProviderOptions}
              value={form.providerType}
            />
            <div className="form-grid semantic-profile-form">
              <label className="field full"><span className="field-label">{translate("ui.0918b4ba9268") + " "}<InfoHint text={translate("ui.d5f826844c80")} /></span><input onChange={(event) => updateForm({ name: event.currentTarget.value })} value={form.name} /></label>
              <label className="field full"><span className="field-label">{translate("ui.771987b20028") + " "}<InfoHint text={translate("ui.1254d44d55ad")} /></span><input onChange={(event) => updateForm({ baseUrl: event.currentTarget.value })} spellCheck={false} value={form.baseUrl} /></label>
              <ModelDiscoveryField
                label={translate("ui.0d70b4d4281c")}
                manualPlaceholder={translate("ui.2fb0c108bf96")}
                manualValue={form.model}
                onDiscover={() => void loadModels()}
                onManualChange={(model) => updateForm({ model })}
                onSelect={(model) => updateForm({ model })}
                options={modelOptions}
                purpose="embedding"
                state={modelDiscoveryState}
                statusMessage={modelDiscoveryMessage}
              />
              <label className="field full"><span className="field-label">{translate("ui.3f53fb873461") + " "}<InfoHint text={translate("ui.223e1d31b992")} /></span><select onChange={(event) => updateForm({ locality: event.currentTarget.value === "cloud" ? "cloud" : "local" })} value={form.locality}><option value="local">{translate("ui.bbf7909a971c")}</option><option value="cloud">{translate("ui.702517297fb6")}</option></select></label>
              <label className="field full"><span className="field-label">{translate("ui.7f8c135289e8") + " "}<InfoHint text={translate("ui.7a9f23146b6b")} /></span><input onChange={(event) => updateForm({ embeddingsEndpoint: event.currentTarget.value })} spellCheck={false} value={form.embeddingsEndpoint} /></label>
              <label className="field"><span className="field-label">{translate("ui.5490b592170f") + " "}<InfoHint text={translate("ui.4f430dd8b782")} /></span><input min="1" max="128" onChange={(event) => updateForm({ batchSize: event.currentTarget.value })} type="number" value={form.batchSize} /></label>
              <label className="field"><span className="field-label">{translate("ui.03d6a2be39cd") + " "}<InfoHint text={translate("ui.8686788e9699")} /></span><input min="5" max="300" onChange={(event) => updateForm({ timeoutSeconds: event.currentTarget.value })} type="number" value={form.timeoutSeconds} /></label>
              <label className="field full"><span className="field-label">{uiMessage(getInterfaceLanguage(), "apiKeyLabel")} <InfoHint text={translate("ui.f4f562137249")} /></span><input autoComplete="off" onChange={(event) => updateForm({ apiKey: event.currentTarget.value, deleteApiKey: false })} placeholder={form.id ? translate("ui.6ac2830d253e") : translate("ui.526354f4aff3")} type="password" value={form.apiKey} /></label>
              {form.id ? <button className="text-danger-action" onClick={() => updateForm({ apiKey: "", deleteApiKey: true })} type="button">{form.deleteApiKey ? translate("ui.54b18559d945") : translate("ui.2ff51a1f2a43")}</button> : null}
              {profiles.find((profile) => profile.id === form.id)?.dimensions ? (
                <details className="semantic-technical-details full">
                  <summary>{translate("ui.57492dd6ea0f")}</summary>
                  <span>{translate("ui.d68f25ecf14b") + " "}{profiles.find((profile) => profile.id === form.id)?.dimensions}</span>
                </details>
              ) : null}
            </div>
        </SettingsModalShell>
      ) : null}

      {consentRequest ? (
        <SettingsModalShell
          description={translate("ui.8edc7bcbf59f")}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="ghost-btn" onClick={() => setConsentRequest(null)} type="button">{translate("ui.8fbe9b75cbdf")}</button>
              <button className="primary-btn" onClick={() => void acceptConsent()} type="button">{translate("ui.f46095dd8495")}</button>
            </div>
          )}
          onClose={() => setConsentRequest(null)}
          size="compact"
          title={translate("ui.d2efd1ca7c95")}
          titleId="cloud-consent-title"
        >
          <div className="settings-confirm-note">{translate("ui.20c8adc94247")}</div>
        </SettingsModalShell>
      ) : null}

      {confirmation ? (
        <SettingsModalShell
          description={confirmation.type === "delete" ? translate("ui.c22e8940d7c3") : translate("ui.3da6af8442e4")}
          dismissOnBackdrop={false}
          footer={(
            <div className="settings-modal-footer-actions">
              <button className="ghost-btn" onClick={() => setConfirmation(null)} type="button">{translate("ui.8fbe9b75cbdf")}</button>
              <button className={confirmation.type === "delete" ? "danger-btn" : "primary-btn"} onClick={() => {
                const current = confirmation;
                setConfirmation(null);
                if (current.type === "delete") void deleteProfile(current.profile);
                else void runIndexOperation(current.profile, "rebuild");
              }} type="button">{confirmation.type === "delete" ? translate("ui.46cb5952c6b3") : translate("ui.669f46232d41")}</button>
            </div>
          )}
          onClose={() => setConfirmation(null)}
          size="compact"
          title={confirmation.type === "delete" ? translate("ui.99308be3b5de") : translate("ui.6028839c1339")}
          titleId="semantic-confirm-title"
        >
          <div className="settings-confirm-note">{confirmation.type === "delete" ? translate("ui.bf4992684cfc") : translate("ui.4a11965b0a86")}</div>
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
  return translate("ui.e4c7fed82824");
}

function indexStatusLabel(status: EmbeddingIndexStatus["status"] | undefined, providerStatus: EmbeddingProfile["lastStatus"]) {
  if (status === "current") return translate("ui.d1afd048facb");
  if (status === "partial") return translate("ui.db5f5f88fafb");
  if (status === "failed") return translate("ui.34dc848e1848");
  if (status === "indexing") return translate("ui.6fa6aaf4897b");
  if (status === "pending") return translate("ui.b4cc048b12d7");
  if (providerStatus === "success") return translate("ui.b4cc048b12d7");
  if (providerStatus === "error") return translate("ui.2e4dbae57696");
  return translate("ui.773a16f5248a");
}

function progressPercent(status: EmbeddingIndexStatus) {
  if (status.totalChunks <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((status.indexedChunks / status.totalChunks) * 100)));
}

function formatDate(value?: string | null) {
  if (!value) return translate("ui.4081c1b1a46c");
  return formatDisplayDateTime(value) || translate("ui.4081c1b1a46c");
}

function resultMessage(result: EmbeddingIndexUpdateResult) {
  if (result.cancelled) return translate("ui.0b0df97a4f0d", { p0: result.indexedChunks });
  if (result.failedChunks > 0) return translate("ui.32afb15b46da", { p0: result.failedChunks });
  if (result.indexedChunks === 0) return translate("ui.584c077100f4");
  return translate("ui.657097f6e321", { p0: result.indexedChunks });
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : typeof error === "string" && error ? error : fallback;
}
