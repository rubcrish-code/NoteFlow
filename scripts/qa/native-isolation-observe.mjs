// Read/timing instrumentation only; native input is sent through Computer Use.
import { writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9237");
try {
  const pages = browser.contexts().flatMap(c => c.pages()).filter(p => p.url().includes("tauri.localhost"));
  if (pages.length !== 1) throw new Error("Expected one isolated QA WebView");
  const page = pages[0];
  if (process.argv[2] === "install") {
    console.log(JSON.stringify(await page.evaluate(() => {
      if (window.isolationProbe) throw new Error("Already installed");
      const data = window.isolationProbe = { events: [], transactions: [] };
      const hooked = new WeakSet();
      let current;
      document.addEventListener("keydown", e => {
        if (!e.target.closest?.(".tiptap") || e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
        const editor = document.querySelector(".tiptap").editor;
        if (!hooked.has(editor)) {
          hooked.add(editor);
          const dispatch = editor.view.dispatch.bind(editor.view);
          editor.view.dispatch = tr => {
            const start = performance.now();
            try { return dispatch(tr); }
            finally {
              const end = performance.now();
              data.transactions.push({ mode: document.body.dataset.mode, changed: tr.docChanged, ms: end - start });
              if (current?.inputAt !== undefined && tr.docChanged) current.inputToDispatch = end - current.inputAt;
            }
          };
        }
        const start = performance.now();
        const event = current = { mode: document.body.dataset.mode, trusted: e.isTrusted, start };
        data.events.push(event);
        requestAnimationFrame(() => requestAnimationFrame(() => { event.raf2 = performance.now() - start; }));
      }, true);
      document.addEventListener("beforeinput", e => {
        if (e.target.closest?.(".tiptap") && current) { current.inputAt = performance.now(); current.inputLength = e.data?.length ?? 0; }
      }, true);
      return { paragraphs: document.querySelector(".tiptap").editor.state.doc.childCount, dpr: devicePixelRatio };
    })));
  } else {
    const data = await page.evaluate(() => ({ ...window.isolationProbe, mode: document.body.dataset.mode, focused: document.hasFocus(), viewport: [innerWidth, innerHeight] }));
    await writeFile("releases/qa/native-isolation-results.json", JSON.stringify(data, null, 2));
    console.log(JSON.stringify({ events: data.events.length, modes: [...new Set(data.events.map(e => e.mode))] }));
  }
} catch (error) { console.error(error); process.exit(1); }
process.exit(0);
