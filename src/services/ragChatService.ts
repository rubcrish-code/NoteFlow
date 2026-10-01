import { invoke } from "./safeInvoke";
import type { SemanticSearchResult } from "./embeddingService";

export type RagChatRole = "assistant" | "user";

export interface RagChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  projectIds?: string[] | null;
  includeStandalone?: boolean;
}

export interface RagChatMessage {
  id: string;
  chatId: string;
  role: RagChatRole;
  content: string;
  sources: RagMessageSource[];
  createdAt: string;
  projectIds?: string[] | null;
  includeStandalone?: boolean;
}

export interface RagMessageSource extends SemanticSearchResult {
  sourceId: string;
  citationNumber: number;
}

export type RagAnswerStatus = "empty_retrieval" | "grounded" | "insufficient_evidence";

export interface RagGenerationTimings {
  contextMs: number;
  providerMs: number;
  persistenceMs: number;
  totalMs: number;
}

export interface RagGenerationResult {
  assistantMessage: RagChatMessage;
  answerStatus: RagAnswerStatus;
  retrievalCount: number;
  contextSourceCount: number;
  providerName: string;
  model: string;
  isLocal: boolean;
  repairedCitations: boolean;
  timings: RagGenerationTimings;
}

export interface RagQueryPlan {
  needsHybridRetrieval: boolean;
  searchQuery: string;
  projectId: string | null;
  projectIds?: string[] | null;
  includeStandalone?: boolean;
  tagId: string | null;
}

export class RagGenerationError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "RagGenerationError";
    this.code = code;
    this.retryable = retryable;
  }
}

interface RagChatDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  projectIds?: string[] | null;
  includeStandalone?: boolean;
}

interface RagChatMessageDto {
  id: string;
  chatId: string;
  role: string;
  content: string;
  sources: unknown;
  createdAt: string;
  projectIds?: string[] | null;
  includeStandalone?: boolean;
}

interface RagGenerationResultDto {
  assistantMessage: RagChatMessageDto;
  answerStatus: string;
  retrievalCount: number;
  contextSourceCount: number;
  providerName: string;
  model: string;
  isLocal: boolean;
  repairedCitations: boolean;
  timings: RagGenerationTimings;
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

function mapSource(value: SemanticSearchResult, index: number): RagMessageSource {
  const record = value as SemanticSearchResult & { sourceId?: unknown; citationNumber?: unknown };
  return {
    ...value,
    noteTitle: value.noteTitle.trim() || "Без названия",
    sourceId: typeof record.sourceId === "string" && record.sourceId ? record.sourceId : `S${index + 1}`,
    citationNumber: typeof record.citationNumber === "number" && Number.isInteger(record.citationNumber)
      ? record.citationNumber
      : index + 1,
  };
}

export function mapRagChatMessage(dto: RagChatMessageDto): RagChatMessage {
  return {
    id: dto.id,
    chatId: dto.chatId,
    role: dto.role === "assistant" ? "assistant" : "user",
    content: dto.content,
    sources: Array.isArray(dto.sources) ? dto.sources.filter(isSemanticSource).map(mapSource) : [],
    createdAt: dto.createdAt,
    projectIds: dto.projectIds ?? null,
    includeStandalone: dto.includeStandalone ?? false,
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

export async function setRagChatProjects(chatId: string, projectIds: string[] | null, includeStandalone = false) {
  return mapChat(await invoke<RagChatDto>("set_rag_chat_projects", { chatId, projectIds, includeStandalone }));
}

export async function deleteRagChat(chatId: string) {
  await invoke("delete_rag_chat", { chatId });
}

export async function listRagChatMessages(chatId: string) {
  return (await invoke<RagChatMessageDto[]>("list_rag_chat_messages", { chatId })).map(mapRagChatMessage);
}

export async function saveRagChatMessage(
  chatId: string,
  role: RagChatRole,
  content: string,
  sources: SemanticSearchResult[] = [],
) {
  return mapRagChatMessage(await invoke<RagChatMessageDto>("save_rag_chat_message", {
    request: { chatId, role, content, sources },
  }));
}

export async function runRagGeneration(
  chatId: string,
  userMessageId: string,
  retrievedSources: SemanticSearchResult[],
): Promise<RagGenerationResult> {
  try {
    const dto = await invoke<RagGenerationResultDto>("run_rag_generation", {
      request: { chatId, userMessageId, retrievedSources },
    });
    return {
      assistantMessage: mapRagChatMessage(dto.assistantMessage),
      answerStatus: normalizeAnswerStatus(dto.answerStatus),
      retrievalCount: dto.retrievalCount,
      contextSourceCount: dto.contextSourceCount,
      providerName: dto.providerName,
      model: dto.model,
      isLocal: dto.isLocal,
      repairedCitations: dto.repairedCitations,
      timings: dto.timings,
    };
  } catch (error) {
    throw normalizeGenerationError(error);
  }
}

export function planRagQuestion(chatId: string, userMessageId: string): Promise<RagQueryPlan> {
  return invoke<RagQueryPlan>("plan_rag_question", { chatId, userMessageId });
}

function normalizeAnswerStatus(value: string): RagAnswerStatus {
  if (value === "empty_retrieval" || value === "insufficient_evidence") {
    return value;
  }
  return "grounded";
}

function normalizeGenerationError(error: unknown): RagGenerationError {
  if (error instanceof RagGenerationError) {
    return error;
  }
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; retryable?: unknown };
    if (typeof value.message === "string") {
      return new RagGenerationError(
        typeof value.code === "string" ? value.code : "generation_error",
        value.message,
        value.retryable !== false,
      );
    }
  }
  return new RagGenerationError(
    "generation_error",
    error instanceof Error ? error.message : typeof error === "string" ? error : "Не удалось сформировать ответ по базе заметок.",
    true,
  );
}
