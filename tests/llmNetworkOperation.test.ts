import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLlmNetworkOperation,
  getVisibleLlmNetworkAction,
  isLlmNetworkOperationActiveById,
  isLlmNetworkOperationCurrent,
  isLlmNetworkOperationTargetCurrent,
  modelDiscoveryFeedbackFromConnectionTest,
  shouldClearLlmNetworkOperationForTarget,
} from "../src/features/settings/llmNetworkOperation";

describe("LLM settings network operation lifecycle", () => {
  it("does not label a failed connection as an accessible empty model endpoint", () => {
    assert.deepEqual(
      modelDiscoveryFeedbackFromConnectionTest({ status: "error", message: "Нет соединения с моделью.", models: [] }),
      { state: "error", message: "Нет соединения с моделью." },
    );
    assert.deepEqual(
      modelDiscoveryFeedbackFromConnectionTest({ status: "success", message: "Готово", models: [] }),
      { state: "empty", message: "Endpoint доступен, но список моделей пуст" },
    );
  });

  it("keeps loading scoped to the active draft target", () => {
    const operation = createLlmNetworkOperation("testConnection", 7, "draft", "draft-a", "sig-a", 10_000, 1000);

    assert.equal(getVisibleLlmNetworkAction(operation, "draft-a"), "testConnection");
    assert.equal(getVisibleLlmNetworkAction(operation, "draft-b"), null);
    assert.equal(getVisibleLlmNetworkAction(null, "draft-a"), null);
  });

  it("ignores stale results after provider fields change", () => {
    const operation = createLlmNetworkOperation("listModels", 3, "draft", "draft-a", "original-form", 10_000);

    assert.equal(
      isLlmNetworkOperationCurrent(operation, {
        latestRequestId: 3,
        currentFingerprint: "changed-form",
        currentTargetId: "draft-a",
        isMounted: true,
        deletedTargetIds: [],
      }),
      false,
    );
  });

  it("ignores stale results after provider deletion or switch", () => {
    const operation = createLlmNetworkOperation("testConnection", 4, "provider", "provider:a", "sig-a", 10_000);

    assert.equal(
      isLlmNetworkOperationCurrent(operation, {
        latestRequestId: 4,
        currentFingerprint: "sig-a",
        currentTargetId: "provider:a",
        isMounted: true,
        deletedTargetIds: ["provider:a"],
      }),
      false,
    );
    assert.equal(
      isLlmNetworkOperationCurrent(operation, {
        latestRequestId: 4,
        currentFingerprint: "sig-a",
        currentTargetId: "provider:b",
        isMounted: true,
        deletedTargetIds: [],
      }),
      false,
    );
  });

  it("keeps only the latest repeated request current", () => {
    const first = createLlmNetworkOperation("listModels", 10, "draft", "draft-a", "sig-a", 10_000);
    const second = createLlmNetworkOperation("listModels", 11, "draft", "draft-a", "sig-a", 10_000);

    assert.equal(
      isLlmNetworkOperationCurrent(first, {
        latestRequestId: 11,
        currentFingerprint: "sig-a",
        currentTargetId: "draft-a",
        isMounted: true,
        deletedTargetIds: [],
      }),
      false,
    );
    assert.equal(
      isLlmNetworkOperationCurrent(second, {
        latestRequestId: 11,
        currentFingerprint: "sig-a",
        currentTargetId: "draft-a",
        isMounted: true,
        deletedTargetIds: [],
      }),
      true,
    );
  });

  it("clears pending operations when the owning provider is deleted", () => {
    const operation = createLlmNetworkOperation("listModels", 5, "provider", "provider:a", "sig-a", 10_000);

    assert.equal(shouldClearLlmNetworkOperationForTarget(operation, "provider:a"), true);
    assert.equal(shouldClearLlmNetworkOperationForTarget(operation, "provider:b"), false);
  });

  it("ignores results after unmount", () => {
    const operation = createLlmNetworkOperation("testConnection", 6, "draft", "draft-a", "sig-a", 10_000);

    assert.equal(
      isLlmNetworkOperationCurrent(operation, {
        latestRequestId: 6,
        currentFingerprint: "sig-a",
        currentTargetId: "draft-a",
        isMounted: false,
        deletedTargetIds: [],
      }),
      false,
    );
  });

  it("ignores results after operation timeout", () => {
    const operation = createLlmNetworkOperation("listModels", 8, "draft", "draft-a", "sig-a", 25, Date.now() - 1000);

    assert.equal(
      isLlmNetworkOperationCurrent(operation, {
        latestRequestId: 8,
        currentFingerprint: "sig-a",
        currentTargetId: "draft-a",
        isMounted: true,
        deletedTargetIds: [],
      }),
      false,
    );
  });

  it("keeps the owning operation identifiable after timeout so loading can be cleared", () => {
    const operation = createLlmNetworkOperation("testConnection", 9, "draft", "draft-a", "sig-a", 25, Date.now() - 1000);
    const state = {
      latestRequestId: 9,
      currentFingerprint: "sig-a",
      currentTargetId: "draft-a",
      isMounted: true,
      deletedTargetIds: [],
    };

    assert.equal(isLlmNetworkOperationCurrent(operation, state), false);
    assert.equal(isLlmNetworkOperationTargetCurrent(operation, state), true);
  });

  it("keeps stale operations clearable by active id", () => {
    const operation = createLlmNetworkOperation("listModels", 12, "draft", "draft-a", "original", 10_000);

    assert.equal(
      isLlmNetworkOperationCurrent(operation, {
        latestRequestId: 12,
        currentFingerprint: "changed",
        currentTargetId: "draft-a",
        isMounted: true,
        deletedTargetIds: [],
      }),
      false,
    );
    assert.equal(isLlmNetworkOperationActiveById(operation, operation, true), true);
    assert.equal(isLlmNetworkOperationActiveById(operation, null, true), false);
  });
});
