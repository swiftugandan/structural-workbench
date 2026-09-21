import { escape as esc } from "./reports/report.js";
const $ = (s) => document.querySelector(s);
export function topology({
  getProject,
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit,
}) {
  const describe = (key, x) => {
    if (key === "nodes") return `Position [${x.position.join(", ")}] m`;
    if (key === "members")
      return (
        `${x.start} → ${x.end}; material ${x.material}; section ${x.section}` +
        (x.parentMemberId
          ? `; parent ${x.parentMemberId}, stations ${x.stationRange.join("–")}`
          : "")
      );
    if (key === "supports")
      return `Node ${x.node}; restrained ${["X", "Y", "Z", "Rx", "Ry", "Rz"].filter((_, i) => x.fixed[i]).join(", ")}; prescribed [${x.prescribed.join(", ")}] (m, rad)`;
    if (x.type === "nodal")
      return `Case ${x.case}; node ${x.node}; force/moment [${x.values.join(", ")}] (N, N·m)`;
    if (x.type === "uniform")
      return `Case ${x.case}; member ${x.member}; ${x.axes} density [${x.forcePerLength.join(", ")}] N/m`;
    return `Case ${x.case}; self weight × ${x.factor}; members ${x.members.join(", ")}`;
  };
  let preview = null,
    generation = 0;
  const clear = () => {
    preview = null;
    generation++;
  };
  $("#modal").addEventListener("close", clear);
  $("#topology").onclick = () => {
    if (!canEdit()) return;
    const p = getProject();
    modal(
      "Edit topology",
      `<p>Preview the resulting nodes, members, supports and loads before committing. Split creates a separate node; Connect intersections explicitly joins selected crossing members. Merge is limited to nodes within 0.000001 m. Collinear overlaps are excluded from Connect.</p>
      <form id="topology-form" class="entity-form">
      <label>Operation<select id="topology-kind"><option value="SplitMember">Split member</option><option value="ConnectIntersections">Connect intersections</option><option value="MergeNodes">Merge nodes</option></select></label>
      <div id="topology-fields" class="full"></div>
      <button type="submit">Preview topology</button></form>
      <div id="topology-error" class="error-text" role="alert"></div>
      <div id="topology-preview" tabindex="0" role="region" aria-label="Topology changes"></div><button id="topology-commit" class="primary" hidden>Commit topology</button>`,
    );
    const options = (items) =>
      items
        .map((x) => `<option value="${esc(x.id)}">${esc(x.id)}</option>`)
        .join("");
    const fields = () => {
      clear();
      $("#topology-preview").replaceChildren();
      $("#topology-commit").hidden = true;
      $("#topology-fields").innerHTML =
        $("#topology-kind").value === "SplitMember"
          ? `<label>Member to split<select id="split-member">${options(p.members)}</select></label><label>Split fractions (comma separated)<input id="split-stations" value="0.5" required></label>`
          : $("#topology-kind").value === "MergeNodes"
            ? `<label>Target node<select id="merge-target">${options(p.nodes)}</select></label><label>Source node IDs (comma separated)<input id="merge-sources" required></label>`
            : `<label>Member IDs to connect (comma separated)<input id="connect-members" value="${esc(
                p.members
                  .slice(0, 200)
                  .map((m) => m.id)
                  .join(", "),
              )}" required></label>`;
      if (
        $("#split-member") &&
        p.members.some((m) => m.id === viewport.selected)
      )
        $("#split-member").value = viewport.selected;
    };
    fields();
    $("#topology-kind").onchange = fields;
    $("#topology-form").addEventListener("input", () => {
      clear();
      $("#topology-commit").hidden = true;
      $("#topology-preview").replaceChildren();
    });
    $("#topology-form").onsubmit = async (e) => {
      e.preventDefault();
      clear();
      const token = generation;
      $("#topology-error").textContent = "";
      $("#topology-commit").hidden = true;
      const list = (id) =>
        $(id)
          .value.split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      const type = $("#topology-kind").value;
      const args =
        type === "SplitMember"
          ? {
              id: $("#split-member").value,
              stations: list("#split-stations").map(Number),
            }
          : type === "MergeNodes"
            ? {
                targetId: $("#merge-target").value,
                sourceIds: list("#merge-sources"),
              }
            : { memberIds: list("#connect-members") };
      const candidate = {
        id: "c" + crypto.randomUUID().replaceAll("-", ""),
        type,
        args,
      };
      const revision = getProject().revision;
      try {
        const result = await gateway.send("queryGeometry", {
          kind: "topologyPreview",
          query: { command: candidate },
          viewRevision: viewport.viewRevision,
        });
        if (
          token !== generation ||
          !$("#modal").open ||
          getProject().revision !== revision
        )
          return;
        preview = { candidate, revision };
        const sections = ["nodes", "members", "supports", "loads"].map(
          (key) => {
            const before = new Map(p[key].map((x) => [x.id, x])),
              after = new Map(result.project[key].map((x) => [x.id, x]));
            const ids = [
              ...new Set([...before.keys(), ...after.keys()]),
            ].filter(
              (id) =>
                JSON.stringify(before.get(id)) !==
                JSON.stringify(after.get(id)),
            );
            return `<h3>${esc(key)} · ${p[key].length} → ${result.project[key].length}</h3>${ids.length ? `<ul>${ids.map((id) => `<li><strong>${esc(id)}</strong> · ${!before.has(id) ? "add" : !after.has(id) ? "remove" : "update"}<pre>${esc(describe(key, after.get(id) || before.get(id)))}</pre></li>`).join("")}</ul>` : "<p>Unchanged</p>"}`;
          },
        );
        $("#topology-preview").innerHTML =
          `<p>Preview validated. No model changes yet. Commit applies one undo step.</p>${sections.join("")}`;
        $("#topology-commit").hidden = false;
      } catch (e) {
        if (token === generation) $("#topology-error").textContent = e.message;
      }
    };
    $("#topology-commit").onclick = async () => {
      if (!preview || !canEdit()) return;
      if (getProject().revision !== preview.revision) {
        clear();
        $("#topology-error").textContent = "Model changed. Preview again.";
        $("#topology-commit").hidden = true;
        return;
      }
      const { candidate } = preview;
      $("#topology-commit").disabled = true;
      try {
        await command(candidate.type, candidate.args, candidate.id);
        $("#modal").close();
      } catch (e) {
        $("#topology-error").textContent = e.message;
      } finally {
        if ($("#topology-commit")) $("#topology-commit").disabled = false;
      }
    };
  };
  $("#axes-toggle").onclick = () => {
    viewport.showAxes = !viewport.showAxes;
    $("#axes-toggle").setAttribute("aria-pressed", String(viewport.showAxes));
    viewport.draw();
  };
  let axesRevision;
  return {
    refresh: async () => {
      const p = getProject();
      if (!p || p === axesRevision) return;
      axesRevision = p;
      viewport.localAxes = null;
      try {
        const data = await gateway.send("queryGeometry", {
          kind: "axes",
          query: {},
          viewRevision: viewport.viewRevision,
        });
        if (getProject() !== p) return;
        viewport.localAxes = data.members;
        const near = data.nearCoincidentNodes || [];
        $("#near-node-status").textContent = near.length
          ? `Warning: ${near.length}${near.length === 100 ? "+" : ""} near-coincident node pairs. Connectivity is unchanged. ${near
              .slice(0, 4)
              .map((n) => n.nodeIds.join(" / "))
              .join("; ")}. Review Merge nodes explicitly.`
          : "";
        viewport.draw();
      } catch (e) {
        if (getProject() === p) message(e.message);
      }
    },
  };
}
