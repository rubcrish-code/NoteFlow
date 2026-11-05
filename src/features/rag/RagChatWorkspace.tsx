import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import * as embeddingService from "../../services/embeddingService";
import type { EmbeddingIndexStatus, EmbeddingProfile, SemanticSearchResult } from "../../services/embeddingService";
import { acceptNoteAiPrivacy, getNoteAiStatus, type NoteAiStatus } from "../../services/noteAiService";
import * as ragChatService from "../../services/ragChatService";
import { type RagChat, type RagChatMessage, type RagMessageSource } from "../../services/ragChatService";
import { Icon } from "../../shared/Icon";
import { formatDisplayDate } from "../../shared/displayDate";
import { ChatComposer } from "../../shared/ChatComposer";
import { MenuPopover } from "../../shared/MenuPopover";
import { ResizeHandle } from "../../shared/ResizeHandle";
import { formatRussianCount, FRAGMENT_COUNT_FORMS } from "../../shared/russianPlural";
import { ChatMarkdown } from "../note-chat/ChatMarkdown";
import { SettingsModalShell } from "../settings/ModelSettingsUi";
import { ragAnswerForClipboard } from "./ragCitations";
import { ensureProvisionalRagChat, ragJobs, sendRagInBackground } from "../../services/ragBackground";
import { listProjects } from "../../services/dataService";
import type { ProjectCard } from "../../app/types";
import { ProjectScopeSelector } from "./ProjectScopeSelector";
import { isRagHistoryOverlayMode, resolveRagPanelVisibility, transitionRagOverlays, type RagLayoutMode } from "./ragResponsiveLayout";
import { useRagOverlayBounds } from "./useRagOverlayBounds";
import { ragDrafts } from "./ragDrafts";
import { SidebarPanel } from "../../shared/SidebarPanel";
import { uiMessage } from "../../shared/uiMessages";

interface RagChatWorkspaceProps {
  conversationWidth: number;
  dataReloadGeneration: number;
  layoutMode: RagLayoutMode;
  onConversationReset: () => void;
  onConversationResize: (deltaX: number) => void;
  onOpenModelSettings: () => void;
  onOpenResult: (result: SemanticSearchResult) => void;
  onSourcesCollapsedChange: (collapsed: boolean) => void;
  onSourcesReset: () => void;
  onSourcesResize: (deltaX: number) => void;
  onToast: (message: string) => void;
  preferredSourcesCollapsed: boolean;
  sourcesWidth: number;
}

type PendingDialog =
  | { kind: "delete"; chat: RagChat }
  | { kind: "rename"; chat: RagChat }
  | null;

export function RagChatWorkspace({
  conversationWidth,
  dataReloadGeneration,
  layoutMode,
  onConversationReset,
  onConversationResize,
  onOpenModelSettings,
  onOpenResult,
  onSourcesCollapsedChange,
  onSourcesReset,
  onSourcesResize,
  onToast,
  preferredSourcesCollapsed,
  sourcesWidth,
}: RagChatWorkspaceProps) {
  useInterfaceLanguage();
  const [chats, setChats] = useState<RagChat[]>([]);
  const activeChatId = useSyncExternalStore(ragDrafts.subscribe, ragDrafts.activeId);
  const setActiveChatId = (value: string | ((current: string) => string)) => ragDrafts.setActive(value);
  const [messages, setMessages] = useState<RagChatMessage[]>([]);
  const draft = useSyncExternalStore(ragDrafts.subscribe, () => ragDrafts.get(activeChatId));
  const setDraft = (value: string) => ragDrafts.set(activeChatId, value);
  const [profiles, setProfiles] = useState<EmbeddingProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [indexStatuses, setIndexStatuses] = useState<Record<string, EmbeddingIndexStatus>>({});
  const [generatorStatus, setGeneratorStatus] = useState<NoteAiStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [scopeBusy, setScopeBusy] = useState(false);
  const scopeBusyRef = useRef(false);
  const job = useSyncExternalStore(ragJobs.subscribe, () => ragJobs.get(activeChatId));
  const generationBusy = ragJobs.busy(activeChatId);
  const visibleGeneration = { phase: job?.phase ?? "idle", message: job?.error ?? "", retryable: Boolean(job?.userMessageId) };
  const [activeSources, setActiveSources] = useState<RagMessageSource[]>([]);
  const [preferredHistoryCollapsed, setPreferredHistoryCollapsed] = useState(false);
  const [historyOverlayOpen, setHistoryOverlayOpen] = useState(false);
  const [sourcesOverlayOpen, setSourcesOverlayOpen] = useState(false);
  const previousLayoutModeRef = useRef(layoutMode);
  const [openChatMenuId, setOpenChatMenuId] = useState("");
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [pendingPrivacyQuestion, setPendingPrivacyQuestion] = useState("");
  const historyRequestIdRef = useRef(0);
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const activeChatIdRef = useRef("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const overlayBounds = useRagOverlayBounds(headerRef, composerRef);
  const chatMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const closeChatMenu = useCallback(() => setOpenChatMenuId(""), []);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const panelVisibility = resolveRagPanelVisibility({
    historyOverlayOpen,
    layoutMode,
    preferredHistoryCollapsed,
    preferredSourcesCollapsed,
    sourcesOverlayOpen,
  });
  const { historyIsOverlay, historyVisible, sourcesIsOverlay, sourcesVisible } = panelVisibility;

  useEffect(() => {
    if (previousLayoutModeRef.current === layoutMode) return;
    const next = transitionRagOverlays(previousLayoutModeRef.current, layoutMode, {
      historyOverlayOpen,
      sourcesOverlayOpen,
      preferredHistoryCollapsed,
      preferredSourcesCollapsed,
    });
    previousLayoutModeRef.current = layoutMode;
    setHistoryOverlayOpen(next.historyOverlayOpen);
    setSourcesOverlayOpen(next.sourcesOverlayOpen);
  }, [layoutMode, historyOverlayOpen, sourcesOverlayOpen, preferredHistoryCollapsed, preferredSourcesCollapsed]);

  function openHistory() {
    if (isRagHistoryOverlayMode(layoutMode)) {
      setSourcesOverlayOpen(false);
      setHistoryOverlayOpen(true);
    } else {
      setPreferredHistoryCollapsed(false);
    }
  }

  function closeHistory() {
    if (isRagHistoryOverlayMode(layoutMode)) {
      setHistoryOverlayOpen(false);
    } else {
      setPreferredHistoryCollapsed(true);
    }
  }

  function openSources() {
    if (layoutMode === "wide") {
      onSourcesCollapsedChange(false);
    } else {
      setHistoryOverlayOpen(false);
      setSourcesOverlayOpen(true);
    }
  }

  function closeSources() {
    if (layoutMode === "wide") {
      onSourcesCollapsedChange(true);
    } else {
      setSourcesOverlayOpen(false);
    }
  }

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedIndexStatus = selectedProfile ? indexStatuses[selectedProfile.id] : undefined;
  const canRetrieve = Boolean(
    selectedProfile
    && (selectedProfile.locality === "local" || selectedProfile.hasCloudConsent)
    && (selectedIndexStatus?.status === "current" || (selectedIndexStatus?.indexedChunks ?? 0) > 0),
  );

  const refreshModelStatuses = useCallback(async (isCurrent: () => boolean = () => true) => {
    const [embeddingProfiles, aiStatus] = await Promise.all([
      embeddingService.listEmbeddingProfiles(),
      getNoteAiStatus().catch(() => null),
    ]);
    const enabledProfiles = embeddingProfiles.filter((profile) => profile.enabled);
    const statuses: Record<string, EmbeddingIndexStatus> = {};
    await Promise.all(enabledProfiles.map(async (profile) => {
      try {
        statuses[profile.id] = await embeddingService.getEmbeddingIndexStatus(profile.id);
      } catch {
        // The model remains visible even when its derived index status is unavailable.
      }
    }));
    if (!isCurrent()) return;
    setProfiles(enabledProfiles);
    setIndexStatuses(statuses);
    setGeneratorStatus(aiStatus);
    setSelectedProfileId((current) => enabledProfiles.some((profile) => profile.id === current)
      ? current
      : enabledProfiles[0]?.id ?? "");
  }, []);

  const refreshChats = useCallback(async (preferredChatId?: string) => {
    const loadedChats = await ragChatService.listRagChats();
    setChats(loadedChats);
    setActiveChatId((current) => {
      const next = preferredChatId && loadedChats.some((chat) => chat.id === preferredChatId)
        ? preferredChatId
        : loadedChats.some((chat) => chat.id === current)
          ? current
          : loadedChats[0]?.id ?? "";
      activeChatIdRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    ragDrafts.reconcileGeneration(dataReloadGeneration);
    void Promise.all([refreshChats(), refreshModelStatuses(() => !cancelled), listProjects().then((items) => { if (!cancelled) setProjects(items); })])
      .catch((error) => {
        if (!cancelled) onToastRef.current(translate("ui.ed174248829a", { p0: errorText(error) }));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      historyRequestIdRef.current += 1;
    };
  }, [dataReloadGeneration, refreshChats, refreshModelStatuses]);

  useEffect(() => {
    let cancelled = false;
    let timer: number;
    async function poll() {
      try { await refreshModelStatuses(() => !cancelled); } catch { /* Keep the last known model status. */ }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 3000);
    }
    timer = window.setTimeout(() => void poll(), 3000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [refreshModelStatuses]);

  async function changeProjectScope(projectIds: string[] | null, includeStandalone: boolean) {
    if (scopeBusyRef.current) return;
    scopeBusyRef.current = true;
    setScopeBusy(true);
    try {
      let chat = activeChat;
      if (!chat) {
        const created = await ragChatService.createRagChat(translate("ui.c44ad59fc33d"));
        chat = created;
        ragDrafts.transferNewChat(created.id);
        setChats((current) => [created, ...current]);
        activeChatIdRef.current = created.id;
        setActiveChatId(created.id);
      }
      const updated = await ragChatService.setRagChatProjects(chat.id, projectIds, includeStandalone);
      setChats((current) => current.map((item) => item.id === updated.id ? updated : item));
    } finally {
      scopeBusyRef.current = false;
      setScopeBusy(false);
    }
  }

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      setActiveSources([]);
      return;
    }
    const requestId = ++historyRequestIdRef.current;
    setIsHistoryLoading(true);
    setOpenChatMenuId("");
    void ragChatService.listRagChatMessages(activeChatId)
      .then((history) => {
        if (historyRequestIdRef.current !== requestId) return;
        const answer = ragJobs.get(activeChatId)?.result?.assistantMessage;
        const currentJob = ragJobs.get(activeChatId);
        const user: RagChatMessage | null = currentJob?.userMessageId && !history.some((message) => message.id === currentJob.userMessageId)
          ? { id: currentJob.userMessageId, chatId: activeChatId, role: "user", content: currentJob.question, sources: [], createdAt: "" } : null;
        const withUser = user ? [...history, user] : history;
        const currentHistory = answer && !withUser.some((message) => message.id === answer.id) ? [...withUser, answer] : withUser;
        setMessages(currentHistory);
        setActiveSources(latestSources(currentHistory));
      })
      .catch((error) => {
        if (historyRequestIdRef.current === requestId) {
          setMessages([]);
          setActiveSources([]);
          onToastRef.current(translate("ui.36b83f7c7d4b", { p0: errorText(error) }));
        }
      })
      .finally(() => {
        if (historyRequestIdRef.current === requestId) setIsHistoryLoading(false);
      });
  }, [activeChatId, dataReloadGeneration, job?.userMessageId, job?.result?.assistantMessage.id]);

  useEffect(() => {
    if (!job?.result) return;
    setActiveSources(job.result.assistantMessage.sources);
    void refreshChats().catch(() => {});
  }, [job?.result, refreshChats]);

  useEffect(() => {
    const scrollArea = messagesRef.current;
    if (!scrollArea) return;
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isHistoryLoading, job?.phase, job?.text]);

  async function createChat() {
    try {
      const chat = await ragChatService.createRagChat();
      activeChatIdRef.current = chat.id;
      setChats((current) => [chat, ...current]);
      setActiveChatId(chat.id);
      setMessages([]);
      setActiveSources([]);
    } catch (error) {
      onToast(translate("ui.5df255930454", { p0: errorText(error) }));
    }
  }

  async function sendQuestion() {
    const question = draft.trim();
    if (!question || ragJobs.busy(activeChatId) || scopeBusyRef.current) return;
    if (activeChat?.projectIds?.length === 0 && !activeChat.includeStandalone) {
      onToast(translate("ui.4f8579f7ae46"));
      return;
    }
    if (!generatorStatus?.hasProvider || !generatorStatus.model) {
      onToast(translate("ui.f3a20e4ebaa8"));
      onOpenModelSettings();
      return;
    }
    if (!generatorStatus.privacyAccepted) {
      if (generatorStatus.privacyScope === "external") {
        setPendingPrivacyQuestion(question);
        return;
      }
      try {
        const accepted = await acceptNoteAiPrivacy("local");
        setGeneratorStatus(accepted);
      } catch (error) {
        onToast(translate("ui.e3fac52d765f", { p0: errorText(error) }));
        return;
      }
    }
    await submitQuestion(question);
  }

  async function submitQuestion(question: string) {
    if (ragJobs.busy(activeChatId) || scopeBusyRef.current) return;
    let chat = activeChat;
    try {
      if (!chat) {
        const createdChat = await ensureProvisionalRagChat();
        chat = createdChat;
        ragDrafts.transferNewChat(createdChat.id);
        activeChatIdRef.current = createdChat.id;
        setChats((current) => [createdChat, ...current]);
        setActiveChatId(createdChat.id);
      }
      await sendRagInBackground(chat, question, selectedProfile?.id ?? null, canRetrieve);
    } catch {
      ragDrafts.recoverIfEmpty(chat?.id ?? activeChatId, question);
      onToast(translate("ui.fc2e062e7e69"));
    }
  }

  async function retryGeneration() {
    if (!activeChat || !job || job.phase !== "error" || !job.userMessageId || ragJobs.busy(activeChatId)) return;
    await sendRagInBackground(activeChat, job.question, selectedProfile?.id ?? null, canRetrieve, job.userMessageId);
  }

  async function confirmPrivacyAndSend() {
    const question = pendingPrivacyQuestion;
    if (!question || !generatorStatus) return;
    try {
      const accepted = await acceptNoteAiPrivacy(generatorStatus.privacyScope);
      setGeneratorStatus(accepted);
      setPendingPrivacyQuestion("");
      await submitQuestion(question);
    } catch (error) {
      onToast(translate("ui.90132677c89c", { p0: errorText(error) }));
    }
  }

  async function confirmRename() {
    if (pendingDialog?.kind !== "rename" || !renameDraft.trim()) return;
    try {
      const renamed = await ragChatService.renameRagChat(pendingDialog.chat.id, renameDraft);
      setChats((current) => current.map((chat) => chat.id === renamed.id ? renamed : chat));
      setPendingDialog(null);
    } catch (error) {
      onToast(translate("ui.58195ae79e27", { p0: errorText(error) }));
    }
  }

  async function confirmDelete() {
    if (pendingDialog?.kind !== "delete") return;
    try {
      const deletedId = pendingDialog.chat.id;
      await ragChatService.deleteRagChat(deletedId);
      ragDrafts.delete(deletedId);
      ragJobs.forget(deletedId);
      const remaining = chats.filter((chat) => chat.id !== deletedId);
      setChats(remaining);
      if (activeChatId === deletedId) {
        const nextChatId = remaining[0]?.id ?? "";
        activeChatIdRef.current = nextChatId;
        setActiveChatId(nextChatId);
      }
      setPendingDialog(null);
    } catch (error) {
      onToast(translate("ui.eaa640b9e563", { p0: errorText(error) }));
    }
  }

  async function copyMessage(message: RagChatMessage) {
    try {
      await navigator.clipboard.writeText(message.role === "assistant"
        ? ragAnswerForClipboard(message.content, message.sources)
        : message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? "" : current), 1500);
    } catch {
      onToast(translate("ui.f400e0b540f3"));
    }
  }

  const pageStyle = {
    "--ragcw": `${conversationWidth}px`,
    "--ragsw": `${sourcesWidth}px`,
    "--rag-overlay-top": `${overlayBounds.top}px`,
    "--rag-overlay-bottom": `${overlayBounds.bottom}px`,
  } as CSSProperties;

  return (
    <div className={`rag-page rag-production-chat rag-layout-${layoutMode} ${!sourcesVisible ? "sources-collapsed" : ""} ${!historyVisible ? "conversations-collapsed" : ""}`} style={pageStyle}>
      <SidebarPanel className={`rag-history-panel ${historyIsOverlay || layoutMode !== "wide" ? "rag-panel-overlay" : ""}`} open={historyVisible} restoreFocusSelector='[data-rag-control="history"]'>
          <aside aria-label={translate("ui.4d0383e165ba")} className={`rag-conversations ${historyIsOverlay || layoutMode !== "wide" ? "rag-panel-overlay" : ""}`}>
            <button className="secondary-btn rag-new-chat" onClick={() => void createChat()} type="button">
              <Icon name="plus" />
              {translate("ui.c44ad59fc33d")}</button>
            <div className="rag-conversation-head">
              <span>{translate("ui.654d8592b00a")}</span>
              <button aria-label={translate("ui.a6bdc81119a7")} className="icon-close-btn" data-tooltip={translate("ui.63d0aea645c8")} onClick={closeHistory} type="button">
                <Icon name={historyIsOverlay ? "x" : "back"} />
              </button>
            </div>
            <div className="rag-history">
              {chats.map((chat) => (
                <div className={`rag-history-item ${chat.id === activeChatId ? "active" : ""}`} key={chat.id}>
                  <button className="rag-history-select" onClick={() => {
                    activeChatIdRef.current = chat.id;
                    setActiveChatId(chat.id);
                  }} type="button">
                    <span>{chat.title}</span>
                    <small>{formatChatDate(chat.updatedAt)}</small>
                  </button>
                  <button
                    aria-expanded={openChatMenuId === chat.id}
                    aria-haspopup="menu"
                    aria-label={translate("ui.4a8109e62ea5", { p0: chat.title })}
                    data-tooltip={translate("ui.536378f2725c")}
                    className="rag-history-menu-button"
                    onClick={(event) => {
                      chatMenuAnchorRef.current = event.currentTarget;
                      setOpenChatMenuId((current) => current === chat.id ? "" : chat.id);
                    }}
                    type="button"
                  >
                    <Icon name="dots" />
                  </button>
                  <MenuPopover
                    anchorRef={chatMenuAnchorRef}
                    ariaLabel={translate("ui.9148eed4d60f", { p0: chat.title })}
                    className="rag-history-menu"
                    isOpen={openChatMenuId === chat.id}
                    onClose={closeChatMenu}
                    preferredWidth={164}
                  >
                      <button onClick={() => {
                        setRenameDraft(chat.title);
                        setPendingDialog({ kind: "rename", chat });
                        setOpenChatMenuId("");
                      }} role="menuitem" type="button">{translate("ui.194306e20807")}</button>
                      <button className="danger" onClick={() => {
                        setPendingDialog({ kind: "delete", chat });
                        setOpenChatMenuId("");
                      }} role="menuitem" type="button">{translate("ui.be99b1361201")}</button>
                  </MenuPopover>
                </div>
              ))}
              {!isLoading && chats.length === 0 ? <div className="rag-history-empty">{translate("ui.dfa9a489bf00")}</div> : null}
            </div>
          </aside>
      </SidebarPanel>
      {historyVisible && !historyIsOverlay ? <ResizeHandle className="rag-conversation-resize" label={translate("ui.abfae06156dc")} onReset={onConversationReset} onResize={onConversationResize} /> : null}

      <main className="rag-main-chat">
        <header className="rag-chat-header" ref={headerRef}>
          <div className="rag-chat-top">
            <div className="rag-chat-title">
              {!historyVisible ? (
                <button aria-label={translate("ui.89dd83d87d36")} className="icon-close-btn" data-tooltip={translate("ui.491f00fb8444")} data-rag-control="history" onClick={openHistory} type="button">
                  <Icon name="forward" />
                </button>
              ) : null}
              <div>
                <b>{activeChat?.title ?? translate("ui.c44ad59fc33d")}</b>
                <span>{activeChat?.projectIds ? activeChat.includeStandalone ? activeChat.projectIds.length ? translate("ui.bdfc8e48e6c4") : translate("ui.25bdb17e9ee8") : activeChat.projectIds.length ? translate("ui.c3318c6be945") : translate("ui.9b59e7ab7d49") : translate("ui.a69221069214")}</span>
              </div>
            </div>
            <div className="rag-top-actions">
              <ProjectScopeSelector busy={scopeBusy} includeStandalone={activeChat?.includeStandalone ?? false} onChange={changeProjectScope} projects={projects} selectedIds={activeChat?.projectIds ?? null} />
              <button aria-label={translate("ui.12f204378198")} className="icon-close-btn" data-tooltip={translate("ui.12f204378198")} onClick={onOpenModelSettings} type="button">
                <Icon name="gear" />
              </button>
              {!sourcesVisible ? (
                <button aria-label={translate("ui.00a4b900d44c")} className="secondary-btn compact" data-tooltip={translate("ui.00a4b900d44c")} data-rag-control="sources" onClick={openSources} type="button">
                  <Icon name="doc" /> {translate("ui.d0578b52b359")}</button>
              ) : null}
            </div>
          </div>
          <ModelStatusBar
            generatorStatus={generatorStatus}
            indexStatus={selectedIndexStatus}
            isLoading={isLoading}
            onOpenSettings={onOpenModelSettings}
            onProfileChange={setSelectedProfileId}
            profiles={profiles}
            selectedProfile={selectedProfile}
            selectedProfileId={selectedProfileId}
          />
        </header>

        <div className="rag-chat-scroll" ref={messagesRef}>
          {isHistoryLoading ? <div className="rag-chat-empty">{translate("ui.efb18c179df6")}</div> : null}
          {!isHistoryLoading && messages.length === 0 ? (
            <div className="rag-chat-empty">
              <span className="semantic-empty-icon"><Icon name="chat" /></span>
              <b>{translate("ui.f71ccf769fdb")}</b>
              <p>{translate("ui.711dc6295b80")}</p>
            </div>
          ) : null}
          <div className="rag-thread">
            {messages.map((message) => (
              <article className={message.role === "user" ? "bub-u rag-user" : "rag-answer"} key={message.id}>
                {message.role === "assistant" ? (
                  <>
                    <div className="rag-answer-head"><Icon name="logo" /><b>NoteFlow</b></div>
                    <ChatMarkdown
                      citations={message.sources}
                      content={message.content}
                      onCitationClick={(source) => {
                        setActiveSources(message.sources);
                        openSources();
                        onOpenResult(source);
                      }}
                    />
                    <button aria-label={copiedMessageId === message.id ? translate("ui.d2d08c715ee6") : translate("ui.efb6957fa025")} className="note-chat-copy chat-copy-icon" data-tooltip={copiedMessageId === message.id ? translate("ui.d2d08c715ee6") : translate("ui.f02956c16588")} onClick={() => void copyMessage(message)} type="button">
                      <Icon name={copiedMessageId === message.id ? "check" : "copy"} />
                    </button>
                    {message.sources.length > 0 ? (
                      <button className="rag-inline-sources" onClick={() => {
                        setActiveSources(message.sources);
                        openSources();
                      }} type="button">
                        <Icon name="doc" /> {" " + translate("ui.15f7c4fbcb6e") + " "}{message.sources.length}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="plain-chat-text">{message.content}</span>
                    <button aria-label={copiedMessageId === message.id ? translate("ui.d2d08c715ee6") : translate("ui.efb6957fa025")} className="note-chat-copy chat-copy-icon" data-tooltip={copiedMessageId === message.id ? translate("ui.d2d08c715ee6") : translate("ui.f02956c16588")} onClick={() => void copyMessage(message)} type="button">
                      <Icon name={copiedMessageId === message.id ? "check" : "copy"} />
                    </button>
                  </>
                )}
              </article>
            ))}
            {visibleGeneration.phase === "retrieving" ? (
              <div className="rag-answer loading"><span className="button-spinner" /> {" " + translate("ui.81a43df7561d")}</div>
            ) : null}
            {visibleGeneration.phase === "generating" ? (
              <div className="rag-answer loading" aria-live="polite">{job?.text ? <ChatMarkdown content={job.text} /> : <><span className="button-spinner" /> {" " + translate("ui.dd6c09269b5b")}</>}</div>
            ) : null}
            {visibleGeneration.phase === "stopping" ? <div className="rag-answer loading">{translate("ui.4046ae274af7")}</div> : null}
            {visibleGeneration.phase === "stopped" ? <div className="rag-answer">{translate("ui.8e7391a0a35c")}</div> : null}
            {visibleGeneration.phase === "error" ? (
              <div className="rag-answer error" role="alert">
                <span>{visibleGeneration.message}</span>
                {visibleGeneration.retryable ? (
                  <button className="ghost-btn compact" onClick={() => void retryGeneration()} type="button">{translate("ui.5189135a6110")}</button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rag-input-wrap" ref={composerRef}>
          <div className="rag-stage-note">{translate("ui.313062440ce1")}</div>
          <ChatComposer
            ariaLabel={translate("ui.b30b25ef49a9")}
            className="rag-input"
            disabled={scopeBusy || (activeChat?.projectIds?.length === 0 && !activeChat.includeStandalone) || !generatorStatus?.hasProvider || !generatorStatus.model}
            isSubmitting={generationBusy}
            onChange={setDraft}
            onSubmit={() => void sendQuestion()}
            onStop={() => void ragJobs.stop(activeChatId)}
            placeholder={!generatorStatus?.hasProvider || !generatorStatus.model
                ? translate("ui.ea3225cf30d7")
                : activeChat?.projectIds?.length === 0 && !activeChat.includeStandalone ? translate("ui.9b59e7ab7d49")
                : activeChat?.projectIds ? translate("ui.7bb6653dfd7e") : translate("ui.7142b85b171a")}
            value={draft}
          />
        </div>
      </main>

      {sourcesVisible && !sourcesIsOverlay ? <ResizeHandle className="rag-sources-resize" label={translate("ui.5f151a3672c3")} onReset={onSourcesReset} onResize={onSourcesResize} /> : null}
      <SidebarPanel className={`rag-source-panel ${sourcesIsOverlay || layoutMode !== "wide" ? "rag-panel-overlay" : ""}`} open={sourcesVisible} restoreFocusSelector='[data-rag-control="sources"]'>
          <aside aria-label={translate("ui.00a4b900d44c")} className={`rag-sources-panel ${sourcesIsOverlay || layoutMode !== "wide" ? "rag-panel-overlay" : ""}`}>
            <div className="rag-sources-panel-head">
              <span className="rag-sources-panel-title"><b>{translate("ui.d0578b52b359")}</b><span>{activeSources.length > 0 ? formatRussianCount(activeSources.length, FRAGMENT_COUNT_FORMS) : translate("ui.ad1dfb46bb8d")}</span></span>
              <button aria-label={translate("ui.8f744aa61ec3")} className="rag-sources-close" data-tooltip={translate("ui.8f744aa61ec3")} onClick={closeSources} type="button"><Icon name="x" /></button>
            </div>
            <div className="rag-source-list">
              {activeSources.map((source) => (
                <button className="rag-source-card" key={source.sourceId} onClick={() => onOpenResult(source)} type="button">
                  <span className="rag-source-number">{source.citationNumber}</span>
                  <span>
                    <b>{source.noteTitle}</b>
                    {source.headingPath.length > 0 ? <small>{source.headingPath.join(" › ")}</small> : null}
                    <small>{source.snippet}</small>
                    <span className="rag-source-tags">
                      {source.project ? <em>{source.project}</em> : null}
                      <em>{matchLabel(source.matchType)}</em>
                    </span>
                  </span>
                </button>
              ))}
              {activeSources.length === 0 ? (
                <div className="rag-source-empty">
                  <span className="page-empty-icon"><Icon name="doc" /></span>
                  <b>{translate("ui.6dc7d10779ee")}</b>
                  <span>{translate("ui.6c6bcd1d6e64")}</span>
                </div>
              ) : null}
            </div>
          </aside>
      </SidebarPanel>

      {pendingPrivacyQuestion ? (
        <SettingsModalShell
          description={translate("ui.e0296ddc1797")}
          dismissOnBackdrop={false}
          footer={<div className="settings-modal-footer-actions"><button className="ghost-btn" onClick={() => setPendingPrivacyQuestion("")} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="primary-btn" onClick={() => void confirmPrivacyAndSend()} type="button">{translate("ui.a42aee58d60a")}</button></div>}
          onClose={() => setPendingPrivacyQuestion("")}
          size="compact"
          title={translate("ui.03f725c71f46")}
          titleId="rag-privacy-title"
        >
          <div className="settings-confirm-note">{uiMessage(getInterfaceLanguage(), "externalRequestsConfirmation")}</div>
        </SettingsModalShell>
      ) : null}
      {pendingDialog?.kind === "rename" ? (
        <SettingsModalShell
          footer={<div className="settings-modal-footer-actions"><button className="ghost-btn" onClick={() => setPendingDialog(null)} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="primary-btn" disabled={!renameDraft.trim()} onClick={() => void confirmRename()} type="button">{translate("ui.b4d30cae5289")}</button></div>}
          onClose={() => setPendingDialog(null)}
          size="compact"
          title={translate("ui.982c79415f43")}
          titleId="rag-rename-title"
        >
          <label className="field">{translate("ui.0918b4ba9268")}<input autoFocus maxLength={120} onChange={(event) => setRenameDraft(event.currentTarget.value)} value={renameDraft} /></label>
        </SettingsModalShell>
      ) : null}
      {pendingDialog?.kind === "delete" ? (
        <SettingsModalShell
          description={translate("ui.7e5c8ea3de3b", { p0: pendingDialog.chat.title })}
          dismissOnBackdrop={false}
          footer={<div className="settings-modal-footer-actions"><button className="ghost-btn" onClick={() => setPendingDialog(null)} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="danger-btn" onClick={() => void confirmDelete()} type="button">{translate("ui.78b90e5d570a")}</button></div>}
          onClose={() => setPendingDialog(null)}
          size="compact"
          title={translate("ui.9e4eb2ef9443")}
          titleId="rag-delete-title"
        ><div className="settings-confirm-note">{translate("ui.c901cd837637")}</div></SettingsModalShell>
      ) : null}
    </div>
  );
}

interface ModelStatusBarProps {
  generatorStatus: NoteAiStatus | null;
  indexStatus?: EmbeddingIndexStatus;
  isLoading: boolean;
  onOpenSettings: () => void;
  onProfileChange: (profileId: string) => void;
  profiles: EmbeddingProfile[];
  selectedProfile: EmbeddingProfile | null;
  selectedProfileId: string;
}

function ModelStatusBar({
  generatorStatus,
  indexStatus,
  isLoading,
  onOpenSettings,
  onProfileChange,
  profiles,
  selectedProfile,
  selectedProfileId,
}: ModelStatusBarProps) {
  useInterfaceLanguage();
  if (isLoading) return <div className="rag-model-status loading">{translate("ui.9fae5e881a72")}</div>;
  const needsUpdate = selectedProfile && indexStatus?.status !== "current";
  return (
    <section aria-label={translate("ui.8df3add24d61")} className={`rag-model-status ${!selectedProfile || !generatorStatus?.canUse ? "requires-setup" : "ready"}`}>
      <div className="rag-model-summary">
        <span className={`rag-status-dot ${generatorStatus?.canUse ? "ok" : "warn"}`} />
        <span className="rag-generator-summary">
          {generatorStatus?.hasProvider ? generatorStatus.providerName : translate("ui.ca9fb6f6abc0")}
        </span>
        <span aria-hidden="true" className="rag-summary-separator">·</span>
        <Icon name="search" />
        {profiles.length > 1 ? (
          <select aria-label={translate("ui.787668671f7e")} onChange={(event) => onProfileChange(event.currentTarget.value)} value={selectedProfileId}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        ) : <span>{selectedProfile ? selectedProfile.name : translate("ui.29c131ec9499")}</span>}
        {selectedProfile ? <span className="rag-locality-label">{selectedProfile.locality === "local" ? translate("ui.57e6b898dfe7") : translate("ui.ba8ac2a308df")}</span> : null}
        <span aria-hidden="true" className="rag-summary-separator">·</span>
        <span className={`rag-index-label ${needsUpdate ? "warning" : ""}`}>{indexStatusLabel(indexStatus)}</span>
      </div>
      {!selectedProfile ? (
        <button className="ghost-btn compact rag-setup-action" onClick={onOpenSettings} type="button">{translate("ui.d71875872c7e")}</button>
      ) : selectedProfile.locality === "cloud" && !selectedProfile.hasCloudConsent ? <button className="ghost-btn compact" onClick={onOpenSettings} type="button">{translate("ui.a3bc50387304")}</button> : null}
    </section>
  );
}

function latestSources(messages: RagChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "assistant")?.sources ?? [];
}


function formatChatDate(value: string) {
  return formatDisplayDate(value);
}

function indexStatusLabel(status?: EmbeddingIndexStatus) {
  if (!status) return translate("ui.8fda1088007b");
  if (status.status === "current") return translate("ui.601e3fcdce36");
  if (status.status === "indexing") return translate("ui.91ac93af9688");
  if (status.status === "partial") return translate("ui.997e399d965b");
  if (status.status === "failed") return translate("ui.3a8e10c64052");
  return translate("ui.6615f10b30b1", { p0: status.pendingChunks ? `: ${status.pendingChunks}` : "" });
}

function matchLabel(matchType: SemanticSearchResult["matchType"]) {
  if (matchType === "exact") return translate("ui.8a076a34cb98");
  if (matchType === "lexical") return translate("ui.32cee9c6386d");
  if (matchType === "hybrid") return translate("ui.0eb10c31359b");
  if (matchType === "metadata") return translate("ui.cfb155f46077");
  return translate("ui.7bf1157b39c8");
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : typeof error === "string" ? error : translate("ui.2d55ddef0ce5");
}
