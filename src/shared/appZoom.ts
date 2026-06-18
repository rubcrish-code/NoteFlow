export const APP_ZOOM_STORAGE_KEY = "noteflow.appZoom";
export const APP_ZOOM_DEFAULT = 100;
export const APP_ZOOM_MIN = 80;
export const APP_ZOOM_MAX = 160;
export const APP_ZOOM_STEP = 5;

export type AppZoomAction = "increase" | "decrease" | "reset";

interface AppZoomStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface AppZoomKeyEventLike {
  altKey?: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
}

export interface AppZoomWheelEventLike {
  ctrlKey?: boolean;
  deltaY: number;
}

export function normalizeAppZoom(value: number) {
  if (!Number.isFinite(value)) {
    return APP_ZOOM_DEFAULT;
  }

  const steppedValue = Math.round(value / APP_ZOOM_STEP) * APP_ZOOM_STEP;
  return Math.min(APP_ZOOM_MAX, Math.max(APP_ZOOM_MIN, steppedValue));
}

export function getNextAppZoom(currentZoom: number, action: AppZoomAction) {
  const normalizedZoom = normalizeAppZoom(currentZoom);

  if (action === "reset") {
    return APP_ZOOM_DEFAULT;
  }

  return normalizeAppZoom(normalizedZoom + (action === "increase" ? APP_ZOOM_STEP : -APP_ZOOM_STEP));
}

export function getZoomActionFromWheel(event: AppZoomWheelEventLike): AppZoomAction | null {
  if (!event.ctrlKey || event.deltaY === 0) {
    return null;
  }

  return event.deltaY < 0 ? "increase" : "decrease";
}

export function getZoomActionFromKey(event: AppZoomKeyEventLike): AppZoomAction | null {
  const isCommand = Boolean(event.ctrlKey || event.metaKey);
  if (!isCommand || event.altKey) {
    return null;
  }

  if (event.key === "0") {
    return "reset";
  }

  if (event.key === "+" || event.key === "=") {
    return "increase";
  }

  if (event.key === "-" || event.key === "_") {
    return "decrease";
  }

  return null;
}

export function readStoredAppZoom(storage: Pick<AppZoomStorage, "getItem"> | null | undefined) {
  if (!storage) {
    return APP_ZOOM_DEFAULT;
  }

  const storedValue = storage.getItem(APP_ZOOM_STORAGE_KEY);
  if (storedValue === null) {
    return APP_ZOOM_DEFAULT;
  }

  return normalizeAppZoom(Number(storedValue));
}

export function writeStoredAppZoom(storage: Pick<AppZoomStorage, "setItem"> | null | undefined, zoomPercent: number) {
  storage?.setItem(APP_ZOOM_STORAGE_KEY, String(normalizeAppZoom(zoomPercent)));
}

export function formatAppZoomToast(zoomPercent: number) {
  return `Масштаб: ${normalizeAppZoom(zoomPercent)}%`;
}
