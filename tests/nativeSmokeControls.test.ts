import assert from "node:assert/strict";
import { it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ResizeHandle } from "../src/shared/ResizeHandle";
import { uiMessage } from "../src/shared/uiMessages";

it("coalesces resize events into one frame, flushes final delta and cancels unmounted work", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let callback: FrameRequestCallback | undefined;
  dom.window.requestAnimationFrame = (cb) => { callback = cb; return 1; };
  dom.window.cancelAnimationFrame = () => { callback = undefined; };
  const root = createRoot(dom.window.document.getElementById("root")!);
  const deltas: number[] = [];
  try {
    await act(async () => root.render(createElement(ResizeHandle, { label: "Resize", onResize: (delta) => deltas.push(delta) })));
    const control = dom.window.document.querySelector("[role=separator]") as HTMLElement;
    control.setPointerCapture = () => {};
    control.hasPointerCapture = () => false;
    async function pointer(type: string, clientX: number) {
      await act(async () => control.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX })));
    }
    await pointer("pointerdown", 100);
    await pointer("pointermove", 101);
    await pointer("pointermove", 110);
    assert.deepEqual(deltas, []);
    await act(async () => callback?.(0));
    assert.deepEqual(deltas, [10]);
    await pointer("pointermove", 115);
    await pointer("pointerup", 115);
    assert.deepEqual(deltas, [10, 5]);
    await pointer("pointerdown", 115);
    await pointer("pointermove", 120);
    await act(async () => root.unmount());
    assert.equal(callback, undefined);
    assert.deepEqual(deltas, [10, 5]);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});

it("localizes the default provider instruction without exposing English wording in Russian", () => {
  assert.match(uiMessage("ru", "noteChatChooseDefaultProvider"), /провайдера ИИ-модели по умолчанию/);
  assert.doesNotMatch(uiMessage("ru", "noteChatChooseDefaultProvider"), /default provider/);
  assert.match(uiMessage("en", "noteChatChooseDefaultProvider"), /default provider/);
});
