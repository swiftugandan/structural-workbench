// Model exchange (exchange-v1, ADR 0025): IFC4 structural analysis models
// and DXF wireframes. Rust reads the file and states every decision; this
// module only renders the conversion review, collects the answers as a
// mapping manifest, and hands both back to Rust. Nothing is defaulted: no
// choice is preselected, and Accept waits for every answer.
import { escape as esc } from "./reports/report.js";

export const MAPPING_FORMAT = "workbench-exchange-mapping-v1";

/** File bytes as text: UTF-8 when valid, otherwise ISO 8859-1 (older DXF). */
export async function fileText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192)
      s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return s;
  }
}

export function formatOf(name) {
  const ext = name.split(".").pop().toLowerCase();
  return ext === "ifc" ? "ifc" : ext === "dxf" ? "dxf" : null;
}

const quantityLabel = {
  length: "Length",
  force: "Force",
  mass: "Mass",
  area: "Area",
  momentOfInertia: "Second moment of area",
  sectionModulus: "Section modulus",
  modulusOfElasticity: "Modulus of elasticity",
  massDensity: "Mass density",
  linearForce: "Force per length",
  linearMoment: "Moment per length",
  torque: "Moment",
  linearStiffness: "Translational stiffness",
  rotationalStiffness: "Rotational stiffness",
};

const countLabel = {
  nodes: "Nodes",
  members: "Members",
  supports: "Supports",
  materials: "Materials",
  sections: "Sections",
  loadCases: "Load cases",
  combinations: "Combinations",
  loads: "Loads",
  segments: "Line segments",
  layers: "Layers",
};

const dispositionLabel = {
  notImported: "Not imported",
  notExported: "Not exported",
  converted: "Converted",
  skipped: "Skipped by choice",
};

export function ledgerTable(ledger, testid) {
  if (!ledger.length)
    return `<p data-testid="${testid}-empty">Nothing was lost or converted.</p>`;
  return `<table class="exchange-ledger" data-testid="${testid}"><thead><tr><th>What</th><th>Count</th><th>Disposition</th><th>Why</th><th>Examples</th></tr></thead><tbody>${ledger
    .map(
      (l) =>
        `<tr data-subject="${esc(l.subject)}"><th scope="row">${esc(l.subject)}</th><td>${l.count}</td><td>${esc(dispositionLabel[l.disposition] || l.disposition)}</td><td>${esc(l.reason)}</td><td><small>${esc(l.examples.join(", "))}</small></td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function decisionHtml(d) {
  const radios = d.choices
    .map(
      (c) =>
        `<label class="exchange-choice"><input type="radio" name="d:${esc(d.id)}" value="${esc(c.value)}"> ${esc(c.label)}</label>`,
    )
    .join("");
  const fields = d.fields?.length
    ? `<div class="exchange-fields">${d.fields
        .map(
          (f) =>
            `<label><span>${esc(f.label)}${f.unit ? ` (${esc(f.unit)})` : ""}</span><input name="f:${esc(d.id)}:${esc(f.name)}" data-field="${esc(f.name)}" inputmode="decimal" autocomplete="off" value="${f.found == null ? "" : esc(String(f.found))}"${f.found == null ? "" : ` data-found="true"`}></label>`,
        )
        .join("")}</div>`
    : "";
  const affects = d.entities?.length
    ? `<small class="exchange-affects">Affects: ${esc(d.entities.slice(0, 8).join(", "))}${d.entities.length > 8 ? ` and ${d.entities.length - 8} more` : ""}</small>`
    : "";
  return `<fieldset class="exchange-decision" data-decision="${esc(d.id)}" data-testid="decision-${esc(d.id)}"><legend>${esc(d.question)}</legend>${radios}${fields}${affects}</fieldset>`;
}

export function reviewHtml(report) {
  const s = report.source;
  const counts = Object.entries(report.counts)
    .map(
      ([k, v]) =>
        `<tr><th scope="row">${esc(countLabel[k] || k)}</th><td data-testid="count-${esc(k)}">${v}</td></tr>`,
    )
    .join("");
  const units = report.units
    .map(
      (u) =>
        `<tr data-testid="unit-${esc(u.quantity)}"><th scope="row">${esc(quantityLabel[u.quantity] || u.quantity)}</th><td>${esc(u.label)}</td><td>${esc(u.source)}</td></tr>`,
    )
    .join("");
  const blocking = report.blocking.length
    ? `<section class="exchange-blocking" data-testid="exchange-blocking" role="alert"><h3>This file cannot be imported</h3><ul>${report.blocking
        .map(
          (b) => `<li><strong>${esc(b.code)}</strong> ${esc(b.message)}</li>`,
        )
        .join("")}</ul><p>The current project is unchanged.</p></section>`
    : "";
  return `<div class="exchange-review" data-testid="exchange-review">
<p class="exchange-disclosure" data-testid="exchange-disclosure">exchange-v1 reads IFC4 structural analysis models and DXF wireframes into the workbench's frame model. It is browser-only file exchange, not a native Revit or other authoring-tool round trip. Every conversion that is not exact is listed below, and every choice is yours.</p>
<dl class="exchange-source"><dt>File</dt><dd data-testid="exchange-file">${esc(s.fileName)}</dd><dt>Format</dt><dd data-testid="exchange-schema">${esc(s.schema)}</dd><dt>SHA-256</dt><dd><code data-testid="exchange-sha">${esc(s.sha256)}</code></dd><dt>Size</dt><dd>${s.bytes.toLocaleString()} bytes</dd></dl>
${blocking}
<div class="exchange-columns"><section><h3>Contents</h3><table>${counts}</table></section><section><h3>Units</h3><table data-testid="exchange-units">${units}</table></section></div>
<section><h3>Decisions (${report.decisions.length})</h3>${report.decisions.length ? report.decisions.map(decisionHtml).join("") : `<p data-testid="exchange-no-decisions">This file states everything the import needs.</p>`}</section>
<section><h3>Loss and conversion ledger</h3>${ledgerTable(report.ledger, "exchange-ledger")}</section>
<p class="exchange-error" id="exchange-error" role="alert" data-testid="exchange-error"></p>
<div class="dialog-actions"><button type="button" id="exchange-load-mapping">Load mapping…</button><button type="button" id="exchange-save-mapping" data-testid="exchange-save-mapping">↓ Mapping</button><button type="button" class="primary" id="exchange-accept" data-testid="exchange-accept" disabled>Import</button></div>
<input type="file" id="exchange-mapping-file" accept=".json,application/json" hidden>
</div>`;
}

/** The answers the form holds, or the first problem with them. */
export function readAnswers(root, report) {
  const answers = {};
  const problems = [];
  for (const d of report.decisions) {
    const box = root.querySelector(`[data-decision="${CSS.escape(d.id)}"]`);
    const choice = box.querySelector("input[type=radio]:checked")?.value;
    if (!choice) {
      problems.push(d.id);
      continue;
    }
    const answer = { choice };
    if (choice === "values") {
      answer.values = {};
      for (const f of d.fields) {
        const raw = box
          .querySelector(`[data-field="${CSS.escape(f.name)}"]`)
          .value.trim();
        const x = raw === "" ? NaN : Number(raw);
        const ok =
          Number.isFinite(x) &&
          (f.rule === "positive"
            ? x > 0
            : f.rule === "nonNegative"
              ? x >= 0
              : x > -1 && x < 0.5);
        if (!ok) {
          problems.push(`${d.id}: ${f.label}`);
          continue;
        }
        answer.values[f.name] = x;
      }
    }
    answers[d.id] = answer;
  }
  return { answers, problems };
}

function fillAnswers(root, report, mapping) {
  if (mapping.format !== MAPPING_FORMAT)
    throw Error(`A mapping manifest has format ${MAPPING_FORMAT}`);
  if (mapping.sourceSha256 !== report.source.sha256)
    throw Error(
      "This mapping manifest was made for a different file (SHA-256 differs)",
    );
  for (const [id, a] of Object.entries(mapping.answers || {})) {
    const box = root.querySelector(`[data-decision="${CSS.escape(id)}"]`);
    if (!box)
      throw Error(`The mapping answers ${id}, which this file does not need`);
    const radio = [...box.querySelectorAll("input[type=radio]")].find(
      (r) => r.value === a.choice,
    );
    if (!radio) throw Error(`${id}: '${a.choice}' is not an offered choice`);
    radio.checked = true;
    for (const [k, v] of Object.entries(a.values || {})) {
      const input = box.querySelector(`[data-field="${CSS.escape(k)}"]`);
      if (input) input.value = String(v);
    }
  }
}

export function exchangeWorkspace({
  gateway,
  modal,
  download,
  message,
  adopt,
  getProject,
  setBusy,
}) {
  const $ = (s) => document.querySelector(s);
  let pending = null;

  async function review(file) {
    const format = formatOf(file.name);
    if (!format) {
      modal(
        "Unable to import",
        `<p>${esc(file.name)} is not an .ifc or .dxf file.</p><p>The current model has been preserved.</p>`,
      );
      return;
    }
    if (file.size > 64 * 1024 * 1024) {
      modal(
        "Unable to import",
        "<p>Exchange files are limited to 64 MiB.</p><p>The current model has been preserved.</p>",
      );
      return;
    }
    let report;
    const text = await fileText(file);
    try {
      setBusy(true);
      report = await gateway.send("exchangeRead", {
        format,
        fileName: file.name,
        text,
      });
    } catch (e) {
      modal(
        "Unable to import",
        `<p>${esc(e.message)}</p><p>The current model has been preserved.</p>`,
      );
      return;
    } finally {
      setBusy(false);
    }
    pending = { format, fileName: file.name, text, report };
    modal("Conversion review", reviewHtml(report));
    // Listeners live on this review's own element, so they end with it.
    const root = $("#modal-content .exchange-review");
    const accept = $("#exchange-accept");
    const sync = () => {
      const { problems } = readAnswers(root, report);
      accept.disabled = report.blocking.length > 0 || problems.length > 0;
    };
    root.addEventListener("input", (e) => {
      // Typing a value chooses 'values' for that decision.
      const box = e.target.closest("[data-decision]");
      if (e.target.matches("[data-field]") && box) {
        const values = box.querySelector('input[type=radio][value="values"]');
        if (values) values.checked = true;
      }
      sync();
    });
    root.addEventListener("change", sync);
    sync();
    $("#exchange-save-mapping").onclick = () => {
      const { answers, problems } = readAnswers(root, report);
      download(
        `${report.source.fileName}.mapping.json`,
        JSON.stringify(
          {
            format: MAPPING_FORMAT,
            sourceSha256: report.source.sha256,
            answers,
            ...(problems.length ? { unanswered: problems } : {}),
          },
          null,
          2,
        ),
      );
    };
    $("#exchange-load-mapping").onclick = () =>
      $("#exchange-mapping-file").click();
    $("#exchange-mapping-file").onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        fillAnswers(root, report, JSON.parse(await f.text()));
        $("#exchange-error").textContent = "";
      } catch (err) {
        $("#exchange-error").textContent = err.message;
      }
      sync();
    };
    accept.onclick = () => commit(root);
  }

  async function commit(root) {
    const { format, fileName, text, report } = pending;
    const { answers, problems } = readAnswers(root, report);
    if (problems.length) {
      $("#exchange-error").textContent =
        `Answer every decision first: ${problems.join(", ")}`;
      return;
    }
    const mapping = {
      format: MAPPING_FORMAT,
      sourceSha256: report.source.sha256,
      answers,
    };
    let s;
    try {
      setBusy(true);
      s = await gateway.send("exchangeImport", {
        format,
        fileName,
        text,
        mapping,
      });
    } catch (e) {
      // Refused atomically: the current model is untouched.
      $("#exchange-error").textContent =
        `${e.message} The current model has been preserved.`;
      return;
    } finally {
      setBusy(false);
    }
    $("#modal").close();
    const record = s.conversionRecord;
    await adopt(s);
    modal(
      "Import complete",
      `<div data-testid="exchange-imported"><p>Imported ${esc(record.source.fileName)} (${esc(record.source.schema)}): ${s.project.nodes.length} nodes, ${s.project.members.length} members, ${s.project.loadCases.length} load case(s).</p>
<p>Model hash <code data-testid="exchange-model-hash">${esc(record.projectHash)}</code></p>
${ledgerTable(record.ledger, "exchange-import-ledger")}
<div class="dialog-actions"><button type="button" id="exchange-record" data-testid="exchange-record">↓ Conversion record</button></div></div>`,
    );
    $("#exchange-record").onclick = () =>
      download(
        `${record.source.fileName}.conversion.json`,
        JSON.stringify(record, null, 2),
      );
  }

  async function exportAs(format) {
    if (!getProject()) return;
    let e;
    try {
      e = await gateway.send("exchangeExport", {
        format,
        timestamp: new Date().toISOString().slice(0, 19),
      });
    } catch (err) {
      message(err.message);
      return;
    }
    download(e.fileName, e.text, e.mediaType);
    modal(
      format === "ifc" ? "IFC export" : "DXF export",
      `<div data-testid="exchange-exported"><p>Wrote ${esc(e.fileName)} (SHA-256 <code data-testid="exchange-export-sha">${esc(e.sha256)}</code>) from model <code data-testid="exchange-export-model">${esc(e.projectHash)}</code></p>
<p>${format === "ifc" ? "IFC4 structural analysis model in SI units, with workbench identities for lossless re-import." : "R12 DXF wireframe in metres: one line per member, on a layer per section."} What the file cannot carry:</p>
${ledgerTable(e.ledger, "exchange-export-ledger")}
<div class="dialog-actions"><button type="button" id="exchange-ledger" data-testid="exchange-ledger-download">↓ Loss ledger</button></div></div>`,
    );
    $("#exchange-ledger").onclick = () =>
      download(
        `${e.fileName}.ledger.json`,
        JSON.stringify(
          {
            file: e.fileName,
            sha256: e.sha256,
            projectHash: e.projectHash,
            ledger: e.ledger,
          },
          null,
          2,
        ),
      );
  }

  $("#exchange-file").onchange = async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = "";
    if (file) await review(file);
  };
  return {
    pick: () => $("#exchange-file").click(),
    exportIfc: () => exportAs("ifc"),
    exportDxf: () => exportAs("dxf"),
  };
}
