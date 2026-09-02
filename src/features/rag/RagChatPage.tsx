import { useRef } from "react";
import type { AppSection } from "../../app/types";
import type { SemanticSearchResult } from "../../services/embeddingService";
import { useObservedPhysicalElementWidth } from "../../shared/useObservedPhysicalElementWidth";
import { PageShell, type PageShellSidebarProps } from "../navigation/PageShell";
import { getRagLayoutMode } from "./ragResponsiveLayout";
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
  ragSourcesCollapsed: boolean;
  ragSourcesWidth: number;
  sidebar: PageShellSidebarProps;
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
  onToast,
  ragConversationWidth,
  ragSourcesCollapsed,
  ragSourcesWidth,
  sidebar,
}: RagChatPageProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const layoutMode = getRagLayoutMode(useObservedPhysicalElementWidth(shellRef));

  return (
    <PageShell
      activeSection="rag"
      contentClassName="rag-simple-page"
      onNavigate={onNavigate}
      onNewNote={onNewNote}
      onToast={onToast}
      sidebar={sidebar}
    >
      <div className="rag-page-shell" data-layout={layoutMode} ref={shellRef}>
        <RagChatWorkspace
          conversationWidth={ragConversationWidth}
          dataReloadGeneration={dataReloadGeneration}
          layoutMode={layoutMode}
          onConversationReset={onRagConversationReset}
          onConversationResize={onRagConversationResize}
          onOpenModelSettings={onOpenModelSettings}
          onOpenResult={onOpenSemanticResult}
          onSourcesCollapsedChange={onRagSourcesCollapsedChange}
          onSourcesReset={onRagSourcesReset}
          onSourcesResize={onRagSourcesResize}
          onToast={onToast}
          preferredSourcesCollapsed={ragSourcesCollapsed}
          sourcesWidth={ragSourcesWidth}
        />
      </div>
    </PageShell>
  );
}
