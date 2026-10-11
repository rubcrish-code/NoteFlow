import assert from "node:assert/strict";
import { after, afterEach, beforeEach, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { act, createElement as h, useEffect } from "react";
import type { Root } from "react-dom/client";
import { SidebarPanel, SIDEBAR_TRANSITION_MS } from "../src/shared/SidebarPanel";
import { MainSidebar } from "../src/features/navigation/MainSidebar";
import { ResizeHandle } from "../src/shared/ResizeHandle";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
const saved = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
let root: Root;
let container: HTMLDivElement;
let mounts = 0;
let reduced = false;
const changes = new Set<() => void>();
Object.defineProperty(window, "matchMedia", { value: () => ({ get matches() { return reduced; }, addEventListener: (_: string, fn: () => void) => changes.add(fn), removeEventListener: (_: string, fn: () => void) => changes.delete(fn) }) });
function Content() { useEffect(() => { mounts++; }, []); return h("textarea", { defaultValue: "Черновик 🙂" }); }
async function render(open: boolean) {
  await act(async () => root.render(h("div", null, h("button", { "data-panel-focus-return": true }, "Открыть"), h(SidebarPanel, { className: "test-panel", open, children: h(Content) }))));
}
beforeEach(() => { mounts = 0; reduced = false; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); assert.equal(changes.size, 0); });
after(() => { dom.window.close(); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

it("does not mount a closed panel and mounts its content only once on opening", async () => {
  await render(false); assert.equal(mounts, 0); assert.equal(container.querySelector(".test-panel")?.hasAttribute("hidden"), true);
  await render(true); assert.equal(mounts, 1); assert.equal(container.querySelector(".test-panel")?.hasAttribute("inert"), false);
});
it("retains closing content for 240 ms but removes it from keyboard navigation and restores focus", async () => {
  await render(true); container.querySelector("textarea")!.focus();
  await render(false);
  assert.ok(container.querySelector("textarea"));
  assert.equal(container.querySelector(".test-panel")?.getAttribute("aria-hidden"), "true");
  assert.equal(container.querySelector(".test-panel")?.hasAttribute("inert"), true);
  assert.equal(document.activeElement, container.querySelector("button"));
  await act(async () => { await delay(SIDEBAR_TRANSITION_MS + 40); });
  assert.equal(Boolean(container.querySelector("textarea")), false);
  assert.equal(container.querySelector(".test-panel")?.hasAttribute("hidden"), true);
});
it("rapid reopen cancels removal without remounting or changing an unsent draft", async () => {
  await render(true); const input = container.querySelector("textarea")!; input.value = "Новый черновик\n🙂";
  for (let index = 0; index < 4; index++) { await render(false); await render(true); }
  await act(async () => { await delay(SIDEBAR_TRANSITION_MS + 40); });
  assert.ok(container.querySelector("textarea") === input); assert.equal(input.value, "Новый черновик\n🙂"); assert.equal(mounts, 1);
  assert.equal(container.querySelector(".test-panel")?.getAttribute("aria-hidden"), "false");
});
it("reduced motion hides immediately, including an OS preference change during closing", async () => {
  reduced = true; await render(true); await render(false); assert.equal(Boolean(container.querySelector("textarea")), false);
  reduced = false; await render(true); await render(false); assert.ok(container.querySelector("textarea"));
  await act(async () => { reduced = true; for (const fn of changes) fn(); });
  assert.equal(Boolean(container.querySelector("textarea")), false);
});

it("shares the same icon and label structure for New Note and navigation without remounting controls", async () => {
  const props = { activeSection: "notes" as const, localProfileName: "QA", onEditLocalProfile() {}, onNavigate() {}, onNewNote() {}, onToggleCollapse() {}, onToast() {} };
  await act(async () => root.render(h(MainSidebar, props)));
  const controls = [...container.querySelectorAll<HTMLButtonElement>(".sidebar-action")];
  assert.equal(controls.length, 7);
  for (const control of controls) {
    assert.ok(control.querySelector(":scope > svg"));
    assert.equal(control.querySelector(":scope > .sidebar-action-label")?.textContent, control.getAttribute("aria-label"));
  }
  await act(async () => root.render(h(MainSidebar, { ...props, collapsed: true })));
  assert.ok(controls.every((control, index) => control === container.querySelectorAll(".sidebar-action")[index]));
  assert.equal(container.querySelector(".col")?.getAttribute("aria-expanded"), "false");
});

it("lost pointer capture ends resize mode and stops subsequent uncaptured deltas", async () => {
  const deltas: number[] = [];
  await act(async () => root.render(h(ResizeHandle, { label: "QA width", onResize: (delta) => deltas.push(delta) })));
  const handle = container.querySelector<HTMLElement>(".resize-handle")!;
  handle.setPointerCapture = () => undefined;
  function pointer(type: string, clientX: number) {
    const event = new dom.window.MouseEvent(type, { bubbles: true, clientX });
    Object.defineProperty(event, "pointerId", { value: 1 });
    handle.dispatchEvent(event);
  }
  await act(async () => pointer("pointerdown", 100));
  assert.equal(handle.classList.contains("dragging"), true);
  await act(async () => pointer("pointermove", 120));
  assert.deepEqual(deltas, [20]);
  await act(async () => pointer("lostpointercapture", 120));
  assert.equal(handle.classList.contains("dragging"), false);
  await act(async () => pointer("pointermove", 160));
  assert.deepEqual(deltas, [20]);
});

it("pointercancel releases capture and prevents a late pointer move from resizing", async () => {
  const deltas: number[] = [];
  await act(async () => root.render(h(ResizeHandle, { label: "QA width", onResize: (delta) => deltas.push(delta) })));
  const handle = container.querySelector<HTMLElement>(".resize-handle")!;
  let captured = false;
  handle.setPointerCapture = () => { captured = true; };
  handle.hasPointerCapture = () => captured;
  handle.releasePointerCapture = () => { captured = false; };
  function pointer(type: string, clientX: number) {
    const event = new dom.window.MouseEvent(type, { bubbles: true, clientX });
    Object.defineProperty(event, "pointerId", { value: 1 });
    handle.dispatchEvent(event);
  }
  await act(async () => pointer("pointerdown", 100));
  await act(async () => pointer("pointermove", 150));
  await act(async () => pointer("pointercancel", 150));
  assert.equal(captured, false); assert.equal(handle.classList.contains("dragging"), false);
  await act(async () => pointer("pointermove", 200)); assert.deepEqual(deltas, [50]);
});

it("New Note and navigation retain their original actions and accessible names across resize-state renders", async () => {
  let created = 0;
  const navigated: string[] = [];
  const props = { activeSection: "notes" as const, localProfileName: "QA", onEditLocalProfile() {}, onNavigate: (section: string) => navigated.push(section), onNewNote: () => { created++; }, onToggleCollapse() {}, onToast() {} };
  for (const collapsed of [false, true, false, true]) {
    await act(async () => root.render(h(MainSidebar, { ...props, collapsed })));
    const button = container.querySelector<HTMLButtonElement>(".new-btn")!;
    assert.equal(button.getAttribute("aria-label"), "Новая заметка");
    await act(async () => button.click());
    for (const item of container.querySelectorAll<HTMLButtonElement>(".nav-i")) await act(async () => item.click());
  }
  assert.equal(created, 4);
  assert.deepEqual(navigated, Array.from({ length: 4 }, () => ["notes", "projects", "rag", "tags", "archive", "settings"]).flat());
});
