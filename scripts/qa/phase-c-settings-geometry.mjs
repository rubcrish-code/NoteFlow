import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";

if (!process.env.NOTEFLOW_QA_NODE_MODULES) throw new Error("Set NOTEFLOW_QA_NODE_MODULES to the bundled Playwright runtime");
const require = createRequire(path.join(process.env.NOTEFLOW_QA_NODE_MODULES, "qa-runtime.cjs"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const output = path.join(process.env.TEMP, "noteflow-phase-c-settings-geometry");
await mkdir(output, { recursive: true });
const panels = ["Основные", "Модели ИИ", "Внешний вид", "Данные и экспорт", "Горячие клавиши", "О приложении"];

async function measure(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      const box = element.getBoundingClientRect();
      return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, width: box.width, height: box.height };
    };
    const main = document.querySelector(".simple-page");
    const zoom = Number(new URLSearchParams(location.search).get("zoom")) / 100;
    const labels = Array.from(document.querySelectorAll(".settings-nav span"));
    const padding = parseFloat(getComputedStyle(main).paddingLeft) * zoom;
    const rail = rect(".page-shell > .sb");
    const nav = rect(".settings-nav-col");
    const content = rect(".settings-content");
    return { rail, nav, content, padding, zoom, viewport: innerWidth, viewportHeight: innerHeight,
      shell: rect(".page-shell"),
      mode: document.querySelector(".settings-layout-inner").dataset.layout,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      labelsVisible: labels.length === 6 && labels.every((label) => getComputedStyle(label).display !== "none" && label.getBoundingClientRect().width > 0),
      railLabelsHidden: Array.from(document.querySelectorAll(".sb .nav-i span")).every((label) => getComputedStyle(label).display === "none"),
    };
  });
}

function verify(metrics, collapsed) {
  assert.ok(Math.abs(metrics.shell.width - metrics.viewport) <= 1, "QA shell must fill physical viewport width at every zoom");
  assert.ok(Math.abs(metrics.shell.height - metrics.viewportHeight) <= 1, "QA shell must fill physical viewport height at every zoom");
  assert.ok(metrics.overflow <= 1, JSON.stringify(metrics));
  assert.equal(metrics.labelsVisible, true, "All Settings navigation labels must remain visible");
  assert.ok(metrics.nav.width > 0 && metrics.content.width > 0, JSON.stringify(metrics));
  assert.ok(metrics.content.right <= metrics.viewport + 1, JSON.stringify(metrics));
  assert.ok(Math.abs(metrics.nav.x - metrics.rail.right - metrics.padding) <= 2, "Settings starts after actual rail and intended page padding");
  if (metrics.mode === "wide") {
    assert.ok(metrics.content.x >= metrics.nav.right, "Content must not overlap Settings navigation");
    assert.ok(metrics.content.x - metrics.nav.right <= 41 * metrics.zoom, "No excessive Settings gutter");
    assert.ok(metrics.nav.width <= 191 * metrics.zoom, "Settings navigation must not stretch");
  } else assert.ok(metrics.content.y >= metrics.nav.bottom, "Compact navigation stays above content");
  if (collapsed) {
    assert.ok(Math.abs(metrics.rail.width - 74) <= 1, JSON.stringify(metrics));
    assert.equal(metrics.railLabelsHidden, true, "Main rail remains icon-only");
  }
}

let cases = 0;
try {
  for (const [width, height] of [[1100, 700], [1440, 900], [1920, 1080], [2560, 1440]]) {
    for (const zoom of [100, 125, 160]) for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:1420/scripts/qa/phase-c-settings-fixture.html?zoom=${zoom}&theme=${theme}`);
      const navigation = page.getByRole("complementary", { name: "Разделы настроек" });
      await navigation.waitFor();
      await page.waitForTimeout(350);
      const expanded = await measure(page);
      verify(expanded, false);
      for (let cycle = 0; cycle < 5; cycle++) {
        await page.getByRole("button", { name: "Свернуть боковую панель", exact: true }).click();
        await page.waitForTimeout(350);
        const collapsed = await measure(page);
        verify(collapsed, true);
        assert.ok(Math.abs((expanded.rail.width - collapsed.rail.width) - (expanded.nav.x - collapsed.nav.x)) <= 4,
          "Settings navigation must move with MainSidebar, not retain an expanded offset");
        if (expanded.mode === "wide" && collapsed.mode === "wide") assert.ok(Math.abs(expanded.nav.width - collapsed.nav.width) <= 1);
        if (cycle === 0) {
          for (const panel of panels) {
            await navigation.getByRole("button", { name: panel, exact: true }).click();
            await page.waitForTimeout(60);
            verify(await measure(page), true);
            assert.equal(await navigation.getByRole("button", { name: panel, exact: true }).getAttribute("aria-current"), "page");
          }
          await page.screenshot({ path: path.join(output, `${width}-${height}-${zoom}-${theme}-collapsed.png`) });
        }
        await page.getByRole("button", { name: "Развернуть боковую панель", exact: true }).click();
        await page.waitForTimeout(350);
        verify(await measure(page), false);
      }
      assert.deepEqual(errors, []);
      console.log(`${width}x${height}@${zoom} ${theme}: PASS, nav ${expanded.nav.x.toFixed(1)} -> ${(expanded.nav.x - 176).toFixed(1)}`);
      cases++;
      await page.close();
    }
  }
} finally { await browser.close(); }
console.log(`${cases} geometry cases passed; five live collapse/expand cycles per case; six Settings subpages. Screenshots: ${output}`);
