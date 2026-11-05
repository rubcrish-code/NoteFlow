import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AppSection } from "../../app/types";
import { ResizeHandle } from "../../shared/ResizeHandle";
import { getPageLayoutMode } from "../../shared/physicalLayout";
import { useObservedPhysicalElementWidth } from "../../shared/useObservedPhysicalElementWidth";
import { MainSidebar } from "./MainSidebar";

export interface PageShellSidebarProps {
  collapsed: boolean;
  localProfileName: string;
  onEditLocalProfile: () => void;
  onReset: () => void;
  onResize: (deltaX: number) => void;
  onResizeStart?: (handle: HTMLDivElement) => void;
  onResizeEnd?: () => void;
  onToggleCollapse: () => void;
  width: number;
}

interface PageShellProps {
  activeSection: AppSection;
  children: ReactNode;
  contentClassName?: string;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
  sidebar?: PageShellSidebarProps;
}

type PageShellStyle = CSSProperties & {
  "--page-sbw": string;
};

export function PageShell({
  activeSection,
  children,
  contentClassName = "",
  onNavigate,
  onNewNote,
  onToast,
  sidebar,
}: PageShellProps) {
  useInterfaceLanguage();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const pageLayoutMode = getPageLayoutMode(useObservedPhysicalElementWidth(contentRef));
  const resolvedCollapsed = sidebar?.collapsed ?? isSidebarCollapsed;
  const shellStyle: PageShellStyle = {
    "--page-sbw": `${resolvedCollapsed ? 74 : sidebar?.width ?? 250}px`,
  };

  return (
    <div className={`page-shell ${resolvedCollapsed ? "collapse-sb" : ""}`} data-panel-layout="page" style={shellStyle}>
      <MainSidebar
        activeSection={activeSection}
        collapsed={resolvedCollapsed}
        localProfileName={sidebar?.localProfileName ?? translate("ui.91616dd5b60d")}
        onEditLocalProfile={sidebar?.onEditLocalProfile ?? (() => undefined)}
        onNavigate={onNavigate}
        onNewNote={onNewNote}
        onToast={onToast}
        onToggleCollapse={sidebar?.onToggleCollapse ?? (() => setIsSidebarCollapsed((value) => !value))}
      />
      {!resolvedCollapsed && sidebar ? (
        <ResizeHandle className="page-resize-sb" label={translate("ui.edfdc72b827b")} onReset={sidebar.onReset} onResize={sidebar.onResize} onResizeStart={sidebar.onResizeStart} onResizeEnd={sidebar.onResizeEnd} />
      ) : null}
      <main className={`simple-page page-layout-${pageLayoutMode} ${contentClassName}`} data-page-layout={pageLayoutMode} ref={contentRef}>{children}</main>
    </div>
  );
}
