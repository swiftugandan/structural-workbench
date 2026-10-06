/** Single-plate steel connection drafts (M13, ADR 0030): inspector, the
 * dimensioned drawing, the AISC limit states, the bill of materials and the
 * end actions. Every value shown comes from the Rust run; the inspector sketch
 * before a run is a labelled schematic of the entered inputs. */
import { escape as esc } from "./reports/report.js";
import { entityLabel } from "./entity-labels.js";
import { designNames, fieldRows, pretty } from "./design-presentation.js";
import { previewIdentity } from "./selection-context.js";
import { connectionDrawing } from "./connection-drawing.js";
export { connectionDrawing };

const mm = (v) => `${pretty(v * 1000, 1)} mm`;
const kN = (v) => `${pretty(v / 1000, 2)} kN`;
const statusText = (s) => String(s || "unsupported").toUpperCase();

/** Format a check value by its units (SI from Rust). */
function quantity(v, units) {
  if (v == null) return "—";
  if (units === "N") return kN(v);
  if (units === "N m") return `${pretty(v / 1000, 2)} kN·m`;
  if (units === "m") return mm(v);
  return pretty(v, 3);
}

/** Members meeting the beam's chosen end node (presentation only; Rust
 * validates the binding). */
function supportCandidates(project, beamId, end) {
  const beam = project.members.find((m) => m.id === beamId);
  if (!beam) return [];
  const node = end === "start" ? beam.start : beam.end;
  return project.members.filter(
    (m) => m.id !== beam.id && (m.start === node || m.end === node),
  );
}

function supportOptions(project, beamId, end, selected) {
  const list = supportCandidates(project, beamId, end);
  return `<option value="">Choose the supporting member</option>${list.map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? "selected" : ""}>${esc(entityLabel(project, m.id))}${m.steelDesign ? ` · ${esc(m.steelDesign.sectionRef.split(":").pop())}` : " · no steel section"}</option>`).join("")}`;
}

const select = (id, label, options, value) =>
  `<label class="design-field"><span>${label}</span><select id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;

/** The schematic in the inspector: proportions of the entered inputs. */
export function connectionSketch(d) {
  const v = d.inputs;
  const n = v.rows,
    cols = v.columns;
  const l = 2 * v.lev + (n - 1) * v.pitch;
  const w = v.a + (cols === 2 ? v.gauge : 0) + v.lehPlate;
  const s = Math.min(150 / Math.max(w, 0.05), 170 / Math.max(l, 0.05));
  const x0 = 70,
    y0 = 30;
  const holes = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < cols; j++)
      holes.push(
        `<circle cx="${x0 + s * (v.a + j * v.gauge)}" cy="${y0 + s * (v.lev + i * v.pitch)}" r="4" fill="#fff" stroke="#1167a2"/>`,
      );
  return `<rect x="${x0 - 14}" y="10" width="14" height="210" fill="#9aa8b6"/><rect x="${x0}" y="${y0}" width="${s * w}" height="${s * l}" fill="#dce6ef" stroke="#516b82"/>${holes.join("")}<text x="150" y="226" text-anchor="middle">Schematic of the inputs · run for the dimensioned drawing</text>`;
}

/** The inspector of a single-plate connection draft. */
export function connectionInspector({ d, templates, ds, active, ctx }) {
  const t = templates.find((t) => t.kind === d.kind),
    c = d.connection || {},
    p = ctx.project;
  const steelMembers = p.members.filter((m) => m.steelDesign);
  const chooser = `<select id="preview-active" aria-label="Active design object">${ds.map((item) => `<option value="${esc(item.id)}" ${item.id === active ? "selected" : ""}>${esc(previewIdentity(p, item).text)}</option>`).join("")}</select>`;
  const create = `<details class="design-create"><summary>＋ Create a design object</summary><div class="design-inline"><select id="preview-kind" aria-label="New draft type">${templates.map((t) => `<option value="${t.kind}">${t.name}</option>`).join("")}</select><button id="preview-create">Create draft</button></div></details>`;
  const braced =
    c.bracedAgainstRotation === true
      ? "yes"
      : c.bracedAgainstRotation === false
        ? "no"
        : "";
  return `<div class="design-object-title"><div><small>SELECTED ${designNames[d.kind].toUpperCase()}</small><h2>${esc(previewIdentity(p, d).text)}<span class="design-tag">AISC 360-22 LRFD · demonstration</span></h2></div>${chooser}</div>
 <p class="design-note">A shop-welded single plate (fin plate) bolted to an uncoped W beam web: a simple connection. The beam's exact end actions from the current analysis are the demand.</p>
 <form id="preview-form"><section class="design-section"><h3>1. Beam end and support</h3><div class="design-section-sketch"><svg viewBox="0 0 300 230" aria-label="Connection schematic">${connectionSketch(d)}</svg><div>
 <label class="design-field"><span>Beam</span><select id="preview-target"><option value="">No model binding</option>${p.members.map((m) => `<option value="${esc(m.id)}" ${d.targetId === m.id ? "selected" : ""}>${esc(entityLabel(p, m.id))}${m.steelDesign ? ` · ${esc(m.steelDesign.sectionRef.split(":").pop())}` : ""}</option>`).join("")}</select></label>
 ${select(
   "conn-end",
   "Connected end",
   [
     ["start", "Start node"],
     ["end", "End node"],
   ],
   c.end || "end",
 )}
 <label class="design-field"><span>Supporting member</span><select id="conn-support">${supportOptions(p, d.targetId, c.end || "end", c.supportMemberId)}</select></label>
 ${select("conn-kind", "Plate welded to", t.connection.supportKinds, c.supportKind || "columnFlange")}
 ${steelMembers.length ? "" : '<small class="notice-small">Assign catalogue W sections to the beam and its support in Steel design first.</small>'}</div></div></section>
 <section class="design-section"><h3>2. Bolts</h3>${select(
   "conn-bolt",
   "Bolt size",
   t.connection.bolts.map((b) => [b, b.startsWith("M") ? b : `${b} in.`]),
   c.bolt || "3/4",
 )}${select("conn-group", "Bolt group", t.connection.boltGroups, c.boltGroup || "group120")}
 <label class="design-check"><input type="checkbox" id="conn-threads" ${c.threadsExcluded ? "checked" : ""}> Threads excluded from the shear plane (X)</label>
 <label class="design-check"><input type="checkbox" id="conn-deformation" ${c.deformationConsidered !== false ? "checked" : ""}> Hole deformation at service load is a design consideration (J3-6a/c)</label>
 ${fieldRows(d, t, ["rows", "columns", "pitch", "gauge"])}</section>
 <section class="design-section"><h3>3. Plate and weld</h3>${fieldRows(d, t, ["plateThickness", "plateFy", "plateFu", "lev", "lehPlate", "a", "topOffset", "weldSize", "fexx"])}<small class="source-key">S · starter value &nbsp; U · user input. Standard holes, bearing-type, snug-tight.</small></section>
 <section class="design-section"><h3>4. Beam</h3>${fieldRows(d, t, ["lehBeam", "underrun"])}
 ${select(
   "conn-braced",
   "Beam braced against rotation about its axis",
   [
     ["", "Not confirmed"],
     ["yes", "Yes"],
     ["no", "No"],
   ],
   braced,
 )}
 <small>Your confirmation, never assumed: unconfirmed, the plate interaction checks are INDETERMINATE.</small>
 <div class="design-form-actions"><button id="preview-save">Save inputs</button><button type="button" id="preview-cancel">Cancel edits</button></div></section></form>
 <section class="design-section"><h3>5. Design actions and readiness</h3><label class="design-field"><span>Action source</span><select id="preview-source"><option value="synthetic">Synthetic fixture · MOCK</option><option value="model">Current model case / combination</option></select></label><div class="readiness-grid"><span>${c.supportMemberId ? "✓" : "△"} Support chosen</span><span>✓ AISC 360-22 LRFD · demonstration</span><span>△ Moment must be released at this end</span><span>△ Bolt lengths by the fabricator</span></div><p id="preview-readiness" class="source-key"></p><button class="primary" id="preview-run">Run connection check</button></section>
 <p class="design-note">AISC 360-22 LRFD DEMONSTRATION · general (extended-configuration) method from the Specification and the Manual equations reproduced in the held Design Examples v16; not a certified design.</p>${create}<button id="preview-delete" class="design-delete">Delete this draft</button><p id="preview-error" role="alert"></p>`;
}

/** Keep the support choices in step with the beam and end (presentation). */
export function bindConnectionInspector(host, project, d) {
  const refresh = () => {
    const target = host.querySelector("#preview-target")?.value;
    const end = host.querySelector("#conn-end")?.value;
    const current = host.querySelector("#conn-support")?.value;
    host.querySelector("#conn-support").innerHTML = supportOptions(
      project,
      target,
      end,
      current,
    );
  };
  for (const id of ["#preview-target", "#conn-end"])
    host.querySelector(id)?.addEventListener("change", refresh);
}

/** The connection block of SetDesignPreview. */
export function readConnection(host) {
  const v = (id) => host.querySelector(id)?.value;
  const braced = v("#conn-braced");
  return {
    end: v("#conn-end"),
    ...(v("#conn-support") ? { supportMemberId: v("#conn-support") } : {}),
    supportKind: v("#conn-kind"),
    bolt: v("#conn-bolt"),
    boltGroup: v("#conn-group"),
    threadsExcluded: host.querySelector("#conn-threads").checked,
    deformationConsidered: host.querySelector("#conn-deformation").checked,
    ...(braced ? { bracedAgainstRotation: braced === "yes" } : {}),
  };
}

/** Every limit state of the run, with clause, demand and resistance. */
export function connectionChecksPane(run) {
  const code = run?.codeProfilePreview;
  if (!code || code.status !== "evaluated")
    return `<p data-testid="conn-unavailable">${esc(code?.reason || "Run the connection check on the current model case or combination.")}</p>`;
  const rows = code.checks
    .map(
      (c) =>
        `<tr data-testid="conn-check" data-check="${esc(c.checkId)}" data-status="${esc(c.status)}"><td>${esc(c.checkId.replace("connection.", ""))}</td><td>${esc(c.clause)}</td><td data-si="${c.demand ?? ""}">${quantity(c.demand, c.units)}</td><td data-si="${c.resistance ?? ""}">${quantity(c.resistance, c.units)}</td><td>${c.utilisation == null ? "—" : pretty(c.utilisation, 3)}</td><td><span class="status-text ${esc(c.status)}">${statusText(c.status)}</span></td><td>${esc(c.message)}</td></tr>`,
    )
    .join("");
  const group = code.checks.find((c) => c.checkId === "connection.boltGroup");
  const bolts = group?.intermediates?.perBolt
    ? `<h4>Bolts · effective strength per bolt (φr<sub>n</sub>)</h4><table><thead><tr><th>Row</th><th>Line</th><th>Shear</th><th>Plate bearing</th><th>Plate tearout</th><th>Web bearing</th><th>Web tearout</th><th>Governs</th></tr></thead><tbody>${group.intermediates.perBolt.map((b) => `<tr data-testid="conn-bolt-row"><td>${b.row}</td><td>${b.line}</td><td>${kN(b.phiRnShear)}</td><td>${kN(b.phiRnPlateBearing)}</td><td>${kN(b.phiRnPlateTearout)}</td><td>${kN(b.phiRnWebBearing)}</td><td>${b.phiRnWebTearout == null ? "n/a (flange)" : kN(b.phiRnWebTearout)}</td><td>${esc(b.governs)}</td></tr>`).join("")}</tbody></table><p class="design-note">Instantaneous centre: C = <b data-testid="conn-c">${pretty(group.intermediates.C, 4)}</b> for ${group.intermediates.bolts} bolts at e = ${mm(group.intermediates.eccentricity)} (Crawford–Kulak); φR<sub>n</sub> = (C/n) Σ φr<sub>n,i</sub>.</p>`
    : "";
  return `<h4>AISC 360-22 LRFD limit states <span class="design-tag">DEMONSTRATION</span></h4><table class="conn-checks"><thead><tr><th>Limit state</th><th>Clause</th><th>Demand</th><th>Resistance</th><th>Util.</th><th>Status</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table>${bolts}`;
}

/** The bill of materials of the run. */
export function connectionBill(run) {
  const rows = run?.schedule || [];
  if (!rows.length)
    return "<p>A bill of materials follows an evaluated connection check.</p>";
  return `<h4>Bill of materials</h4><table><thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Mass</th><th>Note</th></tr></thead><tbody>${rows.map((r) => `<tr data-testid="conn-bill-row" data-item="${esc(r.item)}"><td>${esc(r.item)}</td><td>${esc(r.description)}</td><td>${r.quantity}</td><td>${r.massKg == null ? "—" : `${pretty(r.massKg, 3)} kg`}</td><td>${esc(r.material || r.note || "")}</td></tr>`).join("")}</tbody></table><p class="design-note">Quantities and sizes derive from the connection inputs. Bolt lengths, shop tolerances and welding procedures are the fabricator's.</p>`;
}

/** The end actions and the connection's free body. */
export function connectionActions(run) {
  const code = run?.codeProfilePreview;
  if (!code?.actions) return "<p>No model actions captured yet.</p>";
  const a = code.actions,
    fb = code.freeBody;
  return `<h4>Beam end actions · ${esc(code.end)} of the bound beam</h4><table><thead><tr><th>V</th><th>N</th><th>M (major)</th><th>V minor</th><th>M minor</th><th>T</th></tr></thead><tbody><tr data-testid="conn-actions"><td data-si="${a.V}">${kN(a.V)}</td><td data-si="${a.N}">${kN(a.N)}</td><td data-si="${a.M}">${pretty(a.M / 1000, 3)} kN·m</td><td>${kN(a.Vminor)}</td><td>${pretty(a.Mminor / 1000, 3)} kN·m</td><td>${pretty(a.T / 1000, 3)} kN·m</td></tr></tbody></table><p class="design-note">${esc(a.convention)}</p><h4>Free body</h4><table><thead><tr><th>Section</th><th>V</th><th>N</th><th>M</th></tr></thead><tbody>${[
    ["Bolt group centroid", fb.boltGroupCentroid],
    ["Bolt line at the support side", fb.boltLineNearSupport],
    ["Support face", fb.supportFace],
    ["Support reaction", fb.supportReaction],
  ]
    .map(
      ([k, f]) =>
        `<tr data-testid="conn-free-body"><td>${k}</td><td>${kN(f.V)}</td><td>${kN(f.N)}</td><td>${pretty(f.M / 1000, 3)} kN·m</td></tr>`,
    )
    .join("")}</tbody></table><p class="design-note">${esc(fb.note)}</p>`;
}
