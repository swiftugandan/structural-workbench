import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
export const evidenceDir = (fallback = "evidence/M00/current") =>
  process.env.WORKBENCH_EVIDENCE_DIR || fallback;
export async function record(name, data) {
  await mkdir(evidenceDir(), { recursive: true });
  const build = JSON.parse(await readFile("dist/build.json"));
  const lockHashes = {};
  for (const file of [
    "Cargo.lock",
    "package-lock.json",
    "rust-toolchain.toml",
    "fixtures/benchmarks.json",
  ])
    lockHashes[file] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  const artifactHashes = {};
  for (const artifact of data.artifacts || []) {
    if (typeof artifact !== "string") continue;
    artifactHashes[artifact] = createHash("sha256")
      .update(await readFile(`${evidenceDir()}/${artifact}`))
      .digest("hex");
  }
  await writeFile(
    `${evidenceDir()}/${name}.json`,
    JSON.stringify(
      {
        taskId: process.env.WORKBENCH_TASK_ID || "M00-A",
        milestone: process.env.WORKBENCH_MILESTONE || "M00",
        sourceHash: build.sourceHash,
        buildHash: build.buildHash,
        lockHashes,
        artifactHashes,
        runner: {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          cpu: os.cpus()[0].model,
          memory: os.totalmem(),
        },
        observedAt: new Date().toISOString(),
        ...data,
      },
      null,
      2,
    ),
  );
}
