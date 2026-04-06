const CACHE_VERSION = "v44";
const SHELL_CACHE = `animecloud-shell-${CACHE_VERSION}`;
const API_CACHE = `animecloud-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `animecloud-images-${CACHE_VERSION}`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css?v=25",
  "/api/runtime-config.js?v=2",
  "/firebase-config.js?v=5",
  "/cloud-sync.js?v=12",
  "/app.js?v=34",
  "/auth.js?v=18",
  "/watch-features.js?v=17",
  "/manifest.webmanifest?v=11",
  "/robots.txt",
  "/sitemap.xml",
  "/mc-icon-192.png?v=4",
  "/mc-icon-512.png?v=4"
];

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
  return url.origin === self.location.origin && /^\/api\/anilibria(?:\/|$)/.test(url.pathname);
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
  return url.origin === self.location.origin && url.pathname === "/api/anilibria/anime/schedule/week";
}

function isPosterRequest(request, url) {
  return (
    request.destination === "image" &&
    (url.origin === self.location.origin ||
      /(?:anilibria\.top|libria\.fun|jsdelivr\.net)$/i.test(url.hostname))
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
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
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
      fetch("/api/anilibria/anime/schedule/week", { cache: "no-store" }).catch(() => null),
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
