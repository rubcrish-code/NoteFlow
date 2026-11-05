import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
const {chromium} = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const output='releases/qa/native-smoke-corrective'; await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}); const results=[];
try {
 for(const height of [700,1440]) for(const theme of ['light','dark']) for(const zoom of [100,160]) {
  const page=await browser.newPage({viewport:{width:2560,height}});
  await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?theme=${theme}&zoom=${zoom}&picker-count=100`);
  await page.locator('.tiptap').waitFor();
  await page.getByRole('button',{name:'Теги',exact:true}).click();
  await page.getByRole('button',{name:'Новый тег',exact:true}).click();
  const modal=page.getByRole('dialog'), input=modal.locator('input').first();
  await input.fill('Тест');
  await modal.evaluate(async e=>{await Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
  const before=await modal.boundingBox();
  await input.fill('я'.repeat(26));
  await modal.getByRole('alert').waitFor();
  const after=await modal.boundingBox();
  assert.ok(Math.abs(before.y-after.y)<1 && Math.abs(before.height-after.height)<1,`Validation must not move the modal: ${JSON.stringify({before,after})}`);
  await input.fill('Тест');
  const cleared=await modal.boundingBox(); assert.ok(Math.abs(before.y-cleared.y)<1);
  results.push({name:`stable-validation-${height}-${theme}-${zoom}`,before,after,cleared});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Все заметки',exact:true}).click();
  await page.locator('[data-toolbar-action="note-link"]').click();
  const picker=page.getByRole('dialog'), combo=picker.getByRole('combobox'); await combo.waitFor();
  const box=await combo.boundingBox(), body=await picker.locator('.nf-modal-body').boundingBox();
  assert.ok(box.y>=body.y+1 && box.y+box.height<=body.y+body.height,'Input including border must fit modal body');
  assert.equal(await combo.evaluate(e=>e.scrollHeight<=e.clientHeight),true);
  results.push({name:`unclipped-picker-${height}-${theme}-${zoom}`,box,body});
  await page.keyboard.press('Escape');
  await page.locator('.tiptap').evaluate(e=>{
   const editor=e.editor;editor.commands.setContent('<p><strong>before </strong><em>selected</em><u> after</u></p><p>End</p>');
   editor.commands.setTextSelection({from:8,to:16});
  });
  await page.locator('[data-toolbar-action="quote"]').click();
  assert.equal(await page.locator('.tiptap blockquote').textContent(),'selected');
  assert.equal(await page.locator('.tiptap p strong').first().textContent(),'before ');
  assert.equal(await page.locator('.tiptap p u').textContent(),' after');
  assert.equal(await page.locator('[data-toolbar-action]').count(),31);
  results.push({name:`selected-quote-toolbar-${height}-${theme}-${zoom}`});
  await page.close();
 }
} finally {await writeFile(`${output}/results.json`,JSON.stringify({results},null,2));await browser.close();}
console.log(`PASS ${results.length}`);
