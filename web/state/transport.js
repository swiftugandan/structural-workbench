/** Dual-Worker gateway: model Worker owns commands; analysis Worker is disposable. */
export class Gateway {
  constructor() {
    this.revision = null;
    this.timeoutMs = 30000;
    this.pending = new Map();
    this.analysisPending = new Map();
    this.count = 0;
    this.analysing = false;
    this.spawnModel();
    this.spawnAnalysis();
  }

  spawnModel() {
    this.modelWorker = new Worker(new URL("../worker.js", import.meta.url), {
      type: "module",
    });
    this.ready = this.bindWorker(this.modelWorker, this.pending, {
      onReady: () => {},
      onMessage: (data) => {
        if (data.payload?.project)
          this.timeoutMs = data.payload.project.analysisSettings.timeoutMs;
        this.revision = data.revision;
      },
      onCrash: () => this.onCrash?.(),
    });
  }

  spawnAnalysis() {
    this.analysisWorker = new Worker(new URL("../worker.js", import.meta.url), {
      type: "module",
    });
    this.analysisReady = this.bindWorker(
      this.analysisWorker,
      this.analysisPending,
      {
        onReady: () => {},
        onMessage: () => {},
        onCrash: () => this.onAnalysisCrash?.(),
      },
    );
  }

  bindWorker(worker, pending, { onMessage, onCrash }) {
    return new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.ready) {
          resolve();
          return;
        }
        if (data.eventType === "analysisProgress" || data.payload?.accepted)
          return;
        const p = pending.get(data.requestId);
        if (!p) return;
        pending.delete(data.requestId);
        clearTimeout(p.timer);
        if (data.status === "error") {
          const e = new Error(
            data.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"),
          );
          e.diagnostics = data.diagnostics;
          p.reject(e);
        } else {
          onMessage(data);
          p.resolve(data.payload);
        }
      };
      worker.onerror = (e) => {
        reject(Error(e.message));
        for (const p of pending.values()) {
          clearTimeout(p.timer);
          p.reject(Error("Worker failed. Recover your saved model."));
        }
        pending.clear();
        onCrash();
      };
    });
  }

  post(worker, pending, operation, payload, expectedRevision, failMessage) {
    const requestId = `request-${++this.count}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (operation === "analyse" || pending === this.analysisPending) {
          this.cancelAnalysis(
            "TIMEOUT: operation exceeded its configured time limit",
          );
          this.onTimeout?.();
        } else {
          this.respawnModel(
            "TIMEOUT: operation exceeded its configured time limit",
          );
          this.onTimeout?.();
        }
      }, this.timeoutMs || 30000);
      pending.set(requestId, { resolve, reject, timer });
      worker.postMessage({
        protocolVersion: 1,
        requestId,
        operation,
        expectedRevision,
        payload,
      });
    }).catch((e) => {
      if (failMessage && /Worker failed|CANCELLED|TIMEOUT/.test(e.message))
        throw e;
      throw e;
    });
  }

  async send(operation, payload = {}) {
    if (operation === "analyse") return this.analyse(payload);
    if (operation === "cancelAnalysis") {
      this.cancelAnalysis();
      return { cancelled: true };
    }
    await this.ready;
    return this.post(
      this.modelWorker,
      this.pending,
      operation,
      payload,
      this.revision,
    );
  }

  /** Import into an empty session after respawn — never send a stale expectedRevision. */
  async importFresh(payload) {
    await this.ready;
    this.revision = null;
    return this.post(
      this.modelWorker,
      this.pending,
      "importProject",
      payload,
      null,
    );
  }

  async analyse(payload) {
    if (this.analysing)
      throw Error("Analysis already running; cancel it before starting another");
    this.analysing = true;
    try {
      await this.ready;
      const snap = await this.post(
        this.modelWorker,
        this.pending,
        "exportProject",
        { includeResults: false },
        this.revision,
      );
      const acceptedSnapshotHash = snap.modelHash;
      const jsonUtf8 = JSON.stringify(snap.project);

      // Fresh analysis Worker so cancel never disturbs the model Worker.
      this.resetAnalysisWorker();
      await this.analysisReady;
      const imported = await this.post(
        this.analysisWorker,
        this.analysisPending,
        "importProject",
        { jsonUtf8, replaceCurrent: true },
        null,
      );
      const result = await this.post(
        this.analysisWorker,
        this.analysisPending,
        "analyse",
        payload,
        imported.project.revision,
      );
      result.acceptedSnapshotHash = acceptedSnapshotHash;
      return result;
    } finally {
      this.analysing = false;
    }
  }

  resetAnalysisWorker() {
    for (const p of this.analysisPending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("CANCELLED: analysis cancelled"));
    }
    this.analysisPending.clear();
    this.analysisWorker.terminate();
    this.spawnAnalysis();
  }

  cancelAnalysis(message = "CANCELLED: analysis cancelled") {
    for (const p of this.analysisPending.values()) {
      clearTimeout(p.timer);
      p.reject(Error(message));
    }
    this.analysisPending.clear();
    this.analysisWorker.terminate();
    this.analysing = false;
    this.spawnAnalysis();
  }

  /** @deprecated Prefer cancelAnalysis; kept so callers that terminate a blocked solve stay correct. */
  cancel(message = "CANCELLED: analysis cancelled") {
    this.cancelAnalysis(message);
  }

  respawnModel(message) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error(message));
    }
    this.pending.clear();
    this.revision = null;
    const dying = this.modelWorker;
    // Detach handlers before terminate so a late onerror cannot clear the
    // replacement Worker's in-flight recovery import.
    dying.onmessage = null;
    dying.onerror = null;
    dying.terminate();
    this.spawnModel();
  }
}
