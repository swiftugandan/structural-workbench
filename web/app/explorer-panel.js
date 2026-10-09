/**
 * The model explorer (ADR 0033): the searchable tree of the structure,
 * analytical entities, design objects and loading, with lazy branches and
 * selection that follows the canvas.
 */
export function explorerPanel({
  $,
  editEntity,
  entityGuides,
  entityList,
  esc,
  explorerLazyBranches,
  explorerOpenState,
  filterExplorer,
  label,
  message,
  modal,
  openDesignObject,
  renderExplorer,
  renderInspector,
  renderSelectionStatus,
  selectEntities,
  state,
  structuralIcon,
  structureSelectionIds,
}) {
  // Private to this module.
  let explorerProjectId;
  let explorerSelection;
  function renderNav() {
    if (explorerProjectId !== state.project.id) {
      explorerOpenState.clear();
      explorerProjectId = state.project.id;
      explorerSelection =
        state.project.members.length > 1000 ? state.selected : null;
      $("#model-search").value = "";
    }
    // Reveal explicit selections even when their large-model branch is deferred.
    if (
      state.project.members.length > 1000 &&
      state.selected !== explorerSelection
    ) {
      const owner = state.project.structure.physicalMembers.find((m) =>
        m.analyticalMemberIds.includes(state.selected),
      );
      if (owner)
        for (const key of [
          "structure",
          "levels",
          `storey:${owner.storeyId}`,
          `storey:${owner.storeyId}:${owner.role}`,
          `analytical:${owner.id}`,
        ])
          explorerOpenState.set(key, true);
    }
    const query = $("#model-search").value;
    explorerLazyBranches.clear();
    $("#model-nav").innerHTML = renderExplorer(state.project, {
      selected: state.selected,
      label,
      esc,
      icon: structuralIcon,
      openState: explorerOpenState,
      lazyBranches: explorerLazyBranches,
      selectionContext: state.selectionContext,
      query,
    });
    if (state.selected !== explorerSelection) {
      for (const leaf of $("#model-nav").querySelectorAll(
        '[aria-current="true"]',
      )) {
        for (
          let d = leaf.closest("details");
          d;
          d = d.parentElement.closest("details")
        ) {
          d.open = true;
          explorerOpenState.set(d.dataset.branch, true);
        }
      }
      explorerSelection = state.selected;
    }
    const count = filterExplorer($("#model-nav"), query);
    $("#explorer-empty").hidden = !query || count > 0;
    bindExplorer();
  }
  function hydrateExplorerBranch(d) {
    if (!d.hasAttribute("data-lazy")) return false;
    d.querySelector(":scope > .explorer-children").innerHTML =
      explorerLazyBranches.get(d.dataset.branch) ||
      '<p class="explorer-empty">None in this model</p>';
    d.removeAttribute("data-lazy");
    return true;
  }
  function selectStructureObject(collection, id) {
    selectEntities(structureSelectionIds(state.project, collection, id));
    state.selectionContext = { kind: "structure", collection, id };
    $("[data-inspector-tab=properties]").click();
    renderInspector();
    renderNav();
    renderSelectionStatus();
  }
  function bindExplorer() {
    for (const d of $("#model-nav").querySelectorAll("details"))
      d.ontoggle = () => {
        if (!d.isConnected) return;
        if (d.open && hydrateExplorerBranch(d)) bindExplorer();
        if (!$("#model-search").value)
          explorerOpenState.set(d.dataset.branch, d.open);
      };
    for (const b of $("#model-nav").querySelectorAll(
      "[data-structure-id], [data-structure-add]",
    ))
      b.onclick = () => {
        if (state.formDirty) return message("Apply or cancel changes first.");
        selectStructureObject(
          b.dataset.structureKey || b.dataset.structureAdd,
          b.dataset.structureId,
        );
      };
    for (const b of $("#model-nav").querySelectorAll("[data-structure-ref]"))
      b.onclick = () => {
        if (state.formDirty) return message("Apply or cancel changes first.");
        const id = b.dataset.structureRef;
        if (b.dataset.refKind === "support") selectEntities([id]);
        else {
          const collection = {
            physicalMember: "physicalMembers",
            designObject: "designObjects",
            joint: "joints",
            grid: "grids",
          }[b.dataset.refKind];
          if (collection) selectStructureObject(collection, id);
        }
      };
    for (const b of $("#model-nav").querySelectorAll("[data-entity-id]"))
      b.onclick = (e) => {
        if (state.formDirty) return message("Apply or cancel changes first.");
        const key = b.dataset.entityKey,
          id = b.dataset.entityId;
        if (["nodes", "supports", "loads"].includes(key))
          selectEntities([id], e.shiftKey);
        else {
          modal("Edit " + entityGuides[key][0].toLowerCase(), "");
          editEntity(
            key,
            state.project[key].find((x) => x.id === id),
          );
        }
      };
    for (const b of document.querySelectorAll("[data-preview]"))
      b.onclick = () => openDesignObject(b.dataset.preview);
    for (const b of document.querySelectorAll("[data-member]"))
      b.onclick = (e) => selectEntities([b.dataset.member], e.shiftKey);
    for (const b of document.querySelectorAll("[data-group]"))
      b.onclick = () => {
        if (state.formDirty) {
          message(
            "Apply or cancel property changes before editing other entities.",
          );
          return;
        }
        entityList(b.dataset.group);
      };
  }
  return {
    renderNav,
    hydrateExplorerBranch,
    selectStructureObject,
    bindExplorer,
  };
}
