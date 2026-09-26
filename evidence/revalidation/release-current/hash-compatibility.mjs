import fs from 'node:fs';
import assert from 'node:assert/strict';
import init, { Kernel } from '../../../dist/pkg/workbench_wasm_api.js';
import { record } from '../../../tools/evidence.mjs';
await init({ module_or_path: fs.readFileSync('dist/pkg/workbench_wasm_api_bg.wasm') });
const baseline = JSON.parse(fs.readFileSync(new URL('./engineering-hash-baseline.json', import.meta.url)));
for (const [name, expected] of Object.entries(baseline.hashes)) {
  const kernel = new Kernel();
  const response = JSON.parse(kernel.request(JSON.stringify({ protocolVersion: 1, requestId: 'hash-compatibility', operation: 'createProject', expectedRevision: null, payload: { project: JSON.parse(fs.readFileSync('fixtures/models/' + name)) } })));
  assert.deepEqual({ status: response.status, modelHash: response.modelHash }, expected, name);
  kernel.free();
}
await record('hash-compatibility', {
  status: 'PASS', testCount: Object.keys(baseline.hashes).length, testIds: Object.keys(baseline.hashes),
  command: ['node', 'evidence/revalidation/release-current/hash-compatibility.mjs'],
  artifacts: ['hash-compatibility.mjs', 'engineering-hash-baseline.json'], baselineBuildHash: baseline.build.buildHash,
});
console.log('All 18 fixture engineering hashes match the pre-optimization build.');
