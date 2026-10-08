/**
 * The results dock (ADR 0033): status badge, export availability and the
 * active tab's view — analysis tables, stability, modal, response, studies,
 * design-object and member-design results. Rendering only; Rust owns values.
 */
export function resultsDock({
  $,
  bindSteelResultViews,
  concrete,
  designResultsHtml,
  designState,
  download,
  esc,
  label,
  memberDesignRuns,
  modalView,
  overview,
  responseView,
  selectEntities,
  stability,
  state,
  studies,
  viewport,
}) {
  function format(n) {
    return Number.isFinite(n)
      ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 6 }).format(
          Object.is(n, -0) ? 0 : n,
        )
      : "—";
  }
  function renderResults() {
    overview.syncOverlay();
    const current =
      state.result &&
      state.result.modelHash === state.modelHash &&
      !state.formDirty;
    $("#result-status").textContent = state.failed
      ? "Analysis failed"
      : state.result
        ? current
          ? "✓ Current"
          : "⚠ Stale results"
        : "Not analysed";
    $("#result-status").className =
      "badge " +
      (state.failed
        ? "failed"
        : state.result
          ? current
            ? "current"
            : "stale"
          : "");
    $("#export-report").disabled = !current || state.failed;
    $("#export-csv").disabled = !current || state.failed;
    if (state.tab === "design-preview") {
      $("#export-csv").disabled = true;
      concrete.results($("#results-content"));
      return;
    }
    if (state.tab === "stability") {
      $("#export-csv").disabled = true;
      modalView.hide();
      stability.render($("#results-content"));
      return;
    }
    if (state.tab === "study") {
      $("#export-csv").disabled = true;
      stability.hide();
      modalView.hide();
      if (studies.has()) studies.render($("#results-content"));
      else
        $("#results-content").innerHTML =
          '<p class="notice-small" data-testid="study-empty">No study has run. Load a declarative study document with Analysis › Run study…; it runs on a copy of the open project.</p>';
      return;
    }
    if (state.tab === "modal") {
      $("#export-csv").disabled = true;
      stability.hide();
      modalView.render($("#results-content"));
      return;
    }
    if (state.tab === "response") {
      $("#export-csv").disabled = true;
      stability.hide();
      modalView.hide();
      responseView.render($("#results-content"));
      return;
    }
    if (state.tab === "steel-overview") {
      $("#export-csv").disabled = true;
      overview.render($("#results-content"));
      return;
    }
    if (state.tab === "steel-design") {
      const run =
        viewport.selection.size === 1
          ? memberDesignRuns.get(state.selected)
          : null;
      const state = designState(
        run,
        state.modelHash,
        state.result,
        state.formDirty || state.failed,
      );
      $("#results-content").innerHTML = designResultsHtml(run, state);
      $("#export-csv").disabled = true;
      if (run) {
        bindSteelResultViews($("#results-content"), run);
        $("#design-download").onclick = () =>
          download(
            `design-${run.memberId}.json`,
            JSON.stringify({ ...run, currentState: state }, null, 2),
            "application/json",
          );
        $("#design-why").disabled = state === "stale" || !run.governingAction;
        $("#design-why").onclick = () => {
          selectEntities([run.memberId]);
          viewport.designMarker = {
            ...run.governingAction,
            memberId: run.memberId,
            modelHash: run.modelHash,
          };
          viewport.draw();
        };
      }
      return;
    }
    if (!state.result) {
      $("#results-content").innerHTML =
        `<div class="empty-results"><span>${state.failed ? "!" : "⌁"}</span><strong>${state.failed ? "No numerical result" : "Your results start here"}</strong><p>${state.failed ? "Resolve the diagnostic above, then analyse again." : "Review your model, then run an analysis."}</p></div>`;
      return;
    }
    if (state.result.analysisType === "envelope") {
      const eng = state.project.displayUnits === "engineeringMetric",
        u = eng ? 1000 : 1,
        f = eng ? 0.001 : 1;
      const scale = (component, value) => {
        if (["ux", "uy", "uz"].includes(component)) return value * u;
        if (["rx", "ry", "rz"].includes(component)) return value;
        return value * f;
      };
      const unit = (component) => {
        if (["ux", "uy", "uz"].includes(component)) return eng ? "mm" : "m";
        if (["rx", "ry", "rz"].includes(component)) return "rad";
        if (["mx", "my", "mz", "T", "My", "Mz"].includes(component))
          return eng ? "kN·m" : "N·m";
        return eng ? "kN" : "N";
      };
      const row = (entity, component, extreme, kind) => {
        const where =
          extreme.station != null
            ? ` · x/L=${Number(extreme.station.toPrecision(6))}${extreme.side ? ` ${extreme.side}` : ""}`
            : extreme.nodeId
              ? ` · node ${label(extreme.nodeId)}`
              : extreme.supportId
                ? ` · support ${label(extreme.supportId)}`
                : "";
        return [
          entity,
          component,
          kind,
          format(scale(component, extreme.value)),
          unit(component),
          label(extreme.caseOrCombinationId) + where,
        ];
      };
      const rows = [];
      for (const m of state.result.members || []) {
        for (const a of m.actions || []) {
          rows.push(row(label(m.id), a.component, a.max, "max"));
          rows.push(row(label(m.id), a.component, a.min, "min"));
        }
        for (const d of m.displacements || []) {
          rows.push(row(label(m.id), d.component, d.max, "max"));
          rows.push(row(label(m.id), d.component, d.min, "min"));
        }
      }
      for (const n of state.result.nodes || []) {
        for (const d of n.displacements || []) {
          if (Math.abs(d.max.value) < 1e-15 && Math.abs(d.min.value) < 1e-15)
            continue;
          rows.push(row(label(n.id), d.component, d.max, "max"));
          rows.push(row(label(n.id), d.component, d.min, "min"));
        }
      }
      for (const s of state.result.supports || []) {
        for (const r of s.reactions || []) {
          rows.push(row(label(s.id), r.component, r.max, "max"));
          rows.push(row(label(s.id), r.component, r.min, "min"));
        }
      }
      const ids = (state.result.caseOrCombinationIds || [])
        .map(label)
        .join(", ");
      $("#results-content").innerHTML =
        `<p class="notice-small">Envelope over ${esc(ids)}. Each row is an independent scalar extreme with governing case/combination — not a simultaneous force set.</p>` +
        (state.result.diagnostics || [])
          .map(
            (d) =>
              `<p class="notice-small" role="status">${esc(d.code || "")}: ${esc(d.message || "")}</p>`,
          )
          .join("") +
        `<table><thead><tr>${[
          "Entity",
          "Component",
          "Extreme",
          "Value",
          "Unit",
          "Governing",
        ]
          .map((h) => `<th scope="col">${h}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr>${r.map((v, i) => `<${i ? "td" : "th"}${i ? "" : ' scope="row"'}>${esc(v)}</${i ? "td" : "th"}>`).join("")}</tr>`,
          )
          .join("")}</tbody></table>`;
      return;
    }
    const eng = state.project.displayUnits === "engineeringMetric",
      u = eng ? 1000 : 1,
      f = eng ? 0.001 : 1;
    let heads, rows;
    if (state.tab === "displacements") {
      heads = [
        "Node",
        `ux [${eng ? "mm" : "m"}]`,
        `uy [${eng ? "mm" : "m"}]`,
        `uz [${eng ? "mm" : "m"}]`,
        "rx [rad]",
        "ry [rad]",
        "rz [rad]",
      ];
      rows = state.result.nodeIds.map((id, i) => [
        label(id),
        ...Array.from(
          state.result.nodeDisplacements.slice(i * 6, i * 6 + 6),
          (v, j) => format(v * (j < 3 ? u : 1)),
        ),
      ]);
    }
    if (state.tab === "reactions") {
      heads = [
        "Support",
        ...["Fx", "Fy", "Fz"].map((k) => `${k} [${eng ? "kN" : "N"}]`),
        ...["Mx", "My", "Mz"].map((k) => `${k} [${eng ? "kN m" : "N m"}]`),
      ];
      rows = state.result.reactionSupportIds.map((id, i) => [
        label(id),
        ...Array.from(state.result.reactions.slice(i * 6, i * 6 + 6), (v) =>
          format(v * f),
        ),
      ]);
    }
    if (state.tab === "section-forces") {
      heads = [
        "Member",
        "Position [%]",
        ...[
          "Axial N",
          "Shear Vy",
          "Shear Vz",
          "Torsion T",
          "Moment My",
          "Moment Mz",
        ].map((name, i) => `${name} [${eng ? "kN" : "N"}${i > 2 ? " m" : ""}]`),
      ];
      rows = state.result.members.flatMap((m) =>
        m.samples.map((sample) => [
          label(m.id),
          format(sample.station * 100),
          ...sample.actions.map((value) => format(value * f)),
        ]),
      );
    }
    if (state.tab === "forces") {
      heads = [
        "Member",
        "End",
        ...["Fx", "Fy", "Fz", "Mx", "My", "Mz"].map(
          (k, i) => `${k} [${eng ? "kN" : "N"}${i > 2 ? " m" : ""}]`,
        ),
      ];
      rows = state.result.members.flatMap((m) =>
        [0, 1].map((i) => [
          label(m.id),
          i ? "j" : "i",
          ...m.endActions.slice(i * 6, i * 6 + 6).map((v) => format(v * f)),
        ]),
      );
    }
    if (state.tab === "equilibrium") {
      const c = state.result.numericalChecks;
      $("#results-content").innerHTML =
        `<div class="equilibrium"><div><strong>✓ Global force balance</strong><small>${c.globalBalance
          .slice(0, 3)
          .map((x) => x.toExponential(2))
          .join(
            ", ",
          )} N</small></div><div><strong>✓ Global moment balance</strong><small>${c.globalBalance
          .slice(3)
          .map((x) => x.toExponential(2))
          .join(
            ", ",
          )} N m</small></div><div><strong>Scaled residual</strong><small>${c.scaledResidual.toExponential(4)} · min pivot ${c.minScaledPivot.toExponential(4)}</small></div></div>`;
      return;
    }
    if (state.tab === "stress") {
      const eng = state.project.displayUnits === "engineeringMetric";
      const scale = eng ? 1e-6 : 1;
      const unit = eng ? "MPa" : "Pa";
      heads = ["Member", "Station", `σ max [${unit}]`, `σ min [${unit}]`];
      rows = (state.result.members || [])
        .filter((m) => m.stressScreen)
        .map((m) => [
          label(m.id),
          format(m.stressScreen.station * 100) + "%",
          format(m.stressScreen.maxPa * scale),
          format(m.stressScreen.minPa * scale),
        ]);
      $("#results-content").innerHTML =
        `<p class="notice-small" data-testid="stress-disclaimer">Elastic longitudinal fibre stress only (mechanics-v1). Not a member stability or building-code check.</p>${current ? "" : '<p class="notice-small">Stale results — these values belong to the previous model.</p>'}<table><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<${i ? "td" : "th"}${i ? "" : ' scope="row"'}>${esc(v)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table>`;
      return;
    }
    $("#results-content").innerHTML =
      `${state.tab === "section-forces" ? '<p class="notice-small">Local member axes · signed section forces, matching the diagrams. Position: 0% at start (i), 100% at end (j).</p>' : state.tab === "forces" ? '<p class="notice-small">Local nodal actions applied to the member ends. Their signs differ from section forces.</p>' : ""}${current ? "" : '<p class="notice-small">Stale results — these values belong to the previous model.</p>'}<table><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<${i ? "td" : "th"}${i ? "" : ' scope="row"'}>${esc(v)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  return { renderResults, format };
}
