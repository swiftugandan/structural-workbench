import { previewIdentity } from "./selection-context.js";
import { renderMemberNav } from "./hierarchy.js";
const nameOrder = new Intl.Collator(undefined, { numeric: true });

export function renderExplorer(
  project,
  {
    selected,
    label,
    esc,
    icon,
    openState,
    selectionContext,
    query = "",
    lazyBranches,
  },
) {
  const analyticalById = new Map(project.members.map((m) => [m.id, m]));
  const branch = (key, title, body, count = "", open = true) => {
    const expanded = (openState.get(key) ?? open) || !!query;
    const deferred = project.members.length > 1000 && !expanded && lazyBranches;
    if (deferred) lazyBranches.set(key, body);
    return `<details class="explorer-branch" data-branch="${esc(key)}" ${expanded ? "open" : ""} ${deferred ? 'data-lazy="true"' : ""}><summary><span>${esc(title)}</span>${count !== "" ? `<small>${count}</small>` : ""}</summary><div class="explorer-children">${deferred ? "" : body || '<p class="explorer-empty">None in this model</p>'}</div></details>`;
  };
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
  const domainLeaf = (key, x) =>
    `<button class="explorer-leaf structure-leaf" ${selectionContext?.kind === "structure" && selectionContext.id === x.id ? 'aria-current="true"' : ""} data-structure-key="${key}" data-structure-id="${esc(x.id)}"><span>${esc(x.name)}</span><small>${esc(x.role || x.kind || "")}</small></button>`;
  const add = (key) =>
    `<button class="explorer-manage" data-structure-add="${key}">+ Add ${{ storeys: "storey", grids: "grid", layers: "layer", groups: "group" }[key]}</button>`;
  const structure = project.structure;
  const collectionRefs = (refs) =>
    refs
      .map((r) => {
        const key = {
          physicalMember: "physicalMembers",
          designObject: "designObjects",
          joint: "joints",
          grid: "grids",
        }[r.kind];
        const item = (key ? structure[key] : project.supports).find(
          (x) => x.id === r.id,
        );
        return `<button class="explorer-leaf structure-leaf hierarchy-child" data-structure-ref="${esc(r.id)}" data-ref-kind="${r.kind}"><span>${esc(item?.name || label(r.id))}</span><small>${esc(r.kind)}</small></button>`;
      })
      .join("");
  const levels = [
    ...[...structure.storeys].sort((a, b) => b.elevation - a.elevation),
    { id: null, name: "Unassigned storey" },
  ]
    .map((level) => {
      const members = structure.physicalMembers.filter(
        (m) => m.storeyId === level.id,
      );
      const body = [
        "beam",
        "column",
        "slab",
        "stair",
        "landing",
        "brace",
        "unassigned",
      ]
        .map((role) => {
          const items = members
            .filter((m) => m.role === role)
            .sort((a, b) => nameOrder.compare(a.name, b.name));
          return items.length
            ? branch(
                `storey:${level.id}:${role}`,
                {
                  beam: "Beams",
                  slab: "Slab panels",
                  stair: "Stair flights",
                  landing: "Landings",
                  column: "Columns",
                  brace: "Braces",
                  unassigned: "Unassigned role",
                }[role],
                items
                  .map(
                    (m) =>
                      `<div class="physical-object">${domainLeaf("physicalMembers", m)}${branch(
                        `analytical:${m.id}`,
                        "Analytical members",
                        renderMemberNav(
                          m.analyticalMemberIds.map((id) =>
                            analyticalById.get(id),
                          ),
                          { selected, label, esc },
                        ),
                        m.analyticalMemberIds.length,
                        m.analyticalMemberIds.includes(selected),
                      )}</div>`,
                  )
                  .join(""),
                items.length,
              )
            : "";
        })
        .join("");
      return branch(
        `storey:${level.id}`,
        level.name,
        (level.id ? domainLeaf("storeys", level) : "") +
          body +
          collectionRefs(
            structure.designObjects
              .filter((x) => x.storeyId === level.id)
              .map((x) => ({ kind: "designObject", id: x.id })),
          ),
        members.length +
          structure.designObjects.filter((x) => x.storeyId === level.id).length,
        project.members.length < 50,
      );
    })
    .join("");
  const domainGroup = (key, title) =>
    branch(
      key,
      title,
      (["grids", "layers", "groups"].includes(key) ? add(key) : "") +
        structure[key]
          .map(
            (x) =>
              domainLeaf(key, x) +
              (x.members
                ? `<small class="explorer-note">${x.members.length} assigned objects</small>${collectionRefs(x.members)}`
                : ""),
          )
          .join(""),
      structure[key].length,
      false,
    );
  const drafts = (kind, title) => {
    const items = (project.designPreviews || []).filter((d) => d.kind === kind);
    return branch(
      kind,
      title,
      items
        .map(
          (d) =>
            `<button class="explorer-leaf" data-preview="${esc(d.id)}" ${selectionContext?.kind === "preview" && selectionContext.id === d.id ? 'aria-current="true"' : ""}><span aria-hidden="true">▱</span><span>${esc(previewIdentity(project, d).text)}</span><small>Mock · ${esc(d.id.slice(-6))}</small></button>`,
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
        "Storeys & physical members",
        add("storeys") + levels,
        "",
        true,
      ) +
        manage("members", "Members") +
        domainGroup("grids", "Grids") +
        domainGroup("layers", "Layers") +
        domainGroup("groups", "Groups") +
        domainGroup("joints", "Joints") +
        domainGroup("supportDetails", "Support details") +
        domainGroup("designObjects", "Design object bindings") +
        group("nodes", "Analytical nodes", project.nodes.length < 50) +
        group("supports", "Supports", project.members.length < 50) +
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
  // renderNav creates a fresh, unfiltered tree; avoid walking every branch
  // when there is no search to apply.
  if (!needle) return host.querySelectorAll("button").length;
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
