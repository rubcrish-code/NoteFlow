import { useState, type CSSProperties, type ReactNode } from "react";
import type { AppSection } from "../../app/types";
import { MainSidebar } from "./MainSidebar";

interface PageShellProps {
  activeSection: AppSection;
  children: ReactNode;
  contentClassName?: string;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

type PageShellStyle = CSSProperties & {
  "--page-sbw": string;
};

export function PageShell({ activeSection, children, contentClassName = "", onNavigate, onNewNote, onToast }: PageShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const shellStyle: PageShellStyle = {
    "--page-sbw": `${isSidebarCollapsed ? 74 : 250}px`,
  };

  return (
    <div className={`page-shell ${isSidebarCollapsed ? "collapse-sb" : ""}`} style={shellStyle}>
      <MainSidebar
        activeSection={activeSection}
        collapsed={isSidebarCollapsed}
        onNavigate={onNavigate}
        onNewNote={onNewNote}
        onToast={onToast}
        onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
      />
      <main className={`simple-page ${contentClassName}`}>{children}</main>
    </div>
  );
}
