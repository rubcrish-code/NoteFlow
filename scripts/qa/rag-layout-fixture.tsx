import React, { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { AppZoomProvider } from "../../src/shared/AppZoomContext";
import { RagChatPage } from "../../src/features/rag/RagChatPage";
import "../../src/styles/tokens.css";
import "../../src/styles/app.css";
import "../../src/styles/foundation.css";
import "../../src/styles/pages.css";
import "../../src/styles/settings.css";
import "../../src/styles/chat.css";
import "../../src/styles/rag.css";

const params = new URLSearchParams(location.search);
const timestamp = "2026-10-01T12:00:00Z";
const title = params.get("title") ?? "Очень длинное название обсуждения архитектуры проекта NoteFlow и RAG";
const longWord = "ДлинноеНеразрывноеСлово".repeat(12);
const sourceTexts = ["Краткая заметка", "Очень длинное название источника ".repeat(10), longWord,
  "https://example.invalid/" + "long-path-without-spaces".repeat(15),
  "Кириллица: архитектура и заметки", "# Markdown\n\n**Оформление** и список:\n- пункт\n".repeat(25)];
const sources = sourceTexts.map((text, index) => ({
  sourceId: `S${index + 1}`, citationNumber: index + 1, noteId: `qa-note-${index}`, chunkId: `qa-chunk-${index}`,
  noteTitle: text, snippet: text, headingPath: [text], project: index === 2 ? longWord : "ALPHA", projectId: "alpha",
  tags: [], archived: false, favorite: false, updatedAt: timestamp, matchType: "hybrid", semanticScore: 1,
  neighboringChunkIds: [],
}));
const messages = Array.from({ length: 12 }, (_, index) => ({
  id: `message-${index}`, chatId: "qa-chat", role: "assistant", createdAt: timestamp,
  content: `Ответ ${index + 1}. **Сохранённая история**.\n\n${"Текст для проверки стабильного скролла. ".repeat(10)} [[S1]]\n\n**${sourceTexts[index % sourceTexts.length]}**`, sources,
}));

mockIPC((command) => {
  if (command === "list_rag_chats") return [{ id: "qa-chat", title, createdAt: timestamp, updatedAt: timestamp, projectIds: ["alpha"], includeStandalone: true }];
  if (command === "list_rag_chat_messages") return messages;
  if (command === "list_projects") return [{ id: "alpha", title: "ALPHA", archivedAt: null }];
  if (command === "list_embedding_profiles") return [{ id: "qa-embedding", name: "QA embeddings", enabled: true, locality: "local", hasCloudConsent: true }];
  if (command === "get_embedding_index_status") return { profileId: "qa-embedding", status: "current", indexedChunks: 6 };
  if (command === "get_note_ai_status") return { hasProvider: true, providerName: "QA local", model: "qa-chat", canUse: true, privacyAccepted: true };
  throw new Error(`Unexpected fixture command: ${command}`);
});

declare global {
  interface Window { qaRagLayout: { setZoom: (zoom: number) => void }; }
}

function Fixture() {
  const [zoom, setZoom] = useState(Number(params.get("zoom") ?? 100));
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historyWidth, setHistoryWidth] = useState(280);
  const [sourcesWidth, setSourcesWidth] = useState(320);
  window.qaRagLayout = { setZoom };
  const style = {
    "--app-zoom": String(zoom / 100), "--app-page-padding-x": `${36 / (zoom / 100)}px`,
    "--app-page-padding-y": `${28 / (zoom / 100)}px`,
  } as CSSProperties;
  return <AppZoomProvider zoomPercent={zoom}><div className="app-zoom-root" style={style}>
    <RagChatPage dataReloadGeneration={0} onNavigate={() => {}} onNewNote={() => {}}
      onOpenModelSettings={() => {}} onOpenSemanticResult={() => {}} onToast={() => {}}
      ragConversationWidth={historyWidth} ragSourcesWidth={sourcesWidth} ragSourcesCollapsed={sourcesCollapsed}
      onRagSourcesCollapsedChange={setSourcesCollapsed} onRagConversationReset={() => setHistoryWidth(280)}
      onRagSourcesReset={() => setSourcesWidth(320)} onRagConversationResize={(delta) => setHistoryWidth((value) => value + delta)}
      onRagSourcesResize={(delta) => setSourcesWidth((value) => value - delta)}
      sidebar={{ collapsed: sidebarCollapsed, width: 250, localProfileName: "QA layout", onEditLocalProfile: () => {},
        onReset: () => {}, onResize: () => {}, onToggleCollapse: () => setSidebarCollapsed((value) => !value) }} />
  </div></AppZoomProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
