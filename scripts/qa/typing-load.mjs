import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const base=process.env.NOTEFLOW_TYPING_URL||'http://127.0.0.1:1431/scripts/qa/final-ux-fixture.html';
const output=`releases/qa/typing-load-${process.argv[2]||'after'}`;await mkdir(output,{recursive:true});const results=[];
try{for(const count of [2,1000,10000]){
 const page=await browser.newPage({viewport:{width:1440,height:900}});const samples=[];
 for(let i=0;i<5;i++){await page.goto(`${base}?perf-notes=${count}`);await page.locator('.tiptap').waitFor();samples.push(await page.evaluate(()=>({ms:performance.now(),cards:document.querySelectorAll('.cards .card').length,heap:performance.memory?.usedJSHeapSize})));if(count===10000)assert.ok(samples.at(-1).cards<100)}
 const sorted=samples.map(x=>x.ms).sort((a,b)=>a-b);results.push({count,n:samples.length,p50:sorted[2],p95:sorted[4],max:sorted[4],samples});await page.close();
}}finally{await writeFile(`${output}/results.json`,JSON.stringify({base,results},null,2));await browser.close()}
