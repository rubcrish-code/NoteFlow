import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import * as embeddingService from "../../services/embeddingService";
import type { EmbeddingIndexStatus, EmbeddingProfile, SemanticSearchResult } from "../../services/embeddingService";
import { getNoteAiStatus, type NoteAiStatus } from "../../services/noteAiService";
import * as ragChatService from "../../services/ragChatService";
import type { RagChat, RagChatMessage } from "../../services/ragChatService";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { ResizeHandle } from "../../shared/ResizeHandle";
import { ChatMarkdown } from "../note-chat/ChatMarkdown";
import { SettingsModalShell } from "../settings/ModelSettingsUi";

interface RagChatWorkspaceProps {
  conversationWidth: number;
  dataReloadGeneration: number;
  onConversationReset: () => void;
  onConversationResize: (deltaX: number) => void;
  onOpenModelSettings: () => void;
  onOpenResult: (result: SemanticSearchResult) => void;
  onSourcesCollapsedChange: (collapsed: boolean) => void;
  onSourcesReset: () => void;
  onSourcesResize: (deltaX: number) => void;
  onToast: (message: string) => void;
  sourcesCollapsed: boolean;
  sourcesWidth: number;
}

type PendingDialog =
  | { kind: "delete"; chat: RagChat }
  | { kind: "rename"; chat: RagChat }
  | null;

type RetrievalState = "idle" | "searching" | "error";

const emptyResponse = "Источники не найдены. Попробуйте уточнить вопрос или обновить базу для RAG.";

export function RagChatWorkspace({
  conversationWidth,
  dataReloadGeneration,
  onConversationReset,
  onConversationResize,
  onOpenModelSettings,
  onOpenResult,
  onSourcesCollapsedChange,
  onSourcesReset,
  onSourcesResize,
  onToast,
  sourcesCollapsed,
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
  const [isUpdatingIndex, setIsUpdatingIndex] = useState(false);
  const [retrievalState, setRetrievalState] = useState<RetrievalState>("idle");
  const [retrievalError, setRetrievalError] = useState("");
  const [activeSources, setActiveSources] = useState<SemanticSearchResult[]>([]);
  const [conversationsCollapsed, setConversationsCollapsed] = useState(false);
  const [openChatMenuId, setOpenChatMenuId] = useState("");
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const requestIdRef = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const chatMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const closeChatMenu = useCallback(() => setOpenChatMenuId(""), []);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedIndexStatus = selectedProfile ? indexStatuses[selectedProfile.id] : undefined;
  const canRetrieve = Boolean(
    selectedProfile
    && selectedProfile.lastStatus === "success"
    && (selectedIndexStatus?.status === "current" || (selectedIndexStatus?.indexedChunks ?? 0) > 0),
  );

  const refreshModelStatuses = useCallback(async () => {
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
      if (preferredChatId && loadedChats.some((chat) => chat.id === preferredChatId)) return preferredChatId;
      if (loadedChats.some((chat) => chat.id === current)) return current;
      return loadedChats[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([refreshChats(), refreshModelStatuses()])
      .catch((error) => {
        if (!cancelled) onToast(`Не удалось загрузить ИИ-чат по базе: ${errorText(error)}`);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [dataReloadGeneration, onToast, refreshChats, refreshModelStatuses]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      setActiveSources([]);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsHistoryLoading(true);
    setOpenChatMenuId("");
    void ragChatService.listRagChatMessages(activeChatId)
      .then((history) => {
        if (requestIdRef.current !== requestId) return;
        setMessages(history);
        setActiveSources(latestSources(history));
      })
      .catch((error) => {
        if (requestIdRef.current === requestId) {
          setMessages([]);
          setActiveSources([]);
          onToast(`Не удалось загрузить историю чата: ${errorText(error)}`);
        }
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsHistoryLoading(false);
      });
  }, [activeChatId, dataReloadGeneration, onToast]);

  useEffect(() => {
    const scrollArea = messagesRef.current;
    if (!scrollArea) return;
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isHistoryLoading, retrievalState]);

  async function createChat() {
    try {
      const chat = await ragChatService.createRagChat();
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
    if (!question || retrievalState === "searching") return;
    if (!selectedProfile) {
      onToast("Модель смыслового поиска не настроена.");
      return;
    }
    if (!canRetrieve) {
      onToast("Обновите базу для RAG перед поиском.");
      return;
    }

    let chat = activeChat;
    if (!chat) {
      const createdChat = await ragChatService.createRagChat();
      chat = createdChat;
      setChats((current) => [createdChat, ...current]);
      setActiveChatId(createdChat.id);
    }

    const requestId = ++requestIdRef.current;
    let failed = false;
    setRetrievalState("searching");
    setRetrievalError("");
    setDraft("");
    try {
      const userMessage = await ragChatService.saveRagChatMessage(chat.id, "user", question);
      setMessages((current) => [...current, userMessage]);
      const results = await embeddingService.hybridSearch({
        includeArchived: false,
        includeNeighbors: true,
        profileId: selectedProfile.id,
        query: question,
      });
      if (requestIdRef.current !== requestId) return;
      const assistantText = retrievalMessage(results.length);
      const assistantMessage = await ragChatService.saveRagChatMessage(
        chat.id,
        "assistant",
        assistantText,
        results,
      );
      if (requestIdRef.current !== requestId) return;
      setMessages((current) => [...current, assistantMessage]);
      setActiveSources(results);
      if (results.length > 0 && sourcesCollapsed) onSourcesCollapsedChange(false);
      if (chat.title === "Новый чат") {
        const renamed = await ragChatService.renameRagChat(chat.id, titleFromQuestion(question));
        setChats((current) => current.map((item) => item.id === renamed.id ? renamed : item));
      } else {
        await refreshChats(chat.id);
      }
    } catch (error) {
      if (requestIdRef.current === requestId) {
        failed = true;
        setRetrievalState("error");
        setRetrievalError(errorText(error));
      }
    } finally {
      if (requestIdRef.current === requestId && !failed) setRetrievalState("idle");
    }
  }

  async function updateIndex() {
    if (!selectedProfile) return;
    if (selectedProfile.locality === "cloud" && !selectedProfile.hasCloudConsent) {
      onToast("Подтвердите облачную обработку в разделе «Модели ИИ».");
      onOpenModelSettings();
      return;
    }
    setIsUpdatingIndex(true);
    try {
      await embeddingService.updateEmbeddingIndex(selectedProfile.id);
      await refreshModelStatuses();
      onToast("База для RAG обновлена.");
    } catch (error) {
      onToast(`Не удалось обновить базу для RAG: ${errorText(error)}`);
    } finally {
      setIsUpdatingIndex(false);
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
      const remaining = chats.filter((chat) => chat.id !== deletedId);
      setChats(remaining);
      if (activeChatId === deletedId) setActiveChatId(remaining[0]?.id ?? "");
      setPendingDialog(null);
    } catch (error) {
      onToast(`Не удалось удалить чат: ${errorText(error)}`);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  }

  async function copyMessage(message: RagChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? "" : current), 1500);
    } catch {
      onToast("Не удалось скопировать");
    }
  }

  const pageStyle = {
    "--ragcw": `${conversationWidth}px`,
    "--ragsw": `${sourcesWidth}px`,
  } as CSSProperties;

  return (
    <div className={`rag-page rag-production-chat ${sourcesCollapsed ? "sources-collapsed" : ""} ${conversationsCollapsed ? "conversations-collapsed" : ""}`} style={pageStyle}>
      {!conversationsCollapsed ? (
        <>
          <aside aria-label="История диалогов" className="rag-conversations">
            <button className="primary-btn rag-new-chat" onClick={() => void createChat()} type="button">
              <Icon name="plus" />
              Новый чат
            </button>
            <div className="rag-conversation-head">
              <span>Недавние чаты</span>
              <button aria-label="Скрыть историю чатов" className="icon-close-btn" onClick={() => setConversationsCollapsed(true)} title="Скрыть историю" type="button">
                <Icon name="back" />
              </button>
            </div>
            <div className="rag-history">
              {chats.map((chat) => (
                <div className={`rag-history-item ${chat.id === activeChatId ? "active" : ""}`} key={chat.id}>
                  <button className="rag-history-select" onClick={() => setActiveChatId(chat.id)} type="button">
                    <span>{chat.title}</span>
                    <small>{formatChatDate(chat.updatedAt)}</small>
                  </button>
                  <button
                    aria-expanded={openChatMenuId === chat.id}
                    aria-haspopup="menu"
                    aria-label={`Действия: ${chat.title}`}
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
          <ResizeHandle className="rag-conversation-resize" label="Изменить ширину истории диалогов" onReset={onConversationReset} onResize={onConversationResize} />
        </>
      ) : null}

      <main className="rag-main-chat">
        <header className="rag-chat-top">
          <div className="rag-chat-title">
            {conversationsCollapsed ? (
              <button aria-label="Показать историю чатов" className="icon-close-btn" onClick={() => setConversationsCollapsed(false)} title="Показать историю" type="button">
                <Icon name="forward" />
              </button>
            ) : null}
            <div>
              <span>ИИ-чат по базе</span>
              <b>{activeChat?.title ?? "Новый чат"}</b>
            </div>
          </div>
          <div className="rag-top-actions">
            <button className="secondary-btn compact" onClick={onOpenModelSettings} type="button">Настроить модели</button>
            {sourcesCollapsed ? (
              <button className="secondary-btn compact" onClick={() => onSourcesCollapsedChange(false)} type="button">
                <Icon name="doc" /> Источники
              </button>
            ) : null}
          </div>
        </header>

        <ModelStatusBar
          generatorStatus={generatorStatus}
          indexStatus={selectedIndexStatus}
          isLoading={isLoading}
          isUpdatingIndex={isUpdatingIndex}
          onOpenSettings={onOpenModelSettings}
          onProfileChange={setSelectedProfileId}
          onUpdateIndex={() => void updateIndex()}
          profiles={profiles}
          selectedProfile={selectedProfile}
          selectedProfileId={selectedProfileId}
        />

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
                    <ChatMarkdown content={message.content} />
                    <button className="note-chat-copy" onClick={() => void copyMessage(message)} title="Скопировать" type="button">
                      <Icon name={copiedMessageId === message.id ? "check" : "copy"} />
                      {copiedMessageId === message.id ? "Скопировано" : "Скопировать"}
                    </button>
                    {message.sources.length > 0 ? (
                      <button className="rag-inline-sources" onClick={() => {
                        setActiveSources(message.sources);
                        onSourcesCollapsedChange(false);
                      }} type="button">
                        <Icon name="doc" /> Источники: {message.sources.length}
                      </button>
                    ) : null}
                  </>
                ) : message.content}
              </article>
            ))}
            {retrievalState === "searching" ? (
              <div className="rag-answer loading"><span className="button-spinner" /> Ищем релевантные фрагменты…</div>
            ) : null}
            {retrievalState === "error" ? <div className="rag-answer error">{retrievalError}</div> : null}
          </div>
        </div>

        <div className="rag-input-wrap">
          <div className="rag-stage-note">На этапе 06C NoteFlow находит источники. Генерация ответа по ним будет подключена в 06D.</div>
          <div className="rag-input">
            <textarea
              disabled={!canRetrieve}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={selectedProfile ? "Спросить по всем заметкам…" : "Сначала настройте модель смыслового поиска"}
              rows={1}
              value={draft}
            />
            <button aria-label="Отправить" className="icon-send" disabled={!draft.trim() || !canRetrieve || retrievalState === "searching"} onClick={() => void sendQuestion()} type="button">
              <Icon name="send" />
            </button>
          </div>
        </div>
      </main>

      {!sourcesCollapsed ? (
        <>
          <ResizeHandle className="rag-sources-resize" label="Изменить ширину источников RAG" onReset={onSourcesReset} onResize={onSourcesResize} />
          <aside aria-label="Источники ответа" className="rag-sources-panel">
            <div className="rag-sources-panel-head">
              <span className="rag-sources-panel-title"><b>Источники</b><span>{activeSources.length > 0 ? `${activeSources.length} фрагментов` : "Пока нет результатов"}</span></span>
              <button aria-label="Скрыть источники" className="rag-sources-close" onClick={() => onSourcesCollapsedChange(true)} type="button"><Icon name="x" /></button>
            </div>
            <div className="rag-source-list">
              {activeSources.map((source) => (
                <button className="rag-source-card" key={source.chunkId} onClick={() => onOpenResult(source)} type="button">
                  <Icon name="doc" />
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
              {activeSources.length === 0 ? <div className="rag-source-meta">После вопроса здесь появятся заметки и точные фрагменты, использованные retrieval-поиском.</div> : null}
            </div>
          </aside>
        </>
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
  isUpdatingIndex: boolean;
  onOpenSettings: () => void;
  onProfileChange: (profileId: string) => void;
  onUpdateIndex: () => void;
  profiles: EmbeddingProfile[];
  selectedProfile: EmbeddingProfile | null;
  selectedProfileId: string;
}

function ModelStatusBar({
  generatorStatus,
  indexStatus,
  isLoading,
  isUpdatingIndex,
  onOpenSettings,
  onProfileChange,
  onUpdateIndex,
  profiles,
  selectedProfile,
  selectedProfileId,
}: ModelStatusBarProps) {
  if (isLoading) return <div className="rag-model-status loading">Проверяем подключённые модели…</div>;
  const needsUpdate = selectedProfile && indexStatus?.status !== "current";
  return (
    <section className="rag-model-status">
      <div className="rag-model-pill">
        <Icon name="chat" />
        <span><small>Модель ответа</small><b>{generatorStatus?.hasProvider ? `${generatorStatus.providerName} · ${generatorStatus.model}` : "Не подключена"}</b></span>
        <i className={generatorStatus?.canUse ? "ok" : "warn"} />
      </div>
      <div className="rag-model-pill">
        <Icon name="search" />
        <span>
          <small>Смысловой поиск</small>
          {profiles.length > 1 ? (
            <select aria-label="Модель смыслового поиска" onChange={(event) => onProfileChange(event.currentTarget.value)} value={selectedProfileId}>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          ) : <b>{selectedProfile ? `${selectedProfile.name} · ${selectedProfile.model}` : "Не подключён"}</b>}
        </span>
        {selectedProfile ? <em className={`locality-badge ${selectedProfile.locality}`}>{selectedProfile.locality === "local" ? "Локально" : "Облачно"}</em> : null}
      </div>
      {selectedProfile ? (
        <div className="rag-index-compact">
          <span>{indexStatusLabel(indexStatus)}{indexStatus ? ` · ${indexStatus.indexedChunks} из ${indexStatus.totalChunks}` : ""}</span>
          {needsUpdate ? <button className="secondary-btn compact" disabled={isUpdatingIndex || selectedProfile.lastStatus !== "success"} onClick={onUpdateIndex} type="button">{isUpdatingIndex ? "Обновляем…" : "Обновить базу для RAG"}</button> : null}
        </div>
      ) : (
        <div className="rag-model-empty"><span><b>Смысловой поиск (RAG) не настроен</b> Подключите модель смыслового поиска в разделе «Модели ИИ», чтобы работать со всей базой заметок.</span><button className="primary-btn compact" onClick={onOpenSettings} type="button">Настроить модели</button></div>
      )}
    </section>
  );
}

function latestSources(messages: RagChatMessage[]) {
  return [...messages].reverse().find((message) => message.sources.length > 0)?.sources ?? [];
}

function retrievalMessage(count: number) {
  if (count === 0) return emptyResponse;
  return `Найдено релевантных фрагментов: **${count}**.\n\nИсточники доступны в правой панели. Генерация ответа на основе найденных фрагментов будет подключена на следующем этапе.`;
}

function titleFromQuestion(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  return normalized.length > 58 ? `${normalized.slice(0, 57).trimEnd()}…` : normalized;
}

function formatChatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
}

function indexStatusLabel(status?: EmbeddingIndexStatus) {
  if (!status) return "Статус индекса недоступен";
  if (status.status === "current") return "База актуальна";
  if (status.status === "indexing") return "База обновляется";
  if (status.status === "partial") return "База обновлена частично";
  if (status.status === "failed") return "Ошибка обновления";
  return "База требует обновления";
}

function matchLabel(matchType: SemanticSearchResult["matchType"]) {
  if (matchType === "exact") return "Точное совпадение";
  if (matchType === "lexical") return "По тексту";
  if (matchType === "hybrid") return "Текст и смысл";
  return "По смыслу";
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : typeof error === "string" ? error : "Неизвестная ошибка";
}
