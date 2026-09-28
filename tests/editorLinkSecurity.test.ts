import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { handleEditorLinkClick } from "../src/features/editor/editorLinkClick";
import { safeExternalLinkHref } from "../src/shared/safeLinkHref";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
const previousElement = Object.getOwnPropertyDescriptor(globalThis, "Element");
Object.defineProperty(globalThis, "Element", { configurable: true, value: dom.window.Element });

after(() => {
  dom.window.close();
  if (previousElement) Object.defineProperty(globalThis, "Element", previousElement);
  else Reflect.deleteProperty(globalThis, "Element");
});

function clickLink(href: string, options: MouseEventInit) {
  const anchor = dom.window.document.createElement("a");
  anchor.setAttribute("href", href);
  const child = dom.window.document.createElement("span");
  anchor.append(child);
  dom.window.document.body.append(anchor);
  const opened: string[] = [];
  let handled = false;
  anchor.addEventListener("click", (event) => {
    handled = handleEditorLinkClick(event as MouseEvent, (url) => opened.push(url));
  });
  const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...options });
  child.dispatchEvent(event);
  anchor.remove();
  return { handled, opened, defaultPrevented: event.defaultPrevented };
}

describe("editor external links", () => {
  it("opens only safe HTTP(S) links on Ctrl/Cmd+Click while ordinary click remains editable", () => {
    assert.deepEqual(clickLink("https://example.com/page", { ctrlKey: true }).opened, ["https://example.com/page"]);
    assert.deepEqual(clickLink("http://example.com", { metaKey: true }).opened, ["http://example.com/"]);
    assert.equal(clickLink("https://example.com", {}).handled, false);
    assert.equal(clickLink("https://example.com", {}).defaultPrevented, false);
  });

  it("blocks unsafe schemes and URL credentials before opener", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,hello", "file:///C:/secret", "shell:open", "https://user:pass@example.com"]) {
      const result = clickLink(href, { ctrlKey: true });
      assert.deepEqual(result.opened, [], href);
      assert.equal(result.defaultPrevented, true, href);
      assert.equal(safeExternalLinkHref(href), undefined);
    }
  });

  it("scopes the native opener to HTTP(S), not arbitrary paths or schemes", () => {
    const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as {
      permissions: Array<string | { identifier: string; allow: Array<{ url: string }> }>;
    };
    const opener = capability.permissions.find((permission) => typeof permission !== "string" && permission.identifier === "opener:allow-open-url");
    assert.ok(opener && typeof opener !== "string");
    assert.deepEqual(opener.allow.map((entry) => entry.url).sort(), ["http://*", "https://*"]);
    assert.ok(!capability.permissions.includes("opener:default"));
  });
});
