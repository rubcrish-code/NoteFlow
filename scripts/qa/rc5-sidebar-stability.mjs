import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [], results = [];
const output = "releases/qa/rc5-sidebar-stability";
await mkdir(output, { recursive: true });
page.on("pageerror", (error) => errors.push(error.message));
function record(name, details = {}) { results.push({ name, ...details }); console.log(name, JSON.stringify(details)); }
async function geometry() {
  return page.evaluate(() => {
    const rect = (element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    const sidebar = document.querySelector(".sb");
    return { sidebar: rect(sidebar), scrollWidth: sidebar.scrollWidth, clientWidth: sidebar.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      rows: [...sidebar.querySelectorAll(".sidebar-action")].map((button) => ({ button: rect(button), icon: rect(button.querySelector("svg")), label: rect(button.querySelector("span")), opacity: +getComputedStyle(button.querySelector("span")).opacity, position: getComputedStyle(button.querySelector("span")).position })) };
  });
}
function validGeometry(g, baseline) {
  assert.equal(g.overflow, false);
  assert.ok(g.scrollWidth <= g.clientWidth + 1, JSON.stringify(g));
  for (let i = 0; i < g.rows.length; i++) {
    const row = g.rows[i], ref = baseline.rows[i];
    assert.ok(Math.abs(row.icon.x - g.rows[0].icon.x) < 0.6, JSON.stringify(g));
    if (i) assert.ok(Math.abs(row.label.x - g.rows[1].label.x) < 0.6, JSON.stringify(g));
    assert.equal(row.position, "static");
    assert.ok(row.icon.right <= row.label.x + 0.6);
    assert.ok(row.icon.x >= row.button.x && row.icon.right <= row.button.right + 0.6);
    assert.ok(row.label.right <= row.button.right + 0.6);
    assert.ok(Math.abs(row.button.h - ref.button.h) < 0.6);
    assert.ok(Math.abs(row.icon.y - ref.icon.y) < 0.6, JSON.stringify(g));
    if (i) assert.ok(g.rows[i - 1].button.bottom <= row.button.y + 0.6);
  }
}
async function drag(handle, delta, panel, property) {
  const variable = { sidebarWidth: "--sbw", listWidth: "--listw", chatWidth: "--chatw", ragConversationWidth: "--ragcw", ragSourcesWidth: "--ragsw" }[property];
  const box = await page.locator(handle).boundingBox();
  const before = await page.locator(panel).evaluate((el) => el.getBoundingClientRect().width);
  const oldSetting = await page.evaluate((variable) => parseFloat(getComputedStyle(document.querySelector(".rag-page") || document.querySelector(".workspace") || document.querySelector(".page-shell")).getPropertyValue(variable)), variable);
  const ratio = before / oldSetting;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const samples = [];
  for (const part of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(Math.max(1, box.x + box.width / 2 + delta * part), box.y + box.height / 2);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    samples.push(await page.evaluate(({ panel, variable }) => { const shell = document.querySelector(".rag-page") || document.querySelector(".workspace") || document.querySelector(".page-shell"); return { width: document.querySelector(panel).getBoundingClientRect().width, setting: parseFloat(getComputedStyle(shell).getPropertyValue(variable)), duration: getComputedStyle(shell).transitionDuration }; }, { panel, variable }));
    assert.equal(samples.at(-1).duration, "0s");
    assert.ok(Math.abs(samples.at(-1).width - samples.at(-1).setting * ratio) < 1, JSON.stringify(samples));
  }
  const held = samples.at(-1).width;
  await page.mouse.up(); await page.waitForTimeout(550);
  const released = await page.locator(panel).evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(Math.abs(released - held) < 0.6, JSON.stringify({ held, released }));
  assert.equal(await page.locator(".resize-handle.dragging").count(), 0);
  return samples;
}
async function motion(baseline, direction) {
  // Collect real start/middle/end frames; no screenshot-only assertions.
  const frames = await page.evaluate(async () => {
    const rect = (element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    const capture = () => { const sidebar = document.querySelector(".sb"); return { sidebar: rect(sidebar), scrollWidth: sidebar.scrollWidth, clientWidth: sidebar.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth, rows: [...sidebar.querySelectorAll(".sidebar-action")].map((button) => ({ button: rect(button), icon: rect(button.querySelector("svg")), label: rect(button.querySelector("span")), opacity: +getComputedStyle(button.querySelector("span")).opacity, position: getComputedStyle(button.querySelector("span")).position })) }; };
    const frames = [capture()], start = performance.now(); document.querySelector(".sb .col").click();
    await new Promise((resolve) => { function sample() { frames.push(capture()); if (performance.now() - start < 320) requestAnimationFrame(sample); else resolve(); } requestAnimationFrame(sample); });
    return frames;
  });
  const initial = frames[0];
  const final = frames.at(-1);
  frames.forEach((g) => validGeometry(g, baseline));
  assert.ok(new Set(frames.map((g) => Math.round(g.sidebar.w * 10))).size > 3);
  for (let i = 1; i < frames.length; i++) {
    assert.ok(direction * (frames[i].sidebar.w - frames[i - 1].sidebar.w) >= -0.6);
    // Padding is zoom-aware; icon X must remain between its endpoints, never jump to the wide panel centre.
    assert.ok(frames[i].rows[0].icon.x >= Math.min(initial.rows[0].icon.x, final.rows[0].icon.x) - 0.6);
    assert.ok(frames[i].rows[0].icon.x <= Math.max(initial.rows[0].icon.x, final.rows[0].icon.x) + 0.6);
  }
  return { frames: frames.length, widths: frames.map((g) => +g.sidebar.w.toFixed(2)), iconX: frames.map((g) => +g.rows[0].icon.x.toFixed(2)), labelX: frames.map((g) => +g.rows[0].label.x.toFixed(2)) };
}
async function description(modal, text, singleLine) {
  await page.getByText(text, { exact: true }).waitFor();
  await page.locator(modal).evaluate(async (el) => {
    await Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
  const metrics = await page.locator(`${modal} .nf-modal-heading p`).evaluate((p) => {
    const range = document.createRange(); range.selectNodeContents(p);
    return { lines: range.getClientRects().length, width: p.getBoundingClientRect().width, scroll: p.scrollWidth, client: p.clientWidth, maxWidth: getComputedStyle(p).maxWidth, font: getComputedStyle(p).fontSize };
  });
  assert.equal(metrics.maxWidth, "none"); assert.ok(metrics.scroll <= metrics.client + 1);
  if (singleLine) assert.equal(metrics.lines, 1, JSON.stringify(metrics));
  return metrics;
}
try {
  for (const viewport of [1100, 1440, 1920]) for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) {
    const id = `${viewport}-${zoom}-${theme}`;
    await page.setViewportSize({ width: viewport, height: viewport === 1100 ? 700 : 900 });
    await page.goto(`http://127.0.0.1:1420/scripts/qa/rc5-final-ui.html?reset=1&zoom=${zoom}&theme=${theme}`);
    await page.locator(".tiptap").waitFor(); await page.waitForTimeout(900);
    const baseline = await geometry(); validGeometry(baseline, baseline);
    record(`standard-${id}`, baseline);
    record(`drag-min-${id}`, { samples: await drag(".resize-sb", -220, ".sb", "sidebarWidth") });
    assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), 190); validGeometry(await geometry(), baseline);
    record(`drag-max-${id}`, { samples: await drag(".resize-sb", 300, ".sb", "sidebarWidth") });
    assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), 360); validGeometry(await geometry(), baseline);
    await drag(".resize-sb", -40, ".sb", "sidebarWidth"); validGeometry(await geometry(), baseline);
    record(`intermediate-${id}`, await geometry());
    record(`collapse-${id}`, await motion(baseline, -1));
    record(`expand-${id}`, await motion(baseline, 1));
    const saved = await page.evaluate(() => window.qaSettings.sidebarWidth);
    await page.evaluate(() => { for (let i = 0; i < 6; i++) document.querySelector(".sb .col").click(); });
    await page.waitForTimeout(330); validGeometry(await geometry(), baseline);
    assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), saved);
    record(`rapid-${id}`, { saved });
    // Replay the mock persistence contract, not a claim of native SQLite restart QA.
    await page.goto(`http://127.0.0.1:1420/scripts/qa/rc5-final-ui.html?zoom=${zoom}&theme=${theme}`); await page.locator(".sb").waitFor(); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.qaSettings.sidebarWidth), saved);
    validGeometry(await geometry(), baseline); record(`reload-width-${id}`, { saved });
    await page.screenshot({ path: `${output}/sidebar-${id}.png` });
    record(`list-drag-${id}`, { samples: await drag(".resize-list", 25, ".list", "listWidth") });
    await page.locator('[data-tooltip="Чат по заметке"]').click(); await page.waitForTimeout(330);
    record(`chat-drag-${id}`, { samples: await drag(".chat-resize", -25, ".note-chat", "chatWidth") });
    await page.locator(".note-chat .nc-top .x").click(); await page.waitForTimeout(330);
    await page.locator(".sb .col").click();
    await page.getByRole("button", { name: "Настройки", exact: true }).click(); await page.waitForTimeout(330);
    await page.locator(".sb .col").click(); await page.waitForTimeout(330);
    validGeometry(await geometry(), baseline); record(`navigate-during-motion-${id}`);
    const settingsCopy = [["Основные", "Профиль и основные сведения о локальной работе NoteFlow"], ["Внешний вид", "Тема приложения настраивается только в этом разделе"], ["Данные и экспорт", "Резервные копии профиля, импорт и восстановление данных"], ["Горячие клавиши", "Сочетания, которые уже работают в приложении. На macOS используйте ⌘ вместо Ctrl"], ["О приложении", "Локальные заметки, Markdown-first редактор и ИИ-инструменты с контролем приватности"]];
    for (const [label, text] of settingsCopy) { await page.getByRole("button", { name: label, exact: true }).click(); await page.getByText(text, { exact: true }).waitFor(); record(`copy-${id}-${label}`); }
    await page.getByRole("button", { name: "Данные и экспорт", exact: true }).click();
    await page.getByText("NoteFlow делит длинные заметки на небольшие части, чтобы точнее находить нужную информацию при ИИ-поиске", { exact: true }).waitFor(); record(`copy-fragments-${id}`);
    await page.getByRole("button", { name: "Модели ИИ", exact: true }).click();
    await page.getByText("Подключите модель для работы ИИ-помощника и чата", { exact: true }).waitFor();
    await page.getByText("Подключите локальную или облачную модель, чтобы искать заметки по смыслу", { exact: true }).waitFor(); record(`copy-empty-models-${id}`);
    await page.locator(".model-settings-section").first().getByRole("button", { name: "Добавить модель", exact: true }).first().click();
    record(`modal-chat-${id}`, await description(".llm-provider-modal", "Данные остаются на устройстве, только если сервер работает локально", zoom === 100));
    await page.screenshot({ path: `${output}/chat-model-${id}.png` });
    await page.locator(".llm-provider-modal").getByRole("button", { name: "Отмена", exact: true }).click(); await page.waitForTimeout(200);
    await page.locator("#semantic-search-settings").getByRole("button", { name: "Добавить модель", exact: true }).first().click();
    record(`modal-embedding-${id}`, await description(".semantic-profile-modal", "Модель смыслового поиска настраивается отдельно от ИИ-помощника", zoom === 100));
    await page.screenshot({ path: `${output}/embedding-model-${id}.png` });
    await page.locator(".semantic-profile-modal").getByRole("button", { name: "Отмена", exact: true }).click(); await page.waitForTimeout(200);
    await page.getByRole("button", { name: "ИИ-чат по базе", exact: true }).click(); await page.locator(".rag-project-trigger").waitFor(); await page.waitForTimeout(330);
    if (await page.locator(".rag-conversation-resize").count()) record(`rag-history-drag-${id}`, { samples: await drag(".rag-conversation-resize", 20, ".rag-conversations", "ragConversationWidth") });
    if (await page.locator(".rag-sources-resize").count()) record(`rag-sources-drag-${id}`, { samples: await drag(".rag-sources-resize", -20, ".rag-sources-panel", "ragSourcesWidth") });
    const panelWidths = await page.evaluate(() => Object.fromEntries(["sidebarWidth", "listWidth", "chatWidth", "ragConversationWidth", "ragSourcesWidth"].map((key) => [key, window.qaSettings[key]])));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/rc5-final-ui.html?zoom=${zoom}&theme=${theme}`);
    await page.locator(".rag-project-trigger").waitFor(); await page.waitForTimeout(650);
    assert.deepEqual(await page.evaluate(() => Object.fromEntries(["sidebarWidth", "listWidth", "chatWidth", "ragConversationWidth", "ragSourcesWidth"].map((key) => [key, window.qaSettings[key]]))), panelWidths);
    record(`all-panel-widths-persist-${id}`, panelWidths);
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.locator(".sb .col").click(); await page.waitForTimeout(30);
    assert.equal(await page.locator(".page-shell").evaluate((el) => getComputedStyle(el).transitionDuration), "0s"); record(`reduced-${id}`); await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  assert.deepEqual(errors, []); console.log(`PASS ${results.length} sidebar stability cases`);
} finally { await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
