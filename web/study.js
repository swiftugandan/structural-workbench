/**
 * Declarative study workspace (M22): runs a study document on the analysis
 * Worker against the open project, shows the comparison or the located
 * failure, and exports a reproducible report. The open project is never
 * mutated; every number and hash comes from the Rust kernel.
 */
import { escape as esc } from "./reports/report.js";
import { studyReport } from "./reports/study.js";

const short = (h) => `${String(h || "").slice(0, 12)}…`;

export function studyWorkspace({
  gateway,
  getContext,
  onRunning,
  message,
  download,
  show,
}) {
  /** { study, report? , failure? } of the last completed run. */
  let last = null;

  function render(host) {
    const ctx = getContext();
    if (!last) return;
    if (last.failure) {
      const at = last.failure.location;
      host.innerHTML = `<div role="alert" data-testid="study-failure"${at ? ` data-variant="${esc(at.variantId)}" data-stage="${esc(at.stage)}"${at.stepIndex != null ? ` data-step="${at.stepIndex + 1}"` : ""}` : ""}><strong>Study ${esc(last.study.id || "")} stopped · ${esc(last.failure.code)}</strong><p>${esc(last.failure.message)}</p><p class="notice-small">No variant results are reported. The open project was not changed.</p></div>`;
      return;
    }
    const r = last.report;
    const first = r.variants[0]?.observed?.value;
    const eng = ctx.project?.displayUnits === "engineeringMetric";
    const dof = r.variants[0]?.observed?.dof || "";
    const rotation = /^r/.test(dof);
    const value = (v) =>
      v == null
        ? "—"
        : rotation
          ? `${Number(v.toPrecision(6))} rad`
          : eng
            ? `${Number((v * 1000).toPrecision(6))} mm`
            : `${Number(v.toPrecision(6))} m`;
    const rows = r.variants
      .map(
        (v) =>
          `<tr><th scope="row">${esc(v.variantId)}</th><td>${v.steps}</td><td data-si="${v.observed?.value ?? ""}" data-testid="study-observed">${value(v.observed?.value)}</td><td>${first && v.observed?.value != null ? Number((v.observed.value / first).toPrecision(5)) : "—"}</td><td title="${esc(v.modelHash)}" data-testid="study-model-hash" data-hash="${esc(v.modelHash)}"><code>${short(v.modelHash)}</code></td><td title="${esc(v.resultId)}"><code>${short(v.resultId)}</code></td></tr>`,
      )
      .join("");
    const observed = r.variants[0]?.observed?.nodeId
      ? `${esc(ctx.label(r.variants[0].observed.nodeId))} ${esc(dof)}`
      : "not requested";
    host.innerHTML = `<p class="notice-small" data-testid="study-report-banner">Declarative study comparison (M22). Every variant was validated and analysed by the Rust kernel like a manual edit; the open project was not changed.</p>
<p class="notice-small">${esc(r.studyName || r.studyId || "")} · ${r.variantCount} variant(s) · case ${esc(r.caseId)} · observed ${observed} · study digest <code title="${esc(r.studyDigest)}">${short(r.studyDigest)}</code> · base model <code title="${esc(r.baseModelHash)}">${short(r.baseModelHash)}</code>${r.baseModelHash === ctx.modelHash ? "" : ' · <strong data-testid="study-stale">the open model has changed since this run</strong>'}</p>
<table data-testid="study-report-table"><thead><tr><th scope="col">Variant</th><th scope="col">Steps</th><th scope="col">Observed</th><th scope="col">Ratio to first</th><th scope="col">Model hash</th><th scope="col">Result id</th></tr></thead><tbody>${rows}</tbody></table>
<p><button type="button" id="download-study-report" class="primary">Download study HTML</button></p>`;
    host.querySelector("#download-study-report").onclick = () =>
      download(
        `${r.studyId || "study"}-report.html`,
        studyReport(ctx.project, last.study, r),
        "text/html",
      );
  }

  async function run(study) {
    onRunning(true);
    message(`Running study ${study.id || ""}…`);
    try {
      const report = await gateway.send("runStudy", { study });
      last = { study, report };
      message(
        `Study ${report.studyId || ""} finished · ${report.variantCount} variants`,
      );
    } catch (e) {
      if (/CANCELLED|TIMEOUT/.test(e.message)) {
        last = null;
        message(
          `${/TIMEOUT/.test(e.message) ? "Study exceeded the project's analysis time limit" : "Study cancelled"}; no results were kept and the open project is unchanged.`,
        );
        return;
      }
      const d = e.diagnostics?.[0] || {};
      last = {
        study,
        failure: {
          code: d.code || e.message.split(":")[0],
          message: d.message || e.message,
          location: d.details?.studyLocation || null,
        },
      };
      message(`Study ${study.id || ""} stopped: ${d.code || e.message}`);
    } finally {
      onRunning(false);
    }
    show();
  }

  return { run, render, has: () => !!last };
}
