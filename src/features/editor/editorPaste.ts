import type { Editor } from "@tiptap/react";
import type { EditorClipboardContent } from "../../services/clipboardService";
import { isMarkdownLike, markdownToTiptapDoc } from "./markdownService";
import { attachmentInsertNode } from "./editorNativeDrop";
import { canonicalAssetUri } from "./assetUri";

export function filterClipboardHtml(html: string) {
  // Parse in an inert document: pasted HTML must not trigger remote image loads.
  const document = window.document.implementation.createHTMLDocument("");
  const container = document.createElement("div");
  container.innerHTML = html;
  for (const image of container.querySelectorAll("img")) {
    const source = canonicalAssetUri(image.getAttribute("src") ?? "");
    if (/^noteflow-asset:\/\/[a-f0-9]{64}$/.test(source)) {
      image.setAttribute("src", source); image.removeAttribute("srcset");
    } else image.replaceWith(document.createTextNode(image.getAttribute("alt") ?? ""));
  }
  return container.innerHTML;
}

export function pasteEditorContent(editor: Editor, content: EditorClipboardContent): boolean {
  if (editor.isDestroyed) return false;
  if (content.attachments?.length) {
    return editor.chain().focus().insertContentAt(editor.state.selection, content.attachments.map(attachmentInsertNode)).run();
  }
  if (!content.html && !content.text) return false;
  editor.view.focus();
  // Preserve ProseMirror slice validation, HTML schema parsing, paste hooks and undo history.
  if (content.html) return editor.view.pasteHTML(filterClipboardHtml(content.html));
  if (!editor.isActive("codeBlock") && !editor.isActive("code") && isMarkdownLike(content.text)) {
    return editor.commands.insertContentAt(editor.state.selection, markdownToTiptapDoc(content.text).content ?? []);
  }
  return editor.view.pasteText(content.text);
}

export async function pasteClipboardIntoEditor(editor: Editor, read: () => Promise<EditorClipboardContent>,
  isCurrent: () => boolean, onToast: (message: string) => void, plainTextOnly = false) {
  if (editor.isDestroyed || !isCurrent()) return false;
  const document = editor.state.doc;
  const selection = editor.state.selection;
  const bookmark = selection.getBookmark();
  const content = await read();
  if (editor.isDestroyed || !isCurrent() || !document.eq(editor.state.doc) || !selection.eq(editor.state.selection)) return false;
  editor.view.dispatch(editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)));
  const inserted = plainTextOnly ? Boolean(content.text && editor.view.pasteText(content.text)) : pasteEditorContent(editor, content);
  if (content.failedFiles) onToast(inserted ? "Некоторые файлы не удалось добавить. Остальные вставлены." : "Не удалось добавить файлы. Проверьте формат, размер и доступность.");
  return inserted;
}
