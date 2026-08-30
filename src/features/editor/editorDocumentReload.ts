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
  const { currentDocument, nextDocument, nextToken, previousToken } = input;
  if (!previousToken || previousToken.noteId !== nextToken.noteId) {
    return true;
  }
  if (previousToken.reloadGeneration !== nextToken.reloadGeneration) {
    return true;
  }
  if (previousToken.contentVersion === nextToken.contentVersion) {
    return false;
  }
  return JSON.stringify(currentDocument) !== JSON.stringify(nextDocument);
}
