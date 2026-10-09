// Rendering consumes the signed local section actions recovered by Rust.
export const actionComponents = {
  axial: {
    scalar: true,
    index: 0,
    name: "N",
    title: "Axial N / Fx · along local x",
    unit: "N",
  },
  torsion: {
    scalar: true,
    index: 3,
    name: "T",
    title: "Torsion T / Mx · about local x",
    unit: "N·m",
  },
  momentZ: {
    axis: 1,
    plane: "xy",
    offset: "y",
    index: 5,
    name: "Mz",
    title: "Moment Mz",
    unit: "N·m",
  },
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
// Rust key stations that carry a component's value: member ends,
// discontinuities and the extrema Rust found for that component.
export function keyedStations(keyStations, component) {
  return (keyStations || []).filter(
    (k) =>
      k.kind === "end" ||
      k.kind === "discontinuity" ||
      (k.kind === "extremum" && k.components?.includes(component.name)),
  );
}
/** Index of the sample nearest a station (fraction of L). */
export function nearestSample(samples, station) {
  let best = 0,
    bestD = Infinity;
  samples.forEach((s, i) => {
    const d = Math.abs(s.station - station);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
/** One member's largest |action|, signed, and the sample it is drawn at.
 * Key stations win over the sample grid when Rust supplied them, exactly as
 * in diagramPeak, so the member carrying the model peak reaches it. */
export function memberPeak(member, component) {
  const index = component.index;
  if (member.keyStations?.length) {
    let best = null;
    for (const k of keyedStations(member.keyStations, component))
      if (!best || Math.abs(k.actions[index]) > Math.abs(best.actions[index]))
        best = k;
    return best
      ? {
          value: best.actions[index],
          sample: nearestSample(member.samples, best.station),
        }
      : null;
  }
  if (!member.samples?.length) return null;
  let sample = 0;
  member.samples.forEach((s, i) => {
    if (
      Math.abs(s.actions[index]) >
      Math.abs(member.samples[sample].actions[index])
    )
      sample = i;
  });
  return { value: member.samples[sample].actions[index], sample };
}
export function diagramPeak(result, component) {
  let max = 0;
  for (const member of result.members)
    max = Math.max(max, Math.abs(memberPeak(member, component)?.value ?? 0));
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
  keyStations,
) {
  if (!samples.length || (!component.scalar && !axes) || !(amplitude >= 0))
    return null;
  const direction = component.scalar ? [0, 0, 0] : axes[component.axis];
  const base = samples.map((s) => projectPoint(s.position));
  // Offset in the member's physical local plane before camera projection.
  // Do not normalise the projected axis: foreshortening and edge-on collapse
  // are necessary to keep the plot in that plane while orbiting.
  const curve = samples.map((s) => {
    const offset = peak ? (s.actions[component.index] / peak) * amplitude : 0;
    return projectPoint(s.position.map((v, j) => v + direction[j] * offset));
  });
  const keyed = keyedStations(keyStations, component);
  let marks;
  let markValues;
  if (keyed.length) {
    let lo = keyed[0],
      hi = keyed[0];
    for (const k of keyed) {
      if (k.actions[component.index] < lo.actions[component.index]) lo = k;
      if (k.actions[component.index] > hi.actions[component.index]) hi = k;
    }
    const ends = keyed.filter((k) => k.kind === "end");
    const pick =
      Math.abs(hi.actions[component.index] - lo.actions[component.index]) <=
      peak * 1e-10
        ? [
            keyed.find((k) => k.kind === "extremum") ||
              keyed[Math.floor(keyed.length / 2)],
          ]
        : [...new Set([lo, hi, ...ends])];
    marks = pick.map((k) => nearestSample(samples, k.station));
    markValues = pick.map((k) => k.actions[component.index]);
  } else {
    let lo = 0,
      hi = 0;
    samples.forEach((s, i) => {
      if (s.actions[component.index] < samples[lo].actions[component.index])
        lo = i;
      if (s.actions[component.index] > samples[hi].actions[component.index])
        hi = i;
    });
    marks =
      Math.abs(
        samples[hi].actions[component.index] -
          samples[lo].actions[component.index],
      ) <=
      peak * 1e-10
        ? [Math.floor(samples.length / 2)]
        : [...new Set([0, samples.length - 1, lo, hi])];
    markValues = marks.map((i) => samples[i].actions[component.index]);
  }
  return { base, curve, marks, markValues };
}

// Displacements are global vectors recovered by Rust; retain all components
// and projected depth, including coupled effects that are not planar.
export function deformationProjection(samples, projectPoint, scale) {
  return samples.map((s) =>
    projectPoint(s.position.map((v, j) => v + s.displacement[j] * scale)),
  );
}
