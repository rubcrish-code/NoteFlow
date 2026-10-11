import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import type { PreparedMarkdownNote } from "../settings/markdownImport";

export interface MarkdownImportSelection { document: Node; position: number }

export function captureMarkdownImportSelection(editor: Editor): MarkdownImportSelection {
  return { document: editor.state.doc, position: editor.state.selection.from };
}

export function insertImportedMarkdown(editor: Editor, notes: readonly PreparedMarkdownNote[], selection: MarkdownImportSelection | null) {
  if (editor.isDestroyed || !editor.isEditable || !notes.length) throw new Error("Markdown import unavailable");
  const content = notes.flatMap((note) => note.contentJson.content ?? []);
  if (!content.length) return;
  const position = selection && selection.document.eq(editor.state.doc) ? selection.position : editor.state.doc.content.size;
  // Insert at a point, never replace selected user text. TipTap applies one undoable transaction.
  if (!editor.commands.insertContentAt(editor.isEmpty ? 0 : position, content, { errorOnInvalidContent: true })) {
    throw new Error("Markdown import failed");
  }
}
