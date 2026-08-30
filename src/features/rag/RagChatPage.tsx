import type { AppSection } from "../../app/types";
import type { SemanticSearchResult } from "../../services/embeddingService";
import { PageShell } from "../navigation/PageShell";
import { RagChatWorkspace } from "./RagChatWorkspace";

interface RagChatPageProps {
  dataReloadGeneration: number;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onOpenModelSettings: () => void;
  onOpenSemanticResult: (result: SemanticSearchResult) => void;
  onRagConversationReset: () => void;
  onRagConversationResize: (deltaX: number) => void;
  onRagSourcesCollapsedChange: (collapsed: boolean) => void;
  onRagSourcesReset: () => void;
  onRagSourcesResize: (deltaX: number) => void;
  onSidebarReset: () => void;
  onSidebarResize: (deltaX: number) => void;
  onToggleSidebarCollapse: () => void;
  ragSourcesCollapsed: boolean;
  ragSourcesWidth: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  onToast: (message: string) => void;
  ragConversationWidth: number;
}

export function RagChatPage({
  dataReloadGeneration,
  onNavigate,
  onNewNote,
  onOpenModelSettings,
  onOpenSemanticResult,
  onRagConversationReset,
  onRagConversationResize,
  onRagSourcesCollapsedChange,
  onRagSourcesReset,
  onRagSourcesResize,
  onSidebarReset,
  onSidebarResize,
  onToggleSidebarCollapse,
  onToast,
  ragConversationWidth,
  ragSourcesCollapsed,
  ragSourcesWidth,
  sidebarCollapsed,
  sidebarWidth,
}: RagChatPageProps) {
  return (
    <PageShell
      activeSection="rag"
      contentClassName="rag-simple-page"
      onNavigate={onNavigate}
      onNewNote={onNewNote}
      onSidebarReset={onSidebarReset}
      onSidebarResize={onSidebarResize}
      onToggleSidebarCollapse={onToggleSidebarCollapse}
      onToast={onToast}
      sidebarCollapsed={sidebarCollapsed}
      sidebarWidth={sidebarWidth}
    >
      <div className="rag-page-shell">
        <RagChatWorkspace
          conversationWidth={ragConversationWidth}
          dataReloadGeneration={dataReloadGeneration}
          onConversationReset={onRagConversationReset}
          onConversationResize={onRagConversationResize}
          onOpenModelSettings={onOpenModelSettings}
          onOpenResult={onOpenSemanticResult}
          onSourcesCollapsedChange={onRagSourcesCollapsedChange}
          onSourcesReset={onRagSourcesReset}
          onSourcesResize={onRagSourcesResize}
          onToast={onToast}
          sourcesCollapsed={ragSourcesCollapsed}
          sourcesWidth={ragSourcesWidth}
        />
      </div>
    </PageShell>
  );
}
