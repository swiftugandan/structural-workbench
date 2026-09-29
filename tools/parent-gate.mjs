/**
 * Shared same-build parent-gate corpus runners. Each record lists the tests
 * that actually executed and passed, parsed from the runner's own output,
 * never a hand-written list.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { record } from "./evidence.mjs";

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
  return (r.stdout || "") + (r.stderr || "");
}

/** Build and record the build identity; returns dist/build.json. */
export async function buildRecord() {
  run("npm", ["run", "build"]);
  const build = JSON.parse(await readFile("dist/build.json", "utf8"));
  await record("build", {
    status: "PASS",
    testCount: Object.keys(build.files).length,
    testIds: Object.keys(build.files),
    command: ["npm", "run", "build"],
    artifacts: [],
  });
  return build;
}

/** `cargo test` targets; records every `test name ... ok` line. */
export async function cargoRecord(dir, name, command) {
  const out = run(command[0], command.slice(1));
  await writeFile(`${dir}/${name}.log`, out);
  const passed = [...out.matchAll(/^test (\S+) \.\.\. ok$/gm)].map((m) => m[1]);
  const failed = [...out.matchAll(/^test (\S+) \.\.\. FAILED$/gm)];
  await record(name, {
    status: failed.length || !passed.length ? "FAIL" : "PASS",
    testCount: passed.length,
    testIds: passed,
    command,
    artifacts: [],
  });
}

/** `node --test` files with the TAP reporter; records every `ok N - title`. */
export async function nodeRecord(dir, name, files) {
  const command = ["node", "--test", "--test-reporter=tap", ...files];
  const out = run(command[0], command.slice(1));
  await writeFile(`${dir}/${name}.log`, out);
  const passed = [...out.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) =>
    m[1].trim(),
  );
  const failed = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)];
  await record(name, {
    status: failed.length || !passed.length ? "FAIL" : "PASS",
    testCount: passed.length,
    testIds: passed,
    command,
    artifacts: [],
  });
}

/**
 * Playwright specs with the evidence directory as their output; records the
 * titles whose last attempt passed, from the JSON reporter.
 */
export async function browserRecord(dir, name, specs, extra = {}) {
  const out = run("npx", ["playwright", "test", ...specs], {
    env: { ...process.env, WORKBENCH_EVIDENCE_DIR: dir },
  });
  await writeFile(`${dir}/${name}.log`, out);
  const results = JSON.parse(
    await readFile(`${dir}/playwright-results.json`, "utf8"),
  );
  const titles = [];
  const walk = (suite) => {
    for (const spec of suite.specs || [])
      for (const t of spec.tests || [])
        if (t.results?.at(-1)?.status === "passed") titles.push(spec.title);
    for (const s of suite.suites || []) walk(s);
  };
  for (const s of results.suites) walk(s);
  await record(name, {
    status:
      results.stats.unexpected === 0 &&
      results.stats.skipped === 0 &&
      titles.length === results.stats.expected
        ? "PASS"
        : "FAIL",
    testCount: titles.length,
    testIds: titles,
    command: ["npx", "playwright", "test", ...specs],
    stats: results.stats,
    ...extra,
  });
}

/**
 * Criteria bound to executed tests: a criterion passes only when every named
 * test is in a same-build PASS record. Returns rows and issues.
 */
export async function evaluateCriteria(dir, build, criteria) {
  const cache = {};
  const load = async (name) => {
    if (!(name in cache))
      try {
        cache[name] = JSON.parse(await readFile(`${dir}/${name}.json`, "utf8"));
      } catch {
        cache[name] = null;
      }
    return cache[name];
  };
  const issues = [];
  const rows = [];
  for (const c of criteria) {
    const missing = [];
    for (const [name, ids] of Object.entries(c.tests)) {
      const e = await load(name);
      if (!e) {
        missing.push(`${name}.json missing`);
        continue;
      }
      if (e.status !== "PASS") missing.push(`${name} status ${e.status}`);
      if (e.sourceHash !== build.sourceHash || e.buildHash !== build.buildHash)
        missing.push(`${name} stale hash`);
      for (const id of ids)
        if (!e.testIds?.includes(id))
          missing.push(`${name}: ${id} not executed`);
    }
    if (missing.length) issues.push(`${c.id}: ${missing.join("; ")}`);
    rows.push({ ...c, status: missing.length ? "FAIL" : "PASS", missing });
  }
  return { rows, issues };
}

/** Markdown acceptance table. */
export function acceptanceMarkdown(
  milestone,
  build,
  rows,
  issues,
  limitations,
) {
  return `# ${milestone} acceptance record

Source hash: \`${build.sourceHash}\`
Build hash: \`${build.buildHash}\`
Observed: ${new Date().toISOString()}
Status: **${issues.length ? "FAIL" : "PASS"}**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
${rows
  .map(
    (r) =>
      `| ${r.id} | ${r.title} | ${r.evidence} | ${r.status} | ${r.observation}${r.missing?.length ? ` Missing: ${r.missing.join("; ")}` : ""} |`,
  )
  .join("\n")}

Limitations: ${limitations}
`;
}
