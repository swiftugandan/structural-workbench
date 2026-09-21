import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { record } from "./evidence.mjs";
const useWasm = process.argv.includes("--wasm");
const corpus = JSON.parse(await readFile("fixtures/benchmarks.json"));
let browser, page;
if (useWasm) {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  await page.goto("http://127.0.0.1:4173");
}
let count = 0;
const results = [];
try {
  for (const b of corpus.benchmarks.filter((b) => b.kind === "analysis")) {
    const file = "fixtures/" + b.model,
      model = JSON.parse(await readFile(file));
    const native = JSON.parse(
      execFileSync("target/release/workbench-cli", [file, b.resultCase], {
        encoding: "utf8",
      }),
    );
    let actual = native;
    if (useWasm) {
      actual = await page.evaluate(
        async ({ model, caseId }) => {
          const wasm = await import("/pkg/workbench_wasm_api.js");
          await wasm.default();
          const k = new wasm.Kernel();
          const req = (operation, payload, expectedRevision) =>
            JSON.parse(
              k.request(
                JSON.stringify({
                  protocolVersion: 1,
                  requestId: "verification",
                  operation,
                  payload,
                  expectedRevision,
                }),
              ),
            );
          const opened = req("createProject", { project: model }, null);
          if (opened.status !== "ok") throw Error(JSON.stringify(opened));
          const solved = req("analyse", { caseIds: [caseId] }, opened.revision);
          if (solved.status !== "ok") throw Error(JSON.stringify(solved));
          k.free();
          return solved.payload;
        },
        { model, caseId: b.resultCase },
      );
      for (const key of ["nodeDisplacements", "reactions"])
        for (let i = 0; i < native[key].length; i++) {
          const atol = key === "reactions" ? 1e-3 : i % 6 < 3 ? 1e-9 : 1e-10;
          assert.ok(
            Math.abs(native[key][i] - actual[key][i]) <=
              atol + 1e-9 * Math.abs(native[key][i]),
            `${b.id} native/WASM ${key}/${i}`,
          );
        }
    }
    for (const c of b.checks) {
      const [family, id, component, field, abs] = c.selector.split(".");
      let value;
      if (family === "node")
        value =
          actual.nodeDisplacements[
            actual.nodeIds.indexOf(id) * 6 +
              ["ux", "uy", "uz", "rx", "ry", "rz"].indexOf(component)
          ];
      if (family === "reaction")
        value =
          actual.reactions[
            actual.reactionSupportIds.indexOf(id) * 6 +
              ["fx", "fy", "fz", "mx", "my", "mz"].indexOf(component)
          ];
      if (family === "member") {
        const station = Number(
          component.replace("station", "").replace("_", "."),
        );
        const sample = actual.members
          .find((m) => m.id === id)
          .samples.find((s) => Math.abs(s.station - station) < 1e-12);
        value =
          field === "uz"
            ? sample.displacement[2]
            : sample.actions[["n", "vy", "vz", "t", "my", "mz"].indexOf(field)];
        if (abs === "abs") value = Math.abs(value);
      }
      const atol =
        c.quantity === "translation"
          ? 1e-9
          : c.quantity === "rotation"
            ? 1e-10
            : 1e-3;
      assert.ok(
        Math.abs(value - c.expected) <= atol + 1e-6 * Math.abs(c.expected),
        `${b.id} ${c.selector}: ${value} != ${c.expected}`,
      );
      count++;
    }
    assert.ok(actual.numericalChecks.scaledResidual <= 1e-10);
    results.push({ id: b.id, input: model, result: actual });
    console.log(`${b.id}: ${b.checks.length} checks PASS`);
  }
  await record(useWasm ? "wasm" : "numerical", {
    command: process.argv,
    status: "PASS",
    testCount: count,
    testIds: results.map((x) => x.id),
    browser: browser ? await browser.version() : null,
    results,
  });
  console.log(
    `${count} signed analytical checks passed${useWasm ? " with native/WASM comparisons" : ""}`,
  );
} finally {
  await browser?.close();
}
