import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatInlineDate } from "../src/features/editor/customExtensions.ts";
import { markdownToTiptapDoc, tiptapJsonToMarkdown } from "../src/features/editor/markdownService.ts";

const extensionsSource = readFileSync(new URL("../src/features/editor/customExtensions.ts", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("../src/features/editor/BlockInsertMenu.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../src/features/editor/EditorArea.tsx", import.meta.url), "utf8");

describe("inline formula and date editor nodes", () => {
  it("renders formula and date labels from node attrs instead of transformed HTML attrs", () => {
    assert.match(extensionsSource, /renderHTML\(\{ node, HTMLAttributes \}\)[\s\S]*node\.attrs\.value/);
    assert.match(extensionsSource, /formula-inline[\s\S]*node\.attrs\.latex/);
    assert.match(extensionsSource, /formula-block[\s\S]*node\.attrs\.latex/);
    assert.doesNotMatch(extensionsSource, /String\(HTMLAttributes\.(?:value|latex)/);
  });

  it("keeps a text cursor after inline atoms and an editable paragraph after block formulas", () => {
    assert.match(extensionsSource, /insertInlineDate:[\s\S]*type: "text", text: " "/);
    assert.match(extensionsSource, /insertFormulaInline:[\s\S]*type: "text", text: " "/);
    assert.match(extensionsSource, /insertFormulaBlock:[\s\S]*type: "paragraph"/);
    assert.match(extensionsSource, /tr\.setSelection\(TextSelection\.create\(tr\.doc, paragraphPosition \+ 1\)\)/);
    assert.match(menuSource, /setTextSelection\(Math\.min\(editTarget\.position \+ 1/);
    assert.match(menuSource, /editTarget\.position \+ \(isBlockTarget \? 2 : 1\)/);
  });

  it("passes non-empty drafts to typed editor commands and keeps forms open on failure", () => {
    assert.match(menuSource, /insertInlineDate\(\{ value \}\)/);
    assert.match(menuSource, /insertFormulaInline\(\{ latex \}\)/);
    assert.match(menuSource, /insertFormulaBlock\(\{ latex \}\)/);
    assert.match(menuSource, /disabled=\{!dateDraft\.trim\(\)\}/);
    assert.match(menuSource, /disabled=\{!formulaDraft\.trim\(\)\}/);
    assert.match(menuSource, /if \(didRun\) \{\s*onClose\(\);\s*\} else \{\s*setInsertError/);
  });

  it("restores the editor selection and reopens existing atoms for editing", () => {
    assert.match(menuSource, /restoreInsertionSelection/);
    assert.match(menuSource, /setTextSelection\(\{[\s\S]*from: Math\.min\(selection\.from/);
    assert.match(editorSource, /node\.type\.name === "inlineDate"/);
    assert.match(editorSource, /node\.type\.name === "formulaInline" \|\| node\.type\.name === "formulaBlock"/);
    assert.match(menuSource, /updateAttributes\("inlineDate", \{ value \}\)/);
    assert.match(menuSource, /updateAttributes\(isBlockTarget \? "formulaBlock" : "formulaInline", \{ latex \}\)/);
  });

  it("localizes ISO dates for the Russian UI", () => {
    assert.match(formatInlineDate("2026-07-13"), /13 июля 2026/);
    assert.equal(formatInlineDate(""), "Дата");
  });

  it("round-trips inline dates and both formula forms through canonical Markdown", () => {
    const markdown = "Текст {{date:2026-07-13}} и $a^2 + b^2 = c^2$.\n\n$$\nE = mc^2\n$$";
    const document = markdownToTiptapDoc(markdown);
    const exported = tiptapJsonToMarkdown(document);

    assert.match(exported, /\{\{date:2026-07-13\}\}/);
    assert.match(exported, /\$a\^2 \+ b\^2 = c\^2\$/);
    assert.match(exported, /\$\$\nE = mc\^2\n\$\$/);
  });
});
