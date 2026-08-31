import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { getFocusableElements } from "./uiA11y";

interface ModalShellProps {
  backdropClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  closeButtonClassName?: string;
  closeDisabled?: boolean;
  description?: string;
  dismissOnBackdrop?: boolean;
  eyebrow?: string;
  footer?: ReactNode;
  footerClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => boolean;
  open: boolean;
  size?: "compact" | "standard" | "wide";
  status?: ReactNode;
  statusClassName?: string;
  title: string;
  titleId?: string;
}

const MODAL_EXIT_MS = 120;

export function ModalShell({
  backdropClassName = "",
  bodyClassName = "",
  children,
  className = "",
  closeButtonClassName = "",
  closeDisabled = false,
  description,
  dismissOnBackdrop = true,
  eyebrow,
  footer,
  footerClassName = "",
  initialFocusRef,
  onClose,
  onEscapeKeyDown,
  open,
  size = "standard",
  status,
  statusClassName = "",
  title,
  titleId,
}: ModalShellProps) {
  const generatedTitleId = useId();
  const resolvedTitleId = titleId ?? generatedTitleId;
  const descriptionId = description ? `${resolvedTitleId}-description` : undefined;
  const shellRef = useRef<HTMLElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closeDisabledRef = useRef(closeDisabled);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onEscapeKeyDownRef = useRef(onEscapeKeyDown);
  const [isClosing, setIsClosing] = useState(false);

  closeDisabledRef.current = closeDisabled;
  onCloseRef.current = onClose;
  onEscapeKeyDownRef.current = onEscapeKeyDown;

  const requestClose = useCallback(() => {
    if (closeDisabledRef.current || isClosingRef.current) {
      return;
    }
    isClosingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), MODAL_EXIT_MS);
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      isClosingRef.current = false;
      setIsClosing(false);
      return undefined;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => {
      const initialTarget = initialFocusRef?.current ?? (shellRef.current ? getFocusableElements(shellRef.current)[0] : null);
      initialTarget?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (onEscapeKeyDownRef.current?.(event)) {
          return;
        }
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !shellRef.current) {
        return;
      }

      const focusable = getFocusableElements(shellRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        shellRef.current.focus();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [initialFocusRef, open, requestClose]);

  if (!open) {
    return null;
  }

  function stopPropagation(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
    }
  }

  return createPortal(
    <div
      className={`nf-modal-backdrop ${backdropClassName} ${isClosing ? "is-closing" : ""}`.trim()}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && dismissOnBackdrop) {
          requestClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={resolvedTitleId}
        aria-modal="true"
        className={`nf-modal-shell nf-modal-shell--${size} ${className}`.trim()}
        onKeyDown={stopPropagation}
        ref={shellRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="nf-modal-header">
          <div className="nf-modal-heading">
            {eyebrow ? <span className="nf-modal-eyebrow">{eyebrow}</span> : null}
            <h2 id={resolvedTitleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            aria-label="Закрыть окно"
            className={`nf-modal-close ${closeButtonClassName}`.trim()}
            disabled={closeDisabled}
            onClick={requestClose}
            title="Закрыть"
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className={`nf-modal-body ${bodyClassName}`.trim()}>{children}</div>
        {status ? <div className={`nf-modal-status ${statusClassName}`.trim()}>{status}</div> : null}
        {footer ? <footer className={`nf-modal-footer ${footerClassName}`.trim()}>{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
