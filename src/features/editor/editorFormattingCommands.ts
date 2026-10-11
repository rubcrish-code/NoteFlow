import type { Editor } from "@tiptap/react";
import type { EditorToolbarActionId } from "./editorToolbarLayout";
import type { EditorCommandSubmit } from "./EditorCommandPopover";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";

export function runEditorFormattingCommand(editor: Editor, id: EditorToolbarActionId): boolean {
  const chain = editor.chain().focus();
  if (id === "h1" || id === "h2" || id === "h3") return chain.toggleHeading({ level: Number(id.slice(1)) as 1 | 2 | 3 }).run();
  if (id === "align-left" || id === "align-center" || id === "align-right" || id === "align-justify") return chain.setTextAlign(id.slice(6)).run();
  switch (id) {
    case "undo": return chain.undo().run();
    case "redo": return chain.redo().run();
    case "p": return chain.setParagraph().run();
    case "bold": return chain.toggleBold().run();
    case "italic": return chain.toggleItalic().run();
    case "underline": return chain.toggleUnderline().run();
    case "strike": return chain.toggleStrike().run();
    case "inline-code": return chain.toggleCode().run();
    case "sup": return chain.toggleSuperscript().run();
    case "sub": return chain.toggleSubscript().run();
    case "ul": return chain.toggleBulletList().run();
    case "ol": return chain.toggleOrderedList().run();
    case "task": return chain.toggleTaskList().run();
    case "quote": return chain.toggleBlockquote().run();
    case "code-block": return chain.toggleCodeBlock().run();
    case "clear": return chain.unsetAllMarks().clearNodes().run();
    default: return false;
  }
}

export function applyEditorFormattingValue(editor: Editor, value: EditorCommandSubmit): boolean {
  const chain = editor.chain().focus();
  if (value.mode === "color") return value.color ? chain.setColor(value.color).run() : chain.unsetColor().run();
  if (value.mode === "highlight") return value.color ? chain.setHighlight({ color: value.color }).run() : chain.unsetHighlight().run();
  if (value.mode === "link") {
    const href = sanitizeMarkdownLinkHref(value.href);
    if (!href) return false;
    if (value.text) return chain.insertContent({ type: "text", text: value.text, marks: [{ type: "link", attrs: { href } }] }).run();
    return chain.extendMarkRange("link").setLink({ href }).run();
  }
  return false;
}
