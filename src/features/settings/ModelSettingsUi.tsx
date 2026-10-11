import type { ReactNode, Ref } from "react";
import { Icon } from "../../shared/Icon";
import { ModalShell } from "../../shared/ModalShell";
import { InfoHint } from "../../shared/InfoHint";

export interface ProviderTypeOption<T extends string> {
  id: T;
  label: string;
  detail: string;
  icon: ReactNode;
}

interface ProviderTypeSelectorProps<T extends string> {
  ariaLabel: string;
  initialFocusRef?: Ref<HTMLButtonElement>;
  onChange: (providerType: T) => void;
  options: readonly ProviderTypeOption<T>[];
  value: T;
}

export function ProviderTypeSelector<T extends string>({
  ariaLabel,
  initialFocusRef,
  onChange,
  options,
  value,
}: ProviderTypeSelectorProps<T>) {
  return (
    <div aria-label={ariaLabel} className="provider-type-selector" role="radiogroup">
      {options.map((option, index) => (
        <button
          aria-checked={value === option.id}
          className={`provider-type-option ${value === option.id ? "active" : ""}`}
          key={option.id}
          onClick={() => onChange(option.id)}
          ref={index === 0 ? initialFocusRef : undefined}
          role="radio"
          type="button"
        >
          <span aria-hidden="true" className="provider-type-icon">{option.icon}</span>
          <span className="provider-type-copy">
            <b>{option.label}</b>
            <small>{option.detail}</small>
          </span>
          <span aria-hidden="true" className="provider-type-check"><Icon name="check" /></span>
        </button>
      ))}
    </div>
  );
}

export type ModelStatusTone = "neutral" | "success" | "warning" | "error";

interface ModelStatusBadgeProps {
  busy?: boolean;
  label: string;
  tone?: ModelStatusTone;
}

export function ModelStatusBadge({ busy = false, label, tone = "neutral" }: ModelStatusBadgeProps) {
  return (
    <span aria-busy={busy} aria-live="polite" className={`status-pill model-status-badge ${tone}`}>
      {label}
    </span>
  );
}

export type ModelDiscoveryPurpose = "chat" | "embedding";
export type ModelDiscoveryState = "idle" | "loading" | "success" | "empty" | "error";

export interface ModelDiscoveryOption {
  id: string;
  supportsChat: boolean | null;
  supportsEmbeddings: boolean | null;
}

export function filterModelDiscoveryOptions(
  options: readonly ModelDiscoveryOption[],
  purpose: ModelDiscoveryPurpose,
) {
  return options.filter((option) => (
    purpose === "chat" ? option.supportsChat !== false : option.supportsEmbeddings !== false
  ));
}

interface ModelDiscoveryFieldProps {
  label: string;
  manualPlaceholder: string;
  manualValue: string;
  onDiscover: () => void;
  onManualChange: (value: string) => void;
  onSelect: (value: string) => void;
  options: readonly ModelDiscoveryOption[];
  purpose: ModelDiscoveryPurpose;
  state: ModelDiscoveryState;
  statusMessage?: string;
}

export function ModelDiscoveryField({
  label,
  manualPlaceholder,
  manualValue,
  onDiscover,
  onManualChange,
  onSelect,
  options,
  purpose,
  state,
  statusMessage,
}: ModelDiscoveryFieldProps) {
  const availableOptions = filterModelDiscoveryOptions(options, purpose);
  const selectedValue = availableOptions.some((option) => option.id === manualValue) ? manualValue : "";
  const buttonLabel = state === "loading"
    ? "Загружаем модели…"
    : state === "error"
      ? "Повторить"
      : state === "idle"
        ? "Получить список моделей"
        : "Обновить список";

  return (
    <div className="field full model-discovery-field">
      <span className="field-label">{label} <InfoHint text={purpose === "chat" ? "Модель для ответов ИИ. Выберите из списка сервера или укажите её точный ID вручную." : "Модель преобразует текст в числовое представление для поиска по смыслу, но не пишет ответы."} /></span>
      {availableOptions.length > 0 ? (
        <label className="model-discovery-select">
          <span>Доступные модели</span>
          <select
            aria-label={`${label}: доступные модели`}
            onChange={(event) => {
              if (event.currentTarget.value) onSelect(event.currentTarget.value);
            }}
            value={selectedValue}
          >
            <option value="">Выберите модель</option>
            {availableOptions.map((option) => <option key={option.id} value={option.id}>{option.id}</option>)}
          </select>
        </label>
      ) : null}
      <button
        aria-busy={state === "loading"}
        className="secondary-btn model-discovery-refresh"
        disabled={state === "loading"}
        onClick={onDiscover}
        type="button"
      >
        {state === "loading" ? <span aria-hidden="true" className="button-spinner" /> : null}
        {buttonLabel}
      </button>
      <label className="model-discovery-manual">
        <span>Model ID вручную <InfoHint text="Точное имя модели у провайдера. Используйте ручной ввод, если сервер не предоставляет список моделей." /></span>
        <input
          onChange={(event) => onManualChange(event.currentTarget.value)}
          placeholder={manualPlaceholder}
          spellCheck={false}
          value={manualValue}
        />
      </label>
      {statusMessage ? (
        <span aria-live="polite" className={`field-help model-discovery-status ${state === "error" ? "error" : ""}`}>
          {statusMessage}
        </span>
      ) : null}
    </div>
  );
}

interface SettingsModalShellProps {
  children: ReactNode;
  className?: string;
  closeDisabled?: boolean;
  description?: string;
  dismissOnBackdrop?: boolean;
  eyebrow?: string;
  footer?: ReactNode;
  onClose: () => void;
  size?: "compact" | "standard" | "wide";
  status?: ReactNode;
  title: string;
  titleId: string;
}

export function SettingsModalShell({
  children,
  className = "",
  closeDisabled = false,
  description,
  dismissOnBackdrop = true,
  eyebrow,
  footer,
  onClose,
  size = "standard",
  status,
  title,
  titleId,
}: SettingsModalShellProps) {
  return (
    <ModalShell
      backdropClassName="modal-backdrop settings-modal-backdrop"
      bodyClassName="settings-modal-body"
      className={`settings-modal-shell settings-modal-${size} ${className}`.trim()}
      closeButtonClassName="settings-modal-close"
      closeDisabled={closeDisabled}
      description={description}
      dismissOnBackdrop={dismissOnBackdrop}
      eyebrow={eyebrow}
      footer={footer}
      footerClassName="settings-modal-footer"
      onClose={onClose}
      open
      size={size}
      status={status}
      statusClassName="settings-modal-status"
      title={title}
      titleId={titleId}
    >
      {children}
    </ModalShell>
  );
}

interface SettingsSectionHeaderProps {
  action?: ReactNode;
  description: string;
  info: string;
  title: string;
}

export function SettingsSectionHeader({ action, description, info, title }: SettingsSectionHeaderProps) {
  return (
    <div className="model-section-header">
      <div className="model-section-heading">
        <div className="model-section-title-row">
          <h2>{title}</h2>
          <InfoHint label={`Подробнее: ${title}`} text={info} />
        </div>
        <p>{description}</p>
      </div>
      {action ? <div className="model-section-action">{action}</div> : null}
    </div>
  );
}
