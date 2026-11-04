import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { installInputLatencyProbe, readInputLatencyProbe } from './input-latency-probe.mjs';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = `releases/qa/search-decorations-${process.argv[2] || 'after'}`;
await mkdir(output, { recursive: true });
const base = process.env.NOTEFLOW_TYPING_URL || 'http://127.0.0.1:1431/scripts/qa/final-ux-fixture.html';
const results = [];
const stats = values => { const a = values.filter(Number.isFinite).sort((a,b)=>a-b); return { n:a.length, p50:a[Math.ceil(a.length*.5)-1], p95:a[Math.ceil(a.length*.95)-1], max:a.at(-1) }; };
try {
  for (const [name, query, expected] of [['closed','',0],['open-empty','',0],['none','missingneedle',0],['one','uniqueonly',1],['hundred','hundred',100],['thousand','thousand',1000],['dense','many',10000],['fragment','thousand',1000],['rag-decoration','thousand',1000]]) {
    if (process.env.NOTEFLOW_SEARCH_CASES && !process.env.NOTEFLOW_SEARCH_CASES.split(',').includes(name)) continue;
    const page = await browser.newPage({ viewport:{width:1920,height:1080}, deviceScaleFactor:1.25 });
    await page.goto(`${base}?perf-notes=10000&typing-case=100000`);
    await page.locator('.tiptap').waitFor();
    await page.locator('.tiptap').evaluate(n => {
      const doc = { type:'doc', content:Array.from({length:1000},(_,i)=>({type:'paragraph',content:[{type:'text',text:`Строка ${i} ${i===0?'uniqueonly ':''}${i<100?'hundred ':''}thousand ${'many '.repeat(10)}Содержимое для измерений.`}]})) };
      n.editor.commands.setContent(doc);
    });
    await page.waitForTimeout(1200);
    await page.locator('.tiptap').focus();
    if (name !== 'closed') {
      await page.keyboard.press('Control+f');
      await page.getByRole('textbox',{name:'Найти в заметке',exact:true}).fill(query);
    }
    if (['fragment','rag-decoration'].includes(name)) await page.locator('.tiptap').evaluate(n => {
      const e=n.editor,p=e.state.plugins.find(p=>p.key.startsWith('fragment-navigation$'));
      e.view.dispatch(e.state.tr.setMeta(p.key,{from:1,to:12}));
    });
    const diagnostic = process.env.NOTEFLOW_SEARCH_CPU_PROFILE ? await page.context().newCDPSession(page) : null;
    if (diagnostic) { await diagnostic.send('Profiler.enable'); await diagnostic.send('Profiler.start'); }
    try {
      await page.locator('.tiptap').evaluate(n=>n.editor.commands.focus(5,{scrollIntoView:false}));
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    }
    finally {
      if (diagnostic) { const {profile}=await diagnostic.send('Profiler.stop'); await writeFile(`${output}/${name}-cpu.json`,JSON.stringify(profile)); console.log('CPU',JSON.stringify(profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,20).map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,hits:n.hitCount})))); }
    }
    const metadata = await page.locator('.tiptap').evaluate(n => {
      const e=n.editor,p=e.state.plugins.find(p=>p.key.startsWith('note-search$'));
      e.commands.setTextSelection(5);
      return {matches:p.getState(e.state).matches.length,characters:e.state.doc.textContent.length,paragraphs:e.state.doc.childCount,focused:e.view.hasFocus()};
    });
    assert.equal(metadata.matches,expected);
    assert.equal(metadata.focused,true,'real paragraph click must focus the editor');
    await page.evaluate(installInputLatencyProbe);
    await page.evaluate(name=>{window.inputLatencyProbe.phase=name},name);
    for(let i=0;i<30;i++) { await page.keyboard.press('a'); await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); }
    await page.waitForTimeout(1200);
    const raw=await page.evaluate(readInputLatencyProbe);
    const events=raw.events.filter(e=>e.phase===name&&e.trusted&&!e.modified&&e.inputType==='insertText'&&e.inputLength===1&&!e.paste);
    assert.equal(events.length,30,'only actual character inputs count');
    const search=raw.search.filter(s=>s.phase===name&&s.changed);
    assert.ok(search.length>=30,'probe must instrument actual bound plugin state field');
    const result={name,...metadata,input:stats(events.map(e=>e.raf2)),processing:stats(events.map(e=>e.inputToDispatch)),transaction:stats(raw.transactions.filter(t=>t.changed&&t.phase===name).map(t=>t.ms)),search:stats(search.map(s=>s.ms)),scans:stats(search.map(s=>s.scans)),decorations:stats(search.map(s=>s.decorations)),mutations:stats(events.map(e=>e.mutations)),raw};
    if(expected>1) {
      await page.evaluate(()=>{window.inputLatencyProbe.phase='navigate'});
      await page.getByRole('button',{name:'Следующее совпадение',exact:true}).click();
      const nav=await page.evaluate(()=>window.inputLatencyProbe.search.filter(s=>s.phase==='navigate'));
      result.navigation=nav;
      assert.equal(await page.locator('.tiptap').evaluate(n=>{const e=n.editor,p=e.state.plugins.find(p=>p.key.startsWith('note-search$'));return p.getState(e.state).index}),1);
    }
    results.push(result); await page.close(); console.log(`PASS search performance ${name}`);
  }
} finally {
  await writeFile(`${output}/results.json`,JSON.stringify({base,browser:browser.version(),results},null,2));
  await browser.close();
}
