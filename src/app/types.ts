export type AppSection = "notes" | "projects" | "rag" | "tags" | "archive" | "settings";

export type SettingsPanel = "models" | "appearance" | "language" | "data" | "shortcuts";

export type ThemeMode = "light" | "dark" | "system";

export type TagColor = "blue" | "green" | "purple" | "amber" | "pink";

export type NoteIcon = "doc" | "check" | "person" | "bulb" | "code";

export interface NoteTag {
  name: string;
  color: TagColor;
}

export interface Note {
  id: string;
  title: string;
  summary: string;
  dateLabel: string;
  noteDate: string;
  project: string;
  pinned?: boolean;
  icon: NoteIcon;
  tags: NoteTag[];
  wordCount: number;
  isNew?: boolean;
}

export interface ProjectCard {
  id: string;
  title: string;
  description: string;
  notes: number;
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
