import { useEffect, useState } from "react";
import { useAppZoomPercent } from "./AppZoomContext";
import { toPhysicalLayoutPixels } from "./physicalLayout";

function readPhysicalViewportWidth(zoomPercent: number) {
  return typeof window === "undefined" ? Number.POSITIVE_INFINITY : toPhysicalLayoutPixels(window.innerWidth, zoomPercent);
}

export function usePhysicalViewportWidth(explicitZoomPercent?: number) {
  const contextZoomPercent = useAppZoomPercent();
  const zoomPercent = explicitZoomPercent ?? contextZoomPercent;
  const [physicalWidth, setPhysicalWidth] = useState(() => readPhysicalViewportWidth(zoomPercent));

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    const updateWidth = () => setPhysicalWidth(readPhysicalViewportWidth(zoomPercent));

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
  }, [zoomPercent]);

  return physicalWidth;
}
