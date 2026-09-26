import { escape as esc } from "./reports/report.js";
import { entityLabel } from "./entity-labels.js";

/** UI orchestration only. Readiness, checks and utilisation are Rust outputs. */
export function steelOverview({
  gateway,
  context,
  onRuns,
  onRunning,
  onError,
  onSelect,
  download,
}) {
  let review = null,
    filter = "all",
    threshold = "",
    running = false;
  const stale = () =>
    review &&
    (context().dirty ||
      context().failed ||
      review.modelHash !== context().modelHash ||
      review.resultId !== context().result?.resultId);
  function render(host) {
    if (!context().active) return;
    const c = context(),
      isStale = stale();
    const rows = (c.project?.members || []).map((m) => {
      const row = review?.rows.find((r) => r.memberId === m.id);
      return {
        memberId: m.id,
        ...row,
        state: row ? (isStale ? "stale" : row.status) : "notChecked",
      };
    });
    const selectedRows = rows.filter(
      (r) =>
        (filter === "all" || r.state === filter) &&
        (threshold === "" ||
          (r.utilisation != null && r.utilisation >= Number(threshold))),
    );
    const allowed =
      !running &&
      !c.locked &&
      !c.dirty &&
      !c.failed &&
      c.result?.modelHash === c.modelHash &&
      c.result?.analysisType !== "envelope";
    const text = (s) => (s === "notChecked" ? "NOT CHECKED" : s.toUpperCase());
    host.innerHTML = `<section class="steel-overview" data-testid="steel-overview"><header><div><h3>Model steel review</h3><p>All ${rows.length} analytical members · ${esc(c.result?.caseId || "analysis required")} · AISC 360-22 LRFD, bounded S2</p></div><button id="steel-review-run" class="primary" ${allowed ? "" : "disabled"}>${running ? "Reviewing…" : "Review all members"}</button><button id="steel-review-download" ${review ? "" : "disabled"}>Download review</button></header><p class="notice-small">${isStale ? "STALE — the recorded model or result has changed. " : ""}Only the selected case is checked. Unready members stay NOT CHECKED; this is not a whole-building compliance result.</p><div class="steel-review-filters"><label>Status <select id="steel-review-filter">${["all", "fail", "unsupported", "indeterminate", "stale", "notChecked", "pass"].map((s) => `<option value="${s}" ${s === filter ? "selected" : ""}>${s === "all" ? "All members" : text(s)}</option>`).join("")}</select></label><label>Minimum utilisation <input id="steel-review-threshold" type="number" min="0" step="any" value="${esc(threshold)}" placeholder="Any"></label><span role="status">${selectedRows.length} of ${rows.length} members</span></div><table><thead><tr><th>Member</th><th>Section</th><th>Status</th><th>Utilisation</th><th>Governing check / readiness</th></tr></thead><tbody>${selectedRows
      .map((r) => {
        const m = c.project.members.find((m) => m.id === r.memberId),
          section = c.project.sections.find((s) => s.id === m.section);
        const reasons = r.readiness
          ? [...r.readiness.missing, ...r.readiness.unsupported].join("; ")
          : "Run the review to inspect saved inputs";
        return `<tr data-review-member="${esc(r.memberId)}" aria-selected="${c.memberId === r.memberId}"><th><button data-review-select="${esc(r.memberId)}">${esc(entityLabel(c.project, r.memberId))}</button></th><td>${esc(section?.name || m.section)}</td><td><span class="badge ${esc(r.state)}">${text(r.state)}</span></td><td>${r.utilisation == null ? "—" : r.utilisation.toFixed(3)}</td><td>${esc(r.run?.governingAction ? `${r.run.governingAction.checkId} · ${r.run.governingAction.clause} · x/L ${r.run.governingAction.station}` : reasons)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table>${selectedRows.length ? "" : "<p>No members match these filters.</p>"}${review ? `<details><summary>Exact review provenance</summary><p>Model ${esc(review.modelHash)}<br>Result ${esc(review.resultId)}<br>Review ${esc(review.reviewId)}</p></details>` : ""}</section>`;
    host.querySelector("#steel-review-filter").onchange = (e) => {
      filter = e.target.value;
      render(host);
      host.querySelector("#steel-review-filter").focus();
    };
    host.querySelector("#steel-review-threshold").onchange = (e) => {
      threshold = e.target.value;
      render(host);
      host.querySelector("#steel-review-threshold").focus();
    };
    for (const b of host.querySelectorAll("[data-review-select]"))
      b.onclick = () => onSelect(b.dataset.reviewSelect);
    host.querySelector("#steel-review-download").onclick = () =>
      download(
        "steel-review.json",
        JSON.stringify(
          { ...review, currentState: isStale ? "stale" : "current" },
          null,
          2,
        ),
        "application/json",
      );
    host.querySelector("#steel-review-run").onclick = async () => {
      const now = context();
      if (
        !allowed ||
        now.locked ||
        now.dirty ||
        now.failed ||
        now.modelHash !== c.modelHash ||
        now.result?.resultId !== c.result?.resultId
      )
        return;
      running = true;
      onRunning(true);
      render(host);
      try {
        const report = await gateway.send("evaluateSteelOverview", {
          modelHash: c.modelHash,
          resultId: c.result.resultId,
          caseId: c.result.caseId,
        });
        if (
          context().modelHash !== c.modelHash ||
          context().result?.resultId !== c.result.resultId
        )
          throw Error("Model or analysis changed during review");
        review = report;
        onRuns(report.rows.flatMap((r) => (r.run ? [r.run] : [])));
      } catch (e) {
        onError(e.message);
      } finally {
        running = false;
        onRunning(false);
        render(host);
      }
    };
  }
  return {
    render,
    reset() {
      review = null;
      filter = "all";
      threshold = "";
    },
  };
}
