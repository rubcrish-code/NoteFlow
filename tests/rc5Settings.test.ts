import assert from "node:assert/strict";
import { after, afterEach, it } from "node:test";
import { act, createElement as h } from "react";
import { JSDOM } from "jsdom";
import { DEFAULT_LOCAL_PROFILE_NAME } from "../src/shared/localProfile";
import { entityNameLength, validateEntityName } from "../src/shared/entityName";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, MouseEvent: dom.window.MouseEvent, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
const { FirstRunModal } = await import("../src/features/notes/FirstRunModal");
const { AppearanceSettings } = await import("../src/features/settings/SettingsPage");
const { InfoHint } = await import("../src/shared/InfoHint");
const { TooltipPortal } = await import("../src/shared/TooltipPortal");
let root: ReturnType<typeof createRoot> | undefined;
async function mount(element: ReturnType<typeof h>) {
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container); await act(async () => root!.render(element));
}
async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === label || element.dataset.tooltip === label);
  assert.ok(button, label); await act(async () => button.click()); return button;
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); });
after(() => { dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

it("new profile defaults to Пользователь without renaming existing values", () => {
  assert.equal(DEFAULT_LOCAL_PROFILE_NAME, "Пользователь");
});
it("replays all existing onboarding steps without profile creation or a new note", async () => {
  let completed = 0;
  await mount(h(FirstRunModal, { open: true, replay: true, onClose: () => { completed++; }, onCreate: async () => assert.fail("no profile creation") }));
  for (let index = 0; index < 5; index++) await click("Далее");
  assert.equal(document.querySelector('input[autocomplete="name"]'), null);
  await click("Завершить"); assert.equal(completed, 1);
});
it("replayed onboarding can be skipped without any creation", async () => {
  let skipped = 0;
  await mount(h(FirstRunModal, { open: true, replay: true, onClose: () => { skipped++; }, onCreate: async () => assert.fail() }));
  await click("Пропустить"); assert.equal(skipped, 1);
});
it("zoom changes remain draft until Apply and are discarded on leaving", async () => {
  const applied: number[] = [];
  const props = { appZoomPercent: 100, theme: "light" as const, onThemeChange() {}, onToast() {}, onZoomDecrease() { assert.fail(); }, onZoomIncrease() { assert.fail(); }, onZoomReset() { assert.fail(); }, onApplyZoom: (value: number) => { applied.push(value); } };
  await mount(h(AppearanceSettings, props));
  assert.equal((await click("Применить")).disabled, true);
  await click("Увеличить масштаб"); assert.deepEqual(applied, []);
  assert.match(document.body.textContent ?? "", /105%/);
  await click("Применить"); assert.deepEqual(applied, [105]);
  await act(async () => root!.render(h("div")));
  await act(async () => root!.render(h(AppearanceSettings, props)));
  assert.match(document.body.textContent ?? "", /100%/);
});
it("help is focusable information, not a clickable action", async () => {
  await mount(h(InfoHint, { text: "Данные отправляются только после согласия." }));
  const hint = document.querySelector<HTMLElement>(".info-hint")!;
  assert.equal(hint.tabIndex, 0); assert.equal(document.querySelector("button"), null);
  assert.match(hint.dataset.tooltip ?? "", /согласия/);
});
it("help appears on keyboard focus and Escape removes its accessible description", async () => {
  await mount(h("div", null, h(InfoHint, { text: "Обновление индекса не отправляет заметки в облако." }), h(TooltipPortal)));
  const hint = document.querySelector<HTMLElement>(".info-hint")!;
  await act(async () => { hint.focus(); await new Promise((resolve) => setTimeout(resolve, 400)); });
  assert.match(document.querySelector('[role="tooltip"]')?.textContent ?? "", /не отправляет/);
  assert.equal(hint.getAttribute("aria-describedby"), "noteflow-tooltip");
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(document.querySelector('[role="tooltip"]'), null); assert.equal(hint.getAttribute("aria-describedby"), null);
});
it("hover and pointer focus keep informational help visible inside a modal", async () => {
  const { ModalShell } = await import("../src/shared/ModalShell");
  await mount(h("div", null, h(ModalShell, { open: true, title: "Подключение", onClose() {}, children: h("label", null, h("span", { className: "field-label" }, "API-ключ", h(InfoHint, { text: "Ключ хранится в системном хранилище." })), h("input", { "aria-label": "API-ключ" })) }), h(TooltipPortal)));
  const hint = document.querySelector<HTMLElement>(".info-hint")!;
  await act(async () => { hint.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 400)); });
  assert.match(document.querySelector('[role="tooltip"]')?.textContent ?? "", /системном хранилище/);
  await act(async () => { hint.click(); hint.focus(); await new Promise((resolve) => setTimeout(resolve, 400)); });
  assert.ok(document.querySelector('[role="tooltip"]'));
  assert.equal(hint.getAttribute("aria-describedby"), "noteflow-tooltip");
  await act(async () => document.querySelector("input")!.dispatchEvent(new dom.window.MouseEvent("mouseout", { bubbles: true })));
  assert.ok(document.querySelector('[role="tooltip"]'), "unrelated pointer departure cannot dismiss keyboard help");
});
it("entity title validation counts Unicode scalars without cutting emoji", () => {
  assert.equal(entityNameLength("😀".repeat(25)), 25);
  assert.equal(validateEntityName("😀".repeat(25)), "");
  assert.match(validateEntityName("я".repeat(26)), /25 символов/);
});
