// All native input is performed separately through Computer Use.
import { writeFile } from 'node:fs/promises';
import { installInputLatencyProbe, readInputLatencyProbe } from './input-latency-probe.mjs';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9237');
try {
  const pages = browser.contexts().flatMap(c => c.pages()).filter(p => p.url().includes('tauri.localhost'));
  if (pages.length !== 1) throw new Error('Expected exactly one isolated native QA WebView');
  const page = pages[0];
  if (process.argv[2] === 'install') console.log(JSON.stringify(await page.evaluate(installInputLatencyProbe)));
  else if (process.argv[2] === 'event-timing') console.log(JSON.stringify(await page.evaluate(() => {
    if (!PerformanceObserver.supportedEntryTypes.includes('event')) return { supported: false };
    window.inputLatencyProbe.eventTimings = [];
    new PerformanceObserver(list => window.inputLatencyProbe.eventTimings.push(...list.getEntries().map(e => ({ name: e.name, startTime: e.startTime, duration: e.duration, processingStart: e.processingStart, processingEnd: e.processingEnd, interactionId: e.interactionId })))).observe({ type: 'event', durationThreshold: 16 });
    return { supported: true, precision: 'Browser-reported presentation duration, not hardware input-to-photon' };
  })));
  else if (process.argv[2] === 'environment') {
    const session = await page.context().newCDPSession(page);
    console.log(JSON.stringify({ runtime: await session.send('Browser.getVersion'), window: await page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth, height: innerHeight, visibility: document.visibilityState, focused: document.hasFocus(), hardwareConcurrency: navigator.hardwareConcurrency })) }));
  }
  else if (process.argv[2] === 'phase') await page.evaluate(label => { window.inputLatencyProbe.phase = label; }, process.argv[3]);
  else {
    const result = await page.evaluate(readInputLatencyProbe);
    await writeFile(`releases/qa/native-input-${process.argv[2] || 'samples'}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ events: result.events.length, trusted: result.events.filter(e => e.trusted).length, search: result.search.length, ipc: result.ipc.length }));
  }
} catch (error) { console.error(error); process.exit(1); }
// Do not send Browser.close to the application's WebView2 process.
process.exit(0);
