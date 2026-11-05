import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AppLanguage, ChatMessage, Note } from "../../app/types";
import { localizeUiMessage, uiMessage } from "../../shared/uiMessages";
import {
  acceptNoteAiPrivacy,
  getNoteAiStatus,
  listNoteChatMessages,
  type NoteAiStatus,
  type PersistedNoteChatMessage,
} from "../../services/noteAiService";
import { noteChatJobs, noteChatDrafts, sendNoteChatInBackground } from "../../services/noteChatBackground";
import { Icon } from "../../shared/Icon";
import { ChatComposer } from "../../shared/ChatComposer";
import { ResizeHandle } from "../../shared/ResizeHandle";
import { ChatMarkdown, getNoteChatSourceTitle } from "./ChatMarkdown";

interface NoteChatPanelProps {
  language?: AppLanguage;
  note: Note;
  onClose: () => void;
  onOpenAiSettings: () => void;
  onResize: (deltaX: number) => void;
  onResizeStart?: (handle: HTMLDivElement) => void;
  onResizeEnd?: () => void;
  onResetWidth: () => void;
  onToast: (message: string) => void;
  selectedText?: string;
}

const suggestedPrompts = [
  translate("ui.817daeaa3e40"),
  translate("ui.a7a2418df2c0"),
  translate("ui.fbd3aef15335"),
  translate("ui.8e44d4ea6e5a"),
  translate("ui.900923dd030d"),
  translate("ui.bac493a86696"),
];

type CopyFeedback = {
  messageId: string;
  status: "copied" | "error";
};

interface ClipboardWriter {
  writeText(value: string): Promise<void> | void;
}

export function NoteChatPanel({ language = getInterfaceLanguage(), note, onClose, onOpenAiSettings, onResize, onResizeStart, onResizeEnd, onResetWidth, onToast, selectedText: editorSelectedText }: NoteChatPanelProps) {
  useInterfaceLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const draft = useSyncExternalStore(noteChatDrafts.subscribe, () => noteChatDrafts.get(note.id));
  const setDraft = (text: string) => noteChatDrafts.set(note.id, text);
  const [aiStatus, setAiStatus] = useState<NoteAiStatus | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const job = useSyncExternalStore(noteChatJobs.subscribe, () => noteChatJobs.get(note.id));
  const isSending = noteChatJobs.busy(note.id);
  const [isAcceptingPrivacy, setIsAcceptingPrivacy] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const noteIdRef = useRef(note.id);
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
  }, [note.id]);

  useEffect(() => {
    void loadHistory(note.id);
  }, [note.id, job?.userMessageId, job?.result?.id]);

  useEffect(() => {
    const scrollArea = messagesScrollRef.current;
    if (!scrollArea) {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isHistoryLoading, messages, note.id, job?.text]);

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
        onToast(translate("ui.e25bb59ceaf5", { p0: safeErrorMessage(error) }));
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
      const status = await getNoteAiStatus(language);
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
          message: localizeUiMessage(language, error instanceof Error ? error.message : uiMessage(language, "providerConnectionsLoadFailed")),
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
      setAiStatus(await acceptNoteAiPrivacy(status.privacyScope, language));
    } catch {
      onToast(uiMessage(language, "aiPrivacySaveFailed"));
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
    if (!isMountedRef.current || noteIdRef.current !== note.id) return;
    if (!status?.hasProvider) {
      onToast(uiMessage(language, "chooseDefaultProvider"));
      return;
    }
    if (!status.privacyAccepted) {
      onToast(uiMessage(language, "confirmAiPrivacy"));
      return;
    }
    if (!status.canUse) {
      onToast(localizeUiMessage(language, status.message));
      return;
    }

    const selectedText = editorSelectedText?.trim() || getSelectedTextFromWindow();
    await sendNoteChatInBackground(note, trimmedDraft, selectedText);
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

  async function handleCopyMessage(message: ChatMessage) {
    try {
      await copyAssistantMessageText(message.text);
      showCopyFeedback(message.id, "copied");
    } catch {
      showCopyFeedback(message.id, "error");
    }
  }

  return (
    <aside className="note-chat">
      <ResizeHandle className="chat-resize" label={translate("ui.a326f9463d95")} onResize={(deltaX) => onResize(-deltaX)} onReset={onResetWidth} onResizeStart={onResizeStart} onResizeEnd={onResizeEnd} />
      <div className="nc-top">
        <span className="t">{translate("ui.38ac0283cd7c")}</span>
        <button aria-label={language === "en" ? "Close note chat" : translate("ui.c31af56d6246")} data-tooltip={language === "en" ? "Close note chat" : translate("ui.c31af56d6246")} className="x" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>
      <div className="nc-body" ref={messagesScrollRef}>
        {isStatusLoading ? (
          <div className="note-chat-status">
            <span className="button-spinner" />
            <span>{translate("ui.ba49a376c503")}</span>
          </div>
        ) : null}
        {isHistoryLoading ? (
          <div className="note-chat-status">
            <span className="button-spinner" />
            <span>{translate("ui.efb18c179df6")}</span>
          </div>
        ) : null}
        {!isStatusLoading && aiStatus && !aiStatus.hasProvider ? (
          <div className="note-chat-empty">
            <b>{uiMessage(language, "aiModelNotConnected")}</b>
            <span>{uiMessage(language, "noteChatChooseDefaultProvider")}</span>
            <button className="primary-btn compact" onClick={onOpenAiSettings} type="button">
              {translate("ui.0258588f30ad")}</button>
          </div>
        ) : null}
        {!isStatusLoading && aiStatus?.hasProvider && !aiStatus.privacyAccepted ? (
          <div className="note-chat-empty privacy">
            <b>{uiMessage(language, aiStatus.isLocal ? "localAiModel" : "externalAiProvider")}</b>
            <span>{localizeUiMessage(language, aiStatus.privacyNotice)}</span>
            <button className="primary-btn compact" disabled={isAcceptingPrivacy} onClick={() => void handleAcceptPrivacy()} type="button">
              {isAcceptingPrivacy ? <span className="button-spinner" /> : null}
              {translate("ui.27bca309f5f8")}</button>
          </div>
        ) : null}
        {!isStatusLoading && aiStatus?.hasProvider && aiStatus.privacyAccepted && !aiStatus.canUse ? (
          <div className="note-chat-empty error">
            <b>{translate("ui.734946718252")}</b>
            <span>{localizeUiMessage(language, aiStatus.message)}</span>
            <button className="secondary-btn compact" onClick={onOpenAiSettings} type="button">
              {translate("ui.7c8ef82d31bc")}</button>
          </div>
        ) : null}
        {!isHistoryLoading && canSend && messages.length === 0 ? (
          <div className="note-chat-empty chat-history-empty">
            <b>{translate("ui.6c37656d4bf9")}</b>
            <span>{translate("ui.c49e2b75896a")}</span>
          </div>
        ) : null}
        {messages.map((message) =>
          message.role === "user" ? (
            <div className="bub-u" key={message.id}>
              <span className="plain-chat-text">{message.text}</span>
              <button
                aria-label={translate("ui.efb6957fa025")}
                className={`note-chat-copy chat-copy-icon ${copyFeedback?.messageId === message.id ? copyFeedback.status : ""}`}
                onClick={() => void handleCopyMessage(message)}
                data-tooltip={copyTitle(copyFeedback, message.id)}
                type="button"
              >
                <Icon name={copyFeedback?.messageId === message.id && copyFeedback.status === "copied" ? "check" : "copy"} />
              </button>
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
                    <span>{translate("chat.source", { title: sourceTitle })}</span>
                  </div>
                  <button
                    aria-label={translate("ui.efb6957fa025")}
                    className={`note-chat-copy chat-copy-icon ${copyFeedback?.messageId === message.id ? copyFeedback.status : ""}`}
                    onClick={() => void handleCopyMessage(message)}
                    data-tooltip={copyTitle(copyFeedback, message.id)}
                    type="button"
                  >
                    <Icon name={copyFeedback?.messageId === message.id && copyFeedback.status === "copied" ? "check" : "copy"} />
                  </button>
                </div>
              ) : null}
            </div>
          ),
        )}
        {isSending ? <div className="bub-a loading" aria-live="polite">{job?.text ? <ChatMarkdown content={job.text} /> : <><span className="button-spinner" /><span>{translate("ui.ff2ef5dde2ff")}</span></>}</div> : null}
        {job?.phase === "error" || job?.phase === "stopped" ? <div className="bub-a error" role="alert">{job.error}</div> : null}
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
        <ChatComposer
          ariaLabel={translate("ui.f6ad4fff9a57")}
          className="note-chat-composer"
          disabled={!canSend}
          isSubmitting={isSending}
          onChange={setDraft}
          onSubmit={() => void handleSend()}
          onStop={() => void noteChatJobs.stop(note.id)}
          placeholder={translate("ui.e07a5a1e4c8d")}
          value={draft}
        />
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
    return translate("ui.f02956c16588");
  }
  return copyFeedback.status === "copied" ? translate("ui.d2d08c715ee6") : translate("ui.f400e0b540f3");
}

function getClipboardWriter(): ClipboardWriter | null {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return null;
  }
  return navigator.clipboard;
}

export async function copyAssistantMessageText(messageContent: string, clipboard: ClipboardWriter | null = getClipboardWriter()) {
  if (!clipboard) {
    throw new Error(translate("ui.704bb7a80f2c"));
  }
  await clipboard.writeText(messageContent);
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || translate("ui.bed18cdc5e11"));
}
