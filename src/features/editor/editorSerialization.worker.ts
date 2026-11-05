import { serializeEditorDocumentForStorage } from "./editorContentSerializer";
import type { EditorSerializationRequest, EditorSerializationResponse } from "./editorSerializationProtocol";

self.onmessage = ({ data }: MessageEvent<EditorSerializationRequest>) => {
  let response: EditorSerializationResponse;
  try { response = { id: data.id, result: serializeEditorDocumentForStorage(data.snapshot.document, data.snapshot.contentHtml) }; }
  catch { response = { id: data.id, failed: true }; }
  self.postMessage(response);
};
