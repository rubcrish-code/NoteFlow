import assert from "node:assert/strict";
import { test } from "node:test";
import baseConfig from "../vite.config";

async function developmentConfig() {
  return typeof baseConfig === "function"
    ? await baseConfig({ command: "serve", mode: "development" })
    : await baseConfig;
}

test("Vite cold discovery uses only source HTML, not generated archives or native build assets", async () => {
  const config = await developmentConfig();
  assert.deepEqual(config.optimizeDeps?.entries, ["index.html", "scripts/qa/*.html"]);
});

test("Vite does not watch generated QA output, browser profiles or Rust targets", async () => {
  const config = await developmentConfig();
  assert.deepEqual(config.server?.watch && config.server.watch.ignored, ["**/src-tauri/**", "**/releases/**"]);
});
