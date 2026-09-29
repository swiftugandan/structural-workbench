/**
 * Comparative study report (M22). Carries the study document verbatim and
 * its replay identity (study digest, base model hash, solver build) so the
 * same study on the same model reproduces every hash and value. No script.
 */
import { entityLabel } from "../entity-labels.js";
import { escape } from "./report.js";

export function studyReport(project, study, report) {
  const e = escape;
  const first = report.variants[0]?.observed?.value;
  const rows = report.variants
    .map((v) => {
      const value = v.observed?.value;
      return `<tr><th>${e(v.variantId)}</th><td>${v.steps}</td>${
        value == null
          ? "<td>—</td><td>—</td>"
          : `<td data-si="${value}">${e(Number(value.toPrecision(10)))}</td><td>${first ? e(Number((value / first).toPrecision(6))) : "—"}</td>`
      }<td><code>${e(v.modelHash)}</code></td><td><code>${e(v.resultId)}</code></td><td><code>${e(v.settingsHash)}</code></td></tr>`;
    })
    .join("");
  const obs = report.variants[0]?.observed;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${e(report.studyId || "study")} — study report</title><style>body{font:15px system-ui;color:#182d43;max-width:1100px;margin:50px auto;padding:24px}h1{font-size:30px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;border-bottom:1px solid #ddd;padding:8px;vertical-align:top}th:first-child,td:first-child{text-align:left}code{font-size:11px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:20px;font-size:12px}.banner{padding:20px;background:#fff3d6}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}</style>
<header><p>STRUCTURAL WORKBENCH / STUDY REPORT</p><h1>${e(report.studyName || report.studyId || "Study")}</h1><p>${e(project?.name || "")} · linear static · case ${e(report.caseId)} · ${report.variantCount} variant(s) · SI units</p><small>Study digest: <code data-testid="study-digest">${e(report.studyDigest)}</code><br>Base model SHA-256: <code>${e(report.baseModelHash)}</code><br>Solver source: <code>${e(report.solverBuildHash)}</code><br>Created ${e(new Date().toISOString())}</small></header>
<p class="banner">Each variant is the base model with the listed JSON-pointer steps, validated and analysed by the same Rust kernel as a manual edit. Replaying this study document on a model with the same base hash and solver build reproduces every hash and value. Linear elastic mechanics only; no code check is implied.</p>
<h2>Comparison</h2><p>Observed: ${obs?.nodeId ? `${e(entityLabel(project, obs.nodeId))} ${e(obs.dof)} (${/^r/.test(obs.dof) ? "rad" : "m"})` : "not requested"}.</p>
<table data-testid="study-report-variants"><tr><th>Variant</th><th>Steps</th><th>Observed</th><th>Ratio to first</th><th>Model hash</th><th>Result id</th><th>Settings hash</th></tr>${rows}</table>
<h2>Study document</h2><pre data-testid="study-document">${e(JSON.stringify(study, null, 2))}</pre>
</html>`;
}
