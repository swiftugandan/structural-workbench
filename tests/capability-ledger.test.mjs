import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EXCLUDED_DOMAINS,
  domainDisclosureFromLedger,
  importDisclosureMessage,
  reportExcludedSection,
} from "../web/capabilities-ledger.js";

test("capabilities.json publishes UNKNOWN parity and SPEC exclusions", async () => {
  const ledger = JSON.parse(await readFile("capabilities.json", "utf8"));
  assert.equal(ledger.comparisonStatus, "UNKNOWN");
  assert.ok(Array.isArray(ledger.excludedDomains));
  for (const domain of [
    "shells",
    "solids",
    "plasticity",
    "geometrically nonlinear (large-displacement) response",
    "torsional and lateral-torsional instability",
    "response spectrum, time-history and harmonic analysis",
    "code-certified member sizing",
    "DWG/proprietary commercial formats",
  ]) {
    assert.ok(
      ledger.excludedDomains.includes(domain),
      `missing exclusion: ${domain}`,
    );
  }
  assert.ok(
    ledger.capabilities.some((c) => c.capabilityId === "elastic-stress-screen"),
  );
  assert.ok(
    ledger.capabilities.every(
      (c) => (c.comparisonStatus || ledger.comparisonStatus) === "UNKNOWN",
    ),
  );
  // stability-v1 is accepted by the M09 parent gate and keeps its
  // flexural-only and not-a-resistance limitations.
  for (const id of ["elastic-buckling", "second-order-p-delta"]) {
    const row = ledger.capabilities.find((c) => c.capabilityId === id);
    assert.equal(row.implementationStatus, "implemented", id);
    assert.equal(row.verificationStatus, "parent-gate-pass", id);
    assert.ok(
      row.evidenceReferences.includes("evidence/M09/full/gate-M09.json"),
      id,
    );
    assert.ok(
      row.limitations.some((l) => /Flexural instability only/.test(l)),
      id,
    );
  }
  assert.ok(
    ledger.capabilities
      .find((c) => c.capabilityId === "elastic-buckling")
      .limitations.some((l) => /not a member resistance/.test(l)),
  );
  assert.deepEqual(ledger.supportedDomain.analysisTypes, [
    "linearStatic",
    "elasticBuckling",
    "secondOrder",
    "modal",
  ]);
  // dynamics-v1 is accepted by the M14 parent gate and keeps its limitations.
  const modal = ledger.capabilities.find((c) => c.capabilityId === "modal-analysis");
  assert.equal(modal.implementationStatus, "implemented");
  assert.equal(modal.verificationStatus, "parent-gate-pass");
  assert.ok(modal.evidenceReferences.includes("evidence/M14/full/gate-M14.json"));
  assert.ok(modal.limitations.some((l) => /not a floor-vibration/.test(l)));
  const steel = ledger.capabilities.find(
    (c) => c.capabilityId === "steel-code",
  );
  assert.equal(steel.implementationStatus, "partial");
  assert.equal(steel.verificationStatus, "fixture-pass");
  assert.deepEqual(steel.resourceBlockers, []);
});

test("ledger helpers render disclosures without inventing parity", () => {
  const ledger = {
    comparisonStatus: "UNKNOWN",
    comparisonNote: "Numerical parity is UNKNOWN.",
    supportedDomain: { summary: "Linear frames.", limits: { nodes: 5000 } },
    excludedDomains: EXCLUDED_DOMAINS,
    capabilities: [
      {
        capabilityId: "linear-frame",
        implementationStatus: "implemented",
        verificationStatus: "pass",
        comparisonStatus: "UNKNOWN",
        limitations: [],
      },
    ],
  };
  const d = domainDisclosureFromLedger(ledger);
  assert.equal(d.comparisonStatus, "UNKNOWN");
  const msg = importDisclosureMessage(d);
  assert.match(msg, /UNKNOWN/);
  assert.match(msg, /Excluded/);
  const html = reportExcludedSection((s) => s);
  assert.match(html, /Excluded capabilities/);
  assert.match(html, /shells/);
});
