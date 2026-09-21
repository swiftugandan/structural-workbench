import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
export async function record(name, data) {
  await mkdir("evidence/M00/current", { recursive: true });
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
  await writeFile(
    `evidence/M00/current/${name}.json`,
    JSON.stringify(
      {
        taskId: "M00-A",
        milestone: "M00",
        sourceHash: build.sourceHash,
        buildHash: build.buildHash,
        lockHashes,
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
