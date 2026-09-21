import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";
if (!["linux", "win32"].includes(process.platform)) {
  await record("hardware-windows-linux", {
    status: "BLOCKED",
    testCount: 0,
    testIds: [],
    command: process.argv,
    reason:
      "Required real Windows/Linux GPU runner is not this host. No platform requirement was waived.",
  });
  process.exitCode = 1;
} else {
  const run = spawnSync(process.execPath, ["tools/run-browser.mjs"], {
    stdio: "inherit",
    env: { ...process.env, WORKBENCH_REAL_GPU: "1" },
  });
  const capacity = JSON.parse(
    await readFile(`${evidenceDir()}/m01-capacity.json`),
  );
  const gpu = capacity.gpu;
  const actual = !/swiftshader|software|llvmpipe/i.test(JSON.stringify(gpu));
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
