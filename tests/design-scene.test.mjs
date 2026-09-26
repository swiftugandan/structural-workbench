import { test } from "node:test";
import assert from "node:assert/strict";
import { drawMemberSurface } from "../web/render/design-scene.js";
for (const axes of [
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
]) {
  test(`member solid spans Rust midpoint frame endpoints: ${axes[0]}`, () => {
    const origin = [7, 11, 13],
      length = 6,
      points = [];
    drawMemberSurface(
      {},
      { cy: 0.3, cz: 0.15 },
      { origin, length, axes },
      null,
      false,
      (p) => {
        points.push(p);
        return p;
      },
      () => {},
      () => {},
    );
    const longitudinal = points.map((p) =>
      p.reduce((s, v, i) => s + (v - origin[i]) * axes[0][i], 0),
    );
    assert.equal(Math.min(...longitudinal), -length / 2);
    assert.equal(Math.max(...longitudinal), length / 2);
  });
}
