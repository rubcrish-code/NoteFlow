import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(path.join(process.env.NOTEFLOW_QA_NODE_MODULES, "qa-runtime.cjs"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const output = path.join(process.env.TEMP, "noteflow-phase-c-geometry"); await mkdir(output, { recursive: true });
let cases = 0;
try {
  for (const [width, height] of [[1100, 700], [1440, 900]]) for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: Math.round(width * 100 / zoom), height: Math.round(height * 100 / zoom) }, deviceScaleFactor: zoom / 100 });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/phase-c-editor-fixture.html?zoom=${zoom}&theme=${theme}`);
    await page.locator(".tiptap").waitFor();
    const initial = await page.evaluate(() => {
      const editor = document.querySelector(".tiptap");
      return { pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        editorOverflow: editor.scrollWidth - editor.clientWidth,
        prose: Array.from(editor.querySelectorAll("p:not(pre p)")).map((node) => node.scrollWidth - node.clientWidth),
        codeOverflow: editor.querySelector("pre").scrollWidth - editor.querySelector("pre").clientWidth };
    });
    assert.ok(initial.pageOverflow <= 1, JSON.stringify(initial)); assert.ok(initial.editorOverflow <= 1, JSON.stringify(initial));
    assert.ok(initial.prose.every((extra) => extra <= 1), JSON.stringify(initial)); assert.ok(initial.codeOverflow > 0);
    await page.getByRole("button", { name: "Свернуть блок", exact: true }).click();
    assert.equal(await page.locator(".details-content").isVisible(), false);
    await page.getByRole("button", { name: "Развернуть блок", exact: true }).click(); assert.equal(await page.locator(".details-content").isVisible(), true);
    await page.evaluate(() => { const editor = document.querySelector(".tiptap").editor; editor.commands.setTextSelection({ from: 2, to: 6 }); });
    await page.locator(".tiptap h1").click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Форматирование текста", exact: true }); await menu.waitFor();
    const box = await menu.boundingBox(); const viewport = page.viewportSize();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify({ box, viewport }));
    await page.screenshot({ path: path.join(output, `${width}-${height}-${zoom}-${theme}.png`) });
    await page.keyboard.press("Escape"); assert.equal(await menu.count(), 0);
    await page.locator("a").scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    await page.mouse.move(5, 5); await page.locator("a").hover(); await page.getByRole("tooltip").waitFor();
    assert.match(await page.getByRole("tooltip").innerText(), /^https:\/\/example.com\/long-path/);
    const tooltip = await page.getByRole("tooltip").boundingBox();
    assert.ok(tooltip.x >= 0 && tooltip.x + tooltip.width <= viewport.width + 1 && tooltip.y + tooltip.height <= viewport.height + 1);
    assert.deepEqual(errors, []); console.log(`${width}x${height}@${zoom} ${theme}: PASS ${JSON.stringify(initial)}`); cases++; await page.close();
  }
} finally { await browser.close(); }
console.log(`${cases} browser geometry cases passed. Screenshots: ${output}`);
