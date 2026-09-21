export const common = [
  "build",
  "native",
  "contracts",
  "numerical",
  "wasm",
  "oracle",
  "e2e-tour",
  "browser-suite",
  "accessibility",
  "security",
  "performance",
  "graphics",
  "robustness",
  "hardware-windows-linux",
];
export const m01 = [
  ...common,
  "m01-cad",
  "m01-graphics",
  "m01-capacity",
  "m01-startup",
  "computer-use",
  "milestone-gates",
];
export const requiredIds = {
  "browser-suite": [
    "M01 keyboard-only portal creation, numeric drawing, table editing and solve",
    "M01 portal: setup, sway, edit coordinates, undo, draw, reject, save and reopen",
    "M01 CAD pointer drawing, snap feedback, disconnected crossing and explicit connect",
    "M01 CAD multi-selection, move copy delete previews, measure and scoped shortcuts",
  ],
  native: [
    "analytical_b01_to_b11",
    "m01_global_rotation_relabelling_reordering_and_endpoint_reversal",
    "move_copy_delete_previews_and_undo_are_atomic",
    "projected_crossing_index_selection_depth_and_measurement",
    "split_uniform_load_preserves_response_provenance_and_exact_undo",
  ],
  "m01-cad": [
    "M01-draw-snap-crossings",
    "M01-multiselect-atomic-edit",
    "M01-working-planes-camera",
  ],
  "m01-graphics": [
    "M01-far-origin-dpr1",
    "M01-far-origin-dpr2",
    "M01-depth-and-stale-pick",
  ],
  "m01-capacity": [
    "M01-import-5000-10000",
    "M01-export-10000",
    "M01-edit-1000",
    "M01-pick-10000",
    "M01-orbit-10000-60s",
  ],
};
export function recordIssues(name, e, build, { milestone = "M01" } = {}) {
  const errors = [];
  if (e.status !== "PASS")
    errors.push(`${name}: ${e.status || "missing status"}`);
  if (e.sourceHash !== build.sourceHash || e.buildHash !== build.buildHash)
    errors.push(`${name}: stale build evidence`);
  if (!Number.isInteger(e.testCount) || e.testCount <= 0 || !e.testIds?.length)
    errors.push(`${name}: no executed tests`);
  if (!e.command?.length) errors.push(`${name}: command missing`);
  if (!e.runner?.platform) errors.push(`${name}: runner identity missing`);
  if (!Object.keys(e.lockHashes || {}).length)
    errors.push(`${name}: input locks missing`);
  for (const id of milestone === "M01" ? requiredIds[name] || [] : [])
    if (!e.testIds?.includes(id))
      errors.push(`${name}: missing required test ${id}`);
  if (
    name === "browser-suite" &&
    (e.stats?.unexpected !== 0 ||
      e.stats?.skipped !== 0 ||
      e.stats?.expected < 18)
  )
    errors.push(`${name}: failed, skipped or incomplete regression journey`);
  if (name === "hardware-windows-linux") {
    if (!["win32", "linux"].includes(e.runner?.platform))
      errors.push(`${name}: required Windows/Linux runner missing`);
    if (
      !e.gpu?.description ||
      /swiftshader|software|llvmpipe/i.test(JSON.stringify(e.gpu))
    )
      errors.push(`${name}: real GPU identity missing`);
    if (!e.sameBuildCorpusPassed)
      errors.push(`${name}: same-build corpus incomplete`);
  }
  if (name === "m01-capacity") {
    for (const [key, limit] of Object.entries({
      importMs: 3000,
      exportMs: 3000,
      editP95: 100,
      pickP95: 100,
      snapP95: 100,
    }))
      if (!Number.isFinite(e.metrics?.[key]) || e.metrics[key] > limit)
        errors.push(`${name}: ${key} exceeds ${limit} ms or is missing`);
    if (!e.softwareGpu)
      for (const [key, limit] of Object.entries({
        orbitP95: 33,
        longestFrame: 250,
      }))
        if (!Number.isFinite(e.metrics?.[key]) || e.metrics[key] > limit)
          errors.push(`${name}: ${key} exceeds hardware gate`);
    if (!e.samples?.frameTimes?.length)
      errors.push(`${name}: orbit samples missing`);
  }
  if (
    name === "m01-startup" &&
    (!e.samples?.warm?.length ||
      Math.max(...e.samples.warm) > 2000 ||
      !Number.isFinite(e.coldMs) ||
      e.coldMs > 5000 ||
      !Number.isFinite(e.compressedBytes) ||
      e.compressedBytes > 8 * 1024 * 1024)
  )
    errors.push(`${name}: startup/payload thresholds not established`);
  if (
    name === "computer-use" &&
    (!e.tool?.includes("cua") || !Object.keys(e.artifactHashes || {}).length)
  )
    errors.push(`${name}: computer-use evidence missing`);
  return errors;
}
