const CACHE_VERSION = "7be18429fd";
const SHELL_CACHE = `animecloud-shell-${CACHE_VERSION}`;
const API_CACHE = `animecloud-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `animecloud-images-${CACHE_VERSION}`;

const CORE_APP_SHELL = [
  "/",
  "/index.html",
  "/style.css?v=a148b3b7a4",
  "/api/runtime-config.js?v=7be18429fd",
  "/app-constants.min.js?v=7f5bd79a51",
  "/firebase-config.min.js?v=d0b5fb95e7",
  "/cloud-sync.min.js?v=5f6fd75210",
  "/app.min.js?v=4ea906dec0",
  "/auth.min.js?v=edab9161c1",
  "/watch-features.min.js?v=f0c44d7fbb",
  "/manifest.webmanifest?v=3a11887700",
  "/robots.txt",
  "/mc-icon-192.png?v=af9b2b4f14",
  "/mc-icon-192-maskable.png?v=af9b2b4f14",
  "/mc-icon-512.png?v=e46013ca7b",
  "/mc-icon-512-maskable.png?v=e46013ca7b"
];
const OPTIONAL_APP_SHELL = ["/hls.min.js?v=5ff2d714de"];

function canCache(response) {
  return response && (response.ok || response.type === "opaque");
}

function isShellAsset(url) {
  return (
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.includes("/videos/media/") &&
    (/\.(css|js|png|svg|webmanifest)$/i.test(url.pathname) ||
      url.pathname === "/" ||
      url.pathname.endsWith("/index.html"))
  );
}

function isApiRequest(url) {
  return url.origin === self.location.origin && /^\/api\/kodik(?:\/|$)/.test(url.pathname);
}

function isMediaStreamRequest(url) {
  return url.origin === self.location.origin && /^\/api\/anilibria-stream(?:\/|$)/.test(url.pathname);
}

function isManifestRequest(url) {
  return url.origin === self.location.origin && url.pathname === "/manifest.webmanifest";
}

function isRuntimeConfigRequest(url) {
  return url.origin === self.location.origin && url.pathname === "/api/runtime-config.js";
}

function isIconRequest(url) {
  return url.origin === self.location.origin && url.pathname.includes("/mc-icon-");
}

function isScheduleRequest(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname === "/api/kodik" &&
    url.searchParams.get("action") === "discover" &&
    url.searchParams.get("mode") === "ongoing"
  );
}

function isPosterRequest(request, url) {
  return (
    request.destination === "image" &&
    (url.origin === self.location.origin ||
      /(?:kp\.yandex\.net|kodik\.biz|kodik\.info|kodikres\.com|shikimori\.io|shikimori\.one|shikimori\.me|shikimori\.org)$/i.test(
        url.hostname
      ))
  );
}

async function staleWhileRevalidate(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(cacheKey);
  const networkPromise = fetch(request)
    .then((response) => {
      if (canCache(response)) {
        const responseClone = response.clone();
        cache.put(cacheKey, responseClone).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;
  throw new Error("Network unavailable");
}

async function cacheFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await fetch(request);
  if (canCache(response)) {
    cache.put(cacheKey, response.clone()).catch(() => {});
  }
  return response;
}

async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (canCache(response)) {
      cache.put(cacheKey, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw new Error("Network unavailable");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await cache.addAll(CORE_APP_SHELL);
      await Promise.allSettled(
        OPTIONAL_APP_SHELL.map(async (asset) => {
          const response = await fetch(asset, { cache: "no-store" });
          if (!canCache(response)) {
            throw new Error(`Unable to cache optional asset: ${asset}`);
          }
          await cache.put(asset, response.clone());
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, API_CACHE, IMAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (canCache(response)) {
            const responseClone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", responseClone).catch(() => {}));
          }
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (isApiRequest(url)) {
    if (isScheduleRequest(url)) {
      event.respondWith(networkFirst(event.request, API_CACHE));
      return;
    }
    event.respondWith(staleWhileRevalidate(event.request, API_CACHE));
    return;
  }

  if (isMediaStreamRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (isManifestRequest(url)) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  if (isRuntimeConfigRequest(url)) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE));
    return;
  }

  if (isIconRequest(url)) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  if (isPosterRequest(event.request, url)) {
    event.respondWith(cacheFirst(event.request, IMAGE_CACHE));
    return;
  }

  if (!isShellAsset(url)) return;

  event.respondWith(staleWhileRevalidate(event.request, SHELL_CACHE));
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "animecloud-sync") return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) =>
      Promise.all(
        clients.map((client) =>
          client.postMessage({
            type: "animecloud:flush-sync"
          })
        )
      )
    )
  );
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag !== "animecloud-schedule-refresh") return;

  event.waitUntil(
    Promise.all([
      fetch("/api/kodik?action=discover&mode=ongoing&page=1&limit=24", { cache: "no-store" }).catch(() => null),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) =>
        Promise.all(
          clients.map((client) =>
            client.postMessage({
              type: "animecloud:warm-schedule"
            })
          )
        )
      )
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "animecloud:skip-waiting") {
    self.skipWaiting();
  }
});
