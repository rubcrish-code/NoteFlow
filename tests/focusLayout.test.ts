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
});
