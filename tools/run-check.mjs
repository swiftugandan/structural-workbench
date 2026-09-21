import { spawnSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";
const [name, command, ...args] = process.argv.slice(2);
const start = new Date().toISOString();
const r = spawnSync(command, args, {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
const output = (r.stdout || "") + (r.stderr || "");
let ids = [];
if (name === "native")
  ids = [...output.matchAll(/^test ([\w:]+) \.\.\. ok$/gm)].map((x) => x[1]);
else ids = [...output.matchAll(/^# Subtest: (.*)$/gm)].map((x) => x[1]);
await mkdir(evidenceDir(), { recursive: true });
await writeFile(`${evidenceDir()}/${name}.log`, output);
await record(name, {
  artifacts: [`${name}.log`],
  status: r.status === 0 && ids.length ? "PASS" : "FAIL",
  testCount: ids.length,
  testIds: ids,
  command: [command, ...args],
  exitCode: r.status,
  startedAt: start,
  finishedAt: new Date().toISOString(),
});
process.exitCode = r.status === 0 && ids.length ? 0 : 1;
