// Read-only WebView2 measurement. All native input is sent through Computer Use.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9241');
const pages = browser.contexts().flatMap(c => c.pages()).filter(p => p.url().includes('tauri.localhost'));
assert.equal(pages.length, 1, 'Exactly one isolated QA WebView must expose the diagnostic port');
const page = pages[0];
assert.ok(await page.locator('.sb-user').textContent().then(t => /QA/.test(t)), 'Synthetic QA profile only');
if (process.argv[2] === 'install') {
  console.log(JSON.stringify(await page.evaluate(() => {
    const toolbar = document.querySelector('.toolbar'), controls = [...toolbar.querySelectorAll('button')];
    const data = window.qaToolbarProbe = { frames: [], longTasks: [], resizes: 0, drags: 0, dpr: devicePixelRatio, viewport: [innerWidth, innerHeight], running: false };
    let settleUntil = 0;
    new ResizeObserver(() => data.resizes++).observe(toolbar);
    new PerformanceObserver(list => { if (data.running) data.longTasks.push(...list.getEntries().map(e => ({ at: e.startTime, ms: e.duration }))); }).observe({ type: 'longtask' });
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest?.('.resize-handle')) return;
      data.running = true; data.drags++;
      const tick = () => {
        const r = toolbar.getBoundingClientRect();
        data.frames.push({ at: performance.now(), width: r.width, x: r.x, height: r.height, scroll: toolbar.scrollWidth, client: toolbar.clientWidth,
          density: getComputedStyle(toolbar).getPropertyValue('--toolbar-density').trim(), same: controls.every(e => e.isConnected),
          buttons: controls.map(e => { const b = e.getBoundingClientRect(); return { id: e.dataset.toolbarAction, x: b.x - r.x, y: b.y - r.y, width: b.width }; }) });
        if ((data.running || performance.now() < settleUntil) && data.frames.length < 8000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, true);
    document.addEventListener('pointerup', () => { settleUntil = performance.now() + 350; data.running = false; }, true);
    return { dpr: data.dpr, viewport: data.viewport, controls: controls.length };
  })));
} else {
  const result = await page.evaluate(() => window.qaToolbarProbe);
  assert.ok(result?.frames.length > 0, 'Native pointer drag must be observed');
  const output = `releases/qa/native-toolbar-${process.argv[2] || 'after'}.json`;
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, drags: result.drags, frames: result.frames.length, resizes: result.resizes, longTasks: result.longTasks, densities: [...new Set(result.frames.map(f => f.density))] }));
}
// Browser.close would terminate the application: disconnect by exiting instead.
process.exit(0);
