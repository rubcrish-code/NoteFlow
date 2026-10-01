import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import * as embeddingService from "../../services/embeddingService";
import type { EmbeddingIndexStatus, EmbeddingProfile, SemanticSearchResult } from "../../services/embeddingService";
import { acceptNoteAiPrivacy, getNoteAiStatus, type NoteAiStatus } from "../../services/noteAiService";
import * as ragChatService from "../../services/ragChatService";
import { RagGenerationError, type RagChat, type RagChatMessage, type RagMessageSource } from "../../services/ragChatService";
import { Icon } from "../../shared/Icon";
import { formatDisplayDate } from "../../shared/displayDate";
import { ChatComposer } from "../../shared/ChatComposer";
import { MenuPopover } from "../../shared/MenuPopover";
import { ResizeHandle } from "../../shared/ResizeHandle";
import { formatRussianCount, FRAGMENT_COUNT_FORMS } from "../../shared/russianPlural";
import { ChatMarkdown } from "../note-chat/ChatMarkdown";
import { SettingsModalShell } from "../settings/ModelSettingsUi";
import { ragAnswerForClipboard } from "./ragCitations";
import { isRagGenerationCurrent, shouldApplyRagGenerationToVisibleChat } from "./ragGenerationGuards";
import { retrieveForRagQuestion } from "./ragQueryRouting";
import { listProjects } from "../../services/dataService";
import type { ProjectCard } from "../../app/types";
import { ProjectScopeSelector } from "./ProjectScopeSelector";
import { isRagHistoryOverlayMode, resolveRagPanelVisibility, transitionRagOverlays, type RagLayoutMode } from "./ragResponsiveLayout";
import { useRagOverlayBounds } from "./useRagOverlayBounds";

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

type GenerationPhase = "idle" | "retrieving" | "generating" | "error";

interface GenerationState {
  phase: GenerationPhase;
  requestId: number;
  chatId: string;
  userMessageId: string;
  question: string;
  message: string;
  retryable: boolean;
}

const idleGeneration: GenerationState = {
  phase: "idle",
  requestId: 0,
  chatId: "",
  userMessageId: "",
  question: "",
  message: "",
  retryable: false,
};

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
  const [chats, setChats] = useState<RagChat[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [messages, setMessages] = useState<RagChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [profiles, setProfiles] = useState<EmbeddingProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [indexStatuses, setIndexStatuses] = useState<Record<string, EmbeddingIndexStatus>>({});
  const [generatorStatus, setGeneratorStatus] = useState<NoteAiStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [scopeBusy, setScopeBusy] = useState(false);
  const scopeBusyRef = useRef(false);
  const [generation, setGeneration] = useState<GenerationState>(idleGeneration);
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
  const generationRequestIdRef = useRef(0);
  const generationBusyRef = useRef(false);
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const activeChatIdRef = useRef("");
  const deletedChatIdsRef = useRef(new Set<string>());
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
  const generationBusy = generation.phase === "retrieving" || generation.phase === "generating";
  const visibleGeneration = generation.chatId === activeChatId ? generation : idleGeneration;

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
    void Promise.all([refreshChats(), refreshModelStatuses(() => !cancelled), listProjects().then((items) => { if (!cancelled) setProjects(items); })])
      .catch((error) => {
        if (!cancelled) onToastRef.current(`Не удалось загрузить ИИ-чат по базе: ${errorText(error)}`);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      historyRequestIdRef.current += 1;
      generationRequestIdRef.current += 1;
      generationBusyRef.current = false;
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
        const created = await ragChatService.createRagChat("Новый чат");
        chat = created;
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
        setMessages(history);
        setActiveSources(latestSources(history));
      })
      .catch((error) => {
        if (historyRequestIdRef.current === requestId) {
          setMessages([]);
          setActiveSources([]);
          onToastRef.current(`Не удалось загрузить историю чата: ${errorText(error)}`);
        }
      })
      .finally(() => {
        if (historyRequestIdRef.current === requestId) setIsHistoryLoading(false);
      });
  }, [activeChatId, dataReloadGeneration]);

  useEffect(() => {
    const scrollArea = messagesRef.current;
    if (!scrollArea) return;
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isHistoryLoading, generation.phase]);

  async function createChat() {
    try {
      const chat = await ragChatService.createRagChat();
      activeChatIdRef.current = chat.id;
      setChats((current) => [chat, ...current]);
      setActiveChatId(chat.id);
      setMessages([]);
      setActiveSources([]);
      setDraft("");
    } catch (error) {
      onToast(`Не удалось создать чат: ${errorText(error)}`);
    }
  }

  async function sendQuestion() {
    const question = draft.trim();
    if (!question || generationBusyRef.current || scopeBusyRef.current) return;
    if (activeChat?.projectIds?.length === 0 && !activeChat.includeStandalone) {
      onToast("Выберите хотя бы один проект или заметки вне проектов.");
      return;
    }
    if (!generatorStatus?.hasProvider || !generatorStatus.model) {
      onToast("Подключите модель ответа в разделе «Модели ИИ».");
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
        onToast(`Не удалось подтвердить локальную обработку: ${errorText(error)}`);
        return;
      }
    }
    await submitQuestion(question);
  }

  async function submitQuestion(question: string) {
    if (generationBusyRef.current || scopeBusyRef.current) return;
    generationBusyRef.current = true;
    const requestId = ++generationRequestIdRef.current;

    let chat = activeChat;
    try {
      if (!chat) {
        const createdChat = await ragChatService.createRagChat();
        chat = createdChat;
        activeChatIdRef.current = createdChat.id;
        setChats((current) => [createdChat, ...current]);
        setActiveChatId(createdChat.id);
      }
      const chatId = chat.id;
      setGeneration({
        ...idleGeneration,
        phase: "retrieving",
        requestId,
        chatId,
        question,
      });
      const userMessage = await ragChatService.saveRagChatMessage(chatId, "user", question);
      setDraft("");
      if (activeChatIdRef.current === chatId) {
        setMessages((current) => [...current, userMessage]);
      }
      setGeneration((current) => current.requestId === requestId
        ? { ...current, userMessageId: userMessage.id }
        : current);
      if (chat.title === "Новый чат") {
        const renamed = await ragChatService.renameRagChat(chatId, titleFromQuestion(question));
        chat = renamed;
        setChats((current) => current.map((item) => item.id === renamed.id ? renamed : item));
      }
      const results = await retrieveForRagQuestion(
        { chatId, userMessageId: userMessage.id, profileId: selectedProfile?.id ?? null, canRetrieve },
        { plan: ragChatService.planRagQuestion, hybridSearch: retrieveRagSources },
      );
      const request = { chatId, requestId };
      if (!isRagGenerationCurrent(request, generationRequestIdRef.current, deletedChatIdsRef.current)) return;
      setGeneration((current) => current.requestId === requestId
        ? { ...current, phase: "generating" }
        : current);
      const generated = await ragChatService.runRagGeneration(chatId, userMessage.id, results);
      if (!isRagGenerationCurrent(request, generationRequestIdRef.current, deletedChatIdsRef.current)) return;
      if (shouldApplyRagGenerationToVisibleChat(
        request,
        generationRequestIdRef.current,
        activeChatIdRef.current,
        deletedChatIdsRef.current,
      )) {
        setMessages((current) => [...current, generated.assistantMessage]);
        setActiveSources(generated.assistantMessage.sources);
        if (generated.assistantMessage.sources.length > 0) openSources();
      }
      await refreshChats();
      setGeneration(idleGeneration);
    } catch (error) {
      if (generationRequestIdRef.current === requestId && chat) {
        const failedChatId = chat.id;
        const normalized = error instanceof RagGenerationError
          ? error
          : new RagGenerationError("generation_error", "Не удалось выполнить запрос по базе заметок.", true);
        setGeneration((current) => ({
          phase: "error",
          requestId,
          chatId: failedChatId,
          userMessageId: current.requestId === requestId ? current.userMessageId : "",
          question,
          message: normalized.message,
          retryable: normalized.retryable && Boolean(current.userMessageId),
        }));
      } else if (generationRequestIdRef.current === requestId) {
        onToast("Не удалось создать чат. Повторите попытку.");
      }
    } finally {
      if (generationRequestIdRef.current === requestId) generationBusyRef.current = false;
    }
  }

  async function retryGeneration() {
    if (
      generation.phase !== "error"
      || !generation.retryable
      || !generation.userMessageId
      || generationBusyRef.current
    ) return;
    const failed = generation;
    const requestId = ++generationRequestIdRef.current;
    generationBusyRef.current = true;
    setGeneration({ ...failed, phase: "retrieving", requestId, message: "" });
    try {
      const results = await retrieveForRagQuestion(
        { chatId: failed.chatId, userMessageId: failed.userMessageId, profileId: selectedProfile?.id ?? null, canRetrieve },
        { plan: ragChatService.planRagQuestion, hybridSearch: retrieveRagSources },
      );
      const request = { chatId: failed.chatId, requestId };
      if (!isRagGenerationCurrent(request, generationRequestIdRef.current, deletedChatIdsRef.current)) return;
      setGeneration((current) => current.requestId === requestId ? { ...current, phase: "generating" } : current);
      const generated = await ragChatService.runRagGeneration(failed.chatId, failed.userMessageId, results);
      if (!isRagGenerationCurrent(request, generationRequestIdRef.current, deletedChatIdsRef.current)) return;
      if (shouldApplyRagGenerationToVisibleChat(
        request,
        generationRequestIdRef.current,
        activeChatIdRef.current,
        deletedChatIdsRef.current,
      )) {
        setMessages((current) => [...current, generated.assistantMessage]);
        setActiveSources(generated.assistantMessage.sources);
        if (generated.assistantMessage.sources.length > 0) openSources();
      }
      await refreshChats();
      setGeneration(idleGeneration);
    } catch (error) {
      if (generationRequestIdRef.current === requestId) {
        const normalized = error instanceof RagGenerationError
          ? error
          : new RagGenerationError("generation_error", "Не удалось выполнить запрос по базе заметок.", true);
        setGeneration({
          ...failed,
          phase: "error",
          requestId,
          message: normalized.message,
          retryable: normalized.retryable,
        });
      }
    } finally {
      if (generationRequestIdRef.current === requestId) generationBusyRef.current = false;
    }
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
      onToast(`Не удалось подтвердить обработку: ${errorText(error)}`);
    }
  }

  async function confirmRename() {
    if (pendingDialog?.kind !== "rename" || !renameDraft.trim()) return;
    try {
      const renamed = await ragChatService.renameRagChat(pendingDialog.chat.id, renameDraft);
      setChats((current) => current.map((chat) => chat.id === renamed.id ? renamed : chat));
      setPendingDialog(null);
    } catch (error) {
      onToast(`Не удалось переименовать чат: ${errorText(error)}`);
    }
  }

  async function confirmDelete() {
    if (pendingDialog?.kind !== "delete") return;
    try {
      const deletedId = pendingDialog.chat.id;
      await ragChatService.deleteRagChat(deletedId);
      deletedChatIdsRef.current.add(deletedId);
      if (generation.chatId === deletedId && generationBusy) {
        generationRequestIdRef.current += 1;
        generationBusyRef.current = false;
        setGeneration(idleGeneration);
      }
      const remaining = chats.filter((chat) => chat.id !== deletedId);
      setChats(remaining);
      if (activeChatId === deletedId) {
        const nextChatId = remaining[0]?.id ?? "";
        activeChatIdRef.current = nextChatId;
        setActiveChatId(nextChatId);
      }
      setPendingDialog(null);
    } catch (error) {
      onToast(`Не удалось удалить чат: ${errorText(error)}`);
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
      onToast("Не удалось скопировать");
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
      {historyVisible ? (
        <>
          <aside aria-label="История диалогов" className={`rag-conversations ${historyIsOverlay ? "rag-panel-overlay" : ""}`}>
            <button className="secondary-btn rag-new-chat" onClick={() => void createChat()} type="button">
              <Icon name="plus" />
              Новый чат
            </button>
            <div className="rag-conversation-head">
              <span>Недавние чаты</span>
              <button aria-label="Скрыть историю чатов" className="icon-close-btn" data-tooltip="Скрыть историю" onClick={closeHistory} type="button">
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
                    aria-label={`Действия: ${chat.title}`}
                    data-tooltip="Действия с чатом"
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
                    ariaLabel={`Действия с чатом «${chat.title}»`}
                    className="rag-history-menu"
                    isOpen={openChatMenuId === chat.id}
                    onClose={closeChatMenu}
                    preferredWidth={164}
                  >
                      <button onClick={() => {
                        setRenameDraft(chat.title);
                        setPendingDialog({ kind: "rename", chat });
                        setOpenChatMenuId("");
                      }} role="menuitem" type="button">Переименовать</button>
                      <button className="danger" onClick={() => {
                        setPendingDialog({ kind: "delete", chat });
                        setOpenChatMenuId("");
                      }} role="menuitem" type="button">Удалить</button>
                  </MenuPopover>
                </div>
              ))}
              {!isLoading && chats.length === 0 ? <div className="rag-history-empty">Создайте первый чат по базе заметок.</div> : null}
            </div>
          </aside>
          {!historyIsOverlay ? <ResizeHandle className="rag-conversation-resize" label="Изменить ширину истории диалогов" onReset={onConversationReset} onResize={onConversationResize} /> : null}
        </>
      ) : null}

      <main className="rag-main-chat">
        <header className="rag-chat-header" ref={headerRef}>
          <div className="rag-chat-top">
            <div className="rag-chat-title">
              {!historyVisible ? (
                <button aria-label="Показать историю чатов" className="icon-close-btn" data-tooltip="Показать историю" onClick={openHistory} type="button">
                  <Icon name="forward" />
                </button>
              ) : null}
              <div>
                <b>{activeChat?.title ?? "Новый чат"}</b>
                <span>{activeChat?.projectIds ? activeChat.includeStandalone ? activeChat.projectIds.length ? "По проектам и заметкам вне проектов" : "По заметкам вне проектов" : activeChat.projectIds.length ? "По выбранным проектам" : "Выберите область поиска" : "По всей базе заметок"}</span>
              </div>
            </div>
            <div className="rag-top-actions">
              <ProjectScopeSelector busy={scopeBusy} includeStandalone={activeChat?.includeStandalone ?? false} onChange={changeProjectScope} projects={projects} selectedIds={activeChat?.projectIds ?? null} />
              <button aria-label="Настроить модели" className="icon-close-btn" data-tooltip="Настроить модели" onClick={onOpenModelSettings} type="button">
                <Icon name="gear" />
              </button>
              {!sourcesVisible ? (
                <button aria-label="Источники ответа" className="secondary-btn compact" data-tooltip="Источники ответа" onClick={openSources} type="button">
                  <Icon name="doc" /> Источники
                </button>
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
          {isHistoryLoading ? <div className="rag-chat-empty">Загружаем историю…</div> : null}
          {!isHistoryLoading && messages.length === 0 ? (
            <div className="rag-chat-empty">
              <span className="semantic-empty-icon"><Icon name="chat" /></span>
              <b>Новый чат по базе знаний</b>
              <p>Задайте вопрос. NoteFlow найдёт релевантные фрагменты и покажет их как проверяемые источники.</p>
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
                    <button aria-label={copiedMessageId === message.id ? "Скопировано" : "Скопировать сообщение"} className="note-chat-copy chat-copy-icon" data-tooltip={copiedMessageId === message.id ? "Скопировано" : "Скопировать"} onClick={() => void copyMessage(message)} type="button">
                      <Icon name={copiedMessageId === message.id ? "check" : "copy"} />
                    </button>
                    {message.sources.length > 0 ? (
                      <button className="rag-inline-sources" onClick={() => {
                        setActiveSources(message.sources);
                        openSources();
                      }} type="button">
                        <Icon name="doc" /> Источники: {message.sources.length}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="plain-chat-text">{message.content}</span>
                    <button aria-label={copiedMessageId === message.id ? "Скопировано" : "Скопировать сообщение"} className="note-chat-copy chat-copy-icon" data-tooltip={copiedMessageId === message.id ? "Скопировано" : "Скопировать"} onClick={() => void copyMessage(message)} type="button">
                      <Icon name={copiedMessageId === message.id ? "check" : "copy"} />
                    </button>
                  </>
                )}
              </article>
            ))}
            {visibleGeneration.phase === "retrieving" ? (
              <div className="rag-answer loading"><span className="button-spinner" /> Ищу по базе…</div>
            ) : null}
            {visibleGeneration.phase === "generating" ? (
              <div className="rag-answer loading"><span className="button-spinner" /> Формирую ответ…</div>
            ) : null}
            {visibleGeneration.phase === "error" ? (
              <div className="rag-answer error" role="alert">
                <span>{visibleGeneration.message}</span>
                {visibleGeneration.retryable ? (
                  <button className="ghost-btn compact" onClick={() => void retryGeneration()} type="button">Повторить</button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rag-input-wrap" ref={composerRef}>
          <div className="rag-stage-note">Ответ будет основан только на найденных заметках и снабжён проверяемыми ссылками.</div>
          <ChatComposer
            ariaLabel="Сообщение по всей базе заметок"
            className="rag-input"
            disabled={scopeBusy || (activeChat?.projectIds?.length === 0 && !activeChat.includeStandalone) || !generatorStatus?.hasProvider || !generatorStatus.model}
            isSubmitting={generationBusy}
            onChange={setDraft}
            onSubmit={() => void sendQuestion()}
            placeholder={!generatorStatus?.hasProvider || !generatorStatus.model
                ? "Сначала подключите модель ответа"
                : activeChat?.projectIds?.length === 0 && !activeChat.includeStandalone ? "Выберите область поиска"
                : activeChat?.projectIds ? "Спросить по выбранной области…" : "Спросить по всем заметкам…"}
            value={draft}
          />
        </div>
      </main>

      {sourcesVisible ? (
        <>
          {!sourcesIsOverlay ? <ResizeHandle className="rag-sources-resize" label="Изменить ширину источников RAG" onReset={onSourcesReset} onResize={onSourcesResize} /> : null}
          <aside aria-label="Источники ответа" className={`rag-sources-panel ${sourcesIsOverlay ? "rag-panel-overlay" : ""}`}>
            <div className="rag-sources-panel-head">
              <span className="rag-sources-panel-title"><b>Источники</b><span>{activeSources.length > 0 ? formatRussianCount(activeSources.length, FRAGMENT_COUNT_FORMS) : "Пока нет результатов"}</span></span>
              <button aria-label="Скрыть источники" className="rag-sources-close" data-tooltip="Скрыть источники" onClick={closeSources} type="button"><Icon name="x" /></button>
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
                  <b>Источников пока нет</b>
                  <span>После вопроса здесь появятся заметки и найденные фрагменты.</span>
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}

      {pendingPrivacyQuestion ? (
        <SettingsModalShell
          description="Для ответа выбранной модели будут отправлены только найденные фрагменты ваших заметок. API-ключ остаётся в защищённом хранилище ОС."
          dismissOnBackdrop={false}
          footer={<div className="settings-modal-footer-actions"><button className="ghost-btn" onClick={() => setPendingPrivacyQuestion("")} type="button">Отмена</button><button className="primary-btn" onClick={() => void confirmPrivacyAndSend()} type="button">Продолжить</button></div>}
          onClose={() => setPendingPrivacyQuestion("")}
          size="compact"
          title="Передать фрагменты модели?"
          titleId="rag-privacy-title"
        >
          <div className="settings-confirm-note">Подтверждение сохранится для внешних AI-запросов этого локального профиля.</div>
        </SettingsModalShell>
      ) : null}
      {pendingDialog?.kind === "rename" ? (
        <SettingsModalShell
          footer={<div className="settings-modal-footer-actions"><button className="ghost-btn" onClick={() => setPendingDialog(null)} type="button">Отмена</button><button className="primary-btn" disabled={!renameDraft.trim()} onClick={() => void confirmRename()} type="button">Сохранить</button></div>}
          onClose={() => setPendingDialog(null)}
          size="compact"
          title="Переименовать чат"
          titleId="rag-rename-title"
        >
          <label className="field">Название<input autoFocus maxLength={120} onChange={(event) => setRenameDraft(event.currentTarget.value)} value={renameDraft} /></label>
        </SettingsModalShell>
      ) : null}
      {pendingDialog?.kind === "delete" ? (
        <SettingsModalShell
          description={`Чат «${pendingDialog.chat.title}» и его история будут удалены.`}
          dismissOnBackdrop={false}
          footer={<div className="settings-modal-footer-actions"><button className="ghost-btn" onClick={() => setPendingDialog(null)} type="button">Отмена</button><button className="danger-btn" onClick={() => void confirmDelete()} type="button">Удалить чат</button></div>}
          onClose={() => setPendingDialog(null)}
          size="compact"
          title="Удалить чат?"
          titleId="rag-delete-title"
        ><div className="settings-confirm-note">Заметки и смысловой индекс не изменятся.</div></SettingsModalShell>
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
  if (isLoading) return <div className="rag-model-status loading">Проверяем подключённые модели…</div>;
  const needsUpdate = selectedProfile && indexStatus?.status !== "current";
  return (
    <section aria-label="Состояние моделей и базы" className={`rag-model-status ${!selectedProfile || !generatorStatus?.canUse ? "requires-setup" : "ready"}`}>
      <div className="rag-model-summary">
        <span className={`rag-status-dot ${generatorStatus?.canUse ? "ok" : "warn"}`} />
        <span className="rag-generator-summary">
          {generatorStatus?.hasProvider ? generatorStatus.providerName : "Модель ответа не подключена"}
        </span>
        <span aria-hidden="true" className="rag-summary-separator">·</span>
        <Icon name="search" />
        {profiles.length > 1 ? (
          <select aria-label="Модель смыслового поиска" onChange={(event) => onProfileChange(event.currentTarget.value)} value={selectedProfileId}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        ) : <span>{selectedProfile ? selectedProfile.name : "Смысловой поиск не настроен"}</span>}
        {selectedProfile ? <span className="rag-locality-label">{selectedProfile.locality === "local" ? "локально" : "облачно"}</span> : null}
        <span aria-hidden="true" className="rag-summary-separator">·</span>
        <span className={`rag-index-label ${needsUpdate ? "warning" : ""}`}>{indexStatusLabel(indexStatus)}</span>
      </div>
      {!selectedProfile ? (
        <button className="ghost-btn compact rag-setup-action" onClick={onOpenSettings} type="button">Настроить</button>
      ) : selectedProfile.locality === "cloud" && !selectedProfile.hasCloudConsent ? <button className="ghost-btn compact" onClick={onOpenSettings} type="button">Разрешить обработку</button> : null}
    </section>
  );
}

function latestSources(messages: RagChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "assistant")?.sources ?? [];
}

async function retrieveRagSources(profileId: string, plan: ragChatService.RagQueryPlan) {
  try {
    return await embeddingService.hybridSearch({
      includeArchived: false,
      includeNeighbors: true,
      profileId,
      projectId: plan.projectId ?? undefined,
      projectIds: plan.projectIds ?? null,
      includeStandalone: plan.includeStandalone ?? false,
      tagId: plan.tagId ?? undefined,
      query: plan.searchQuery,
    });
  } catch {
    throw new RagGenerationError(
      "retrieval_error",
      "Не удалось выполнить поиск по базе заметок. Повторите запрос.",
      true,
    );
  }
}

function titleFromQuestion(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  return normalized.length > 58 ? `${normalized.slice(0, 57).trimEnd()}…` : normalized;
}

function formatChatDate(value: string) {
  return formatDisplayDate(value);
}

function indexStatusLabel(status?: EmbeddingIndexStatus) {
  if (!status) return "Статус индекса недоступен";
  if (status.status === "current") return "База актуальна";
  if (status.status === "indexing") return "База обновляется";
  if (status.status === "partial") return "Ожидает повторной обработки";
  if (status.status === "failed") return "Ошибка обновления";
  return `Ожидает обработки${status.pendingChunks ? `: ${status.pendingChunks}` : ""}`;
}

function matchLabel(matchType: SemanticSearchResult["matchType"]) {
  if (matchType === "exact") return "Точное совпадение";
  if (matchType === "lexical") return "По тексту";
  if (matchType === "hybrid") return "Текст и смысл";
  if (matchType === "metadata") return "Данные заметки";
  return "По смыслу";
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : typeof error === "string" ? error : "Неизвестная ошибка";
}
