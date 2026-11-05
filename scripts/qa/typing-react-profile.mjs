import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const output=`releases/qa/typing-react-profile-${process.argv[2]||'after'}`;await mkdir(output,{recursive:true});
await page.addInitScript(()=>{
 const commits=window.qaReactCommits=[];
 window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject(){return 1},onCommitFiberUnmount(){},onCommitFiberRoot(_id,root){
  const rendered=[];
  function walk(f){if(!f)return;const type=f.elementType;const name=typeof type==='function'?type.displayName||type.name:typeof type==='object'?type?.render?.name:undefined;if(name&&(f.flags&1))rendered.push({name,duration:f.actualDuration});walk(f.child);walk(f.sibling)}
  walk(root.current);commits.push({rendered,duration:root.current.actualDuration});
 }};
});
try{
 if(process.argv.includes('--loading')){
  const samples=[];
  for(let i=0;i<10;i++){
   await page.goto(`${process.env.NOTEFLOW_TYPING_URL||'http://127.0.0.1:1433/scripts/qa/final-ux-fixture.html'}?perf-notes=10000`);await page.locator('.tiptap').waitFor();
   const sample=await page.evaluate(()=>({commits:window.finalQa.renders,notes:window.finalQa.notes().length,cards:document.querySelectorAll('.cards .card').length}));
   assert.ok(sample.commits.length>0,'Loading requires the actual profiling renderer');assert.equal(sample.notes,10000);samples.push(sample);
  }
  await writeFile(`${output}/results.json`,JSON.stringify({renderer:'QA-only unminified production profiling renderer; not native latency',samples},null,2));console.log(`PASS loading React profile ${samples.length}`);
 }else{
 await page.goto(`${process.env.NOTEFLOW_TYPING_URL||'http://127.0.0.1:1432/scripts/qa/final-ux-fixture.html'}?perf-notes=10000&perf-long`);await page.locator('.tiptap').waitFor();
 await page.locator('.tiptap').focus();await page.keyboard.press('Control+Home');
 await page.evaluate(()=>{window.qaReactCommits.length=0;window.finalQa.renders.length=0});
 await page.keyboard.press('a');await page.waitForTimeout(1500);
 const result=await page.evaluate(()=>({renderer:'production profiling renderer, unminified QA diagnostic only',commits:window.qaReactCommits,profiler:window.finalQa.renders}));
 assert.ok(result.profiler.length>0,'React profiling renderer must actually report commits');
 await writeFile(`${output}/results.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
}finally{await browser.close()}
