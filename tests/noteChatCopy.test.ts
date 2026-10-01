import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { copyAssistantMessageText } from "../src/features/note-chat/NoteChatPanel.tsx";

class ClipboardRecorder {
  readonly writes: string[] = [];

  async writeText(value: string) {
    this.writes.push(value);
  }
}

class FailingClipboard {
  async writeText() {
    throw new Error("clipboard denied");
  }
}

const noteChatSource = readFileSync("src/features/note-chat/NoteChatPanel.tsx", "utf8");
const appCssSource = ["app.css", "chat.css"]
  .map((fileName) => readFileSync(`src/styles/${fileName}`, "utf8"))
  .join("\n");

describe("note chat assistant copy action", () => {
  it("copies Markdown assistant content as plain text without HTML or UI labels", async () => {
    const clipboard = new ClipboardRecorder();
    const markdown = "Проект **NoteFlow** — это приложение для заметок.\n\n- Хранение\n- Поиск\n- ИИ-чат";

    await copyAssistantMessageText(markdown, clipboard);

    assert.deepEqual(clipboard.writes, [markdown]);
    assert.doesNotMatch(clipboard.writes[0], /<strong>|<li>|<button>/);
    assert.doesNotMatch(clipboard.writes[0], /источник|Скопировать|Скопировано|reasoning/i);
  });

  it("surfaces clipboard errors without rewriting the message content", async () => {
    await assert.rejects(() => copyAssistantMessageText("Ответ модели", new FailingClipboard()), /clipboard denied/);
    await assert.rejects(() => copyAssistantMessageText("Ответ модели", null), /Clipboard API недоступен/);
  });

  it("renders icon-only copy controls for user and completed assistant messages", () => {
    const userBranchStart = noteChatSource.indexOf('message.role === "user"');
    const assistantBranchStart = noteChatSource.indexOf('<div className={`bub-a');
    assert.ok(userBranchStart >= 0);
    assert.ok(assistantBranchStart > userBranchStart);

    const userBranch = noteChatSource.slice(userBranchStart, assistantBranchStart);
    assert.match(userBranch, /className="bub-u"/);
    assert.match(userBranch, /aria-label="Скопировать сообщение"/);
    assert.match(userBranch, /chat-copy-icon/);
    assert.doesNotMatch(userBranch, />Скопировать</);

    assert.match(noteChatSource, /message\.status === undefined \? \([\s\S]*note-chat-message-meta[\s\S]*note-chat-copy/);
    assert.match(noteChatSource, /data-tooltip=\{copyTitle\(copyFeedback, message\.id\)\}/);
    assert.match(noteChatSource, /aria-label="Скопировать сообщение"/);
  });

  it("click handler copies only message.text and never source labels", () => {
    const copyHandler = noteChatSource.match(/async function handleCopyMessage\(message: ChatMessage\) \{[\s\S]*?\n  \}/);

    assert.ok(copyHandler);
    assert.match(copyHandler[0], /copyAssistantMessageText\(message\.text\)/);
    assert.doesNotMatch(copyHandler[0], /sourceTitle|источник|innerHTML|textContent/);
  });

  it("shows copied and error feedback states in NoteFlow styling", () => {
    assert.match(noteChatSource, /copyFeedback\.status === "copied" \? "Скопировано" : "Не удалось скопировать"/);
    assert.match(noteChatSource, /copyFeedback\.status === "copied" \? "check" : "copy"/);
    assert.match(noteChatSource, /copyFeedbackTimerRef/);
    assert.match(noteChatSource, /1600/);

    assert.match(appCssSource, /\.note-chat-message-meta/);
    assert.match(appCssSource, /\.note-chat-copy/);
    assert.match(appCssSource, /\.note-chat-copy\.copied/);
    assert.match(appCssSource, /\.note-chat-copy\.error/);
  });
});
