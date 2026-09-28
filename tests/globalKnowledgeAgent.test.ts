import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retrieveForRagQuestion } from "../src/features/rag/ragQueryRouting";
import { RagGenerationError, type RagQueryPlan } from "../src/services/ragChatService";

const structured: RagQueryPlan = {
  needsHybridRetrieval: false,
  searchQuery: "Какая последняя заметка?",
  projectId: null,
  tagId: null,
};

const content: RagQueryPlan = {
  needsHybridRetrieval: true,
  searchQuery: "Что я писал про сервер?",
  projectId: "alpha",
  tagId: "work",
};

describe("global knowledge query routing", () => {
  it("uses metadata-only route without an embedding profile or network request", async () => {
    let hybridCalls = 0;
    const results = await retrieveForRagQuestion(
      { chatId: "chat", userMessageId: "question", profileId: null, canRetrieve: false },
      {
        plan: async () => structured,
        hybridSearch: async () => { hybridCalls += 1; return []; },
      },
    );
    assert.deepEqual(results, []);
    assert.equal(hybridCalls, 0);
  });

  it("passes the backend plan and project/tag scope to the existing hybrid search", async () => {
    let received: { profileId: string; plan: RagQueryPlan } | null = null;
    await retrieveForRagQuestion(
      { chatId: "chat", userMessageId: "question", profileId: "embedding", canRetrieve: true },
      {
        plan: async () => content,
        hybridSearch: async (profileId, plan) => { received = { profileId, plan }; return []; },
      },
    );
    assert.deepEqual(received, { profileId: "embedding", plan: content });
  });

  it("keeps a textual project mention in the global hybrid search", async () => {
    const plan: RagQueryPlan = {
      needsHybridRetrieval: true,
      searchQuery: "На каком сервере разворачивается проект Альфа?",
      projectId: null,
      tagId: null,
    };
    let calls = 0;
    await retrieveForRagQuestion(
      { chatId: "chat", userMessageId: "question", profileId: "embedding", canRetrieve: true },
      {
        plan: async () => plan,
        hybridSearch: async (profileId, receivedPlan) => {
          calls += 1;
          assert.equal(profileId, "embedding");
          assert.deepEqual(receivedPlan, plan);
          return [];
        },
      },
    );
    assert.equal(calls, 1);
  });

  it("reports unavailable retrieval but never silently treats a content question as metadata", async () => {
    await assert.rejects(
      retrieveForRagQuestion(
        { chatId: "chat", userMessageId: "question", profileId: null, canRetrieve: false },
        { plan: async () => content, hybridSearch: async () => { throw new Error("must not run"); } },
      ),
      (error: unknown) => error instanceof RagGenerationError && error.code === "retrieval_unavailable",
    );
  });

  it("does not start hybrid search if planning fails", async () => {
    let hybridCalls = 0;
    await assert.rejects(
      retrieveForRagQuestion(
        { chatId: "chat", userMessageId: "question", profileId: "embedding", canRetrieve: true },
        {
          plan: async () => { throw new Error("planning failed"); },
          hybridSearch: async () => { hybridCalls += 1; return []; },
        },
      ),
    );
    assert.equal(hybridCalls, 0);
  });
});
