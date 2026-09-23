/** Atomic offline cache registration and update-after-save reload prompt. */

let registration = null;
let updateReady = false;
let prompted = false;
let buildHash = null;

function $(sel) {
  return document.querySelector(sel);
}

function setOfflineStatus() {
  const badge = $("#local-badge");
  const status = $("#offline-status");
  const online = navigator.onLine;
  if (badge)
    badge.textContent = online ? "◉ Local workspace" : "◉ Offline · cached";
  if (status) status.textContent = online ? "Online" : "Offline (cached build)";
}

function showBuild(hash) {
  buildHash = hash;
  const el = $("#build-status");
  if (el) {
    el.textContent = "Build " + hash.slice(0, 12);
    el.title = hash;
    el.dataset.buildHash = hash;
  }
}

function hideUpdateBanner() {
  const banner = $("#update-banner");
  if (banner) banner.hidden = true;
}

function showUpdateBanner() {
  const banner = $("#update-banner");
  if (!banner || prompted) return;
  prompted = true;
  banner.hidden = false;
}

async function activateWaitingAndReload() {
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
  const reload = () => location.reload();
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", reload, {
      once: true,
    });
    // If SKIP_WAITING already applied or no controller swap comes, still reload.
    setTimeout(reload, 1500);
  } else reload();
}

function watchWorker(worker) {
  if (!worker) return;
  worker.addEventListener("statechange", () => {
    if (
      worker.state === "installed" &&
      navigator.serviceWorker.controller &&
      registration?.waiting === worker
    ) {
      updateReady = true;
    }
  });
}

/**
 * Call after a successful local save. Spec: prompt reload after saving when
 * an update is ready so old WASM is never mixed with new protocol code.
 */
export function afterSaved() {
  if (updateReady) showUpdateBanner();
}

export function isUpdateReady() {
  return updateReady;
}

export function currentBuildHash() {
  return buildHash;
}

export async function initOffline() {
  setOfflineStatus();
  window.addEventListener("online", setOfflineStatus);
  window.addEventListener("offline", setOfflineStatus);

  $("#reload-update")?.addEventListener("click", () => {
    activateWaitingAndReload();
  });

  try {
    const manifest = await fetch("./build.json", { cache: "no-store" }).then(
      (r) => {
        if (!r.ok) throw new Error("build.json missing");
        return r.json();
      },
    );
    showBuild(manifest.buildHash);
  } catch {
    const el = $("#build-status");
    if (el) el.textContent = "Build unknown";
  }

  if (!("serviceWorker" in navigator)) {
    const status = $("#offline-status");
    if (status) status.textContent = "Offline cache unavailable";
    return null;
  }

  registration = await navigator.serviceWorker.register("./sw.js");
  watchWorker(registration.installing);
  registration.addEventListener("updatefound", () =>
    watchWorker(registration.installing),
  );

  if (registration.waiting && navigator.serviceWorker.controller) {
    updateReady = true;
  } else if (registration.waiting && !navigator.serviceWorker.controller) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  await navigator.serviceWorker.ready;

  // Expose for focused Playwright checks without claiming parent M04.
  window.__workbenchOffline = {
    afterSaved,
    isUpdateReady: () => updateReady,
    markUpdateReady: () => {
      updateReady = true;
    },
    showUpdateBanner,
    currentBuildHash: () => buildHash,
    registration: () => registration,
  };

  return registration;
}
