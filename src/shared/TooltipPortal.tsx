import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipAnchor {
  rect: DOMRect;
  text: string;
}

interface TooltipPosition {
  left: number;
  top: number;
}

function findTooltipTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>("[data-tooltip]");
}

export function TooltipPortal() {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const [position, setPosition] = useState<TooltipPosition>({ left: 0, top: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const anchorElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function showTooltip(target: EventTarget | null) {
      const tooltipTarget = findTooltipTarget(target);
      const text = tooltipTarget?.dataset.tooltip;
      if (!tooltipTarget || !text) {
        return;
      }

      anchorElementRef.current = tooltipTarget;
      setAnchor({ rect: tooltipTarget.getBoundingClientRect(), text });
    }

    function handleMouseOver(event: MouseEvent) {
      showTooltip(event.target);
    }

    function handleFocusIn(event: FocusEvent) {
      showTooltip(event.target);
    }

    function hideTooltip(event?: MouseEvent | FocusEvent | Event) {
      if (event instanceof MouseEvent && anchorElementRef.current) {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && anchorElementRef.current.contains(relatedTarget)) {
          return;
        }
      }

      anchorElementRef.current = null;
      setAnchor(null);
    }

    function handleMouseOut(event: MouseEvent) {
      hideTooltip(event);
    }

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusout", hideTooltip);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("focusout", hideTooltip);
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!anchor || !tooltipRef.current) {
      return;
    }

    const tooltip = tooltipRef.current;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const gap = 8;
    const padding = 8;

    const left = Math.min(window.innerWidth - width - padding, Math.max(padding, anchor.rect.left + anchor.rect.width / 2 - width / 2));
    const bottomTop = anchor.rect.bottom + gap;
    const top = bottomTop + height > window.innerHeight - padding ? Math.max(padding, anchor.rect.top - height - gap) : bottomTop;

    setPosition({ left, top });
  }, [anchor]);

  if (!anchor) {
    return null;
  }

  return createPortal(
    <div className="nf-tooltip" ref={tooltipRef} role="tooltip" style={{ left: position.left, top: position.top }}>
      {anchor.text}
    </div>,
    document.body,
  );
}
