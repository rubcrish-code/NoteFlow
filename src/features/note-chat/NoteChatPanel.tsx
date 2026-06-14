import { useState } from "react";
import type { ChatMessage, Note } from "../../app/types";
import { noteChatSeed } from "../../data/mockData";
import { Icon } from "../../shared/Icon";
import { ResizeHandle } from "../../shared/ResizeHandle";

interface NoteChatPanelProps {
  note: Note;
  onClose: () => void;
  onResize: (deltaX: number) => void;
  onResetWidth: () => void;
}

export function NoteChatPanel({ note, onClose, onResize, onResetWidth }: NoteChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(noteChatSeed);
  const [draft, setDraft] = useState("");

  function handleSend() {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      { id: `u-${Date.now()}`, role: "user", text: trimmedDraft },
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: `Это мок-ответ по заметке «${note.title}». Подключение модели появится на отдельном этапе.`,
      },
    ]);
    setDraft("");
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
      <div className="nc-body">
        {messages.map((message) =>
          message.role === "user" ? (
            <div className="bub-u" key={message.id}>
              {message.text}
            </div>
          ) : (
            <div className="bub-a" key={message.id}>
              {message.text}
              <div className="src">
                <Icon name="doc" />
                <span>источник: эта заметка</span>
              </div>
            </div>
          ),
        )}
      </div>
      <div className="nc-in">
        <div className="box">
          <input
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSend();
              }
            }}
            placeholder="Спросить по заметке…"
            value={draft}
          />
          <button className="snd" onClick={handleSend} type="button">
            <Icon name="send" />
          </button>
        </div>
      </div>
    </aside>
  );
}
