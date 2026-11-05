import type { Slice } from "@tiptap/pm/model";
import { tiptapJsonToStandardMarkdown, type EditorNode } from "./markdownService";

export function editorClipboardMarkdown(slice: Slice): string {
  return tiptapJsonToStandardMarkdown({ type: "doc", content: slice.content.toJSON() as EditorNode[] });
}
