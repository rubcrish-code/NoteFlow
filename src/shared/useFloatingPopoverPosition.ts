import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

interface FloatingPopoverPositionOptions<TAnchor extends HTMLElement, TPopover extends HTMLElement> {
  anchorRef: RefObject<TAnchor | null>;
  gap?: number;
  isOpen: boolean;
  maxHeight?: number;
  padding?: number;
  popoverRef: RefObject<TPopover | null>;
  preferredWidth?: number;
}

export function useFloatingPopoverPosition<TAnchor extends HTMLElement, TPopover extends HTMLElement>({
  anchorRef,
  gap = 8,
  isOpen,
  maxHeight = 560,
  padding = 14,
  popoverRef,
  preferredWidth = 340,
}: FloatingPopoverPositionOptions<TAnchor, TPopover>) {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!isOpen) {
      setStyle(undefined);
      return undefined;
    }

    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) {
      return undefined;
    }
    const anchorElement = anchor;
    const popoverElement = popover;

    let animationFrame = 0;

    function updatePosition() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const anchorRect = anchorElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const availableWidth = Math.max(240, viewportWidth - padding * 2);
        const width = Math.min(preferredWidth, availableWidth);
        const scrollHeight = popoverElement.scrollHeight;
        const spaceBelow = viewportHeight - anchorRect.bottom - gap - padding;
        const spaceAbove = anchorRect.top - gap - padding;
        const opensUp = spaceBelow < Math.min(scrollHeight, maxHeight) && spaceAbove > spaceBelow;
        const availableHeight = Math.max(120, opensUp ? spaceAbove : spaceBelow);
        const nextMaxHeight = Math.min(maxHeight, availableHeight, viewportHeight - padding * 2);
        const renderedHeight = Math.min(scrollHeight, nextMaxHeight);
        const top = opensUp ? Math.max(padding, anchorRect.top - gap - renderedHeight) : Math.min(viewportHeight - padding - renderedHeight, anchorRect.bottom + gap);
        const left = Math.min(viewportWidth - padding - width, Math.max(padding, anchorRect.right - width));

        setStyle({
          left,
          maxHeight: nextMaxHeight,
          top,
          width,
        });
      });
    }

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(popoverElement);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, gap, isOpen, maxHeight, padding, popoverRef, preferredWidth]);

  return style;
}
