import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { SettingsPage } from "../../src/features/settings/SettingsPage";
import { AppZoomProvider } from "../../src/shared/AppZoomContext";
import { TooltipPortal } from "../../src/shared/TooltipPortal";
import "../../src/styles/tokens.css";
import "../../src/styles/app.css";
import "../../src/styles/foundation.css";
import "../../src/styles/pages.css";
import "../../src/styles/settings.css";

const params = new URLSearchParams(location.search);
const zoom = Number(params.get("zoom") ?? 100);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
mockIPC((command) => {
  if (command === "plugin:app|version") return "1.0.0-rc.2";
  if (command === "list_llm_providers" || command === "list_embedding_profiles") return [];
  if (command === "get_knowledge_index_status") return {
    chunkCount: 0, chunkerVersion: 1, failedNotes: 0, indexedNotes: 0,
    pendingNotes: 0, totalNotes: 0, status: "current",
  };
  throw new Error(`Unexpected QA command: ${command}`);
});

function Fixture() {
  const [collapsed, setCollapsed] = useState(false);
  const noop = () => {};
  const unavailable = async (): Promise<never> => { throw new Error("Not used in layout QA"); };
  // Emulate WebView zoom in a browser without percentage-size compensation.
  const factor = zoom / 100;
  const style = { "--app-zoom": String(factor), zoom: factor,
    width: `${innerWidth / factor}px`, height: `${innerHeight / factor}px` } as CSSProperties;
  return <AppZoomProvider zoomPercent={zoom}>
    <div className="app-zoom-root" style={style}>
      <SettingsPage appZoomPercent={zoom} localProfileName="QA" theme="light" onNavigate={noop} onNewNote={noop}
        onBackupCreate={async () => null} onBackupPreview={unavailable} onImportBackup={unavailable}
        onImportMarkdown={async () => 0} onExportCurrentNote={noop} onExportCurrentProject={noop}
        onEditLocalProfile={noop} onThemeChange={noop} onToast={noop}
        onZoomDecrease={noop} onZoomIncrease={noop} onZoomReset={noop}
        sidebar={{ collapsed, localProfileName: "QA", width: 250, onEditLocalProfile: noop, onReset: noop,
          onResize: noop, onToggleCollapse: () => setCollapsed((current) => !current) }} />
      <TooltipPortal />
    </div>
  </AppZoomProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
