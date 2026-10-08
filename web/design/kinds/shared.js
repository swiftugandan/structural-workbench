/** Parts several design-kind descriptors share (ADR 0033). */

/** Action sources: a bound member's model actions or a synthetic fixture. */
export const memberSources = [
  ["synthetic", "Synthetic actions · illustration"],
  ["model", "Current model case / combination"],
];

/** Readiness text for the chosen action source. */
export const modelReadiness = (model, synthetic) => (source) =>
  source === "model" ? model : `Synthetic actions · ${synthetic}`;

const quoted = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;

/** The indicative bar schedule of a concrete run. */
export const concreteSchedule = {
  file: () => "indicative-schedule.csv",
  header:
    "previewRunId,currentState,mark,region,shape,diameter_m,quantity,cutLength_m,mass_kg,source,status",
  row: (r, run, state) => [
    run.previewRunId,
    state,
    r.mark,
    r.region,
    `"${r.shape || ""}"`,
    r.diameter,
    r.quantity ?? "",
    r.cutLength ?? "",
    r.massKg ?? "",
    r.source,
    r.status,
  ],
};

/** The bill of materials of a steel run. */
export const steelBill = (prefix) => ({
  file: () => `${prefix}-bill-of-materials.csv`,
  header: "previewRunId,currentState,item,description,quantity,mass_kg",
  row: (r, run, state) => [
    run.previewRunId,
    state,
    r.item,
    quoted(r.description),
    r.quantity,
    r.massKg ?? "",
  ],
});

/** CSV text of a run's schedule under a descriptor's schedule format. */
export function scheduleCsv(format, run, state) {
  return (
    format.header +
    "\n" +
    run.schedule.map((r) => format.row(r, run, state).join(",")).join("\n")
  );
}

/** A run belongs in the report when it used this exact model result. */
export const boundToResult = (run, { modelHash, result }) =>
  run.modelHash === modelHash &&
  run.sourceProvenance.kind === "modelAnalysis" &&
  run.sourceProvenance.resultId === result.resultId;
