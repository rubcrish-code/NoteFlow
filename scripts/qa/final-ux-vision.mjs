import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const output = 'releases/qa/final-ux-vision';
await mkdir(output, { recursive: true });
const results = [];
try {
  const cdp = await page.context().newCDPSession(page);
  for (const theme of ['light', 'dark']) {
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?theme=${theme}`);
    await page.locator('.ed-tags .tag').first().waitFor();
    const contrast = await page.locator('.ed-tags .tag').evaluateAll((nodes) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const rgb = (color) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const luminance = (color) => rgb(color).map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return nodes.map((node) => { const style = getComputedStyle(node); return { name: node.textContent, text: ratio(luminance(style.color), luminance(style.backgroundColor)), radius: style.borderRadius, border: style.borderWidth, padding: style.padding, marker: getComputedStyle(node, '::before').content }; });
    });
    assert.ok(contrast.every((color) => color.text >= 4.5));
    assert.ok(contrast.every((color) => color.radius === '6px' && color.border === '0px' && color.padding === '2px 7px' && color.marker === 'none'), JSON.stringify(contrast));
    for (const type of ['none', 'deuteranopia', 'protanopia', 'tritanopia', 'achromatopsia']) {
      await cdp.send('Emulation.setEmulatedVisionDeficiency', { type });
      const labels = await page.locator('.ed-tags .tag > span').allTextContents();
      assert.equal(labels.length, 10); assert.equal(new Set(labels).size, 10);
      await page.screenshot({ path: `${output}/${theme}-${type}.png` });
      results.push({ theme, vision: type, labels, contrast });
    }
  }
  console.log(`PASS ${results.length} vision/theme cases`);
  console.log(JSON.stringify(results.filter((item) => item.vision === 'none').map((item) => ({ theme: item.theme, contrast: item.contrast }))));
} finally { await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
