import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { sourceHash } from "./build.mjs";
import { record } from "./evidence.mjs";

const dir = "evidence/M07/native-inputs";
process.env.WORKBENCH_EVIDENCE_DIR = dir;
process.env.WORKBENCH_TASK_ID = "M07-E-F";
process.env.WORKBENCH_MILESTONE = "M07";
await mkdir(dir, { recursive: true });
const outcomes = [];
function run(name, command, args) {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  const log = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(log);
  outcomes.push({ name, command: [command, ...args], exitCode: r.status });
  return writeFile(`${dir}/${name}.log`, log).then(() => {
    if (r.status !== 0) throw Error(`${name} failed`);
    return log;
  });
}
await run("build", "npm", ["run", "build"]);
const native = await run("native", "cargo", [
  "test",
  "--workspace",
  "--locked",
]);
const nativeCount = [
  ...native.matchAll(/test result: ok\. (\d+) passed/g),
].reduce((n, m) => n + Number(m[1]), 0);
if (
  nativeCount < 76 ||
  !native.includes(
    "native_no_seed_flexure_and_shear_have_exact_station_provenance ... ok",
  )
)
  throw Error("Native corpus incomplete");
await run("contracts-ui", "node", [
  "--test",
  "tests/contracts.test.mjs",
  "tests/steel-check.test.mjs",
]);
await run("analytical-native", "npm", ["run", "test:numerical"]);
await run("analytical-wasm", "npm", ["run", "test:wasm"]);
await run("browser", "npx", [
  "playwright",
  "test",
  "tests/e2e/native-steel-design.spec.js",
  "tests/e2e/steel-check.spec.js",
  "tests/e2e/capability-ledger.spec.js",
]);
const browser = JSON.parse(
  await readFile(`${dir}/playwright-results.json`, "utf8"),
);
if (
  browser.stats.unexpected ||
  browser.stats.skipped ||
  browser.stats.expected < 8
)
  throw Error("Browser corpus incomplete");
const build = JSON.parse(await readFile("dist/build.json", "utf8"));
if ((await sourceHash()) !== build.sourceHash)
  throw Error("Source changed since the build");
await record("native-steel-gate", {
  status: "PASS",
  scope:
    "Local model-native steel integration and S2 regression; no new numerical-code breadth",
  testCount: nativeCount + 6 + browser.stats.expected,
  nativeTestCount: nativeCount,
  browserStats: browser.stats,
  outcomes,
  acceptanceIds: [
    "DW-E1",
    "DW-E2",
    "DW-E3",
    "DW-E4",
    "DW-E5",
    "DW-E6",
    "DW-F1",
    "DW-F2",
    "DW-F3",
    "DW-F4",
    "DW-F5",
  ],
  command: ["npm", "run", "verify:design-workspace"],
  artifacts: [
    "playwright-results.json",
    "design-run.json",
    "member-steel-pass.png",
  ],
  platformLimits:
    "Playwright uses Chromium/SwiftShader. A separate visible Chrome observation is recorded independently. No Windows/Linux hardware claim.",
});
console.log(`Verified model-native steel on ${build.buildHash}`);
