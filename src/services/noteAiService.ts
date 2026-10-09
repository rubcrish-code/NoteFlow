import { invoke } from "./safeInvoke";
import type { Note } from "../app/types";
import { streamArguments, type AiRequestControl } from "./aiBackground";
import { isTauri } from "@tauri-apps/api/core";

export const NOTE_AI_TIMEOUT_MS = 45_000;

export type NoteAiActionId =
  | "ask"
  | "expand"
  | "explain"
  | "fix"
  | "improve"
  | "shorten"
  | "tasks"
  | "tone"
  | "translate";

export type NoteAiKind = "action" | "chat";
export type NoteAiScope = "note" | "selection";
export type NoteAiPrivacyScope = "external" | "local";
export type NoteAiStatusValue = "error" | "success";
export type NoteChatRole = "assistant" | "user";

export interface NoteAiContext {
  noteId: string;
  title: string;
  noteDate: string;
  project: string;
  tags: string[];
  plainText: string;
  contentMarkdown: string;
  selectedText?: string;
}

export interface NoteAiStatus {
  hasProvider: boolean;
  providerName?: string;
  model?: string;
  isLocal: boolean;
  privacyScope: NoteAiPrivacyScope;
  privacyAccepted: boolean;
  privacyNotice: string;
  canUse: boolean;
  message: string;
}

export interface NoteAiRequest {
  kind: NoteAiKind;
  actionId?: NoteAiActionId;
  scope: NoteAiScope;
  question?: string;
  context: NoteAiContext;
}

export interface NoteAiResponse {
  status: NoteAiStatusValue;
  message: string;
  response: string;
  providerName: string;
  model: string;
  isLocal: boolean;
}

export interface PersistedNoteChatMessage {
  id: string;
  noteId: string;
  role: NoteChatRole;
  content: string;
  createdAt: string;
}

export function createNoteAiContext(note: Note, selectedText?: string): NoteAiContext {
  return {
    noteId: note.id,
    title: note.title,
    noteDate: note.noteDate,
    project: note.project,
    tags: note.tags.map((tag) => tag.name),
    plainText: note.plainText,
    contentMarkdown: note.contentMarkdown,
    selectedText: selectedText?.trim() ? selectedText.trim() : undefined,
  };
}

interface NoteAiStatusDto {
  hasProvider: boolean;
  providerName?: string | null;
  model?: string | null;
  isLocal: boolean;
  privacyScope: string;
  privacyAccepted: boolean;
  privacyNotice: string;
  canUse: boolean;
  message: string;
}

interface NoteAiResponseDto {
  status: string;
  message: string;
  response: string;
  providerName: string;
  model: string;
  isLocal: boolean;
}

interface NoteChatMessageDto {
  id: string;
  noteId: string;
  role: string;
  content: string;
  createdAt: string;
}

function normalizePrivacyScope(value: string): NoteAiPrivacyScope {
  return value === "external" ? "external" : "local";
}

function normalizeStatus(value: string): NoteAiStatusValue {
  return value === "success" ? "success" : "error";
}

function normalizeNoteChatRole(value: string): NoteChatRole {
  return value === "assistant" ? "assistant" : "user";
}

function mapStatus(dto: NoteAiStatusDto): NoteAiStatus {
  return {
    hasProvider: dto.hasProvider,
    providerName: dto.providerName ?? undefined,
    model: dto.model ?? undefined,
    isLocal: dto.isLocal,
    privacyScope: normalizePrivacyScope(dto.privacyScope),
    privacyAccepted: dto.privacyAccepted,
    privacyNotice: dto.privacyNotice,
    canUse: dto.canUse,
    message: dto.message,
  };
}

function mapResponse(dto: NoteAiResponseDto): NoteAiResponse {
  return {
    status: normalizeStatus(dto.status),
    message: dto.message,
    response: dto.response,
    providerName: dto.providerName,
    model: dto.model,
    isLocal: dto.isLocal,
  };
}

function mapNoteChatMessage(dto: NoteChatMessageDto): PersistedNoteChatMessage {
  return {
    id: dto.id,
    noteId: dto.noteId,
    role: normalizeNoteChatRole(dto.role),
    content: dto.content,
    createdAt: dto.createdAt,
  };
}

function timeoutError(message: string) {
  return new Error(message);
}

function withInvokeTimeout<T>(request: Promise<T>, timeoutMs: number, message: string, onTimeout?: () => void): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(timeoutError(message));
    }, timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

export async function getNoteAiStatus() {
  return mapStatus(await invoke<NoteAiStatusDto>("get_note_ai_status"));
}

export async function acceptNoteAiPrivacy(privacyScope: NoteAiPrivacyScope) {
  return mapStatus(await invoke<NoteAiStatusDto>("accept_note_ai_privacy", { privacyScope }));
}

export async function listNoteChatMessages(noteId: string) {
  const messages = await invoke<NoteChatMessageDto[]>("list_note_chat_messages", { noteId });
  return messages.map(mapNoteChatMessage);
}

export async function saveNoteChatMessage(noteId: string, role: NoteChatRole, content: string) {
  return mapNoteChatMessage(
    await invoke<NoteChatMessageDto>("save_note_chat_message", {
      request: {
        noteId,
        role,
        content,
      },
    }),
  );
}

export async function runNoteAi(request: NoteAiRequest, control?: AiRequestControl) {
  return mapResponse(
    await withInvokeTimeout(
      control && isTauri() ? invoke<NoteAiResponseDto>("run_note_ai_stream", { request, ...streamArguments(control) }) : invoke<NoteAiResponseDto>("run_note_ai", { request }),
      NOTE_AI_TIMEOUT_MS,
      "Timeout: AI-запрос по текущей заметке не завершился за 45 секунд. Проверьте, доступна ли модель.",
      control && isTauri() ? () => {
        void invoke<void>("cancel_ai_operation", { requestId: control.requestId }).catch(() => undefined);
      } : undefined,
    ),
  );
}
