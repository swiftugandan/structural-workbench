/**
 * Entity lists and editors (ADR 0033): the dialogs that list, create, edit
 * and delete materials, sections, loads, cases, combinations and the rest,
 * each change one undoable Rust command.
 */
export function entityEditor({
  $,
  bindEntityFields,
  bindSectionCalculator,
  bindTemplates,
  command,
  describeSource,
  entityFields,
  entityGuides,
  esc,
  gateway,
  guideDiagram,
  label,
  lineageSummary,
  message,
  modal,
  readEntityFields,
  setModalContent,
  state,
}) {
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
      massSources: "Mass sources",
    }[key];
    modal(
      title,
      `<div class="entity-guide">${guideDiagram(key)}<div><span class="guide-eyebrow">${esc(entityGuides[key][1])}</span><p>${esc(entityGuides[key][2])}</p></div></div><div class="entity-table-wrap"><table><thead><tr><th>Label</th><th>Description</th><th>Action</th></tr></thead><tbody>${(
        state.project[key] ?? []
      )
        .map((v) => {
          const lineage =
            key === "members" ? lineageSummary(state.project, v, label) : null;
          const description =
            lineage?.text ||
            (key === "massSources" ? describeSource(v, label) : "") ||
            v.name ||
            label(v.node) ||
            v.type ||
            (v.start
              ? `${label(v.start)} → ${label(v.end)}`
              : v.position?.join(", ") || "");
          return `<tr${lineage ? ` data-physical="${esc(lineage.physicalId)}"` : ""}><th>${esc(label(v.id))}</th><td>${esc(description)}</td><td><button data-edit="${esc(v.id)}">Edit ${esc(label(v.id))}</button></td></tr>`;
        })
        .join(
          "",
        )}</tbody></table></div><button class="primary add-button" id="add-entity">＋ Add ${entityGuides[key][0].toLowerCase()}</button>`,
    );
    for (const b of document.querySelectorAll("[data-edit]"))
      b.onclick = () =>
        editEntity(
          key,
          (state.project[key] ?? []).find((x) => x.id === b.dataset.edit),
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
        start: state.project.nodes[0]?.id,
        end: state.project.nodes.at(-1)?.id,
        material: state.project.materials[0]?.id,
        section: state.project.sections[0]?.id,
        localY: [0, 1, 0],
        releaseStart: { my: false, mz: false },
        releaseEnd: { my: false, mz: false },
      },
      materials: {
        E: 200e9,
        nu: 0.3,
        density: 7850,
        ...state.project.materials[0],
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
        ...state.project.sections[0],
        id,
        name: "Custom section",
      },
      supports: {
        id,
        node:
          state.project.nodes.find((n) => n.id === state.selected)?.id ||
          state.project.nodes[0]?.id,
        fixed: [true, true, true, true, true, true],
        prescribed: [0, 0, 0, 0, 0, 0],
      },
      loadCases: { id, name: "New case", category: "other" },
      loads: {
        id,
        case: state.project.loadCases[0]?.id,
        type: "nodal",
        node:
          state.project.nodes.find((n) => n.id === state.selected)?.id ||
          state.project.nodes.at(-1)?.id,
        values: [0, 0, -10000, 0, 0, 0],
      },
      combinations: {
        id,
        name: "New combination",
        purpose: "analysis",
        terms: [{ case: state.project.loadCases[0]?.id, factor: 1 }],
      },
      massSources: (state.project.massSources ?? []).some(
        (m) => m.kind === "selfMass",
      )
        ? {
            id,
            kind: "nodalMass",
            node:
              state.project.nodes.find((n) => n.id === state.selected)?.id ||
              state.project.nodes.at(-1)?.id,
            mass: 1000,
          }
        : { id, kind: "selfMass", factor: 1 },
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
      ([collection, count]) => state.project[collection].length < count,
    );
    $("#modal-title").textContent =
      (old ? "Edit " : "Add ") + entityGuides[key][0].toLowerCase();
    if (missing.length) {
      setModalContent(
        `<p>First add ${missing.map((x) => x[2]).join(" and ")}. Then return here to add this ${entityGuides[key][0].toLowerCase()}.</p><button id="setup-required" class="primary">Add ${missing[0][2]}</button>`,
      );
      $("#setup-required").onclick = () => editEntity(missing[0][0], null);
      return;
    }
    setModalContent(
      `<form id="entity-form" class="entity-form">${entityFields(key, entity, state.project)}<div class="error-text" id="entity-error" role="alert"></div><div class="dialog-actions">${old ? '<button type="button" class="danger" id="delete-entity">Delete entity</button>' : ""}<button class="primary" type="submit">Save entity</button></div></form>`,
    );
    bindEntityFields($("#entity-form"), key, state.project);
    if (key === "sections") {
      bindSectionCalculator(
        $("#entity-form"),
        async ({ width, depth, customJ }) =>
          gateway.send("computeSection", {
            shape: "solidRectangle",
            width,
            depth,
            customJ,
          }),
      );
    }
    bindTemplates($("#entity-form"), key, entity, state.project, (next) =>
      editEntity(key, old, next),
    );
    const massKind = $("#entity-form [name=kind]");
    if (key === "massSources" && massKind)
      massKind.onchange = () => {
        const next = { id: entity.id, kind: massKind.value };
        if (next.kind === "selfMass") next.factor = 1;
        if (next.kind === "loadCase")
          Object.assign(next, {
            case: state.project.loadCases[0]?.id,
            factor: 1,
          });
        if (next.kind === "nodalMass")
          Object.assign(next, {
            node:
              state.project.nodes.find((n) => n.id === state.selected)?.id ||
              state.project.nodes.at(-1)?.id,
            mass: 1000,
          });
        editEntity(key, old, next);
      };
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
            node: state.project.nodes.at(-1)?.id,
            values: [0, 0, -10000, 0, 0, 0],
          });
        if (next.type === "uniform")
          Object.assign(next, {
            member: state.project.members[0]?.id,
            axes: "global",
            forcePerLength: [0, 0, -1000],
          });
        if (next.type === "point")
          Object.assign(next, {
            member: state.project.members[0]?.id,
            axes: "global",
            station: 0.5,
            values: [0, 0, -10000, 0, 0, 0],
          });
        if (next.type === "selfWeight")
          Object.assign(next, {
            members: state.project.members.map((m) => m.id),
            factor: 1,
          });
        if (!state.project.members.length && next.type !== "nodal") {
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
        const value = readEntityFields(form, key, entity, state.project);
        const type = {
          nodes: old ? "SetNodePosition" : "AddNode",
          members: "AddMember",
          materials: "SetMaterial",
          sections: "SetSection",
          supports: "SetSupport",
          loadCases: "SetLoadCase",
          loads: "SetLoad",
          combinations: "SetCombination",
          massSources: "SetMassSource",
        }[key];
        if (key === "members" && old) {
          await command("Batch", {
            commands: [
              {
                type: "DeleteEntities",
                args: { ids: [old.id], cascade: false },
              },
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
  return { entityList, editEntity };
}
