import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const output = "releases/qa/final-ux-geometry";
await mkdir(output, { recursive: true });
const results = [], errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const record = (name, detail) => { results.push({ name, ...detail }); console.log(`PASS ${name}`); };
const base = "http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html";
try {
  for (const width of [1100, 1920]) for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) {
    const id = `${width}-${zoom}-${theme}`;
    await page.setViewportSize({ width, height: width === 1100 ? 700 : 1080 });
    await page.goto(`${base}?zoom=${zoom}&theme=${theme}`);
    await page.locator('.tiptap a[data-note-link]').first().waitFor();
    const colors = await page.locator('.ed-tags .tag[style]').evaluateAll((nodes) => nodes.map((node) => ({ color: getComputedStyle(node).getPropertyValue('--tag-color'), text: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor })));
    assert.equal(new Set(colors.map((color) => color.color)).size, 10); record(`colors-${id}`, { colors });
    const updatesBefore = await page.evaluate(() => window.finalQa.commands.filter((command) => command === 'update_note_content').length);
    await page.locator('.tiptap a').filter({ hasText: 'Открыть фрагмент' }).click();
    await page.locator('.note-fragment-target').waitFor();
    await page.waitForFunction(() => {
      const node = document.querySelector('.note-fragment-target');
      if (!node) return false;
      const rect = node.getBoundingClientRect(), viewport = node.closest('.ed-scroll').getBoundingClientRect();
      return rect.top >= viewport.top - 1 && rect.bottom <= Math.min(viewport.bottom, innerHeight) + 1;
    }, undefined, { timeout: 2000 });
    await page.waitForTimeout(300);
    const fragment = await page.locator('.note-fragment-target').first().evaluate((node) => {
      const rect = node.getBoundingClientRect(), viewport = node.closest('.ed-scroll').getBoundingClientRect();
      const scroll = node.closest('.ed-scroll');
      return { top: rect.top, bottom: rect.bottom, viewportTop: viewport.top, viewportBottom: Math.min(viewport.bottom, innerHeight), text: node.textContent, windowScroll: scrollY, scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight, offsetHeight: scroll.offsetHeight };
    });
    if (!(fragment.top >= fragment.viewportTop - 1 && fragment.bottom <= fragment.viewportBottom + 1)) await page.screenshot({ path: `${output}/failure-${id}.png` });
    assert.ok(fragment.top >= fragment.viewportTop - 1 && fragment.bottom <= fragment.viewportBottom + 1, JSON.stringify(fragment));
    assert.match(fragment.text, /Фрагмент для точного/);
    assert.equal(await page.evaluate(() => window.finalQa.commands.filter((command) => command === 'update_note_content').length), updatesBefore);
    record(`fragment-scroll-no-save-${id}`, fragment);
    await page.getByLabel(/QA help:/).focus();
    await page.locator('[role="tooltip"]').waitFor();
    const tip = await page.locator('[role="tooltip"]').evaluate((node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, align: getComputedStyle(node).textAlign }; });
    assert.equal(tip.align, 'left'); assert.ok(tip.left >= 0 && tip.right <= tip.width + 1 && tip.bottom <= tip.height + 1); record(`tooltip-${id}`, tip);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Новая заметка', exact: true }).click();
    await page.getByPlaceholder('Например, Итоги встречи').fill('👩🏽‍💻'.repeat(26));
    assert.equal(await page.getByRole('button', { name: 'Создать заметку', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('.entity-name-counter.exceeded').count(), 1);
    assert.equal(await page.locator('.date-picker-readable').count(), 0);
    const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(overflow.scroll <= overflow.client + 1); record(`name-date-layout-${id}`, overflow);
    if (width === 1100 && zoom === 160) await page.screenshot({ path: `${output}/${id}.png` });
    await page.keyboard.press('Escape');
    await page.goto(`${base}?onboarding=1&zoom=${zoom}&theme=${theme}`);
    const name = page.getByPlaceholder('Ваше имя'); await name.waitFor();
    assert.equal(await page.locator('.onboarding-steps').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Продолжить', exact: true }).isDisabled(), true);
    await name.fill('Анна 👩🏽‍💻'); await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await page.locator('.onboarding-steps').waitFor();
    assert.equal(await page.locator('.onboarding-steps button').count(), 6);
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    const icons = await page.locator('.onboarding-steps').evaluate((node) => ({ completed: node.querySelectorAll('.completed').length, rects: [...node.querySelectorAll('button')].map((button) => { const r = button.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }), width: innerWidth, height: innerHeight }));
    assert.equal(icons.completed, 2); assert.ok(icons.rects.every((r) => r.left >= 0 && r.right <= icons.width && r.top >= 0 && r.bottom <= icons.height));
    const progressColors = await page.locator('.onboarding-steps').evaluate((node) => ({ current: getComputedStyle(node.querySelector('[aria-current="step"]')).backgroundColor, completed: getComputedStyle(node.querySelector('.completed button:not([aria-current])')).backgroundColor }));
    assert.notEqual(progressColors.current, progressColors.completed, 'current/completed CSS priority');
    assert.ok(icons.rects.every((r) => Math.abs(r.top - icons.rects[0].top) < 1)); record(`onboarding-${id}`, icons);
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
console.log(`Final UX geometry PASS ${results.length}`);
