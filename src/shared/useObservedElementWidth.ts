import { useEffect, useState, type RefObject } from "react";

export function useObservedElementWidth<T extends HTMLElement>(elementRef: RefObject<T | null>) {
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return undefined;
    }

    const updateWidth = (nextWidth: number) => {
      setWidth((current) => Math.abs(current - nextWidth) < 0.5 ? current : nextWidth);
    };

    updateWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => updateWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef]);

  return width;
}
