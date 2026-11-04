import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const label=process.argv[2] || 'before';
const base=process.env.NOTEFLOW_PERF_URL || 'http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html';
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];const output=`releases/qa/post-rc6-perf-${label}`;await mkdir(output,{recursive:true});
const stats=(samples)=>{const values=samples.map(x=>x.ms).sort((a,b)=>a-b);return {n:values.length,p50:values[Math.max(0,Math.ceil(values.length*.5)-1)],p95:values[Math.min(values.length-1,Math.ceil(values.length*.95)-1)],max:values.at(-1),samplesMs:samples.map(x=>x.ms),renders:samples.map(x=>x.renders),longTasks:samples.map(x=>x.longTasks),ipc:samples.map(x=>x.ipc)}};
try{
 for(const count of [2,1000,10000]){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(()=>{window.perfLongTasks=[];window.perfInput=[];new PerformanceObserver(list=>window.perfLongTasks.push(...list.getEntries().map(x=>x.duration))).observe({type:'longtask',buffered:true});document.addEventListener('keydown',e=>{if(e.key.length!==1||!e.target.closest?.('.tiptap'))return;const t=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.perfInput.push(performance.now()-t)))},true)});
  const cold=[];for(let sample=0;sample<3;sample++){await page.goto(`${base}?perf-notes=${count}`);await page.locator('.tiptap').waitFor();cold.push(await page.evaluate(()=>({ms:performance.now(),renders:window.finalQa.renders.length,longTasks:window.perfLongTasks,ipc:window.finalQa.commands.length})));}
  results.push({action:'document-load',count,...stats(cold),coldFirstMs:cold[0].ms,warmReload:stats(cold.slice(1))});
  if(count===2){
   async function measure(name,locator,ready,close){const samples=[];for(let i=0;i<12;i++){
    const before=await page.evaluate(()=>({time:performance.now(),renders:window.finalQa.renders.length,ipc:window.finalQa.commands.length,longTasks:window.perfLongTasks.length}));
    await locator().click();await ready();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    samples.push(await page.evaluate(b=>({ms:performance.now()-b.time,renders:window.finalQa.renders.length-b.renders,ipc:window.finalQa.commands.length-b.ipc,longTasks:window.perfLongTasks.slice(b.longTasks)}),before));await close();
   }results.push({action:name,count,...stats(samples)});console.log(`PASS perf ${name}`)}
   await measure('new-note',()=>page.getByRole('button',{name:'Новая заметка',exact:true}),()=>page.getByRole('dialog').waitFor(),async()=>{await page.getByRole('button',{name:'Отмена',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'})});
   await measure('note-menu',()=>page.locator('[data-tooltip="Меню заметки"]'),()=>page.getByRole('button',{name:'Экспортировать',exact:true}).waitFor(),()=>page.keyboard.press('Escape'));
   await measure('settings',()=>page.getByRole('button',{name:'Настройки',exact:true}),()=>page.locator('.settings-layout-inner').waitFor(),async()=>{await page.getByRole('button',{name:'Все заметки',exact:true}).click();await page.locator('.tiptap').waitFor()});
   await measure('link-picker',()=>page.locator('[data-toolbar-action="note-link"]'),()=>page.getByRole('option').first().waitFor(),async()=>{await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'})});
   await measure('note-switch',()=>page.locator('.cards .card-hit').nth(1),()=>page.locator('.ed-title').filter({hasText:'QA заметка 1'}).waitFor(),async()=>{await page.locator('.cards .card-hit').first().click();await page.locator('.ed-title').filter({hasText:'QA заметка 0'}).waitFor()});
   await measure('note-ai-sidebar',()=>page.locator('[data-tooltip="Чат по заметке"]'),()=>page.locator('.note-chat').waitFor(),async()=>{
    await page.locator('.note-chat .nc-top .x').click();await page.locator('.note-chat').waitFor({state:'hidden'});
    assert.deepEqual(await page.locator('.note-chat').evaluate(element=>{const panel=element.closest('.sidebar-panel');return {hidden:panel.hidden,inert:panel.inert,ariaHidden:panel.getAttribute('aria-hidden')}}),{hidden:true,inert:true,ariaHidden:'true'});
   });
   await measure('sidebar-collapse-first-paint',()=>page.locator('.sb .col'),()=>page.locator('.collapse-sb').waitFor(),async()=>{await page.evaluate(async()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.locator('.sb .col').click();await page.evaluate(async()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))))});
   await measure('projects',()=>page.getByRole('button',{name:'Проекты',exact:true}),()=>page.getByRole('button',{name:'Новый проект',exact:true}).waitFor(),async()=>{await page.getByRole('button',{name:'Все заметки',exact:true}).click();await page.locator('.tiptap').waitFor()});
   await measure('tags',()=>page.getByRole('button',{name:'Теги',exact:true}),()=>page.getByRole('button',{name:'Новый тег',exact:true}).waitFor(),async()=>{await page.getByRole('button',{name:'Все заметки',exact:true}).click();await page.locator('.tiptap').waitFor()});
   await page.getByRole('button',{name:'Теги',exact:true}).click();await page.getByRole('button',{name:'Новый тег',exact:true}).waitFor();
   await measure('tag-dialog',()=>page.getByRole('button',{name:'Новый тег',exact:true}),()=>page.getByRole('dialog').waitFor(),async()=>{await page.getByRole('button',{name:'Отмена',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'})});
   await page.getByRole('button',{name:'Все заметки',exact:true}).click();await page.locator('.tiptap').waitFor();
   const typing=[];for(let i=0;i<20;i++){const b=await page.evaluate(()=>({time:performance.now(),renders:window.finalQa.renders.length,ipc:window.finalQa.commands.length,longTasks:window.perfLongTasks.length}));await page.locator('.tiptap').press('a');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));typing.push(await page.evaluate(b=>({ms:performance.now()-b.time,renders:window.finalQa.renders.length-b.renders,ipc:window.finalQa.commands.length-b.ipc,longTasks:window.perfLongTasks.slice(b.longTasks)}),b));}results.push({action:'typing-short',count,...stats(typing),eventToPaint:stats((await page.evaluate(()=>window.perfInput)).map(ms=>({ms})))});
  }
  const heap=await page.evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null);results.push({action:'heap-after-load-actions',count,heap});await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.addInitScript(()=>{window.perfInput=[];document.addEventListener('keydown',e=>{if(e.key.length!==1||!e.target.closest?.('.tiptap'))return;const t=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.perfInput.push(performance.now()-t)))},true)});await page.goto(`${base}?perf-notes=2&perf-long`);await page.locator('.tiptap').waitFor();const values=[];
 for(let i=0;i<20;i++){const t=await page.evaluate(()=>performance.now());await page.locator('.tiptap').press('a');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));values.push({ms:await page.evaluate(t=>performance.now()-t,t)});}results.push({action:'typing-long-1000-paragraphs',count:2,...stats(values),eventToPaint:stats((await page.evaluate(()=>window.perfInput)).map(ms=>({ms})))});await page.close();
 assert.ok(results.length>0);
}finally{await writeFile(`${output}/results.json`,JSON.stringify({label,environment:base,browserVersion:browser.version(),nodeVersion:process.version,percentile:'nearest-rank',results},null,2));await browser.close();}
console.log(JSON.stringify(results,null,2));
