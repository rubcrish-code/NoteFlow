import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
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
    const dialog = page.getByRole("dialog", { name: "Экспортировать заметку" });
    assert.equal(await dialog.locator('input[type="radio"]').count(),4);
    assert.equal(await dialog.getByText('Markdown (.md)',{exact:true}).count(),1);
    const hint = await dialog.locator('#markdown-export-hint').evaluate(e=>({text:e.textContent,size:parseFloat(getComputedStyle(e).fontSize),weight:getComputedStyle(e).fontWeight,background:getComputedStyle(e).backgroundColor}));
    assert.equal(hint.text,'Сохраняет форматирование NoteFlow. Может использовать расширения Markdown, которые поддерживаются не всеми редакторами.');
    assert.ok(hint.size<=11*zoom/100+.1); assert.equal(hint.weight,'400'); assert.equal(hint.background,'rgba(0, 0, 0, 0)');
    await page.screenshot({path:`releases/qa/user-md-browser/modal-${width}-${zoom}-${theme}.png`});
    await page.getByRole("dialog", { name: "Экспортировать заметку" }).getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.waitForFunction(() => window.finalQa.exports.length === 1);
    const exported = await page.evaluate(() => window.finalQa.exports[0]);
    const roundtrip = await page.evaluate(source=>{
      const editor=document.querySelector('.tiptap').editor;
      const parsed=editor.schema.nodeFromJSON(editor.markdown.parse(source)); parsed.check();
      function signature(node){
        if(node.type==='text') return [...node.text].map(text=>({text,marks:(node.marks??[]).map(mark=>({type:mark.type,attrs:mark.attrs??{}})).sort((a,b)=>a.type.localeCompare(b.type))}));
        const children=[...(node.content??[])];
        while(children.at(-1)?.type==='paragraph'&&!children.at(-1)?.content?.length)children.pop();
        return [{type:node.type,attrs:node.attrs??{},content:children.flatMap(signature)}];
      }
      return {before:signature(editor.getJSON()),after:signature(parsed.toJSON())};
    },exported.markdown);
    assert.deepEqual(roundtrip.after,roundtrip.before,'Actual single-format export restores complete supported UI semantics');
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
