import type { SemanticSearchResult } from "../../services/embeddingService";
import { RagGenerationError, type RagQueryPlan } from "../../services/ragChatService";

interface RoutingRequest {
  chatId: string;
  userMessageId: string;
  profileId: string | null;
  canRetrieve: boolean;
}

interface RoutingDependencies {
  plan: (chatId: string, userMessageId: string) => Promise<RagQueryPlan>;
  hybridSearch: (profileId: string, plan: RagQueryPlan) => Promise<SemanticSearchResult[]>;
}

export async function retrieveForRagQuestion(
  request: RoutingRequest,
  dependencies: RoutingDependencies,
): Promise<SemanticSearchResult[]> {
  const plan = await dependencies.plan(request.chatId, request.userMessageId);
  if (!plan.needsHybridRetrieval) return [];
  if (!request.profileId || !request.canRetrieve) {
    throw new RagGenerationError(
      "retrieval_unavailable",
      "Для поиска по содержимому настройте и обновите модель смыслового поиска.",
      true,
    );
  }
  return dependencies.hybridSearch(request.profileId, plan);
}
