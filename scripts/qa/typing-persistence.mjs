import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const base=process.env.NOTEFLOW_TYPING_URL||'http://127.0.0.1:1431/scripts/qa/final-ux-fixture.html';
const output=`releases/qa/typing-persistence${process.argv[2]?`-${process.argv[2]}`:''}`;await mkdir(output,{recursive:true});const results=[],errors=[];
try{
 for(const fixture of ['1000','10000','50000','100000','complex']){
  const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const NativeWorker=Worker;window.qaPreparations=0;window.Worker=class extends NativeWorker{postMessage(...args){window.qaPreparations++;return super.postMessage(...args)}}});
  await page.goto(`${base}?perf-notes=10000&typing-case=${fixture}`);await page.locator('.tiptap').waitFor();
  if(fixture==='complex')await page.locator('.tiptap').evaluate(n=>{
    const e=n.editor;let table,cell;e.state.doc.descendants((node,pos)=>{if(table===undefined&&node.type.name==='table')table=pos;if(cell===undefined&&node.type.name==='tableCell')cell=pos});
    let tr=e.state.tr;tr=tr.setNodeMarkup(table,null,{...e.state.doc.nodeAt(table).attrs,emphasizedBorders:true});tr=tr.setNodeMarkup(cell,null,{...e.state.doc.nodeAt(cell).attrs,backgroundColor:'#b3e5fc'});e.view.dispatch(tr);
    e.commands.insertContentAt(e.state.doc.content.size,[{type:'image',attrs:{src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1sAAAAASUVORK5CYII=',alt:'QA',width:240,alignment:'right'}},{type:'paragraph',content:[{type:'text',text:'Стоимость '},{type:'text',text:'следующая',marks:[{type:'bold'},{type:'underline'}]},{type:'text',text:' - '},{type:'inlineDate',attrs:{value:'2026-10-29'}}]}]);
  });
  await page.locator('.tiptap').focus();await page.keyboard.press('Control+Home');await page.keyboard.type('LATEST-QA-123');
  // Navigation must drain the new worker and the existing CAS queue together.
  await page.locator('.cards .card-hit').nth(1).click();await page.locator('.ed-title').filter({hasText:'QA заметка 1'}).waitFor();
  await page.locator('.cards .card-hit').first().click();await page.locator('.ed-title').filter({hasText:'QA заметка 0'}).waitFor();
  assert.match(await page.locator('.tiptap').innerText(),/LATEST-QA-123/);
  const saved=await page.evaluate(()=>({note:window.finalQa.notes()[0],preparations:window.qaPreparations,doc:document.querySelector('.tiptap').editor.getJSON()}));
  assert.ok(saved.preparations>0,'real worker path must be exercised');assert.ok(saved.note.contentVersion>1);
  assert.match(saved.note.contentMarkdown,/LATEST-QA-123/);assert.deepEqual(saved.note.contentJson,saved.doc);
  if(fixture==='complex'){const sidecars=JSON.stringify(saved.note.contentSidecars);assert.ok(sidecars.includes('#b3e5fc'));assert.ok(sidecars.includes('right'));assert.ok(saved.note.contentMarkdown.includes('Стоимость'));assert.doesNotMatch(saved.note.contentMarkdown,/следующа\*\*\*\*я/)}
  const before=saved.note.contentVersion;
  await page.locator('.tiptap').evaluate(n=>{const e=n.editor,p=e.state.plugins.find(p=>p.key.startsWith('note-search$'));e.view.dispatch(e.state.tr.setMeta(p.key,{query:'QA'}));e.commands.setTextSelection({from:1,to:7})});
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>window.finalQa.notes()[0].contentVersion),before,'decoration/selection must not autosave');
  results.push({fixture,contentVersion:before,preparations:saved.preparations,cards:await page.locator('.cards .card').count()});
  assert.ok(results.at(-1).cards<100);await page.close();console.log(`PASS worker persistence ${fixture}`);
 }
 const failure=await browser.newPage({viewport:{width:1920,height:1080}});
 await failure.route('**/*editorSerialization.worker*',route=>route.abort('failed'));
 await failure.goto(`${base}?perf-notes=2&typing-case=1000`);await failure.locator('.tiptap').waitFor();
 await failure.locator('.tiptap').focus();await failure.keyboard.press('Control+Home');await failure.keyboard.press('q');
 const retry=failure.getByRole('button',{name:'Не сохранено. Повторить сохранение',exact:true});await retry.waitFor();
 assert.equal(await failure.evaluate(()=>window.finalQa.notes()[0].contentVersion),1,'failed worker must not commit partial data');
 await retry.click();await failure.getByRole('status',{name:'Сохранено',exact:true}).waitFor();
 assert.equal(await failure.evaluate(()=>window.finalQa.notes()[0].contentVersion),2);
 assert.match(await failure.evaluate(()=>window.finalQa.notes()[0].contentMarkdown),/^q/);
 results.push({fixture:'worker-load-failure-and-retry',preservesPrevious:true,fallbackSaved:true});await failure.close();
 const fallback=await browser.newPage({viewport:{width:1920,height:1080}});
 await fallback.addInitScript(()=>{window.Worker=class{constructor(){throw new Error('QA worker unavailable')}}});
 await fallback.goto(`${base}?perf-notes=2&typing-case=100000`);await fallback.locator('.tiptap').waitFor();
 await fallback.locator('.tiptap').focus();await fallback.keyboard.press('Control+Home');await fallback.keyboard.press('a');
 await fallback.waitForTimeout(1200);
 await fallback.locator('.tiptap').evaluate(n=>{window.qaFallbackPreparations=0;const original=n.editor.getHTML.bind(n.editor);n.editor.getHTML=(...args)=>{window.qaFallbackPreparations++;return original(...args)}});
 for(let i=0;i<20;i++){await fallback.keyboard.press('b');await fallback.waitForTimeout(20)}
 assert.equal(await fallback.evaluate(()=>window.qaFallbackPreparations),0,'unavailable Worker must not serialize every character on main thread');
 await fallback.locator('.cards .card-hit').nth(1).click();
 await fallback.locator('.ed-title').filter({hasText:'QA заметка 1'}).waitFor();
 const recovered=await fallback.evaluate(()=>({count:window.qaFallbackPreparations,note:window.finalQa.notes()[0]}));
 assert.equal(recovered.count,1,'navigation flush prepares only the latest fallback snapshot');
 assert.match(recovered.note.contentMarkdown,/b{20}/);assert.ok(recovered.note.contentVersion>1);
 results.push({fixture:'fallback-coalesces-until-flush',preparations:recovered.count});await fallback.close();
 assert.deepEqual(errors,[]);
}finally{await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));await browser.close()}
