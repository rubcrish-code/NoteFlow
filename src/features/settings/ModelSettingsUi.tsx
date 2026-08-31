import { useEffect, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { Icon } from "../../shared/Icon";
import { ModalShell } from "../../shared/ModalShell";

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
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setIsDismissed(true);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.blur();
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="model-section-header">
      <div className="model-section-heading">
        <div className="model-section-title-row">
          <h2>{title}</h2>
          <div
            className={`settings-info-control ${isOpen ? "open" : ""} ${isDismissed ? "dismissed" : ""}`}
            onFocusCapture={() => setIsDismissed(false)}
            onPointerLeave={() => setIsDismissed(false)}
            ref={rootRef}
          >
            <button
              aria-expanded={isOpen}
              aria-label={`Подробнее: ${title}`}
              className="settings-info-trigger"
              onClick={() => {
                setIsDismissed(false);
                setIsOpen((current) => !current);
              }}
              title="Подробнее"
              type="button"
            >
              <Icon name="callout" />
            </button>
            <div className="settings-info-popover" role="tooltip">{info}</div>
          </div>
        </div>
        <p>{description}</p>
      </div>
      {action ? <div className="model-section-action">{action}</div> : null}
    </div>
  );
}
