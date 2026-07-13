import { invoke } from "@tauri-apps/api/core";

export type KnowledgeIndexStatusCode = "current" | "pending" | "needs_update" | "failed";
export type KnowledgeIndexOperation = "reconcile" | "rebuild";

export interface KnowledgeChunk {
  charCount: number;
  chunkOrder: number;
  contentHash: string;
  contentMarkdown: string;
  contentText: string;
  estimatedTokens: number;
  headingPath: string[];
  id: string;
  noteId: string;
  updatedAt: string;
}

export interface KnowledgeChunkState {
  chunkCount: number;
  chunkerVersion: number;
  lastErrorCode?: string | null;
  lastIndexedAt?: string | null;
  noteId: string;
  status: "current" | "pending" | "failed";
}

export interface KnowledgeIndexStatus {
  chunkCount: number;
  chunkerVersion: number;
  failedNotes: number;
  indexedNotes: number;
  lastCheckedAt?: string | null;
  lastIndexedAt?: string | null;
  pendingNotes: number;
  status: KnowledgeIndexStatusCode;
  totalNotes: number;
}

export interface RebuildKnowledgeChunksResult {
  createdChunks: number;
  durationMs: number;
  errors: number;
  processedNotes: number;
}

export async function getKnowledgeIndexStatus() {
  return invoke<KnowledgeIndexStatus>("get_knowledge_index_status");
}

export async function syncKnowledgeChunksForNote(noteId: string) {
  return invoke<number>("sync_knowledge_chunks_for_note", { noteId });
}

export async function getKnowledgeChunksByNoteId(noteId: string) {
  return invoke<KnowledgeChunk[]>("get_knowledge_chunks_by_note_id", { noteId });
}

export async function getKnowledgeChunksByNoteIds(noteIds: string[]) {
  return invoke<KnowledgeChunk[]>("get_knowledge_chunks_by_note_ids", { request: { noteIds } });
}

export async function getNeighborKnowledgeChunks(chunkId: string, radius = 1) {
  return invoke<KnowledgeChunk[]>("get_neighbor_knowledge_chunks", { request: { chunkId, radius } });
}

export async function getKnowledgeChunkState(noteId: string) {
  return invoke<KnowledgeChunkState | null>("get_knowledge_chunk_state", { noteId });
}

export async function reconcileKnowledgeChunks() {
  return invoke<RebuildKnowledgeChunksResult>("reconcile_knowledge_chunks");
}

export async function rebuildKnowledgeChunks() {
  return invoke<RebuildKnowledgeChunksResult>("rebuild_knowledge_chunks");
}

export function runKnowledgeIndexOperation(operation: KnowledgeIndexOperation) {
  return operation === "rebuild" ? rebuildKnowledgeChunks() : reconcileKnowledgeChunks();
}
