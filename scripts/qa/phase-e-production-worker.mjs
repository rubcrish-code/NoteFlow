import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const require = createRequire(path.join(process.env.NOTEFLOW_QA_NODE_MODULES, "qa-runtime.cjs"));
const { chromium } = require("playwright");
const dist = path.resolve("dist");
const csp = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8")).app.security.csp;
const server = createServer(async (request, response) => {
  response.setHeader("Content-Security-Policy", csp);
  if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Compiled export worker QA</title>"); return; }
  const file = path.resolve(dist, `.${request.url}`);
  if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader("Content-Type", "text/javascript"); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const workerName = (await readdir(path.join(dist, "assets"))).find(name => /^export\.worker-.*\.js$/.test(name));
  assert.ok(workerName);
  const uri = `noteflow-asset://localhost/${"a".repeat(64)}`;
  const imageBytes = [...await readFile("src-tauri/icons/32x32.png")];
  for (const format of ["txt", "docx", "pdf"]) {
    const bytes = await page.evaluate(async ({ workerName, format, uri, imageBytes }) => {
      const text = value => ({ type: "text", text: value });
      const paragraph = value => ({ type: "paragraph", content: [text(value)] });
      const input = { title: "Проверка экспорта", images: [{ uri, mime: "image/png", bytes: new Uint8Array(imageBytes), width: 0, height: 0 }], document: { type: "doc", content: [
        { type: "heading", attrs: { level: 1 }, content: [text("Документация API")] },
        paragraph("Съешь ещё этих мягких французских булок. Ёжик."),
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Готово")] }, { type: "taskItem", attrs: { checked: false }, content: [paragraph("Задача")] }] },
        { type: "detailsBlock", content: [{ type: "detailsSummary", content: [text("Подробности")] }, { type: "detailsContent", content: [paragraph("Скрытое содержимое")] }] },
        { type: "table", attrs: { emphasizedBorders: true }, content: [0, 1, 2].map(row => ({ type: "tableRow", content: [0, 1].map(col => ({ type: row === 0 ? "tableHeader" : "tableCell", attrs: { backgroundColor: "#eeeeff" }, content: [paragraph(`Ячейка ${row}:${col}`)] })) })) },
        { type: "image", attrs: { src: uri, alt: "Схема" } },
        ...Array.from({ length: 100 }, () => paragraph("Длинная заметка для проверки пагинации.")),
      ] } };
      return new Promise((resolve, reject) => {
        const worker = new Worker(`/assets/${workerName}`, { type: "module" });
        const timer = setTimeout(() => { worker.terminate(); reject(new Error("Worker timeout")); }, 30000);
        worker.onmessage = event => { clearTimeout(timer); worker.terminate(); event.data.bytes ? resolve([...event.data.bytes]) : reject(new Error("Worker failed")); };
        worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
        worker.postMessage({ format, input }, [input.images[0].bytes.buffer]);
      });
    }, { workerName, format, uri, imageBytes });
    assert.ok(bytes.length > 100);
    await writeFile(`releases/phase-e-qa/compiled-worker.${format}`, new Uint8Array(bytes));
    console.log(`${format}: production CSP worker PASS (${bytes.length} bytes)`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
