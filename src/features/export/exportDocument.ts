import type { EditorDocument, EditorNode } from "../editor/markdownService";
import { formatDisplayDate } from "../../shared/displayDate";

export type NoteExportFormat = "md" | "txt" | "docx" | "pdf";
export interface ExportImage { uri: string; mime: string; bytes: Uint8Array; width: number; height: number }
export interface ExportDocument { title: string; document: EditorDocument; images: ExportImage[] }

export function exportFilename(title: string, extension: string): string {
  let stem = "";
  const encoder = new TextEncoder();
  for (const character of title) {
    const safe = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/.test(character) ? "_" : character;
    if (encoder.encode(stem + safe).length > 180) break;
    stem += safe;
  }
  stem = stem.trim().replace(/^\.+|[. ]+$/g, "");
  if (!stem) stem = "Заметка";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  return `${stem}.${extension}`;
}

export function inlineText(node: EditorNode, withLinks = false): string {
  if (node.type === "hardBreak") return "\n";
  if (node.type === "inlineDate") return formatDisplayDate(String(node.attrs?.value ?? ""));
  if (["inlineMath", "blockMath", "mathInline", "mathBlock"].includes(node.type)) return String(node.attrs?.latex ?? node.attrs?.formula ?? "");
  if (node.text !== undefined) {
    const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
    return withLinks && typeof href === "string" && href !== node.text ? `${node.text} (${href})` : node.text;
  }
  return (node.content ?? []).map((child) => inlineText(child, withLinks)).join("");
}

export function plainBlocks(nodes: EditorNode[], depth = 0): string {
  return nodes.map((node) => {
    if (["bulletList", "orderedList", "taskList"].includes(node.type)) {
      return (node.content ?? []).map((item, index) => {
        const prefix = node.type === "orderedList" ? `${Number(node.attrs?.start ?? 1) + index}.` : node.type === "taskList" ? item.attrs?.checked ? "[x]" : "[ ]" : "•";
        return `${"  ".repeat(depth)}${prefix} ${plainBlocks(item.content ?? [], depth + 1).trim()}`;
      }).join("\n");
    }
    if (node.type === "table") return (node.content ?? []).map((row) => (row.content ?? []).map((cell) => inlineText(cell, true)).join(" | ")).join("\n");
    if (node.type === "image") return `[Изображение${node.attrs?.alt ? `: ${node.attrs.alt}` : ""}]`;
    if (node.type === "fileAttachment") return `[Файл: ${node.attrs?.fileName ?? node.attrs?.name ?? "Вложение"}]`;
    if (node.type === "horizontalRule") return "────────────────";
    if (["blockquote", "callout", "detailsBlock", "detailsContent", "listItem", "taskItem"].includes(node.type)) return plainBlocks(node.content ?? [], depth);
    return inlineText(node, true);
  }).join("\n\n");
}

export function generateTxt(input: ExportDocument): Uint8Array {
  return new TextEncoder().encode(`${input.title}\n\n${plainBlocks(input.document.content ?? [])}\n`);
}

export function managedImageUris(document: EditorDocument): string[] {
  const uris = new Set<string>();
  function visit(node: EditorNode) {
    if (node.type === "image" && typeof node.attrs?.src === "string" && node.attrs.src.startsWith("noteflow-asset://")) uris.add(node.attrs.src);
    node.content?.forEach(visit);
  }
  visit(document);
  return [...uris];
}

export function color(value: unknown): string | undefined {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : undefined;
}
