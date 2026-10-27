import assert from "node:assert/strict";

const panelTargets = ".workspace, .page-shell, .rag-page, .sb, .sidebar-panel, .sidebar-action-label, .sidebar-brand-copy, .sidebar-profile > .info";

// A React commit is not a painted frame, including the 1ms reduced-motion transitions.
export async function settlePanelLayout(page) {
  await page.evaluate(async (targets) => {
    await document.fonts.ready;
    const frame = () => new Promise(requestAnimationFrame);
    for (let round = 0; round < 10; round++) {
      await frame();
      const transitions = document.getAnimations().filter((animation) => animation instanceof CSSTransition && animation.effect?.target?.matches?.(targets));
      await Promise.all(transitions.map((animation) => animation.finished.catch(() => {})));
      await frame();
      if (!document.getAnimations().some((animation) => animation instanceof CSSTransition && animation.effect?.target?.matches?.(targets))) return;
    }
    throw new Error("Panel layout did not settle");
  }, panelTargets);
}

// Seek the real CSS transitions for reproducible geometry, then replay them on the
// browser's own timeline. Do not infer animation progress from time since click().
export async function samplePanelMotion(page, selector, capture, captureArgs, { samplePhases = true } = {}) {
  await page.bringToFront();
  await settlePanelLayout(page);
  const result = await page.evaluate(async ({ selector, source, targets, captureArgs, samplePhases }) => {
    const capture = new Function(`return (${source})`)();
    const read = () => capture(captureArgs);
    const shell = document.querySelector(".workspace") || document.querySelector(".rag-page") || document.querySelector(".page-shell");
    const initial = read(), requestedAt = performance.now(), events = [];
    const event = (e) => { if (e.target === shell && e.propertyName === "grid-template-columns") events.push({ type: e.type, time: performance.now(), elapsed: e.elapsedTime }); };
    for (const name of ["transitionrun", "transitionstart", "transitionend", "transitioncancel"]) shell.addEventListener(name, event);
    try {
      document.querySelector(selector).click();
      let primary;
      const deadline = requestedAt + 5000;
      while (!primary) {
        // Force style resolution after the commit, not before React handles the event.
        getComputedStyle(shell).gridTemplateColumns;
        primary = shell.getAnimations().find((animation) => animation instanceof CSSTransition && animation.transitionProperty === "grid-template-columns");
        if (performance.now() > deadline) throw new Error("No grid transition after panel action");
        if (!primary) await new Promise(requestAnimationFrame);
      }
      const foundAt = performance.now();
      const duration = primary.effect.getComputedTiming().duration;
      const easing = getComputedStyle(shell).transitionTimingFunction;
      const frames = [];
      if (samplePhases) {
        const animations = document.getAnimations().filter((animation) => animation instanceof CSSTransition && animation.effect?.target?.matches?.(targets));
        animations.forEach((animation) => animation.pause());
        await Promise.all(animations.map((animation) => animation.ready));
        for (const t of [0, 30, 60, 120, 180, 210, 240]) {
          animations.forEach((animation) => { animation.currentTime = Math.min(t, animation.effect.getComputedTiming().duration); });
          frames.push({ t, ...read() });
        }
        animations.forEach((animation) => { animation.currentTime = 0; animation.play(); });
        await Promise.all(animations.map((animation) => animation.ready));
      } else {
        // Editor-preservation tests must not introduce extra reflow via seeking.
        await primary.ready;
      }
      const playback = [{ t: primary.currentTime, ...read() }];
      let finished = false;
      const completion = primary.finished.then(() => { finished = true; });
      const replayDeadline = performance.now() + 5000;
      while (!finished) {
        await new Promise(requestAnimationFrame);
        playback.push({ t: primary.currentTime, ...read() });
        if (performance.now() > replayDeadline) throw new Error("Panel transition did not finish");
      }
      await completion;
      if (!samplePhases) frames.push(...playback);
      return { initial, frames, playback, duration, easing, requestedAt, foundAt, events, visibility: document.visibilityState,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches };
    } finally {
      for (const name of ["transitionrun", "transitionstart", "transitionend", "transitioncancel"]) shell.removeEventListener(name, event);
    }
  }, { selector, source: capture.toString(), targets: panelTargets, captureArgs, samplePhases });
  assert.equal(result.visibility, "visible");
  assert.equal(result.reduced, false);
  assert.equal(result.duration, 240, "The real grid transition must retain its approved duration");
  assert.equal(result.easing, "cubic-bezier(0.22, 1, 0.36, 1)");
  assert.ok(result.events.some((event) => event.type === "transitionend" && Math.abs(event.elapsed - 0.24) < 0.0001), "Real playback must emit transitionend");
  await settlePanelLayout(page);
  return result;
}
