import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import postcss from "postcss";

const sheets = new Map(["app", "foundation", "editor", "pages", "settings"].map((name) => [name, postcss.parse(readFileSync(`src/styles/${name}.css`, "utf8"))]));
function declarations(sheet: string, selector: string) {
  const values = new Map<string, string>();
  sheets.get(sheet)!.walkRules((rule) => { if (rule.selector.replace(/\r\n/g, "\n") === selector) rule.walkDecls((declaration) => { values.set(declaration.prop, declaration.value); }); });
  assert.ok(values.size > 0, selector); return values;
}
it("RC5 reserves scrollbar space without horizontal overflow or title clipping", () => {
  const scroll = declarations("editor", ".ed-scroll"); assert.equal(scroll.get("scrollbar-gutter"), "stable both-edges"); assert.equal(scroll.get("overflow-x"), "hidden");
  assert.equal(declarations("editor", ".ed-title").get("font-size"), "36px"); assert.equal(declarations("editor", ".ed-title-editable").get("overflow-wrap"), "anywhere");
});
it("RC5 block insertion controls keep compact spacing and only auxiliary controls collapse", () => {
  const item = declarations("editor", ".block-menu-item"); assert.equal(item.get("min-height"), "52px"); assert.equal(item.get("padding"), "var(--space-2)"); assert.equal(item.get("gap"), "var(--space-2)");
  assert.equal(declarations("editor", ".editor-surface-compact :is(.block-menu-inline, .block-callout-variants)").get("grid-template-columns"), "minmax(0, 1fr)");
});
it("RC5 collapsed and expanded navigation share height, margin and brand anchor", () => {
  assert.equal(declarations("pages", ".nav-i").get("min-height"), "var(--control-height-default)");
  assert.equal(declarations("pages", ".collapse-sb .sb").get("--collapsed-rail-control-size"), "var(--control-height-default)");
  assert.equal(declarations("pages", ".nav-i").get("margin-bottom"), declarations("pages", ".collapse-sb .sb .nav-i").get("margin-bottom"));
  assert.equal(declarations("pages", ".collapse-sb .sb nav").get("gap"), "0"); assert.equal(declarations("pages", ".sb-brand").get("min-height"), "56px");
});
it("RC5 menu actions keep icon/text gap and SVG baseline stable while exporting", () => {
  const action = declarations("pages", ".row-actions-menu > button"); assert.equal(action.get("display"), "flex"); assert.equal(action.get("align-items"), "center"); assert.equal(action.get("gap"), "var(--space-2)");
  assert.equal(declarations("pages", ".row-actions-menu > button > svg").get("display"), "block");
});
it("RC5 help affordance is neutral with keyboard focus retained", () => {
  const hint = declarations("foundation", ".info-hint"); assert.equal(hint.get("cursor"), "default"); assert.equal(hint.get("background"), "transparent");
  assert.equal(declarations("foundation", ".info-hint:focus-visible").get("outline"), "2px solid var(--accent)");
});
it("RC5 model descriptions use available width instead of an arbitrary character cap", () => {
  assert.equal(declarations("settings", ".model-section-heading > p").get("max-width"), "none");
});
it("corrective note action SVGs have stable compact dimensions without baseline expansion", () => {
  const icon = declarations("pages", ".row-actions-menu > button > svg");
  assert.equal(icon.get("width"), "18px"); assert.equal(icon.get("height"), "18px"); assert.equal(icon.get("flex"), "0 0 18px");
});
it("corrective block grid uses equal tracks and resets individual card margins", () => {
  assert.equal(declarations("app", ".block-insert-menu").get("width"), "min(560px, calc(100% - 36px))");
  assert.equal(declarations("app", ".block-insert-menu").get("box-sizing"), "border-box");
  assert.equal(declarations("editor", ".block-menu-grid,\n.block-menu-tools").get("grid-auto-rows"), "auto");
  const card = declarations("editor", ".block-menu-item"); assert.equal(card.has("height"), false); assert.equal(card.get("margin"), "0");
});
it("corrective empty states center shared content without hardcoded positioning", () => {
  const empty = declarations("pages", ".page-empty-state"); assert.equal(empty.get("justify-content"), "center"); assert.equal(empty.has("position"), false);
  assert.equal(declarations("pages", ".note-delete-dialog .nf-modal-heading p").get("text-wrap"), "balance");
});
it("corrective tag picker has one calm border and retains accessible wrapper focus", () => {
  assert.equal(declarations("editor", ".ed-tag-search").get("border"), "1px solid var(--border-subtle)");
  assert.equal(declarations("editor", ".ed-tag-search input").get("border"), "0");
  assert.equal(declarations("editor", ".ed-tag-search:focus-within").get("outline"), "2px solid var(--accent)");
});
it("corrective search navigation floats within the writing viewport and does not change highlight fill", () => {
  assert.equal(declarations("editor", ".editor-writing-viewport").get("position"), "relative");
  assert.equal(declarations("editor", ".note-editor-search").get("position"), "absolute");
  assert.equal(declarations("editor", ".note-search-match.current").has("background"), false);
  assert.equal(declarations("editor", ".note-search-match.current").has("font-weight"), false);
});
it("corrective data deletion block has only a section divider, not an outlined card", () => {
  const section = declarations("settings", ".settings-card.bulk-delete-zone");
  assert.equal(section.get("border"), "0"); assert.equal(section.get("border-top"), "1px solid var(--border-subtle)"); assert.equal(section.get("box-shadow"), "none");
});
it("corrective export controls adapt to available width without overlapping their columns", () => {
  assert.equal(declarations("settings", ".export-card").get("grid-template-columns"), "repeat(auto-fit, minmax(min(100%, 280px), 1fr))");
  const button = declarations("settings", ".export-card .export-action");
  assert.equal(button.get("max-width"), "100%"); assert.equal(button.get("white-space"), "normal");
  const query = sheets.get("settings")!.nodes.slice().reverse().find((node) => node.type === "atrule" && node.name === "container");
  assert.ok(query);
});
