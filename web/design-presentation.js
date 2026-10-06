import { previewIdentity } from "./selection-context.js";
import { entityLabel } from "./entity-labels.js";
/** Presentation helpers shared by the model-native design workspaces. */
import { escape as esc } from "./reports/report.js";
export const designNames = {
  rcBeam: "RC beam",
  rcColumn: "RC column",
  slab: "Slab",
  padFooting: "Pad footing",
  singlePlate: "Steel connection",
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
  if (!["rcBeam", "rcColumn"].includes(d.kind) || !template.mechanics)
    return "";
  return `<fieldset class="design-subsection" id="preview-mechanics"><legend>Section mechanics law</legend><p class="design-note">Explicit mechanics inputs. These are not code values and never produce a design PASS.</p><label class="design-field"><span>Concrete law</span><select id="preview-mech-law">${template.mechanics.laws.map((l) => `<option value="${l.id}" ${l.id === law ? "selected" : ""}>${esc(l.label)}</option>`).join("")}</select></label><div id="preview-mech-fields">${mechanicsRows(d, template, law)}</div></fieldset>`;
}
const EXPOSURE = [
  "X0",
  "XC1",
  "XC2",
  "XC3",
  "XC4",
  "XD1",
  "XD2",
  "XD3",
  "XS1",
  "XS2",
  "XS3",
];
const SYSTEMS = [
  ["simplySupported", "Simply supported"],
  ["endSpan", "End span of a continuous member"],
  ["interiorSpan", "Interior span"],
  ["cantilever", "Cantilever"],
];
/** EC2 code inputs (schema 1.8.0, ADR 0026/0027), the fields that apply to
 * the draft kind. Every value is the engineer's; nothing is preselected. */
export function codeInputsSection(d, ctx) {
  const ci = d.codeInputs || {};
  const mm = (v) => (v == null ? "" : `${pretty(v * 1000)} mm`);
  const opt = (value, label, current) =>
    `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(label)}</option>`;
  const combos = [
    ...ctx.project.loadCases.map((c) => [
      c.id,
      `Case ${entityLabel(ctx.project, c.id)} · ${c.name}`,
    ]),
    ...ctx.project.combinations.map((c) => [
      c.id,
      `Combination ${entityLabel(ctx.project, c.id)} · ${c.name}`,
    ]),
  ];
  const yesNo = (v) => (v == null ? "" : v ? "yes" : "no");
  const choice = (id, label, current) =>
    `<label class="design-field"><span>${label}</span><select id="${id}">${opt("", "— choose —", current)}${opt("yes", "Yes", current)}${opt("no", "No", current)}</select></label>`;
  const num = (v) => (v == null ? "" : String(v));
  const shared = `<label class="design-field"><span>Exposure class</span><select id="code-exposure">${opt("", "— choose —", ci.exposureClass || "")}${EXPOSURE.map((x) => opt(x, x, ci.exposureClass)).join("")}</select></label>
<label class="design-field"><span>c<sub>min,dur</sub> (BS 8500)</span><input id="code-cover" value="${mm(ci.minimumCoverDurability)}" placeholder="e.g. 15 mm" autocomplete="off"></label>
<label class="design-field"><span>Max aggregate size</span><input id="code-aggregate" value="${mm(ci.aggregateSize)}" placeholder="e.g. 20 mm" autocomplete="off"></label>`;
  const systems =
    d.kind === "slab" ? [...SYSTEMS, ["flatSlab", "Flat slab"]] : SYSTEMS;
  const bySpan = ["rcBeam", "slab"].includes(d.kind)
    ? `<label class="design-field"><span>Structural system</span><select id="code-system">${opt("", "— choose —", ci.structuralSystem || "")}${systems.map(([v, l]) => opt(v, l, ci.structuralSystem)).join("")}</select></label>
${choice("code-partitions", "Supports sensitive partitions", yesNo(ci.partitionsSensitive))}`
    : "";
  const qp =
    d.kind === "rcBeam"
      ? `<label class="design-field"><span>Quasi-permanent case / combination</span><select id="code-qp">${opt("", "— choose —", ci.quasiPermanentCombinationId || "")}${combos.map(([v, l]) => opt(v, l, ci.quasiPermanentCombinationId)).join("")}</select></label>`
      : "";
  const pair = (id, label, v, hints = ["k1", "k2"]) =>
    `<label class="design-field"><span>${label}</span><span class="design-pair"><input id="${id}-1" value="${num(v?.[0])}" placeholder="${hints[0]}" autocomplete="off"><input id="${id}-2" value="${num(v?.[1])}" placeholder="${hints[1]}" autocomplete="off"></span></label>`;
  const column =
    d.kind === "rcColumn"
      ? `${choice("code-braced", "Braced against sway", yesNo(ci.braced))}
${pair("code-ky", "End restraint k1, k2 · bending about y", ci.restraintY)}
${pair("code-kz", "End restraint k1, k2 · bending about z", ci.restraintZ)}
<label class="design-field"><span>Effective creep ratio φ<sub>ef</sub></span><input id="code-creep" value="${num(ci.effectiveCreepRatio)}" placeholder="e.g. 1.5" autocomplete="off" inputmode="decimal"></label>
<small>k = (θ/M)(EI/l): 0 for a rigid end (0.1 is used as the minimum), 1000 for a pin. 5.8.3.2(3).</small>`
      : "";
  const slab =
    d.kind === "slab"
      ? `${pair(
          "code-colsize",
          "Column size c<sub>x</sub>, c<sub>y</sub> (punching)",
          ci.columnSize?.map((v) => `${pretty(v * 1000)} mm`),
          ["e.g. 400 mm", "e.g. 400 mm"],
        )}`
      : "";
  const footing =
    d.kind === "padFooting"
      ? `${choice("code-blinding", "Cast on blinding (else against ground)", yesNo(ci.castOnBlinding))}
<label class="design-field"><span>Bearing case / combination</span><select id="code-bearing">${opt("", "— choose —", ci.bearingCombinationId || "")}${combos.map(([v, l]) => opt(v, l, ci.bearingCombinationId)).join("")}</select></label>
<small>The allowable bearing input is compared with this case or combination, plus the base and overburden.</small>`
      : "";
  return `<fieldset class="design-code-inputs" data-testid="code-inputs"><legend>EC2 code inputs</legend>
${shared}${bySpan}${qp}${column}${slab}${footing}
<small>Your values from BS 8500 and the brief. A check that needs a value you have not entered stays INDETERMINATE; nothing is assumed.</small></fieldset>`;
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
    d.kind === "rcBeam" || d.kind === "rcColumn"
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
    d.kind === "rcColumn"
      ? [
          "barDiameter",
          "barsAlongWidth",
          "barsAlongDepth",
          "linkDiameter",
          "linkSpacing",
        ]
      : d.kind === "rcBeam"
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
  return `<div class="design-object-title"><div><small>SELECTED ${designNames[d.kind].toUpperCase()}</small><h2>${esc(previewIdentity(ctx.project, d).text)}<span class="design-tag">${["rcBeam", "rcColumn", "padFooting", "slab"].includes(d.kind) ? "EC2 UK · demonstration" : "Mock workflow"}</span></h2></div>${chooser}</div>
 <p class="design-note">Draft geometry is independent of analysis stiffness. The binding identifies the source of actions.</p>
 <form id="preview-form"><section class="design-section"><h3>1. Geometry and section</h3><div class="design-section-sketch"><svg viewBox="0 0 300 230" aria-label="Section sketch">${sketch}</svg><div>${fieldRows(d, t, geometry)}</div></div></section>
 <section class="design-section"><h3>2. Materials</h3>${fieldRows(d, t, ["concreteStrength", "rebarStrength"])}<small class="source-key">S · synthetic fixture &nbsp; U · user input. Strength inputs are not a code profile.</small>${mechanicsSection(d, t, mechanicsLaw)}</section>
 <section class="design-section"><h3>3. ${d.kind === "rcBeam" || d.kind === "rcColumn" ? "Reinforcement preferences" : d.kind === "slab" ? "Mesh settings" : "Soil parameters"}</h3>${fieldRows(d, t, special)}${d.kind === "rcBeam" ? `<label class="design-check full"><input type="checkbox" id="preview-anchorage" ${d.tensionAnchorageConfirmed ? "checked" : ""}> I confirm the tension steel extends at least l<sub>bd</sub> + d beyond the checked sections</label><small>Your confirmation, never assumed. Unconfirmed, EC2 shear ignores this steel (ρ<sub>l</sub> = 0) and anchorage stays INDETERMINATE.</small>` : ""}${codeInputsSection(d, ctx)}${d.kind === "padFooting" ? `<label class="design-field full"><span>Geotechnical reference</span><textarea id="preview-soil" maxlength="512">${esc(d.soilReference)}</textarea></label><small>Bearing pressure is externally supplied, never calculated here.</small>` : ""}${d.kind === "slab" ? `<small>Target cell size of the structured plate mesh.</small>${plateHtml}` : ""}</section>
 <section class="design-section"><h3>4. Model binding</h3>${d.kind !== "slab" ? `<label class="design-field"><span>${d.kind === "padFooting" ? "Support" : "Member"}</span><select id="preview-target"><option value="">No model binding</option>${ctx.project[d.kind === "padFooting" ? "supports" : "members"].map((e) => `<option value="${e.id}" ${d.targetId === e.id ? "selected" : ""}>${esc(entityLabel(ctx.project, e.id))}</option>`).join("")}</select></label>` : "<p>The panel is analysed on its own under its entered pressure · frame forces never substitute for plate results.</p>"}<div class="design-form-actions"><button id="preview-save">Save inputs</button><button type="button" id="preview-cancel">Cancel edits</button></div></section></form>
 <section class="design-section"><h3>5. Design actions and readiness</h3><label class="design-field"><span>Action source</span><select id="preview-source">${d.kind === "slab" ? '<option value="plate">Plate analysis of this panel</option>' : ""}<option value="synthetic">Synthetic fixture · MOCK</option>${d.kind !== "slab" ? '<option value="model">Current model case / combination</option>' : ""}</select></label>${d.kind === "slab" ? `<label class="design-field"><span>Reinforcement layer</span><select id="preview-face">${["Top X", "Top Y", "Bottom X", "Bottom Y"].map((f) => `<option ${f === face ? "selected" : ""}>${f}</option>`).join("")}</select></label>` : ""}<div class="readiness-grid"><span>✓ Draft geometry recorded</span><span>${["rcBeam", "rcColumn", "padFooting", "slab"].includes(d.kind) ? "✓ EC2 UK profile · demonstration" : "△ Code profile unavailable"}</span><span>△ Reinforcement unverified</span><span>△ ${d.kind === "padFooting" ? "Contact indeterminate" : ["rcBeam", "rcColumn"].includes(d.kind) ? "Resistance on model actions only" : "Resistance unsupported"}</span></div><p id="preview-readiness" class="source-key"></p><button class="primary" id="preview-run">Run workflow preview</button>${["rcBeam", "rcColumn"].includes(d.kind) ? '<button type="button" id="preview-propose" class="secondary">Propose reinforcement</button>' : ""}</section>
 <p class="design-note">${["rcBeam", "rcColumn", "padFooting", "slab"].includes(d.kind) ? "EC2 UK DEMONSTRATION · EN 1992-1-1:2004+AC:2010 with UK NA (2009); A1:2014 / NA+A2:2014 not reconciled; not a certified design. Draft dimensions do not change frame stiffness." : "MOCK WORKFLOW · No code-compliance claim. Draft dimensions do not change frame stiffness."}</p>${create}<button id="preview-delete" class="design-delete">Delete this draft</button><p id="preview-error" role="alert"></p>`;
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
    '<p class="design-note"><b>MECHANICS ONLY</b> · Not a code resistance. No partial factors, limits or code checks applied here; the EC2 checks tab carries the code checks.</p>';
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
  const banner = cp?.profileEnabled
    ? `<p class="design-note" data-testid="ec2-banner"><b>DEMONSTRATION</b> · ${esc(cp.edition)} · ${esc((cp.unreconciledAmendments || []).join(", "))} not reconciled · ${esc(cp.certification)}.</p>`
    : '<p class="design-note" data-testid="ec2-banner"><b>EC2 UK PROFILE</b> · EN 1992-1-1:2004+AC:2010 with UK NA (2009) · demonstration, not a certified design.</p>';
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
/** The enumerated reinforcement proposal (ADR 0026): what was searched, what
 * it found, and the statuses it leaves for the engineer. */
export function proposalPanel(proposal) {
  if (!proposal) return "";
  if (proposal.status !== "proposed")
    return `<article class="design-proposal" data-testid="proposal"><h4>Reinforcement proposal</h4><p data-testid="proposal-status">No arrangement found · ${esc(proposal.reason || "")}</p><small>${proposal.candidatesEvaluated} arrangements evaluated.</small></article>`;
  const v = proposal.inputs,
    mm = (x) => pretty(x * 1000);
  if (v.barDiameter != null) {
    const open = proposal.checks.filter((c) => c.status !== "pass");
    const n = 2 * v.barsAlongWidth + 2 * (v.barsAlongDepth - 2);
    return `<article class="design-proposal" data-testid="proposal"><h4>Reinforcement proposal · least steel</h4><dl class="design-provenance-grid"><dt>Bars</dt><dd data-testid="proposal-bars">${n} Ø${mm(v.barDiameter)} (${v.barsAlongWidth} along width, ${v.barsAlongDepth} along depth)</dd><dt>Links</dt><dd data-testid="proposal-links">Ø${mm(v.linkDiameter)} @ ${mm(v.linkSpacing)} mm</dd><dt>A<sub>s</sub></dt><dd>${pretty(proposal.steelArea * 1e6, 4)} mm²</dd><dt>Status</dt><dd><span class="status-text ${esc(proposal.overall)}" data-testid="proposal-overall">${esc(statusLabel(proposal.overall))}</span></dd></dl>${open.length ? `<p class="design-note">Still open: ${open.map((c) => `${esc(c.name)} ${esc(statusLabel(c.status))}`).join(" · ")}.</p>` : ""}<small>${proposal.candidatesEvaluated} arrangements evaluated: Ø12–40 bars, 2–6 along each face, the smallest link meeting 9.5.3 at the largest 25 mm spacing within s<sub>cl,tmax</sub>. ${esc(proposal.basis.acceptance)}.</small><button type="button" id="preview-apply-proposal">Apply proposal to the draft</button></article>`;
  }
  const open = proposal.checks.filter((c) => c.status !== "pass");
  return `<article class="design-proposal" data-testid="proposal"><h4>Reinforcement proposal · least steel</h4><dl class="design-provenance-grid"><dt>Top</dt><dd data-testid="proposal-top">${v.topBarCount} Ø${mm(v.topBarDiameter)}</dd><dt>Bottom</dt><dd data-testid="proposal-bottom">${v.bottomBarCount} Ø${mm(v.bottomBarDiameter)}</dd><dt>Links</dt><dd data-testid="proposal-links">Ø${mm(v.linkDiameter)} @ ${mm(v.linkSpacing)} mm</dd><dt>Steel</dt><dd>${pretty(proposal.massPerMetre, 3)} kg/m</dd><dt>Status</dt><dd><span class="status-text ${esc(proposal.overall)}" data-testid="proposal-overall">${esc(statusLabel(proposal.overall))}</span></dd></dl>${open.length ? `<p class="design-note">Still open: ${open.map((c) => `${esc(c.name)} ${esc(statusLabel(c.status))}`).join(" · ")}.</p>` : ""}<small>${proposal.candidatesEvaluated} arrangements evaluated: Ø10–32 bars, 2–8 per face, Ø8–12 links at 75–300 mm; width, depth, cover, legs, materials and code inputs as drafted. ${esc(proposal.basis.acceptance)}.</small><button type="button" id="preview-apply-proposal">Apply proposal to the draft</button></article>`;
}
const statusLabel = (s) =>
  s === "notApplicable" ? "N/A" : String(s).toUpperCase();
const utilisationOf = (checks) => {
  const u = checks
    .map((c) => c.utilisation)
    .filter((v) => typeof v === "number");
  return u.length ? pretty(Math.max(...u), 3) : "—";
};
/** Plan of the base with the solved ULS contact polygon and corner pressures. */
function contactDrawing(run, d) {
  const k = run?.codeProfilePreview?.design?.uls?.contact;
  if (!k) return "";
  const { length: L, width: B } = d.inputs;
  const s = 200 / Math.max(L, B),
    ox = 150,
    oy = 110;
  const pt = ([x, y]) => `${ox + x * s},${oy - y * s}`;
  const base = [
    [-L / 2, -B / 2],
    [L / 2, -B / 2],
    [L / 2, B / 2],
    [-L / 2, B / 2],
  ];
  const label = (i, [x, y]) =>
    `<text x="${ox + x * s}" y="${oy - y * s + (y < 0 ? 14 : -4)}" text-anchor="middle" font-size="10">${pretty(k.corners[i] / 1000, 3)} kPa</text>`;
  return `<svg class="section-drawing" viewBox="0 0 300 230" data-testid="footing-contact"><polygon points="${base.map(pt).join(" ")}" fill="none" stroke="#796f58"/><polygon points="${k.contactPolygon.map(pt).join(" ")}" fill="#e4dfd4" stroke="#516b82"/>${base.map((c, i) => label(i, c)).join("")}<text x="150" y="226" text-anchor="middle" font-size="10">${esc(k.state)} contact · plan, X right, Y up</text></svg><p class="design-note">Rigid base on tensionless ground under the column actions alone; tension is never treated as contact.</p>`;
}

/** EC2 slab (ADR 0029): the designed meshes and every check. */
export function ec2SlabPane(run) {
  const cp = run?.codeProfilePreview;
  const banner = cp?.profileEnabled
    ? `<p class="design-note" data-testid="ec2-banner"><b>DEMONSTRATION</b> · ${esc(cp.edition)} · ${esc((cp.unreconciledAmendments || []).join(", "))} not reconciled · ${esc(cp.certification)}.</p>`
    : "";
  if (!cp)
    return `<h4>EC2 checks</h4>${banner}<p>Run the plate analysis to evaluate.</p>`;
  if (cp.status !== "evaluated")
    return `<h4>EC2 checks</h4>${banner}<p data-testid="ec2-status">Unavailable · ${esc(cp.reason || "")}</p>`;
  const units = {
    N: [1e-3, "kN"],
    "N m": [1e-3, "kN·m"],
    m2: [1e6, "mm²/m"],
    MPa: [1, "MPa"],
    "-": [1, ""],
  };
  const val = (v, u) => {
    if (v == null) return "—";
    const [k, unit] = units[u] || [1, u];
    return `${pretty(v * k, 3)}${unit ? ` ${unit}` : ""}`;
  };
  const layers = ["bottomX", "bottomY", "topX", "topY"]
    .map((k) => {
      const l = cp.layers[k];
      return `<tr data-testid="slab-layer" data-layer="${k}"><th scope="row">${k}</th><td>${l ? `Ø${pretty(l.diameter * 1000)} at ${pretty(l.spacing * 1000)} mm` : "Not required"}</td><td>${l ? `${pretty(l.area * 1e6, 4)} mm²/m` : "—"}</td><td>${l ? `${pretty(l.effectiveDepth * 1000, 3)} mm` : "—"}</td></tr>`;
    })
    .join("");
  const rows = cp.checks
    .map(
      (c) =>
        `<tr data-testid="ec2-check" data-check-id="${esc(c.checkId)}"><td>${esc(c.checkId.replace(/^ec2\./, ""))}</td><td>${esc(c.clause)}</td><td><span class="status-text ${esc(c.status)}">${esc(c.status.toUpperCase())}</span></td><td>${val(c.demand, c.units)}</td><td>${val(c.resistance, c.units)}</td><td>${c.utilisation == null ? "—" : pretty(c.utilisation, 3)}</td><td>${esc(c.message)}</td></tr>`,
    )
    .join("");
  return `<h4>EC2 slab · ${esc(cp.ndp)}</h4>${banner}<table><thead><tr><th>Layer</th><th>Mesh</th><th>A<sub>s,prov</sub></th><th>d</th></tr></thead><tbody>${layers}</tbody></table><p class="design-note">${esc(cp.reinforcementMap.basis)}.</p><table><thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>Resistance / limit</th><th>Util.</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table><ul class="design-note">${cp.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

/** EC2 pad footing (ADR 0028): contact, the designed bars and every check. */
export function ec2FootingPane(run) {
  const cp = run?.codeProfilePreview;
  const banner = cp?.profileEnabled
    ? `<p class="design-note" data-testid="ec2-banner"><b>DEMONSTRATION</b> · ${esc(cp.edition)} · ${esc((cp.unreconciledAmendments || []).join(", "))} not reconciled · ${esc(cp.certification)}.</p>`
    : "";
  if (!cp)
    return `<h4>EC2 checks</h4>${banner}<p>Run the preview on model actions to evaluate.</p>`;
  if (cp.status !== "evaluated")
    return `<h4>EC2 checks</h4>${banner}<p data-testid="ec2-status">Unavailable · ${esc(cp.reason || "")}</p>`;
  const units = {
    N: [1e-3, "kN"],
    "N m": [1e-3, "kN·m"],
    m2: [1e6, "mm²"],
    m: [1e3, "mm"],
    Pa: [1e-3, "kPa"],
    "-": [1, ""],
  };
  const val = (v, u) => {
    if (v == null) return "—";
    const [k, unit] = units[u] || [1, u];
    return `${pretty(v * k, 3)}${unit ? ` ${unit}` : ""}`;
  };
  const bars = (b, axis) =>
    b
      ? `<dt>Bottom bars along ${axis}</dt><dd data-testid="footing-bars-${axis.toLowerCase()}">${b.count} Ø${pretty(b.diameter * 1000)} at ${pretty(b.spacing * 1000, 3)} mm · d = ${pretty(b.effectiveDepth * 1000, 3)} mm</dd>`
      : "";
  const rows = cp.checks
    .map(
      (c) =>
        `<tr data-testid="ec2-check" data-check-id="${esc(c.checkId)}"><td>${esc(c.checkId.replace(/^ec2\./, ""))}</td><td>${esc(c.clause)}</td><td><span class="status-text ${esc(c.status)}">${esc(c.status.toUpperCase())}</span></td><td>${val(c.demand, c.units)}</td><td>${val(c.resistance, c.units)}</td><td>${c.utilisation == null ? "—" : pretty(c.utilisation, 3)}</td><td>${esc(c.message)}</td></tr>`,
    )
    .join("");
  return `<h4>EC2 pad footing · ${esc(cp.ndp)}</h4>${banner}<p class="source-key">N ${val(cp.actions.n, "N")} · Mx ${val(cp.actions.mx, "N m")} · My ${val(cp.actions.my, "N m")} · ${esc(cp.combinationId)}${cp.bearingCombinationId ? ` · bearing ${esc(cp.bearingCombinationId)}` : ""}</p><dl class="design-provenance-grid">${bars(cp.barsX, "X")}${bars(cp.barsY, "Y")}</dl><table><thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>Resistance / limit</th><th>Util.</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table><ul class="design-note">${cp.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

/** EC2 column checks (ADR 0027): slenderness and design moments per axis,
 * then every check with clause, demand, resistance and utilisation. */
export function ec2ColumnPane(run) {
  const cp = run?.codeProfilePreview;
  const banner = cp?.profileEnabled
    ? `<p class="design-note" data-testid="ec2-banner"><b>DEMONSTRATION</b> · ${esc(cp.edition)} · ${esc((cp.unreconciledAmendments || []).join(", "))} not reconciled · ${esc(cp.certification)}.</p>`
    : "";
  if (!cp)
    return `<h4>EC2 checks</h4>${banner}<p>Run the preview on model actions to evaluate.</p>`;
  if (cp.status !== "evaluated")
    return `<h4>EC2 checks</h4>${banner}<p data-testid="ec2-status">Unavailable · ${esc(cp.reason || "")}</p>`;
  const units = {
    N: [1e-3, "kN"],
    "N m": [1e-3, "kN·m"],
    m2: [1e6, "mm²"],
    m: [1e3, "mm"],
    "-": [1, ""],
  };
  const val = (v, u) => {
    if (v == null) return "—";
    const [k, unit] = units[u] || [1, u];
    return `${pretty(v * k, 3)}${unit ? ` ${unit}` : ""}`;
  };
  const biax = cp.checks.find((c) => c.checkId === "ec2.column.biaxial.y");
  const axes = biax?.intermediates?.y
    ? ["y", "z"]
        .map((a) => {
          const x = biax.intermediates[a];
          return `<tr data-testid="ec2-column-axis" data-axis="${a}"><th scope="row">About ${a}</th><td>${pretty(x.l0, 3)} m</td><td data-testid="ec2-lambda">${pretty(x.lambda, 3)}</td><td>${x.lambdaLim == null ? "—" : pretty(x.lambdaLim, 3)}</td><td>${x.slender ? "Yes" : "No"}</td><td>${pretty(x.ei * 1000, 3)} mm</td><td>${pretty(x.e0 * 1000, 3)} mm</td><td>${pretty(x.e2 * 1000, 3)} mm</td><td>${val(x.mEdWithImperfection, "N m")}</td></tr>`;
        })
        .join("")
    : "";
  const rows = cp.checks
    .map(
      (c) =>
        `<tr data-testid="ec2-check" data-check-id="${esc(c.checkId)}"><td>${esc(c.checkId.replace(/^ec2\./, ""))}</td><td>${esc(c.clause)}</td><td><span class="status-text ${esc(c.status)}">${esc(c.status.toUpperCase())}</span></td><td>${val(c.demand, c.units)}</td><td>${val(c.resistance, c.units)}</td><td>${c.utilisation == null ? "—" : pretty(c.utilisation, 3)}</td><td>${esc(c.message)}</td></tr>`,
    )
    .join("");
  return `<h4>EC2 column checks · ${esc(cp.ndp)}</h4>${banner}<p class="source-key">N<sub>Ed</sub> ${val(cp.actions.nEd, "N")} (compression) · end My ${cp.actions.myEnds.map((m) => val(m, "N m")).join(" / ")} · end Mz ${cp.actions.mzEnds.map((m) => val(m, "N m")).join(" / ")} · ${esc(cp.combinationId)}${cp.transverseLoad ? " · loads along the member (r<sub>m</sub> = 1)" : ""}</p>${axes ? `<table><thead><tr><th>Direction</th><th>l<sub>0</sub></th><th>λ</th><th>λ<sub>lim</sub></th><th>Slender</th><th>e<sub>i</sub></th><th>e<sub>0</sub></th><th>e<sub>2</sub></th><th>M<sub>Ed</sub></th></tr></thead><tbody>${axes}</tbody></table>` : ""}<table><thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>Resistance / limit</th><th>Util.</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table><ul class="design-note">${cp.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}
export function previewPane({ run, state, d, pane, checkIndex, sketch }) {
  const checks = run?.checks || [],
    source = run?.sourceProvenance;
  const summary = `<div class="design-summary-grid"><article class="design-verdict ${state.toLowerCase()}"><div class="verdict-symbol">${state === "STALE" ? "◷" : state === "PASS" ? "✓" : state === "FAIL" ? "✕" : "△"}</div><div><small>OVERALL DESIGN</small><strong data-testid="preview-state">${state}</strong><p>${designNames[d.kind]}</p><span>Utilisation <b data-testid="preview-utilisation">${utilisationOf(checks)}</b></span><small>${run?.codeProfile ? `${esc(run.codeProfile.edition)} · DEMONSTRATION` : "No verified resistance"}</small></div></article><div class="design-check-matrix"><table><thead><tr><th>Check</th><th>Status</th><th>Util.</th></tr></thead><tbody>${checks.map((c, i) => `<tr data-testid="preview-check-row" data-check="${esc(c.name)}"><td><button class="check-link" data-preview-check="${i}">${esc(c.name)}</button></td><td><span class="status-text ${esc(c.status)}">${esc(statusLabel(c.status))}</span></td><td>${c.utilisation == null ? "—" : pretty(c.utilisation, 3)}</td></tr>`).join("")}</tbody></table>${!run ? "<p>Run a preview to record actions and unavailable checks.</p>" : ""}</div><aside class="design-notes"><h4>Design basis</h4><p class="design-note" data-testid="design-basis">${run?.codeProfile ? `DEMONSTRATION — ${esc(run.codeProfile.id === "aisc-360-22-lrfd" ? `${run.codeProfile.standard} ` : "")}${esc(run.codeProfile.edition)}; ${(run.codeProfile.unreconciledAmendments || []).length ? `${esc(run.codeProfile.unreconciledAmendments.join(", "))} not reconciled; ` : ""}${esc(run.codeProfile.certification)}.` : "MOCK WORKFLOW — no code-compliance claim."}</p><p>Actions: <b>${source?.mock ? "SYNTHETIC FIXTURE" : source?.kind === "plateAnalysis" ? "Plate analysis (plate-v1)" : source ? "Actual model analysis" : "Not captured"}</b></p><p>Code profile: ${run?.codeProfile ? esc(run.codeProfile.id) : "unavailable"}</p>${d.kind === "padFooting" ? `<p>Contact: <b data-testid="footing-contact-state">${esc(String(run?.contactState || "indeterminate").toUpperCase())}</b></p><p>Soil bearing input: ${esc(run?.soilProvenance?.source || d.inputSources?.bearingPressure || d.inputSource)}; never computed by Workbench.</p>` : ""}</aside>${proposalPanel(run?.reinforcementProposal)}</div>`;
  if (pane === "summary") return summary;
  if (pane === "mechanics") return mechanicsPane(run);
  if (pane === "ec2")
    return d.kind === "rcColumn"
      ? ec2ColumnPane(run)
      : d.kind === "padFooting"
        ? ec2FootingPane(run)
        : d.kind === "slab"
          ? ec2SlabPane(run)
          : ec2Pane(run);
  if (pane === "reinforcement")
    return `<div class="reinforcement-layout"><article><h4>${d.kind === "rcBeam" ? "Longitudinal reinforcement layout" : "Reinforcement plan"} <small>· illustration only</small></h4>${d.kind === "rcBeam" ? beamElevation(d) : `<svg class="design-drawing" viewBox="0 0 300 230">${sketch}</svg>`}<p class="design-note">Preference illustration · not a verified arrangement or construction drawing.</p></article><article><h4>${d.kind === "rcBeam" ? "Cross-section" : "Geometry and layers"}</h4><svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p>Cover ${pretty(d.inputs.cover * 1000)} mm · fit, spacing and anchorage unverified.</p></article></div>`;
  if (pane === "schedule") {
    const len = (v) => (v == null ? "—" : `${pretty(v * 1000)} mm`);
    const kg = (v) => (v == null ? "—" : `${pretty(v, 3)} kg`);
    const rows = run?.schedule || [];
    const total =
      rows.every((r) => r.massKg != null) && rows.length
        ? rows.reduce((a, r) => a + r.massKg, 0)
        : null;
    return `<h4>Bar schedule · indicative</h4><table><thead><tr><th>Mark</th><th>Region</th><th>Shape</th><th>Bar</th><th>Qty</th><th>Cut length</th><th>Mass</th><th>Basis</th></tr></thead><tbody>${rows.map((r) => `<tr data-testid="schedule-row" data-mark="${esc(r.mark)}"><td>${esc(r.mark)}</td><td>${esc(r.region)}</td><td>${esc(r.shape || "")}</td><td>Ø${pretty(r.diameter * 1000)} mm</td><td>${r.quantity ?? "—"}</td><td>${len(r.cutLength)}</td><td>${kg(r.massKg)}</td><td>${esc(r.basis || "")}</td></tr>`).join("")}</tbody>${total == null ? "" : `<tfoot><tr><td colspan="6">Total</td><td data-testid="schedule-total">${kg(total)}</td><td></td></tr></tfoot>`}</table><p class="design-note">${rows.length ? "INDICATIVE — designed straight bars with no curtailment or laps; BS 8666 shape codes are not held. Not a fabrication schedule." : "A schedule is unavailable for this design object."}</p>`;
  }
  if (pane === "soil")
    return `<div class="reinforcement-layout"><article><h4>Soil / contact</h4>${contactDrawing(run, d) || `<svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p class="design-note">Contact INDETERMINATE · run on model actions to solve the ground contact.</p>`}</article><article><h4>External soil inputs</h4><dl class="design-provenance-grid"><dt>Allowable bearing input</dt><dd>${pretty(d.inputs.bearingPressure / 1000)} kPa</dd><dt>Origin</dt><dd>${esc(sourceLabel(d.inputSources?.bearingPressure || d.inputSource))}</dd><dt>Reference</dt><dd>${esc(d.soilReference)}</dd><dt>Workbench soil capacity</dt><dd>Not calculated</dd>${(() => {
      const k = run?.codeProfilePreview?.design?.uls?.contact;
      return k
        ? `<dt>q<sub>min</sub> / q<sub>max</sub> (ULS, column only)</dt><dd data-testid="footing-qmax">${pretty(k.qMin / 1000, 4)} / ${pretty(k.qMax / 1000, 4)} kPa</dd><dt>Contact area</dt><dd>${pretty(k.contactArea, 4)} m² (${pretty(100 * k.contactFraction, 3)} %)</dd>`
        : "<dt>q<sub>min</sub> / q<sub>max</sub></dt><dd>Unavailable</dd><dt>Contact area</dt><dd>Unavailable</dd>";
    })()}</dl></article></div>`;
  if (pane === "details") {
    const c = checks[checkIndex] || checks[0];
    return `<div class="calculation-layout"><nav aria-label="Concrete calculation checks">${checks.map((c, i) => `<button class="${i === checkIndex ? "active" : ""}" data-preview-check="${i}">△ ${esc(c.name)}</button>`).join("")}</nav><article><h3>${esc(c?.name || "Calculation details")}</h3><span class="status-text ${esc(c?.status || "unsupported")}">${esc(statusLabel(c?.status || "unsupported"))}</span><p>${esc(c?.reason || "No recorded check.")}</p><dl class="design-provenance-grid"><dt>Demand</dt><dd>${run?.codeProfile ? "Per station in the EC2 checks tab" : "See recorded upstream actions"}</dd><dt>Resistance</dt><dd>${run?.codeProfile ? "Per station in the EC2 checks tab" : "Unavailable"}</dd><dt>Clause / code profile</dt><dd>${run?.codeProfile ? `${esc(run.codeProfile.id)} · ${esc(run.codeProfile.edition)}` : "Unavailable"}</dd><dt>Utilisation</dt><dd>${c?.utilisation == null ? "—" : pretty(c.utilisation, 3)}</dd></dl>${run ? provenanceTable(run) : ""}</article></div>`;
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
