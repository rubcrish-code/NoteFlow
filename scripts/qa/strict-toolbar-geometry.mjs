import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.NOTEFLOW_TYPING_URL || 'http://127.0.0.1:1431/scripts/qa/final-ux-fixture.html';
const output = 'releases/qa/strict-toolbar'; await mkdir(output, { recursive: true });
const results = [], errors = [];
const expected = ['undo','redo','h1','h2','h3','p','font','bold','italic','underline','strike','inline-code','highlight','color','sup','sub','ul','ol','task','quote','code-block','align-left','align-center','align-right','align-justify','link','table','note-link','fragment-link','clear','ai'];
function capture() {
  const toolbar = document.querySelector('.toolbar'), rect = n => { const r = n.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height }; };
  return { toolbar:rect(toolbar), editor:rect(document.querySelector('.editor-col')), viewport:innerWidth, rootScroll:document.documentElement.scrollWidth,
    scroll:toolbar.scrollWidth,client:toolbar.clientWidth,overflow:getComputedStyle(toolbar).overflowX,density:getComputedStyle(toolbar).getPropertyValue('--toolbar-density').trim(),
    buttons:[...toolbar.querySelectorAll('button')].map(n=>({id:n.dataset.toolbarAction,...rect(n),visible:n.checkVisibility(),aria:n.getAttribute('aria-label')})),
    overflowControls:document.querySelectorAll('[data-toolbar-overflow-action],.toolbar-overflow-slot').length,
    sidebar:rect(document.querySelector('.sb')), list:rect(document.querySelector('.list')) };
}
function verify(g, zoom) {
  assert.deepEqual(g.buttons.map(b=>b.id), expected); assert.equal(g.overflowControls,0);
  assert.ok(g.rootScroll <= g.viewport+1, JSON.stringify(g));
  assert.ok(g.toolbar.right<=g.editor.right+1 && g.editor.right<=g.viewport+1, JSON.stringify(g));
  assert.ok(g.scroll<=g.client+1, JSON.stringify(g)); assert.equal(g.overflow,'visible');
  for(const [i,b] of g.buttons.entries()) {
    assert.ok(b.visible && b.aria && b.width>=24*zoom/100-.2,JSON.stringify(b));
    assert.ok(b.left>=g.toolbar.left && b.right<=g.toolbar.right+.5 && Math.abs(b.top-g.buttons[0].top)<1,JSON.stringify(g));
    if(i)assert.ok(b.left>=g.buttons[i-1].right-.1,JSON.stringify(g));
  }
}
try {
 for(const zoom of [100,125,150,160])for(const theme of ['light','dark'])for(const sidebar of ['collapsed','190','360'])for(const chat of [false,true])for(const extra of [0,600]) {
  const minimum=Math.max(1100, Math.ceil(820*zoom/100+(sidebar==='collapsed'?74:190)+260+(chat?300:0)));
  const page=await browser.newPage({viewport:{width:minimum+extra,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}?zoom=${zoom}&theme=${theme}&sidebar=${sidebar}`);await page.locator('.tiptap').waitFor();
  if(chat){await page.locator('[data-tooltip="Чат по заметке"]').click();await page.locator('.note-chat').waitFor()}
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))});
  const geometry=await page.evaluate(capture);verify(geometry,zoom);
  const name=`${minimum+extra}-${zoom}-${theme}-${sidebar}-${chat?'chat':'no-chat'}`;
  results.push({name,minimum,geometry}); console.log(`PASS ${name}`);
  if(zoom===160&&sidebar==='360'&&extra===0)await page.screenshot({path:`${output}/${name}.png`});
  // Every intermediate geometry must remain within the editor while the left
  // panel changes width; no React action repartitioning is involved.
  if(sidebar==='collapsed')await page.setViewportSize({width:Math.max(minimum+extra,Math.ceil(820*zoom/100+190+260+(chat?300:0))),height:1000});
  await page.locator('.sb .col').click();
  for(let i=0;i<8;i++){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));verify(await page.evaluate(capture),zoom)}
  results.push({name:`motion-${name}`,frames:8});
  await page.close();
 }
 for(const width of [820,1000,1050,1130,1200])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:74+376+width,height:1000}});
  await page.goto(`${base}?zoom=100&theme=${theme}&sidebar=collapsed`);await page.locator('.tiptap').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))});
  const geometry=await page.evaluate(capture);verify(geometry,100);
  assert.equal(geometry.density,'distributed');
  results.push({name:`density-${width}-${theme}`,geometry});await page.close();
 }
 assert.deepEqual(errors,[]);
} finally { await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));await browser.close() }
console.log(`PASS strict toolbar ${results.length}`);
