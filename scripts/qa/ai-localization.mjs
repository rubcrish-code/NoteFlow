import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const output = 'releases/qa/ai-localization/browser'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [];
const forbidden = /default\s+(?:LLM\s+)?provider|LLM provider|AI provider|AI privacy|API key|Chat endpoint|Endpoint доступен/i;
try {
  for (const language of ['ru', 'en']) for (const theme of ['light', 'dark']) for (const zoom of [100, 160]) {
    const page = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
    page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?ai-i18n=none&language=${language}&theme=${theme}&zoom=${zoom}&rag=multiple`;
    await page.goto(url); await page.locator('.tiptap').waitFor();
    await page.locator('[data-toolbar-action="ai"]').click();
    const message = page.locator('.ai-disconnected-state span');
    await message.waitFor();
    const expected = language === 'ru' ? 'Провайдер ИИ-модели по умолчанию не выбран' : 'No default AI model provider selected';
    await page.waitForFunction(text => document.querySelector('.ai-disconnected-state span')?.textContent === text, expected);
    assert.equal(await message.textContent(), expected);
    assert.equal(await page.locator('.toolbar [data-toolbar-action]').count(), 31);
    const geometry = await page.locator('.editor-ai-menu').evaluate(element => {
      const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    const withinViewport = geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1;
    let baselineGeometry;
    if (!withinViewport) {
      assert.equal(zoom, 160, 'No new overflow at normal zoom');
      const baseline = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
      await baseline.goto(`http://127.0.0.1:1431/scripts/qa/final-ux-fixture.html?theme=${theme}&zoom=${zoom}`);
      await baseline.locator('.tiptap').waitFor(); await baseline.locator('[data-toolbar-action="ai"]').click();
      await baseline.locator('.editor-ai-menu').waitFor();
      baselineGeometry = await baseline.locator('.editor-ai-menu').evaluate(element => {
        const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
      });
      assert.ok(baselineGeometry.right > baselineGeometry.width, 'Must reproduce the same pre-existing CSS-zoom issue');
      assert.ok(Math.abs(geometry.left - baselineGeometry.left) <= 1 && Math.abs(geometry.right - baselineGeometry.right) <= 1);
      await baseline.close();
    }
    if (zoom === 100) await page.screenshot({ path: `${output}/assistant-${language}-${theme}.png` });
    await page.keyboard.press('Escape');
    await page.locator('[data-note-control="chat"]').click();
    await page.locator('.note-chat-empty').first().waitFor();
    assert.ok((await page.locator('.note-chat-empty span').first().textContent()).includes(language === 'ru' ? 'провайдера ИИ-модели по умолчанию' : 'default provider'));
    if (language === 'ru') assert.doesNotMatch(await page.locator('.note-chat').innerText(), forbidden);
    await page.getByRole('button', { name: 'Закрыть чат', exact: true }).or(page.getByRole('button', { name: 'Close note chat', exact: true })).click();
    await page.getByRole('button', { name: language === 'ru' ? 'Настройки' : 'Settings', exact: true }).click();
    await page.getByRole('button', { name: language === 'ru' ? 'Модели ИИ' : 'AI models', exact: true }).click();
    await page.locator('.llm-empty-state-card').waitFor();
    if (language === 'ru') assert.doesNotMatch(await page.locator('.settings-content').innerText(), forbidden);
    else assert.doesNotMatch(await page.locator('.settings-content').innerText(), /[А-Яа-яЁё]/);
    if (language === 'ru' && zoom === 100) await page.screenshot({ path: `${output}/settings-${theme}.png` });
    await page.getByRole('button', { name: language === 'ru' ? 'ИИ-чат по базе' : 'Knowledge chat', exact: true }).click();
    await page.getByText('QA источники', { exact: true }).first().waitFor();
    if (language === 'ru') assert.doesNotMatch(await page.locator('.rag-production-chat').innerText(), forbidden);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    results.push({ language, theme, zoom, assistantMessage: expected, noteChat: true, settings: true, globalChat: true, geometry, withinViewport, baselineGeometry,
      geometryLimitation: withinViewport ? null : 'Pre-existing browser CSS-zoom 160% popup placement; not a localization regression or geometry PASS' });
    await page.close();
  }
  for (const state of ['privacy', 'ready']) {
    const page = await browser.newPage({ viewport: { width: 2000, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?ai-i18n=${state}`);
    await page.locator('.tiptap').waitFor(); await page.locator('[data-tooltip="Чат по заметке"]').click();
    if (state === 'privacy') {
      await page.getByText('Внешний провайдер ИИ-модели', { exact: true }).waitFor();
      assert.doesNotMatch(await page.locator('.note-chat').innerText(), forbidden);
      await page.screenshot({ path: `${output}/chat-privacy.png` });
    } else {
      await page.locator('.note-chat strong', { hasText: 'История QA' }).waitFor();
      const input = page.getByPlaceholder('Спросить по заметке…');
      await input.fill('Синтетический вопрос о заметке'); await input.press('Enter');
      await page.locator('.note-chat strong', { hasText: 'Ответ QA' }).waitFor();
      assert.equal(await page.evaluate(() => window.finalQa.commands.filter(command => command === 'save_note_chat_message').length), 2);
      await page.getByRole('button', { name: 'Закрыть чат', exact: true }).click();
      await page.locator('[data-tooltip="Чат по заметке"]').click();
      await page.locator('.note-chat strong', { hasText: 'Ответ QA' }).first().waitFor();
      await page.screenshot({ path: `${output}/chat-ready.png` });
    }
    results.push({ state, localSyntheticOnly: true }); await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${results.length} AI localization/chat/settings/theme/zoom browser cases`);
} finally { await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
