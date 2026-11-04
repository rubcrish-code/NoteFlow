import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.NOTEFLOW_QA_PLAYWRIGHT||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const output='releases/qa/post-rc6-corrective';await mkdir(output,{recursive:true});const results=[],errors=[];
const source=await readFile('tests/fixtures/post-rc6-user.md','utf8');
const record=(name,details)=>{results.push({name,...details});console.log(`PASS ${name}`)};
const base='http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html';
const settle=async(page)=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.target?.closest?.('.nf-modal-backdrop')).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
async function tool(page,id){let direct=page.locator(`[data-toolbar-action="${id}"]`);if(await direct.count())return direct;await page.getByLabel('Дополнительные инструменты форматирования',{exact:true}).click();return page.locator(`[data-toolbar-overflow-action="${id}"]`)}
function rect(node){const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}}
try{
for(const width of [1100,1440,1920])for(const zoom of [100,160])for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport:{width,height:width===1100?700:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}?forms&zoom=${zoom}&theme=${theme}`);await page.locator('.tiptap a').first().waitFor();await settle(page);
 const id=`${width}-${zoom}-${theme}`;
 async function stable(name,open,field){await open();await page.getByRole('dialog').waitFor();await settle(page);const input=field();
  const snapshots=[];for(const length of [0,24,25,26,30,25]){await input.fill('я'.repeat(length));await settle(page);snapshots.push(await page.getByRole('dialog').evaluate((modal,length)=>{const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,left:r.left,width:r.width,height:r.height,bottom:r.bottom}};const input=modal.querySelector('input');return {length,modal:rect(modal),heading:rect(modal.querySelector('h2')),input:rect(input),footer:rect(modal.querySelector('.nf-modal-footer')),counter:modal.querySelector('.entity-name-counter').textContent,invalid:modal.querySelector('.entity-name-counter').classList.contains('exceeded'),disabled:modal.querySelector('.nf-modal-footer .primary-btn').disabled}},length));}
  for(const s of snapshots){for(const key of ['modal','heading','input','footer'])for(const dimension of ['top','height'])assert.ok(Math.abs(s[key][dimension]-snapshots[0][key][dimension])<1,`${name} ${key}.${dimension} ${JSON.stringify(snapshots)}`);assert.equal(s.invalid,s.length>25);assert.equal(s.disabled,s.length===0||s.length>25)}
  record(`stable-${name}-${id}`,{snapshots});await page.getByRole('button',{name:'Отмена',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 }
 await stable('note-create',()=>page.getByRole('button',{name:'Новая заметка',exact:true}).click(),()=>page.getByPlaceholder('Например, Итоги встречи'));
 await page.getByRole('button',{name:'Проекты',exact:true}).click();await page.getByRole('button',{name:'Новый проект',exact:true}).waitFor();
 await stable('project-create',()=>page.getByRole('button',{name:'Новый проект',exact:true}).click(),()=>page.getByPlaceholder('Например, Исследование рынка'));
 await stable('project-rename',async()=>{await page.getByLabel('Действия с проектом «QA проект»',{exact:true}).click();await page.getByRole('menuitem',{name:'Изменить проект',exact:true}).click()},()=>page.getByPlaceholder('Например, Исследование рынка'));
 await page.getByRole('button',{name:'Теги',exact:true}).click();await page.getByRole('button',{name:'Новый тег',exact:true}).waitFor();
 await stable('tag-create',()=>page.getByRole('button',{name:'Новый тег',exact:true}).click(),()=>page.getByRole('dialog').locator('input'));
 await stable('tag-rename',async()=>{await page.getByLabel('Действия с тегом «Синий»',{exact:true}).click();await page.getByRole('menuitem',{name:'Редактировать',exact:true}).click()},()=>page.getByRole('dialog').locator('input'));
 await page.getByRole('button',{name:'Все заметки',exact:true}).click();await page.locator('.tiptap a').first().waitFor();await settle(page);
 const title=page.getByRole('textbox',{name:'Название заметки',exact:true});const renameHeights=[];
 const writes=await page.evaluate(()=>window.finalQa.commands.filter(c=>c==='update_note_content').length);
 for(const length of [24,25,26,30,25]){await title.fill('я'.repeat(length));await settle(page);renameHeights.push(await page.locator('.entity-name-counter').evaluate(n=>({height:n.getBoundingClientRect().height,invalid:n.classList.contains('exceeded')})));assert.equal(renameHeights.at(-1).invalid,length>25)}
 for(const sample of renameHeights)assert.ok(Math.abs(sample.height-renameHeights[0].height)<1);
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.finalQa.commands.filter(c=>c==='update_note_content').length),writes);
 record(`stable-note-inline-rename-${id}`,{renameHeights});
 await (await tool(page,'note-link')).click();await page.getByRole('option').first().waitFor();await settle(page);
 const inspect=()=>page.getByRole('combobox').evaluate(input=>{const body=input.closest('.nf-modal-body'),modal=input.closest('[role="dialog"]'),r=input.getBoundingClientRect(),b=body.getBoundingClientRect(),m=modal.getBoundingClientRect();return {inputTop:r.top,inputBottom:r.bottom,bodyTop:b.top,bodyBottom:b.bottom,bodyScroll:body.scrollTop,modalTop:m.top,modalBottom:m.bottom,height:innerHeight,root:document.documentElement.scrollWidth,client:innerWidth,focus:input===document.activeElement}});
 const initial=await inspect();assert.ok(initial.inputTop>=initial.bodyTop+3*zoom/100-1,JSON.stringify(initial));assert.ok(initial.inputBottom<=initial.bodyBottom);assert.ok(initial.modalTop>=0&&initial.modalBottom<=initial.height+1);assert.equal(initial.focus,true);assert.ok(initial.root<=initial.client+1);
 await page.keyboard.press('ArrowUp');await settle(page);const selected=await inspect();assert.equal(selected.bodyScroll,initial.bodyScroll);assert.equal(selected.inputTop,initial.inputTop);
 await page.getByRole('combobox').fill('НЕСУЩЕСТВУЕТ');await page.getByText('Заметки не найдены',{exact:true}).waitFor();await page.getByRole('combobox').fill('');await page.getByRole('option').first().waitFor();record(`picker-focus-search-${id}`,{initial,selected});
 await page.screenshot({path:`${output}/picker-${id}.png`});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await page.close();
}
for(const zoom of [100,160]){
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.goto(`${base}?perf-notes=2&zoom=${zoom}`);await page.locator('.tiptap').waitFor();await settle(page);
 const plain=source;const html=`<pre><code>${plain.replaceAll('&','&amp;').replaceAll('<','&lt;')}</code></pre>`;
 await page.evaluate(async({plain,html})=>navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([plain],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]),{plain,html});
 await page.locator('.tiptap').focus();await page.keyboard.press('Control+Home');await page.keyboard.press('Control+a');await page.keyboard.press('Control+v');await page.locator('.tiptap table').waitFor();
 const keyboard=await page.locator('.tiptap').evaluate(n=>n.editor.getJSON());assert.equal(await page.locator('.tiptap pre').count(),1);
 await page.locator('.tiptap').focus();await page.keyboard.press('Control+a');await page.locator('.tiptap').click({button:'right'});await page.getByRole('menuitem',{name:'Вставить',exact:true}).click();await page.locator('.tiptap table').waitFor();const context=await page.locator('.tiptap').evaluate(n=>n.editor.getJSON());assert.deepEqual(context,keyboard);record(`actual-browser-clipboard-keyboard-context-${zoom}`,{});await page.close();
 const listPage=await browser.newPage({viewport:{width:Math.max(1100,Math.ceil(820*zoom/100+190+260)),height:700}});await listPage.goto(`${base}?perf-notes=10000&zoom=${zoom}`);await listPage.locator('.tiptap').waitFor();await settle(listPage);assert.ok(await listPage.locator('.cards .card').count()<100);
 await listPage.locator('.cards').evaluate(n=>n.scrollTop=n.scrollHeight);await listPage.getByRole('button',{name:/QA заметка 9999/}).waitFor();await listPage.locator('.cards .card-hit').last().focus();await listPage.keyboard.press('Home');await listPage.waitForFunction(()=>document.activeElement?.textContent.includes('QA заметка 0'));
 assert.ok(await listPage.locator('.cards .card').count()<100);record(`virtual-list-bottom-keyboard-${zoom}`,{});await listPage.close();
}
assert.deepEqual(errors,[]);
}finally{await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));await browser.close()}
console.log(`PASS ${results.length} post-RC6 corrective cases`);
