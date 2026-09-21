import { entityLabel } from "./entity-labels.js";
import { escape as esc } from "./reports/report.js";
const $ = (s) => document.querySelector(s);
const uid = (prefix) =>
  prefix + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const member = (id, start, end, material, section, localY = [0, 1, 0]) => ({
  id,
  start,
  end,
  material,
  section,
  localY,
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
  let pendingPoint = Promise.resolve(),
    submitting = false;
  const inputs = () => [...document.querySelectorAll("#draw-member input")];
  const cancel = () => {
    drawing = false;
    epoch++;
    nextPoint = 0;
    viewport.drawing = false;
    viewport.preview = null;
    viewport.snapPreview = null;
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
    drawing = true;
    viewport.drawing = true;
    viewport.mode = { XZ: "elevation", XY: "plan", YZ: "side" }[viewport.plane];
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
      "Click the first endpoint, then the second to create a member. Escape cancels. Numeric entry remains available below.";
    viewport.fit();
  };
  $("#cancel-drawing").onclick = cancel;
  const snap = (position, features = false) =>
    gateway.send("queryGeometry", {
      kind: "snap",
      query: {
        position,
        tolerance: features ? 8 / viewport.factor : 1e-6,
        features,
        grid: viewport.gridSpacing,
        plane: viewport.plane,
      },
      viewRevision: viewport.viewRevision,
    });
  viewport.onDrawPoint = (point) => {
    if (submitting) return;
    const token = epoch;
    pendingPoint = pendingPoint.then(async () => {
      if (!drawing || !canEdit() || token !== epoch) return;
      try {
        const answer = await snap(point, true);
        if (!drawing || token !== epoch) return;
        const fields = inputs();
        const axes = viewport.planeAxes();
        fields[nextPoint * 2].value = answer.position[axes[0]];
        fields[nextPoint * 2 + 1].value = answer.position[axes[1]];
        if (nextPoint === 0) {
          viewport.preview = [answer.position, answer.position];
          nextPoint = 1;
        } else {
          viewport.preview[1] = answer.position;
          nextPoint = 0;
          queueMicrotask(() => {
            if (drawing && token === epoch) $("#draw-member").requestSubmit();
          });
        }
        viewport.draw();
        $("#draw-status").textContent =
          `${answer.kind}${answer.entityId || answer.featureId ? " " + entityLabel(getProject(), answer.entityId || answer.featureId) : ""} · X ${answer.position[0].toPrecision(7)} m, Z ${answer.position[2].toPrecision(7)} m. Second endpoint commits. Crossings stay disconnected.`;
      } catch (e) {
        message(e.message);
      }
    });
    return pendingPoint;
  };
  $("#draw-member").onsubmit = async (e) => {
    e.preventDefault();
    if (!drawing || !canEdit() || submitting) return;
    const token = epoch;
    submitting = true;
    const points = pendingPoint;
    try {
      await points;
      if (!drawing || token !== epoch) return;
      const f = inputs().map((x) => x.value),
        p = getProject();
      const point = (u, v) => {
        const p = [0, 0, 0],
          axes = viewport.planeAxes();
        p[axes[0]] = u;
        p[axes[1]] = v;
        p[3 - axes[0] - axes[1]] = viewport.planeOffset;
        return p;
      };
      const start = await snap(point(f[0], f[1])),
        end = await snap(point(f[2], f[3]));
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
              [0, 1, 2].map((i) =>
                i === 3 - viewport.planeAxes()[0] - viewport.planeAxes()[1]
                  ? 1
                  : 0,
              ),
            ),
          },
        ],
      });
      epoch++;
      viewport.preview = null;
      viewport.snapPreview = null;
      viewport.draw();
      nextPoint = 0;
      $("#draw-status").textContent =
        "Member added with one undo step. Click or type the next pair of points.";
    } catch (e) {
      $("#draw-status").textContent = e.message;
    } finally {
      submitting = false;
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
  let hovering = false,
    latestHover;
  viewport.onDrawHover = async (point) => {
    latestHover = point;
    if (hovering) return;
    hovering = true;
    try {
      while (latestHover && drawing) {
        const at = latestHover;
        latestHover = null;
        const token = epoch;
        const answer = await snap(at, true);
        if (!drawing || token !== epoch) continue;
        viewport.snapPreview = answer;
        if (nextPoint === 1 && viewport.preview)
          viewport.preview[1] = answer.position;
        viewport.draw();
        $("#draw-status").textContent =
          `${answer.kind}${answer.entityId || answer.featureId ? " " + entityLabel(getProject(), answer.entityId || answer.featureId) : ""} · [${answer.position.map((n) => Number(n.toPrecision(8))).join(", ")}] m. Click to place. Enter commits; Escape cancels. Crossings stay disconnected.`;
      }
    } catch (e) {
      if (drawing) $("#draw-status").textContent = e.message;
    } finally {
      hovering = false;
    }
  };
  const planeChanged = () => {
    const plane = $("#working-plane").value,
      offset = Number($("#plane-offset").value),
      grid = Number($("#grid-spacing").value);
    if (
      !Number.isFinite(offset) ||
      Math.abs(offset) > 1e7 ||
      !Number.isFinite(grid) ||
      grid <= 0
    ) {
      $("#draw-status").textContent =
        "Enter a finite plane offset and positive grid spacing.";
      return;
    }
    epoch++;
    nextPoint = 0;
    viewport.preview = null;
    viewport.snapPreview = null;
    viewport.plane = plane;
    viewport.planeOffset = offset;
    viewport.gridSpacing = grid;
    viewport.mode = { XZ: "elevation", XY: "plan", YZ: "side" }[plane];
    const axes = viewport.planeAxes().map((i) => ["X", "Y", "Z"][i]);
    inputs().forEach((field, i) => {
      const label = (i < 2 ? "Start " : "End ") + axes[i % 2];
      field.setAttribute("aria-label", label);
      field.parentElement.firstChild.textContent = label;
    });
    $("#view-subtitle").textContent =
      `Working plane ${plane} · offset ${offset} m · snap grid ${grid} m`;
    $("#draw-status").textContent =
      getProject()?.analysisMode === "planarXZ" && plane !== "XZ"
        ? "Planar XZ analysis restrains global Y translation and X/Z rotations. Choose Spatial analysis for frames needing those freedoms."
        : "Working plane changed; draft cleared.";
    viewport.fit();
  };
  for (const id of ["working-plane", "plane-offset", "grid-spacing"])
    $("#" + id).onchange = planeChanged;
  viewport.onCancel = cancel;
  return { cancel };
}
