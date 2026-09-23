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
    "second-order response",
    "code-certified member sizing",
    "DWG/native PROKON formats",
  ]) {
    assert.ok(
      ledger.excludedDomains.includes(domain),
      `missing exclusion: ${domain}`,
    );
  }
  assert.ok(ledger.capabilities.some((c) => c.capabilityId === "elastic-stress-screen"));
  assert.ok(
    ledger.capabilities.every(
      (c) => (c.comparisonStatus || ledger.comparisonStatus) === "UNKNOWN",
    ),
  );
  const steel = ledger.capabilities.find((c) => c.capabilityId === "steel-code");
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
