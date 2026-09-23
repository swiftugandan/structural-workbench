import { readFile } from "node:fs/promises";
import os from "node:os";

const DEFAULT_HARDWARE = {
  importMs: 3000,
  exportMs: 3000,
  editP95: 100,
  pickP95: 100,
  snapP95: 100,
  orbitP95: 33,
  longestFrame: 250,
};

export async function loadLabRunner() {
  try {
    return JSON.parse(await readFile("docs/lab-runner.json", "utf8"));
  } catch {
    return null;
  }
}

export async function hardwareThresholds(gpu = {}) {
  const lab = await loadLabRunner();
  const vendor = String(gpu.vendor || "").toLowerCase();
  const matches =
    lab &&
    lab.platform === os.platform() &&
    (!lab.gpu?.vendor || lab.gpu.vendor.toLowerCase() === vendor);
  if (matches) {
    return {
      ...DEFAULT_HARDWARE,
      ...lab.thresholds,
      labRunnerId: lab.id,
      labPinned: true,
    };
  }
  return { ...DEFAULT_HARDWARE, labPinned: false };
}
