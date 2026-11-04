import { useEffect, useState } from "react";
import { useAppZoomPercent } from "./AppZoomContext";
import { toPhysicalLayoutPixels } from "./physicalLayout";

function readPhysicalViewportWidth(zoomPercent: number, cssZoomFallback: boolean) {
  return typeof window === "undefined" ? Number.POSITIVE_INFINITY : cssZoomFallback ? window.innerWidth : toPhysicalLayoutPixels(window.innerWidth, zoomPercent);
}

export function usePhysicalViewportWidth(explicitZoomPercent?: number, cssZoomFallback = false) {
  const contextZoomPercent = useAppZoomPercent();
  const zoomPercent = explicitZoomPercent ?? contextZoomPercent;
  const [physicalWidth, setPhysicalWidth] = useState(() => readPhysicalViewportWidth(zoomPercent, cssZoomFallback));

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    const updateWidth = () => setPhysicalWidth(readPhysicalViewportWidth(zoomPercent, cssZoomFallback));

    updateWidth();
    firstFrame = window.requestAnimationFrame(() => {
      updateWidth();
      secondFrame = window.requestAnimationFrame(updateWidth);
    });
    window.addEventListener("resize", updateWidth);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.removeEventListener("resize", updateWidth);
    };
  }, [zoomPercent, cssZoomFallback]);

  return physicalWidth;
}
