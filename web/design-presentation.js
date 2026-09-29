import { previewIdentity } from "./selection-context.js";
import { entityLabel } from "./entity-labels.js";
/** Presentation helpers shared by the model-native design workspaces. */
import { escape as esc } from "./reports/report.js";
export const designNames = {
  rcBeam: "RC beam",
  slab: "Slab",
  padFooting: "Pad footing",
};
const sourceLabel = (s) =>
  ({
    syntheticFixture: "Synthetic fixture",
    user: "User input",
    mixed: "Mixed sources",
  })[s] || s;
export const pretty = (v, digits = 2) =>
  typeof v === "number"
    ? // signDisplay "negative": a value that rounds to zero shows no sign.
      new Intl.NumberFormat("en-GB", {
        maximumFractionDigits: digits,
        signDisplay: "negative",
      }).format(v)
    : "—";
/** Display text for an SI value; strips float noise from the unit scaling.
 * Untouched inputs submit `data-si` exactly (see submittedValue). */
export const displayValue = (si, scale) =>
  String(Number.parseFloat((si * scale).toPrecision(12)));
export function fieldRows(d, template, keys) {
  return keys
    .map((key) => {
      const f = template.fields.find((f) => f.key === key);
      if (!f) return "";
      const source = d.inputSources?.[key] || d.inputSource;
      return `<label class="design-field"><span>${esc(f.label)}</span><span class="design-field-control"><input name="${key}" id="preview-${key}" value="${displayValue(d.inputs[key], f.displayScale)}" data-si="${d.inputs[key]}" inputmode="decimal" required><span class="unit">${esc(f.unit)}</span></span><abbr class="input-origin" title="${esc(sourceLabel(source))}">${source === "user" ? "U" : "S"}</abbr></label>`;
    })
    .join("");
}
/** Explicit section-mechanics law inputs (ADR 0012). Values come from the draft
 * when present for this law, otherwise from the Rust template defaults. */
export function mechanicsRows(d, template, law) {
  const m = d.mechanics;
  return template.mechanics.fields
    .filter((f) => f.law === "all" || f.law === law)
    .map((f) => {
      const stored = m?.inputs?.[f.key];
      const value = stored ?? f.defaultValue;
      const source =
        stored === undefined ? "syntheticFixture" : m.inputSources[f.key];
      return `<label class="design-field"><span>${esc(f.label)}</span><span class="design-field-control"><input name="mech-${f.key}" id="preview-mech-${f.key}" value="${displayValue(value, f.displayScale)}" data-si="${value}" inputmode="decimal" required><span class="unit">${esc(f.unit)}</span></span><abbr class="input-origin" title="${esc(sourceLabel(source))}">${source === "user" ? "U" : "S"}</abbr></label>`;
    })
    .join("");
}
export function mechanicsSection(d, template, law) {
  if (d.kind !== "rcBeam" || !template.mechanics) return "";
  return `<fieldset class="design-subsection" id="preview-mechanics"><legend>Section mechanics law</legend><p class="design-note">Explicit mechanics inputs. These are not code values and never produce a design PASS.</p><label class="design-field"><span>Concrete law</span><select id="preview-mech-law">${template.mechanics.laws.map((l) => `<option value="${l.id}" ${l.id === law ? "selected" : ""}>${esc(l.label)}</option>`).join("")}</select></label><div id="preview-mech-fields">${mechanicsRows(d, template, law)}</div></fieldset>`;
}
export function previewInspector({
  d,
  templates,
  ds,
  active,
  ctx,
  face,
  sketch,
  mechanicsLaw,
  plateHtml = "",
}) {
  const create = `<details class="design-create" ${!d ? "open" : ""}><summary>＋ Create a design object</summary><div class="design-inline"><select id="preview-kind" aria-label="New draft type">${templates.map((t) => `<option value="${t.kind}">${t.name}</option>`).join("")}</select><button id="preview-create">Create draft</button></div></details>`;
  const chooser = `<select id="preview-active" aria-label="Active design object"><option value="" ${!d ? "selected" : ""}>Select a design draft</option>${ds.map((item) => `<option value="${esc(item.id)}" ${item.id === active ? "selected" : ""}>${esc(previewIdentity(ctx.project, item).text)}</option>`).join("")}</select>`;
  if (!d)
    return `<div class="design-object-title"><small>CONCRETE WORKFLOWS</small><h2>Select a design object</h2>${chooser}<p>Create a beam, slab or pad footing draft to open its design workspace.</p></div>${create}<p class="design-note">Mock workflows. Concrete design checks are not yet available.</p><p id="preview-error" role="alert"></p>`;
  const t = templates.find((t) => t.kind === d.kind),
    v = d.inputs;
  const geometry =
    d.kind === "rcBeam"
      ? ["width", "depth", "cover"]
      : d.kind === "slab"
        ? [
            "length",
            "width",
            "thickness",
            "cover",
            "openingLength",
            "openingWidth",
          ]
        : [
            "length",
            "width",
            "thickness",
            "columnWidth",
            "columnDepth",
            "cover",
          ];
  const special =
    d.kind === "rcBeam"
      ? [
          "topBarCount",
          "topBarDiameter",
          "bottomBarCount",
          "bottomBarDiameter",
          "linkDiameter",
          "linkSpacing",
          "linkLegs",
        ]
      : d.kind === "slab"
        ? ["meshSize"]
        : ["bearingPressure", "embedment", "soilUnitWeight"];
  return `<div class="design-object-title"><div><small>SELECTED ${designNames[d.kind].toUpperCase()}</small><h2>${esc(previewIdentity(ctx.project, d).text)}<span class="design-tag">Mock workflow</span></h2></div>${chooser}</div>
 <p class="design-note">Draft geometry is independent of analysis stiffness. The binding identifies the source of actions.</p>
 <form id="preview-form"><section class="design-section"><h3>1. Geometry and section</h3><div class="design-section-sketch"><svg viewBox="0 0 300 230" aria-label="Section sketch">${sketch}</svg><div>${fieldRows(d, t, geometry)}</div></div></section>
 <section class="design-section"><h3>2. Materials</h3>${fieldRows(d, t, ["concreteStrength", "rebarStrength"])}<small class="source-key">S · synthetic fixture &nbsp; U · user input. Strength inputs are not a code profile.</small>${mechanicsSection(d, t, mechanicsLaw)}</section>
 <section class="design-section"><h3>3. ${d.kind === "rcBeam" ? "Reinforcement preferences" : d.kind === "slab" ? "Mesh settings" : "Soil parameters"}</h3>${fieldRows(d, t, special)}${d.kind === "rcBeam" ? `<label class="design-check full"><input type="checkbox" id="preview-anchorage" ${d.tensionAnchorageConfirmed ? "checked" : ""}> I confirm the tension steel extends at least l<sub>bd</sub> + d beyond the checked sections</label><small>Your confirmation, never assumed. Unconfirmed, EC2 shear ignores this steel (ρ<sub>l</sub> = 0).</small>` : ""}${d.kind === "padFooting" ? `<label class="design-field full"><span>Geotechnical reference</span><textarea id="preview-soil" maxlength="512">${esc(d.soilReference)}</textarea></label><small>Bearing pressure is externally supplied, never calculated here.</small>` : ""}${d.kind === "slab" ? `<small>Target cell size of the structured plate mesh.</small>${plateHtml}` : ""}</section>
 <section class="design-section"><h3>4. Model binding</h3>${d.kind !== "slab" ? `<label class="design-field"><span>${d.kind === "rcBeam" ? "Member" : "Support"}</span><select id="preview-target"><option value="">No model binding</option>${ctx.project[d.kind === "rcBeam" ? "members" : "supports"].map((e) => `<option value="${e.id}" ${d.targetId === e.id ? "selected" : ""}>${esc(entityLabel(ctx.project, e.id))}</option>`).join("")}</select></label>` : "<p>The panel is analysed on its own under its entered pressure · frame forces never substitute for plate results.</p>"}<div class="design-form-actions"><button id="preview-save">Save inputs</button><button type="button" id="preview-cancel">Cancel edits</button></div></section></form>
 <section class="design-section"><h3>5. Design actions and readiness</h3><label class="design-field"><span>Action source</span><select id="preview-source">${d.kind === "slab" ? '<option value="plate">Plate analysis of this panel</option>' : ""}<option value="synthetic">Synthetic fixture · MOCK</option>${d.kind !== "slab" ? '<option value="model">Current model case / combination</option>' : ""}</select></label>${d.kind === "slab" ? `<label class="design-field"><span>Reinforcement layer</span><select id="preview-face">${["Top X", "Top Y", "Bottom X", "Bottom Y"].map((f) => `<option ${f === face ? "selected" : ""}>${f}</option>`).join("")}</select></label>` : ""}<div class="readiness-grid"><span>✓ Draft geometry recorded</span><span>△ Code profile unavailable</span><span>△ Reinforcement unverified</span><span>△ ${d.kind === "padFooting" ? "Contact indeterminate" : "Resistance unsupported"}</span></div><p id="preview-readiness" class="source-key"></p><button class="primary" id="preview-run">Run workflow preview</button></section>
 <p class="design-note">MOCK WORKFLOW · No code-compliance claim. Draft dimensions do not change frame stiffness.</p>${create}<button id="preview-delete" class="design-delete">Delete this draft</button><p id="preview-error" role="alert"></p>`;
}
export function provenanceTable(run) {
  return `<dl class="design-provenance-grid">${Object.entries({
    Source: run.sourceProvenance?.kind,
    Result: run.sourceProvenance?.resultId,
    Combination: run.sourceProvenance?.combinationId,
    "Model revision": run.sourceRevision,
    "Model hash": run.modelHash,
    "Input hash": run.inputHash,
    Run: run.previewRunId,
  })
    .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v ?? "Not available")}</dd>`)
    .join("")}</dl>`;
}
export function beamElevation(d) {
  const v = d.inputs;
  return `<svg class="design-drawing" viewBox="0 0 660 170" aria-label="Illustrative longitudinal reinforcement"><path d="M40 38H620V128H40Z" fill="#e7ecf1" stroke="#667a8c"/><path d="M43 46H617" stroke="#b44232" stroke-width="4"/><path d="M43 116H617" stroke="#286dbd" stroke-width="4"/>${Array.from({ length: 34 }, (_, i) => `<path d="M${48 + i * 17} 43V121" stroke="#718695"/>`).join("")}<path d="M45 129l-12 22h24ZM615 129l-12 22h24Z" fill="#546a7d"/><text x="60" y="25">Top preference · ${v.topBarCount} × Ø${pretty(v.topBarDiameter * 1000)} mm</text><text x="310" y="160">Links Ø${pretty(v.linkDiameter * 1000)} @ ${pretty(v.linkSpacing * 1000)} mm · fit unverified</text><text x="330" y="101">Bottom preference · ${v.bottomBarCount} × Ø${pretty(v.bottomBarDiameter * 1000)} mm</text></svg>`;
}
const strainText = (e) => `${pretty(e * 1000, 3)} ‰`;
function mechanicsState(label, st, testid) {
  if (st.status !== "evaluated")
    return `<article><h4>${label}</h4><p role="status">Unsupported · ${esc(st.reason || "")}</p></article>`;
  const u = st.ultimate,
    e = st.elastic,
    sv = st.serviceMoment,
    key = label.toLowerCase();
  // M08-A5: cracked-section stresses under the governing model moment; no limits.
  const service = sv
    ? `<dt>Service moment (model)</dt><dd>${pretty(sv.moment / 1000, 2)} kN·m · ${esc(sv.combinationId)} · x/L = ${pretty(sv.station, 3)}${sv.side ? ` (${esc(sv.side)})` : ""}</dd><dt>Cracked-section concrete stress</dt><dd data-testid="service-concrete-${key}">${pretty(e.serviceConcreteStress / 1e6, 2)} MPa</dd>${sv.belowCrackingMoment ? `<dt>Cracking</dt><dd data-testid="service-uncracked-${key}">M below the cracking moment: the cracked-section stresses overstate an uncracked section</dd>` : ""}`
    : "";
  const rows = u.layers
    .map(
      (l, i) =>
        `<tr><td>${i === 0 ? "Compression-face row" : "Opposite-face row"}</td><td>${pretty(st.layers[i].depth * 1000, 1)} mm</td><td>${strainText(l.strain)}</td><td>${pretty(l.steelStress / 1e6, 1)} MPa${l.yielded ? " · yielded" : ""}</td><td>${pretty(l.force / 1000, 1)} kN</td>${sv ? `<td data-testid="service-steel-${key}-${i}">${pretty(e.serviceSteelStress[i] / 1e6, 2)} MPa</td>` : ""}</tr>`,
    )
    .join("");
  return `<article><h4>${label} · ${esc(st.compressionFace)} face in compression</h4><dl class="design-provenance-grid"><dt>Mechanical moment capacity</dt><dd data-testid="${testid}">${pretty(u.moment / 1000, 2)} kN·m</dd><dt>Neutral-axis depth x</dt><dd>${pretty(u.neutralAxisDepth * 1000, 1)} mm</dd><dt>x / deepest layer</dt><dd>${pretty(u.depthRatio, 3)}</dd><dt>Extreme tension steel</dt><dd>${u.classification === "tensionYielded" ? "Yielded" : "Elastic"}</dd><dt>Cracking moment</dt><dd>${pretty(e.crackingMoment / 1000, 2)} kN·m</dd><dt>Cracked I</dt><dd>${pretty((e.crackedInertia * 1e12) / 1e6, 1)} × 10⁶ mm⁴</dd>${service}</dl>
 <table><thead><tr><th>Layer</th><th>Depth from compression face</th><th>Ultimate strain</th><th>Ultimate steel stress</th><th>Ultimate net force</th>${sv ? "<th>Service stress (cracked, compression +)</th>" : ""}</tr></thead><tbody>${rows}</tbody></table></article>`;
}
const orientationText = {
  up: "Top face (local +z) points up.",
  down: "Top face (local +z) points DOWN in this member: draft sagging is physical hogging. Change the member localY to align them.",
  horizontal:
    "Top face (local +z) is horizontal in this member; sagging and hogging are not vertical.",
};
/** Model moments beside the mechanics capacities (ADR 0014). No ratio or
 * status: the capacity is mechanics, not a code resistance. */
export function demandTable(run) {
  const fd = run?.flexuralDemand;
  if (!fd) return "";
  if (fd.status !== "evaluated")
    return `<h4>Model design moments</h4><p data-testid="demand-status">${esc(fd.reason)}</p>`;
  const sm = run.sectionMechanics;
  const row = (label, key) => {
    const s = fd[key],
      capacity =
        sm?.status === "evaluated" ? sm[key].ultimate.moment : undefined;
    return `<tr><td>${label}</td><td>${capacity === undefined ? "—" : `${pretty(capacity / 1000, 2)} kN·m`}</td><td data-testid="demand-moment-${key}">${s ? `${pretty(s.moment / 1000, 2)} kN·m` : "None"}</td><td>${s ? `x/L = ${pretty(s.station, 3)}${s.side ? ` (${esc(s.side)})` : ""} · ${esc(s.kind)}` : `No ${key} My`}</td><td>${s ? `${pretty(s.actions[0] / 1000, 1)} kN · ${pretty(s.actions[5] / 1000, 2)} kN·m` : "—"}</td></tr>`;
  };
  return `<h4>Model design moments · ${esc(fd.combinationId)}</h4><p class="design-note" data-testid="demand-orientation">${esc(orientationText[fd.topFaceOrientation])} Draft width along local y, depth along local z; My &lt; 0 is sagging.</p><table><thead><tr><th>State</th><th>Mechanics capacity</th><th>Governing model moment</th><th>Location</th><th>Simultaneous N · Mz (not considered)</th></tr></thead><tbody>${row("Sagging", "sagging")}${row("Hogging", "hogging")}</tbody></table><p class="source-key">Governing key stations of ${esc(fd.memberId)} for this one case/combination. No utilisation ratio: the capacity is not a code resistance.</p>`;
}
export function mechanicsPane(run) {
  const sm = run?.sectionMechanics;
  const banner =
    '<p class="design-note"><b>MECHANICS ONLY</b> · Not a code resistance. No partial factors, limits or code checks applied. Overall design remains UNSUPPORTED.</p>';
  if (!sm)
    return `<h4>Section mechanics</h4>${banner}<p>Run the preview to evaluate section mechanics.</p>`;
  if (sm.status === "notConfigured")
    return `<h4>Section mechanics</h4>${banner}<p>${esc(sm.reason)}. Save the section-mechanics law in the inspector to evaluate it.</p>${demandTable(run)}`;
  const fitRow = (face, f) =>
    `<tr><td>${face}</td><td>${pretty(f.area * 1e6, 0)} mm²</td><td>${f.clearSpacing == null ? "Single bar" : pretty(f.clearSpacing * 1000, 1) + " mm"}</td><td data-testid="mechanics-fit-${face.toLowerCase()}">${f.fits ? "Yes" : "No"}</td></tr>`;
  const fit = sm.rowFits
    ? `<table><thead><tr><th>Row</th><th>Area</th><th>Clear spacing</th><th>Fits</th></tr></thead><tbody>${fitRow("Top", sm.rowFits.top)}${fitRow("Bottom", sm.rowFits.bottom)}</tbody></table><p class="source-key">Minimum clear spacing input ${pretty(sm.inputs.minimumClearSpacing * 1000, 1)} mm · ${esc(sm.inputSources.minimumClearSpacing === "user" ? "User input" : "Synthetic fixture")}. Cover is measured to the link.</p>`
    : "";
  if (sm.status !== "evaluated")
    return `<h4>Section mechanics</h4>${banner}${fit}<p role="status" data-testid="mechanics-status">${esc(sm.status === "rowDoesNotFit" ? "Row does not fit" : "Unsupported")} · ${esc(sm.reason || "")}</p>${demandTable(run)}`;
  return `<h4>Section mechanics · ${esc(sm.law === "rectangularBlock" ? "rectangular stress block" : "parabola-rectangle")}</h4>${banner}${demandTable(run)}${fit}
 <div class="mechanics-states">${mechanicsState("Sagging", sm.sagging, "mechanics-moment-sagging")}${mechanicsState("Hogging", sm.hogging, "mechanics-moment-hogging")}</div>
 <ul class="design-note">${sm.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}
const ec2Units = {
  N: [1e-3, "kN"],
  "N m": [1e-3, "kN·m"],
  m2: [1e6, "mm²"],
  "-": [1, ""],
};
const ec2Value = (v, units) => {
  if (v == null) return "—";
  const [scale, unit] = ec2Units[units] || [1, units];
  // Dimensionless ratios keep 3 significant figures (0.000876, not 0.001).
  if (units === "-")
    return new Intl.NumberFormat("en-GB", {
      maximumSignificantDigits: 3,
      signDisplay: "negative",
    }).format(v);
  return `${pretty(v * scale, 3)}${unit ? ` ${unit}` : ""}`;
};
const roleText = { sagging: "sagging", hogging: "hogging", shear: "shear" };
/** EC2 UK NA beam checks from the disabled profile (ADR 0016). Review only:
 * never a design result, never part of the check matrix or overall status. */
export function ec2Pane(run) {
  const cp = run?.codeProfilePreview;
  const banner =
    '<p class="design-note" data-testid="ec2-banner"><b>DISABLED PROFILE PREVIEW</b> · EN 1992-1-1 with UK NA (2009) is registered but not enabled: A1:2014 and NA+A2:2014 are not reconciled. Individual checks are shown for review only. This is not a design result; overall design remains UNSUPPORTED.</p>';
  if (!cp)
    return `<h4>EC2 checks</h4>${banner}<p>Run the preview to evaluate.</p>`;
  if (cp.status !== "evaluated")
    return `<h4>EC2 checks</h4>${banner}<p data-testid="ec2-status">${esc(cp.status === "unsupported" ? "Unsupported" : "Unavailable")} · ${esc(cp.reason || "")}</p>`;
  const station = (g) => {
    const rows = g.checks
      .map(
        (c) =>
          `<tr data-testid="ec2-check" data-roles="${esc(g.roles.join(" "))}" data-check-id="${esc(c.checkId)}"><td>${esc(c.checkId.replace(/^ec2\./, ""))}</td><td>${esc(c.clause)}</td><td><span class="status-text ${esc(c.status)}">${esc(c.status.toUpperCase())}</span></td><td>${ec2Value(c.demand, c.units)}</td><td data-testid="ec2-resistance">${ec2Value(c.resistance, c.units)}</td><td>${c.utilisation == null ? "—" : pretty(c.utilisation, 3)}</td><td>${esc(c.message)}</td></tr>`,
      )
      .join("");
    return `<article data-testid="ec2-station" data-roles="${esc(g.roles.join(" "))}"><h4>Governing ${esc(g.roles.map((r) => roleText[r] || r).join(" and "))} · x/L = ${pretty(g.station, 3)}${g.side ? ` (${esc(g.side)})` : ""} · ${esc(cp.combinationId)} · <span data-testid="ec2-overall">${esc(g.overall.toUpperCase())}</span></h4><p class="source-key">Actions N ${pretty(g.actions[0] / 1000, 2)} kN · Vz ${pretty(g.actions[2] / 1000, 2)} kN · My ${pretty(g.actions[4] / 1000, 2)} kN·m</p><table><thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>Resistance / limit</th><th>Util.</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></article>`;
  };
  return `<h4>EC2 checks · ${esc(cp.ndp)}</h4>${banner}<p class="source-key">Concrete strength used as f<sub>ck</sub>; reinforcement strength as f<sub>yk</sub> for bars and links. Tension anchorage: <b data-testid="ec2-anchorage">${cp.tensionAnchorageConfirmed ? "confirmed by you" : "not confirmed (ρl = 0)"}</b>.</p>${cp.governing.map(station).join("")}<ul class="design-note">${cp.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}
export function previewPane({ run, state, d, pane, checkIndex, sketch }) {
  const checks = run?.checks || [],
    source = run?.sourceProvenance;
  const summary = `<div class="design-summary-grid"><article class="design-verdict ${state.toLowerCase()}"><div class="verdict-symbol">${state === "STALE" ? "◷" : "△"}</div><div><small>OVERALL DESIGN</small><strong data-testid="preview-state">${state}</strong><p>${designNames[d.kind]}</p><span>Utilisation <b>—</b></span><small>No verified resistance</small></div></article><div class="design-check-matrix"><table><thead><tr><th>Check</th><th>Status</th><th>Util.</th></tr></thead><tbody>${checks.map((c, i) => `<tr><td><button class="check-link" data-preview-check="${i}">${esc(c.name)}</button></td><td><span class="status-text unsupported">UNSUPPORTED</span></td><td>—</td></tr>`).join("")}</tbody></table>${!run ? "<p>Run a preview to record actions and unavailable checks.</p>" : ""}</div><aside class="design-notes"><h4>Design basis</h4><p class="design-note">MOCK WORKFLOW — no code-compliance claim.</p><p>Actions: <b>${source?.mock ? "SYNTHETIC FIXTURE" : source?.kind === "plateAnalysis" ? "Plate analysis (plate-v1)" : source ? "Actual model analysis" : "Not captured"}</b></p><p>Code profile: unavailable</p>${d.kind === "padFooting" ? `<p>Contact: <b>INDETERMINATE</b></p><p>Soil bearing input: ${esc(run?.soilProvenance?.source || d.inputSources?.bearingPressure || d.inputSource)}; never computed by Workbench.</p>` : ""}</aside></div>`;
  if (pane === "summary") return summary;
  if (pane === "mechanics") return mechanicsPane(run);
  if (pane === "ec2") return ec2Pane(run);
  if (pane === "reinforcement")
    return `<div class="reinforcement-layout"><article><h4>${d.kind === "rcBeam" ? "Longitudinal reinforcement layout" : "Reinforcement plan"} <small>· illustration only</small></h4>${d.kind === "rcBeam" ? beamElevation(d) : `<svg class="design-drawing" viewBox="0 0 300 230">${sketch}</svg>`}<p class="design-note">Preference illustration · not a verified arrangement or construction drawing.</p></article><article><h4>${d.kind === "rcBeam" ? "Cross-section" : "Geometry and layers"}</h4><svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p>Cover ${pretty(d.inputs.cover * 1000)} mm · fit, spacing and anchorage unverified.</p></article></div>`;
  if (pane === "schedule")
    return `<h4>Bar schedule · illustrative preferences only</h4><table><thead><tr><th>Mark</th><th>Region</th><th>Bar</th><th>Qty</th><th>Cut length</th><th>Status</th></tr></thead><tbody>${(run?.schedule || []).map((r) => `<tr><td>${esc(r.mark)}</td><td>${esc(r.region)}</td><td>Ø${pretty(r.diameter * 1000)} mm</td><td>${r.quantity}</td><td>—</td><td>Unverified</td></tr>`).join("")}</tbody></table><p class="design-note">${run?.schedule.length ? "No fabrication lengths or verified quantities are available." : "A verified schedule is unavailable for this design object."}</p>`;
  if (pane === "soil")
    return `<div class="reinforcement-layout"><article><h4>Soil / contact</h4><svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p class="design-note">Contact INDETERMINATE · pressure contours are unavailable.</p></article><article><h4>External soil inputs</h4><dl class="design-provenance-grid"><dt>Allowable bearing input</dt><dd>${pretty(d.inputs.bearingPressure / 1000)} kPa</dd><dt>Origin</dt><dd>${esc(sourceLabel(d.inputSources?.bearingPressure || d.inputSource))}</dd><dt>Reference</dt><dd>${esc(d.soilReference)}</dd><dt>Workbench soil capacity</dt><dd>Not calculated</dd><dt>qmin / qmax</dt><dd>Unavailable</dd><dt>Contact area</dt><dd>Unavailable</dd></dl></article></div>`;
  if (pane === "details") {
    const c = checks[checkIndex] || checks[0];
    return `<div class="calculation-layout"><nav aria-label="Concrete calculation checks">${checks.map((c, i) => `<button class="${i === checkIndex ? "active" : ""}" data-preview-check="${i}">△ ${esc(c.name)}</button>`).join("")}</nav><article><h3>${esc(c?.name || "Calculation details")}</h3><span class="status-text unsupported">UNSUPPORTED</span><p>${esc(c?.reason || "No recorded check.")}</p><dl class="design-provenance-grid"><dt>Demand</dt><dd>See recorded upstream actions</dd><dt>Resistance</dt><dd>Unavailable</dd><dt>Clause / code profile</dt><dd>Unavailable</dd><dt>Utilisation</dt><dd>—</dd></dl>${run ? provenanceTable(run) : ""}</article></div>`;
  }
  return source
    ? `<h4>Design actions · ${source.mock ? "synthetic fixture" : source.kind === "plateAnalysis" ? "plate analysis" : "actual model analysis"}</h4>${
        source.rawPlateActions
          ? `<table><thead><tr><th>Raw plate action</th><th>N·m/m</th></tr></thead><tbody>${Object.entries(
              source.rawPlateActions,
            )
              .map(
                ([k, v]) => `<tr><td>${esc(k)}</td><td>${pretty(v)}</td></tr>`,
              )
              .join(
                "",
              )}</tbody></table><p>Design transformation and mesh convergence unavailable.</p>`
          : source.foundationActions
            ? `<table><thead><tr>${["Fx", "Fy", "Fz", "Mx", "My", "Mz"].map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody><tr>${source.foundationActions.map((n, i) => `<td>${pretty(n / 1000)} ${i < 3 ? "kN" : "kN·m"}</td>`).join("")}</tr></tbody></table><p>${esc(source.axes || "")}</p>`
            : `<p>${source.stations?.length || 0} recorded member key stations · exact data in the preview record.</p>`
      }${provenanceTable(run)}`
    : "<p>No actions captured yet.</p>";
}
