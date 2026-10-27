import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const expected = await readFile("tests/fixtures/standard-markdown-user.expected.md", "utf8");
const normalize = (source) => source.trim().split(/\r?\n/).filter((line) => line.trim()).join("\n");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [], errors = [];
await mkdir("releases/qa/user-md-browser", { recursive: true });
try {
  for (const zoom of [100, 160]) for (const theme of ["light", "dark"]) for (const width of [1100, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:1420/scripts/qa/final-ux-fixture.html?user-markdown&zoom=${zoom}&theme=${theme}`);
    await page.locator(".tiptap h1").waitFor();
    const before = await page.evaluate(() => window.finalQa.commands.filter((command) => command === "update_note_content").length);
    await page.locator('[data-tooltip="Меню заметки"]').click();
    await page.getByRole("button", { name: "Экспортировать", exact: true }).click();
    await page.getByRole("dialog", { name: "Экспортировать заметку" }).getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.waitForFunction(() => window.finalQa.exports.length === 1);
    const exported = await page.evaluate(() => window.finalQa.exports[0]);
    assert.equal(normalize(exported.markdown), normalize(expected));
    assert.doesNotMatch(exported.markdown, /<\/?(?:strong|em|p|h\d|table|blockquote|ul|ol)\b/);
    assert.equal(await page.evaluate(() => window.finalQa.commands.filter((command) => command === "update_note_content").length), before);
    await writeFile(`releases/qa/user-md-browser/${width}-${zoom}-${theme}.md`, exported.markdown);
    await page.screenshot({ path: `releases/qa/user-md-browser/${width}-${zoom}-${theme}.png` });
    results.push({ width, zoom, theme, version: exported.contentVersion });
    console.log(`PASS golden-export-${width}-${zoom}-${theme}`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile("releases/qa/user-md-browser/results.json", JSON.stringify(results, null, 2));
  console.log(`Standard Markdown acceptance PASS ${results.length}`);
} finally { await browser.close(); }
