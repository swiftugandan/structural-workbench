#!/usr/bin/env node
/**
 * Full browser regression without touching committed evidence: every
 * spec's output goes to test-results/evidence (ignored, cleared by
 * Playwright each run). Gates set their own evidence directories instead.
 * Usage: node tools/run-regression.mjs [playwright args…]
 */
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  WORKBENCH_EVIDENCE_DIR: "test-results/evidence",
  WORKBENCH_TASK_ID: "regression",
  WORKBENCH_MILESTONE: "regression",
};
const args = process.argv.slice(2);
const r = spawnSync(
  "npx",
  ["playwright", "test", ...(args.length ? args : ["tests/e2e"])],
  {
    env,
    stdio: "inherit",
  },
);
process.exitCode = r.status ?? 1;
