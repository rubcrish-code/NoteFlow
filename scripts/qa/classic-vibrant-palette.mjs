import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { classicVibrant, colorHex, assertClassicContrast } from './classic-vibrant-expectations.mjs';

const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const output = process.env.NOTEFLOW_PALETTE_OUTPUT || 'releases/qa/classic-vibrant-soft/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [];
function readChip(element) {
  const style = getComputedStyle(element);
  const channels = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
    value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const luminance = value => channels(value).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const a = luminance(style.backgroundColor), b = luminance(style.color);
  return { background: style.backgroundColor, foreground: style.color, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05),
    geometry: { radius: style.borderRadius, padding: style.padding, height: style.height, fontSize: style.fontSize,
      lineHeight: style.lineHeight, fontWeight: style.fontWeight, border: style.borderWidth } };
}
try {
  for (const theme of ['light', 'dark']) for (const zoom of [100, 160]) for (const sidebar of ['collapsed', '360']) {
    const page = await browser.newPage({ viewport: { width: 2000, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    const query = `theme=${theme}&zoom=${zoom}&sidebar=${sidebar}`;
    await page.goto(`http://127.0.0.1:1431/scripts/qa/final-ux-fixture.html?${query}`);
    const baseline = await page.locator('.ed-tags .tag').first().evaluate(readChip);
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?${query}`);
    const chips = page.locator('.ed-tags .tag');
    await chips.first().waitFor(); assert.equal(await chips.count(), 10);
    const colors = [];
    for (let index = 0; index < classicVibrant.length; index++) {
      const [name, lightBackground, lightForeground, darkBackground, darkForeground] = classicVibrant[index];
      const chip = chips.nth(index), before = await chip.evaluate(readChip);
      assert.ok((await chip.textContent()).includes(name));
      assert.equal(colorHex(before.background), theme === 'light' ? lightBackground : darkBackground);
      assert.equal(colorHex(before.foreground), theme === 'light' ? lightForeground : darkForeground);
      assert.deepEqual(before.geometry, baseline.geometry, 'No chip shape/size/typography changes');
      await chip.hover(); assert.deepEqual(await chip.evaluate(readChip), before);
      colors.push({ name, ...before, accessibility: assertClassicContrast(before.background, before.foreground, theme, before.ratio) });
    }
    assert.equal(colors.filter(color => !color.accessibility.wcagAa).length, theme === 'light' ? 4 : 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (zoom === 100 && sidebar === 'collapsed') await page.screenshot({ path: `${output}/editor-${theme}.png` });
    await page.getByRole('button', { name: 'Добавить тег к заметке', exact: true }).click();
    await page.getByRole('dialog', { name: 'Теги заметки', exact: true }).waitFor();
    const optionDots = await page.locator('.ed-tag-options .tag-dot').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
    assert.deepEqual(optionDots.map(colorHex), classicVibrant.map(row => row[theme === 'light' ? 1 : 3]));
    await page.keyboard.press('Escape'); await page.locator('.ed-tag-popover').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Теги', exact: true }).click();
    await page.locator('.tag-row .tag-dot').first().waitFor();
    const dots = await page.locator('.tag-row .tag-dot').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
    assert.deepEqual(dots.map(colorHex), classicVibrant.map(row => row[theme === 'light' ? 1 : 3]));
    if (zoom === 100 && sidebar === 'collapsed') await page.screenshot({ path: `${output}/tags-${theme}.png` });
    await page.getByRole('button', { name: 'Новый тег', exact: true }).click();
    const dialog = page.getByRole('dialog'), radios = dialog.getByRole('radio');
    assert.equal(await radios.count(), 10);
    for (const [name, lightBackground, lightForeground, darkBackground, darkForeground] of classicVibrant) {
      const radio = dialog.getByRole('radio', { name, exact: true });
      await radio.click(); assert.equal(await radio.getAttribute('aria-checked'), 'true');
      const swatch = await radio.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color }));
      assert.equal(colorHex(swatch.background), theme === 'light' ? lightBackground : darkBackground);
      assert.equal(colorHex(swatch.color), theme === 'light' ? lightForeground : darkForeground);
      assert.equal(await dialog.locator('[role="radio"][aria-checked="true"]').count(), 1);
    }
    if (zoom === 100 && sidebar === 'collapsed') await page.screenshot({ path: `${output}/palette-${theme}.png` });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); assert.equal(await dialog.count(), 0);
    results.push({ theme, zoom, sidebar, colors, unchangedGeometry: baseline.geometry, selections: 10, uniformTagPage: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${results.length} exact-palette/theme/zoom/sidebar cases; 4 acknowledged light AA exceptions, 0 dark exceptions`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
