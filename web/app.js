import { Gateway } from "./state/transport.js";
import { save, recent } from "./state/storage.js";
import { Viewport } from "./render/viewport.js";
import { download, report, csv, escape as esc } from "./reports/report.js";
const $ = (s) => document.querySelector(s),
  gateway = new Gateway();
let project,
  modelHash,
  result,
  selected = "m1",
  tab = "displacements",
  busy = false,
  failed = false,
  formDirty = false,
  leaseRelease,
  leaseId,
  readOnly = false,
  saveQueue = Promise.resolve(),
  selectionToken = 0;
const viewport = new Viewport($("#viewport"), async (query) => {
  const token = ++selectionToken;
  try {
    const v = await gateway.send("queryGeometry", {
      kind: "ray",
      query,
      viewRevision: query.viewRevision,
    });
    $("#viewport").dataset.lastCpuPick = v.entityId || "";
    const picked = query.gpuEntityId || v.entityId;
    if (
      token === selectionToken &&
      v.viewRevision === viewport.viewRevision &&
      picked
    ) {
      selected = picked;
      renderInspector();
      renderNav();
      viewport.update(project, result, selected);
    }
  } catch (e) {
    message(e.message);
  }
});
function message(text) {
  $("#message").textContent = text;
  $("#message").hidden = !text;
}
function modal(title, html) {
  $("#modal-title").textContent = title;
  $("#modal-content").innerHTML = html;
  $("#modal").showModal();
}
$("#close-modal").onclick = () => $("#modal").close();
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) $("#modal").close();
});
const scope = () =>
  modal(
    "Capabilities & assumptions",
    `<p>This is an early structural mechanics workbench, with an actual Rust/WebAssembly solver. It is not an accepted analysis MVP or a code-design product.</p><ul class="scope-list"><li>Linear, small-displacement 3D Euler–Bernoulli frames.</li><li>Nodal actions, uniform member loads, self weight and explicit linear combinations.</li><li>Prescribed supports and planar XZ constraints.</li><li>SI engineering data; display values in engineering metric or SI.</li><li>End releases and interior point actions are currently rejected.</li><li>Conservative memory guard may refuse large models; full size/performance targets are unverified.</li><li>No buckling, nonlinear, shell, seismic, steel-code or concrete-code checks.</li><li>Numerical equivalence to PROKON is unknown.</li></ul><p>Viewport: click to select, drag to pan, wheel to zoom. In 3D, Alt-drag or right-drag to orbit. Home fits the model. Engineering edits use Apply changes and support undo/redo.</p><p>Projects stay in this browser's IndexedDB. Download a project for a portable backup. Reports require a current successful analysis.</p>`,
  );
$("#help").onclick = scope;
$("#scope").onclick = scope;
async function showRecent() {
  try {
    const rows = await recent();
    $("#recent-projects").replaceChildren();
    if (!rows.length) {
      $("#recent-projects").innerHTML =
        "<p>No projects yet. Start a frame or open a worked example.</p>";
      return;
    }
    for (const item of rows) {
      const b = document.createElement("button");
      b.className = "recent-row";
      b.innerHTML = `<div><strong>${esc(item.project.name)}</strong><small>${item.project.nodes.length} nodes · ${item.project.members.length} members · Revision ${item.project.revision}</small></div><small>${new Date(item.updated).toLocaleDateString()}　↗</small>`;
      b.onclick = () => open(item.project);
      $("#recent-projects").append(b);
    }
  } catch {
    $("#recent-projects").innerHTML =
      "<p>Local storage unavailable. Portable import and export remain available.</p>";
  }
}
async function claimLease(id) {
  if (leaseId === id) return;
  leaseRelease?.();
  leaseRelease = null;
  leaseId = id;
  readOnly = false;
  if (!navigator.locks) return;
  await new Promise((resolve) => {
    navigator.locks.request(
      "workbench:" + id,
      { ifAvailable: true },
      (lock) => {
        if (!lock) {
          readOnly = true;
          resolve();
          return;
        }
        return new Promise((release) => {
          leaseRelease = release;
          resolve();
        });
      },
    );
  });
}
async function persist() {
  if (!project || readOnly) return;
  const snapshot = structuredClone(portable());
  $("#save-status").textContent = "Saving…";
  saveQueue = saveQueue.catch(() => {}).then(() => save(snapshot));
  try {
    await saveQueue;
    if (project?.revision === snapshot.revision)
      $("#save-status").textContent = "Saved locally";
  } catch (e) {
    $("#save-status").textContent = "Save failed";
    message(
      "STORAGE_QUOTA: Local save failed. Download your project to preserve it. " +
        e.message,
    );
  }
}
async function open(p) {
  try {
    setBusy(true);
    const s = await gateway.send("importProject", {
      jsonUtf8: JSON.stringify(p),
      replaceCurrent: true,
    });
    await claimLease(s.project.id);
    project = s.project;
    project.name = p.name;
    project.displayUnits = p.displayUnits;
    modelHash = s.modelHash;
    result = null;
    failed = false;
    selected = project.members[0].id;
    $("#modal").close();
    $("#landing").hidden = true;
    $("#workspace").hidden = false;
    $("#top-context").textContent = "Frame analysis";
    message(
      readOnly
        ? "This project is open in another tab. This tab is read-only; exports and analysis remain available."
        : "",
    );
    refresh(s);
    viewport.fit();
    persist();
  } catch (e) {
    message(e.message);
    if ($("#workspace").hidden)
      modal(
        "Unable to open project",
        `<p>${esc(e.message)}</p><p>The current model has been preserved.</p>`,
      );
  } finally {
    setBusy(false);
  }
}
async function example(id, name) {
  const p = await fetch(`./examples/${id}.json`).then((r) => r.json());
  p.id = "p" + crypto.randomUUID().replaceAll("-", "");
  p.name = name;
  await open(p);
}
$("#new-project").onclick = () => example("B02", "Untitled cantilever");
$("#worked-examples").onclick = () => {
  const examples = [
    ["B02", "Cantilever", "3 m · tip force · bending about local y"],
    ["B01", "Axial extension", "2 m · axial force"],
    ["B03", "Saint Venant torsion", "2 m · applied torque"],
    ["B04", "Other bending axis", "3 m · force in local y"],
    ["B05", "Simply supported beam", "6 m · central nodal point load"],
    ["B06", "Rotated cantilever", "3 m · vertical member"],
    ["B07", "Uniformly loaded beam", "6 m · simply supported"],
    ["B08", "Fixed-ended beam", "6 m · loaded interior recovery"],
    ["B09", "Support movement", "Prescribed axial displacement"],
    ["B10", "Self weight", "Density × area × gravity"],
    ["B11", "Load combination", "1.2 LC1 + 1.5 LC2"],
  ];
  modal(
    "Worked examples",
    `<p>Original synthetic models with editable inputs. Run an analysis to calculate their response.</p><div class="example-grid">${examples.map(([id, name, desc]) => `<button data-example="${id}"><strong>${name}</strong><small>${id} · ${desc}</small></button>`).join("")}</div>`,
  );
  for (const b of document.querySelectorAll("[data-example]"))
    b.onclick = () =>
      example(b.dataset.example, b.querySelector("strong").textContent);
};
$("#open-project").onclick = () => $("#import-file").click();
$("#import-file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    modal(
      "Project too large",
      "<p>The maximum portable project size is 50 MiB.</p>",
    );
    return;
  }
  try {
    await open(JSON.parse(await file.text()));
  } catch (e) {
    modal("Invalid project", `<p>${esc(e.message)}</p>`);
  }
};
$("#home").onclick = () => {
  if (busy) return;
  $("#workspace").hidden = true;
  $("#landing").hidden = false;
  $("#top-context").textContent = "Your engineering workspace";
  showRecent();
};
function setBusy(value) {
  busy = value;
  for (const id of [
    "analyse",
    "undo",
    "redo",
    "new-project",
    "open-project",
    "worked-examples",
    "analysis-mode",
  ])
    $("#" + id).disabled =
      value || (readOnly && ["undo", "redo", "analysis-mode"].includes(id));
  if (project) {
    $("#undo").disabled = value || readOnly || !project.canUndo;
    $("#redo").disabled = value || readOnly || !project.canRedo;
  }
  for (const b of document.querySelectorAll(
    "#inspector-content input,#inspector-content button,#modal-content form button",
  ))
    b.disabled = value || readOnly;
  $("#analyse").disabled = value || formDirty;
  $("#cancel").hidden = !value;
}
function refresh(snapshot) {
  project.canUndo = snapshot?.canUndo ?? project.canUndo;
  project.canRedo = snapshot?.canRedo ?? project.canRedo;
  $("#project-name").value = project.name;
  $("#revision").textContent = "r" + project.revision;
  $("#model-count").textContent =
    `${project.nodes.length} nodes · ${project.members.length} members`;
  $("#analysis-mode").value = project.analysisMode;
  const previousCase = $("#result-case").value;
  $("#result-case").replaceChildren(
    ...[...project.loadCases, ...project.combinations].map((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.id + " · " + c.name;
      return o;
    }),
  );
  $("#result-case").value = [
    ...project.loadCases,
    ...project.combinations,
  ].some((c) => c.id === previousCase)
    ? previousCase
    : project.combinations[0]?.id || project.loadCases[0].id;
  $("#units").value = project.displayUnits;
  $("#view-title").textContent = project.name;
  $("#hash-status").textContent = modelHash.slice(0, 12) + " · f64";
  $("#kernel-status").textContent = "● Rust / WASM ready";
  renderNav();
  renderInspector();
  renderResults();
  viewport.update(project, result, selected);
  setBusy(busy);
}
function portable() {
  const { canUndo, canRedo, ...p } = project;
  return p;
}
async function command(type, args) {
  if (readOnly)
    throw Error("Read-only: this project is being edited in another tab");
  setBusy(true);
  try {
    const name = project.name,
      units = project.displayUnits;
    const s = await gateway.send("applyCommand", {
      command: {
        id: "c" + crypto.randomUUID().replaceAll("-", ""),
        type,
        args,
      },
    });
    project = s.project;
    project.name = name;
    project.displayUnits = units;
    modelHash = s.modelHash;
    failed = false;
    message(
      result && result.modelHash !== modelHash
        ? "Results are stale. The engineering model changed; analyse again before exporting a report."
        : "",
    );
    refresh(s);
    persist();
  } finally {
    setBusy(false);
  }
}
for (const id of ["undo", "redo"])
  $("#" + id).onclick = async () => {
    try {
      setBusy(true);
      const name = project.name,
        units = project.displayUnits;
      const s = await gateway.send(id);
      project = s.project;
      project.name = name;
      project.displayUnits = units;
      modelHash = s.modelHash;
      failed = false;
      refresh(s);
      persist();
      message(
        result && result.modelHash !== modelHash
          ? "Results are stale. Analyse the restored model."
          : "",
      );
    } catch (e) {
      message(e.message);
    } finally {
      setBusy(false);
    }
  };
$("#analysis-mode").onchange = () =>
  command("SetAnalysisMode", { mode: $("#analysis-mode").value }).catch((e) => {
    message(e.message);
    $("#analysis-mode").value = project.analysisMode;
  });
$("#project-name").onchange = () => {
  project.name = $("#project-name").value;
  $("#view-title").textContent = project.name;
  persist();
};
$("#units").onchange = () => {
  project.displayUnits = $("#units").value;
  renderResults();
  renderInspector();
  persist();
};
function renderNav() {
  const groups = [
    ["nodes", "Nodes", "◉"],
    ["members", "Members", "╱"],
    ["sections", "Sections", "▣"],
    ["materials", "Materials", "◈"],
    ["supports", "Supports", "△"],
    ["loadCases", "Load cases", "↧"],
    ["loads", "Loads", "↓"],
    ["combinations", "Combinations", "⊕"],
  ];
  $("#model-nav").innerHTML = groups
    .map(
      ([key, label, icon]) =>
        `<button data-group="${key}"${key === "members" ? ' class="active"' : ""}><span>${icon}　${label}</span><span class="count">${project[key].length}</span></button>${key === "members" ? project.members.map((m) => `<button class="entity ${selected === m.id ? "active" : ""}" data-member="${esc(m.id)}">${esc(m.id)} <small>${esc(m.start)} → ${esc(m.end)}</small></button>`).join("") : ""}`,
    )
    .join("");
  for (const b of document.querySelectorAll("[data-member]"))
    b.onclick = () => {
      selected = b.dataset.member;
      renderNav();
      renderInspector();
      viewport.update(project, result, selected);
    };
  for (const b of document.querySelectorAll("[data-group]"))
    b.onclick = () => entityList(b.dataset.group);
}
const input = (id, label, value, attrs = "") =>
  `<label>${label}<input id="${id}" name="${id}" type="text" inputmode="decimal" value="${value}" ${attrs}></label>`;
function renderInspector() {
  formDirty = false;
  const m =
    project.members.find((m) => m.id === selected) || project.members[0];
  selected = m.id;
  const sec = project.sections.find((s) => s.id === m.section),
    mat = project.materials.find((x) => x.id === m.material),
    start = project.nodes.find((n) => n.id === m.start),
    end = project.nodes.find((n) => n.id === m.end),
    load = project.loads.find((l) => l.type === "nodal" && l.node === m.end),
    support = project.supports.find((s) => s.node === m.start);
  const simple =
    project.members.length === 1 &&
    start.position.every((x) => x === 0) &&
    end.position[1] === 0 &&
    end.position[2] === 0;
  $("#selection-tag").textContent = m.id;
  $("#selected-status").textContent =
    `Member ${m.id} selected · ${m.start} → ${m.end}`;
  $("#inspector-content").innerHTML =
    `<div class="inspector-heading"><span class="symbol">╱</span><div><strong>Member ${esc(m.id)}</strong><small>${esc(m.start)} → ${esc(m.end)} · Custom section</small></div></div><form id="member-form"><div class="form-section"><h3>Geometry</h3><div class="fields">${simple ? input("span", "Span [m]", end.position[0], 'min="0.000001" required') : `<p class="form-help full">Edit node coordinates from the model explorer.</p>`}</div></div><div class="form-section"><h3>Material · ${esc(mat.id)}</h3><div class="fields">${input("elasticity", "E [GPa]", mat.E / 1e9, 'min="0.000001" required')}${input("poisson", "Poisson ratio ν", mat.nu, 'min="-0.999" max="0.499" required')}${input("density", "Density [kg/m³]", mat.density, 'min="0" required')}</div></div><div class="form-section"><h3>Section · ${esc(sec.id)}</h3><div class="fields">${input("area", "Area [m²]", sec.A, 'min="1e-15" required')}${input("torsion", "J [m⁴]", sec.J, 'min="1e-20" required')}${input("inertia-y", "Iy [m⁴]", sec.Iy, 'min="1e-20" required')}${input("inertia-z", "Iz [m⁴]", sec.Iz, 'min="1e-20" required')}</div><p class="form-help">Principal axes · ${esc(sec.provenance)}</p></div>${simple ? `<div class="form-section"><h3>Support & loading</h3><label class="check-label"><input id="fixed-support" type="checkbox" ${support ? "checked" : ""}> Fixed at ${esc(m.start)}</label><div class="fields" style="margin-top:14px">${load ? input("tip-load", "Tip Fz [kN]", load.values[2] / 1000, "required") : ""}</div><p class="form-help">Negative Fz acts downward, along global −Z. Unit suffixes such as “-13000 N” are accepted.</p></div>` : ""}<div id="form-error" class="error-text" role="alert"></div><button class="primary" type="submit">Apply changes</button></form>${result ? `<div class="probe"><small>${result.modelHash === modelHash ? "Result probe" : "Stale result probe"} · ${esc(m.id)} · ${esc(result.caseId)}</small><strong>${format(result.members.find((x) => x.id === m.id)?.samples.at(-1)?.displacement[2] * 1000)} mm</strong><small>Global Z displacement · station 1.00 L</small></div>` : ""}`;
  $("#member-form").oninput = () => {
    formDirty = true;
    $("#analyse").disabled = true;
    $("#export-report").disabled = true;
    $("#export-csv").disabled = true;
    $("#result-status").textContent = "Unapplied changes";
    $("#result-status").className = "badge stale";
  };
  $("#member-form").onsubmit = async (e) => {
    e.preventDefault();
    const quantity = (id, unit = "") => {
      const text = $("#" + id).value.trim();
      return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && unit
        ? text + " " + unit
        : text;
    };
    const commands = [
      {
        type: "SetMaterial",
        args: {
          ...mat,
          E: quantity("elasticity", "GPa"),
          nu: quantity("poisson"),
          density: quantity("density", "kg/m³"),
          existence: "update",
        },
      },
      {
        type: "SetSection",
        args: {
          ...sec,
          A: quantity("area", "m²"),
          J: quantity("torsion", "m⁴"),
          Iy: quantity("inertia-y", "m⁴"),
          Iz: quantity("inertia-z", "m⁴"),
          existence: "update",
        },
      },
    ];
    if (simple) {
      commands.push({
        type: "SetNodePosition",
        args: { id: end.id, position: [quantity("span", "m"), 0, 0] },
      });
      if (load)
        commands.push({
          type: "SetLoad",
          args: {
            ...load,
            values: load.values.map((v, i) =>
              i === 2 ? quantity("tip-load", "kN") : v,
            ),
            existence: "update",
          },
        });
      if ($("#fixed-support").checked && !support)
        commands.push({
          type: "SetSupport",
          args: {
            id: "s" + crypto.randomUUID().replaceAll("-", "").slice(0, 12),
            node: m.start,
            fixed: Array(6).fill(true),
            prescribed: Array(6).fill(0),
            existence: "create",
          },
        });
      if (!$("#fixed-support").checked && support)
        commands.push({
          type: "DeleteEntities",
          args: { ids: [support.id], cascade: false },
        });
    }
    try {
      await command("Batch", { commands });
    } catch (e) {
      $("#form-error").textContent = e.message;
    }
  };
  setBusy(busy);
  renderResults();
}
function format(n) {
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 6 }).format(
        Object.is(n, -0) ? 0 : n,
      )
    : "—";
}
function renderResults() {
  const current = result && result.modelHash === modelHash;
  $("#result-status").textContent = failed
    ? "Analysis failed"
    : result
      ? current
        ? "✓ Current"
        : "⚠ Stale results"
      : "Not analysed";
  $("#result-status").className =
    "badge " +
    (failed ? "failed" : result ? (current ? "current" : "stale") : "");
  $("#export-report").disabled = !current || failed;
  $("#export-csv").disabled = !current || failed;
  if (!result) {
    $("#results-content").innerHTML =
      `<div class="empty-results"><span>${failed ? "!" : "⌁"}</span><strong>${failed ? "No numerical result" : "Your results start here"}</strong><p>${failed ? "Resolve the diagnostic above, then analyse again." : "Review your model, then run an analysis."}</p></div>`;
    return;
  }
  const eng = project.displayUnits === "engineeringMetric",
    u = eng ? 1000 : 1,
    f = eng ? 0.001 : 1;
  let heads, rows;
  if (tab === "displacements") {
    heads = [
      "Node",
      `ux [${eng ? "mm" : "m"}]`,
      `uy [${eng ? "mm" : "m"}]`,
      `uz [${eng ? "mm" : "m"}]`,
      "rx [rad]",
      "ry [rad]",
      "rz [rad]",
    ];
    rows = result.nodeIds.map((id, i) => [
      id,
      ...Array.from(result.nodeDisplacements.slice(i * 6, i * 6 + 6), (v, j) =>
        format(v * (j < 3 ? u : 1)),
      ),
    ]);
  }
  if (tab === "reactions") {
    heads = [
      "Support",
      ...["Fx", "Fy", "Fz"].map((k) => `${k} [${eng ? "kN" : "N"}]`),
      ...["Mx", "My", "Mz"].map((k) => `${k} [${eng ? "kN m" : "N m"}]`),
    ];
    rows = result.reactionSupportIds.map((id, i) => [
      id,
      ...Array.from(result.reactions.slice(i * 6, i * 6 + 6), (v) =>
        format(v * f),
      ),
    ]);
  }
  if (tab === "forces") {
    heads = [
      "Member",
      "End",
      ...["Fx", "Fy", "Fz", "Mx", "My", "Mz"].map(
        (k, i) => `${k} [${eng ? "kN" : "N"}${i > 2 ? " m" : ""}]`,
      ),
    ];
    rows = result.members.flatMap((m) =>
      [0, 1].map((i) => [
        m.id,
        i ? "j" : "i",
        ...m.endActions.slice(i * 6, i * 6 + 6).map((v) => format(v * f)),
      ]),
    );
  }
  if (tab === "equilibrium") {
    const c = result.numericalChecks;
    $("#results-content").innerHTML =
      `<div class="equilibrium"><div><strong>✓ Global force balance</strong><small>${c.globalBalance
        .slice(0, 3)
        .map((x) => x.toExponential(2))
        .join(
          ", ",
        )} N</small></div><div><strong>✓ Global moment balance</strong><small>${c.globalBalance
        .slice(3)
        .map((x) => x.toExponential(2))
        .join(
          ", ",
        )} N m</small></div><div><strong>Scaled residual</strong><small>${c.scaledResidual.toExponential(4)} · min pivot ${c.minScaledPivot.toExponential(4)}</small></div></div>`;
    return;
  }
  $("#results-content").innerHTML =
    `${current ? "" : '<p class="notice-small">Stale results — these values belong to the previous model.</p>'}<table><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<${i ? "td" : "th"}${i ? "" : ' scope="row"'}>${esc(v)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table>`;
}
for (const b of document.querySelectorAll("[data-tab]"))
  b.onclick = () => {
    tab = b.dataset.tab;
    document
      .querySelectorAll("[data-tab]")
      .forEach((x) => x.classList.toggle("active", x === b));
    renderResults();
  };
$("#analyse").onclick = async () => {
  if (!project) return;
  try {
    setBusy(true);
    message("Analysing the current model…");
    const chosen = $("#result-case").value || project.loadCases[0].id;
    const response = await gateway.send("analyse", {
      caseIds: project.loadCases.some((c) => c.id === chosen) ? [chosen] : [],
      combinationIds: project.combinations.some((c) => c.id === chosen)
        ? [chosen]
        : [],
    });
    result = response;
    failed = false;
    $("#display-result").value = "deformed";
    viewport.resultView = "deformed";
    $("#deformation-legend").hidden = false;
    message("");
    renderResults();
    renderInspector();
    viewport.update(project, result, selected);
  } catch (e) {
    result = null;
    failed = true;
    message(e.message);
    renderResults();
    viewport.update(project, null, selected);
  } finally {
    setBusy(false);
  }
};
$("#cancel").onclick = async () => {
  const p = project && portable();
  gateway.cancel();
  if (p) {
    const s = await gateway.send("importProject", {
      jsonUtf8: JSON.stringify(p),
      replaceCurrent: false,
    });
    gateway.revision = s.project.revision;
  }
  message("CANCELLED: Model restored; you can edit or rerun.");
  setBusy(false);
};
gateway.onCrash = async () => {
  message("Worker stopped. Restoring the last confirmed model.");
  const p = project && portable();
  gateway.cancel("Worker stopped");
  if (p) {
    await gateway.send("importProject", {
      jsonUtf8: JSON.stringify(p),
      replaceCurrent: false,
    });
    setBusy(false);
  }
};
gateway.onTimeout = async () => {
  const p = project && portable();
  if (p) {
    setBusy(true);
    try {
      await gateway.send("importProject", {
        jsonUtf8: JSON.stringify(p),
        replaceCurrent: false,
      });
      message(
        "TIMEOUT: Analysis stopped. The last confirmed model has been restored.",
      );
    } catch (e) {
      message(e.message);
    } finally {
      setBusy(false);
    }
  }
};
$("#export-project").onclick = () =>
  download(project.id + ".json", JSON.stringify(portable(), null, 2));
$("#export-report").onclick = () => {
  if (result && result.modelHash === modelHash && !failed)
    download(
      project.id + "-report.html",
      report(portable(), result),
      "text/html",
    );
};
$("#export-csv").onclick = () => {
  if (result && result.modelHash === modelHash && !failed)
    download(project.id + "-results.csv", csv(result), "text/csv");
};
$("#result-case").onchange = () => {
  result = null;
  failed = false;
  renderResults();
  renderInspector();
  viewport.update(project, null, selected);
  message("Selected analysis case changed. Analyse to calculate this case.");
};
$("#display-result").onchange = () => {
  viewport.resultView = $("#display-result").value;
  $("#deformation-legend").hidden = viewport.resultView !== "deformed";
  viewport.draw();
};
$("#deformation-scale").oninput = () => {
  viewport.scale = Math.max(
    0,
    Math.min(10000, Number($("#deformation-scale").value) || 0),
  );
  viewport.draw();
};
$("#fit").onclick = () => viewport.fit();
$("#reset-viewport").onclick = () => {
  if (viewport.device && viewport.ready) {
    viewport.device.destroy();
  } else viewport.init();
};
for (const mode of ["elevation", "3d"])
  $("#view-" + mode).onclick = () => {
    viewport.mode = mode;
    $("#view-subtitle").textContent =
      mode === "3d"
        ? "Perspective axes · Alt-drag to orbit"
        : "Global XZ · metres";
    $("#view-elevation").classList.toggle("active", mode === "elevation");
    $("#view-3d").classList.toggle("active", mode === "3d");
    viewport.fit();
  };
function entityList(key) {
  const title = {
    nodes: "Nodes",
    members: "Members",
    materials: "Materials",
    sections: "Sections",
    supports: "Supports",
    loadCases: "Load cases",
    loads: "Loads",
    combinations: "Combinations",
  }[key];
  modal(
    title,
    `<p>Edit authoritative model data. Coordinates and all advanced fields are in SI units.</p><div class="entity-table-wrap"><table><thead><tr><th>ID</th><th>Description</th><th>Action</th></tr></thead><tbody>${project[key].map((v) => `<tr><th>${esc(v.id)}</th><td>${esc(v.name || v.node || v.type || (v.start ? `${v.start} → ${v.end}` : v.position?.join(", ") || ""))}</td><td><button data-edit="${esc(v.id)}">Edit ${esc(v.id)}</button></td></tr>`).join("")}</tbody></table></div><button class="primary add-button" id="add-entity">＋ Add ${title.toLowerCase()}</button>`,
  );
  for (const b of document.querySelectorAll("[data-edit]"))
    b.onclick = () =>
      editEntity(
        key,
        project[key].find((x) => x.id === b.dataset.edit),
      );
  $("#add-entity").onclick = () => editEntity(key, null);
}
function editEntity(key, old) {
  const id =
    old?.id || key[0] + crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const defaults = {
    nodes: { id, position: [0, 0, 0] },
    members: {
      id,
      start: project.nodes[0].id,
      end: project.nodes.at(-1).id,
      material: project.materials[0].id,
      section: project.sections[0].id,
      localY: [0, 1, 0],
      releaseStart: { my: false, mz: false },
      releaseEnd: { my: false, mz: false },
    },
    materials: { ...project.materials[0], id, name: "Custom material" },
    sections: { ...project.sections[0], id, name: "Custom section" },
    supports: {
      id,
      node: project.nodes[0].id,
      fixed: [true, true, true, true, true, true],
      prescribed: [0, 0, 0, 0, 0, 0],
    },
    loadCases: { id, name: "New case", category: "other" },
    loads: {
      id,
      case: project.loadCases[0].id,
      type: "nodal",
      node: project.nodes.at(-1).id,
      values: [0, 0, -10000, 0, 0, 0],
    },
    combinations: {
      id,
      name: "New combination",
      purpose: "analysis",
      terms: [{ case: project.loadCases[0].id, factor: 1 }],
    },
  };
  const entity = structuredClone(old || defaults[key]);
  $("#modal-title").textContent = (old ? "Edit " : "Add ") + key;
  $("#modal-content").innerHTML =
    `<form id="entity-form" class="entity-form">${Object.entries(entity)
      .map(
        ([k, v]) =>
          `<label class="${typeof v === "object" ? "full" : ""}">${esc(k)}${typeof v === "object" ? `<textarea name="${esc(k)}" required>${esc(JSON.stringify(v))}</textarea>` : `<input name="${esc(k)}" value="${esc(v)}" ${typeof v === "number" ? 'type="number" step="any"' : 'type="text"'} ${k === "id" && old ? "readonly" : ""} required>`}</label>`,
      )
      .join(
        "",
      )}<div class="error-text" id="entity-error" role="alert"></div><div class="dialog-actions">${old ? '<button type="button" class="danger" id="delete-entity">Delete entity</button>' : ""}<button class="primary" type="submit">Save entity</button></div></form>`;
  $("#entity-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData(e.target);
      const value = Object.fromEntries(
        Object.entries(entity).map(([k, v]) => [
          k,
          typeof v === "object"
            ? JSON.parse(data.get(k))
            : typeof v === "number"
              ? Number(data.get(k))
              : data.get(k),
        ]),
      );
      const type = {
        nodes: old ? "SetNodePosition" : "AddNode",
        members: "AddMember",
        materials: "SetMaterial",
        sections: "SetSection",
        supports: "SetSupport",
        loadCases: "SetLoadCase",
        loads: "SetLoad",
        combinations: "SetCombination",
      }[key];
      if (key === "members" && old) {
        await command("Batch", {
          commands: [
            { type: "DeleteEntities", args: { ids: [old.id], cascade: false } },
            { type: "AddMember", args: value },
          ],
        });
      } else
        await command(
          type,
          key === "nodes"
            ? value
            : { ...value, existence: old ? "update" : "create" },
        );
      entityList(key);
    } catch (e) {
      $("#entity-error").textContent = e.message;
    }
  };
  if (old)
    $("#delete-entity").onclick = async () => {
      try {
        await command("DeleteEntities", { ids: [old.id], cascade: false });
        entityList(key);
      } catch (e) {
        $("#entity-error").textContent = e.message;
      }
    };
}
window.addEventListener("keydown", (e) => {
  if (
    !project ||
    $("#workspace").hidden ||
    $("#modal").open ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  )
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    $(e.shiftKey ? "#redo" : "#undo").click();
  }
});
showRecent();
gateway.ready.catch((e) =>
  modal("Kernel unavailable", `<p>${esc(e.message)}</p>`),
);
