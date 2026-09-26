/* Structural Workbench — atomic build-ID asset cache.
 * Precaches every file listed in build.json under one cache name.
 * Activation replaces prior build caches; clients must SKIP_WAITING
 * so an old tab never mixes a new WASM binary with old protocol JS.
 */
const CACHE_PREFIX = "workbench-build-";
const SOURCE_HASH = "__WORKBENCH_SOURCE_HASH__";
let ownCachePromise;
function ownCache() {
  return (ownCachePromise ||= (async () => {
    for (const name of await caches.keys()) {
      if (!name.startsWith(CACHE_PREFIX)) continue;
      const cache = await caches.open(name);
      const response = await cache.match("./build.json");
      if (response && (await response.json()).sourceHash === SOURCE_HASH)
        return cache;
    }
    throw new Error("Installed build cache unavailable");
  })());
}

async function readManifest() {
  const response = await fetch("./build.json", { cache: "no-store" });
  if (!response.ok)
    throw new Error("build.json unavailable for service worker");
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
      if (manifest.sourceHash !== SOURCE_HASH)
        throw new Error("Deployment changed during worker installation");
      if (!manifest.buildHash) throw new Error("build.json missing buildHash");
      const cache = await caches.open(CACHE_PREFIX + manifest.buildHash);
      await cache.addAll(assetUrls(manifest));
      for (const [file, expected] of Object.entries(manifest.files || {})) {
        const response = await cache.match(
          new URL(file, self.registration.scope),
        );
        if (!response) throw new Error(`Missing build asset: ${file}`);
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await response.arrayBuffer(),
        );
        const actual = [...new Uint8Array(digest)]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        if (actual !== expected) {
          await caches.delete(CACHE_PREFIX + manifest.buildHash);
          throw new Error(`Build asset changed during installation: ${file}`);
        }
      }
      self.buildHash = manifest.buildHash;
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Recover the installed manifest after worker process suspension, never
      // infer the active version from a newer deployment on the network.
      await ownCache();
      // Keep old snapshots for other open tabs until they explicitly reload.
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
      const cache = await ownCache();
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        return response;
      } catch (error) {
        if (event.request.mode === "navigate") {
          const fallback =
            (await cache.match("./app.html")) || (await cache.match("./"));
          if (fallback) return fallback;
        }
        throw error;
      }
    })(),
  );
});
