/* HANSAN V4 service worker.
 *
 * Scope is limited to the application shell. Business data is never cached
 * here: POS catalog and the cash queue live in IndexedDB with explicit
 * durability and sync semantics. API requests always go to the network so a
 * stale response can never be mistaken for an accepted order.
 */
const VERSION = "hansan-shell-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.endsWith(".woff2")
  );
}

/**
 * A failed navigation is not always a rejected fetch. Reverse proxies and
 * embedded browsers can resolve with 502/503/504 when the origin is down.
 * Those responses must fall back to the cached POS shell just like a network
 * rejection, otherwise an outage shows an error page despite a valid cache.
 */
async function offlineNavigation(request, cacheableNavigation) {
  if (cacheableNavigation) {
    const cached = await caches.match(request);
    if (cached) return cached;
  }
  const offline = await caches.match(OFFLINE_URL);
  return offline ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API or RSC payloads. A sales terminal must fail visibly rather
  // than present a stale business response as current.
  if (url.pathname.startsWith("/api/") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    // Only the POS shell is safe to retain as HTML. HQ and KDS pages can embed
    // tenant business data; serving a cached copy would present stale data as
    // current. Those routes fall back to the generic offline page.
    const cacheableNavigation = url.pathname === "/pos";
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            if (cacheableNavigation) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return response;
          }
          if (response.status >= 500) {
            return offlineNavigation(request, cacheableNavigation);
          }
          return response;
        })
        .catch(() => offlineNavigation(request, cacheableNavigation)),
    );
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return response;
          }),
      ),
    );
  }
});
