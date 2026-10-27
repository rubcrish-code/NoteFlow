import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { samplePanelMotion, settlePanelLayout } from "./panel-motion.mjs";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const output = "releases/qa/sidebar-gate-motion-regression";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const results = [], errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const record = (name, detail) => { results.push({ name, ...detail }); console.log(`PASS ${name}`); };
const url = (zoom = 100, theme = "light") => `http://127.0.0.1:1420/scripts/qa/rc5-final-ui.html?reset=1&zoom=${zoom}&theme=${theme}`;
function capture() {
  const sidebar = document.querySelector(".sb"), button = sidebar.querySelector(".new-btn"), icon = button.querySelector("svg");
  return { width: sidebar.getBoundingClientRect().width, button: button.getBoundingClientRect().toJSON(), icon: icon.getBoundingClientRect().toJSON(),
    collapsed: document.querySelector(".workspace").classList.contains("collapse-sb"), scroll: sidebar.scrollWidth, client: sidebar.clientWidth,
    opacity: +getComputedStyle(button.querySelector("span")).opacity, rootScroll: document.documentElement.scrollWidth, viewport: innerWidth };
}
async function load(zoom = 100, theme = "light") {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(url(zoom, theme)); await page.locator(".tiptap").waitFor(); await settlePanelLayout(page);
}
function verify(sampled, direction) {
  for (const trajectory of [sampled.frames, sampled.playback]) for (const [index, frame] of trajectory.entries()) {
    assert.ok(frame.scroll <= frame.client + 1 && frame.rootScroll <= frame.viewport);
    assert.ok(Math.abs(frame.icon.width - sampled.initial.icon.width) < 0.7);
    assert.ok(Math.abs(frame.icon.height - sampled.initial.icon.height) < 0.7);
    if (index) assert.ok(direction * (frame.width - trajectory[index - 1].width) >= -0.7);
  }
  assert.ok(new Set(sampled.frames.map((frame) => Math.round(frame.width))).size > 3);
  assert.ok(Math.abs(sampled.frames.at(-1).width - sampled.playback.at(-1).width) < 0.7);
  const compact = direction < 0 ? sampled.frames.at(-1) : sampled.frames[0];
  assert.ok(Math.abs(compact.width - 74) < 0.7);
  assert.ok(Math.abs(compact.button.width - compact.button.height) < 0.7);
  assert.ok(compact.opacity < 0.001);
}
try {
  for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) {
    await load(zoom, theme);
    const collapse = await samplePanelMotion(page, ".sb .col", capture); verify(collapse, -1);
    const expand = await samplePanelMotion(page, ".sb .col", capture); verify(expand, 1);
    record(`observed-phases-and-playback-${zoom}-${theme}`, { collapse, expand });
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.locator(".sb .col").click();
    await settlePanelLayout(page);
    const reduced = await page.evaluate(capture);
    assert.ok(Math.abs(reduced.button.width - reduced.button.height) < 0.7);
    assert.ok(reduced.scroll <= reduced.client + 1); assert.equal(reduced.opacity, 0);
    record(`reduced-motion-paint-completion-${zoom}-${theme}`, reduced);
  }
  await load();
  const missed = await page.evaluate(async () => {
    const toggle = document.querySelector(".sb .col"), click = toggle.click.bind(toggle), frames = [], start = performance.now();
    toggle.click = () => setTimeout(click, 1200);
    toggle.click();
    await new Promise((resolve) => { function sample() { frames.push({ elapsed: performance.now() - start, width: document.querySelector(".sb").getBoundingClientRect().width }); if (performance.now() - start < 320) requestAnimationFrame(sample); else resolve(); } requestAnimationFrame(sample); });
    return frames;
  });
  assert.equal(new Set(missed.map((frame) => frame.width)).size, 1, "Old wall-clock sampling must miss the deliberately queued action");
  record("old-wall-clock-window-misses-queued-action", { injectedInputDelay: 1200, frames: missed });
  await page.waitForFunction(() => document.querySelector(".workspace").classList.contains("collapse-sb"));
  await settlePanelLayout(page);
  const delayed = await samplePanelMotion(page, ".sb .col", capture); verify(delayed, 1);
  assert.ok(delayed.foundAt - delayed.requestedAt >= 1200);
  record("observed-phase-waits-for-queued-action", { injectedInputDelay: 1200, ...delayed });
  for (const [name, declaration, error] of [
    ["missing-transition", "transition:none", /No grid transition/],
    ["wrong-duration", "transition-duration:250ms", /approved duration/],
    ["wrong-easing", "transition-timing-function:linear", /cubic-bezier/],
  ]) {
    await load();
    await page.addStyleTag({ content: `.workspace { ${declaration} !important; }` });
    await assert.rejects(() => samplePanelMotion(page, ".sb .col", capture), error);
    record(`rejects-${name}`, { declaration });
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${results.length} panel motion synchronization cases`);
} finally { await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
