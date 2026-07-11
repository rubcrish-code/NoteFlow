import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { EditorContentSidecarInput, NoteContentSidecar } from "../src/app/types.ts";
import {
  EDITOR_NODE_ATTRS_SIDECAR_KIND,
  buildEditorDocumentFromStoredNoteContent,
  extractEditorContentSidecars,
  serializeEditorDocumentForStorage,
} from "../src/features/editor/editorContentSerializer.ts";
import { markdownToTiptapDoc, tiptapJsonToMarkdown, tiptapJsonToPlainText, type EditorDocument, type EditorNode } from "../src/features/editor/markdownService.ts";

function documentFromText(text: string): EditorDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function runtimeSidecar(sidecar: EditorContentSidecarInput): NoteContentSidecar {
  return {
    createdAt: "2026-07-08T00:00:00Z",
    kind: sidecar.kind,
    payloadJson: sidecar.payloadJson,
    schemaVersion: sidecar.schemaVersion,
    updatedAt: "2026-07-08T00:00:00Z",
  };
}

function findNode(document: EditorDocument, type: string): EditorNode | undefined {
  const stack: EditorNode[] = [document];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) {
      continue;
    }
    if (node.type === type) {
      return node;
    }
    stack.push(...(node.content ?? []));
  }
  return undefined;
}

function findNodes(document: EditorDocument, type: string): EditorNode[] {
  const matches: EditorNode[] = [];
  const stack: EditorNode[] = [document];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) {
      continue;
    }
    if (node.type === type) {
      matches.push(node);
    }
    stack.push(...(node.content ?? []));
  }
  return matches;
}

describe("editorContentSerializer Markdown-first load", () => {
  it("keeps fallback diagnostics out of production builds", () => {
    const serializerSource = readFileSync("src/features/editor/editorContentSerializer.ts", "utf8");

    assert.match(serializerSource, /if \(!import\.meta\.env\.DEV\) \{\s*return;/);
    assert.doesNotMatch(serializerSource, /console\.warn\([^\n]*(contentMarkdown|plainText|contentSidecars|payloadJson)/);
  });

  it("builds editorDocument from content_markdown instead of stale content_json", () => {
    const result = buildEditorDocumentFromStoredNoteContent({
      contentJson: documentFromText("OLD JSON TEXT"),
      contentMarkdown: "NEW MARKDOWN TEXT",
      contentSidecars: [],
      plainText: "OLD JSON TEXT",
    });

    assert.equal(result.source, "markdown");
    assert.equal(result.usedFallback, false);
    assert.equal(tiptapJsonToPlainText(result.editorDocument), "NEW MARKDOWN TEXT");
  });

  it("falls back to content_json when content_markdown is empty", () => {
    const result = buildEditorDocumentFromStoredNoteContent({
      contentJson: documentFromText("JSON fallback text"),
      contentMarkdown: "  ",
      contentSidecars: [],
      plainText: "JSON fallback text",
    });

    assert.equal(result.source, "contentJson");
    assert.equal(result.fallbackReason, "empty-markdown");
    assert.equal(tiptapJsonToPlainText(result.editorDocument), "JSON fallback text");
  });

  it("falls back to content_json when Markdown parsing fails without logging note text", () => {
    const warnings: unknown[] = [];
    const result = buildEditorDocumentFromStoredNoteContent(
      {
        contentJson: documentFromText("Safe fallback"),
        contentMarkdown: "SECRET NOTE TEXT",
        contentSidecars: [],
        noteId: "note-1",
        plainText: "Safe fallback",
      },
      {
        markdownParser: () => {
          throw new Error("broken parser");
        },
        warn: (warning) => warnings.push(warning),
      },
    );

    assert.equal(result.source, "contentJson");
    assert.equal(result.fallbackReason, "markdown-parse-failed");
    assert.equal(tiptapJsonToPlainText(result.editorDocument), "Safe fallback");
    assert.doesNotMatch(JSON.stringify(warnings), /SECRET NOTE TEXT/);
  });

  it("uses content_json as data-loss guard when parsed Markdown is empty but old content is not", () => {
    const result = buildEditorDocumentFromStoredNoteContent(
      {
        contentJson: documentFromText("Protected old content"),
        contentMarkdown: "# Source exists",
        contentSidecars: [],
        plainText: "Protected old content",
      },
      {
        markdownParser: () => ({ type: "doc", content: [{ type: "paragraph" }] }),
        warn: () => undefined,
      },
    );

    assert.equal(result.source, "contentJson");
    assert.equal(result.fallbackReason, "empty-parsed-markdown");
    assert.equal(tiptapJsonToPlainText(result.editorDocument), "Protected old content");
  });

  it("does not treat sidecar legacy JSON as a second text source", () => {
    const sidecars: NoteContentSidecar[] = [
      {
        createdAt: "2026-07-08T00:00:00Z",
        kind: "legacy_tiptap_json",
        payloadJson: documentFromText("OLD JSON TEXT"),
        schemaVersion: 1,
        updatedAt: "2026-07-08T00:00:00Z",
      },
    ];

    const result = buildEditorDocumentFromStoredNoteContent({
      contentJson: documentFromText("OLD JSON TEXT"),
      contentMarkdown: "NEW MARKDOWN TEXT",
      contentSidecars: sidecars,
      plainText: "OLD JSON TEXT",
    });

    assert.equal(tiptapJsonToPlainText(result.editorDocument), "NEW MARKDOWN TEXT");
  });

  it("applies image/details sidecar attrs over Markdown without replacing text", () => {
    const richDocument: EditorDocument = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            alt: "Диаграмма",
            alignment: "right",
            attachmentId: "attachment-1",
            height: 240,
            src: "noteflow-image://diagram",
            width: 420,
          },
        },
        {
          type: "detailsBlock",
          attrs: { open: false },
          content: [
            { type: "detailsSummary", content: [{ type: "text", text: "Подробнее" }] },
            { type: "detailsContent", content: [{ type: "paragraph", content: [{ type: "text", text: "Текст" }] }] },
          ],
        },
      ],
    };
    const sidecar = runtimeSidecar(extractEditorContentSidecars(richDocument)[0]);

    const result = buildEditorDocumentFromStoredNoteContent({
      contentJson: documentFromText("OLD JSON TEXT"),
      contentMarkdown: "![Диаграмма](noteflow-image://diagram)\n\n:::details Подробнее\nТекст\n:::",
      contentSidecars: [sidecar],
      plainText: "OLD JSON TEXT",
    });
    const image = findNode(result.editorDocument, "image");
    const detailsBlock = findNode(result.editorDocument, "detailsBlock");

    assert.equal(image?.attrs?.width, 420);
    assert.equal(image?.attrs?.height, 240);
    assert.equal(image?.attrs?.alignment, "right");
    assert.equal(image?.attrs?.attachmentId, "attachment-1");
    assert.equal(detailsBlock?.attrs?.open, false);
    assert.match(tiptapJsonToPlainText(result.editorDocument), /Текст/);
    assert.doesNotMatch(tiptapJsonToPlainText(result.editorDocument), /OLD JSON TEXT/);
  });

  it("applies table cell sidecar attrs over clean Markdown tables", () => {
    const richDocument: EditorDocument = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { emphasizedBorders: true },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", attrs: { backgroundColor: "#fff4d8" }, content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { backgroundColor: "#e8f0ff" }, content: [{ type: "paragraph", content: [{ type: "text", text: "1" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "2" }] }] },
              ],
            },
          ],
        },
      ],
    };
    const sidecar = runtimeSidecar(extractEditorContentSidecars(richDocument)[0]);

    const result = buildEditorDocumentFromStoredNoteContent({
      contentJson: richDocument,
      contentMarkdown: "| A | B |\n| --- | --- |\n| 1 | 2 |",
      contentSidecars: [sidecar],
      plainText: "A B 1 2",
    });

    assert.equal(findNodes(result.editorDocument, "tableHeader")[0]?.attrs?.backgroundColor, "#fff4d8");
    assert.equal(findNodes(result.editorDocument, "tableCell")[0]?.attrs?.backgroundColor, "#e8f0ff");
    assert.equal(findNode(result.editorDocument, "table")?.attrs?.emphasizedBorders, true);
    assert.match(JSON.stringify(sidecar.payloadJson), /emphasizedBorders/);
    assert.doesNotMatch(tiptapJsonToMarkdown(richDocument), /emphasizedBorders|data-table-borders|sidecar/i);
  });

  it("opens notes without sidecar without crashing", () => {
    const result = buildEditorDocumentFromStoredNoteContent({
      contentJson: documentFromText("cache"),
      contentMarkdown: "Только Markdown",
      plainText: "Только Markdown",
    });

    assert.equal(tiptapJsonToPlainText(result.editorDocument), "Только Markdown");
  });
});

describe("editorContentSerializer save flow", () => {
  it("serializes TipTap document to markdown, plain_text, html, json cache and sidecar", () => {
    const editorDocument: EditorDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Акцент",
              marks: [{ type: "fontFormat", attrs: { fontFamily: "Georgia, serif", fontSize: "20px" } }],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            alignment: "center",
            alt: "Схема",
            height: 180,
            src: "noteflow-image://scheme",
            width: 320,
          },
        },
      ],
    };

    const serialized = serializeEditorDocumentForStorage(editorDocument, "<p>cached html</p>");

    assert.equal(serialized.contentHtml, "<p>cached html</p>");
    assert.deepEqual(serialized.editorDocument, editorDocument);
    assert.equal(serialized.plainText, "Акцент");
    assert.match(serialized.contentMarkdown, /Акцент/);
    assert.match(serialized.contentMarkdown, /!\[Схема\]\(noteflow-image:\/\/scheme\)/);
    assert.doesNotMatch(serialized.contentMarkdown, /<span|data-image-width|data-image-align|width=/);
    assert.match(JSON.stringify(serialized.contentSidecars[0]?.payloadJson), /"alignment":"center"/);
    assert.equal(serialized.contentSidecars[0]?.kind, EDITOR_NODE_ATTRS_SIDECAR_KIND);
  });

  it("keeps Markdown paste conversion path formatted", () => {
    const document = markdownToTiptapDoc("# Заголовок\n\n**Жирный текст**\n\n- пункт 1\n- пункт 2");

    assert.deepEqual(document.content?.map((node) => node.type), ["heading", "paragraph", "bulletList"]);
  });
});
