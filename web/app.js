import { renderForceInspector } from "./force-inspector.js";
import { bindResultPicker } from "./result-picker.js";
import { actionComponents } from "./render/action-diagrams.js";
import { bindTemplates } from "./model-templates.js";
import { structuralIcon } from "./structural-icons.js";
import {
  entityGuides,
  entityFields,
  readEntityFields,
  bindEntityFields,
  bindSectionCalculator,
  guideDiagram,
} from "./entity-forms.js";
import { entityLabel } from "./entity-labels.js";
import { canvasTools } from "./canvas-tools.js";
import { workspaceUI } from "./workspace-ui.js";
import { cad } from "./cad.js";
import { topology } from "./topology.js";
import { modeling } from "./modeling.js";
import { lineageSummary, renderMemberNav } from "./hierarchy.js";
import { Gateway } from "./state/transport.js";
import {
  duplicateAsVariant,
  buildComparison,
} from "./variants.js";
import {
  save,
  recent,
  listRevisions,
  loadRevision,
  retainOriginal,
  isVerifiedSnapshot,
  resolveRecoverableProject,
} from "./state/storage.js";
import { Viewport } from "./render/viewport.js";
import { download, report, csv, escape as esc } from "./reports/report.js";
import { initOffline, afterSaved } from "./offline.js";
import {
  loadCapabilitiesLedger,
  renderCapabilitiesModalHtml,
  domainDisclosureFromLedger,
  importDisclosureMessage,
} from "./capabilities-ledger.js";
import { openSteelCheckDialog } from "./steel-check.js";
const label = (id) => entityLabel(project, id);
const $ = (s) => document.querySelector(s),
  gateway = new Gateway();
/** Linear-static result for diagrams; envelopes never enter the force pipeline. */
const diagramResult = () =>
  result && result.analysisType !== "envelope" ? result : null;
let project,
  modelHash,
  result,
  selected = "m1",
  tab = "displacements",
  busy = false,
  analysing = false,
  failed = false,
  formDirty = false,
  leaseRelease,
  leaseId,
  readOnly = false,
  saveQueue = Promise.resolve();
const viewport = new Viewport($("#viewport"), async (query) => {
  try {
    const cameraKey = JSON.stringify(query.camera),
      revision = project.revision;
    const v = await gateway.send("queryGeometry", {
      kind: "screenPick",
      query: { camera: query.camera, point: query.point },
      viewRevision: query.viewRevision,
    });
    $("#viewport").dataset.lastCpuPick = v.entityId || "";
    if (
      project.revision === revision &&
      JSON.stringify(viewport.camera()) === cameraKey
    )
      selectEntities(v.entityId ? [v.entityId] : [], query.toggle);
  } catch (e) {
    message(e.message);
  }
});
const modelTools = modeling({
  getProject: () => project,
  open,
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit: () => !!project && !busy && !readOnly && !formDirty,
});
function message(text) {
  $("#message").textContent = text;
  $("#message").hidden = !text;
}
const topologyTools = topology({
  getProject: () => project,
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit: () => !!project && !busy && !readOnly && !formDirty,
});
function selectEntities(ids, toggle = false) {
  if (formDirty) {
    message("Apply or cancel property changes before changing selection.");
    return;
  }
  const available = new Set(
    [
      ...project.nodes,
      ...project.members,
      ...project.supports,
      ...project.loads,
    ].map((x) => x.id),
  );
  if (!toggle) viewport.selection.clear();
  for (const id of ids)
    if (available.has(id)) {
      if (toggle && viewport.selection.has(id)) viewport.selection.delete(id);
      else viewport.selection.add(id);
    }
  selected = [...viewport.selection].at(-1) || null;
  renderInspector();
  renderNav();
  viewport.update(project, diagramResult(), selected);
  if (!viewport.selection.size)
    $("#selected-status").textContent = "No entities selected";
  else if (viewport.selection.size === 1) {
    const only = [...viewport.selection][0];
    const member = project.members.find((m) => m.id === only);
    const lineage = member ? lineageSummary(project, member, label) : null;
    $("#selected-status").textContent = lineage
      ? `Analytical ${label(member.id)} · physical ${lineage.physicalLabel}${lineage.stations ? ` · ${lineage.stations}` : ""}`
      : `1 selected · ${label(only)}`;
  } else
    $("#selected-status").textContent = `${viewport.selection.size} selected · ${[...viewport.selection].slice(0, 3).map(label).join(", ")}`;
}
const cadTools = cad({
  getProject: () => project,
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit: () => !!project && !busy && !readOnly && !formDirty,
  selectEntities,
});
function modal(title, html) {
  $("#modal-title").textContent = title;
  $("#modal-content").innerHTML = html;
  const blocking = [
    "Create a planar portal",
    "Worked examples",
    "Capabilities & assumptions",
    "Steel member check",
    "Unable to open project",
    "Invalid project",
    "Project too large",
    "Kernel unavailable",
  ].includes(title);
  const dialog = $("#modal");
  if (dialog.open) dialog.close();
  dialog.classList.toggle("command-dock", !blocking);
  document.body.classList.toggle("command-dock-open", !blocking);
  if (blocking) dialog.showModal();
  else {
    dialog.style.top =
      Math.max(0, $(".work-grid").getBoundingClientRect().top) + "px";
    dialog.show();
  }
}
$("#close-modal").onclick = () => $("#modal").close();
window.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    $("#modal").open &&
    $("#modal").classList.contains("command-dock")
  ) {
    e.preventDefault();
    $("#modal").close();
  }
});
$("#modal").addEventListener("close", () => {
  if (!$("#modal").open) document.body.classList.remove("command-dock-open");
});
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) $("#modal").close();
});
const scope = async () => {
  try {
    const ledger = await loadCapabilitiesLedger();
    modal(
      "Capabilities & assumptions",
      renderCapabilitiesModalHtml(ledger, esc),
    );
  } catch (e) {
    modal(
      "Capabilities & assumptions",
      `<p>Unable to load the capability ledger (${esc(e.message)}).</p><p class="notice-small" data-testid="parity-unknown">Numerical parity with commercial solvers is UNKNOWN. Excluded domains include shells, solids, plasticity, second-order response, code-certified member sizing, connections and DWG/native PROKON formats.</p>`,
    );
  }
};
$("#help").onclick = () => void scope();
$("#scope").onclick = () => void scope();
$("#steel-check").onclick = () =>
  void openSteelCheckDialog({
    gateway,
    openModal: (title, html) => modal(title, html),
    message,
    getCapabilities: async () => {
      // Prefer live WASM capabilities (includes enabled designProfiles).
      try {
        return await gateway.send("capabilities");
      } catch {
        return loadCapabilitiesLedger();
      }
    },
  });
async function showRecent() {
  try {
    const rows = await recent();
    $("#recent-projects").replaceChildren();
    if (!rows.length) {
      $("#recent-projects").innerHTML =
        "<p>No projects yet. Start a frame or open a worked example.</p>";
      return;
    }
    let listed = 0;
    for (const item of rows) {
      const resolved = await resolveRecoverableProject(item);
      if (!resolved) continue;
      const b = document.createElement("button");
      b.className = "recent-row";
      const note = resolved.recovered
        ? ` · recovered r${resolved.fromRevision}`
        : "";
      b.innerHTML = `<div><strong>${esc(resolved.project.name)}</strong><small>${resolved.project.nodes.length} nodes · ${resolved.project.members.length} members · Revision ${resolved.project.revision}${esc(note)}</small></div><small>${new Date(item.updated).toLocaleDateString()}　↗</small>`;
      b.onclick = async () => {
        await open(resolved.project, {
          recoveryNote: resolved.recovered
            ? `Latest snapshot was corrupt. Restored verified revision ${resolved.fromRevision}. Unverified bytes were not opened.`
            : "",
        });
      };
      $("#recent-projects").append(b);
      listed += 1;
    }
    if (!listed) {
      $("#recent-projects").innerHTML =
        "<p>No verified local projects. Portable import and export remain available.</p>";
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
  if (
    navigator.storage?.persist &&
    !sessionStorage.getItem("wb-persist-warned")
  ) {
    sessionStorage.setItem("wb-persist-warned", "1");
    try {
      const durable = await navigator.storage.persist();
      if (!durable && !$("#message").textContent) {
        message(
          "Browser persistence was not granted. Local snapshots may be evicted; download a project backup.",
        );
      }
    } catch {
      /* continue without durable persistence */
    }
  }
  saveQueue = saveQueue.catch(() => {}).then(() => save(snapshot));
  try {
    await saveQueue;
    if (project?.revision === snapshot.revision) {
      $("#save-status").textContent = "Saved locally";
      afterSaved();
    }
  } catch (e) {
    $("#save-status").textContent = "Save failed";
    message(
      "STORAGE_QUOTA: Local save failed. Download your project to preserve it. " +
        e.message,
    );
  }
}
async function recoverRevision() {
  if (!project || formDirty || readOnly) {
    message(
      formDirty
        ? "Apply or discard unapplied property changes before recovering a committed revision. Recovery never claims unsaved edits were stored."
        : "Open a writable project before recovering a revision.",
    );
    return;
  }
  let rows;
  try {
    rows = await listRevisions(project.id);
  } catch (e) {
    message("Local history unavailable. " + e.message);
    return;
  }
  if (!rows.length) {
    message("No committed local revisions yet. Edit and wait for a local save.");
    return;
  }
  const current = project.revision;
  modal(
    "Recover committed revision",
    `<p>These snapshots were written to this browser after a successful local save. Unapplied form edits are never stored here.</p>
    <div class="entity-table-wrap"><table><thead><tr><th>Revision</th><th>Saved</th><th>Model</th><th></th></tr></thead><tbody>
    ${rows
      .map((r) => {
        const when = r.savedAt
          ? new Date(r.savedAt).toLocaleString()
          : "unknown time";
        const mark = r.revision === current ? " · current" : "";
        return `<tr data-revision="${r.revision}"><th>r${r.revision}${mark}</th><td>${esc(when)}</td><td>${r.nodes} nodes · ${r.members} members</td><td>${r.revision === current ? "" : `<button type="button" data-recover="${r.revision}">Restore r${r.revision}</button>`}</td></tr>`;
      })
      .join("")}
    </tbody></table></div>`,
  );
  for (const b of document.querySelectorAll("[data-recover]"))
    b.onclick = async () => {
      try {
        const snapshot = await loadRevision(
          project.id,
          Number(b.dataset.recover),
        );
        await open(snapshot);
        message(
          `Restored committed revision ${snapshot.revision}. Unsaved edits were not claimed as saved.`,
        );
      } catch (e) {
        message(e.message);
      }
    };
}
$("#recover-revision").onclick = () => recoverRevision();
async function open(p, options = {}) {
  modelTools.cancel();
  try {
    setBusy(true);
    const originalUtf8 =
      options.originalUtf8 ?? JSON.stringify(p);
    const s = await gateway.send("importProject", {
      jsonUtf8: originalUtf8,
      replaceCurrent: true,
    });
    await claimLease(s.project.id);
    project = s.project;
    project.name = p.name ?? project.name;
    project.displayUnits = p.displayUnits ?? project.displayUnits;
    modelHash = s.modelHash;
    result = null;
    failed = false;
    selected = project.members[0]?.id || null;
    viewport.selection = new Set(selected ? [selected] : []);
    $("#modal").close();
    $("#landing").hidden = true;
    $("#workspace").hidden = false;
    $("#top-context").textContent = "Frame analysis";
    const report = s.migrationReport;
    if (report?.originalSha256) {
      await retainOriginal({
        id: project.id,
        originalUtf8,
        sha256: report.originalSha256,
        fromSchema: report.from,
        toSchema: report.to,
        steps: report.steps || [],
      });
    }
    let status = readOnly
      ? "This project is open in another tab. This tab is read-only; exports and analysis remain available."
      : "";
    if (report?.steps?.length) {
      status =
        `Migrated schema ${report.from} → ${report.to}. Original file retained locally (${report.originalSha256.slice(0, 12)}…).` +
        (status ? "\n" + status : "");
    }
    const disclosure =
      s.domainDisclosure ||
      domainDisclosureFromLedger(await loadCapabilitiesLedger().catch(() => ({})));
    const domainNote = importDisclosureMessage(disclosure);
    status = domainNote + (status ? "\n" + status : "");
    if (options.recoveryNote) {
      status = options.recoveryNote + (status ? "\n" + status : "");
    }
    message(status);
    refresh(s);
    viewport.fit();
    await persist();
    if (options.recoveryNote) message(options.recoveryNote);
  } catch (e) {
    message(e.message);
    if ($("#workspace").hidden)
      modal(
        "Unable to open project",
        `<p>${esc(e.message)}</p><p>The current model has been preserved.</p>${
          options.originalUtf8 && /UNSUPPORTED_SCHEMA/.test(e.message)
            ? `<p>Unknown schema opens only as a backup. <button type="button" id="download-unsupported-original" class="primary">Download original JSON</button></p>`
            : ""
        }`,
      );
    if (options.originalUtf8 && /UNSUPPORTED_SCHEMA/.test(e.message)) {
      const raw = options.originalUtf8;
      queueMicrotask(() => {
        $("#download-unsupported-original")?.addEventListener("click", () => {
          download("unsupported-project.json", raw);
        });
      });
    }
  } finally {
    setBusy(false);
  }
}
async function example(id, name) {
  const p = await fetch(`./examples/${id}.json`).then((r) => r.json());
  p.id = "p" + crypto.randomUUID().replaceAll("-", "");
  p.name = name;
  await open(p);
  if (id === "W01") $("#view-3d").click();
}
$("#new-project").onclick = () => example("B02", "Untitled cantilever");
$("#worked-examples").onclick = () => {
  const examples = [
    [
      "W01",
      "3D warehouse frame",
      "12 × 18 m · 3 bays · pitched roof · gravity + lateral loads",
    ],
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
    ["V01", "Envelope provenance", "LC1 + LC2 + C_uls · governing My/uz"],
    ["P01", "Interior point load", "6 m · midspan concentrated action"],
    ["R01", "My end releases", "Fixed ends · My released · UDL"],
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
    const originalUtf8 = await file.text();
    await open(JSON.parse(originalUtf8), { originalUtf8 });
  } catch (e) {
    modal("Invalid project", `<p>${esc(e.message)}</p>`);
  }
};
$("#home").onclick = () => {
  if (busy) return;
  if (formDirty) {
    message("Apply or cancel property changes before leaving the model.");
    return;
  }
  modelTools.cancel();
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
    "new-portal",
    "draw-toggle",
    "open-project",
    "worked-examples",
    "analysis-mode",
  ])
    $("#" + id).disabled =
      value ||
      (id === "analyse" && analysing) ||
      (readOnly &&
        ["undo", "redo", "analysis-mode", "draw-toggle"].includes(id));
  if (project) {
    $("#undo").disabled = value || readOnly || formDirty || !project.canUndo;
    $("#redo").disabled = value || readOnly || formDirty || !project.canRedo;
  }
  for (const b of document.querySelectorAll(
    "#inspector-content input,#inspector-content select,#inspector-content textarea,#inspector-content button,#modal-content form button",
  ))
    b.disabled = value || readOnly;
  $("#analysis-mode").disabled = value || formDirty || readOnly;
  $("#copy-bay").disabled = value || formDirty || readOnly;
  $("#units").disabled = value || formDirty;
  $("#result-case").disabled = value || formDirty;
  $("#analyse").disabled = value || analysing || formDirty;
  $("#cancel").hidden = !analysing;
}
function setAnalysing(value) {
  analysing = value;
  $("#analyse").disabled = value || busy || formDirty || !project;
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
      o.textContent = label(c.id) + " · " + c.name;
      return o;
    }),
  );
  if (project.loadCases.length + project.combinations.length >= 2) {
    const o = document.createElement("option");
    o.value = "__envelope__";
    o.textContent = "Envelope · all cases & combinations";
    $("#result-case").append(o);
  }
  $("#result-case").value = [
    ...project.loadCases,
    ...project.combinations,
    { id: "__envelope__" },
  ].some((c) => c.id === previousCase)
    ? previousCase
    : project.combinations[0]?.id || project.loadCases[0]?.id;
  $("#units").value = project.displayUnits;
  $("#view-title").textContent = project.name;
  $("#hash-status").textContent = modelHash.slice(0, 12) + " · f64";
  $("#kernel-status").textContent = "● Rust / WASM ready";
  viewport.selection = new Set(
    [...viewport.selection].filter(
      (id) =>
        project.nodes.some((n) => n.id === id) ||
        project.members.some((m) => m.id === id) ||
        project.supports.some((s) => s.id === id) ||
        project.loads.some((l) => l.id === id),
    ),
  );
  if (selected && !viewport.selection.has(selected))
    selected = [...viewport.selection].at(-1) || null;
  renderNav();
  renderInspector();
  renderResults();
  viewport.currentModelHash = modelHash;
  viewport.update(project, diagramResult(), selected);
  topologyTools.refresh();
  setBusy(busy);
}
function portable() {
  const { canUndo, canRedo, ...p } = project;
  return p;
}
async function command(type, args, commandId) {
  if (readOnly)
    throw Error("Read-only: this project is being edited in another tab");
  setBusy(true);
  try {
    const name = project.name,
      units = project.displayUnits;
    const s = await gateway.send("applyCommand", {
      command: {
        id: commandId || "c" + crypto.randomUUID().replaceAll("-", ""),
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
  viewport.draw();
  persist();
};
function renderNav() {
  const groups = [
    ["nodes", "Nodes", "node"],
    ["members", "Members", "member"],
    ["supports", "Supports", "support"],
    ["sections", "Sections", "section"],
    ["materials", "Materials", "material"],
    ["loadCases", "Load cases", "loadCase"],
    ["loads", "Loads", "load"],
    ["combinations", "Combinations", "combination"],
  ];
  $("#model-nav").innerHTML = groups
    .map(
      ([key, groupLabel, icon]) =>
        `${{ nodes: "Structure", sections: "Member properties", loadCases: "Loading" }[key] ? `<h3 class="nav-section-title">${{ nodes: "Structure", sections: "Member properties", loadCases: "Loading" }[key]}</h3>` : ""}<button aria-label="${groupLabel} ${project[key].length}" data-group="${key}"><span class="nav-icon" aria-hidden="true">${structuralIcon(icon)}</span><span class="nav-label">${groupLabel}</span><span class="count">${project[key].length}</span></button>${
          key === "members"
            ? renderMemberNav(project.members, { selected, label, esc })
            : ""
        }`,
    )
    .join("");
  for (const b of document.querySelectorAll("[data-member]"))
    b.onclick = (e) => selectEntities([b.dataset.member], e.shiftKey);
  for (const b of document.querySelectorAll("[data-group]"))
    b.onclick = () => {
      if (formDirty) {
        message(
          "Apply or cancel property changes before editing other entities.",
        );
        return;
      }
      entityList(b.dataset.group);
    };
}
const input = (id, label, value, attrs = "") =>
  `<label>${label}<input id="${id}" name="${id}" type="text" inputmode="decimal" value="${value}" ${attrs}></label>`;
function renderDirectProperties(key, entity) {
  $("#selection-tag").textContent = label(entity.id);
  $("#selected-status").textContent =
    `${key === "supports" ? "Support" : key === "loads" ? "Load" : "Node"} ${label(entity.id)} selected`;
  $("#inspector-content").innerHTML =
    `<h3>${esc(entityGuides[key][0])} · ${esc(label(entity.id))}</h3><form id="direct-properties" class="entity-form">${entityFields(key, entity, project, { compact: true })}<p id="direct-error" class="error-text" role="alert"></p><div class="property-actions full"><button class="primary">Apply changes</button><button type="button" id="cancel-direct">Cancel changes</button>${key !== "nodes" ? '<button type="button" id="delete-assignment">Delete</button>' : ""}</div></form>`;
  bindEntityFields($("#direct-properties"), key, project);
  $("#direct-properties").oninput = () => {
    formDirty = true;
    setBusy(busy);
    $("#export-report").disabled = true;
    $("#export-csv").disabled = true;
    $("#result-status").textContent = "Unapplied changes";
  };
  $("#cancel-direct").onclick = () => {
    message("");
    renderInspector();
    setBusy(busy);
    renderResults();
  };
  $("#direct-properties").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const value = readEntityFields(e.currentTarget, key, entity, project);
      await command(
        key === "nodes"
          ? "SetNodePosition"
          : key === "supports"
            ? "SetSupport"
            : "SetLoad",
        { ...value, ...(key === "nodes" ? {} : { existence: "update" }) },
      );
    } catch (error) {
      $("#direct-error").textContent = error.message;
    }
  };
  if ($("#delete-assignment"))
    $("#delete-assignment").onclick = async () => {
      if (formDirty) {
        message("Apply or cancel changes before deleting.");
        return;
      }
      try {
        await command("DeleteEntities", { ids: [entity.id], cascade: false });
      } catch (e) {
        message(e.message);
      }
    };
  setBusy(busy);
}
function renderSelectionForces() {
  renderForceInspector({
    project,
    result,
    modelHash,
    selected,
    count: viewport.selection.size,
  });
}
for (const button of document.querySelectorAll("[data-inspector-tab]"))
  button.onclick = () => {
    const forces = button.dataset.inspectorTab === "forces";
    $("#inspector-content").hidden = forces;
    $("#force-inspector").hidden = !forces;
    for (const tab of document.querySelectorAll("[data-inspector-tab]"))
      tab.setAttribute("aria-pressed", String(tab === button));
    if (forces) renderSelectionForces();
  };
function renderInspector() {
  renderSelectionForces();
  formDirty = false;
  if (!selected || viewport.selection.size > 1) {
    const count = viewport.selection.size;
    $("#selection-tag").textContent = count ? `${count} selected` : "None";
    $("#inspector-content").innerHTML = count
      ? `<h3>Multiple selection</h3><p>${count} entities selected. Properties may differ.</p><p>${esc([...viewport.selection].slice(0, 20).map(label).join(", "))}</p><button id="edit-multiple">Edit selection</button><p class="form-help">Move, copy or delete through a dependency preview. Individual properties are edited one entity at a time.</p>`
      : "<h3>No selection</h3><p>Select a node or member in the canvas or model explorer to inspect its properties.</p>";
    if (count) $("#edit-multiple").onclick = () => cadTools.open();
    return;
  }
  const selectedSupport = project.supports.find((s) => s.id === selected);
  const assignment = project.loads.find((l) => l.id === selected);
  if (selectedSupport || assignment) {
    renderDirectProperties(
      selectedSupport ? "supports" : "loads",
      selectedSupport || assignment,
    );
    return;
  }
  const node = project.nodes.find((n) => n.id === selected);
  if (node) {
    renderDirectProperties("nodes", node);
    return;
  }
  const m = project.members.find((m) => m.id === selected);
  if (!m) {
    selected = null;
    renderInspector();
    return;
  }
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
  const lineage = lineageSummary(project, m, label);
  $("#selection-tag").textContent = label(m.id);
  $("#selected-status").textContent = lineage
    ? `Analytical ${label(m.id)} · physical ${lineage.physicalLabel}${lineage.stations ? ` · ${lineage.stations}` : ""}`
    : `Member ${label(m.id)} selected · ${label(m.start)} → ${label(m.end)}`;
  $("#inspector-content").innerHTML =
    `<div class="inspector-heading"><span class="symbol">${structuralIcon("member")}</span><div><strong>Member ${esc(label(m.id))}</strong><small>${esc(label(m.start))} → ${esc(label(m.end))} · Custom section</small></div></div>${lineage ? `<div class="form-section lineage-panel" data-physical="${esc(lineage.physicalId)}"><h3>Physical lineage</h3><p>${esc(lineage.text)}</p><p class="form-help">Parent ID and station range are provenance from split/connect. They do not remesh automatically.</p></div>` : ""}<form id="member-form"><div class="form-section"><h3>Geometry</h3>${guideDiagram("members")}<div class="fields">${simple ? input("span", "Span [m]", end.position[0], 'min="0.000001" required') : `<p class="form-help full">Edit node coordinates from the model explorer.</p>`}</div></div><div class="form-section"><h3>Material · ${esc(label(mat.id))}</h3><div class="fields">${input("elasticity", "Elastic stiffness E [GPa]", mat.E / 1e9, 'min="0.000001" required')}${input("poisson", "Poisson ratio ν", mat.nu, 'min="-0.999" max="0.499" required')}${input("density", "Density [kg/m³]", mat.density, 'min="0" required')}</div></div><div class="form-section"><h3>Section · ${esc(label(sec.id))}</h3><div class="fields">${input("area", "Area [m²]", sec.A, 'min="1e-15" required')}${input("torsion", "Twisting resistance J [m⁴]", sec.J, 'min="1e-20" required')}${input("inertia-y", "Bending about y · Iy [m⁴]", sec.Iy, 'min="1e-20" required')}${input("inertia-z", "Bending about z · Iz [m⁴]", sec.Iz, 'min="1e-20" required')}</div><p class="form-help">Principal axes · ${esc(sec.provenance)}</p></div>${simple ? `<div class="form-section"><h3>Support & loading</h3><label class="check-label"><input id="fixed-support" type="checkbox" ${support ? "checked" : ""}> Fixed at ${esc(label(m.start))}</label><div class="fields" style="margin-top:14px">${load ? input("tip-load", "Vertical tip force [kN]", load.values[2] / 1000, "required") : ""}</div><p class="form-help">Negative Fz acts downward, along global −Z. Unit suffixes such as “-13000 N” are accepted.</p></div>` : ""}<div id="form-error" class="error-text" role="alert"></div><div class="property-actions"><button class="primary" type="submit">Apply changes</button><button type="button" id="discard-properties">Cancel changes</button></div><p class="form-help">Material and section edits affect every member using these definitions.</p></form>${result && result.analysisType !== "envelope" ? `<div class="probe"><small>${result.modelHash === modelHash ? "Result probe" : "Stale result probe"} · ${esc(label(m.id))} · ${esc(result.caseId)}</small><strong>${format(result.members.find((x) => x.id === m.id)?.samples?.at(-1)?.displacement?.[2] * 1000)} mm</strong><small>Global Z displacement · station 1.00 L</small></div>` : result?.analysisType === "envelope" ? `<div class="probe"><small>Envelope result · ${esc(label(m.id))}</small><p class="form-help">Open Results for per-scalar governing provenance. Envelope values are not a tip probe.</p></div>` : ""}`;
  $("#discard-properties").onclick = () => {
    message("");
    renderInspector();
    setBusy(busy);
  };
  $("#member-form").oninput = () => {
    formDirty = true;
    $("#analyse").disabled = true;
    $("#export-report").disabled = true;
    $("#export-csv").disabled = true;
    $("#result-status").textContent = "Unapplied changes";
    $("#result-status").className = "badge stale";
    setBusy(busy);
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
  const current = result && result.modelHash === modelHash && !formDirty;
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
  if (result.analysisType === "envelope") {
    const eng = project.displayUnits === "engineeringMetric",
      u = eng ? 1000 : 1,
      f = eng ? 0.001 : 1;
    const scale = (component, value) => {
      if (["ux", "uy", "uz"].includes(component)) return value * u;
      if (["rx", "ry", "rz"].includes(component)) return value;
      return value * f;
    };
    const unit = (component) => {
      if (["ux", "uy", "uz"].includes(component)) return eng ? "mm" : "m";
      if (["rx", "ry", "rz"].includes(component)) return "rad";
      if (["mx", "my", "mz", "T", "My", "Mz"].includes(component))
        return eng ? "kN·m" : "N·m";
      return eng ? "kN" : "N";
    };
    const row = (entity, component, extreme, kind) => {
      const where = extreme.station != null
        ? ` · x/L=${Number(extreme.station.toPrecision(6))}${extreme.side ? ` ${extreme.side}` : ""}`
        : extreme.nodeId
          ? ` · node ${label(extreme.nodeId)}`
          : extreme.supportId
            ? ` · support ${label(extreme.supportId)}`
            : "";
      return [
        entity,
        component,
        kind,
        format(scale(component, extreme.value)),
        unit(component),
        label(extreme.caseOrCombinationId) + where,
      ];
    };
    const rows = [];
    for (const m of result.members || []) {
      for (const a of m.actions || []) {
        rows.push(row(label(m.id), a.component, a.max, "max"));
        rows.push(row(label(m.id), a.component, a.min, "min"));
      }
      for (const d of m.displacements || []) {
        rows.push(row(label(m.id), d.component, d.max, "max"));
        rows.push(row(label(m.id), d.component, d.min, "min"));
      }
    }
    for (const n of result.nodes || []) {
      for (const d of n.displacements || []) {
        if (Math.abs(d.max.value) < 1e-15 && Math.abs(d.min.value) < 1e-15)
          continue;
        rows.push(row(label(n.id), d.component, d.max, "max"));
        rows.push(row(label(n.id), d.component, d.min, "min"));
      }
    }
    for (const s of result.supports || []) {
      for (const r of s.reactions || []) {
        rows.push(row(label(s.id), r.component, r.max, "max"));
        rows.push(row(label(s.id), r.component, r.min, "min"));
      }
    }
    const ids = (result.caseOrCombinationIds || []).map(label).join(", ");
    $("#results-content").innerHTML =
      `<p class="notice-small">Envelope over ${esc(ids)}. Each row is an independent scalar extreme with governing case/combination — not a simultaneous force set.</p>` +
      (result.diagnostics || [])
        .map(
          (d) =>
            `<p class="notice-small" role="status">${esc(d.code || "")}: ${esc(d.message || "")}</p>`,
        )
        .join("") +
      `<table><thead><tr>${["Entity", "Component", "Extreme", "Value", "Unit", "Governing"]
        .map((h) => `<th scope="col">${h}</th>`)
        .join(
          "",
        )}</tr></thead><tbody>${rows
        .map(
          (r) =>
            `<tr>${r.map((v, i) => `<${i ? "td" : "th"}${i ? "" : ' scope="row"'}>${esc(v)}</${i ? "td" : "th"}>`).join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
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
      label(id),
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
      label(id),
      ...Array.from(result.reactions.slice(i * 6, i * 6 + 6), (v) =>
        format(v * f),
      ),
    ]);
  }
  if (tab === "section-forces") {
    heads = [
      "Member",
      "Position [%]",
      ...[
        "Axial N",
        "Shear Vy",
        "Shear Vz",
        "Torsion T",
        "Moment My",
        "Moment Mz",
      ].map((name, i) => `${name} [${eng ? "kN" : "N"}${i > 2 ? " m" : ""}]`),
    ];
    rows = result.members.flatMap((m) =>
      m.samples.map((sample) => [
        label(m.id),
        format(sample.station * 100),
        ...sample.actions.map((value) => format(value * f)),
      ]),
    );
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
        label(m.id),
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
  if (tab === "stress") {
    const eng = project.displayUnits === "engineeringMetric";
    const scale = eng ? 1e-6 : 1;
    const unit = eng ? "MPa" : "Pa";
    heads = [
      "Member",
      "Station",
      `σ max [${unit}]`,
      `σ min [${unit}]`,
    ];
    rows = (result.members || [])
      .filter((m) => m.stressScreen)
      .map((m) => [
        label(m.id),
        format(m.stressScreen.station * 100) + "%",
        format(m.stressScreen.maxPa * scale),
        format(m.stressScreen.minPa * scale),
      ]);
    $("#results-content").innerHTML =
      `<p class="notice-small" data-testid="stress-disclaimer">Elastic longitudinal fibre stress only (mechanics-v1). Not a member stability or building-code check.</p>${current ? "" : '<p class="notice-small">Stale results — these values belong to the previous model.</p>'}<table><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<${i ? "td" : "th"}${i ? "" : ' scope="row"'}>${esc(v)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table>`;
    return;
  }
  $("#results-content").innerHTML =
    `${tab === "section-forces" ? '<p class="notice-small">Local member axes · signed section forces, matching the diagrams. Position: 0% at start (i), 100% at end (j).</p>' : tab === "forces" ? '<p class="notice-small">Local nodal actions applied to the member ends. Their signs differ from section forces.</p>' : ""}${current ? "" : '<p class="notice-small">Stale results — these values belong to the previous model.</p>'}<table><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<${i ? "td" : "th"}${i ? "" : ' scope="row"'}>${esc(v)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table>`;
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
  if (!project || analysing) return;
  try {
    setAnalysing(true);
    message("Analysing the current model…");
    const response = await gateway.send("analyse", analysisPayload());
    result = response;
    failed = false;
    if (result.modelHash !== modelHash) {
      message(
        "Analysis finished for an earlier model revision. Results are stale; analyse again for current results.",
      );
    } else {
      message("");
    }
    if (result.analysisType === "envelope") {
      viewport.resultView = "model";
      syncResultPicker("model");
      $("#deformation-legend").hidden = true;
    } else {
      if (!actionComponents[viewport.resultView])
        viewport.resultView = "deformed";
      syncResultPicker(viewport.resultView);
      $("#deformation-legend").hidden = viewport.resultView !== "deformed";
    }
    renderResults();
    renderInspector();
    viewport.update(project, diagramResult(), selected);
  } catch (e) {
    if (!/CANCELLED|TIMEOUT/.test(e.message)) {
      result = null;
      failed = true;
      renderSelectionForces();
      renderResults();
      viewport.update(project, null, selected);
    }
    message(e.message);
  } finally {
    setAnalysing(false);
  }
};
$("#cancel").onclick = () => {
  gateway.cancelAnalysis();
  message("CANCELLED: Analysis stopped. The model was not disturbed.");
  setAnalysing(false);
};
let restoringModelWorker = false;
gateway.onCrash = async () => {
  if (restoringModelWorker) return;
  restoringModelWorker = true;
  message("Model Worker stopped. Restoring the last confirmed model.");
  const p = project && portable();
  gateway.respawnModel("Worker stopped");
  try {
    if (p) {
      const s = await gateway.importFresh({
        jsonUtf8: JSON.stringify(p),
        replaceCurrent: false,
      });
      project = s.project;
      project.name = p.name;
      project.displayUnits = p.displayUnits;
      modelHash = s.modelHash;
      result = null;
      failed = false;
      refresh(s);
      message(
        "Model Worker stopped. Restored the last confirmed in-memory model. Download a backup if saves may have failed.",
      );
    }
  } catch (e) {
    message("Model Worker stopped. Automatic restore failed: " + e.message);
  } finally {
    setBusy(false);
    restoringModelWorker = false;
  }
};
gateway.onAnalysisCrash = () => {
  message("Analysis Worker stopped. The model is unchanged.");
  setAnalysing(false);
};
gateway.onTimeout = () => {
  message(
    "TIMEOUT: Analysis stopped. The model Worker kept the last confirmed project.",
  );
  setAnalysing(false);
};
$("#export-project").onclick = () =>
  download(project.id + ".json", JSON.stringify(portable(), null, 2));

function analysisPayload() {
  const chosen = $("#result-case").value || project.loadCases[0]?.id;
  const envelopeAll = chosen === "__envelope__";
  return {
    caseIds: envelopeAll
      ? project.loadCases.map((c) => c.id)
      : project.loadCases.some((c) => c.id === chosen)
        ? [chosen]
        : [],
    combinationIds: envelopeAll
      ? project.combinations.map((c) => c.id)
      : project.combinations.some((c) => c.id === chosen)
        ? [chosen]
        : [],
  };
}

function captureBaselineFrom(snapshot) {
  const record = {
    project: snapshot.project,
    modelHash: snapshot.modelHash,
    jsonUtf8: JSON.stringify(snapshot.project),
  };
  sessionStorage.setItem("workbench-compare-baseline", JSON.stringify(record));
  return record;
}

$("#duplicate-variant").onclick = async () => {
  if (!project || formDirty) {
    message(
      formDirty
        ? "Apply or cancel property changes before duplicating."
        : "Open a project first.",
    );
    return;
  }
  try {
    setBusy(true);
    const snap = await gateway.send("exportProject", { includeResults: false });
    captureBaselineFrom(snap);
    const variant = duplicateAsVariant(snap.project);
    await open(variant);
    message(
      `Duplicated as “${variant.name}”. Baseline “${snap.project.name}” retained for comparison.`,
    );
  } catch (e) {
    message(e.message);
  } finally {
    setBusy(false);
  }
};

$("#compare-variants").onclick = async () => {
  if (!project || formDirty) {
    message(
      formDirty
        ? "Apply or cancel property changes before comparing."
        : "Open a project first.",
    );
    return;
  }
  const raw = sessionStorage.getItem("workbench-compare-baseline");
  if (!raw) {
    message("Duplicate as variant first to capture a baseline.");
    return;
  }
  try {
    setBusy(true);
    setAnalysing(true);
    message("Solving baseline and variant for comparison…");
    const baseline = JSON.parse(raw);
    const snap = await gateway.send("exportProject", { includeResults: false });
    const payload = analysisPayload();
    gateway.analysing = true;
    let baselineResult;
    let variantResult;
    try {
      baselineResult = await gateway.analyseJson(baseline.jsonUtf8, payload);
      variantResult = await gateway.analyseJson(
        JSON.stringify(snap.project),
        payload,
      );
    } finally {
      gateway.analysing = false;
    }
    const comparison = buildComparison({
      baseline: { project: baseline.project, modelHash: baseline.modelHash },
      baselineResult,
      variant: { project: snap.project, modelHash: snap.modelHash },
      variantResult,
    });
    result = variantResult;
    failed = false;
    modelHash = snap.modelHash;
    renderResults();
    renderInspector();
    viewport.update(project, diagramResult(), selected);
    const fmt = (v) =>
      v == null || !Number.isFinite(v) ? "—" : `${(v * 1000).toPrecision(4)} mm`;
    const hash = (h) =>
      `<code style="overflow-wrap:anywhere;font-size:12px">${esc(h)}</code>`;
    $("#modal-content").innerHTML = `<div class="variant-compare"><h2>Variant comparison</h2><p>Both rows are from independent solves of the captured baseline and the current project. Model hashes identify each stiffness variant.</p><table><thead><tr><th scope="col"></th><th scope="col">Baseline</th><th scope="col">Variant</th></tr></thead><tbody><tr><th scope="row">Name</th><td>${esc(comparison.baseline.name)}</td><td>${esc(comparison.variant.name)}</td></tr><tr><th scope="row">Model hash</th><td>${hash(comparison.baseline.modelHash)}</td><td>${hash(comparison.variant.modelHash)}</td></tr><tr><th scope="row">Section Iy</th><td>${comparison.baseline.Iy?.toExponential?.(4) ?? "—"}</td><td>${comparison.variant.Iy?.toExponential?.(4) ?? "—"}</td></tr><tr><th scope="row">Tip uz (${esc(comparison.tipNode || "—")})</th><td>${fmt(comparison.baseline.tipUz)}</td><td>${fmt(comparison.variant.tipUz)}</td></tr></tbody></table><div class="dialog-actions"><button type="button" id="download-baseline-report">Download baseline report</button><button type="button" id="download-variant-report" class="primary">Download variant report</button></div></div>`;
    $("#modal").showModal();
    $("#download-baseline-report").onclick = () =>
      download(
        `${comparison.baseline.id}-report.html`,
        report(baseline.project, baselineResult),
        "text/html",
      );
    $("#download-variant-report").onclick = () =>
      download(
        `${comparison.variant.id}-report.html`,
        report(snap.project, variantResult),
        "text/html",
      );
    message("");
  } catch (e) {
    message(e.message);
  } finally {
    setAnalysing(false);
    setBusy(false);
  }
};

$("#export-report").onclick = () => {
  if (result && result.modelHash === modelHash && !failed)
    download(
      project.id + "-report.html",
      report(portable(), result),
      "text/html",
    );
};

window.__studyReady = () => !!project && !analysing && !busy;
$("#study-file").onchange = async () => {
  const file = $("#study-file").files?.[0];
  $("#study-file").value = "";
  if (!file || !project) return;
  let study;
  try {
    study = JSON.parse(await file.text());
  } catch (e) {
    message(`INVALID_SCHEMA: Study JSON parse failed: ${e.message}`);
    return;
  }
  try {
    setAnalysing(true);
    message(`Running study ${study.id || file.name}…`);
    const studyReport = await gateway.send("runStudy", { study });
    const rows = (studyReport.variants || [])
      .map(
        (v) =>
          `<tr><th scope="row">${esc(v.variantId)}</th><td><code>${esc(String(v.modelHash || "").slice(0, 12))}…</code></td><td><code>${esc(String(v.resultId || "").slice(0, 12))}…</code></td><td>${esc(String(v.observed?.value ?? "—"))}</td></tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${esc(studyReport.studyId || "study")} report</title>
<style>body{font:14px/1.4 system-ui;margin:2rem;color:#142b44}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd;padding:.4rem .6rem;text-align:left}code{font-size:12px}</style></head><body>
<h1>Study ${esc(studyReport.studyName || studyReport.studyId || "")}</h1>
<p>${esc(studyReport.variantCount || 0)} variants · case ${esc(studyReport.caseId || "")} · base ${esc(studyReport.baseSource || "openProject")}</p>
<table><thead><tr><th>Variant</th><th>Model hash</th><th>Result id</th><th>Observed</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
    $("#show-results")?.click();
    $("#results-content").innerHTML = `<p class="notice-small" data-testid="study-report-banner">Declarative study comparison (M22). Hashes are from the Rust kernel; the open project was not mutated.</p>
<table data-testid="study-report-table"><thead><tr><th scope="col">Variant</th><th scope="col">Model hash</th><th scope="col">Result id</th><th scope="col">Observed</th></tr></thead><tbody>${rows}</tbody></table>
<p><button type="button" id="download-study-report" class="primary">Download study HTML</button></p>`;
    $("#download-study-report").onclick = () =>
      download(
        `${studyReport.studyId || "study"}-report.html`,
        html,
        "text/html",
      );
    message(
      `Study ${studyReport.studyId || ""} finished · ${studyReport.variantCount} variants`,
    );
  } catch (e) {
    if (!/CANCELLED|TIMEOUT/.test(e.message)) message(e.message);
  } finally {
    setAnalysing(false);
  }
};

$("#export-csv").onclick = () => {
  if (result && result.modelHash === modelHash && !failed)
    download(project.id + "-results.csv", csv(result, project), "text/csv");
};
$("#result-case").onchange = () => {
  result = null;
  failed = false;
  renderResults();
  renderInspector();
  viewport.update(project, null, selected);
  message("Selected analysis case changed. Analyse to calculate this case.");
};
const syncResultPicker = bindResultPicker((value) => {
  viewport.resultView = value;
  $("#deformation-legend").hidden = viewport.resultView !== "deformed";
  viewport.draw();
});
$("#deformation-scale").oninput = () => {
  viewport.scale = Math.max(
    0,
    Math.min(10000, Number($("#deformation-scale").value) || 0),
  );
  viewport.draw();
};
$("#diagram-scale").oninput = () => {
  const value = Number($("#diagram-scale").value);
  if ($("#diagram-scale").value === "" || !Number.isFinite(value)) return;
  viewport.diagramScale = Math.max(0, Math.min(100, value));
  viewport.draw();
};
for (const [id, field] of [
  ["deformation-scale", "scale"],
  ["diagram-scale", "diagramScale"],
])
  $("#" + id).onchange = () => {
    $("#" + id).value = viewport[field];
  };
$("#fit").onclick = () => viewport.fit();
$("#reset-viewport").onclick = () => {
  if (viewport.device && viewport.ready) {
    viewport.device.destroy();
  } else viewport.init();
};
for (const mode of ["plan", "elevation", "3d"])
  $("#view-" + mode).onclick = () => {
    modelTools.cancel();
    viewport.mode = mode;
    $("#view-subtitle").textContent =
      mode === "3d"
        ? "3D orthographic · Orbit tool or Alt-drag"
        : mode === "plan"
          ? "Global XY · metres"
          : "Global XZ · metres";
    $("#view-plan").classList.toggle("active", mode === "plan");
    $("#view-elevation").classList.toggle("active", mode === "elevation");
    $("#view-3d").classList.toggle("active", mode === "3d");
    viewport.fit();
  };
for (const [id, key] of [
  ["add-node-tool", "nodes"],
  ["add-support-tool", "supports"],
  ["add-load-tool", "loads"],
])
  $("#" + id).onclick = () => {
    if (!project || busy || readOnly) return;
    modal("Add " + key, "");
    editEntity(key, null);
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
    `<div class="entity-guide">${guideDiagram(key)}<div><span class="guide-eyebrow">${esc(entityGuides[key][1])}</span><p>${esc(entityGuides[key][2])}</p></div></div><div class="entity-table-wrap"><table><thead><tr><th>Label</th><th>Description</th><th>Action</th></tr></thead><tbody>${project[key].map((v) => {
      const lineage = key === "members" ? lineageSummary(project, v, label) : null;
      const description =
        lineage?.text ||
        v.name ||
        label(v.node) ||
        v.type ||
        (v.start
          ? `${label(v.start)} → ${label(v.end)}`
          : v.position?.join(", ") || "");
      return `<tr${lineage ? ` data-physical="${esc(lineage.physicalId)}"` : ""}><th>${esc(label(v.id))}</th><td>${esc(description)}</td><td><button data-edit="${esc(v.id)}">Edit ${esc(label(v.id))}</button></td></tr>`;
    }).join("")}</tbody></table></div><button class="primary add-button" id="add-entity">＋ Add ${entityGuides[key][0].toLowerCase()}</button>`,
  );
  for (const b of document.querySelectorAll("[data-edit]"))
    b.onclick = () =>
      editEntity(
        key,
        project[key].find((x) => x.id === b.dataset.edit),
      );
  $("#add-entity").onclick = () => editEntity(key, null);
}
function editEntity(key, old, draft) {
  const id =
    old?.id || key[0] + crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const defaults = {
    nodes: { id, position: [0, 0, 0] },
    members: {
      id,
      start: project.nodes[0]?.id,
      end: project.nodes.at(-1)?.id,
      material: project.materials[0]?.id,
      section: project.sections[0]?.id,
      localY: [0, 1, 0],
      releaseStart: { my: false, mz: false },
      releaseEnd: { my: false, mz: false },
    },
    materials: {
      E: 200e9,
      nu: 0.3,
      density: 7850,
      ...project.materials[0],
      id,
      name: "Custom material",
    },
    sections: {
      A: 0.01,
      Iy: 1e-5,
      Iz: 2e-5,
      J: 2e-5,
      cy: 0.1,
      cz: 0.2,
      provenance: "Custom properties — verify before analysis",
      ...project.sections[0],
      id,
      name: "Custom section",
    },
    supports: {
      id,
      node:
        project.nodes.find((n) => n.id === selected)?.id ||
        project.nodes[0]?.id,
      fixed: [true, true, true, true, true, true],
      prescribed: [0, 0, 0, 0, 0, 0],
    },
    loadCases: { id, name: "New case", category: "other" },
    loads: {
      id,
      case: project.loadCases[0]?.id,
      type: "nodal",
      node:
        project.nodes.find((n) => n.id === selected)?.id ||
        project.nodes.at(-1)?.id,
      values: [0, 0, -10000, 0, 0, 0],
    },
    combinations: {
      id,
      name: "New combination",
      purpose: "analysis",
      terms: [{ case: project.loadCases[0]?.id, factor: 1 }],
    },
  };
  const entity = structuredClone(draft || old || defaults[key]);
  const needs =
    key === "members"
      ? [
          ["nodes", 2, "two points"],
          ["materials", 1, "a material"],
          ["sections", 1, "a section"],
        ]
      : key === "loads"
        ? [
            ["nodes", 1, "a point"],
            ["loadCases", 1, "a load case"],
          ]
        : key === "supports"
          ? [["nodes", 1, "a point"]]
          : key === "combinations"
            ? [["loadCases", 1, "a load case"]]
            : [];
  const missing = needs.filter(
    ([collection, count]) => project[collection].length < count,
  );
  $("#modal-title").textContent =
    (old ? "Edit " : "Add ") + entityGuides[key][0].toLowerCase();
  if (missing.length) {
    $("#modal-content").innerHTML =
      `<p>First add ${missing.map((x) => x[2]).join(" and ")}. Then return here to add this ${entityGuides[key][0].toLowerCase()}.</p><button id="setup-required" class="primary">Add ${missing[0][2]}</button>`;
    $("#setup-required").onclick = () => editEntity(missing[0][0], null);
    return;
  }
  $("#modal-content").innerHTML =
    `<form id="entity-form" class="entity-form">${entityFields(key, entity, project)}<div class="error-text" id="entity-error" role="alert"></div><div class="dialog-actions">${old ? '<button type="button" class="danger" id="delete-entity">Delete entity</button>' : ""}<button class="primary" type="submit">Save entity</button></div></form>`;
  bindEntityFields($("#entity-form"), key, project);
  if (key === "sections") {
    bindSectionCalculator($("#entity-form"), async ({ width, depth, customJ }) =>
      gateway.send("computeSection", {
        shape: "solidRectangle",
        width,
        depth,
        customJ,
      }),
    );
  }
  bindTemplates($("#entity-form"), key, entity, project, (next) =>
    editEntity(key, old, next),
  );
  const loadType = $("#entity-form [name=type]");
  if (key === "loads" && loadType)
    loadType.onchange = () => {
      const form = $("#entity-form");
      const next = {
        id: entity.id,
        case: form.elements.namedItem("case").value,
        type: loadType.value,
      };
      if (next.type === "nodal")
        Object.assign(next, {
          node: project.nodes.at(-1)?.id,
          values: [0, 0, -10000, 0, 0, 0],
        });
      if (next.type === "uniform")
        Object.assign(next, {
          member: project.members[0]?.id,
          axes: "global",
          forcePerLength: [0, 0, -1000],
        });
      if (next.type === "point")
        Object.assign(next, {
          member: project.members[0]?.id,
          axes: "global",
          station: 0.5,
          values: [0, 0, -10000, 0, 0, 0],
        });
      if (next.type === "selfWeight")
        Object.assign(next, {
          members: project.members.map((m) => m.id),
          factor: 1,
        });
      if (!project.members.length && next.type !== "nodal") {
        loadType.value = entity.type;
        $("#entity-error").textContent =
          "Add a member before applying a member load.";
        return;
      }
      editEntity(key, old, next);
    };
  $("#entity-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (form.dataset.saving) return;
    form.dataset.saving = "true";
    try {
      const value = readEntityFields(form, key, entity, project);
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
      if (form.isConnected && $("#modal").open) entityList(key);
    } catch (e) {
      if (form.isConnected && $("#modal").open)
        $("#entity-error").textContent = e.message;
      else message(e.message);
    } finally {
      delete form.dataset.saving;
    }
  };
  if (old)
    $("#delete-entity").onclick = async () => {
      const form = $("#entity-form");
      if (form.dataset.saving) return;
      form.dataset.saving = "true";
      try {
        await command("DeleteEntities", { ids: [old.id], cascade: false });
        if (form.isConnected && $("#modal").open) entityList(key);
      } catch (e) {
        if (form.isConnected && $("#modal").open)
          $("#entity-error").textContent = e.message;
        else message(e.message);
      } finally {
        delete form.dataset.saving;
      }
    };
}
window.addEventListener("keydown", (e) => {
  if (
    e.defaultPrevented ||
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
let directTools;
const workspace = workspaceUI({
  viewport,
  gateway,
  getProject: () => project,
  selectEntities,
  canAct: () => !busy && !readOnly,
  editSelection: (type) =>
    directTools.activate(
      { MoveNodes: "move", CopySelection: "copy", DeleteGeometry: "delete" }[
        type
      ],
    ),
  hasDraft: () => formDirty,
  finishTools: () => {
    modelTools.cancel();
    directTools?.finish();
  },
  message,
});
directTools = canvasTools({
  viewport,
  gateway,
  getProject: () => project,
  command,
  selectEntities,
  cancelDrawing: () => modelTools.cancel(),
  canEdit: () => !!project && !busy && !readOnly && !formDirty,
  message,
  inspect: () => {
    $("#modal").close();
    workspace.panel("properties");
  },
  deleteAssignment: async (id) => {
    if (!busy && !readOnly && !formDirty)
      try {
        await command("DeleteEntities", { ids: [id], cascade: false });
      } catch (e) {
        message(e.message);
      }
  },
});
showRecent();
initOffline().catch(() => {});
window.__workbenchTest = {
  crashModelWorker: async () => {
    // Drive the app crash path once; respawnModel terminates the Worker.
    await gateway.onCrash?.();
  },
  isVerifiedSnapshot,
};
gateway.ready.catch((e) =>
  modal("Kernel unavailable", `<p>${esc(e.message)}</p>`),
);
