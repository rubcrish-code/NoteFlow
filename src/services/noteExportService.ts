import { translate } from "../shared/i18n";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "./safeInvoke";
import * as dataService from "./dataService";
import { exportFilename, managedImageUris, type ExportImage, type NoteExportFormat } from "../features/export/exportDocument";
import { generateInWorker } from "../features/export/exportWorker";
import { serializeCodecMarkdown } from "../features/editor/markdownCodec";

export const exportFormatLabels: Record<NoteExportFormat, string> = { md: "Markdown (.md)", get txt() { return translate("ui.23e5145b903d"); }, docx: "Word (.docx)", pdf: "PDF (.pdf)" };

export async function exportNote(noteId: string, format: NoteExportFormat): Promise<dataService.ExportResult | null> {
  const note = await dataService.getNote(noteId);
  const extension = format;
  const path = await save({ title: translate("ui.28faf17cf8e7"), defaultPath: exportFilename(note.title, extension), filters: [{ name: exportFormatLabels[format], extensions: [extension] }] });
  if (!path) return null;
  if (format === "md") return invoke<dataService.ExportResult>("export_note_markdown_at_path", {
    noteId, path, contentVersion: note.contentVersion,
    markdown: serializeCodecMarkdown(note.editorDocument, false, true),
  });
  const images = format === "txt" ? [] : await invoke<Array<{ uri: string; mime: string; bytes: number[] }>>("get_note_export_images", { noteId, contentVersion: note.contentVersion, uris: managedImageUris(note.editorDocument) });
  const inputImages: ExportImage[] = images.map((image) => ({ ...image, bytes: new Uint8Array(image.bytes), width: 0, height: 0 }));
  const bytes = await generateInWorker(format, { title: note.title, document: note.editorDocument, images: inputImages });
  return invoke<dataService.ExportResult>("write_note_export_file", { noteId, path, format, bytes: Array.from(bytes) });
}

export async function exportProject(projectId: string, title: string): Promise<dataService.ExportResult | null> {
  const path = await save({ title: translate("ui.f82c506e18dd"), defaultPath: exportFilename(title, "zip"), filters: [{ name: translate("ui.08213c1a3c30"), extensions: ["zip"] }] });
  return path ? invoke<dataService.ExportResult>("export_project_zip_at_path", { projectId, path }) : null;
}
