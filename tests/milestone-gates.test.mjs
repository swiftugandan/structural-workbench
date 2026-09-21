import test from "node:test";
import assert from "node:assert/strict";
import { recordIssues, requiredIds } from "../tools/milestone-rules.mjs";
const build = { sourceHash: "source", buildHash: "build" };
const record = (name) => ({
  status: "PASS",
  ...build,
  testCount: 5,
  testIds: requiredIds[name] || ["test"],
  command: ["test"],
  runner: { platform: "linux" },
  lockHashes: { "Cargo.lock": "lock" },
});
test("M01 gate rejects stale, failed, empty and missing test families", () => {
  for (const patch of [
    { status: "FAIL" },
    { sourceHash: "old" },
    { buildHash: "old" },
    { testCount: 0 },
    { testIds: [] },
    { command: [] },
    { runner: {} },
    { lockHashes: {} },
  ])
    assert.ok(
      recordIssues("native", { ...record("native"), ...patch }, build).length,
    );
  assert.deepEqual(recordIssues("native", record("native"), build), []);
});
test("M01 gate cannot substitute software GPU or macOS for required hardware", () => {
  for (const patch of [
    { runner: { platform: "darwin" } },
    { gpu: { description: "SwiftShader" } },
    { sameBuildCorpusPassed: false },
  ])
    assert.ok(
      recordIssues(
        "hardware-windows-linux",
        {
          ...record("hardware-windows-linux"),
          gpu: { description: "hardware" },
          sameBuildCorpusPassed: true,
          ...patch,
        },
        build,
      ).length,
    );
});
test("M01 gate rejects incomplete browser coverage, capacity and computer use", () => {
  assert.ok(
    recordIssues(
      "browser-suite",
      {
        ...record("browser-suite"),
        stats: { expected: 18, unexpected: 0, skipped: 1 },
      },
      build,
    ).length,
  );
  assert.ok(recordIssues("m01-capacity", record("m01-capacity"), build).length);
  assert.ok(recordIssues("computer-use", record("computer-use"), build).length);
});

test("M01-UX gate requires all eight UX acceptance IDs and fresh successful evidence", () => {
  const valid = record("ux-acceptance");
  assert.deepEqual(
    recordIssues("ux-acceptance", valid, build, { milestone: "M01-UX" }),
    [],
  );
  for (const patch of [
    { testIds: ["UX-01"] },
    { status: "FAIL" },
    { sourceHash: "old" },
    { buildHash: "old" },
    { testIds: [] },
    { testCount: 0 },
  ])
    assert.ok(
      recordIssues("ux-acceptance", { ...valid, ...patch }, build, {
        milestone: "M01-UX",
      }).length,
    );
});
