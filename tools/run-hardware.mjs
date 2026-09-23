import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

const allowedPlatforms = new Set(["linux", "win32", "darwin"]);
if (!allowedPlatforms.has(process.platform)) {
  await record("hardware-windows-linux", {
    status: "BLOCKED",
    testCount: 0,
    testIds: [],
    command: process.argv,
    reason: `Unsupported platform ${process.platform}; need linux, win32 or darwin with a real GPU.`,
  });
  process.exitCode = 1;
} else {
  const run = spawnSync(process.execPath, ["tools/run-browser.mjs"], {
    stdio: "inherit",
    env: { ...process.env, WORKBENCH_REAL_GPU: "1" },
  });
  const capacityPath = `${evidenceDir()}/m01-capacity.json`;
  let capacity;
  try {
    capacity = JSON.parse(await readFile(capacityPath));
  } catch {
    await record("hardware-windows-linux", {
      status: "FAIL",
      testCount: 0,
      testIds: [],
      command: process.argv,
      reason: "m01-capacity.json missing after real-GPU browser run",
      sameBuildCorpusPassed: false,
    });
    process.exitCode = 1;
    process.exit();
  }
  const gpu = capacity.gpu;
  const gpuIdentity = JSON.stringify(gpu || {});
  const actual =
    !!(gpu?.description || gpu?.vendor || gpu?.device) &&
    !/swiftshader|software|llvmpipe/i.test(gpuIdentity);
  const required = [
    "native",
    "contracts",
    "security",
    "numerical",
    "wasm",
    "oracle",
    "browser-suite",
    "m01-capacity",
    "m01-graphics",
    "m01-startup",
  ];
  const build = JSON.parse(await readFile("dist/build.json"));
  let sameBuildCorpusPassed = run.status === 0 && actual;
  for (const name of required) {
    try {
      const r = JSON.parse(await readFile(`${evidenceDir()}/${name}.json`));
      if (
        r.status !== "PASS" ||
        r.sourceHash !== build.sourceHash ||
        r.buildHash !== build.buildHash
      )
        sameBuildCorpusPassed = false;
    } catch {
      sameBuildCorpusPassed = false;
    }
  }
  await record("hardware-windows-linux", {
    status: sameBuildCorpusPassed ? "PASS" : "FAIL",
    command: process.argv,
    testCount: required.length,
    testIds: required,
    gpu,
    sameBuildCorpusPassed,
  });
  process.exitCode = sameBuildCorpusPassed ? 0 : 1;
}
