import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const output = "releases/qa/rc5-settings-overflow";
const results = [], errors = [];
await mkdir(output, { recursive: true });
page.on("pageerror", (error) => errors.push(error.message));
const sections = ["Основные", "Внешний вид", "Модели ИИ", "Данные и экспорт", "Горячие клавиши", "О приложении"];
const url = (zoom, theme, reset = false) => `http://127.0.0.1:1420/scripts/qa/rc5-final-ui.html?zoom=${zoom}&theme=${theme}${reset ? "&reset=1" : ""}`;

// Check inner scroll containers too: the original bug did not always reach <html>.
function capture() {
  const rect = (element) => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  const content = document.querySelector(".settings-content");
  const sidebar = document.querySelector(".sb");
  const visible = (e) => e.checkVisibility({ visibilityProperty: true }) && (!e.closest("details:not([open])") || !!e.closest("summary"));
  const elements = [document.documentElement, document.querySelector(".page-shell"), document.querySelector(".simple-page"), document.querySelector(".settings-layout-inner"), content, ...content.querySelectorAll("*")];
  const overflow = elements.filter((e) => e instanceof HTMLElement && visible(e) && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
    .map((e) => ({ class: e.className, tag: e.tagName, client: e.clientWidth, scroll: e.scrollWidth }));
  const bounds = rect(content);
  const clipped = [...content.querySelectorAll("button, input, select, textarea, .theme-preview")]
    .filter((e) => visible(e) && (rect(e).x < bounds.x - 1 || rect(e).right > bounds.right + 1))
    .map((e) => ({ class: e.className, text: e.textContent, rect: rect(e) }));
  return {
    overflow, clipped, content: bounds, layout: document.querySelector(".settings-layout-inner").dataset.layout,
    sidebar: { ...rect(sidebar), client: sidebar.clientWidth, scroll: sidebar.scrollWidth },
    rows: [...sidebar.querySelectorAll(".sidebar-action")].map((e) => ({ button: rect(e), icon: rect(e.querySelector("svg")), label: rect(e.querySelector("span")) })),
    themes: [...content.querySelectorAll(".theme-option")].map(rect),
    duration: getComputedStyle(document.querySelector(".page-shell")).transitionDuration,
  };
}
function verify(g) {
  assert.deepEqual(g.overflow, [], JSON.stringify(g.overflow));
  assert.deepEqual(g.clipped, [], JSON.stringify(g.clipped));
  assert.ok(g.sidebar.scroll <= g.sidebar.client + 1);
  for (const [index, row] of g.rows.entries()) {
    assert.ok(Math.abs(row.icon.x - g.rows[0].icon.x) < 0.6);
    if (index) assert.ok(Math.abs(row.label.x - g.rows[1].label.x) < 0.6);
    assert.ok(row.icon.x >= row.button.x - 0.6 && row.icon.right <= row.label.x + 0.6);
    assert.ok(row.label.right <= row.button.right + 0.6);
  }
}
function record(name, details) { results.push({ name, ...details }); console.log(`PASS ${name}`); }
async function snapshot(name) { const g = await page.evaluate(capture); verify(g); record(name, g); return g; }
async function openSection(name) {
  const button = page.locator(".settings-nav").filter({ hasText: name });
  await button.scrollIntoViewIfNeeded(); await button.click();
  await page.locator(`.settings-content`).waitFor();
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function resize(delta, expected) {
  const handle = await page.locator(".page-resize-sb").boundingBox();
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  const samples = [];
  for (const part of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(Math.max(1, x + delta * part), y);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const g = await page.evaluate(capture); verify(g); assert.equal(g.duration, "0s"); samples.push(g);
  }
  await page.mouse.up(); await page.waitForTimeout(550);
  assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), expected);
  const released = await page.evaluate(capture); verify(released);
  assert.ok(Math.abs(released.sidebar.w - samples.at(-1).sidebar.w) < 0.6);
  return { samples };
}
async function motion(direction) {
  const frames = await page.evaluate(async ({ source }) => {
    const read = new Function(`return (${source})()`) ;
    const frames = [read()], start = performance.now();
    document.querySelector(".sb .col").click();
    await new Promise((resolve) => {
      function sample() { frames.push(read()); if (performance.now() - start < 340) requestAnimationFrame(sample); else resolve(); }
      requestAnimationFrame(sample);
    });
    return frames;
  }, { source: capture.toString() });
  frames.forEach(verify);
  assert.ok(new Set(frames.map((g) => Math.round(g.sidebar.w * 10))).size > 3);
  const first = frames[0], last = frames.at(-1);
  for (let i = 1; i < frames.length; i++) {
    assert.ok(direction * (frames[i].sidebar.w - frames[i - 1].sidebar.w) >= -0.6);
    for (let row = 0; row < frames[i].rows.length; row++) {
      const r = frames[i].rows[row];
      assert.ok(Math.abs(r.icon.y - first.rows[row].icon.y) < 0.6);
      assert.ok(r.icon.x >= Math.min(first.rows[row].icon.x, last.rows[row].icon.x) - 0.6);
      assert.ok(r.icon.x <= Math.max(first.rows[row].icon.x, last.rows[row].icon.x) + 0.6);
    }
  }
  return { frames };
}

try {
  for (const width of [1100, 1280, 1440, 1536, 1920]) for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) {
    const id = `${width}-${zoom}-${theme}`;
    await page.setViewportSize({ width, height: width <= 1280 ? 700 : 900 });
    await page.goto(url(zoom, theme, true)); await page.locator(".tiptap").waitFor();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await openSection("Внешний вид");
    record(`drag-min-${id}`, await resize(-400, 190));
    for (const name of sections) { await openSection(name); await snapshot(`min-${id}-${name}`); }
    await openSection("Внешний вид");
    record(`drag-max-${id}`, await resize(400, 360));
    for (const name of sections) { await openSection(name); await snapshot(`max-${id}-${name}`); }
    await openSection("Внешний вид");
    const appearance = await snapshot(`original-regression-${id}`);
    assert.equal(appearance.themes.length, 3);
    if (zoom === 160 && (width === 1440 || width === 1536)) {
      assert.ok(appearance.themes[2].y > appearance.themes[0].y, "Theme grid must reflow, not clip its third option");
      assert.notEqual(await page.locator(".simple-page").evaluate((e) => getComputedStyle(e).overflowX), "hidden");
    }
    if (zoom === 160 && width === 1536) {
      const oldGrid = await page.addStyleTag({ content: ".settings-content--appearance .theme-options { grid-template-columns: repeat(3, minmax(150px, 1fr)); }" });
      const broken = await page.evaluate(capture);
      assert.ok(broken.overflow.some((e) => e.class === "theme-options" && e.scroll === 474));
      assert.ok(broken.clipped.length > 0, "The detector must catch the original overflowing third theme option");
      record(`detects-original-overflow-${id}`, { overflow: broken.overflow, clipped: broken.clipped });
      await oldGrid.evaluate((e) => e.remove()); verify(await page.evaluate(capture));
    }
    await page.screenshot({ path: `${output}/appearance-max-${id}.png` });
    record(`collapse-frames-${id}`, await motion(-1));
    for (const name of sections) { await openSection(name); await snapshot(`collapsed-${id}-${name}`); }
    await openSection("Внешний вид"); record(`expand-frames-${id}`, await motion(1));
    await page.evaluate(() => { for (let i = 0; i < 6; i++) document.querySelector(".sb .col").click(); });
    await page.waitForTimeout(340); await snapshot(`rapid-${id}`);
    assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), 360);
    await page.goto(url(zoom, theme)); await page.locator(".sb").waitFor();
    await page.getByRole("button", { name: "Настройки", exact: true }).click(); await openSection("Внешний вид");
    await page.waitForTimeout(340);
    assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), 360);
    await snapshot(`persisted-max-${id}`);
    await openSection("Модели ИИ");
    for (const selector of [".model-settings-section", "#semantic-search-settings"]) {
      await page.locator(selector).first().getByRole("button", { name: "Добавить модель", exact: true }).first().click();
      const modal = page.locator(".settings-modal-shell");
      await modal.evaluate(async (e) => { await Promise.all(e.getAnimations({ subtree: true }).map((a) => a.finished)); });
      const geometry = await modal.evaluate((e) => ({ client: e.clientWidth, scroll: e.scrollWidth, right: e.getBoundingClientRect().right, left: e.getBoundingClientRect().left, viewport: innerWidth }));
      assert.ok(geometry.scroll <= geometry.client + 1 && geometry.left >= 0 && geometry.right <= geometry.viewport + 1);
      record(`model-dialog-${id}-${selector}`, geometry);
      await modal.getByRole("button", { name: "Отмена", exact: true }).click(); await page.waitForTimeout(180);
    }
    await openSection("Внешний вид");
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.locator(".sb .col").click();
    await page.waitForTimeout(40); const reduced = await snapshot(`reduced-motion-${id}`); assert.equal(reduced.duration, "0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  assert.deepEqual(errors, []); console.log(`PASS ${results.length} settings overflow cases`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
