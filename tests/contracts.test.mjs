import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
const schema = JSON.parse(await readFile("contracts/project.schema.json"));
const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);
test("B01–B11 conform to Draft 2020-12 contract", async () => {
  for (let i = 1; i <= 11; i++) {
    const v = JSON.parse(
      await readFile(`fixtures/models/B${String(i).padStart(2, "0")}.json`),
    );
    assert.equal(validate(v), true, JSON.stringify(validate.errors));
  }
});
test("unknown fields and unknown schema rejected", async () => {
  const v = JSON.parse(await readFile("fixtures/models/B02.json"));
  v.solverOverride = "anything";
  assert.equal(validate(v), false);
  delete v.solverOverride;
  v.schemaVersion = "2.0.0";
  assert.equal(validate(v), false);
});

test("actual WASM request/response envelopes conform to Draft 2020-12", async () => {
  const { initSync, Kernel } = await import(
    "../dist/pkg/workbench_wasm_api.js"
  );
  initSync({ module: await readFile("dist/pkg/workbench_wasm_api_bg.wasm") });
  const ajv = new Ajv({ strict: false, allErrors: true });
  const request = ajv.compile(
    JSON.parse(await readFile("contracts/request.schema.json")),
  );
  const response = ajv.compile(
    JSON.parse(await readFile("contracts/response.schema.json")),
  );
  const kernel = new Kernel();
  const p = JSON.parse(await readFile("fixtures/models/B02.json"));
  let revision = null;
  for (const [operation, payload] of [
    ["capabilities", {}],
    ["createProject", { project: p }],
    ["getSnapshot", {}],
    ["analyse", { caseIds: ["LC1"] }],
    [
      "applyCommand",
      {
        command: {
          type: "SetNodePosition",
          args: { id: "n2", position: [0, 0, 0] },
        },
      },
    ],
  ]) {
    const r = {
      protocolVersion: 1,
      requestId: "contract-test",
      operation,
      expectedRevision: revision,
      payload,
    };
    assert.ok(request(r), JSON.stringify(request.errors));
    const out = JSON.parse(kernel.request(JSON.stringify(r)));
    assert.ok(response(out), JSON.stringify(response.errors));
    revision = out.revision;
  }
  kernel.free();
});
