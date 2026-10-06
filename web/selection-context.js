import { entityLabel } from "./entity-labels.js";

// Presentation identity only. Saved bindings and geometry remain Rust-owned.
export function previewIdentity(project, draft) {
  const binding = project.structure?.designObjects.find(
    (x) => x.previewId === draft.id,
  );
  const kind = {
    rcBeam: "RC beam",
    rcColumn: "RC column",
    slab: "Slab",
    padFooting: "Pad footing",
    singlePlate: "Steel connection",
  }[draft.kind];
  const target = draft.targetId ? entityLabel(project, draft.targetId) : null;
  const name = binding?.name || `${kind} ${draft.id}`;
  return {
    name,
    target,
    text: `${name}${target ? ` · ${draft.kind === "padFooting" ? "support" : draft.kind === "singlePlate" ? `beam ${draft.connection?.end === "start" ? "start" : "end"} of` : "member"} ${target}` : " · unbound draft"}`,
  };
}

export function structureSelectionIds(project, collection, id) {
  const s = project.structure;
  const item = s[collection]?.find((x) => x.id === id);
  if (!item) return [];
  if (item.analyticalMemberIds) return item.analyticalMemberIds;
  if (item.nodeId) return [item.nodeId];
  if (item.supportId) return [item.supportId];
  if (item.previewId) {
    const d = project.designPreviews.find((x) => x.id === item.previewId);
    return d?.targetId ? [d.targetId] : [];
  }
  if (collection === "storeys")
    return s.physicalMembers
      .filter((x) => x.storeyId === id)
      .flatMap((x) => x.analyticalMemberIds);
  return [
    ...new Set(
      (item.members || []).flatMap((ref) => {
        if (ref.kind === "support") return [ref.id];
        const key = {
          physicalMember: "physicalMembers",
          designObject: "designObjects",
          joint: "joints",
          grid: "grids",
        }[ref.kind];
        return key ? structureSelectionIds(project, key, ref.id) : [];
      }),
    ),
  ];
}
