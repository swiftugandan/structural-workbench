/**
 * The design-object inspector (ADR 0033): one frame for every kind (title,
 * chooser, create, delete) around the kind's body: the standard concrete form
 * from its descriptor, or the kind's own renderer.
 */
import { html, raw } from "../core/html.js";
import { entityLabel } from "../entity-labels.js";
import { previewIdentity } from "../selection-context.js";
import {
  codeInputsSection,
  fieldRows,
  mechanicsSection,
} from "../design-presentation.js";
import { CATALOGUE } from "./catalogue.js";
import { designKind } from "./registry.js";

const FACES = ["Top X", "Top Y", "Bottom X", "Bottom Y"];

function chooser(project, ds, active, d) {
  return html`<select id="preview-active" aria-label="Active design object"><option value="" ${d ? "" : "selected"}>Select a design object</option>${ds.map(
    (item) =>
      html`<option value="${item.id}" ${item.id === active ? "selected" : ""}>${previewIdentity(project, item).text}</option>`,
  )}</select>`;
}

function create(templates, open) {
  return html`<details class="design-create" ${open ? "open" : ""}><summary>＋ Create a design object</summary><div class="design-inline"><select id="preview-kind" aria-label="New draft type">${templates.map(
    (t) => html`<option value="${t.kind}">${t.name}</option>`,
  )}</select><button id="preview-create">Create draft</button></div></details>`;
}

/** The standard concrete form, driven by the descriptor's `inspector`. */
function standardBody({ d, kind, t, ctx, view, mechanicsLaw }) {
  const c = kind.inspector,
    p = ctx.project;
  const binding = kind.binds
    ? html`<label class="design-field"><span>${kind.binds === "supports" ? "Support" : "Member"}</span><select id="preview-target"><option value="">No model binding</option>${p[
        kind.binds
      ].map(
        (e) =>
          html`<option value="${e.id}" ${d.targetId === e.id ? "selected" : ""}>${entityLabel(p, e.id)}</option>`,
      )}</select></label>`
    : html`<p>The panel is analysed on its own under its entered pressure · frame forces never substitute for plate results.</p>`;
  const anchorage =
    c.anchorage &&
    html`<label class="design-check full"><input type="checkbox" id="preview-anchorage" ${d.tensionAnchorageConfirmed ? "checked" : ""}> I confirm the tension steel extends at least l<sub>bd</sub> + d beyond the checked sections</label><small>Your confirmation, never assumed. Unconfirmed, EC2 shear ignores this steel (ρ<sub>l</sub> = 0) and anchorage stays INDETERMINATE.</small>`;
  const soil =
    c.soilReference &&
    html`<label class="design-field full"><span>Geotechnical reference</span><textarea id="preview-soil" maxlength="512">${d.soilReference}</textarea></label><small>Bearing pressure is externally supplied, never calculated here.</small>`;
  const plate =
    c.plate &&
    html`<small>Target cell size of the structured plate mesh.</small>${c.plate(d, t)}`;
  const face =
    c.face &&
    html`<label class="design-field"><span>Reinforcement layer</span><select id="preview-face">${FACES.map(
      (f) => html`<option ${f === view.face ? "selected" : ""}>${f}</option>`,
    )}</select></label>`;
  return html`<p class="design-note">Draft geometry is independent of analysis stiffness. The binding identifies the source of actions.</p>
 <form id="preview-form"><section class="design-section"><h3>1. Geometry and section</h3><div class="design-section-sketch"><svg viewBox="0 0 300 230" aria-label="Section sketch">${kind.sketch(d, view)}</svg><div>${raw(fieldRows(d, t, c.geometry))}</div></div></section>
 <section class="design-section"><h3>2. Materials</h3>${raw(fieldRows(d, t, ["concreteStrength", "rebarStrength"]))}<small class="source-key">S · synthetic fixture &nbsp; U · user input. Strength inputs are not a code profile.</small>${c.mechanics && raw(mechanicsSection(d, t, mechanicsLaw))}</section>
 <section class="design-section"><h3>3. ${c.special.title}</h3>${raw(fieldRows(d, t, c.special.keys))}${anchorage}${raw(codeInputsSection(d, ctx, c.code))}${soil}${plate}</section>
 <section class="design-section"><h3>4. Model binding</h3>${binding}<div class="design-form-actions"><button id="preview-save">Save inputs</button><button type="button" id="preview-cancel">Cancel edits</button></div></section></form>
 <section class="design-section"><h3>5. Design actions and readiness</h3><label class="design-field"><span>Action source</span><select id="preview-source">${kind.sources.map(
   ([value, label]) => html`<option value="${value}">${label}</option>`,
 )}</select></label>${face}<div class="readiness-grid"><span>✓ Draft geometry recorded</span><span>✓ Code profile ${kind.profile.short}</span><span>△ Reinforcement unverified</span>${c.checklist.map((x) => html`<span>△ ${x}</span>`)}</div><p id="preview-readiness" class="source-key"></p><button class="primary" id="preview-run">Run workflow preview</button>${c.proposal && html`<button type="button" id="preview-propose" class="secondary">Propose reinforcement</button>`}</section>
 <p class="design-note">${kind.profile.basis}</p>`;
}

/**
 * The inspector for the active draft `d` (or the empty state). `view` holds
 * presentation state such as the slab face; `mechanicsLaw` the chosen law.
 */
export function designInspector({
  d,
  templates,
  ds,
  active,
  ctx,
  view,
  mechanicsLaw,
}) {
  const p = ctx.project;
  if (!d)
    return html`<div class="design-object-title"><small>DESIGN OBJECTS</small><h2>Select a design object</h2>${chooser(p, ds, active, d)}<p>Create a design object to open its workspace: ${CATALOGUE.map((k) => k.name.toLowerCase()).join(", ")}.</p></div>${create(templates, true)}<p class="design-note">Checks run under edition-labelled demonstration profiles (EC2 UK, AISC 360-22 LRFD); none is a certified design.</p><p id="preview-error" role="alert"></p>`;
  const kind = designKind(d.kind),
    t = templates.find((t) => t.kind === d.kind);
  const body = kind.inspector.render
    ? kind.inspector.render({ d, templates, ctx })
    : standardBody({ d, kind, t, ctx, view, mechanicsLaw });
  return html`<div class="design-object-title"><div><small>SELECTED ${kind.name.toUpperCase()}</small><h2>${previewIdentity(p, d).text}<span class="design-tag">${kind.profile.label}</span></h2></div>${chooser(p, ds, active, d)}</div>
 ${body}${create(templates, false)}<button id="preview-delete" class="design-delete">Delete this draft</button><p id="preview-error" role="alert"></p>`;
}
