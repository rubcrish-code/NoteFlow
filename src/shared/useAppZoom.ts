import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_ZOOM_DEFAULT,
  formatAppZoomToast,
  getNextAppZoom,
  getZoomActionFromKey,
  getZoomActionFromWheel,
  normalizeAppZoom,
  readStoredAppZoom,
  writeStoredAppZoom,
  type AppZoomAction,
} from "./appZoom";

function getZoomStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function useAppZoom(onZoomChange: (message: string) => void) {
  const [zoomPercent, setZoomPercent] = useState(() => readStoredAppZoom(getZoomStorage()));
  const [useCssZoomFallback, setUseCssZoomFallback] = useState(false);
  const zoomRef = useRef(zoomPercent);

  const applyZoom = useCallback(
    (action: AppZoomAction) => {
      const nextZoom = getNextAppZoom(zoomRef.current, action);
      const shouldNotify = nextZoom !== zoomRef.current || action === "reset";
      zoomRef.current = nextZoom;
      setZoomPercent(nextZoom);
      if (shouldNotify) {
        onZoomChange(formatAppZoomToast(nextZoom));
      }
    },
    [onZoomChange],
  );

  const setZoom = useCallback(
    (nextZoom: number) => {
      const normalizedZoom = normalizeAppZoom(nextZoom);
      const shouldNotify = normalizedZoom !== zoomRef.current;
      zoomRef.current = normalizedZoom;
      setZoomPercent(normalizedZoom);
      if (shouldNotify) {
        onZoomChange(formatAppZoomToast(normalizedZoom));
      }
    },
    [onZoomChange],
  );

  useEffect(() => {
    zoomRef.current = zoomPercent;
    writeStoredAppZoom(getZoomStorage(), zoomPercent);
  }, [zoomPercent]);

  useEffect(() => {
    const zoomFactor = zoomPercent / APP_ZOOM_DEFAULT;
    document.documentElement.style.setProperty("--app-zoom", String(zoomFactor));
    document.documentElement.style.setProperty("--app-zoom-percent", `${zoomPercent}%`);

    let isCancelled = false;
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

    return () => {
      isCancelled = true;
    };
  }, [zoomPercent]);

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
    zoomPercent,
  };
}
