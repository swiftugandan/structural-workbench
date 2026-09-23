/** Physical → analytical member lineage for model tree and inspector. */
export function physicalRootId(member) {
  return member.parentMemberId || member.id;
}

export function memberHierarchy(members) {
  const roots = new Map();
  const unsplit = [];
  for (const m of members) {
    if (m.parentMemberId) {
      const list = roots.get(m.parentMemberId) || [];
      list.push(m);
      roots.set(m.parentMemberId, list);
    } else unsplit.push(m);
  }
  for (const kids of roots.values()) {
    kids.sort(
      (a, b) => (a.stationRange?.[0] ?? 0) - (b.stationRange?.[0] ?? 0),
    );
  }
  return {
    roots,
    unsplit,
    hasLineage: roots.size > 0,
  };
}

export function stationRangeText(member) {
  const range = member.stationRange;
  if (!Array.isArray(range) || range.length < 2) return "";
  return `${range[0]}–${range[1]}`;
}

export function lineageSummary(project, member, label) {
  if (!member.parentMemberId) return null;
  const stations = stationRangeText(member);
  return {
    physicalId: member.parentMemberId,
    physicalLabel: label(member.parentMemberId),
    stations,
    text: `Analytical segment of physical ${label(member.parentMemberId)}${stations ? ` · stations ${stations}` : ""}`,
  };
}

export function renderMemberNav(members, { selected, label, esc }) {
  const { roots, unsplit, hasLineage } = memberHierarchy(members);
  const entity = (m, extraClass = "") =>
    `<button class="entity ${extraClass} ${selected === m.id ? "active" : ""}" data-member="${esc(m.id)}" ${selected === m.id ? 'aria-current="true"' : ""}><span class="nav-label">${esc(label(m.id))}</span><small>${esc(label(m.start))} → ${esc(label(m.end))}${m.parentMemberId && stationRangeText(m) ? ` · ${stationRangeText(m)}` : ""}</small></button>`;
  if (!hasLineage)
    return members
      .filter((m, i) => i < 100 || m.id === selected)
      .map((m) => entity(m))
      .join("");
  const blocks = [];
  for (const [physicalId, kids] of roots) {
    blocks.push(
      `<div class="hierarchy-group" data-physical="${esc(physicalId)}"><p class="hierarchy-parent" title="Physical member lineage">Physical ${esc(label(physicalId))} · ${kids.length} analytical</p>${kids.map((m) => entity(m, "hierarchy-child")).join("")}</div>`,
    );
  }
  for (const m of unsplit) blocks.push(entity(m));
  return blocks.join("");
}
