// Synthetic IPC only; no user data or external model connection.
import { createRoot } from "react-dom/client";
import { Profiler } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { AppShell } from "../../src/app/AppShell";
import { DEFAULT_UI_SETTINGS } from "../../src/services/uiSettingsService";
import { TAG_COLOR_PALETTE } from "../../src/features/tags/tagPalette";
import { internalNoteHref } from "../../src/shared/internalNoteLink";
import { InfoHint } from "../../src/shared/InfoHint";
import "../../src/styles/tokens.css";
import "../../src/styles/app.css";
import "../../src/styles/foundation.css";
import "../../src/styles/pages.css";
import "../../src/styles/settings.css";
import "../../src/styles/editor.css";
import "../../src/styles/chat.css";
import "../../src/styles/rag.css";
import "./rc5-final-ui.css";

const params = new URLSearchParams(location.search);
const onboarding = params.has("onboarding");
let profileSaved = false;
let completed = false;
let settings = { ...DEFAULT_UI_SETTINGS, localProfileName: onboarding ? "Пользователь" : "QA", appZoomPercent: Number(params.get("zoom") || 100), theme: params.get("theme") === "dark" ? "dark" as const : "light" as const };
if (params.get("language") === "en") settings.language = "en";
if (params.has("full-i18n")) {
  const saved = localStorage.getItem("noteflow.qa.interfaceLanguage");
  if (saved === "en" || saved === "ru") settings.language = saved;
}
if (params.has("sidebar")) { settings.sidebarWidth = Number(params.get("sidebar")) || 250; settings.sidebarCollapsed = params.get("sidebar") === "collapsed"; }
const timestamp = "2026-10-25T12:00:00Z";
const tags = params.has("perf-notes")
  ? Array.from({ length: 10 }, (_, index) => ({ id: `perf-tag-${index}`, name: `QA tag ${index}`, color: "blue", customColor: "#60a5fa", count: 1 }))
  : TAG_COLOR_PALETTE.map((color) => ({ id: color.id, name: color.label, color: color.color, customColor: color.hex, count: 1 }));
const quote = "Фрагмент для точного перехода между заметками и источниками.";
const blocks = ["Целевая", ...Array.from({ length: 45 }, (_, index) => `Абзац ${index}. Проверяем длинную заметку и положение фрагмента.`), quote, "Текст после фрагмента."];
const full = blocks.join(" ");
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
const fragment = { quote, before: await hash(""), after: await hash("") };
const base = { contentHtml: "", contentJson: { type: "doc", content: [] }, contentVersion: 1, contentSidecars: [], attachments: [], project: "", isFavorite: false, isPinned: false, noteDate: "2026-10-25", createdAt: timestamp, updatedAt: timestamp, wordCount: 10 };
let notes = [
  { ...base, id: "source-note", title: "Связи", tags, plainText: "Ссылки", contentMarkdown: `# Связи\n\n[К целевой](noteflow://note/target-note)\n\n[Открыть фрагмент](${internalNoteHref({ noteId: "target-note", fragment })})` },
  { ...base, id: "target-note", title: "Целевая", tags: [], plainText: full, contentMarkdown: `# ${blocks[0]}\n\n${blocks.slice(1).join("\n\n")}` },
];
if (params.has("cas")) {
  const response = await fetch("/releases/qa/cas-seed.json");
  if (!response.ok) throw new Error("Missing isolated CAS QA fixture");
  notes = (await response.json() as typeof notes).map((note) => ({ ...base, tags: [], ...note }));
}
if (params.has("user-markdown")) {
  const { standardMarkdownUserDocument } = await import("../../tests/fixtures/standardMarkdownUser");
  const { serializeEditorDocumentForStorage } = await import("../../src/features/editor/editorContentSerializer");
  const saved = serializeEditorDocumentForStorage(standardMarkdownUserDocument());
  Object.assign(notes[0], { title: "Планирование QA", ...saved, contentJson: saved.editorDocument, tags: [] });
}
if (params.has("perf-notes")) {
  const count = Math.min(10000, Math.max(2, Number(params.get("perf-notes")) || 2));
  const body = params.has("perf-long") ? Array.from({ length: 1000 }, (_, i) => `Абзац ${i}. Обычный текст и **жирный фрагмент**, затем *курсив*.`).join("\n\n") : "# QA документ\n\nТекст для измерения отзывчивости.";
  notes = Array.from({ length: count }, (_, index) => ({ ...base, id: `perf-${index}`, title: `QA заметка ${index}`, contentMarkdown: index === 0 ? body : "Простая заметка.", plainText: "QA текст", tags: index === 0 ? tags : [] }));
}
if (params.has("typing-case")) {
  const { typingFixture } = await import("./typing-fixtures");
  notes[0] = { ...notes[0], contentMarkdown: typingFixture(params.get("typing-case") ?? "1000"), plainText: "Синтетическая заметка" };
}
const ragCase = params.get("rag");
if (ragCase === "repeated") notes[1].contentMarkdown += `\n\n${quote}`;
if (ragCase === "archived") Object.assign(notes[1], { archivedAt: timestamp });
const ragSource = { chunkId: "qa-chunk", noteId: ragCase === "deleted" ? "missing-note" : notes[1].id, noteTitle: notes[1].title, snippet: ragCase === "missing" ? "Этот фрагмент отсутствует в документе полностью." : quote, headingPath: [], tags: [], score: 1, updatedAt: ragCase === "stale" ? "2026-10-24T12:00:00Z" : timestamp, archived: ragCase === "archived", sourceId: "S1", citationNumber: 1 };
const ragChat = { id: "qa-rag", title: "QA источники", createdAt: timestamp, updatedAt: timestamp };
const projects = params.has("forms") ? [{ id: "qa-project", title: "QA проект", description: "", notes: 0, tasks: 0, status: "active", color: "blue", iconKey: "folder" }] : [];
const commands: string[] = [];
const localizedChatMessages = [{ id: "qa-chat-history", noteId: notes[0].id, role: "assistant", content: "**История QA**", createdAt: timestamp }];
const searchRequests: unknown[] = [];
const copiedLinks: string[] = [];
const exports: Array<{ noteId: string; contentVersion: number; markdown: string }> = [];
const renders: Array<{ duration: number; phase: string }> = [];
declare global { interface Window { finalQa: { commands: string[]; searchRequests: unknown[]; copiedLinks: string[]; exports: typeof exports; renders: typeof renders; notes: () => typeof notes } } }
window.finalQa = { commands, searchRequests, copiedLinks, exports, renders, notes: () => notes };
mockIPC((command, args) => {
  commands.push(command);
  if (params.has("ai-i18n")) {
    if (command === "get_note_ai_status") {
      const hasProvider = params.get("ai-i18n") !== "none", ready = params.get("ai-i18n") === "ready";
      return { hasProvider, canUse: ready, privacyAccepted: ready, isLocal: false, privacyScope: "external",
        providerName: hasProvider ? "Синтетическая модель QA" : null, model: hasProvider ? "qa-model" : null,
        message: hasProvider ? "Перед первым AI-запросом подтвердите предупреждение о передаче текста" : "Default LLM provider не выбран",
        privacyNotice: hasProvider ? "Внешний endpoint: при использовании модели выбранный контекст будет отправлен провайдеру." : "Выберите default LLM provider в настройках моделей." };
    }
    if (command === "list_note_chat_messages") return localizedChatMessages;
    if (command === "save_note_chat_message") {
      const request = (args as { request: { noteId: string; role: string; content: string } }).request;
      const message = { id: `qa-message-${localizedChatMessages.length}`, createdAt: timestamp, ...request };
      localizedChatMessages.push(message); return message;
    }
    if (command === "run_note_ai") return { status: "success", message: "Ответ модели получен", response: "**Ответ QA** по текущей заметке.", providerName: "Синтетическая модель QA", model: "qa-model", isLocal: true };
  }
  if (command === "load_workspace") return { notes: onboarding && !completed ? [] : notes, projects, tags, archiveItems: [], dataLocation: { dataDir: "", databasePath: "" } };
  if (command === "get_first_run_state") return { required: onboarding && !completed, needsProfileName: !profileSaved };
  if (command === "save_first_run_profile") { profileSaved = true; settings.localProfileName = (args as { request: { profileName: string } }).request.profileName; return settings; }
  if (command === "complete_first_run") { completed = true; return { note: notes[0], settings }; }
  if (command === "get_ui_settings") return settings;
  if (command === "update_ui_settings") {
    settings = (args as { request: typeof settings }).request;
    if (params.has("full-i18n")) localStorage.setItem("noteflow.qa.interfaceLanguage", settings.language);
    return settings;
  }
  if (command === "get_note") { const note = notes.find((item) => item.id === (args as { noteId: string }).noteId); if (!note) throw new Error("Not found"); return note; }
  if (command === "list_notes") return notes;
  if (command === "write_editor_clipboard") { copiedLinks.push((args as { text: string }).text); return; }
  if (command === "search_notes") {
    const request = (args as { request: { query: string; offset: number; limit: number } }).request;
    searchRequests.push(request);
    const count = params.get("picker-count");
    const records = count ? Array.from({ length: Number(count) }, (_, index) => ({ noteId: `picker-${index}`, title: `Заметка ${String(index).padStart(5, '0')}`, archived: index % 2 === 0, projectId: "project", project: "Проект QA", favorite: false, matchSource: "title", relevanceScore: 0, snippet: "", tags: [], updatedAt: timestamp }))
      : notes.map((note) => ({ noteId: note.id, title: note.title, archived: false, favorite: false, matchSource: "title", project: "", relevanceScore: 1, snippet: note.plainText, tags: note.tags, updatedAt: timestamp }));
    return records.filter((note) => note.title.toLowerCase().includes(request.query.toLowerCase())).slice(request.offset, request.offset + request.limit);
  }
  if (command === "update_note_content") { const request = (args as { request: { noteId: string } }).request; notes = notes.map((note) => note.id === request.noteId ? { ...note, ...request, contentVersion: note.contentVersion + 1 } : note); return notes.find((note) => note.id === request.noteId); }
  if (params.has("user-markdown") && command === "plugin:dialog|save") return "qa-user-markdown.md";
  if (params.has("user-markdown") && command === "export_note_markdown_at_path") { exports.push(args as (typeof exports)[number]); return { path: "qa-user-markdown.md", message: "Заметка сохранена", relativePath: "" }; }
  if (command === "list_tags") return tags;
  if (command === "list_projects") return projects;
  if (command === "list_rag_chats" && ragCase) return [ragChat];
  if (command === "list_rag_chat_messages" && ragCase) return [{ id: "qa-message", chatId: ragChat.id, role: "assistant", content: "Проверяемый ответ [1].", sources: ragCase === "multiple" ? [ragSource, { ...ragSource, sourceId: "S2", citationNumber: 2, chunkId: "qa-second-chunk", snippet: blocks[5] }] : [ragSource], createdAt: timestamp }];
  if (command === "list_note_chat_messages" && params.has("chat-ready")) return [{ id: "qa-chat-history", role: "assistant", content: "**История QA**", createdAt: timestamp }];
  if (command === "get_note_ai_status" && params.has("chat-ready")) return { hasProvider: true, canUse: true, privacyAccepted: true, isLocal: true, privacyScope: "local", message: "QA mock", privacyNotice: "", providerName: "QA mock", model: "qa-local" };
  if (["list_projects", "list_archive", "list_llm_providers", "list_embedding_profiles", "list_note_chat_messages", "list_rag_chats"].includes(command)) return [];
  if (command === "get_note_ai_status") return { hasProvider: false, canUse: false, privacyAccepted: false, isLocal: true, privacyScope: "local", message: "Не настроено" };
  if (command === "get_knowledge_index_status") return { chunkCount: 0, chunkerVersion: 1, failedNotes: 0, indexedNotes: 0, pendingNotes: 0, totalNotes: 2, status: "current" };
  if (command.startsWith("plugin:")) return null;
  throw new Error(`Unexpected synthetic command: ${command}`);
});
createRoot(document.getElementById("root")!).render(<><Profiler id="app" onRender={(_id, phase, duration) => renders.push({ phase, duration })}><AppShell /></Profiler><div style={{ position: "fixed", right: 12, bottom: 12 }}><InfoHint label="QA help" text="Эта подсказка проверяет перенос строк, выравнивание слева и доступность текста у правого края окна." /></div></>);
