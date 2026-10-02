import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h, useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class { observe() {} disconnect() {} },
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

// JSDOM cannot measure CSS grid. Apply the real collapse rules to check their
// scope; the separate Playwright regression covers physical grid geometry.
const css = ["src/styles/app.css", "src/styles/pages.css"].map((path) => readFileSync(path, "utf8")).join("\n");
const collapseRules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
  .filter((match) => match[1].includes(".collapse-sb")).map((match) => match[0]).join("\n");
const stylesheet = document.createElement("style"); stylesheet.textContent = collapseRules; document.head.append(stylesheet);
const { SettingsPage } = await import("../src/features/settings/SettingsPage");

after(() => {
  clearMocks(); dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

it("keeps all actual Settings navigation labels visible through five live MainSidebar collapse cycles", async () => {
  mockIPC((command) => {
    if (command === "list_llm_providers" || command === "list_embedding_profiles") return [];
    if (command === "plugin:app|version") return "1.0.0-rc.2";
    if (command === "get_knowledge_index_status") return {
      chunkCount: 0, chunkerVersion: 1, failedNotes: 0, indexedNotes: 0,
      pendingNotes: 0, totalNotes: 0, status: "current",
    };
    throw new Error(`Unexpected test command: ${command}`);
  });
  const noop = () => {};
  const unavailable = async (): Promise<never> => { throw new Error("Not used"); };
  function Fixture() {
    const [collapsed, setCollapsed] = useState(false);
    const props: ComponentProps<typeof SettingsPage> = {
      appZoomPercent: 100, localProfileName: "QA", theme: "light", onNavigate: noop, onNewNote: noop,
      onBackupCreate: async () => null, onBackupPreview: unavailable, onImportBackup: unavailable,
      onImportMarkdown: async () => 0, onExportCurrentNote: noop, onExportCurrentProject: noop,
      onEditLocalProfile: noop, onThemeChange: noop, onToast: noop,
      onZoomDecrease: noop, onZoomIncrease: noop, onZoomReset: noop,
      sidebar: { collapsed, localProfileName: "QA", width: 250, onEditLocalProfile: noop,
        onReset: noop, onResize: noop, onToggleCollapse: () => setCollapsed((value) => !value) },
    };
    return h(SettingsPage, props);
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  function verifyLabels(collapsed: boolean) {
    const settingsLabels = Array.from(container.querySelectorAll(".settings-nav span"));
    assert.equal(settingsLabels.length, 6);
    for (const label of settingsLabels) assert.notEqual(getComputedStyle(label).display, "none", label.textContent ?? "");
    for (const label of container.querySelectorAll(".sb .nav-i span")) {
      assert.equal(getComputedStyle(label).display === "none", collapsed, "Only MainSidebar labels follow collapsed state");
    }
    for (const button of container.querySelectorAll(".settings-nav")) assert.notEqual(getComputedStyle(button).justifyContent, "center");
  }
  try {
    await act(async () => root.render(h(Fixture)));
    verifyLabels(false);
    for (let cycle = 0; cycle < 5; cycle++) {
      await act(async () => container.querySelector<HTMLButtonElement>(".sb .col")!.click());
      verifyLabels(true);
      for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-nav"))) {
        await act(async () => button.click());
        assert.equal(button.getAttribute("aria-current"), "page");
        verifyLabels(true);
      }
      await act(async () => container.querySelector<HTMLButtonElement>(".sb .col")!.click());
      verifyLabels(false);
    }
  } finally { await act(async () => root.unmount()); container.remove(); }
});
