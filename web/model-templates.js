import { escape as esc } from "./reports/report.js";

const orange = "https://orangebook.arcelormittal.com/node/6";
const blue = (family) =>
  `https://www.steelforlifebluebook.co.uk/hf${family}/ec3-ukna/section-properties-dimensions-properties`;
// Published, rounded catalogue properties in SI. This is input data, not a section calculator.
export const sectionTemplates = [
  {
    key: "ipe200",
    family: "i",
    title: "IPE 200",
    dimensions: "200 × 100 mm · web 5.6 · flange 8.5",
    source: orange,
    values: {
      name: "IPE 200",
      A: 0.00285,
      Iy: 0.0000194,
      Iz: 0.00000142,
      J: 0.0000000692,
      cy: 0.05,
      cz: 0.1,
      provenance: "ArcelorMittal Orange Book · IPE 200 · catalogue properties",
    },
  },
  {
    key: "ipe300",
    family: "i",
    title: "IPE 300",
    dimensions: "300 × 150 mm · web 7.1 · flange 10.7",
    source: orange,
    values: {
      name: "IPE 300",
      A: 0.00538,
      Iy: 0.0000836,
      Iz: 0.00000604,
      J: 0.000000199,
      cy: 0.075,
      cz: 0.15,
      provenance: "ArcelorMittal Orange Book · IPE 300 · catalogue properties",
    },
  },
  {
    key: "shs100x5",
    family: "shs",
    title: "SHS 100 × 100 × 5",
    dimensions: "100 × 100 mm · wall 5 mm",
    source: blue("shs"),
    values: {
      name: "SHS 100 × 100 × 5 · hot-finished",
      A: 0.00187,
      Iy: 0.00000279,
      Iz: 0.00000279,
      J: 0.00000439,
      cy: 0.05,
      cz: 0.05,
      provenance: "SCI Blue Book · hot-finished SHS 100×100×5 · EN 10210-2",
    },
  },
  {
    key: "shs100x63",
    family: "shs",
    title: "SHS 100 × 100 × 6.3",
    dimensions: "100 × 100 mm · wall 6.3 mm",
    source: blue("shs"),
    values: {
      name: "SHS 100 × 100 × 6.3 · hot-finished",
      A: 0.00232,
      Iy: 0.00000336,
      Iz: 0.00000336,
      J: 0.00000534,
      cy: 0.05,
      cz: 0.05,
      provenance: "SCI Blue Book · hot-finished SHS 100×100×6.3 · EN 10210-2",
    },
  },
  {
    key: "rhs150x5",
    family: "rhs",
    title: "RHS 150 × 100 × 5",
    dimensions: "150 deep × 100 wide · wall 5 mm",
    source: blue("rhs"),
    values: {
      name: "RHS 150 × 100 × 5 · hot-finished",
      A: 0.00237,
      Iy: 0.00000739,
      Iz: 0.00000392,
      J: 0.00000807,
      cy: 0.05,
      cz: 0.075,
      provenance: "SCI Blue Book · hot-finished RHS 150×100×5 · EN 10210-2",
    },
  },
  {
    key: "rhs150x63",
    family: "rhs",
    title: "RHS 150 × 100 × 6.3",
    dimensions: "150 deep × 100 wide · wall 6.3 mm",
    source: blue("rhs"),
    values: {
      name: "RHS 150 × 100 × 6.3 · hot-finished",
      A: 0.00295,
      Iy: 0.00000898,
      Iz: 0.00000474,
      J: 0.00000986,
      cy: 0.05,
      cz: 0.075,
      provenance: "SCI Blue Book · hot-finished RHS 150×100×6.3 · EN 10210-2",
    },
  },
  {
    key: "chs114x5",
    family: "chs",
    title: "CHS 114.3 × 5",
    dimensions: "Outside diameter 114.3 mm · wall 5 mm",
    source: blue("chs"),
    values: {
      name: "CHS 114.3 × 5 · hot-finished",
      A: 0.00172,
      Iy: 0.00000257,
      Iz: 0.00000257,
      J: 0.00000514,
      cy: 0.05715,
      cz: 0.05715,
      provenance: "SCI Blue Book · hot-finished CHS 114.3×5 · EN 10210-2",
    },
  },
  {
    key: "chs114x63",
    family: "chs",
    title: "CHS 114.3 × 6.3",
    dimensions: "Outside diameter 114.3 mm · wall 6.3 mm",
    source: blue("chs"),
    values: {
      name: "CHS 114.3 × 6.3 · hot-finished",
      A: 0.00214,
      Iy: 0.00000313,
      Iz: 0.00000313,
      J: 0.00000625,
      cy: 0.05715,
      cz: 0.05715,
      provenance: "SCI Blue Book · hot-finished CHS 114.3×6.3 · EN 10210-2",
    },
  },
];
export const materialTemplates = [
  {
    key: "steel",
    title: "Structural steel",
    description: "E 210 GPa · 7,850 kg/m³",
    note: "Generic elastic steel properties. Steel grade and design strength are not assigned.",
    source:
      "https://steelconstruction.info/topics/design/steel-material-properties",
    values: {
      name: "Structural steel · linear elastic",
      E: 210e9,
      nu: 0.3,
      density: 7850,
    },
  },
  {
    key: "aluminium",
    title: "Aluminium",
    description: "E 70 GPa · 2,700 kg/m³",
    note: "Typical elastic aluminium properties. Alloy, temper and design strength are not assigned.",
    source:
      "https://doc.comsol.com/6.4/doc/com.comsol.help.models.nsm.die_forming/die_forming.html",
    values: {
      name: "Aluminium · linear elastic",
      E: 70e9,
      nu: 0.33,
      density: 2700,
    },
  },
  {
    key: "concrete",
    title: "Concrete C25/30",
    description: "E 31 GPa · uncracked",
    note: "Short-term, uncracked concrete with quartzite aggregate. Density defaults to 2,500 kg/m³. Cracking, creep, reinforcement and strength design are not included.",
    source:
      "https://www.concretecentre.com/TCC/media/TCCMediaLibrary/Events/Online%20course/CCIP_EC2_Bridges.pdf",
    values: {
      name: "Concrete C25/30 · uncracked",
      E: 31e9,
      nu: 0.2,
      density: 2500,
    },
  },
];
export const loadTemplates = [
  {
    key: "point",
    title: "Point force",
    description: "10 kN downward at a point",
    type: "nodal",
    values: [0, 0, -10000, 0, 0, 0],
  },
  {
    key: "memberPoint",
    title: "Interior point load",
    description: "10 kN downward at mid-member",
    type: "point",
    axes: "global",
    station: 0.5,
    values: [0, 0, -10000, 0, 0, 0],
  },
  {
    key: "uniform",
    title: "Uniform load",
    description: "1 kN/m downward along a member",
    type: "uniform",
    forcePerLength: [0, 0, -1000],
  },
  {
    key: "lateral",
    title: "Horizontal force",
    description: "10 kN along global +X",
    type: "nodal",
    values: [10000, 0, 0, 0, 0, 0],
  },
  {
    key: "uplift",
    title: "Uplift",
    description: "1 kN/m upward along a member",
    type: "uniform",
    forcePerLength: [0, 0, 1000],
  },
  {
    key: "moment",
    title: "Applied moment",
    description: "5 kNm about global +Y at a point",
    type: "nodal",
    values: [0, 0, 0, 0, 5000, 0],
  },
  {
    key: "selfWeight",
    title: "Self-weight",
    description: "From material density and gravity",
    type: "selfWeight",
  },
];
const familyNames = {
  i: "I-section",
  shs: "Square hollow",
  rhs: "Rectangular hollow",
  chs: "Circular hollow",
};
const wrap = (body, title, mini = false) =>
  `<svg class="template-diagram" viewBox="0 0 180 120" ${mini ? 'aria-hidden="true"' : `role="img" aria-label="${esc(title)}"`}><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const caption = (s) =>
  `<text x="90" y="111" text-anchor="middle" stroke="none" fill="currentColor" font-size="11" font-family="inherit">${s}</text>`;
function sectionDiagram(family, mini = false) {
  const shape = {
    i: '<path d="M65 14h50v10H96v60h19v10H65V84h19V24H65Z" fill="#dce9ff"/>',
    shs: '<rect x="50" y="14" width="80" height="80" rx="7" fill="#dce9ff"/><rect x="58" y="22" width="64" height="64" rx="4" fill="white"/>',
    rhs: '<rect x="63" y="14" width="54" height="80" rx="6" fill="#dce9ff"/><rect x="70" y="21" width="40" height="66" rx="3" fill="white"/>',
    chs: '<circle cx="90" cy="54" r="40" fill="#dce9ff"/><circle cx="90" cy="54" r="32" fill="white"/>',
  }[family];
  return wrap(
    shape +
      (!mini
        ? '<path d="M33 54h115M90 4v96" stroke-width="1" stroke-dasharray="4 4"/><text x="151" y="57" stroke="none" fill="currentColor" font-size="12">y</text><text x="94" y="10" stroke="none" fill="currentColor" font-size="12">z</text>' +
          caption("Local principal axes · schematic")
        : ""),
    familyNames[family] + " cross-section",
    mini,
  );
}
function loadDiagram(key, mini = false) {
  const down = (x) => `<path d="M${x} 20v49m-6-8 6 8 6-8"/>`;
  const body =
    key === "moment"
      ? '<path d="M112 66a28 28 0 1 0-44 0m-1-12 1 12 12-2"/><circle cx="90" cy="46" r="3"/>' +
        caption("Moment about Y")
      : key === "lateral"
        ? '<path d="M30 50h110m-9-7 9 7-9 7M90 83V42"/><circle cx="90" cy="50" r="3"/>' +
          caption("+X")
        : key === "uplift"
          ? '<path d="M30 83h120" stroke-width="4"/>' +
            [45, 90, 135]
              .map((x) => `<path d="M${x} 73V24m-6 8 6-8 6 8"/>`)
              .join("") +
            caption("+Z · upward")
          : '<path d="M30 83h120" stroke-width="4"/>' +
            (key === "point" || key === "memberPoint"
              ? down(90)
              : [45, 90, 135].map(down).join("")) +
            caption(
              key === "selfWeight" ? "ρ × area × gravity" : "−Z · downward",
            );
  return wrap(
    body,
    loadTemplates.find((t) => t.key === key)?.title || key,
    mini,
  );
}
function materialDiagram(key, mini = false) {
  const texture =
    key === "concrete"
      ? '<path d="m58 35 7-9 8 12Zm34 30 10-8 6 14ZM105 34l9-5 4 12Z"/><circle cx="65" cy="67" r="3"/><circle cx="90" cy="39" r="2"/>'
      : key === "steel"
        ? '<path d="m50 37 17-17m-17 37 37-37m-37 57 57-57m-44 65 64-64m-44 64 47-47m-27 47 27-27m-7 27 7-7" stroke-width="1"/>'
        : '<path d="M60 32h60M60 42h60M60 66h60M60 76h60" stroke-width="1"/>';
  return wrap(
    '<rect x="50" y="20" width="80" height="65" rx="2"/>' +
      texture +
      caption(materialTemplates.find((t) => t.key === key).title),
    key + " material schematic",
    mini,
  );
}
function matchSection(entity) {
  return sectionTemplates.find((t) =>
    ["A", "Iy", "Iz", "J", "cy", "cz"].every((k) => entity[k] === t.values[k]),
  );
}
function matchMaterial(entity) {
  return materialTemplates.find((t) =>
    ["E", "nu", "density"].every((k) => entity[k] === t.values[k]),
  );
}
export function templateGuide(key, entity) {
  const t =
    key === "sections"
      ? matchSection(entity)
      : key === "materials"
        ? matchMaterial(entity)
        : null;
  if (!t) return "";
  return `<div class="template-reference full">${key === "sections" ? sectionDiagram(t.family) : materialDiagram(t.key)}<strong>${esc(t.title)}</strong><small>${esc(t.dimensions || t.note)}</small><a href="${esc(t.source)}" target="_blank" rel="noopener noreferrer">Property reference ↗</a></div>`;
}
export function templatePicker(key, entity) {
  let cards = "",
    selected;
  const card = (id, title, description, diagram, pressed) =>
    `<button type="button" class="template-card" data-template="${id}" aria-pressed="${pressed}">${diagram}<strong>${esc(title)}</strong><small>${esc(description)}</small></button>`;
  if (key === "sections") {
    selected = matchSection(entity);
    cards = Object.entries(familyNames)
      .map(([family, title]) => {
        const first = sectionTemplates.find((t) => t.family === family);
        return card(
          first.key,
          title,
          first.title,
          sectionDiagram(family, true),
          selected?.family === family,
        );
      })
      .join("");
  }
  if (key === "materials") {
    selected = matchMaterial(entity);
    cards = materialTemplates
      .map((t) =>
        card(
          t.key,
          t.title,
          t.description,
          materialDiagram(t.key, true),
          selected?.key === t.key,
        ),
      )
      .join("");
  }
  if (key === "loads")
    cards = loadTemplates
      .map((t) =>
        card(t.key, t.title, t.description, loadDiagram(t.key, true), false),
      )
      .join("");
  if (!cards) return "";
  return `<details class="full template-library" open><summary>Start with a ${key === "sections" ? "section" : key === "materials" ? "material" : "load"} template</summary><p class="form-help">${key === "loads" ? "Example magnitudes: adjust these for your structure." : key === "sections" ? "Choose a shape, then a catalogue size. Material is assigned separately." : "Editable linear-elastic starting values; strength checks are separate."} Choosing a template replaces this form’s values. Save to apply.</p><div class="template-grid">${cards}</div>${
    selected && key === "sections"
      ? `<label class="template-size">Catalogue size<select data-template-size>${sectionTemplates
          .filter((t) => t.family === selected.family)
          .map(
            (t) =>
              `<option value="${t.key}" ${t.key === selected.key ? "selected" : ""}>${esc(t.title)}</option>`,
          )
          .join("")}</select></label>`
      : ""
  }</details>${key === "loads" ? "" : templateGuide(key, entity)}`;
}
export function bindTemplates(form, key, entity, project, onApply) {
  const apply = (id) => {
    if (key === "sections" || key === "materials") {
      const t = (
        key === "sections" ? sectionTemplates : materialTemplates
      ).find((t) => t.key === id);
      if (t) onApply({ ...entity, ...structuredClone(t.values) });
      return;
    }
    const t = loadTemplates.find((t) => t.key === id);
    if (!t) return;
    if (t.type !== "nodal" && !project.members.length) {
      form.querySelector("[role=alert]").textContent =
        "Add a member before applying this load template.";
      return;
    }
    const data = new FormData(form);
    const next = {
      id: entity.id,
      case: data.get("case") || entity.case,
      type: t.type,
    };
    if (t.type === "nodal")
      Object.assign(next, {
        node: data.get("node") || project.nodes.at(-1)?.id,
        values: [...t.values],
      });
    if (t.type === "uniform")
      Object.assign(next, {
        member: data.get("member") || project.members[0]?.id,
        axes: "global",
        forcePerLength: [...t.forcePerLength],
      });
    if (t.type === "point")
      Object.assign(next, {
        member: data.get("member") || project.members[0]?.id,
        axes: t.axes || "global",
        station: t.station ?? 0.5,
        values: [...t.values],
      });
    if (t.type === "selfWeight")
      Object.assign(next, {
        members: project.members.map((m) => m.id),
        factor: 1,
      });
    onApply(next);
  };
  form
    .querySelectorAll("[data-template]")
    .forEach((b) => (b.onclick = () => apply(b.dataset.template)));
  const sizes = form.querySelector("[data-template-size]");
  if (sizes) sizes.onchange = () => apply(sizes.value);
  // Editing a preset makes the draft custom; never leave a stale catalogue diagram or badge.
  form.addEventListener("input", (event) => {
    if (event.target.closest(".template-library")) return;
    form
      .querySelectorAll("[data-template]")
      .forEach((b) => b.setAttribute("aria-pressed", "false"));
    form.querySelector(".template-reference")?.remove();
    form.querySelector(".template-size")?.remove();
  });
}
