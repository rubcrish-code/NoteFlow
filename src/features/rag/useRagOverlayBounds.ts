import { useLayoutEffect, useState, type RefObject } from "react";

export function useRagOverlayBounds(
  headerRef: RefObject<HTMLElement | null>,
  composerRef: RefObject<HTMLElement | null>,
) {
  const [bounds, setBounds] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const header = headerRef.current;
    const composer = composerRef.current;
    if (!header || !composer) return;
    const update = () => {
      // offsetHeight is in layout CSS pixels, including under the CSS zoom fallback.
      const next = { top: header.offsetHeight, bottom: composer.offsetHeight };
      setBounds((current) => current.top === next.top && current.bottom === next.bottom ? current : next);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(header);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [headerRef, composerRef]);
  return bounds;
}
