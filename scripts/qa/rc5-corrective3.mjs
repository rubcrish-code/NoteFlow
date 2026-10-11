import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const results = [];
const output = "releases/qa/rc5-corrective3-geometry";
await mkdir(output, { recursive: true });
page.on("pageerror", (error) => console.error(error));
async function render(scene, scale, theme, extra = {}) {
  await page.evaluate((fixture) => window.qaRender(fixture), { scene, scale, theme, ...extra });
  await page.waitForTimeout(160);
}
async function record(name, detail) { results.push({ name, ...detail }); console.log(name, JSON.stringify(detail)); }
try {
  await page.goto("http://127.0.0.1:1420/scripts/qa/rc5-corrective3.html");
  await page.waitForFunction(() => window.qaRender && window.qaEditor);
  for (const scale of [1, 1.6]) for (const theme of ["light", "dark"]) {
    for (const count of [2, 20, 120]) for (const sidebar of [false, true]) {
      await render("search", scale, theme, { count, sidebar });
      await page.waitForFunction((count) => document.querySelector('[role="status"]')?.textContent === `1 из ${count}`, count);
      const before = await page.evaluate(() => ({ json: window.qaEditor.getJSON(), selection: window.qaEditor.state.selection.toJSON(), updates: window.qaUpdates }));
      const measures = [];
      for (let index = 0; index < 10; index++) {
        await page.getByRole("button", { name: "Следующее совпадение", exact: true }).click();
        const measured = await page.evaluate(() => {
          const match = document.querySelector(".note-search-match.current").getBoundingClientRect();
          const scroll = document.querySelector(".ed-scroll"); const viewport = scroll.getBoundingClientRect();
          const panel = document.querySelector(".note-editor-search").getBoundingClientRect();
          return { top: match.top, bottom: match.bottom, center: (match.top + match.bottom) / 2, viewportTop: viewport.top, viewportBottom: Math.min(viewport.bottom, panel.top), scrollTop: scroll.scrollTop, maxScroll: scroll.scrollHeight - scroll.clientHeight, windowY: window.scrollY, counter: document.querySelector('[role="status"]').textContent };
        });
        assert.ok(measured.top >= measured.viewportTop - 1 && measured.bottom <= measured.viewportBottom + 1, JSON.stringify(measured));
        if (measured.scrollTop > 1 && measured.scrollTop < measured.maxScroll - 1) assert.ok(Math.abs(measured.center - (measured.viewportTop + measured.viewportBottom) / 2) < 2, JSON.stringify(measured));
        assert.equal(measured.counter, `${(index + 1) % count + 1} из ${count}`); assert.equal(measured.windowY, 0);
        measures.push(measured);
      }
      await page.getByRole("button", { name: "Предыдущее совпадение", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => ({ json: window.qaEditor.getJSON(), selection: window.qaEditor.state.selection.toJSON(), updates: window.qaUpdates })), before);
      await record(`search-${scale}-${theme}-${count}-${sidebar}`, { navigations: measures.length, first: measures[0], last: measures.at(-1) });
    }
    for (const scene of ["table-top", "table-middle", "table-bottom"]) for (const sidebar of [false, true]) {
      await render(scene, scale, theme, { sidebar });
      if (scene === "table-bottom") {
        await page.locator("table").scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
      }
      await page.locator(".table-tools-trigger").waitFor();
      const before = await page.evaluate(() => window.qaEditor.getJSON());
      await page.locator(".table-tools-trigger").click();
      const menu = page.getByRole("dialog", { name: "Расширенные инструменты таблицы", exact: true });
      await menu.waitFor(); await page.waitForTimeout(100);
      const box = await menu.boundingBox(); assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 900, JSON.stringify(box));
      await menu.getByRole("button", { name: "Удалить таблицу", exact: true }).scrollIntoViewIfNeeded();
      const last = await menu.getByRole("button", { name: "Удалить таблицу", exact: true }).boundingBox(); assert.ok(last.y >= box.y && last.y + last.height <= box.y + box.height + 1);
      assert.deepEqual(await page.evaluate(() => window.qaEditor.getJSON()), before);
      await record(`${scene}-${scale}-${theme}-${sidebar}`, { box, last });
      await page.keyboard.press("Escape"); await menu.waitFor({ state: "detached" });
    }
    await render("help", scale, theme);
    const hint = page.locator(".info-hint"); await hint.hover();
    await page.getByRole("tooltip").waitFor();
    const help = await page.getByRole("tooltip").boundingBox();
    const hit = await page.evaluate(() => { const element = document.querySelector('[role="tooltip"]'); const rect = element.getBoundingClientRect(); const stack = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return { tooltipZ: +getComputedStyle(element).zIndex, modalZ: +getComputedStyle(document.querySelector(".nf-modal-backdrop")).zIndex, hintCenter: document.querySelector(".info-hint").getBoundingClientRect().top + 10, labelCenter: (() => { const label = document.querySelector(".field-label").getBoundingClientRect(); return label.top + label.height / 2; })(), stack: stack.map((item) => item.className) }; });
    assert.ok(hit.tooltipZ > hit.modalZ); assert.ok(Math.abs(hit.hintCenter - hit.labelCenter) < 1);
    assert.ok(help.x >= 0 && help.y >= 0 && help.x + help.width <= 1440 && help.y + help.height <= 900);
    await page.locator('input[aria-label="API-ключ"]').focus(); await hint.focus();
    await page.getByRole("tooltip").waitFor();
    await record(`tooltip-${scale}-${theme}`, { help, ...hit });
    await render("delete", scale, theme);
    const lines = await page.locator(".nf-modal-heading p").evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].length; });
    assert.equal(lines, 1); await record(`delete-copy-${scale}-${theme}`, { lines });
    await render("menu", scale, theme);
    const icons = await page.locator(".note-menu-actions-list button").evaluateAll((buttons) => buttons.map((button) => { const icon = button.querySelector("svg"); const label = button.querySelector("span"); const a = icon.getBoundingClientRect(), b = label.getBoundingClientRect(); return { text: label.textContent, width: a.width, height: a.height, centerDelta: Math.abs(a.top + a.height / 2 - b.top - b.height / 2) }; }));
    assert.equal(icons.length, 8); for (const icon of icons) { assert.ok(Math.abs(icon.width - 18 * scale) < 1); assert.ok(icon.centerDelta < 1); }
    await record(`note-menu-${scale}-${theme}`, { icons });
    await render("blocks", scale, theme);
    const cards = await page.locator(".block-menu-item").evaluateAll((items) => items.map((item) => { const r = item.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; }));
    assert.equal(cards.length, 8); for (let i = 0; i < 8; i += 2) { assert.equal(cards[i].height, cards[i + 1].height); assert.equal(cards[i].y, cards[i + 1].y); }
    const gaps = [2, 4, 6].map((index) => cards[index].y - cards[index - 2].bottom); assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1);
    assert.ok(cards[0].y >= 0 && cards.at(-1).bottom <= 900); await record(`blocks-${scale}-${theme}`, { cards, gaps });
    await page.screenshot({ path: `${output}/blocks-${scale}-${theme}.png` });
    await render("rag", scale, theme);
    await page.locator(".rag-project-trigger").waitFor();
    const controls = await page.locator('.rag-page button').evaluateAll((buttons) => buttons.filter((button) => !["rag-history-select", "rag-source-card"].some((name) => button.classList.contains(name)) && button.getBoundingClientRect().height > 0).map((button) => { const r = button.getBoundingClientRect(); const icon = button.querySelector("svg")?.getBoundingClientRect(); const style = getComputedStyle(button); return { text: button.getAttribute("aria-label") || button.textContent, className: button.className, alignment: style.alignItems, padding: style.padding, delta: icon ? Math.abs(r.top + r.height / 2 - icon.top - icon.height / 2) : 0 }; }));
    for (const control of controls) { assert.equal(control.alignment, "center", JSON.stringify(control)); assert.ok(control.delta < 1, JSON.stringify(control)); }
    await record(`rag-buttons-${scale}-${theme}`, { controls });
    await page.screenshot({ path: `${output}/rag-${scale}-${theme}.png` });
  }
  // A fresh layout measurement is required after an actual viewport resize.
  await page.setViewportSize({ width: 1100, height: 700 }); await render("search", 1.6, "dark", { count: 20, sidebar: true });
  await page.getByRole("button", { name: "Следующее совпадение", exact: true }).click();
  const resized = await page.locator(".note-search-match.current").boundingBox(); const viewport = await page.locator(".ed-scroll").boundingBox();
  assert.ok(resized.y >= viewport.y && resized.y + resized.height <= viewport.y + viewport.height); await record("search-after-resize", { resized, viewport });
  for (const scale of [1, 1.6]) for (const theme of ["light", "dark"]) {
    await render("blocks", scale, theme, { sidebar: true });
    const bounds = await page.locator(".block-insert-menu").boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 700);
    const cards = await page.locator(".block-menu-item").evaluateAll((items) => items.map((item) => { const rect = item.getBoundingClientRect(); return { x: rect.x, y: rect.y, height: rect.height, scrollWidth: item.scrollWidth, clientWidth: item.clientWidth }; }));
    for (let i = 0; i < 8; i += 2) { assert.equal(cards[i].y, cards[i + 1].y); assert.equal(cards[i].height, cards[i + 1].height); }
    cards.forEach((card) => assert.ok(card.scrollWidth <= card.clientWidth));
    await page.getByRole("button", { name: /Вставить дату/ }).scrollIntoViewIfNeeded();
    await record(`blocks-narrow-${scale}-${theme}`, { bounds, cards });
    await render("copy", scale, theme);
    const lines = await page.locator(".page-subtitle").evaluateAll((elements) => elements.map((element) => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length; }));
    assert.deepEqual(lines, [1, 1]); await record(`page-copy-${scale}-${theme}`, { lines });
    await render("rag", scale, theme);
    const delta = await page.locator(".rag-page .rag-project-trigger").evaluate((button) => { const a = button.getBoundingClientRect(); const b = button.querySelector("svg").getBoundingClientRect(); return Math.abs(a.top + a.height / 2 - b.top - b.height / 2); });
    assert.ok(delta < 1); await record(`rag-narrow-${scale}-${theme}`, { delta });
    await render("search-mixed", scale, theme, { count: 20, sidebar: true });
    const original = await page.evaluate(() => window.qaEditor.getJSON());
    for (let index = 0; index < 10; index++) {
      await page.getByRole("button", { name: "Следующее совпадение", exact: true }).click();
      const visible = await page.locator(".note-search-match.current").evaluate((element) => { const a = element.getBoundingClientRect(), b = document.querySelector(".ed-scroll").getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; }); assert.ok(visible);
    }
    for (let index = 0; index < 10; index++) await page.getByRole("button", { name: "Предыдущее совпадение", exact: true }).click();
    await page.getByRole("button", { name: "Предыдущее совпадение", exact: true }).click();
    assert.equal(await page.locator('[role="status"]').textContent(), "20 из 20");
    await page.getByRole("button", { name: "Следующее совпадение", exact: true }).click();
    assert.equal(await page.locator('[role="status"]').textContent(), "1 из 20");
    assert.deepEqual(await page.evaluate(() => window.qaEditor.getJSON()), original);
    await record(`mixed-heading-list-table-search-${scale}-${theme}`, { next: 10, previous: 10, wraps: 2 });
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await render("search", 1.6, "light", { count: 20, sidebar: true });
  for (let index = 0; index < 10; index++) {
    await page.getByRole("button", { name: "Следующее совпадение", exact: true }).click();
    await page.waitForTimeout(600);
    assert.ok(await page.locator(".note-search-match.current").evaluate((element) => { const a = element.getBoundingClientRect(), b = document.querySelector(".ed-scroll").getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; }));
  }
  await record("smooth-scroll-160", { visibleAfterEveryNavigation: true, navigations: 10 });
  console.log(`PASS ${results.length} browser geometry cases`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
