import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { invoke, PublicCommandError } from "../src/services/safeInvoke";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });

afterEach(() => clearMocks());

describe("safe Tauri error boundary", () => {
  it("preserves a typed public code and safe retry message", async () => {
    mockIPC(() => { throw { code: "PROVIDER_TIMEOUT", message: "Модель не ответила вовремя.", retryable: true }; });
    await assert.rejects(invoke("test_llm_provider"), (error: unknown) => {
      assert.ok(error instanceof PublicCommandError);
      assert.equal(error.code, "PROVIDER_TIMEOUT");
      assert.equal(error.retryable, true);
      assert.equal(error.message, "Модель не ответила вовремя.");
      return true;
    });
  });

  it("never displays an unexpected raw path or credential in an IPC failure", async () => {
    mockIPC(() => { throw "SQLite error at C:\\Users\\name\\database.sqlite; Bearer sk-private"; });
    await assert.rejects(invoke("load_workspace"), (error: unknown) => {
      assert.ok(error instanceof PublicCommandError);
      assert.equal(error.code, "IPC_FAILED");
      assert.doesNotMatch(error.message, /SQLite|Bearer|sk-private|Users/);
      return true;
    });
  });
});

describe("production WebView policy", () => {
  it("disables executable remote content while allowing managed assets and IPC", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as { app: { security: { csp: string } } };
    const csp = config.app.security.csp;
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'self' ipc: http:\/\/ipc\.localhost/);
    assert.match(csp, /noteflow-asset:/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /connect-src \*|script-src[^;]*'unsafe-inline'/);
  });
});
