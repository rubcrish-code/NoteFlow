export interface RagGenerationRequestIdentity {
  chatId: string;
  requestId: number;
}

export function isRagGenerationCurrent(
  request: RagGenerationRequestIdentity,
  activeRequestId: number,
  deletedChatIds: ReadonlySet<string>,
) {
  return request.requestId === activeRequestId && !deletedChatIds.has(request.chatId);
}

export function shouldApplyRagGenerationToVisibleChat(
  request: RagGenerationRequestIdentity,
  activeRequestId: number,
  activeChatId: string,
  deletedChatIds: ReadonlySet<string>,
) {
  return isRagGenerationCurrent(request, activeRequestId, deletedChatIds)
    && request.chatId === activeChatId;
}
