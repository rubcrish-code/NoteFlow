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

export interface FloatingPopoverGeometryInput {
  anchorRect: Pick<DOMRect, "bottom" | "left" | "right" | "top">;
  gap: number;
  maxHeight: number;
  padding: number;
  preferredWidth: number;
  scrollHeight: number;
  viewportHeight: number;
  viewportWidth: number;
}

export interface FloatingPopoverGeometry {
  left: number;
  maxHeight: number;
  opensUp: boolean;
  top: number;
  width: number;
}

export function calculateFloatingPopoverGeometry({
  anchorRect,
  gap,
  maxHeight,
  padding,
  preferredWidth,
  scrollHeight,
  viewportHeight,
  viewportWidth,
}: FloatingPopoverGeometryInput): FloatingPopoverGeometry {
  const availableWidth = Math.max(0, viewportWidth - padding * 2);
  const width = Math.min(preferredWidth, availableWidth);
  const spaceBelow = Math.max(0, viewportHeight - anchorRect.bottom - gap - padding);
  const spaceAbove = Math.max(0, anchorRect.top - gap - padding);
  const opensUp = spaceBelow < Math.min(scrollHeight, maxHeight) && spaceAbove > spaceBelow;
  const availableHeight = opensUp ? spaceAbove : spaceBelow;
  const nextMaxHeight = Math.max(0, Math.min(maxHeight, availableHeight, viewportHeight - padding * 2));
  const renderedHeight = Math.min(scrollHeight, nextMaxHeight);
  const top = opensUp
    ? Math.max(padding, anchorRect.top - gap - renderedHeight)
    : Math.max(padding, Math.min(viewportHeight - padding - renderedHeight, anchorRect.bottom + gap));
  const preferredLeft = anchorRect.left;
  const left = Math.max(padding, Math.min(viewportWidth - padding - width, preferredLeft));

  return { left, maxHeight: nextMaxHeight, opensUp, top, width };
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
        const geometry = calculateFloatingPopoverGeometry({
          anchorRect,
          gap,
          maxHeight,
          padding,
          preferredWidth,
          scrollHeight: popoverElement.scrollHeight,
          viewportHeight,
          viewportWidth,
        });

        setStyle({
          left: geometry.left,
          maxHeight: geometry.maxHeight,
          top: geometry.top,
          width: geometry.width,
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
