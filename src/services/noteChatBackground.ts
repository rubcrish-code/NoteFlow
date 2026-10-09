import type { Note } from "../app/types";
import { AiBackground } from "./aiBackground";
import { ChatDrafts } from "../shared/ChatDrafts";
import { createNoteAiContext, runNoteAi, saveNoteChatMessage, type PersistedNoteChatMessage } from "./noteAiService";

export const noteChatJobs = new AiBackground<PersistedNoteChatMessage>();
// SQLite currently has one note-scoped conversation per note.
export const noteChatDrafts = new ChatDrafts();
export function forgetNoteChat(noteId: string) { noteChatJobs.forget(noteId); noteChatDrafts.delete(noteId); }

export async function sendNoteChatInBackground(note: Note, question: string, selectedText: string) {
  const context = createNoteAiContext(note, selectedText);
  const originalDraft = noteChatDrafts.get(note.id);
  const recovery = originalDraft.trim() === question.trim() ? originalDraft : question;
  let requestId = "";
  let recoveryRevision = noteChatDrafts.revision(note.id);
  const started = await noteChatJobs.start(note.id, question, async (job) => {
    requestId = job.control.requestId;
    const user = await saveNoteChatMessage(note.id, "user", question); job.check();
    noteChatDrafts.clearIfUnchanged(note.id, question);
    recoveryRevision = noteChatDrafts.revision(note.id);
    job.update({ userMessageId: user.id });
    job.update({ phase: "generating" });
    const result = await runNoteAi({ kind: "chat", scope: selectedText ? "selection" : "note", question, context }, job.control);
    job.check();
    if (result.status !== "success" || !result.response.trim()) {
      throw new Error(result.message || "Не удалось получить ответ модели");
    }
    return saveNoteChatMessage(note.id, "assistant", result.response);
  });
  const current = noteChatJobs.get(note.id);
  if (started && current?.requestId === requestId && (current.phase === "error" || current.phase === "stopped")) noteChatDrafts.recoverIfEmpty(note.id, recovery, recoveryRevision);
  return started;
}
