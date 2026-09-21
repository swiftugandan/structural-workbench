import { escape as esc } from "./reports/report.js";
const $ = (s) => document.querySelector(s);
export function cad({
  getProject,
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit,
  selectEntities,
}) {
  let viewBusy = false,
    lastViewKey = "",
    hoverBusy = false;
  const cameraKey = () =>
    JSON.stringify([
      getProject()?.id,
      getProject()?.revision,
      viewport.camera(),
    ]);
  viewport.onViewChanged = async () => {
    if (!getProject() || viewBusy || !viewport.origin) return;
    const key = cameraKey();
    if (key === lastViewKey) return;
    viewBusy = true;
    viewport.crossingData = null;
    try {
      const data = await gateway.send("queryGeometry", {
        kind: "viewGeometry",
        query: { camera: viewport.camera() },
        viewRevision: viewport.viewRevision,
      });
      if (key === cameraKey()) {
        lastViewKey = key;
        viewport.crossingData = data;
        $("#geometry-status").textContent = data.crossings.length
          ? `◇ ${data.crossings.length} unconnected crossings (outlined diamonds)`
          : "";
        viewport.draw();
      }
    } catch (e) {
      message(e.message);
    } finally {
      viewBusy = false;
      if (key !== cameraKey()) viewport.onViewChanged();
    }
  };
  viewport.onDragStart = async (point) => {
    try {
      const data = await gateway.send("queryGeometry", {
        kind: "screenPick",
        query: { camera: viewport.camera(), point },
        viewRevision: viewport.viewRevision,
      });
      return !data.entityId;
    } catch {
      return false;
    }
  };
  viewport.onBoxSelect = async (rect, toggle) => {
    const key = cameraKey();
    try {
      const data = await gateway.send("queryGeometry", {
        kind: "boxSelect",
        query: { camera: viewport.camera(), rect },
        viewRevision: viewport.viewRevision,
      });
      if (key === cameraKey()) selectEntities(data.entityIds, toggle);
    } catch (e) {
      message(e.message);
    }
  };
  viewport.onHover = async (point) => {
    if (hoverBusy || !getProject() || !viewport.origin) return;
    hoverBusy = true;
    const key = cameraKey();
    try {
      const data = await gateway.send("queryGeometry", {
        kind: "screenPick",
        query: { camera: viewport.camera(), point },
        viewRevision: viewport.viewRevision,
      });
      if (key === cameraKey()) {
        viewport.canvas.dataset.hovered = data.entityId || "";
        if (viewport.hovered !== data.entityId) {
          viewport.hovered = data.entityId;
          viewport.draw();
        }
        viewport.canvas.title = data.entityId
          ? `${data.kind} ${data.entityId}`
          : "Drag to box-select; middle drag or Space pans";
      }
    } catch {
    } finally {
      hoverBusy = false;
    }
  };
  for (const tool of ["select", "pan", "orbit"])
    $("#" + tool + "-tool").onclick = () => {
      viewport.tool = tool;
      if (tool === "orbit") {
        viewport.mode = "3d";
        viewport.draw();
      }
      for (const id of ["select", "pan", "orbit"])
        $("#" + id + "-tool").setAttribute("aria-pressed", String(id === tool));
      viewport.canvas.focus();
    };
  const open = (initial = "MoveNodes") => {
    if (!canEdit()) return;
    const p = getProject();
    let preview = null,
      token = 0;
    modal(
      "Edit selection",
      `<p>Select nodes and members by ID. Moving a member also moves its endpoints and attached geometry. Copy makes separate geometry with no copied supports or loads. Delete previews dependent members, supports and loads.</p>
      <form id="cad-form" class="entity-form">
      <label class="full">Selected IDs (comma separated)<input id="cad-ids" value="${esc([...viewport.selection].join(", "))}" required></label>
      <div class="full"><button type="button" id="cad-all">Select all geometry</button> <button type="button" id="cad-clear">Clear selection</button></div>
      <details class="full"><summary>Choose from the entity table</summary><div class="cad-selection" tabindex="0" role="region" aria-label="Entity selection">${[
        ...p.nodes.map((n) => ({
          id: n.id,
          label: `Node ${n.id} [${n.position.join(", ")}] m`,
        })),
        ...p.members.map((m) => ({
          id: m.id,
          label: `Member ${m.id} ${m.start} → ${m.end}`,
        })),
      ]
        .slice(0, 200)
        .map(
          (x) =>
            `<label><input type="checkbox" data-cad-id="${esc(x.id)}" ${viewport.selection.has(x.id) ? "checked" : ""}>${esc(x.label)}</label>`,
        )
        .join(
          "",
        )}</div><p>First 200 shown. Enter any ID above, or select all geometry.</p></details>
      <label>Operation<select id="cad-kind"><option value="MoveNodes">Move</option><option value="CopySelection">Copy geometry</option><option value="DeleteGeometry">Delete</option></select></label>
      <fieldset class="full" id="cad-offset"><legend>Offset</legend>${["X", "Y", "Z"].map((axis) => `<label>${axis} offset (m or mm)<input id="cad-${axis}" value="0" required></label>`).join("")}</fieldset>
      <button type="submit">Preview changes</button></form><div id="cad-error" class="error-text" role="alert"></div><div id="cad-preview" tabindex="0" class="cad-selection" role="region" aria-label="Proposed changes"></div><button id="cad-commit" class="primary" hidden>Commit changes</button>`,
    );
    $("#cad-kind").value = initial;
    const invalidate = () => {
      preview = null;
      token++;
      $("#cad-preview").replaceChildren();
      $("#cad-commit").hidden = true;
      $("#cad-offset").hidden = $("#cad-kind").value === "DeleteGeometry";
    };
    invalidate();
    const selected = () =>
      $("#cad-ids")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    $("#cad-form").oninput = invalidate;
    $("#cad-kind").onchange = invalidate;
    for (const box of document.querySelectorAll("[data-cad-id]"))
      box.onchange = () => {
        const ids = new Set(selected());
        box.checked
          ? ids.add(box.dataset.cadId)
          : ids.delete(box.dataset.cadId);
        $("#cad-ids").value = [...ids].join(", ");
        selectEntities([...ids]);
        invalidate();
      };
    $("#cad-all").onclick = () => {
      $("#cad-ids").value = [...p.nodes, ...p.members]
        .map((x) => x.id)
        .join(", ");
      selectEntities(selected());
      invalidate();
    };
    $("#cad-clear").onclick = () => {
      $("#cad-ids").value = "";
      selectEntities([]);
      invalidate();
    };
    $("#cad-form").onsubmit = async (e) => {
      e.preventDefault();
      invalidate();
      const generation = token;
      $("#cad-error").textContent = "";
      const c = {
        id: "c" + crypto.randomUUID().replaceAll("-", ""),
        type: $("#cad-kind").value,
        args: {
          ids: selected(),
          delta: ["X", "Y", "Z"].map((a) => $("#cad-" + a).value),
          connectToExisting: false,
          cascade: true,
        },
      };
      const revision = getProject().revision;
      try {
        const result = await gateway.send("queryGeometry", {
          kind: "commandPreview",
          query: { command: c },
          viewRevision: viewport.viewRevision,
        });
        if (
          generation !== token ||
          getProject().revision !== revision ||
          !$("#modal").open
        )
          return;
        const sections = ["nodes", "members", "supports", "loads"].map(
          (key) => {
            const before = new Map(p[key].map((x) => [x.id, x])),
              after = new Map(result.project[key].map((x) => [x.id, x]));
            const changed = [
              ...new Set([...before.keys(), ...after.keys()]),
            ].filter(
              (id) =>
                JSON.stringify(before.get(id)) !==
                JSON.stringify(after.get(id)),
            );
            return `<h3>${key} · ${p[key].length} → ${result.project[key].length}</h3><p>${changed.length} changes</p><ul>${changed
              .slice(0, 100)
              .map(
                (id) =>
                  `<li>${esc(id)} · ${!after.has(id) ? "remove" : !before.has(id) ? "add" : "update"}${after.get(id)?.position ? ` · [${after.get(id).position.join(", ")}] m` : ""}</li>`,
              )
              .join(
                "",
              )}</ul>${changed.length > 100 ? "<p>First 100 changes shown; all listed counts are included.</p>" : ""}`;
          },
        );
        $("#cad-preview").innerHTML =
          `<p>Validated preview. No model changes yet. One undo step restores all affected values.</p>${sections.join("")}`;
        preview = { c, revision };
        $("#cad-commit").hidden = false;
      } catch (e) {
        if (generation === token) $("#cad-error").textContent = e.message;
      }
    };
    $("#cad-commit").onclick = async () => {
      if (!preview || !canEdit()) return;
      if (getProject().revision !== preview.revision) {
        invalidate();
        $("#cad-error").textContent = "Model changed. Preview again.";
        return;
      }
      $("#cad-commit").disabled = true;
      try {
        await command(preview.c.type, preview.c.args, preview.c.id);
        $("#modal").close();
      } catch (e) {
        $("#cad-error").textContent = e.message;
      } finally {
        if ($("#cad-commit")) $("#cad-commit").disabled = false;
      }
    };
  };
  $("#cad-tools").onclick = () => open();
  viewport.onDelete = () => open("DeleteGeometry");
  $("#measure-tool").onclick = () => {
    const p = getProject();
    if (!p) return;
    const options = p.nodes
      .map((n) => `<option value="${esc(n.id)}">${esc(n.id)}</option>`)
      .join("");
    modal(
      "Measure",
      `<form id="measure-form" class="entity-form"><label>Start node<select id="measure-start">${options}</select></label><label>End node<select id="measure-end">${options}</select></label><button type="submit">Measure distance</button></form><p id="measure-result" role="status"></p>`,
    );
    $("#measure-end").value = p.nodes.at(-1).id;
    $("#measure-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const v = await gateway.send("queryGeometry", {
          kind: "measure",
          query: {
            start: $("#measure-start").value,
            end: $("#measure-end").value,
          },
          viewRevision: viewport.viewRevision,
        });
        $("#measure-result").textContent =
          `Distance ${v.distance.toPrecision(10)} m · ΔX/Y/Z [${v.delta.map((x) => Number(x.toPrecision(10))).join(", ")}] m`;
      } catch (e) {
        $("#measure-result").textContent = e.message;
      }
    };
  };
}
