import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Root } from "react-dom/client";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
const { ChatComposer } = await import("../src/shared/ChatComposer");
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container, { onCaughtError() {} });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
after(() => {
  dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("shared chat composer keyboard behavior", () => {
  it("sends with Enter, leaves Shift+Enter alone, and ignores IME composition", async () => {
    let submissions = 0;
    let isSubmitting = false;
    const render = async () => act(async () => root.render(h(ChatComposer, {
      ariaLabel: "Сообщение", placeholder: "Написать", value: "Вопрос", isSubmitting,
      onChange: () => {}, onSubmit: () => { submissions += 1; },
    })));
    const press = async (options: KeyboardEventInit) => {
      const event = new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...options });
      await act(async () => container.querySelector("textarea")!.dispatchEvent(event));
      return event;
    };
    await render();
    assert.equal((await press({ shiftKey: true })).defaultPrevented, false);
    assert.equal((await press({ isComposing: true })).defaultPrevented, false);
    assert.equal(submissions, 0);
    assert.equal((await press({})).defaultPrevented, true);
    assert.equal(submissions, 1);
    isSubmitting = true;
    await render();
    assert.equal(container.querySelector<HTMLButtonElement>(".chat-composer-send")!.disabled, true);
    await press({});
    assert.equal(submissions, 1);
    isSubmitting = false;
    await render();
    await press({});
    assert.equal(submissions, 2);
  });
});
