import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
export const evidenceDir = (fallback = "evidence/M00/current") =>
  process.env.WORKBENCH_EVIDENCE_DIR || fallback;

/**
 * Where a test's evidence goes: the environment's choice (a gate or a
 * regression run sets it for the whole process) or the test's own defaults.
 * It reads the environment and never writes it: tests share one worker
 * process, so a module that assigned process.env would redirect every test
 * that loads after it.
 */
export function evidenceContext({
  dir = "evidence/M00/current",
  taskId = "M00-A",
  milestone = "M00",
} = {}) {
  return {
    dir: process.env.WORKBENCH_EVIDENCE_DIR || dir,
    taskId: process.env.WORKBENCH_TASK_ID || taskId,
    milestone: process.env.WORKBENCH_MILESTONE || milestone,
  };
}

/** `record` bound to one test file's evidence context. */
export const recorder = (context) => (name, data) =>
  record(name, data, context);

export async function record(name, data, context = evidenceContext()) {
  const dir = context.dir;
  await mkdir(dir, { recursive: true });
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
      .update(await readFile(`${dir}/${artifact}`))
      .digest("hex");
  }
  await writeFile(
    `${dir}/${name}.json`,
    JSON.stringify(
      {
        taskId: context.taskId,
        milestone: context.milestone,
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
