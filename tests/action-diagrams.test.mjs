import test from "node:test";
import assert from "node:assert/strict";
import {
  actionComponents as c,
  diagramPeak,
  actionText,
  actionProjection,
  deformationProjection,
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
const axes = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
test("My and Vz lie in local xz; Vy lies in local xy", () => {
  for (const component of [c.moment, c.shearZ, c.shearY]) {
    const peak = diagramPeak({ members: [{ samples }] }, component);
    const p = actionProjection(samples, (v) => v, component, peak, axes, 2);
    p.curve.forEach((v, i) => {
      assert.equal(v[0], samples[i].position[0]);
      assert.equal(
        v[component.axis],
        (samples[i].actions[component.index] / peak) * 2,
      );
      assert.equal(v[component.axis === 2 ? 1 : 2], 0);
    });
  }
});
test("Rotated member axes and camera foreshortening preserve the physical plane", () => {
  const rolled = [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ];
  const projection = ([x, y, z]) => [x * 10 + y * 3, -z * 10 + y * 4, y];
  const p = actionProjection(samples, projection, c.moment, 30000, rolled, 2);
  assert.deepEqual(p.curve[0], [-6, -8, -2]);
  const edgeOn = actionProjection(
    samples,
    ([x, y, z]) => [x, -y, z],
    c.moment,
    30000,
    axes,
    2,
  );
  assert.deepEqual(edgeOn.curve[0].slice(0, 2), edgeOn.base[0].slice(0, 2));
  assert.equal(edgeOn.curve[0][2], 2);
});
test("Zero shear stays on baseline and missing current axes suppress the plot", () => {
  const zero = samples.map((s) => ({ ...s, actions: [0, 0, 0, 0, 0, 0] }));
  const p = actionProjection(zero, (v) => v, c.shearY, 0, axes, 2);
  assert.deepEqual(p.curve, p.base);
  assert.equal(
    actionProjection(samples, (v) => v, c.moment, 30000, null, 2),
    null,
  );
});

test("Deformation preserves actual 3D displacement and camera depth", () => {
  const samples = [{ position: [2, 3, 4], displacement: [0, 0, -0.1] }];
  assert.deepEqual(
    deformationProjection(samples, (v) => v, 10),
    [[2, 3, 3]],
  );
  const mixed = [{ position: [2, 3, 4], displacement: [0.1, -0.2, 0.3] }];
  const camera = ([x, y, z]) => [y, -z, x];
  assert.deepEqual(deformationProjection(mixed, camera, 10), [[1, -7, 3]]);
  assert.deepEqual(deformationProjection(mixed, camera, 0), [[3, -4, 2]]);
});
