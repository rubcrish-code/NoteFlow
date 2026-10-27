import type { EditorContentSidecarInput, EditorDocument } from "../../app/types";
import { serializeEditorDocumentForStorage } from "../editor/editorContentSerializer";
import { markdownToTiptapDoc, type EditorNode } from "../editor/markdownService";
import { parseInternalNoteLink } from "../../shared/internalNoteLink";

export const MAX_MARKDOWN_IMPORT_FILES = 32;
export const MAX_MARKDOWN_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_MARKDOWN_IMPORT_TOTAL_BYTES = 64 * 1024 * 1024;

export interface PreparedMarkdownNote {
  title: string;
  contentJson: EditorDocument;
  contentMarkdown: string;
  contentHtml: string;
  plainText: string;
  contentSidecars: EditorContentSidecarInput[];
  skippedReferences: number;
}

function isPortableLink(href: string) {
  return Boolean(parseInternalNoteLink(href.trim())) || /^(https?:\/\/|mailto:|#)/i.test(href.trim());
}

function removeUnmanagedReferences(node: EditorNode, skipped: { count: number }): EditorNode {
  if (node.type === "image" || node.type === "fileAttachment") {
    skipped.count += 1;
    const name = String(node.attrs?.alt ?? node.attrs?.name ?? "Файл").trim() || "Файл";
    return { type: "paragraph", content: [{ type: "text", text: `${name} (файл не импортирован)` }] };
  }
  const marks = node.marks?.filter((mark) => {
    if (mark.type !== "link" || isPortableLink(String(mark.attrs?.href ?? ""))) return true;
    skipped.count += 1;
    return false;
  });
  return {
    ...node,
    ...(marks ? { marks } : {}),
    ...(node.content ? { content: node.content.map((child) => removeUnmanagedReferences(child, skipped)) } : {}),
  };
}

export function markdownImportTitle(fileName: string) {
  const parts = fileName.replace(/\\/g, "/").split("/");
  const leaf = parts[parts.length - 1] ?? "";
  const title = leaf.replace(/\.md$/i, "").trim();
  if (!/\.md$/i.test(leaf) || !title) throw new Error("Выберите файл .md с корректным именем");
  return title;
}

export function prepareMarkdownText(fileName: string, markdown: string): PreparedMarkdownNote {
  const title = markdownImportTitle(fileName);
  const skipped = { count: 0 };
  const parsed = markdownToTiptapDoc(markdown.replace(/^\uFEFF/, ""));
  const document = removeUnmanagedReferences(parsed, skipped) as EditorDocument;
  const serialized = serializeEditorDocumentForStorage(document);
  return {
    title,
    contentJson: serialized.editorDocument,
    contentMarkdown: serialized.contentMarkdown,
    contentHtml: serialized.contentHtml,
    plainText: serialized.plainText,
    contentSidecars: serialized.contentSidecars,
    skippedReferences: skipped.count,
  };
}

export async function prepareMarkdownFiles(files: readonly File[]) {
  if (files.length < 1 || files.length > MAX_MARKDOWN_IMPORT_FILES) {
    throw new Error("Выберите от 1 до 32 Markdown-файлов");
  }
  if (files.some((file) => file.size > MAX_MARKDOWN_IMPORT_FILE_BYTES)
    || files.reduce((total, file) => total + file.size, 0) > MAX_MARKDOWN_IMPORT_TOTAL_BYTES) {
    throw new Error("Markdown-файлы слишком большие");
  }
  const prepared: PreparedMarkdownNote[] = [];
  for (const file of files) {
    markdownImportTitle(file.name);
    let markdown: string;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
        throw new Error("Unsupported UTF-16 encoding");
      }
      markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (markdown.includes("\0")) throw new Error("NUL bytes are not valid Markdown text");
    } catch {
      throw new Error(`Не удалось прочитать «${file.name}»: требуется UTF-8`);
    }
    prepared.push(prepareMarkdownText(file.name, markdown));
  }
  return prepared;
}
