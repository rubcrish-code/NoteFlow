export type LlmNetworkAction = "listModels" | "testConnection";
export type LlmNetworkTargetKind = "draft" | "provider";

export function modelDiscoveryFeedbackFromConnectionTest(result: { status: "success" | "error"; message: string; models: readonly string[] }) {
  if (result.status === "error") {
    return { state: "error" as const, message: result.message };
  }
  return result.models.length > 0
    ? { state: "success" as const, message: `Получено моделей: ${result.models.length}` }
    : { state: "empty" as const, message: "Endpoint доступен, но список моделей пуст" };
}

export interface LlmNetworkOperation {
  readonly id: number;
  readonly action: LlmNetworkAction;
  readonly targetKind: LlmNetworkTargetKind;
  readonly targetId: string;
  readonly fingerprint: string;
  readonly startedAt: number;
  readonly timeoutMs: number;
}

export interface LlmNetworkOperationState {
  readonly latestRequestId: number;
  readonly currentFingerprint: string;
  readonly currentTargetId: string;
  readonly isMounted: boolean;
  readonly deletedTargetIds: readonly string[];
}

export function createLlmNetworkOperation(
  action: LlmNetworkAction,
  id: number,
  targetKind: LlmNetworkTargetKind,
  targetId: string,
  fingerprint: string,
  timeoutMs: number,
  startedAt = Date.now(),
): LlmNetworkOperation {
  return {
    id,
    action,
    targetKind,
    targetId,
    fingerprint,
    startedAt,
    timeoutMs,
  };
}

export function getVisibleLlmNetworkAction(operation: LlmNetworkOperation | null, currentTargetId: string): LlmNetworkAction | null {
  if (!operation) {
    return null;
  }
  if (operation.targetId !== currentTargetId) {
    return null;
  }
  return operation.action;
}

export function isLlmNetworkOperationTargetCurrent(operation: LlmNetworkOperation, state: LlmNetworkOperationState) {
  if (
    !state.isMounted ||
    state.latestRequestId !== operation.id ||
    state.currentTargetId !== operation.targetId ||
    state.currentFingerprint !== operation.fingerprint ||
    state.deletedTargetIds.includes(operation.targetId)
  ) {
    return false;
  }
  return true;
}

export function isLlmNetworkOperationCurrent(operation: LlmNetworkOperation, state: LlmNetworkOperationState) {
  if (!isLlmNetworkOperationTargetCurrent(operation, state)) {
    return false;
  }
  if (Date.now() - operation.startedAt > operation.timeoutMs) {
    return false;
  }
  return true;
}

export function isLlmNetworkOperationActiveById(
  operation: LlmNetworkOperation,
  currentOperation: LlmNetworkOperation | null,
  isMounted: boolean,
) {
  return isMounted && currentOperation?.id === operation.id;
}

export function shouldClearLlmNetworkOperationForTarget(operation: LlmNetworkOperation | null, targetId: string) {
  return operation === null || operation.targetId === targetId;
}
