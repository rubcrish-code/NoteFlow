import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { samplePanelMotion, settlePanelLayout } from "./panel-motion.mjs";

const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const output = "releases/qa/rc5-fluid-sidebar";
const results = [], errors = [];
await mkdir(output, { recursive: true });
page.on("pageerror", (error) => errors.push(error.message));
function record(name, details) { results.push({ name, ...details }); console.log(`PASS ${name}`); }

function capture() {
  const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const sidebar = document.querySelector(".sb"), shell = document.querySelector(".workspace") || document.querySelector(".page-shell");
  const rows = [...sidebar.querySelectorAll(".sidebar-action")].map((e) => {
    const label = e.querySelector(".sidebar-action-label"), text = label.firstChild;
    const words = [];
    for (const match of (text?.textContent || "").matchAll(/\S+/gu)) {
      const range = document.createRange(); range.setStart(text, match.index); range.setEnd(text, match.index + match[0].length);
      words.push(...[...range.getClientRects()].map((r) => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom })));
    }
    return { button: rect(e), icon: rect(e.querySelector("svg")), label: rect(label), words,
      opacity: +getComputedStyle(label).opacity, maxWidth: getComputedStyle(e).maxWidth,
      labelWidth: label.clientWidth, labelScroll: label.scrollWidth };
  });
  return { sidebar: rect(sidebar), rows, client: sidebar.clientWidth, scroll: sidebar.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    zoom: rows[0].icon.w / 18, collapsed: shell.classList.contains("collapse-sb"),
    duration: getComputedStyle(shell).transitionDuration, easing: getComputedStyle(shell).transitionTimingFunction,
    active: sidebar.querySelector(".nav-i.on")?.getAttribute("aria-label") };
}
function verify(g, baseline = g) {
  assert.equal(g.overflow, false); assert.ok(g.scroll <= g.client + 1, JSON.stringify(g));
  const create = g.rows[0], nav = g.rows[1], tolerance = 0.7;
  assert.equal(create.maxWidth, "none", "No artificial maximum width");
  assert.ok(Math.abs(create.button.w - nav.button.w) < tolerance, "Creation and navigation fill the same width");
  assert.ok(Math.abs(create.button.x - nav.button.x) < tolerance, "Button stays left aligned");
  assert.ok(Math.abs(create.button.right - nav.button.right) < tolerance, "Button keeps the same right gutter");
  assert.ok(Math.abs(create.label.x - create.icon.right - 8 * g.zoom) < tolerance, "Creation gap must be 8 CSS px");
  for (const [i, row] of g.rows.entries()) {
    assert.ok(Math.abs(row.icon.x - nav.icon.x) < tolerance);
    if (i) assert.ok(Math.abs(row.label.x - nav.label.x) < tolerance);
    assert.ok(Math.abs(row.icon.w - 18 * g.zoom) < tolerance);
    assert.ok(Math.abs(row.icon.h - 18 * g.zoom) < tolerance);
    assert.ok(Math.abs(row.button.h - (i ? 38 : 40) * g.zoom) < tolerance);
    assert.ok(Math.abs(row.button.y - baseline.rows[i].button.y) < tolerance, "No Y layout shift");
    assert.ok(Math.abs(row.icon.y + row.icon.h / 2 - row.button.y - row.button.h / 2) < tolerance);
    assert.ok(Math.abs(row.label.y + row.label.h / 2 - row.button.y - row.button.h / 2) < tolerance);
    assert.ok(row.icon.x >= row.button.x - tolerance && row.icon.right <= row.label.x + tolerance);
    assert.ok(row.label.right <= row.button.right + tolerance);
    assert.ok(row.button.right <= g.sidebar.right + tolerance);
    if (i) assert.ok(row.button.y >= g.rows[i - 1].button.bottom - tolerance);
  }
}
function verifyLabel(g) {
  if (g.collapsed) return;
  const { label, button, words, labelWidth, labelScroll } = g.rows[0];
  assert.ok(labelScroll <= labelWidth + 1, "Creation text is not clipped horizontally");
  assert.ok(words.length > 0);
  for (const word of words) {
    assert.ok(word.x >= label.x - 0.7 && word.right <= label.right + 0.7, "Every creation word fits");
    assert.ok(word.y >= button.y - 0.7 && word.bottom <= button.bottom + 0.7, "Creation text fits the fixed height");
  }
}
async function snapshot(name, baseline) { const g = await page.evaluate(capture); verify(g, baseline); verifyLabel(g); record(name, g); return g; }
async function resizeTo(width) {
  const handle = await page.locator(".resize-sb").boundingBox();
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
  const setting = await page.evaluate(() => window.qaSettings.sidebarWidth);
  await page.mouse.move(x, y); await page.mouse.down();
  const samples = [];
  for (const step of [0.25, 0.5, 0.75, 1]) {
    // Settings round each delta to integer physical px; avoid half-pixel drift in the driver.
    await page.mouse.move(x + Math.round((width - setting) * step), y);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const g = await page.evaluate(capture); verify(g); verifyLabel(g); assert.equal(g.duration, "0s"); samples.push(g);
  }
  await page.mouse.up(); await page.waitForTimeout(550);
  assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), width);
  const last = await page.evaluate(capture); verify(last); verifyLabel(last);
  assert.ok(Math.abs(last.sidebar.w - samples.at(-1).sidebar.w) < 0.7, "No release jump");
  assert.ok(Math.abs(last.rows[0].button.w - samples.at(-1).rows[0].button.w) < 0.7, "No button release jump");
  return samples;
}
async function motion(direction, baseline) {
  const sampled = await samplePanelMotion(page, ".sb .col", capture);
  const { frames, playback } = sampled;
  [...frames, ...playback].forEach((g) => verify(g, baseline));
  assert.ok(new Set(frames.map((g) => Math.round(g.sidebar.w))).size > 3);
  for (const trajectory of [frames, playback]) for (let i = 1; i < trajectory.length; i++) {
    assert.ok(direction * (trajectory[i].sidebar.w - trajectory[i - 1].sidebar.w) >= -0.7);
    assert.ok(direction * (trajectory[i].rows[0].button.w - trajectory[i - 1].rows[0].button.w) >= -0.7);
    const endpoints = [frames[0].rows[0].icon.x, frames.at(-1).rows[0].icon.x];
    assert.ok(trajectory[i].rows[0].icon.x >= Math.min(...endpoints) - 0.7 && trajectory[i].rows[0].icon.x <= Math.max(...endpoints) + 0.7);
  }
  assert.equal(frames[0].duration, "0.24s");
  assert.equal(frames[0].easing, "cubic-bezier(0.22, 1, 0.36, 1)");
  const compact = direction < 0 ? frames.at(-1) : frames[0], button = compact.rows[0].button, icon = compact.rows[0].icon;
  assert.ok(Math.abs(button.w - button.h) < 0.7);
  assert.ok(Math.abs(icon.x + icon.w / 2 - button.x - button.w / 2) < 0.7);
  assert.ok(compact.rows[0].opacity < 0.001, "Compact label is invisible, allowing compositor float precision");
  const checkpoints = [0, 60, 120, 180, 240].map((target) => ({ target, frame: frames.reduce((best, f) => Math.abs(f.t - target) < Math.abs(best.t - target) ? f : best) }));
  return { checkpoints, frames, playback, events: sampled.events, requestedAt: sampled.requestedAt, foundAt: sampled.foundAt, viewport: sampled.viewport };
}

try {
  for (const width of [1100, 1440, 1920]) for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) {
    const id = `${width}-${zoom}-${theme}`, url = `http://127.0.0.1:1420/scripts/qa/rc5-final-ui.html?zoom=${zoom}&theme=${theme}`;
    await page.setViewportSize({ width, height: width === 1100 ? 700 : 900 });
    await page.goto(`${url}&reset=1`); await page.locator(".tiptap").waitFor(); await page.waitForTimeout(700);
    const baseline = await snapshot(`initial-${id}`);
    for (const [step, setting] of [190, 250, 320, 360, 320, 250, 190, 360].entries()) {
      record(`resize-${id}-${setting}-${step}`, { samples: await resizeTo(setting) });
      const g = await snapshot(`expanded-${id}-${setting}-${step}`, baseline);
      if (setting === 360 && zoom === 100) assert.ok(g.rows[0].button.w > 330, "Maximum sidebar must not stop at 280px");
    }
    // Negative controls must detect both the rejected cap and a fixed-width regression.
    for (const [name, declaration] of [["max-width", "max-width:280px"], ["fixed-width", "width:280px"]]) {
      const badStyle = await page.addStyleTag({ content: `.sb .new-btn.sidebar-action { ${declaration}; }` });
      const bad = await page.evaluate(capture);
      if (name === "max-width" && zoom === 100) assert.ok(bad.rows[0].button.right < bad.rows[1].button.right - 50);
      assert.throws(() => verify(bad));
      record(`detects-${name}-${id}`, bad); await badStyle.evaluate((e) => e.remove());
    }
    record(`collapse-${id}`, await motion(-1, baseline));
    record(`expand-${id}`, await motion(1, baseline));
    await page.evaluate(() => { for (let i = 0; i < 8; i++) document.querySelector(".sb .col").click(); });
    await page.waitForTimeout(330); await snapshot(`rapid-${id}`, baseline);
    await page.goto(url); await page.locator(".tiptap").waitFor(); await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), 360);
    await snapshot(`persistent-width-${id}`, baseline);
    await page.locator(".new-btn").hover(); await snapshot(`hover-${id}`, baseline);
    await page.locator(".new-btn").focus();
    await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Все заметки");
    await page.keyboard.press("Shift+Tab"); assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Новая заметка");
    assert.notEqual(await page.locator(".new-btn").evaluate((e) => getComputedStyle(e).outlineStyle), "none");
    await page.keyboard.press("Space"); await page.locator(".nf-modal-shell").waitFor();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await snapshot(`keyboard-create-${id}`, baseline);
    const button = await page.locator(".new-btn").boundingBox();
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down();
    await snapshot(`active-${id}`, baseline); await page.mouse.move(button.x + button.width + 12, button.y); await page.mouse.up();
    // English/long labels are layout stress inputs, not a claim of app localization.
    await page.evaluate(() => {
      const labels = ["New note", "All notes", "Projects", "Knowledge base AI chat", "Tags", "Archive", "Settings"];
      document.querySelectorAll(".sidebar-action-label").forEach((e, i) => { e.textContent = labels[i]; });
    });
    await snapshot(`english-labels-${id}`, baseline);
    await page.evaluate(() => { document.querySelector(".nav-i .sidebar-action-label").textContent = "Очень длинное название раздела для проверки устойчивости геометрии"; });
    await snapshot(`long-cyrillic-${id}`, baseline);
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.locator(".sb .col").click();
    await settlePanelLayout(page); const reduced = await snapshot(`reduced-motion-${id}`, baseline); assert.equal(reduced.duration, "0s");
    assert.ok(Math.abs(reduced.rows[0].button.w - reduced.rows[0].button.h) < 0.7);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.screenshot({ path: `${output}/collapsed-${id}.png` });
  }
  assert.deepEqual(errors, []); console.log(`PASS ${results.length} fluid sidebar cases`);
} finally { await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
