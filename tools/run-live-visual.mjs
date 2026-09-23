import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

const shots = [
  "live-visual-landing.png",
  "live-visual-portal.png",
  "live-visual-results.png",
];
const dir = evidenceDir();
const run = spawnSync(
  "npx",
  ["playwright", "test", "tests/visual/live-visual.spec.js"],
  {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      WORKBENCH_REAL_GPU: "1",
      WORKBENCH_LIVE_VISUAL: "1",
    },
  },
);
process.stdout.write(run.stdout || "");
process.stderr.write(run.stderr || "");

let artifactsOk = run.status === 0;
for (const shot of shots) {
  try {
    await access(`${dir}/${shot}`);
  } catch {
    artifactsOk = false;
  }
}

await record("computer-use", {
  status: artifactsOk ? "PASS" : "FAIL",
  testCount: artifactsOk ? 1 : 0,
  testIds: artifactsOk
    ? ["Live visual: portal authoring, analyse and results on real GPU"]
    : [],
  tool: "live-visual-playwright",
  command: [
    "npx",
    "playwright",
    "test",
    "tests/visual/live-visual.spec.js",
  ],
  artifacts: artifactsOk ? shots : [],
  reason: artifactsOk
    ? "CUA policy unavailable; headed real-GPU Playwright live visual recorded (ADR 0005)."
    : "Live visual journey failed or screenshots missing.",
});
process.exitCode = artifactsOk ? 0 : 1;
