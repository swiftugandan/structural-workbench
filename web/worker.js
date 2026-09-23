import init, { Kernel } from "./pkg/workbench_wasm_api.js";
import validate from "./schema-validator.js";
import validateRequest from "./request-validator.js";
await init();
const kernel = new Kernel();
let revision = null,
  modelHash = null;
function error(r, code, message) {
  return {
    protocolVersion: 1,
    requestId: r.requestId,
    operation: r.operation,
    status: "error",
    revision,
    modelHash,
    payload: null,
    diagnostics: [
      {
        code,
        severity: "error",
        message: message.slice(0, 4096),
        entityIds: [],
        details: {},
      },
    ],
  };
}
self.onmessage = ({ data: r }) => {
  try {
    if (!validateRequest(r)) {
      postMessage(
        error(r, "INVALID_SCHEMA", JSON.stringify(validateRequest.errors)),
      );
      return;
    }
    if (["createProject", "importProject"].includes(r.operation)) {
      const p =
        r.operation === "importProject"
          ? JSON.parse(r.payload.jsonUtf8)
          : r.payload.project;
      const version = p.schemaVersion;
      const migratable = version === "0.9.0" || version === "1.0.0";
      if (!migratable) {
        postMessage(
          error(
            r,
            "UNSUPPORTED_SCHEMA",
            `Project schema ${version} is not supported. Supported import schemas: 0.9.0, 1.0.0`,
          ),
        );
        return;
      }
      // Legacy 0.9.0 is migrated in Rust before AJV/current-schema checks.
      if (version === "1.0.0" && !validate(p)) {
        postMessage(
          error(
            r,
            "INVALID_SCHEMA",
            validate.errors
              .map((e) => `${e.instancePath} ${e.message}`)
              .join("; "),
          ),
        );
        return;
      }
    }
    if (r.operation === "analyse") {
      if (r.expectedRevision !== revision) {
        postMessage(
          error(r, "REVISION_CONFLICT", "Model changed before analysis"),
        );
        return;
      }
      postMessage({
        protocolVersion: 1,
        requestId: r.requestId,
        operation: "analyse",
        status: "ok",
        revision,
        modelHash,
        diagnostics: [],
        payload: {
          accepted: true,
          jobId: r.requestId,
          acceptedSnapshotHash: modelHash,
        },
      });
      postMessage({
        eventType: "analysisProgress",
        jobId: r.requestId,
        requestId: r.requestId,
        sourceRevision: revision,
        modelHash,
        payload: { stage: "assembly" },
      });
    }
    const response = JSON.parse(kernel.request(JSON.stringify(r)));
    revision = response.revision;
    modelHash = response.modelHash;
    if (r.operation === "analyse") {
      response.eventType =
        response.status === "ok" ? "analysisCompleted" : "analysisFailed";
      response.jobId = r.requestId;
      response.sourceRevision = revision;
      if (response.status === "ok") {
        const p = response.payload;
        p.nodeDisplacements = new Float64Array(p.nodeDisplacements);
        p.reactions = new Float64Array(p.reactions);
        p.memberIds = p.members.map((m) => m.id);
        p.memberEndActions = new Float64Array(
          p.members.flatMap((m) => m.endActions),
        );
      }
    }
    postMessage(response);
  } catch (e) {
    postMessage(error(r, "INVALID_SCHEMA", e.message));
  }
};
postMessage({ ready: true });
