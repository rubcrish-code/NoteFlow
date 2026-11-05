import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = 'releases/qa/architecture-layout';
await mkdir(output, { recursive: true });
const results = [], errors = [];
const settled = page => page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))); });
function geometry() {
  const toolbar = document.querySelector('.toolbar'), editor = document.querySelector('.tiptap'), t = toolbar.getBoundingClientRect();
  const chat = document.querySelector('.note-chat'), c = chat?.getBoundingClientRect();
  return { height: t.height, width: t.width, right: t.right, scroll: toolbar.scrollWidth, client: toolbar.clientWidth,
    viewport: innerWidth, rootScroll: document.documentElement.scrollWidth,
    chat: c && { x: c.x, right: c.right, position: getComputedStyle(chat.parentElement).position },
    sameEditor: editor.editor === window.qaArchitectureEditor,
    content: JSON.stringify(editor.editor.getJSON()),
    controls: [...toolbar.querySelectorAll('[data-toolbar-action]')].map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.toolbarAction, x: r.x - t.x, y: r.y - t.y, width: r.width }; }) };
}
function verify(g, zoom) {
  assert.equal(g.controls.length, 31); assert.ok(g.rootScroll <= g.viewport + 1); assert.ok(g.scroll <= g.client + 1);
  assert.ok(g.controls.every(e => e.width >= 24 * zoom / 100 - .2));
  assert.ok(g.controls.every(e => Math.abs(e.y - g.controls[0].y) < .2));
  assert.ok(Math.abs(g.width - g.controls.at(-1).x - g.controls.at(-1).width - g.controls[0].x) < .3, 'AI has the same outer inset as Undo');
  const centers = g.controls.slice(-3).map(e => e.x + e.width / 2);
  assert.ok(Math.abs(centers[2] - 2 * centers[1] + centers[0]) < .3, 'AI follows the same tool rhythm as its neighbors');
  if (g.chat && g.chat.right > g.chat.x) { assert.ok(g.right <= g.chat.x + .2); assert.notEqual(g.chat.position, 'absolute'); }
}
try {
  for (const dpi of [1, 1.25, 1.5]) for (const zoom of [100, 160]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 3000, height: 1000 }, deviceScaleFactor: dpi });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?sidebar=190&zoom=${zoom}&theme=${theme}&chat-ready`);
    await page.locator('.tiptap').waitFor();
    await page.locator('[data-tooltip="Чат по заметке"]').click();
    await page.locator('.note-chat strong', { hasText: 'История QA' }).waitFor();
    await page.locator('.note-chat textarea').fill('Сохранённый черновик QA');
    await settled(page); await page.waitForTimeout(500);
    await page.evaluate(() => { window.qaArchitectureEditor = document.querySelector('.tiptap').editor; });
    const original = await page.evaluate(geometry);
    for (const selector of ['.resize-sb', '.resize-list', '.chat-resize']) {
      const h = await page.locator(selector).boundingBox(); assert.ok(h);
      const panel = page.locator(selector === '.resize-sb' ? '.sb' : selector === '.resize-list' ? '.list' : '.note-chat');
      const beforeWidth = (await panel.boundingBox()).width;
      await page.evaluate(() => { window.finalQa.commands.length = 0; window.qaArchitectureFrames = []; window.qaArchitectureRecording = true; });
      await page.evaluate(() => {
        const toolbar = document.querySelector('.toolbar'), controls = [...toolbar.querySelectorAll('[data-toolbar-action]')];
        const tick = () => { if (!window.qaArchitectureRecording) return; const r = toolbar.getBoundingClientRect();
          const slots = [...toolbar.querySelectorAll('.toolbar-slot')], weights = slots.map(e => Number(getComputedStyle(e).flexGrow)), total = weights.reduce((a,b)=>a+b,0);
          window.qaArchitectureFrames.push({ width:r.width, height: r.height, controls: controls.map(e => { const b = e.getBoundingClientRect(), index = slots.indexOf(e.closest('.toolbar-slot')); return { x: b.x-r.x, y:b.y-r.y, width:b.width, rank:(weights.slice(0,index).reduce((a,b)=>a+b,0)+weights[index]/2)/total, connected:e.isConnected }; }) }); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2 + (selector === '.chat-resize' ? -70 : 70), h.y + h.height / 2, { steps: 40 });
      await page.waitForTimeout(400);
      const held = await page.evaluate(() => ({ commands: [...window.finalQa.commands], resizing: document.querySelector('.workspace').dataset.panelResizing }));
      assert.equal(held.resizing, 'true'); assert.equal(held.commands.filter(c => c === 'update_ui_settings').length, 0);
      assert.equal(held.commands.filter(c => c === 'update_note_content').length, 0);
      await page.mouse.up(); await page.waitForTimeout(500);
      assert.ok(Math.abs((await panel.boundingBox()).width - beforeWidth - 70) < 1.2, 'panel follows the physical pointer, including CSS zoom fallback');
      const state = await page.evaluate(geometry); verify(state, zoom);
      const frames = await page.evaluate(() => { window.qaArchitectureRecording = false; return window.qaArchitectureFrames; });
      assert.ok(frames.length > 20);
      for (const f of frames) for (const [index, control] of f.controls.entries()) {
        assert.equal(control.connected, true);
        assert.ok(Math.abs(control.x-frames[0].controls[index].x-control.rank*(f.width-frames[0].width))<.2, 'Controls must follow one affine distribution without oscillating');
        assert.ok(Math.abs(control.width-frames[0].controls[index].width)<.2);
        assert.ok(Math.abs(f.height-frames[0].height)<.1);
      }
      const commands = await page.evaluate(() => [...window.finalQa.commands]);
      assert.equal(commands.filter(c => c === 'update_ui_settings').length, 1);
      assert.equal(commands.filter(c => c === 'get_note_ai_status' || c === 'list_note_chat_messages').length, 0);
      assert.equal(state.sameEditor, true); assert.equal(state.content, original.content);
      assert.equal(await page.locator('.note-chat textarea').inputValue(), 'Сохранённый черновик QA');
      results.push({ name: `${selector}-${zoom}-${theme}-${dpi}`, frames: frames.length, held, commands });
      await writeFile(`${output}/${selector.slice(1)}-${zoom}-${theme}-${dpi}.json`, JSON.stringify(frames));
    }
    await page.locator('.note-chat').getByRole('button', { name: 'Закрыть чат' }).click();
    await settled(page); await page.waitForTimeout(300);
    await page.evaluate(() => { window.finalQa.commands.length = 0; });
    await page.locator('[data-tooltip="Чат по заметке"]').click(); await settled(page);
    assert.equal(await page.locator('.note-chat textarea').inputValue(), 'Сохранённый черновик QA');
    assert.equal(await page.evaluate(() => window.finalQa.commands.filter(c => c === 'get_note_ai_status' || c === 'list_note_chat_messages').length), 0);
    verify(await page.evaluate(geometry), zoom);
    await page.locator('[data-tooltip="Чат по заметке"]').click(); await settled(page);
    assert.equal(await page.locator('.workspace-chat-panel').getAttribute('aria-hidden'), 'true');
    for (let toggle = 0; toggle < 6; toggle++) await page.locator('[data-tooltip="Чат по заметке"]').click();
    await settled(page);
    assert.equal(await page.locator('.workspace-chat-panel').getAttribute('aria-hidden'), 'true');
    await page.locator('[data-tooltip="Чат по заметке"]').click(); await settled(page);
    assert.equal(await page.locator('.note-chat textarea').inputValue(), 'Сохранённый черновик QA');
    results.push({ name: `chat-lifecycle-${zoom}-${theme}-${dpi}` });
    await page.screenshot({ path: `${output}/workspace-${zoom}-${theme}-${dpi}.png` });
    await page.close();
  }
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?sidebar=277&zoom=100&theme=${theme}&chat-ready`);
    await page.locator('.tiptap').waitFor();
    await page.locator('[data-tooltip="Чат по заметке"]').click();
    await page.locator('.note-chat strong', { hasText: 'История QA' }).waitFor(); await settled(page);
    const handle = await page.locator('.chat-resize').boundingBox();
    const chat = await page.locator('.note-chat').boundingBox(); assert.ok(handle && chat);
    await page.mouse.move(handle.x + handle.width - 1, handle.y + 300); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width - 1 + chat.width - 380, handle.y + 300, { steps: 20 });
    await page.mouse.up(); await settled(page); await page.waitForTimeout(350);
    assert.ok(Math.abs((await page.locator('.note-chat').boundingBox()).width - 380) < 1);
    await page.locator('.note-chat').getByRole('button', { name: 'Закрыть чат' }).click(); await settled(page);
    await page.locator('[data-tooltip="Чат по заметке"]').click(); await settled(page);
    assert.ok(Math.abs((await page.locator('.note-chat').boundingBox()).width - 380) < 1, 'Chosen width must survive compact close/reopen');
    verify(await page.evaluate(geometry), 100);
    results.push({ name: `compact-chat-width-restore-${theme}`, width: 380 }); await page.close();
  }
  for (const zoom of [100,160]) for (const theme of ['light','dark']) {
    const page = await browser.newPage({ viewport: { width: 2400, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?sidebar=360&zoom=${zoom}&theme=${theme}`);
    await page.locator('.tiptap').waitFor(); await settled(page);
    await page.evaluate(() => { window.qaArchitectureEditor = document.querySelector('.tiptap').editor; });
    const before = await page.evaluate(geometry); verify(before,zoom);
    await page.locator('[data-tooltip^="Фокус-режим"]').click(); await settled(page);
    verify(await page.evaluate(geometry),zoom);
    await page.setViewportSize({width:2600,height:1000}); await settled(page);
    const focus = await page.evaluate(geometry); verify(focus,zoom);
    assert.equal(focus.sameEditor,true); assert.equal(focus.content,before.content);
    await page.screenshot({path:`${output}/focus-${zoom}-${theme}.png`});
    await page.locator('[data-tooltip="Выйти из режима фокуса"]').click(); await settled(page);
    const restored=await page.evaluate(geometry); verify(restored,zoom);
    assert.equal(restored.sameEditor,true); assert.equal(restored.content,before.content);
    results.push({name:`ai-focus-${zoom}-${theme}`,before,focus,restored}); await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
console.log(`PASS architecture layout ${results.length}`);
