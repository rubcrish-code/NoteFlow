import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const { chromium } = await import(process.env.NOTEFLOW_QA_PLAYWRIGHT || "playwright");
const output = resolve(process.env.NOTEFLOW_QA_DIAGNOSTICS || "releases/qa/sidebar-gate-diagnostics");
await mkdir(output, { recursive: true });
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...options) => {
    const page = await newPage(...options);
    await page.context().tracing.start({ screenshots: true, snapshots: true });
    await page.addInitScript(() => {
      window.sidebarDiagnostics = [];
      const log = (entry) => {
        window.sidebarDiagnostics.push({ time: performance.now(), ...entry });
        if (window.sidebarDiagnostics.length > 2000) window.sidebarDiagnostics.shift();
      };
      for (const type of ["transitionrun", "transitionstart", "transitionend", "transitioncancel"]) {
        document.addEventListener(type, (event) => {
          if (event.target.matches?.(".workspace, .page-shell, .rag-page, .sb, .sidebar-action-label")) {
            log({ type, target: event.target.className, property: event.propertyName, elapsed: event.elapsedTime });
          }
        }, true);
      }
      document.addEventListener("click", (event) => {
        if (event.target.closest?.(".sb .col")) log({ type: "toggle-click", collapsed: Boolean(document.querySelector(".collapse-sb")) });
      }, true);
    });
    return page;
  };
  const close = browser.close.bind(browser);
  browser.close = async () => {
    for (const [index, page] of browser.contexts().flatMap((context) => context.pages()).entries()) {
      if (page.isClosed()) continue;
      const snapshot = await page.evaluate(() => {
        const rect = (element) => element?.getBoundingClientRect().toJSON();
        const style = (element) => element ? Object.fromEntries(["width", "height", "minWidth", "maxWidth", "paddingLeft", "paddingRight", "opacity", "transitionProperty", "transitionDuration", "transitionTimingFunction", "gridTemplateColumns", "zoom"].map((key) => [key, getComputedStyle(element)[key]])) : null;
        const shell = document.querySelector(".workspace, .page-shell");
        const sidebar = document.querySelector(".sb");
        return { url: location.href, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, visibility: document.visibilityState, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
          shell: { class: shell?.className, style: style(shell) }, sidebar: { rect: rect(sidebar), style: style(sidebar), scroll: sidebar?.scrollWidth, client: sidebar?.clientWidth },
          rows: [...document.querySelectorAll(".sidebar-action")].map((element) => ({ rect: rect(element), style: style(element), icon: rect(element.querySelector("svg")), label: { rect: rect(element.querySelector("span")), style: style(element.querySelector("span")) } })),
          animations: document.getAnimations().map((animation) => ({ target: animation.effect?.target?.className, property: animation.transitionProperty, state: animation.playState, pending: animation.pending, currentTime: animation.currentTime, timing: animation.effect?.getComputedTiming() })), events: window.sidebarDiagnostics };
      });
      await writeFile(`${output}/page-${index}.json`, JSON.stringify(snapshot, null, 2));
      await page.screenshot({ path: `${output}/page-${index}.png` });
      await page.context().tracing.stop({ path: `${output}/trace-${index}.zip` });
    }
    await close();
  };
  return browser;
};
