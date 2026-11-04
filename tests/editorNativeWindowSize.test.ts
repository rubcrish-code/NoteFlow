import assert from "node:assert/strict";
import { it } from "node:test";
import { applyEditorWindowMinimum } from "../src/shared/editorNativeWindowSize";

function fixture(maximized = false, fullscreen = false, width = 1600) {
  const calls: string[] = [];
  return { calls, window: {
    isMaximized: async () => maximized,
    isFullscreen: async () => fullscreen,
    innerSize: async () => ({ width, height: 900 }),
    scaleFactor: async () => 1,
    setMinSize: async () => { calls.push("minimum"); },
    setSize: async () => { calls.push("resize"); },
  } };
}
for (const mode of ["maximized", "fullscreen"] as const) {
  it(`does not change native ${mode} state on layout changes`, async () => {
    const f = fixture(mode === "maximized", mode === "fullscreen");
    for (const width of [1100, 1400, 1200]) await applyEditorWindowMinimum(f.window, width);
    assert.deepEqual(f.calls, []);
  });
  it(`rejects unsupported width without leaving ${mode}`, async () => {
    const f = fixture(mode === "maximized", mode === "fullscreen");
    await assert.rejects(applyEditorWindowMinimum(f.window, 1900));
    assert.deepEqual(f.calls, []);
  });
}
it("normal windows grow only when needed and preserve height", async () => {
  const f = fixture(false, false, 1100);
  await applyEditorWindowMinimum(f.window, 1400);
  assert.deepEqual(f.calls, ["minimum", "resize"]);
  f.calls.length = 0;
  await applyEditorWindowMinimum(f.window, 1000);
  assert.deepEqual(f.calls, ["minimum"]);
});
it("discarded layout jobs cannot resize a native window", async () => {
  const f = fixture();
  await applyEditorWindowMinimum(f.window, 1200, () => false);
  assert.deepEqual(f.calls, []);
});
