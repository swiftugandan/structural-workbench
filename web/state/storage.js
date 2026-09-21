const database = new Promise((resolve, reject) => {
  const r = indexedDB.open("structural-workbench", 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("projects", { keyPath: "id" });
    r.result.createObjectStore("history", { keyPath: "key" });
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
