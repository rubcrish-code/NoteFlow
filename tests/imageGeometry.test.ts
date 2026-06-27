import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moveRectWithinBounds, resizeImageBox, resizeRectWithinBounds } from "../src/features/imageEditor/imageGeometry";

function assertClose(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} should be close to ${expected}`);
}

describe("image editor geometry", () => {
  it("moves crop rectangles without leaving image bounds", () => {
    const moved = moveRectWithinBounds({ x: 0.7, y: 0.7, width: 0.25, height: 0.25 }, 0.2, 0.2, { width: 1, height: 1 });

    assert.equal(moved.x, 0.75);
    assert.equal(moved.y, 0.75);
  });

  it("resizes crop rectangles from side handles with minimum size", () => {
    const resized = resizeRectWithinBounds(
      { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
      "w",
      0.6,
      0,
      { width: 1, height: 1 },
      { width: 0.1, height: 0.1 },
    );

    assert.equal(resized.x, 0.6);
    assertClose(resized.width, 0.1);
    assertClose(resized.height, 0.5);
  });

  it("keeps corner image resize proportional", () => {
    const resized = resizeImageBox({ width: 400, height: 200 }, "se", 100, 20, {
      maxHeight: 800,
      maxWidth: 800,
      minHeight: 80,
      minWidth: 120,
    });

    assert.deepEqual(resized, { width: 500, height: 250 });
  });
});
