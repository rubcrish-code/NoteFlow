import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(path.join(process.env.NOTEFLOW_QA_NODE_MODULES, "qa-runtime.cjs"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const output = path.join(process.env.TEMP, "noteflow-phase-d-geometry"); await mkdir(output, { recursive: true });
let cases = 0;
async function assertCalendarCaptionAlignment(page) {
  const controls = await page.locator(".date-picker-nav").evaluate((nav) => [...nav.querySelectorAll("button")].map((button) => {
    const style = getComputedStyle(button), bounds = button.getBoundingClientRect();
    const label = button.querySelector(".date-picker-caption-label"), icon = button.querySelector("svg");
    const labelBounds = label?.getBoundingClientRect(), iconBounds = icon?.getBoundingClientRect();
    return { caption: button.classList.contains("date-picker-caption-trigger"), height: bounds.height, display: style.display,
      align: style.alignItems, justify: style.justifyContent, lineHeight: style.lineHeight, iconDisplay: icon ? getComputedStyle(icon).display : null,
      centeredLabel: !labelBounds || Math.abs(labelBounds.y + labelBounds.height / 2 - bounds.y - bounds.height / 2) <= 1,
      centeredIcon: !iconBounds || Math.abs(iconBounds.y + iconBounds.height / 2 - bounds.y - bounds.height / 2) <= 1,
      fits: !labelBounds || !iconBounds || (labelBounds.x >= bounds.x && labelBounds.right <= iconBounds.x && iconBounds.right <= bounds.right) };
  }));
  assert.equal(controls.length, 4);
  assert.ok(controls.every((control) => Math.abs(control.height - controls[0].height) <= 1), "all caption controls share a height");
  const captions = controls.filter((control) => control.caption);
  assert.equal(captions.length, 2);
  for (const control of captions) {
    assert.ok(["flex", "inline-flex"].includes(control.display)); assert.equal(control.align, "center"); assert.equal(control.justify, "space-between");
    assert.notEqual(control.lineHeight, "normal"); assert.equal(control.iconDisplay, "block");
    assert.ok(control.centeredLabel && control.centeredIcon && control.fits, `caption alignment: ${JSON.stringify(control)}`);
  }
}
try {
  for (const [width, height] of [[1100, 700], [1440, 900]]) for (const zoom of [100, 125, 160]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: Math.round(width * 100 / zoom), height: Math.round(height * 100 / zoom) }, deviceScaleFactor: zoom / 100 });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/phase-d-image-fixture.html?theme=${theme}`);
    await page.locator(".image-crop-layer").waitFor();
    await page.waitForTimeout(250);
    const layer = await page.locator(".image-crop-layer").boundingBox();
    const handle = await page.getByRole("button", { name: "Изменить область обрезки справа", exact: true }).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(layer.x + layer.width / 2, layer.y + layer.height / 2, { steps: 10 }); await page.mouse.up();
    const expectedWidth = await page.locator(".image-crop-rect").evaluate((element) => Math.round(parseFloat(element.style.width) / 100 * 1200));
    await page.getByRole("button", { name: "Рисование", exact: true }).click();
    const canvas = page.locator(".image-annotation-surface canvas"); await canvas.waitFor();
    const bitmap = await canvas.evaluate((element) => ({ width: element.width, height: element.height }));
    assert.equal(bitmap.width, expectedWidth, JSON.stringify({ bitmap, layer })); assert.equal(bitmap.height, 800);
    for (const color of ["#16a34a", "#dc2626"]) {
      await page.getByLabel("Цвет", { exact: true }).fill(color);
      const accent = await page.getByRole("slider", { name: "Толщина", exact: true }).evaluate((element) => getComputedStyle(element).accentColor);
      const expected = color === "#16a34a" ? "rgb(22, 163, 74)" : "rgb(220, 38, 38)";
      assert.equal(accent, expected, "slider must preview the actual drawing color");
      const focusColor = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--focus-ring").trim());
      assert.ok(!focusColor.includes(color), "global focus token must not be overridden by drawing color");
    }
    await page.getByLabel("Цвет", { exact: true }).fill("#3b6ef2");
    await page.getByRole("button", { name: "Прямоугольник", exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, { steps: 10 }); await page.mouse.up();
    const hasShape = await canvas.evaluate((element) => {
      const context = element.getContext("2d"); const bytes = context.getImageData(0, 0, element.width, element.height).data;
      return bytes.some((value, index) => index % 4 === 2 && value > 120 && bytes[index - 2] < 120);
    });
    assert.ok(hasShape, "rectangle must already be rasterized before adding text");
    await page.getByRole("button", { name: "Перемещение", exact: true }).click();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 10 }); await page.mouse.up();
    assert.equal(await canvas.getAttribute("data-selected"), "true");
    await page.keyboard.press("Escape"); assert.equal(await canvas.getAttribute("data-selected"), "false");
    await page.getByRole("button", { name: "Текст", exact: true }).click();
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.getByRole("textbox", { name: "Текст на изображении" }).fill("Схема");
    await page.getByRole("button", { name: "Добавить текст", exact: true }).click();
    await page.getByRole("button", { name: "Перемещение", exact: true }).click();
    await page.mouse.move(box.x + box.width * 0.22, box.y + box.height * 0.21); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.21, { steps: 5 }); await page.mouse.up();
    assert.equal(await canvas.getAttribute("data-selected"), "true");
    await page.getByRole("button", { name: "Сбросить изменения", exact: true }).click();
    await page.getByRole("dialog", { name: "Сбросить изменения?", exact: true }).waitFor();
    const gap = await page.getByRole("dialog", { name: "Сбросить изменения?", exact: true }).locator("footer").evaluate((element) => parseFloat(getComputedStyle(element).gap));
    assert.ok(gap > 0, "shared reset action gap must be nonzero");
    await page.getByRole("dialog", { name: "Сбросить изменения?", exact: true }).getByRole("button", { name: "Отмена", exact: true }).click();
    await page.waitForTimeout(160);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `horizontal overflow: ${overflow}`);
    await page.screenshot({ path: path.join(output, `${width}-${height}-${zoom}-${theme}.png`) });
    await page.getByRole("button", { name: "Применить", exact: true }).click();
    await page.locator("#qa-result").waitFor();
    const pixels = await page.locator("#qa-result").evaluate(async (element) => {
      await element.decode(); const canvas = document.createElement("canvas"); canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
      const context = canvas.getContext("2d"); context.drawImage(element, 0, 0);
      const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let blue = 0;
      for (let index = 0; index < bytes.length; index += 4) if (bytes[index] < 120 && bytes[index + 1] < 170 && bytes[index + 2] > 120) blue++;
      const blueNear = (x, y) => {
        const data = context.getImageData(Math.round(x * canvas.width) - 6, Math.round(y * canvas.height) - 6, 13, 13).data;
        return data.some((value, index) => index % 4 === 2 && value > 120 && data[index - 2] < 120);
      };
      return { width: canvas.width, height: canvas.height, blue, oldPosition: blueNear(0.3, 0.5), movedPosition: blueNear(0.4, 0.55), corner: [...context.getImageData(1, 1, 1, 1).data] };
    });
    assert.deepEqual(pixels.corner, [255, 0, 0, 255]); assert.ok(pixels.blue > 100, JSON.stringify(pixels)); assert.equal(pixels.width, expectedWidth); assert.equal(pixels.height, 800);
    assert.equal(pixels.oldPosition, false, "move must not leave a duplicate"); assert.equal(pixels.movedPosition, true, "applied PNG must contain moved shape");
    await page.getByRole("button", { name: "22.09.2026" }).click();
    await page.waitForTimeout(220);
    await assertCalendarCaptionAlignment(page);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-date")), "2026-09-22", "calendar must focus the visible selected day");
    await page.getByRole("button", { name: "Месяц", exact: true }).click(); await page.getByRole("button", { name: "Январь", exact: true }).click();
    await page.getByRole("button", { name: "Месяц", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Год");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Месяц");
    await page.getByRole("button", { name: "Год", exact: true }).click();
    await page.waitForTimeout(220);
    await assertCalendarCaptionAlignment(page);
    const yearPopover = await page.getByRole("dialog", { name: "Выбор года", exact: true }).boundingBox();
    const viewport = page.viewportSize(); assert.ok(yearPopover.x >= 0 && yearPopover.y >= 0 && yearPopover.x + yearPopover.width <= viewport.width + 1 && yearPopover.y + yearPopover.height <= viewport.height + 1);
    await page.screenshot({ path: path.join(output, `calendar-${width}-${height}-${zoom}-${theme}.png`) });
    await page.getByRole("button", { name: "2030", exact: true }).click();
    await page.getByRole("gridcell", { name: "05.01.2030" }).click();
    await page.getByRole("button", { name: "05.01.2030" }).waitFor();
    await page.getByRole("button", { name: "Выноска", exact: true }).click();
    await page.waitForTimeout(220);
    const palette = page.getByRole("menu", { name: "Цвет выноски", exact: true });
    const paletteBox = await palette.boundingBox();
    assert.ok(paletteBox.x >= 0 && paletteBox.y >= 0 && paletteBox.x + paletteBox.width <= viewport.width + 1 && paletteBox.y + paletteBox.height <= viewport.height + 1);
    const backgrounds = await palette.locator(".callout-preview").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
    assert.equal(new Set(backgrounds).size, 4, "all four miniature callouts must show their actual color");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Синяя выноска", "opening palette must focus a visible tile");
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Зелёная выноска");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Выноска", exact: true }).click();
    assert.equal(await page.getByRole("menuitemradio", { name: "Зелёная выноска", exact: true }).getAttribute("aria-checked"), "true");
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(output, `palette-${width}-${height}-${zoom}-${theme}.png`) });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Новая QA заметка", exact: true }).click();
    const newNote = page.getByRole("dialog", { name: "Создать заметку", exact: true });
    await newNote.locator(".date-picker-trigger").click();
    await assertCalendarCaptionAlignment(page);
    await page.getByRole("button", { name: "Год", exact: true }).click();
    await page.waitForTimeout(220);
    await assertCalendarCaptionAlignment(page);
    const nestedYear = await page.getByRole("dialog", { name: "Выбор года", exact: true }).boundingBox();
    assert.ok(nestedYear.x >= 0 && nestedYear.y >= 0 && nestedYear.x + nestedYear.width <= viewport.width + 1 && nestedYear.y + nestedYear.height <= viewport.height + 1);
    await page.keyboard.press("Escape"); assert.equal(await newNote.count(), 1);
    await page.keyboard.press("Escape"); assert.equal(await newNote.count(), 1);
    await newNote.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.waitForTimeout(180);
    assert.deepEqual(errors, []); console.log(`${width}x${height}@${zoom} ${theme}: PASS ${JSON.stringify(pixels)}`); cases++; await page.close();
  }
  for (const [width, height] of [[800, 1200], [800, 800], [4096, 3072], [64, 48]]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await page.goto(`http://127.0.0.1:1420/scripts/qa/phase-d-image-fixture.html?width=${width}&height=${height}`);
    await page.locator(".image-crop-layer").waitFor();
    await page.getByRole("button", { name: "Рисование", exact: true }).click();
    await page.getByRole("button", { name: "Прямоугольник", exact: true }).click();
    const canvas = page.locator(".image-annotation-surface canvas"); await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 }); await page.mouse.up();
    await page.getByRole("button", { name: "Обрезка", exact: true }).click();
    let expectedWidth = width;
    for (const pass of [1, 2]) {
      await page.locator(".image-crop-layer").waitFor();
      await page.waitForTimeout(150);
      const layer = await page.locator(".image-crop-layer").boundingBox();
      const handle = await page.getByRole("button", { name: "Изменить область обрезки справа", exact: true }).boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
      await page.mouse.move(layer.x + layer.width * 0.8, layer.y + layer.height / 2, { steps: 5 }); await page.mouse.up();
      expectedWidth = await page.locator(".image-crop-rect").evaluate((element, bitmapWidth) => Math.round(parseFloat(element.style.width) / 100 * bitmapWidth), expectedWidth);
      await page.getByRole("button", { name: "Применить", exact: true }).click();
      const pixels = await page.locator("#qa-result").evaluate(async (element) => {
        await element.decode(); const canvas = document.createElement("canvas"); canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
        const context = canvas.getContext("2d"); context.drawImage(element, 0, 0);
        const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
        return { width: canvas.width, height: canvas.height, blue: bytes.some((value, index) => index % 4 === 2 && value > 120 && bytes[index - 2] < 120) };
      });
      assert.equal(pixels.width, expectedWidth); assert.equal(pixels.height, height); assert.ok(pixels.blue, `${width}x${height} lost annotation after crop ${pass}`);
      if (pass === 1) await page.getByRole("button", { name: "Редактор", exact: true }).click();
    }
    console.log(`${width}x${height} draw -> crop -> reopen -> repeat crop: PASS`); cases++; await page.close();
  }
} finally { await browser.close(); }
console.log(`${cases} real-canvas browser cases passed. Screenshots: ${output}`);
