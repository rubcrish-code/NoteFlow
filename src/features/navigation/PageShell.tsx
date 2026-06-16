import { useState, type CSSProperties, type ReactNode } from "react";
import type { AppSection } from "../../app/types";
import { ResizeHandle } from "../../shared/ResizeHandle";
import { MainSidebar } from "./MainSidebar";

interface PageShellProps {
  activeSection: AppSection;
  children: ReactNode;
  contentClassName?: string;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onSidebarReset?: () => void;
  onSidebarResize?: (deltaX: number) => void;
  onToggleSidebarCollapse?: () => void;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  onToast: (message: string) => void;
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
  onSidebarReset,
  onSidebarResize,
  onToggleSidebarCollapse,
  onToast,
  sidebarCollapsed,
  sidebarWidth,
}: PageShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const resolvedCollapsed = sidebarCollapsed ?? isSidebarCollapsed;
  const shellStyle: PageShellStyle = {
    "--page-sbw": `${resolvedCollapsed ? 74 : sidebarWidth ?? 250}px`,
  };

  return (
    <div className={`page-shell ${resolvedCollapsed ? "collapse-sb" : ""}`} style={shellStyle}>
      <MainSidebar
        activeSection={activeSection}
        collapsed={resolvedCollapsed}
        onNavigate={onNavigate}
        onNewNote={onNewNote}
        onToast={onToast}
        onToggleCollapse={onToggleSidebarCollapse ?? (() => setIsSidebarCollapsed((value) => !value))}
      />
      {!resolvedCollapsed && onSidebarResize ? (
        <ResizeHandle className="page-resize-sb" label="Изменить ширину сайдбара" onReset={onSidebarReset} onResize={onSidebarResize} />
      ) : null}
      <main className={`simple-page ${contentClassName}`}>{children}</main>
    </div>
  );
}
