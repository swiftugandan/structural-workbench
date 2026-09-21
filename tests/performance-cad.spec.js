import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { frame } from "./helpers/frame.js";
import { evidenceDir, record } from "../tools/evidence.mjs";
const p95 = (values) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
test("M01 CAD capacity: 1000-member editing, 10000-member import picking orbit and export", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto("/");
  const base = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
  const large = frame(base);
  await mkdir(evidenceDir(), { recursive: true });
  await writeFile(
    `${evidenceDir()}/capacity-model.json`,
    JSON.stringify(large),
  );
  const start = Date.now();
  await page.locator("#import-file").setInputFiles({
    name: "capacity.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(large)),
  });
  await expect(page.locator("#model-count")).toHaveText(
    "5000 nodes · 10000 members",
    { timeout: 30000 },
  );
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const importMs = Date.now() - start;
  const gpu = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    return {
      vendor: a.info.vendor,
      device: a.info.device,
      architecture: a.info.architecture,
      description: a.info.description,
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent,
    };
  });
  await page.locator("#view-3d").click();
  const box = await page.locator("#viewport").boundingBox();
  // Sample genuine requestAnimationFrame intervals while repeated pointer gestures
  // orbit the real viewport. No model/results are injected into the application.
  const orbitStart = Date.now();
  const frameTimes = page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let previous = performance.now(),
          start = previous;
        function tick(now) {
          times.push(now - previous);
          previous = now;
          if (now - start < 60000) requestAnimationFrame(tick);
          else resolve(times.slice(1));
        }
        requestAnimationFrame(tick);
      }),
  );
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: "right" });
  while (Date.now() - orbitStart < 60500) {
    const t = (Date.now() - orbitStart) * 0.002;
    await page.mouse.move(
      box.x + box.width * 0.5 + Math.sin(t) * 100,
      box.y + box.height * 0.5 + Math.cos(t) * 40,
    );
  }
  await page.mouse.up({ button: "right" });
  const intervals = await frameTimes;
  // Picking has a separate kernel round-trip probe against an actual WASM instance.
  // This isolates kernel latency from Playwright polling, and does not mock data.
  const kernelTimes = await page.evaluate(async (p) => {
    const api = await import("/pkg/workbench_wasm_api.js");
    await api.default();
    const k = new api.Kernel();
    let rev = 0;
    const req = (operation, payload) => {
      const r = JSON.parse(
        k.request(
          JSON.stringify({
            protocolVersion: 1,
            requestId: "capacity",
            expectedRevision: rev,
            operation,
            payload,
          }),
        ),
      );
      if (r.status !== "ok") throw Error(JSON.stringify(r));
      rev = r.revision;
      return r;
    };
    req("createProject", { project: p });
    const camera = {
      origin: [40, 48, 13.5],
      basis: [
        [1, 0, 0],
        [0, 0, 1],
        [0, -1, 0],
      ],
      center: [450, 200],
      factor: 5,
    };
    const pick = [],
      snaps = [];
    for (let i = 0; i < 101; i++) {
      let t = performance.now();
      req("queryGeometry", {
        kind: "screenPick",
        query: { camera, point: [450 + (i % 10), 200] },
        viewRevision: 0,
      });
      if (i) pick.push(performance.now() - t);
      t = performance.now();
      req("queryGeometry", {
        kind: "snap",
        query: {
          position: [(i % 20) * 4, 0, 3],
          plane: "XZ",
          features: true,
          grid: 0.5,
          tolerance: 0.1,
        },
        viewRevision: 0,
      });
      if (i) snaps.push(performance.now() - t);
    }
    k.free();
    return { pick, snaps };
  }, large);
  const exportStart = Date.now(),
    download = page.waitForEvent("download");
  await page.locator("#export-project").click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file, "utf8"));
  const exportMs = Date.now() - exportStart;
  expect(exported.members).toHaveLength(10000);
  const small = frame(base, 1000);
  const editTimes = await page.evaluate(async (p) => {
    const api = await import("/pkg/workbench_wasm_api.js");
    await api.default();
    const worker = new Worker("/worker.js", { type: "module" });
    await new Promise(
      (resolve) =>
        (worker.onmessage = (e) => {
          if (e.data.ready) resolve();
        }),
    );
    let revision = null,
      counter = 0;
    const send = (operation, payload) =>
      new Promise((resolve, reject) => {
        const requestId = `perf${++counter}`;
        worker.onmessage = (e) => {
          if (e.data.requestId !== requestId) return;
          if (e.data.status !== "ok")
            return reject(Error(JSON.stringify(e.data)));
          revision = e.data.revision;
          resolve(e.data);
        };
        worker.postMessage({
          protocolVersion: 1,
          requestId,
          operation,
          expectedRevision: revision,
          payload,
        });
      });
    await send("createProject", { project: p });
    const times = [];
    for (let i = 0; i < 6; i++) {
      const start = performance.now();
      await send("applyCommand", {
        command: {
          id: `edit${i}`,
          type: "MoveNodes",
          args: { ids: [p.nodes.at(-1).id], delta: [0.01, 0, 0] },
        },
      });
      if (i) times.push(performance.now() - start);
    }
    worker.terminate();
    return times;
  }, small);
  const metrics = {
    importMs,
    exportMs,
    editP95: p95(editTimes),
    pickP95: p95(kernelTimes.pick),
    snapP95: p95(kernelTimes.snaps),
    orbitP95: p95(intervals),
    longestFrame: Math.max(...intervals),
  };
  const software = /swiftshader|software|llvmpipe/i.test(JSON.stringify(gpu));
  await record("m01-capacity", {
    status:
      metrics.editP95 <= 100 &&
      metrics.pickP95 <= 100 &&
      metrics.snapP95 <= 100 &&
      importMs <= 3000 &&
      exportMs <= 3000 &&
      (software || (metrics.orbitP95 <= 33 && metrics.longestFrame <= 250))
        ? "PASS"
        : "FAIL",
    testCount: 5,
    testIds: [
      "M01-import-5000-10000",
      "M01-export-10000",
      "M01-edit-1000",
      "M01-pick-10000",
      "M01-orbit-10000-60s",
    ],
    command: ["npx", "playwright", "test", "tests/performance-cad.spec.js"],
    gpu,
    softwareGpu: software,
    metrics,
    samples: {
      editTimes,
      picks: kernelTimes.pick,
      snaps: kernelTimes.snaps,
      frameTimes: intervals,
    },
    thresholds: {
      importMs: 3000,
      exportMs: 3000,
      editP95: 100,
      pickP95: 100,
      orbitP95: 33,
      longestFrame: 250,
    },
    limitations: software
      ? "Software GPU correctness and measurements; does not satisfy hardware performance acceptance."
      : "Actual runner measurements; required platform identity must also pass.",
  });
  expect(metrics.editP95).toBeLessThanOrEqual(100);
  expect(metrics.pickP95).toBeLessThanOrEqual(100);
  expect(metrics.snapP95).toBeLessThanOrEqual(100);
  expect(importMs).toBeLessThanOrEqual(3000);
  expect(exportMs).toBeLessThanOrEqual(3000);
  if (!software) {
    expect(metrics.orbitP95).toBeLessThanOrEqual(33);
    expect(metrics.longestFrame).toBeLessThanOrEqual(250);
  }
});
