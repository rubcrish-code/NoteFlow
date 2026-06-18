import type { EditorDocument } from "../features/editor/markdownService";

export type { EditorDocument };

export type AppSection = "notes" | "projects" | "rag" | "tags" | "archive" | "settings";

export type SettingsPanel = "models" | "appearance" | "language" | "data" | "shortcuts";

export type ThemeMode = "light" | "dark" | "system";

export type SaveStatus = "error" | "saved" | "saving";

export type TagColor = "blue" | "green" | "purple" | "amber" | "pink";

export type NoteIcon = "doc" | "check" | "person" | "bulb" | "code";

export interface NoteTag {
  customColor?: string;
  id: string;
  name: string;
  color: TagColor;
}

export interface NoteAttachment {
  createdAt: string;
  id: string;
  kind: "file" | "image";
  mimeType: string;
  noteId: string;
  originalName: string;
  sizeBytes: number;
  storageRelPath: string;
}

export interface Note {
  attachments: NoteAttachment[];
  contentHtml: string;
  contentMarkdown: string;
  id: string;
  editorDocument: EditorDocument;
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
  icon: NoteIcon;
  tags: NoteTag[];
  wordCount: number;
  isNew?: boolean;
}

export interface ProjectCard {
  archivedAt?: string;
  id: string;
  title: string;
  description: string;
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
}

export interface ArchiveItem {
  id: string;
  title: string;
  archivedAt: string;
  kind: "Заметка" | "Проект";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}
