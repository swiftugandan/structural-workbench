import { entityLabel } from "./entity-labels.js";
import { icon } from "./workspace-ui.js";
const $ = (s) => document.querySelector(s);
const uid = (p) => p + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
export function canvasTools({
  viewport,
  gateway,
  getProject,
  command,
  selectEntities,
  cancelDrawing,
  canEdit,
  message,
  inspect,
  deleteAssignment,
}) {
  let placementQueue = Promise.resolve();
  const enqueue = (point, end = point) => {
    const token = epoch;
    placementQueue = placementQueue
      .then(() => (token === epoch ? place(point, end) : undefined))
      .catch((error) => message(error.message));
  };
  let spaceHeld = false;
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === viewport.canvas) spaceHeld = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") spaceHeld = false;
  });
  viewport.canvas.addEventListener("blur", () => {
    spaceHeld = false;
  });
  let tool = null,
    base = null,
    epoch = 0,
    pending = false,
    drag = null;
  const strip = document.createElement("div");
  strip.id = "canvas-tool-options";
  strip.hidden = true;
  strip.innerHTML =
    '<strong id="canvas-tool-name"></strong><label id="support-option">Preset <select id="support-preset"><option value="fixed">Fixed</option><option value="pinned">Pinned</option><option value="roller">Roller · global Z</option></select></label><label id="load-option">Magnitude <input id="placement-magnitude" type="number" min="0.000001" step="any" value="10"> kN / kN per m</label><label id="case-option">Case <select id="placement-case"></select></label><span id="placement-help" role="status"></span><button id="placement-confirm" hidden>Confirm delete</button><button id="placement-cancel">Finish / Escape</button>';
  $(".canvas-panel").prepend(strip);
  const tools = [
    ["place-node", "Node", "node"],
    ["place-support", "Support", "support"],
    ["place-load", "Load", "load"],
    ["move", "Move", "move"],
    ["copy", "Copy", "copy"],
    ["delete", "Delete", "delete"],
    ["split", "Split", "split"],
    ["measure", "Measure", "measure"],
  ];
  const group = document.createElement("div");
  group.className = "ribbon-group";
  group.dataset.category = "Modify";
  group.innerHTML =
    '<div class="ribbon-commands" id="direct-commands"></div><span class="ribbon-caption">Canvas edits</span>';
  $("#ribbon-content").append(group);
  for (const [name, label, img] of tools) {
    let b = $(
      {
        "place-node": "#add-node-tool",
        "place-support": "#add-support-tool",
        "place-load": "#add-load-tool",
        measure: "#measure-tool",
      }[name] || "#canvas-" + name,
    );
    if (!b) {
      b = document.createElement("button");
      b.id = "canvas-" + name;
      b.innerHTML = icon(img) + `<span>${label}</span>`;
      $("#direct-commands").append(b);
    }
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => activate(name);
    b.dataset.canvasTool = name;
  }
  const help = {
    "place-node": "Click the working plane to place a snapped node.",
    "place-support":
      "Click a node to place the preset. Right-click a support to edit it.",
    "place-load":
      "Click a node or member for a downward load. Drag from it to draw another direction.",
    move: "Select geometry, click a base point, then click the destination.",
    copy: "Select geometry, click a base point, then click the copy destination.",
    delete: "Select geometry, then review and confirm its dependent objects.",
    split: "Click the interior of a member to split it at that point.",
    measure: "Click a start node, then an end node.",
  };
  function finish() {
    epoch++;
    tool = null;
    base = null;
    drag = null;
    viewport.preview = null;
    viewport.snapPreview = null;
    viewport.loadDraft = null;
    viewport.draw();
    strip.hidden = true;
    $("#placement-confirm").hidden = true;
    document
      .querySelectorAll("[data-canvas-tool]")
      .forEach((b) => b.setAttribute("aria-pressed", "false"));
    viewport.canvas.style.cursor = "";
    $("#select-tool").setAttribute("aria-pressed", "true");
  }
  function activate(name) {
    if (!canEdit()) return;
    finish();
    cancelDrawing();
    tool = name;
    epoch++;
    if (!$("#results-content").hidden) $("#toggle-results").click();
    strip.hidden = false;
    $("#canvas-tool-name").textContent = tools.find((t) => t[0] === name)[1];
    $("#placement-help").textContent = help[name];
    $("#support-option").hidden = name !== "place-support";
    $("#load-option").hidden = name !== "place-load";
    $("#case-option").hidden = name !== "place-load";
    $("#placement-case").replaceChildren(
      ...getProject().loadCases.map((c) => new Option(c.name, c.id)),
    );
    const chosen = $("#result-case").value;
    if (getProject().loadCases.some((c) => c.id === chosen))
      $("#placement-case").value = chosen;
    document
      .querySelectorAll("[data-canvas-tool]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.canvasTool === name)),
      );
    viewport.tool = "select";
    for (const id of ["select", "pan", "orbit"])
      $("#" + id + "-tool").setAttribute("aria-pressed", "false");
    if (["place-node", "move", "copy"].includes(name)) {
      viewport.mode = { XZ: "elevation", XY: "plan", YZ: "side" }[
        viewport.plane
      ];
      $("#view-subtitle").textContent =
        `Working plane ${viewport.plane} · offset ${viewport.planeOffset} m`;
    }
    viewport.canvas.style.cursor = "crosshair";
    viewport.draw();
    viewport.canvas.focus();
    if (name === "delete") previewDelete();
  }
  $("#placement-cancel").onclick = finish;
  $("#analyse").addEventListener("click", () => {
    finish();
    if ($("#results-content").hidden) $("#toggle-results").click();
  });
  for (const id of [
    "draw-toggle",
    "select-tool",
    "pan-tool",
    "orbit-tool",
    "view-plan",
    "view-elevation",
    "view-3d",
    "home",
  ])
    $("#" + id).addEventListener("click", finish, { capture: true });
  for (const id of ["cad-tools", "topology"])
    $("#" + id).addEventListener(
      "click",
      () => {
        finish();
        cancelDrawing();
      },
      { capture: true },
    );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tool) {
      e.preventDefault();
      finish();
    }
  });
  const position = (e) => {
    const r = viewport.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const pick = (point) =>
    gateway.send("queryGeometry", {
      kind: "screenPick",
      query: { camera: viewport.camera(), point },
      viewRevision: viewport.viewRevision,
    });
  const snap = (point) =>
    gateway.send("queryGeometry", {
      kind: "snap",
      query: {
        position: viewport.pointAt(...point),
        tolerance: 8 / viewport.factor,
        features: true,
        grid: viewport.gridSpacing,
        plane: viewport.plane,
      },
      viewRevision: viewport.viewRevision,
    });
  const geometryIds = () =>
    [...viewport.selection].filter(
      (id) =>
        getProject().nodes.some((n) => n.id === id) ||
        getProject().members.some((m) => m.id === id),
    );
  async function previewDelete() {
    const ids = geometryIds();
    if (!ids.length) {
      $("#placement-help").textContent =
        "Select a node or member, then use Delete. Assignments can be deleted from Properties.";
      return;
    }
    const p = getProject(),
      token = epoch;
    const candidate = {
      id: uid("c"),
      type: "DeleteGeometry",
      args: { ids, cascade: true },
    };
    try {
      const preview = await gateway.send("queryGeometry", {
        kind: "commandPreview",
        query: { command: candidate },
        viewRevision: viewport.viewRevision,
      });
      if (token !== epoch || getProject() !== p) return;
      $("#placement-help").textContent =
        "Delete " +
        ["nodes", "members", "supports", "loads"]
          .map((k) => `${p[k].length - preview.project[k].length} ${k}`)
          .join(", ") +
        ". Undo restores them.";
      $("#placement-confirm").hidden = false;
      $("#placement-confirm").onclick = async () => {
        if (!canEdit() || getProject() !== p) return;
        if (
          geometryIds().slice().sort().join(",") !==
          ids.slice().sort().join(",")
        ) {
          message(
            "Selection changed. Choose Delete again to review the affected objects.",
          );
          return;
        }
        try {
          await command(candidate.type, candidate.args, candidate.id);
          finish();
        } catch (e) {
          message(e.message);
        }
      };
    } catch (e) {
      message(e.message);
    }
  }
  async function place(point, end = point) {
    if (pending || !tool || !canEdit()) return;
    if (!viewport.origin || !Number.isFinite(viewport.factor)) {
      message(
        "Wait for the model viewport to be ready, or use the model table.",
      );
      return;
    }
    pending = true;
    const token = epoch,
      p = getProject(),
      mode = tool,
      revision = p.revision;
    const settings = {
      preset: $("#support-preset").value,
      magnitude: Number($("#placement-magnitude").value),
      loadCase: $("#placement-case").value,
    };
    try {
      const hit = await pick(point);
      if (token !== epoch || getProject() !== p || p.revision !== revision)
        return;
      const node = p.nodes.find((n) => n.id === hit.entityId),
        member = p.members.find((m) => m.id === hit.entityId);
      if (mode === "place-node") {
        if (viewport.mode === "3d") {
          message(
            "Choose Plan or Elevation to place nodes on the working plane.",
          );
          return;
        }
        const s = await snap(point);
        if (token !== epoch || getProject() !== p) return;
        if (s.kind === "node" && s.entityId) {
          selectEntities([s.entityId]);
          return;
        }
        const id = uid("n");
        await command("AddNode", { id, position: s.position });
        selectEntities([id]);
      } else if (mode === "place-support") {
        if (!node) {
          message("Place supports on a node.");
          return;
        }
        const existing = p.supports.find((s) => s.node === node.id);
        if (existing) {
          finish();
          selectEntities([existing.id]);
          inspect();
          message("This node already has a support. Edit its properties.");
          return;
        }
        const preset = settings.preset,
          planar = p.analysisMode === "planarXZ";
        const fixed =
          preset === "roller"
            ? [false, false, true, false, false, false]
            : preset === "pinned"
              ? [true, !planar, true, false, false, false]
              : [true, !planar, true, !planar, true, !planar];
        const id = uid("s");
        await command("SetSupport", {
          id,
          node: node.id,
          fixed,
          prescribed: Array(6).fill(0),
          existence: "create",
        });
        selectEntities([id]);
      } else if (mode === "place-load") {
        if (!node && !member) {
          message(
            "Start a load on a node (point force) or member (uniform load).",
          );
          return;
        }
        const magnitude = settings.magnitude;
        if (!Number.isFinite(magnitude) || magnitude <= 0) {
          message("Enter a positive load magnitude.");
          return;
        }
        const dx = end[0] - point[0],
          dy = end[1] - point[1],
          length = Math.hypot(dx, dy),
          basis = viewport.basis();
        const direction =
          length >= 8
            ? basis[0].map((v, i) => (v * dx - basis[1][i] * dy) / length)
            : [0, 0, -1];
        const vector = direction.map(
            (v) => `${v * magnitude} ${node ? "kN" : "kN/m"}`,
          ),
          id = uid("l");
        const load = node
          ? {
              id,
              case: settings.loadCase,
              type: "nodal",
              node: node.id,
              values: [...vector, 0, 0, 0],
            }
          : {
              id,
              case: settings.loadCase,
              type: "uniform",
              member: member.id,
              axes: "global",
              forcePerLength: vector,
            };
        await command("SetLoad", { ...load, existence: "create" });
        selectEntities([id]);
      } else if (mode === "measure") {
        if (!node) {
          message("Click a node to measure.");
          return;
        }
        if (!base) {
          base = node.id;
          $("#placement-help").textContent =
            `Start ${entityLabel(getProject(), node.id)}. Click the end node.`;
        } else {
          const v = await gateway.send("queryGeometry", {
            kind: "measure",
            query: { start: base, end: node.id },
            viewRevision: viewport.viewRevision,
          });
          if (token !== epoch) return;
          $("#placement-help").textContent =
            `${entityLabel(getProject(), base)} → ${entityLabel(getProject(), node.id)}: ${Number(v.distance.toPrecision(10))} m · Δ [${v.delta.map((x) => Number(x.toPrecision(8))).join(", ")}] m`;
          base = null;
        }
      } else if (mode === "move" || mode === "copy") {
        if (viewport.mode === "3d") {
          message(
            "Use a planar view for point-to-point edits; exact 3D offsets are available in Edit selection.",
          );
          return;
        }
        if (!geometryIds().length) {
          if (hit.entityId) selectEntities([hit.entityId]);
          else {
            message("Select geometry first.");
            return;
          }
        }
        const s = await snap(point);
        if (token !== epoch || getProject() !== p) return;
        if (!base) {
          base = s.position;
          viewport.preview = [base, base];
          $("#placement-help").textContent =
            "Click destination; Escape cancels.";
        } else {
          const candidate = {
            id: uid("c"),
            type: mode === "move" ? "MoveNodes" : "CopySelection",
            args: {
              ids: geometryIds(),
              delta: s.position.map((v, i) => v - base[i]),
              connectToExisting: false,
              cascade: true,
            },
          };
          await gateway.send("queryGeometry", {
            kind: "commandPreview",
            query: { command: candidate },
            viewRevision: viewport.viewRevision,
          });
          if (token !== epoch || getProject() !== p) return;
          await command(candidate.type, candidate.args, candidate.id);
          base = null;
          viewport.preview = null;
          viewport.draw();
          $("#placement-help").textContent = help[mode];
        }
      } else if (mode === "split") {
        if (!member) {
          message("Click the interior of a member.");
          return;
        }
        const a = viewport.projectPoint(
            p.nodes.find((n) => n.id === member.start).position,
          ),
          b = viewport.projectPoint(
            p.nodes.find((n) => n.id === member.end).position,
          ),
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          den = dx * dx + dy * dy;
        const station = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / den;
        if (!Number.isFinite(station) || station <= 0.001 || station >= 0.999) {
          message("Choose a point away from the member endpoints.");
          return;
        }
        const candidate = {
          id: uid("c"),
          type: "SplitMember",
          args: { id: member.id, stations: [station] },
        };
        await gateway.send("queryGeometry", {
          kind: "topologyPreview",
          query: { command: candidate },
          viewRevision: viewport.viewRevision,
        });
        if (token !== epoch || getProject() !== p) return;
        await command(candidate.type, candidate.args, candidate.id);
      } else if (mode === "delete") {
        if (hit.entityId) selectEntities([hit.entityId]);
        await previewDelete();
      }
    } catch (e) {
      message(e.message);
    } finally {
      pending = false;
      viewport.preview = null;
      viewport.draw();
    }
  }
  viewport.canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (!tool || e.button !== 0 || e.altKey || spaceHeld || !canEdit())
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      viewport.canvas.focus();
      if (tool === "place-load") {
        drag = { start: position(e), token: epoch };
        viewport.canvas.setPointerCapture(e.pointerId);
      } else enqueue(position(e));
    },
    { capture: true },
  );
  viewport.canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      const r = viewport.canvas.getBoundingClientRect();
      viewport.loadDraft = {
        start: drag.start,
        end: [e.clientX - r.left, e.clientY - r.top],
      };
      viewport.draw();
    } else if (base && Array.isArray(base) && tool) {
      viewport.preview = [base, viewport.pointAt(...position(e))];
      viewport.draw();
    }
  });
  viewport.canvas.addEventListener(
    "pointerup",
    (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      viewport.loadDraft = null;
      viewport.draw();
      e.preventDefault();
      e.stopImmediatePropagation();
      if (d.token === epoch) enqueue(d.start, position(e));
    },
    { capture: true },
  );
  viewport.canvas.addEventListener("pointercancel", () => {
    drag = null;
    viewport.loadDraft = null;
    viewport.draw();
  });
  $("#viewport-labels").removeAttribute("aria-hidden");
  $("#viewport-labels").addEventListener("click", (e) => {
    const b = e.target.closest("[data-assignment]");
    if (!b) return;
    finish();
    selectEntities([b.dataset.assignment]);
    inspect();
  });
  $("#viewport-labels").addEventListener("contextmenu", (e) => {
    const b = e.target.closest("[data-assignment]");
    if (!b) return;
    e.preventDefault();
    finish();
    selectEntities([b.dataset.assignment]);
    inspect();
  });
  viewport.onDelete = () => {
    const id = [...viewport.selection][0];
    if (
      getProject().supports.some((s) => s.id === id) ||
      getProject().loads.some((l) => l.id === id)
    ) {
      deleteAssignment(id);
      return;
    }
    activate("delete");
  };
  return { finish, activate };
}
