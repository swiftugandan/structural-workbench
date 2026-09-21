import test from "node:test";
import assert from "node:assert/strict";
import { supportSymbol } from "../web/render/support-symbols.js";
const project = (end = [4, 0, 0], analysisMode = "planarXZ") => ({
  analysisMode,
  nodes: [
    { id: "a", position: [0, 0, 0] },
    { id: "b", position: end },
  ],
  members: [{ start: "a", end: "b" }],
});
const support = (fixed) => ({
  id: "s",
  node: "a",
  fixed,
  prescribed: [0, 0, 0, 0, 0, 0],
});
const elevation = ([x, y, z]) => [100 + x * 30, 100 - z * 30];
const near = (a, b) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-10));
test("Support classification uses active planar restraints, not any rotational lock", () => {
  for (const [fixed, kind] of [
    [[true, false, true, false, true, false], "fixed"],
    [[true, true, true, true, false, true], "pinned"],
    [[false, true, true, true, false, true], "roller"],
    [[false, false, false, false, true, false], "custom"],
    [[true, false, false, false, true, false], "custom"],
    [[false, true, false, true, false, true], "free"],
  ])
    assert.equal(
      supportSymbol(project(), support(fixed), elevation).kind,
      kind,
    );
});
test("Fixed ground faces away from horizontal, vertical and inclined member ends", () => {
  for (const [end, direction] of [
    [
      [4, 0, 0],
      [-1, 0],
    ],
    [
      [0, 0, 4],
      [0, 1],
    ],
    [
      [3, 0, 3],
      [-Math.SQRT1_2, Math.SQRT1_2],
    ],
  ]) {
    const s = supportSymbol(
      project(end),
      support([true, false, true, false, true, false]),
      elevation,
    );
    near(s.direction, direction);
    near(s.transform([0, 0]), [100, 100, 0.42]);
    const [a, b] = s.segments[0].map(s.transform);
    near([(b[0] - a[0]) * direction[0] + (b[1] - a[1]) * direction[1]], [0]);
  }
});
test("Roller ground is normal to the restrained axis and follows camera projection", () => {
  const x = supportSymbol(
    project(),
    support([true, false, false, false, false, false]),
    elevation,
  );
  const z = supportSymbol(
    project(),
    support([false, false, true, false, false, false]),
    elevation,
  );
  near(x.direction, [-1, 0]);
  near(z.direction, [0, 1]);
  assert.equal(x.circles.length, 2);
  const rotated = supportSymbol(
    project(),
    support([true, false, false, false, false, false]),
    ([x, y, z]) => [100 + z * 30, 100 + x * 30],
  );
  near(rotated.direction, [0, -1]);
});
test("Spatial partial and end-on constraints are explicit; imposed motion keeps restraint type", () => {
  const p = project([4, 0, 0], "spatial");
  assert.equal(
    supportSymbol(p, support([true, true, true, false, true, false]), elevation)
      .kind,
    "custom",
  );
  assert.equal(
    supportSymbol(
      p,
      support([true, true, true, false, false, false]),
      elevation,
    ).kind,
    "pinned",
  );
  const s = support([false, true, false, false, false, false]);
  s.prescribed[1] = 0.001;
  const glyph = supportSymbol(p, s, elevation);
  assert.equal(glyph.kind, "roller");
  assert.equal(glyph.endOn, true);
  assert.match(glyph.title, /imposed Y=0.001 m/);
  assert.equal(glyph.segments.length, 0);
});
