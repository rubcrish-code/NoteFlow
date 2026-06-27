import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_ZOOM_DEFAULT,
  APP_ZOOM_MAX,
  APP_ZOOM_MIN,
  getNextAppZoom,
  getZoomActionFromKey,
  getZoomActionFromWheel,
  normalizeAppZoom,
} from "../src/shared/appZoom";

describe("app zoom", () => {
  it("uses 5 percent steps and clamps min/max", () => {
    assert.equal(getNextAppZoom(100, "increase"), 105);
    assert.equal(getNextAppZoom(100, "decrease"), 95);
    assert.equal(getNextAppZoom(APP_ZOOM_MAX, "increase"), APP_ZOOM_MAX);
    assert.equal(getNextAppZoom(APP_ZOOM_MIN, "decrease"), APP_ZOOM_MIN);
    assert.equal(normalizeAppZoom(123), 125);
  });

  it("resets zoom to 100 percent", () => {
    assert.equal(getNextAppZoom(145, "reset"), APP_ZOOM_DEFAULT);
  });

  it("ignores wheel without Ctrl", () => {
    assert.equal(getZoomActionFromWheel({ ctrlKey: false, deltaY: -100 }), null);
    assert.equal(getZoomActionFromWheel({ ctrlKey: true, deltaY: -100 }), "increase");
    assert.equal(getZoomActionFromWheel({ ctrlKey: true, deltaY: 100 }), "decrease");
  });

  it("maps zoom hotkeys", () => {
    assert.equal(getZoomActionFromKey({ ctrlKey: true, key: "0" }), "reset");
    assert.equal(getZoomActionFromKey({ ctrlKey: true, key: "+" }), "increase");
    assert.equal(getZoomActionFromKey({ ctrlKey: true, key: "=" }), "increase");
    assert.equal(getZoomActionFromKey({ ctrlKey: true, key: "-" }), "decrease");
    assert.equal(getZoomActionFromKey({ ctrlKey: false, key: "+" }), null);
    assert.equal(getZoomActionFromKey({ altKey: true, ctrlKey: true, key: "+" }), null);
  });
});
