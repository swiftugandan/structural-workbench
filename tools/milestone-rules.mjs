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
  "ux-acceptance",
];
export const m01ux = [
  "build",
  "contracts",
  "wasm",
  "browser-suite",
  "accessibility",
  "graphics",
  "ux-acceptance",
  "computer-use",
];
export const m02 = [
  "build",
  "native",
  "contracts",
  "numerical",
  "wasm",
  "browser-suite",
  "m02-acceptance",
];
export const m03 = [
  "build",
  "native",
  "m03-capacity",
  "m03-wasm-memory",
  "m03-oracle",
  "m03-browser",
  "m03-acceptance",
];
export const m04 = [
  "build",
  "migrate",
  "m04-browser",
  "security",
  "m04-record",
  "m04-acceptance",
];
export const requiredIds = {
  "ux-acceptance": [
    "UX-01",
    "UX-02",
    "UX-03",
    "UX-04",
    "UX-05",
    "UX-06",
    "UX-07",
    "UX-08",
  ],
  "m02-acceptance": [
    "M02-CASES",
    "M02-EXTREMA",
    "M02-RELEASES",
    "M02-POINTS",
    "M02-SELF-WEIGHT",
    "M02-PRESCRIBED",
    "M02-ENVELOPE",
    "M02-INVALID",
  ],
  "m03-acceptance": [
    "M03-ORBIT-COPY",
    "M03-DUAL-WORKERS",
    "M03-ORACLE",
    "M03-CAPACITY",
    "M03-UNIT-ACTION",
    "M03-ROLL",
    "M03-SECTION-AXIS",
    "M03-HIERARCHY",
    "M03-GPU-DURING-ANALYSIS",
    "M03-UI-RESPONSIVENESS",
  ],
  "m04-acceptance": [
    "M04-RECOVERY",
    "M04-OFFLINE",
    "M04-MIGRATION",
    "M04-RELIABILITY",
    "M04-QUOTA-LEASE",
    "M04-SECURITY-EXPORTS",
    "M04-RECORD",
  ],
  "m04-browser": [
    "M04 recovery: restore committed revision; refuse while form dirty",
    "precaches atomic build and reopens offline from IndexedDB",
    "prompts reload after save when a waiting build update is ready",
    "M04 migration: 0.9.0 imports, retains original, unknown schema refused",
    "corrupt latest snapshot recovers verified history revision",
    "model Worker crash restores last confirmed in-memory model",
    "persistence denied warns without blocking export",
    "M04 record: export/import equivalence and report matches displayed results",
    "storage quota failure is explicit and downloads survive",
    "single writer lock protects the second tab",
  ],
  "m04-record": [
    "M04-export-import-equivalence",
    "M04-report-matches-display",
    "M04-csv-units",
  ],
  "m03-browser": [
    "M03 copy portal into bays, analyse and inspect My Mz torsion",
    "M03 dual Workers: cancel leaves model intact; superseded solve stays stale",
    "M03 section-axis: edit localY roll swaps My/Mz end actions",
    "M03 hierarchy: split shows physical parent and analytical children",
    "3D exposes Y direction and reference grid; orbit updates compass without model changes",
    "M03 cancel timing: cancelled ≤250ms and editing restored ≤1s",
    "M03 analyse click keeps UI event-loop gaps ≤100ms",
    "M03 GPU loss during blocked analysis preserves model hash",
  ],
  "browser-suite": [
    "Canvas first: place support, draw force, edit assignments and undo without dialogs",
    "Canvas first: two-click members, distributed loads, measure and nonmodal precision panel",
    "Canvas first: point-to-point copy and dependency delete stay on canvas",
    "Canvas first: node placement, split, move and Escape preserve atomic history",
    "Readable labels hide internal IDs and persist after copy and reopen",
    "M01 keyboard-only portal creation, numeric drawing, table editing and solve",
    "M01 portal: setup, sway, edit coordinates, undo, draw, reject, save and reopen",
    "M01 CAD pointer drawing, snap feedback, disconnected crossing and explicit connect",
    "M01 CAD multi-selection, move copy delete previews, measure and scoped shortcuts",
  ],
  "browser-suite-m02": [
    "M02 self-weight: B10 analyse, duplicate rejected, case delete keeps combinations valid",
    "M02 prescribed: B09 analyse, edit settlement, reject free-DOF prescription",
    "M02 scenarios: B11 combination factors tip load and reaction",
    "M02 scenarios: dead/live/wind cases, strength combination and envelope provenance",
  ],
  native: [
    "analytical_b01_to_b11",
    "m01_global_rotation_relabelling_reordering_and_endpoint_reversal",
    "move_copy_delete_previews_and_undo_are_atomic",
    "projected_crossing_index_selection_depth_and_measurement",
    "split_uniform_load_preserves_response_provenance_and_exact_undo",
  ],
  "native-m02": [
    "analytical_b01_to_b11",
    "b07_key_stations_capture_exact_midspan_moment",
    "load_scale_and_superposition",
    "r01_my_releases_under_udl_match_simply_supported",
    "p01_interior_point_matches_b05_closed_form",
    "v01_envelope_exposes_governing_combination",
    "n22_envelope_rejects_single_case",
  ],
  "native-m03": [
    "analytical_b01_to_b11",
    "m01_global_rotation_relabelling_reordering_and_endpoint_reversal",
    "m03_all_axis_unit_nodal_actions",
    "m03_local_y_roll_swaps_bending_axes",
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
  const ids =
    milestone === "M02" && name === "native"
      ? requiredIds["native-m02"]
      : milestone === "M03" && name === "native"
        ? requiredIds["native-m03"]
        : milestone === "M02" && name === "browser-suite"
          ? requiredIds["browser-suite-m02"]
          : ["M01", "M01-UX", "M02", "M03", "M04"].includes(milestone)
            ? requiredIds[name] || []
            : [];
  for (const id of ids)
    if (!e.testIds?.includes(id))
      errors.push(`${name}: missing required test ${id}`);
  if (
    name === "browser-suite" &&
    (e.stats?.unexpected !== 0 ||
      e.stats?.skipped !== 0 ||
      e.stats?.expected < 18)
  )
    errors.push(`${name}: failed, skipped or incomplete regression journey`);
  if (
    name === "m03-browser" &&
    (e.stats?.unexpected !== 0 ||
      e.stats?.skipped !== 0 ||
      e.stats?.expected < 8)
  )
    errors.push(`${name}: failed, skipped or incomplete M03 browser journey`);
  if (
    name === "m04-browser" &&
    (e.stats?.unexpected !== 0 ||
      e.stats?.skipped !== 0 ||
      e.stats?.expected < 10)
  )
    errors.push(`${name}: failed, skipped or incomplete M04 browser journey`);
  if (name === "hardware-windows-linux") {
    if (!["win32", "linux", "darwin"].includes(e.runner?.platform))
      errors.push(`${name}: required real-GPU runner OS missing`);
    const gpuIdentity = JSON.stringify(e.gpu || {});
    if (
      !(e.gpu?.description || e.gpu?.vendor || e.gpu?.device) ||
      /swiftshader|software|llvmpipe/i.test(gpuIdentity)
    )
      errors.push(`${name}: real GPU identity missing`);
    if (!e.sameBuildCorpusPassed)
      errors.push(`${name}: same-build corpus incomplete`);
  }
  if (name === "m01-capacity") {
    const limits = e.thresholds || {
      importMs: 3000,
      exportMs: 3000,
      editP95: 100,
      pickP95: 100,
      snapP95: 100,
      orbitP95: 33,
      longestFrame: 250,
    };
    for (const [key, limit] of Object.entries({
      importMs: limits.importMs,
      exportMs: limits.exportMs,
      editP95: limits.editP95,
      pickP95: limits.pickP95,
      snapP95: limits.snapP95 ?? 100,
    }))
      if (!Number.isFinite(e.metrics?.[key]) || e.metrics[key] > limit)
        errors.push(`${name}: ${key} exceeds ${limit} ms or is missing`);
    if (!e.softwareGpu)
      for (const [key, limit] of Object.entries({
        orbitP95: limits.orbitP95,
        longestFrame: limits.longestFrame,
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
    (!/(cua|live-visual)/i.test(e.tool || "") ||
      !Object.keys(e.artifactHashes || {}).length)
  )
    errors.push(`${name}: computer-use evidence missing`);
  return errors;
}
