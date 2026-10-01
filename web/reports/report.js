import { entityLabel } from "../entity-labels.js";
import { reportExcludedSection } from "../capabilities-ledger.js";
export const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(result, project) {
  if (result.analysisType === "envelope") {
    const rows = [
      [
        "Entity",
        "Component",
        "Extreme",
        "Value",
        "Governing",
        "Station",
        "Side",
        "Node",
        "Support",
      ],
    ];
    const push = (entity, c) => {
      for (const [kind, ex] of [
        ["max", c.max],
        ["min", c.min],
      ])
        rows.push([
          entity,
          c.component,
          kind,
          ex.value,
          ex.caseOrCombinationId,
          ex.station ?? "",
          ex.side ?? "",
          ex.nodeId ?? "",
          ex.supportId ?? "",
        ]);
    };
    for (const m of result.members || []) {
      for (const a of m.actions || []) push(entityLabel(project, m.id), a);
      for (const d of m.displacements || [])
        push(entityLabel(project, m.id), d);
    }
    for (const n of result.nodes || [])
      for (const d of n.displacements || [])
        push(entityLabel(project, n.id), d);
    for (const s of result.supports || [])
      for (const r of s.reactions || []) push(entityLabel(project, s.id), r);
    return rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(
                typeof v === "string" && /^[=+@-]/.test(v) ? "'" + v : v,
              ).replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
  }
  const rows = [
    ["Node", "ux [m]", "uy [m]", "uz [m]", "rx [rad]", "ry [rad]", "rz [rad]"],
    ...result.nodeIds.map((id, i) => [
      entityLabel(project, id),
      ...result.nodeDisplacements.slice(i * 6, i * 6 + 6),
    ]),
    [],
    [
      "Support",
      "Fx [N]",
      "Fy [N]",
      "Fz [N]",
      "Mx [N m]",
      "My [N m]",
      "Mz [N m]",
    ],
    ...result.reactionSupportIds.map((id, i) => [
      entityLabel(project, id),
      ...result.reactions.slice(i * 6, i * 6 + 6),
    ]),
    [],
    [
      "Member",
      "Position [fraction]",
      "Axial N [N]",
      "Shear Vy [N]",
      "Shear Vz [N]",
      "Torsion T [N m]",
      "Moment My [N m]",
      "Moment Mz [N m]",
    ],
    ...(result.members ?? []).flatMap((m) =>
      m.samples.map((sample) => [
        entityLabel(project, m.id),
        sample.station,
        ...sample.actions,
      ]),
    ),
  ];
  return rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(
              typeof v === "string" && /^[=+@-]/.test(v) ? "'" + v : v,
            ).replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
}
function designRunsHtml(designRuns, e) {
  if (!designRuns?.length) return "";
  return designRuns
    .map((run) => {
      const rows = (run.checks || [])
        .map(
          (c) =>
            `<tr data-testid="report-design-check" data-check-id="${e(c.checkId)}"><th scope="row">${e(c.checkId)}</th><td>${e(c.clause)}</td><td>${e(c.status)}</td><td>${c.demand ?? ""}</td><td>${c.resistance ?? ""}</td><td>${c.utilisation ?? ""}</td><td><code>${e(JSON.stringify(c.intermediates || {}))}</code></td></tr>`,
        )
        .join("");
      return `<section data-testid="report-design-run"><h2>Steel design checks</h2>
<p>Profile ${e(run.profileId)} · member ${e(run.memberId)} · ${e(run.combinationId)} · station ${e(run.station)} · overall <strong data-testid="report-design-overall">${e(run.overall)}</strong></p>
<p>Demands are from one real case or combination (not envelope maxima). Clause trail and intermediates below.</p>
${run.source === "modelNative" ? `<p>${e(run.stabilityBasis)}. Serviceability: NOT CHECKED.</p><p>Design run ${e(run.designRunId)} · result ${e(run.resultId)} · model ${e(run.modelHash)} · profile ${e(run.profileVersion)} · settings ${e(run.designSettingsHash)} · catalogue ${e(run.catalogueSourceHash)}</p><details><summary>Complete input and station provenance</summary><pre>${e(JSON.stringify(run, null, 2))}</pre></details>` : ""}
<table><thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>φRn</th><th>Util.</th><th>Intermediates</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join("");
}

/** RC beam preview runs (ADR 0012/0014, M08-A5): code-agnostic section
 * mechanics beside the bound member's governing model moments, with
 * cracked-section service stresses. Never a code check; values in SI are
 * also carried exactly in data-si attributes and the embedded run record. */
function concretePreviewsHtml(project, previewRuns, e) {
  if (!previewRuns?.length) return "";
  const si = (v, scale, unit) =>
    typeof v === "number"
      ? `<span data-si="${v}">${(v / scale).toPrecision(6)} ${unit}</span>`
      : "—";
  // Disabled EC2 profile checks (ADR 0016): review only, never a design result.
  const units = {
    N: [1e3, "kN"],
    "N m": [1e3, "kN·m"],
    m2: [1e-6, "mm²"],
    "-": [1, ""],
  };
  const val = (v, u) => {
    if (typeof v !== "number") return "—";
    const [scale, unit] = units[u] || [1, u];
    return `<span data-si="${v}">${(v / scale).toPrecision(6)}${unit ? ` ${unit}` : ""}</span>`;
  };
  const ec2Html = (cp) => {
    if (!cp) return "";
    const head = `<h4>EC2 checks · ${e(cp.profileId || "ec2-uk-na")}</h4><p class="banner" data-testid="report-ec2-banner">DEMONSTRATION. ${e(cp.edition || cp.ndp || "")}. ${e((cp.unreconciledAmendments || []).join(", "))} not reconciled. ${e(cp.certification || "Demonstration, not a certified design")}.</p>`;
    if (cp.status !== "evaluated")
      return `${head}<p data-testid="report-ec2-status">${e(cp.status)} · ${e(cp.reason || "")}</p>`;
    const station = (g) =>
      `<h5>Governing ${e(g.roles.join(" and "))} · x/L ${g.station}${g.side ? ` (${e(g.side)})` : ""} · ${e(cp.combinationId)} · station overall <strong>${e(g.overall.toUpperCase())}</strong></h5><p>Actions [N, Vy, Vz, T, My, Mz] = [${g.actions.map((a) => `<span data-si="${a}">${a}</span>`).join(", ")}] (N, N m)</p><table><thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>Resistance / limit</th><th>Util.</th><th>Note</th></tr></thead><tbody>${g.checks.map((c) => `<tr data-testid="report-ec2-check" data-roles="${e(g.roles.join(" "))}" data-check-id="${e(c.checkId)}"><th scope="row">${e(c.checkId)}</th><td>${e(c.clause)}</td><td>${e(c.status.toUpperCase())}</td><td data-testid="report-ec2-demand">${val(c.demand, c.units)}</td><td data-testid="report-ec2-resistance">${val(c.resistance, c.units)}</td><td>${c.utilisation == null ? "—" : c.utilisation.toPrecision(4)}</td><td>${e(c.message)}</td></tr>`).join("")}</tbody></table>`;
    return `${head}<p>Concrete strength used as fck; reinforcement strength as fyk for bars and links. Tension anchorage: <strong data-testid="report-ec2-anchorage">${cp.tensionAnchorageConfirmed ? "confirmed by the user" : "not confirmed (rho_l = 0)"}</strong>.</p>${cp.governing.map(station).join("")}<ul>${(cp.limitations || []).map((l) => `<li>${e(l)}</li>`).join("")}</ul>`;
  };
  const runs = previewRuns.map((run) => {
    const sm = run.sectionMechanics,
      fd = run.flexuralDemand,
      src = run.sourceProvenance;
    const state = (key) => {
      const st = sm?.[key],
        g = fd?.status === "evaluated" ? fd[key] : null;
      if (st?.status !== "evaluated")
        return `<tr data-testid="report-rc-state" data-state="${key}"><th scope="row">${key}</th><td colspan="6">${e(sm?.status === "evaluated" ? st?.reason || "Unsupported" : sm?.reason || "Not evaluated")}</td></tr>`;
      const sv = st.serviceMoment;
      return `<tr data-testid="report-rc-state" data-state="${key}"><th scope="row">${key} · ${e(st.compressionFace)} face in compression</th><td data-testid="report-rc-capacity">${si(st.ultimate.moment, 1e3, "kN·m")}</td><td data-testid="report-rc-demand">${g ? si(g.moment, 1e3, "kN·m") : "None"}</td><td>${g ? `x/L ${g.station}${g.side ? ` (${e(g.side)})` : ""} · ${e(g.kind)}` : "—"}</td><td data-testid="report-rc-service-concrete">${sv ? si(st.elastic.serviceConcreteStress, 1e6, "MPa") : "—"}</td><td data-testid="report-rc-service-steel">${sv ? st.elastic.serviceSteelStress.map((v) => si(v, 1e6, "MPa")).join(" / ") : "—"}</td><td>${sv ? (sv.belowCrackingMoment ? "Yes — cracked stresses overstate" : "No") : "—"}</td></tr>`;
    };
    const v = run.inputs?.inputs || {},
      fits = sm?.rowFits;
    const face = (name) =>
      `<tr><th scope="row">${name}</th><td>${v[`${name}BarCount`]} × ${v[`${name}BarDiameter`]} m</td><td>${fits ? fits[name].area : "—"}</td><td>${fits ? fits[name].depthFromFace : "—"}</td><td>${fits ? (fits[name].clearSpacing ?? "single bar") : "—"}</td><td>${fits ? (fits[name].fits ? "Yes" : "No") : "—"}</td></tr>`;
    const geometry = `<h4>Section and bar rows (SI)</h4><p data-testid="report-rc-section">b ${v.width} m × h ${v.depth} m · cover to link ${v.cover} m · link ${v.linkDiameter} m</p><table><thead><tr><th>Face</th><th>Bars</th><th>Area (m²)</th><th>Depth from its face (m)</th><th>Clear spacing (m)</th><th>Fits</th></tr></thead><tbody>${face("top")}${face("bottom")}</tbody></table>`;
    const inputs = sm?.inputs
      ? Object.entries(sm.inputs)
          .map(
            ([k, v]) =>
              `<tr><th scope="row">${e(k)}</th><td>${v}</td><td>${e(sm.inputSources?.[k] || "")}</td></tr>`,
          )
          .join("")
      : "";
    return `<section data-testid="report-rc-preview" data-draft-id="${e(run.draftId)}"><h3>RC beam draft ${e(run.draftId)} · member ${e(entityLabel(project, fd?.memberId || src.targetId))}</h3>
<p>Overall <strong data-testid="report-rc-overall">${e(String(run.overall).toUpperCase())}</strong> · code profile ${run.codeProfile ? `${e(run.codeProfile.id)} · ${e(run.codeProfile.edition)} · DEMONSTRATION` : "unavailable"} · ${e(sm?.law || "no mechanics law")}</p>
<p>Preview run ${e(run.previewRunId)} · input ${e(run.inputHash)} · result ${e(src.resultId)} · combination ${e(src.combinationId)} · model ${e(run.modelHash)} · solver ${e(src.solverBuildHash)}</p>
${fd?.status === "evaluated" ? `<p>${e(fd.convention)}. Top face direction ${e(fd.topFaceDirection.join(", "))} (${e(fd.topFaceOrientation)}).${fd.topFaceOrientation === "up" ? "" : ` <strong data-testid="report-rc-orientation-warning">The draft top face is not uppermost in this member: draft sagging and hogging are not the physical ones. Correct the member localY to align them.</strong>`}</p>` : ""}
${geometry}
<table><thead><tr><th>State</th><th>Mechanics capacity</th><th>Governing model moment</th><th>Location</th><th>Service σc (cracked)</th><th>Service σs per row (compression +)</th><th>Below M_cr</th></tr></thead><tbody>${state("sagging")}${state("hogging")}</tbody></table>
${inputs ? `<h4>Material-law inputs (SI)</h4><table><thead><tr><th>Input</th><th>Value</th><th>Source</th></tr></thead><tbody>${inputs}</tbody></table>` : ""}
<ul>${[...(sm?.limitations || []), ...(fd?.limitations || [])].map((l) => `<li>${e(l)}</li>`).join("")}</ul>
${ec2Html(run.codeProfilePreview)}
<details><summary>Complete preview run record</summary><pre>${e(JSON.stringify(run, null, 2))}</pre></details></section>`;
  });
  return `<section data-testid="report-concrete-previews"><h2>RC beam design (EC2 UK, demonstration)</h2><p class="banner">MECHANICS ONLY for the section mechanics: they are not a code resistance, no partial factors or code limits are applied to them, and they carry no utilisation ratio. The EC2 checks are a demonstration of EN 1992-1-1:2004+AC:2010 with the UK NA (2009); A1:2014 and NA+A2:2014 are not reconciled, and this is not a certified design (ADR 0026).</p>${runs.join("")}</section>`;
}

const siCell = (v, scale, unit) =>
  typeof v === "number"
    ? `<span data-si="${v}">${(v / scale).toPrecision(6)} ${unit}</span>`
    : "—";

/** RC column section mechanics runs (ADR 0022): biaxial M_Rd(N_Ed, θ) and a
 * mechanics utilisation at each key station. Never a code check. */
function columnRunsHtml(project, runs, e) {
  if (!runs?.length) return "";
  const body = runs
    .map((run) => {
      const cm = run.columnMechanics,
        src = run.sourceProvenance;
      if (cm?.status !== "evaluated")
        return `<section data-testid="report-column-preview"><h3>RC column draft ${e(run.draftId)}</h3><p>${e(cm?.status || "Not evaluated")} · ${e(cm?.reason || "")}</p></section>`;
      const rows = cm.stations
        .map(
          (s) =>
            `<tr data-testid="report-column-station"><th scope="row">x/L ${s.station}${s.side ? ` (${e(s.side)})` : ""}</th><td>${siCell(s.nEd, 1e3, "kN")}</td><td>${siCell(s.myEd, 1e3, "kN·m")}</td><td>${siCell(s.mzEd, 1e3, "kN·m")}</td><td>${s.capacity ? siCell(s.capacity.mRd, 1e3, "kN·m") : "—"}</td><td data-testid="report-column-utilisation">${s.status === "evaluated" ? `<span data-si="${s.utilisation}">${s.utilisation.toPrecision(4)}</span>` : e(s.status === "beyondAxialRange" ? "N beyond the axial range" : s.reason || s.status)}</td></tr>`,
        )
        .join("");
      const inputs = Object.entries(cm.materialInputs)
        .map(
          ([k, v]) =>
            `<tr><th scope="row">${e(k)}</th><td>${v}</td><td>${e(cm.materialSources?.[k] || "")}</td></tr>`,
        )
        .join("");
      const cp = run.codeProfilePreview;
      const unitsOf = {
        N: [1e3, "kN"],
        "N m": [1e3, "kN·m"],
        m2: [1e-6, "mm²"],
        m: [1e-3, "mm"],
        "-": [1, ""],
      };
      const val = (v, u) => {
        if (typeof v !== "number") return "—";
        const [scale, unit] = unitsOf[u] || [1, u];
        return `<span data-si="${v}">${(v / scale).toPrecision(6)}${unit ? ` ${unit}` : ""}</span>`;
      };
      const ec2 =
        cp?.status === "evaluated"
          ? `<h4>EC2 column checks · ${e(cp.profileId)}</h4><p class="banner" data-testid="report-ec2-banner">DEMONSTRATION. ${e(cp.edition)}. ${e((cp.unreconciledAmendments || []).join(", "))} not reconciled. ${e(cp.certification)}.</p><p>N<sub>Ed</sub> ${val(cp.actions.nEd, "N")} · end My ${cp.actions.myEnds.map((m) => val(m, "N m")).join(" / ")} · end Mz ${cp.actions.mzEnds.map((m) => val(m, "N m")).join(" / ")} · ${e(cp.combinationId)}</p><table><thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>Resistance / limit</th><th>Util.</th><th>Note</th></tr></thead><tbody>${cp.checks.map((c) => `<tr data-testid="report-ec2-check" data-check-id="${e(c.checkId)}"><th scope="row">${e(c.checkId)}</th><td>${e(c.clause)}</td><td>${e(c.status.toUpperCase())}</td><td>${val(c.demand, c.units)}</td><td>${val(c.resistance, c.units)}</td><td>${c.utilisation == null ? "—" : c.utilisation.toPrecision(4)}</td><td>${e(c.message)}</td></tr>`).join("")}</tbody></table>${(() => {
              const b = cp.checks.find(
                (c) => c.checkId === "ec2.column.biaxial.y",
              )?.intermediates;
              return b?.y
                ? `<table data-testid="report-column-slenderness"><thead><tr><th>Direction</th><th>l0 (m)</th><th>λ</th><th>λlim</th><th>e_i (m)</th><th>e0 (m)</th><th>e2 (m)</th><th>M_Ed with imperfection</th></tr></thead><tbody>${["y", "z"].map((a) => `<tr><th scope="row">About ${a}</th><td>${b[a].l0}</td><td>${b[a].lambda}</td><td>${b[a].lambdaLim ?? "—"}</td><td>${b[a].ei}</td><td>${b[a].e0}</td><td>${b[a].e2}</td><td>${val(b[a].mEdWithImperfection, "N m")}</td></tr>`).join("")}</tbody></table>`
                : "";
            })()}`
          : "";
      return `<section data-testid="report-column-preview" data-draft-id="${e(run.draftId)}"><h3>RC column draft ${e(run.draftId)} · member ${e(entityLabel(project, src.targetId))}</h3>
<p>Overall <strong data-testid="report-column-overall">${e(String(run.overall).toUpperCase())}</strong> · code profile ${run.codeProfile ? `${e(run.codeProfile.id)} · ${e(run.codeProfile.edition)} · DEMONSTRATION` : "unavailable"} · ${e(cm.law)} · ${cm.section.width} m × ${cm.section.depth} m, ${cm.section.barCount} bars, A<sub>s</sub> ${cm.section.steelArea} m²</p>
<p>Preview run ${e(run.previewRunId)} · input ${e(run.inputHash)} · result ${e(src.resultId)} · combination ${e(src.combinationId)} · model ${e(run.modelHash)}</p>
<p>Axial range ${siCell(cm.axialRange.tension, 1e3, "kN")} … ${siCell(cm.axialRange.squash, 1e3, "kN")} (compression positive). ${e(cm.convention)}.</p>
<table><thead><tr><th>Station</th><th>N<sub>Ed</sub></th><th>My</th><th>Mz</th><th>M<sub>Rd</sub>(N, θ)</th><th>M<sub>Ed</sub>/M<sub>Rd</sub> (mechanics)</th></tr></thead><tbody>${rows}</tbody></table>
<h4>Material-law inputs (SI)</h4><table><thead><tr><th>Input</th><th>Value</th><th>Source</th></tr></thead><tbody>${inputs}</tbody></table>
<ul>${cm.limitations.map((l) => `<li>${e(l)}</li>`).join("")}</ul>
${ec2}
<details><summary>Complete preview run record</summary><pre>${e(JSON.stringify(run, null, 2))}</pre></details></section>`;
    })
    .join("");
  return `<section data-testid="report-column-previews"><h2>RC column design (EC2 UK, demonstration)</h2><p class="banner">The section mechanics use the draft's explicit material law and are not a code resistance (ADR 0022). The EC2 column checks apply partial factors, slenderness, imperfections, second-order moments and the minimum eccentricity; they are a demonstration of EN 1992-1-1:2004+AC:2010 with the UK NA (2009), A1:2014 and NA+A2:2014 not reconciled, and not a certified design (ADR 0027).</p>${body}</section>`;
}

/** Slab plate analyses (plate-v1, ADR 0021): solution quality, extremes,
 * Wood–Armer design moments and clamped-edge moments. Mechanics only. */
function plateRunsHtml(runs, e) {
  if (!runs?.length) return "";
  const body = runs
    .map((run) => {
      const pa = run.plateAnalysis;
      const dm = ["bottomX", "bottomY", "topX", "topY"]
        .map(
          (k) =>
            `<tr data-testid="report-plate-design-moment"><th scope="row">${k}</th><td>${siCell(pa.designMoments[k].value, 1e3, "kN·m/m")}</td><td>(${pa.designMoments[k].at.map((v) => v.toPrecision(4)).join(", ")}) m</td></tr>`,
        )
        .join("");
      const x = pa.extremes;
      return `<section data-testid="report-plate-preview" data-draft-id="${e(run.draftId)}"><h3>Slab draft ${e(run.draftId)} · ${pa.panel.lengthX} m × ${pa.panel.lengthY} m × ${pa.panel.thickness} m</h3>
<p>Overall <strong>${e(String(run.overall).toUpperCase())}</strong> · code profile unavailable · edges (x = 0, x = Lx, y = 0, y = Ly) ${e(pa.panel.edges.join(", "))} · opening ${pa.panel.opening ? e(pa.panel.opening.join(", ")) + " m" : "none"} · pressure ${siCell(pa.load.pressure, 1e3, "kPa")} (${e(pa.load.source)})</p>
<p>Preview run ${e(run.previewRunId)} · input ${e(run.inputHash)} · model ${e(run.modelHash)} · ${e(pa.family)}</p>
<table><tbody><tr><th scope="row">Mesh</th><td>${pa.mesh.elements} elements · ${pa.mesh.nodes} nodes · aspect ≤ ${pa.mesh.maxAspect.toPrecision(3)}${pa.mesh.warnings.map((w) => ` · ${e(w.code)}`).join("")}</td></tr><tr><th scope="row">Equilibrium</th><td data-testid="report-plate-balance" data-si="${pa.equilibrium.relativeImbalance}">reactions ${siCell(pa.equilibrium.reactions, 1e3, "kN")} vs load ${siCell(pa.equilibrium.applied, 1e3, "kN")}</td></tr><tr><th scope="row">Max deflection</th><td>${siCell(x.maxDeflection, 1e-3, "mm")}</td></tr><tr><th scope="row">mx, my range</th><td>${siCell(x.minMx, 1e3, "kN·m/m")} … ${siCell(x.maxMx, 1e3, "kN·m/m")}; ${siCell(x.minMy, 1e3, "kN·m/m")} … ${siCell(x.maxMy, 1e3, "kN·m/m")}</td></tr><tr><th scope="row">Convergence indicator</th><td>${(pa.convergence.change * 100).toPrecision(3)} % from a ${pa.convergence.coarseMeshSize} m mesh · ${pa.convergence.withinLimit ? "within" : "exceeds"} ${pa.convergence.indicatorLimit * 100} %</td></tr></tbody></table>
<h4>Governing Wood–Armer design moments (element centres)</h4><table><thead><tr><th>Face</th><th>Moment to resist</th><th>At</th></tr></thead><tbody>${dm}</tbody></table>
<p>${e(pa.convergence.note)} ${e(pa.signs)}. Reinforcement, punching and deflection limits are UNSUPPORTED.</p>
<details><summary>Complete preview run record</summary><pre>${e(JSON.stringify(run, null, 2))}</pre></details></section>`;
    })
    .join("");
  return `<section data-testid="report-plate-previews"><h2>Slab plate analysis (preview)</h2><p class="banner">MECHANICS ONLY. plate-v1 actions of the draft panel under its entered pressure, not connected to the frame model (ADR 0021). Wood–Armer values are moments to resist, not reinforcement; overall design remains UNSUPPORTED.</p>${body}</section>`;
}

/** Current stability-v1 run (elastic buckling or second order), SI values. */
function stabilityHtml(project, run, e) {
  if (!run?.result) return "";
  const r = run.result;
  const name = (id) => e(entityLabel(project, id));
  const si = (v) => `<td data-si="${v}">${e(Number(v.toPrecision(10)))}</td>`;
  const head = `<h2>Elastic stability (stability-v1)</h2><p class="banner" data-testid="report-stability-banner">Flexural only. A critical factor is an elastic load multiplier of this idealised model, not a member resistance, effective length or code stability verdict. Second-order results are linearised (small rotations) and apply to this one case or combination only; they are never superposed.</p><p>${run.kind === "elasticBuckling" ? "Elastic buckling" : "Second-order (P-Δ-δ)"} · ${e(run.caseId)} · ${r.subdivisions ?? r.numericalChecks.subdivisions} elements per member<br><small>Result ${e(r.resultId)} · settings ${e(r.settingsHash)}</small></p>`;
  if (run.kind === "elasticBuckling") {
    if (!r.modes.length)
      return `${head}<p data-testid="report-stability-no-factor">${e(r.diagnostics[0]?.message || "No positive critical factor.")}</p>`;
    return `${head}<table data-testid="report-stability-modes"><tr><th>Mode</th><th>Critical factor λ</th><th>Residual</th></tr>${r.modes.map((m, i) => `<tr><th>${i + 1}</th>${si(m.factor)}<td>${e(m.residual.toExponential(1))}</td></tr>`).join("")}</table><p>Disclosures: ${e(r.disclosures.join(", "))}.</p>`;
  }
  const first = r.numericalChecks.firstOrder;
  const rows = r.nodeIds
    .map(
      (id, i) =>
        `<tr><th>${name(id)}</th>${[0, 1, 2].map((a) => `${si(first.nodeDisplacements[i * 6 + a])}${si(r.nodeDisplacements[i * 6 + a])}`).join("")}</tr>`,
    )
    .join("");
  const forces = r.numericalChecks.imperfection.equivalentNodalForces;
  return `${head}<table data-testid="report-stability-displacements"><tr><th>Node</th>${["ux", "uy", "uz"].map((c) => `<th>${c} 1st (m)</th><th>${c} 2nd (m)</th>`).join("")}</tr>${rows}</table><p>Converged in ${r.numericalChecks.iterations} iterations. Imperfection: ${r.numericalChecks.imperfection.settings.kind === "none" ? "none (stated)" : `sway ratio ${e(r.numericalChecks.imperfection.settings.ratio)} with ${forces.length} equivalent nodal forces`}.</p>`;
}

export function report(
  project,
  result,
  { designRuns, previewRuns, columnRuns, plateRuns, stabilityRun } = {},
) {
  const e = escape;
  const designSection =
    designRunsHtml(designRuns, e) +
    concretePreviewsHtml(project, previewRuns, e) +
    columnRunsHtml(project, columnRuns, e) +
    plateRunsHtml(plateRuns, e) +
    stabilityHtml(project, stabilityRun, e);
  if (result.analysisType === "envelope") {
    const ids = (result.caseOrCombinationIds || []).join(", ");
    const rows = [];
    const push = (entity, c) => {
      for (const [kind, ex] of [
        ["max", c.max],
        ["min", c.min],
      ])
        rows.push(
          `<tr><th scope="row">${e(entity)}</th><td>${e(c.component)}</td><td>${kind}</td><td>${ex.value}</td><td>${e(ex.caseOrCombinationId)}</td><td>${ex.station ?? ""}</td></tr>`,
        );
    };
    for (const m of result.members || []) {
      for (const a of m.actions || []) push(entityLabel(project, m.id), a);
      for (const d of m.displacements || [])
        push(entityLabel(project, m.id), d);
    }
    for (const n of result.nodes || [])
      for (const d of n.displacements || [])
        push(entityLabel(project, n.id), d);
    for (const s of result.supports || [])
      for (const r of s.reactions || []) push(entityLabel(project, s.id), r);
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${e(project.name)} — envelope record</title><style>body{font:15px system-ui;color:#182d43;max-width:1100px;margin:50px auto;padding:24px}h1{font-size:32px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;border-bottom:1px solid #ddd;padding:10px}th:first-child{text-align:left}.banner{padding:20px;background:#fff3d6}small{overflow-wrap:anywhere}code{font-size:11px;overflow-wrap:anywhere}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}</style><header><p>STRUCTURAL WORKBENCH / ENVELOPE RECORD</p><h1>${e(project.name)}</h1><p>Independent scalar extrema · ${e(ids)}</p><small>Model SHA-256: ${e(result.modelHash)}<br>Solver source: ${e(result.solverBuildHash)}<br>Settings: ${e(result.settingsHash)}<br>Created ${e(new Date().toISOString())}</small></header><div class="banner"><strong>Not a simultaneous force set.</strong> ${e((result.diagnostics || []).map((d) => d.message).join(" "))}</div><table><thead><tr><th>Entity</th><th>Component</th><th>Extreme</th><th>Value</th><th>Governing</th><th>Station</th></tr></thead><tbody>${rows.join("")}</tbody></table><p>Design checks must use one real case or combination, not mixed envelope extrema.</p>${designSection}</html>`;
  }
  const points = result.members.flatMap((m) =>
    m.samples.map((s) => s.position),
  );
  const xmin = Math.min(...points.map((p) => p[0])),
    xmax = Math.max(...points.map((p) => p[0])),
    zmin = Math.min(...points.map((p) => p[2])),
    zmax = Math.max(...points.map((p) => p[2]));
  const factor = Math.min(
    900 / Math.max(xmax - xmin, 1),
    130 / Math.max(zmax - zmin, 1),
  );
  const projectPoint = (p, d = [0, 0, 0]) =>
    [
      50 + (p[0] + d[0] * 10 - xmin) * factor,
      150 - (p[2] + d[2] * 10 - zmin) * factor,
    ].join(",");
  const plot =
    '<svg viewBox="0 0 1000 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Global XZ elevation with deformation amplified ten times">' +
    result.members
      .map(
        (m) =>
          '<polyline points="' +
          m.samples.map((s) => projectPoint(s.position)).join(" ") +
          '" fill="none" stroke="#43536b" stroke-width="2"/><polyline points="' +
          m.samples
            .map((s) => projectPoint(s.position, s.displacement))
            .join(" ") +
          '" fill="none" stroke="#225dc7" stroke-width="2"/>',
      )
      .join("") +
    "</svg>";
  const row = (id, v) =>
    `<tr><th>${e(entityLabel(project, id))}</th>${Array.from(v, (x) => `<td>${e(x.toPrecision(9))}</td>`).join("")}</tr>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${e(project.name)} — calculation record</title><style>body{font:15px system-ui;color:#182d43;max-width:1100px;margin:50px auto;padding:24px}h1{font-size:32px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;border-bottom:1px solid #ddd;padding:10px}th:first-child{text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:20px;font-size:12px}.banner{padding:20px;background:#fff3d6}small{overflow-wrap:anywhere}code{font-size:11px;overflow-wrap:anywhere}svg{width:100%;height:220px}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}</style><header><p>STRUCTURAL WORKBENCH / CALCULATION RECORD</p><h1>${e(project.name)}</h1><p>Linear elastic frame analysis · ${e(result.caseId)} · SI units</p><small>Model SHA-256: ${e(result.modelHash)}<br>Solver source: ${e(result.solverBuildHash)}<br>Settings: ${e(result.settingsHash)}<br>Created ${e(new Date().toISOString())}</small></header><p class="banner">Mechanics preview. Prismatic Euler–Bernoulli members, small displacement, isotropic material, principal axes and Saint Venant torsion. No shear deformation, buckling, material nonlinearity, connection design or building-code compliance${stabilityRun?.result ? "; buckling and second-order results appear only in the labelled stability section" : ""}. Commercial numerical parity is UNKNOWN.</p>${reportExcludedSection(e)}<h2>Model</h2><p>${project.nodes.length} nodes · ${project.members.length} members · ${e(project.analysisMode)}. Global Z up; right-hand rotations. ${project.analysisMode === "planarXZ" ? "Generated constraints fix uy, rx and rz at every node." : ""}</p><h2>Global XZ elevation</h2><p>Grey: undeformed. Blue: deformation ×10. Projection may hide out-of-plane members.</p>${plot}<h2>Nodal displacements</h2><table><tr><th>Node</th>${["ux (m)", "uy (m)", "uz (m)", "rx (rad)", "ry (rad)", "rz (rad)"].map((x) => `<th>${x}</th>`).join("")}</tr>${result.nodeIds.map((id, i) => row(id, result.nodeDisplacements.slice(i * 6, i * 6 + 6))).join("")}</table><h2>Physical support reactions</h2><table><tr><th>Support</th>${["Fx (N)", "Fy (N)", "Fz (N)", "Mx (N m)", "My (N m)", "Mz (N m)"].map((x) => `<th>${x}</th>`).join("")}</tr>${result.reactionSupportIds.map((id, i) => row(id, result.reactions.slice(i * 6, i * 6 + 6))).join("")}</table><h2>Member end actions</h2><p>Actions applied by nodes to the element, in local axes. These differ from cut-face section actions.</p>${result.members.map((m) => `<h3>${e(entityLabel(project, m.id))} · ${m.length} m</h3><table><tr><th>End</th>${["Fx (N)", "Fy (N)", "Fz (N)", "Mx (N m)", "My (N m)", "Mz (N m)"].map((x) => `<th>${x}</th>`).join("")}</tr>${row("i", m.endActions.slice(0, 6))}${row("j", m.endActions.slice(6))}</table>`).join("")}${designSection}<h2>Equilibrium and diagnostics</h2><pre>${e(JSON.stringify({ checks: result.numericalChecks, diagnostics: result.diagnostics, generatedConstraints: result.generatedConstraintReactions }, null, 2))}</pre><h2>Reproducible project input</h2><pre>${e(JSON.stringify(project, null, 2))}</pre></html>`;
}
