import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import postcss from "postcss";

const tokens = postcss.parse(readFileSync("src/styles/tokens.css", "utf8"));
function token(selector: string, property: string) {
  let value: string | undefined;
  tokens.walkRules(selector, rule => { rule.walkDecls(property, declaration => { value = declaration.value; }); });
  return value;
}

it("shares the language-track surface with neutral buttons in both themes", () => {
  assert.equal(token(":root", "--button-bg"), "var(--asoft2)");
  assert.equal(token(":root", "--button-secondary-bg"), "var(--button-bg)");
  assert.equal(token(":root", "--button-bg-hover"), "color-mix(in srgb, var(--button-bg) 92%, var(--accent))");
  assert.equal(token(":root", "--asoft2"), "#f2f6fd");
  assert.equal(token('[data-theme="dark"]', "--asoft2"), "#1d2531");
  assert.equal(token('[data-theme="dark"]', "--button-bg"), undefined);
});

it("keeps input, primary and destructive color semantics independent of neutral buttons", () => {
  assert.equal(token(":root", "--field-bg"), "#f4f4f4");
  assert.equal(token('[data-theme="dark"]', "--field-bg"), "#242427");
  assert.equal(token(":root", "--button-primary-bg"), "var(--accent)");
  assert.equal(token(":root", "--button-danger-bg"), "color-mix(in srgb, var(--danger-soft) 76%, var(--panel))");
  assert.equal(token(":root", "--button-danger-text"), "var(--danger)");
});
