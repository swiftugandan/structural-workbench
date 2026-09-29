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
  return `<fieldset class="design-subsection" id="preview-plate"><legend>Plate analysis (plate-v1)</legend>${plate ? "" : '<p class="design-note" data-testid="plate-not-configured">Not configured · saving records these inputs.</p>'}<p class="design-note">Uniform pressure on the panel; edges and material are your inputs. Not connected to the frame model.</p>${edgeRows}<label class="design-check full"><input type="checkbox" id="preview-plate-opening" ${include ? "checked" : ""}> Cut the opening from the panel ${sourceMark(src("includeOpening"))}</label>${rows}</fieldset>`;
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
export function plateContour(pa, key) {
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
  let values, cells;
  if (nodal) {
    // Cell colour from the mean of its corner deflections (display only).
    const at = new Map(f.nodes.map((g, n) => [g.join(","), f.w[n]]));
    cells = f.cells;
    values = cells.map(
      ([i, j]) =>
        (at.get(`${i},${j}`) +
          at.get(`${i + 1},${j}`) +
          at.get(`${i + 1},${j + 1}`) +
          at.get(`${i},${j + 1}`)) /
        4,
    );
  } else {
    cells = f.cells;
    values = f[key];
  }
  const lo = Math.min(...values),
    hi = Math.max(...values),
    signed = !["bottomX", "bottomY", "topX", "topY"].includes(key);
  const rects = cells
    .map(
      ([i, j], e) =>
        `<rect x="${X(xs[i]).toFixed(2)}" y="${Y(ys[j + 1]).toFixed(2)}" width="${(s * (xs[i + 1] - xs[i])).toFixed(2)}" height="${(s * (ys[j + 1] - ys[j])).toFixed(2)}" fill="${colour(values[e], lo, hi, signed)}"/>`,
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
  const [pi, pj] = cells[peak];
  const px = X((xs[pi] + xs[pi + 1]) / 2),
    py = Y((ys[pj] + ys[pj + 1]) / 2);
  const unit = nodal ? "mm" : "kN·m/m",
    scale = nodal ? 1000 : 0.001;
  const legend = `<g font-size="11" fill="#142b44"><text x="${pad}" y="${H - 8}">min ${pretty(lo * scale, 2)} ${unit}</text><text x="${W - pad}" y="${H - 8}" text-anchor="end">max ${pretty(hi * scale, 2)} ${unit}</text></g>`;
  return `<svg class="plate-contour" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(key)} contour over the slab panel" data-testid="plate-contour" data-field="${esc(key)}" data-cells="${cells.length}"><g shape-rendering="crispEdges">${rects}</g>${opening}${[0, 1, 2, 3].map(edgeLine).join("")}<circle cx="${px}" cy="${py}" r="5" fill="none" stroke="#142b44" stroke-width="2"/><text x="${X(0)}" y="${Y(0) + 16}" font-size="11" fill="#53667c">0,0</text><text x="${X(lx)}" y="${Y(0) + 16}" font-size="11" fill="#53667c" text-anchor="end">x = ${pretty(lx, 2)} m</text><text x="${X(0) - 6}" y="${Y(ly) + 4}" font-size="11" fill="#53667c" text-anchor="end">y</text>${legend}</svg>`;
}

const kNm = (v) => `${pretty(v / 1000, 2)} kN·m/m`;

/** The "Plate actions" pane of a slab run. */
export function platePane(run, field) {
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
  return `<div class="plate-pane" data-testid="plate-pane"><div class="plate-map"><div class="design-view-switch" role="group" aria-label="Plate result field">${plateFields.map(([k, label]) => `<button data-plate-field="${k}" aria-pressed="${field === k}">${esc(label)}</button>`).join("")}</div>${plateContour(pa, field)}<p class="design-note">Element-centre values (unsmoothed), sagging positive. Wood–Armer values are moments to resist on each face, not reinforcement. Heavy edge: clamped · dashed: simple · thin: free.</p></div><div class="plate-tables"><h4>Solution <span class="design-tag">MECHANICS · plate-v1</span></h4><table><tbody><tr><td>Mesh</td><td data-testid="plate-elements">${m.elements} elements · ${m.nodes} nodes · largest aspect ${pretty(m.maxAspect, 2)}</td></tr><tr><td>Pressure</td><td>${pretty(pa.load.pressure / 1000, 3)} kPa down</td></tr><tr><td>Equilibrium</td><td data-testid="plate-balance" data-si="${e.relativeImbalance}">reactions ${pretty(e.reactions / 1000, 3)} kN vs load ${pretty(e.applied / 1000, 3)} kN (${e.relativeImbalance.toExponential(1)})</td></tr><tr><td>Max deflection</td><td>${pretty(x.maxDeflection * 1000, 3)} mm</td></tr><tr><td>mx range</td><td>${kNm(x.minMx)} … ${kNm(x.maxMx)}</td></tr><tr><td>my range</td><td>${kNm(x.minMy)} … ${kNm(x.maxMy)}</td></tr><tr><td>Mesh convergence</td><td data-testid="plate-convergence" data-within="${c.withinLimit}">${pretty(c.change * 100, 1)} % change from a ${pretty(c.coarseMeshSize * 1000, 0)} mm mesh · ${c.withinLimit ? "within" : "exceeds"} ${pretty(c.indicatorLimit * 100, 0)} %</td></tr></tbody></table><p class="design-note">${esc(c.note)}</p>${m.warnings.map((w) => `<p class="notice-small" data-testid="plate-warning">${esc(w.code)} · ${esc(w.message)}</p>`).join("")}<h4>Governing design moments</h4><table><thead><tr><th>Face</th><th>Wood–Armer</th><th>At</th></tr></thead><tbody>${governing}</tbody></table>${clamped}<p class="design-note">Reinforcement areas, punching and deflection limits need a slab code profile and remain UNSUPPORTED.</p></div></div>`;
}
