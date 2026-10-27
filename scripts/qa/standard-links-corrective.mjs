import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
const output = "releases/qa/standard-links-corrective";
await mkdir(output, { recursive: true });
const results = [], errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = "http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html";
const record = (name, detail) => { results.push({ name, ...detail }); console.log(`PASS ${name}`); };
async function action(id) {
  const direct = page.locator(`[data-toolbar-action="${id}"]`);
  if (await direct.count()) return direct;
  await page.getByLabel("Дополнительные инструменты форматирования", { exact: true }).click();
  return page.locator(`[data-toolbar-overflow-action="${id}"]`);
}
try {
  for (const width of [1100, 1440, 1920]) for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) for (const sidebar of ["collapsed", "190", "360"]) {
    const id = `${width}-${zoom}-${theme}-${sidebar}`;
    await page.setViewportSize({ width, height: width === 1100 ? 700 : 900 });
    await page.goto(`${base}?zoom=${zoom}&theme=${theme}&sidebar=${sidebar}`);
    await page.locator('.tiptap a[data-note-link]').first().waitFor();
    await page.waitForTimeout(300);
    const geometry = await page.locator('.toolbar').evaluate((toolbar) => {
      const rect = toolbar.getBoundingClientRect();
      return { width: rect.width, height: rect.height, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
        buttons: [...toolbar.querySelectorAll('button')].map((node) => { const r = node.getBoundingClientRect(); return { id: node.dataset.toolbarAction, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; }), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    assert.ok(geometry.scroll <= geometry.client + 1, JSON.stringify(geometry));
    assert.ok(geometry.buttons.every((button) => button.left >= geometry.left - 1 && button.right <= geometry.right + 1 && button.top >= geometry.top && button.bottom <= geometry.bottom && button.width >= 24 * zoom / 100), JSON.stringify(geometry));
    if (width >= 1440 && zoom === 100) {
      assert.equal(await page.locator('[data-toolbar-action="note-link"]').count(), 1);
      assert.equal(await page.locator('[data-toolbar-action="fragment-link"]').count(), 1);
    }
    record(`toolbar-${id}`, geometry);
    const before = await page.evaluate(() => window.finalQa.commands.filter((command) => command === 'update_note_content').length);
    await (await action('note-link')).click();
    const modal = page.getByRole('dialog', { name: 'Ссылка на заметку', exact: true });
    await modal.getByRole('option').first().waitFor();
    assert.equal(await modal.getByRole('option').count(), 2);
    const field = modal.getByRole('combobox');
    assert.equal(await field.evaluate((node) => node === document.activeElement), true);
    const layout = await modal.evaluate((node) => { const rect = node.getBoundingClientRect(), input = node.querySelector('input'), style = getComputedStyle(input); return { top: rect.top, bottom: rect.bottom, height: rect.height, viewport: innerHeight, inputHeight: input.getBoundingClientRect().height, radius: style.borderRadius, border: style.borderWidth, listHeight: node.querySelector('[role="listbox"]').getBoundingClientRect().height }; });
    assert.ok(layout.top >= 0 && layout.bottom <= layout.viewport + 1); assert.ok(layout.listHeight < 180 * zoom / 100); assert.notEqual(layout.radius, '0px');
    await field.fill('Нет такой заметки'); await modal.getByText('Заметки не найдены', { exact: true }).waitFor();
    await field.fill(''); await modal.getByRole('option').first().waitFor(); assert.equal(await modal.getByRole('option').count(), 2);
    await page.keyboard.press('ArrowDown'); assert.equal(await field.getAttribute('aria-activedescendant'), 'note-link-1');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Закрыть окно');
    await page.keyboard.press('Shift+Tab'); assert.equal(await field.evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press('Escape'); await modal.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.tiptap').evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.evaluate(() => window.finalQa.commands.filter((command) => command === 'update_note_content').length), before);
    record(`picker-keyboard-no-save-${id}`, layout);
    if (width === 1100 && zoom === 160 && sidebar === '360') await page.screenshot({ path: `${output}/${id}.png` });
  }
  for (const count of [10, 100, 1000, 10000]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}?picker-count=${count}`); await page.locator('.tiptap').waitFor();
    await (await action('note-link')).click(); const modal = page.getByRole('dialog', { name: 'Ссылка на заметку' });
    await modal.getByRole('option').first().waitFor();
    assert.equal(await modal.getByRole('option').count(), Math.min(80, count));
    if (count > 80) { await modal.getByRole('button', { name: 'Далее', exact: true }).click(); await page.waitForFunction(() => window.finalQa.searchRequests.at(-1).offset === 80); await modal.getByRole('option').first().waitFor(); assert.equal(await modal.getByRole('option').count(), Math.min(80, count - 80)); }
    await modal.getByRole('combobox').fill(`Заметка ${String(count - 1).padStart(5, '0')}`);
    await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1);
    record(`metadata-${count}`, { count, requests: await page.evaluate(() => window.finalQa.searchRequests) });
  }
  await page.goto(base); await page.locator('.tiptap').waitFor();
  const noteButton = page.locator('[data-toolbar-action="note-link"]');
  await noteButton.click(); await page.getByRole('combobox').waitFor(); await page.keyboard.press('Escape'); await page.getByRole('combobox').waitFor({ state: 'detached' });
  await noteButton.focus(); await page.keyboard.press('Enter'); await page.getByRole('combobox').waitFor();
  await page.keyboard.press('Escape'); await page.getByRole('combobox').waitFor({ state: 'detached' });
  record('note-toolbar-mouse-then-keyboard-reopens-picker', {});
  await page.locator('.tiptap').click(); await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End');
  const selected = await page.evaluate(() => getSelection().toString()); assert.equal(selected, 'Связи');
  const saves = await page.evaluate(() => window.finalQa.commands.filter((command) => command === 'update_note_content').length);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await (await action('fragment-link')).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /noteflow:\/\/note\/source-note\?/);
  assert.equal(await page.evaluate(() => getSelection().toString()), selected);
  assert.equal(await page.evaluate(() => window.finalQa.commands.filter((command) => command === 'update_note_content').length), saves);
  record('fragment-toolbar-selection-clipboard-no-save', { selected });
  await page.locator('.tiptap').focus(); await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+b'); await page.keyboard.press('Control+c');
  const clipboard = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return Promise.all(items.map(async (item) => ({ types: item.types, html: item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '', text: item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : '' })));
  });
  assert.ok(clipboard.some((item) => item.types.includes('text/html') && item.types.includes('text/plain') && /<strong>Связи<\/strong>/.test(item.html) && item.text === 'Связи'));
  record('native-prosemirror-rich-clipboard-browser', { clipboard });
  assert.deepEqual(errors, []);
} finally { await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
console.log(`Standard links corrective PASS ${results.length}`);
