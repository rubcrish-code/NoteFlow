import { useEffect, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { Icon } from "../../shared/Icon";

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
  eyebrow,
  footer,
  onClose,
  size = "standard",
  status,
  title,
  titleId,
}: SettingsModalShellProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabled) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDisabled, onClose]);

  return (
    <div className="modal-backdrop settings-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && !closeDisabled && onClose()} role="presentation">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`settings-modal-shell settings-modal-${size} ${className}`.trim()}
        role="dialog"
      >
        <header className="settings-modal-header">
          <div className="settings-modal-heading">
            {eyebrow ? <span className="settings-modal-eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button aria-label="Закрыть окно" className="settings-modal-close" disabled={closeDisabled} onClick={onClose} title="Закрыть" type="button">
            <Icon name="x" />
          </button>
        </header>
        <div className="settings-modal-body">{children}</div>
        {status ? <div className="settings-modal-status">{status}</div> : null}
        {footer ? <footer className="settings-modal-footer">{footer}</footer> : null}
      </section>
    </div>
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
