// No native input/navigation: reload is sent separately through Computer Use.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT||'playwright');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237');
const output='releases/qa/final-native-loading';await mkdir(output,{recursive:true});
try {
 const pages=browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url().includes('tauri.localhost'));
 assert.equal(pages.length,1);const page=pages[0];
 assert.equal(await page.locator('.ed-title').textContent(),'PERF LONG 1000','Isolated synthetic profile required');
 if(process.argv[2]==='reload'){
  const session=await page.context().newCDPSession(page);
  await session.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${function(){
   const p=window.nativeLoadingValidation={start:performance.now(),usable:null};
   const observer=new MutationObserver(()=>{
    if(p.usable!==null||!document.querySelector('.tiptap')?.editor||document.querySelectorAll('[data-toolbar-action]').length!==31||!document.querySelector('.cards .card-hit'))return;
    p.usable=performance.now();requestAnimationFrame(()=>{p.raf=performance.now()});observer.disconnect();
   });observer.observe(document,{subtree:true,childList:true});
  }.toString()})();`});
  console.log('READY: native reload observer installed; send Ctrl+R through Computer Use');
  await page.waitForFunction(()=>window.nativeLoadingValidation?.usable!==null&&window.nativeLoadingValidation?.usable!==undefined,{},{timeout:180000});
  const result=await page.evaluate(()=>({ ...window.nativeLoadingValidation,resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('ipc.localhost')).map(e=>({command:new URL(e.name).pathname,start:e.startTime,end:e.responseEnd,duration:e.duration,bytes:e.decodedBodySize})),navigation:performance.getEntriesByType('navigation').map(e=>({domContentLoaded:e.domContentLoadedEventEnd,responseEnd:e.responseEnd})),invokeWritable:Object.getOwnPropertyDescriptor(window.__TAURI_INTERNALS__,'invoke')?.writable}));
  await writeFile(`${output}/reload.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }else{
  const result=await page.evaluate(async()=>{
   const samples=[];let bytes=0;
   for(let i=0;i<30;i++){
    const start=performance.now(),snapshot=await window.__TAURI_INTERNALS__.invoke('load_workspace',{}),end=performance.now();
    if(snapshot.notes.length!==10003||!snapshot.notes.some(n=>n.id==='postrc6-perf-0'))throw Error('Non-synthetic profile refused');
    if(i===0)bytes=new TextEncoder().encode(JSON.stringify(snapshot)).length;
    samples.push(end-start);
   }
   return {samples,rows:10003,bytes,invokeWritable:Object.getOwnPropertyDescriptor(window.__TAURI_INTERNALS__,'invoke')?.writable,meaning:'Actual warm SDK/database/serialization/IPC round trip; not exclusive IPC transfer'};
  });
  const s=[...result.samples].sort((a,b)=>a-b);Object.assign(result,{minimum:s[0],p50:s[14],p95:s[28],maximum:s[29]});
  await writeFile(`${output}/roundtrip.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
}catch(error){console.error(error);process.exit(1)}
process.exit(0);
