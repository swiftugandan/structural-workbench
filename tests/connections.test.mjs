import { test } from "node:test";
import assert from "node:assert/strict";
import { supportMesh, memberDisplayRange } from "../web/render/connections.js";
const p = {
  nodes: [
    { id: "a", position: [0, 0, 0] },
    { id: "b", position: [0, 0, 3] },
    { id: "c", position: [4, 0, 3] },
  ],
  members: [
    { id: "c", start: "a", end: "b", section: "s" },
    { id: "b", start: "b", end: "c", section: "s" },
  ],
  sections: [{ id: "s", cy: 0.2, cz: 0.15 }],
};
const frames = [
  {
    id: "c",
    origin: [0, 0, 1.5],
    length: 3,
    axes: [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
  },
  {
    id: "b",
    origin: [2, 0, 3],
    length: 4,
    axes: [
      [1, 0, 0],
      [0, 0, 1],
      [0, -1, 0],
    ],
  },
];
test("Beam terminates at column face while column encloses beam top; model unchanged", () => {
  const before = JSON.stringify(p);
  assert.deepEqual(
    memberDisplayRange(p, p.members[1], frames[1], frames),
    [0.2, 4],
  );
  assert.deepEqual(
    memberDisplayRange(p, p.members[0], frames[0], frames),
    [0, 3.2],
  );
  assert.equal(JSON.stringify(p), before);
});
test("Fixed seat is behind actual node plane for a column and horizontal cantilever", () => {
  for (const q of [
    p,
    {
      ...p,
      nodes: [
        { id: "a", position: [0, 0, 0] },
        { id: "b", position: [3, 0, 0] },
      ],
      members: [p.members[0]],
    },
  ]) {
    const mesh = supportMesh(
      q,
      { node: "a", fixed: [true, true, true, true, true, true] },
      "fixed",
    );
    for (const v of mesh.triangles.flatMap((t) => t.points))
      assert.ok(v.reduce((s, x, i) => s + x * mesh.normal[i], 0) <= 1e-10);
  }
});
test("Roller normal follows locked translation, custom restraints are not disguised", () => {
  const s = { node: "a", fixed: [true, false, false, false, false, false] };
  const r = supportMesh(p, s, "roller");
  assert.deepEqual(r.normal, [1, 0, 0]);
  assert.equal(supportMesh(p, s, "custom"), null);
  assert.notDeepEqual(r.triangles, supportMesh(p, s, "pinned").triangles);
});

test("Camera-facing points have smaller WebGPU depth than rear points", async () => {
  const { Viewport } = await import("../web/render/viewport.js");
  const view = Object.create(Viewport.prototype);
  Object.assign(view, {
    mode: "3d",
    yaw: 0.7,
    pitch: 0.6,
    origin: [0, 0, 0],
    width: 800,
    height: 600,
    pan: [0, 0],
    extent: 10,
    factor: 50,
  });
  // The camera sits where the picking ray starts, origin − extent·basis[2],
  // looking along +basis[2]; the point on its side must be nearer.
  const axis = view.basis()[2];
  const near = axis.map((v) => -v),
    far = axis;
  assert.ok(view.projectPoint(near)[2] < view.projectPoint(far)[2]);
});
