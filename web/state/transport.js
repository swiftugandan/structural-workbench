export class Gateway {
  constructor() {
    this.revision = null;
    this.pending = new Map();
    this.count = 0;
    this.spawn();
  }
  spawn() {
    this.worker = new Worker(new URL("../worker.js", import.meta.url), {
      type: "module",
    });
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = ({ data }) => {
        if (data.ready) {
          resolve();
          return;
        }
        if (data.eventType === "analysisProgress" || data.payload?.accepted)
          return;
        const p = this.pending.get(data.requestId);
        if (!p) return;
        this.pending.delete(data.requestId);
        clearTimeout(p.timer);
        if (data.status === "error") {
          const e = new Error(
            data.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"),
          );
          e.diagnostics = data.diagnostics;
          p.reject(e);
        } else {
          this.revision = data.revision;
          if (data.payload?.project)
            this.timeoutMs = data.payload.project.analysisSettings.timeoutMs;
          p.resolve(data.payload);
        }
      };
      this.worker.onerror = (e) => {
        reject(Error(e.message));
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(Error("Worker failed. Recover your saved model."));
        }
        this.pending.clear();
        this.onCrash?.();
      };
    });
  }
  async send(operation, payload = {}) {
    await this.ready;
    const requestId = `request-${++this.count}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cancel("TIMEOUT: operation exceeded its configured time limit");
        this.onTimeout?.();
      }, this.timeoutMs || 30000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker.postMessage({
        protocolVersion: 1,
        requestId,
        operation,
        expectedRevision: this.revision,
        payload,
      });
    });
  }
  cancel(message = "CANCELLED: analysis cancelled") {
    this.worker.terminate();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error(message));
    }
    this.pending.clear();
    this.revision = null;
    this.spawn();
  }
}
