import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const output = "releases/qa/sidebar-gate-timing-probe";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const results = [];
try {
  for (const zoom of [100, 160]) {
    await page.goto(`http://127.0.0.1:1420/scripts/qa/rc5-final-ui.html?reset=1&zoom=${zoom}`);
    await page.locator(".tiptap").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const result = await page.evaluate(async () => {
      const shell = document.querySelector(".workspace");
      const sidebar = document.querySelector(".sb");
      const button = sidebar.querySelector(".new-btn");
      const read = () => ({ viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, visibility: document.visibilityState, zoom: getComputedStyle(document.documentElement).getPropertyValue("--app-zoom"),
        collapsed: shell.classList.contains("collapse-sb"), sidebar: sidebar.getBoundingClientRect().toJSON(), button: button.getBoundingClientRect().toJSON(),
        icon: button.querySelector("svg").getBoundingClientRect().toJSON(), padding: getComputedStyle(sidebar).paddingInline, opacity: getComputedStyle(button.querySelector("span")).opacity, scroll: sidebar.scrollWidth, client: sidebar.clientWidth,
        animations: document.getAnimations().map((animation) => ({ target: animation.effect?.target?.className, property: animation.transitionProperty, pending: animation.pending, time: animation.currentTime, duration: animation.effect?.getTiming().duration })) });
      const committed = new Promise((resolve) => { const observer = new MutationObserver(() => { if (shell.classList.contains("collapse-sb")) { observer.disconnect(); resolve(); } }); observer.observe(shell, { attributes: true, attributeFilter: ["class"] }); });
      const start = performance.now();
      sidebar.querySelector(".col").click();
      await committed;
      const immediate = { elapsed: performance.now() - start, ...read() };
      const animations = document.getAnimations();
      await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { immediate, settled: { elapsed: performance.now() - start, ...read() } };
    });
    assert.ok(Math.abs(result.settled.button.width - result.settled.button.height) < 0.7);
    assert.ok(result.settled.scroll <= result.settled.client + 1);
    assert.equal(result.settled.opacity, "0");
    results.push({ zoom, ...result });
    await page.screenshot({ path: `${output}/settled-${zoom}.png` });
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
