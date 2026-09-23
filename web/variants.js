/** Clone a project as an independent variant (new id/name; entity IDs preserved). */
export function duplicateAsVariant(project, { nameSuffix = " (variant)" } = {}) {
  const copy = structuredClone(project);
  copy.id = "p" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  copy.name = `${project.name || "Project"}${nameSuffix}`;
  copy.revision = 0;
  return copy;
}

/** Tip uz (m) for nodeId from a result buffer, or null. */
export function tipUz(result, nodeId) {
  if (!result?.nodeIds || !result.nodeDisplacements) return null;
  const i = result.nodeIds.indexOf(nodeId);
  if (i < 0) return null;
  return result.nodeDisplacements[i * 6 + 2];
}

export function sectionIy(project, sectionId = "sec1") {
  const s = project.sections?.find((x) => x.id === sectionId) || project.sections?.[0];
  return s?.Iy ?? null;
}

/**
 * Side-by-side comparison record. Both results must come from actual solves
 * whose modelHash matches the hashed project snapshots.
 */
export function buildComparison({
  baseline,
  baselineResult,
  variant,
  variantResult,
}) {
  if (baselineResult.modelHash !== baseline.modelHash) {
    throw Error("Baseline result is stale relative to its model hash.");
  }
  if (variantResult.modelHash !== variant.modelHash) {
    throw Error("Variant result is stale relative to its model hash.");
  }
  const tipNode =
    baseline.project.nodes?.at(-1)?.id ||
    variant.project.nodes?.at(-1)?.id ||
    null;
  return {
    baseline: {
      id: baseline.project.id,
      name: baseline.project.name,
      modelHash: baseline.modelHash,
      Iy: sectionIy(baseline.project),
      tipUz: tipUz(baselineResult, tipNode),
      tipNode,
      caseId: baselineResult.caseId || baselineResult.caseOrCombinationId,
    },
    variant: {
      id: variant.project.id,
      name: variant.project.name,
      modelHash: variant.modelHash,
      Iy: sectionIy(variant.project),
      tipUz: tipUz(variantResult, tipNode),
      tipNode,
      caseId: variantResult.caseId || variantResult.caseOrCombinationId,
    },
    tipNode,
  };
}
