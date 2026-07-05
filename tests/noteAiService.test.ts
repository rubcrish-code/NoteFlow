import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");
const editorAreaSource = readFileSync("src/features/editor/EditorArea.tsx", "utf8");
const formattingToolbarSource = readFileSync("src/features/editor/FormattingToolbar.tsx", "utf8");
const appCssSource = readFileSync("src/styles/app.css", "utf8");
const noteChatMarkdownSource = readFileSync("src/features/note-chat/ChatMarkdown.tsx", "utf8");
const noteChatSource = readFileSync("src/features/note-chat/NoteChatPanel.tsx", "utf8");
const noteAiServiceSource = readFileSync("src/services/noteAiService.ts", "utf8");
const dataSource = readFileSync("src-tauri/src/data.rs", "utf8");
const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
const llmSource = readFileSync("src-tauri/src/llm.rs", "utf8");

describe("current note AI contract", () => {
  it("routes note AI through typed Tauri commands only", () => {
    assert.match(noteAiServiceSource, /from "@tauri-apps\/api\/core"/);
    assert.match(noteAiServiceSource, /invoke<NoteAiStatusDto>\("get_note_ai_status"/);
    assert.match(noteAiServiceSource, /invoke<NoteAiStatusDto>\("accept_note_ai_privacy"/);
    assert.match(noteAiServiceSource, /invoke<NoteChatMessageDto\[]>\("list_note_chat_messages"/);
    assert.match(noteAiServiceSource, /invoke<NoteChatMessageDto>\("save_note_chat_message"/);
    assert.match(noteAiServiceSource, /invoke<NoteAiResponseDto>\("run_note_ai"/);
    assert.match(noteAiServiceSource, /NOTE_AI_TIMEOUT_MS = 45_000/);
    assert.match(noteAiServiceSource, /createNoteAiContext/);
    assert.doesNotMatch(noteAiServiceSource, /\bfetch\s*\(/);
    assert.doesNotMatch(noteAiServiceSource, /XMLHttpRequest/);
    assert.doesNotMatch(noteAiServiceSource, /localStorage/);
    assert.doesNotMatch(noteAiServiceSource, /apiKey/i);
  });

  it("registers backend commands and stores privacy consent in app_settings", () => {
    for (const commandName of ["get_note_ai_status", "accept_note_ai_privacy", "list_note_chat_messages", "save_note_chat_message", "run_note_ai"]) {
      assert.match(libSource, new RegExp(`data::${commandName}`));
      assert.match(dataSource, new RegExp(`pub .*fn ${commandName}`));
    }

    assert.match(dataSource, /NOTE_AI_PRIVACY_LOCAL_KEY/);
    assert.match(dataSource, /NOTE_AI_PRIVACY_EXTERNAL_KEY/);
    assert.match(dataSource, /set_setting_tx/);
    assert.match(dataSource, /get_note_ai_privacy_accepted/);
    assert.doesNotMatch(dataSource, /localStorage/);
  });

  it("uses the default provider layer without exposing secrets", () => {
    assert.match(llmSource, /get_default_provider_record/);
    assert.match(llmSource, /run_note_ai_request/);
    assert.match(llmSource, /provider_headers/);
    assert.match(llmSource, /SecretStorage/);
    assert.match(llmSource, /API key missing/);
    assert.match(llmSource, /NOTE_AI_TIMEOUT_MS/);
    assert.match(llmSource, /build_note_ai_prompt/);
    assert.match(llmSource, /parse_note_ai_response/);
    assert.doesNotMatch(llmSource, /(^|[^\w])println!\(/);
    assert.doesNotMatch(llmSource, /dbg!\(/);
  });

  it("implements a real note chat with loading, privacy and stale-result guards", () => {
    assert.match(noteChatSource, /runNoteAi/);
    assert.match(noteChatSource, /getNoteAiStatus/);
    assert.match(noteChatSource, /acceptNoteAiPrivacy/);
    assert.match(noteChatSource, /createNoteAiContext/);
    assert.match(noteChatSource, /editorSelectedText/);
    assert.match(noteChatSource, /requestIdRef/);
    assert.match(noteChatSource, /statusRequestIdRef/);
    assert.match(noteChatSource, /noteIdRef/);
    assert.match(noteChatSource, /status: "loading"/);
    assert.match(noteChatSource, /status: "error"/);
    assert.match(noteChatSource, /note-chat-empty/);
    assert.match(noteChatSource, /note-chat-suggestions/);
    assert.doesNotMatch(noteChatSource, /noteChatSeed/);
    assert.doesNotMatch(noteChatSource, /мок-ответ/i);
  });

  it("persists current-note chat history in SQLite and restores it per note", () => {
    assert.match(noteChatSource, /listNoteChatMessages/);
    assert.match(noteChatSource, /saveNoteChatMessage/);
    assert.match(noteChatSource, /loadHistory\(note\.id\)/);
    assert.match(noteChatSource, /chatMessageFromPersisted/);
    assert.match(noteChatSource, /historyRequestIdRef/);
    assert.match(noteChatSource, /updateCurrentMessages/);
    assert.doesNotMatch(noteChatSource, /messagesByNote/);
    assert.doesNotMatch(noteChatSource, /initialMessages/);
    assert.doesNotMatch(noteChatSource, /welcome-/);

    assert.match(dataSource, /CREATE TABLE IF NOT EXISTS ai_chats/);
    assert.match(dataSource, /CREATE TABLE IF NOT EXISTS ai_messages/);
    assert.match(dataSource, /WHERE c\.scope = 'note' AND c\.note_id = \?1/);
    assert.match(dataSource, /INSERT INTO ai_chats \(id, scope, note_id, title, created_at, updated_at\)/);
    assert.match(dataSource, /INSERT INTO ai_messages \(id, chat_id, role, content, sources_json, created_at\)/);
    assert.match(dataSource, /fn note_chat_history_is_lazy_scoped_and_persistent/);
  });

  it("keeps the note chat scrollable with a pinned input area", () => {
    assert.match(noteChatSource, /messagesScrollRef/);
    assert.match(noteChatSource, /scrollArea\.scrollTop = scrollArea\.scrollHeight/);
    assert.match(noteChatSource, /className="nc-body" ref=\{messagesScrollRef\}/);
    assert.match(appCssSource, /\.note-chat \{[\s\S]*min-height: 0;[\s\S]*overflow: hidden;/);
    assert.match(appCssSource, /\.nc-body \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;/);
    assert.match(appCssSource, /\.nc-in \{[\s\S]*flex-shrink: 0;/);
  });

  it("renders assistant Markdown safely and shows the current note title as source", () => {
    assert.match(noteChatSource, /<ChatMarkdown content=\{message\.text\} \/>/);
    assert.match(noteChatSource, /getNoteChatSourceTitle\(note\.title\)/);
    assert.match(noteChatSource, /источник: «\{sourceTitle\}»/);
    assert.doesNotMatch(noteChatSource, /источник: эта заметка/);

    assert.match(noteChatMarkdownSource, /markdownToTiptapDoc/);
    assert.match(noteChatMarkdownSource, /sanitizeMarkdownLinkHref/);
    assert.match(noteChatMarkdownSource, /<strong/);
    assert.match(noteChatMarkdownSource, /<ul/);
    assert.match(noteChatMarkdownSource, /<ol/);
    assert.match(noteChatMarkdownSource, /<pre/);
    assert.match(noteChatMarkdownSource, /<blockquote/);
    assert.doesNotMatch(noteChatMarkdownSource, /dangerouslySetInnerHTML/);
  });

  it("connects the right chat panel to settings without overlaying the editor", () => {
    assert.match(appShellSource, /<NoteChatPanel/);
    assert.match(appShellSource, /onOpenAiSettings/);
    assert.match(appShellSource, /editorSelectionText/);
    assert.match(appShellSource, /onSelectionTextChange=\{setEditorSelectionText\}/);
    assert.match(appShellSource, /selectedText=\{editorSelectionText\}/);
    assert.match(appShellSource, /onToast=\{showToast\}/);
    assert.match(appShellSource, /chatWidth/);
  });

  it("maps toolbar AI actions to explicit current-note actions and avoids RAG actions", () => {
    for (const actionId of ["improve", "fix", "shorten", "expand", "tone", "tasks", "translate", "explain", "ask"]) {
      assert.match(formattingToolbarSource, new RegExp(`id: "${actionId}"`));
    }

    assert.match(formattingToolbarSource, /onAiAction\(item\.id\)/);
    assert.match(formattingToolbarSource, /pendingAiActionId/);
    assert.doesNotMatch(formattingToolbarSource, /Найти связанные заметки/);
    assert.doesNotMatch(formattingToolbarSource, /RAG-чат|ragChat|rag_action|search_all_notes/i);
  });

  it("keeps AI editor edits behind preview actions and guards stale selections", () => {
    assert.match(editorAreaSource, /createAiSelectionSnapshot/);
    assert.match(editorAreaSource, /selectionStillMatches/);
    assert.match(editorAreaSource, /AiScopeChoicePanel/);
    assert.match(editorAreaSource, /AiPrivacyPanel/);
    assert.match(editorAreaSource, /AiPreviewPanel/);
    assert.match(editorAreaSource, /replace-selection/);
    assert.match(editorAreaSource, /insert-below/);
    assert.match(editorAreaSource, /insert-cursor/);
    assert.match(editorAreaSource, /replace-note/);
    assert.match(editorAreaSource, /navigator\.clipboard\.writeText/);
    assert.match(editorAreaSource, /preview\.isStale/);
    assert.match(editorAreaSource, /runNoteAi/);
    assert.match(editorAreaSource, /acceptNoteAiPrivacy/);
    assert.doesNotMatch(editorAreaSource, /document\.execCommand/);
  });
});
