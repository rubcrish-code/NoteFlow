import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { assertClassicContrast } from './classic-vibrant-expectations.mjs';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = 'releases/qa/repeat-native-browser';
await mkdir(output, { recursive: true });
const results = [];
try {
  for (const pixels of [1366, 1600, 1920]) for (const scale of [1, 1.25, 1.5]) for (const theme of ['light', 'dark']) {
    const width = Math.floor(pixels / scale);
    const page = await browser.newPage({ viewport: { width, height: Math.max(700, Math.floor(900 / scale)) }, deviceScaleFactor: scale });
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?sidebar=360&theme=${theme}&chat-ready`);
    const editor = page.locator('.tiptap'); await editor.waitFor();
    const tagColors = await page.locator('.ed-tags .tag[style]').evaluateAll(nodes => nodes.map(e => {
      const style = getComputedStyle(e), luminance = value => {
        const rgb = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
        return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
      };
      const fg = luminance(style.color), bg = luminance(style.backgroundColor);
      return { identity: style.getPropertyValue('--tag-color').trim(), background: style.backgroundColor, foreground: style.color,
        contrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05), radius: style.borderRadius };
    }));
    assert.equal(tagColors.length, 10); assert.equal(new Set(tagColors.map(c => c.identity)).size, 10);
    for (const color of tagColors) {
      color.accessibility = assertClassicContrast(color.background, color.foreground, theme, color.contrast);
      assert.ok(Number.parseFloat(color.radius) > 0);
    }
    await editor.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' Unsaved QA');
    const original = await editor.evaluate(e => { window.qaEditorIdentity = e.editor; return JSON.stringify(e.editor.getJSON()); });
    await page.locator('[data-tooltip="Чат по заметке"]').click();
    if (width < 1194) {
      await page.getByText('Для чата справа и полной ленты инструментов при этом масштабе нужно более широкое окно.', {exact:true}).waitFor();
      assert.equal(await page.locator('.note-chat:visible').count(), 0);
      assert.equal(await editor.evaluate(e => JSON.stringify(e.editor.getJSON())), original);
      results.push({ name: `unsupported-right-chat-${pixels}-${scale}-${theme}`, width, minimum: 1194, tagColors });
      await page.close(); continue;
    }
    await page.locator('.note-chat').waitFor();
    await page.locator('.note-chat strong', { hasText: 'История QA' }).waitFor();
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))); });
    const state = await page.evaluate(() => {
      const toolbar = document.querySelector('.toolbar'), chat = document.querySelector('.note-chat'), tiptap = document.querySelector('.tiptap');
      return { overlay: document.querySelector('.workspace').classList.contains('workspace-chat-overlay'),
        rootScroll: document.documentElement.scrollWidth, viewport: innerWidth,
        chat: { left: chat.getBoundingClientRect().left, right: chat.getBoundingClientRect().right, height: chat.getBoundingClientRect().height },
        toolbar: { right: toolbar.getBoundingClientRect().right, scroll: toolbar.scrollWidth, client: toolbar.clientWidth },
        commands: toolbar.querySelectorAll('[data-toolbar-action]').length,
        sameEditor: window.qaEditorIdentity === tiptap.editor, doc: JSON.stringify(tiptap.editor.getJSON()),
        warning: document.body.textContent.includes('Эта компоновка не помещается') };
    });
    assert.equal(state.warning, false); assert.equal(state.sameEditor, true); assert.equal(state.doc, original);
    assert.equal(state.commands, 31); assert.ok(state.rootScroll <= width + 1);
    assert.equal(state.overlay, false);
    assert.ok(state.toolbar.right <= state.chat.left + 1, 'right chat never overlaps editor/toolbar');
    assert.ok(state.chat.left >= 0 && state.chat.right <= width + 1 && state.chat.height > 200);
    assert.ok(state.toolbar.scroll <= state.toolbar.client + 1 && state.toolbar.right <= width + 1);
    if (await page.locator('.workspace-hide-list-for-chat').count()) {
      await page.getByRole('button', { name: 'Все заметки', exact: true }).click();
      await page.locator('.workspace-list-panel[data-panel-open="true"] .cards').waitFor();
      assert.equal(await page.locator('.workspace-list-panel').getAttribute('aria-hidden'), 'false');
      assert.equal(await editor.evaluate(e => window.qaEditorIdentity === e.editor), true);
      assert.equal(await editor.evaluate(e => JSON.stringify(e.editor.getJSON())), original);
      await page.locator('[data-tooltip="Чат по заметке"]').click();
      await page.locator('.note-chat:visible').waitFor();
    }
    const composer = page.locator('.note-chat textarea');
    if (await composer.count()) { await composer.fill('QA chat draft'); }
    await page.setViewportSize({ width: width + 1000, height: 900 });
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))); });
    if (await composer.count()) assert.equal(await composer.inputValue(), 'QA chat draft');
    assert.equal(await editor.evaluate(e => window.qaEditorIdentity === e.editor), true);
    results.push({ name: `chat-${pixels}-${scale}-${theme}`, state, tagColors });
    if (pixels === 1366 && scale === 1) await page.screenshot({ path: `${output}/chat-${theme}.png` });
    await page.close();
  }
  for (const zoom of [100, 160]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 2400, height: 1000 } });
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?sidebar=190&theme=${theme}&zoom=${zoom}`);
    await page.locator('.tiptap').waitFor();
    // Every rAF during a real pointer drag, rather than only the two endpoints.
    await page.evaluate(() => {
      const toolbar = document.querySelector('.toolbar'), buttons = [...toolbar.querySelectorAll('button')], slots = [...toolbar.querySelectorAll('.toolbar-slot')], weights = slots.map(e => Number(getComputedStyle(e).flexGrow)), total = weights.reduce((a,b)=>a+b,0);
      window.qaFrames = [];
      window.qaRecording = true;
      const tick = () => {
        if (!window.qaRecording) return;
        const t = toolbar.getBoundingClientRect();
        window.qaFrames.push({ time: performance.now(), width: t.width, x: t.x, height: t.height,
          scroll: toolbar.scrollWidth, client: toolbar.clientWidth, same: buttons.every(b => b.isConnected),
          buttons: buttons.map(b => { const r = b.getBoundingClientRect(), index = slots.indexOf(b.closest('.toolbar-slot')); return { id: b.dataset.toolbarAction, x: r.x - t.x, width: r.width, y: r.y - t.y, rank: (weights.slice(0,index).reduce((a,b)=>a+b,0)+weights[index]/2)/total }; }) });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const handle = await page.locator('.resize-sb').boundingBox();
    assert.ok(handle); await page.mouse.move(handle.x + handle.width / 2, 350); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 170, 350, { steps: 100 });
    await page.mouse.move(handle.x + handle.width / 2, 350, { steps: 10 }); await page.mouse.up();
    const frames = await page.evaluate(() => { window.qaRecording = false; return window.qaFrames; });
    assert.ok(frames.length > 20);
    for (const f of frames) {
      assert.equal(f.buttons.length, 31); assert.equal(f.same, true); assert.ok(f.scroll <= f.client + 1);
      assert.ok(Math.abs(f.height - frames[0].height) < .1);
      for (const b of f.buttons) { assert.ok(b.width >= 24 * zoom / 100 - .2); assert.ok(Math.abs(b.y - f.buttons[0].y) < .5); }
      for (let i = 0; i < f.buttons.length; i++) {
        assert.ok(Math.abs(f.buttons[i].x - frames[0].buttons[i].x - f.buttons[i].rank*(f.width-frames[0].width)) < .2, 'one continuous affine distribution during every pointer frame');
        assert.ok(Math.abs(f.buttons[i].width-frames[0].buttons[i].width)<.2, 'target sizes remain fixed');
      }
    }
    // At effectively equal widths controls must not alternate positions/layouts.
    const positions = new Map();
    for (const f of frames) {
      const key = Math.round(f.width * 16);
      if (positions.has(key)) {
        const previous = positions.get(key);
        for (let i = 0; i < f.buttons.length; i++) assert.ok(Math.abs(f.buttons[i].x - previous.buttons[i].x) < .15);
      }
      positions.set(key, f);
    }
    await writeFile(`${output}/drag-${zoom}-${theme}.json`, JSON.stringify(frames, null, 2));
    results.push({ name: `continuous-drag-${zoom}-${theme}`, frames: frames.length, first: frames[0].width, last: frames.at(-1).width });
    await page.close();
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
  await browser.close();
}
console.log(`PASS repeat native corrective browser ${results.length}`);
