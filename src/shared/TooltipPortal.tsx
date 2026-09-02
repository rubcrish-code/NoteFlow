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
let suppressedPointerTooltip: string | null = null;

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
    let triggerObserver: MutationObserver | null = null;

    function restoreCurrentAnchor() {
      triggerObserver?.disconnect();
      triggerObserver = null;
      if (!anchorElementRef.current) return;
      const previousDescribedBy = previousDescribedByRef.current;
      if (previousDescribedBy) {
        anchorElementRef.current.setAttribute("aria-describedby", previousDescribedBy);
      } else {
        anchorElementRef.current.removeAttribute("aria-describedby");
      }
      anchorElementRef.current = null;
      previousDescribedByRef.current = null;
    }

    function hideTooltip(event?: MouseEvent | FocusEvent | Event) {
      if (event instanceof MouseEvent && event.type === "mouseout" && anchorElementRef.current) {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && anchorElementRef.current.contains(relatedTarget)) {
          return;
        }
      }

      restoreCurrentAnchor();
      setAnchor(null);
    }

    function showTooltip(target: EventTarget | null) {
      const tooltipTarget = findTooltipTarget(target);
      const text = tooltipTarget?.dataset.tooltip;
      if (!tooltipTarget || !text) {
        return;
      }

      const isNewTrigger = anchorElementRef.current !== tooltipTarget;
      if (isNewTrigger) {
        restoreCurrentAnchor();
        previousDescribedByRef.current = tooltipTarget.getAttribute("aria-describedby");
      }
      anchorElementRef.current = tooltipTarget;
      const describedBy = previousDescribedByRef.current?.split(/\s+/).filter(Boolean) ?? [];
      if (!describedBy.includes(TOOLTIP_ID)) {
        tooltipTarget.setAttribute("aria-describedby", [...describedBy, TOOLTIP_ID].join(" "));
      }
      setAnchor({ rect: tooltipTarget.getBoundingClientRect(), text });
      triggerObserver?.disconnect();
      triggerObserver = new MutationObserver(() => {
        const activeTrigger = anchorElementRef.current;
        if (!activeTrigger || !activeTrigger.isConnected || activeTrigger.dataset.tooltip !== text) {
          hideTooltip();
          return;
        }
        const style = window.getComputedStyle(activeTrigger);
        if (activeTrigger.closest("[hidden]") || style.display === "none" || style.visibility === "hidden") {
          hideTooltip();
        }
      });
      triggerObserver.observe(document.body, {
        attributeFilter: ["class", "data-tooltip", "hidden", "style"],
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    function handleMouseOver(event: MouseEvent) {
      if (findTooltipTarget(event.target)?.dataset.tooltip === suppressedPointerTooltip) return;
      showTooltip(event.target);
    }

    function handleFocusIn(event: FocusEvent) {
      if (findTooltipTarget(event.target)?.dataset.tooltip === suppressedPointerTooltip) return;
      showTooltip(event.target);
    }

    function handleMouseOut(event: MouseEvent) {
      hideTooltip(event);
    }

    function handlePointerMove(event: PointerEvent) {
      const nextTooltip = findTooltipTarget(event.target)?.dataset.tooltip ?? null;
      if (nextTooltip !== suppressedPointerTooltip) {
        suppressedPointerTooltip = null;
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hideTooltip(event);
      } else {
        suppressedPointerTooltip = null;
      }
    }

    function handlePointerInteraction(event: Event) {
      suppressedPointerTooltip = findTooltipTarget(event.target)?.dataset.tooltip ?? null;
      hideTooltip(event);
    }

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusout", hideTooltip);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerdown", handlePointerInteraction, true);
    document.addEventListener("click", handlePointerInteraction, true);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("focusout", hideTooltip);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerdown", handlePointerInteraction, true);
      document.removeEventListener("click", handlePointerInteraction, true);
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
      restoreCurrentAnchor();
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
