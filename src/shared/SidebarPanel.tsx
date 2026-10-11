import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const SIDEBAR_TRANSITION_MS = 240;

interface SidebarPanelProps {
  children: ReactNode;
  className: string;
  collapsed?: boolean;
  open: boolean;
  restoreFocusSelector?: string;
}

// Retain the closing subtree without owning its data or background request lifecycle.
export function SidebarPanel({ children, className, collapsed = false, open, restoreFocusSelector }: SidebarPanelProps) {
  const [retained, setRetained] = useState(open);
  const [ready, setReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const previousLayout = useRef({ open, collapsed });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setReady(true), []);

  useLayoutEffect(() => {
    if (previousLayout.current.open === open && previousLayout.current.collapsed === collapsed) return;
    previousLayout.current = { open, collapsed };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setMoving(false); return; }
    setMoving(true);
    let frame = 0;
    // Restore anchoring only after the browser has laid out the final grid width.
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setMoving(false));
      });
    }, SIDEBAR_TRANSITION_MS);
    return () => { window.clearTimeout(timer); window.cancelAnimationFrame(frame); };
  }, [open, collapsed]);

  useLayoutEffect(() => {
    if (!open && ref.current?.contains(document.activeElement)) {
      ref.current.parentElement?.querySelector<HTMLElement>(restoreFocusSelector ?? "[data-panel-focus-return]")?.focus({ preventScroll: true });
    }
  }, [open, restoreFocusSelector]);

  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    if (!retained) return;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const finish = () => setRetained(false);
    if (media?.matches) { finish(); return; }
    const timer = window.setTimeout(finish, SIDEBAR_TRANSITION_MS);
    const reduce = () => { if (media?.matches) finish(); };
    media?.addEventListener?.("change", reduce);
    return () => { window.clearTimeout(timer); media?.removeEventListener?.("change", reduce); };
  }, [open, retained]);

  return <div aria-hidden={!open} className={`sidebar-panel ${className}`} data-panel-animate={ready} data-panel-moving={moving} data-panel-open={open} hidden={!open && !retained} inert={!open} ref={ref}>
    {open || retained ? children : null}
  </div>;
}
