// Rendering consumes the signed local section actions recovered by Rust.
export const actionComponents = {
  shearY: { index: 1, name: "Vy", title: "Shear Vy", unit: "N" },
  shearZ: { index: 2, name: "Vz", title: "Shear Vz", unit: "N" },
  moment: { index: 4, name: "My", title: "Moment My", unit: "N·m" },
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
export function actionProjection(samples, projectPoint, component, peak) {
  const base = samples.map((s) => projectPoint(s.position));
  const dx = base.at(-1)[0] - base[0][0],
    dy = base.at(-1)[1] - base[0][1];
  const length = Math.hypot(dx, dy);
  if (length < 2) return null;
  // A schematic offset perpendicular to the projected start→end direction.
  const normal = [dy / length, -dx / length];
  const curve = base.map((p, i) => [
    p[0] +
      normal[0] *
        (peak ? (samples[i].actions[component.index] / peak) * 65 : 0),
    p[1] +
      normal[1] *
        (peak ? (samples[i].actions[component.index] / peak) * 65 : 0),
    0.18,
  ]);
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
