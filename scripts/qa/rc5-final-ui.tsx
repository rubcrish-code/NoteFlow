// Real AppShell with in-memory synthetic IPC. Never connects to a user profile.
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { AppShell } from "../../src/app/AppShell";
import { DEFAULT_UI_SETTINGS } from "../../src/services/uiSettingsService";
import "../../src/styles/tokens.css";
import "../../src/styles/app.css";
import "../../src/styles/foundation.css";
import "../../src/styles/pages.css";
import "../../src/styles/settings.css";
import "../../src/styles/editor.css";
import "../../src/styles/chat.css";
import "../../src/styles/rag.css";
import "./rc5-final-ui.css";

const query = new URLSearchParams(location.search);
const timestamp = "2026-10-10T12:00:00Z";
if (query.has("reset")) sessionStorage.removeItem("rc5-qa-settings");
const persistedSettings = JSON.parse(sessionStorage.getItem("rc5-qa-settings") || "null") as typeof DEFAULT_UI_SETTINGS | null;
let settings = { ...DEFAULT_UI_SETTINGS, ...persistedSettings, appZoomPercent: Number(query.get("zoom") || "100"), theme: query.get("theme") === "dark" ? "dark" as const : "light" as const };
const markdown = `# Синтетическая заметка\n\n${"Длинный текст для проверки плавного изменения ширины редактора.\n\n".repeat(40)}| Таблица | Значение |\n| --- | --- |\n| Пример | 42 |\n\n![Тестовое изображение](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1sAAAAASUVORK5CYII=)`;
const note = { id: "qa-motion-note", title: "QA длинная заметка", contentMarkdown: markdown, plainText: "QA текст", contentHtml: "", contentJson: { type: "doc", content: [] }, contentVersion: 1, contentSidecars: [], attachments: [], tags: [], project: "", isFavorite: false, isPinned: false, noteDate: "2026-10-10", wordCount: 300, createdAt: timestamp, updatedAt: timestamp };
const chat = { id: "qa-rag", title: "QA чат", scope: "rag", noteId: null, projectIds: null, includeStandalone: false, createdAt: timestamp, updatedAt: timestamp };
const commands: string[] = [];
declare global { interface Window { qaCommands: string[]; qaSettings: typeof settings } }
window.qaCommands = commands;
Object.defineProperty(window, "qaSettings", { get: () => settings });
mockIPC((command, args) => {
  commands.push(command);
  if (command === "load_workspace") return { notes: [note], projects: [], tags: [], archiveItems: [], dataLocation: { dataDir: "", databasePath: "" } };
  if (command === "get_first_run_state") return { required: false };
  if (command === "get_ui_settings") return settings;
  if (command === "update_ui_settings") { settings = (args as { request: typeof settings }).request; sessionStorage.setItem("rc5-qa-settings", JSON.stringify(settings)); return settings; }
  if (["list_notes", "get_note"].includes(command)) return command === "get_note" ? note : [note];
  if (command === "update_note_content") return { ...note, ...(args as { request: object }).request, contentVersion: 2 };
  if (["list_projects", "list_tags", "list_archive", "list_llm_providers", "list_embedding_profiles", "list_note_chat_messages", "list_rag_chat_messages"].includes(command)) return [];
  if (command === "list_rag_chats") return [chat];
  if (command === "get_note_ai_status") return { hasProvider: false, canUse: false, privacyAccepted: false, isLocal: true, privacyScope: "local", message: "Не настроено" };
  if (command === "get_knowledge_index_status") return { chunkCount: 0, chunkerVersion: 1, failedNotes: 0, indexedNotes: 0, pendingNotes: 0, totalNotes: 1, status: "current" };
  if (command.startsWith("plugin:")) return null;
  throw new Error(`Unexpected synthetic QA command: ${command}`);
});
createRoot(document.getElementById("root")!).render(<AppShell />);
