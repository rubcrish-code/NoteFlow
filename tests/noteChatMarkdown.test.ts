import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNoteChatSourceTitle, sanitizeMarkdownLinkHref } from "../src/features/note-chat/ChatMarkdown.tsx";

describe("note chat Markdown renderer helpers", () => {
  it("normalizes source title fallbacks", () => {
    assert.equal(getNoteChatSourceTitle("Архитектура проекта"), "Архитектура проекта");
    assert.equal(getNoteChatSourceTitle("   "), "Без названия");
    assert.equal(getNoteChatSourceTitle(undefined), "текущая заметка");
  });

  it("allows safe Markdown links and drops scriptable protocols", () => {
    assert.equal(sanitizeMarkdownLinkHref("https://example.com"), "https://example.com");
    assert.equal(sanitizeMarkdownLinkHref("http://localhost:11434"), "http://localhost:11434");
    assert.equal(sanitizeMarkdownLinkHref("mailto:test@example.com"), "mailto:test@example.com");
    assert.equal(sanitizeMarkdownLinkHref("#section"), "#section");
    assert.equal(sanitizeMarkdownLinkHref("//example.com"), undefined);
    assert.equal(sanitizeMarkdownLinkHref("javascript:alert(1)"), undefined);
    assert.equal(sanitizeMarkdownLinkHref("data:text/html,hello"), undefined);
  });
});
