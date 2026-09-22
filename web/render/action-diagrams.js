// Rendering consumes the signed local section actions recovered by Rust.
export const actionComponents = {
  shearY: {
    axis: 1,
    plane: "xy",
    offset: "y",
    index: 1,
    name: "Vy",
    title: "Shear Vy",
    unit: "N",
  },
  shearZ: {
    axis: 2,
    plane: "xz",
    offset: "z",
    index: 2,
    name: "Vz",
    title: "Shear Vz",
    unit: "N",
  },
  moment: {
    axis: 2,
    plane: "xz",
    offset: "z",
    index: 4,
    name: "My",
    title: "Moment My",
    unit: "N·m",
  },
};
export function diagramPeak(result, component) {
  let max = 0;
  for (const member of result.members)
    for (const sample of member.samples)
      max = Math.max(max, Math.abs(sample.actions[component.index]));
  return max;
}
export function actionText(
  value,
  component,
  engineering = true,
  signed = true,
) {
  const scaled = value * (engineering ? 0.001 : 1);
  const rounded = Number(scaled.toPrecision(6));
  return `${signed && rounded > 0 ? "+" : ""}${Object.is(rounded, -0) ? 0 : rounded.toLocaleString("en-GB", { maximumSignificantDigits: 6 })} ${engineering ? "k" : ""}${component.unit}`;
}
export function actionProjection(
  samples,
  projectPoint,
  component,
  peak,
  axes,
  amplitude,
) {
  if (!samples.length || !axes || !(amplitude > 0)) return null;
  const direction = axes[component.axis];
  const base = samples.map((s) => projectPoint(s.position));
  // Offset in the member's physical local plane before camera projection.
  // Do not normalise the projected axis: foreshortening and edge-on collapse
  // are necessary to keep the plot in that plane while orbiting.
  const curve = samples.map((s) => {
    const offset = peak ? (s.actions[component.index] / peak) * amplitude : 0;
    return projectPoint(s.position.map((v, j) => v + direction[j] * offset));
  });
  let lo = 0,
    hi = 0;
  samples.forEach((s, i) => {
    if (s.actions[component.index] < samples[lo].actions[component.index])
      lo = i;
    if (s.actions[component.index] > samples[hi].actions[component.index])
      hi = i;
  });
  const marks =
    Math.abs(
      samples[hi].actions[component.index] -
        samples[lo].actions[component.index],
    ) <=
    peak * 1e-10
      ? [Math.floor(samples.length / 2)]
      : [...new Set([0, samples.length - 1, lo, hi])];
  return { base, curve, marks };
}
