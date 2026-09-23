/* Structural Workbench — atomic build-ID asset cache.
 * Precaches every file listed in build.json under one cache name.
 * Activation replaces prior build caches; clients must SKIP_WAITING
 * so an old tab never mixes a new WASM binary with old protocol JS.
 */
const CACHE_PREFIX = "workbench-build-";

async function readManifest() {
  const response = await fetch("./build.json", { cache: "no-store" });
  if (!response.ok) throw new Error("build.json unavailable for service worker");
  return response.json();
}

function assetUrls(manifest) {
  const urls = new Set(["./", "./app.html", "./build.json", "./sw.js"]);
  for (const file of Object.keys(manifest.files || {})) urls.add("./" + file);
  return [...urls];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const manifest = await readManifest();
      if (!manifest.buildHash) throw new Error("build.json missing buildHash");
      const cache = await caches.open(CACHE_PREFIX + manifest.buildHash);
      await cache.addAll(assetUrls(manifest));
      self.buildHash = manifest.buildHash;
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      let keep = self.buildHash ? CACHE_PREFIX + self.buildHash : null;
      if (!keep) {
        try {
          const manifest = await readManifest();
          if (manifest.buildHash) keep = CACHE_PREFIX + manifest.buildHash;
        } catch {
          // Stay offline-safe: never delete the only cached build when build.json
          // cannot be fetched during activation.
        }
      }
      if (keep) {
        for (const name of await caches.keys()) {
          if (name.startsWith(CACHE_PREFIX) && name !== keep)
            await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        return response;
      } catch (error) {
        if (event.request.mode === "navigate") {
          const fallback =
            (await caches.match("./app.html")) || (await caches.match("./"));
          if (fallback) return fallback;
        }
        throw error;
      }
    })(),
  );
});
