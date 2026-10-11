import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const results = [];
const output = "releases/qa/rc5-final-ui";
await mkdir(output, { recursive: true });
function record(name, details = {}) { results.push({ name, ...details }); console.log(name, JSON.stringify(details)); }
async function measureToggle(selector, track, expectMotion = true) {
  const frames = await page.evaluate(async ({ selector, track }) => {
    const shell = document.querySelector(".workspace") || document.querySelector(".rag-page");
    const frames = []; const start = performance.now();
    document.querySelector(selector).click();
    await new Promise((resolve) => {
      function sample() {
        frames.push({ t: performance.now() - start, w: parseFloat(getComputedStyle(shell).gridTemplateColumns.split(" ")[track]), nav: [...document.querySelectorAll(".sb .nav-i svg")].map((icon) => icon.getBoundingClientRect().top), overflow: document.documentElement.scrollWidth > innerWidth, scroll: document.querySelector(".ed-scroll")?.scrollTop, anchor: document.querySelector(".ed-scroll") ? getComputedStyle(document.querySelector(".ed-scroll")).overflowAnchor : null, moving: [...document.querySelectorAll('[data-panel-moving="true"]')].length });
        if (performance.now() - start < 310) requestAnimationFrame(sample); else resolve();
      }
      requestAnimationFrame(sample);
    });
    return frames;
  }, { selector, track });
  assert.ok(frames.every((frame) => !frame.overflow), JSON.stringify(frames));
  if (expectMotion) assert.ok(new Set(frames.map((frame) => Math.round(frame.w * 10))).size > 2, JSON.stringify(frames));
  for (const frame of frames) for (let index = 0; index < frame.nav.length; index++) assert.ok(Math.abs(frame.nav[index] - frames[0].nav[index]) < 1, JSON.stringify(frames));
  return { first: frames[0].w, last: frames.at(-1).w, intermediateWidths: new Set(frames.map((frame) => Math.round(frame.w * 10))).size, frames: frames.length, scrollFirst: frames[0].scroll, scrollLast: frames.at(-1).scroll, anchoring: [...new Set(frames.map((frame) => frame.anchor))] };
}
try {
  for (const width of [1440, 1100]) for (const zoom of process.env.QA_ZOOM ? [Number(process.env.QA_ZOOM)] : [100, 160]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
    await page.goto(`http://127.0.0.1:1420/scripts/qa/rc5-final-ui.html?reset=1&zoom=${zoom}&theme=${theme}`);
    await page.locator(".tiptap").waitFor(); await page.waitForTimeout(1200);
    const id = `${width}-${zoom}-${theme}`;
    const initialWrites = await page.evaluate(() => window.qaCommands.filter((command) => command === "update_note_content").length);
    await page.evaluate(() => { window.qaOriginalEditor = document.querySelector(".tiptap"); document.querySelector(".ed-scroll").scrollTop = 320; const text = document.querySelector(".tiptap p").firstChild; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 12); getSelection().removeAllRanges(); getSelection().addRange(range); });
    await page.waitForTimeout(100);
    const original = await page.evaluate(() => ({ document: document.querySelector(".tiptap").editor.getJSON(), selection: document.querySelector(".tiptap").editor.state.selection.toJSON() }));
    const scroll = await page.locator(".ed-scroll").evaluate((element) => element.scrollTop);
    for (const [selector, track] of [['.sb .col', 0], ['.sb .col', 0], ['[data-tooltip="Чат по заметке"]', 3], ['.note-chat .nc-top .x', 3]]) {
      if (selector.includes(".nc-top")) await page.locator(selector).focus();
      const details = await measureToggle(selector, track); record(`motion-${id}-${selector}`, details);
      if (selector.includes(".nc-top")) assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-tooltip")), "Чат по заметке");
    }
    assert.deepEqual(await page.evaluate(() => ({ document: document.querySelector(".tiptap").editor.getJSON(), selection: document.querySelector(".tiptap").editor.state.selection.toJSON() })), original);
    assert.ok(await page.evaluate(() => window.qaOriginalEditor === document.querySelector(".tiptap")));
    assert.equal(await page.locator(".ed-scroll").evaluate((element) => element.scrollTop), scroll);
    assert.equal(await page.evaluate(() => window.qaCommands.filter((command) => command === "update_note_content").length), initialWrites);
    record(`editor-preserved-${id}`, { scroll, table: await page.locator(".tiptap table").count(), image: await page.locator(".tiptap img").count() });
    // Real resize then rapid collapse/expand must restore the saved physical width.
    const handle = page.locator(".resize-sb");
    if (await handle.count()) {
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
      assert.equal(await page.locator(".workspace").evaluate((element) => getComputedStyle(element).transitionDuration), "0s");
      await page.mouse.up();
      await page.waitForTimeout(300);
      const savedWidth = await page.locator(".sb").evaluate((element) => element.getBoundingClientRect().width);
      await page.evaluate(() => { for (let index = 0; index < 6; index++) document.querySelector(".sb .col").click(); });
      await page.waitForTimeout(330);
      assert.ok(Math.abs(await page.locator(".sb").evaluate((element) => element.getBoundingClientRect().width) - savedWidth) < 1);
      assert.deepEqual(await page.evaluate(() => ({ document: document.querySelector(".tiptap").editor.getJSON(), selection: document.querySelector(".tiptap").editor.state.selection.toJSON() })), original);
      assert.equal(await page.locator(".ed-scroll").evaluate((element) => element.scrollTop), scroll);
      assert.ok(await page.evaluate(() => window.qaOriginalEditor === document.querySelector(".tiptap")));
      record(`resize-rapid-${id}`, { savedWidth });
    }
    await page.keyboard.press("Control+Backslash"); await page.waitForTimeout(320);
    if (await page.locator(".focus-exit").count()) {
      assert.equal(await page.locator(".workspace-list-panel").getAttribute("aria-hidden"), "true");
      record(`focus-list-${id}`, await measureToggle(".focus-exit", 1));
    }
    await page.screenshot({ path: `${output}/notes-${id}.png` });
    const descriptions = [["Проекты", "Организуйте заметки и материалы по направлениям работы"], ["Теги", "Управляйте тегами и открывайте связанные заметки"], ["Архив", "Архивные заметки можно восстановить в любой момент"]];
    for (const [label, text] of descriptions) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByText(text, { exact: true }).waitFor(); record(`copy-${id}-${label}`);
    }
    await page.getByRole("button", { name: "Настройки", exact: true }).click(); await page.getByRole("button", { name: "Модели ИИ", exact: true }).click();
    for (const text of ["Генерируют и редактируют текст, отвечают на вопросы и используются в ИИ-помощнике", "Находит связанные по смыслу фрагменты заметок и используется для поиска по базе знаний"]) await page.getByText(text, { exact: true }).waitFor();
    record(`copy-models-${id}`);
    await page.getByRole("button", { name: "ИИ-чат по базе", exact: true }).click(); await page.locator(".rag-project-trigger").waitFor(); await page.waitForTimeout(350);
    if (await page.locator('.rag-page.rag-layout-wide').count()) {
      record(`rag-history-${id}`, await measureToggle('[aria-label="Скрыть историю чатов"]', 0));
      record(`rag-history-open-${id}`, await measureToggle('[aria-label="Показать историю чатов"]', 0));
      record(`rag-sources-${id}`, await measureToggle('button[aria-label="Скрыть источники"]', 2));
      record(`rag-sources-open-${id}`, await measureToggle('button[aria-label="Источники ответа"]', 2));
    } else {
      await page.getByRole("button", { name: "Показать историю чатов", exact: true }).click(); await page.waitForTimeout(300);
      await page.locator('.rag-history-panel[data-panel-open="true"]').waitFor();
      await page.getByRole("button", { name: "Источники ответа", exact: true }).click();
      assert.equal(await page.locator('.rag-history-panel').getAttribute('aria-hidden'), 'true');
      assert.equal(await page.locator('.rag-history-panel').getAttribute('inert'), '');
      await page.waitForTimeout(300); await page.locator('.rag-source-panel[data-panel-open="true"]').waitFor();
      record(`rag-drawer-${id}`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/rag-${id}.png` });
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator('.rag-page').evaluate((element) => getComputedStyle(element).transitionDuration), '0s');
    record(`reduced-motion-${id}`); await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${results.length} final UI cases`);
} finally { await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
