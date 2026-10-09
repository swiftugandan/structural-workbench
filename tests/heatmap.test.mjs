import test from "node:test";
import assert from "node:assert/strict";
import {
  actionComponents,
  diagramPeak,
  memberPeak,
} from "../web/render/action-diagrams.js";
import {
  heatStops,
  heatViews,
  heatComponent,
  heatColour,
  heatLevel,
  heatGradientCss,
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

test("A member's peak is its largest |action|, signed, at its own sample", () => {
  const samples = [3, -9, 4, 8].map((v, i) => ({
    station: i / 3,
    actions: [0, 0, 0, 0, v, 0],
  }));
  assert.deepEqual(memberPeak({ samples }, actionComponents.moment), {
    value: -9,
    sample: 1,
  });
});

test("A key-station peak is labelled at the sample nearest its station", () => {
  // Rust found the extremum between samples, larger than any sample and
  // away from the largest sample: value and position must agree.
  const member = {
    samples: [0, 0.25, 0.5, 0.75, 1].map((station, i) => ({
      station,
      actions: [0, 0, 0, 0, [0, 9, 1, 5, 0][i], 0],
    })),
    keyStations: [
      { kind: "end", station: 0, actions: [0, 0, 0, 0, 0, 0] },
      {
        kind: "extremum",
        station: 0.7,
        components: ["My"],
        actions: [0, 0, 0, 0, -12, 0],
      },
      // An extremum for another component is not a My peak.
      {
        kind: "extremum",
        station: 0.3,
        components: ["Mz"],
        actions: [0, 0, 0, 0, 99, 0],
      },
      { kind: "end", station: 1, actions: [0, 0, 0, 0, 0, 0] },
    ],
  };
  const top = memberPeak(member, actionComponents.moment);
  assert.deepEqual(top, { value: -12, sample: 3 });
  // The peak member reaches the model peak exactly: level 1.
  const peak = diagramPeak({ members: [member] }, actionComponents.moment);
  assert.equal(heatLevel(top.value, peak), 1);
});
