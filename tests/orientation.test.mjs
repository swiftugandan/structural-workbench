import test from "node:test";
import assert from "node:assert/strict";
import { orientationAxes, referenceGrid } from "../web/render/orientation.js";
test("Global compass follows camera basis including Y and end-on directions", () => {
  const axes = orientationAxes([
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ]);
  assert.deepEqual(
    axes.map((a) => a.name),
    ["X", "Y", "Z"],
  );
  assert.equal(Math.hypot(axes[1].x, axes[1].y), 0);
  assert.equal(axes[2].y, -1);
  const turned = orientationAxes([
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ]);
  assert.equal(turned[1].x, 1);
});
test("Reference grid stays bounded and aligned at large origins", () => {
  const g = referenceGrid([100000, 50000, 12], 1000, 0.5);
  assert.equal(g.radius / g.step, 6);
  assert.equal(g.cx % g.step, 0);
  assert.equal(g.cy % g.step, 0);
});
