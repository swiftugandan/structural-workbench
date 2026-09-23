/**
 * WASM MEMORY_LIMIT smoke: over-contract entity count must refuse in-browser.
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { record } from "../../../tools/evidence.mjs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { readFileSync } from "node:fs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/full";
process.env.WORKBENCH_TASK_ID ||= "M03-parent";
process.env.WORKBENCH_MILESTONE ||= "M03";

const dir = process.env.WORKBENCH_EVIDENCE_DIR;
await mkdir(dir, { recursive: true });

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
};
const server = createServer((req, res) => {
  const path = join(
    "dist",
    decodeURIComponent(req.url.split("?")[0].slice(1) || "index.html"),
  );
  try {
    const body = readFileSync(path);
    res.writeHead(200, {
      "content-type": mime[extname(path)] || "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("missing");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const base = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
base.nodes = Array.from({ length: 5001 }, (_, i) => ({
  id: `n${i}`,
  position: [i * 0.001, 0, 0],
}));
base.members = [{ ...base.members[0], start: "n0", end: "n1" }];
base.supports = [{ ...base.supports[0], node: "n0" }];
base.loads = [{ ...base.loads[0], node: "n1" }];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/app.html`);

const outcome = await page.evaluate(async (project) => {
  const wasm = await import("./pkg/workbench_wasm_api.js");
  await wasm.default();
  const k = new wasm.Kernel();
  const res = JSON.parse(
    k.request(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "m03-wasm-memory",
        operation: "importProject",
        payload: { jsonUtf8: JSON.stringify(project), replaceCurrent: true },
      }),
    ),
  );
  return {
    status: res.status,
    codes: (res.diagnostics || []).map((d) => d.code),
    message: (res.diagnostics || []).map((d) => d.message).join("; "),
  };
}, base);

await browser.close();
server.close();

assert.equal(outcome.status, "error", "over-contract import must error");
assert.ok(
  outcome.codes.includes("MEMORY_LIMIT"),
  `expected MEMORY_LIMIT, got ${JSON.stringify(outcome)}`,
);

await writeFile(
  `${dir}/wasm-memory-result.json`,
  JSON.stringify(outcome, null, 2),
);
await record("m03-wasm-memory", {
  status: "PASS",
  testCount: 1,
  testIds: ["M03-WASM-MEMORY-LIMIT"],
  command: ["node", "evidence/M03/capacity/wasm-memory.mjs"],
  artifacts: ["wasm-memory-result.json"],
  message: outcome.message,
});
console.log(
  JSON.stringify(
    { status: "PASS", codes: outcome.codes, message: outcome.message },
    null,
    2,
  ),
);
