const DB_NAME = "structural-workbench";
const DB_VERSION = 2;

const database = new Promise((resolve, reject) => {
  const r = indexedDB.open(DB_NAME, DB_VERSION);
  r.onupgradeneeded = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains("projects"))
      db.createObjectStore("projects", { keyPath: "id" });
    if (!db.objectStoreNames.contains("history"))
      db.createObjectStore("history", { keyPath: "key" });
    if (!db.objectStoreNames.contains("originals"))
      db.createObjectStore("originals", { keyPath: "id" });
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export async function save(project) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "history"], "readwrite");
    tx.objectStore("projects").put({
      id: project.id,
      project,
      updated: Date.now(),
    });
    const store = tx.objectStore("history");
    store.put({
      key: project.id + ":" + project.revision,
      id: project.id,
      revision: project.revision,
      project,
      savedAt: Date.now(),
    });
    const request = store.getAll();
    request.onsuccess = () => {
      const previous = request.result
        .filter((x) => x.id === project.id)
        .sort((a, b) => b.revision - a.revision);
      for (const old of previous.slice(10)) store.delete(old.key);
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function recent() {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db.transaction("projects").objectStore("projects").getAll();
    r.onsuccess = () => resolve(r.result.sort((a, b) => b.updated - a.updated));
    r.onerror = () => reject(r.error);
  });
}

/** Committed IndexedDB snapshots for one project, newest revision first. */
export async function listRevisions(projectId) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db.transaction("history").objectStore("history").getAll();
    r.onsuccess = () =>
      resolve(
        r.result
          .filter((x) => x.id === projectId)
          .sort((a, b) => b.revision - a.revision)
          .map((x) => ({
            revision: x.revision,
            savedAt: x.savedAt ?? null,
            nodes: x.project?.nodes?.length ?? 0,
            members: x.project?.members?.length ?? 0,
            name: x.project?.name ?? "",
          })),
      );
    r.onerror = () => reject(r.error);
  });
}

export async function loadRevision(projectId, revision) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db
      .transaction("history")
      .objectStore("history")
      .get(`${projectId}:${revision}`);
    r.onsuccess = () => {
      if (!r.result?.project)
        reject(Error(`No committed snapshot for revision ${revision}.`));
      else resolve(structuredClone(r.result.project));
    };
    r.onerror = () => reject(r.error);
  });
}

/** Retain pre-migration project bytes. Application rollback cannot reverse an incompatible migration without this original. */
export async function retainOriginal(record) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("originals", "readwrite");
    tx.objectStore("originals").put({
      id: record.id,
      originalUtf8: record.originalUtf8,
      sha256: record.sha256,
      fromSchema: record.fromSchema,
      toSchema: record.toSchema,
      steps: record.steps || [],
      retainedAt: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadOriginal(projectId) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const r = db.transaction("originals").objectStore("originals").get(projectId);
    r.onsuccess = () => resolve(r.result ? structuredClone(r.result) : null);
    r.onerror = () => reject(r.error);
  });
}
