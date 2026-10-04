import { invoke } from "./safeInvoke";
import { getAttachmentPolicy, validateAttachmentBytes, validateAttachmentSize } from "./attachmentPolicy";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ArchiveItem, EditorContentSidecarInput, EditorDocument, Note, NoteAttachment, NoteContentSidecar, NoteTag, ProjectCard, TagColor, TagRow } from "../app/types";
import { buildEditorDocumentFromStoredNoteContent } from "../features/editor/editorContentSerializer";
import { createNotePreview } from "../features/notes/notePreview";
import { normalizeNoteIconKey } from "../shared/noteIconRegistry";
import { formatDisplayDate, formatDisplayTime } from "../shared/displayDate";
import type { PreparedMarkdownNote } from "../features/settings/markdownImport";
import { runBackupExport } from "../features/settings/backupExportFlow";

export type NotePersistenceErrorCode = "invalid_input" | "not_found" | "revision" | "serialization" | "sidecar" | "stale_write" | "transaction";
const notePersistenceErrorCodes = new Set<NotePersistenceErrorCode>([
  "invalid_input",
  "not_found",
  "revision",
  "serialization",
  "sidecar",
  "stale_write",
  "transaction",
]);

interface NotePersistenceErrorDto {
  code: NotePersistenceErrorCode;
  message: string;
}

export class NotePersistenceError extends Error {
  readonly code: NotePersistenceErrorCode;

  constructor(error: NotePersistenceErrorDto) {
    super(error.message);
    this.name = "NotePersistenceError";
    this.code = error.code;
  }
}

function isNotePersistenceErrorDto(value: unknown): value is NotePersistenceErrorDto {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && notePersistenceErrorCodes.has(candidate.code as NotePersistenceErrorCode) && typeof candidate.message === "string";
}

async function invokeNotePersistence<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isNotePersistenceErrorDto(error)) {
      throw new NotePersistenceError(error);
    }
    throw new NotePersistenceError({
      code: "transaction",
      message: "Не удалось атомарно сохранить заметку",
    });
  }
}

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

export interface FirstRunCompletion {
  note: Note;
  localProfileName: string;
}

export interface ExportResult {
  message: string;
  path: string;
  relativePath: string;
}

export interface BackupContentsSummary {
  notes: number;
  projects: number;
  tags: number;
  attachments: number;
  noteAiChats: number;
  ragChats: number;
  messages: number;
}

export interface BackupPreview {
  formatVersion: number;
  exportedAt: string;
  appVersion?: string | null;
  contents: BackupContentsSummary;
  includesAiHistory: boolean;
  preservesExistingAiHistory: boolean;
  missingAttachmentFiles: number;
}

export interface ImportBackupResult {
  workspace: WorkspaceSnapshot;
  contents: BackupContentsSummary;
  preservedLegacyChats: number;
  indexesUpdating: boolean;
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
  assetUri?: string | null;
  blobId?: string | null;
  createdAt: string;
  id: string;
  kind: string;
  mimeType: string;
  noteId: string;
  originalName: string;
  originalAttachmentId?: string | null;
  editMetadata?: Record<string, unknown> | null;
  sizeBytes: number;
}

interface NoteDto {
  archivedAt?: string | null;
  attachments: AttachmentDto[];
  contentHtml: string;
  contentJson: EditorDocument;
  contentMarkdown: string;
  contentVersion: number;
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
  noteCount?: number | null;
  tagColor?: string | null;
  tagCustomColor?: string | null;
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

interface BackupPreviewDto {
  formatVersion: number;
  exportedAt: string;
  appVersion?: string | null;
  contents: BackupContentsSummary;
  includesAiHistory: boolean;
  preservesExistingAiHistory: boolean;
  missingAttachmentFiles: number;
}

interface ImportBackupResultDto {
  workspace: WorkspaceSnapshotDto;
  contents: BackupContentsSummary;
  preservedLegacyChats: number;
  indexesUpdating: boolean;
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
    assetUri: attachment.assetUri ?? undefined,
    blobId: attachment.blobId ?? undefined,
    createdAt: attachment.createdAt,
    id: attachment.id,
    kind: toAttachmentKind(attachment.kind),
    mimeType: attachment.mimeType,
    noteId: attachment.noteId,
    originalName: attachment.originalName,
    originalAttachmentId: attachment.originalAttachmentId ?? undefined,
    editMetadata: attachment.editMetadata ?? undefined,
    sizeBytes: attachment.sizeBytes,
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

function formatDateLabel(updatedAt: string, noteDate: string) {
  const updatedDate = new Date(updatedAt);
  if (!Number.isNaN(updatedDate.valueOf())) {
    const today = new Date();
    if (updatedDate.toDateString() === today.toDateString()) {
      return formatDisplayTime(updatedDate);
    }
    return formatDisplayDate(updatedDate);
  }
  return formatDisplayDate(noteDate) || noteDate;
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
    contentVersion: note.contentVersion,
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
    tags,
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
    noteCount: item.noteCount ?? undefined,
    tagColor: item.tagColor ? toTagColor(item.tagColor) : undefined,
    tagCustomColor: item.tagCustomColor ?? undefined,
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

export async function getFirstRunState() {
  return await invoke<{ required: boolean }>("get_first_run_state");
}

export async function completeFirstRun(profileName: string): Promise<FirstRunCompletion> {
  const result = await invoke<{ note: NoteDto; settings: { localProfileName: string } }>("complete_first_run", {
    request: { profileName },
  });
  return { note: mapNote(result.note), localProfileName: result.settings.localProfileName };
}

export async function dismissFirstRun(): Promise<void> {
  await invoke("dismiss_first_run");
}

export async function listNotes(query: string, includeArchived = false) {
  const notes = await invoke<NoteDto[]>("list_notes", {
    includeArchived,
    query: query.trim() || null,
  });
  return notes.map(mapNote);
}

export async function getNote(noteId: string) {
  return mapNote(await invoke<NoteDto>("get_note", { noteId }));
}

export async function createNote(title: string, noteDate: string) {
  return mapNote(await invokeNotePersistence<NoteDto>("create_note", { request: { noteDate, title } }));
}

export interface UpdateNoteContentInput {
  contentHtml: string;
  contentMarkdown: string;
  contentSidecars: EditorContentSidecarInput[];
  editorDocument: EditorDocument;
  expectedContentVersion: number;
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
    await invokeNotePersistence<NoteDto>("update_note_content", {
      request: {
        contentHtml: note.contentHtml,
        contentJson: note.editorDocument,
        contentMarkdown: note.contentMarkdown,
        contentSidecars: note.contentSidecars.map(mapNoteContentSidecarInput),
        expectedContentVersion: note.expectedContentVersion,
        noteId: note.id,
        plainText: note.plainText,
      },
    }),
  );
}

export async function restoreNoteRevision(noteId: string, revisionId: string, expectedContentVersion: number) {
  return mapNote(
    await invokeNotePersistence<NoteDto>("restore_note_revision", {
      request: { expectedContentVersion, noteId, revisionId },
    }),
  );
}

export async function renameNote(noteId: string, title: string) {
  return mapNote(await invoke<NoteDto>("rename_note", { request: { noteId, title } }));
}

export async function setNoteTag(noteId: string, tagId: string, assigned: boolean) {
  return mapNote(await invoke<NoteDto>("set_note_tag", { request: { assigned, noteId, tagId } }));
}

export async function makeNoteTagPrimary(noteId: string, tagId: string) {
  return mapNote(await invoke<NoteDto>("make_note_tag_primary", { noteId, tagId }));
}

export async function duplicateNote(noteId: string) {
  return mapNote(await invokeNotePersistence<NoteDto>("duplicate_note", { noteId }));
}

export async function toggleNotePin(noteId: string) {
  return mapNote(await invoke<NoteDto>("toggle_note_pin", { noteId }));
}

export async function moveNoteToProject(noteId: string, projectTitle: string) {
  return mapNote(await invoke<NoteDto>("move_note_to_project", { request: { noteId, projectTitle } }));
}

export async function removeNoteFromProject(noteId: string) {
  return mapNote(await invoke<NoteDto>("remove_note_from_project", { noteId }));
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

export interface DeleteAllNotesSummary {
  notes: number;
  archivedNotes: number;
  revisions: number;
  noteChats: number;
  ragChats: number;
}

export interface DeleteAllNotesResult {
  deletedNotes: number;
  cleanupPending: boolean;
}

export function getDeleteAllNotesSummary() {
  return invoke<DeleteAllNotesSummary>("get_delete_all_notes_summary");
}

export function deleteAllNotes() {
  return invoke<DeleteAllNotesResult>("delete_all_notes");
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

export async function updateProject(projectId: string, title: string, description: string) {
  return mapProject(await invoke<ProjectDto>("update_project", { request: { description, projectId, title } }));
}

export async function archiveProject(projectId: string) {
  await invoke<void>("archive_project", { projectId });
}

export async function importMarkdown(notes: readonly PreparedMarkdownNote[]) {
  const result = await invoke<{ notes: NoteDto[] }>("import_markdown", {
    request: {
      notes: notes.map(({ skippedReferences: _skippedReferences, ...note }) => note),
    },
  });
  return result.notes.map(mapNote);
}

export async function listTags(query = "") {
  const tags = await invoke<TagDto[]>("list_tags", { query: query.trim() || null });
  return tags.map(mapTagRow);
}

export async function createTag(name: string, color: TagColor, customColor?: string) {
  return mapTagRow(await invoke<TagDto>("create_tag", { request: { color, customColor: customColor ?? null, name } }));
}

export async function updateTag(tagId: string, name: string, color: TagColor, customColor?: string) {
  const tags = await invoke<TagDto[]>("update_tag", {
    request: { color, customColor: customColor ?? null, name, tagId },
  });
  return tags.map(mapTagRow);
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

export interface ArchivedProjectNote {
  archivedAt?: string | null;
  id: string;
  title: string;
  tagColor?: string | null;
  tagCustomColor?: string | null;
}

export async function listArchivedProjectNotes(projectId: string) {
  return invoke<ArchivedProjectNote[]>("list_archived_project_notes", { projectId });
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
  const policy = await getAttachmentPolicy();
  validateAttachmentSize(file.size, kind, policy);
  const bytes = await fileToBytes(file);
  validateAttachmentBytes(file.size, Uint8Array.from(bytes.slice(0, 12)), kind, policy);
  return mapAttachmentStoreResult(
    await invoke<AttachmentStoreResultDto>("store_attachment", {
      request: {
        bytes,
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

export async function pickAndStoreAttachment(noteId: string, kind: "file" | "image") {
  const sourcePath = await open({
    directory: false,
    filters: kind === "image" ? [{ name: "Изображения", extensions: ["png", "jpg", "jpeg", "webp"] }] : undefined,
    multiple: false,
    title: kind === "image" ? "Выберите изображение" : "Выберите файл",
  });
  if (!sourcePath) {
    return null;
  }
  return mapAttachmentStoreResult(
    await invoke<AttachmentStoreResultDto>("store_attachment_from_path", {
      request: {
        editMetadata: null,
        kind,
        noteId,
        originalAttachmentId: null,
        sourcePath,
      },
    }),
  );
}

export async function openAttachment(attachmentId: string) {
  await invoke<void>("open_attachment", { attachmentId });
}

export async function revealAttachment(attachmentId: string) {
  await invoke<void>("reveal_attachment", { attachmentId });
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
  return runBackupExport(
    () => save({
      title: "Создать резервную копию NoteFlow",
      defaultPath: `NoteFlow-backup-${new Intl.DateTimeFormat("sv-SE").format(new Date())}.zip`,
      filters: [{ name: "Резервная копия NoteFlow", extensions: ["zip"] }],
    }),
    async (path) => mapExportResult(await invoke<ExportResultDto>("create_backup_at_path", { path })),
  );
}

export async function previewBackup(file: File): Promise<BackupPreview> {
  return await invoke<BackupPreviewDto>("preview_backup", {
    request: {
      bytes: await fileToBytes(file),
      fileName: file.name,
    },
  });
}

export async function importBackup(file: File): Promise<ImportBackupResult> {
  const result = await invoke<ImportBackupResultDto>("import_backup", {
    request: {
      bytes: await fileToBytes(file),
      fileName: file.name,
    },
  });
  return {
    ...result,
    workspace: mapWorkspace(result.workspace),
  } satisfies ImportBackupResult;
}

export async function quitApp() {
  await invoke<void>("quit_app");
}
