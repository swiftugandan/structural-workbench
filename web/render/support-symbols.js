// Presentation only: restraint booleans remain authoritative model data.
const dofs = ["X", "Y", "Z", "Rx", "Ry", "Rz"];
export function supportSymbol(project, support, projectPoint) {
  const node = project.nodes.find((n) => n.id === support.node);
  if (!node) return null;
  const active =
    project.analysisMode === "planarXZ" ? [0, 2, 4] : [0, 1, 2, 3, 4, 5];
  const restrained = active.filter((i) => support.fixed[i]);
  const translations = restrained.filter((i) => i < 3);
  const rotations = restrained.filter((i) => i >= 3);
  const translationCount = active.filter((i) => i < 3).length;
  const kind =
    restrained.length === active.length
      ? "fixed"
      : translations.length === translationCount && !rotations.length
        ? "pinned"
        : translations.length === 1 && !rotations.length
          ? "roller"
          : restrained.length
            ? "custom"
            : "free";
  const neighbours = project.members
    .filter((m) => m.start === node.id || m.end === node.id)
    .map((m) =>
      project.nodes.find(
        (n) => n.id === (m.start === node.id ? m.end : m.start),
      ),
    )
    .filter(Boolean);
  const inward = [0, 0, 0];
  for (const other of neighbours) {
    const delta = other.position.map((x, i) => x - node.position[i]);
    const length = Math.hypot(...delta);
    if (length) delta.forEach((v, i) => (inward[i] += v / length));
  }
  let outward = inward.map((x) => -x);
  if (kind === "roller") {
    const axis = translations[0];
    outward = [0, 0, 0];
    outward[axis] = inward[axis] < -1e-8 ? 1 : -1;
  } else if (Math.hypot(...outward) < 1e-8) outward = [0, 0, -1];
  const origin = projectPoint(node.position);
  const target = projectPoint(node.position.map((x, i) => x + outward[i]));
  const delta = [target[0] - origin[0], target[1] - origin[1]];
  const length = Math.hypot(...delta);
  const endOn = kind === "roller" && length < 1e-5;
  // An end-on restraint is explicitly marked, never shown as an in-plane roller.
  const direction = length > 1e-5 ? delta.map((x) => x / length) : [0, 1];
  const segments = [],
    circles = [];
  const line = (a, b) => segments.push([a, b]);
  const ground = (y) => {
    line([-16, y], [16, y]);
    for (let x = -14; x <= 14; x += 7) line([x, y], [x - 5, y + 6]);
  };
  if (endOn) {
    circles.push([0, 0, 8], [0, 0, 3]);
  } else if (kind === "fixed") {
    ground(0);
  } else if (kind === "pinned" || kind === "roller") {
    line([0, 0], [-12, 18]);
    line([-12, 18], [12, 18]);
    line([12, 18], [0, 0]);
    if (kind === "roller") {
      circles.push([-8, 22, 4], [8, 22, 4]);
      ground(28);
    } else ground(20);
  } else if (kind === "custom") {
    // A boxed restraint marker deliberately avoids a misleading standard symbol.
    line([0, 0], [0, 10]);
    line([-9, 10], [9, 10]);
    line([9, 10], [9, 28]);
    line([9, 28], [-9, 28]);
    line([-9, 28], [-9, 10]);
    line([-5, 19], [5, 19]);
    if (rotations.length) circles.push([0, 19, 5]);
  } else circles.push([0, 0, 6]);
  const transform = ([x, y]) => [
    origin[0] + direction[1] * x + direction[0] * y,
    origin[1] - direction[0] * x + direction[1] * y,
    0.42,
  ];
  const names = {
    fixed: "Fixed",
    pinned: "Pinned",
    roller: "Roller",
    custom: "Custom",
    free: "Unrestrained",
  };
  const constraints = restrained.map((i) => dofs[i]).join(", ") || "none";
  const prescribed = restrained.filter((i) => support.prescribed[i] !== 0);
  const title = `${names[kind]}${endOn ? " (end-on)" : ""} · restrained ${constraints}${prescribed.length ? " · imposed " + prescribed.map((i) => `${dofs[i]}=${support.prescribed[i]} ${i < 3 ? "m" : "rad"}`).join(", ") : ""}`;
  return {
    kind,
    endOn,
    direction,
    title,
    constraints,
    segments,
    circles,
    transform,
    labelPoint: transform([20, kind === "fixed" ? 12 : 36]),
  };
}
