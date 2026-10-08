// Member action heatmap: colours each member along its length by the
// magnitude of one recovered local section action. Display only — the
// values are the Rust-recovered samples; nothing here is saved or used for
// design.
import { actionComponents } from "./action-diagrams.js";

// One-hue warm ramp, light → dark, monotone in lightness. The light end
// still clears 2:1 against the canvas so a near-zero member stays visible.
export const heatStops = [
  "#e9996a",
  "#db7445",
  "#c2522d",
  "#983520",
  "#662213",
];

// Result-picker value → the action component it colours by.
export const heatViews = {
  heatAxial: "axial",
  heatShearY: "shearY",
  heatShearZ: "shearZ",
  heatMoment: "moment",
  heatMomentZ: "momentZ",
  heatTorsion: "torsion",
};

/** The action component behind a heatmap view, or null. */
export function heatComponent(view) {
  const key = heatViews[view];
  return key ? actionComponents[key] : null;
}

const rgb = heatStops.map((hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
);

/** Ramp colour at t in [0, 1] as linear-interpolated RGBA in 0..1.
 * Non-finite or out-of-range t is clamped; NaN maps to the light end. */
export function heatColour(t) {
  const x = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const scaled = x * (rgb.length - 1);
  const i = Math.min(rgb.length - 2, Math.floor(scaled));
  const f = scaled - i;
  return [...rgb[i].map((v, j) => v + (rgb[i + 1][j] - v) * f), 1];
}

/** Normalised magnitude of a signed action against the model peak. */
export function heatLevel(value, peak) {
  return peak > 0 ? Math.abs(value) / peak : 0;
}

/** CSS linear-gradient for the legend bar, matching heatColour. */
export function heatGradientCss() {
  return `linear-gradient(to right, ${heatStops
    .map((c, i) => `${c} ${((i / (heatStops.length - 1)) * 100).toFixed(0)}%`)
    .join(", ")})`;
}

/** Index of the sample with the largest |action| on one member. */
export function peakSample(samples, index) {
  let best = 0;
  for (let i = 1; i < samples.length; i++)
    if (
      Math.abs(samples[i].actions[index]) >
      Math.abs(samples[best].actions[index])
    )
      best = i;
  return best;
}
