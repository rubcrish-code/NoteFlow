// Synthetic IPC regression. This is not a live-provider or native Tauri test.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const zoom of [100, 160]) {
    for (const scenario of ['current', 'archived', 'multiple', 'repeated', 'stale', 'missing', 'deleted']) {
      const page = await browser.newPage({ viewport: { width: 1536, height: 900 }, reducedMotion: 'reduce' });
      try {
        await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?zoom=${zoom}&rag=${scenario}`);
        await page.locator('.tiptap').waitFor();
        await page.getByRole('button', { name: 'ИИ-чат по базе', exact: true }).click();
        await page.locator('.rag-source-card').first().waitFor();
        const writes = () => page.evaluate(() => window.finalQa.commands.filter(c => c === 'update_note_content').length);
        const before = await writes();
        await page.locator('.rag-source-card').first().click();
        if (scenario === 'deleted') {
          await page.getByRole('status').filter({ hasText: /Не удалось|недоступ|найден/ }).first().waitFor();
        } else {
          await page.locator('.tiptap h1').filter({ hasText: 'Целевая' }).waitFor();
          const expected = ['current', 'archived', 'multiple'].includes(scenario);
          if (expected) await page.locator('.note-fragment-target').first().waitFor({ timeout: 2500 });
          else await page.waitForTimeout(500);
          assert.equal(await page.locator('.note-fragment-target').count() > 0, expected);
          if (expected) {
            const geometry = await page.locator('.note-fragment-target').first().evaluate(node => {
              const highlight = node.getBoundingClientRect(); const scroll = node.closest('.ed-scroll').getBoundingClientRect();
              return { top: highlight.top, bottom: highlight.bottom, viewportTop: scroll.top, viewportBottom: scroll.bottom };
            });
            assert.ok(geometry.bottom > geometry.viewportTop && geometry.top < geometry.viewportBottom, JSON.stringify(geometry));
          }
          await page.waitForTimeout(4300);
          assert.equal(await page.locator('.note-fragment-target').count(), 0);
          await page.getByRole('button', { name: 'ИИ-чат по базе', exact: true }).click();
          await page.locator('.rag-source-card').first().waitFor();
          assert.match(await page.locator('.rag-page').innerText(), /Проверяемый ответ/);
          if (scenario === 'multiple') {
            assert.equal(await page.locator('.rag-source-card').count(), 2);
            await page.locator('.rag-source-card').nth(1).click();
            await page.locator('.note-fragment-target').first().waitFor({ timeout: 2500 });
            assert.match(await page.locator('.note-fragment-target').first().innerText(), /Абзац 4\./);
          }
        }
        assert.equal(await writes(), before, 'source navigation must not autosave');
        results.push({ zoom, scenario, pass: true, extraSaves: 0 });
      } catch (error) {
        await page.screenshot({ path: 'releases/qa/cas-rag-browser-failure.png' });
        console.log((await page.getByRole('button').allTextContents()).filter(Boolean));
        throw error;
      } finally { await page.close(); }
    }
  }
  console.log(`PASS ${results.length} RAG source navigation cases (synthetic IPC)`);
} finally {
  await writeFile('releases/qa/cas-rag-browser-results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
