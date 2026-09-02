import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useFloatingPopoverPosition } from "./useFloatingPopoverPosition";
import { getMenuTargetIndex, type MenuNavigationKey } from "./uiA11y";

interface MenuPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  maxHeight?: number;
  onClose: () => void;
  preferredWidth?: number;
}

function isMenuNavigationKey(key: string): key is MenuNavigationKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

const MENU_ITEM_SELECTOR = "[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']";

export function MenuPopover({
  anchorRef,
  ariaLabel,
  children,
  className = "",
  isOpen,
  maxHeight = 320,
  onClose,
  preferredWidth = 220,
}: MenuPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverStyle = useFloatingPopoverPosition({
    anchorRef,
    isOpen,
    maxHeight,
    popoverRef,
    preferredWidth,
  });

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      popoverRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus();
    });

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !anchorRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        anchorRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        onClose();
        return;
      }
      if (!isMenuNavigationKey(event.key) || !popoverRef.current) {
        return;
      }

      const items = Array.from(
        popoverRef.current.querySelectorAll<HTMLElement>(
          "[role='menuitem']:not([disabled]), [role='menuitemcheckbox']:not([disabled]), [role='menuitemradio']:not([disabled])",
        ),
      );
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const targetIndex = getMenuTargetIndex(event.key, currentIndex, items.length);
      if (targetIndex >= 0) {
        event.preventDefault();
        items[targetIndex].focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      aria-label={ariaLabel}
      className={`nf-popover nf-menu ${className}`.trim()}
      ref={popoverRef}
      role="menu"
      style={{ ...popoverStyle, visibility: popoverStyle ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
