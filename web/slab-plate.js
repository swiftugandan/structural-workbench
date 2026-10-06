/** Slab plate analysis (plate-v1, ADR 0021): inspector inputs and the
 * results pane. Every number shown comes from the Rust run record; this module
 * only formats and draws it. */
import { escape as esc } from "./reports/report.js";
import { displayValue, pretty } from "./design-presentation.js";

const sourceMark = (s) =>
  `<abbr class="input-origin" title="${s === "user" ? "User input" : "Synthetic fixture"}">${s === "user" ? "U" : "S"}</abbr>`;

/** Inspector fieldset for a slab draft's plate inputs. A draft without a
 * `plate` object shows the template defaults; saving records them. */
export function plateSection(d, template) {
  const t = template?.plate;
  if (d.kind !== "slab" || !t) return "";
  const plate = d.plate;
  const edges = plate?.edges || t.defaultEdges;
  const include = plate ? plate.includeOpening : t.defaultIncludeOpening;
  const src = (key) => plate?.inputSources?.[key] || "syntheticFixture";
  const rows = t.fields
    .map((f) => {
      const value = plate?.inputs?.[f.key] ?? f.defaultValue;
      return `<label class="design-field"><span>${esc(f.label)}</span><span class="design-field-control"><input name="plate-${f.key}" id="preview-plate-${f.key}" value="${displayValue(value, f.displayScale)}" data-si="${value}" inputmode="decimal" required><span class="unit">${esc(f.unit)}</span></span>${sourceMark(src(f.key))}</label>`;
    })
    .join("");
  const edgeRows = t.edgeLabels
    .map(
      (label, i) =>
        `<label class="design-field"><span>${esc(label)}</span><select name="plate-edge-${i}" id="preview-plate-edge-${i}">${t.edgeConditions.map((c) => `<option value="${c}" ${edges[i] === c ? "selected" : ""}>${c[0].toUpperCase() + c.slice(1)}</option>`).join("")}</select>${sourceMark(src("edges"))}</label>`,
    )
    .join("");
  return `<fieldset class="design-subsection" id="preview-plate"><legend>Plate analysis (plate-v1)</legend>${plate ? "" : '<p class="design-note" data-testid="plate-not-configured">Not configured · saving records these inputs.</p>'}<p class="design-note">Uniform pressure on the panel; edges, material and columns are your inputs or come from the frame model.</p>${edgeRows}<label class="design-check full"><input type="checkbox" id="preview-plate-opening" ${include ? "checked" : ""}> Cut the opening from the panel ${sourceMark(src("includeOpening"))}</label>${rows}${plate ? columnsSection(plate) : ""}</fieldset>`;
}

const COLUMN_KINDS = ["pinned", "fixed", "spring"];

/** One editable (user) or read-only (model) column row. */
function columnRow(c, i) {
  const ro = c.source === "model" ? " readonly" : "";
  const dis = c.source === "model" ? " disabled" : "";
  const num = (name, v, label) =>
    `<label><span>${label}</span><input name="col-${name}-${i}" value="${v ?? 0}" inputmode="decimal"${ro}></label>`;
  return `<div class="slab-column" data-column-row="${i}" data-source="${esc(c.source)}" data-testid="slab-column">${num("x", c.x, "x (m)")}${num("y", c.y, "y (m)")}<label><span>Kind</span><select name="col-kind-${i}"${dis}>${COLUMN_KINDS.map((k) => `<option${k === c.kind ? " selected" : ""}>${k}</option>`).join("")}</select></label>${num("kz", c.kz, "kz (N/m)")}${num("krx", c.krx, "krx (N·m/rad)")}${num("kry", c.kry, "kry (N·m/rad)")}<span class="slab-column-source">${c.source === "model" ? `model · ${esc(c.nodeId)} · ${esc(c.memberIds.join(", "))}` : "user"}</span>${c.source === "model" ? "" : `<button type="button" data-remove-column="${i}">Remove</button>`}</div>`;
}

function columnsSection(plate) {
  const columns = plate.columns || [];
  const o = plate.placement || [0, 0, 0];
  return `<div class="slab-columns" id="slab-columns"><h4>Columns (${columns.length})</h4>${columns.map(columnRow).join("")}<button type="button" id="slab-add-column">Add column</button><div class="slab-derive"><span>Panel corner in the model</span><label>X <input id="slab-origin-x" value="${o[0]}" inputmode="decimal"></label><label>Y <input id="slab-origin-y" value="${o[1]}" inputmode="decimal"></label><label>Z <input id="slab-origin-z" value="${o[2]}" inputmode="decimal"></label><button type="button" id="slab-derive-columns">Take columns from the model</button></div><small>Model columns are springs: kz = ΣEA/L and krx, kry = Σ4EI/L (3EI/L when the far end rotates freely). The panel axes follow global X and Y.</small></div>`;
}

/** Adds an empty user column row to the form (not saved until Save). */
export function addColumnRow(host) {
  const list = host.querySelector("#slab-columns");
  const i = host.querySelectorAll("[data-column-row]").length;
  host
    .querySelector("#slab-add-column")
    .insertAdjacentHTML(
      "beforebegin",
      columnRow(
        { x: 0, y: 0, kind: "pinned", kz: 0, krx: 0, kry: 0, source: "user" },
        i,
      ),
    );
  return list;
}

/** The `plate` argument of SetDesignPreview, or undefined for other kinds. */
export function plateArgs(host, d, template, submitted) {
  const t = template?.plate;
  if (d.kind !== "slab" || !t) return undefined;
  return {
    edges: t.edgeLabels.map(
      (_, i) => host.querySelector(`[name="plate-edge-${i}"]`).value,
    ),
    includeOpening: host.querySelector("#preview-plate-opening").checked,
    ...(host.querySelector("#slab-columns") && {
      columns: [...host.querySelectorAll("[data-column-row]")].map((row) => {
        const i = row.dataset.columnRow;
        const n = (name) =>
          Number(host.querySelector(`[name="col-${name}-${i}"]`).value);
        const kind = host.querySelector(`[name="col-kind-${i}"]`).value;
        const spring = kind === "spring";
        return {
          x: n("x"),
          y: n("y"),
          kind,
          kz: spring ? n("kz") : 0,
          krx: spring ? n("krx") : 0,
          kry: spring ? n("kry") : 0,
        };
      }),
    }),
    inputs: Object.fromEntries(
      t.fields.map((f) => [
        f.key,
        submitted(host.querySelector(`[name="plate-${f.key}"]`), f.unit),
      ]),
    ),
  };
}

export const plateFields = [
  ["mx", "mx", "moment"],
  ["my", "my", "moment"],
  ["mxy", "mxy", "moment"],
  ["bottomX", "Bottom X (Wood–Armer)", "design"],
  ["bottomY", "Bottom Y (Wood–Armer)", "design"],
  ["topX", "Top X (Wood–Armer)", "design"],
  ["topY", "Top Y (Wood–Armer)", "design"],
  ["w", "Deflection w", "deflection"],
  ["asBottomX", "A_s,req bottom X", "steel", "bottomX"],
  ["asBottomY", "A_s,req bottom Y", "steel", "bottomY"],
  ["asTopX", "A_s,req top X", "steel", "topX"],
  ["asTopY", "A_s,req top Y", "steel", "topY"],
];

// Diverging blue–white–red for signed fields, white–amber–red for magnitudes.
function colour(v, lo, hi, signed) {
  const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const white = [247, 249, 252];
  let rgb;
  if (signed) {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    rgb =
      v >= 0
        ? mix(white, [196, 45, 45], v / m)
        : mix(white, [34, 93, 199], -v / m);
  } else {
    const t = hi > lo ? (v - lo) / (hi - lo) : 0;
    rgb =
      t < 0.5
        ? mix(white, [236, 170, 60], t * 2)
        : mix([236, 170, 60], [180, 40, 40], (t - 0.5) * 2);
  }
  return `rgb(${rgb.join(",")})`;
}

/** Element-centre contour of one field over the panel, with edge conditions,
 * the opening and the governing element marked. */
export function plateContour(pa, key, recovery = "elementCentre") {
  const f = pa.fields,
    xs = pa.mesh.xs,
    ys = pa.mesh.ys,
    lx = pa.panel.lengthX,
    ly = pa.panel.lengthY;
  const W = 520,
    H = 360,
    pad = 34,
    s = Math.min((W - 2 * pad) / lx, (H - 2 * pad) / ly),
    ox = (W - s * lx) / 2,
    oy = (H + s * ly) / 2;
  const X = (x) => ox + s * x,
    Y = (y) => oy - s * y;
  const nodal = key === "w";
  // ADR 0021 item 3: the nodal-average moments are display only; every other
  // field, and every design value, is the element-centre one.
  const smoothed = recovery === "nodalAverage" ? pa.smoothed?.[key] : null;
  const cells = f.cells;
  // Each tile: [x0, x1, y0, y1, value, marker x, marker y].
  let tiles;
  if (nodal || smoothed) {
    const source = smoothed || f.w;
    const at = new Map(f.nodes.map((g, n) => [g.join(","), source[n]]));
    const v = (i, j) => at.get(`${i},${j}`);
    tiles = nodal
      ? // Cell colour from the mean of its corner deflections (display only).
        cells.map(([i, j]) => [
          xs[i],
          xs[i + 1],
          ys[j],
          ys[j + 1],
          (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4,
          (xs[i] + xs[i + 1]) / 2,
          (ys[j] + ys[j + 1]) / 2,
        ])
      : // Each cell quarter takes its corner node's averaged value.
        cells.flatMap(([i, j]) => {
          const mx = (xs[i] + xs[i + 1]) / 2,
            my = (ys[j] + ys[j + 1]) / 2;
          return [
            [xs[i], mx, ys[j], my, v(i, j), xs[i], ys[j]],
            [mx, xs[i + 1], ys[j], my, v(i + 1, j), xs[i + 1], ys[j]],
            [mx, xs[i + 1], my, ys[j + 1], v(i + 1, j + 1), xs[i + 1], ys[j + 1]],
            [xs[i], mx, my, ys[j + 1], v(i, j + 1), xs[i], ys[j + 1]],
          ];
        });
  } else {
    tiles = cells.map(([i, j], e) => [
      xs[i],
      xs[i + 1],
      ys[j],
      ys[j + 1],
      f[key][e],
      (xs[i] + xs[i + 1]) / 2,
      (ys[j] + ys[j + 1]) / 2,
    ]);
  }
  const values = tiles.map((t) => t[4]);
  const kind = plateFields.find((f) => f[0] === key)?.[2];
  const lo = Math.min(...values),
    hi = Math.max(...values),
    signed = !["design", "steel"].includes(kind);
  const rects = tiles
    .map(
      ([x0, x1, y0, y1, value]) =>
        `<rect x="${X(x0).toFixed(2)}" y="${Y(y1).toFixed(2)}" width="${(s * (x1 - x0)).toFixed(2)}" height="${(s * (y1 - y0)).toFixed(2)}" fill="${colour(value, lo, hi, signed)}"/>`,
    )
    .join("");
  const edgeLine = (k) => {
    const [x1, y1, x2, y2] = [
      [0, 0, 0, ly],
      [lx, 0, lx, ly],
      [0, 0, lx, 0],
      [0, ly, lx, ly],
    ][k];
    const c = pa.panel.edges[k];
    const style =
      c === "clamped"
        ? 'stroke="#142b44" stroke-width="5"'
        : c === "simple"
          ? 'stroke="#142b44" stroke-width="2.5" stroke-dasharray="7 4"'
          : 'stroke="#8a9bb0" stroke-width="1"';
    return `<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" ${style} data-edge="${k}" data-condition="${c}"/>`;
  };
  const o = pa.panel.opening;
  const opening = o
    ? `<rect x="${X(o[0])}" y="${Y(o[3])}" width="${s * (o[1] - o[0])}" height="${s * (o[3] - o[2])}" fill="#fff" stroke="#c17f26" stroke-width="1.5"/>`
    : "";
  const peak = values.reduce(
    (best, v, e) => (Math.abs(v) > Math.abs(values[best]) ? e : best),
    0,
  );
  const px = X(tiles[peak][5]),
    py = Y(tiles[peak][6]);
  const unit = nodal ? "mm" : kind === "steel" ? "mm²/m" : "kN·m/m",
    scale = nodal ? 1000 : kind === "steel" ? 1e6 : 0.001;
  const legend = `<g font-size="11" fill="#142b44"><text x="${pad}" y="${H - 8}">min ${pretty(lo * scale, 2)} ${unit}</text><text x="${W - pad}" y="${H - 8}" text-anchor="end">max ${pretty(hi * scale, 2)} ${unit}</text></g>`;
  return `<svg class="plate-contour" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(key)} contour over the slab panel" data-testid="plate-contour" data-field="${esc(key)}" data-cells="${cells.length}" data-recovery="${smoothed ? "nodalAverage" : nodal ? "nodal" : "elementCentre"}"><g shape-rendering="crispEdges">${rects}</g>${opening}${[0, 1, 2, 3].map(edgeLine).join("")}<circle cx="${px}" cy="${py}" r="5" fill="none" stroke="#142b44" stroke-width="2"/>${(pa.columns || []).map((c) => `<rect x="${X(c.x) - 5}" y="${Y(c.y) - 5}" width="10" height="10" fill="#142b44" data-testid="plate-column-marker"/>`).join("")}<text x="${X(0)}" y="${Y(0) + 16}" font-size="11" fill="#53667c">0,0</text><text x="${X(lx)}" y="${Y(0) + 16}" font-size="11" fill="#53667c" text-anchor="end">x = ${pretty(lx, 2)} m</text><text x="${X(0) - 6}" y="${Y(ly) + 4}" font-size="11" fill="#53667c" text-anchor="end">y</text>${legend}</svg>`;
}

const kNm = (v) => `${pretty(v / 1000, 2)} kN·m/m`;

/** Column reactions on the slab and the route back to the frame. */
function columnsTable(pa, context) {
  if (!pa.columns?.length) return "";
  const kN = (v) => pretty(v / 1000, 2);
  const rows = pa.columns
    .map(
      (c, i) =>
        `<tr data-testid="plate-column-reaction"><th scope="row">${i + 1}${c.nodeId ? ` · ${esc(c.nodeId)}` : ""}</th><td>${pretty(c.x, 3)}, ${pretty(c.y, 3)}</td><td>${esc(c.kind)}</td><td data-si="${c.reaction[0]}">${kN(c.reaction[0])}</td><td data-si="${c.reaction[1]}">${kN(c.reaction[1])}</td><td data-si="${c.reaction[2]}">${kN(c.reaction[2])}</td></tr>`,
    )
    .join("");
  const model = pa.columns.some((c) => c.source === "model");
  const cases = context?.loadCases || [];
  return `<h4>Column reactions on the slab</h4><table data-testid="plate-columns"><thead><tr><th scope="col">Column</th><th>At (m)</th><th>Kind</th><th>Fz (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th></tr></thead><tbody>${rows}</tbody></table>${
    model
      ? `<div class="slab-apply"><label>Load case <select id="slab-apply-case">${cases.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join("")}</select></label><button type="button" id="slab-apply-loads"${cases.length ? "" : " disabled"}>Apply column loads to the frame</button><small>Writes −(Fz, Mx, My) at each model column's node in that case, replacing this slab's previous loads.</small></div>`
      : ""
  }`;
}

/** The "Plate actions" pane of a slab run. */
export function platePane(run, field, context, recovery = "elementCentre") {
  // A_s,req maps are the run's per-element design values (ADR 0029).
  const map = run?.codeProfilePreview?.reinforcementMap;
  const steel = plateFields.find((f) => f[0] === field && f[2] === "steel");
  if (steel && !map) field = "bottomX";
  const pa = run?.plateAnalysis;
  if (!pa)
    return '<p data-testid="plate-status">Run the preview with the plate analysis source.</p>';
  if (pa.status !== "evaluated")
    return `<h4>Plate analysis</h4><p data-testid="plate-status">${esc(pa.status === "notRun" ? "Not run" : pa.status)} · ${esc(pa.reason || "")}</p>`;
  const c = pa.convergence,
    m = pa.mesh,
    e = pa.equilibrium,
    x = pa.extremes;
  const dm = pa.designMoments;
  const governing = ["bottomX", "bottomY", "topX", "topY"]
    .map(
      (k) =>
        `<tr data-testid="plate-design-moment" data-face="${k}"><td>${esc(plateFields.find((f) => f[0] === k)[1])}</td><td data-si="${dm[k].value}">${kNm(dm[k].value)}</td><td>(${pretty(dm[k].at[0], 2)}, ${pretty(dm[k].at[1], 2)}) m</td></tr>`,
    )
    .join("");
  const clamped = pa.edgeMoments.length
    ? (() => {
        const byEdge = [0, 1, 2, 3]
          .map((k) => pa.edgeMoments.filter((m) => m.edge === k))
          .map((list, k) =>
            list.length
              ? `<tr><td>${["x = 0", "x = Lx", "y = 0", "y = Ly"][k]}</td><td data-si="${Math.min(...list.map((m) => m.moment))}">${kNm(Math.min(...list.map((m) => m.moment)))}</td></tr>`
              : "",
          )
          .join("");
        return `<h4>Clamped-edge line moments</h4><table><thead><tr><th>Edge</th><th>Most hogging</th></tr></thead><tbody>${byEdge}</tbody></table><p class="design-note">From the support reactions over each node's tributary edge length.</p>`;
      })()
    : "";
  // Smoothing is offered for the raw moments only (ADR 0021 item 3).
  const smoothable = ["mx", "my", "mxy"].includes(field) && pa.smoothed;
  const recoverySwitch = smoothable
    ? `<div class="design-view-switch" role="group" aria-label="Moment recovery">${[
        ["elementCentre", "Element centre (design values)"],
        ["nodalAverage", "Nodal average (display only)"],
      ]
        .map(
          ([k, label]) =>
            `<button data-plate-recovery="${k}" aria-pressed="${recovery === k}">${label}</button>`,
        )
        .join("")}</div>`
    : "";
  return `<div class="plate-pane" data-testid="plate-pane"><div class="plate-map"><div class="design-view-switch" role="group" aria-label="Plate result field">${plateFields
    .filter((f) => f[2] !== "steel" || map)
    .map(
      ([k, label]) =>
        `<button data-plate-field="${k}" aria-pressed="${field === k}">${esc(label)}</button>`,
    )
    .join(
      "",
    )}</div>${recoverySwitch}${plateContour(steel && map ? { ...pa, fields: { ...pa.fields, [field]: map[steel[3]] } } : pa, field, smoothable ? recovery : "elementCentre")}<p class="design-note">${smoothable && recovery === "nodalAverage" ? "Nodal averages of the adjacent element-centre moments: display only, never used for design." : "Element-centre values (unsmoothed)."} Sagging positive. Wood–Armer values are moments to resist on each face; the A<sub>s,req</sub> maps are the EC2 design values per element, never averaged. Heavy edge: clamped · dashed: simple · thin: free.</p></div><div class="plate-tables"><h4>Solution <span class="design-tag">MECHANICS · plate-v1</span></h4><table><tbody><tr><td>Mesh</td><td data-testid="plate-elements">${m.elements} elements · ${m.nodes} nodes · largest aspect ${pretty(m.maxAspect, 2)}</td></tr><tr><td>Pressure</td><td>${pretty(pa.load.pressure / 1000, 3)} kPa down</td></tr><tr><td>Equilibrium</td><td data-testid="plate-balance" data-si="${e.relativeImbalance}">reactions ${pretty(e.reactions / 1000, 3)} kN vs load ${pretty(e.applied / 1000, 3)} kN (${e.relativeImbalance.toExponential(1)})</td></tr><tr><td>Max deflection</td><td>${pretty(x.maxDeflection * 1000, 3)} mm</td></tr><tr><td>mx range</td><td>${kNm(x.minMx)} … ${kNm(x.maxMx)}</td></tr><tr><td>my range</td><td>${kNm(x.minMy)} … ${kNm(x.maxMy)}</td></tr><tr><td>Mesh convergence</td><td data-testid="plate-convergence" data-within="${c.withinLimit}">${pretty(c.change * 100, 1)} % change from a ${pretty(c.coarseMeshSize * 1000, 0)} mm mesh · ${c.withinLimit ? "within" : "exceeds"} ${pretty(c.indicatorLimit * 100, 0)} %</td></tr></tbody></table><p class="design-note">${esc(c.note)}</p>${m.warnings.map((w) => `<p class="notice-small" data-testid="plate-warning">${esc(w.code)} · ${esc(w.message)}</p>`).join("")}<h4>Governing design moments</h4><table><thead><tr><th>Face</th><th>Wood–Armer</th><th>At</th></tr></thead><tbody>${governing}</tbody></table>${clamped}${columnsTable(pa, context)}<p class="design-note">${map ? "Reinforcement, shear, punching and span/depth are in the EC2 checks tab (demonstration)." : "Run the plate analysis to design the reinforcement."}</p></div></div>`;
}
