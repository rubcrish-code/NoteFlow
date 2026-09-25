import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ragAnswerForClipboard,
  ragCitationLabel,
  splitRagCitationText,
} from "../src/features/rag/ragCitations.ts";
import {
  isRagGenerationCurrent,
  shouldApplyRagGenerationToVisibleChat,
} from "../src/features/rag/ragGenerationGuards.ts";
import { mapRagChatMessage, type RagMessageSource } from "../src/services/ragChatService.ts";

const source1 = source("S1", 1, "note-1", "План проекта");
const source3 = source("S3", 2, "note-3", "Риски запуска");

describe("grounded RAG citations", () => {
  it("renders valid citations in occurrence order and keeps invalid markers as text", () => {
    const segments = splitRagCitationText("Срок [[S3]], детали [[S1]], снова [[S3]], ошибка [[S9]].", [source1, source3]);
    assert.deepEqual(
      segments.filter((segment) => segment.kind === "citation").map((segment) => segment.source.sourceId),
      ["S3", "S1", "S3"],
    );
    assert.equal(
      segments.filter((segment) => segment.kind === "text").map((segment) => segment.text).join(""),
      "Срок , детали , снова , ошибка [[S9]].",
    );
  });

  it("leaves code rendering untouched but omits technical markers from clipboard", () => {
    assert.deepEqual(splitRagCitationText("[[S1]]", [source1], true), [{ kind: "text", text: "[[S1]]" }]);
    assert.equal(
      ragAnswerForClipboard("Текст [[S1]] и `[[S1]]`.\n```txt\n[[S3]]\n```", [source1, source3]),
      "Текст [1] и ``.\n```txt\n\n```",
    );
  });

  it("copies visible citation numbers without internal source ids", () => {
    const clipboard = ragAnswerForClipboard("Риск [[S3]], срок [[S1]], неизвестный [[S8]].", [source1, source3]);
    assert.equal(clipboard, "Риск [2], срок [1], неизвестный .");
    assert.doesNotMatch(clipboard, /\[\[S[13]\]\]/);
    assert.equal(ragCitationLabel(source3), "Источник 2: Риски запуска");
    assert.equal(ragAnswerForClipboard("[[NO_EVIDENCE]] Ответ", []), "Ответ");
  });

  it("restores saved source snapshots and upgrades legacy source ids", () => {
    const current = mapRagChatMessage(messageDto([{ ...source3 }]));
    assert.equal(current.sources[0]?.sourceId, "S3");
    assert.equal(current.sources[0]?.citationNumber, 2);

    const legacy = mapRagChatMessage(messageDto([{ ...source1, sourceId: undefined, citationNumber: undefined }]));
    assert.equal(legacy.sources[0]?.sourceId, "S1");
    assert.equal(legacy.sources[0]?.citationNumber, 1);
  });
});

describe("RAG generation race guards", () => {
  it("accepts only the current request for a chat that still exists", () => {
    const request = { chatId: "chat-a", requestId: 4 };
    assert.equal(isRagGenerationCurrent(request, 4, new Set()), true);
    assert.equal(isRagGenerationCurrent(request, 5, new Set()), false);
    assert.equal(isRagGenerationCurrent(request, 4, new Set(["chat-a"])), false);
  });

  it("persists in the originating chat but updates only the visible chat", () => {
    const request = { chatId: "chat-a", requestId: 4 };
    assert.equal(shouldApplyRagGenerationToVisibleChat(request, 4, "chat-a", new Set()), true);
    assert.equal(shouldApplyRagGenerationToVisibleChat(request, 4, "chat-b", new Set()), false);
    assert.equal(shouldApplyRagGenerationToVisibleChat(request, 5, "chat-a", new Set()), false);
  });
});

function source(sourceId: string, citationNumber: number, noteId: string, noteTitle: string): RagMessageSource {
  return {
    archived: false,
    chunkId: `chunk-${noteId}`,
    citationNumber,
    favorite: false,
    headingPath: ["Раздел"],
    matchType: "hybrid",
    neighboringChunkIds: [],
    noteId,
    noteTitle,
    project: "Проект",
    projectId: null,
    semanticScore: 0.9,
    snippet: "Проверяемый фрагмент",
    sourceId,
    tags: ["важно"],
    updatedAt: "2026-09-19T00:00:00Z",
  };
}

function messageDto(sources: unknown[]) {
  return {
    chatId: "chat-a",
    content: "Ответ [[S1]]",
    createdAt: "2026-09-19T00:00:00Z",
    id: "message-a",
    role: "assistant",
    sources,
  };
}
