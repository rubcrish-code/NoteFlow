import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_ZOOM_DEFAULT,
  formatAppZoomToast,
  getNextAppZoom,
  getZoomActionFromKey,
  getZoomActionFromWheel,
  normalizeAppZoom,
  type AppZoomAction,
} from "./appZoom";

interface UseAppZoomOptions {
  onZoomChange: (message: string) => void;
  onZoomPercentChange: (zoomPercent: number) => void;
  zoomPercent: number;
}

export function useAppZoom({ onZoomChange, onZoomPercentChange, zoomPercent }: UseAppZoomOptions) {
  const normalizedZoomPercent = normalizeAppZoom(zoomPercent);
  const [useCssZoomFallback, setUseCssZoomFallback] = useState(false);
  const zoomRef = useRef(normalizedZoomPercent);

  const applyZoom = useCallback(
    (action: AppZoomAction) => {
      const nextZoom = getNextAppZoom(zoomRef.current, action);
      const shouldNotify = nextZoom !== zoomRef.current || action === "reset";
      zoomRef.current = nextZoom;
      onZoomPercentChange(nextZoom);
      if (shouldNotify) {
        onZoomChange(formatAppZoomToast(nextZoom));
      }
    },
    [onZoomChange, onZoomPercentChange],
  );

  const setZoom = useCallback(
    (nextZoom: number) => {
      const normalizedZoom = normalizeAppZoom(nextZoom);
      const shouldNotify = normalizedZoom !== zoomRef.current;
      zoomRef.current = normalizedZoom;
      onZoomPercentChange(normalizedZoom);
      if (shouldNotify) {
        onZoomChange(formatAppZoomToast(normalizedZoom));
      }
    },
    [onZoomChange, onZoomPercentChange],
  );

  useEffect(() => {
    zoomRef.current = normalizedZoomPercent;
  }, [normalizedZoomPercent]);

  useEffect(() => {
    const zoomFactor = normalizedZoomPercent / APP_ZOOM_DEFAULT;
    document.documentElement.style.setProperty("--app-zoom", String(zoomFactor));
    document.documentElement.style.setProperty("--app-zoom-percent", `${normalizedZoomPercent}%`);

    let isCancelled = false;
    try {
      void getCurrentWebview()
        .setZoom(zoomFactor)
        .then(() => {
          if (!isCancelled) {
            setUseCssZoomFallback(false);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setUseCssZoomFallback(true);
          }
        });
    } catch {
      setUseCssZoomFallback(true);
    }

    return () => {
      isCancelled = true;
    };
  }, [normalizedZoomPercent]);

  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      const action = getZoomActionFromWheel(event);
      if (action) {
        applyZoom(action);
      }
    }

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [applyZoom]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const action = getZoomActionFromKey(event);
      if (!action) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      applyZoom(action);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [applyZoom]);

  return {
    decreaseZoom: () => applyZoom("decrease"),
    increaseZoom: () => applyZoom("increase"),
    resetZoom: () => applyZoom("reset"),
    setZoom,
    useCssZoomFallback,
    zoomPercent: normalizedZoomPercent,
  };
}
