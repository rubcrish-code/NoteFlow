import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMarkdownLike, markdownToHtml, markdownToTiptapDoc, tiptapJsonToMarkdown } from "../src/features/editor/markdownService.ts";

describe("markdownService.isMarkdownLike", () => {
  it("does not treat ordinary text as Markdown", () => {
    assert.equal(isMarkdownLike("Просто обычная строка заметки без разметки"), false);
  });

  it("does not treat a single dash as Markdown", () => {
    assert.equal(isMarkdownLike("-"), false);
  });

  it("does not treat a bare URL as Markdown", () => {
    assert.equal(isMarkdownLike("https://example.com/page"), false);
  });

  it("detects lists", () => {
    assert.equal(isMarkdownLike("- первый пункт\n- второй пункт"), true);
  });

  it("detects tables", () => {
    assert.equal(isMarkdownLike("| Имя | Статус |\n| --- | --- |\n| NoteFlow | ok |"), true);
  });

  it("detects fenced code blocks", () => {
    assert.equal(isMarkdownLike("```ts\nconst value = 1;\n```"), true);
  });

  it("detects mixed Markdown", () => {
    assert.equal(isMarkdownLike("# Заголовок\n\nТекст с **жирным** и [ссылкой](https://example.com)."), true);
  });

  it("detects highlighted text", () => {
    assert.equal(isMarkdownLike("Текст с ==подсветкой== внутри абзаца"), true);
  });
});

describe("markdownService conversion", () => {
  it("converts plain text to a paragraph document and back", () => {
    const document = markdownToTiptapDoc("Обычный текст");

    assert.equal(document.content?.[0]?.type, "paragraph");
    assert.equal(tiptapJsonToMarkdown(document), "Обычный текст");
  });

  it("converts headings, lists, tables and code blocks to editor JSON", () => {
    const document = markdownToTiptapDoc("# План\n\n- задача\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconsole.log(1)\n```");
    const nodeTypes = document.content?.map((node) => node.type);

    assert.deepEqual(nodeTypes, ["heading", "bulletList", "table", "codeBlock"]);
    assert.equal(document.content?.[0]?.attrs?.level, 1);
  });

  it("serializes editor JSON back to Markdown", () => {
    const markdown = tiptapJsonToMarkdown(markdownToTiptapDoc("## Раздел\n\n- [x] готово\n- [ ] проверить\n\n> цитата"));

    assert.match(markdown, /## Раздел/);
    assert.match(markdown, /- \[x\] готово/);
    assert.match(markdown, /> цитата/);
  });

  it("keeps highlighted inline text round-trippable", () => {
    const markdown = tiptapJsonToMarkdown(markdownToTiptapDoc("Текст с ==подсветкой=="));

    assert.match(markdown, /==подсветкой==/);
  });

  it("produces HTML for a Markdown document", () => {
    const html = markdownToHtml("### Код\n\n`inline` и **bold**");

    assert.match(html, /<h3>Код<\/h3>/);
    assert.match(html, /<code>inline<\/code>/);
    assert.match(html, /<strong>bold<\/strong>/);
  });

  it("round-trips callout and details blocks", () => {
    const markdown = tiptapJsonToMarkdown(markdownToTiptapDoc(":::warning\nБудьте внимательны\n:::\n\n:::details Подробнее\nСкрытый текст\n:::"));

    assert.match(markdown, /:::warning/);
    assert.match(markdown, /Будьте внимательны/);
    assert.match(markdown, /:::details Подробнее/);
    assert.match(markdown, /Скрытый текст/);
  });

  it("serializes inline dates, mentions and formulas", () => {
    const markdown = tiptapJsonToMarkdown(markdownToTiptapDoc("Дата {{date:2026-06-15}}, связь @[[Архитектура проекта]] и формула $a+b$"));

    assert.match(markdown, /\{\{date:2026-06-15\}\}/);
    assert.match(markdown, /@\[\[Архитектура проекта\]\]/);
    assert.match(markdown, /\$a\+b\$/);
  });
});
