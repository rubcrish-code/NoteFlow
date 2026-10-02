import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInlineDate } from "../src/features/editor/customExtensions.ts";
import { markdownToTiptapDoc, tiptapJsonToMarkdown } from "../src/features/editor/markdownService.ts";

describe("inline dates and ordinary dollar text", () => {
  it("localizes calendar dates without changing their stored value", () => {
    assert.equal(formatInlineDate("2026-07-13"), "13.07.2026");
    assert.equal(formatInlineDate(""), "Дата");
    const document = markdownToTiptapDoc("Дата {{date:2026-07-13}}.");
    assert.equal(document.content?.[0].content?.[1].attrs?.value, "2026-07-13");
    assert.equal(tiptapJsonToMarkdown(document), "Дата {{date:2026-07-13}}.");
  });
  it("treats former math syntax and prices as ordinary text", () => {
    const text = "Цена $100, пример $x$ и $$ без специальных узлов";
    const document = markdownToTiptapDoc(text);
    assert.ok(document.content?.[0].content?.every((node) => node.type === "text"));
    assert.equal(tiptapJsonToMarkdown(document), text);
  });
});
