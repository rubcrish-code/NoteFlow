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

const TOOLTIP_ID = "noteflow-tooltip";

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
  const previousDescribedByRef = useRef<string | null>(null);

  useEffect(() => {
    function showTooltip(target: EventTarget | null) {
      const tooltipTarget = findTooltipTarget(target);
      const text = tooltipTarget?.dataset.tooltip;
      if (!tooltipTarget || !text) {
        return;
      }

      anchorElementRef.current = tooltipTarget;
      previousDescribedByRef.current = tooltipTarget.getAttribute("aria-describedby");
      const describedBy = previousDescribedByRef.current?.split(/\s+/).filter(Boolean) ?? [];
      if (!describedBy.includes(TOOLTIP_ID)) {
        tooltipTarget.setAttribute("aria-describedby", [...describedBy, TOOLTIP_ID].join(" "));
      }
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

      if (anchorElementRef.current) {
        const previousDescribedBy = previousDescribedByRef.current;
        if (previousDescribedBy) {
          anchorElementRef.current.setAttribute("aria-describedby", previousDescribedBy);
        } else {
          anchorElementRef.current.removeAttribute("aria-describedby");
        }
      }
      anchorElementRef.current = null;
      previousDescribedByRef.current = null;
      setAnchor(null);
    }

    function handleMouseOut(event: MouseEvent) {
      hideTooltip(event);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hideTooltip(event);
      }
    }

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusout", hideTooltip);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("focusout", hideTooltip);
      document.removeEventListener("keydown", handleKeyDown);
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
    <div className="nf-tooltip" id={TOOLTIP_ID} ref={tooltipRef} role="tooltip" style={{ left: position.left, top: position.top }}>
      {anchor.text}
    </div>,
    document.body,
  );
}
