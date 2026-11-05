import { translate } from "../../shared/i18n";
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
  container.querySelectorAll("script, style, iframe, object, embed, link, meta, base").forEach((node) => node.remove());
  container.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name) || ["srcdoc", "formaction"].includes(attribute.name)) node.removeAttribute(attribute.name);
    }
  });
  for (const image of container.querySelectorAll("img")) {
    const source = canonicalAssetUri(image.getAttribute("src") ?? "");
    if (/^noteflow-asset:\/\/[a-f0-9]{64}$/.test(source)) {
      image.setAttribute("src", source); image.removeAttribute("srcset");
    } else image.replaceWith(document.createTextNode(image.getAttribute("alt") ?? ""));
  }
  return container.innerHTML;
}

const MAX_CLIPBOARD_TEXT_BYTES = 4 * 1024 * 1024;

export function handleEditorPasteEvent(editor: Editor, event: ClipboardEvent, onError: () => void) {
  if (!event.clipboardData) return false;
  const text = event.clipboardData.getData("text/plain");
  const html = event.clipboardData.getData("text/html");
  const markdown = event.clipboardData.getData("text/markdown");
  if (!text && !html && !markdown) return false;
  event.preventDefault();
  try { pasteEditorContent(editor, { text, html, markdown }); }
  catch { onError(); }
  return true;
}

function isSourceTextHtml(html: string, text: string) {
  const document = window.document.implementation.createHTMLDocument("");
  const container = document.createElement("div");
  container.innerHTML = html;
  // Editors such as VS Code publish highlighted source in PRE/CODE/SPAN, not rich Markdown.
  if (container.querySelector("h1,h2,h3,h4,h5,h6,strong,b,em,i,u,s,del,a,ul,ol,li,blockquote,table,img")) return false;
  const normalize = (value: string) => value.replace(/\r\n?/g, "\n").replace(/\s+/gu, " ").trim();
  return normalize(container.textContent ?? "") === normalize(text);
}

export function pasteEditorContent(editor: Editor, content: EditorClipboardContent): boolean {
  if (editor.isDestroyed) return false;
  if (content.attachments?.length) {
    return editor.chain().focus().insertContentAt(editor.state.selection, content.attachments.map(attachmentInsertNode)).run();
  }
  const markdown = content.markdown ?? "";
  if (!content.html && !content.text && !markdown) return false;
  if ([content.html, content.text, markdown].some((value) => value.length > MAX_CLIPBOARD_TEXT_BYTES || new TextEncoder().encode(value).length > MAX_CLIPBOARD_TEXT_BYTES)) throw new Error(translate("ui.6367cb04fbb2"));
  editor.view.focus();
  if (editor.isActive("codeBlock") || editor.isActive("code")) return editor.view.pasteText(content.text || markdown);
  const source = markdown || content.text;
  if (markdown || isMarkdownLike(source) && (!content.html || isSourceTextHtml(content.html, source))) {
    return editor.commands.insertContentAt(editor.state.selection, markdownToTiptapDoc(source).content ?? []);
  }
  // Preserve ProseMirror slice validation, HTML schema parsing, paste hooks and undo history.
  if (content.html) return editor.view.pasteHTML(filterClipboardHtml(content.html));
  return editor.view.pasteText(content.text);
}

export async function pasteClipboardIntoEditor(editor: Editor, read: () => Promise<EditorClipboardContent>,
  isCurrent: () => boolean, onToast: (message: string) => void, plainTextOnly = false, asMarkdown = false) {
  if (editor.isDestroyed || !isCurrent()) return false;
  const document = editor.state.doc;
  const selection = editor.state.selection;
  const bookmark = selection.getBookmark();
  const content = await read();
  if (editor.isDestroyed || !isCurrent() || !document.eq(editor.state.doc) || !selection.eq(editor.state.selection)) return false;
  editor.view.dispatch(editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)));
  const inserted = plainTextOnly ? Boolean(content.text && editor.view.pasteText(content.text)) : pasteEditorContent(editor,
    asMarkdown ? { text: content.text || content.markdown || "", html: "", markdown: content.markdown || content.text } : content);
  if (content.failedFiles) onToast(inserted ? translate("ui.d6c981ed81ca") : translate("ui.07c21568293f"));
  return inserted;
}
