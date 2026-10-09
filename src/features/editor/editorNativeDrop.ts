import type { Editor } from "@tiptap/react";
import type { EditorNode } from "./markdownService";
import type { AttachmentStoreResult } from "../../services/dataService";

export const MAX_DROP_FILES = 32;

export function nativeDropPoint(position: { x: number; y: number }, pixelRatio: number, bounds: Pick<DOMRect, "left" | "top" | "right" | "bottom">) {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return null;
  const point = { left: position.x / pixelRatio, top: position.y / pixelRatio };
  if (!Number.isFinite(point.left) || !Number.isFinite(point.top) || point.left < bounds.left || point.left > bounds.right || point.top < bounds.top || point.top > bounds.bottom) return null;
  return point;
}

export function droppedFileKind(path: string): "file" | "image" {
  return /\.(png|jpe?g|webp)$/i.test(path) ? "image" : "file";
}

export function attachmentInsertNode(result: AttachmentStoreResult): EditorNode {
  const attachment = result.attachment;
  if (attachment.kind === "image") {
    if (!attachment.assetUri) throw new Error("Не удалось подготовить изображение");
    return { type: "image", attrs: { src: attachment.assetUri, originalSrc: attachment.assetUri,
      attachmentId: attachment.id, originalAttachmentId: attachment.id,
      alt: attachment.originalName, title: attachment.originalName } };
  }
  return { type: "fileAttachment", attrs: { storageId: attachment.id, name: attachment.originalName,
    size: result.sizeLabel, type: attachment.mimeType || "file" } };
}

export async function insertNativeDrop(editor: Editor, paths: string[], position: number,
  store: (path: string, kind: "file" | "image") => Promise<AttachmentStoreResult>, isCurrent: () => boolean) {
  const uniquePaths = [...new Set(paths)];
  if (!uniquePaths.length) return false;
  if (uniquePaths.length > MAX_DROP_FILES) throw new Error("Переносите не больше 32 файлов за один раз");
  const originalDocument = editor.state.doc;
  const nodes: EditorNode[] = [];
  for (const path of uniquePaths) {
    if (editor.isDestroyed || !isCurrent() || !originalDocument.eq(editor.state.doc)) return false;
    nodes.push(attachmentInsertNode(await store(path, droppedFileKind(path))));
  }
  if (editor.isDestroyed || !isCurrent() || !originalDocument.eq(editor.state.doc)) return false;
  return editor.chain().focus().insertContentAt(position, nodes).run();
}
