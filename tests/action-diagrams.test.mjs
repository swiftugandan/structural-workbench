import test from "node:test";
import assert from "node:assert/strict";
import {
  actionComponents as c,
  diagramPeak,
  actionText,
  actionProjection,
} from "../web/render/action-diagrams.js";
const samples = [
  { position: [0, 0, 0], actions: [0, -3000, -10000, 0, 30000, 0] },
  { position: [3, 0, 0], actions: [0, 6000, 10000, 0, 0, 0] },
];
test("Each diagram selects its signed Rust component and shares a global absolute scale", () => {
  const r = { members: [{ samples }] };
  assert.equal(diagramPeak(r, c.shearY), 6000);
  assert.equal(diagramPeak(r, c.shearZ), 10000);
  assert.equal(diagramPeak(r, c.moment), 30000);
  assert.equal(actionText(-10000, c.shearZ), "-10 kN");
  assert.equal(actionText(6000, c.shearY), "+6 kN");
  assert.equal(actionText(-10000, c.shearZ, false), "-10,000 N");
});
test("Signed diagrams offset perpendicular to horizontal and vertical members", () => {
  const horizontal = actionProjection(
    samples,
    ([x, y, z]) => [x * 100, 100],
    c.shearZ,
    10000,
  );
  assert.equal(horizontal.curve[0][1], 165);
  assert.equal(horizontal.curve[1][1], 35);
  const vertical = actionProjection(
    samples,
    ([x, y, z]) => [100, x * 100],
    c.shearZ,
    10000,
  );
  assert.equal(vertical.curve[0][0], 35);
  assert.equal(vertical.curve[1][0], 165);
  assert.equal(
    actionProjection(samples, () => [100, 100], c.shearZ, 10000),
    null,
  );
});
test("Zero shear stays on baseline without invalid geometry or a fabricated scale", () => {
  const zero = samples.map((s) => ({ ...s, actions: [0, 0, 0, 0, 0, 0] }));
  assert.equal(diagramPeak({ members: [{ samples: zero }] }, c.shearY), 0);
  const p = actionProjection(zero, ([x]) => [x * 100, 100], c.shearY, 0);
  assert.equal(p.curve[0][1], 100);
  assert.equal(actionText(0, c.shearY), "0 kN");
});
