import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT||'playwright');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237');
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));
if(!page)throw new Error('Missing QA WebView');
const session=await page.context().newCDPSession(page);
await session.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});
const before=await page.evaluate(()=>window.qaTypingNative.input.length);
console.log('READY FOR ONE NATIVE KEY');
try{await page.waitForFunction(n=>window.qaTypingNative.input.length>n,before,{timeout:45000});await new Promise(r=>setTimeout(r,700));}
finally{
 const completed=new Promise(r=>session.once('Tracing.tracingComplete',r));await session.send('Tracing.end');const {stream}=await completed;
 let data='';for(;;){const part=await session.send('IO.read',{handle:stream});data+=part.data;if(part.eof)break}await session.send('IO.close',{handle:stream});
 await writeFile('releases/qa/typing-native-trace.json',data);
 const events=JSON.parse(data).traceEvents.filter(e=>e.ph==='X'&&e.dur>1000).sort((a,b)=>b.dur-a.dur).slice(0,50).map(e=>({name:e.name,ms:e.dur/1000,tid:e.tid,args:e.args?.data?.type||e.args?.data?.functionName}));
 console.log(JSON.stringify(events));await writeFile('releases/qa/typing-native-trace-summary.json',JSON.stringify(events,null,2));
}
process.exit(0);
