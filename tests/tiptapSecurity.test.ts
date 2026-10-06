import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Worker } from "node:worker_threads";
import { mergeAttributes } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { JSDOM } from "jsdom";

const parserProbe = `
  const { parentPort, workerData } = require("node:worker_threads");
  (async () => {
    const core = await import("@tiptap/core");
    const { tsImport } = await import("tsx/esm/api");
    const app = workerData.kind === "application"
      ? await tsImport(workerData.markdownUrl, workerData.parentUrl) : null;
    parentPort.once("message", () => {
      const repeats = app ? 2048 : 8192;
      const block = ":::probe {" + "__QUOTED_0".repeat(repeats) + "__QUOTED_0__} :::\\n";
      const inline = "[probe " + "0".repeat(repeats * 16) + "]";
      const started = performance.now();
      let parsed;
      if (app) {
        const doc = app.markdownToTiptapDoc("# Security probe\\n\\n" + block + "\\n" + inline);
        parsed = doc.type === "doc" && doc.content[0].type === "heading"
          && app.tiptapJsonToPlainText(doc).includes("__QUOTED_0");
      } else {
        const spec = workerData.kind === "block"
          ? core.createAtomBlockMarkdownSpec({ nodeName: "probe" })
          : core.createInlineMarkdownSpec({ nodeName: "probe", selfClosing: true });
        parsed = Boolean(spec.markdownTokenizer.tokenize(
          workerData.kind === "block" ? block : inline, [], {}));
      }
      parentPort.postMessage({ parsed, elapsedMs: performance.now() - started });
    });
    parentPort.postMessage("ready");
  })().catch((error) => { throw error; });
`;

type ProbeKind = "block" | "inline" | "application";

async function boundedParserProbe(kind: ProbeKind): Promise<{ parsed: boolean; elapsedMs: number }> {
  const worker = new Worker(parserProbe, {
    eval: true, execArgv: [],
    workerData: {
      kind, parentUrl: import.meta.url,
      markdownUrl: new URL("../src/features/editor/markdownService.ts", import.meta.url).href,
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise((resolve, reject) => {
      // Termination bounds CPU work even if a future synchronous parser regresses.
      timer = setTimeout(() => reject(new Error("Parser worker startup timed out")), 10_000);
      worker.on("message", (message: unknown) => {
        if (message === "ready") {
          clearTimeout(timer);
          timer = setTimeout(() => reject(new Error(`${kind} parser exceeded 2 seconds`)), 2_000);
          worker.postMessage("parse");
          return;
        }
        if (!message || typeof message !== "object" || !("parsed" in message) || !("elapsedMs" in message)
          || typeof message.parsed !== "boolean" || typeof message.elapsedMs !== "number") {
          reject(new Error("Invalid parser probe result"));
          return;
        }
        resolve({ parsed: message.parsed, elapsedMs: message.elapsedMs });
      });
      worker.once("error", reject);
      worker.once("exit", (code) => reject(new Error(`Parser worker exited before result: ${code}`)));
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

describe("Tiptap dependency security boundary", () => {
  it("pins one patched MIT Tiptap v3 release without nested incompatible copies", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, { version?: string; license?: string }>;
    };
    const tiptap = Object.entries(lock.packages).filter(([path]) => path.includes("node_modules/@tiptap/"));
    assert.ok(tiptap.length > 0);
    const version = lock.packages["node_modules/@tiptap/core"].version!;
    assert.match(version, /^3\.\d+\.\d+$/);
    const [, minor, patch] = version.split(".").map(Number);
    assert.ok(minor > 30 || (minor === 30 && patch >= 5));
    for (const [path, entry] of tiptap) {
      assert.match(path, /^node_modules\/@tiptap\/[^/]+$/, "No nested Tiptap copy");
      assert.equal(entry.version, version, path);
      assert.equal(entry.license, "MIT", path);
      assert.doesNotMatch(path, /collaboration|\/pro-/);
    }
    for (const [name, declared] of Object.entries(pkg.dependencies)) {
      if (name.startsWith("@tiptap/")) assert.equal(declared, version, name);
    }
  });

  it("does not turn a JSON own __proto__ into inherited attacker DOM attributes", () => {
    const input: Record<string, unknown> = JSON.parse(
      '{"__proto__":{"data-security-canary":"present","onerror":"unexpected"},"class":"safe"}',
    );
    assert.ok(Object.hasOwn(input, "__proto__"));
    const prototypeKeys = Object.getOwnPropertyNames(Object.prototype);
    const merged = mergeAttributes({ class: "base" }, input);
    assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    assert.equal(merged["data-security-canary"], undefined);
    assert.equal(merged.onerror, undefined);
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), prototypeKeys);
    assert.equal(Reflect.get(Object.prototype, "data-security-canary"), undefined);
    const dom = new JSDOM("<!doctype html><body></body>");
    try {
      const element = DOMSerializer.renderSpec(dom.window.document, ["img", merged]).dom as HTMLElement;
      assert.equal(element.getAttribute("class"), "base safe");
      assert.equal(element.hasAttribute("data-security-canary"), false);
      assert.equal(element.hasAttribute("onerror"), false);
    } finally {
      dom.window.close();
    }
  });

  it("resolves a single MIT ProseMirror view patched against clipboard-context XSS", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, { version?: string; license?: string }>;
    };
    const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith("node_modules/prosemirror-view"));
    assert.equal(copies.length, 1);
    const [path, entry] = copies[0];
    assert.equal(path, "node_modules/prosemirror-view");
    assert.equal(entry.license, "MIT");
    assert.match(entry.version!, /^1\.\d+\.\d+$/);
    const [, minor, patch] = entry.version!.split(".").map(Number);
    assert.ok(minor > 42 || (minor === 42 && patch >= 3), entry.version);
  });

  for (const kind of ["block", "inline", "application"] as const) {
    it(`bounds adversarial Markdown attribute parsing: ${kind}`, { timeout: 15_000 }, async () => {
      const result = await boundedParserProbe(kind);
      assert.equal(result.parsed, true);
      assert.ok(result.elapsedMs < 1_000, `${kind}: ${result.elapsedMs} ms`);
    });
  }
});
