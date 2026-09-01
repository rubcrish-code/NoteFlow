import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Note } from "../../app/types";
import {
  acceptNoteAiPrivacy,
  createNoteAiContext,
  getNoteAiStatus,
  listNoteChatMessages,
  runNoteAi,
  saveNoteChatMessage,
  type NoteAiStatus,
  type PersistedNoteChatMessage,
} from "../../services/noteAiService";
import { Icon } from "../../shared/Icon";
import { ResizeHandle } from "../../shared/ResizeHandle";
import { ChatMarkdown, getNoteChatSourceTitle } from "./ChatMarkdown";

interface NoteChatPanelProps {
  note: Note;
  onClose: () => void;
  onOpenAiSettings: () => void;
  onResize: (deltaX: number) => void;
  onResetWidth: () => void;
  onToast: (message: string) => void;
  selectedText?: string;
}

const suggestedPrompts = [
  "Сделай краткое резюме",
  "Что здесь главное?",
  "Выдели задачи",
  "Найди ошибки",
  "Перепиши официально",
  "Объясни простыми словами",
];

type CopyFeedback = {
  messageId: string;
  status: "copied" | "error";
};

interface ClipboardWriter {
  writeText(value: string): Promise<void> | void;
}

export function NoteChatPanel({ note, onClose, onOpenAiSettings, onResize, onResetWidth, onToast, selectedText: editorSelectedText }: NoteChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [aiStatus, setAiStatus] = useState<NoteAiStatus | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAcceptingPrivacy, setIsAcceptingPrivacy] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const noteIdRef = useRef(note.id);
  const requestIdRef = useRef(0);
  const statusRequestIdRef = useRef(0);
  const historyRequestIdRef = useRef(0);
  const isMountedRef = useRef(false);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const sourceTitle = useMemo(() => getNoteChatSourceTitle(note.title), [note.title]);
  const canSend = Boolean(aiStatus?.hasProvider && aiStatus.privacyAccepted && aiStatus.canUse && !isStatusLoading);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearCopyFeedbackTimer();
    };
  }, []);

  useEffect(() => {
    noteIdRef.current = note.id;
    setCopyFeedback(null);
    clearCopyFeedbackTimer();
  }, [note.id]);

  useEffect(() => {
    void refreshStatus();
    void loadHistory(note.id);
  }, [note.id]);

  useEffect(() => {
    const scrollArea = messagesScrollRef.current;
    if (!scrollArea) {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isHistoryLoading, messages, note.id]);

  async function loadHistory(noteId: string) {
    const requestId = ++historyRequestIdRef.current;
    setIsHistoryLoading(true);
    setMessages([]);
    try {
      const history = await listNoteChatMessages(noteId);
      if (!isMountedRef.current || requestId !== historyRequestIdRef.current || noteIdRef.current !== noteId) {
        return;
      }
      setMessages(history.map(chatMessageFromPersisted));
    } catch (error) {
      if (isMountedRef.current && requestId === historyRequestIdRef.current && noteIdRef.current === noteId) {
        setMessages([]);
        onToast(`Не удалось загрузить историю чата заметки: ${safeErrorMessage(error)}`);
      }
    } finally {
      if (isMountedRef.current && requestId === historyRequestIdRef.current && noteIdRef.current === noteId) {
        setIsHistoryLoading(false);
      }
    }
  }

  async function refreshStatus() {
    const requestId = ++statusRequestIdRef.current;
    setIsStatusLoading(true);
    try {
      const status = await getNoteAiStatus();
      if (!isMountedRef.current || requestId !== statusRequestIdRef.current) {
        return null;
      }
      setAiStatus(status);
      return status;
    } catch (error) {
      if (isMountedRef.current && requestId === statusRequestIdRef.current) {
        setAiStatus({
          hasProvider: false,
          isLocal: true,
          privacyScope: "local",
          privacyAccepted: false,
          privacyNotice: "",
          canUse: false,
          message: String(error),
        });
      }
      return null;
    } finally {
      if (isMountedRef.current && requestId === statusRequestIdRef.current) {
        setIsStatusLoading(false);
      }
    }
  }

  async function handleAcceptPrivacy() {
    const status = aiStatus;
    if (!status) {
      return;
    }

    setIsAcceptingPrivacy(true);
    try {
      setAiStatus(await acceptNoteAiPrivacy(status.privacyScope));
    } catch (error) {
      onToast(`Не удалось сохранить подтверждение AI privacy: ${safeErrorMessage(error)}`);
    } finally {
      if (isMountedRef.current) {
        setIsAcceptingPrivacy(false);
      }
    }
  }

  async function handleSend(question = draft) {
    const trimmedDraft = question.trim();
    if (!trimmedDraft || isSending) {
      return;
    }

    const status = aiStatus ?? (await refreshStatus());
    if (!status?.hasProvider) {
      onToast("Сначала выберите default LLM provider в настройках моделей");
      return;
    }
    if (!status.privacyAccepted) {
      onToast("Подтвердите предупреждение AI privacy перед отправкой текста");
      return;
    }
    if (!status.canUse) {
      onToast(status.message);
      return;
    }

    const requestId = ++requestIdRef.current;
    const noteIdAtRequest = note.id;
    const timestamp = Date.now();
    const pendingUserId = `u-pending-${timestamp}`;
    const assistantId = `a-pending-${timestamp}`;
    const selectedText = editorSelectedText?.trim() || getSelectedTextFromWindow();
    setIsSending(true);
    updateCurrentMessages(noteIdAtRequest, (currentMessages) => [
      ...currentMessages,
      { id: pendingUserId, role: "user", text: trimmedDraft },
      {
        id: assistantId,
        role: "assistant",
        status: "loading",
        text: "ИИ думает…",
      },
    ]);
    setDraft("");

    try {
      const savedUserMessage = await saveNoteChatMessage(noteIdAtRequest, "user", trimmedDraft);
      updateCurrentMessages(noteIdAtRequest, (currentMessages) =>
        currentMessages.map((message) => (message.id === pendingUserId ? chatMessageFromPersisted(savedUserMessage) : message)),
      );

      const result = await runNoteAi({
        kind: "chat",
        scope: selectedText ? "selection" : "note",
        question: trimmedDraft,
        context: createNoteAiContext(note, selectedText),
      });
      const savedAssistantMessage = await saveNoteChatMessage(noteIdAtRequest, "assistant", result.response);

      if (!isMountedRef.current || requestId !== requestIdRef.current || noteIdRef.current !== noteIdAtRequest) {
        return;
      }
      setMessages((currentMessages) =>
        currentMessages.map((message) => (message.id === assistantId ? chatMessageFromPersisted(savedAssistantMessage) : message)),
      );
    } catch (error) {
      if (!isMountedRef.current || requestId !== requestIdRef.current || noteIdRef.current !== noteIdAtRequest) {
        return;
      }
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantId
            ? {
                id: assistantId,
                role: "assistant",
                status: "error",
                text: safeErrorMessage(error),
              }
            : message,
        ),
      );
    } finally {
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setIsSending(false);
      }
    }
  }

  function updateCurrentMessages(noteId: string, updater: (currentMessages: ChatMessage[]) => ChatMessage[]) {
    if (!isMountedRef.current || noteIdRef.current !== noteId) {
      return;
    }
    setMessages(updater);
  }

  function clearCopyFeedbackTimer() {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
  }

  function showCopyFeedback(messageId: string, status: CopyFeedback["status"]) {
    clearCopyFeedbackTimer();
    setCopyFeedback({ messageId, status });
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback((currentFeedback) => (currentFeedback?.messageId === messageId ? null : currentFeedback));
      copyFeedbackTimerRef.current = null;
    }, 1600);
  }

  async function handleCopyAssistantMessage(message: ChatMessage) {
    try {
      await copyAssistantMessageText(message.text);
      showCopyFeedback(message.id, "copied");
    } catch {
      showCopyFeedback(message.id, "error");
    }
  }

  return (
    <aside className="note-chat">
      <ResizeHandle className="chat-resize" label="Изменить ширину чата" onResize={(deltaX) => onResize(-deltaX)} onReset={onResetWidth} />
      <div className="nc-top">
        <span className="t">Чат · по заметке</span>
        <button className="x" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>
      <div className="nc-body" ref={messagesScrollRef}>
        {isStatusLoading ? (
          <div className="note-chat-status">
            <span className="button-spinner" />
            <span>Проверяем модель…</span>
          </div>
        ) : null}
        {isHistoryLoading ? (
          <div className="note-chat-status">
            <span className="button-spinner" />
            <span>Загружаем историю…</span>
          </div>
        ) : null}
        {!isStatusLoading && aiStatus && !aiStatus.hasProvider ? (
          <div className="note-chat-empty">
            <b>ИИ-модель не подключена</b>
            <span>Выберите default provider в настройках, чтобы задавать вопросы по текущей заметке.</span>
            <button className="primary-btn compact" onClick={onOpenAiSettings} type="button">
              Подключить модель
            </button>
          </div>
        ) : null}
        {!isStatusLoading && aiStatus?.hasProvider && !aiStatus.privacyAccepted ? (
          <div className="note-chat-empty privacy">
            <b>{aiStatus.isLocal ? "Локальная модель" : "Внешний AI provider"}</b>
            <span>{aiStatus.privacyNotice}</span>
            <button className="primary-btn compact" disabled={isAcceptingPrivacy} onClick={() => void handleAcceptPrivacy()} type="button">
              {isAcceptingPrivacy ? <span className="button-spinner" /> : null}
              Подтвердить
            </button>
          </div>
        ) : null}
        {!isStatusLoading && aiStatus?.hasProvider && aiStatus.privacyAccepted && !aiStatus.canUse ? (
          <div className="note-chat-empty error">
            <b>Модель недоступна</b>
            <span>{aiStatus.message}</span>
            <button className="secondary-btn compact" onClick={onOpenAiSettings} type="button">
              Открыть настройки
            </button>
          </div>
        ) : null}
        {!isHistoryLoading && canSend && messages.length === 0 ? (
          <div className="note-chat-empty chat-history-empty">
            <b>Истории пока нет</b>
            <span>Задайте вопрос по текущей заметке. Чат сохранится только после первого сообщения.</span>
          </div>
        ) : null}
        {messages.map((message) =>
          message.role === "user" ? (
            <div className="bub-u" key={message.id}>
              <span className="plain-chat-text">{message.text}</span>
            </div>
          ) : (
            <div className={`bub-a ${message.status ?? ""}`} key={message.id}>
              {message.status === "loading" ? (
                <>
                  <span className="button-spinner" />
                  <span>{message.text}</span>
                </>
              ) : message.status === "error" ? (
                <span>{message.text}</span>
              ) : (
                <ChatMarkdown content={message.text} />
              )}
              {message.status === undefined ? (
                <div className="note-chat-message-meta">
                  <div className="src">
                    <Icon name="doc" />
                    <span>источник: «{sourceTitle}»</span>
                  </div>
                  <button
                    className={`note-chat-copy ${copyFeedback?.messageId === message.id ? copyFeedback.status : ""}`}
                    onClick={() => void handleCopyAssistantMessage(message)}
                    title={copyTitle(copyFeedback, message.id)}
                    type="button"
                  >
                    <Icon name={copyFeedback?.messageId === message.id && copyFeedback.status === "copied" ? "check" : "copy"} />
                    <span>{copyLabel(copyFeedback, message.id)}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ),
        )}
        {messages.length === 0 ? (
          <div className="note-chat-suggestions">
            {suggestedPrompts.map((prompt) => (
              <button disabled={isSending || !canSend} key={prompt} onClick={() => void handleSend(prompt)} type="button">
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="nc-in">
        <div className="box">
          <input
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleSend();
              }
            }}
            placeholder="Спросить по заметке…"
            value={draft}
          />
          <button className="snd" disabled={isSending || !draft.trim() || !canSend} onClick={() => void handleSend()} type="button">
            {isSending ? <span className="button-spinner" /> : <Icon name="send" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

function chatMessageFromPersisted(message: PersistedNoteChatMessage): ChatMessage {
  return {
    createdAt: message.createdAt,
    id: message.id,
    role: message.role,
    text: message.content,
  };
}

function getSelectedTextFromWindow() {
  return window.getSelection()?.toString().trim() ?? "";
}

function copyTitle(copyFeedback: CopyFeedback | null, messageId: string) {
  if (copyFeedback?.messageId !== messageId) {
    return "Скопировать";
  }
  return copyFeedback.status === "copied" ? "Скопировано" : "Не удалось скопировать";
}

function copyLabel(copyFeedback: CopyFeedback | null, messageId: string) {
  if (copyFeedback?.messageId !== messageId) {
    return "Скопировать";
  }
  return copyFeedback.status === "copied" ? "Скопировано" : "Не удалось скопировать";
}

function getClipboardWriter(): ClipboardWriter | null {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return null;
  }
  return navigator.clipboard;
}

export async function copyAssistantMessageText(messageContent: string, clipboard: ClipboardWriter | null = getClipboardWriter()) {
  if (!clipboard) {
    throw new Error("Clipboard API недоступен");
  }
  await clipboard.writeText(messageContent);
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Не удалось получить ответ модели");
}
