import { invoke } from "./safeInvoke";
import type { NoteIconKey, TagColor } from "../app/types";

export type SearchMatchSource = "title" | "text" | "tag" | "project";

export interface SearchTag {
  customColor?: string | null;
  id: string;
  name: string;
  color: TagColor;
  iconKey?: NoteIconKey | null;
}

export interface SearchNoteResult {
  archived: boolean;
  favorite: boolean;
  matchSource: SearchMatchSource;
  noteId: string;
  project: string;
  projectId?: string | null;
  relevanceScore: number;
  snippet: string;
  tags: SearchTag[];
  title: string;
  updatedAt: string;
}

export interface SearchNotesInput {
  query: string;
  projectId?: string;
  tagId?: string;
  includeArchived?: boolean;
  favoritesOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface RebuildSearchIndexResult {
  indexedNotes: number;
}

export interface KnowledgeDocument {
  contentMarkdown: string;
  latestRevisionAt?: string | null;
  noteId: string;
  plainText: string;
  project: string;
  projectId?: string | null;
  revisionCount: number;
  tags: SearchTag[];
  title: string;
  updatedAt: string;
}

export interface KnowledgeDocumentsInput {
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export async function searchNotes(input: SearchNotesInput) {
  return invoke<SearchNoteResult[]>("search_notes", {
    request: {
      favoritesOnly: input.favoritesOnly ?? false,
      includeArchived: input.includeArchived ?? false,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
      projectId: input.projectId,
      query: input.query,
      tagId: input.tagId,
    },
  });
}

export async function rebuildSearchIndex() {
  return invoke<RebuildSearchIndexResult>("rebuild_search_index");
}

export async function getKnowledgeDocuments(input: KnowledgeDocumentsInput = {}) {
  return invoke<KnowledgeDocument[]>("get_knowledge_documents", {
    request: {
      includeArchived: input.includeArchived ?? false,
      limit: input.limit ?? 500,
      offset: input.offset ?? 0,
    },
  });
}

export async function getKnowledgeDocumentByNoteId(noteId: string) {
  return invoke<KnowledgeDocument>("get_knowledge_document_by_note_id", { noteId });
}
