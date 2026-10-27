import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { act, createElement as h, useState } from "react";
import type { Root } from "react-dom/client";
import type { ProjectCard } from "../src/app/types";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
  Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent,
  MutationObserver: dom.window.MutationObserver, ResizeObserver: class { observe() {} disconnect() {} },
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
const { ProjectScopeSelector } = await import("../src/features/rag/ProjectScopeSelector");
const { FirstRunModal } = await import("../src/features/notes/FirstRunModal");
const { TooltipPortal, TOOLTIP_DELAY_MS } = await import("../src/shared/TooltipPortal");
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(() => {
  dom.window.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});

const projects = [
  { id: "a", title: "ALPHA", archivedAt: null }, { id: "b", title: "BETA", archivedAt: null },
  { id: "archived", title: "ARCHIVED", archivedAt: "2026-09-30" },
] as ProjectCard[];
function btn(text: string) { return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.trim() === text)!; }
async function click(element: HTMLElement) { await act(async () => element.click()); }
function checkbox(title: string) { return Array.from(document.querySelectorAll("label")).find((item) => item.textContent === title)!.querySelector<HTMLInputElement>("input")!; }

describe("Phase B project selector", () => {
  it("checks ALL including standalone and persists each independent part without silently broadening", async () => {
    const saved: { ids: string[] | null; standalone: boolean }[] = [];
    function Harness() {
      const [ids, setIds] = useState<string[] | null>(null);
      const [standalone, setStandalone] = useState(false);
      return h(ProjectScopeSelector, { projects, selectedIds: ids, includeStandalone: standalone, busy: false, onChange: async (next, flag) => { saved.push({ ids: next, standalone: flag }); setIds(next); setStandalone(flag); } });
    }
    await act(async () => root.render(h(Harness)));
assert.equal(btn("Все заметки").getAttribute("aria-label"), "Область поиска: Все заметки");
    await click(btn("Все заметки"));
    assert.equal(document.querySelector('[role="dialog"]')?.parentElement, document.body);
    assert.doesNotMatch(document.querySelector('[role="dialog"]')!.textContent!, /ARCHIVED/);
    assert.equal(checkbox("ALPHA").checked, true);
    assert.equal(checkbox("BETA").checked, true);
    assert.equal(checkbox("Заметки вне проектов").checked, true);
    await click(checkbox("Заметки вне проектов"));
    assert.equal(checkbox("Заметки вне проектов").checked, false);
    await click(checkbox("BETA"));
    assert.match(container.textContent!, /ALPHA/);
    await click(checkbox("Заметки вне проектов"));
    await click(checkbox("BETA"));
    assert.match(container.textContent!, /2 проекта/);
    assert.equal(btn("Все заметки").getAttribute("aria-pressed"), "false", "an explicit snapshot does not include future projects");
    await click(btn("Все заметки"));
    assert.deepEqual(saved, [{ ids: ["a", "b"], standalone: false }, { ids: ["a"], standalone: false }, { ids: ["a"], standalone: true }, { ids: ["a", "b"], standalone: true }, { ids: null, standalone: true }]);
    assert.equal(checkbox("ALPHA").checked, true);
    assert.equal(checkbox("BETA").checked, true);
  });
  it("automatically checks a newly created project in ALL and excludes archived/deleted rows", async () => {
    const render = async (items: ProjectCard[]) => act(async () => root.render(h(ProjectScopeSelector, { projects: items, selectedIds: null, busy: false, onChange: async () => {} })));
    await render(projects);
    await click(btn("Все заметки"));
    const gamma = { ...projects[0], id: "c", title: "GAMMA" };
    await render([...projects, gamma]);
    assert.equal(checkbox("GAMMA").checked, true);
    await render([{ ...projects[0], archivedAt: "2026-10-01" }, gamma]);
    assert.doesNotMatch(document.querySelector('[role="dialog"]')!.textContent!, /ALPHA|BETA/);
    assert.equal(checkbox("GAMMA").checked, true);
  });
  it("keeps an empty explicit scope distinct from a valid ALL scope with no projects", async () => {
    await act(async () => root.render(h(ProjectScopeSelector, { projects: [], selectedIds: [], busy: false, onChange: async () => {} })));
    await click(btn("Выберите область поиска"));
    assert.equal(btn("Все заметки").getAttribute("aria-pressed"), "false");
    assert.match(document.body.textContent!, /Выберите хотя бы один проект или заметки вне проектов/);
    assert.match(document.body.textContent!, /Активных проектов пока нет/);
    await act(async () => root.render(h(ProjectScopeSelector, { projects: [], selectedIds: null, busy: false, onChange: async () => {} })));
    assert.equal(document.querySelector('.rag-project-popover button[aria-pressed]')?.getAttribute("aria-pressed"), "true");
    assert.equal(checkbox("Заметки вне проектов").checked, true);
  });
  it("unchecking a project from ALL retains standalone and restored mixed scope checks only its rows", async () => {
    let saved: unknown;
    await act(async () => root.render(h(ProjectScopeSelector, { projects, selectedIds: null, busy: false, onChange: async (ids, flag) => { saved = { ids, flag }; } })));
    await click(btn("Все заметки"));
    await click(checkbox("BETA"));
    assert.deepEqual(saved, { ids: ["a"], flag: true });
    await act(async () => root.render(h(ProjectScopeSelector, { projects, selectedIds: ["a"], includeStandalone: true, busy: false, onChange: async () => {} })));
    assert.equal(checkbox("ALPHA").checked, true);
    assert.equal(checkbox("BETA").checked, false);
    assert.equal(checkbox("Заметки вне проектов").checked, true);
  });
  it("supports standalone-only even when no project or standalone note exists yet", async () => {
    let saved: unknown;
    await act(async () => root.render(h(ProjectScopeSelector, { projects: [], selectedIds: null, busy: false, onChange: async (ids, flag) => { saved = { ids, flag }; } })));
    await click(btn("Все заметки"));
    await click(checkbox("Заметки вне проектов"));
    assert.deepEqual(saved, { ids: [], flag: false });
    await act(async () => root.render(h(ProjectScopeSelector, { projects: [], selectedIds: [], includeStandalone: false, busy: false, onChange: async (ids, flag) => { saved = { ids, flag }; } })));
    await click(checkbox("Заметки вне проектов"));
    assert.deepEqual(saved, { ids: [], flag: true });
    assert.equal(checkbox("Заметки вне проектов").disabled, false);
  });
  it("keeps persisted missing projects explicit instead of silently expanding to all", async () => {
    await act(async () => root.render(h(ProjectScopeSelector, { projects, selectedIds: ["missing"], busy: false, onChange: async () => {} })));
    await click(btn("Недоступный проект"));
    assert.match(document.body.textContent!, /не участвуют в поиске/);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, btn("Недоступный проект"));
  });
  it("shows a safe save error and retains the previous selection", async () => {
    await act(async () => root.render(h(ProjectScopeSelector, { projects, selectedIds: ["a"], busy: false, onChange: async () => { throw new Error("SQL secret /private/profile"); } })));
    await click(btn("ALPHA"));
    await click(checkbox("BETA"));
    assert.equal(document.querySelector('[role="alert"]')!.textContent, "Не удалось применить фильтр проектов.");
    assert.equal(checkbox("ALPHA").checked, true);
    assert.equal(checkbox("BETA").checked, false);
  });
  it("disables scope writes during persistence", async () => {
    let calls = 0;
    await act(async () => root.render(h(ProjectScopeSelector, { projects, selectedIds: null, busy: true, onChange: async () => { calls++; } })));
    await click(btn("Все заметки"));
    assert.equal(checkbox("ALPHA").disabled, true);
    await click(checkbox("ALPHA"));
    assert.equal(calls, 0);
    assert.match(document.querySelector('[role="status"]')!.textContent!, /Сохраняем/);
  });
});

describe("Phase B unified first-run introduction", () => {
  it("has six short steps, preserves Back, and creates the first note only after training", async () => {
    const created: string[] = [];
    await act(async () => root.render(h(FirstRunModal, { open: true, needsProfileName: false, initialName: "QA", onClose: async () => {}, onCreate: async (name) => { created.push(name); } })));
    await click(btn("Далее"));
    assert.match(document.body.textContent!, /Создавайте заметки/);
    await click(btn("Назад"));
    assert.match(document.body.textContent!, /Добро пожаловать/);
    for (let index = 0; index < 5; index++) await click(btn("Далее"));
    assert.match(document.body.textContent!, /согласие/);
    assert.deepEqual(created, []);
    assert.equal(document.querySelector('[role="alert"]'), null, "Next must not submit the newly mounted final form");
    assert.equal(document.querySelector('input[autocomplete="name"]'), null, "persisted profile does not ask for a second name");
    await click(btn("Создать первую заметку"));
    assert.deepEqual(created, ["QA"]);
  });
  it("replay skip calls the completion handler without creating a note", async () => {
    let skipped = 0;
    let created = 0;
    await act(async () => root.render(h(FirstRunModal, { open: true, replay: true, onClose: async () => { skipped++; }, onCreate: async () => { created++; } })));
    await click(btn("Пропустить"));
    assert.equal(skipped, 1);
    assert.equal(created, 0);
  });
  it("keeps the flow open and explains a skip persistence failure", async () => {
    await act(async () => root.render(h(FirstRunModal, { open: true, replay: true, onClose: async () => { throw new Error("private data"); }, onCreate: async () => {} })));
    await click(btn("Пропустить"));
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Не удалось завершить/);
    assert.equal(btn("Пропустить").disabled, false);
  });
});

describe("Phase B shared delayed tooltip", () => {
  async function renderTip() {
    await act(async () => root.render(h("div", null,
      h("button", { "data-tooltip": "Закрепить заметку", "aria-label": "Закрепить заметку", "aria-describedby": "help" }, "Pin"),
      h(TooltipPortal))));
    return btn("Pin");
  }
  it("opens on keyboard focus after a delay, links the portal and restores descriptions on Escape", async () => {
    const trigger = await renderTip();
    await act(async () => trigger.focus());
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    await act(async () => delay(TOOLTIP_DELAY_MS + 40));
    assert.equal(document.querySelector('[role="tooltip"]')!.textContent, "Закрепить заметку");
    assert.equal(document.querySelector('[role="tooltip"]')!.parentElement, document.body);
    assert.equal(trigger.getAttribute("aria-describedby"), "help noteflow-tooltip");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    assert.equal(trigger.getAttribute("aria-describedby"), "help");
  });
  it("cancels pending hover on pointer exit and click, without blocking the action", async () => {
    const trigger = await renderTip();
    await act(async () => trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    await act(async () => trigger.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })));
    await act(async () => delay(TOOLTIP_DELAY_MS + 40));
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    await act(async () => trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    await click(trigger);
    await act(async () => delay(TOOLTIP_DELAY_MS + 40));
    assert.equal(document.querySelector('[role="tooltip"]'), null);
  });
});
