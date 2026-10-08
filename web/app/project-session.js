/**
 * The project session (ADR 0033): opening projects and examples, the
 * single-tab lease, local persistence with its storage state, revision
 * recovery and the recent-projects list.
 */
export function projectSession({
  $,
  afterSaved,
  download,
  esc,
  gateway,
  listRevisions,
  loadRevision,
  memberDesignRuns,
  message,
  modal,
  modelTools,
  overview,
  portable,
  recent,
  refresh,
  resolveRecoverableProject,
  retainOriginal,
  save,
  setBusy,
  state,
  viewport,
}) {
  // Private to this module.
  let leaseId;
  let leaseRelease;
  let saveQueue = Promise.resolve();
  async function showRecent() {
    try {
      const rows = await recent();
      $("#recent-projects").replaceChildren();
      if (!rows.length) {
        $("#recent-projects").innerHTML =
          "<p>No projects yet. Start a frame or open a worked example.</p>";
        return;
      }
      let listed = 0;
      for (const item of rows) {
        const resolved = await resolveRecoverableProject(item);
        if (!resolved) continue;
        const b = document.createElement("button");
        b.className = "recent-row";
        const note = resolved.recovered
          ? ` · recovered r${resolved.fromRevision}`
          : "";
        b.innerHTML = `<div><strong>${esc(resolved.project.name)}</strong><small>${resolved.project.nodes.length} nodes · ${resolved.project.members.length} members · Revision ${resolved.project.revision}${esc(note)}</small></div><small>${new Date(item.updated).toLocaleDateString()}　↗</small>`;
        b.onclick = async () => {
          await open(resolved.project, {
            recoveryNote: resolved.recovered
              ? `Latest snapshot was corrupt. Restored verified revision ${resolved.fromRevision}. Unverified bytes were not opened.`
              : "",
          });
        };
        $("#recent-projects").append(b);
        listed += 1;
      }
      if (!listed) {
        $("#recent-projects").innerHTML =
          "<p>No verified local projects. Portable import and export remain available.</p>";
      }
    } catch {
      $("#recent-projects").innerHTML =
        "<p>Local storage unavailable. Portable import and export remain available.</p>";
    }
  }
  async function claimLease(id) {
    if (leaseId === id) return;
    leaseRelease?.();
    leaseRelease = null;
    leaseId = id;
    state.readOnly = false;
    if (!navigator.locks) return;
    await new Promise((resolve) => {
      navigator.locks.request(
        "workbench:" + id,
        { ifAvailable: true },
        (lock) => {
          if (!lock) {
            state.readOnly = true;
            resolve();
            return;
          }
          return new Promise((release) => {
            leaseRelease = release;
            resolve();
          });
        },
      );
    });
  }
  async function persist() {
    if (!state.project || state.readOnly) return;
    const snapshot = structuredClone(portable());
    $("#save-status").textContent = "Saving…";
    if (
      navigator.storage?.persist &&
      !sessionStorage.getItem("wb-persist-warned")
    ) {
      sessionStorage.setItem("wb-persist-warned", "1");
      try {
        const durable = await navigator.storage.persist();
        state.storage = durable ? "persistent" : "bestEffort";
      } catch {
        /* continue without durable persistence */
      }
    }
    saveQueue = saveQueue.catch(() => {}).then(() => save(snapshot));
    try {
      await saveQueue;
      if (state.project?.revision === snapshot.revision) {
        $("#save-status").textContent = "Saved locally";
        afterSaved();
      }
    } catch (e) {
      $("#save-status").textContent = "Save failed";
      state.storage = "failed";
      message(
        "STORAGE_QUOTA: Local save failed. Download your project to preserve it. " +
          e.message,
      );
    }
  }
  async function recoverRevision() {
    if (!state.project || state.formDirty || state.readOnly) {
      message(
        state.formDirty
          ? "Apply or discard unapplied property changes before recovering a committed revision. Recovery never claims unsaved edits were stored."
          : "Open a writable project before recovering a revision.",
      );
      return;
    }
    let rows;
    try {
      rows = await listRevisions(state.project.id);
    } catch (e) {
      message("Local history unavailable. " + e.message);
      return;
    }
    if (!rows.length) {
      message(
        "No committed local revisions yet. Edit and wait for a local save.",
      );
      return;
    }
    const current = state.project.revision;
    modal(
      "Recover committed revision",
      `<p>These snapshots were written to this browser after a successful local save. Unapplied form edits are never stored here.</p>
    <div class="entity-table-wrap"><table><thead><tr><th>Revision</th><th>Saved</th><th>Model</th><th></th></tr></thead><tbody>
    ${rows
      .map((r) => {
        const when = r.savedAt
          ? new Date(r.savedAt).toLocaleString()
          : "unknown time";
        const mark = r.revision === current ? " · current" : "";
        return `<tr data-revision="${r.revision}"><th>r${r.revision}${mark}</th><td>${esc(when)}</td><td>${r.nodes} nodes · ${r.members} members</td><td>${r.revision === current ? "" : `<button type="button" data-recover="${r.revision}">Restore r${r.revision}</button>`}</td></tr>`;
      })
      .join("")}
    </tbody></table></div>`,
    );
    for (const b of document.querySelectorAll("[data-recover]"))
      b.onclick = async () => {
        try {
          const snapshot = await loadRevision(
            state.project.id,
            Number(b.dataset.recover),
          );
          await open(snapshot);
          message(
            `Restored committed revision ${snapshot.revision}. Unsaved edits were not claimed as saved.`,
          );
        } catch (e) {
          message(e.message);
        }
      };
  }
  async function open(p, options = {}) {
    modelTools.cancel();
    try {
      setBusy(true);
      const originalUtf8 = options.originalUtf8 ?? JSON.stringify(p);
      // An exchange import arrives as the kernel's snapshot (exchange.js).
      const s =
        options.snapshot ??
        (await gateway.send("importProject", {
          jsonUtf8: originalUtf8,
          replaceCurrent: true,
        }));
      await claimLease(s.project.id);
      state.project = s.project;
      state.project.name = p.name ?? state.project.name;
      state.project.displayUnits = p.displayUnits ?? state.project.displayUnits;
      state.modelHash = s.modelHash;
      state.result = null;
      state.lastDesignRun = null;
      memberDesignRuns.clear();
      overview.reset();
      state.failed = false;
      state.selectionContext = null;
      state.selected = state.project.members[0]?.id || null;
      viewport.selection = new Set(state.selected ? [state.selected] : []);
      $("#modal").close();
      $("#landing").hidden = true;
      $("#workspace").hidden = false;
      $("#top-context").textContent = "Frame analysis";
      const report = s.migrationReport;
      if (report?.originalSha256) {
        await retainOriginal({
          id: state.project.id,
          originalUtf8,
          sha256: report.originalSha256,
          fromSchema: report.from,
          toSchema: report.to,
          steps: report.steps || [],
        });
      }
      let status = state.readOnly
        ? "This project is open in another tab. This tab is read-only; exports and analysis remain available."
        : "";
      if (report?.steps?.length) {
        status =
          `Migrated schema ${report.from} → ${report.to}. Original file retained locally (${report.originalSha256.slice(0, 12)}…).` +
          (status ? "\n" + status : "");
      }
      if (options.recoveryNote) {
        status = options.recoveryNote + (status ? "\n" + status : "");
      }
      message(status);
      refresh(s);
      viewport.fit();
      if (!$("#results-content").hidden) $("#toggle-results")?.click();
      await persist();
      if (options.recoveryNote) message(options.recoveryNote);
    } catch (e) {
      message(e.message);
      if ($("#workspace").hidden)
        modal(
          "Unable to open project",
          `<p>${esc(e.message)}</p><p>The current model has been preserved.</p>${
            options.originalUtf8 && /UNSUPPORTED_SCHEMA/.test(e.message)
              ? `<p>Unknown schema opens only as a backup. <button type="button" id="download-unsupported-original" class="primary">Download original JSON</button></p>`
              : ""
          }`,
        );
      if (options.originalUtf8 && /UNSUPPORTED_SCHEMA/.test(e.message)) {
        const raw = options.originalUtf8;
        queueMicrotask(() => {
          $("#download-unsupported-original")?.addEventListener("click", () => {
            download("unsupported-project.json", raw);
          });
        });
      }
    } finally {
      setBusy(false);
    }
  }
  async function example(id, name) {
    const p = await fetch(`./examples/${id}.json`).then((r) => r.json());
    p.id = "p" + crypto.randomUUID().replaceAll("-", "");
    p.name = name;
    await open(p);
    if (["W01", "UKR01"].includes(id)) $("#view-3d").click();
    if (id === "UKR01") {
      if (!viewport.modelSolids) $("#model-solids").click();
      if (viewport.showLoads !== false) $("#model-loads").click();
      if (viewport.showCrossings !== false) $("#model-crossings").click();
      $("#result-case").value = "SLS";
      $("#result-case").dispatchEvent(new Event("change"));
    }
  }
  return { showRecent, claimLease, persist, recoverRevision, open, example };
}
