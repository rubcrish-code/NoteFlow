import { isTauri } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyEditorWindowMinimum } from "./editorNativeWindowSize";

export function useEditorWindowMinimum(minimumWidth: number, onError: () => void) {
  const [maximumWidth, setMaximumWidth] = useState(() => isTauri() ? window.screen.availWidth : Infinity);
  const errorRef = useRef(onError); errorRef.current = onError;
  const workRef = useRef(Promise.resolve());
  const prepareWidth = useCallback((width: number, current: () => boolean = () => true) => {
    if (!isTauri()) return Promise.resolve();
    const job = workRef.current.catch(() => undefined).then(async () => {
      if (!current()) return;
      if (width > maximumWidth) throw new Error("Unsupported editor width");
      const appWindow = getCurrentWindow();
      await applyEditorWindowMinimum(appWindow, width, current);
    });
    workRef.current = job;
    return job;
  }, [maximumWidth]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const appWindow = getCurrentWindow();
    let wasManaged = false;
    async function checkRestore() {
      const managed = await appWindow.isMaximized() || await appWindow.isFullscreen();
      if (disposed) return;
      const restored = wasManaged && !managed;
      wasManaged = managed;
      if (restored) {
        workRef.current = workRef.current.catch(() => undefined).then(() =>
          applyEditorWindowMinimum(appWindow, minimumWidth, () => !disposed),
        ).catch(() => { if (!disposed) errorRef.current(); });
      }
    }
    void checkRestore().catch(() => undefined);
    void appWindow.onResized(() => { void checkRestore().catch(() => undefined); }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, [minimumWidth]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    void currentMonitor().then((monitor) => {
      if (monitor && !disposed) setMaximumWidth(Math.floor(monitor.workArea.size.width / monitor.scaleFactor));
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    // Serialize native calls so rapid zoom/panel toggles cannot apply an old
    // minimum after the newer configuration has already been committed.
    workRef.current = workRef.current.catch(() => undefined).then(async () => {
      if (disposed) return;
      const appWindow = getCurrentWindow();
      if (minimumWidth > maximumWidth) { errorRef.current(); return; }
      await applyEditorWindowMinimum(appWindow, minimumWidth, () => !disposed);
    }).catch(() => { if (!disposed) errorRef.current(); });
    return () => { disposed = true; };
  }, [minimumWidth, maximumWidth]);
  return { maximumWidth, prepareWidth };
}
