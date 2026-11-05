import assert from "node:assert/strict";
import { after, afterEach, it } from "node:test";
import { act, createElement } from "react";
import { JSDOM } from "jsdom";
import type { TagRow } from "../src/app/types";
import { normalizeTagName, validateTagName } from "../src/features/tags/tagEditor";
import { TAG_COLOR_PALETTE, tagColorStyle, getTagDisplayColor, getTagChipColors, findTagPaletteItem } from "../src/features/tags/tagPalette";

const duplicateMessage = "Тег с таким названием уже существует";
const tag: TagRow = { id: "existing", name: "Ёлка Café", color: "green", count: 0 };
it("aligns existing blue tags with brand blue without changing persisted identity", () => {
  for (const customColor of [undefined, "#2563EB", "#3b6ef2", "#3B82F6"]) {
    const stored = { color: "blue" as const, customColor }, before = JSON.stringify(stored);
    assert.equal(getTagDisplayColor(stored), "#60A5FA");
    assert.equal(findTagPaletteItem(stored).id, "blue");
    assert.deepEqual(getTagChipColors(stored), getTagChipColors({ color: "blue", customColor: "#3B82F6" }));
    assert.equal(JSON.stringify(stored), before);
  }
  assert.equal(getTagDisplayColor({ color: "blue", customColor: "#315F97" }), "#315F97");
});
for (const name of [" ёЛКА CAFÉ ", "Е\u0308лка CAFE\u0301", "  Е\u0308лка\t\tCafé  "]) {
  it(`rejects canonical, case and whitespace equivalent tag: ${name}`, () => {
    assert.equal(validateTagName([tag], undefined, name), duplicateMessage);
    assert.equal(validateTagName([tag], tag.id, name), "");
    assert.equal(validateTagName([{ ...tag, name }], undefined, tag.name), duplicateMessage);
  });
}
it("normalizes stored tag spelling to NFC without losing graphemes", () => {
  assert.equal(normalizeTagName(" Е\u0308лка   CAFE\u0301 "), "Ёлка CAFÉ");
  assert.equal(validateTagName([], undefined, "е\u0308".repeat(25)), "");
  assert.match(validateTagName([], undefined, "е\u0308".repeat(26)), /25/);
});
it("allows an unchanged historical long name but not a new over-limit rename", () => {
  const legacy = { ...tag, name: `  ${"я".repeat(40)}  ` };
  assert.equal(validateTagName([legacy], legacy.id, legacy.name), "");
  assert.match(validateTagName([legacy], legacy.id, `${legacy.name}!`), /25/);
});
it("keeps the contrast correction for arbitrary custom colors", () => {
  for (const hex of ["#FFFFFF", "#000000", "#315F97"]) {
    const style = tagColorStyle({ color: "blue", customColor: hex }) as Record<string, string>;
    assert.equal(style["--tag-color"], hex);
    const luminance = (value: string) => {
      const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const prefix of ["--tag-", "--tag-dark-"]) {
      const fg = luminance(style[`${prefix}foreground`]), bg = luminance(style[`${prefix}background`]);
      const ratio = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
      assert.ok(ratio >= 4.5, `${hex} ${prefix}: ${ratio}`);
      if (hex !== "#FFFFFF" && hex !== "#000000") assert.notEqual(style[`${prefix}background`], hex, "chips use a tint, not the full swatch fill");
    }
  }
});

it("preserves every approved light pair exactly and reports the four accepted AA exceptions", () => {
  const expected = [
    ["red", "#F87171", "#5C1111"], ["orange", "#FDBA74", "#71330B"],
    ["yellow", "#FDE68A", "#71500A"], ["lime", "#D9F99D", "#405E10"],
    ["green", "#86EFAC", "#166534"], ["teal", "#5EEAD4", "#115E59"],
    ["blue", "#60A5FA", "#153E85"], ["violet", "#A78BFA", "#4C1D95"],
    ["fuchsia", "#E879F9", "#701A75"], ["pink", "#F472B6", "#831843"],
  ];
  const luminance = (hex: string) => [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const failures: string[] = [];
  assert.equal(TAG_COLOR_PALETTE.length, expected.length);
  for (const [id, background, foreground] of expected) {
    const item = TAG_COLOR_PALETTE.find(item => item.id === id)!;
    const tag = { color: item.color, customColor: item.hex };
    assert.deepEqual(getTagChipColors(tag), { background, foreground });
    for (const dark of [false, true]) {
      const colors = getTagChipColors(tag, dark), a = luminance(colors.background), b = luminance(colors.foreground);
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      if (dark) assert.ok(ratio >= 4.5, `${id} dark: ${ratio}`);
      else if (ratio < 4.5) failures.push(id);
    }
  }
  assert.deepEqual(failures, ["blue", "violet", "fuchsia", "pink"]);
});

it("resolves historical swatches by family without rewriting stored tag identities", () => {
  const aliases = { blue: ["#3B6EF2", "#3B82F6", "#2563EB", "#0EA5E9", "#0284C7", "#0095DD"],
    teal: ["#0F9F8F", "#0B8E82", "#009688"], green: ["#1EA463", "#188F56", "#16A34A"], lime: ["#65A30D"],
    red: ["#C83F45", "#E53935"], yellow: ["#D98A14", "#A97B0E", "#B77900"], orange: ["#EA6A18", "#D15C15", "#EA580C"],
    pink: ["#E05272", "#E0529A", "#D13C91", "#EC4899"], violet: ["#7C5CF0", "#7C3AED"], fuchsia: ["#B520C9"] };
  for (const [id, colors] of Object.entries(aliases)) for (const hex of colors) {
    const stored = { color: "blue" as const, customColor: hex.toLowerCase() }, before = JSON.stringify(stored);
    assert.equal(findTagPaletteItem(stored).id, id);
    assert.equal(JSON.stringify(stored), before);
  }
  for (const hex of ["#64748B", "#315F97"]) assert.equal(findTagPaletteItem({ color: "blue", customColor: hex }).hex, hex);
});

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
const { TagEditorModal } = await import("../src/features/tags/TagEditorModal");
const { EntityNameCounter } = await import("../src/shared/EntityNameCounter");
let root: ReturnType<typeof createRoot> | undefined;
async function input(value: string) {
  const field = document.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  return field;
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); });
after(() => {
  dom.window.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
it("shares one persistent counter/error row without invisible placeholder text", async () => {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(EntityNameCounter, { value: "", id: "qa-feedback" })));
  const counter = document.querySelector(".entity-name-counter")!, feedback = document.querySelector(".entity-name-feedback")!;
  assert.equal(feedback.textContent, ""); assert.equal(feedback.getAttribute("aria-hidden"), "true");
  assert.equal(document.querySelector(".entity-name-count")?.textContent, "0 / 25");
  for (const error of [duplicateMessage, "Проверьте название и повторите попытку. ".repeat(5), ""]) {
    await act(async () => root!.render(createElement(EntityNameCounter, { value: "Тест", error, id: "qa-feedback" })));
    assert.equal(document.querySelector(".entity-name-counter"), counter); assert.equal(document.querySelector(".entity-name-feedback"), feedback);
    assert.equal(feedback.textContent, error); assert.equal(feedback.getAttribute("aria-hidden"), String(!error));
    assert.equal(feedback.getAttribute("role"), error ? "alert" : null);
  }
});
it("shows duplicate errors during typing and clears them without remounting the feedback slot", async () => {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  const submitted: string[] = [];
  await act(async () => root!.render(createElement(TagEditorModal, { mode: "create", open: true, tags: [tag], onClose() {}, onSubmit: async (value) => { submitted.push(value.name); } })));
  const feedback = document.querySelector(".entity-name-feedback")!;
  const button = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  assert.equal(feedback.getAttribute("aria-hidden"), "true");
  const field = await input(" е\u0308ЛКА CAFE\u0301 ");
  assert.equal(feedback.textContent, duplicateMessage);
  assert.equal(field.getAttribute("aria-invalid"), "true");
  assert.equal(field.getAttribute("aria-describedby"), "tag-editor-feedback");
  assert.equal(button.disabled, true);
  await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.deepEqual(submitted, []);
  await input("Уникальный");
  assert.equal(document.querySelector(".entity-name-feedback"), feedback);
  assert.equal(feedback.getAttribute("aria-hidden"), "true");
  assert.equal(field.getAttribute("aria-invalid"), "false");
  assert.equal(button.disabled, false);
  await input("я".repeat(26));
  assert.equal(feedback.textContent, "Максимум 25 символов");
  assert.equal(button.disabled, true);
});

it("submits unchanged legacy names verbatim when editing appearance", async () => {
  const legacy = { ...tag, name: `  ${"я".repeat(40)}  ` };
  const names: string[] = [];
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(TagEditorModal, { mode: "edit", open: true, tag: legacy, tags: [legacy], onClose() {}, onSubmit: async (value) => { names.push(value.name); } })));
  assert.equal(document.querySelector(".entity-name-counter.exceeded"), null);
  assert.equal(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, false);
  await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.deepEqual(names, [legacy.name]);
});

it("keeps a storage duplicate error visible when changing only color", async () => {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(TagEditorModal, { mode: "create", open: true, tags: [], onClose() {}, onSubmit: async () => { throw new Error(duplicateMessage); } })));
  await input("Новое имя");
  await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(document.querySelector(".entity-name-feedback")!.textContent, duplicateMessage);
  await act(async () => document.querySelector<HTMLButtonElement>('[role="radio"]')!.click());
  assert.equal(document.querySelector(".entity-name-feedback")!.textContent, duplicateMessage);
  await input("Другое имя");
  assert.equal(document.querySelector(".entity-name-feedback")!.getAttribute("aria-hidden"), "true");
});

it("preserves stored color fields on rename and saves a new swatch only on explicit selection", async () => {
  const legacy = { ...tag, customColor: "#0B8E82" };
  const values: Array<{ color: string; customColor?: string; name: string }> = [];
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(TagEditorModal, { mode: "edit", open: true, tag: legacy, tags: [legacy], onClose() {}, onSubmit: async value => { values.push(value); } })));
  assert.equal(document.querySelector('[aria-label="Бирюзовый"]')?.getAttribute("aria-checked"), "true");
  await input("Переименованный");
  const submit = () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => { submit(); });
  assert.deepEqual(values[0], { name: "Переименованный", color: legacy.color, customColor: legacy.customColor });
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Лаймовый"]')!.click());
  await act(async () => { submit(); });
  assert.deepEqual(values[1], { name: "Переименованный", color: "green", customColor: "#D9F99D" });
});

it("preserves a symbolic legacy color without introducing a custom HEX on save", async () => {
  const values: Array<{ color: string; customColor?: string }> = [];
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(TagEditorModal, { mode: "edit", open: true, tag, tags: [tag], onClose() {}, onSubmit: async value => { values.push(value); } })));
  await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  assert.equal(values[0].color, tag.color);
  assert.equal(values[0].customColor, undefined);
});
