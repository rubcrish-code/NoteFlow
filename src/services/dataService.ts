import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ArchiveItem, EditorContentSidecarInput, EditorDocument, Note, NoteAttachment, NoteContentSidecar, NoteTag, ProjectCard, TagColor, TagRow } from "../app/types";
import { buildEditorDocumentFromStoredNoteContent } from "../features/editor/editorContentSerializer";
import { createNotePreview } from "../features/notes/notePreview";
import { normalizeNoteIconKey } from "../shared/noteIconRegistry";

export interface DataLocation {
  dataDir: string;
  databasePath: string;
}

export interface WorkspaceSnapshot {
  archiveItems: ArchiveItem[];
  dataLocation: DataLocation;
  notes: Note[];
  projects: ProjectCard[];
  tags: TagRow[];
}

export interface ExportResult {
  message: string;
  path: string;
  relativePath: string;
}

export interface AttachmentStoreResult {
  attachment: NoteAttachment;
  sizeLabel: string;
}

interface NoteTagDto {
  customColor?: string | null;
  id: string;
  name: string;
  color: string;
  iconKey?: string | null;
}

interface AttachmentDto {
  createdAt: string;
  id: string;
  kind: string;
  mimeType: string;
  noteId: string;
  originalName: string;
  originalAttachmentId?: string | null;
  editMetadata?: Record<string, unknown> | null;
  sizeBytes: number;
  storageRelPath: string;
}

interface NoteDto {
  archivedAt?: string | null;
  attachments: AttachmentDto[];
  contentHtml: string;
  contentJson: EditorDocument;
  contentMarkdown: string;
  contentSidecars?: NoteContentSidecarDto[];
  createdAt: string;
  deletedAt?: string | null;
  iconKey?: string | null;
  id: string;
  isFavorite: boolean;
  isPinned: boolean;
  noteDate: string;
  pinnedAt?: string | null;
  plainText: string;
  project: string;
  projectId?: string | null;
  tags: NoteTagDto[];
  title: string;
  updatedAt: string;
  wordCount: number;
}

interface NoteContentSidecarDto {
  createdAt: string;
  kind: string;
  payloadJson: unknown;
  schemaVersion: number;
  updatedAt: string;
}

interface NoteContentSidecarInputDto {
  kind: string;
  payloadJson: unknown;
  schemaVersion: number;
}

interface ProjectDto {
  archivedAt?: string | null;
  color: string;
  description: string;
  files?: number | null;
  id: string;
  iconKey?: string | null;
  notes: number;
  status: string;
  tasks: number;
  title: string;
}

interface TagDto {
  color: string;
  count: number;
  customColor?: string | null;
  id: string;
  iconKey?: string | null;
  name: string;
}

interface ArchiveItemDto {
  archivedAt: string;
  id: string;
  kind: string;
  title: string;
}

interface WorkspaceSnapshotDto {
  archiveItems: ArchiveItemDto[];
  dataLocation: DataLocation;
  notes: NoteDto[];
  projects: ProjectDto[];
  tags: TagDto[];
}

interface ExportResultDto {
  message: string;
  path: string;
  relativePath: string;
}

interface AttachmentStoreResultDto {
  attachment: AttachmentDto;
  sizeLabel: string;
}

const tagColors: readonly TagColor[] = ["blue", "green", "purple", "amber", "pink"];

function toTagColor(color: string): TagColor {
  return tagColors.includes(color as TagColor) ? (color as TagColor) : "blue";
}

function toAttachmentKind(kind: string): "file" | "image" {
  return kind === "image" ? "image" : "file";
}

function mapTag(tag: NoteTagDto): NoteTag {
  return {
    color: toTagColor(tag.color),
    customColor: tag.customColor ?? undefined,
    id: tag.id,
    iconKey: normalizeNoteIconKey(tag.iconKey),
    name: tag.name,
  };
}

function mapAttachment(attachment: AttachmentDto): NoteAttachment {
  return {
    createdAt: attachment.createdAt,
    id: attachment.id,
    kind: toAttachmentKind(attachment.kind),
    mimeType: attachment.mimeType,
    noteId: attachment.noteId,
    originalName: attachment.originalName,
    originalAttachmentId: attachment.originalAttachmentId ?? undefined,
    editMetadata: attachment.editMetadata ?? undefined,
    sizeBytes: attachment.sizeBytes,
    storageRelPath: attachment.storageRelPath,
  };
}

function mapNoteContentSidecar(sidecar: NoteContentSidecarDto): NoteContentSidecar {
  return {
    createdAt: sidecar.createdAt,
    kind: sidecar.kind,
    payloadJson: sidecar.payloadJson,
    schemaVersion: sidecar.schemaVersion,
    updatedAt: sidecar.updatedAt,
  };
}

function getFallbackTag(): NoteTag {
  return {
    color: "blue",
    iconKey: "tag",
    id: "tag-untagged",
    name: "без тега",
  };
}

function formatDateLabel(updatedAt: string, noteDate: string) {
  const updatedDate = new Date(updatedAt);
  if (!Number.isNaN(updatedDate.valueOf())) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (updatedDate.toDateString() === today.toDateString()) {
      return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(updatedDate);
    }
    if (updatedDate.toDateString() === yesterday.toDateString()) {
      return "Вчера";
    }
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(updatedDate).replace(".", "");
  }

  const date = new Date(`${noteDate}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? noteDate : new Intl.DateTimeFormat("ru-RU").format(date);
}

function mapNote(note: NoteDto): Note {
  const tags = note.tags.map(mapTag);
  const plainText = note.plainText.trim();
  const contentSidecars = note.contentSidecars?.map(mapNoteContentSidecar) ?? [];
  const editorContent = buildEditorDocumentFromStoredNoteContent({
    contentJson: note.contentJson,
    contentMarkdown: note.contentMarkdown,
    contentSidecars,
    noteId: note.id,
    plainText: note.plainText,
  });
  return {
    attachments: note.attachments.map(mapAttachment),
    contentHtml: note.contentHtml,
    contentMarkdown: note.contentMarkdown,
    contentSidecars,
    createdAt: note.createdAt,
    dateLabel: formatDateLabel(note.updatedAt, note.noteDate),
    editorDocument: editorContent.editorDocument,
    editorLoadFallbackReason: editorContent.fallbackReason,
    editorLoadSource: editorContent.source,
    iconKey: normalizeNoteIconKey(note.iconKey),
    id: note.id,
    noteDate: note.noteDate,
    pinned: note.isPinned,
    pinnedAt: note.pinnedAt ?? undefined,
    plainText: note.plainText,
    project: note.project,
    projectId: note.projectId ?? undefined,
    summary: createNotePreview(plainText || note.contentMarkdown || note.title),
    tags: tags.length > 0 ? tags : [getFallbackTag()],
    title: note.title,
    updatedAt: note.updatedAt,
    wordCount: note.wordCount,
  };
}

function mapProject(project: ProjectDto): ProjectCard {
  return {
    archivedAt: project.archivedAt ?? undefined,
    color: toTagColor(project.color),
    description: project.description,
    files: project.files ?? undefined,
    id: project.id,
    iconKey: normalizeNoteIconKey(project.iconKey),
    notes: project.notes,
    status: project.status,
    tasks: project.tasks,
    title: project.title,
  };
}

function mapTagRow(tag: TagDto): TagRow {
  return {
    color: toTagColor(tag.color),
    count: tag.count,
    customColor: tag.customColor ?? undefined,
    id: tag.id,
    iconKey: normalizeNoteIconKey(tag.iconKey),
    name: tag.name,
  };
}

function mapArchiveItem(item: ArchiveItemDto): ArchiveItem {
  return {
    archivedAt: item.archivedAt,
    id: item.id,
    kind: item.kind === "Проект" ? "Проект" : "Заметка",
    title: item.title,
  };
}

function mapWorkspace(snapshot: WorkspaceSnapshotDto): WorkspaceSnapshot {
  return {
    archiveItems: snapshot.archiveItems.map(mapArchiveItem),
    dataLocation: snapshot.dataLocation,
    notes: snapshot.notes.map(mapNote),
    projects: snapshot.projects.map(mapProject),
    tags: snapshot.tags.map(mapTagRow),
  };
}

function mapExportResult(result: ExportResultDto): ExportResult {
  return {
    message: result.message,
    path: result.path,
    relativePath: result.relativePath,
  };
}

function mapAttachmentStoreResult(result: AttachmentStoreResultDto): AttachmentStoreResult {
  return {
    attachment: mapAttachment(result.attachment),
    sizeLabel: result.sizeLabel,
  };
}

export async function fileToBytes(file: File) {
  return Array.from(new Uint8Array(await file.arrayBuffer()));
}

export async function loadWorkspace() {
  return mapWorkspace(await invoke<WorkspaceSnapshotDto>("load_workspace"));
}

export async function listNotes(query: string, includeArchived = false) {
  const notes = await invoke<NoteDto[]>("list_notes", {
    includeArchived,
    query: query.trim() || null,
  });
  return notes.map(mapNote);
}

export async function createNote(title: string, noteDate: string) {
  return mapNote(await invoke<NoteDto>("create_note", { request: { noteDate, title } }));
}

export interface UpdateNoteContentInput {
  contentHtml: string;
  contentMarkdown: string;
  contentSidecars: EditorContentSidecarInput[];
  editorDocument: EditorDocument;
  id: string;
  plainText: string;
}

function mapNoteContentSidecarInput(sidecar: EditorContentSidecarInput): NoteContentSidecarInputDto {
  return {
    kind: sidecar.kind,
    payloadJson: sidecar.payloadJson,
    schemaVersion: sidecar.schemaVersion,
  };
}

export async function updateNoteContent(note: UpdateNoteContentInput) {
  return mapNote(
    await invoke<NoteDto>("update_note_content", {
      request: {
        contentHtml: note.contentHtml,
        contentJson: note.editorDocument,
        contentMarkdown: note.contentMarkdown,
        contentSidecars: note.contentSidecars.map(mapNoteContentSidecarInput),
        noteId: note.id,
        plainText: note.plainText,
      },
    }),
  );
}

export async function renameNote(noteId: string, title: string) {
  return mapNote(await invoke<NoteDto>("rename_note", { request: { noteId, title } }));
}

export async function duplicateNote(noteId: string) {
  return mapNote(await invoke<NoteDto>("duplicate_note", { noteId }));
}

export async function toggleNotePin(noteId: string) {
  return mapNote(await invoke<NoteDto>("toggle_note_pin", { noteId }));
}

export async function moveNoteToProject(noteId: string, projectTitle: string) {
  return mapNote(await invoke<NoteDto>("move_note_to_project", { request: { noteId, projectTitle } }));
}

export async function archiveNote(noteId: string) {
  await invoke<void>("archive_note", { noteId });
}

export async function deleteNote(noteId: string) {
  await invoke<void>("delete_note", { noteId });
}

export async function deleteNotePermanently(noteId: string) {
  await invoke<void>("delete_note_permanently", { noteId });
}

export async function restoreNote(noteId: string) {
  return mapNote(await invoke<NoteDto>("restore_note", { noteId }));
}

export async function listProjects(includeArchived = false) {
  const projects = await invoke<ProjectDto[]>("list_projects", { includeArchived });
  return projects.map(mapProject);
}

export async function createProject(title: string, description: string) {
  return mapProject(await invoke<ProjectDto>("create_project", { request: { description, title } }));
}

export async function listTags(query = "") {
  const tags = await invoke<TagDto[]>("list_tags", { query: query.trim() || null });
  return tags.map(mapTagRow);
}

export async function createTag(name: string, color: TagColor) {
  return mapTagRow(await invoke<TagDto>("create_tag", { request: { color, name } }));
}

export async function renameTag(tagId: string, name: string) {
  const tags = await invoke<TagDto[]>("rename_tag", { request: { name, tagId } });
  return tags.map(mapTagRow);
}

export async function updateTagColor(tagId: string, color: TagColor, customColor?: string) {
  const tags = await invoke<TagDto[]>("update_tag_color", {
    request: { color, customColor: customColor ?? null, tagId },
  });
  return tags.map(mapTagRow);
}

export async function deleteTag(tagId: string) {
  const tags = await invoke<TagDto[]>("delete_tag", { tagId });
  return tags.map(mapTagRow);
}

export async function mergeTags(sourceTagId: string, targetTagId: string) {
  const tags = await invoke<TagDto[]>("merge_tags", { request: { sourceTagId, targetTagId } });
  return tags.map(mapTagRow);
}

export async function listArchive(query = "") {
  const archiveItems = await invoke<ArchiveItemDto[]>("list_archive", { query: query.trim() || null });
  return archiveItems.map(mapArchiveItem);
}

export async function restoreArchiveItem(item: ArchiveItem) {
  await invoke<void>("restore_archive_item", { itemId: item.id, kind: item.kind });
}

export async function deleteArchiveItem(item: ArchiveItem) {
  await invoke<void>("delete_archive_item", { itemId: item.id, kind: item.kind });
}

export interface StoreAttachmentOptions {
  editMetadata?: Record<string, unknown>;
  originalAttachmentId?: string;
}

export async function storeAttachment(noteId: string, file: File, kind: "file" | "image", options: StoreAttachmentOptions = {}) {
  return mapAttachmentStoreResult(
    await invoke<AttachmentStoreResultDto>("store_attachment", {
      request: {
        bytes: await fileToBytes(file),
        editMetadata: options.editMetadata ?? null,
        kind,
        mimeType: file.type || "application/octet-stream",
        noteId,
        originalAttachmentId: options.originalAttachmentId ?? null,
        originalName: file.name,
      },
    }),
  );
}

export async function openAttachment(attachmentId: string) {
  const path = await invoke<string>("resolve_attachment_path", { attachmentId });
  await openPath(path);
}

export async function revealAttachment(attachmentId: string) {
  const path = await invoke<string>("resolve_attachment_path", { attachmentId });
  await revealItemInDir(path);
}

export async function exportNoteMarkdown(noteId: string) {
  return mapExportResult(await invoke<ExportResultDto>("export_note_markdown", { noteId }));
}

export async function revealExportedItem(path: string) {
  await revealItemInDir(path);
}

export async function exportNoteZip(noteId: string) {
  return mapExportResult(await invoke<ExportResultDto>("export_note_zip", { noteId }));
}

export async function exportProjectZip(projectId: string) {
  return mapExportResult(await invoke<ExportResultDto>("export_project_zip", { projectId }));
}

export async function createBackup() {
  return mapExportResult(await invoke<ExportResultDto>("create_backup"));
}

export async function importBackup(file: File) {
  return mapWorkspace(
    await invoke<WorkspaceSnapshotDto>("import_backup", {
      request: {
        bytes: await fileToBytes(file),
        fileName: file.name,
      },
    }),
  );
}

export async function quitApp() {
  await invoke<void>("quit_app");
}
