import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({channel:'msedge',headless:true});
const out = 'releases/qa/neutral-button-backgrounds/browser';
const results = [], errors = [];
const neutral = '.secondary-btn, .nf-button--secondary, .tag-action.secondary, .archive-action.secondary, .export-action.secondary, .font-action.secondary, .file-attachment-action:not(.primary), .zoom-reset-btn, .rag-new-chat, .note-chat-suggestions button, .semantic-search-button.secondary';
const samples = [
  ['secondary','<button class="secondary-btn">Secondary</button>'],
  ['foundation','<button class="nf-button nf-button--secondary">Secondary</button>'],
  ['compact','<button class="secondary-btn compact">Compact</button>'],
  ['tag','<button class="tag-action secondary">Tag action</button>'],
  ['archive','<button class="archive-action secondary">Restore</button>'],
  ['export','<button class="export-action secondary">Export</button>'],
  ['font','<button class="font-action secondary">Reset</button>'],
  ['file','<button class="file-attachment-action">Open file</button>'],
  ['zoom','<button class="zoom-reset-btn">100%</button>'],
  ['model-secret','<div class="secret-wrap"><button>Key action</button></div>'],
  ['model-discovery','<div class="input-action"><button>Models</button></div>'],
  ['cancel','<div class="new-note-actions"><button class="cancel">Cancel</button></div>'],
  ['image','<div class="image-action-panel"><button>Resize</button></div>'],
  ['table','<div class="table-tools-grid"><button>Add row</button></div>'],
  ['table-clear','<button class="table-color-clear">Clear</button>'],
  ['table-border','<button class="table-border-toggle">Border</button>'],
  ['calendar','<div class="date-picker-nav"><button>Next month</button></div>'],
  ['rag','<div class="rag-page"><button class="rag-new-chat">New chat</button></div>'],
  ['chat-suggestion','<div class="note-chat-suggestions"><button>Summarize</button></div>'],
  ['semantic','<button class="semantic-search-button secondary">Search</button>'],
];
async function expected(page, value) {
  return page.evaluate(value => {
    const probe=document.createElement('span'); probe.style.background=value;
    document.querySelector('.app-zoom-root').append(probe);
    const color=getComputedStyle(probe).backgroundColor; probe.remove(); return color;
  },value);
}
async function inspectPage(page, area, context) {
  const background = await expected(page,'var(--button-bg)');
  const buttons = await page.locator(neutral).evaluateAll(elements => elements.map(element=>({className:element.className,background:getComputedStyle(element).backgroundColor})));
  for(const button of buttons) assert.equal(button.background,background,JSON.stringify({area,context,button,background}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  results.push({area,...context,buttons});
}
await mkdir(out,{recursive:true});
try {
  for(const theme of ['light','dark']) for(const zoom of [100,160]) for(const width of [1440,2800]) {
    const context={theme,zoom,width};
    const page=await browser.newPage({viewport:{width,height:1200}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?forms&theme=${theme}&zoom=${zoom}&ai-i18n=none`);
    await page.locator('.tiptap').waitFor();
    const notes=await page.evaluate(()=>JSON.stringify(window.finalQa.notes()));
    await page.locator('.sb nav button').nth(5).click();
    await page.locator('.settings-nav-col button').first().click();
    const track=await page.locator('#interface-language').evaluate(element=>getComputedStyle(element).backgroundColor);
    assert.equal(track,theme==='light'?'rgb(242, 246, 253)':'rgb(29, 37, 49)');
    for(const index of [0,1,2,3,4,5]) {
      await page.locator('.settings-nav-col button').nth(index).click();
      await inspectPage(page,`settings-${index}`,context);
      if(index===0 && zoom===100 && width===2800) await page.screenshot({path:`${out}/profile-${theme}.png`});
    }
    for(const index of [1,3,4,2]) {
      await page.locator('.sb nav button').nth(index).click();
      await page.waitForTimeout(120);
      await inspectPage(page,`page-${index}`,context);
    }
    await page.locator('.sb nav button').nth(5).click(); await page.locator('.settings-nav-col button').first().click();
    const hover=await expected(page,'var(--button-bg-hover)');
    const sampleResults=[];
    for(const [name,html] of samples) {
      await page.mouse.move(width-2,1198);
      await page.evaluate(html=>{
        const host=document.createElement('div'); host.id='neutral-button-probe';
        Object.assign(host.style,{position:'fixed',left:'4px',top:'4px',zIndex:'2147483647',background:'var(--surface-panel)',padding:'8px'});
        host.innerHTML=html; document.querySelector('.app-zoom-root').append(host);
      },html);
      const button=page.locator('#neutral-button-probe button');
      assert.equal(await button.evaluate(element=>getComputedStyle(element).backgroundColor),track,name);
      await button.hover(); await page.waitForTimeout(220);
      const hovered=await button.evaluate(element=>getComputedStyle(element).backgroundColor);
      assert.equal(hovered,hover,`${name} hover`);
      await button.focus();
      assert.equal(await button.evaluate(element=>document.activeElement===element),true);
      await button.evaluate(element=>{element.disabled=true;});
      assert.equal(await button.isDisabled(),true);
      sampleResults.push({name,background:track,hover:hovered});
      await page.locator('#neutral-button-probe').evaluate(element=>element.remove());
    }
    const protectedStates=await page.evaluate(()=>{
      const host=document.createElement('div');
      host.innerHTML='<button class="primary-btn">Primary</button><button class="danger-btn">Delete</button><button class="ghost-btn">Ghost</button><input class="neutral-input-probe"><div class="field"><input></div>';
      document.querySelector('.app-zoom-root').append(host);
      const result=Object.fromEntries([...host.querySelectorAll('button, .field input')].map(element=>[element.className||'input',{background:getComputedStyle(element).backgroundColor,color:getComputedStyle(element).color}]));
      host.remove(); return result;
    });
    assert.equal(protectedStates['ghost-btn'].background,'rgba(0, 0, 0, 0)');
    assert.equal(protectedStates['input'].background,theme==='light'?'rgb(244, 244, 244)':'rgb(36, 36, 39)');
    assert.equal(protectedStates['primary-btn'].background,theme==='light'?'rgb(59, 130, 246)':'rgb(96, 165, 250)');
    assert.notEqual(protectedStates['danger-btn'].background,track);
    assert.equal(protectedStates['danger-btn'].color,theme==='light'?'rgb(209, 67, 67)':'rgb(255, 116, 116)');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.finalQa.notes())),notes);
    results.push({area:'20 component style samples / protected semantics',...context,sampleResults,protectedStates});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS ${results.length} neutral-button page/style/theme/zoom cases`);
} finally {
  await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2)); await browser.close();
}
