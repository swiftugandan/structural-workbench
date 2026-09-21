// IDs remain internal references; persisted labels are the user-facing names.
export function entityLabel(project, id) {
  return project?.metadata?.entityLabels?.[id] || id;
}
export function entityId(project, label) {
  return (
    Object.entries(project.metadata.entityLabels || {}).find(
      ([, value]) => value === label,
    )?.[0] || label
  );
}
