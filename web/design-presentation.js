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
    ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(
        v,
      )
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
      ? ["barDiameter", "barCount", "linkDiameter", "linkSpacing"]
      : d.kind === "slab"
        ? ["meshSize"]
        : ["bearingPressure", "embedment", "soilUnitWeight"];
  return `<div class="design-object-title"><div><small>SELECTED ${designNames[d.kind].toUpperCase()}</small><h2>${esc(previewIdentity(ctx.project, d).text)}<span class="design-tag">Mock workflow</span></h2></div>${chooser}</div>
 <p class="design-note">Draft geometry is independent of analysis stiffness. The binding identifies the source of actions.</p>
 <form id="preview-form"><section class="design-section"><h3>1. Geometry and section</h3><div class="design-section-sketch"><svg viewBox="0 0 300 230" aria-label="Section sketch">${sketch}</svg><div>${fieldRows(d, t, geometry)}</div></div></section>
 <section class="design-section"><h3>2. Materials</h3>${fieldRows(d, t, ["concreteStrength", "rebarStrength"])}<small class="source-key">S · synthetic fixture &nbsp; U · user input. Strength inputs are not a code profile.</small>${mechanicsSection(d, t, mechanicsLaw)}</section>
 <section class="design-section"><h3>3. ${d.kind === "rcBeam" ? "Reinforcement preferences" : d.kind === "slab" ? "Mesh settings" : "Soil parameters"}</h3>${fieldRows(d, t, special)}${d.kind === "padFooting" ? `<label class="design-field full"><span>Geotechnical reference</span><textarea id="preview-soil" maxlength="512">${esc(d.soilReference)}</textarea></label><small>Bearing pressure is externally supplied, never calculated here.</small>` : ""}${d.kind === "slab" ? "<small>Target size only. A validated plate/shell mesh is unavailable.</small>" : ""}</section>
 <section class="design-section"><h3>4. Model binding</h3>${d.kind !== "slab" ? `<label class="design-field"><span>${d.kind === "rcBeam" ? "Member" : "Support"}</span><select id="preview-target"><option value="">No model binding</option>${ctx.project[d.kind === "rcBeam" ? "members" : "supports"].map((e) => `<option value="${e.id}" ${d.targetId === e.id ? "selected" : ""}>${esc(entityLabel(ctx.project, e.id))}</option>`).join("")}</select></label>` : "<p>Surface action fixture · frame forces cannot substitute for plate results.</p>"}<div class="design-form-actions"><button id="preview-save">Save inputs</button><button type="button" id="preview-cancel">Cancel edits</button></div></section></form>
 <section class="design-section"><h3>5. Design actions and readiness</h3><label class="design-field"><span>Action source</span><select id="preview-source"><option value="synthetic">Synthetic fixture · MOCK</option>${d.kind !== "slab" ? '<option value="model">Current model case / combination</option>' : ""}</select></label>${d.kind === "slab" ? `<label class="design-field"><span>Reinforcement layer</span><select id="preview-face">${["Top X", "Top Y", "Bottom X", "Bottom Y"].map((f) => `<option ${f === face ? "selected" : ""}>${f}</option>`).join("")}</select></label>` : ""}<div class="readiness-grid"><span>✓ Draft geometry recorded</span><span>△ Code profile unavailable</span><span>△ Reinforcement unverified</span><span>△ ${d.kind === "padFooting" ? "Contact indeterminate" : "Resistance unsupported"}</span></div><p id="preview-readiness" class="source-key"></p><button class="primary" id="preview-run">Run workflow preview</button></section>
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
  return `<svg class="design-drawing" viewBox="0 0 660 170" aria-label="Illustrative longitudinal reinforcement"><path d="M40 38H620V128H40Z" fill="#e7ecf1" stroke="#667a8c"/><path d="M43 46H617" stroke="#b44232" stroke-width="4"/><path d="M43 116H617" stroke="#286dbd" stroke-width="4"/>${Array.from({ length: 34 }, (_, i) => `<path d="M${48 + i * 17} 43V121" stroke="#718695"/>`).join("")}<path d="M45 129l-12 22h24ZM615 129l-12 22h24Z" fill="#546a7d"/><text x="60" y="25">Top preference · ${v.barCount} × Ø${pretty(v.barDiameter * 1000)} mm</text><text x="310" y="160">Links Ø${pretty(v.linkDiameter * 1000)} @ ${pretty(v.linkSpacing * 1000)} mm · fit unverified</text><text x="330" y="101">Bottom preference · ${v.barCount} × Ø${pretty(v.barDiameter * 1000)} mm</text></svg>`;
}
const strainText = (e) => `${pretty(e * 1000, 3)} ‰`;
export function mechanicsPane(run) {
  const sm = run?.sectionMechanics;
  const banner =
    '<p class="design-note"><b>MECHANICS ONLY</b> · Not a code resistance. No partial factors, limits or code checks applied. Overall design remains UNSUPPORTED.</p>';
  if (!sm)
    return `<h4>Section mechanics</h4>${banner}<p>Run the preview to evaluate section mechanics.</p>`;
  if (sm.status === "notConfigured")
    return `<h4>Section mechanics</h4>${banner}<p>${esc(sm.reason)}. Save the section-mechanics law in the inspector to evaluate it.</p>`;
  const fit = sm.rowFit
    ? `<dl class="design-provenance-grid"><dt>Bars per face</dt><dd>${pretty(sm.rowFit.area * 1e6, 0)} mm² per row</dd><dt>Clear spacing</dt><dd>${sm.rowFit.clearSpacing == null ? "Single bar" : pretty(sm.rowFit.clearSpacing * 1000, 1) + " mm"}</dd><dt>Minimum clear spacing (input)</dt><dd>${pretty(sm.inputs.minimumClearSpacing * 1000, 1)} mm · ${esc(sm.inputSources.minimumClearSpacing === "user" ? "User input" : "Synthetic fixture")}</dd><dt>Row fits</dt><dd data-testid="mechanics-fit">${sm.rowFit.fits ? "Yes" : "No"}</dd></dl>`
    : "";
  if (sm.status !== "evaluated")
    return `<h4>Section mechanics</h4>${banner}${fit}<p role="status" data-testid="mechanics-status">${esc(sm.status === "rowDoesNotFit" ? "Row does not fit" : "Unsupported")} · ${esc(sm.reason || "")}</p>`;
  const u = sm.ultimate,
    e = sm.elastic;
  const layers = u.layers
    .map(
      (l, i) =>
        `<tr><td>${i === 0 ? "Compression-face row" : "Tension-face row"}</td><td>${pretty(sm.layers[i].depth * 1000, 1)} mm</td><td>${strainText(l.strain)}</td><td>${pretty(l.steelStress / 1e6, 1)} MPa</td><td>${pretty(l.force / 1000, 1)} kN</td></tr>`,
    )
    .join("");
  return `<h4>Section mechanics · ${esc(sm.law === "rectangularBlock" ? "rectangular stress block" : "parabola-rectangle")}</h4>${banner}
 <div class="reinforcement-layout"><article><h4>Ultimate state (strain compatibility, N = 0)</h4><dl class="design-provenance-grid"><dt>Mechanical moment capacity</dt><dd data-testid="mechanics-moment">${pretty(u.moment / 1000, 2)} kN·m</dd><dt>Neutral-axis depth x</dt><dd>${pretty(u.neutralAxisDepth * 1000, 1)} mm</dd><dt>x / deepest layer</dt><dd>${pretty(u.depthRatio, 3)}</dd><dt>Tension steel</dt><dd>${u.classification === "tensionYielded" ? "Yielded" : "Elastic"}</dd><dt>Applies to</dt><dd>Sagging and hogging (equal rows at both faces)</dd></dl>
 <table><thead><tr><th>Layer</th><th>Depth from compression face</th><th>Strain</th><th>Steel stress</th><th>Net force</th></tr></thead><tbody>${layers}</tbody></table></article>
 <article><h4>Elastic section</h4><dl class="design-provenance-grid"><dt>Modular ratio</dt><dd>${pretty(e.modularRatio, 3)}</dd><dt>Uncracked I</dt><dd>${pretty((e.uncrackedInertia * 1e12) / 1e6, 1)} × 10⁶ mm⁴</dd><dt>Cracking moment</dt><dd>${pretty(e.crackingMoment / 1000, 2)} kN·m</dd><dt>Cracked neutral axis</dt><dd>${pretty(e.crackedNeutralAxis * 1000, 1)} mm</dd><dt>Cracked I</dt><dd>${pretty((e.crackedInertia * 1e12) / 1e6, 1)} × 10⁶ mm⁴</dd></dl>${fit}</article></div>
 <ul class="design-note">${sm.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}
export function previewPane({ run, state, d, pane, checkIndex, sketch }) {
  const checks = run?.checks || [],
    source = run?.sourceProvenance;
  const summary = `<div class="design-summary-grid"><article class="design-verdict ${state.toLowerCase()}"><div class="verdict-symbol">${state === "STALE" ? "◷" : "△"}</div><div><small>OVERALL DESIGN</small><strong data-testid="preview-state">${state}</strong><p>${designNames[d.kind]}</p><span>Utilisation <b>—</b></span><small>No verified resistance</small></div></article><div class="design-check-matrix"><table><thead><tr><th>Check</th><th>Status</th><th>Util.</th></tr></thead><tbody>${checks.map((c, i) => `<tr><td><button class="check-link" data-preview-check="${i}">${esc(c.name)}</button></td><td><span class="status-text unsupported">UNSUPPORTED</span></td><td>—</td></tr>`).join("")}</tbody></table>${!run ? "<p>Run a preview to record actions and unavailable checks.</p>" : ""}</div><aside class="design-notes"><h4>Design basis</h4><p class="design-note">MOCK WORKFLOW — no code-compliance claim.</p><p>Actions: <b>${source?.mock ? "SYNTHETIC FIXTURE" : source ? "Actual model analysis" : "Not captured"}</b></p><p>Code profile: unavailable</p>${d.kind === "padFooting" ? `<p>Contact: <b>INDETERMINATE</b></p><p>Soil bearing input: ${esc(run?.soilProvenance?.source || d.inputSources?.bearingPressure || d.inputSource)}; never computed by Workbench.</p>` : ""}</aside></div>`;
  if (pane === "summary") return summary;
  if (pane === "mechanics") return mechanicsPane(run);
  if (pane === "reinforcement")
    return `<div class="reinforcement-layout"><article><h4>${d.kind === "rcBeam" ? "Longitudinal reinforcement layout" : "Reinforcement plan"} <small>· illustration only</small></h4>${d.kind === "rcBeam" ? beamElevation(d) : `<svg class="design-drawing" viewBox="0 0 300 230">${sketch}</svg>`}<p class="design-note">Preference illustration · not a verified arrangement or construction drawing.</p></article><article><h4>${d.kind === "rcBeam" ? "Cross-section" : "Geometry and layers"}</h4><svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p>Cover ${pretty(d.inputs.cover * 1000)} mm · fit, spacing and anchorage unverified.</p></article></div>`;
  if (pane === "schedule")
    return `<h4>Bar schedule · illustrative preferences only</h4><table><thead><tr><th>Mark</th><th>Region</th><th>Bar</th><th>Qty/face</th><th>Cut length</th><th>Status</th></tr></thead><tbody>${(run?.schedule || []).map((r) => `<tr><td>${esc(r.mark)}</td><td>${esc(r.region)}</td><td>Ø${pretty(r.diameter * 1000)} mm</td><td>${r.quantityPerFace}</td><td>—</td><td>Unverified</td></tr>`).join("")}</tbody></table><p class="design-note">${run?.schedule.length ? "No fabrication lengths or verified quantities are available." : "A verified schedule is unavailable for this design object."}</p>`;
  if (pane === "soil")
    return `<div class="reinforcement-layout"><article><h4>Soil / contact</h4><svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p class="design-note">Contact INDETERMINATE · pressure contours are unavailable.</p></article><article><h4>External soil inputs</h4><dl class="design-provenance-grid"><dt>Allowable bearing input</dt><dd>${pretty(d.inputs.bearingPressure / 1000)} kPa</dd><dt>Origin</dt><dd>${esc(sourceLabel(d.inputSources?.bearingPressure || d.inputSource))}</dd><dt>Reference</dt><dd>${esc(d.soilReference)}</dd><dt>Workbench soil capacity</dt><dd>Not calculated</dd><dt>qmin / qmax</dt><dd>Unavailable</dd><dt>Contact area</dt><dd>Unavailable</dd></dl></article></div>`;
  if (pane === "details") {
    const c = checks[checkIndex] || checks[0];
    return `<div class="calculation-layout"><nav aria-label="Concrete calculation checks">${checks.map((c, i) => `<button class="${i === checkIndex ? "active" : ""}" data-preview-check="${i}">△ ${esc(c.name)}</button>`).join("")}</nav><article><h3>${esc(c?.name || "Calculation details")}</h3><span class="status-text unsupported">UNSUPPORTED</span><p>${esc(c?.reason || "No recorded check.")}</p><dl class="design-provenance-grid"><dt>Demand</dt><dd>See recorded upstream actions</dd><dt>Resistance</dt><dd>Unavailable</dd><dt>Clause / code profile</dt><dd>Unavailable</dd><dt>Utilisation</dt><dd>—</dd></dl>${run ? provenanceTable(run) : ""}</article></div>`;
  }
  return source
    ? `<h4>Design actions · ${source.mock ? "synthetic fixture" : "actual model analysis"}</h4>${
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
