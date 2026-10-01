import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Use a supplied QA runtime; this does not add a production dependency.
const require = createRequire(process.env.NOTEFLOW_QA_NODE_MODULES
  ? path.join(process.env.NOTEFLOW_QA_NODE_MODULES, "qa-runtime.cjs") : import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const baseUrl = process.env.NOTEFLOW_QA_URL ?? "http://127.0.0.1:1420";
const output = process.env.NOTEFLOW_QA_OUTPUT ?? path.join(process.env.TEMP ?? ".", "noteflow-rag-layout-qa");
await mkdir(output, { recursive: true });
const viewports = [[1100, 700, 100], [1100, 700, 160], [1440, 900, 100], [1440, 900, 160], [1920, 1080, 100], [2560, 1440, 100]];
const titles = ["Новый чат", "Архитектура", "Очень длинное название обсуждения архитектуры проекта NoteFlow и RAG"];
let cases = 0;

async function settle(page) {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => document.querySelector(".rag-thread .rag-answer") && !document.querySelector(".rag-chat-empty"));
}
async function open(page, panel) {
  const selector = panel === "history" ? ".rag-conversations" : ".rag-sources-panel";
  if (await page.locator(selector).count()) return;
  await page.getByRole("button", { name: panel === "history" ? "Показать историю чатов" : "Источники ответа", exact: true }).click();
  await settle(page);
}
async function close(page, panel) {
  const selector = panel === "history" ? ".rag-conversations" : ".rag-sources-panel";
  if (!await page.locator(selector).count()) return;
  await page.getByRole("button", { name: panel === "history" ? "Скрыть историю чатов" : "Скрыть источники", exact: true }).click();
  await settle(page);
}
async function geometry(page, label) {
  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const selectors = [".page-shell", ".rag-page", ".rag-main-chat", ".rag-chat-scroll", ".rag-sources-panel", ".rag-source-list", ".rag-conversations", ".rag-history", ".rag-chat-top", ".rag-input"];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      overflow: selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element) => ({ selector, extra: element.scrollWidth - element.clientWidth }))),
      chat: rect(".rag-main-chat"), title: rect(".rag-chat-title b"), input: rect(".chat-composer textarea"),
      header: rect(".rag-chat-top"), composer: rect(".rag-input-wrap"),
      historyList: rect(".rag-panel-overlay .rag-history"), historyItem: rect(".rag-panel-overlay .rag-history-item"),
      drawers: Array.from(document.querySelectorAll(".rag-panel-overlay")).map((element) => {
        const r = element.getBoundingClientRect(); return { y: r.y, bottom: r.bottom };
      }),
      send: rect(".chat-composer-send"), actions: Array.from(document.querySelectorAll(".rag-top-actions button")).map((button) => {
        const r = button.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width };
      }),
      overlays: document.querySelectorAll(".rag-panel-overlay").length,
      mode: document.querySelector(".rag-page-shell").dataset.layout,
      scrollTop: document.querySelector(".rag-chat-scroll").scrollTop,
    };
  });
  assert.ok(result.pageOverflow <= 1, `${label}: document overflow ${JSON.stringify(result)}`);
  for (const entry of result.overflow) assert.ok(entry.extra <= 1, `${label}: ${JSON.stringify(entry)}`);
  assert.ok(result.chat.width >= 440, `${label}: conversation width ${result.chat.width}`);
  assert.ok(result.title.width >= 180, `${label}: title width ${result.title.width}`);
  assert.ok(result.input.width >= 200, `${label}: composer width ${result.input.width}`);
  assert.ok(result.send.right <= result.viewport.width + 1 && result.send.bottom <= result.viewport.height + 1, `${label}: clipped send`);
  for (const action of result.actions) assert.ok(action.x >= 0 && action.right <= result.viewport.width + 1 && action.width >= 24, `${label}: clipped header action`);
  assert.ok(result.overlays <= 1, `${label}: competing drawers`);
  for (const drawer of result.drawers) {
    assert.ok(drawer.y >= result.header.bottom - 1, `${label}: drawer covers header`);
    assert.ok(drawer.bottom <= result.composer.y + 1, `${label}: drawer covers composer`);
  }
  if (result.historyList && result.historyItem) {
    assert.ok(result.historyList.height >= result.historyItem.height, `${label}: history drawer cannot show one row`);
  }
  if (label.startsWith("1920") || label.startsWith("2560")) assert.equal(result.mode, "wide", label);
  cases += 1;
  return result;
}

try {
  for (const [width, height, zoom] of viewports) {
    for (const title of titles) {
      const context = await browser.newContext({ viewport: { width: Math.round(width * 100 / zoom), height: Math.round(height * 100 / zoom) }, deviceScaleFactor: zoom / 100 });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/scripts/qa/rag-layout-fixture.html?zoom=${zoom}&title=${encodeURIComponent(title)}`);
      await settle(page);
      for (const [history, sources] of [[false, false], [true, false], [false, true], [true, true]]) {
        if (!history) await close(page, "history");
        if (!sources) await close(page, "sources");
        if (history) await open(page, "history");
        if (sources) await open(page, "sources");
        const label = `${width}x${height}@${zoom}% H=${history} S=${sources} ${title}`;
        const result = await geometry(page, label);
        if (title === titles[2] && history && sources) {
          await page.screenshot({ path: path.join(output, `rag-${width}-${height}-${zoom}.png`) });
          console.log(`${label}: ${JSON.stringify(result)}`);
        }
      }
      await page.getByRole("button", { name: /^Область поиска:/ }).click();
      await settle(page);
      const bounds = await page.getByRole("dialog", { name: "Проекты для ИИ-поиска" }).boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width + 1);
      await page.getByText("Заметки вне проектов", { exact: true }).waitFor({ state: "visible" });
      await context.close();
    }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/scripts/qa/rag-layout-fixture.html`);
  await settle(page);
  await page.locator(".rag-chat-scroll").evaluate((element) => { element.scrollTop = 200; });
  await page.getByRole("textbox", { name: "Сообщение по всей базе заметок" }).fill("Неотправленный черновик");
  for (const zoom of [100, 125, 160, 100]) {
    await page.setViewportSize({ width: Math.round(1440 * 100 / zoom), height: Math.round(900 * 100 / zoom) });
    await page.evaluate((value) => window.qaRagLayout.setZoom(value), zoom);
    await settle(page);
    await geometry(page, `live zoom ${zoom}`);
    assert.equal(await page.getByRole("textbox", { name: "Сообщение по всей базе заметок" }).inputValue(), "Неотправленный черновик");
    assert.equal(await page.locator(".rag-answer").count(), 12);
    assert.equal(await page.locator(".rag-chat-scroll").evaluate((element) => element.scrollTop), 200);
  }
  await context.close();
  console.log(`PASS: ${cases} rendered geometry checks, 6 source stress variants, selector bounds and live zoom/scroll/draft preservation. Screenshots: ${output}`);
} finally {
  await browser.close();
}
