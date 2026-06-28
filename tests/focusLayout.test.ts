import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync("src/styles/app.css", "utf8");

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "m").exec(css);
  return match?.[1] ?? "";
}

describe("focus mode layout contract", () => {
  it("keeps the focus exit button in normal flow, not over the toolbar", () => {
    const focusStripRule = cssRule(".focus-strip");
    const focusExitRule = cssRule(".focus-exit");

    assert.doesNotMatch(focusStripRule, /position\s*:\s*(absolute|fixed)/);
    assert.doesNotMatch(focusExitRule, /position\s*:\s*(absolute|fixed)/);
    assert.match(focusExitRule, /position\s*:\s*static/);
  });

  it("keeps note content inside a resizable page wrapper", () => {
    const editorScrollRule = cssRule(".ed-scroll");
    const editorPageFrameRule = cssRule(".ed-page-frame");
    const editorInnerRule = cssRule(".ed-inner");
    const chatOpenEditorScrollRule = cssRule(".chat-open .ed-scroll");
    const focusEditorScrollRule = cssRule(".focus .ed-scroll");

    assert.match(editorScrollRule, /--editor-page-gutter\s*:\s*clamp\(20px,\s*4vw,\s*56px\)/);
    assert.match(editorScrollRule, /justify-content\s*:\s*center/);
    assert.match(editorScrollRule, /padding\s*:\s*30px\s+var\(--editor-page-gutter\)\s+80px/);
    assert.match(editorPageFrameRule, /width\s*:\s*var\(--editor-page-width,\s*840px\)/);
    assert.match(editorPageFrameRule, /transform\s*:\s*translateX\(var\(--editor-page-offset,\s*0px\)\)/);
    assert.doesNotMatch(editorInnerRule, /margin\s*:\s*0\s+auto/);
    assert.match(editorInnerRule, /width\s*:\s*100%/);
    assert.match(chatOpenEditorScrollRule, /--editor-page-gutter\s*:\s*clamp\(18px,\s*3vw,\s*40px\)/);
    assert.match(focusEditorScrollRule, /--editor-page-gutter\s*:\s*clamp\(20px,\s*4vw,\s*80px\)/);
  });
});
