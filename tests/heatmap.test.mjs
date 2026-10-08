import test from "node:test";
import assert from "node:assert/strict";
import { actionComponents } from "../web/render/action-diagrams.js";
import {
  heatStops,
  heatViews,
  heatComponent,
  heatColour,
  heatLevel,
  heatGradientCss,
  peakSample,
} from "../web/render/heatmap.js";
import { resultFamilies } from "../web/result-picker.js";

const hex = (c) =>
  "#" +
  c
    .slice(0, 3)
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test("Every heatmap view maps to one of the six Rust action components", () => {
  assert.equal(Object.keys(heatViews).length, 6);
  for (const [view, key] of Object.entries(heatViews))
    assert.equal(heatComponent(view), actionComponents[key]);
  assert.equal(heatComponent("moment"), null);
  assert.equal(heatComponent("deformed"), null);
  assert.deepEqual(
    resultFamilies.heatmap.map(([v]) => v).sort(),
    Object.keys(heatViews).sort(),
  );
});

test("The ramp hits each stop exactly and darkens monotonically", () => {
  heatStops.forEach((stop, i) =>
    assert.equal(hex(heatColour(i / (heatStops.length - 1))), stop),
  );
  let last = Infinity;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = heatColour(t);
    assert.equal(c.length, 4);
    assert.equal(c[3], 1);
    const l = luminance(c);
    assert.ok(l <= last + 1e-12, `luminance rises at t=${t}`);
    last = l;
  }
});

test("Out-of-range and non-finite levels clamp to the ramp ends", () => {
  assert.deepEqual(heatColour(-2), heatColour(0));
  assert.deepEqual(heatColour(7), heatColour(1));
  assert.deepEqual(heatColour(NaN), heatColour(0));
  assert.deepEqual(heatColour(Infinity), heatColour(0));
});

test("Levels are sign-free magnitudes against the model peak", () => {
  assert.equal(heatLevel(-15000, 30000), 0.5);
  assert.equal(heatLevel(15000, 30000), 0.5);
  assert.equal(heatLevel(30000, 30000), 1);
  // An all-zero result has no peak; every member sits at the light end.
  assert.equal(heatLevel(0, 0), 0);
});

test("The legend gradient lists every stop in order", () => {
  const css = heatGradientCss();
  assert.match(css, /^linear-gradient\(to right, /);
  let at = 0;
  for (const stop of heatStops) {
    const i = css.indexOf(stop, at);
    assert.ok(i > at, `${stop} missing or out of order`);
    at = i;
  }
  assert.ok(css.includes(`${heatStops.at(-1)} 100%`));
});

test("Peak sample is the largest magnitude, whatever its sign", () => {
  const samples = [3, -9, 4, 8].map((v) => ({ actions: [0, 0, 0, 0, v, 0] }));
  assert.equal(peakSample(samples, 4), 1);
  assert.equal(peakSample([{ actions: [0, 0, 0, 0, 0, 0] }], 4), 0);
});
