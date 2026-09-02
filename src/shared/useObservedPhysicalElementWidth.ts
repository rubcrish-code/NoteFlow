import type { RefObject } from "react";
import { useAppZoomPercent } from "./AppZoomContext";
import { toPhysicalLayoutPixels } from "./physicalLayout";
import { useObservedElementWidth } from "./useObservedElementWidth";

export function useObservedPhysicalElementWidth<T extends HTMLElement>(elementRef: RefObject<T | null>) {
  const zoomPercent = useAppZoomPercent();
  return toPhysicalLayoutPixels(useObservedElementWidth(elementRef), zoomPercent);
}
