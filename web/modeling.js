import { escape as esc } from "./reports/report.js";
const $ = (s) => document.querySelector(s);
const uid = (prefix) =>
  prefix + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const member = (id, start, end, material, section) => ({
  id,
  start,
  end,
  material,
  section,
  localY: [0, 1, 0],
  releaseStart: { my: false, mz: false },
  releaseEnd: { my: false, mz: false },
});

export function modeling({
  getProject,
  open,
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit,
}) {
  let drawing = false,
    nextPoint = 0,
    epoch = 0;
  const inputs = () => [...document.querySelectorAll("#draw-member input")];
  const cancel = () => {
    drawing = false;
    epoch++;
    nextPoint = 0;
    viewport.drawing = false;
    viewport.preview = null;
    viewport.draw();
    $("#drawing-panel").hidden = true;
    $("#draw-toggle").setAttribute("aria-pressed", "false");
  };
  $("#new-portal").onclick = () => {
    modal(
      "Create a planar portal",
      `<p>Two columns and a roof beam in the global XZ plane. Dimensions are in metres. All three members share an editable material and section.</p><form id="portal-form" class="entity-form">
      <label>Project name<input name="name" value="Planar portal" required maxlength="256"></label>
      <label>Span (m)<input name="span" type="number" step="any" min="0.000001" max="1000000" value="4" required></label>
      <label>Height (m)<input name="height" type="number" step="any" min="0.000001" max="1000000" value="3" required></label>
      <label>Roof force +X (N)<input name="force" type="number" step="any" value="10000" required></label>
      <label>Column bases<select name="bases"><option value="fixed">Fixed</option><option value="pinned">Pinned in XZ (rotation Ry free)</option></select></label>
      <p class="full">Synthetic section: A = 10,000 mm², Iy = 10,000,000 mm⁴, Iz = 20,000,000 mm⁴. E = 200 GPa. Change these in Properties before interpreting results.</p>
      <div id="portal-error" class="error-text" role="alert"></div><button type="submit" class="primary">Create portal</button></form>`,
    );
    $("#portal-form").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector("button");
      button.disabled = true;
      try {
        const f = new FormData(e.target),
          w = Number(f.get("span")),
          h = Number(f.get("height"));
        const p = await fetch("./examples/B02.json").then((r) => r.json());
        p.id = uid("p");
        p.name = f.get("name");
        p.analysisMode = "planarXZ";
        p.nodes = [
          { id: "n1", position: [0, 0, 0] },
          { id: "n2", position: [0, 0, h] },
          { id: "n3", position: [w, 0, h] },
          { id: "n4", position: [w, 0, 0] },
        ];
        p.members = [
          ["m1", "n1", "n2"],
          ["m2", "n2", "n3"],
          ["m3", "n4", "n3"],
        ].map((a) => member(...a, "mat1", "sec1"));
        p.supports = ["n1", "n4"].map((node, i) => ({
          id: "s" + (i + 1),
          node,
          fixed: [true, false, true, false, f.get("bases") === "fixed", false],
          prescribed: [0, 0, 0, 0, 0, 0],
        }));
        p.loadCases = [
          { id: "LC1", name: "Lateral roof force", category: "other" },
        ];
        p.loads = [
          {
            id: "l1",
            case: "LC1",
            type: "nodal",
            node: "n3",
            values: [Number(f.get("force")), 0, 0, 0, 0, 0],
          },
        ];
        p.metadata = {
          description: "User-created XZ portal; synthetic editable section",
          createdBy: "Structural Workbench",
        };
        await open(p);
        if (getProject()?.id === p.id) {
          viewport.mode = "elevation";
          viewport.fit();
        }
      } catch (e) {
        if ($("#portal-error")) $("#portal-error").textContent = e.message;
        else message(e.message);
      } finally {
        button.disabled = false;
      }
    };
  };
  $("#draw-toggle").onclick = () => {
    if (drawing) {
      cancel();
      return;
    }
    if (!canEdit()) return;
    const p = getProject();
    if (p.analysisMode !== "planarXZ") {
      message("Choose Planar XZ before drawing members.");
      return;
    }
    drawing = true;
    viewport.drawing = true;
    viewport.mode = "elevation";
    viewport.fit();
    $("#drawing-panel").hidden = false;
    $("#draw-toggle").setAttribute("aria-pressed", "true");
    for (const [id, items] of [
      ["draw-material", p.materials],
      ["draw-section", p.sections],
    ]) {
      $("#" + id).innerHTML = items
        .map(
          (x) => `<option value="${esc(x.id)}">${esc(x.name || x.id)}</option>`,
        )
        .join("");
    }
    $("#draw-status").textContent =
      "Click a start and end point, then Add member or Enter. Escape cancels. You can also type coordinates with m or mm.";
  };
  $("#cancel-drawing").onclick = cancel;
  const snap = (position, features = false) =>
    gateway.send("queryGeometry", {
      kind: "snap",
      query: {
        position,
        tolerance: features ? 8 / viewport.factor : 1e-6,
        features,
        grid: 0.5,
      },
      viewRevision: viewport.viewRevision,
    });
  viewport.onDrawPoint = async (point) => {
    if (!drawing || !canEdit()) return;
    const token = epoch;
    try {
      const answer = await snap(point, true);
      if (!drawing || token !== epoch) return;
      const fields = inputs();
      fields[nextPoint * 2].value = answer.position[0];
      fields[nextPoint * 2 + 1].value = answer.position[2];
      if (nextPoint === 0) {
        viewport.preview = [answer.position, answer.position];
        nextPoint = 1;
      } else {
        viewport.preview[1] = answer.position;
        nextPoint = 0;
      }
      viewport.draw();
      $("#draw-status").textContent =
        `${answer.kind}${answer.entityId ? " " + answer.entityId : ""} · X ${answer.position[0].toPrecision(7)} m, Z ${answer.position[2].toPrecision(7)} m. Add member to commit. Crossings stay disconnected.`;
    } catch (e) {
      message(e.message);
    }
  };
  $("#draw-member").onsubmit = async (e) => {
    e.preventDefault();
    if (!drawing || !canEdit()) return;
    const token = epoch;
    try {
      const f = inputs().map((x) => x.value),
        p = getProject();
      const start = await snap([f[0], 0, f[1]]),
        end = await snap([f[2], 0, f[3]]);
      if (!drawing || token !== epoch) return;
      const nodes = [start, end].map((x) => ({
        id: x.entityId || uid("n"),
        position: x.position,
      }));
      const id = uid("m");
      await command("Batch", {
        commands: [
          ...nodes
            .filter((_, i) => ![start, end][i].entityId)
            .map((args) => ({ type: "AddNode", args })),
          {
            type: "AddMember",
            args: member(
              id,
              nodes[0].id,
              nodes[1].id,
              $("#draw-material").value,
              $("#draw-section").value,
            ),
          },
        ],
      });
      viewport.preview = null;
      viewport.draw();
      nextPoint = 0;
      $("#draw-status").textContent =
        "Member added with one undo step. Click or type the next pair of points.";
    } catch (e) {
      $("#draw-status").textContent = e.message;
    }
  };
  window.addEventListener("keydown", (e) => {
    if (!drawing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && e.target === $("#viewport")) {
      e.preventDefault();
      $("#draw-member").requestSubmit();
    }
  });
  return { cancel };
}
