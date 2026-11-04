import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { assertClassicContrast } from './classic-vibrant-expectations.mjs';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const baseline = process.argv.includes('--baseline'), version = baseline ? 'before' : 'after';
const output = `releases/qa/compact-forms/${version}`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[],errors=[];
const settle=page=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(r))});
function measure(modal){
  const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
  const form=modal.querySelector('form'),counter=modal.querySelector('.entity-name-counter'),feedback=modal.querySelector('.entity-name-feedback');
  const next=form.querySelectorAll('label')[1],colors=form.querySelector('fieldset');
  return{modal:rect(modal),heading:rect(modal.querySelector('h2')),input:rect(form.querySelector('input')),footer:rect(modal.querySelector('.nf-modal-footer')),counter:rect(counter),feedback:rect(feedback),next:colors?rect(colors):next?rect(next):null,
    error:feedback.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1,disabled:modal.querySelector('.primary-btn').disabled};
}
try{
  for(const width of [1100,1440])for(const zoom of [100,160])for(const theme of ['light','dark']){
    const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${baseline?1431:1420}/scripts/qa/final-ux-fixture.html?forms&zoom=${zoom}&theme=${theme}`);
    await page.locator('.tiptap').waitFor();await settle(page);
    const colors=await page.locator('.ed-tags .tag[style]').evaluateAll(nodes=>nodes.map(e=>{const s=getComputedStyle(e);const l=value=>{const a=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722};return{label:e.textContent,identity:s.getPropertyValue('--tag-color').trim(),background:s.backgroundColor,foreground:s.color,radius:s.borderRadius,contrast:(Math.max(l(s.color),l(s.backgroundColor))+.05)/(Math.min(l(s.color),l(s.backgroundColor))+.05)}}));
    assert.equal(colors.length,10);
    for(const color of colors) {
      if(baseline) assert.ok(color.contrast>=4.5);
      else color.accessibility=assertClassicContrast(color.background,color.foreground,theme,color.contrast);
    }
    if(width===1440&&zoom===100)await page.screenshot({path:`${output}/palette-${theme}.png`});
    await writeFile(`${output}/colors-${width}-${zoom}-${theme}.json`,JSON.stringify(colors,null,2));
    for(const kind of ['note-create','project-create','project-edit','tag-create','tag-edit']){
      if(kind==='note-create')await page.getByRole('button',{name:'Новая заметка',exact:true}).click();
      else if(kind.startsWith('project')){
        await page.getByRole('button',{name:'Проекты',exact:true}).click();
        if(kind==='project-create')await page.getByRole('button',{name:'Новый проект',exact:true}).click();
        else{await page.getByLabel('Действия с проектом «QA проект»',{exact:true}).click();await page.getByRole('menuitem',{name:'Изменить проект',exact:true}).click()}
      }else{
        await page.getByRole('button',{name:'Теги',exact:true}).click();
        if(kind==='tag-create')await page.getByRole('button',{name:'Новый тег',exact:true}).click();
        else{await page.getByLabel('Действия с тегом «Синий»',{exact:true}).click();await page.getByRole('menuitem',{name:'Редактировать',exact:true}).click()}
      }
      const modal=page.getByRole('dialog'),input=modal.locator('input').first();await settle(page);
      const samples=[];
      for(const [state,value]of [['empty',''],['valid','Уникальное имя'],['limit','я'.repeat(25)],['exceeded','я'.repeat(26)],['cleared','Уникальное имя']]){
        await input.fill(value);await settle(page);samples.push({state,...await modal.evaluate(measure)});
        if(state==='exceeded')assert.match(samples.at(-1).error,/25/);
        if(state==='empty'||state==='exceeded')assert.equal(samples.at(-1).disabled,true);
        if(state==='valid'||state==='cleared')assert.equal(samples.at(-1).disabled,false);
        if(width===1440&&zoom===100&&theme==='light'&&['empty','exceeded'].includes(state))await page.screenshot({path:`${output}/${kind}-${state}.png`});
      }
      if(kind.startsWith('tag')){
        await input.fill(kind==='tag-create'?'Синий':'Зелёный');await modal.getByRole('alert').waitFor();await settle(page);
        samples.push({state:'duplicate',...await modal.evaluate(measure)});assert.match(samples.at(-1).error,/существует/);assert.equal(samples.at(-1).disabled,true);
      }else if(kind==='project-create'){
        await input.fill('QA проект');await modal.locator('.primary-btn').click();await modal.getByRole('alert').waitFor();await settle(page);
        samples.push({state:'duplicate',...await modal.evaluate(measure)});assert.match(samples.at(-1).error,/существует/);
      }
      for(const sample of samples){assert.equal(sample.overflow,false);if(!baseline){assert.ok(sample.counter.height<=18*zoom/100+.2);for(const key of ['modal','heading','input','footer'])for(const dimension of ['y','height'])assert.ok(Math.abs(sample[key][dimension]-samples[0][key][dimension])<.5,`${kind} ${key}.${dimension}`)}}
      if(!baseline){
        // CSS-only stress case, not a claim that this synthetic text came from a backend error.
        await modal.locator('.entity-name-feedback').evaluate(e=>{e.textContent='Не удалось сохранить изменения. Проверьте название и повторите попытку. '.repeat(3);e.setAttribute('aria-hidden','false')});
        const long=await modal.evaluate(measure);assert.ok(long.feedback.height>18*zoom/100);assert.ok(long.feedback.right<=long.counter.right+.5);assert.ok(long.feedback.bottom<=long.counter.bottom+.5);if(long.next)assert.ok(long.next.y>=long.counter.bottom-.5);assert.ok(long.footer.y>=long.counter.bottom);assert.equal(long.overflow,false);
      }
      results.push({kind,width,zoom,theme,samples});await modal.getByRole('button',{name:'Отмена',exact:true}).click();await modal.waitFor({state:'detached'});
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
}finally{await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));await browser.close()}
console.log(`PASS compact forms ${version} ${results.length}`);
