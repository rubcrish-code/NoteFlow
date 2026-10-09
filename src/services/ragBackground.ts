import { AiBackground } from "./aiBackground";
import * as rag from "./ragChatService";
import * as embedding from "./embeddingService";
import { retrieveForRagQuestion } from "../features/rag/ragQueryRouting";
import { ragDrafts } from "../features/rag/ragDrafts";

export const ragJobs = new AiBackground<rag.RagGenerationResult>();
let provisionalChat: Promise<rag.RagChat> | null = null;
export function ensureProvisionalRagChat() {
  if (!provisionalChat) provisionalChat = rag.createRagChat().finally(() => { provisionalChat = null; });
  return provisionalChat;
}

export async function sendRagInBackground(chat: rag.RagChat, question: string, profileId: string | null, canRetrieve: boolean, retryUserId = "") {
  const originalDraft = ragDrafts.get(chat.id);
  const recovery = originalDraft.trim() === question.trim() ? originalDraft : question;
  let requestId = "";
  let recoveryRevision = ragDrafts.revision(chat.id);
  const started = await ragJobs.start(chat.id, question, async (job) => {
    requestId = job.control.requestId;
    let userId = retryUserId;
    if (!userId) {
      const user = await rag.saveRagChatMessage(chat.id, "user", question); job.check(); userId = user.id;
      ragDrafts.clearIfUnchanged(chat.id, question);
      recoveryRevision = ragDrafts.revision(chat.id);
    }
    job.update({ userMessageId: userId }); job.check();
    if (chat.title === "Новый чат") {
      const title = question.replace(/\s+/g, " ").trim();
      await rag.renameRagChat(chat.id, title.length > 58 ? `${title.slice(0, 57).trimEnd()}…` : title); job.check();
    }
    const sources = await retrieveForRagQuestion({ chatId: chat.id, userMessageId: userId, profileId, canRetrieve }, {
      plan: rag.planRagQuestion,
      hybridSearch: async (profileId, plan) => {
        try { return await embedding.hybridSearch({ includeArchived: false, includeNeighbors: true, profileId,
          projectId: plan.projectId ?? undefined, projectIds: plan.projectIds ?? null, includeStandalone: plan.includeStandalone ?? false,
          tagId: plan.tagId ?? undefined, query: plan.searchQuery }); }
        catch { throw new rag.RagGenerationError("retrieval_error", "Не удалось выполнить поиск по базе заметок. Повторите запрос.", true); }
      },
    });
    job.check(); job.update({ phase: "generating" });
    return rag.runRagGeneration(chat.id, userId, sources, job.control);
  }, retryUserId);
  const current = ragJobs.get(chat.id);
  if (started && current?.requestId === requestId && (current.phase === "error" || current.phase === "stopped")) ragDrafts.recoverIfEmpty(chat.id, recovery, recoveryRevision);
}
