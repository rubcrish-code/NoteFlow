import { invoke, isTauri } from "@tauri-apps/api/core";
import { mapAttachmentStoreResult, storeAttachment, type AttachmentStoreResult } from "./dataService";

export interface EditorClipboardContent { text: string; html: string; attachments?: AttachmentStoreResult[]; failedFiles?: number }

export async function readEditorClipboard(noteId?: string, plainTextOnly = false): Promise<EditorClipboardContent> {
  if (isTauri()) {
    const result = await invoke<{ text: string; html: string; failedFiles: number; attachments: Parameters<typeof mapAttachmentStoreResult>[0][] }>("read_editor_clipboard", { noteId: noteId ?? null, plainTextOnly });
    return { ...result, attachments: (result.attachments ?? []).map(mapAttachmentStoreResult) };
  }
  if (navigator.clipboard?.read) {
    const items = await navigator.clipboard.read();
    const result = { text: "", html: "" };
    for (const item of items) {
      if (!plainTextOnly && noteId) {
        const imageType = item.types.find((type) => ["image/png", "image/jpeg", "image/webp"].includes(type));
        if (imageType) {
          const blob = await item.getType(imageType);
          const extension = imageType === "image/jpeg" ? "jpg" : imageType.split("/")[1];
          return { text: "", html: "", attachments: [await storeAttachment(noteId, new File([blob], `Изображение.${extension}`, { type: imageType }), "image")] };
        }
      }
      if (!plainTextOnly && item.types.includes("text/html")) result.html = await (await item.getType("text/html")).text();
      if (item.types.includes("text/plain")) result.text = await (await item.getType("text/plain")).text();
      if (result.html || result.text) break;
    }
    return result;
  }
  if (!navigator.clipboard?.readText) throw new Error("Буфер обмена недоступен");
  return { text: await navigator.clipboard.readText(), html: "" };
}

export function canReadEditorClipboard() {
  return isTauri() || Boolean(navigator.clipboard?.read || navigator.clipboard?.readText);
}

export async function importClipboardFiles(noteId: string, files: File[]): Promise<EditorClipboardContent> {
  if (files.length > 32) throw new Error("Вставляйте не больше 32 файлов за один раз");
  const attachments: AttachmentStoreResult[] = [];
  let failedFiles = 0;
  const seen = new Set<File>();
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    try { attachments.push(await storeAttachment(noteId, file, /\.(png|jpe?g|webp)$/i.test(file.name) ? "image" : "file")); }
    catch { failedFiles++; }
  }
  return { text: "", html: "", attachments, failedFiles };
}

export function canWriteEditorClipboard() {
  return isTauri() || Boolean(navigator.clipboard?.writeText);
}

export async function writeEditorClipboard(text: string) {
  if (isTauri()) return invoke<void>("write_editor_clipboard", { text });
  await navigator.clipboard.writeText(text);
}
