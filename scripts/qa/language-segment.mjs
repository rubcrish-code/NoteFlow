import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = process.env.NOTEFLOW_LANGUAGE_QA_OUT || 'releases/qa/language-segment/browser';
const base = process.env.NOTEFLOW_QA_URL || 'http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html';
const results = [], errors = [];
await mkdir(out, { recursive: true });
try {
  for (const theme of ['light','dark']) for (const zoom of [100,125,150,160]) for (const width of [900,1100,1280,1440,1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?full-i18n&forms&theme=${theme}&zoom=${zoom}`);
    await page.locator('.tiptap').waitFor();
    const before = await page.evaluate(() => JSON.stringify(window.finalQa.notes()));
    const saves = await page.evaluate(() => window.finalQa.commands.filter(x => x === 'update_note_content').length);
    await page.locator('.sb nav button').nth(5).click();
    await page.locator('.settings-nav-col button').first().click();
    const group = page.getByRole('radiogroup');
    const ru = page.getByRole('radio', { name: 'Русский', exact: true });
    const en = page.getByRole('radio', { name: 'English', exact: true });
    assert.equal(await page.locator('#general-profile-heading').locator('..').getByRole('radiogroup').count(), 1);
    for (const language of ['ru','en']) {
      await (language === 'ru' ? ru : en).check();
      await page.waitForTimeout(200);
      const geometry = await group.evaluate(control => {
        const row = control.closest('.settings-preference-row');
        const copy = row.querySelector('.settings-preference-copy');
        const g = control.getBoundingClientRect(), r = row.getBoundingClientRect(), c = copy.getBoundingClientRect();
        const scale = parseFloat(getComputedStyle(control.closest('.app-zoom-root')).zoom) || 1;
        return {
          width: g.width / scale, height: g.height / scale,
          topGap: (g.top-r.top)/scale, bottomGap: (r.bottom-g.bottom)/scale,
          sameRow: Math.abs(c.top+c.height/2-g.top-g.height/2)<2,
          separated: c.right <= g.left+1 || c.bottom <= g.top+1,
          contained: g.left>=r.left-1 && g.right<=r.right+1 && g.right<=innerWidth+1,
          overflow: document.documentElement.scrollWidth>innerWidth+1,
          rowOverflow: row.scrollWidth>row.clientWidth+1,
          copyOverflow: copy.scrollWidth>copy.clientWidth+1,
          active: getComputedStyle(control,'::before').backgroundColor,
          transition: getComputedStyle(control,'::before').transitionDuration,
          halves: [...control.querySelectorAll('label')].map(label=>label.getBoundingClientRect().width),
          typography: [...control.querySelectorAll('label span'), row.parentElement.querySelector('.secondary-btn')].map(element => {
            const style = getComputedStyle(element);
            return Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'].map(key=>[key,style[key]]));
          }),
        };
      });
      assert.ok(geometry.contained && geometry.separated && !geometry.overflow && !geometry.rowOverflow && !geometry.copyOverflow, JSON.stringify({theme,zoom,width,geometry}));
      assert.ok(Math.abs(geometry.halves[0]-geometry.halves[1])<1);
      assert.equal(geometry.active, 'rgb(59, 130, 246)');
      assert.ok(Math.abs(geometry.width-224)<1, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.height-38)<1, JSON.stringify(geometry));
      if(geometry.sameRow) {
        assert.ok(geometry.topGap>=10 && geometry.topGap<=12, JSON.stringify(geometry));
        assert.ok(geometry.bottomGap>=10 && geometry.bottomGap<=12, JSON.stringify(geometry));
      }
      assert.equal(geometry.transition,'0.16s');
      assert.deepEqual(geometry.typography[0],geometry.typography[2]);
      assert.deepEqual(geometry.typography[1],geometry.typography[2]);
      assert.equal(await (language==='ru'?ru:en).isChecked(),true);
      results.push({theme,zoom,viewportWidth:width,language,...geometry});
      if(width===1920 && zoom===100) await page.screenshot({path:`${out}/${theme}-${language}.png`});
    }
    await ru.focus(); await page.keyboard.press('ArrowRight'); await en.waitFor();
    assert.equal(await en.isChecked(),true); assert.equal(await en.evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('ArrowLeft'); assert.equal(await ru.isChecked(),true);
    const focus = await ru.evaluate(el=>getComputedStyle(el.nextElementSibling).outlineStyle); assert.equal(focus,'solid');
    await page.keyboard.press('Tab'); assert.equal(await ru.evaluate(el=>document.activeElement===el),false);
    await page.keyboard.press('Shift+Tab'); assert.equal(await ru.evaluate(el=>document.activeElement===el),true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(parseFloat(await group.evaluate(el=>getComputedStyle(el,'::before').transitionDuration))<=0.001);
    await en.check();
    await page.waitForFunction(()=>localStorage.getItem('noteflow.qa.interfaceLanguage')==='en');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.finalQa.notes())), before);
    assert.equal(await page.evaluate(()=>window.finalQa.commands.filter(x=>x==='update_note_content').length),saves);
    await page.reload(); await page.locator('.tiptap').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.locator('.sb nav button').nth(5).click(); await page.locator('.settings-nav-col button').first().click();
    assert.equal(await page.getByRole('radio',{name:'English',exact:true}).isChecked(),true);
    await page.getByRole('radio',{name:'Русский',exact:true}).check();
    await page.waitForFunction(()=>localStorage.getItem('noteflow.qa.interfaceLanguage')==='ru');
    results.push({theme,zoom,width,keyboard:true,reducedMotion:true,restart:true,noDocumentWrites:true});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS ${results.length} language-segment geometry/keyboard/persistence cases`);
} finally {
  await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));
  await browser.close();
}
