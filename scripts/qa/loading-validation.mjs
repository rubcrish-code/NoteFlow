import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const output = `releases/qa/loading-validation-${process.argv[2] || 'final'}`;
await mkdir(output, { recursive: true });
const urls = { before: 'http://127.0.0.1:1431', after: 'http://127.0.0.1:1432' };
const records = [], payloads = new Map();
const expectedToolbarActions = { before: 22, after: 31 };
const stats = values => {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { n: s.length, minimum: s[0], p50: s[Math.ceil(s.length * .5) - 1], p95: s[Math.ceil(s.length * .95) - 1], maximum: s.at(-1) };
};
function install({ expectedTools }) {
  const probe = window.loadingValidation = { invokes: [], usable: null, editorDom: null, longTasks: [] };
  const internals = {};
  let invoke;
  Object.defineProperty(internals, 'invoke', { configurable: true, get: () => invoke, set: fn => {
    invoke = async (command, ...args) => {
      const item = { command, start: performance.now() };
      probe.invokes.push(item);
      try {
        const value = await fn(command, ...args);
        item.end = performance.now();
        if (command === 'load_workspace') item.notes = value.notes.length;
        return value;
      } catch (error) { item.end = performance.now(); item.failed = true; throw error; }
    };
  } });
  window.__TAURI_INTERNALS__ = internals;
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => probe.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, ms: e.duration })))).observe({ type: 'longtask' });
  const observer = new MutationObserver(() => {
    const editor = document.querySelector('.tiptap')?.editor;
    if (!editor || editor.isDestroyed || !editor.isEditable || !document.querySelector('.cards .card-hit')) return;
    if (probe.editorDom === null) probe.editorDom = performance.now();
    if (probe.usable !== null || document.querySelectorAll('[data-toolbar-action]').length !== expectedTools) return;
    if (!document.querySelector('.ed-title')?.textContent.includes('QA заметка 0')) return;
    probe.usable = performance.now();
    requestAnimationFrame(() => { probe.rafAfterUsable = performance.now(); });
    observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
}
async function sample(page, side, series, mode, index) {
  await page.goto(`${urls[side]}/scripts/qa/final-ux-fixture.html?perf-notes=10000`, { waitUntil: 'domcontentloaded' });
  await page.locator('.tiptap').waitFor();
  const legacy = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => window.loadingValidation?.usable !== null);
  const result = await page.evaluate(() => {
    const p = window.loadingValidation, workspace = p.invokes.find(i => i.command === 'load_workspace');
    return { usable: p.usable, editorDom: p.editorDom, workspace: { start: workspace.start, end: workspace.end, rows: workspace.notes }, cards: document.querySelectorAll('.cards .card').length,
      dtoRows: window.finalQa.notes().length, payload: JSON.stringify(window.finalQa.notes()), tools: document.querySelectorAll('[data-toolbar-action]').length,
      firstText: document.querySelector('.ed-title').textContent, longTasks: p.longTasks,
      navigation: performance.getEntriesByType('navigation').map(e => ({ domContentLoaded: e.domContentLoadedEventEnd, responseEnd: e.responseEnd, transfer: e.transferSize })),
      resources: performance.getEntriesByType('resource').filter(e => /\.(js|css)(\?|$)/.test(e.name)).map(e => ({ name: new URL(e.name).pathname, end: e.responseEnd, transfer: e.transferSize, bytes: e.decodedBodySize })) };
  });
  const digest = createHash('sha256').update(result.payload).digest('hex');
  payloads.set(`${series}-${side}`, digest);
  assert.equal(result.dtoRows, 10000);
  assert.equal(result.workspace.rows, 10000);
  assert.equal(result.tools, expectedToolbarActions[side]);
  if (side === 'after') assert.ok(result.cards > 0 && result.cards < 100, 'Current note list must remain virtualized');
  else assert.equal(result.cards, 10000, 'The actual RC.6 baseline renders the full list');
  assert.ok(result.usable >= result.workspace.end);
  const bytes = Buffer.byteLength(result.payload);
  delete result.payload;
  records.push({ series, side, mode, index, ...result, legacy, automationGap: legacy - result.usable, mockIpc: result.workspace.end - result.workspace.start, mappingAndRender: result.usable - result.workspace.end, payloadBytes: bytes, payloadSha256: digest });
}
try {
  for (let series = 0; series < 3; series++) {
    // Each cold sample starts a new browser process/context; OS disk cache is not flushed.
    for (let i = 0; i < 10; i++) for (const side of (i + series) % 2 ? ['after', 'before'] : ['before', 'after']) {
      const browser = await chromium.launch({ channel: 'msedge', headless: true });
      try { const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); await page.addInitScript(install, { expectedTools: expectedToolbarActions[side] }); await sample(page, side, series, 'browser-process-cold', i); } finally { await browser.close(); }
    }
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
      const pages = {};
      for (const side of ['before', 'after']) {
        pages[side] = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
        await pages[side].addInitScript(install, { expectedTools: expectedToolbarActions[side] });
        await sample(pages[side], side, series, 'warmup-excluded', -1);
      }
      for (let i = 0; i < 10; i++) for (const side of (i + series) % 2 ? ['after', 'before'] : ['before', 'after']) await sample(pages[side], side, series, 'warm', i);
    } finally { await browser.close(); }
    console.log(`PASS independent loading series ${series + 1}`);
    await writeFile(`${output}/progress.json`, JSON.stringify(records, null, 2));
  }
  assert.equal(new Set(payloads.values()).size, 1, 'Every side/series must use the exact same DTO payload');
  assert.equal(new Set(records.map(record => record.payloadSha256)).size, 1, 'Every individual navigation must preserve the same payload');
} finally {
  const groups = [];
  for (const side of ['before', 'after']) for (const mode of ['browser-process-cold', 'warm']) {
    const selected = records.filter(r => r.side === side && r.mode === mode);
    groups.push({ side, mode, usable: stats(selected.map(x => x.usable)), legacy: stats(selected.map(x => x.legacy)), automationGap: stats(selected.map(x => x.automationGap)), mockIpc: stats(selected.map(x => x.mockIpc)), mappingAndRender: stats(selected.map(x => x.mappingAndRender)) });
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ methodology: 'Internal DOM usable timestamp, not physical paint; process-cold is not OS disk-cache cold; metadata IPC is mocked, not SQLite', groups, records }, null, 2));
  console.log(JSON.stringify(groups));
}
