import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const base=process.env.NOTEFLOW_TYPING_URL||'http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html';
const output=`releases/qa/typing-hardening-${process.argv[2]||'before'}`;await mkdir(output,{recursive:true});
const results=[];
const characterSamples=Number(process.env.NOTEFLOW_TYPING_SAMPLES||20);
assert.ok(Number.isInteger(characterSamples)&&characterSamples>=20,'Character sample count must retain the existing minimum');
const stats=values=>{const s=[...values].sort((a,b)=>a-b);return {n:s.length,p50:s[Math.max(0,Math.ceil(s.length*.5)-1)],p95:s[Math.max(0,Math.ceil(s.length*.95)-1)],max:s.at(-1),samples:values}};
try {
 for(const fixture of ['1000','10000','50000','100000','complex','legacy-long','large-database']) {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(()=>{const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.times=new Map();this.addEventListener('message',event=>{const start=this.times.get(event.data.id);if(start!==undefined){window.typingQa?.worker.push(performance.now()-start);this.times.delete(event.data.id)}})}postMessage(message,...args){this.times.set(message.id,performance.now());const t=performance.now();try{return super.postMessage(message,...args)}finally{window.typingQa?.postMessage.push(performance.now()-t)}}}});
  await page.goto(`${base}?perf-notes=${fixture==='large-database'?10000:2}&${fixture==='legacy-long'||fixture==='large-database'?'perf-long':`typing-case=${fixture}`}`);await page.locator('.tiptap').waitFor();
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  await page.locator('.tiptap').evaluate(n=>{
   const editor=n.editor;const data=window.typingQa={input:[],transactions:[],json:[],snapshotJson:[],html:[],worker:[],postMessage:[],longTasks:[],eventType:'keydown'};
   const wrap=(name,samples)=>{const fn=editor[name].bind(editor);editor[name]=(...args)=>{const t=performance.now();try{return fn(...args)}finally{samples.push(performance.now()-t)}}};wrap('getJSON',data.json);wrap('getHTML',data.html);
   const proto=Object.getPrototypeOf(editor.state.doc),json=proto.toJSON;proto.toJSON=function(...args){if(this.type.name!=='doc')return json.apply(this,args);const t=performance.now();try{return json.apply(this,args)}finally{data.snapshotJson.push(performance.now()-t)}};
   const dispatch=editor.view.dispatch.bind(editor.view);editor.view.dispatch=tr=>{const t=performance.now();try{return dispatch(tr)}finally{data.transactions.push({ms:performance.now()-t,changed:tr.docChanged})}};
   new PerformanceObserver(list=>data.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask'});
   for(const event of ['keydown','beforeinput','paste'])document.addEventListener(event,e=>{if(data.eventType!==event||!e.target.closest?.('.tiptap')||['Control','Shift','Alt','Meta'].includes(e.key))return;const t=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>data.input.push({key:event==='keydown'?(e.key.length===1?'character':e.key):event,ms:performance.now()-t})))},true);
  });
  await page.locator('.tiptap').evaluate(n=>n.editor.commands.focus(1,{scrollIntoView:false}));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.locator('.tiptap').evaluate(n=>n.editor.view.hasFocus()),true,'Typing measurements require real editor focus');
  await page.keyboard.press('Control+Home');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
  const run=async(name,operation,n=12,eventType='keydown')=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.evaluate(eventType=>{for(const value of Object.values(window.typingQa))if(Array.isArray(value))value.length=0;window.typingQa.eventType=eventType},eventType);const before=await metrics();for(let i=0;i<n;i++){await operation();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}const after=await metrics();const data=await page.evaluate(()=>({...window.typingQa,ipc:window.finalQa.commands.filter(x=>x==='update_note_content').length,heap:performance.memory?.usedJSHeapSize}));assert.ok(data.input.length>=n,`${fixture}/${name}: missing real input samples`);results.push({fixture,name,input:stats(data.input.map(x=>x.ms)),inputEvents:data.input,transaction:stats(data.transactions.map(x=>x.ms)),json:stats(data.json),snapshotJson:stats(data.snapshotJson),html:stats(data.html),worker:stats(data.worker),postMessage:stats(data.postMessage),longTasks:stats(data.longTasks),ipc:data.ipc,heap:data.heap,mainThread:Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(key=>[key,after[key]-before[key]])),react:await page.evaluate(()=>({commits:window.finalQa.renders.length,samples:window.finalQa.renders.slice(-30)}))});};
  await run('character',()=>page.keyboard.press('a'),characterSamples);
  await run('backspace',()=>page.keyboard.press('Backspace'));
  await run('enter',()=>page.keyboard.press('Enter'));
  await run('cursor',()=>page.keyboard.press('ArrowLeft'));
  await run('undo',()=>page.keyboard.press('Control+z'),6);
  await run('redo',()=>page.keyboard.press('Control+y'),6);
  await run('delete',()=>page.keyboard.press('Delete'));
  const resetTextCursor=async()=>{
   const start=await page.locator('.tiptap').evaluate(n=>{const e=n.editor;let start; e.state.doc.descendants((node,pos)=>{if(start===undefined&&node.type.name==='paragraph'&&node.textContent.length>=30)start=pos+1});if(start===undefined)throw new Error('Typing fixture requires a text paragraph');e.commands.focus(start,{scrollIntoView:false});return start});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert.deepEqual(await page.locator('.tiptap').evaluate(n=>({focused:n.editor.view.hasFocus(),from:n.editor.state.selection.from,to:n.editor.state.selection.to})),{focused:true,from:start,to:start},'Selection workload must start at the requested focused caret');
  };
  await resetTextCursor();
  await run('selection',()=>page.keyboard.press('Shift+ArrowRight'));
  await resetTextCursor();
  await run('replace-selection',async()=>{await page.keyboard.press('Shift+ArrowRight');await page.waitForFunction(()=>!document.querySelector('.tiptap').editor.state.selection.empty,{},{timeout:1000});assert.equal(await page.locator('.tiptap').evaluate(n=>n.editor.state.selection.empty),false,'replacement requires a nonempty selection');await page.keyboard.press('b')},12,'beforeinput');
  await run('rapid-typing',()=>page.keyboard.type('быстрый ввод текста'),4,'beforeinput');
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(()=>navigator.clipboard.writeText('Большая вставка. '.repeat(1000)));
  await run('large-paste',()=>page.keyboard.press('Control+v'),3,'paste');
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('[data-tooltip="Чат по заметке"]').click();await page.locator('.note-chat').waitFor();
  await page.locator('.tiptap').focus();await run('ai-sidebar',()=>page.keyboard.press('c'));await page.locator('.note-chat .nc-top .x').click();
  await page.locator('.tiptap').focus();
  const searchMatches=await page.locator('.tiptap').evaluate(n=>{const e=n.editor,p=e.state.plugins.find(p=>p.key.startsWith('note-search$'));if(!p)throw new Error('Search plugin missing');e.view.dispatch(e.state.tr.setMeta(p.key,{query:'текст'}));return p.getState(e.state).matches.length});
  assert.ok(searchMatches>0,'active search must really contain decorations');
  await run('search-decorations',()=>page.keyboard.press('d'));
  if(fixture==='complex')for(const [selector,name] of [['table p','table'],['li p','list']]){await page.locator(`.tiptap ${selector}`).first().click();await run(name,()=>page.keyboard.press('e'))}
  await page.waitForTimeout(1200);
  const saved=await page.evaluate(()=>({writes:window.finalQa.commands.filter(x=>x==='update_note_content').length,latest:window.finalQa.notes?.()[0]?.contentVersion}));
  assert.ok(saved.writes>0,'autosave must remain enabled');results.push({fixture,name:'autosave',...saved});
  const geometry=await page.locator('[role="toolbar"]').evaluate(n=>({width:n.getBoundingClientRect().width,buttons:[...n.querySelectorAll('button')].map(b=>({id:b.dataset.toolbarAction,width:b.getBoundingClientRect().width}))}));
  results.push({fixture,name:'toolbar-baseline',geometry});
  await page.close();console.log(`PASS typing measurement ${fixture}`);
 }
 assert.ok(results.length>=100);
}finally{await writeFile(`${output}/results.json`,JSON.stringify({base,browser:browser.version(),results},null,2));await browser.close()}
