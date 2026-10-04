import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(path.join(process.env.NOTEFLOW_QA_NODE_MODULES, "qa-runtime.cjs"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const output = path.resolve("releases/phase-e-qa/geometry");
await mkdir(output, { recursive: true });
let cases = 0;
try {
  for (const [width, height] of [[1100, 700], [1440, 900]]) for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: Math.round(width * 100 / zoom), height: Math.round(height * 100 / zoom) }, deviceScaleFactor: zoom / 100 });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/phase-e-fixture.html?theme=${theme}`);
    await page.getByRole("button", { name: "Оглавление", exact: true }).click();
    await page.getByRole("menuitem", { name: "Вложенный раздел", exact: true }).waitFor();
    await page.waitForTimeout(200);
    const outline = await page.locator(".note-outline").boundingBox();
    assert.ok(outline.x >= 0 && outline.x + outline.width <= page.viewportSize().width + 1);
    assert.ok(outline.y >= 0 && outline.y + outline.height <= page.viewportSize().height + 1);
    await page.screenshot({ path: path.join(output, `${width}-${height}-${zoom}-${theme}-toc.png`) });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Экспортировать", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Экспортировать заметку", exact: true });
    await dialog.waitFor(); await page.waitForTimeout(200);
    assert.equal(await dialog.getByRole("radio").count(), 4);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width + 1);
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height + 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.screenshot({ path: path.join(output, `${width}-${height}-${zoom}-${theme}-export.png`) });
    await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
    assert.deepEqual(errors, []);
    cases++;
    await page.close();
  }
  console.log(`Phase E responsive QA: ${cases} cases passed; screenshots: ${output}`);
} finally { await browser.close(); }
