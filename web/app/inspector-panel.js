/**
 * The selection inspector (ADR 0033): properties of the selected entity or
 * structure object, member results and the guided property forms.
 */
export function inspectorPanel({
  $,
  bindEntityFields,
  cadTools,
  command,
  concrete,
  entityFields,
  entityGuides,
  esc,
  format,
  guideDiagram,
  input,
  label,
  lineageSummary,
  message,
  nativeSteel,
  readEntityFields,
  renderForceInspector,
  renderResults,
  renderSelectionStatus,
  renderStructureEditor,
  setBusy,
  state,
  structuralIcon,
  viewport,
}) {
  function renderDirectProperties(key, entity) {
    $("#selection-tag").textContent = label(entity.id);
    $("#selected-status").textContent =
      `${key === "supports" ? "Support" : key === "loads" ? "Load" : "Node"} ${label(entity.id)} selected`;
    $("#inspector-content").innerHTML =
      `<h3>${esc(entityGuides[key][0])} · ${esc(label(entity.id))}</h3><form id="direct-properties" class="entity-form">${entityFields(key, entity, state.project, { compact: true })}<p id="direct-error" class="error-text" role="alert"></p><div class="property-actions full"><button class="primary">Apply changes</button><button type="button" id="cancel-direct">Cancel changes</button>${key !== "nodes" ? '<button type="button" id="delete-assignment">Delete</button>' : ""}</div></form>`;
    bindEntityFields($("#direct-properties"), key, state.project);
    $("#direct-properties").oninput = () => {
      state.formDirty = true;
      setBusy(state.busy);
      $("#export-report").disabled = true;
      $("#export-csv").disabled = true;
      $("#result-status").textContent = "Unapplied changes";
    };
    $("#cancel-direct").onclick = () => {
      message("");
      renderInspector();
      setBusy(state.busy);
      renderResults();
    };
    $("#direct-properties").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const value = readEntityFields(
          e.currentTarget,
          key,
          entity,
          state.project,
        );
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
        if (state.formDirty) {
          message("Apply or cancel changes before deleting.");
          return;
        }
        try {
          await command("DeleteEntities", { ids: [entity.id], cascade: false });
        } catch (e) {
          message(e.message);
        }
      };
    setBusy(state.busy);
  }
  function renderSelectionForces() {
    renderForceInspector({
      project: state.project,
      result: state.result,
      modelHash: state.modelHash,
      selected: state.selected,
      count: viewport.selection.size,
    });
  }
  function renderStructureSelection() {
    const { collection, id } = state.selectionContext;
    renderStructureEditor({
      project: state.project,
      collection,
      id,
      host: $("#inspector-content"),
      esc,
      command,
      done: () => {
        renderInspector();
        renderSelectionStatus();
      },
      dirty: (value) => {
        state.formDirty = value;
      },
    });
    const entity = state.project.structure[collection].find((x) => x.id === id);
    const openDraft = $("#open-structure-draft");
    if (openDraft)
      openDraft.onclick = () => {
        if (state.formDirty) return message("Apply or cancel changes first.");
        concrete.select(entity.previewId);
        $("[data-inspector-tab=concrete]").click();
      };
    renderSelectionStatus();
  }
  function renderInspector() {
    renderSelectionForces();
    state.formDirty = false;
    if (!$("#concrete-inspector").hidden) void concrete.render();
    if (!$("#steel-design-inspector").hidden) void nativeSteel.render();
    if (state.selectionContext?.kind === "structure") {
      renderStructureSelection();
      return;
    }
    if (!state.selected || viewport.selection.size > 1) {
      const count = viewport.selection.size;
      $("#selection-tag").textContent = count ? `${count} selected` : "None";
      $("#inspector-content").innerHTML = count
        ? `<h3>Multiple selection</h3><p>${count} entities selected. Properties may differ.</p><p>${esc([...viewport.selection].slice(0, 20).map(label).join(", "))}</p><button id="edit-multiple">Edit selection</button><p class="form-help">Move, copy or delete through a dependency preview. Individual properties are edited one entity at a time.</p>`
        : "<h3>No selection</h3><p>Select a node or member in the canvas or model explorer to inspect its properties.</p>";
      if (count) $("#edit-multiple").onclick = () => cadTools.open();
      return;
    }
    const selectedSupport = state.project.supports.find(
      (s) => s.id === state.selected,
    );
    const assignment = state.project.loads.find((l) => l.id === state.selected);
    if (selectedSupport || assignment) {
      renderDirectProperties(
        selectedSupport ? "supports" : "loads",
        selectedSupport || assignment,
      );
      return;
    }
    const node = state.project.nodes.find((n) => n.id === state.selected);
    if (node) {
      renderDirectProperties("nodes", node);
      return;
    }
    const m = state.project.members.find((m) => m.id === state.selected);
    if (!m) {
      state.selected = null;
      renderInspector();
      return;
    }
    const sec = state.project.sections.find((s) => s.id === m.section),
      mat = state.project.materials.find((x) => x.id === m.material),
      start = state.project.nodes.find((n) => n.id === m.start),
      end = state.project.nodes.find((n) => n.id === m.end),
      load = state.project.loads.find(
        (l) => l.type === "nodal" && l.node === m.end,
      ),
      support = state.project.supports.find((s) => s.node === m.start);
    const simple =
      state.project.members.length === 1 &&
      start.position.every((x) => x === 0) &&
      end.position[1] === 0 &&
      end.position[2] === 0;
    const lineage = lineageSummary(state.project, m, label);
    $("#selection-tag").textContent = label(m.id);
    $("#selected-status").textContent = lineage
      ? `Analytical ${label(m.id)} · physical ${lineage.physicalLabel}${lineage.stations ? ` · ${lineage.stations}` : ""}`
      : `Member ${label(m.id)} selected · ${label(m.start)} → ${label(m.end)}`;
    $("#inspector-content").innerHTML =
      `<div class="inspector-heading"><span class="symbol">${structuralIcon("member")}</span><div><strong>Member ${esc(label(m.id))}</strong><small>${esc(label(m.start))} → ${esc(label(m.end))} · Custom section</small></div></div>${lineage ? `<div class="form-section lineage-panel" data-physical="${esc(lineage.physicalId)}"><h3>Physical lineage</h3><p>${esc(lineage.text)}</p><p class="form-help">Parent ID and station range are provenance from split/connect. They do not remesh automatically.</p></div>` : ""}<form id="member-form"><div class="form-section"><h3>Geometry</h3>${guideDiagram("members")}<div class="fields">${simple ? input("span", "Span [m]", end.position[0], 'min="0.000001" required') : `<p class="form-help full">Edit node coordinates from the model explorer.</p>`}</div></div><div class="form-section"><h3>Material · ${esc(label(mat.id))}</h3><div class="fields">${input("elasticity", "Elastic stiffness E [GPa]", mat.E / 1e9, 'min="0.000001" required')}${input("poisson", "Poisson ratio ν", mat.nu, 'min="-0.999" max="0.499" required')}${input("density", "Density [kg/m³]", mat.density, 'min="0" required')}</div></div><div class="form-section"><h3>Section · ${esc(label(sec.id))}</h3><div class="fields">${input("area", "Area [m²]", sec.A, 'min="1e-15" required')}${input("torsion", "Twisting resistance J [m⁴]", sec.J, 'min="1e-20" required')}${input("inertia-y", "Bending about y · Iy [m⁴]", sec.Iy, 'min="1e-20" required')}${input("inertia-z", "Bending about z · Iz [m⁴]", sec.Iz, 'min="1e-20" required')}</div><p class="form-help">Principal axes · ${esc(sec.provenance)}</p></div>${simple ? `<div class="form-section"><h3>Support & loading</h3><label class="check-label"><input id="fixed-support" type="checkbox" ${support ? "checked" : ""}> Fixed at ${esc(label(m.start))}</label><div class="fields" style="margin-top:14px">${load ? input("tip-load", "Vertical tip force [kN]", load.values[2] / 1000, "required") : ""}</div><p class="form-help">Negative Fz acts downward, along global −Z. Unit suffixes such as “-13000 N” are accepted.</p></div>` : ""}<div id="form-error" class="error-text" role="alert"></div><div class="property-actions"><button class="primary" type="submit">Apply changes</button><button type="button" id="discard-properties">Cancel changes</button></div><p class="form-help">Material and section edits affect every member using these definitions.</p></form>${state.result && state.result.analysisType !== "envelope" ? `<div class="probe"><small>${state.result.modelHash === state.modelHash ? "Result probe" : "Stale result probe"} · ${esc(label(m.id))} · ${esc(state.result.caseId)}</small><strong>${format(state.result.members.find((x) => x.id === m.id)?.samples?.at(-1)?.displacement?.[2] * 1000)} mm</strong><small>Global Z displacement · station 1.00 L</small></div>` : state.result?.analysisType === "envelope" ? `<div class="probe"><small>Envelope result · ${esc(label(m.id))}</small><p class="form-help">Open Results for per-scalar governing provenance. Envelope values are not a tip probe.</p></div>` : ""}`;
    $("#discard-properties").onclick = () => {
      message("");
      renderInspector();
      setBusy(state.busy);
    };
    $("#member-form").oninput = () => {
      state.formDirty = true;
      $("#analyse").disabled = true;
      $("#export-report").disabled = true;
      $("#export-csv").disabled = true;
      $("#result-status").textContent = "Unapplied changes";
      $("#result-status").className = "badge stale";
      setBusy(state.busy);
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
    setBusy(state.busy);
    renderResults();
  }
  return {
    renderDirectProperties,
    renderSelectionForces,
    renderStructureSelection,
    renderInspector,
  };
}
