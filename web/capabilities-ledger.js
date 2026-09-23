/** Analysis capability ledger helpers — disclosures stay honest about UNKNOWN parity. */

export const EXCLUDED_DOMAINS = [
  "shells",
  "solids",
  "arbitrary CAD solids",
  "plasticity",
  "second-order response",
  "cable/tension-only members",
  "soil contact",
  "code-generated wind/seismic loads",
  "code-certified member sizing",
  "connections",
  "reinforcement detailing",
  "DWG/native PROKON formats",
  "Revit plugins",
  "live collaboration",
  "mobile CAD editing",
];

let cached = null;

export async function loadCapabilitiesLedger() {
  if (cached) return cached;
  const res = await fetch("./capabilities.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`capabilities.json HTTP ${res.status}`);
  cached = await res.json();
  return cached;
}

export function domainDisclosureFromLedger(ledger) {
  return {
    comparisonStatus: ledger.comparisonStatus || "UNKNOWN",
    comparisonNote:
      ledger.comparisonNote ||
      "Numerical parity with commercial solvers is UNKNOWN.",
    supportedSummary: ledger.supportedDomain?.summary || "",
    excludedDomains: ledger.excludedDomains?.length
      ? ledger.excludedDomains
      : EXCLUDED_DOMAINS,
    limits: ledger.supportedDomain?.limits || null,
  };
}

export function renderCapabilitiesModalHtml(ledger, esc) {
  const disclosure = domainDisclosureFromLedger(ledger);
  const rows = (ledger.capabilities || [])
    .map((c) => {
      const parity = c.comparisonStatus || disclosure.comparisonStatus;
      return `<tr data-testid="capability-row" data-capability-id="${esc(c.capabilityId)}">
        <th scope="row">${esc(c.capabilityId)}</th>
        <td>${esc(c.implementationStatus)}</td>
        <td>${esc(c.verificationStatus)}</td>
        <td data-testid="comparison-status">${esc(parity)}</td>
        <td>${esc((c.limitations || []).join("; ") || "—")}</td>
      </tr>`;
    })
    .join("");
  const excluded = disclosure.excludedDomains
    .map((d) => `<li>${esc(d)}</li>`)
    .join("");
  const limits = disclosure.limits
    ? `<p data-testid="capability-limits">Acceptance targets: ${esc(String(disclosure.limits.nodes))} nodes · ${esc(String(disclosure.limits.members))} members · ${esc(String(disclosure.limits.cases))} cases · ${esc(String(disclosure.limits.combinations))} combinations · ${esc(String(disclosure.limits.activeDofs))} active DOFs · ${esc(String(disclosure.limits.memoryMiB))} MiB memory guard.</p>`
    : "";
  return `<p data-testid="capability-summary">${esc(disclosure.supportedSummary)}</p>
<p class="notice-small" data-testid="parity-unknown">${esc(disclosure.comparisonNote)}</p>
${limits}
<h3>Capability ledger</h3>
<div class="entity-table-wrap"><table data-testid="capability-ledger">
<thead><tr><th scope="col">Capability</th><th scope="col">Implementation</th><th scope="col">Verification</th><th scope="col">Parity</th><th scope="col">Limitations</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<h3>Excluded from analysis MVP</h3>
<ul class="scope-list" data-testid="excluded-domains">${excluded}</ul>
<p>Elastic stress values do not establish member stability or code compliance. Code checks apply only where an enabled profile explicitly supports the section, actions and assumptions.</p>
<p>Viewport: click to select, Shift-click to toggle, drag blank space to box-select, middle-drag or Space to pan, wheel to zoom towards the pointer. In 3D, Alt-drag or the Orbit tool to orbit. Right-click for context actions. Home fits the model. Engineering edits use Apply changes and support undo/redo.</p>
<p>Projects stay in this browser's IndexedDB. Download a project for a portable backup. Reports require a current successful analysis.</p>`;
}

export function importDisclosureMessage(disclosure) {
  const excluded = (disclosure.excludedDomains || EXCLUDED_DOMAINS)
    .slice(0, 6)
    .join("; ");
  const more =
    (disclosure.excludedDomains || EXCLUDED_DOMAINS).length > 6 ? "; …" : "";
  return `Supported domain: linear elastic frame analysis only. Commercial numerical parity: ${disclosure.comparisonStatus || "UNKNOWN"}. Excluded (not imported/converted): ${excluded}${more}. See View capabilities for the full ledger.`;
}

export function reportExcludedSection(esc) {
  const items = EXCLUDED_DOMAINS.map((d) => `<li>${esc(d)}</li>`).join("");
  return `<h2>Excluded capabilities</h2><p>These domains are outside the analysis MVP and are not claimed by this calculation record. Commercial numerical parity is UNKNOWN.</p><ul>${items}</ul>`;
}
