import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = 'releases/qa/full-localization/browser';
await mkdir(out, { recursive: true }); await mkdir('docs/images', { recursive: true });
const results = [], errors = [];
const labels = {
  ru: ['Основные', 'Модели ИИ', 'Внешний вид', 'Данные и экспорт', 'Горячие клавиши', 'О приложении'],
  en: ['General', 'AI models', 'Appearance', 'Data and export', 'Keyboard shortcuts', 'About'],
};
async function geometry(page, selector) {
  return page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height, scrollWidth:element.scrollWidth, clientWidth:element.clientWidth, viewportWidth:innerWidth, viewportHeight:innerHeight };
  });
}
try {
  for (const language of process.env.NOTEFLOW_I18N_EDITOR_ONLY ? [] : ['ru','en']) for (const theme of ['light','dark']) for (const zoom of [100,125,150,160]) for (const width of [1100,1920,2800]) {
    const page = await browser.newPage({ viewport:{width,height:1100} });
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?language=${language}&theme=${theme}&zoom=${zoom}&forms&ai-i18n=none&rag=multiple`);
    try { await page.locator('.tiptap').waitFor(); }
    catch(error) {
      await page.screenshot({path:`${out}/load-failure-${language}-${theme}-${zoom}-${width}.png`});
      await writeFile(`${out}/load-failure.json`,JSON.stringify({language,theme,zoom,width,text:await page.locator('body').innerText(),errors},null,2));
      throw error;
    }
    const before = await page.evaluate(()=>JSON.stringify(window.finalQa.notes()));
    await page.locator('.sb nav button').nth(5).click();
    await page.locator('.settings-nav-col').waitFor();
    for (let index=0;index<labels[language].length;index++) {
      await page.locator('.settings-nav-col button').nth(index).click();
      const expected = labels[language][index];
      assert.equal((await page.locator('.settings-nav-col button').nth(index).innerText()).trim(),expected);
      const text = await page.locator('.settings-content').innerText();
      if(language==='en') assert.doesNotMatch(text.replaceAll('Русский',''),/[А-Яа-яЁё]/, `${expected} ${theme} ${zoom} ${width}`);
      const g = await geometry(page,'.settings-layout-inner');
      assert.ok(g.scrollWidth<=g.clientWidth+2,JSON.stringify({expected,language,theme,zoom,width,g}));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      results.push({area:expected,language,theme,zoom,width,geometry:g});
      if(index===0 && zoom===100 && width===1920) await page.screenshot({path:`${out}/language-${language}-${theme}.png`});
    }
    assert.equal(await page.evaluate(()=>JSON.stringify(window.finalQa.notes())),before);
    await page.close();
  }
  for(const language of ['ru','en']) for(const theme of ['light','dark']) for(const zoom of [100,160]) {
    const page = await browser.newPage({viewport:{width:2800,height:1400}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?language=${language}&theme=${theme}&zoom=${zoom}&ai-i18n=none&rag=multiple`);
    await page.locator('.tiptap').waitFor();
    assert.equal(await page.locator('.toolbar [data-toolbar-action]').count(),31);
    const toolbar=await geometry(page,'.toolbar'); assert.ok(toolbar.scrollWidth<=toolbar.clientWidth+1);
    await page.locator('[data-toolbar-action="ai"]').click();
    await page.locator('.editor-ai-menu').waitFor();
    const ai=await geometry(page,'.editor-ai-menu');
    assert.ok(ai.left>=0&&ai.right<=ai.viewportWidth+1&&ai.top>=0&&ai.bottom<=ai.viewportHeight+1,JSON.stringify(ai));
    const text=await page.locator('.editor-ai-menu').innerText();
    if(language==='en') assert.doesNotMatch(text,/[А-Яа-яЁё]/);
    await page.screenshot({path:`${out}/assistant-${language}-${theme}-${zoom}.png`});
    await page.keyboard.press('Escape');
    await page.locator('[data-note-control="chat"]').click(); await page.locator('.note-chat-empty').first().waitFor();
    if(language==='en') {
      const history = await page.locator('.note-chat-markdown').allInnerTexts();
      assert.ok(history.some(text=>text.includes('История QA')), 'User/model history must not be translated');
      let uiText = await page.locator('.note-chat').innerText();
      for(const content of history) uiText=uiText.replace(content,'');
      assert.doesNotMatch(uiText.replaceAll('Связи',''),/[А-Яа-яЁё]/);
    }
    await page.locator('.note-chat button.x').click();
    if(zoom===100&&theme==='light') await page.screenshot({path:`docs/images/interface-${language}.png`});
    await page.locator('[data-toolbar-action="note-link"]').click();
    await page.locator('[role="combobox"]').waitFor();
    assert.equal(await page.locator('[role="combobox"]').getAttribute('aria-label'),language==='en'?'Search notes by title':'Поиск заметки по названию');
    await page.keyboard.press('Escape');
    await page.locator('[data-note-control="focus-exit"]').count();
    results.push({area:'editor/AI/picker',language,theme,zoom,toolbar,ai}); await page.close();
  }
  {
    const page=await browser.newPage({viewport:{width:2400,height:1200}});
    await page.goto('http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?full-i18n&ai-i18n=none');
    await page.locator('.tiptap').waitFor();
    const before=await page.evaluate(()=>JSON.stringify(window.finalQa.notes()));
    const savesBefore=await page.evaluate(()=>window.finalQa.commands.filter(x=>x==='update_note_content').length);
    await page.locator('.sb nav button').nth(5).click(); await page.locator('.settings-nav-col button').first().click();
    await page.getByRole('radio', { name: 'English', exact: true }).check();
    await page.getByRole('button',{name:'All notes',exact:true}).waitFor();
    await page.waitForFunction(()=>localStorage.getItem('noteflow.qa.interfaceLanguage')==='en');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.finalQa.notes())),before);
    assert.equal(await page.evaluate(()=>window.finalQa.commands.filter(x=>x==='update_note_content').length),savesBefore);
    await page.reload(); await page.locator('.tiptap').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.getByRole('button',{name:'All notes',exact:true}).waitFor();
    results.push({area:'live-switch/restart/content-integrity',pass:true}); await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS ${results.length} bilingual settings/editor/theme/zoom/geometry/persistence cases`);
} finally {
  await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2)); await browser.close();
}
