// Read-only/timing-only diagnostic client. All native input uses Computer Use.
import { writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT||'playwright');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237');
const pages=browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url().includes('tauri.localhost'));
if(pages.length!==1)throw new Error('Expected one isolated QA WebView');
const page=pages[0];
if(process.argv[2]==='frame-cadence'){
 const intervals=await page.evaluate(async()=>{const values=[];let last;await new Promise(resolve=>{function frame(time){if(last!==undefined)values.push(time-last);last=time;if(values.length<60)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});return values});
 await writeFile('releases/qa/typing-native-frame-cadence.json',JSON.stringify({intervals},null,2));console.log(JSON.stringify({intervals}));
}
else if(process.argv[2]==='install')await page.evaluate(()=>{
 const data=window.qaTypingNative={input:[],transactions:[],longTasks:[],ipc:[],worker:[],html:[],json:[],postMessage:[],panelFrames:[]};
 new PerformanceObserver(list=>data.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask'});
 document.addEventListener('keydown',e=>{if(!e.target.closest?.('.tiptap'))return;const t=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>data.input.push({key:e.key.length===1?'character':e.key,ms:performance.now()-t})))},true);
 document.addEventListener('click',event=>{if(!event.target.closest?.('.sb .col'))return;const frames=[];data.panelFrames.push(frames);const start=performance.now();function sample(){const editor=document.querySelector('.editor-col')?.getBoundingClientRect(),toolbar=document.querySelector('.toolbar')?.getBoundingClientRect();frames.push({ms:performance.now()-start,viewport:innerWidth,editor:editor?.width,toolbar:toolbar?.width,right:toolbar?.right,buttons:document.querySelectorAll('[data-toolbar-action]').length});if(performance.now()-start<600)requestAnimationFrame(sample)}requestAnimationFrame(sample)},true);
 const editor=document.querySelector('.tiptap')?.editor;
 if(editor){const dispatch=editor.view.dispatch.bind(editor.view);editor.view.dispatch=tr=>{const t=performance.now();try{return dispatch(tr)}finally{data.transactions.push({changed:tr.docChanged,ms:performance.now()-t})}}}
 if(editor){const html=editor.getHTML.bind(editor);editor.getHTML=(...args)=>{const t=performance.now();try{return html(...args)}finally{data.html.push(performance.now()-t)}};const proto=Object.getPrototypeOf(editor.state.doc),json=proto.toJSON;proto.toJSON=function(...args){if(this.type.name!=='doc')return json.apply(this,args);const t=performance.now();try{return json.apply(this,args)}finally{data.json.push(performance.now()-t)}}}
 const rawPost=Worker.prototype.postMessage;Worker.prototype.postMessage=function(...args){const t=performance.now();try{return rawPost.apply(this,args)}finally{data.postMessage.push(performance.now()-t)}};
 const api=window.__TAURI_INTERNALS__,invoke=api.invoke.bind(api);
 api.invoke=(command,...args)=>{const t=performance.now();const result=invoke(command,...args);if(command==='update_note_content')void result.then(()=>data.ipc.push(performance.now()-t),()=>{});return result};
 const NativeWorker=window.Worker;
 window.Worker=class extends NativeWorker{
  constructor(...args){super(...args);this.times=new Map();this.addEventListener('message',event=>{const start=this.times.get(event.data.id);if(start!==undefined){data.worker.push(performance.now()-start);this.times.delete(event.data.id)}})}
  postMessage(message,...args){this.times.set(message.id,performance.now());return super.postMessage(message,...args)}
 };
});
else{
 const result=await page.evaluate(()=>({measurements:window.qaTypingNative,viewport:{width:innerWidth,height:innerHeight,zoom:document.querySelector('.app-zoom-root')?.dataset.zoomPercent},heap:performance.memory?.usedJSHeapSize,cards:document.querySelectorAll('.cards .card').length,paragraphs:document.querySelectorAll('.tiptap > p').length,toolbar:{width:document.querySelector('.toolbar')?.getBoundingClientRect().width,editor:document.querySelector('.editor-col')?.getBoundingClientRect().width,buttons:document.querySelectorAll('[data-toolbar-action]').length,overflow:document.querySelectorAll('.toolbar-overflow-slot').length},saveStatus:document.querySelector('.ed-act .saved')?.textContent}));
 await writeFile(`releases/qa/typing-native-${process.argv[2]||'after'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
process.exit(0);
