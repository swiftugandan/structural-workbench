// Saved structure fields are sent to Rust; no geometry or engineering is calculated here.
export function renderStructureEditor({
  project,
  collection,
  id,
  host,
  esc,
  command,
  done,
  dirty,
}) {
  const titles = {
    storeys: "Storey",
    physicalMembers: "Physical member",
    grids: "Grid",
    layers: "Layer",
    groups: "Group",
    joints: "Joint",
    supportDetails: "Support detail",
    designObjects: "Design object",
  };
  const existing = project.structure[collection].find((x) => x.id === id);
  const entity = existing
    ? structuredClone(existing)
    : {
        id: `s${crypto.randomUUID().replaceAll("-", "")}`,
        name: "",
        ...(collection === "storeys"
          ? { elevation: 0 }
          : collection === "grids"
            ? { start: [0, 0, 0], end: [5, 0, 0] }
            : { members: [] }),
      };
  const field = (key, title, value) =>
    `<label>${title}<input name="${key}" value="${esc(String(value))}" required></label>`;
  let fields = field("name", "Name", entity.name);
  if (collection === "storeys")
    fields +=
      field("elevation", "Reference elevation (m)", entity.elevation) +
      "<p class='form-help'>A storey assignment organizes objects. Changing its elevation does not move analytical geometry.</p>";
  if ("storeyId" in entity)
    fields += `<label>Storey<select name="storeyId"><option value="">Unassigned</option>${project.structure.storeys.map((x) => `<option value="${esc(x.id)}" ${x.id === entity.storeyId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>`;
  if (collection === "physicalMembers")
    fields += `<label>Structural role<select name="role">${["unassigned", "beam", "column", "brace", "slab", "stair", "landing"].map((x) => `<option ${x === entity.role ? "selected" : ""}>${x}</option>`).join("")}</select></label><p>Analytical members: ${entity.analyticalMemberIds.map(esc).join(", ")}</p><p class="form-help">Role records design intent. It does not change the analytical formulation.</p>`;
  if (collection === "grids") {
    for (const end of ["start", "end"])
      for (let i = 0; i < 3; i++)
        fields += field(`${end}${i}`, `${end} ${"XYZ"[i]} (m)`, entity[end][i]);
    fields +=
      "<p class='form-help'>Reference line only; no implicit snapping, restraint or mesh.</p>";
  }
  if ("members" in entity) {
    const lists = [
      ["physicalMember", project.structure.physicalMembers],
      ["designObject", project.structure.designObjects],
      ["joint", project.structure.joints],
      ["support", project.supports],
      ["grid", project.structure.grids],
    ];
    fields += `<fieldset class="structure-members"><legend>Membership</legend>${lists.flatMap(([kind, items]) => items.map((x) => `<label><input type="checkbox" name="member" value="${esc(kind + ":" + x.id)}" ${entity.members.some((r) => r.kind === kind && r.id === x.id) ? "checked" : ""}>${esc(x.name || x.id)} <small>${kind}</small></label>`)).join("") || "No objects available"}</fieldset>`;
  }
  if (entity.nodeId)
    fields += `<p>Analytical node: ${esc(entity.nodeId)}</p><p>Connected members: ${
      project.members
        .filter((m) => m.start === entity.nodeId || m.end === entity.nodeId)
        .map((m) => esc(m.id))
        .join(", ") || "None"
    }</p><p class="form-help">Connectivity and end releases come from the analytical model. Connection hardware is designed only for single-plate shear connections drafted in the design workspace (M13).</p>`;
  if (entity.supportId) fields += `<p>Support: ${esc(entity.supportId)}</p>`;
  if (collection === "supportDetails")
    fields +=
      "<p class='form-help'>Restraints are analytical boundary conditions. Displayed hardware is illustrative and not designed.</p>";
  if (entity.previewId)
    fields += `<p>Draft: ${esc(entity.previewId)}</p><p>Physical member: ${esc(entity.physicalMemberId || "Unbound")}</p><p class="form-help">Unverified design preview. No plate mesh, soil contact or code compliance is implied.</p><button type="button" id="open-structure-draft">Open design draft</button>`;
  host.innerHTML = `<h3>${existing ? "Edit" : "Create"} ${titles[collection]}</h3><form id="structure-form" class="entity-form">${fields}<p id="structure-error" class="error-text" role="alert"></p><div class="property-actions full"><button class="primary">Apply changes</button><button type="button" id="structure-cancel">Cancel changes</button>${existing && ["storeys", "grids", "layers", "groups"].includes(collection) ? '<button type="button" id="structure-delete">Delete</button>' : ""}</div></form>`;
  const form = host.querySelector("form");
  form.oninput = () => dirty(true);
  host.querySelector("#structure-cancel").onclick = () => {
    dirty(false);
    done();
  };
  const error = (e) => {
    host.querySelector("#structure-error").textContent = e.message;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    entity.name = data.get("name");
    if ("storeyId" in entity) entity.storeyId = data.get("storeyId") || null;
    if ("role" in entity) {
      entity.role = data.get("role");
      if (entity.role !== "stair") delete entity.stairRisers;
    }
    if (collection === "storeys") entity.elevation = data.get("elevation");
    if (collection === "grids")
      for (const end of ["start", "end"])
        entity[end] = [0, 1, 2].map((i) => data.get(`${end}${i}`));
    if ("members" in entity)
      entity.members = data.getAll("member").map((value) => {
        const [kind, id] = value.split(":");
        return { kind, id };
      });
    try {
      await command("SetStructureEntity", {
        collection,
        entity,
        existence: existing ? "update" : "create",
      });
      dirty(false);
      done();
    } catch (e) {
      error(e);
    }
  };
  const del = host.querySelector("#structure-delete");
  if (del)
    del.onclick = async () => {
      try {
        await command("DeleteStructureEntity", { collection, id });
        dirty(false);
        done();
      } catch (e) {
        error(e);
      }
    };
}
