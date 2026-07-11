import type { EditorDocument } from "../features/editor/markdownService";

export type { EditorDocument };

export type AppSection = "notes" | "projects" | "rag" | "tags" | "archive" | "settings";

export type SettingsPanel = "models" | "appearance" | "language" | "data" | "shortcuts";

export type ThemeMode = "light" | "dark" | "system";

export type AppLanguage = "ru" | "en";

export type SaveStatus = "error" | "saved" | "saving";

export type TagColor = "blue" | "green" | "purple" | "amber" | "pink";

export type NoteIconKey = "code" | "document" | "idea" | "person" | "project" | "tag" | "task";

export interface NoteTag {
  customColor?: string;
  id: string;
  name: string;
  color: TagColor;
  iconKey?: NoteIconKey;
}

export interface NoteAttachment {
  createdAt: string;
  id: string;
  kind: "file" | "image";
  mimeType: string;
  noteId: string;
  originalName: string;
  originalAttachmentId?: string;
  editMetadata?: Record<string, unknown>;
  sizeBytes: number;
  storageRelPath: string;
}

export interface EditorContentSidecar {
  kind: string;
  schemaVersion: number;
  payloadJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export type NoteContentSidecar = EditorContentSidecar;

export interface EditorContentSidecarInput {
  kind: string;
  schemaVersion: number;
  payloadJson: unknown;
}

export interface Note {
  attachments: NoteAttachment[];
  contentHtml: string;
  contentMarkdown: string;
  contentSidecars: NoteContentSidecar[];
  id: string;
  editorDocument: EditorDocument;
  editorLoadFallbackReason?: string;
  editorLoadSource?: "contentJson" | "markdown";
  createdAt: string;
  updatedAt: string;
  title: string;
  summary: string;
  dateLabel: string;
  noteDate: string;
  plainText: string;
  projectId?: string;
  project: string;
  pinned?: boolean;
  pinnedAt?: string;
  iconKey?: NoteIconKey;
  tags: NoteTag[];
  wordCount: number;
  isNew?: boolean;
}

export interface ProjectCard {
  archivedAt?: string;
  id: string;
  title: string;
  description: string;
  color: TagColor;
  iconKey?: NoteIconKey;
  notes: number;
  status?: string;
  tasks: number;
  files?: number;
}

export interface TagRow {
  id: string;
  name: string;
  count: number;
  color: TagColor;
  customColor?: string;
  iconKey?: NoteIconKey;
}

export interface ArchiveItem {
  id: string;
  title: string;
  archivedAt: string;
  kind: "Заметка" | "Проект";
}

export interface ChatMessage {
  createdAt?: string;
  id: string;
  role: "user" | "assistant";
  text: string;
  status?: "error" | "loading";
}
