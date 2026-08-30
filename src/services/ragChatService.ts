import { invoke } from "@tauri-apps/api/core";
import type { SemanticSearchResult } from "./embeddingService";

export type RagChatRole = "assistant" | "user";

export interface RagChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface RagChatMessage {
  id: string;
  chatId: string;
  role: RagChatRole;
  content: string;
  sources: SemanticSearchResult[];
  createdAt: string;
}

interface RagChatDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface RagChatMessageDto {
  id: string;
  chatId: string;
  role: string;
  content: string;
  sources: unknown;
  createdAt: string;
}

function mapChat(dto: RagChatDto): RagChat {
  return { ...dto };
}

function isSemanticSource(value: unknown): value is SemanticSearchResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const source = value as Record<string, unknown>;
  return typeof source.chunkId === "string"
    && typeof source.noteId === "string"
    && typeof source.noteTitle === "string"
    && typeof source.snippet === "string"
    && Array.isArray(source.headingPath)
    && Array.isArray(source.tags);
}

function mapMessage(dto: RagChatMessageDto): RagChatMessage {
  return {
    id: dto.id,
    chatId: dto.chatId,
    role: dto.role === "assistant" ? "assistant" : "user",
    content: dto.content,
    sources: Array.isArray(dto.sources) ? dto.sources.filter(isSemanticSource) : [],
    createdAt: dto.createdAt,
  };
}

export async function listRagChats() {
  return (await invoke<RagChatDto[]>("list_rag_chats")).map(mapChat);
}

export async function createRagChat(title = "Новый чат") {
  return mapChat(await invoke<RagChatDto>("create_rag_chat", { request: { title } }));
}

export async function renameRagChat(chatId: string, title: string) {
  return mapChat(await invoke<RagChatDto>("rename_rag_chat", { request: { chatId, title } }));
}

export async function deleteRagChat(chatId: string) {
  await invoke("delete_rag_chat", { chatId });
}

export async function listRagChatMessages(chatId: string) {
  return (await invoke<RagChatMessageDto[]>("list_rag_chat_messages", { chatId })).map(mapMessage);
}

export async function saveRagChatMessage(
  chatId: string,
  role: RagChatRole,
  content: string,
  sources: SemanticSearchResult[] = [],
) {
  return mapMessage(await invoke<RagChatMessageDto>("save_rag_chat_message", {
    request: { chatId, role, content, sources },
  }));
}
