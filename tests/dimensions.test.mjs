import test from "node:test";
import assert from "node:assert/strict";
import { dimensionLayout, dimensionText } from "../web/render/dimensions.js";
test("Dimension lines offset outward, remain upright and avoid viewport edges", () => {
  const a = dimensionLayout([50, 50], [150, 50], [100, 100]);
  assert.equal(a.mid[1], 12);
  assert.equal(a.angle, 0);
  assert.equal(a.segments.length, 7);
  const b = dimensionLayout([150, 50], [50, 50], [100, 100], 38, [200, 150]);
  assert.equal(b.mid[1], 88);
  assert.equal(b.angle, 0);
  const vertical = dimensionLayout([20, 150], [20, 50], [100, 100]);
  assert.equal(vertical.angle, 90);
  assert.equal(vertical.mid[0], -18);
  assert.equal(dimensionLayout([0, 0], [0, 0], [0, 0]), null);
});
test("Dimension formatting retains small and non-rounded engineering lengths", () => {
  assert.equal(dimensionText(4.5), "4.5 m");
  assert.equal(dimensionText(0.0000001), "0.0000001 m");
  assert.equal(dimensionText(Math.sqrt(2)), "1.4142136 m");
  assert.equal(dimensionText(NaN), null);
});
