import type { ReactNode } from "react";
import type { AppSection } from "../../app/types";
import { MainSidebar } from "./MainSidebar";

interface PageShellProps {
  activeSection: AppSection;
  children: ReactNode;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

export function PageShell({ activeSection, children, onNavigate, onNewNote, onToast }: PageShellProps) {
  return (
    <div className="page-shell">
      <MainSidebar activeSection={activeSection} onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast} />
      <main className="simple-page">{children}</main>
    </div>
  );
}
