import { useEffect, useLayoutEffect, useRef } from "react";

export type WorkspacePanelKey = "sidebarWidth" | "listWidth" | "chatWidth";
export interface PanelResizeConfiguration {
  value: number;
  minimum: number;
  maximum: number;
  zoom: number;
}

export function createPanelResizeSession(configuration: PanelResizeConfiguration) {
  let delta = 0;
  return {
    move(cssDelta: number) {
      delta += cssDelta * configuration.zoom;
      return Math.round(Math.max(configuration.minimum, Math.min(configuration.maximum, configuration.value + delta)));
    },
  };
}

const variables = { sidebarWidth: "--sbw", listWidth: "--listw", chatWidth: "--chatw" } as const;

export function panelPointerScale(zoomPercent: number, cssZoomFallback: boolean) {
  // Native WebView zoom scales clientX; CSS zoom keeps viewport clientX physical.
  return cssZoomFallback ? 1 : zoomPercent / 100;
}

// Pointer frames only touch the owning grid's CSS variable. React and persistence
// see one committed preference after capture ends, never intermediate drag widths.
export function useWorkspacePanelResize(options: {
  configuration: (key: WorkspacePanelKey, page: boolean) => PanelResizeConfiguration;
  onBegin: () => void;
  onFinish: () => void;
  onCommit: (key: WorkspacePanelKey, value: number) => void;
}) {
  const latest = useRef(options); latest.current = options;
  const active = useRef<{ root: HTMLElement; key: WorkspacePanelKey; variable: string; value: number; initial: number; session: ReturnType<typeof createPanelResizeSession> } | null>(null);
  const committed = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (committed.current) {
      delete committed.current.dataset.panelResizing;
      committed.current = null;
    }
  });
  useEffect(() => () => {
    if (active.current) delete active.current.root.dataset.panelResizing;
    if (committed.current) delete committed.current.dataset.panelResizing;
  }, []);
  return {
    begin(key: WorkspacePanelKey, handle: HTMLElement) {
      const root = handle.closest<HTMLElement>("[data-panel-layout]");
      if (!root) return;
      const page = root.dataset.panelLayout === "page";
      const configuration = latest.current.configuration(key, page);
      active.current = { root, key, variable: page ? "--page-sbw" : variables[key], value: configuration.value, initial: configuration.value, session: createPanelResizeSession(configuration) };
      root.dataset.panelResizing = "true";
      latest.current.onBegin();
    },
    move(delta: number) {
      const drag = active.current;
      if (!drag) return;
      drag.value = drag.session.move(delta);
      drag.root.style.setProperty(drag.variable, `${drag.value}px`);
    },
    end() {
      const drag = active.current;
      if (!drag) return;
      active.current = null;
      latest.current.onFinish();
      if (drag.value === drag.initial) { delete drag.root.dataset.panelResizing; return; }
      committed.current = drag.root;
      latest.current.onCommit(drag.key, drag.value);
    },
  };
}
