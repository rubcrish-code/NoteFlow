import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "./safeInvoke";
import * as dataService from "./dataService";
import { exportFilename, managedImageUris, type ExportImage, type NoteExportFormat } from "../features/export/exportDocument";
import { generateInWorker } from "../features/export/exportWorker";

export const exportFormatLabels: Record<NoteExportFormat, string> = { md: "Markdown (.md)", txt: "Текст (.txt)", docx: "Word (.docx)", pdf: "PDF (.pdf)" };

export async function exportNote(noteId: string, format: NoteExportFormat): Promise<dataService.ExportResult | null> {
  const note = await dataService.getNote(noteId);
  const path = await save({ title: "Экспортировать заметку", defaultPath: exportFilename(note.title, format), filters: [{ name: exportFormatLabels[format], extensions: [format] }] });
  if (!path) return null;
  if (format === "md") return invoke<dataService.ExportResult>("export_note_markdown_at_path", { noteId, path });
  const images = format === "txt" ? [] : await invoke<Array<{ uri: string; mime: string; bytes: number[] }>>("get_note_export_images", { noteId, contentVersion: note.contentVersion, uris: managedImageUris(note.editorDocument) });
  const inputImages: ExportImage[] = images.map((image) => ({ ...image, bytes: new Uint8Array(image.bytes), width: 0, height: 0 }));
  const bytes = await generateInWorker(format, { title: note.title, document: note.editorDocument, images: inputImages });
  return invoke<dataService.ExportResult>("write_note_export_file", { noteId, path, format, bytes: Array.from(bytes) });
}

export async function exportProject(projectId: string, title: string): Promise<dataService.ExportResult | null> {
  const path = await save({ title: "Экспортировать проект", defaultPath: exportFilename(title, "zip"), filters: [{ name: "Markdown-заметки и вложения", extensions: ["zip"] }] });
  return path ? invoke<dataService.ExportResult>("export_project_zip_at_path", { projectId, path }) : null;
}
