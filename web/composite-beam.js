/** Composite beam drafts (M17, ADR 0031): inspector, the cross-section and
 * stage diagrams drawn from the Rust run, the AISC Chapter I checks and the
 * stage deflections. Values are Rust's; this module formats and draws. */
import { escape as esc } from "./reports/report.js";
import { entityLabel } from "./entity-labels.js";
import { designNames, fieldRows, pretty } from "./design-presentation.js";
import { previewIdentity } from "./selection-context.js";

const mm = (v) => `${pretty(v * 1000, 1)} mm`;
const kNm = (v) => `${pretty(v / 1000, 1)} kN·m`;
const kN = (v) => `${pretty(v / 1000, 1)} kN`;

function quantity(v, units) {
  if (v == null) return "—";
  if (units === "N") return kN(v);
  if (units === "N m") return kNm(v);
  if (units === "m") return mm(v);
  if (units === "Pa") return `${pretty(v / 1e6, 2)} MPa`;
  return pretty(v, 3);
}

const select = (id, label, options, value) =>
  `<label class="design-field"><span>${label}</span><select id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;

const number = (id, label, value, hint = "") =>
  `<label class="design-field"><span>${label}</span><span class="design-field-control"><input id="${id}" value="${value ?? ""}" inputmode="decimal" placeholder="${esc(hint)}"></span></label>`;

/** Cases and combinations of the model for the stage pickers. */
function caseOptions(project) {
  return [
    ["", "Not chosen"],
    ...project.loadCases.map((c) => [c.id, `${c.id} · ${c.name}`]),
    ...project.combinations.map((c) => [c.id, `${c.id} · ${c.name}`]),
  ];
}

export function compositeSketch(d) {
  const v = d.inputs;
  const w = 260,
    t = v.slabThickness,
    hr = d.composite?.deck === "solid" ? 0 : v.ribHeight;
  const s = 120 / (t + 0.5);
  const top = 40;
  const ribs = Array.from({ length: 6 }, (_, k) =>
    hr
      ? `<rect x="${20 + k * 42}" y="${top + s * (t - hr)}" width="${(42 * v.ribWidth) / v.ribPitch}" height="${s * hr}" fill="#c9d1d9"/>`
      : "",
  ).join("");
  return `<rect x="20" y="${top}" width="${w}" height="${s * (t - hr)}" fill="#c9d1d9"/>${ribs}<rect x="${150 - 30}" y="${top + s * t}" width="60" height="6" fill="#516b82"/><rect x="147" y="${top + s * t + 6}" width="6" height="60" fill="#516b82"/><text x="150" y="226" text-anchor="middle">Schematic of the inputs · run for the section</text>`;
}

export function compositeInspector({ d, templates, ds, active, ctx }) {
  const t = templates.find((t) => t.kind === d.kind),
    c = d.composite || {},
    p = ctx.project;
  const cases = caseOptions(p);
  const chooser = `<select id="preview-active" aria-label="Active design object">${ds.map((item) => `<option value="${esc(item.id)}" ${item.id === active ? "selected" : ""}>${esc(previewIdentity(p, item).text)}</option>`).join("")}</select>`;
  const create = `<details class="design-create"><summary>＋ Create a design object</summary><div class="design-inline"><select id="preview-kind" aria-label="New draft type">${templates.map((t) => `<option value="${t.kind}">${t.name}</option>`).join("")}</select><button id="preview-create">Create draft</button></div></details>`;
  const yesNo = (v) => (v === true ? "yes" : v === false ? "no" : "");
  return `<div class="design-object-title"><div><small>SELECTED ${designNames[d.kind].toUpperCase()}</small><h2>${esc(previewIdentity(p, d).text)}<span class="design-tag">AISC 360-22 LRFD · demonstration</span></h2></div>${chooser}</div>
 <p class="design-note">An unshored, simply supported W beam with headed studs. The construction stage is checked on the steel alone and the composite stage on the plastic section, each from the stage's own case or combination.</p>
 <form id="preview-form"><section class="design-section"><h3>1. Beam and slab</h3><div class="design-section-sketch"><svg viewBox="0 0 300 230" aria-label="Composite section schematic">${compositeSketch(d)}</svg><div>
 <label class="design-field"><span>Beam</span><select id="preview-target"><option value="">No model binding</option>${p.members.map((m) => `<option value="${esc(m.id)}" ${d.targetId === m.id ? "selected" : ""}>${esc(entityLabel(p, m.id))}${m.steelDesign ? ` · ${esc(m.steelDesign.sectionRef.split(":").pop())}` : ""}</option>`).join("")}</select></label>
 ${select("comp-deck", "Deck", t.composite.decks, c.deck || "perpendicular")}
 <label class="design-check"><input type="checkbox" id="comp-lightweight" ${c.lightweight ? "checked" : ""}> Lightweight concrete</label>
 ${fieldRows(d, t, ["slabThickness", "ribHeight", "ribWidth", "ribPitch", "concreteStrength", "concreteDensity"])}</div></div></section>
 <section class="design-section"><h3>2. Effective width</h3>${select("comp-side-1", "Side 1 is", t.composite.sides, c.sides?.[0] || "adjacent")}${fieldRows(d, t, ["sideLeft"])}${select("comp-side-2", "Side 2 is", t.composite.sides, c.sides?.[1] || "adjacent")}${fieldRows(d, t, ["sideRight"])}</section>
 <section class="design-section"><h3>3. Studs</h3>${fieldRows(d, t, ["studDiameter", "studFu", "studLength", "studsPerRow", "studRowSpacing", "firstStudRow", "studTransverseSpacing"])}
 <label class="design-check"><input type="checkbox" id="comp-over-web" ${c.studsOverWeb ? "checked" : ""}> Studs welded over the web</label>${number("comp-emid", "e<sub>mid-ht</sub> (perpendicular deck), m", c.emidHt, "unknown: R_p = 0.6")}</section>
 <section class="design-section"><h3>4. Stages</h3>${select("comp-construction", "Construction (factored, before hardening)", cases, c.constructionCaseId || "")}${select("comp-composite", "Composite (factored, total)", cases, c.compositeCaseId || "")}${select("comp-wet", "Wet concrete (service, steel alone)", cases, c.wetCaseId || "")}${select("comp-live", "Live (service, composite)", cases, c.liveCaseId || "")}${select("comp-sustained", "Sustained after hardening (service)", cases, c.sustainedCaseId || "")}${fieldRows(d, t, ["constructionLb", "constructionCb", "camber"])}</section>
 <section class="design-section"><h3>5. Service criteria and judgements</h3>${number("comp-pre-limit", "Pre-composite limit L/n (net of camber)", c.preCompositeLimit, "e.g. 360")}${number("comp-live-limit", "Live load limit L/n", c.liveLimit, "e.g. 360")}${number("comp-long-limit", "Long-term limit L/n", c.longTermLimit, "e.g. 240")}${number("comp-shrinkage", "Restrained shrinkage strain ε<sub>sh</sub>", c.shrinkageStrain, "Commentary: 0.0002 when unknown")}
 ${select(
   "comp-creep",
   "Creep (no method in the held texts)",
   [
     ["", "Not judged"],
     ["yes", "Judged and accounted for by the engineer"],
     ["no", "Must be calculated"],
   ],
   yesNo(c.creepJudgement),
 )}
 ${select(
   "comp-regular",
   "Point loads on the beam are equal and equally spaced",
   [
     ["", "Not confirmed"],
     ["yes", "Yes"],
     ["no", "No"],
   ],
   yesNo(c.regularLoadingConfirmed),
 )}
 <small>Your values and judgements, never assumed: missing ones leave their checks INDETERMINATE.</small>
 <div class="design-form-actions"><button id="preview-save">Save inputs</button><button type="button" id="preview-cancel">Cancel edits</button></div></section></form>
 <section class="design-section"><h3>6. Run</h3><label class="design-field"><span>Action source</span><select id="preview-source"><option value="synthetic">Synthetic fixture · MOCK</option><option value="model">Model stage cases</option></select></label><p id="preview-readiness" class="source-key"></p><button class="primary" id="preview-run">Run composite check</button></section>
 <p class="design-note">AISC 360-22 LRFD DEMONSTRATION · Chapter I with the Commentary's deflection and shrinkage models; not a certified design.</p>${create}<button id="preview-delete" class="design-delete">Delete this draft</button><p id="preview-error" role="alert"></p>`;
}

/** The composite block of SetDesignPreview. */
export function readComposite(host) {
  const v = (id) => host.querySelector(id)?.value.trim() || "";
  const num = (id) => (v(id) === "" ? undefined : Number(v(id)));
  const yn = (id) => (v(id) === "" ? undefined : v(id) === "yes");
  const out = {
    deck: v("#comp-deck"),
    lightweight: host.querySelector("#comp-lightweight").checked,
    sides: [v("#comp-side-1"), v("#comp-side-2")],
    studsOverWeb: host.querySelector("#comp-over-web").checked,
    emidHt: num("#comp-emid"),
    constructionCaseId: v("#comp-construction") || undefined,
    compositeCaseId: v("#comp-composite") || undefined,
    wetCaseId: v("#comp-wet") || undefined,
    liveCaseId: v("#comp-live") || undefined,
    sustainedCaseId: v("#comp-sustained") || undefined,
    preCompositeLimit: num("#comp-pre-limit"),
    liveLimit: num("#comp-live-limit"),
    longTermLimit: num("#comp-long-limit"),
    shrinkageStrain: num("#comp-shrinkage"),
    creepJudgement: yn("#comp-creep"),
    regularLoadingConfirmed: yn("#comp-regular"),
  };
  for (const [k, x] of Object.entries(out)) {
    if (x === undefined) delete out[k];
    else if (typeof x === "number" && !Number.isFinite(x))
      throw new Error(`Enter a number for ${k}`);
  }
  return out;
}

/** Cross-section at the governing section, from the run. The slab is drawn
 * as a window around the beam, cut with break lines when b_eff is wider. */
export function compositeSection(code) {
  const sec = code?.section;
  if (!sec?.beam) return "<p>Run the composite check for the section.</p>";
  const W = 560,
    H = 420;
  const b = sec.beam,
    slab = sec.slab;
  const width = Math.min(sec.beff, 5 * b.bf);
  const cut = width < sec.beff;
  const depth = slab.thickness + b.d;
  const s = Math.min((W - 200) / width, (H - 110) / depth);
  const cx = W / 2 - 40,
    top = 50;
  const X = (x) => cx + s * x,
    Y = (y) => top + s * y;
  const half = width / 2;
  const yt = slab.thickness;
  const topping = sec.layers[0];
  const parts = [
    `<rect x="${X(-half)}" y="${Y(0)}" width="${s * width}" height="${s * topping.thickness}" fill="#c9d1d9" stroke="#8a9bb0" data-testid="comp-slab-layer"/>`,
  ];
  if (slab.deck === "parallel") {
    // Ribs at their pitch, centred on the beam.
    const n = Math.floor(width / slab.ribPitch / 2);
    for (let k = -n; k <= n; k++) {
      const xc = k * slab.ribPitch;
      parts.push(
        `<rect x="${X(xc - slab.ribWidth / 2)}" y="${Y(yt - slab.ribHeight)}" width="${s * slab.ribWidth}" height="${s * slab.ribHeight}" fill="#c9d1d9" stroke="#8a9bb0" data-testid="comp-slab-layer"/>`,
      );
    }
  } else if (slab.deck === "perpendicular") {
    parts.push(
      `<rect x="${X(-half)}" y="${Y(yt - slab.ribHeight)}" width="${s * width}" height="${s * slab.ribHeight}" fill="#eef1f4" stroke="#8a9bb0" stroke-dasharray="4 3"/><text x="${X(half) + 8}" y="${Y(yt - slab.ribHeight / 2) + 4}">deck ribs (neglected)</text>`,
    );
  }
  const breaks = cut
    ? [-half, half]
        .map(
          (x) =>
            `<path d="M${X(x) - 4},${Y(-0.01)}l8,${(s * topping.thickness) / 3}l-8,${(s * topping.thickness) / 3}l8,${(s * topping.thickness) / 3 + s * 0.01}" fill="none" stroke="#24415d"/>`,
        )
        .join("")
    : "";
  const steel = `<g fill="#9fb3c8" stroke="#24415d" data-testid="comp-beam"><rect x="${X(-b.bf / 2)}" y="${Y(yt)}" width="${s * b.bf}" height="${s * b.tf}"/><rect x="${X(-b.tw / 2)}" y="${Y(yt + b.tf)}" width="${s * b.tw}" height="${s * (b.d - 2 * b.tf)}"/><rect x="${X(-b.bf / 2)}" y="${Y(yt + b.d - b.tf)}" width="${s * b.bf}" height="${s * b.tf}"/></g>`;
  const studs = Array.from({ length: sec.studs.perRow }, (_, k) => {
    const x = (k - (sec.studs.perRow - 1) / 2) * sec.studs.transverse;
    return `<rect x="${X(x) - (s * sec.studs.diameter) / 2}" y="${Y(yt - sec.studs.length)}" width="${s * sec.studs.diameter}" height="${s * sec.studs.length}" fill="#c17f26" data-testid="comp-stud"/>`;
  }).join("");
  const pl = sec.plastic;
  const block = pl
    ? `<rect x="${X(-half)}" y="${Y(0)}" width="${s * width}" height="${s * pl.a}" fill="#e8a33a" fill-opacity="0.45" data-testid="comp-block"/><text x="${X(half) + 8}" y="${Y(Math.min(pl.a, topping.thickness) / 2) + 4}">a = ${mm(pl.a)} (0.85 f′c)</text>`
    : "";
  const pna = pl
    ? (() => {
        const y = pl.pna === "slab" ? pl.a : yt + pl.pnaDepth;
        return `<path d="M${X(-half)},${Y(y)}H${X(half) + 4}" stroke="#b42318" stroke-width="1.5" data-testid="comp-pna"/><text x="${X(half) + 8}" y="${Y(y) + 4}" fill="#b42318">PNA in the ${esc(pl.pna)}</text>`;
      })()
    : "";
  const dims = `<text x="${X(0)}" y="${Y(0) - 12}" text-anchor="middle">b<tspan font-size="8" dy="2">eff</tspan><tspan dy="-2"> = ${mm(sec.beff)}${cut ? " (window shown)" : ""}</tspan></text><text x="${X(b.bf / 2) + 8}" y="${Y(yt + b.d / 2)}">${esc(b.designation)}</text>`;
  return `<svg class="conn-drawing" viewBox="0 0 ${W} ${H}" role="img" aria-label="Composite section" data-testid="comp-section">${parts.join("")}${breaks}${block}${steel}${studs}${pna}${dims}<text x="${W / 2}" y="${H - 14}" text-anchor="middle" font-weight="600">t = ${mm(slab.thickness)}, ${esc(slab.deck)} deck · C = ${pl ? kN(pl.C) : "—"}${pl ? ` · M<tspan font-size="8" dy="2">n</tspan><tspan dy="-2"> = ${kNm(pl.Mn)}</tspan>` : ""}</text></svg>`;
}

/** The two strength stages' moment diagrams on one plot. */
export function compositeStages(code) {
  const st = code?.stages;
  if (!st?.construction)
    return "<p>Run the composite check for the stage diagrams.</p>";
  const W = 560,
    H = 260,
    pad = 40;
  const L = code.span;
  const all = [...st.construction.moment, ...st.composite.moment];
  const max = Math.max(...all.map(Math.abs), 1);
  const X = (x) => pad + ((W - 2 * pad) * x) / L,
    Y = (m) => pad + ((H - 2 * pad) * m) / max;
  const path = (d) =>
    d.stations
      .map(
        (x, i) =>
          `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(d.moment[i]).toFixed(1)}`,
      )
      .join("");
  const points = (st.loadPoints || [])
    .map(
      (x) =>
        `<path d="M${X(x)},${pad - 8}v8" stroke="#b42318" stroke-width="2"/>`,
    )
    .join("");
  return `<svg class="conn-drawing" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stage moment diagrams" data-testid="comp-stages"><path d="M${pad},${pad}H${W - pad}" stroke="#24415d"/><path d="${path(st.composite)}" fill="none" stroke="#1167a2" stroke-width="2" data-testid="comp-stage-composite"/><path d="${path(st.construction)}" fill="none" stroke="#c17f26" stroke-width="2" stroke-dasharray="6 3" data-testid="comp-stage-construction"/>${points}<text x="${W - pad}" y="${H - 12}" text-anchor="end">Composite ${esc(st.compositeCaseId)} (solid) · construction ${esc(st.constructionCaseId)} (dashed) · max ${kNm(Math.max(...st.composite.moment))}</text></svg>`;
}

export function compositeChecksPane(run) {
  const code = run?.codeProfilePreview;
  if (!code || code.status !== "evaluated")
    return `<p data-testid="comp-unavailable">${esc(code?.reason || "Run the composite check on the model stage cases.")}</p>`;
  const rows = code.checks
    .map(
      (c) =>
        `<tr data-testid="comp-check" data-check="${esc(c.checkId)}" data-status="${esc(c.status)}"><td>${esc(c.checkId.replace("composite.", ""))}</td><td>${esc(c.clause)}</td><td data-si="${c.demand ?? ""}">${quantity(c.demand, c.units)}</td><td data-si="${c.resistance ?? ""}">${quantity(c.resistance, c.units)}</td><td>${c.utilisation == null ? "—" : pretty(c.utilisation, 3)}</td><td><span class="status-text ${esc(c.status)}">${esc(String(c.status).toUpperCase())}</span></td><td>${esc(c.message)}</td></tr>`,
    )
    .join("");
  const q = code.studs;
  return `<h4>AISC 360-22 Chapter I limit states <span class="design-tag">DEMONSTRATION</span></h4><table class="conn-checks"><thead><tr><th>Check</th><th>Clause</th><th>Demand</th><th>Resistance / limit</th><th>Util.</th><th>Status</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table><p class="design-note">Studs: Q<sub>n</sub> = <b data-testid="comp-qn">${kN(q.Qn)}</b> (R<sub>g</sub> ${q.Rg}, R<sub>p</sub> ${q.Rp}; concrete limit ${kN(q.concreteLimit)}, steel limit ${kN(q.steelLimit)}), ${q.total} studs in ${q.rows.length} rows.</p>`;
}

export function compositeDeflections(run) {
  const code = run?.codeProfilePreview;
  const dfl = code?.deflections;
  if (!dfl) return "<p>No deflections yet.</p>";
  const in4 = (v) => `${pretty((v * 1e12) / 1e6, 1)} ×10⁶ mm⁴`;
  const row = (label, v, extra = "") =>
    v
      ? `<tr data-testid="comp-deflection" data-stage="${esc(label)}"><td>${esc(label)}</td><td data-si="${v.delta ?? v.total}">${mm(Math.abs(v.delta ?? v.total))}</td><td>${extra}</td></tr>`
      : "";
  return `<h4>Stage deflections (chord relative)</h4><table><thead><tr><th>Stage</th><th>Deflection</th><th>Note</th></tr></thead><tbody>${row("Wet concrete on the steel alone", dfl.wet, dfl.wet ? `net of camber ${mm(dfl.wet.net)}` : "")}${row("Live on the composite (I_LB)", dfl.live)}${row("Long-term: sustained + shrinkage", dfl.longTerm, dfl.longTerm ? `shrinkage ${mm(dfl.longTerm.shrinkage)}` : "")}</tbody></table><dl class="design-provenance-grid"><dt>I<sub>s</sub></dt><dd>${in4(dfl.Is)}</dd><dt>I<sub>LB</sub> (C-I3-1)</dt><dd data-testid="comp-ilb">${in4(dfl.ILB)}</dd><dt>I<sub>tr</sub></dt><dd>${in4(dfl.Itr)}</dd><dt>I<sub>equiv</sub> (C-I3-3, information)</dt><dd>${in4(dfl.Iequiv)}</dd><dt>n = E<sub>s</sub>/E<sub>c</sub></dt><dd>${pretty(dfl.n, 3)}</dd></dl><p class="design-note">Deflections integrate each stage's moment diagram with that stage's stiffness. Creep has no method in the held texts: it is the engineer's recorded judgement.</p>`;
}
