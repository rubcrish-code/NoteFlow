import assert from "node:assert/strict";
import { it } from "node:test";
import { createPanelResizeSession, panelPointerScale } from "../src/shared/useWorkspacePanelResize";

it("accumulates CSS pointer movement in logical panel pixels at 100/160%", () => {
  for (const zoom of [1, 1.6]) {
    const session = createPanelResizeSession({ value: 250, minimum: 190, maximum: 360, zoom });
    assert.equal(session.move(10), Math.round(250 + 10 * zoom));
    assert.equal(session.move(10), Math.round(250 + 20 * zoom));
    assert.equal(session.move(-20), 250);
  }
});
it("clamps one snapshot without rebasing or resizing competing panels", () => {
  const configuration = { value: 350, minimum: 190, maximum: 360, zoom: 1 };
  const session = createPanelResizeSession(configuration);
  assert.equal(session.move(100), 360);
  assert.equal(session.move(-100), 350);
  assert.equal(session.move(-500), 190);
  assert.deepEqual(configuration, { value: 350, minimum: 190, maximum: 360, zoom: 1 });
});

it("tracks the pointer equally under native zoom and CSS zoom fallback", () => {
  for (const fallback of [false, true]) {
    const session = createPanelResizeSession({ value: 190, minimum: 190, maximum: 360, zoom: panelPointerScale(160, fallback) });
    assert.equal(session.move(fallback ? 70 : 70 / 1.6), 260);
  }
});
