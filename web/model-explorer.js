import { renderMemberNav, physicalRootId } from "./hierarchy.js";

// Navigation-only organization of existing coordinates. This neither creates
// storeys nor assigns structural roles, connectivity, restraints or stiffness.
export function elevationGroups(project) {
  const nodes = new Map(project.nodes.map((n) => [n.id, n.position]));
  const roots = new Map();
  for (const member of project.members) {
    const key = physicalRootId(member);
    if (!roots.has(key)) roots.set(key, []);
    roots.get(key).push(member);
  }
  const levels = new Map();
  for (const members of roots.values()) {
    const first = members[0],
      a = nodes.get(first.start),
      b = nodes.get(first.end);
    const z = a && b ? Math.min(a[2], b[2]) : null;
    const type =
      !a || !b
        ? "Other members"
        : a[2] === b[2]
          ? "Beams"
          : a[0] === b[0] && a[1] === b[1]
            ? "Columns"
            : "Inclined members";
    if (!levels.has(z)) levels.set(z, new Map());
    const types = levels.get(z);
    if (!types.has(type)) types.set(type, []);
    types.get(type).push(...members);
  }
  return [...levels].sort(([a], [b]) => (b ?? -Infinity) - (a ?? -Infinity));
}

export function renderExplorer(
  project,
  { selected, label, esc, icon, openState, query = "" },
) {
  const branch = (key, title, body, count = "", open = true) =>
    `<details class="explorer-branch" data-branch="${esc(key)}" ${(openState.get(key) ?? open) || query ? "open" : ""}><summary><span>${esc(title)}</span>${count !== "" ? `<small>${count}</small>` : ""}</summary><div class="explorer-children">${body || '<p class="explorer-empty">None in this model</p>'}</div></details>`;
  const leaf = (key, e) =>
    `<button class="explorer-leaf ${selected === e.id ? "active" : ""}" data-entity-key="${key}" data-entity-id="${esc(e.id)}" ${selected === e.id ? 'aria-current="true"' : ""}><span class="nav-icon">${icon({ nodes: "node", supports: "support", loads: "load", materials: "material", sections: "section", loadCases: "loadCase", combinations: "combination" }[key])}</span><span>${esc(label(e.id))}</span><small>${esc(e.name || e.node || "")}</small></button>`;
  const manage = (key, title) =>
    `<button class="explorer-manage" data-group="${key}" aria-label="${title} ${project[key].length}">${esc(title)}<small>${project[key].length}</small><span aria-hidden="true">↗</span></button>`;
  const group = (key, title, open = true) =>
    branch(
      key,
      title,
      manage(key, title) + project[key].map((e) => leaf(key, e)).join(""),
      project[key].length,
      open,
    );
  const levels = elevationGroups(project)
    .map(([z, types]) =>
      branch(
        `level:${z}`,
        z === null
          ? "Unplaced"
          : `Elevation ${z.toLocaleString(undefined, { maximumFractionDigits: 8 })} m`,
        [...types]
          .map(([type, members]) =>
            branch(
              `level:${z}:${type}`,
              type,
              renderMemberNav(members, { selected, label, esc }),
              members.length,
            ),
          )
          .join(""),
      ),
    )
    .join("");
  const drafts = (kind, title) => {
    const items = (project.designPreviews || []).filter((d) => d.kind === kind);
    return branch(
      kind,
      title,
      items
        .map(
          (d) =>
            `<button class="explorer-leaf" data-preview="${esc(d.id)}"><span aria-hidden="true">▱</span><span>${esc(d.targetId ? label(d.targetId) : title.slice(0, -1))}</span><small>Mock · ${esc(d.id.slice(-6))}</small></button>`,
        )
        .join(""),
      items.length,
    );
  };
  return (
    branch(
      "structure",
      "Structure",
      branch(
        "levels",
        "Levels · derived",
        `<p class="explorer-note" title="Grouped by endpoint Z. Beam/column names describe orientation only, not authored storeys or structural design roles.">By elevation and orientation ⓘ</p>${levels}`,
        "",
        true,
      ) +
        manage("members", "Members") +
        group("nodes", "Nodes") +
        group("supports", "Supports") +
        branch(
          "drafts",
          "Design objects · mock",
          drafts("rcBeam", "RC beams") +
            drafts("slab", "Slabs") +
            drafts("padFooting", "Foundations"),
        ),
    ) +
    branch(
      "loading",
      "Load cases & combinations",
      group("loadCases", "Load cases") +
        group("loads", "Loads") +
        group("combinations", "Combinations"),
    ) +
    group("materials", "Materials") +
    group("sections", "Sections")
  );
}

export function filterExplorer(host, query) {
  const needle = query.trim().toLocaleLowerCase();
  for (const leaf of host.querySelectorAll("button"))
    leaf.hidden =
      !!needle &&
      ![
        leaf.textContent,
        leaf.dataset.member,
        leaf.dataset.entityId,
        leaf.dataset.preview,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
  for (const branch of [...host.querySelectorAll("details")].reverse()) {
    const heading = branch
      .querySelector(":scope > summary")
      .textContent.toLocaleLowerCase();
    if (needle && heading.includes(needle))
      for (const el of branch.querySelectorAll("[hidden]")) el.hidden = false;
    branch.hidden =
      !!needle &&
      ![...branch.querySelectorAll("button")].some((b) => !b.hidden);
  }
  return [...host.querySelectorAll("button")].filter(
    (b) => !b.hidden && !b.closest("details[hidden]"),
  ).length;
}
