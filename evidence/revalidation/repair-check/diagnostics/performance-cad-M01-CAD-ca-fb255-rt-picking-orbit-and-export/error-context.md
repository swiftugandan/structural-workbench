# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: performance-cad.spec.js >> M01 CAD capacity: 1000-member editing, 10000-member import picking orbit and export
- Location: tests/performance-cad.spec.js:11:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 100
Received:    216
```

# Test source

```ts
  154 |         }),
  155 |     );
  156 |     let revision = null,
  157 |       counter = 0;
  158 |     const send = (operation, payload) =>
  159 |       new Promise((resolve, reject) => {
  160 |         const requestId = `perf${++counter}`;
  161 |         worker.onmessage = (e) => {
  162 |           if (e.data.requestId !== requestId) return;
  163 |           if (e.data.status !== "ok")
  164 |             return reject(Error(JSON.stringify(e.data)));
  165 |           revision = e.data.revision;
  166 |           resolve(e.data);
  167 |         };
  168 |         worker.postMessage({
  169 |           protocolVersion: 1,
  170 |           requestId,
  171 |           operation,
  172 |           expectedRevision: revision,
  173 |           payload,
  174 |         });
  175 |       });
  176 |     await send("createProject", { project: p });
  177 |     const times = [];
  178 |     for (let i = 0; i < 6; i++) {
  179 |       const start = performance.now();
  180 |       await send("applyCommand", {
  181 |         command: {
  182 |           id: `edit${i}`,
  183 |           type: "MoveNodes",
  184 |           args: { ids: [p.nodes.at(-1).id], delta: [0.01, 0, 0] },
  185 |         },
  186 |       });
  187 |       if (i) times.push(performance.now() - start);
  188 |     }
  189 |     worker.terminate();
  190 |     return times;
  191 |   }, small);
  192 |   const metrics = {
  193 |     importMs,
  194 |     exportMs,
  195 |     editP95: p95(editTimes),
  196 |     pickP95: p95(kernelTimes.pick),
  197 |     snapP95: p95(kernelTimes.snaps),
  198 |     orbitP95: p95(intervals),
  199 |     longestFrame: Math.max(...intervals),
  200 |   };
  201 |   const software = /swiftshader|software|llvmpipe/i.test(JSON.stringify(gpu));
  202 |   const { hardwareThresholds } = await import("../tools/lab-runner.mjs");
  203 |   const thresholds = software
  204 |     ? {
  205 |         importMs: 3000,
  206 |         exportMs: 3000,
  207 |         editP95: 100,
  208 |         pickP95: 100,
  209 |         snapP95: 100,
  210 |         orbitP95: 33,
  211 |         longestFrame: 250,
  212 |         labPinned: false,
  213 |       }
  214 |     : await hardwareThresholds(gpu);
  215 |   const orbitOk =
  216 |     software ||
  217 |     (metrics.orbitP95 <= thresholds.orbitP95 &&
  218 |       metrics.longestFrame <= thresholds.longestFrame);
  219 |   await record("m01-capacity", {
  220 |     status:
  221 |       metrics.editP95 <= thresholds.editP95 &&
  222 |       metrics.pickP95 <= thresholds.pickP95 &&
  223 |       metrics.snapP95 <= thresholds.snapP95 &&
  224 |       importMs <= thresholds.importMs &&
  225 |       exportMs <= thresholds.exportMs &&
  226 |       orbitOk
  227 |         ? "PASS"
  228 |         : "FAIL",
  229 |     testCount: 5,
  230 |     testIds: [
  231 |       "M01-import-5000-10000",
  232 |       "M01-export-10000",
  233 |       "M01-edit-1000",
  234 |       "M01-pick-10000",
  235 |       "M01-orbit-10000-60s",
  236 |     ],
  237 |     command: ["npx", "playwright", "test", "tests/performance-cad.spec.js"],
  238 |     gpu,
  239 |     softwareGpu: software,
  240 |     metrics,
  241 |     samples: {
  242 |       editTimes,
  243 |       picks: kernelTimes.pick,
  244 |       snaps: kernelTimes.snaps,
  245 |       frameTimes: intervals,
  246 |     },
  247 |     thresholds,
  248 |     limitations: software
  249 |       ? "Software GPU correctness and measurements; does not satisfy hardware performance acceptance."
  250 |       : thresholds.labPinned
  251 |         ? `Lab-pinned hardware thresholds (${thresholds.labRunnerId}); not reference-class 33ms equivalence.`
  252 |         : "Actual runner measurements; required platform identity must also pass.",
  253 |   });
> 254 |   expect(metrics.editP95).toBeLessThanOrEqual(thresholds.editP95);
      |                           ^ Error: expect(received).toBeLessThanOrEqual(expected)
  255 |   expect(metrics.pickP95).toBeLessThanOrEqual(thresholds.pickP95);
  256 |   expect(metrics.snapP95).toBeLessThanOrEqual(thresholds.snapP95);
  257 |   expect(importMs).toBeLessThanOrEqual(thresholds.importMs);
  258 |   expect(exportMs).toBeLessThanOrEqual(thresholds.exportMs);
  259 |   if (!software) {
  260 |     expect(metrics.orbitP95).toBeLessThanOrEqual(thresholds.orbitP95);
  261 |     expect(metrics.longestFrame).toBeLessThanOrEqual(thresholds.longestFrame);
  262 |   }
  263 | });
  264 | 
```