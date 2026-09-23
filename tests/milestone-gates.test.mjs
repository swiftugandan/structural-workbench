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
test("M01 gate cannot substitute software GPU for required hardware", () => {
  for (const patch of [
    { gpu: { description: "SwiftShader" } },
    { sameBuildCorpusPassed: false },
    { runner: { platform: "aix" } },
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
  assert.deepEqual(
    recordIssues(
      "hardware-windows-linux",
      {
        ...record("hardware-windows-linux"),
        runner: { platform: "darwin" },
        gpu: { description: "AMD Radeon", vendor: "amd" },
        sameBuildCorpusPassed: true,
      },
      build,
    ),
    [],
  );
  assert.deepEqual(
    recordIssues(
      "hardware-windows-linux",
      {
        ...record("hardware-windows-linux"),
        runner: { platform: "darwin" },
        gpu: { vendor: "amd", description: "" },
        sameBuildCorpusPassed: true,
      },
      build,
    ),
    [],
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
  assert.deepEqual(
    recordIssues(
      "computer-use",
      {
        ...record("computer-use"),
        tool: "live-visual-playwright",
        artifactHashes: { "live-visual-portal.png": "abc" },
      },
      build,
    ),
    [],
  );
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

test("M02 gate requires scenario acceptance IDs and M02 browser/native coverage", () => {
  const valid = record("m02-acceptance");
  assert.deepEqual(
    recordIssues("m02-acceptance", valid, build, { milestone: "M02" }),
    [],
  );
  assert.ok(
    recordIssues(
      "m02-acceptance",
      { ...valid, testIds: ["M02-CASES"] },
      build,
      { milestone: "M02" },
    ).length,
  );
  assert.ok(
    recordIssues(
      "native",
      { ...record("native"), testIds: requiredIds.native },
      build,
      { milestone: "M02" },
    ).length,
  );
  assert.deepEqual(
    recordIssues(
      "native",
      { ...record("native"), testIds: requiredIds["native-m02"] },
      build,
      { milestone: "M02" },
    ),
    [],
  );
  assert.deepEqual(
    recordIssues(
      "browser-suite",
      {
        ...record("browser-suite"),
        testIds: requiredIds["browser-suite-m02"],
        stats: { expected: 18, unexpected: 0, skipped: 0 },
      },
      build,
      { milestone: "M02" },
    ),
    [],
  );
});
