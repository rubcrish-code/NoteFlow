import type { EditorDocument } from "../../app/types";

export interface EditorDocumentLoadToken {
  contentVersion: number;
  noteId: string;
  reloadGeneration: number;
}

interface EditorDocumentReloadInput {
  currentDocument: EditorDocument;
  nextDocument: EditorDocument;
  nextToken: EditorDocumentLoadToken;
  previousToken: EditorDocumentLoadToken | null;
}

export function shouldReloadEditorDocument(input: EditorDocumentReloadInput) {
  const { nextToken, previousToken } = input;
  if (!previousToken || previousToken.noteId !== nextToken.noteId) {
    return true;
  }
  if (previousToken.reloadGeneration !== nextToken.reloadGeneration) {
    return true;
  }
  // A save acknowledgement is not an external document replacement. Re-parsing
  // Markdown here would overwrite in-flight typing and reset the selection.
  return false;
}
