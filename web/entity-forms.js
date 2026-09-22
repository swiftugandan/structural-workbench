import { templatePicker } from "./model-templates.js";
import { escape as esc } from "./reports/report.js";
import { entityLabel } from "./entity-labels.js";

export const entityGuides = {
  nodes: [
    "Node",
    "Connection points",
    "Place a point where members meet, a support sits, or a force is applied.",
  ],
  members: [
    "Member",
    "Beams & columns",
    "Connect two points, then choose what the member is made of and its cross-section.",
  ],
  materials: [
    "Material",
    "What it is made of",
    "Material stiffness controls how much a member stretches and bends. These properties are shared by every member using this material.",
  ],
  sections: [
    "Section",
    "Cross-section properties",
    "The cross-section controls resistance to stretching, bending and twisting. Use properties from a verified section table.",
  ],
  supports: [
    "Support",
    "How the structure is held",
    "A support prevents movement at a point. Choose the movements it should stop.",
  ],
  loadCases: [
    "Load case",
    "Organise loads by cause",
    "Group loads that act together, such as permanent weight, occupancy or wind. A load case is a group; add the actual forces under Loads.",
  ],
  loads: [
    "Load",
    "Forces on your structure",
    "Choose where the load acts and how strongly it pushes. The diagram explains the direction signs.",
  ],
  combinations: [
    "Combination",
    "Loads acting together",
    "Combine load cases with multipliers. For example, 1.5 means one and a half times that case. Factors are your inputs, not automatic code rules.",
  ],
};
const svg = (body, title) =>
  `<svg viewBox="0 0 320 140" role="img" aria-label="${esc(title)}" class="input-diagram"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const text = (x, y, t) =>
  `<text x="${x}" y="${y}" fill="currentColor" stroke="none" font-size="13" font-family="inherit">${t}</text>`;
const arrow = (x, y, dx, dy) =>
  `<path d="M${x} ${y}l${dx} ${dy}"/><path d="M${x + dx - 5} ${y + dy + (dy < 0 ? 7 : -7)}l5 ${dy < 0 ? -7 : 7}l5 ${dy < 0 ? 7 : -7}"/>`;
function supportDiagram(kind) {
  const title = {
    fixed: "Fixed · movement and rotation held",
    pinned: "Pinned · rotation allowed",
    roller: "Roller · vertical movement held",
    custom: "Custom · see restrained directions",
  }[kind];
  const symbol =
    kind === "fixed"
      ? '<path d="M155 36v64m0-60-12 12m12 2-12 12m12 2-12 12m12 2-12 12"/>'
      : kind === "custom"
        ? '<circle cx="155" cy="60" r="17" stroke-dasharray="4 4"/>'
        : `<path d="M155 60l-22 30h44z"/>${kind === "roller" ? '<circle cx="144" cy="96" r="5"/><circle cx="166" cy="96" r="5"/>' : ""}<path d="M124 ${kind === "roller" ? 105 : 96}h62"/>`;
  return svg(
    `<path d="M155 60h118" stroke-width="6"/>${symbol}<circle cx="155" cy="60" r="4" fill="white"/>${text(20, 24, title)}${text(22, 132, "Support symbol · schematic")}`,
    title,
  );
}
export function guideDiagram(key) {
  if (key === "nodes")
    return svg(
      `<path d="M95 105H260m-8-6 8 6-8 6M95 105V20m-6 8 6-8 6 8M95 105l-45 25m5-9-5 9 11 0"/><circle cx="95" cy="105" r="4" fill="currentColor"/>${text(264, 110, "+X")}${text(100, 22, "+Z · up")}${text(18, 132, "+Y")}${text(115, 84, "Origin (0, 0, 0)")}`,
      "Global axes: X and Y horizontal, Z upward. Coordinates are measured from the origin.",
    );
  if (key === "members")
    return svg(
      `<path d="M45 76H275" stroke-width="8"/><circle cx="45" cy="76" r="7" fill="white"/><circle cx="275" cy="76" r="7" fill="white"/>${text(22, 112, "Start point")}${text(228, 112, "End point")}${text(108, 43, "Beam or column")}`,
      "A member connects a start point and an end point.",
    );
  if (key === "supports")
    return svg(
      `<path d="M30 55h260M145 55l-22 35h44zM112 102h66m-56 0-8 10m23-10-8 10m23-10-8 10m23-10-8 10"/><circle cx="145" cy="55" r="5" fill="white"/>${text(20, 30, "Member")}${text(192, 92, "Supported point")}`,
      "Example pinned support below a member. Choose a support type below.",
    );
  if (key === "loads")
    return svg(
      `<path d="M30 102h260" stroke-width="6"/>${arrow(95, 25, 0, 62)}${arrow(165, 25, 0, 62)}${arrow(235, 25, 0, 62)}${text(20, 128, "Downward = negative global Z")}`,
      "Example downward load: negative Z in global coordinates. Local load components use the member axes instead.",
    );
  if (key === "sections")
    return svg(
      `<path d="M112 25h96v17h-37v56h37v17h-96V98h37V42h-37z" fill="#dce9ff"/><path d="M80 70h160m-80 60V10" stroke-dasharray="4 4"/>${text(244, 74, "y")}${text(166, 15, "z")}${text(12, 132, "Illustration only · use your section’s properties")}`,
      "Illustrative I section with local y and z axes through its centre, not a preview of the entered properties.",
    );
  if (key === "materials")
    return svg(
      `<path d="M55 52h190v36H55zM55 45v51m-8-42-8 8m8 5-8 8m8 5-8 8M245 70h48m-8-6 8 6-8 6"/><path d="M265 47v46" stroke-dasharray="4 4"/>${text(75, 30, "Stiffness resists deformation")}${text(80, 121, "Higher E → less stretching")}`,
      "A bar stretching under force. Higher elastic modulus means less deformation under the same load.",
    );
  return svg(
    `<rect x="12" y="43" width="85" height="49" rx="7"/><rect x="123" y="43" width="85" height="49" rx="7"/>${text(22, 73, "Case A")}${text(101, 73, "+")}${text(133, 73, "Case B")}${text(218, 73, "= total")}${text(19, 117, key === "combinations" ? "Multiply each case, then add together" : "Keep different causes in separate cases")}`,
    "Separate load cases can be multiplied and added in a combination.",
  );
}
const help = (s) => `<p class="form-help full">${s}</p>`;
const group = (title, content) =>
  `<fieldset class="full guided-group"><legend>${title}</legend><div class="entity-form">${content}</div></fieldset>`;
const advanced = (title, content, open = false) =>
  `<details class="full guided-advanced" ${open ? "open" : ""}><summary>${title}</summary><div class="entity-form">${content}</div></details>`;
const field = (name, title, value, unit = "", scale = 1, description = "") =>
  `<label>${esc(title)}${unit ? ` <span class="field-unit">${unit}</span>` : ""}<input name="${name}" value="${esc(typeof value === "number" ? Number((value / scale).toPrecision(12)) : (value ?? ""))}" ${typeof value === "number" ? 'inputmode="decimal"' : ""} ${["name", "provenance"].includes(name) ? 'maxlength="256"' : ""} required data-unit="${unit}" data-original="${esc(value ?? "")}" data-initial="${esc(typeof value === "number" ? Number((value / scale).toPrecision(12)) : (value ?? ""))}">${description ? `<small>${description}</small>` : ""}</label>`;
const check = (name, title, checked) =>
  `<label class="check-label"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}>${esc(title)}</label>`;
const select = (name, title, value, options) =>
  `<label>${title}<select name="${name}" required>${options.map(([id, t]) => `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
const axes = ["X", "Y", "Z"];
const restrained = [
  "Stop movement along X",
  "Stop movement along Y",
  "Stop movement along Z",
  "Stop rotation about X",
  "Stop rotation about Y",
  "Stop rotation about Z",
];
const directionOptions = [
  ["2:-1", "Down · −Z"],
  ["2:1", "Up · +Z"],
  ["0:1", "Along +X"],
  ["0:-1", "Along −X"],
  ["1:1", "Along +Y"],
  ["1:-1", "Along −Y"],
  ["custom", "Custom components"],
];
function loadQuick(entity) {
  const values = (entity.values || entity.forcePerLength).slice(0, 3);
  const nonzero = values
    .map((v, i) => (v !== 0 ? i : -1))
    .filter((i) => i >= 0);
  const index = nonzero[0] ?? 2;
  const direction =
    nonzero.length > 1
      ? "custom"
      : `${index}:${Math.sign(values[index]) || -1}`;
  return group(
    "Direction & size",
    select("quick-direction", "Load direction", direction, directionOptions) +
      `<label>Magnitude <span class="field-unit">${entity.forcePerLength ? "kN/m" : "kN"}</span><input name="quick-magnitude" type="number" min="0" step="any" required value="${Math.abs(values[index]) / 1000}" ${direction === "custom" ? "disabled" : ""}><small>Enter a positive size; direction sets the sign.</small></label><div class="full" data-load-preview></div>`,
  );
}
export function entityFields(key, entity, project, { compact = false } = {}) {
  const label = (id) => entityLabel(project, id);
  const ref = (name, title, collection, value = entity[name]) =>
    select(
      name,
      title,
      value,
      project[collection].map((v) => [
        v.id,
        `${v.name || label(v.id)}${v.position ? ` · (${v.position.join(", ")}) m` : v.start ? ` · ${label(v.start)} → ${label(v.end)}` : ""}`,
      ]),
    );
  const values = (name, count, moment = false) =>
    Array.from({ length: count }, (_, i) =>
      field(
        `${name}-${i}`,
        `${i >= 3 ? "Moment about" : "Force along"} ${axes[i % 3]}`,
        entity[name][i],
        i >= 3 ? "kNm" : moment ? "kN/m" : "kN",
        1000,
      ),
    ).join("");
  let content = "";
  if (key === "nodes")
    content =
      group(
        "Position from the origin",
        axes
          .map((a, i) =>
            field(
              `position-${i}`,
              `${a}${i === 2 ? " · height" : ""}`,
              entity.position[i],
              "m",
            ),
          )
          .join(""),
      ) +
      help(
        "X and Y are horizontal; positive Z is upward. Enter a unit suffix to use another unit, for example <b>250 mm</b>.",
      );
  if (key === "members")
    content =
      group(
        "1 · Connect two points",
        ref("start", "Start point", "nodes") + ref("end", "End point", "nodes"),
      ) +
      group(
        "2 · Choose member properties",
        ref("material", "Material", "materials") +
          ref("section", "Cross-section", "sections"),
      ) +
      advanced(
        "Member orientation & connections",
        help(
          "Local x runs from start to end. This reference vector sets the local y direction; it must not be parallel to the member.",
        ) +
          axes
            .map((a, i) =>
              field(
                `localY-${i}`,
                `Local y reference · ${a}`,
                entity.localY[i],
              ),
            )
            .join("") +
          help(
            "Ends transfer bending moments. Hinged member-end releases are not yet supported by the solver. A pinned support is a separate setting.",
          ),
      );
  if (key === "materials")
    content =
      field("name", "Material name", entity.name) +
      field(
        "E",
        "Elastic stiffness · E",
        entity.E,
        "GPa",
        1e9,
        "Higher stiffness means less deformation.",
      ) +
      field(
        "nu",
        "Poisson ratio · ν",
        entity.nu,
        "",
        1,
        "Sideways contraction when stretched; must be between −1 and 0.5.",
      ) +
      field(
        "density",
        "Mass density",
        entity.density,
        "kg/m³",
        1,
        "Used when you explicitly add a self-weight load.",
      );
  if (key === "sections")
    content =
      field("name", "Section name", entity.name) +
      field("provenance", "Property source", entity.provenance) +
      group(
        "Resistance to stretching & bending",
        field("A", "Cross-sectional area · A", entity.A, "mm²", 1e-6) +
          field(
            "Iy",
            "Second moment about local y · Iy",
            entity.Iy,
            "mm⁴",
            1e-12,
          ) +
          field(
            "Iz",
            "Second moment about local z · Iz",
            entity.Iz,
            "mm⁴",
            1e-12,
          ) +
          field("J", "Torsion constant · J", entity.J, "mm⁴", 1e-12),
      ) +
      advanced(
        "Extreme-fibre distances",
        help(
          "Distance from the centroid to the outermost fibre in each direction. These are distances, not the full width and depth.",
        ) +
          field("cy", "Distance along local y · cy", entity.cy, "mm", 0.001) +
          field("cz", "Distance along local z · cz", entity.cz, "mm", 0.001),
      ) +
      help(
        "These properties are shared by all members assigned to this section. The sketch is illustrative; it does not calculate section properties.",
      );
  if (key === "supports")
    content =
      (!compact ? ref("node", "Supported point", "nodes") : "") +
      group(
        "Choose how this point is held",
        `<div class="support-choices full">${[
          ["fixed", "Fixed", "Stops movement and rotation"],
          ["pinned", "Pinned", "Stops movement; allows rotation"],
          ["roller", "Roller · Z", "Stops only vertical movement"],
        ]
          .map(
            ([v, t, h]) =>
              `<button type="button" data-support-preset="${v}" aria-pressed="false"><span class="support-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${v === "fixed" ? '<path d="M16 4v23M16 9h12M16 5l-6 6m6 2-6 6m6 2-6 6"/>' : `<path d="M16 5L6 21h20zM4 29h24"/>${v === "roller" ? '<circle cx="10" cy="25" r="3"/><circle cx="22" cy="25" r="3"/>' : '<path d="M8 22l-4 5m12-5-4 5m12-5-4 5"/>'}`}</svg></span><strong>${t}</strong><small>${h}</small></button>`,
          )
          .join(
            "",
          )}</div><p class="form-help full" data-support-summary aria-live="polite"></p>`,
      ) +
      advanced(
        "Custom movement restraints",
        entity.fixed
          .map((v, i) => check(`fixed-${i}`, restrained[i], v))
          .join("") +
          help(
            project.analysisMode === "planarXZ"
              ? "Planar XZ analysis also prevents Y movement and X/Z rotation throughout the model. Presets below affect the active X, Z and Ry freedoms."
              : "In 3D, a roller restraining Z still permits X and Y movement. The whole structure needs sufficient supports to remain stable.",
          ),
      ) +
      advanced(
        "Support settlement or imposed rotation",
        help(
          "Usually zero. A nonzero value prescribes movement in a restrained direction; use this for a known support settlement.",
        ) +
          entity.prescribed
            .map((v, i) =>
              field(
                `prescribed-${i}`,
                i < 3
                  ? `Movement along ${axes[i]}`
                  : `Rotation about ${axes[i - 3]}`,
                v,
                i < 3 ? "m" : "rad",
              ),
            )
            .join(""),
        entity.prescribed.some((v) => v !== 0),
      );
  if (key === "loadCases")
    content =
      field("name", "Case name", entity.name) +
      select("category", "Cause of loading", entity.category, [
        ["dead", "Permanent · structure and fixed finishes"],
        ["live", "Variable · people and movable contents"],
        ["wind", "Wind"],
        ["other", "Other"],
      ]) +
      help(
        "Example names: “Roof self-weight” or “Wind from the left”. Selecting Permanent does not automatically add self-weight.",
      );
  if (key === "loads") {
    content =
      ref("case", "Load case", "loadCases") +
      (!compact
        ? select("type", "How does the load act?", entity.type, [
            ["nodal", "At a point · force or moment"],
            ["uniform", "Along a member · evenly distributed"],
            ["selfWeight", "Self-weight · calculated from density"],
            ...(entity.type === "point"
              ? [["point", "Interior point load · unsupported"]]
              : []),
          ])
        : "");
    if (entity.node) content += ref("node", "Loaded point", "nodes");
    if (entity.member) content += ref("member", "Loaded member", "members");
    if (entity.axes)
      content += select("axes", "Direction reference", entity.axes, [
        ["global", "Global · fixed building axes"],
        ["local", "Local · axes of this member"],
      ]);
    if (entity.values)
      content +=
        loadQuick(entity) +
        advanced("Force components · custom direction", values("values", 3)) +
        advanced(
          "Applied moments",
          entity.values
            .slice(3)
            .map((v, i) =>
              field(
                `values-${i + 3}`,
                `Moment about ${axes[i]}`,
                v,
                "kNm",
                1000,
              ),
            )
            .join(""),
          entity.values.slice(3).some((v) => v !== 0),
        );
    if (entity.forcePerLength)
      content +=
        loadQuick(entity) +
        advanced(
          "Force components · custom direction",
          values("forcePerLength", 3, true),
        );
    if (entity.type === "selfWeight")
      content +=
        group(
          "Members carrying self-weight",
          project.members
            .map((m) =>
              check(
                `weight-${m.id}`,
                `${label(m.id)} · ${label(m.start)} → ${label(m.end)}`,
                entity.members.includes(m.id),
              ),
            )
            .join(""),
        ) +
        field("factor", "Self-weight multiplier", entity.factor) +
        help(
          `Uses material density, section area and project gravity [${project.gravity.join(", ")}] m/s². A factor of 1 applies full self-weight.`,
        );
    if (entity.station !== undefined)
      content +=
        field(
          "station",
          "Position along member · 0 = start, 1 = end",
          entity.station,
        ) +
        help(
          "Interior point actions are not supported. Split the member and apply a load at the new point.",
        );
    content += help(
      "Global −Z acts downward: enter <b>−10</b> in Force along Z for 10 kN downward. For a local load, signs follow the member’s local axes, not the building axes.",
    );
  }
  if (key === "combinations")
    content =
      field("name", "Combination name", entity.name) +
      select("purpose", "Purpose", entity.purpose, [
        ["analysis", "Analysis"],
        ["service", "Serviceability"],
        ["strength", "Strength"],
      ]) +
      group(
        "Include cases and set their multipliers",
        project.loadCases
          .map(
            (c) =>
              `<div class="combination-row full">${check(
                `include-${c.id}`,
                c.name,
                entity.terms.some((t) => t.case === c.id),
              )}${field(`factor-${c.id}`, `Multiplier · ${c.name}`, entity.terms.find((t) => t.case === c.id)?.factor ?? 1)}</div>`,
          )
          .join(""),
      ) +
      help(
        "Only checked cases are included. Choose factors appropriate to your design basis. The purpose label does not perform a code-compliance check.",
      );
  return `<div class="entity-guide full">${["sections", "materials", "loads"].includes(key) ? "" : guideDiagram(key)}<div><span class="guide-eyebrow">${esc(entityGuides[key][1])}</span><p>${esc(entityGuides[key][2])}</p></div></div>${compact ? "" : templatePicker(key, entity)}${content}`;
}
export function readEntityFields(form, key, entity, project) {
  const data = new FormData(form),
    value = structuredClone(entity);
  const get = (name) => {
    const el = form.elements.namedItem(name);
    if (!el) return undefined;
    const raw = String(data.get(name) ?? "")
      .trim()
      .replace(/^−/, "-");
    if (el.dataset.initial === raw && el.dataset.original !== undefined)
      return el.dataset.original;
    return el.dataset.unit &&
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)
      ? `${raw} ${el.dataset.unit}`
      : raw;
  };
  for (const k of Object.keys(entity)) {
    if (
      [
        "id",
        "releaseStart",
        "releaseEnd",
        "parentMemberId",
        "stationRange",
      ].includes(k)
    )
      continue;
    if (k === "terms") {
      value.terms = project.loadCases
        .filter((c) => data.has(`include-${c.id}`))
        .map((c) => ({ case: c.id, factor: Number(get(`factor-${c.id}`)) }));
      if (!value.terms.length) throw Error("Choose at least one load case.");
      if (value.terms.some((t) => !Number.isFinite(t.factor)))
        throw Error("Each multiplier must be a finite number.");
    } else if (k === "members") {
      value.members = project.members
        .filter((m) => data.has(`weight-${m.id}`))
        .map((m) => m.id);
      if (!value.members.length)
        throw Error("Choose at least one member for self-weight.");
    } else if (Array.isArray(entity[k]))
      value[k] = entity[k].map((v, i) =>
        typeof v === "boolean" ? data.has(`${k}-${i}`) : get(`${k}-${i}`),
      );
    else if (get(k) !== undefined)
      value[k] = ["station"].includes(k) ? Number(get(k)) : get(k);
  }
  if (key === "members" && value.start === value.end)
    throw Error("Choose two different points for the start and end.");
  if (
    key === "sections" &&
    ["A", "Iy", "Iz", "J", "cy", "cz"].some(
      (k) =>
        form.elements.namedItem(k)?.value.trim() !==
        form.elements.namedItem(k)?.dataset.initial,
    ) &&
    value.provenance === entity.provenance &&
    !value.provenance.startsWith("Modified from ")
  )
    value.provenance = "Modified from " + value.provenance;
  return value;
}
export function bindEntityFields(form, key, project) {
  if (key === "loads" && form.elements.namedItem("quick-direction")) {
    const direction = form.elements.namedItem("quick-direction"),
      magnitude = form.elements.namedItem("quick-magnitude");
    const prefix = form.elements.namedItem("values-0")
      ? "values"
      : "forcePerLength";
    const components = axes.map((_, i) =>
      form.elements.namedItem(`${prefix}-${i}`),
    );
    const preview = () => {
      const local = form.elements.namedItem("axes")?.value === "local";
      for (const option of direction.options) {
        const base = directionOptions.find(([value]) => value === option.value);
        option.textContent =
          local && option.value !== "custom"
            ? `Along local ${option.value.endsWith("-1") ? "−" : "+"}${axes[Number(option.value[0])]}`
            : base[1];
      }
      const [axis, sign] = direction.value.split(":").map(Number);
      const name =
        direction.value === "custom"
          ? "Custom components"
          : `${sign < 0 ? "−" : "+"}${axes[axis]}`;
      const angle =
        axis === 2
          ? sign < 0
            ? 90
            : -90
          : axis === 0
            ? sign < 0
              ? 180
              : 0
            : sign < 0
              ? -40
              : 140;
      form.querySelector("[data-load-preview]").innerHTML =
        direction.value === "custom"
          ? help(
              "Edit the components below. The force may act in more than one direction.",
            )
          : svg(
              `<g transform="translate(160 65) rotate(${angle})"><path d="M-55 0H55m-13-9 13 9-13 9" stroke-width="4"/></g>${text(45, 125, `${local ? "Local member" : "Global"} ${name} · ${esc(magnitude.value)} ${prefix === "values" ? "kN" : "kN/m"}`)}`,
              `${local ? "Local" : "Global"} ${name} load direction`,
            );
      if (local)
        form
          .querySelector("[data-load-preview]")
          .insertAdjacentHTML(
            "beforeend",
            help(
              "Schematic member-axis direction. Local Z is not necessarily vertical.",
            ),
          );
    };
    const apply = () => {
      magnitude.disabled = direction.value === "custom";
      if (direction.value === "custom")
        components[0].closest("details").open = true;
      else if (
        magnitude.value !== "" &&
        Number.isFinite(Number(magnitude.value))
      ) {
        const [axis, sign] = direction.value.split(":").map(Number);
        components.forEach(
          (el, i) =>
            (el.value =
              i === axis ? String(sign * Number(magnitude.value)) : "0"),
        );
      }
      preview();
    };
    direction.addEventListener("change", apply);
    magnitude.addEventListener("input", apply);
    form.elements.namedItem("axes")?.addEventListener("change", preview);
    for (const component of components)
      component.addEventListener("input", () => {
        direction.value = "custom";
        magnitude.disabled = true;
        preview();
      });
    preview();
  }
  if (key !== "supports") return;
  const controls = Array.from({ length: 6 }, (_, i) =>
    form.elements.namedItem(`fixed-${i}`),
  );
  const active =
    project.analysisMode === "planarXZ" ? [0, 2, 4] : [0, 1, 2, 3, 4, 5];
  const presets = {
    fixed: active.map(() => true),
    pinned: active.map((i) => i < 3),
    roller: active.map((i) => i === 2),
  };
  const update = () => {
    const current = active.map((i) => controls[i].checked);
    let title = "Custom",
      kind = "custom";
    for (const b of form.querySelectorAll("[data-support-preset]")) {
      const match = presets[b.dataset.supportPreset].every(
        (v, i) => v === current[i],
      );
      b.setAttribute("aria-pressed", String(match));
      if (match) {
        title = b.querySelector("strong").textContent;
        kind = b.dataset.supportPreset;
      }
    }
    form.querySelector(".entity-guide svg").outerHTML = supportDiagram(kind);
    form.querySelector("[data-support-summary]").textContent = `${title} · ${
      active
        .filter((i) => controls[i].checked)
        .map((i) => (i < 3 ? `${axes[i]} movement` : `${axes[i - 3]} rotation`))
        .join(", ") || "no active movements"
    } restrained.`;
  };
  for (const b of form.querySelectorAll("[data-support-preset]"))
    b.onclick = () => {
      active.forEach(
        (i, j) => (controls[i].checked = presets[b.dataset.supportPreset][j]),
      );
      update();
      form.dispatchEvent(new Event("input", { bubbles: true }));
    };
  controls.forEach((c) => c.addEventListener("change", update));
  update();
}
