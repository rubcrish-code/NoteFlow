import type { EditorDocument } from "./markdownService";
import type { EditorContentSerializeResult } from "./editorContentSerializer";

export interface EditorSerializationSnapshot { document: EditorDocument; contentHtml: string; noteId: string }
export interface EditorSerializationRequest { id: number; snapshot: EditorSerializationSnapshot }
export type EditorSerializationResponse = { id: number; result: EditorContentSerializeResult } | { id: number; failed: true };
