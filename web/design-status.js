/** Presentation palette only; statuses are recorded Rust outcomes. */
export const designStatusPalette = {
  pass: { ink: [0.1, 0.46, 0.28, 1], css: "#197547", label: "PASS" },
  fail: { ink: [0.78, 0.15, 0.18, 1], css: "#c7262e", label: "FAIL" },
  unsupported: {
    ink: [0.58, 0.29, 0.68, 1],
    css: "#944aad",
    label: "UNSUPPORTED",
  },
  indeterminate: {
    ink: [0.65, 0.39, 0.04, 1],
    css: "#a6630a",
    label: "INDETERMINATE",
  },
  stale: { ink: [0.42, 0.44, 0.48, 1], css: "#6b707a", label: "STALE" },
  notChecked: {
    ink: [0.58, 0.62, 0.68, 1],
    css: "#949eae",
    label: "NOT CHECKED",
  },
};
